-- Outlier review system for daily_logs.
--
-- Problem: a single extreme outlier (e.g. observer forgot to tap Split,
-- trip "takes" 8 hours) skews weekly aggregates severely and pollutes
-- before/after intervention analysis. Silently dropping such trips
-- loses information. We need a review queue.
--
-- Dual detection rule:
--   1. Hard ceiling: total TAT > 300 min (5 hours) → auto-flag on insert.
--      Runs in trigger, no lookup needed. Catches forgotten Splits even
--      in sparse-data weeks where IQR is unreliable.
--   2. Statistical: computed at aggregation time. Week must have >= 10
--      trips; trip flagged if total TAT > Q3 + 3*IQR of the week.
--      Expressed in get_weekly_kpis_from_daily_logs and
--      get_outliers_for_review functions.
--
-- Review status states:
--   'normal'            - default, trip is in aggregates (unless statistical outlier)
--   'flagged'           - hard-ceiling outlier, excluded from aggregates, in review queue
--   'reviewed_include'  - analyst reviewed and said "include despite being an outlier"
--   'reviewed_exclude'  - analyst reviewed and said "exclude, not representative"

-- ── 1. Add review columns to daily_logs ────────────────────────────────────

alter table public.daily_logs
  add column if not exists review_status text
    not null default 'normal'
    check (review_status in ('normal', 'flagged', 'reviewed_include', 'reviewed_exclude')),
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_daily_logs_review_status
  on public.daily_logs (assessment_id, review_status)
  where review_status <> 'normal';

comment on column public.daily_logs.review_status is
  'Outlier review state. normal = in aggregates. flagged = auto-flagged as outlier, excluded until reviewed. reviewed_include = analyst forced include despite being outlier. reviewed_exclude = analyst confirmed exclude.';

-- ── 2. Trigger: auto-flag trips where total_tat > 300 min ──────────────────

create or replace function public.flag_daily_log_outlier()
returns trigger
language plpgsql
as $$
declare
  total_minutes numeric;
begin
  -- Skip if already reviewed (analyst decision wins over auto)
  if new.review_status in ('reviewed_include', 'reviewed_exclude') then
    return new;
  end if;

  -- Compute total TAT from timestamps. Prefer plant_queue_start as
  -- anchor, fall back to departure_loaded.
  if new.arrival_plant is not null
     and coalesce(new.plant_queue_start, new.departure_loaded) is not null
  then
    total_minutes := extract(epoch from (
      new.arrival_plant::timestamptz
      - coalesce(new.plant_queue_start, new.departure_loaded)::timestamptz
    )) / 60;

    if total_minutes > 300 then
      new.review_status := 'flagged';
      new.review_note := coalesce(
        new.review_note,
        'Auto-flagged: total TAT ' || round(total_minutes)::text || ' min exceeds 5h ceiling'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_daily_logs_flag_outlier on public.daily_logs;
create trigger trg_daily_logs_flag_outlier
  before insert or update of
    plant_queue_start, departure_loaded, arrival_plant
  on public.daily_logs
  for each row
  execute function public.flag_daily_log_outlier();

comment on function public.flag_daily_log_outlier() is
  'BEFORE INSERT/UPDATE trigger that auto-flags daily_logs rows whose computed total TAT exceeds 300 minutes. Does not touch rows already manually reviewed.';

-- Back-fill existing data: retroactively flag long-TAT trips that
-- predate this migration. Skips rows that are already reviewed.
update public.daily_logs
set review_status = 'flagged',
    review_note = 'Auto-flagged on migration: total TAT exceeds 5h ceiling'
where review_status = 'normal'
  and arrival_plant is not null
  and coalesce(plant_queue_start, departure_loaded) is not null
  and extract(epoch from (
        arrival_plant::timestamptz
        - coalesce(plant_queue_start, departure_loaded)::timestamptz
      )) / 60 > 300;

-- ── 3. Update get_weekly_kpis_from_daily_logs to exclude outliers ──────────
--
-- Excludes rows with review_status in ('flagged', 'reviewed_exclude').
-- 'reviewed_include' rows count even if they were originally outliers
-- (analyst overrode). Statistical outliers (Q3 + 3*IQR per week with
-- >= 10 trips) are also excluded via the iqr_bounds CTE.

create or replace function public.get_weekly_kpis_from_daily_logs(p_assessment_id uuid)
returns table (
  week_number              int,
  trip_count               int,
  complete_trip_count      int,
  partial_trip_count       int,
  total_m3                 numeric,
  avg_load_m3              numeric,
  avg_tat_min              numeric,
  avg_plant_queue_min      numeric,
  avg_loading_min          numeric,
  avg_transit_out_min      numeric,
  avg_site_wait_min        numeric,
  avg_pouring_min          numeric,
  avg_washout_min          numeric,
  avg_transit_back_min     numeric,
  reject_count             int,
  reject_pct               numeric,
  reject_plant_side_count  int,
  reject_customer_side_count int,
  slump_tested_count       int,
  slump_pass_count         int,
  slump_pass_pct           numeric,
  unique_trucks            int,
  unique_drivers           int,
  unique_sites             int,
  days_with_trips          int,
  avg_trips_per_truck_per_day numeric,
  avg_m3_per_truck_per_day numeric,
  week_start_date          date,
  week_end_date            date,
  origin_plant_breakdown   jsonb,
  site_type_breakdown      jsonb,
  reject_cause_breakdown   jsonb,
  -- New: count of trips excluded as outliers per week, for transparency
  outliers_excluded_count  int
)
language sql
security definer
set search_path = public
as $$
  with config as (
    select started_at
    from tracking_configs
    where assessment_id = p_assessment_id
    order by started_at asc
    limit 1
  ),
  reference as (
    select coalesce(
      (select started_at::date from config),
      (select min(log_date) from daily_logs where assessment_id = p_assessment_id)
    ) as start_date
  ),
  bucketed as (
    select
      dl.*,
      greatest(1, least(13,
        floor((dl.log_date - (select start_date from reference))::numeric / 7)::int + 1
      )) as week_num,
      case
        when dl.arrival_plant is not null
         and coalesce(dl.plant_queue_start, dl.departure_loaded) is not null
        then extract(epoch from (
              dl.arrival_plant::timestamptz
              - coalesce(dl.plant_queue_start, dl.departure_loaded)::timestamptz
            )) / 60
        else null
      end as tat_min
    from daily_logs dl
    where dl.assessment_id = p_assessment_id
      and dl.log_date >= (select start_date from reference)
  ),
  -- Per-week IQR bounds (statistical outlier detection). Only computed
  -- for weeks with >= 10 trips. NULL bound means no statistical exclusion.
  iqr_bounds as (
    select
      week_num,
      case
        when count(*) >= 10 then
          percentile_cont(0.75) within group (order by tat_min)
            + 3.0 * (
                percentile_cont(0.75) within group (order by tat_min)
              - percentile_cont(0.25) within group (order by tat_min)
            )
        else null
      end as upper_bound
    from bucketed
    where tat_min is not null
    group by week_num
  ),
  -- Raw rows marked with is_outlier flag for exclusion logic
  marked as (
    select
      b.*,
      (
        b.review_status in ('flagged', 'reviewed_exclude')
        or (
          b.review_status = 'normal'
          and ib.upper_bound is not null
          and b.tat_min is not null
          and b.tat_min > ib.upper_bound
        )
      ) as is_outlier
    from bucketed b
    left join iqr_bounds ib on ib.week_num = b.week_num
  ),
  -- Rows that contribute to aggregates: NOT outliers, OR explicitly
  -- reviewed_include (analyst override).
  included as (
    select * from marked
    where not is_outlier or review_status = 'reviewed_include'
  ),
  origin_counts as (
    select week_num, jsonb_object_agg(origin_plant, cnt) as origin_plant_breakdown
    from (
      select week_num, origin_plant, count(*) as cnt
      from included
      where origin_plant is not null and origin_plant <> ''
      group by week_num, origin_plant
    ) t
    group by week_num
  ),
  site_type_counts as (
    select week_num, jsonb_object_agg(site_type, cnt) as site_type_breakdown
    from (
      select week_num, site_type, count(*) as cnt
      from included
      where site_type is not null
      group by week_num, site_type
    ) t
    group by week_num
  ),
  reject_cause_counts as (
    select week_num, jsonb_object_agg(reject_cause, cnt) as reject_cause_breakdown
    from (
      select week_num, coalesce(reject_cause, 'unspecified') as reject_cause, count(*) as cnt
      from included
      where rejected = true
      group by week_num, coalesce(reject_cause, 'unspecified')
    ) t
    group by week_num
  ),
  outlier_counts as (
    select week_num, count(*)::int as outliers_excluded_count
    from marked
    where is_outlier and review_status <> 'reviewed_include'
    group by week_num
  ),
  weekly as (
    select
      week_num,
      count(*)::int                                                       as trip_count,
      count(*) filter (where not coalesce(is_partial, false))::int        as complete_trip_count,
      count(*) filter (where coalesce(is_partial, false))::int            as partial_trip_count,
      sum(load_m3)                                                        as total_m3,
      avg(load_m3)                                                        as avg_load_m3,
      avg(tat_min)                                                        as avg_tat_min,
      avg(
        case when loading_start is not null and plant_queue_start is not null
          then extract(epoch from (loading_start::timestamptz - plant_queue_start::timestamptz)) / 60
        end
      )                                                                   as avg_plant_queue_min,
      avg(
        case when departure_loaded is not null and loading_start is not null
          then extract(epoch from (departure_loaded::timestamptz - loading_start::timestamptz)) / 60
        end
      )                                                                   as avg_loading_min,
      avg(
        case when arrival_site is not null and departure_loaded is not null
          then extract(epoch from (arrival_site::timestamptz - departure_loaded::timestamptz)) / 60
        end
      )                                                                   as avg_transit_out_min,
      avg(
        case when discharge_start is not null and arrival_site is not null
          then extract(epoch from (discharge_start::timestamptz - arrival_site::timestamptz)) / 60
        end
      )                                                                   as avg_site_wait_min,
      avg(
        case when discharge_end is not null and discharge_start is not null
          then extract(epoch from (discharge_end::timestamptz - discharge_start::timestamptz)) / 60
        end
      )                                                                   as avg_pouring_min,
      avg(
        case when departure_site is not null and discharge_end is not null
          then extract(epoch from (departure_site::timestamptz - discharge_end::timestamptz)) / 60
        end
      )                                                                   as avg_washout_min,
      avg(
        case when arrival_plant is not null and departure_site is not null
          then extract(epoch from (arrival_plant::timestamptz - departure_site::timestamptz)) / 60
        end
      )                                                                   as avg_transit_back_min,
      count(*) filter (where rejected)::int                               as reject_count,
      (count(*) filter (where rejected) * 100.0
        / nullif(count(*), 0))::numeric                                   as reject_pct,
      count(*) filter (where rejected and reject_side = 'plant_side')::int    as reject_plant_side_count,
      count(*) filter (where rejected and reject_side = 'customer_side')::int as reject_customer_side_count,
      count(*) filter (where slump_pass is not null)::int                 as slump_tested_count,
      count(*) filter (where slump_pass = true)::int                      as slump_pass_count,
      (count(*) filter (where slump_pass = true) * 100.0
        / nullif(count(*) filter (where slump_pass is not null), 0))::numeric as slump_pass_pct,
      count(distinct truck_id)::int                                       as unique_trucks,
      count(distinct driver_name)::int                                    as unique_drivers,
      count(distinct site_name)::int                                      as unique_sites,
      count(distinct log_date)::int                                       as days_with_trips,
      (count(*)::numeric
        / nullif(count(distinct truck_id) * count(distinct log_date), 0)) as avg_trips_per_truck_per_day,
      (sum(load_m3)::numeric
        / nullif(count(distinct truck_id) * count(distinct log_date), 0)) as avg_m3_per_truck_per_day,
      min(log_date)                                                       as week_start_date,
      max(log_date)                                                       as week_end_date
    from included
    group by week_num
  )
  select
    w.week_num                                                      as week_number,
    w.trip_count, w.complete_trip_count, w.partial_trip_count,
    w.total_m3, w.avg_load_m3,
    w.avg_tat_min, w.avg_plant_queue_min, w.avg_loading_min,
    w.avg_transit_out_min, w.avg_site_wait_min, w.avg_pouring_min,
    w.avg_washout_min, w.avg_transit_back_min,
    w.reject_count, w.reject_pct,
    w.reject_plant_side_count, w.reject_customer_side_count,
    w.slump_tested_count, w.slump_pass_count, w.slump_pass_pct,
    w.unique_trucks, w.unique_drivers, w.unique_sites, w.days_with_trips,
    w.avg_trips_per_truck_per_day, w.avg_m3_per_truck_per_day,
    w.week_start_date, w.week_end_date,
    coalesce(oc.origin_plant_breakdown, '{}'::jsonb)               as origin_plant_breakdown,
    coalesce(stc.site_type_breakdown, '{}'::jsonb)                 as site_type_breakdown,
    coalesce(rcc.reject_cause_breakdown, '{}'::jsonb)              as reject_cause_breakdown,
    coalesce(ocnt.outliers_excluded_count, 0)                      as outliers_excluded_count
  from weekly w
  left join origin_counts      oc   on oc.week_num   = w.week_num
  left join site_type_counts   stc  on stc.week_num  = w.week_num
  left join reject_cause_counts rcc on rcc.week_num  = w.week_num
  left join outlier_counts     ocnt on ocnt.week_num = w.week_num
  order by w.week_num;
$$;

grant execute on function public.get_weekly_kpis_from_daily_logs(uuid) to authenticated, anon;

-- ── 4. New RPC: list outliers needing review ──────────────────────────────
--
-- Returns trips that are either hard-ceiling flagged OR statistical
-- outliers (for weeks with >= 10 trips), with stage breakdown so the
-- analyst can make an informed include/exclude decision.

create or replace function public.get_outliers_for_review(p_assessment_id uuid)
returns table (
  id                      uuid,
  log_date                date,
  truck_id                text,
  driver_name             text,
  site_name               text,
  measurer_name           text,
  origin_plant            text,
  total_tat_min           numeric,
  plant_queue_min         numeric,
  loading_min             numeric,
  transit_out_min         numeric,
  site_wait_min           numeric,
  pouring_min             numeric,
  washout_min             numeric,
  transit_back_min        numeric,
  load_m3                 numeric,
  rejected                boolean,
  reject_cause            text,
  notes                   text,
  stage_notes             jsonb,
  is_partial              boolean,
  review_status           text,
  review_note             text,
  reviewed_at             timestamptz,
  flag_reason             text,
  week_number             int
)
language sql
security definer
set search_path = public
as $$
  with config as (
    select started_at
    from tracking_configs
    where assessment_id = p_assessment_id
    order by started_at asc
    limit 1
  ),
  reference as (
    select coalesce(
      (select started_at::date from config),
      (select min(log_date) from daily_logs where assessment_id = p_assessment_id)
    ) as start_date
  ),
  bucketed as (
    select
      dl.*,
      greatest(1, least(13,
        floor((dl.log_date - (select start_date from reference))::numeric / 7)::int + 1
      )) as week_num,
      case
        when dl.arrival_plant is not null
         and coalesce(dl.plant_queue_start, dl.departure_loaded) is not null
        then extract(epoch from (
              dl.arrival_plant::timestamptz
              - coalesce(dl.plant_queue_start, dl.departure_loaded)::timestamptz
            )) / 60
        else null
      end as tat_min
    from daily_logs dl
    where dl.assessment_id = p_assessment_id
  ),
  iqr_bounds as (
    select
      week_num,
      case
        when count(*) >= 10 then
          percentile_cont(0.75) within group (order by tat_min)
            + 3.0 * (
                percentile_cont(0.75) within group (order by tat_min)
              - percentile_cont(0.25) within group (order by tat_min)
            )
        else null
      end as upper_bound
    from bucketed
    where tat_min is not null
    group by week_num
  )
  select
    b.id,
    b.log_date,
    b.truck_id,
    b.driver_name,
    b.site_name,
    b.measurer_name,
    b.origin_plant,
    b.tat_min::numeric as total_tat_min,
    case when b.loading_start is not null and b.plant_queue_start is not null
      then (extract(epoch from (b.loading_start::timestamptz - b.plant_queue_start::timestamptz)) / 60)::numeric
    end as plant_queue_min,
    case when b.departure_loaded is not null and b.loading_start is not null
      then (extract(epoch from (b.departure_loaded::timestamptz - b.loading_start::timestamptz)) / 60)::numeric
    end as loading_min,
    case when b.arrival_site is not null and b.departure_loaded is not null
      then (extract(epoch from (b.arrival_site::timestamptz - b.departure_loaded::timestamptz)) / 60)::numeric
    end as transit_out_min,
    case when b.discharge_start is not null and b.arrival_site is not null
      then (extract(epoch from (b.discharge_start::timestamptz - b.arrival_site::timestamptz)) / 60)::numeric
    end as site_wait_min,
    case when b.discharge_end is not null and b.discharge_start is not null
      then (extract(epoch from (b.discharge_end::timestamptz - b.discharge_start::timestamptz)) / 60)::numeric
    end as pouring_min,
    case when b.departure_site is not null and b.discharge_end is not null
      then (extract(epoch from (b.departure_site::timestamptz - b.discharge_end::timestamptz)) / 60)::numeric
    end as washout_min,
    case when b.arrival_plant is not null and b.departure_site is not null
      then (extract(epoch from (b.arrival_plant::timestamptz - b.departure_site::timestamptz)) / 60)::numeric
    end as transit_back_min,
    b.load_m3,
    b.rejected,
    b.reject_cause,
    b.notes,
    b.stage_notes,
    b.is_partial,
    b.review_status,
    b.review_note,
    b.reviewed_at,
    case
      when b.review_status = 'flagged'
        then 'Hard ceiling (TAT ' || round(b.tat_min)::text || ' min > 300 min)'
      when b.tat_min > ib.upper_bound
        then 'Statistical outlier (TAT ' || round(b.tat_min)::text || ' min > Q3+3×IQR of ' || round(ib.upper_bound)::text || ' min for week ' || b.week_num::text || ')'
      else 'Reviewed'
    end as flag_reason,
    b.week_num as week_number
  from bucketed b
  left join iqr_bounds ib on ib.week_num = b.week_num
  where b.review_status in ('flagged', 'reviewed_include', 'reviewed_exclude')
     or (
       b.review_status = 'normal'
       and ib.upper_bound is not null
       and b.tat_min is not null
       and b.tat_min > ib.upper_bound
     )
  order by
    case b.review_status
      when 'flagged' then 1
      when 'normal' then 2
      else 3
    end,
    b.log_date desc;
$$;

grant execute on function public.get_outliers_for_review(uuid) to authenticated, anon;

comment on function public.get_outliers_for_review(uuid) is
  'Returns daily_logs rows that are auto-flagged (hard ceiling), statistical outliers (IQR-based, weeks with >=10 trips), or previously reviewed. Each row includes full stage breakdown so the analyst can make an informed include/exclude decision.';
