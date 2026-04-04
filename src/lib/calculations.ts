/**
 * alRMX Assessment Calculation Engine
 * Single source of truth for all assessment scoring and financial calculations.
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
  // Economics
  contrib: number
  contribSafe: number        // contrib capped at price×35% when material costs are incomplete
  materialCostPerM3: number  // cement + agg + admix — used for reject/surplus loss calculations
  contribFuelAdj: number
  marginRatio: number
  marginIncomplete: boolean
  contribNegative: boolean   // true when entered costs exceed selling price
  mixWeightedContrib: number
  mixMarginLift: number
  hsPremium: number
  hsFraction: number
  waterCost: number

  // Production
  util: number
  unusedCapAnnual: number
  capLeakMonthly: number
  actual: number
  monthlyM3: number
  cap: number
  opH: number
  opD: number
  workingDaysMonth: number

  // Fleet
  ta: number
  trucks: number
  operativeTrucks: number
  availRate: number
  qualifiedDrivers: number
  effectiveUnits: number
  driverConstrained: boolean
  delDay: number
  mixCap: number         // truck nameplate capacity (m³) — used for partial load comparison
  effectiveMixCap: number // avg m³ actually delivered per trip (derived or fallback to mixCap)
  radius: number
  TARGET_TA: number
  maxDelDay: number
  realisticMaxDel: number
  excessMin: number
  hiddenDel: number
  hiddenRevMonthly: number
  hiddenSuspect: boolean
  hiddenConfidence: 'high' | 'low'
  turnaroundLeakMonthly: number
  turnaroundLeakMonthlyCostOnly: number  // demand-constrained: fuel + variable cost savings only (no contrib margin)
  perMinTACoeff: number   // $/minute of excess turnaround — used by GPS section dollar calc

  // Turnaround breakdown (derived from washout_time + site_wait_time + radius)
  siteWait: number
  washoutMin: number
  transitEst: number
  taUnexplained: number
  // Detailed breakdown from optional new questions
  taTransitMin: number | null
  taSiteWaitMin: number | null
  taUnloadMin: number | null
  taWashoutMin: number | null
  taBreakdownSum: number
  taBreakdownEntered: boolean
  siteWaitExcess: number   // minutes over 35-min benchmark — demurrage candidate
  washoutExcess: number    // minutes over 12-min benchmark — procedure fix candidate

  // Reject & quality
  rejectPct: number
  rejectLeakMonthly: number      // total: material loss + opportunity cost (demand-gated)
  rejectMaterialLoss: number     // materials wasted only (always applies)
  rejectOpportunityCost: number  // wasted truck cycle contrib — only when demandSufficient
  rejectPlantFraction: number    // 0–1: fraction of loss attributable to plant-side causes
  rejectPlantSideLoss: number    // rejectLeakMonthly × rejectPlantFraction
  rejectCustomerSideLoss: number // rejectLeakMonthly × (1 − rejectPlantFraction)

  // Financial leaks
  partialLoad: number
  partialRatio: number
  partialLeakMonthly: number
  surplusMid: number
  surplusLeakMonthly: number
  demurrageOpportunity: number
  truckBreakdowns: number
  breakdownCostMonthly: number
  topCustPct: number
  concentrationRisk: number
  cementOptOpp: number
  calibrationExposure: number
  fuelPerDel: number
  fuelPerM3: number
  fuelMonthly: number
  fuelMarginImpact: number

  // Flags
  atypicalMonth: boolean
  isSummer: boolean
  summerAdjusted: boolean
  seasonalFactor: number     // 1.0 = no adjustment; <1.0 = summer reduction applied to loss calcs
  daysMismatchPenalty: number

  // Demand context
  demandSufficient: boolean | null  // true = operations-limited, false = demand-limited, null = unknown

  // Override-aware targets
  utilisationTarget: number  // 0–100, default 85
  fleetUtilFactor: number    // 0–100, default 85

  // Scores
  scores: CalcScores
  overall: number | null
  bottleneck: string | null
  price: number
  dispatchMin: number | null
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
  dispatchMin: number  // baseline order-to-dispatch minutes (same scale as scenario)
  dispatchScore: number // 0-100 baseline (kept for score display)
  qualityScore: number // 0-100 baseline
}

export interface SimScenario {
  turnaround: number
  trucks: number
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
  maxUtilPct: number
  sUtil: number
}

// ── Overrides ────────────────────────────────────────────────────────────────

export interface CalcOverrides {
  utilisationTarget?: number  // 0–100, default 85
  fleetUtilFactor?: number    // 0–100, default 85
}

// ── Constants ────────────────────────────────────────────────────────────────

export const FLEET_UTIL_TARGET = 0.85

/** Low / mid / high range on a totalLoss figure (±30%).
 *  Only shown when data confidence is below system-records level. */
export function calcLossRange(totalLoss: number): { low: number; mid: number; high: number } {
  return {
    low: Math.round(totalLoss * 0.70),
    mid: totalLoss,
    high: Math.round(totalLoss * 1.30),
  }
}

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

const DISPATCH_MIN_MAP: Record<string, number> = {
  'Under 15 minutes \u2014 fast response': 12,
  '15 to 25 minutes \u2014 acceptable': 20,
  '25 to 40 minutes \u2014 slow': 32,
  'Over 40 minutes \u2014 critical bottleneck': 45,
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
  'Contractor sometimes pays \u2014 handled case by case': { factor: 0.6, base: 'materials' },
  // Plant absorbs: loss = materials wasted (cement + agg + admix), not selling price.
  // The plant already paid labor/fuel; those are sunk. Only materials are thrown in the bin.
  'Plant always absorbs the cost': { factor: 1, base: 'materials' },
  'No clear policy': { factor: 1, base: 'materials' },
}

// ── Helper ───────────────────────────────────────────────────────────────────

function weightedAvg(items: { v: number | null | undefined; w: number }[]): number | null {
  const valid = items.filter((x) => x.v != null) as { v: number; w: number }[]
  if (!valid.length) return null
  const totalW = valid.reduce((s, x) => s + x.w, 0)
  return Math.round(valid.reduce((s, x) => s + x.v * x.w, 0) / totalW)
}

// ── Main Calculation ─────────────────────────────────────────────────────────

export function calc(answers: Answers, meta?: { season?: string }, overrides?: CalcOverrides): CalcResult {
  const a = answers
  const utilisationTargetPct = overrides?.utilisationTarget ?? 85
  const fleetUtilFactorPct = overrides?.fleetUtilFactor ?? 85
  const utilisationTargetFrac = utilisationTargetPct / 100
  const fleetUtilFactorFrac = fleetUtilFactorPct / 100

  // Economics
  const price = +(a.price_m3 ?? 0) || 0
  const cement = +(a.cement_cost ?? 0) || 0
  const agg = +(a.aggregate_cost ?? 0) || 0
  const admix = +(a.admix_cost ?? 0) || 0
  const marginIncomplete = price > 0 && cement > 0 &&
    (+(a.aggregate_cost ?? 0) === 0 || a.aggregate_cost === undefined || a.aggregate_cost === '') &&
    (+(a.admix_cost ?? 0) === 0 || a.admix_cost === undefined || a.admix_cost === '')
  const contribNegative = price > 0 && (cement + agg + admix) > price
  const contrib = Math.max(0, price - cement - agg - admix)
  const marginRatio = price > 0 ? contrib / price : 0.35
  // contribSafe: used for all loss calculations.
  // When material costs are incomplete, contrib = price (100% margin) which inflates all loss figures 3-4x.
  // Fall back to 35% of price — conservative for GCC standard-mix, errs toward understatement.
  const marginIncompleteEarly = price > 0 && cement > 0 &&
    (+(a.aggregate_cost ?? 0) === 0 || a.aggregate_cost === undefined || a.aggregate_cost === '') &&
    (+(a.admix_cost ?? 0) === 0 || a.admix_cost === undefined || a.admix_cost === '')
  const noCosts = price > 0 && cement === 0 && agg === 0 && admix === 0
  const contribSafe = (marginIncompleteEarly || noCosts) ? Math.round(price * 0.35) : contrib

  // Mix-weighted margin
  const HS_FRACTION_MAP: Record<string, number> = {
    'Mostly high strength — over 70% is C35 and above': 0.75,
    'Balanced mix — roughly equal split across strength classes': 0.45,
    'Mostly standard strength — over 70% is C20 to C30': 0.15,
    'Not sure — no visibility on production mix by strength class': 0,
  }
  const hsPremium = +(a.high_strength_price ?? 0) || 0
  const hsFraction = HS_FRACTION_MAP[a.mix_split as string] || 0
  const mixWeightedContrib = hsPremium > 0 && hsFraction > 0 ? contrib + hsPremium * hsFraction : contrib
  const mixMarginLift = Math.round((mixWeightedContrib - contrib) * 100) / 100

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

  // Seasonal factor — applied to monthly loss calculations when season = 'summer'
  // Prevents turnaroundLeakMonthly and capLeakMonthly from using full annual opD/12
  // when the plant is known to run at reduced capacity in summer.
  const isSummer = meta?.season === 'summer'
  const SUMMER_PROD_DROP_MAP: Record<string, number> = {
    'Under 10% — minimal seasonal impact': 0.95,
    '10 to 20% — moderate drop': 0.85,
    '20 to 35% — significant summer slowdown': 0.72,
    'Over 35% — severe seasonal reduction': 0.60,
    'Not sure — no seasonal comparison available': 0.80,
  }
  const seasonalFactor = isSummer && a.summer_prod_drop
    ? (SUMMER_PROD_DROP_MAP[a.summer_prod_drop as string] ?? 1.0)
    : 1.0

  const capLeakMonthly = Math.round(unusedCapAnnual * contribSafe / 12 * seasonalFactor)

  // Fleet
  const trucks = +(a.n_trucks ?? 0) || 0
  const TURNAROUND_MAP: Record<string, number> = {
    'Under 80 minutes — benchmark performance': 72,
    '80 to 100 minutes — acceptable':           90,
    '100 to 125 minutes — slow':                112,
    'Over 125 minutes — critical bottleneck':   140,
  }
  const taRaw = a.turnaround as string
  const ta = TURNAROUND_MAP[taRaw] ?? (+(taRaw ?? 0) || 0) // legacy numeric answers still work
  const mixCap = +(a.mixer_capacity ?? 0) || 7
  const delDay = +(a.deliveries_day ?? 0) || 0

  // Derive effective load per trip from actual production ÷ actual monthly deliveries.
  // Captures partial loads and mixed-fleet averaging automatically.
  // Falls back to mixer_capacity (or default 7 m³) if data is unavailable.
  const monthlyDels = delDay > 0 ? delDay * workingDaysMonth : 0
  const derivedMixCap = monthlyDels > 0 && monthlyM3 > 0
    ? Math.min(12, Math.max(3, monthlyM3 / monthlyDels))
    : 0
  const effectiveMixCap = derivedMixCap > 0 ? derivedMixCap : mixCap
  const DELIVERY_RADIUS_MAP: Record<string, number> = {
    'Most deliveries under 5 km — dense urban core':       4,
    'Most deliveries 5 to 12 km — city radius':            8.5,
    'Most deliveries 12 to 20 km — suburban / outer city': 16,
    'Many deliveries over 20 km — regional':               25,
  }
  const radiusRaw = a.delivery_radius as string
  const radius = DELIVERY_RADIUS_MAP[radiusRaw] ?? (+(radiusRaw ?? 0) || 0) // fallback for legacy numeric
  const TARGET_TA = calcTargetTA(radius)

  const truckAvail = +(a.truck_availability ?? 0) || 0
  const availRate = truckAvail > 0 && trucks > 0 ? Math.min(1, truckAvail / trucks) : 1
  const operativeTrucks = truckAvail > 0 ? truckAvail : trucks
  const qualifiedDrivers = +(a.qualified_drivers ?? 0) || 0
  const effectiveUnits = qualifiedDrivers > 0 ? Math.min(operativeTrucks, qualifiedDrivers) : operativeTrucks
  const driverConstrained = qualifiedDrivers > 0 && qualifiedDrivers < operativeTrucks * 0.85

  const maxDelDay = effectiveUnits > 0 && ta > 0 ? Math.floor(effectiveUnits * (opH * 60 / ta)) : 0
  const realisticMaxDel = effectiveUnits > 0 ? Math.floor(effectiveUnits * (opH * 60 / TARGET_TA) * fleetUtilFactorFrac) : 0
  const rawHidden = Math.max(0, realisticMaxDel - delDay)
  const hiddenSuspect = operativeTrucks > 0 && rawHidden > operativeTrucks * 3
  const hiddenDel = rawHidden
  const hiddenConfidence: 'high' | 'low' = hiddenSuspect ? 'low' : 'high'
  const hiddenRevMonthly = Math.round(hiddenDel * effectiveMixCap * contribSafe * (opD / 12))
  const excessMin = Math.max(0, ta - TARGET_TA)
  const turnaroundLeakMonthly = ta > 0 && effectiveUnits > 0
    ? Math.round(excessMin / ta * realisticMaxDel * effectiveMixCap * contribSafe * (opD / 12) * seasonalFactor)
    : 0

  // Fuel (needed before turnaroundLeakMonthlyCostOnly)
  const fuelPerDel = +(a.fuel_per_delivery ?? 0) || 0

  // Cost-only version of turnaround leak — used when plant is demand-constrained.
  // Improving turnaround won't fill extra delivery slots (no demand), so the saving
  // is operational only: fuel not burned idling on site + a variable overhead allowance.
  // Uses max(fuelPerDel, 15% of contribSafe) as a conservative per-delivery variable cost.
  const variableCostPerDel = Math.max(fuelPerDel || 0, contribSafe * 0.15)
  const turnaroundLeakMonthlyCostOnly = ta > 0 && effectiveUnits > 0
    ? Math.round(excessMin / ta * realisticMaxDel * variableCostPerDel * (opD / 12) * seasonalFactor)
    : 0

  // Per-minute coefficient: cost of each excess turnaround minute, independent of excessMin
  // Used by GPS section to compute dollar impact from GPS-measured turnaround
  const perMinTACoeff = ta > 0 && realisticMaxDel > 0
    ? Math.round(realisticMaxDel * effectiveMixCap * contribSafe * (opD / 12) * seasonalFactor / ta)
    : 0
  const fuelPerM3 = fuelPerDel > 0 && effectiveMixCap > 0 ? fuelPerDel / effectiveMixCap : 0
  const fuelMonthly = fuelPerDel > 0 && delDay > 0 ? Math.round(fuelPerDel * delDay * (opD / 12)) : 0
  const fuelMarginImpact = fuelPerM3 > 0 && contrib > 0 ? fuelPerM3 / contrib : 0

  // Typical month flag
  const atypicalMonth = !!(a.typical_month &&
    a.typical_month !== 'Yes — normal month, representative of typical operations' &&
    a.typical_month !== 'Partially — one or two unusual weeks but broadly typical')

  // Water cost + fuel-adjusted contribution
  const waterCost = +(a.water_cost ?? 0) || 0
  const contribFuelAdj = Math.max(0, contrib - (fuelPerM3 > 0 ? fuelPerM3 : 0) - waterCost)

  // Batch calibration cost exposure
  const calibrationExposure = (
    (a.batch_calibration === 'More than 2 years ago' || a.batch_calibration === 'Never calibrated — original factory settings only') &&
    (+(a.cement_cost ?? 0) || 0) > 0 && monthlyM3 > 0
  ) ? Math.round(+(a.cement_cost ?? 0) * 0.05 * monthlyM3) : 0

  // Partial load analysis
  const partialLoad = +(a.partial_load_size ?? 0) || 0
  const partialRatio = partialLoad > 0 && mixCap > 0 ? partialLoad / mixCap : 1
  const partialLeakMonthly = (partialLoad > 0 && partialLoad < mixCap * 0.80 && delDay > 0 && contribSafe > 0)
    ? Math.round((mixCap - partialLoad) * delDay * contribSafe * (opD / 12)) : 0

  // Surplus concrete waste
  const SURPLUS_MID_MAP: Record<string, number> = {
    'Under 0.2 m³ — minimal waste': 0.1,
    '0.2 to 0.5 m³ — moderate': 0.35,
    '0.5 to 1.0 m³ — significant': 0.75,
    'Over 1.0 m³ — serious problem': 1.2,
  }
  const surplusMid = SURPLUS_MID_MAP[a.surplus_concrete as string] || 0
  // Surplus loss = wasted raw material cost (not selling price — concrete was never sold)
  const materialCost = Math.max(0, price - contrib)
  const surplusLeakMonthly = surplusMid > 0 && delDay > 0 && materialCost > 0
    ? Math.round(surplusMid * delDay * materialCost * (opD / 12)) : 0

  // Turnaround breakdown — detailed component split (from new breakdown questions)
  const siteWait = +(a.site_wait_time ?? 0) || 0
  const WASHOUT_MID_MAP: Record<string, number> = {
    'Under 10 minutes — fast': 7,
    '10 to 20 minutes — standard': 15,
    '20 to 30 minutes — slow': 25,
    'Over 30 minutes — significant bottleneck': 35,
  }
  const washoutMin = WASHOUT_MID_MAP[a.washout_time as string] || 0
  const transitEst = radius > 0 ? Math.round(radius * 2 * 1.5) : 0
  const taExplained = siteWait + washoutMin + transitEst
  const taUnexplained = ta > 0 && taExplained > 0 ? Math.max(0, ta - taExplained) : 0

  // Detailed breakdown from new questions (optional — all null if not answered)
  const taTransitMin   = +(a.ta_transit_min ?? 0) || null
  const taSiteWaitMin  = +(a.ta_site_wait_min ?? 0) || null
  const taUnloadMin    = +(a.ta_unload_min ?? 0) || null
  const taWashoutMin   = +(a.ta_washout_return_min ?? 0) || null
  // Sum of entered components — used to validate against reported turnaround
  const taBreakdownSum = (taTransitMin ?? 0) + (taSiteWaitMin ?? 0) + (taUnloadMin ?? 0) + (taWashoutMin ?? 0)
  const taBreakdownEntered = taTransitMin !== null || taSiteWaitMin !== null || taUnloadMin !== null || taWashoutMin !== null
  // Site wait benchmark: 35 min. Each minute over 35 on site = opportunity for demurrage recovery.
  const SITE_WAIT_BENCHMARK = 35
  const WASHOUT_BENCHMARK = 12
  const siteWaitExcess = taSiteWaitMin !== null ? Math.max(0, taSiteWaitMin - SITE_WAIT_BENCHMARK) : 0
  const washoutExcess  = taWashoutMin !== null  ? Math.max(0, taWashoutMin  - WASHOUT_BENCHMARK)   : 0

  // Demand context — must be computed before reject leak (gates opportunity cost)
  const dsAnswer = a.demand_sufficient as string | undefined
  const demandSufficient: boolean | null =
    dsAnswer === 'Operations — we have more demand than we can currently produce or deliver' ||
    dsAnswer === 'Both — we could sell more, and operations are also holding us back' ? true :
    dsAnswer === 'Demand — our volume reflects available orders, not operational limits' ? false :
    null

  // Reject leak — two components:
  // 1. Material loss: cement + aggregates + admixtures wasted on every rejected load (adjusted by liability)
  // 2. Opportunity cost: each rejected load is a wasted truck cycle — if demand is sufficient,
  //    that cycle could have generated contribution margin. Not applied when demand-constrained.
  const rejectPct = Math.min(100, Math.max(0, +(a.reject_pct ?? 0) || 0))
  const liab = LIABILITY_MAP[a.return_liability as string] || { factor: 1, base: 'price' }
  // When base === 'materials', use actual material cost; fall back to contribSafe if not entered
  const rejectBase = liab.base === 'materials'
    ? (cement + agg + admix > 0 ? cement + agg + admix : contribSafe)
    : price
  const rejectMaterialLoss = Math.round(rejectPct / 100 * delDay * effectiveMixCap * rejectBase * liab.factor * (opD / 12))
  const rejectOpportunityCost = demandSufficient === true
    ? Math.round(rejectPct / 100 * delDay * effectiveMixCap * contribSafe * (opD / 12))
    : 0
  const rejectLeakMonthly = rejectMaterialLoss + rejectOpportunityCost

  // Rejection causation split — plant-side vs customer/site-side
  const REJECT_SPLIT_MAP: Record<string, number> = {
    'Mostly plant-side — batching, dosing, or mix quality (<25% site/customer)': 0.80,
    'Roughly equal — both plant and site contribute':                             0.50,
    'Mostly site/customer — pump delays, unreadiness, or contractor refusal (>50%)': 0.25,
    'Not tracked — unknown':                                                      0.50,
  }
  const rejectPlantFraction    = REJECT_SPLIT_MAP[a.reject_cause_split as string] ?? 0.50
  const rejectPlantSideLoss    = Math.round(rejectLeakMonthly * rejectPlantFraction)
  const rejectCustomerSideLoss = Math.round(rejectLeakMonthly * (1 - rejectPlantFraction))

  // Demurrage opportunity
  const demurrageOpportunity = (siteWait > 45 && (
    a.demurrage_policy === 'Clause exists but rarely enforced' ||
    a.demurrage_policy === 'No demurrage charge in contracts' ||
    a.demurrage_policy === 'Not sure'
  )) && ta > 0 ? Math.round(Math.max(0, siteWait - 40) / ta * realisticMaxDel * effectiveMixCap * contribSafe * (opD / 12)) : 0

  // Truck breakdown cost estimate
  const truckBreakdowns = +(a.truck_breakdowns ?? 0) || 0
  // Each breakdown takes ~half a day → loses 0.5 × (deliveries per truck per day) deliveries
  const breakdownCostMonthly = truckBreakdowns > 0 && operativeTrucks > 0
    ? Math.round(truckBreakdowns * 0.5 * (delDay / operativeTrucks) * effectiveMixCap * contribSafe) : 0

  // Customer concentration risk
  const topCustPct = +(a.top_customer_pct ?? 0) || 0
  const concentrationRisk = topCustPct > 0 ? Math.round(topCustPct / 100 * delDay * effectiveMixCap * price * (opD / 12)) : 0

  // Cement optimisation opportunity
  const cementOptOpp = (
    (a.mix_design_review === 'More than 3 years ago' || a.mix_design_review === 'Never formally reviewed — original designs still in use') &&
    (a.admix_strategy === 'Workability only — admixtures used to improve flow and placement' || a.admix_strategy === 'Admixtures not used') &&
    (+(a.cement_cost ?? 0) || 0) > 0 && monthlyM3 > 0
  ) ? Math.round(+(a.cement_cost ?? 0) * 0.08 * monthlyM3) : 0

  // ── Scores ─────────────────────────────────────────────────────────────────

  const confWeight = CONF_WEIGHT[a.prod_data_source as string] ?? 1

  // Production score
  let utilScore: number | null = actual > 0 ? Math.max(0, Math.min(100, Math.round(util / utilisationTargetFrac * 100))) : null
  if (utilScore !== null) {
    const batchPenalty = BATCH_CYCLE_PENALTY[a.batch_cycle as string] ?? 0
    utilScore = Math.max(0, utilScore - batchPenalty)
    const stopsPenalty = STOPS_PENALTY[a.stops_freq as string] ?? 0
    utilScore = Math.max(0, utilScore - stopsPenalty)
    utilScore = Math.round(utilScore * confWeight)
  }

  // Summer adjustment
  let summerAdjusted = false
  if (isSummer && a.summer_prod_drop && utilScore !== null) {
    const dropMap: Record<string, number> = {
      'Under 10% — minimal seasonal impact': 0.95,
      '10 to 20% — moderate drop': 0.85,
      '20 to 35% — significant summer slowdown': 0.72,
      'Over 35% — severe seasonal reduction': 0.60,
      'Not sure — no seasonal comparison available': 0.80,
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
  // Logistics requires turnaround to be answered (50% weight — most critical input)
  const logisticsScore = taScore !== null ? weightedAvg([
    { v: taScore, w: 0.50 },
    { v: availScore, w: 0.25 },
    { v: driverScore, w: 0.15 },
    { v: washoutScore, w: 0.10 },
  ]) : null

  // Quality score — rejectScore only when reject_pct is explicitly answered (0 is a valid answer, but blank is not)
  const rejectAnswered = a.reject_pct != null && String(a.reject_pct).trim() !== ''
  const rejectScore = rejectAnswered ? Math.max(0, Math.min(100, Math.round(100 - rejectPct * 12))) : null
  const qcScore = QC_MAP[a.quality_control as string] ?? null
  const calibScore = CALIB_MAP[a.batch_calibration as string] ?? null
  const surplusScore = SURPLUS_SCORE_MAP[a.surplus_concrete as string] ?? null
  const qualityScore = weightedAvg([
    { v: rejectScore, w: 0.50 },
    { v: qcScore, w: 0.25 },
    { v: calibScore, w: 0.15 },
    { v: surplusScore, w: 0.10 },
  ])

  // Data period mismatch penalty
  const daysMismatch = a.data_days_match as string
  const daysMismatchPenalty = daysMismatch === 'Mostly — one or two figures from a different period' ? 0.95
    : daysMismatch === 'No — figures come from different time periods' ? 0.85 : 1

  // Overall + bottleneck
  const valid = [utilScore, dispScore, logisticsScore, qualityScore].filter((v) => v !== null) as number[]
  const overall = valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null
  let bottleneck: string | null = null
  if (valid.length >= 2) {
    const scores: Record<string, number | null> = { Production: utilScore, Dispatch: dispScore, Fleet: logisticsScore, Quality: qualityScore }
    const validScores = Object.entries(scores).filter(([, v]) => v !== null) as [string, number][]
    const mn = Math.min(...validScores.map(([, v]) => v))
    const worst = validScores.find(([, v]) => v === mn)
    bottleneck = worst ? worst[0] : null
  }

  // Warnings
  const warnings: string[] = []
  if (cap > 0 && actual > cap * 1.1) warnings.push('Production rate exceeds designed plant capacity by >10% — check actual_prod or plant_cap.')
  if (delDay > 0 && mixCap > 0 && workingDaysMonth > 0 && monthlyM3 > 0 && delDay * mixCap * workingDaysMonth > monthlyM3 * 1.3) {
    warnings.push('Delivery count suggests higher volume than reported production — check deliveries_day or actual_prod.')
  }
  if (ta > 0 && radius > 0 && ta < radius * 3) warnings.push('Turnaround time is shorter than estimated transit time — check turnaround or delivery_radius.')
  // Turnaround / deliveries_day consistency check.
  // Theoretical max = trucks × (opH × 60 / ta). If entered delDay is >30% below theoretical,
  // one of the two figures is wrong — this invalidates turnaround-based loss calculations.
  if (ta > 0 && trucks > 0 && opH > 0 && delDay > 0) {
    const theoreticalDel = Math.floor(trucks * (opH * 60 / ta))
    const gap = (theoreticalDel - delDay) / theoreticalDel
    if (gap > 0.30) {
      warnings.push(
        `Data inconsistency: ${trucks} trucks × ${opH}h × 60 ÷ ${ta} min turnaround = ${theoreticalDel} theoretical deliveries/day, but ${delDay} entered (${Math.round(gap * 100)}% below). ` +
        `Either turnaround is understated or deliveries_day is understated. Verify both before presenting financials.`
      )
    }
  }
  if (workingDaysMonth > 0 && opD > 0 && workingDaysMonth > opD / 12 * 1.3) warnings.push('Working days this month exceeds annual average by >30% — check working_days_month or op_days.')

  const materialCostPerM3 = cement + agg + admix

  return {
    // Economics
    contrib, contribSafe, materialCostPerM3, contribFuelAdj, marginRatio, marginIncomplete, contribNegative,
    // Demand context
    demandSufficient,
    // Override-aware targets (exposed for display in assumptions panel)
    utilisationTarget: utilisationTargetPct,
    fleetUtilFactor: fleetUtilFactorPct,
    mixWeightedContrib, mixMarginLift, hsPremium, hsFraction, waterCost,
    // Production
    util, unusedCapAnnual, capLeakMonthly, actual, monthlyM3, cap, opH, opD, workingDaysMonth,
    // Fleet
    ta, trucks, operativeTrucks, availRate, qualifiedDrivers, effectiveUnits, driverConstrained,
    delDay, mixCap, effectiveMixCap, radius, TARGET_TA, maxDelDay, realisticMaxDel, excessMin,
    hiddenDel, hiddenRevMonthly, hiddenSuspect, hiddenConfidence, turnaroundLeakMonthly, turnaroundLeakMonthlyCostOnly, perMinTACoeff,
    // Turnaround breakdown (legacy fields)
    siteWait, washoutMin, transitEst, taUnexplained,
    // Turnaround breakdown (detailed — from breakdown questions)
    taTransitMin, taSiteWaitMin, taUnloadMin, taWashoutMin,
    taBreakdownSum, taBreakdownEntered, siteWaitExcess, washoutExcess,
    // Reject & quality
    rejectPct, rejectLeakMonthly, rejectMaterialLoss, rejectOpportunityCost,
    rejectPlantFraction, rejectPlantSideLoss, rejectCustomerSideLoss,
    // Financial leaks
    partialLoad, partialRatio, partialLeakMonthly,
    surplusMid, surplusLeakMonthly,
    demurrageOpportunity, truckBreakdowns, breakdownCostMonthly,
    topCustPct, concentrationRisk, cementOptOpp, calibrationExposure,
    fuelPerDel, fuelPerM3, fuelMonthly, fuelMarginImpact,
    // Flags
    atypicalMonth, isSummer, summerAdjusted, seasonalFactor, daysMismatchPenalty,
    // Scores
    scores: { prod: utilScore, dispatch: dispScore, fleet: logisticsScore, logistics: logisticsScore, quality: qualityScore },
    overall, bottleneck, price,
    dispatchMin: DISPATCH_MIN_MAP[a.order_to_dispatch as string] ?? null,
    warnings,
  }
}

// ── Data Confidence ──────────────────────────────────────────────────────────

export interface DataConfidence {
  pct: number
  level: 'high' | 'medium' | 'low' | 'very-low'
  label: string
  sourceW: number | null
  freshW: number | null
  obsW: number | null
  crossW: number | null
  selfCap: number | null
}

const SOURCE_WEIGHT: Record<string, number> = {
  'System records — read from batch computer or dispatch system': 1.0,
  'Calculated from monthly reports or delivery tickets': 0.90,
  'Estimated by plant manager or dispatcher': 0.70,
  'Rough estimates — not based on records': 0.60,
}
const FRESHNESS_WEIGHT: Record<string, number> = {
  "Today's operation — figures from this visit": 1.0,
  'This week — within the last 7 days': 0.95,
  'This month — within the last 30 days': 0.85,
  'Older or unsure': 0.70,
}
const OBS_WEIGHT: Record<string, number> = {
  'Seen on screen — batch computer, dispatch system, or printout': 1.0,
  'Seen on paper — delivery tickets, reports, or invoices': 0.95,
  'Told verbally — by plant manager or dispatcher': 0.75,
  'Mix of observed and verbal': 0.85,
}
const CROSS_WEIGHT: Record<string, number> = {
  'Yes — two or more independent sources confirmed the same figure': 1.0,
  'Partially — one or two figures cross-checked': 0.90,
  'No — single source for all figures': 0.80,
  'Not possible — no second source available': 0.80,
}
const SELF_CAP: Record<string, number> = {
  'High — I would present these to the plant owner without hesitation': 1.0,
  "Medium — reasonable but I'd verify one or two before presenting": 0.85,
  'Low — significant uncertainty, treat dollar figures as directional only': 0.65,
  'Very low — data quality was poor, findings are indicative only': 0.50,
}

export function calcDataConfidence(answers: Answers): DataConfidence | null {
  const a = answers
  const sourceW = SOURCE_WEIGHT[a.prod_data_source as string] ?? null
  const freshW = FRESHNESS_WEIGHT[a.data_freshness as string] ?? null
  const obsW = OBS_WEIGHT[a.data_observed as string] ?? null
  const crossW = CROSS_WEIGHT[a.data_crosscheck as string] ?? null
  const selfCap = SELF_CAP[a.data_confidence_self as string] ?? null

  const weights = [sourceW, freshW, obsW, crossW].filter((v): v is number => v !== null)
  if (!weights.length) return null
  let raw = weights.reduce((s, v) => s + v, 0) / weights.length
  if (selfCap !== null) raw = Math.min(raw, selfCap)
  const pct = Math.round(raw * 100)
  const level: DataConfidence['level'] = pct >= 90 ? 'high' : pct >= 75 ? 'medium' : pct >= 60 ? 'low' : 'very-low'
  const label = pct >= 90 ? 'High confidence' : pct >= 75 ? 'Medium confidence' : pct >= 60 ? 'Low confidence' : 'Very low confidence'
  return { pct, level, label, sourceW, freshW, obsW, crossW, selfCap }
}

export interface KpiConfidence {
  dispatch: { pct: number; label: string } | null
  prod: { pct: number; label: string } | null
  fleet: { pct: number; label: string } | null
}

export function calcKpiConfidence(answers: Answers): KpiConfidence {
  const dc = calcDataConfidence(answers)
  if (!dc) return { dispatch: null, prod: null, fleet: null }

  const s = dc.sourceW || 0.75
  const f = dc.freshW || 0.85
  const o = dc.obsW || 0.80
  const c = dc.crossW || 0.80
  const cap = dc.selfCap || 1.0

  const dispPct = Math.round(Math.min((o * 0.45) + (c * 0.25) + (s * 0.15) + (f * 0.15), cap) * 100)
  const prodPct = Math.round(Math.min((s * 0.40) + (f * 0.30) + (o * 0.20) + (c * 0.10), cap) * 100)
  const fleetPct = Math.round(Math.min((o * 0.35) + (s * 0.30) + (c * 0.20) + (f * 0.15), cap) * 100)

  const band = (p: number) => p >= 85 ? 'Reliable' : p >= 70 ? 'Acceptable' : 'Low — treat score as indicative'
  return {
    dispatch: { pct: dispPct, label: band(dispPct) },
    prod: { pct: prodPct, label: band(prodPct) },
    fleet: { pct: fleetPct, label: band(fleetPct) },
  }
}

export interface ConsistencyFlag {
  sev: 'red' | 'amber'
  msg: string
}

export function calcConsistency(result: CalcResult, answers: Answers): ConsistencyFlag[] {
  const r = result
  const a = answers
  const flags: ConsistencyFlag[] = []

  if (r.ta > 0 && r.trucks > 0 && r.opH > 0 && r.delDay > 0) {
    const theoMax = Math.floor(r.trucks * (r.opH * 60 / r.ta))
    if (r.delDay > theoMax)
      flags.push({ sev: 'red', msg: `Deliveries/day (${r.delDay}) exceeds the theoretical maximum (${theoMax}) for ${r.trucks} trucks at ${r.ta} min turnaround. One of these figures is likely wrong.` })
  }

  if (r.util > 0.88 && (a.batch_cycle === 'Slow — 7 to 10 min' || a.batch_cycle === 'Very slow — over 10 min'))
    flags.push({ sev: 'amber', msg: `Utilisation ${Math.round(r.util * 100)}% is high but batch cycle is reported as slow. High-utilisation plants need fast batch cycles — verify both figures.` })

  if (r.util > 0.85 && a.stops_freq === 'More than 5 stops')
    flags.push({ sev: 'amber', msg: `Utilisation ${Math.round(r.util * 100)}% is high but more than 5 unplanned stops are reported per day. Frequent stops typically suppress utilisation below 75%.` })

  if (r.contrib > 50 && (!a.aggregate_cost || +(a.aggregate_cost) === 0))
    flags.push({ sev: 'amber', msg: `Contribution margin $${Math.round(r.contrib)}/m³ is very high. Aggregate and admixture costs may not be included — actual margin is likely $12–20/m³ lower.` })

  if (r.radius > 0 && r.radius < 10 && r.ta > 90)
    flags.push({ sev: 'amber', msg: `Delivery radius is ${r.radius} km but turnaround is ${r.ta} min — the target for this radius is ${r.TARGET_TA} min. This suggests significant non-travel delays: site waiting or plant queuing.` })

  if (r.hiddenSuspect)
    flags.push({ sev: 'red', msg: 'Hidden delivery gap is unusually large relative to fleet size. Verify that turnaround time, operating hours, and daily deliveries are from the same time period.' })

  if (r.rejectPct > 5 && a.quality_control === 'Both logged every batch — enforced strictly')
    flags.push({ sev: 'amber', msg: `Reject rate ${r.rejectPct}% is high but quality control is reported as consistently applied. Above 3% with full QC usually indicates a mix design or water-cement ratio problem — not a process gap.` })

  if (r.monthlyM3 > 0 && r.cap > 0 && r.opH > 0) {
    const thMax = r.cap * r.opH * (r.opD / 12)
    if (r.monthlyM3 > thMax * 1.05)
      flags.push({ sev: 'red', msg: `Monthly production (${r.monthlyM3.toLocaleString()} m³) exceeds the theoretical maximum (${Math.round(thMax).toLocaleString()} m³) based on capacity × hours × days. Verify these figures are consistent.` })
  }

  return flags
}

// ── Scenario Simulator ───────────────────────────────────────────────────────

export function simCalc(baseline: SimBaseline, scenario: SimScenario): SimResult {
  const { cap, opH, opD, mixCap, TARGET_TA } = baseline
  const { turnaround: sTA, trucks: sTrucks, price: sPrice, otd: sOTD } = scenario

  // Variable costs from baseline
  const bVarCosts = baseline.price - baseline.contrib

  // Plant max daily capacity (best-practice ceiling: 92% of nameplate)
  const plantMaxDaily = cap * 0.92 * opH
  const prodDaily = plantMaxDaily

  // Fleet-limited daily capacity
  const delsPerTruck = sTA > 0 ? (opH * 60 / sTA) : 0
  const totalDels = delsPerTruck * sTrucks
  const fleetDaily = totalDels * mixCap

  // Dispatch efficiency from order-to-dispatch time
  const dispEff = Math.max(0.40, Math.min(0.98, 1 - (sOTD / 100)))
  const effFleetDaily = fleetDaily * dispEff

  // Scenario output = min of plant and fleet constraints
  const scenarioDaily = Math.min(plantMaxDaily, effFleetDaily)
  const scenarioAnnual = Math.round(scenarioDaily * opD)

  // Derived utilisation — what plant + fleet together actually produce
  const sUtil = cap > 0 && opH > 0 ? Math.round((scenarioDaily / (cap * opH)) * 100) : 0

  // Bottleneck
  const scenarioBottleneck = plantMaxDaily <= effFleetDaily ? 'Production' : 'Fleet / Logistics'

  // Contribution recalculated when price changes
  const sContrib = Math.max(0, sPrice - bVarCosts)

  // Baseline annual volume — same 92% ceiling, same opH
  const bProdDaily = cap * 0.92 * opH
  const bDelsPerTruck = baseline.turnaround > 0 ? (opH * 60 / baseline.turnaround) : 0
  const bFleetDaily = bDelsPerTruck * baseline.trucks * mixCap
  const bDispEff = Math.max(0.40, Math.min(0.98, 1 - (baseline.dispatchMin / 100)))
  const bEffFleetDaily = bFleetDaily * bDispEff
  const bBaselineDaily = Math.min(bProdDaily, bEffFleetDaily)
  const bAnnualVol = Math.round(bBaselineDaily * opD)

  const deltaVol = scenarioAnnual - bAnnualVol
  // Revenue and contribution impact = total scenario earnings minus total baseline earnings
  // This captures both volume change AND price change on all volume
  const revenueUpside = Math.round(scenarioAnnual * sPrice - bAnnualVol * baseline.price)
  const contribUpside = Math.round(scenarioAnnual * sContrib - bAnnualVol * baseline.contrib)

  // Scores
  const sProdScore = Math.max(0, Math.min(100, Math.round((sUtil / 92) * 100)))
  const taRatio = TARGET_TA > 0 ? sTA / TARGET_TA : 1
  const sFleetScore = Math.max(0, Math.min(100, Math.round(taRatio <= 1 ? 100 : 100 - ((taRatio - 1) * 120))))
  const sDispScore = Math.max(0, Math.min(100, Math.round(100 - sOTD * 1.4)))

  // maxUtilPct: the utilisation % the current fleet configuration can support.
  // Expressed as % of plant capacity (cap × opH), not as % of the 92% target.
  // < sUtil → fleet is the binding constraint (amber warning)
  // > sUtil → fleet has headroom above current utilisation (green prompt to raise slider)
  // Capped at 99 to avoid showing "100%" which implies no constraint at all
  const maxUtilPct = cap > 0 && opH > 0
    ? Math.min(99, Math.round((effFleetDaily / (cap * opH)) * 100))
    : sUtil

  return {
    scenarioAnnual, deltaVol, revenueUpside, contribUpside, scenarioBottleneck,
    prodDaily, effFleetDaily, sProdScore, sFleetScore, sDispScore, sContrib, dispEff, maxUtilPct, sUtil,
  }
}
