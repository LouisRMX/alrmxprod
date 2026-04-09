-- Add industry-standard truck productivity KPIs to plant_benchmarks
ALTER TABLE plant_benchmarks ADD COLUMN IF NOT EXISTS truck_util_annual numeric(10,0);
ALTER TABLE plant_benchmarks ADD COLUMN IF NOT EXISTS m3_per_driver_hour numeric(5,2);
ALTER TABLE plant_benchmarks ADD COLUMN IF NOT EXISTS avg_load_m3 numeric(5,2);
