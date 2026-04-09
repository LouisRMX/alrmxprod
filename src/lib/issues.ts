/**
 * alRMX Findings / Issues Generator
 * Extracted from assessment-tool.html buildIssues(), this file is now authoritative.
 */

import type { CalcResult, Answers } from './calculations'

/** Physical TAT component this issue relates to */
export type TATComponent = 'plant-side' | 'transit' | 'site' | 'washout' | null

/** How strongly the evidence supports the mechanism */
export type EvidenceStrength = 'observed' | 'likely' | 'hypothesis'

/** Mechanism-based diagnosis for an issue */
export interface Diagnosis {
  /** What we directly know from data/assessment */
  observed: string
  /** Specific operational behavior + resulting consequence (must be recognizable to a plant manager) */
  mechanism: string
  /** Directly implementable action, no interpretation needed */
  action: string
  /** What would confirm or disprove the mechanism on-site */
  validation: string
  /** How strongly the evidence supports this mechanism */
  strength: EvidenceStrength
  /** Which physical TAT component this affects (null if not TAT-related) */
  tatComponent: TATComponent
  /** Directional impact on TAT gap, e.g. "likely 8-12 min of excess" (not precise attribution) */
  tatImpactEstimate?: string
  /** Relative importance for prioritization */
  impact: 'high' | 'medium' | 'low'
  /** Other drivers that may contribute (capacity, customer readiness, etc.) */
  competingDrivers?: string[]
  /** What this diagnosis does NOT account for (explicit model limits) */
  modelLimits?: string
}

export interface Issue {
  sev: 'red' | 'amber'
  pin: boolean
  t: string
  action: string
  rec: string
  loss: number
  formula?: string
  goal?: string
  /** 'bottleneck' = overlapping constraint (only largest counts in Cost of Inaction).
   *  'independent' = separate loss that stacks additively. */
  category: 'bottleneck' | 'independent'
  /** Operational dimension this issue belongs to, used for financial bottleneck calculation. */
  dimension?: 'Production' | 'Dispatch' | 'Fleet' | 'Quality' | 'Other'
  /** Mechanism-based diagnosis (new structured format, optional for backward compat) */
  diagnosis?: Diagnosis
}

/**
 * Returns the dimension with the highest total financial loss across all issues.
 * Used for display purposes (KPI pyramid tag, AI prompts), does not affect
 * the internal bottleneck/independent category logic.
 */
export function getFinancialBottleneck(issues: Issue[]): string | null {
  const byDim: Record<string, number> = {}
  for (const issue of issues) {
    if (issue.dimension && issue.loss > 0)
      byDim[issue.dimension] = (byDim[issue.dimension] || 0) + issue.loss
  }
  const entries = Object.entries(byDim).filter(([, v]) => v > 0)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

const GCC_COUNTRIES = ['Saudi Arabia', 'Bahrain', 'UAE', 'Kuwait', 'Qatar']

export function buildIssues(r: CalcResult, a: Answers, meta?: { country?: string }): Issue[] {
  const issues: Issue[] = []
  const bn = r.bottleneck
  const country = meta?.country || ''

  // ── Turnaround & Dispatch (primary bottleneck) ─────────────────────────

  // When the plant is demand-constrained (demandSufficient === false), improving turnaround
  // won't fill additional delivery slots, the saving is operational cost only (fuel + variable
  // overhead), not contribution margin recovery. Use the cost-only figure in that case.
  const taLossBase = r.demandSufficient === false
    ? r.turnaroundLeakMonthlyCostOnly
    : r.turnaroundLeakMonthly
  const taDemandNote = r.demandSufficient === false
    ? ' (demand-constrained, operational cost saving only)'
    : ''

  if (r.ta > r.TARGET_TA && (bn === 'Fleet')) {
    // When breakdown questions identify site wait as the cause, defer the dollar value to the
    // site-wait finding below, prevents visual double-count in the findings list.
    const taLossDeferred = r.taBreakdownEntered && r.siteWaitExcess > 0
    issues.push({
      sev: 'red', pin: true, category: 'bottleneck', dimension: 'Fleet',
      t: `Truck turnaround ${r.ta} min, ${Math.round((r.ta - r.TARGET_TA) / r.TARGET_TA * 100)}% above ${r.TARGET_TA}-min target${taDemandNote}`,
      action: 'Require site readiness confirmation before trucks depart',
      rec: taLossDeferred
        ? `Site waiting time (${r.taSiteWaitMin} min) is the identified primary cause, see finding below for dollar impact.`
        : r.demandSufficient === false
          ? `Demand is the current growth constraint, operational savings from closing this gap are ${fmt(taLossBase)}/month (fuel and variable costs). Prioritise sales pipeline before investing in turnaround improvements.`
          : `Trucks should only depart when the site confirms the pump crew is ready. Closing this gap recovers ${fmt(taLossBase)}/month.`,
      loss: taLossDeferred ? 0 : taLossBase,
      formula: taLossDeferred ? undefined : `(${r.excessMin} excess min ÷ ${r.ta} actual min) × ${r.realisticMaxDel} target del × ${r.mixCap} m³ × $${Math.round(r.contribSafe)} margin × ${Math.round(r.opD / 12)} days/month`,
      diagnosis: {
        observed: `Turnaround averages ${r.ta} min vs ${r.TARGET_TA}-min operational target for ${r.radius > 0 ? r.radius + ' km' : 'your'} delivery radius. ${r.excessMin} min excess per cycle across ${r.effectiveUnits} active trucks.`,
        mechanism: r.taBreakdownEntered && r.siteWaitExcess > 0
          ? `Site waiting time is ${r.taSiteWaitMin} min (${r.siteWaitExcess} min above the 35-min benchmark). Based on reported inputs, trucks likely arrive before pump crews are staged and formwork is ready. This pattern is typically most severe during peak ordering periods and large pours where multiple trucks converge on unprepared sites.`
          : r.taBreakdownEntered && r.washoutExcess > 0
            ? `Washout takes ${r.taWashoutMin} min per truck (benchmark 12 min), adding ${r.washoutExcess} min of avoidable idle time per cycle. Combined with smaller delays at plant and site, total cycle time compounds above target.`
            : `Without detailed breakdown data, the ${r.excessMin}-min excess is likely concentrated in site waiting and plant queue, the two largest controllable components in ready-mix turnaround. The exact split depends on your site types, traffic patterns, and batching throughput.`,
        action: taLossDeferred
          ? 'Address site waiting time as the priority lever: introduce structured ETA communication to sites 30 min before truck arrival.'
          : 'Step 1: Introduce structured ETA communication to sites (initially via WhatsApp, 30 min before arrival). Step 2: Enforce demurrage charge for site waits exceeding 40 min where commercially viable. Step 3: Track actual site wait per delivery for 2 weeks to measure improvement.',
        validation: 'Time 10 consecutive deliveries end-to-end. Record: gate departure time, site arrival, pour start, pour end, departure from site, return to plant. This confirms where the excess actually sits. If site wait is within benchmark and trucks still cycle slowly, the driver is likely in transit or plant queue, not site.',
        strength: r.taBreakdownEntered ? 'observed' : 'likely',
        tatComponent: null,
        tatImpactEstimate: `Full ${r.excessMin}-min TAT gap. The largest share is typically located in site waiting, with a secondary share in plant-side queue. End-to-end timing of 10 deliveries will confirm the actual split.`,
        impact: 'high',
        competingDrivers: ['site readiness and project type', 'plant queue and batching throughput', 'traffic patterns and delivery radius', 'washout process'],
        modelLimits: 'TAT target is based on delivery radius only. Does not account for: traffic congestion patterns, site access restrictions (security, high-rise), project type (ground pour vs. pump to height), or driver behavior.',
      },
    })
  }

  if (r.scores.dispatch !== null && r.scores.dispatch < 65) {
    const loss = taLossBase + Math.round(r.capLeakMonthly * 0.35)

    const dSubScores = [
      { label: 'Order to dispatch', val: { 'Under 15 minutes, fast response': 100, '15 to 25 minutes, acceptable': 70, '25 to 40 minutes, slow': 40, 'Over 40 minutes, critical bottleneck': 10 }[a.order_to_dispatch as string], weight: '40%' },
      { label: 'Route clustering', val: { 'Always, formal zone system in place': 100, 'Usually, informal grouping most of the time': 75, 'Sometimes, depends on the dispatcher': 45, 'Rarely or never': 15 }[a.route_clustering as string], weight: '25%' },
      { label: 'Plant idle time', val: { 'Never, a truck is always available': 100, 'Occasionally, a few times per week': 70, 'Regularly, most busy periods': 40, 'Every day, always waiting for trucks': 10 }[a.plant_idle as string], weight: '20%' },
      { label: 'Dispatch tool', val: { 'Dedicated dispatch software with real-time tracking': 100, 'Spreadsheet combined with WhatsApp': 65, 'WhatsApp messages only, no spreadsheet': 35, 'Phone calls and a whiteboard or paper list': 10 }[a.dispatch_tool as string], weight: '15%' },
    ].filter(x => x.val !== undefined) as { label: string; val: number; weight: string }[]

    const weakest = dSubScores.length ? dSubScores.slice().sort((a, b) => a.val - b.val)[0] : null
    const breakdown = dSubScores.map(s => `${s.label}: ${s.val}/100 (${s.weight})`).join(' · ')
    const taSuffix = r.ta > r.TARGET_TA ? ' Turnaround excess of ' + r.excessMin + ' min is included in the dollar estimate.' : ''
    const dispRec = weakest
      ? `Weakest factor: ${weakest.label} (${weakest.val}/100), start here. Full breakdown: ${breakdown}${taSuffix}`
      : `Review dispatch process across all four factors.${taSuffix}`

    issues.push({
      sev: 'red', pin: bn === 'Dispatch', category: 'bottleneck', dimension: 'Dispatch',
      t: `Dispatch coordination is the primary constraint${r.dispatchMin ? ` (${r.dispatchMin} min order-to-truck)` : ''}`,
      action: 'Measure order-to-dispatch time daily, target under 15 min',
      rec: dispRec,
      loss,
      formula: `Turnaround loss (${fmt(taLossBase)}${r.demandSufficient === false ? ' cost-only' : ''}) + 35% of capacity gap (${fmt(Math.round(r.capLeakMonthly * 0.35))})`,
      diagnosis: {
        observed: `Dispatch runs on ${(a.dispatch_tool as string || 'unknown tools').split(',')[0].toLowerCase()}. ${a.route_clustering === 'Rarely or never' ? 'No geographic zone routing in place.' : a.route_clustering === 'Sometimes, depends on the dispatcher' ? 'Zone routing is informal and inconsistent.' : 'Zone routing is in place.'} ${a.plant_idle === 'Every day, always waiting for trucks' || a.plant_idle === 'Regularly, most busy periods' ? 'Batching plant sits idle daily waiting for trucks to return.' : ''} ${r.dispatchMin ? `Order-to-truck time: ~${r.dispatchMin} min.` : ''}`.trim(),
        mechanism: `Based on the reported dispatch setup, truck departures are likely not time-spaced, creating queue buildup at the batching plant during peak ordering periods. ${a.route_clustering === 'Rarely or never' ? 'Without zone routing, trucks serving the same area depart at different times and cross paths, adding avoidable transit time.' : ''} ${a.plant_idle === 'Every day, always waiting for trucks' || a.plant_idle === 'Regularly, most busy periods' ? 'The reported daily plant idle time suggests trucks return in waves rather than at staggered intervals.' : ''} Sites likely receive no advance notice of arrival, reducing site readiness at truck arrival.`,
        action: weakest
          ? `Step 1: ${weakest.label === 'Order to dispatch' ? 'Introduce structured time-slotted dispatch: maximum 2 trucks released within any 15-min window' : weakest.label === 'Route clustering' ? 'Implement geographic zone routing: assign fixed truck-zone pairs during peak ordering periods' : weakest.label === 'Plant idle time' ? 'Introduce return-time scheduling: assign expected return windows per truck and pre-stage batching accordingly' : 'Establish a shared dispatch board (digital or physical) visible to all drivers with real-time truck status'}. Step 2: Introduce structured ETA communication to sites 30 min before each arrival.`
          : 'Step 1: Introduce time-slotted dispatch (max 2 trucks per 15-min window). Step 2: Implement zone routing for peak periods. Step 3: Structured ETA communication to sites 30 min before arrival.',
        validation: 'Plot truck departure times on a timeline for 3 consecutive days. Count how many trucks depart within the same 15-min window. Record how many sites had pump crew ready on truck arrival. If trucks depart evenly spaced and sites are ready, dispatch coordination is not the primary issue and the excess is more likely in transit or site access.',
        strength: dSubScores.length >= 3 ? 'observed' : 'likely',
        tatComponent: 'plant-side',
        tatImpactEstimate: r.excessMin > 0 ? `Dispatch coordination influences both plant-side queue and site waiting components of the TAT gap. The combined contribution is likely a significant share of the ${r.excessMin}-min excess. Departure timing data will confirm.` : undefined,
        impact: 'high',
        competingDrivers: ['batching throughput (single vs. multi-line plant)', 'fleet size relative to order volume', 'customer order patterns', 'dispatcher experience and informal coordination'],
        modelLimits: 'Dispatch quality is assessed from reported tools and practices, not from observed coordination. An experienced dispatcher may achieve good results with simple tools. Validation step confirms actual performance.',
      },
    })

    if (r.ta > r.TARGET_TA && bn !== 'Fleet') {
      issues.push({
        sev: 'amber', pin: false, category: 'bottleneck', dimension: 'Fleet',
        t: `Truck turnaround ${r.ta} min, ${Math.round((r.ta - r.TARGET_TA) / r.TARGET_TA * 100)}% above ${r.TARGET_TA}-min target (included in dispatch estimate)`,
        action: 'Require site readiness confirmation before trucks depart',
        rec: 'Trucks should only depart when the site confirms readiness. Fastest lever inside the dispatch bottleneck.',
        loss: 0,
      })
    }
  } else if (r.ta > r.TARGET_TA) {
    const taLossDeferred = r.taBreakdownEntered && r.siteWaitExcess > 0
    issues.push({
      sev: 'red', pin: bn === 'Fleet', category: 'bottleneck', dimension: 'Fleet',
      t: `Truck turnaround ${r.ta} min, ${Math.round((r.ta - r.TARGET_TA) / r.TARGET_TA * 100)}% above ${r.TARGET_TA}-min target${taDemandNote}`,
      action: 'Require site readiness confirmation before trucks depart',
      rec: taLossDeferred
        ? `Site waiting time (${r.taSiteWaitMin} min) is the identified primary cause, see finding below for dollar impact.`
        : r.demandSufficient === false
          ? `Demand is the current growth constraint, operational savings from closing this gap are ${fmt(taLossBase)}/month (fuel and variable costs). Prioritise sales pipeline before investing in turnaround improvements.`
          : `Trucks should only depart when the site confirms the pump crew is ready. Closing this gap recovers ${fmt(taLossBase)}/month.`,
      loss: taLossDeferred ? 0 : taLossBase,
      formula: taLossDeferred ? undefined : `(${r.excessMin} excess min ÷ ${r.ta} actual min) × ${r.realisticMaxDel} target del × ${r.mixCap} m³ × $${Math.round(r.contribSafe)} margin × ${Math.round(r.opD / 12)} days/month`,
    })
  }

  // ── Production utilisation ─────────────────────────────────────────────

  // Only show capLeak as a separate loss when turnaround is within benchmark.
  // If ta > TARGET_TA, turnaroundLeakMonthly already captures the capacity gap.
  // If demand is insufficient, show as indicator only (loss = 0).
  if (r.util < 0.82 && r.actual > 0 && r.ta <= r.TARGET_TA) {
    const demandGated = r.demandSufficient === false
    issues.push({
      sev: demandGated ? 'amber' : 'red',
      pin: !demandGated && bn === 'Production',
      category: 'bottleneck', dimension: 'Production',
      t: `Plant running at ${Math.round(r.util * 100)}%, ${Math.round((r.utilisationTarget - r.util * 100))} points below ${r.utilisationTarget}% target${demandGated ? ' (demand-limited)' : ''}`,
      action: demandGated ? 'Grow sales pipeline before optimising throughput' : 'Map peak demand window and pre-stage batching 30 min before',
      rec: demandGated
        ? 'Plant has operational headroom but current volume reflects available orders. Focus on sales and pricing before investing in throughput improvements.'
        : 'Check batch cycle time and aggregate feed rate. Pre-staging batching before peak hours is the fastest lever.',
      loss: demandGated ? 0 : r.capLeakMonthly,
      formula: `(${r.cap} designed − ${r.actual.toFixed(1)} actual m³/hr) × ${r.opH} hr × ${Math.round(r.opD / 12)} days/month × $${Math.round(r.contribSafe)} margin`,
      diagnosis: {
        observed: `Plant produces ${r.actual.toFixed(1)} m³/hr against ${r.cap} m³/hr installed capacity (${Math.round(r.util * 100)}% utilization). ${demandGated ? 'Demand reported as insufficient to fill capacity.' : `That is ${Math.round(r.cap - r.actual)} m³/hr of unused capacity during operating hours.`}${a.batch_cycle && a.batch_cycle !== 'Fast, under 5 minutes' ? ` Batch cycle: ${(a.batch_cycle as string).split(',')[0].toLowerCase()}.` : ''}`,
        mechanism: demandGated
          ? 'The plant has capacity headroom but the order book does not fill it. This is a commercial constraint, not an operational one. Improving plant throughput will not help until demand catches up.'
          : `The plant likely sits idle for portions of each day. ${a.unplanned_stops && a.unplanned_stops !== 'None, no unplanned stops' ? `Unplanned stops (${(a.unplanned_stops as string).split(',')[0].toLowerCase()}) interrupt production.` : ''} ${r.ta > r.TARGET_TA ? `Fleet turnaround of ${r.ta} min means trucks return slowly, likely leaving the batching plant with no truck to load between peak periods.` : 'The gap is likely from demand patterns or fleet return timing that leaves the plant idle between ordering peaks.'}`,
        action: demandGated
          ? 'Step 1: Review pricing vs. competitors for top 3 mix designs. Step 2: Contact 5 contractors not currently buying from you. Step 3: Offer trial pricing on first 3 orders to win new accounts.'
          : `Step 1: Pull batching log for last 5 working days and mark every gap longer than 20 min. Step 2: For each gap, record reason: no order, no truck at plant, or equipment issue. Step 3: Pre-stage batching 30 min before your known peak ordering windows.`,
        validation: 'Print the batch computer log for 3 days. Highlight every period where no batch was produced for >20 min. For each gap, note: was a truck waiting at the plant? Was the plant idle with no truck? Was maintenance happening? If gaps are concentrated when trucks are available, the issue is batching speed or scheduling, not fleet.',
        strength: demandGated ? 'observed' : 'likely',
        tatComponent: 'plant-side',
        tatImpactEstimate: !demandGated && r.ta > r.TARGET_TA ? `Slow fleet turnaround (${r.ta} min) likely limits additional plant output. Confirm by checking whether batching plant has idle periods while waiting for trucks.` : undefined,
        impact: demandGated ? 'medium' : 'high',
        competingDrivers: demandGated
          ? ['market demand', 'pricing vs. competitors', 'sales pipeline', 'customer concentration']
          : ['batch cycle speed and number of batching lines', 'fleet return frequency', 'demand pattern across the day', 'aggregate feed rate and silo capacity'],
        modelLimits: 'Utilization is calculated from reported monthly output vs. rated capacity. Does not distinguish between: demand-driven idle time, fleet-driven idle time, and equipment-driven downtime. Validation step separates these.',
      },
    })
  }

  // ── Hidden deliveries ──────────────────────────────────────────────────

  if (r.hiddenDel > 0) {
    const demandGated = r.demandSufficient === false
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Fleet',
      t: `Fleet capacity headroom: ${r.hiddenDel} more deliveries/day possible at ${r.TARGET_TA}-min turnaround${demandGated ? ', demand-limited' : ''}`,
      action: demandGated ? 'Grow order book before expanding delivery capacity' : 'Fix turnaround and dispatch first, confirm demand exists before adding trucks',
      rec: demandGated
        ? `Fleet can support ${r.realisticMaxDel} deliveries/day at target turnaround vs. ${r.delDay} today. This headroom (${fmt(r.hiddenRevMonthly)}/month) is not realisable until demand grows, focus on sales pipeline.`
        : `At the ${r.TARGET_TA}-min target turnaround, your fleet can support ${r.realisticMaxDel} deliveries/day vs. ${r.delDay} today. Equivalent to ${fmt(r.hiddenRevMonthly)}/month in additional contribution, if customer demand supports it.`,
      loss: 0,
      formula: `${r.trucks} trucks × (${r.opH} hr × 60 ÷ ${r.TARGET_TA} min target) × ${r.fleetUtilFactor}% utilisation = ${r.realisticMaxDel} del/day capacity. Gap vs. actual: ${r.hiddenDel} del/day × ${r.mixCap} m³ × $${Math.round(r.contribSafe)} margin × ${Math.round(r.opD / 12)} days`,
    })
  }

  // ── Quality & Rejection ────────────────────────────────────────────────

  if (r.rejectPct > 1.5) {
    const plantPct    = Math.round(r.rejectPlantFraction * 100)
    const customerPct = Math.round((1 - r.rejectPlantFraction) * 100)
    const totalFormula = r.rejectOpportunityCost > 0
      ? `Material loss: ${r.rejectPct}% × ${r.delDay} del/day × ${r.mixCap} m³ × $${Math.round(r.materialCostPerM3 || r.contribSafe)}/m³ × ${Math.round(r.opD / 12)} days = $${r.rejectMaterialLoss.toLocaleString()} | Wasted cycle (demand-sufficient): ${r.rejectPct}% × ${r.delDay} del × ${r.mixCap} m³ × $${Math.round(r.contribSafe)} margin × ${Math.round(r.opD / 12)} days = $${r.rejectOpportunityCost.toLocaleString()}`
      : `${r.rejectPct}% ÷ 100 × ${r.delDay} del/day × ${r.mixCap} m³ × $${Math.round(r.materialCostPerM3 || r.contribSafe)}/m³ material cost × ${Math.round(r.opD / 12)} days (opportunity cost excluded, demand-constrained)`

    // Plant-side issue, batching, dosing, mix quality
    if (r.rejectPlantSideLoss > 0) {
      issues.push({
        sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
        t: `${Math.round(r.rejectPct)}% rejection, plant-side quality losses`,
        action: 'Calibrate water-cement ratio sensors and run slump test on every load before dispatch',
        rec: `Plant-side rejections (~${plantPct}% of total) are caused by batching, dosing, or mix quality failures. Each rejected load wastes $${Math.round(r.materialCostPerM3 || r.contribSafe)}/m³ in raw materials. Fix: monthly sensor calibration and mandatory slump testing at dispatch.`,
        loss: r.rejectPlantSideLoss,
        formula: `${plantPct}% of total rejection loss ($${r.rejectLeakMonthly.toLocaleString()}) | ${totalFormula}`,
        diagnosis: {
          observed: `Rejection rate: ${r.rejectPct}%. Plant-side causes: ~${plantPct}% of rejections. ${a.batch_calibration === 'More than 2 years ago' || a.batch_calibration === 'Never calibrated, original factory settings only' ? 'Batch sensors have not been calibrated recently.' : a.batch_calibration ? 'Calibration: ' + (a.batch_calibration as string).split(',')[0].toLowerCase() + '.' : ''}`,
          mechanism: `Concrete likely leaves the plant outside target spec. ${a.batch_calibration === 'More than 2 years ago' || a.batch_calibration === 'Never calibrated, original factory settings only' ? 'With sensors uncalibrated for over 2 years, the water-cement ratio drifts, producing inconsistent mix strength across batches.' : 'Water-cement ratio sensors may drift between calibrations, especially in dusty or humid plant environments.'} ${r.ta > 100 ? `The ${r.ta}-min turnaround also means concrete sits longer in the drum, losing workability in heat above 35°C.` : ''}`,
          action: `Step 1: Schedule sensor calibration within 14 days (water meter, aggregate moisture probe, cement scale). Step 2: Implement mandatory slump test at the dispatch point: no truck leaves without a passing test. Step 3: Review admixture inventory for expiry dates.`,
          validation: 'Pull batch tickets for last 30 days. Group rejections by mix design and time of day. If rejections are concentrated in afternoon heat across all mix designs, the primary driver is likely slump loss from turnaround time, not batching accuracy. If one mix design fails disproportionately, it is likely a dosing or recipe issue.',
          strength: a.batch_calibration ? 'observed' : 'likely',
          tatComponent: null,
          impact: r.rejectPlantSideLoss > 10000 ? 'high' : 'medium',
          competingDrivers: ['sensor calibration age', 'ambient temperature (>35°C slump loss)', 'aggregate moisture variability', 'admixture shelf life'],
          modelLimits: 'Plant/customer rejection split is based on reported assessment. Self-reported splits tend to understate plant-side causes. Independent review of rejection tickets recommended.',
        },
      })
    }

    // Customer-side issue, site unreadiness, pump delays, contractor refusal
    if (r.rejectCustomerSideLoss > 0) {
      issues.push({
        sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
        t: `${Math.round(r.rejectPct)}% rejection, site and customer-side losses`,
        action: 'Implement pre-departure site readiness confirmation and enforce demurrage clause after 45 min on site',
        rec: `Customer-side rejections (~${customerPct}% of total) are caused by site unreadiness, pump delays, or contractor refusals. The fix is contract enforcement and dispatch protocol, not batch control. A pre-departure confirmation call and an enforced demurrage clause address this directly.`,
        loss: r.rejectCustomerSideLoss,
        formula: `${customerPct}% of total rejection loss ($${r.rejectLeakMonthly.toLocaleString()}) | ${totalFormula}`,
        diagnosis: {
          observed: `${customerPct}% of rejections attributed to customer/site causes. Total rejection rate: ${r.rejectPct}%. ${r.ta > 100 ? `Turnaround is ${r.ta} min, increasing slump loss risk on site.` : ''}`,
          mechanism: `Trucks arrive at sites where the pour setup is incomplete. The contractor either refuses the load (scheduling change, wrong spec) or the concrete loses workability while waiting in the drum. ${r.ta > 100 ? `With a ${r.ta}-min turnaround, concrete is already ${Math.round(r.ta - 60)} min old at best when pouring starts. In summer heat, this is near the workability limit.` : ''} No cost is passed to the customer for rejected loads.`,
          action: 'Step 1: Dispatcher calls site 30 min before arrival: "Truck arriving in 30 min with 10 m³ C30. Is the pump set up?" Step 2: Add return-load clause to all contracts: customer pays material cost for any load rejected after truck arrival. Step 3: Enforce demurrage charge after 40 min site wait.',
          validation: 'Review last 20 rejection tickets. For each, record: who rejected (driver/foreman/lab), stated reason, and time between arrival and rejection. If most rejections happen within 10 min of arrival, the cause is likely spec mismatch or scheduling, not workability loss. If rejections cluster after 30+ min on site, slump loss from waiting is the primary driver.',
          strength: 'likely',
          tatComponent: 'site',
          impact: r.rejectCustomerSideLoss > 10000 ? 'high' : 'medium',
          competingDrivers: ['contractor site management', 'pump scheduling', 'ambient temperature (slump loss)', 'turnaround time (concrete age at pour)'],
          modelLimits: 'Customer-side rejection causes are estimated from reported data. Actual rejection patterns may differ by customer, project type, and season. Review rejection tickets to verify.',
        },
      })
    }
  }

  // ── Mix visibility ─────────────────────────────────────────────────────

  if (a.mix_split === 'Not sure, no visibility on production mix by strength class') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Quality', t: 'No visibility on production mix by strength class', action: 'Map monthly volume by strength class: C20, C25, C30, C35+', rec: 'The split between standard and high-strength concrete determines real margin.', loss: 0 })
  }

  if (a.mix_split === 'Mostly standard strength, over 70% is C20 to C30' && r.contrib > 0 && r.contrib < 20) {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Quality', t: 'Over 70% standard-grade production, margin improvement available', action: 'Get one price quote for C35+ from your top 3 customers', rec: 'C35+ mixes command 15–30% price premium with moderate cement cost increase.', loss: 0 })
  }

  if (r.mixMarginLift > 0.5) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
      t: `Mix opportunity, C35+ premium adds ${fmt(Math.round(r.mixMarginLift * r.monthlyM3))}/mo at current volume`,
      action: 'Verify C35+ demand with top customers before shifting production mix',
      rec: `Current blended margin: $${Math.round(r.mixWeightedContrib)}/m³. Shifting to ${Math.round(r.hsFraction * 100)}% C35+ at $${a.high_strength_price}/m³ premium.`,
      loss: 0,
    })
  }

  // ── Supply chain ───────────────────────────────────────────────────────

  if (a.silo_days === 'Under 2 days, high supply risk') {
    issues.push({ sev: 'red', pin: false, category: 'independent', dimension: 'Other', t: 'Cement stock under 2 days, one missed delivery stops the plant', action: 'Call your cement supplier today, negotiate a standing delivery schedule', rec: 'A single missed delivery at this stock level halts production entirely. Target: 5-day minimum buffer.', loss: 0 })
  }
  if (a.silo_days === '2 to 5 days, tight, supply-sensitive') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Other', t: 'Cement stock 2–5 days, vulnerable to supply disruption', action: 'Increase reorder point, extend to 7+ days before Ramadan and public holidays', rec: 'Irregular delivery schedules create real stoppage risk at this buffer level.', loss: 0 })
  }

  if (a.ramadan_schedule === 'No, same schedule year-round' && GCC_COUNTRIES.includes(country)) {
    const ramadanLoss = r.delDay > 0 && r.contrib > 0 ? Math.round(r.delDay * r.mixCap * r.contrib * (30 / 365) * 0.20) : 0
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: 'No Ramadan schedule, missing the early-morning peak window',
      action: 'Shift first dispatch to 05:30, complete major pours before 11:00',
      rec: 'Plants without a Ramadan schedule typically lose 15–25% of Ramadan revenue.',
      loss: ramadanLoss,
      formula: `${r.delDay} del/day × ${r.mixCap} m³ × $${Math.round(r.contribSafe)} margin × 30 days × 20%`,
    })
  }

  // ── Fleet availability ─────────────────────────────────────────────────

  if (r.availRate < 0.85 && r.operativeTrucks > 0 && r.trucks > 0) {
    const offRoad = r.trucks - r.operativeTrucks
    issues.push({
      sev: r.availRate < 0.70 ? 'red' : 'amber', pin: false, category: 'bottleneck', dimension: 'Fleet',
      t: `Fleet availability ${Math.round(r.availRate * 100)}%, ${offRoad} truck${offRoad > 1 ? 's' : ''} regularly off-road`,
      action: 'Set daily availability target of 90%+, track off-road trucks on a whiteboard',
      rec: `Effective fleet is ${r.operativeTrucks} trucks, not ${r.trucks}. Improving availability to 90% adds ${Math.floor(r.trucks * 0.9) - r.operativeTrucks} trucks back to daily capacity.`,
      loss: r.hiddenRevMonthly > 0 ? Math.round((1 - r.availRate) * r.hiddenRevMonthly) : 0,
    })
  }

  // ── Washout time ───────────────────────────────────────────────────────

  if (a.washout_time === '20 to 30 minutes, slow' || a.washout_time === 'Over 30 minutes, significant bottleneck') {
    const wMin = a.washout_time === 'Over 30 minutes, significant bottleneck' ? 35 : 25
    const wLoss = r.operativeTrucks > 0 && r.contrib > 0 ? Math.round((wMin - 15) / 60 * r.operativeTrucks * r.delDay / r.operativeTrucks * r.mixCap * r.contrib * (r.opD / 12)) : 0
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Fleet',
      t: `Washout takes ${(a.washout_time as string).split(', ')[0].toLowerCase()}, recoverable idle time`,
      action: 'Install dedicated washout bay with high-pressure water supply',
      rec: `Reducing washout to 10–15 min frees ${wMin - 15} min per truck per cycle.`,
      loss: wLoss,
      diagnosis: {
        observed: `Washout time reported at ${wMin} min per truck. Benchmark: 10-15 min. Excess: ${wMin - 15} min per cycle across ${r.effectiveUnits} trucks.`,
        mechanism: `Each truck loses ${wMin - 15} min per cycle at the washout station. ${wMin >= 25 ? 'At this duration, trucks are likely queuing for a single shared washout bay, or water pressure is too low to clean drums efficiently.' : 'The washout station likely has low water pressure or a manual process that slows each truck.'} Over a full day with ${r.delDay > 0 ? r.delDay + ' deliveries' : 'multiple cycles'}, this compounds into significant fleet idle time.`,
        action: `Step 1: Check water pressure at washout nozzle (target: min 10 bar). If below target, upgrade pump or nozzle. Step 2: If more than ${Math.ceil(r.effectiveUnits / 4)} trucks operate simultaneously, assess whether a second washout position is needed to prevent queuing. Step 3: Separate washout bay from the loading area if currently shared.`,
        validation: 'Time 5 consecutive washouts with a stopwatch. Record: drum cleaning duration, water start/stop, and any queue wait before the truck reaches the bay. If cleaning itself is fast but trucks queue for the bay, the issue is bay capacity, not water pressure.',
        strength: 'observed',
        tatComponent: 'washout',
        tatImpactEstimate: `${wMin - 15} min of excess located in washout per cycle.`,
        impact: wMin >= 25 ? 'medium' : 'low',
        modelLimits: 'Washout time is self-reported. Actual time may vary by truck condition, drum size, and concrete type. Validation step confirms.',
      },
    })
  }

  // ── Site wait + demurrage ──────────────────────────────────────────────

  if (r.siteWait > 45) {
    // Dollar loss is carried by the demurrage policy issue below (if applicable), avoid double-counting
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `Site wait time ${r.siteWait} min, trucks held ${r.siteWait - 40} min above 40-min target`,
      action: 'Require site readiness confirmation before dispatching, implement a pre-pour checklist',
      rec: 'Trucks should only depart when the site confirms pump crew and foreman are ready.',
      loss: 0,
    })
  }
  // Wow-moment: precise site-wait breakdown finding (only when breakdown questions filled)
  if (r.taSiteWaitMin !== null && r.siteWaitExcess > 0) {
    // Cap at excessMin: site wait can only account for at most the full turnaround gap.
    // Without this, siteWaitExcess > excessMin would claim more recovery than the turnaround
    // calculation allows, e.g. site wait 65 min (excess 30) when ta is only 20 min over target.
    const effectiveSiteWaitExcess = Math.min(r.siteWaitExcess, r.excessMin)
    const siteWaitLoss = r.ta > 0 && effectiveSiteWaitExcess > 0
      ? Math.round((effectiveSiteWaitExcess / r.ta) * r.realisticMaxDel * r.mixCap * r.contribSafe * (r.opD / 12))
      : 0
    issues.push({
      sev: 'red', pin: true, category: 'bottleneck', dimension: 'Fleet',
      t: `Site waiting time ${r.taSiteWaitMin} min, ${r.siteWaitExcess} min above 35-min benchmark`,
      action: 'Enforce demurrage charge and require site readiness confirmation before dispatch',
      rec: `Site waiting time is the single largest controllable component of your ${r.ta}-min turnaround. Reducing it by ${effectiveSiteWaitExcess} min recovers approximately ${fmt(siteWaitLoss)}/month, without adding a single truck.`,
      loss: siteWaitLoss,
      formula: `${effectiveSiteWaitExcess} actionable excess min ÷ ${r.ta} total TA × ${r.realisticMaxDel} max del/day × ${r.mixCap} m³ × ${Math.round(r.contribSafe)}/m³ × ${Math.round(r.opD / 12)} days`,
      diagnosis: {
        observed: `Site wait measured at ${r.taSiteWaitMin} min per delivery. Benchmark: 35 min (ground-level pours). Excess: ${r.siteWaitExcess} min per cycle across ${r.effectiveUnits} trucks and ${Math.round(r.opD / 12)} days/month.`,
        mechanism: `Trucks arrive at sites where the pour setup is not ready. Based on the reported wait time, trucks likely sit with loaded drums while pump crews are staged, formwork is completed, or site access is cleared. No advance ETA is communicated, so the site has no signal to prepare. This pattern is typically most severe during peak periods and large pours where multiple trucks converge. In hot conditions (>35°C), each excess minute also degrades concrete workability.`,
        action: 'Step 1: Introduce structured ETA communication (initially via WhatsApp, 30 min before arrival) with load details and expected pour time. Step 2: Where commercially viable, add demurrage clause to contracts for site waits exceeding 40 min. For key accounts where penalties are not realistic, share site-wait data in monthly performance reviews instead. Step 3: Track site wait per delivery for 2 weeks.',
        validation: 'On-site: time 10 consecutive deliveries from gate arrival to first concrete poured. Ask each site foreman: "Did you know the truck was coming, and when?" If most sites report they knew the truck was coming and pump crews were staged, the wait time is likely driven by access constraints or pour complexity rather than coordination.',
        strength: 'observed',
        tatComponent: 'site',
        tatImpactEstimate: `Site waiting accounts for ${effectiveSiteWaitExcess} of the ${r.excessMin} excess minutes in TAT.`,
        impact: 'high',
        competingDrivers: ['contractor site management', 'pump crew availability', 'project type (high-rise vs. ground pour)', 'access restrictions (security, staging area)'],
        modelLimits: 'Site wait benchmark (35 min) assumes ground-level pours. High-rise projects with pump-to-height, deep foundations, or restricted-access sites have inherently longer site times that are not excess.',
      },
    })
  }

  if (r.demurrageOpportunity > 0 && a.demurrage_policy === 'Clause exists but rarely enforced') {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `Demurrage clause exists but not enforced, ${fmt(r.demurrageOpportunity)}/month unrecovered`,
      action: 'Start invoicing demurrage on all site delays over 40 minutes',
      rec: 'The clause is in your contracts. Enforcing it consistently recovers revenue and changes contractor behaviour.',
      loss: r.demurrageOpportunity,
    })
  }
  if (r.demurrageOpportunity > 0 && (a.demurrage_policy === 'No demurrage charge in contracts' || a.demurrage_policy === 'Not sure')) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: 'No demurrage policy, site delays absorbed entirely by plant',
      action: 'Add a demurrage clause to all new and renewed contracts',
      rec: `Estimated monthly exposure: ${fmt(r.demurrageOpportunity)}. $2/min beyond the agreed window is common in GCC.`,
      loss: r.demurrageOpportunity,
    })
  }

  // ── Truck breakdowns & maintenance ─────────────────────────────────────

  if (r.truckBreakdowns > 2 || a.maint_programme === 'Reactive only, trucks are repaired when they break down' || a.maint_programme === 'No maintenance programme') {
    issues.push({
      sev: r.truckBreakdowns > 4 ? 'red' : 'amber', pin: false, category: 'independent', dimension: 'Fleet',
      t: r.truckBreakdowns > 0 ? `${r.truckBreakdowns} truck breakdown${r.truckBreakdowns > 1 ? 's' : ''} last month, reactive maintenance costing ${fmt(r.breakdownCostMonthly)}/month` : 'Reactive-only maintenance, breakdown risk unquantified',
      action: 'Implement monthly truck service schedule, tyres, drum, hydraulics, engine',
      rec: "Reactive maintenance costs 3–5× more over a fleet's lifetime. A basic monthly service schedule reduces unplanned downtime by 50–70%.",
      loss: r.breakdownCostMonthly,
    })
  }

  // ── Return liability ───────────────────────────────────────────────────

  if (r.rejectPct > 1.5 && (a.return_liability === 'Plant always absorbs the cost' || a.return_liability === 'No clear policy')) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
      t: 'Plant absorbs all reject costs, no contractor liability for returns',
      action: 'Add material cost recovery clause to all delivery contracts',
      rec: `At ${r.rejectPct}% reject rate, the plant bears 100% of material costs on every returned load.`,
      loss: 0,
    })
  }

  // ── Operator backup ────────────────────────────────────────────────────

  if (a.operator_backup === 'No, only one person can run the batch plant' || a.operator_backup === 'Not sure') {
    const dailyRev = r.delDay > 0 && r.price > 0 ? Math.round(r.delDay * r.mixCap * r.price) : 0
    issues.push({
      sev: 'red', pin: false, category: 'independent', dimension: 'Production',
      t: 'Single-operator dependency, plant cannot run if batch operator is absent',
      action: 'Train a backup operator within 30 days, target: fully independent within 60',
      rec: `Daily revenue at risk if operator is absent: ${fmt(dailyRev)}.`,
      loss: 0,
    })
  }

  // ── Customer concentration ─────────────────────────────────────────────

  if (r.topCustPct > 50) {
    issues.push({
      sev: 'red', pin: false, category: 'independent', dimension: 'Other',
      t: `${r.topCustPct}% of volume from single customer, critical revenue concentration`,
      action: 'Begin active outreach to 3 new contractors this month',
      rec: `Monthly revenue at risk if this customer is lost: ${fmt(r.concentrationRisk)}.`,
      loss: 0,
    })
  } else if (r.topCustPct > 30) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `${r.topCustPct}% of volume from single customer, concentration risk`,
      action: 'Identify and pursue 2–3 alternative contractors',
      rec: `Monthly revenue from top customer: ${fmt(r.concentrationRisk)}. Worth actively diversifying.`,
      loss: 0,
    })
  }

  // ── Cement optimisation ────────────────────────────────────────────────

  if (r.cementOptOpp > 0) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `Mix designs not reviewed in ${a.mix_design_review === 'Never formally reviewed, original designs still in use' ? 'years (never formally reviewed)' : (a.mix_design_review as string).toLowerCase()}, likely excess cement cost`,
      action: 'Commission a mix design review from a qualified concrete technologist',
      rec: `Plants using admixtures only for workability typically carry 8–15% excess cement. Estimated savings: ${fmt(r.cementOptOpp)}/month.`,
      loss: r.cementOptOpp,
      formula: `$${+(a.cement_cost ?? 0)} cement/m³ × 8% reduction × ${r.monthlyM3} m³/month`,
    })
  }

  // ── Partial load ───────────────────────────────────────────────────────

  if (r.partialLeakMonthly > 0) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Dispatch',
      t: `Average load ${r.partialLoad} m³ on ${r.mixCap} m³ trucks, ${Math.round((1 - r.partialRatio) * 100)}% capacity unused per trip`,
      action: `Consolidate small orders, minimum batch size policy or surcharge below ${Math.round(r.mixCap * 0.8)} m³`,
      rec: `Introducing a minimum order size or small-load surcharge recovers ${fmt(r.partialLeakMonthly)}/month.`,
      loss: r.partialLeakMonthly,
      formula: `(${r.mixCap} capacity − ${r.partialLoad} avg load) × ${r.delDay} del/day × $${Math.round(r.contribSafe)} margin × ${Math.round(r.opD / 12)} days/month`,
    })
  }

  // ── Surplus concrete ───────────────────────────────────────────────────

  if (r.surplusLeakMonthly > 0 && r.surplusMid >= 0.35) {
    issues.push({
      sev: r.surplusMid >= 0.75 ? 'red' : 'amber', pin: false, category: 'independent', dimension: 'Quality',
      t: `${r.surplusMid} m³ surplus concrete wasted per trip, ${fmt(r.surplusLeakMonthly)}/month in raw material cost`,
      action: 'Calibrate batch volumes to order size, train operators to batch to 102% of order, not 110%',
      rec: 'Tighter batch calibration reduces this to under 0.2 m³ at most well-run plants.',
      loss: r.surplusLeakMonthly,
      formula: `${r.surplusMid} m³ × ${r.delDay} del/day × $${Math.round(r.price - r.contrib)} material cost × ${Math.round(r.opD / 12)} days/month`,
    })
  }

  // ── Reject cause contextual flags ──────────────────────────────────────

  if (r.rejectPct > 1.5 && a.reject_cause === 'Rejection not tracked, unknown') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Quality', t: 'Rejections not tracked, cause unknown, improvement impossible', action: 'Start logging every rejection with cause code from tomorrow', rec: 'A simple cause code on each return ticket costs nothing and reveals the fix within 30 days.', loss: 0 })
  }
  if (r.rejectPct > 1.5 && a.reject_cause === 'Heat and stiffening during transit') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Quality', t: 'Heat stiffening causing rejections, retarder dosage needs review', action: 'Increase retarder dosage on loads with transit time over 45 min', rec: 'Retarder adjustment to mix design for long-haul loads is the standard fix.', loss: 0 })
  }
  if (r.rejectPct > 1.5 && a.reject_cause === 'Site not ready, pump or crew unavailable') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Quality', t: 'Site unreadiness causing rejections, a dispatch and demurrage problem', action: 'Implement pre-departure site readiness call', rec: 'The fix is in dispatch protocol and contract enforcement.', loss: 0 })
  }

  // ── Fuel cost ──────────────────────────────────────────────────────────

  if (r.fuelPerDel > 0 && r.fuelMarginImpact > 0.15) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `Fuel cost $${r.fuelPerDel}/delivery, ${Math.round(r.fuelMarginImpact * 100)}% of contribution margin`,
      action: 'Review delivery radius and route efficiency, fuel is eroding margin',
      rec: `Monthly fleet fuel cost: ${fmt(r.fuelMonthly)}. Review whether fuel costs are factored into pricing.`,
      loss: 0,
      formula: `$${r.fuelPerDel} per delivery ÷ ${r.mixCap} m³ = $${r.fuelPerM3.toFixed(2)}/m³. ${Math.round(r.fuelMarginImpact * 100)}% of $${Math.round(r.contribSafe)} margin.`,
    })
  }

  // ── Atypical month ─────────────────────────────────────────────────────

  if (r.atypicalMonth) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: 'Figures based on atypical month, all dollar estimates are directional only',
      action: 'Verify key figures against a normal month before presenting to plant owner',
      rec: `Last month was reported as: "${a.typical_month}". Cross-check against a representative month.`,
      loss: 0,
    })
  }

  // ── Order notice ───────────────────────────────────────────────────────

  if (a.order_notice === 'Under 4 hours, same day calls only' && r.scores.dispatch !== null && r.scores.dispatch < 70) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Dispatch',
      t: 'Same-day orders only, route optimisation not feasible at current planning horizon',
      action: 'Focus on rapid response protocols, not route planning',
      rec: 'With under 4 hours notice, formal zone scheduling is not achievable. Focus on reducing order-to-dispatch time.',
      loss: 0,
    })
  }

  // ── Aggregate days ─────────────────────────────────────────────────────

  if (a.aggregate_days === 'Under 2 days, high supply risk') {
    issues.push({ sev: 'red', pin: false, category: 'independent', dimension: 'Other', t: 'Aggregate stock under 2 days, one missed delivery stops the plant', action: 'Call your aggregate supplier today, negotiate a standing delivery schedule', rec: 'Target: 5-day minimum buffer for sand and all aggregate types.', loss: 0 })
  }
  if (a.aggregate_days === '2 to 5 days, tight, supply-sensitive') {
    issues.push({ sev: 'amber', pin: false, category: 'independent', dimension: 'Other', t: 'Aggregate stock 2–5 days, vulnerable to supply disruption', action: 'Increase reorder point, extend to 7+ days before Ramadan and public holidays', rec: 'Aggregate supply disruptions are as common as cement disruptions in GCC markets.', loss: 0 })
  }

  // ── Driver constraint ──────────────────────────────────────────────────

  if (r.driverConstrained) {
    const driversShort = r.operativeTrucks - r.qualifiedDrivers
    const driverCapLoss = Math.round(driversShort * (r.opH * 60 / r.TARGET_TA) * 0.85 * r.mixCap * r.contrib * (r.opD / 12))
    issues.push({
      sev: 'amber', pin: false, category: 'bottleneck', dimension: 'Fleet',
      t: `Only ${r.qualifiedDrivers} qualified drivers for ${r.operativeTrucks} operative trucks, drivers are the bottleneck`,
      action: 'Prioritise licence renewal and stagger home leave schedules',
      rec: `${driversShort} truck${driversShort > 1 ? 's are' : ' is'} sitting idle due to driver shortage. Monthly capacity impact: ${fmt(driverCapLoss)}.`,
      loss: driverCapLoss,
    })
  }

  // ── Water cost ─────────────────────────────────────────────────────────

  if (r.waterCost > 1) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Other',
      t: `Water cost $${r.waterCost.toFixed(2)}/m³, significant margin item`,
      action: 'Include water cost in your per-m³ pricing calculation',
      rec: `Monthly water cost: ${fmt(Math.round(r.waterCost * r.monthlyM3))}.`,
      loss: 0,
    })
  }

  // ── Batch calibration ──────────────────────────────────────────────────

  if (r.calibrationExposure > 0) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
      t: `Batch plant not calibrated in ${a.batch_calibration === 'Never calibrated, original factory settings only' ? 'years (never)' : (a.batch_calibration as string).toLowerCase()}, dosing accuracy at risk`,
      action: 'Commission professional calibration from equipment manufacturer',
      rec: `Estimated monthly exposure from 5% cement drift: ${fmt(r.calibrationExposure)}. Calibration costs $500–2,000.`,
      loss: r.calibrationExposure,
      formula: `$${+(a.cement_cost ?? 0)}/m³ cement × 5% drift × ${r.monthlyM3} m³/month`,
    })
  }

  // ── Summer cooling ─────────────────────────────────────────────────────

  if (a.summer_cooling === 'No, no active cooling measures' && GCC_COUNTRIES.includes(country)) {
    issues.push({
      sev: 'amber', pin: false, category: 'independent', dimension: 'Quality',
      t: 'No active concrete cooling, elevated reject risk during summer months',
      action: 'Install chilled water system before June, or use ice addition as interim measure',
      rec: 'In GCC summer conditions above 42°C, concrete without active cooling regularly exceeds 32°C at discharge.',
      loss: 0,
    })
  }

  // ── Sort: pinned first, then by dollar value descending ────────────────

  issues.sort((x, y) => {
    if (x.pin && !y.pin) return -1
    if (!x.pin && y.pin) return 1
    return y.loss - x.loss
  })

  return issues
}
