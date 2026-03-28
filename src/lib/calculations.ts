/**
 * alRMX Assessment Calculation Engine
 * Extracted from assessment-tool.html for testing and reuse.
 *
 * This module mirrors the calc() and simCalc() functions in the HTML file.
 * Any changes here should be reflected in the HTML and vice versa.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Answers {
  [key: string]: string | number | undefined
}

export interface CalcScores {
  prod: number | null
  dispatch: number | null
  fleet: number | null
  logistics: number | null
  quality: number | null
}

export interface CalcResult {
  contrib: number
  contribFuelAdj: number
  marginRatio: number
  marginIncomplete: boolean
  util: number
  unusedCapAnnual: number
  capLeakMonthly: number
  turnaroundLeakMonthly: number
  hiddenDel: number
  hiddenRevMonthly: number
  hiddenConfidence: 'high' | 'low'
  rejectLeakMonthly: number
  maxDelDay: number
  realisticMaxDel: number
  excessMin: number
  scores: CalcScores
  overall: number | null
  bottleneck: string | null
  ta: number
  trucks: number
  effectiveUnits: number
  delDay: number
  mixCap: number
  actual: number
  monthlyM3: number
  cap: number
  opH: number
  opD: number
  workingDaysMonth: number
  rejectPct: number
  price: number
  TARGET_TA: number
  warnings: string[]
}

export interface SimBaseline {
  cap: number
  opH: number
  opD: number
  mixCap: number
  turnaround: number
  trucks: number
  util: number // 0-100
  price: number
  contrib: number
  TARGET_TA: number
  dispatchScore: number // 0-100 baseline
  qualityScore: number // 0-100 baseline
}

export interface SimScenario {
  turnaround: number
  trucks: number
  util: number // 0-100
  price: number
  otd: number // order-to-dispatch minutes
}

export interface SimResult {
  scenarioAnnual: number
  deltaVol: number
  revenueUpside: number
  contribUpside: number
  scenarioBottleneck: string
  prodDaily: number
  effFleetDaily: number
  sProdScore: number
  sFleetScore: number
  sDispScore: number
  sContrib: number
  dispEff: number
}

// ── Constants ────────────────────────────────────────────────────────────────

export const FLEET_UTIL_TARGET = 0.85

export function calcTargetTA(radius: number): number {
  return radius > 0 ? Math.min(110, Math.max(65, Math.round(60 + radius * 1.5))) : 80
}

// ── Score Maps ───────────────────────────────────────────────────────────────

const CONF_WEIGHT: Record<string, number> = {
  'System records \u2014 read from batch computer or dispatch system': 1,
  'Calculated from monthly reports or delivery tickets': 0.95,
  'Estimated by plant manager or dispatcher': 0.75,
  'Rough estimates \u2014 not based on records': 0.55,
}

const BATCH_CYCLE_PENALTY: Record<string, number> = {
  'Fast \u2014 under 5 min': 0,
  'Normal \u2014 5 to 7 min': 5,
  'Slow \u2014 7 to 10 min': 14,
  'Very slow \u2014 over 10 min': 22,
}

const STOPS_PENALTY: Record<string, number> = {
  'None \u2014 no unplanned stops': 0,
  '1 to 2 stops': 3,
  '3 to 5 stops': 10,
  'More than 5 stops': 20,
}

const DISPATCH_OTD_MAP: Record<string, number> = {
  'Under 15 minutes \u2014 fast response': 100,
  '15 to 25 minutes \u2014 acceptable': 70,
  '25 to 40 minutes \u2014 slow': 40,
  'Over 40 minutes \u2014 critical bottleneck': 10,
}

const ROUTE_CLUSTERING_MAP: Record<string, number> = {
  'Always \u2014 formal zone system in place': 100,
  'Usually \u2014 informal grouping most of the time': 75,
  'Sometimes \u2014 depends on the dispatcher': 45,
  'Rarely or never': 15,
}

const PLANT_IDLE_MAP: Record<string, number> = {
  'Never \u2014 a truck is always available': 100,
  'Occasionally \u2014 a few times per week': 70,
  'Regularly \u2014 most busy periods': 40,
  'Every day \u2014 always waiting for trucks': 10,
}

const DISPATCH_TOOL_MAP: Record<string, number> = {
  'Dedicated dispatch software with real-time tracking': 100,
  'Spreadsheet combined with WhatsApp': 65,
  'WhatsApp messages only \u2014 no spreadsheet': 35,
  'Phone calls and a whiteboard or paper list': 10,
}

const ORDER_NOTICE_MAP: Record<string, number> = {
  'Under 4 hours \u2014 same day calls only': 20,
  '4 to 24 hours \u2014 day-of or day-before': 55,
  '1 to 3 days ahead': 85,
  'Formal schedule \u2014 weekly or project-based': 100,
}

const QC_MAP: Record<string, number> = {
  'Both logged every batch \u2014 enforced strictly': 100,
  'Usually done \u2014 most trucks, informal recording': 70,
  'Sometimes \u2014 depends on operator or shift': 35,
  'Rarely or never \u2014 no systematic quality checks': 5,
}

const CALIB_MAP: Record<string, number> = {
  'Within the last 12 months \u2014 certificate available': 100,
  '1 to 2 years ago': 70,
  'More than 2 years ago': 35,
  'Never calibrated \u2014 original factory settings only': 10,
}

const SURPLUS_SCORE_MAP: Record<string, number> = {
  'Under 0.2 m\u00b3 \u2014 minimal waste': 100,
  '0.2 to 0.5 m\u00b3 \u2014 moderate': 70,
  '0.5 to 1.0 m\u00b3 \u2014 significant': 35,
  'Over 1.0 m\u00b3 \u2014 serious problem': 10,
}

const WASHOUT_MAP: Record<string, number> = {
  'Under 10 minutes \u2014 fast': 100,
  '10 to 20 minutes \u2014 standard': 75,
  '20 to 30 minutes \u2014 slow': 40,
  'Over 30 minutes \u2014 significant bottleneck': 10,
}

const LIABILITY_MAP: Record<string, { factor: number; base: string }> = {
  'Contractor always pays \u2014 formal policy enforced': { factor: 0, base: 'materials' },
  'Contractor sometimes pays \u2014 handled case by case': { factor: 0.6, base: 'price' },
  'Plant always absorbs the cost': { factor: 1, base: 'price' },
  'No clear policy': { factor: 1, base: 'price' },
}

// ── Helper ───────────────────────────────────────────────────────────────────

function weightedAvg(items: { v: number | null | undefined; w: number }[]): number | null {
  const valid = items.filter((x) => x.v != null) as { v: number; w: number }[]
  if (!valid.length) return null
  const totalW = valid.reduce((s, x) => s + x.w, 0)
  return Math.round(valid.reduce((s, x) => s + x.v * x.w, 0) / totalW)
}

// ── Main Calculation ─────────────────────────────────────────────────────────

export function calc(answers: Answers, meta?: { season?: string }): CalcResult {
  const a = answers

  // Economics
  const price = +(a.price_m3 ?? 0) || 0
  const cement = +(a.cement_cost ?? 0) || 0
  const agg = +(a.aggregate_cost ?? 0) || 0
  const admix = +(a.admix_cost ?? 0) || 0
  const marginIncomplete = price > 0 && cement > 0 && !agg && !admix
  const contrib = Math.max(0, price - cement - agg - admix)
  const marginRatio = price > 0 ? contrib / price : 0.35

  // Production
  const cap = +(a.plant_cap ?? 0) || 0
  const opH = +(a.op_hours ?? 0) || 10
  const opD = +(a.op_days ?? 0) || 300
  const monthlyM3 = +(a.actual_prod ?? 0) || 0
  const workingDaysMonth = +(a.working_days_month ?? 0) || Math.round(opD / 12)
  const hoursPerMonth = opH * workingDaysMonth
  const actual = hoursPerMonth > 0 ? monthlyM3 / hoursPerMonth : 0
  const util = cap > 0 ? actual / cap : 0
  const unusedCapAnnual = Math.max(0, (cap - actual) * opH * opD)
  const capLeakMonthly = Math.round(unusedCapAnnual * contrib / 12)

  // Fleet
  const trucks = +(a.n_trucks ?? 0) || 0
  const ta = +(a.turnaround ?? 0) || 0
  const mixCap = +(a.mixer_capacity ?? 0) || 7
  const delDay = +(a.deliveries_day ?? 0) || 0
  const radius = +(a.delivery_radius ?? 0) || 0
  const TARGET_TA = calcTargetTA(radius)

  const truckAvail = +(a.truck_availability ?? 0) || 0
  const availRate = truckAvail > 0 && trucks > 0 ? Math.min(1, truckAvail / trucks) : 1
  const operativeTrucks = truckAvail > 0 ? truckAvail : trucks
  const qualifiedDrivers = +(a.qualified_drivers ?? 0) || 0
  const effectiveUnits = qualifiedDrivers > 0 ? Math.min(operativeTrucks, qualifiedDrivers) : operativeTrucks

  const maxDelDay = effectiveUnits > 0 && ta > 0 ? Math.floor(effectiveUnits * (opH * 60 / ta)) : 0
  const realisticMaxDel = effectiveUnits > 0 ? Math.floor(effectiveUnits * (opH * 60 / TARGET_TA) * FLEET_UTIL_TARGET) : 0
  const rawHidden = Math.max(0, realisticMaxDel - delDay)
  const hiddenSuspect = operativeTrucks > 0 && rawHidden > operativeTrucks * 3
  const hiddenDel = rawHidden
  const hiddenConfidence: 'high' | 'low' = hiddenSuspect ? 'low' : 'high'
  const hiddenRevMonthly = Math.round(hiddenDel * mixCap * contrib * (opD / 12))
  const excessMin = Math.max(0, ta - TARGET_TA)
  const turnaroundLeakMonthly = ta > 0 && effectiveUnits > 0
    ? Math.round(excessMin / ta * realisticMaxDel * mixCap * contrib * (opD / 12))
    : 0

  // Reject leak
  const rejectPct = +(a.reject_pct ?? 0) || 0
  const liab = LIABILITY_MAP[a.return_liability as string] || { factor: 1, base: 'price' }
  const rejectBase = liab.base === 'materials' ? cement + agg + admix : price
  const rejectLeakMonthly = Math.round(rejectPct / 100 * delDay * mixCap * rejectBase * liab.factor * (opD / 12))

  // Fuel
  const fuelPerDel = +(a.fuel_per_delivery ?? 0) || 0
  const fuelPerM3 = fuelPerDel > 0 && mixCap > 0 ? fuelPerDel / mixCap : 0
  const waterCost = +(a.water_cost ?? 0) || 0
  const contribFuelAdj = Math.max(0, contrib - fuelPerM3 - waterCost)

  // ── Scores ─────────────────────────────────────────────────────────────────

  const confWeight = CONF_WEIGHT[a.prod_data_source as string] ?? 1

  // Production score
  let utilScore: number | null = actual > 0 ? Math.max(0, Math.min(100, Math.round(util / 0.92 * 100))) : null
  if (utilScore !== null) {
    const batchPenalty = BATCH_CYCLE_PENALTY[a.batch_cycle as string] ?? 0
    utilScore = Math.max(0, utilScore - batchPenalty)
    const stopsPenalty = STOPS_PENALTY[a.stops_freq as string] ?? 0
    utilScore = Math.max(0, utilScore - stopsPenalty)
    utilScore = Math.round(utilScore * confWeight)
  }

  // Summer adjustment
  const isSummer = meta?.season === 'summer'
  let summerAdjusted = false
  if (isSummer && a.summer_prod_drop && utilScore !== null) {
    const dropMap: Record<string, number> = {
      'Under 10% \u2014 minimal seasonal impact': 0.95,
      '10 to 20% \u2014 moderate drop': 0.85,
      '20 to 35% \u2014 significant summer slowdown': 0.72,
      'Over 35% \u2014 severe seasonal reduction': 0.60,
      'Not sure \u2014 no seasonal comparison available': 0.80,
    }
    const summerFactor = dropMap[a.summer_prod_drop as string] ?? 1
    if (summerFactor < 1) {
      utilScore = Math.min(100, Math.round(utilScore / summerFactor))
      summerAdjusted = true
    }
  }

  // Turnaround score
  const taScore = ta > 0 ? Math.max(0, Math.min(100, Math.round((100 - (excessMin / TARGET_TA) * 80) * confWeight))) : null

  // Dispatch score
  const dWeighted = [
    { v: DISPATCH_OTD_MAP[a.order_to_dispatch as string], w: 0.35 },
    { v: ROUTE_CLUSTERING_MAP[a.route_clustering as string], w: 0.22 },
    { v: PLANT_IDLE_MAP[a.plant_idle as string], w: 0.18 },
    { v: DISPATCH_TOOL_MAP[a.dispatch_tool as string], w: 0.13 },
    { v: ORDER_NOTICE_MAP[a.order_notice as string], w: 0.12 },
  ].filter((x) => x.v !== undefined) as { v: number; w: number }[]
  const dispScore = weightedAvg(dWeighted.map((x) => ({ v: x.v, w: x.w })))

  // Logistics score
  const availScore = availRate > 0 ? Math.max(0, Math.min(100, Math.round(availRate / 0.95 * 100))) : null
  const driverScore = qualifiedDrivers > 0 && operativeTrucks > 0
    ? Math.max(0, Math.min(100, Math.round(Math.min(qualifiedDrivers / operativeTrucks, 1) / 0.95 * 100)))
    : null
  const washoutScore = WASHOUT_MAP[a.washout_time as string] ?? null
  const logisticsScore = weightedAvg([
    { v: taScore, w: 0.50 },
    { v: availScore, w: 0.25 },
    { v: driverScore, w: 0.15 },
    { v: washoutScore, w: 0.10 },
  ])

  // Quality score
  const rejectScore = rejectPct >= 0 ? Math.max(0, Math.min(100, Math.round(100 - rejectPct * 12))) : null
  const qcScore = QC_MAP[a.quality_control as string] ?? null
  const calibScore = CALIB_MAP[a.batch_calibration as string] ?? null
  const surplusScore = SURPLUS_SCORE_MAP[a.surplus_concrete as string] ?? null
  const qualityScore = weightedAvg([
    { v: rejectScore, w: 0.50 },
    { v: qcScore, w: 0.25 },
    { v: calibScore, w: 0.15 },
    { v: surplusScore, w: 0.10 },
  ])

  // Overall + bottleneck
  const valid = [utilScore, dispScore, logisticsScore, qualityScore].filter((v) => v !== null) as number[]
  const overall = valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null
  let bottleneck: string | null = null
  if (valid.length >= 2) {
    const scores: Record<string, number | null> = { Production: utilScore, Dispatch: dispScore, Logistics: logisticsScore, Quality: qualityScore }
    const validScores = Object.entries(scores).filter(([, v]) => v !== null) as [string, number][]
    const mn = Math.min(...validScores.map(([, v]) => v))
    const worst = validScores.find(([, v]) => v === mn)
    bottleneck = worst ? worst[0] : null
  }

  // Warnings
  const warnings: string[] = []
  if (cap > 0 && actual > cap * 1.1) warnings.push('Production rate exceeds designed plant capacity by >10%.')
  if (delDay > 0 && mixCap > 0 && workingDaysMonth > 0 && monthlyM3 > 0 && delDay * mixCap * workingDaysMonth > monthlyM3 * 1.3) {
    warnings.push('Delivery count suggests higher volume than reported production.')
  }
  if (ta > 0 && radius > 0 && ta < radius * 3) warnings.push('Turnaround time is shorter than estimated transit time.')

  return {
    contrib, contribFuelAdj, marginRatio, marginIncomplete, util, unusedCapAnnual, capLeakMonthly,
    turnaroundLeakMonthly, hiddenDel, hiddenRevMonthly, hiddenConfidence, rejectLeakMonthly,
    maxDelDay, realisticMaxDel, excessMin,
    scores: { prod: utilScore, dispatch: dispScore, fleet: logisticsScore, logistics: logisticsScore, quality: qualityScore },
    overall, bottleneck, ta, trucks, effectiveUnits, delDay, mixCap, actual, monthlyM3, cap, opH, opD,
    workingDaysMonth, rejectPct, price, TARGET_TA, warnings,
  }
}

// ── Scenario Simulator ───────────────────────────────────────────────────────

export function simCalc(baseline: SimBaseline, scenario: SimScenario): SimResult {
  const { cap, opH, opD, mixCap, TARGET_TA } = baseline
  const { turnaround: sTA, trucks: sTrucks, util: sUtilPct, price: sPrice, otd: sOTD } = scenario

  // Variable costs from baseline
  const bVarCosts = baseline.price - baseline.contrib

  // Production-limited daily capacity
  const sActualRate = cap * (sUtilPct / 100) * 0.92
  const prodDaily = sActualRate * opH

  // Fleet-limited daily capacity
  const delsPerTruck = sTA > 0 ? (opH * 60 / sTA) : 0
  const totalDels = delsPerTruck * sTrucks
  const fleetDaily = totalDels * mixCap

  // Dispatch efficiency from order-to-dispatch time
  const dispEff = Math.max(0.40, Math.min(0.98, 1 - (sOTD / 100)))
  const effFleetDaily = fleetDaily * dispEff

  // Scenario output = min of constraints
  const scenarioDaily = Math.min(prodDaily, effFleetDaily)
  const scenarioAnnual = Math.round(scenarioDaily * opD)

  // Bottleneck
  const scenarioBottleneck = prodDaily <= effFleetDaily ? 'Production' : 'Fleet / Logistics'

  // Contribution recalculated when price changes
  const sContrib = Math.max(0, sPrice - bVarCosts)

  // Baseline annual volume (using same constraint logic)
  const bProdDaily = cap * (baseline.util / 100) * 0.92 * opH
  const bDelsPerTruck = baseline.turnaround > 0 ? (opH * 60 / baseline.turnaround) : 0
  const bFleetDaily = bDelsPerTruck * baseline.trucks * mixCap
  const bDispEff = Math.max(0.4, Math.min(0.98, (baseline.dispatchScore / 100) * 0.3 + 0.7))
  const bEffFleetDaily = bFleetDaily * bDispEff
  const bBaselineDaily = Math.min(bProdDaily, bEffFleetDaily)
  const bAnnualVol = Math.round(bBaselineDaily * opD)

  const deltaVol = scenarioAnnual - bAnnualVol
  const revenueUpside = deltaVol * sPrice
  const contribUpside = deltaVol * sContrib

  // Scores
  const sProdScore = Math.max(0, Math.min(100, Math.round((sUtilPct / 92) * 100)))
  const taRatio = TARGET_TA > 0 ? sTA / TARGET_TA : 1
  const sFleetScore = Math.max(0, Math.min(100, Math.round(taRatio <= 1 ? 100 : 100 - ((taRatio - 1) * 120))))
  const sDispScore = Math.max(0, Math.min(100, Math.round(100 - sOTD * 1.4)))

  return {
    scenarioAnnual, deltaVol, revenueUpside, contribUpside, scenarioBottleneck,
    prodDaily, effFleetDaily, sProdScore, sFleetScore, sDispScore, sContrib, dispEff,
  }
}
