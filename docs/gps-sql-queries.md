# GPS analysis SQL pack

Copy-paste queries for Supabase SQL editor after a GPS upload. Replace
`'YOUR_ASSESSMENT_ID'` with the actual assessment UUID (visible in the URL
when viewing the assessment, or in the `assessments` table).

The platform UI shows aggregates. These queries get you per-truck,
per-site, per-hour breakdowns without waiting for UI features.

All queries target `normalized_gps_events` which is populated by the GPS
upload analyzer. Status column names are as defined in
[supabase/migrations/20260401_gps_upload_module.sql](../supabase/migrations/20260401_gps_upload_module.sql).

---

## 1. Data quality first — always run this before trusting the rest

```sql
-- How much of the upload actually parsed with usable timestamps?
-- If parse rate is <85% or truck_id null rate is >5%, the mapping is
-- probably wrong and downstream queries will mislead.
select
  count(*) as total_rows,
  count(truck_id) as with_truck,
  count(event_timestamp) as with_event_ts,
  count(stop_start_time) as with_stop_start,
  count(stop_end_time) as with_stop_end,
  round(count(truck_id) * 100.0 / nullif(count(*), 0), 1) as pct_truck,
  round(count(stop_start_time) * 100.0 / nullif(count(*), 0), 1) as pct_stop_start,
  count(distinct truck_id) as unique_trucks,
  count(distinct location_name) as unique_locations,
  min(event_timestamp)::date as date_from,
  max(event_timestamp)::date as date_to
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID';
```

---

## 2. Per-truck turnaround ranking

Which trucks are consistently slow? Uses paired stop_start_time →
stop_end_time events, computes dwell time, and aggregates by truck.
Only valid for Type B/C data (per-stop rows). For Type A event-stream,
see query 6.

```sql
-- Per-truck avg / median / p90 stop duration. Outliers at the top
-- point to driver, truck maintenance, or route-mix issues.
select
  truck_id,
  count(*) as stops,
  count(distinct date_trunc('day', stop_start_time)) as active_days,
  round(avg(extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as avg_stop_min,
  round(percentile_cont(0.5) within group (order by extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as median_stop_min,
  round(percentile_cont(0.9) within group (order by extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as p90_stop_min
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID'
  and stop_start_time is not null
  and stop_end_time is not null
  and inferred_location_type = 'site'
group by truck_id
order by avg_stop_min desc;
```

---

## 3. Per-site waiting time top 20

Which customer sites bleed the most time? If the same 3-5 sites dominate,
that's a commercial conversation, not an operational one.

```sql
select
  location_name,
  count(*) as visits,
  count(distinct truck_id) as trucks_visited,
  round(avg(extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as avg_wait_min,
  round(percentile_cont(0.9) within group (order by extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as p90_wait_min,
  round(max(extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as max_wait_min
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID'
  and stop_start_time is not null
  and stop_end_time is not null
  and inferred_location_type = 'site'
  and location_name is not null
group by location_name
having count(*) >= 3
order by avg_wait_min desc
limit 20;
```

---

## 4. Hour-of-day pattern

TAT usually spikes at specific hours. If site wait is concentrated 10-12h
it's a pour-window issue, not a dispatch issue. If it's 14-16h it's
usually a routing + traffic issue.

```sql
select
  extract(hour from stop_start_time)::int as hour_of_day,
  count(*) as stops,
  round(avg(extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as avg_min
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID'
  and stop_start_time is not null
  and stop_end_time is not null
  and inferred_location_type = 'site'
group by 1
order by 1;
```

---

## 5. Day-of-week pattern

Monday 60 min avg, Thursday 110 min avg means end-of-week rush. Relevant
for whether the bottleneck is "always on" or "cyclical".

```sql
select
  to_char(stop_start_time, 'Day') as day_name,
  extract(isodow from stop_start_time)::int as dow,
  count(*) as stops,
  round(avg(extract(epoch from (stop_end_time - stop_start_time)) / 60)::numeric, 1) as avg_min
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID'
  and stop_start_time is not null
  and stop_end_time is not null
  and inferred_location_type = 'site'
group by 1, 2
order by 2;
```

---

## 6. Trip reconstruction (Type A event-stream fallback)

When there's no stop_start/stop_end but there is event_timestamp +
inferred_location_type, use window functions to compute per-truck
plant → site → plant sequences. Slower but works on raw pings.

```sql
with seq as (
  select
    truck_id,
    event_timestamp,
    inferred_location_type,
    lag(inferred_location_type) over (partition by truck_id order by event_timestamp) as prev_loc,
    lag(event_timestamp) over (partition by truck_id order by event_timestamp) as prev_ts
  from normalized_gps_events
  where assessment_id = 'YOUR_ASSESSMENT_ID'
    and event_timestamp is not null
),
transitions as (
  select
    truck_id,
    event_timestamp as arrival_ts,
    prev_ts as departure_ts,
    prev_loc as from_loc,
    inferred_location_type as to_loc,
    round(extract(epoch from (event_timestamp - prev_ts)) / 60::numeric, 1) as transit_min
  from seq
  where prev_loc is distinct from inferred_location_type
    and prev_loc in ('plant', 'site')
    and inferred_location_type in ('plant', 'site')
)
select
  from_loc || ' → ' || to_loc as leg,
  count(*) as legs,
  round(avg(transit_min)::numeric, 1) as avg_min,
  round(percentile_cont(0.5) within group (order by transit_min)::numeric, 1) as median_min,
  round(percentile_cont(0.9) within group (order by transit_min)::numeric, 1) as p90_min
from transitions
where transit_min between 5 and 240
group by 1
order by 1;
```

---

## 7. Slowest 20 trips — outlier drilldown

Eyeball the worst cases. Often reveals a single truck breakdown day,
a site that was genuinely closed, or a labelling bug in the source data.

```sql
select
  truck_id,
  location_name,
  stop_start_time,
  stop_end_time,
  round(extract(epoch from (stop_end_time - stop_start_time)) / 60::numeric, 1) as duration_min
from normalized_gps_events
where assessment_id = 'YOUR_ASSESSMENT_ID'
  and stop_start_time is not null
  and stop_end_time is not null
  and inferred_location_type = 'site'
order by stop_end_time - stop_start_time desc
limit 20;
```

---

## 8. Truck utilisation — trips per active day per truck

Plants with "no trucks" problems often have trucks doing 3 trips/day
while the best ones hit 6. This is direct evidence for the H2
(shared-fleet underutilisation) hypothesis from the Field Guide.

```sql
with truck_days as (
  select
    truck_id,
    date_trunc('day', coalesce(stop_start_time, event_timestamp)) as day,
    count(*) filter (where inferred_location_type = 'site') as site_stops
  from normalized_gps_events
  where assessment_id = 'YOUR_ASSESSMENT_ID'
    and truck_id is not null
  group by 1, 2
  having count(*) filter (where inferred_location_type = 'site') > 0
)
select
  truck_id,
  count(*) as active_days,
  sum(site_stops) as total_site_stops,
  round(avg(site_stops)::numeric, 2) as avg_stops_per_active_day,
  max(site_stops) as best_day
from truck_days
group by truck_id
order by avg_stops_per_active_day desc;
```

---

## 9. Cross-plant return loads

A return load = truck arriving at a plant from a site in <15 min of
leaving the previous site. Indicator for whether the fleet is running
point-to-point or hub-and-spoke.

```sql
with events_ordered as (
  select
    truck_id,
    event_timestamp,
    stop_start_time,
    stop_end_time,
    inferred_location_type,
    lag(stop_end_time) over (partition by truck_id order by coalesce(stop_start_time, event_timestamp)) as prev_site_end
  from normalized_gps_events
  where assessment_id = 'YOUR_ASSESSMENT_ID'
)
select
  count(*) filter (where inferred_location_type = 'plant'
                   and stop_start_time is not null
                   and prev_site_end is not null
                   and extract(epoch from (stop_start_time - prev_site_end)) / 60 < 15) as probable_return_loads,
  count(*) filter (where inferred_location_type = 'plant' and stop_start_time is not null) as plant_arrivals,
  round(
    100.0 * count(*) filter (where inferred_location_type = 'plant'
                             and stop_start_time is not null
                             and prev_site_end is not null
                             and extract(epoch from (stop_start_time - prev_site_end)) / 60 < 15)
    / nullif(count(*) filter (where inferred_location_type = 'plant' and stop_start_time is not null), 0)
  , 1) as return_load_pct
from events_ordered;
```

---

## Notes

- Replace `'YOUR_ASSESSMENT_ID'` in every query before running. Find the
  UUID in the `assessments` table or in the URL when viewing the
  assessment.
- Queries assume `inferred_location_type` is populated by the normalizer.
  If too many rows are `'unknown'`, extend `SITE_KEYWORDS` / `PLANT_KEYWORDS`
  in [src/lib/gps/normalizer.ts](../src/lib/gps/normalizer.ts) to match the
  customer's naming convention, then re-upload.
- For presentations: export query results to CSV (Supabase editor has an
  export button) and pivot in Excel / Numbers. Don't show raw SQL output
  to the customer.
