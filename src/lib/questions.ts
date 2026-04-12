/**
 * alRMX Assessment Question Definitions
 * Single source of truth for all assessment questions, sections, and validation rules.
 * Extracted from assessment-tool.html, this file is now authoritative.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuestionInfo {
  what: string
  why: string
  calc: string
}

export interface Question {
  id: string
  label: string
  hint?: string
  field?: string
  howto?: string
  type: 'num' | 'opts' | 'text'
  opts?: string[]
  unit?: string
  req?: boolean
  info?: QuestionInfo
}

export interface Section {
  id: string
  label: string
  qs: Question[]
}

export interface CoreBlock {
  id: string
  label: string
  ids: string[]
}

export type NumRule = [min: number, max: number, warning: string]

// ── Sections ─────────────────────────────────────────────────────────────────

export const SECTIONS: Section[] = [
  {
    id: 'economics',
    label: '1. Prices & costs',
    qs: [
      {
        id: 'price_m3',
        label: 'What is your standard selling price per cubic metre (m³) of concrete?',
        hint: '1 m³ ≈ one full standard mixer load. Use your normal list price to a regular contractor, not a special discount rate.',
        field: 'Check a recent invoice on screen to confirm the price.',
        howto: 'Ask to see the most recent delivery invoice on their computer or phone. The price per m³ is usually printed on the invoice. If they quote from memory, ask to verify it on screen, plant managers often quote their best price, not their average.',
        type: 'num',
        unit: 'USD / m³',
        req: true,
        info: {
          what: 'Revenue earned per m³ of concrete delivered.',
          why: 'Every margin figure in this report is built on this number.',
          calc: 'Contribution margin ($/m³) = price − cement − aggregates − admixtures. Example: $65 − $32 − $11 − $4 = $18/m³. Every dollar figure in this report is derived from this margin multiplied by volume and operating days.',
        },
      },
      {
        id: 'cement_cost',
        label: 'How much does cement cost per cubic metre of concrete produced?',
        hint: 'Calculate: cement price per tonne × kg used per m³ ÷ 1,000. Example: 320 kg/m³ at $120/tonne = $38.40/m³.',
        field: 'Check most recent cement delivery invoice for price per tonne.',
        howto: 'Ask for the most recent cement delivery note or invoice. Find the price per tonne and the kg/m³ specification on their mix design sheet. If they cannot find either, ask the batch plant operator, they typically know the mix design from memory. Calculate: (kg per m³ ÷ 1,000) × price per tonne.',
        type: 'num',
        unit: 'USD / m³',
        req: true,
        info: {
          what: 'Cost of cement per m³ of finished concrete.',
          why: 'Cement is 60–75% of total variable material cost. Without it the margin calculation is incomplete.',
          calc: 'Contribution margin = price − cement − aggregates − admixtures. To convert from tonne price: (kg per m³ ÷ 1,000) × price per tonne. Example: 320 kg at $120/t = $38.40/m³.',
        },
      },
      {
        id: 'aggregate_cost',
        label: 'What do sand and aggregates cost per cubic metre? (optional, leave blank if unknown)',
        hint: 'All types combined: sand, gravel, crushed stone. System will estimate from regional averages if blank.',
        howto: 'Ask for the most recent aggregate delivery invoice. Find the price per tonne for each type (sand, gravel, crushed stone) and ask the batch plant operator how many kg of each they use per m³ from their mix design. Calculate: (kg ÷ 1,000) × price per tonne for each, then sum. If they cannot find the mix design, ask the batch plant operator, they typically know the quantities from memory.',
        type: 'num',
        unit: 'USD / m³',
        info: {
          what: 'Combined cost of all aggregates per m³ of concrete.',
          why: 'Second largest variable cost after cement.',
          calc: 'Contribution margin = price − cement − aggregates − admixtures. If blank, the system notes margin as incomplete and warns that it is overstated. No default value is substituted, the warning prompts you to obtain the figure.',
        },
      },
      {
        id: 'admix_cost',
        label: 'What do chemical admixtures cost per cubic metre? (optional, enter 0 if none used)',
        hint: 'Plasticizers, retarders, accelerators. Retarders are important in Saudi/Bahrain heat to prevent premature hardening during transport.',
        howto: 'Ask for the most recent admixture delivery invoice. Find the price per litre or kg and ask the batch plant operator what dosage rate they use per m³. If they do not use admixtures, enter 0. If they cannot find the dosage, check the mix design sheet.',
        type: 'num',
        unit: 'USD / m³',
        info: {
          what: 'Cost of chemical additives per m³.',
          why: 'Often $3–10/m³. Missing this slightly overstates margin.',
          calc: 'Contribution margin = price − cement − aggregates − admixtures. Admixture cost is typically $3–10/m³. Enter 0 if none used. Leaving blank combined with blank aggregates triggers the margin-incomplete warning.',
        },
      },
      {
        id: 'fuel_per_delivery',
        label: 'What is the average fuel cost per concrete delivery, one round trip?',
        hint: 'Calculate: monthly diesel bill ÷ total deliveries last month. Or: litres per trip × diesel price per litre.',
        field: "Ask the workshop supervisor for last month's diesel bill. Divide by total deliveries last month.",
        howto: 'Ask the workshop supervisor or plant accountant for the total diesel expenditure last month. Divide by total deliveries last month to get cost per trip. Alternatively, ask a driver how many litres a typical round trip uses and multiply by the current diesel price. If fuel is subsidised locally, use the actual price paid, not the market rate. A typical GCC ready-mix delivery uses 8–15 litres per trip.',
        type: 'num',
        unit: 'USD per delivery',
        info: {
          what: 'Fuel cost per truck round trip.',
          why: 'Fuel is often the largest variable cost after materials, but many plants do not include it in their per-m³ cost calculation, causing margin to be systematically overstated.',
          calc: 'Fuel cost per m³ = fuel_per_delivery ÷ mixer_capacity. This is subtracted from contrib to give fuel-adjusted margin. Monthly fleet fuel cost = fuel_per_delivery × delDay × (opD÷12). If fuel cost per m³ exceeds 15% of contrib, flagged as a margin erosion finding.',
        },
      },
      {
        id: 'water_cost',
        label: 'What does water cost per cubic metre of concrete produced? (optional, enter 0 if negligible)',
        hint: 'Relevant if plant uses tanker delivery. Mains water is typically $0.50–1.50/m³ of concrete. Tanker water can reach $3–5/m³.',
        field: 'Ask the accountant, check last water delivery invoice or monthly utility bill.',
        howto: "Ask whether the plant uses mains water or tanker delivery. If tanker: find last delivery invoice, divide total cost by m³ water delivered, then multiply by mix design water content (typically 160–200 litres per m³ of concrete). If mains: find monthly water bill and divide by monthly m³ produced. Enter 0 if water cost is negligible or already included in another cost line.",
        type: 'num',
        unit: 'USD / m³',
        info: {
          what: 'Cost of water per m³ of concrete produced.',
          why: 'In Saudi Arabia and UAE, many plants rely on tanker water delivery at $3–5/m³ of water. At 180 litres per m³ of concrete, that is $0.54–$0.90/m³, a real margin item that is often invisible in cost tracking.',
          calc: 'Added directly to contrib deduction: contrib = price − cement − aggregates − admixtures − water. If water_cost > $1/m³, flagged as a margin line worth tracking separately.',
        },
      },
      {
        id: 'aggregate_days',
        label: 'How many days of sand and aggregate stock does this plant typically hold?',
        hint: 'An aggregate stoppage is as critical as a cement stoppage, but far less often tracked.',
        field: 'Walk the aggregate yard, estimate pile volume visually. Ask batch plant operator daily consumption.',
        howto: 'Walk the aggregate storage area and estimate the volume of sand and each aggregate type. Ask the batch plant operator what the daily consumption is in tonnes. Divide estimated stock by daily consumption. Cross-check: when was the last aggregate delivery and how much came in? Under 2 days is a critical supply risk, one missed delivery stops the plant just as surely as an empty cement silo.',
        type: 'opts',
        opts: [
          '10+ days, comfortable buffer',
          '5 to 10 days, adequate',
          '2 to 5 days, tight, supply-sensitive',
          'Under 2 days, high supply risk',
        ],
        info: {
          what: 'Days of sand and aggregate stock at current consumption rate.',
          why: 'Aggregate supply disruptions are as common as cement disruptions in GCC markets, especially for washed sand and crushed aggregate during peak construction seasons. Most plants track cement stock carefully but ignore aggregate stock.',
          calc: 'Qualitative risk flag, not scored. Under 2 days = red issue. 2–5 days = amber. Mirrors silo_days logic exactly. No dollar estimate, disruption cost depends on how quickly supply can be restored.',
        },
      },
      {
        id: 'op_days',
        label: 'How many days per year does this plant actually produce concrete?',
        hint: 'Start from 365. Subtract: Fridays (52), public holidays (~10), Ramadan if applicable (~20), other closures. Saudi/Bahrain plants typically operate 280–310 days/year.',
        howto: "Ask the plant manager to count backwards from 365: subtract Fridays (52), public holidays (10–12), Ramadan days if production is reduced (∼20), and any other planned shutdowns. Cross-check against last year's batch production records if available.",
        type: 'num',
        unit: 'days / year',
        req: true,
        info: {
          what: 'Actual working production days per year.',
          why: 'Every annual margin figure is multiplied by this. Off by 20 days = all annual totals are wrong.',
          calc: 'All monthly figures = annual total ÷ 12, where annual total uses this day count. Example: 300 days vs 280 days changes all annual figures by 7%. Hidden revenue = hidden deliveries × mixer cap × margin × (this ÷ 12) per month.',
        },
      },
      {
        id: 'mix_split',
        label: 'What is the approximate split of production by concrete strength class?',
        hint: 'Concrete strength is measured in MPa or by class (C20, C25, C30, C40, C50+). Higher strength classes use more cement and command higher prices, so the mix of what you produce directly affects your real margin.',
        howto: 'Ask to see the monthly production breakdown by concrete class from the batch computer or invoicing system. If not tracked by class, ask the batch plant operator which strength classes they produce most frequently. Look at the last 10 batch tickets if available.',
        type: 'opts',
        opts: [
          'Mostly standard strength, over 70% is C20 to C30',
          'Balanced mix, roughly equal split across strength classes',
          'Mostly high strength, over 70% is C35 and above',
          'Not sure, no visibility on production mix by strength class',
        ],
        info: {
          what: 'The proportion of production that is standard vs. high-strength concrete.',
          why: 'High-strength mixes (C35+) typically require 20–40% more cement per m³, but command 15–30% higher prices. A plant producing mostly C40 has a structurally different margin profile than one producing C25, even with identical turnaround times.',
          calc: 'Used with high-strength price premium to calculate blended margin. Formula: blended margin = base margin + (HS premium × HS fraction). Fractions used: >70% HS = 0.75, balanced = 0.45, >70% standard = 0.15. Monthly uplift = blended margin increase × monthly m³ produced.',
        },
      },
      {
        id: 'silo_days',
        label: 'How many days of cement stock does this plant typically hold in its silos?',
        hint: 'Ask the plant manager: "If your cement supplier stopped delivering today, how many days could you keep producing at normal volume?" Typical GCC minimum: 5 days. Less than 3 is a supply risk.',
        field: 'Check the silo level indicator or ask the batch plant operator for the last cement delivery date and volume.',
        howto: 'Ask to see the cement silo level gauge, most batch plants have a digital readout on the control panel. Ask what the current level is in tonnes, then ask what their average daily consumption is. Divide level by daily consumption to get days remaining.',
        type: 'opts',
        opts: [
          '10+ days, comfortable buffer',
          '5 to 10 days, adequate',
          '2 to 5 days, tight, supply-sensitive',
          'Under 2 days, high supply risk',
        ],
        info: {
          what: 'Days of cement stock held in silos at current production rate.',
          why: 'A single delayed cement delivery can stop a GCC plant for a full day, losing all revenue. This is a common hidden cause of unexpected downtime, especially around public holidays and during Ramadan.',
          calc: 'Qualitative risk flag only, not included in score. Under 2 days = red issue in report. 2–5 days = amber issue. 5–10 days = adequate, no flag. 10+ days = no action.',
        },
      },
      {
        id: 'material_stoppages',
        label: 'In the last 3 months, how many times did the plant stop production because cement or raw materials were not available?',
        hint: 'Ask directly: "In the last 3 months, did you ever have to stop batching because you ran out of cement or aggregates?" Even 1 day of stoppage is significant.',
        field: 'Ask the plant manager or batch operator. They will remember stoppages because they are operational crises.',
        howto: 'This is a direct question. Most plant managers will know immediately. If they say it happened, ask how many times and roughly how many total days were lost.',
        type: 'opts',
        opts: [
          'Never, no material stoppages in last 3 months',
          'Once, 1 to 2 days lost',
          '2 to 3 times, 3 to 7 days lost',
          'More than 3 times, frequent disruption',
        ],
        info: {
          what: 'How often the plant stopped due to material shortage in the last quarter.',
          why: 'Material stoppages are hidden inside the utilization gap. Without this question, we attribute all lost production to fleet or plant constraints. This separates material-driven downtime from operational inefficiency.',
          calc: 'Not scored. Estimated days mapped to context: 0 / 1.5 / 5 / 10 days per quarter. Shown as explanatory context in the report, not as a separate financial loss.',
        },
      },
      {
        id: 'ramadan_schedule',
        label: 'Does this plant adjust its dispatch schedule during Ramadan?',
        hint: 'During Ramadan, site activity typically shifts earlier (5am–11am peak) and drops sharply after noon. Plants that do not adjust dispatch schedules miss the morning peak and incur idle truck costs in the afternoon.',
        howto: "Ask the plant manager directly: 'During Ramadan, do you change your dispatch schedule to start earlier in the morning?' If yes, ask what time first dispatch is and what time last dispatch is. If no, ask whether Ramadan affects their customer demand.",
        type: 'opts',
        opts: [
          'Yes, formal early-shift schedule during Ramadan',
          'Partially, informal earlier start, no formal plan',
          'No, same schedule year-round',
          'Not applicable, plant is not in a predominantly Muslim-majority market',
        ],
        info: {
          what: 'Whether dispatch scheduling is formally adjusted for Ramadan operating patterns.',
          why: 'Unadjusted dispatch during Ramadan typically costs 15–25% of monthly revenue during the period, trucks idle when demand is high, then sent out when sites have closed for iftar.',
          calc: 'If no adjustment and country is Saudi Arabia, Bahrain, UAE, Kuwait, or Qatar: estimated Ramadan revenue loss = deliveries/day × mixer capacity × margin × 30 days × 20%.',
        },
      },
      {
        id: 'working_days_month',
        label: 'How many days did the plant actually operate last month?',
        hint: 'Count only the days the plant actually produced concrete, not calendar days. This must match the month reported in "actual production" above.',
        howto: "Ask the batch plant operator or check the dispatch log. Count the days with at least one delivery. In Ramadan months or holiday periods this number can be significantly lower than the annual average.",
        type: 'num',
        unit: 'working days',
        req: true,
        info: {
          what: 'Actual working days in the reported production month.',
          why: 'Converts monthly production volume to an accurate hourly rate. Using annual average (op_days÷12) instead of actual days can mis-state utilization by 20–30% in months with holidays or shutdowns.',
          calc: 'hours this month = op_hours × this value. Hourly rate = actual_prod ÷ hours this month. If not entered, falls back to op_days ÷ 12.',
        },
      },
      {
        id: 'high_strength_price',
        label: 'If you produce high-strength concrete (C35+), what is the price premium over standard C25? (optional)',
        hint: 'Example: C25 at $65/m³, C35 at $78/m³ → premium is $13/m³. If you do not produce C35+, leave blank.',
        howto: 'Ask to see a recent invoice for a C35+ delivery and a C25 delivery from the same period. The price difference per m³ is the premium.',
        type: 'num',
        unit: 'USD premium per m³ over C25',
        info: {
          what: 'Price uplift per m³ for high-strength concrete vs. standard C25.',
          why: 'A plant producing 30% C35+ at $12 premium = material margin improvement without any operational change.',
          calc: 'Blended margin = base margin + (this premium × HS production fraction). Fractions: mostly HS (>70%) = 0.75, balanced = 0.45, mostly standard = 0.15.',
        },
      },
      {
        id: 'typical_month',
        label: 'Was last month a typical production month for this plant?',
        hint: 'Atypical months, Ramadan, project completions, seasonal peaks, make all dollar figures misleading if not flagged.',
        howto: 'Ask the plant manager: "Was last month a normal month for you, or was it unusually busy or slow?" Then ask what made it different if not typical.',
        type: 'opts',
        opts: [
          'Yes, normal month, representative of typical operations',
          'Partially, one or two unusual weeks but broadly typical',
          'No, unusually high demand',
          'No, unusually low demand',
          'No, Ramadan or public holiday period',
        ],
        info: {
          what: 'Whether last month was representative of normal plant operations.',
          why: 'All dollar figures in this report are extrapolated from last month. A Ramadan month or a project-completion month can be 30–50% above or below normal, making every calculation misleading if not flagged.',
          calc: 'If anything other than "Yes" or "Partially": all monthly dollar figures receive an amber flag.',
        },
      },
    ],
  },
  {
    id: 'fleet',
    label: '2. Trucks & delivery',
    qs: [
      {
        id: 'n_trucks',
        label: 'How many mixer trucks are assigned to this plant?',
        hint: 'Include trucks currently out on deliveries, not just those in the yard.',
        field: 'Count from the yard, then cross-check the dispatch list for trucks on the road.',
        howto: 'Walk the yard and count trucks yourself. Then ask the dispatcher to pull up the active delivery list and count trucks currently on the road. Add the two numbers.',
        type: 'num',
        unit: 'trucks',
        req: true,
        info: {
          what: 'Total mixer trucks dedicated to this plant.',
          why: 'Fleet size is the hard ceiling on daily delivery capacity.',
          calc: 'Theoretical max deliveries/day = trucks × (op hours × 60 ÷ turnaround minutes). Realistic target = trucks × (op hours × 60 ÷ TARGET_TA) × 85% fleet utilisation.',
        },
      },
      {
        id: 'mixer_capacity',
        label: 'How many cubic metres can each truck carry per trip? (optional, default: 7 m³)',
        hint: 'The drum capacity, common sizes: 6, 7, 8, or 9 m³. Leave blank to use 7 m³ default.',
        field: 'Read from the manufacturer plate on the drum if available.',
        howto: 'Look for the drum capacity plate on each mixer truck, it is stamped on the mixer drum body or printed near the driver cab.',
        type: 'num',
        unit: 'm³ per truck',
        info: {
          what: 'Maximum volume of concrete each truck carries per trip.',
          why: '20 trucks at 6 m³ vs 8 m³ = 33% revenue difference per trip.',
          calc: 'Default: 7 m³ if blank. Hidden revenue/month = hidden deliveries × mixer capacity × contribution margin × (operating days ÷ 12).',
        },
      },
      {
        id: 'turnaround',
        label: 'How long does one complete truck trip take, from leaving the plant loaded to returning empty?',
        hint: 'Full round trip: load at plant + drive to site + wait at site + discharge concrete + drive back. Best practice for a 10–20 km radius: 75–90 minutes.',
        howto: 'Think of a typical delivery this week. From when the truck left the gate loaded, to when it returned empty, how long does that usually take?',
        type: 'opts',
        opts: [
          'Under 80 minutes, benchmark performance',
          '80 to 100 minutes, acceptable',
          '100 to 125 minutes, slow',
          'Over 125 minutes, critical bottleneck',
        ],
        req: true,
        info: {
          what: 'Total time for one complete truck cycle, loaded departure to empty return.',
          why: 'The single biggest margin lever in ready-mix. Every minute above 80 reduces daily delivery capacity.',
          calc: 'Turnaround target (TARGET_TA) = 60 + delivery radius × 1.5 minutes, clamped 65–110 min. Logistics score = 100 − (excess ÷ TARGET_TA) × 80, confidence-weighted.',
        },
      },
      // ── Turnaround breakdown (optional, used to identify which component drives excess) ──
      {
        id: 'ta_transit_min',
        label: 'Turnaround breakdown, transit time one way (to site and back combined)',
        hint: 'Sum of outbound + return driving time. Exclude waiting and unloading. For a 10 km radius: typically 25–35 min combined.',
        howto: 'Ask a driver: "How long does driving take in total, from leaving the plant to arriving on site, plus the drive back?" Exclude time on site.',
        type: 'num',
        unit: 'minutes',
        req: false,
        info: {
          what: 'Combined driving time for one round trip (to site + back), excluding site time and plant washout.',
          why: 'Transit time scales with delivery radius and traffic. It cannot be reduced without changing delivery zone or time of day. Knowing it isolates the site component.',
          calc: 'Benchmark: delivery_radius × 3 min/km. If entered transit > delivery_radius × 4, delivery zone or route density is inefficient.',
        },
      },
      {
        id: 'ta_site_wait_min',
        label: 'Turnaround breakdown, time waiting on site before unloading starts',
        hint: 'Time from truck arrival at site to start of concrete discharge. Benchmark: under 35 min. Over 45 min = demurrage territory.',
        howto: 'Ask a driver or the dispatcher: "Once the truck arrives on site, how long does it usually wait before the pump or crane is ready?" This is not unloading time, just waiting.',
        type: 'num',
        unit: 'minutes',
        req: false,
        info: {
          what: 'Average time trucks spend waiting on site before discharge begins.',
          why: 'Site waiting time is typically the single largest and most controllable component of excess turnaround. Over 35 min is recoverable through demurrage enforcement and pre-scheduling with contractors.',
          calc: 'Benchmark: 30–35 min. Each minute above 35 min is a candidate for demurrage recovery. Site wait > 45 min × percentage of deliveries = monthly demurrage exposure.',
        },
      },
      {
        id: 'ta_unload_min',
        label: 'Turnaround breakdown, unloading and pouring time on site',
        hint: 'Time from start of discharge to truck cleared and ready to leave. Typical: 20–35 min for a standard slab pour.',
        howto: 'Ask a driver: "Once the pump starts, how long until the truck is empty and ready to go?" This varies by pour type, use an average.',
        type: 'num',
        unit: 'minutes',
        req: false,
        info: {
          what: 'Average time for concrete discharge and pouring, from first discharge to truck empty.',
          why: 'Unloading time is mostly controlled by the contractor\'s pour speed. Not a lever for the plant, but useful to confirm the turnaround breakdown adds up.',
          calc: 'Benchmark: 20–30 min. Longer unloading suggests large pours or slow pump speed, not a plant issue but useful context.',
        },
      },
      {
        id: 'ta_washout_return_min',
        label: 'Turnaround breakdown, washout and weighbridge time at plant after return',
        hint: 'Time from truck arriving back at plant to ready for next load. Includes drum washout, water fill, tare weight check. Benchmark: 10–15 min.',
        howto: 'Stand at the washout bay and time 3 trucks from arrival back to departure for loading. Or ask the batch plant operator.',
        type: 'num',
        unit: 'minutes',
        req: false,
        info: {
          what: 'Time spent at plant between returning empty and being ready for the next load.',
          why: 'Washout is the most controllable at-plant component. Benchmark is 10 min. Over 18 min indicates either a slow washout bay or a weighbridge bottleneck, both fixable with procedure changes, no capital required.',
          calc: 'Each minute above 12 min × daily truck cycles × operating days = recoverable capacity. Benchmark: 10–12 min.',
        },
      },
      {
        id: 'deliveries_day',
        label: 'On average, how many concrete deliveries does this plant complete per working day?',
        hint: 'Calculate from last month: total completed deliveries ÷ working days. Monthly average is more reliable than yesterday\'s count.',
        field: 'Open dispatch or invoicing system: total deliveries last month ÷ days operated.',
        howto: 'Ask to see the dispatch log or invoicing system. Find the total number of completed deliveries for the last full calendar month. Divide by the number of days operated that month.',
        type: 'num',
        unit: 'deliveries / day',
        req: true,
        info: {
          what: 'Average completed deliveries per working day, based on last month.',
          why: 'Compared against theoretical fleet maximum to reveal hidden capacity.',
          calc: 'Realistic max deliveries = trucks × (op hours × 60 ÷ TARGET_TA) × 85% utilisation. Hidden deliveries = realistic max − actual.',
        },
      },
      {
        id: 'partial_load_size',
        label: 'On average, how many cubic metres of concrete are actually loaded per truck trip?',
        hint: 'Compare to truck capacity, a 7 m³ truck consistently loaded at 4 m³ is a 43% capacity loss per trip.',
        field: 'Check last 10 batch tickets, note the actual volume per load, not the truck capacity.',
        howto: 'Ask the batch plant operator to pull up the last 10 batch tickets. Note the actual volume batched per load, not the truck drum capacity. Calculate the average.',
        type: 'num',
        unit: 'm³ per trip',
        info: {
          what: 'Average concrete volume actually loaded per truck trip.',
          why: 'Sending a 7 m³ truck with 4 m³ costs the same in driver time, fuel, and turnaround as a full load, but earns 43% less revenue per trip.',
          calc: 'Partial load ratio = partial_load_size ÷ mixer_capacity. If ratio < 0.80: monthly margin loss = (mixer_capacity − partial_load_size) × delDay × contrib × (opD÷12).',
        },
      },
      {
        id: 'delivery_radius',
        label: 'Where do most of your concrete deliveries go?',
        hint: 'Choose based on where the majority of your deliveries are, not your furthest site. This sets the benchmark turnaround target for your plant.',
        type: 'opts',
        opts: [
          'Most deliveries under 5 km, dense urban core',
          'Most deliveries 5 to 12 km, city radius',
          'Most deliveries 12 to 20 km, suburban / outer city',
          'Many deliveries over 20 km, regional',
        ],
        info: {
          what: 'Typical one-way distance to active construction sites.',
          why: 'GCC best practice turnaround of 75–90 min assumes a 10–15 km radius. At 25 km, 90 min turnaround is excellent; at 5 km, it is a critical failure.',
          calc: 'Radius sets the turnaround target: TARGET_TA = 60 + radius × 1.5 minutes, clamped 65–110 min. Overridden by delivery_distance_km if provided.',
        },
      },
      {
        id: 'delivery_distance_km',
        label: 'What is the average one-way distance from plant to delivery sites?',
        hint: 'More precise than the delivery zone dropdown above. If you know this number, it produces a more accurate turnaround target.',
        type: 'num',
        unit: 'km',
        req: false,
        info: {
          what: 'Average one-way distance from plant gate to active construction sites.',
          why: 'The delivery zone dropdown maps to a midpoint (e.g. 12-20 km = 16 km). The actual average distance can be significantly different. This field overrides the dropdown for a more precise turnaround target.',
          calc: 'TARGET_TA = 60 + delivery_distance_km × 1.5, clamped 65-110 min. Takes precedence over delivery_radius dropdown.',
        },
      },
      {
        id: 'avg_transit_min',
        label: 'How long does it typically take a truck to drive from the plant to a delivery site? (one way)',
        hint: 'Average driving time, not including loading, waiting, or pouring. Just the drive. If known, this replaces the distance-based estimate entirely.',
        type: 'num',
        unit: 'minutes one way',
        req: false,
        info: {
          what: 'Average one-way driving time from plant to delivery site.',
          why: 'Distance-based estimates assume a speed factor (1.5 min/km) which varies enormously in GCC cities. Rush hour traffic, highway vs urban, road quality. Direct transit time is more accurate.',
          calc: 'When provided: TARGET_TA = avg_transit_min × 2 + 45 min (loading + pour + washout). Takes precedence over both delivery_radius and delivery_distance_km.',
        },
      },
      {
        id: 'truck_availability',
        label: 'On a typical working day, how many of your mixer trucks are actually available and operational?',
        hint: 'Operational = could receive a load right now. Exclude trucks in workshop, waiting for parts, or off-road.',
        field: 'Ask the workshop supervisor: how many trucks are currently off-road? Subtract from total fleet.',
        howto: 'Walk the yard and ask the workshop supervisor or senior mechanic: "How many trucks are currently off-road for repairs or waiting for parts?"',
        type: 'num',
        unit: 'trucks available',
        info: {
          what: 'Actual operative trucks on a typical working day.',
          why: 'A fleet of 12 with 3 permanently off-road has the real capacity of a 9-truck fleet.',
          calc: 'Availability rate = truck_availability ÷ n_trucks. If availability < 85%, flagged as a finding.',
        },
      },
      {
        id: 'qualified_drivers',
        label: 'How many drivers are currently available and fully licensed to operate mixer trucks?',
        hint: 'Exclude drivers on home leave, visa renewal, or without a valid heavy vehicle licence for this truck class.',
        field: 'Ask the dispatcher or workshop supervisor, not the plant manager.',
        howto: 'Ask the dispatcher or workshop supervisor: "How many drivers can take a truck out right now?"',
        type: 'num',
        unit: 'qualified drivers available',
        info: {
          what: 'Number of drivers currently available and fully licensed to operate mixer trucks.',
          why: 'In GCC ready-mix, driver availability is often the binding constraint, not trucks or plant capacity.',
          calc: 'Effective capacity ceiling = MIN(operativeTrucks, qualifiedDrivers). If qualifiedDrivers < operativeTrucks: flagged as finding.',
        },
      },
      {
        id: 'site_wait_time',
        label: 'On average, how long does a truck wait at the construction site, from arrival to completing discharge?',
        hint: 'Includes waiting for pump, foreman sign-off, and full discharge. Best practice: under 40 minutes.',
        field: 'Ask the dispatcher or a driver. Check last 5 delivery records if timestamps exist.',
        howto: 'Ask the dispatcher: "From when a truck arrives at site to when it leaves empty, how long does it typically take?"',
        type: 'num',
        unit: 'minutes at site',
        info: {
          what: 'Average time a truck spends at the construction site per delivery.',
          why: 'Site wait time is often the single largest component of turnaround, and the only part the plant cannot control directly, unless demurrage is enforced.',
          calc: 'Used to decompose turnaround: estimated transit = radius × 2 × 1.5 min/km. Site time = this figure. Washout = washout_time midpoint. Unexplained remainder = turnaround − transit − site − washout.',
        },
      },
      {
        id: 'washout_time',
        label: 'How long does the washout process take after a truck returns, from arrival at plant to ready for next load?',
        hint: 'Start: truck enters gate. Stop: driver signals ready for loading. Best practice: under 15 minutes.',
        field: 'Time the next returning truck yourself.',
        howto: 'When the next truck returns, time it yourself, start when it enters the gate, stop when the driver signals ready for loading.',
        type: 'opts',
        opts: [
          'Under 10 minutes, fast',
          '10 to 20 minutes, standard',
          '20 to 30 minutes, slow',
          'Over 30 minutes, significant bottleneck',
        ],
        info: {
          what: 'Time to clean and prepare a truck for its next load after returning.',
          why: '20-minute washout on a 10-truck fleet = over 3 hours of combined fleet idle time per day.',
          calc: 'Washout midpoints used in turnaround decomposition: <10 min = 7 min, 10–20 = 15 min, 20–30 = 25 min, >30 = 35 min.',
        },
      },
    ],
  },
  {
    id: 'capacity',
    label: '3. Production capacity',
    qs: [
      {
        id: 'plant_cap',
        label: 'What is the maximum output rate this plant was built to produce?',
        hint: "The manufacturer's rated maximum in m³/hour, not what it produces today. Written on the specification plate.",
        field: 'Find the metal spec plate on the batch plant control cabinet. Look for "Rated Capacity" or "Max Output" in m³/hr.',
        howto: 'Ask the batch plant operator to show you the control cabinet. Look for a manufacturer plate, usually on the side of the control panel.',
        type: 'num',
        unit: 'm³ / hour',
        req: true,
        info: {
          what: 'Manufacturer rated maximum output under ideal conditions.',
          why: 'The ceiling against which all actual production is measured.',
          calc: 'Average actual output (m³/hr) = monthly m³ ÷ (op hours × op days ÷ 12). Utilization = actual ÷ designed capacity.',
        },
      },
      {
        id: 'op_hours',
        label: 'How many hours per day is this plant actively producing concrete?',
        hint: 'Active hours only. Exclude prayer breaks, shift handover, cleaning, maintenance.',
        howto: 'Ask the batch plant operator what time the first batch of the day is produced and what time the last truck leaves.',
        type: 'num',
        unit: 'hours / day',
        req: true,
        info: {
          what: 'Active production hours per day.',
          why: 'Multiplier for all capacity calculations.',
          calc: 'Used as multiplier in three formulas: hourly output rate, max deliveries, and capacity gap cost.',
        },
      },
      {
        id: 'actual_prod',
        label: 'What was the total volume of concrete produced last month?',
        hint: 'The total m³ produced and dispatched last month. This is in your batch computer or invoicing system as total monthly production. Do not estimate, this number drives the entire financial analysis.',
        field: 'Open batch computer monthly report or invoicing system. Find total m³ produced or invoiced last month.',
        howto: 'Ask the batch plant operator to open the monthly production report on the batch computer, this is usually a one-click report.',
        type: 'num',
        unit: 'm³ last month',
        req: true,
        info: {
          what: 'Total concrete produced and dispatched in the past calendar month.',
          why: 'Dividing this by operating hours × operating days gives real average utilization.',
          calc: 'Step 1: hours/month = op hours × (op days ÷ 12). Step 2: average rate = this figure ÷ hours/month. Step 3: utilization = rate ÷ designed capacity.',
        },
      },
      {
        id: 'demand_sufficient',
        label: 'Is current production limited by demand or by operational capacity?',
        hint: 'This shapes the entire financial analysis. Be honest, if you have more orders than you can handle, operational improvements translate directly to revenue. If you have spare capacity but not enough orders, the focus shifts to margin and pricing.',
        howto: 'Ask the plant manager: "If you could produce 20% more concrete tomorrow, do you have customers to buy it?" The answer will be clear.',
        type: 'opts',
        opts: [
          'Operations, we have more demand than we can currently produce or deliver',
          'Both, we could sell more, and operations are also holding us back',
          'Demand, our volume reflects available orders, not operational limits',
          'Not sure',
        ],
        req: false,
        info: {
          what: 'Whether additional operational capacity would translate to additional revenue.',
          why: 'The most important contextual variable in the report. If demand is the constraint, "hidden capacity" figures show the operational ceiling, not guaranteed revenue.',
          calc: 'If "Demand": capacity gap figures are shown as indicators only, not as revenue opportunity. If "Operations" or "Both": full financial recovery estimates are shown.',
        },
      },
      {
        id: 'operator_backup',
        label: 'If the primary batch plant operator was absent, is there another person on site who can run the plant independently?',
        hint: 'Single-operator dependency is one of the most common hidden risks in GCC ready-mix plants.',
        field: 'Ask the batch plant operator directly, not the plant manager.',
        howto: 'Ask the batch plant operator: "If you were sick tomorrow, who would run the plant?" Then find that person and ask them directly whether they have done it before.',
        type: 'opts',
        opts: [
          'Yes, trained backup operator, has done it before',
          'Partially, someone could manage but has limited experience',
          'No, only one person can run the batch plant',
          'Not sure',
        ],
        info: {
          what: 'Whether a qualified backup exists if the primary batch plant operator is absent.',
          why: 'In GCC plants, the batch plant operator is often a long-tenure expat worker. His absence can halt production entirely for days.',
          calc: 'Risk flag only, not scored. If "No" or "Not sure": flagged as operational risk in report.',
        },
      },
      {
        id: 'batch_cycle',
        label: 'How long does one complete mixing cycle take, from loading aggregates to discharging into the truck?',
        hint: 'One cycle: load aggregates + cement into mixer → mix → discharge into truck drum. Best practice: 4–6 minutes.',
        field: 'Watch 2–3 cycles and time them. Otherwise ask the batch plant operator.',
        howto: 'Stand at the batch plant and time from when the mixer starts loading to when it is ready to discharge. Do this for at least 2 consecutive cycles.',
        type: 'opts',
        opts: [
          'Fast, under 5 minutes',
          'Normal, 5 to 7 minutes',
          'Slow, 7 to 10 minutes',
          'Very slow, over 10 minutes',
        ],
        info: {
          what: 'Time per complete mixing cycle.',
          why: 'Going from 5 to 7 minutes per cycle reduces output by ~25% at most plants.',
          calc: 'Score penalties: Fast = 0 pts. Normal = −5 pts. Slow = −14 pts. Very slow = −22 pts.',
        },
      },
      {
        id: 'batch_calibration',
        label: "When was the batch plant's weighing and dosing equipment last professionally calibrated?",
        hint: 'Uncalibrated equipment drifts ±3–8% on cement dosing, meaning excess cement cost or quality risk on every batch.',
        field: 'Ask the batch plant operator, check for a calibration certificate near the control panel.',
        howto: 'Ask the batch plant operator to show you the calibration certificate. It should be posted near the control panel or kept in the maintenance file.',
        type: 'opts',
        opts: [
          'Within the last 12 months, certificate available',
          '1 to 2 years ago',
          'More than 2 years ago',
          'Never calibrated, original factory settings only',
        ],
        info: {
          what: 'How recently weighing and dosing equipment was professionally calibrated.',
          why: 'Cement dosing drift of ±5% on a plant producing 3,000 m³/month at $38/m³ cement cost = $5,700/month in excess cement or a quality risk if under-dosing.',
          calc: 'Qualitative risk flag. Estimated monthly exposure if cement_cost entered: cement_cost × 0.05 × monthly_m3.',
        },
      },
      {
        id: 'stops_freq',
        label: 'How many times did production stop unexpectedly in the past 7 days?',
        hint: 'Unplanned stops only, not prayer breaks, planned maintenance, or end-of-shift shutdowns.',
        howto: "Ask the batch plant operator directly, not the manager. Ask: 'How many times did the plant stop unexpectedly this week?'",
        type: 'opts',
        opts: [
          'None, no unplanned stops',
          '1 to 2 stops',
          '3 to 5 stops',
          'More than 5 stops',
        ],
        info: {
          what: 'Unplanned production stoppages in the past 7 days.',
          why: 'More than 2 per week signals a reliability problem.',
          calc: 'Score penalties: None = 0 pts. 1–2 = −3 pts. 3–5 = −10 pts. More than 5 = −20 pts.',
        },
      },
      {
        id: 'mix_design_review',
        label: 'When were the current mix designs last reviewed and optimised by a qualified engineer?',
        hint: 'Mix designs not reviewed in 3+ years almost always carry excess cement, the most expensive ingredient.',
        field: 'Ask to see the mix design documents, check the date and engineer signature.',
        howto: 'Ask the batch plant operator or plant manager to show you the current mix design sheets. Look for the date of last revision.',
        type: 'opts',
        opts: [
          'Within the last 12 months',
          '1 to 3 years ago',
          'More than 3 years ago',
          'Never formally reviewed, original designs still in use',
        ],
        info: {
          what: 'How recently mix designs were professionally reviewed and optimised.',
          why: 'Conservative mix designs over-dose cement by 10–20 kg/m³.',
          calc: 'Qualitative risk flag. If over 3 years or never: estimated saving = cement_cost × 0.05 × monthly_m3.',
        },
      },
      {
        id: 'admix_strategy',
        label: "What is the primary purpose of chemical admixtures in this plant's mix designs?",
        hint: 'Admixtures used only for workability = missed opportunity to reduce cement content and cut costs.',
        field: 'Ask the batch plant operator, he knows how the mix is actually dosed.',
        howto: 'Ask the batch plant operator: "Do you use admixtures to reduce the amount of cement in the mix, or mainly to make the concrete easier to place?"',
        type: 'opts',
        opts: [
          'Cement reduction, admixtures used to maintain strength at lower cement content',
          'Workability only, admixtures used to improve flow and placement',
          'Both equally',
          'Admixtures not used',
        ],
        info: {
          what: 'Whether admixtures are used strategically to reduce cement content or only for workability.',
          why: 'Admixtures cost $3–10/m³ but can replace $8–20/m³ of cement. Plants using them only for workability are paying twice.',
          calc: 'Combined with mix_design_review. If workability-only AND mix not reviewed: cement optimisation finding shown.',
        },
      },
    ],
  },
  {
    id: 'dispatch',
    label: '4. Dispatch coordination',
    qs: [
      {
        id: 'dispatch_tool',
        label: 'How do your dispatchers manage truck assignments and deliveries?',
        hint: 'How does the team decide which truck goes to which site at what time?',
        field: 'Observe the dispatch office for 10 minutes before asking.',
        howto: 'Spend 10 minutes in the dispatch office before asking any questions. Watch how orders come in and how trucks are assigned.',
        type: 'opts',
        opts: [
          'Dedicated dispatch software with real-time tracking',
          'Spreadsheet combined with WhatsApp',
          'WhatsApp messages only, no spreadsheet',
          'Phone calls and a whiteboard or paper list',
        ],
        req: true,
        info: {
          what: 'Method used to assign trucks, track locations, and sequence deliveries.',
          why: 'WhatsApp-only dispatch = no visibility, no route optimisation, no data.',
          calc: 'Dispatch score component (13% weight): software=100, spreadsheet+WhatsApp=65, WhatsApp only=35, paper/whiteboard=10.',
        },
      },
      {
        id: 'order_notice',
        label: 'How much advance notice do customers typically give before a concrete delivery is required?',
        hint: 'This determines what dispatch improvements are actually achievable.',
        field: 'Ask the dispatcher, they handle the calls and know the pattern.',
        howto: 'Ask the dispatcher: "When customers call to order concrete, how far in advance do they usually call?"',
        type: 'opts',
        opts: [
          'Under 4 hours, same day calls only',
          '4 to 24 hours, day-of or day-before',
          '1 to 3 days ahead',
          'Formal schedule, weekly or project-based',
        ],
        info: {
          what: 'How far in advance customers typically place orders.',
          why: 'Dispatch optimisation recommendations must match the planning horizon.',
          calc: 'Dispatch score component (12% weight): <4 hours=20, 4-24=55, 1-3 days=85, formal=100.',
        },
      },
      {
        id: 'order_to_dispatch',
        label: 'How long from a confirmed order to the first loaded truck leaving the gate?',
        hint: 'Start: dispatcher accepts the order. Stop: loaded truck exits the gate. Best practice: under 15 minutes.',
        field: 'Time 3 real orders yourself.',
        howto: 'Ask the dispatcher to notify you when the next order is confirmed. Start your timer at that moment. Stop it when you see the loaded truck exit the gate.',
        type: 'opts',
        opts: [
          'Under 15 minutes, fast response',
          '15 to 25 minutes, acceptable',
          '25 to 40 minutes, slow',
          'Over 40 minutes, critical bottleneck',
        ],
        req: true,
        info: {
          what: 'Time from order confirmation to first loaded truck exiting the plant.',
          why: '25 extra minutes × 20 orders/day = over 8 hours of fleet idle time daily.',
          calc: 'Dispatch score component (35% weight): <15 min=100, 15-25=70, 25-40=40, 40+=10.',
        },
      },
      {
        id: 'route_clustering',
        label: 'Are deliveries to nearby sites grouped together and sent in sequence?',
        hint: 'Clustering = consecutive trucks go to the same area before moving elsewhere. Reduces total driving by 15–30%.',
        field: "Ask to see today's delivery schedule. Are consecutive deliveries going to nearby sites?",
        howto: 'Ask to see the delivery schedule or dispatch log for today or yesterday. Look at the sequence.',
        type: 'opts',
        opts: [
          'Always, formal zone system in place',
          'Usually, informal grouping most of the time',
          'Sometimes, depends on the dispatcher',
          'Rarely or never',
        ],
        info: {
          what: 'Whether deliveries are sequenced so trucks serve nearby sites consecutively.',
          why: 'Unoptimised routing adds 20–40 min per cycle in urban Saudi/Bahrain.',
          calc: 'Dispatch score component (22% weight): Always=100, Usually=75, Sometimes=45, Rarely=15.',
        },
      },
      {
        id: 'plant_idle',
        label: 'Does the plant ever sit ready to produce but have no truck available to load?',
        hint: 'Happens when all trucks are out and the plant must wait. If regular, fleet/turnaround is the bottleneck.',
        field: 'Ask the batch plant operator: "Do you ever have concrete ready but no truck to load it into?"',
        howto: 'Ask the batch plant operator, not the manager or dispatcher. Operators are more likely to give an honest answer.',
        type: 'opts',
        opts: [
          'Never, a truck is always available',
          'Occasionally, a few times per week',
          'Regularly, most busy periods',
          'Every day, always waiting for trucks',
        ],
        info: {
          what: 'Whether the plant is ready but no truck is available.',
          why: 'The clearest bottleneck signal. Plant waiting for trucks = logistics bottleneck.',
          calc: 'Dispatch score component (18% weight): Never=100, Occasionally=70, Regularly=40, Every day=10.',
        },
      },
    ],
  },
  {
    id: 'quality',
    label: '5. Quality & maintenance',
    qs: [
      {
        id: 'maint_programme',
        label: 'Does this plant follow a scheduled preventive maintenance programme for mixer trucks?',
        hint: 'A formal programme means service intervals are defined, logged, and followed, not just done when something breaks.',
        field: 'Ask to see the maintenance log or service schedule.',
        howto: 'Ask the workshop supervisor to show you the maintenance log or service schedule.',
        type: 'opts',
        opts: [
          'Yes, formal schedule, logged and followed',
          'Informal, some checks but no written programme',
          'Reactive only, trucks are repaired when they break down',
          'No maintenance programme',
        ],
        info: {
          what: 'Whether a structured preventive maintenance programme exists for the mixer truck fleet.',
          why: "Reactive-only maintenance costs 3–5× more over a fleet's lifetime.",
          calc: 'Used with truck_breakdowns. If reactive-only AND breakdowns > 2/month: flagged as high-priority finding.',
        },
      },
      {
        id: 'truck_breakdowns',
        label: 'How many unplanned mixer truck breakdowns occurred last month?',
        hint: 'Unplanned only, not scheduled services. Count from the workshop repair log.',
        field: 'Check the workshop repair log, count corrective entries for trucks only, last month.',
        howto: 'Ask the workshop supervisor for the repair log or work order book. Count entries from last month marked as unplanned or corrective.',
        type: 'num',
        unit: 'breakdowns / month',
        info: {
          what: 'Number of unplanned mixer truck failures requiring repair last month.',
          why: 'Each breakdown removes a truck from service for hours or days.',
          calc: 'Monthly breakdown cost = truck_breakdowns × (op_hours × 0.5) × (deliveries_day ÷ trucks) × mixer_cap × contrib.',
        },
      },
      {
        id: 'return_liability',
        label: 'When a load is returned or rejected, who bears the cost of the wasted material?',
        hint: 'The answer determines whether reject_pct is a full loss to the plant or partially recoverable.',
        field: 'Ask the plant manager or sales person, then ask to see a recent example in the invoicing system.',
        howto: 'Ask the plant manager: "When a truck returns with unused concrete, who pays for the wasted material?"',
        type: 'opts',
        opts: [
          'Contractor always pays, formal policy enforced',
          'Contractor sometimes pays, handled case by case',
          'Plant always absorbs the cost',
          'No clear policy',
        ],
        info: {
          what: 'Whether the plant or the contractor bears the financial cost of returned or rejected loads.',
          why: 'If the plant absorbs all reject costs, the reject loss calculation uses full price.',
          calc: 'Modifies rejectLeakMonthly. Contractor pays: materials-only loss. Plant absorbs: full price write-off.',
        },
      },
      {
        id: 'demurrage_policy',
        label: 'Does this plant charge contractors for excessive waiting time at site?',
        hint: 'Demurrage = a fee charged when the truck is held at site beyond the agreed unloading window.',
        field: 'Ask to see a recent invoice where demurrage was actually charged.',
        howto: 'Ask the plant manager: "Do your contracts include a waiting time charge if the truck is held at site beyond the agreed window?"',
        type: 'opts',
        opts: [
          'Yes, formal charge, consistently invoiced',
          'Clause exists but rarely enforced',
          'No demurrage charge in contracts',
          'Not sure',
        ],
        info: {
          what: 'Whether the plant formally charges contractors for excessive site waiting time.',
          why: "Without demurrage, the plant absorbs the entire cost of contractor delays.",
          calc: 'Combined with site_wait_time. If site_wait > 45 min AND demurrage not enforced: flagged as revenue recovery opportunity.',
        },
      },
      {
        id: 'top_customer_pct',
        label: "What percentage of this plant's monthly volume goes to the single largest customer?",
        hint: 'Above 40% is a concentration risk. Above 60% is critical.',
        field: 'Open invoicing system, find top customer by volume last month.',
        howto: "Ask to see last month's delivery volume broken down by customer.",
        type: 'num',
        unit: '% of monthly volume',
        info: {
          what: 'Revenue concentration in the single largest customer.',
          why: 'High concentration = high revenue risk. A plant supplying 70% of volume to one subcontractor can lose half its revenue overnight.',
          calc: 'Risk flag only. Under 30%: no flag. 30–50%: amber. Above 50%: red.',
        },
      },
      {
        id: 'quality_control',
        label: 'How consistently are quality checks applied before each truck leaves, slump test and water-cement ratio?',
        hint: 'Slump checks workability. W/C ratio controls strength. Both should be logged every batch.',
        howto: 'Ask to observe the next truck being loaded. Watch whether a slump test is performed before dispatch.',
        type: 'opts',
        req: true,
        opts: [
          'Both logged every batch, enforced strictly',
          'Usually done, most trucks, informal recording',
          'Sometimes, depends on operator or shift',
          'Rarely or never, no systematic quality checks',
        ],
        info: {
          what: 'Consistency of pre-dispatch quality checks.',
          why: 'Uncontrolled loads lead to rejections and contractor trust erosion.',
          calc: 'Quality score component (25% weight): Both logged=100, Usually=70, Sometimes=35, Rarely=5.',
        },
      },
      {
        id: 'reject_pct',
        label: 'What percentage of loads were rejected by the contractor or returned last month?',
        hint: 'Rejected at site or returned to plant = 100% loss, all costs, zero revenue.',
        field: 'Look up last month in your system. If not tracked, note it, that is itself a significant finding.',
        howto: 'Ask to see the dispatch log or quality records and search for returns or rejections last month.',
        type: 'num',
        unit: '% of total deliveries',
        req: true,
        info: {
          what: 'Percentage of loads rejected or returned last month.',
          why: '3% on 30 deliveries/day = nearly one full load lost every day.',
          calc: 'Monthly reject cost = (reject % ÷ 100) × deliveries/day × mixer capacity × selling price × (op days ÷ 12). Uses selling price, a rejected load is a total write-off.',
        },
      },
      {
        id: 'reject_cause',
        label: 'What is the most common reason loads are rejected or returned?',
        hint: 'The cause determines the fix, a stiffening problem needs a different solution than a site readiness problem.',
        howto: 'Ask the plant manager or dispatcher: "When a truck comes back with unused concrete, what is usually the reason?"',
        type: 'opts',
        opts: [
          'Heat and stiffening during transit',
          'Quality control failure at plant',
          'Site not ready, pump or crew unavailable',
          'Customer dispute or specification change',
          'Rejection not tracked, unknown',
        ],
        info: {
          what: 'Primary cause of load rejections and returns.',
          why: 'The same reject rate requires a completely different intervention depending on cause.',
          calc: 'Used to steer the recommendation attached to the reject issue. Does not change the dollar figure.',
        },
      },
      {
        id: 'reject_cause_split',
        label: 'Of your rejected loads, roughly what fraction are caused by site or customer conditions, versus plant-side quality issues?',
        hint: 'Site/customer = pump not ready, crew absent, contractor refusal, transit delay. Plant-side = batching error, wrong slump, dosing failure.',
        howto: 'Ask the dispatcher or plant manager: "When a load comes back, is it usually because something went wrong at our end, or because the customer wasn\'t ready?"',
        type: 'opts',
        opts: [
          'Mostly plant-side, batching, dosing, or mix quality (<25% site/customer)',
          'Roughly equal, both plant and site contribute',
          'Mostly site/customer, pump delays, unreadiness, or contractor refusal (>50%)',
          'Not tracked, unknown',
        ],
        info: {
          what: 'Estimated fraction of rejections attributable to plant-side versus customer/site-side causes.',
          why: 'Plant-side rejection requires fixing batch control or mix design. Customer-side rejection requires contract enforcement and site coordination. The dollar figure is the same, the intervention is completely different.',
          calc: 'Splits rejectLeakMonthly into rejectPlantSideLoss and rejectCustomerSideLoss. Each generates a separate finding with its own action and financial tag. Default (unknown/unanswered): 50/50 split.',
        },
      },
      {
        id: 'surplus_concrete',
        label: 'On average, how much concrete is left over and wasted per truck trip, returned to plant but not counted as a formal rejection?',
        hint: 'This is structural waste, not a quality failure, just over-batching or customer order changes at site.',
        field: 'Ask the batch plant operator or drivers, they know this better than the manager.',
        howto: 'Ask the batch plant operator: "When trucks return with leftover concrete that is not a rejection, how much is typically left?"',
        type: 'opts',
        opts: [
          'Under 0.2 m³, minimal waste',
          '0.2 to 0.5 m³, moderate',
          '0.5 to 1.0 m³, significant',
          'Over 1.0 m³, serious problem',
        ],
        info: {
          what: 'Average volume of concrete returned per trip as structural over-batch waste.',
          why: '0.5 m³ surplus per trip on 38 deliveries/day = 19 m³/day wasted.',
          calc: 'Surplus midpoints: <0.2=0.1, 0.2–0.5=0.35, 0.5–1.0=0.75, >1.0=1.2 m³. Monthly surplus cost = midpoint × delDay × price × (opD÷12).',
        },
      },
      {
        id: 'summer_cooling',
        label: 'Does this plant actively cool concrete during summer months, chilled water, ice, or cooled aggregates?',
        hint: 'In GCC summers above 40°C, concrete without active cooling stiffens 30–40% faster.',
        field: 'Ask the batch plant operator, look for a chiller unit near the water tank.',
        howto: 'Ask the batch plant operator: "In summer, do you use chilled water or ice in the mix?"',
        type: 'opts',
        opts: [
          'Yes, chilled water system in operation',
          'Partial, cold tap water or shaded aggregate storage only',
          'No, no active cooling measures',
          'Not applicable, plant operates in a mild climate year-round',
        ],
        info: {
          what: 'Whether the plant uses active cooling to control concrete temperature in summer.',
          why: 'GCC summer temperatures accelerate concrete stiffening by 30–40%. Plants without active cooling experience significantly higher reject rates.',
          calc: 'Qualitative risk flag combined with isSummer. If no cooling and GCC country: flagged as seasonal risk.',
        },
      },
      {
        id: 'breakdowns',
        label: 'How many times did the batch plant itself break down unexpectedly last month, excluding truck breakdowns?',
        hint: 'Batch plant stoppages only, mixer, weigh hopper, conveyor, control system. Truck breakdowns are tracked separately above.',
        field: 'Ask the batch plant operator and check the maintenance log, count batch plant corrective entries only.',
        howto: 'Ask for the maintenance log. Count entries from last month for batch plant equipment only, mixer, weigh hopper, aggregate conveyor, cement screw, control panel.',
        type: 'opts',
        opts: [
          '0 to 1, very reliable',
          '2 to 3, acceptable',
          '4 to 6, too frequent',
          'More than 6, serious problem',
        ],
        info: {
          what: 'Unplanned batch plant failures last month, separate from truck breakdowns.',
          why: 'A batch plant stoppage halts all production immediately.',
          calc: 'Used qualitatively alongside maint_programme and truck_breakdowns. If 4+ per month: flagged as high-priority finding.',
        },
      },
    ],
  },
  {
    id: 'datacheck',
    label: '6. Data quality',
    qs: [
      {
        id: 'typical_month',
        label: 'Was last month a typical production month for this plant?',
        hint: 'Atypical months, Ramadan, project completions, seasonal peaks, make all dollar figures misleading if not flagged.',
        howto: 'Ask the plant manager: "Was last month a normal month for you, or was it unusually busy or slow?"',
        type: 'opts',
        opts: [
          'Yes, normal month, representative of typical operations',
          'Partially, one or two unusual weeks but broadly typical',
          'No, unusually high demand',
          'No, unusually low demand',
          'No, Ramadan or public holiday period',
        ],
        info: {
          what: 'Whether last month was representative of normal plant operations.',
          why: 'All dollar figures are extrapolated from last month. Atypical months can be 30–50% off.',
          calc: 'If not "Yes" or "Partially": all monthly dollar figures flagged for review.',
        },
      },
      {
        id: 'prod_data_source',
        label: 'Where did the production and delivery figures above come from?',
        hint: 'This adjusts how much weight the system gives to your scores. System records are much more reliable than estimates.',
        howto: 'Reflect on how you obtained the production and delivery figures in the previous sections.',
        type: 'opts',
        req: true,
        opts: [
          'System records, read from batch computer or dispatch system',
          'Calculated from monthly reports or delivery tickets',
          'Estimated by plant manager or dispatcher',
          'Rough estimates, not based on records',
        ],
        info: {
          what: 'Whether key figures entered are confirmed records or estimates.',
          why: 'Managers typically overestimate peak output and underestimate turnaround by 10–25%.',
          calc: 'Source weight: System = 1.0, Monthly reports = 0.90, Estimated = 0.70, Rough = 0.60.',
        },
      },
      {
        id: 'data_freshness',
        label: 'How recent are the figures you just entered?',
        hint: "Figures from today or this week are far more reliable than last month's recollection.",
        howto: 'Consider when the figures you entered were generated.',
        type: 'opts',
        req: true,
        opts: [
          "Today's operation, figures from this visit",
          'This week, within the last 7 days',
          'This month, within the last 30 days',
          'Older or unsure',
        ],
        info: {
          what: 'How current the data is.',
          why: 'Output and turnaround times fluctuate. Month-old figures may not reflect current conditions.',
          calc: 'Freshness weight: Today = 1.0, This week = 0.95, This month = 0.85, Older = 0.70.',
        },
      },
      {
        id: 'data_observed',
        label: 'Did you personally see the key figures, or were they told to you?',
        hint: "There's a big difference between reading a number off a screen and being told 'roughly 38 per day'.",
        howto: 'Reflect honestly on how you collected the figures.',
        type: 'opts',
        req: true,
        opts: [
          'Seen on screen, batch computer, dispatch system, or printout',
          'Seen on paper, delivery tickets, reports, or invoices',
          'Told verbally, by plant manager or dispatcher',
          'Mix of observed and verbal',
        ],
        info: {
          what: 'Whether you directly observed figures or received them verbally.',
          why: 'Verbal estimates are typically 10–30% off.',
          calc: 'Observation weight: Screen = 1.0, Paper = 0.95, Verbal = 0.75, Mixed = 0.85.',
        },
      },
      {
        id: 'data_crosscheck',
        label: 'Were any figures cross-checked against a second source?',
        hint: 'E.g. turnaround time confirmed by both dispatcher and a delivery ticket.',
        howto: 'Consider whether you verified any single figure against two independent sources.',
        type: 'opts',
        req: true,
        opts: [
          'Yes, two or more independent sources confirmed the same figure',
          'Partially, one or two figures cross-checked',
          'No, single source for all figures',
          'Not possible, no second source available',
        ],
        info: {
          what: 'Whether figures were independently verified.',
          why: 'A single unchecked source can be wrong without anyone knowing.',
          calc: 'Cross-check weight: Full = 1.0, Partial = 0.90, None/Not possible = 0.80.',
        },
      },
      {
        id: 'data_confidence_self',
        label: 'Overall, how confident are you in the figures entered today?',
        hint: 'Your gut feeling matters. If something felt off, flag it here.',
        howto: 'Step back and assess the overall quality of this data collection visit.',
        type: 'opts',
        req: true,
        opts: [
          'High, I would present these to the plant owner without hesitation',
          "Medium, reasonable but I'd verify one or two before presenting",
          'Low, significant uncertainty, treat dollar figures as directional only',
          'Very low, data quality was poor, findings are indicative only',
        ],
        info: {
          what: 'Your own assessment of data reliability for this visit.',
          why: 'The analyst on-site judgement is the most important data quality signal.',
          calc: 'Self-assessment caps: High = no cap. Medium = max 85%. Low = max 65% + amber warning. Very Low = max 50% + red warning.',
        },
      },
      {
        id: 'summer_prod_drop',
        label: 'Compared to peak season, how much lower is production during summer months?',
        hint: 'GCC summer (June–September) typically sees 20–35% lower output.',
        howto: "Ask the plant manager to compare last summer's monthly average to a normal peak-season month.",
        type: 'opts',
        opts: [
          'Under 10%, minimal seasonal impact',
          '10 to 20%, moderate drop',
          '20 to 35%, significant summer slowdown',
          'Over 35%, severe seasonal reduction',
          'Not sure, no seasonal comparison available',
        ],
        info: {
          what: 'Estimated production volume drop during summer vs. peak season.',
          why: 'Summer assessments tend to understate plant capability. Adjusting gives a fairer score.',
          calc: 'If season is summer: production score is boosted by dividing by the drop factor (e.g., 20-35% drop → score ÷ 0.72).',
        },
      },
      {
        id: 'data_days_match',
        label: 'Do the production, delivery, and turnaround figures all cover the same time period?',
        hint: 'Mixing figures from different months can distort calculations significantly.',
        howto: "Review the figures you entered: was actual_prod from last month's batch report, but deliveries_day from this week's dispatcher estimate?",
        type: 'opts',
        req: true,
        opts: [
          'Yes, all from the same month',
          'Mostly, one or two figures from a different period',
          'No, figures come from different time periods',
        ],
        info: {
          what: 'Whether all key figures are from the same reporting period.',
          why: "Mixing a high-demand month's production with a low-demand month's delivery count distorts calculations.",
          calc: 'Reduces overall data confidence. "Mostly" = 5% penalty. "No" = 15% penalty.',
        },
      },
      {
        id: 'biggest_pain',
        label: 'In your own words, what is the single biggest operational challenge here right now?',
        hint: 'No right or wrong answer. Plain language. After answering, pause and ask: "Is there anything else?", the second answer is usually more revealing.',
        howto: 'Ask this question near the end of your visit, after you have built rapport. Use the exact wording.',
        type: 'text',
        info: {
          what: "Direct description of the biggest problem from the manager's perspective.",
          why: 'Numbers tell you what is happening. The manager words tell you why.',
          calc: 'Not calculated. Used as context for findings and recommendations.',
        },
      },
    ],
  },
]

// ── Derived Constants ────────────────────────────────────────────────────────

export const TOTAL_Q = SECTIONS.reduce((s, sec) => s + sec.qs.length, 0)

export const PRE_ASSESSMENT_IDS = new Set([
  'price_m3', 'cement_cost', 'aggregate_cost', 'admix_cost',
  'plant_cap', 'actual_prod', 'op_hours', 'op_days',
  'n_trucks', 'deliveries_day', 'turnaround', 'delivery_radius', 'delivery_distance_km', 'avg_transit_min',
  'reject_pct',
  'dispatch_tool', 'order_to_dispatch',
  'prod_data_source',
  'biggest_pain',
])

export const CORE_BLOCKS: CoreBlock[] = [
  { id: 'economics', label: 'Economics & production volume', ids: ['price_m3', 'cement_cost', 'aggregate_cost', 'admix_cost', 'op_days', 'plant_cap', 'op_hours', 'actual_prod', 'working_days_month'] },
  { id: 'fleet', label: 'Fleet & deliveries', ids: ['n_trucks', 'turnaround', 'deliveries_day'] },
  { id: 'quality_dispatch', label: 'Quality & dispatch', ids: ['reject_pct', 'quality_control', 'order_to_dispatch', 'dispatch_tool'] },
  { id: 'context', label: 'Visit context', ids: ['typical_month', 'prod_data_source', 'data_confidence_self', 'biggest_pain'] },
]

// ── Validation Rules ─────────────────────────────────────────────────────────

export const NUM_RULES: Record<string, NumRule> = {
  price_m3:           [45,  150,  'Selling price outside typical GCC range ($45–$150/m³). Double-check.'],
  cement_cost:        [10,  120,  'Cement cost per m³ seems unusual. Typical: $10–$120/m³.'],
  aggregate_cost:     [0,   60,   'Aggregate cost seems high. Typical GCC: $0–$60/m³.'],
  admix_cost:         [0,   25,   'Admixture cost seems high. Typical: $0–$25/m³.'],
  op_days:            [180, 365,  'Operating days should be 180–365/year for a GCC plant.'],
  n_trucks:           [1,   80,   'Truck count outside realistic range (1–80). Verify.'],
  mixer_capacity:     [4,   12,   'Mixer capacity typically 4–12 m³. Default 7 m³ if unsure.'],
  deliveries_day:     [1,   200,  'Deliveries/day outside realistic range (1–200). Verify.'],
  plant_cap:          [20,  500,  'Designed capacity unusual. Typical GCC batch plant: 60–300 m³/hr.'],
  op_hours:           [4,   24,   'Operating hours/day should be 4–24.'],
  actual_prod:        [100, 60000, 'Monthly production outside realistic range. Check figure.'],
  reject_pct:         [0,   30,   'Reject % should be 0–30%. Above 10% is a critical signal.'],
  high_strength_price:[0,   60,   'C35+ price premium typically $0-60/m³ over C25 in GCC.'],
  fuel_per_delivery:  [0,   80,   'Fuel cost per delivery typically $2-80. Check diesel price and trip distance.'],
  water_cost:         [0,   10,   'Water cost per m³ of concrete typically $0-10.'],
  truck_availability: [1,   200,  'Truck availability cannot exceed total fleet size.'],
  qualified_drivers:  [0,   200,  'Qualified drivers should not exceed total truck count significantly.'],
  site_wait_time:     [0,   180,  'Site wait time typically 10-120 min. Above 90 min is a critical finding.'],
  partial_load_size:  [1,   12,   'Average load size should be between 1 and 12 m³.'],
  truck_breakdowns:   [0,   50,   'Truck breakdowns per month above 20 is unusual, verify.'],
  top_customer_pct:   [1,   100,  'Customer concentration should be 1-100%.'],
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export type Phase = 'workshop' | 'onsite' | 'complete' | 'full'

export function isQVisible(qId: string, phase: Phase): boolean {
  if (phase === 'full' || phase === 'complete') return true
  if (phase === 'workshop') return PRE_ASSESSMENT_IDS.has(qId)
  return true // onsite shows all
}

export function getVisibleQs(section: Section, phase: Phase): Question[] {
  return section.qs.filter(q => isQVisible(q.id, phase))
}

export function getVisibleTotal(phase: Phase): number {
  return SECTIONS.reduce((s, sec) => s + getVisibleQs(sec, phase).length, 0)
}

/** Lookup a question by ID across all sections */
export function getQuestionById(id: string): Question | undefined {
  for (const sec of SECTIONS) {
    const q = sec.qs.find(q => q.id === id)
    if (q) return q
  }
  return undefined
}

/** Validate a numeric input against NUM_RULES */
export function validateNumeric(id: string, value: number): string | null {
  const rule = NUM_RULES[id]
  if (!rule) return null
  const [min, max, warning] = rule
  if (value < min || value > max) return warning
  return null
}
