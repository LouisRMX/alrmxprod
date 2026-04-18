-- Weekly KPI aggregation from daily_logs.
--
-- Purpose: the Track tab should show weekly trends automatically once
-- trip-level data is captured in daily_logs (via Live Timer, Upload, or
-- Manual entry). Before this function existed, Weekly KPIs required
-- manual weekly entry into tracking_entries, which duplicated data.
--
-- This function aggregates all meaningful parameters from daily_logs
-- into one row per week, relative to tracking_config.started_at (or
-- first log date if no tracking_config exists). Covers 31 aggregate
-- values including stage-by-stage TAT breakdown, reject causes, and
-- throughput metrics.
--
-- The client merges: manual tracking_entries override this output
-- when present, so existing workflows keep working.

create or replace function public.get_weekly_kpis_from_daily_logs(p_assessment_id uuid)
returns table (
  week_number              int,

  -- Volume
  trip_count               int,
  complete_trip_count      int,
  partial_trip_count       int,
  total_m3                 numeric,
  avg_load_m3              numeric,

  -- Turnaround and stage breakdown (all in minutes)
  avg_tat_min              numeric,
  avg_plant_queue_min      numeric,
  avg_loading_min          numeric,
  avg_transit_out_min      numeric,
  avg_site_wait_min        numeric,
  avg_pouring_min          numeric,
  avg_washout_min          numeric,
  avg_transit_back_min     numeric,

  -- Quality
  reject_count             int,
  reject_pct               numeric,
  reject_plant_side_count  int,
  reject_customer_side_count int,
  slump_tested_count       int,
  slump_pass_count         int,
  slump_pass_pct           numeric,

  -- Throughput
  unique_trucks            int,
  unique_drivers           int,
  unique_sites             int,
  days_with_trips          int,
  avg_trips_per_truck_per_day numeric,
  avg_m3_per_truck_per_day numeric,

  -- Window
  week_start_date          date,
  week_end_date            date,

  -- Breakdowns as JSON (key = category, value = trip count)
  origin_plant_breakdown   jsonb,
  site_type_breakdown      jsonb,
  reject_cause_breakdown   jsonb
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
      )) as week_num
    from daily_logs dl
    where dl.assessment_id = p_assessment_id
      and dl.log_date >= (select start_date from reference)
  ),
  origin_counts as (
    select week_num, jsonb_object_agg(origin_plant, cnt) as origin_plant_breakdown
    from (
      select week_num, origin_plant, count(*) as cnt
      from bucketed
      where origin_plant is not null and origin_plant <> ''
      group by week_num, origin_plant
    ) t
    group by week_num
  ),
  site_type_counts as (
    select week_num, jsonb_object_agg(site_type, cnt) as site_type_breakdown
    from (
      select week_num, site_type, count(*) as cnt
      from bucketed
      where site_type is not null
      group by week_num, site_type
    ) t
    group by week_num
  ),
  reject_cause_counts as (
    select week_num, jsonb_object_agg(reject_cause, cnt) as reject_cause_breakdown
    from (
      select week_num, coalesce(reject_cause, 'unspecified') as reject_cause, count(*) as cnt
      from bucketed
      where rejected = true
      group by week_num, coalesce(reject_cause, 'unspecified')
    ) t
    group by week_num
  ),
  weekly as (
    select
      week_num,

      -- Volume
      count(*)::int                                                       as trip_count,
      count(*) filter (where not coalesce(is_partial, false))::int        as complete_trip_count,
      count(*) filter (where coalesce(is_partial, false))::int            as partial_trip_count,
      sum(load_m3)                                                        as total_m3,
      avg(load_m3)                                                        as avg_load_m3,

      -- Turnaround + stages (minutes)
      avg(
        case when arrival_plant is not null and coalesce(plant_queue_start, departure_loaded) is not null
          then extract(epoch from (arrival_plant::timestamptz - coalesce(plant_queue_start, departure_loaded)::timestamptz)) / 60
        end
      )                                                                   as avg_tat_min,
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

      -- Quality
      count(*) filter (where rejected)::int                               as reject_count,
      (count(*) filter (where rejected) * 100.0
        / nullif(count(*), 0))::numeric                                   as reject_pct,
      count(*) filter (where rejected and reject_side = 'plant_side')::int    as reject_plant_side_count,
      count(*) filter (where rejected and reject_side = 'customer_side')::int as reject_customer_side_count,
      count(*) filter (where slump_pass is not null)::int                 as slump_tested_count,
      count(*) filter (where slump_pass = true)::int                      as slump_pass_count,
      (count(*) filter (where slump_pass = true) * 100.0
        / nullif(count(*) filter (where slump_pass is not null), 0))::numeric as slump_pass_pct,

      -- Throughput
      count(distinct truck_id)::int                                       as unique_trucks,
      count(distinct driver_name)::int                                    as unique_drivers,
      count(distinct site_name)::int                                      as unique_sites,
      count(distinct log_date)::int                                       as days_with_trips,

      -- Derived throughput (per truck per working day)
      (count(*)::numeric
        / nullif(count(distinct truck_id) * count(distinct log_date), 0)) as avg_trips_per_truck_per_day,
      (sum(load_m3)::numeric
        / nullif(count(distinct truck_id) * count(distinct log_date), 0)) as avg_m3_per_truck_per_day,

      -- Window
      min(log_date)                                                       as week_start_date,
      max(log_date)                                                       as week_end_date

    from bucketed
    group by week_num
  )
  select
    w.week_num                                                      as week_number,
    w.trip_count,
    w.complete_trip_count,
    w.partial_trip_count,
    w.total_m3,
    w.avg_load_m3,
    w.avg_tat_min,
    w.avg_plant_queue_min,
    w.avg_loading_min,
    w.avg_transit_out_min,
    w.avg_site_wait_min,
    w.avg_pouring_min,
    w.avg_washout_min,
    w.avg_transit_back_min,
    w.reject_count,
    w.reject_pct,
    w.reject_plant_side_count,
    w.reject_customer_side_count,
    w.slump_tested_count,
    w.slump_pass_count,
    w.slump_pass_pct,
    w.unique_trucks,
    w.unique_drivers,
    w.unique_sites,
    w.days_with_trips,
    w.avg_trips_per_truck_per_day,
    w.avg_m3_per_truck_per_day,
    w.week_start_date,
    w.week_end_date,
    coalesce(oc.origin_plant_breakdown, '{}'::jsonb)               as origin_plant_breakdown,
    coalesce(stc.site_type_breakdown, '{}'::jsonb)                 as site_type_breakdown,
    coalesce(rcc.reject_cause_breakdown, '{}'::jsonb)              as reject_cause_breakdown
  from weekly w
  left join origin_counts      oc  on oc.week_num  = w.week_num
  left join site_type_counts   stc on stc.week_num = w.week_num
  left join reject_cause_counts rcc on rcc.week_num = w.week_num
  order by w.week_num;
$$;

-- Grant execute to authenticated users. RLS on daily_logs still applies
-- via the SECURITY DEFINER function owner's permissions; we rely on
-- client-side access control (admin/manager can see their customer's
-- assessments, operators can see their own).
grant execute on function public.get_weekly_kpis_from_daily_logs(uuid) to authenticated, anon;

comment on function public.get_weekly_kpis_from_daily_logs(uuid) is
  'Aggregate daily_logs rows into weekly KPI buckets (week 1-13 relative to tracking_configs.started_at, or first log_date if no tracking_config exists). Returns 31 KPI values per week including stage-by-stage TAT, reject breakdown, and throughput metrics. Used by the Track dashboard to derive weekly trends from trip-level data.';
