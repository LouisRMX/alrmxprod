#!/usr/bin/env node
/**
 * One-off: add site_type_applicability + tat_component_target to each
 * intervention in supabase/seeds/intervention_library.json.
 *
 * Values are informed by the intervention's nature:
 * - Most dispatch/fleet/weighbridge items are 'any' + relevant TAT component
 * - site_ops items targeting specific site complexity (slot booking) list
 *   the multi-stakeholder site_types (high_rise, bridge_deck, tunnel, precast)
 * - Quality + inventory + capacity items that don't reduce TAT get 'none'
 *
 * Run once to tag, then delete or keep for re-tagging runs. Safe idempotent:
 * won't overwrite tags already set.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve(process.cwd(), 'supabase/seeds/intervention_library.json')
const catalog = JSON.parse(readFileSync(path, 'utf8'))

/** Mapping: slug → [site_type_applicability, tat_component_target].
 *  Keep this table in one place so changes are auditable. */
const TAGS = {
  // ── Dispatch ──
  dispatcher_app_tier1_cloud:        [['any'], 'multi'],
  dispatcher_app_tier0_lightweight:  [['any'], 'multi'],
  dispatch_playbook_roles:           [['any'], 'plant_dwell'],
  multi_plant_load_balancer:         [['any'], 'transit_out'],
  order_intake_standardisation:      [['any'], 'site_wait'],
  partial_load_elimination_protocol: [['any'], 'none'],
  data_kpi_dashboard_exec:           [['any'], 'none'],

  // ── Weighbridge ──
  weighbridge_kiosk_self_check:      [['any'], 'plant_dwell'],
  rfid_gate_access:                  [['any'], 'plant_dwell'],
  queue_management_screen:           [['any'], 'plant_dwell'],

  // ── Batching ──
  batch_cycle_time_audit:            [['any'], 'loading'],
  recipe_rationalisation:            [['any'], 'loading'],
  moisture_probe_automation:         [['any'], 'loading'],
  silo_inventory_sensors:            [['any'], 'none'],
  night_shift_expansion:             [['any'], 'none'],

  // ── Fleet ──
  telematics_gps_basic:              [['any'], 'multi'],
  telematics_concrete_sensors:       [['any'], 'site_wait'],
  subcontractor_haulier_integration: [['any'], 'multi'],

  // ── Maintenance ──
  preventive_maintenance_program:    [['any'], 'none'],
  predictive_maintenance_analytics:  [['any'], 'none'],
  spare_parts_kanban:                [['any'], 'none'],

  // ── Driver ──
  driver_incentive_redesign:         [['any'], 'multi'],
  driver_training_concrete_handling: [['any'], 'multi'],
  driver_app_etas_forms:             [['any'], 'multi'],

  // ── QC ──
  slump_automation_qc:               [['any'], 'loading'],
  concrete_temperature_hot_weather:  [['any'], 'none'],
  admixture_optimisation:            [['any'], 'none'],
  reject_root_cause_system:          [['any'], 'none'],

  // ── Site ops ── (note: these are MOST beneficial for complex sites)
  customer_slot_booking:             [['high_rise', 'bridge_deck', 'tunnel', 'precast', 'marine'], 'site_wait'],
  pre_pour_site_readiness_call:      [['any'], 'site_wait'],

  // ── Lean ──
  value_stream_mapping:              [['any'], 'multi'],
  gemba_walk_protocol:               [['any'], 'multi'],
  oee_tracking_mixers:               [['any'], 'loading'],
  takt_time_sync_mixer_truck:        [['any'], 'loading'],
  a3_problem_solving:                [['any'], 'multi'],
  kaizen_event_focused:              [['any'], 'multi'],
  andon_signal_system:               [['any'], 'site_wait'],
  standard_work_dispatcher:          [['any'], 'plant_dwell'],
  smed_mixer_changeover:             [['any'], 'loading'],
  five_s_yard_weighbridge:           [['any'], 'plant_dwell'],
  poka_yoke_batching:                [['any'], 'loading'],
  heijunka_demand_leveling:          [['any'], 'plant_dwell'],
  jidoka_quality_stops:              [['any'], 'loading'],
  kanban_materials_pull:             [['any'], 'none'],
  strategic_supplier_partnerships:   [['any'], 'none'],
}

let updated = 0
let missing = []
for (const item of catalog) {
  const tag = TAGS[item.slug]
  if (!tag) {
    missing.push(item.slug)
    continue
  }
  const [applicability, component] = tag
  item.site_type_applicability = applicability
  item.tat_component_target = component
  updated += 1
}

writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
console.log(`Updated ${updated} interventions with site_type + tat_component tags.`)
if (missing.length > 0) {
  console.warn(`WARN: ${missing.length} interventions without tags in TAGS map:`)
  missing.forEach(s => console.warn(`  - ${s}`))
}
