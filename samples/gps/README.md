# GPS sample files

Fabricated CSV exports in three common formats, used to smoke-test the
upload pipeline and to verify new parser tweaks in a repeatable way.

| File | Format type | What it simulates |
|---|---|---|
| `ctrack_geofence_log.csv` | B (Geofence log) | Ctrack-style arrival/departure pairs, 3 trucks × 2 days |
| `wialon_event_stream.csv` | A (Event stream) | Wialon-style GPS pings with speed + lat/lon, 3 trucks × 1 day |
| `teltonika_trip_summary.csv` | C (Trip summary) | Teltonika-style one-row-per-trip with duration + distance, 3 trucks × 3 days |

## Using them

**Automated smoke test** (no live server needed):

```
npm test -- gps-pipeline
```

This runs [src/lib/gps/gps-pipeline.test.ts](../../src/lib/gps/gps-pipeline.test.ts), which
feeds each CSV through detect → auto-map → normalize → compute-metrics and
asserts the output is sane (right format detected, metrics in reasonable
ranges, rows parsed).

**Manual upload test** (requires a running dev server + authenticated session):

1. Start dev server, log in to an assessment
2. Open the GPS tab
3. Drag each CSV in turn; verify the results view shows plausible numbers
4. Re-upload the same file with "Skip auto-detect, map columns manually"
   checked, confirm the column mapper appears

## If the parser fails on a real customer file

Save the file as `samples/gps/CUSTOMER_NAME_YYYY-MM-DD.csv` (with any
sensitive truck IDs scrubbed) and add a test case in `gps-pipeline.test.ts`
so the regression is captured. Do not commit files with real customer data
or PII.
