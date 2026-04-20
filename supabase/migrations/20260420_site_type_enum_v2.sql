-- ============================================================
-- Expand site_type enum from 4 values to 10 so TAT benchmarking
-- can distinguish operationally different pour scenarios common
-- in GCC ready-mix operations. The previous enum conflated wildly
-- different profiles ("infrastructure" covered bridges, roads,
-- tunnels, utilities).
--
-- New values encode both the site type and the pour method so the
-- analyst can read a trip row and know what profile to expect:
--   ground_pour       - slab on grade (direct discharge)
--   high_rise         - any pumped building (pumped, elevated)
--   bridge_deck       - elevated structure (pumped, elevated)
--   road_pavement     - flatwork (direct)
--   industrial        - warehouse/factory floor (direct)
--   tunnel            - underground (specialized)
--   precast           - delivery to a precast plant (industrial)
--   marine            - sea/jetty/breakwater (specialized)
--   piling            - deep foundation work (specialized)
--   unknown           - not classified
--
-- No data migration needed: Louis confirmed no historical trips
-- exist in daily_logs, and the former 'infrastructure' value will
-- simply not appear again. If it ever does appear it will map to
-- the nearest operational profile on next reclassification.
-- ============================================================

ALTER TABLE public.daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_site_type_check;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_site_type_check
  CHECK (site_type IN (
    'ground_pour',
    'high_rise',
    'bridge_deck',
    'road_pavement',
    'industrial',
    'tunnel',
    'precast',
    'marine',
    'piling',
    'unknown'
  ));

COMMENT ON COLUMN public.daily_logs.site_type IS
  'Site classification with pour-method hint encoded. Drives TAT benchmarking because ground_pour/road_pavement/industrial share a direct-discharge profile, high_rise/bridge_deck share a pumped+elevated profile, and tunnel/marine/piling are specialized (each with unique characteristics). Precast = delivery to a precast plant.';
