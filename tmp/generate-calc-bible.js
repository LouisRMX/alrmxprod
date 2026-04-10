const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }); }
function h3(t) { return new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 22, font: "Arial" })] }); }
function p(t, o = {}) { return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: t, size: 21, font: "Arial", ...o })] }); }
function formula(t) { return new Paragraph({ spacing: { after: 80 }, indent: { left: 400 }, children: [new TextRun({ text: t, size: 20, font: "Consolas", color: "0F6E56" })] }); }
function note(t) { return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: t, size: 20, font: "Arial", italics: true, color: "666666" })] }); }
function bold(t) { return new TextRun({ text: t, bold: true, size: 21, font: "Arial" }); }
function normal(t) { return new TextRun({ text: t, size: 21, font: "Arial" }); }
function spacer() { return new Paragraph({ spacing: { before: 40, after: 40 }, children: [] }); }
function bullet(t, ref = "bullets") { return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: t, size: 21, font: "Arial" })] }); }
function divider() { return new Paragraph({ spacing: { before: 160, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "0F6E56", space: 1 } }, children: [] }); }

function inputRow(name, desc, unit, source, range, sensitivity) {
  const cells = [name, desc, unit, source, range, sensitivity];
  const widths = [1600, 2600, 800, 1200, 1400, 1000];
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: c, size: 18, font: "Arial" })] })]
  })) });
}

function headerRow(cells, widths) {
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    shading: { fill: "E8F5E9", type: ShadingType.CLEAR },
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18, font: "Arial", color: "1A1A1A" })] })]
  })) });
}

const doc = new Document({
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 34, bold: true, font: "Arial", color: "0F6E56" }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: "1A1A1A" }, paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, right: 1100, bottom: 1100, left: 1100 } }
    },
    headers: { default: new Header({ children: [new Paragraph({ children: [
      new TextRun({ text: "alRMX Calculation Bible", font: "Arial", bold: true, size: 16, color: "0F6E56" }),
      new TextRun({ text: "  |  v1.0  |  Confidential", font: "Arial", size: 14, color: "999999" }),
    ], border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "0F6E56", space: 4 } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Page ", size: 14, color: "999999", font: "Arial" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "999999", font: "Arial" }),
    ] })] }) },
    children: [
      // ═══ COVER ═══
      spacer(), spacer(), spacer(),
      new Paragraph({ children: [new TextRun({ text: "Calculation Bible", font: "Arial", bold: true, size: 48, color: "0F6E56" })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "alRMX Operational Diagnostic Model", size: 28, font: "Arial", color: "1A1A1A" })] }),
      divider(),
      p("Complete specification of how the model calculates operational loss, identifies constraints, and estimates recoverable value."),
      spacer(),
      p("Version 1.0 | April 2026"),
      p("Source of truth: src/lib/calculations.ts + src/lib/diagnosis-pipeline.ts"),
      spacer(),
      new Paragraph({ children: [new TextRun({ text: "CONFIDENTIAL", size: 18, font: "Arial", bold: true, color: "C0392B" })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 1. MODEL OVERVIEW ═══
      h1("1. Model Overview"),
      p("This model measures how much profit a ready-mix concrete plant is failing to capture due to operational constraints and leakage. It does not measure theoretical maximum output. It measures the gap between what the plant actually produces and what it could realistically produce with its existing assets."),
      spacer(),
      h3("Core principle"),
      p("Throughput constraint (one active) determines lost delivery volume. Lost volume multiplied by contribution margin per m3 equals lost EBITDA. Independent leakage (rejection, partial loads, surplus) adds to the total separately."),
      spacer(),
      h3("Key outputs"),
      bullet("Total monthly loss ($/month): throughput loss + additive leakage"),
      bullet("Recoverable EBITDA ($/month): 40-65% of total loss, achievable within 90 days"),
      bullet("Active constraint: Fleet, Production, or Demand"),
      bullet("Prioritized actions tied to the constraint"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 2. INPUT DEFINITIONS ═══
      h1("2. Input Definitions"),
      p("Every calculation traces back to these inputs. No hidden variables."),
      spacer(),

      new Table({
        width: { size: 9606, type: WidthType.DXA },
        columnWidths: [1600, 2600, 800, 1200, 1400, 1000],
        rows: [
          headerRow(["Input", "Description", "Unit", "Source", "Range", "Sensitivity"], [1600, 2600, 800, 1200, 1400, 1000]),
          inputRow("plant_cap", "Rated batching capacity", "m3/hr", "User", "30-200", "HIGH"),
          inputRow("op_hours", "Operating hours per day", "hours", "User (def 10)", "6-16", "HIGH"),
          inputRow("op_days", "Operating days per year", "days", "User (def 300)", "250-365", "Medium"),
          inputRow("actual_prod", "Actual monthly production", "m3/month", "User", "2,000-50,000", "HIGH"),
          inputRow("n_trucks", "Total fleet size", "count", "User", "3-50", "HIGH"),
          inputRow("truck_avail", "Trucks available daily", "count", "User", "3-50", "HIGH"),
          inputRow("turnaround", "Avg truck cycle time", "min", "Dropdown/num", "60-180", "VERY HIGH"),
          inputRow("mixer_cap", "Nominal truck capacity", "m3", "User (def 7)", "5-12", "Medium"),
          inputRow("deliveries_day", "Total deliveries per day", "count", "User", "10-200", "Medium"),
          inputRow("delivery_radius", "Avg delivery distance", "km", "Dropdown", "4-25", "Medium"),
          inputRow("price_m3", "Selling price per m3", "$/m3", "User", "30-200", "HIGH"),
          inputRow("cement_cost", "Cement cost per m3", "$/m3", "User", "10-60", "Medium"),
          inputRow("aggregate_cost", "Aggregate cost per m3", "$/m3", "User", "5-30", "Low"),
          inputRow("admix_cost", "Admixture cost per m3", "$/m3", "User", "1-15", "Low"),
          inputRow("reject_pct", "Rejection rate", "%", "User", "0-10", "Medium"),
        ]
      }),

      note("Sensitivity = how much a 10% change in this input changes the total loss output."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 3. CORE CALCULATIONS ═══
      h1("3. Core Calculations"),

      h2("3.1 Plant Capacity"),
      p("Plant practical daily capacity is 92% of rated capacity. The 8% deduction accounts for batch changeover, cleaning, and scheduling gaps that no plant avoids."),
      formula("plantDailyM3 = cap * 0.92 * opH"),
      note("Example: 75 m3/hr * 0.92 * 12 hr = 828 m3/day"),
      spacer(),
      p("Utilization is actual output divided by rated capacity:"),
      formula("actual = monthlyM3 / (opH * workingDaysMonth)"),
      formula("util = actual / cap"),
      note("Example: 15,700 / (12 * 26) = 50.3 m3/hr. util = 50.3 / 75 = 67%"),

      h2("3.2 Fleet Capacity"),
      p("Fleet capacity is what the fleet CAN deliver at current turnaround time. Not what it actually delivers."),
      formula("tripsPerTruck = (opH * 60) / ta    [continuous, not floor]"),
      formula("fleetDailyM3 = effectiveUnits * tripsPerTruck * effectiveMixCap"),
      note("Continuous trips used because TAT is estimated from dropdown categories. Floor would create artificial jumps."),
      spacer(),
      p("Effective units = min(operative trucks, qualified drivers). Captures both maintenance downtime and driver shortages."),
      formula("effectiveUnits = min(operativeTrucks, qualifiedDrivers)"),
      spacer(),
      h3("Effective mix capacity (effectiveMixCap)"),
      p("On-site (validated data): derived from actual_prod / (deliveries * workingDays). Captures partial loads automatically."),
      p("Pre-diagnosis (estimated data): uses nominal mixer_capacity directly. Derivation skipped because self-reported inputs are often inconsistent."),
      formula("ON-SITE:  effectiveMixCap = monthlyM3 / (delDay * workingDays)  [capped 3-12]"),
      formula("PRE-DX:   effectiveMixCap = mixCap  [nominal, no derivation]"),
      note("Guard: if derived deviates >30% from nominal, falls back to nominal (input inconsistency)."),

      h2("3.3 Constraint Logic"),
      p("Only one constraint is active at a time. The constraint with the lower daily capacity binds the system."),
      formula("IF fleetDailyM3 < plantDailyM3:  constraint = Fleet"),
      formula("IF fleetDailyM3 >= plantDailyM3: constraint = Production"),
      formula("IF demandSufficient == false:     constraint = Demand (special)"),
      spacer(),
      p("Target daily throughput is capped at plant capacity:"),
      formula("targetDailyM3 = min(targetFleetDailyM3, plantDailyM3)"),
      note("This prevents the model from claiming the plant can produce more than its physical ceiling."),
      spacer(),
      h3("Pre-diagnosis limitation"),
      p("In pre-diagnosis, constraint identification is unreliable because effectiveMixCap is assumed (nominal), not derived. This can flip the constraint. Therefore, pre-diagnosis does NOT label a specific constraint. It shows total loss as directional and states: 'On-site validation required.'"),
      spacer(),
      h3("Near-constraint"),
      p("When both capacities are within 15% of each other, the secondary is flagged as 'near-constraint' (diagnostic only, no financial impact)."),
      formula("ratio = min(fleet, plant) / max(fleet, plant)"),
      formula("IF ratio > 0.85: near-constraint flagged"),

      new Paragraph({ children: [new PageBreak()] }),

      h2("3.4 Hidden Volume (m3 gap)"),
      p("The gap between what the plant produces and what it could produce at target performance."),
      formula("gapDailyM3 = targetDailyM3 - actualDailyM3"),
      formula("gapMonthlyM3 = gapDailyM3 * workingDaysMonth"),
      note("Example: (828 - 604) * 26 = 5,824 m3/month"),

      h2("3.5 Financial Conversion"),
      p("Volume gap is converted to financial impact using contribution margin, not selling price. Contribution margin = price - (cement + aggregate + admixture)."),
      formula("throughputLossUSD = gapMonthlyM3 * contribSafe * seasonalFactor"),
      spacer(),
      p("contribSafe: when material costs are incomplete (only cement entered), contribution = price - cement, which inflates margin. contribSafe falls back to price * 35% in that case."),
      formula("IF costs incomplete: contribSafe = price * 0.35"),
      formula("IF costs complete:  contribSafe = price - cement - agg - admix"),
      spacer(),
      p("Revenue equivalent (for context, not for loss calculation):"),
      formula("lostRevenueMonthly = gapMonthlyM3 * price"),
      note("Revenue is shown as supporting context only. The model reports EBITDA (contribution margin)."),

      h2("3.6 Recoverable Share"),
      p("Not all of the gap is recoverable within 90 days. The recoverable share is 40-65% of total loss."),
      formula("recoveryLo = totalLoss * 0.40"),
      formula("recoveryHi = totalLoss * 0.65"),
      spacer(),
      p("Why not 100%: operational improvements take time to implement. Turnaround reduction requires behavior change across the fleet and customer sites. Full recovery typically requires 6-12 months of sustained improvement."),
      p("Why 40%: conservative lower bound assumes partial implementation and resistance to change."),
      p("Why 65%: optimistic upper bound assumes strong execution and favorable conditions."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 4. ADDITIVE LOSSES ═══
      h1("4. Additive Losses (Independent of Constraint)"),
      p("These losses exist regardless of which constraint is active. They are calculated separately and added to throughput loss."),
      spacer(),
      h3("Rejection (material loss only)"),
      formula("rejectMaterialLoss = rejectPct/100 * delDay * effectiveMixCap * materialCost * days"),
      note("Only material cost (cement + agg + admix) is counted. Opportunity cost (wasted truck cycle) is excluded because it overlaps with throughput loss."),
      spacer(),
      h3("Partial loads"),
      formula("partialLeak = (mixCap - partialLoad) * delDay * partialFraction * contribSafe * days"),
      note("Trucks running below capacity. partialFraction defaults to 30% if not reported."),
      spacer(),
      h3("Surplus concrete waste"),
      formula("surplusLeak = surplusMid * delDay * materialCost * days"),
      note("Overproduced concrete that cannot be sold. Costed at material only."),
      spacer(),
      h3("Truck breakdown costs"),
      formula("breakdownCost = breakdowns * repairEstimate"),
      note("Repair and towing costs. Capacity impact already captured in effectiveUnits."),
      spacer(),
      h3("Total loss formula"),
      formula("totalLoss = throughputLoss + rejectMaterial + partialLeak + surplusLeak + breakdownCost"),
      note("Demurrage is NOT included in total. It is a recovery opportunity, not a loss."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 5. INTERACTION & SENSITIVITY ═══
      h1("5. Interaction and Sensitivity"),
      p("The model is most sensitive to these variables (in order):"),
      spacer(),
      h3("1. Turnaround time (VERY HIGH)"),
      p("TAT determines trips per truck per day. A 10-minute change at 112 min TAT changes fleet capacity by ~9%, which directly changes throughput loss by ~$15,000/month for a typical plant."),
      note("This is the single most impactful variable. It is also the least precisely measured (dropdown categories with 25-min ranges)."),
      spacer(),
      h3("2. Plant capacity (HIGH)"),
      p("Sets the ceiling. A 10% change in cap shifts plant daily capacity and can flip the constraint between Fleet and Production."),
      spacer(),
      h3("3. Contribution margin (HIGH)"),
      p("Direct multiplier on all financial outputs. A $5/m3 change scales every dollar figure by 20-25%."),
      spacer(),
      h3("4. Effective trucks (HIGH)"),
      p("Directly scales fleet capacity. Losing 2 trucks from 16 effective reduces fleet capacity by 12.5%."),
      spacer(),
      h3("Propagation example"),
      p("TAT changes from 112 to 100 min:"),
      formula("Trips: 6.4 -> 7.2 per truck (+12.5%)"),
      formula("Fleet capacity: 776 -> 873 m3/day (+12.5%)"),
      formula("Gap: 52 -> 0 m3/day (gap closes if fleet > plant)"),
      formula("Throughput loss: $145,700 -> $0 (constraint flips to Production)"),
      note("A 12-minute TAT improvement can eliminate the entire fleet-driven loss if it pushes fleet capacity above plant capacity."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 6. PRE-DIAGNOSIS vs ON-SITE ═══
      h1("6. Pre-diagnosis vs On-site Behavior"),
      spacer(),
      new Table({
        width: { size: 9606, type: WidthType.DXA },
        columnWidths: [2400, 3600, 3606],
        rows: [
          headerRow(["Aspect", "Pre-diagnosis", "On-site"], [2400, 3600, 3606]),
          inputRow("Data quality", "Self-reported (dropdown)", "Measured / validated", "", "", ""),
          inputRow("Constraint certainty", "LOW (not labeled)", "HIGH (Fleet/Production/Demand)", "", "", ""),
          inputRow("effectiveMixCap", "Nominal (assumed)", "Derived from actual data", "", "", ""),
          inputRow("Output precision", "Range (directional)", "Point estimate (validated)", "", "", ""),
          inputRow("Constraint label", "NOT shown", "Shown with confidence", "", "", ""),
          inputRow("TAT source", "Dropdown (25-min range)", "Observed / GPS", "", "", ""),
          inputRow("Financial output", "Total loss range only", "Throughput + leakage split", "", "", ""),
        ].map((row, i) => {
          if (i === 0) return row;
          return new TableRow({ children: row.children || [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: "", size: 18, font: "Arial" })] })] }),
          ] });
        }),
      }),

      note("Pre-diagnosis exists to identify whether a plant has a significant profit gap. It is not a diagnosis. It is an indicator that says: there is likely $X/month at stake, worth investigating on-site."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 7. FAILURE MODES ═══
      h1("7. Failure Modes"),
      p("The model produces unreliable output in these scenarios:"),
      spacer(),
      h3("7.1 Production exceeds capacity"),
      p("If reported actual_prod > cap * opH * workingDays * 1.05, inputs are contradictory. The model flags INCONSISTENT and sets dataQuality = insufficient."),
      spacer(),
      h3("7.2 Deliveries exceed truck capacity"),
      p("If delDay > effectiveUnits * 15 (no truck does 15+ trips/day), inputs are contradictory. Same flag."),
      spacer(),
      h3("7.3 TAT dropdown creates constraint flip"),
      p("TAT '100-125 min' maps to 112. At 100 min, fleet capacity may exceed plant. At 125 min, fleet is clearly constrained. The model cannot distinguish. In pre-diagnosis, constraint is not labeled."),
      spacer(),
      h3("7.4 effectiveMixCap derivation with inconsistent inputs"),
      p("If actual_prod and delDay are both estimated independently, derived effectiveMixCap may be unreliable. The 30% guard catches extreme cases. In pre-diagnosis, derivation is skipped entirely."),
      spacer(),
      h3("7.5 Demand-constrained misidentification"),
      p("demandSufficient is self-reported. A plant manager may say 'demand is fine' when it is actually the constraint. The model cannot detect this except through inconsistency between util and fleet capacity."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 8. INTERPRETATION GUIDE ═══
      h1("8. Interpretation Guide"),
      spacer(),
      h3("What '$200k/month loss' means"),
      p("The plant is producing $200k/month less contribution margin than it could with the same assets, same trucks, same demand. It is not 'lost revenue' (revenue would be higher by a factor of price/margin). It is not 'theoretical maximum' (target is 85% utilization, not 100%)."),
      spacer(),
      h3("How to interpret ranges"),
      p("Pre-diagnosis: +/-18% range on total loss reflects input uncertainty. On-site: ranges on recovery reflect execution uncertainty (40-65% recoverable in 90 days)."),
      spacer(),
      h3("What NOT to conclude"),
      bullet("Do not treat pre-diagnosis constraint label as confirmed (it is not shown for this reason)"),
      bullet("Do not add throughput loss + recovery opportunity + cost savings. They are different categories."),
      bullet("Do not assume recovery is automatic. It requires sustained operational change."),
      bullet("Do not compare across plants using pre-diagnosis numbers. On-site validation is needed for comparison."),
      spacer(),
      h3("What the model does NOT measure"),
      bullet("Traffic congestion patterns"),
      bullet("Project type variation (high-rise vs ground pour)"),
      bullet("Driver behavior and break patterns"),
      bullet("Multi-shift dynamics"),
      bullet("Demand variation within the month"),
      bullet("Customer-specific site conditions"),

      spacer(), spacer(),
      divider(),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "End of Calculation Bible v1.0", size: 18, font: "Arial", color: "999999", italics: true }),
      ] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('C:/Users/lsh29/Desktop/alRMX_Calculation_Bible_v1.docx', buffer);
  console.log('Generated: alRMX_Calculation_Bible_v1.docx');
});
