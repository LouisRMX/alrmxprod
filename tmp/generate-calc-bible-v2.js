const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require('docx');

const bdr = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: bdr, bottom: bdr, left: bdr, right: bdr };

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }); }
function h3(t) { return new Paragraph({ spacing: { before: 180, after: 60 }, children: [new TextRun({ text: t, bold: true, size: 21, font: "Arial" })] }); }
function p(t, o = {}) { return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 20, font: "Arial", ...o })] }); }
function f(t) { return new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: t, size: 19, font: "Consolas", color: "0F6E56" })] }); }
function note(t) { return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 19, font: "Arial", italics: true, color: "666666" })] }); }
function b(t) { return new TextRun({ text: t, bold: true, size: 20, font: "Arial" }); }
function n(t) { return new TextRun({ text: t, size: 20, font: "Arial" }); }
function sp() { return new Paragraph({ spacing: { before: 30, after: 30 }, children: [] }); }
function bullet(t) { return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 50 }, children: [new TextRun({ text: t, size: 20, font: "Arial" })] }); }
function div() { return new Paragraph({ spacing: { before: 120, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "0F6E56", space: 1 } }, children: [] }); }
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

function row(cells, widths, shade) {
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 35, bottom: 35, left: 70, right: 70 },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: c, size: 18, font: "Arial" })] })]
  })) });
}
function hrow(cells, widths) { return row(cells, widths, "E8F5E9"); }

const W = 9706; // content width A4 with 1100 margins

const doc = new Document({
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } }] },
  ] },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: "0F6E56" }, paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "Arial", color: "1A1A1A" }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, right: 1100, bottom: 1000, left: 1100 } }
    },
    headers: { default: new Header({ children: [new Paragraph({ children: [
      new TextRun({ text: "alRMX Calculation Bible v2.0", font: "Arial", bold: true, size: 15, color: "0F6E56" }),
      new TextRun({ text: "  |  Confidential", font: "Arial", size: 13, color: "999999" }),
    ], border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "0F6E56", space: 3 } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Page ", size: 13, color: "999999", font: "Arial" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 13, color: "999999", font: "Arial" }),
    ] })] }) },
    children: [
      // COVER
      sp(), sp(), sp(),
      new Paragraph({ children: [new TextRun({ text: "Calculation Bible", font: "Arial", bold: true, size: 44, color: "0F6E56" })] }),
      new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: "alRMX Operational Diagnostic Model v2.0", size: 26, font: "Arial" })] }),
      div(),
      p("Complete specification of how the model calculates operational loss, identifies constraints, and estimates recoverable value. This document governs the model."),
      sp(),
      p("Version 2.0 | April 2026"),
      p("Source: calculations.ts + diagnosis-pipeline.ts + issues.ts"),
      sp(),
      new Paragraph({ children: [new TextRun({ text: "CONFIDENTIAL", size: 17, font: "Arial", bold: true, color: "C0392B" })] }),

      pb(),

      // ═══ 1. MODEL OVERVIEW ═══
      h1("1. Model Overview"),
      p("This model measures how much profit a ready-mix plant fails to capture due to operational constraints and leakage. It does not measure theoretical maximum. It measures the gap between actual production and realistically achievable production with existing assets."),
      sp(),
      h3("Core chain"),
      f("Constraint (Fleet/Production) \u2192 Lost volume (m\u00B3) \u2192 Lost EBITDA ($)"),
      f("+ Additive leakage (reject + partial + surplus) = Total loss"),
      sp(),
      h3("Key outputs"),
      bullet("Total monthly loss: throughput loss + additive leakage ($/month)"),
      bullet("Recoverable EBITDA: 40-65% of total, achievable in 90 days"),
      bullet("Active constraint: Fleet, Production, or Demand"),
      bullet("Prioritized actions tied to the active constraint"),
      sp(),
      h3("What the model does NOT include in total loss"),
      bullet("Demurrage opportunity (recovery, not loss)"),
      bullet("Cost-only savings (demand-constrained, not throughput)"),
      bullet("Reject opportunity cost (overlaps with throughput)"),

      pb(),

      // ═══ 2. ASSUMPTION REGISTER ═══
      h1("2. Assumption Register"),
      p("Every hardcoded value, default, and model rule. If any assumption is changed, outputs must be re-validated."),
      sp(),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [1800, 800, 1800, 2200, 1600, 1506],
        rows: [
          hrow(["Assumption", "Value", "Where used", "Why", "Risk if wrong", "Phase"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Plant practical ceiling", "0.92", "plantDailyM3", "No plant produces 100% of rated. 8% for changeover/cleaning.", "If actual ceiling is 0.85: loss understated by ~8%", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Fallback margin", "35%", "contribSafe", "When material costs incomplete, assume 35% of price is margin.", "If real margin is 25%: losses overstated by ~30%", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Recovery range", "40-65%", "combined_recovery", "Not all loss recoverable in 90 days. Range reflects execution.", "If too optimistic: client disappointed. Too conservative: weak pitch.", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["MixCap guard", "30%", "effectiveMixCap", "If derived deviates >30% from nominal, fall back to nominal.", "If guard too tight: loses real partial-load signal. Too loose: bad data passes.", "On-site"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Partial load default", "30%", "partialLoadFraction", "If partial load % not reported, assume 30% of deliveries.", "If real is 50%: partial leakage understated", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Utilization target", "85%", "capLeakMonthly", "Practical target. Not 100% (unrealistic) or 90% (ambitious).", "If plant can only reach 80%: loss overstated", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Fleet util factor", "85%", "realisticMaxDel", "Not all theoretical fleet cycles are achievable.", "Similar to above. Conservative.", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Site wait benchmark", "35 min", "siteWaitExcess", "Ground-level pour baseline. High-rise is longer.", "If most sites are high-rise: excess overstated", "On-site"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Washout benchmark", "12 min", "washoutExcess", "Standard high-pressure bay.", "If equipment is old: benchmark too aggressive", "On-site"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["TAT target formula", "60+radius*1.5", "TARGET_TA", "Linear estimate. 60 min base + transit factor.", "Does not account for traffic. May be too aggressive for congested areas.", "Both"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Near-constraint", "0.85 ratio", "hasNearConstraint", "Secondary flagged when within 15% of primary.", "Threshold is arbitrary. May miss or over-flag.", "On-site"], [1800, 800, 1800, 2200, 1600, 1506]),
          row(["Pre-dx: no derived mixCap", "nominal", "estimatedInputs", "Self-reported data too inconsistent for derivation.", "Nominal may overstate fleet capacity (see load factor analysis).", "Pre-dx only"], [1800, 800, 1800, 2200, 1600, 1506]),
        ]
      }),

      pb(),

      // ═══ 3. CORE CALCULATIONS ═══
      h1("3. Core Calculations"),

      h2("3.1 Plant Capacity"),
      f("plantDailyM3 = cap * 0.92 * opH"),
      p("92% of rated capacity. Accounts for batch changeover, cleaning, scheduling gaps."),
      note("75 m\u00B3/hr * 0.92 * 12 hr = 828 m\u00B3/day"),
      sp(),
      f("actual = monthlyM3 / (opH * workingDaysMonth)"),
      f("util = actual / cap"),
      sp(),
      h3("Model rule vs reality"),
      p("Reality: utilization varies hour by hour, day by day. Model: uses monthly average as a stable proxy. This smooths over demand peaks and idle periods."),

      h2("3.2 Fleet Capacity"),
      f("tripsPerTruck = (opH * 60) / ta     [continuous]"),
      f("fleetDailyM3 = effectiveUnits * tripsPerTruck * effectiveMixCap"),
      sp(),
      h3("Why continuous (not floor)"),
      p("TAT is estimated from dropdown categories with 25-min ranges. Floor creates artificial jumps: TAT 119 min = 6 trips, TAT 121 min = 5 trips. With estimated data, continuous is more stable."),
      sp(),
      h3("effectiveMixCap"),
      f("ON-SITE:  monthlyM3 / (delDay * workingDays)   [capped 3-12, 30% guard]"),
      f("PRE-DX:   mixCap (nominal, no derivation)"),
      p("Pre-diagnosis skips derivation because actual_prod and deliveries_day are independently estimated and often inconsistent. Derivation amplifies that inconsistency."),

      h2("3.3 Constraint Identification"),
      f("IF fleetDailyM3 < plantDailyM3:  constraint = Fleet"),
      f("IF fleetDailyM3 >= plantDailyM3: constraint = Production"),
      f("IF demandSufficient == false:     constraint = Demand"),
      sp(),
      h3("Model rule: only one active constraint"),
      p("Reality: both fleet and plant can simultaneously limit output. Model: assigns to the tighter one. This is a Theory of Constraints simplification. It is correct for identifying the primary lever, but may understate the secondary."),
      sp(),
      h3("Pre-diagnosis: no constraint label"),
      p("Nominal mixCap can flip the constraint (see Section 6). Pre-diagnosis shows total loss range without naming which constraint is active."),
      sp(),
      f("targetDailyM3 = min(targetFleetDailyM3, plantDailyM3)"),
      note("Fleet target capped at plant ceiling. Model never claims plant can produce more than physical capacity."),

      h2("3.4 Hidden Volume"),
      f("gapDailyM3 = targetDailyM3 - actualDailyM3"),
      f("gapMonthlyM3 = gapDailyM3 * workingDaysMonth"),

      h2("3.5 Financial Conversion"),
      f("throughputLossUSD = gapMonthlyM3 * contribSafe * seasonalFactor"),
      sp(),
      h3("Why contribution margin, not revenue"),
      p("Revenue = price * volume. But producing more volume also costs more (cement, aggregate, admixture). Contribution margin (price - variable costs) is the correct measure of marginal profit from additional volume."),
      sp(),
      f("contribSafe = (costs incomplete) ? price * 0.35 : price - cement - agg - admix"),

      h2("3.6 Recoverable Share"),
      f("recoveryLo = totalLoss * 0.40"),
      f("recoveryHi = totalLoss * 0.65"),
      p("40% = conservative (partial implementation, resistance). 65% = optimistic (strong execution). Not 100% because operational change takes time. Full recovery: 6-12 months."),

      pb(),

      // ═══ 4. ADDITIVE LOSSES ═══
      h1("4. Additive Losses"),
      p("Independent of which constraint is active. Calculated separately. Never overlap with throughput."),
      sp(),
      h3("Rejection (material loss only)"),
      f("rejectMaterialLoss = rejectPct/100 * delDay * effectiveMixCap * materialCost * days"),
      p("Opportunity cost (wasted truck cycle) excluded: it overlaps with throughput loss."),
      sp(),
      h3("Partial loads"),
      f("partialLeak = (mixCap - partialLoad) * delDay * partialFraction * contribSafe * days"),
      sp(),
      h3("Surplus concrete"),
      f("surplusLeak = surplusMid * delDay * materialCost * days"),
      sp(),
      h3("Total loss"),
      f("totalLoss = throughputLoss + rejectMaterial + partialLeak + surplusLeak + breakdownCost"),
      note("Demurrage NOT included (recovery opportunity). Cost-only savings NOT included (demand-constrained)."),

      pb(),

      // ═══ 5. OVERLAP CONTROL ═══
      h1("5. Overlap and Double-Counting Control"),
      sp(),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [1800, 2600, 2400, 2906],
        rows: [
          hrow(["Component", "What it captures", "Overlap risk", "Control"], [1800, 2600, 2400, 2906]),
          row(["turnaroundLeak", "Lost deliveries from slow TAT", "Overlaps with capLeak (same gap)", "Only active when Fleet is constraint. capLeak = 0."], [1800, 2600, 2400, 2906]),
          row(["capLeak", "Lost production from underutilized plant", "Overlaps with turnaroundLeak", "Only active when Production is constraint. turnaroundLeak = 0."], [1800, 2600, 2400, 2906]),
          row(["rejectMaterial", "Wasted raw materials on rejected loads", "None with throughput", "Material cost only. Opportunity cost excluded."], [1800, 2600, 2400, 2906]),
          row(["rejectOpportunity", "Wasted truck cycle on rejected load", "Overlaps with throughput", "EXCLUDED from total. Cycle already in TAT gap."], [1800, 2600, 2400, 2906]),
          row(["partialLeak", "Trucks running below capacity", "None", "Independent: even at perfect TAT, partial loads waste capacity."], [1800, 2600, 2400, 2906]),
          row(["surplusLeak", "Overproduced concrete wasted", "None", "Independent: material cost, not cycle."], [1800, 2600, 2400, 2906]),
          row(["demurrage", "Uncollected site-wait charges", "None", "NOT in total. Recovery opportunity, not loss."], [1800, 2600, 2400, 2906]),
          row(["breakdownCost", "Truck repair/towing costs", "Capacity already in effectiveUnits", "Only repair COST is additive. Capacity loss already in throughput."], [1800, 2600, 2400, 2906]),
        ]
      }),

      pb(),

      // ═══ 6. PRE-DX vs ON-SITE ═══
      h1("6. Pre-diagnosis vs On-site"),
      sp(),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [2200, 3800, 3706],
        rows: [
          hrow(["Aspect", "Pre-diagnosis", "On-site"], [2200, 3800, 3706]),
          row(["Input quality", "Self-reported (dropdown + estimate)", "Measured / validated on plant floor"], [2200, 3800, 3706]),
          row(["Allowed inputs", "14 core questions", "Full assessment (30+ questions + observations)"], [2200, 3800, 3706]),
          row(["effectiveMixCap", "Nominal (assumed, no derivation)", "Derived from actual_prod / deliveries"], [2200, 3800, 3706]),
          row(["Constraint certainty", "LOW: not labeled", "HIGH: Fleet / Production / Demand"], [2200, 3800, 3706]),
          row(["Constraint label in UI", "NOT shown", "Shown with confidence badge"], [2200, 3800, 3706]),
          row(["Output precision", "Range (+/-18%)", "Point estimate (validated)"], [2200, 3800, 3706]),
          row(["Throughput/leakage split", "NOT separated", "Clearly separated in UI"], [2200, 3800, 3706]),
          row(["Confidence level", "Preliminary", "Medium / Medium-High / High"], [2200, 3800, 3706]),
          row(["TAT source", "Dropdown (25-min range)", "Observed / GPS / timed"], [2200, 3800, 3706]),
          row(["Validation level", "None", "On-site observation + records"], [2200, 3800, 3706]),
          row(["Intended use", "Identify if significant gap exists. Justify on-site visit.", "Full diagnosis. Drive action plan."], [2200, 3800, 3706]),
          row(["Data quality gate", "INCONSISTENT flag if inputs contradict", "N/A (data validated)"], [2200, 3800, 3706]),
        ]
      }),

      pb(),

      // ═══ 7. DEPENDENCY MAP ═══
      h1("7. Dependency Map"),
      p("How inputs flow through the model to outputs. Each line shows: source \u2192 intermediate \u2192 output."),
      sp(),
      h3("Throughput chain"),
      f("plant_cap + op_hours \u2192 plantDailyM3"),
      f("n_trucks + truck_avail + drivers \u2192 effectiveUnits"),
      f("turnaround \u2192 tripsPerTruck"),
      f("effectiveUnits + tripsPerTruck + effectiveMixCap \u2192 fleetDailyM3"),
      f("fleetDailyM3 vs plantDailyM3 \u2192 constraint (Fleet or Production)"),
      f("actual_prod + op_hours + working_days \u2192 actualDailyM3"),
      f("targetDailyM3 - actualDailyM3 \u2192 gapDailyM3"),
      f("gapDailyM3 * workingDays * contribSafe \u2192 throughputLossUSD"),
      sp(),
      h3("Leakage chain"),
      f("reject_pct + deliveries + effectiveMixCap + materialCost \u2192 rejectMaterialLoss"),
      f("partial_load_size + deliveries + contribSafe \u2192 partialLeakMonthly"),
      f("surplus_concrete + deliveries + materialCost \u2192 surplusLeakMonthly"),
      sp(),
      h3("Financial output"),
      f("throughputLossUSD + rejectMaterial + partialLeak + surplusLeak \u2192 totalLoss"),
      f("totalLoss * [0.40, 0.65] \u2192 recoverable EBITDA range"),
      sp(),
      h3("Mutually exclusive outputs"),
      bullet("turnaroundLeak and capLeak: only one is > 0 at a time"),
      bullet("Throughput loss and cost-only savings: mutually exclusive (demand gate)"),
      sp(),
      h3("Additive outputs (always summed)"),
      bullet("rejectMaterial + partialLeak + surplusLeak + breakdownCost"),

      pb(),

      // ═══ 8. SENSITIVITY ═══
      h1("8. Sensitivity and Uncertainty"),
      sp(),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [1800, 1600, 1600, 2200, 2506],
        rows: [
          hrow(["Variable", "Operational leverage", "Data quality", "Combined risk", "Mitigation"], [1800, 1600, 1600, 2200, 2506]),
          row(["TAT", "VERY HIGH: 10 min = ~$15k/mo", "LOW: dropdown (25-min range)", "CRITICAL: high leverage + low precision", "Use ranges in pre-dx. Validate on-site."], [1800, 1600, 1600, 2200, 2506]),
          row(["effectiveMixCap", "HIGH: 1 m\u00B3 = ~10% fleet shift", "MEDIUM: derived, can be inconsistent", "HIGH: can flip constraint", "Pre-dx: use nominal. On-site: derive + guard."], [1800, 1600, 1600, 2200, 2506]),
          row(["Plant capacity", "HIGH: sets ceiling", "HIGH: usually known accurately", "MEDIUM", "Cross-check with nameplate rating."], [1800, 1600, 1600, 2200, 2506]),
          row(["Margin (contribSafe)", "HIGH: direct multiplier", "MEDIUM: costs often incomplete", "HIGH: 35% fallback may be wrong", "Validate costs on-site. Flag when fallback used."], [1800, 1600, 1600, 2200, 2506]),
          row(["Deliveries/day", "MEDIUM: affects leakage", "LOW: often estimated", "MEDIUM: mainly affects partial loads", "Cross-validate vs actual_prod."], [1800, 1600, 1600, 2200, 2506]),
          row(["Partial load size", "LOW-MEDIUM", "LOW: rarely measured", "LOW-MEDIUM", "Default 30% fraction. Directional only."], [1800, 1600, 1600, 2200, 2506]),
        ]
      }),
      sp(),
      note("CRITICAL = high operational leverage AND low data precision. TAT is the most dangerous variable: it drives the most output change but is measured least precisely."),

      pb(),

      // ═══ 9. FAILURE MODES ═══
      h1("9. Failure Modes"),
      sp(),
      h3("9.1 Production exceeds capacity"),
      p("actual_prod > cap * opH * workingDays * 1.05. Inputs contradict. dataQuality = insufficient."),
      h3("9.2 Deliveries exceed truck capacity"),
      p("delDay > effectiveUnits * 15. No truck does 15+ trips/day. dataQuality = insufficient."),
      h3("9.3 TAT dropdown creates constraint flip"),
      p("'100-125 min' = 112. At 100 min fleet may exceed plant. At 125 min fleet is clearly constrained. Pre-diagnosis does not label."),
      h3("9.4 effectiveMixCap with inconsistent inputs"),
      p("actual_prod and delDay independently estimated. Derived mixCap can be wildly wrong. 30% guard catches extremes. Pre-dx skips derivation."),
      h3("9.5 Demand misidentification"),
      p("demandSufficient is self-reported. Plant manager may overstate demand. Model cannot detect except through util vs fleet inconsistency."),
      h3("9.6 Seasonal distortion"),
      p("Summer data used for full-year projection. seasonalFactor partially compensates but is itself estimated from a dropdown."),

      pb(),

      // ═══ 10. INTERPRETATION ═══
      h1("10. Interpretation Guide"),
      sp(),
      h3("What '$200k/month loss' means"),
      p("The plant produces $200k/month less contribution margin than achievable with the same assets, trucks, and demand. Not 'revenue' (higher by price/margin ratio). Not 'theoretical max' (target is 85%, not 100%)."),
      sp(),
      h3("Ranges"),
      p("Pre-diagnosis: +/-18% on total loss = input uncertainty. Recovery: 40-65% = execution uncertainty."),
      sp(),
      h3("What NOT to conclude"),
      bullet("Pre-diagnosis constraint is NOT confirmed"),
      bullet("Do NOT add throughput + recovery + savings (different categories)"),
      bullet("Recovery is NOT automatic. Requires sustained change."),
      bullet("Do NOT compare plants using pre-diagnosis numbers"),
      sp(),
      h3("Not measured"),
      bullet("Traffic patterns, project type, driver behavior, multi-shift, demand variation within month"),

      pb(),

      // ═══ APPENDIX: FORMULA INDEX ═══
      h1("Appendix: Formula Index"),
      p("All major formulas in compact form. Reference only."),
      sp(),
      f("plantDailyM3 = cap * 0.92 * opH"),
      f("actual = monthlyM3 / (opH * workingDaysMonth)"),
      f("util = actual / cap"),
      f("tripsPerTruck = (opH * 60) / ta"),
      f("effectiveUnits = min(operativeTrucks, qualifiedDrivers)"),
      f("fleetDailyM3 = effectiveUnits * tripsPerTruck * effectiveMixCap"),
      f("targetFleetDailyM3 = realisticMaxDel * effectiveMixCap"),
      f("targetDailyM3 = min(targetFleetDailyM3, plantDailyM3)"),
      f("gapDailyM3 = targetDailyM3 - actualDailyM3"),
      f("gapMonthlyM3 = gapDailyM3 * workingDaysMonth"),
      f("throughputLoss = gapMonthlyM3 * contribSafe * seasonalFactor"),
      f("capLeak = (cap * 0.85 - actual) * opH * opD/12 * contribSafe * seasonalFactor"),
      f("rejectMaterial = rejectPct/100 * delDay * effectiveMixCap * materialCost * days"),
      f("partialLeak = (mixCap - partialLoad) * delDay * fraction * contribSafe * days"),
      f("surplusLeak = surplusMid * delDay * materialCost * days"),
      f("totalLoss = max(throughputLoss, capLeak) + rejectMaterial + partialLeak + surplusLeak"),
      f("recoveryLo = totalLoss * 0.40"),
      f("recoveryHi = totalLoss * 0.65"),
      f("contribSafe = (incomplete) ? price * 0.35 : price - cement - agg - admix"),
      f("TARGET_TA = 60 + radius * 1.5"),

      sp(), sp(), div(),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "End of Calculation Bible v2.0", size: 17, font: "Arial", color: "999999", italics: true }),
      ] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('C:/Users/lsh29/Desktop/alRMX_Calculation_Bible_v2.docx', buffer);
  console.log('Generated: alRMX_Calculation_Bible_v2.docx');
});
