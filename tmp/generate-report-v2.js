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

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] }) }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }) }
function h3(t) { return new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 22, font: "Arial" })] }) }
function p(t, o = {}) { return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 22, font: "Arial", ...o })] }) }
function bold(t) { return new TextRun({ text: t, bold: true, size: 22, font: "Arial" }) }
function normal(t) { return new TextRun({ text: t, size: 22, font: "Arial" }) }
function red(t) { return new TextRun({ text: t, bold: true, size: 22, font: "Arial", color: "C0392B" }) }
function green(t) { return new TextRun({ text: t, bold: true, size: 22, font: "Arial", color: "1A6644" }) }
function amber(t) { return new TextRun({ text: t, bold: true, size: 22, font: "Arial", color: "C96A00" }) }
function spacer() { return new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }) }
function divider() { return new Paragraph({ spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "0F6E56", space: 1 } }, children: [] }) }
function bullet(t) { return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: t, size: 22, font: "Arial" })] }) }
function numItem(t, ref = "numbers") { return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, size: 22, font: "Arial" })] }) }

function kpiRow(label, value, target, status) {
  const bg = status === 'red' ? 'FDECEC' : status === 'amber' ? 'FFF8ED' : 'F0FAF6';
  const fg = status === 'red' ? 'C0392B' : status === 'amber' ? 'C96A00' : '1A6644';
  const st = status === 'red' ? 'Below target' : status === 'amber' ? 'Needs improvement' : 'On track';
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: label, size: 21, font: "Arial" })] })] }),
    new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: value, bold: true, size: 21, font: "Arial Narrow" })] })] }),
    new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: target, size: 21, font: "Arial", color: "666666" })] })] }),
    new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: { fill: bg, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: st, bold: true, size: 20, font: "Arial", color: fg })] })] }),
  ] });
}

function headerRow() {
  const hdr = { bold: true, size: 18, font: "Arial", color: "666666" };
  return new TableRow({ children: ['METRIC','ACTUAL','TARGET','STATUS'].map(h =>
    new TableCell({ borders, width: { size: h === 'METRIC' ? 3000 : h === 'STATUS' ? 2360 : 2000, type: WidthType.DXA },
      shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, ...hdr })] })] })
  ) });
}

function lossRow(label, amount, cat) {
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: label, size: 21, font: "Arial", bold: cat === 'total' })] })] }),
    new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      shading: cat === 'total' ? { fill: 'FDECEC', type: ShadingType.CLEAR } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: '$' + Math.round(amount).toLocaleString(), bold: true, size: 21, font: "Arial", color: cat === 'throughput' || cat === 'total' ? 'C0392B' : 'C96A00' })] })] }),
    new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: cat === 'throughput' ? 'Throughput' : cat === 'leakage' ? 'Leakage' : '', size: 20, font: "Arial", color: "999999" })] })] }),
  ] });
}

const doc = new Document({
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Arial", color: "0F6E56" }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Arial", color: "1A1A1A" }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1200, bottom: 1200, left: 1200 } }
    },
    headers: { default: new Header({ children: [new Paragraph({ children: [
      new TextRun({ text: "alRMX", font: "Arial", bold: true, size: 18, color: "0F6E56" }),
      new TextRun({ text: "  |  Operational Assessment Report  |  Confidential", font: "Arial", size: 16, color: "999999" }),
    ], border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "0F6E56", space: 4 } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Al Noor Ready Mix \u2013 Riyadh East  |  Page ", size: 16, color: "999999", font: "Arial" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999", font: "Arial" }),
    ] })] }) },
    children: [
      // COVER
      spacer(), spacer(), spacer(), spacer(),
      new Paragraph({ children: [new TextRun({ text: "alRMX", font: "Arial", bold: true, size: 52, color: "0F6E56" })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Operational Assessment Report", size: 36, font: "Arial", color: "1A1A1A" })] }),
      divider(),
      new Paragraph({ spacing: { after: 80 }, children: [bold("Al Noor Ready Mix \u2013 Riyadh East")] }),
      p("Assessment type: On-site (peak season)"), p("Date: April 2026"), p("Prepared by: alRMX Operations Advisory"),
      spacer(), spacer(),
      new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "CONFIDENTIAL", size: 20, font: "Arial", bold: true, color: "C0392B" })] }),
      p("This document contains commercially sensitive operational and financial data.", { color: "666666", size: 20 }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. EXECUTIVE SUMMARY
      h1("1. Executive Summary"),
      new Paragraph({ spacing: { after: 100 }, children: [
        normal("This plant is losing "), red("$237,000/month"), normal(" in recoverable EBITDA."),
      ] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        normal("Driven by slow truck turnaround. Trucks complete 6.4 deliveries per day instead of 8 at target."),
      ] }),

      h3("Profit gap"),
      new Paragraph({ spacing: { after: 80 }, children: [
        bold("Primary focus: "), normal("Reduce turnaround time \u2192 "), red("$145,700/month"), normal(" throughput impact"),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [
        bold("Secondary: "), normal("Reduce operational leakage \u2192 "), amber("$91,800/month"),
      ] }),

      h3("Recoverable EBITDA"),
      new Paragraph({ spacing: { after: 80 }, children: [
        green("$95,000\u2013$154,000/month"), normal(" in recoverable EBITDA within 90 days"),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Equivalent to $140,000\u2013$227,000/month in recoverable revenue at current sales price ($60/m\u00B3)."),
      ] }),
      new Paragraph({ spacing: { after: 100 }, children: [
        normal("This is not new demand. It is revenue currently lost due to operational constraints, recoverable by improving turnaround time and dispatch coordination.", { color: "666666" }),
      ] }),

      h3("How this is derived"),
      p("Lost volume: ~5,800 m\u00B3/month not being delivered despite existing demand"),
      p("\u00D7 $60/m\u00B3 selling price = ~$349,000/month in lost revenue"),
      p("\u00D7 $25/m\u00B3 contribution margin = ~$146,000/month in lost EBITDA"),
      new Paragraph({ spacing: { after: 200 }, children: [
        normal("Recoverable share (90 days): 40\u201365% = "), green("$95,000\u2013$154,000/month"),
      ] }),
      p("The range reflects execution realism. The full operational gap is $237,000/month, but only a portion is recoverable within the first 90 days. Full recovery requires sustained improvement over 6\u201312 months.", { color: "666666", size: 20 }),

      h3("Key numbers"),
      new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [5000, 4360], rows: [
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Active constraint")] })] }),
          new TableCell({ borders: noBorders, width: { size: 4360, type: WidthType.DXA }, children: [new Paragraph({ children: [red("Fleet (turnaround)")] })] }),
        ] }),
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Turnaround time")] })] }),
          new TableCell({ borders: noBorders, width: { size: 4360, type: WidthType.DXA }, children: [new Paragraph({ children: [bold("112 min (target 84 min)")] })] }),
        ] }),
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Claim strength")] })] }),
          new TableCell({ borders: noBorders, width: { size: 4360, type: WidthType.DXA }, children: [new Paragraph({ children: [bold("Strongly supported")] })] }),
        ] }),
      ] }),

      h3("Priority actions"),
      numItem("Introduce structured ETA communication to sites (30 min before arrival) \u2013 reduces site waiting, a key component of turnaround"),
      numItem("Enforce demurrage for site waits over 40 min \u2013 changes customer behavior and reduces idle time"),
      numItem("Schedule sensor calibration within 14 days \u2013 reduces rejection rate from 2.9% toward 2%"),

      new Paragraph({ children: [new PageBreak()] }),

      // 2. PROFIT BREAKDOWN
      h1("2. Profit Breakdown"),
      p("Total monthly loss is split into two categories: constrained output (throughput limited by the active constraint) and operational leakage (independent losses that exist regardless of the constraint)."),

      new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [5000, 2360, 2000], rows: [
        new TableRow({ children: ['COMPONENT','MONTHLY LOSS','CATEGORY'].map((h, i) =>
          new TableCell({ borders, width: { size: [5000,2360,2000][i], type: WidthType.DXA },
            shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: "Arial", color: "666666" })] })] })
        ) }),
        lossRow("Constrained output (Fleet)", 145700, 'throughput'),
        lossRow("Rejection (material loss)", 27318, 'leakage'),
        lossRow("Partial loads (underloaded trucks)", 39000, 'leakage'),
        lossRow("Surplus concrete waste", 25480, 'leakage'),
        lossRow("TOTAL MONTHLY LOSS", 237498, 'total'),
      ] }),

      spacer(),
      h3("Recovery opportunities (not included in total)"),
      p("Demurrage enforcement: not currently active. Potential recovery depends on contract terms and customer relationships."),
      spacer(),
      p("Note: Throughput loss and leakage are never added together with recovery opportunities. Recovery is separate and incremental.", { color: "666666", size: 20 }),

      new Paragraph({ children: [new PageBreak()] }),

      // 3. CONSTRAINT ANALYSIS
      h1("3. Constraint Analysis: Fleet"),

      new Paragraph({ spacing: { after: 100 }, children: [
        normal("The active constraint is "), red("Fleet"), normal("."),
      ] }),
      new Paragraph({ spacing: { after: 160 }, children: [
        normal("This is a fleet constraint because trucks complete too few cycles per day, limiting total output below what the plant can produce."),
      ] }),

      h3("Why Fleet, not Production"),
      new Paragraph({ spacing: { after: 100 }, children: [normal("Fleet capacity: "), bold("776 m\u00B3/day"), normal(" (at current 112 min TAT)")] }),
      new Paragraph({ spacing: { after: 100 }, children: [normal("Plant capacity: "), bold("828 m\u00B3/day"), normal(" (practical ceiling)")] }),
      p("Fleet capacity is below plant capacity. The plant has idle time because trucks cannot cycle fast enough. Production is not the constraint."),

      h3("Throughput calculation"),
      p("Current performance:"),
      p("TAT: 112 min \u2192 6.4 trips per truck per day"),
      p("\u2192 16 effective trucks \u00D7 6.4 trips \u00D7 7.5 m\u00B3 = 776 m\u00B3/day"),
      spacer(),
      p("At target turnaround (84 min):"),
      p("\u2192 828 m\u00B3/day achievable (capped at plant capacity)"),
      spacer(),
      p("Daily output gap: 224 m\u00B3/day (828 target \u2212 604 actual)"),
      p("\u2192 224 m\u00B3/day \u00D7 26 operating days = 5,824 m\u00B3/month"),
      new Paragraph({ spacing: { after: 160 }, children: [normal("\u2192 5,824 m\u00B3/month \u00D7 $25/m\u00B3 contribution margin = "), red("$145,700/month")] }),

      h3("Turnaround breakdown"),
      p("Detailed component breakdown not measured during this assessment. Based on typical GCC ready-mix patterns, the excess is concentrated in site waiting and plant queue time."),

      h3("Mechanism"),
      p("Trucks are not released in a steady flow. Without structured dispatch sequencing, trucks queue at the batching plant during peak ordering periods. Sites receive limited advance notice of arrival, reducing site readiness at truck arrival. The reported daily plant idle time suggests trucks return in waves rather than at staggered intervals."),

      new Paragraph({ children: [new PageBreak()] }),

      // 4. LEAKAGE ANALYSIS
      h1("4. Leakage Analysis"),
      p("The following losses are independent of the active constraint. They exist regardless of whether Fleet or Production is limiting throughput and are additive to the constraint loss."),

      h3("Rejection (material loss): $27,318/month"),
      p("Rejection rate: 2.9% (target: below 2%). Each rejected load wastes raw materials (cement, aggregates, admixture) at approximately $40/m\u00B3 material cost. Split: approximately 50% plant-side causes (batching, dosing), 50% customer-side causes (site unreadiness, delays)."),
      p("Note: the opportunity cost of wasted truck cycles from rejection is NOT included here. That capacity loss is already captured in the Fleet throughput constraint."),

      h3("Partial loads: $39,000/month"),
      p("Average load size is 7 m\u00B3 against 10 m\u00B3 truck capacity. Approximately 25% of deliveries are partial loads. Each partial load wastes 3 m\u00B3 of truck capacity per trip."),

      h3("Surplus concrete waste: $25,480/month"),
      p("Estimated 0.2\u20130.5 m\u00B3 of surplus concrete per delivery. This concrete is batched but not sold, representing wasted raw material cost."),

      new Paragraph({ children: [new PageBreak()] }),

      // 5. ACTIONS
      h1("5. Recommended Actions"),

      h3("Action 1: Structured ETA communication to sites"),
      p("Dispatcher sends ETA to site foreman 30 min before truck arrival with load details and expected pour time. Initially via WhatsApp with a standard message template."),
      p("How this reduces turnaround: Site waiting is a major component of the 112 min cycle. When sites know the truck is coming, pump crews are staged before arrival, reducing site idle time."),
      new Paragraph({ spacing: { after: 100 }, children: [normal("Timeline: "), bold("This week")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Verification: Ask 3 site foremen after 1 week whether they knew the truck was coming.")] }),

      h3("Action 2: Enforce demurrage for site waits over 40 min"),
      p("Where commercially viable, add demurrage clause to contracts ($2/min after 40 min). For key accounts where penalties are not realistic, share site-wait performance data in monthly reviews instead."),
      p("How this reduces turnaround: Demurrage changes customer behavior. Sites that face a cost for delays prepare faster, reducing the wait component of turnaround."),
      new Paragraph({ spacing: { after: 100 }, children: [normal("Timeline: "), bold("This month (new contracts), 90 days (existing)")] }),

      h3("Action 3: Sensor calibration"),
      p("Schedule water-cement ratio sensor calibration within 14 days (water meter, aggregate moisture probe, cement scale). Implement mandatory slump test at dispatch point before every truck leaves."),
      p("How this reduces leakage: Calibration reduces batching errors that cause rejections. Targets rejection rate from 2.9% to below 2%, recovering approximately $10,000/month in wasted materials."),
      new Paragraph({ spacing: { after: 100 }, children: [normal("Timeline: "), bold("This week (schedule), 2 weeks (complete)")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Verification: Pull batch tickets for 30 days after calibration. Compare rejection rate to baseline 2.9%.")] }),

      h3("Action 4: Track site wait per delivery"),
      p("Record arrival-to-pour time for every delivery over 2 weeks. Share results with top 5 customers."),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This month")] }),

      new Paragraph({ children: [new PageBreak()] }),

      // 6. IMPLEMENTATION ROADMAP
      h1("6. Implementation Roadmap (90 Days)"),

      h3("Week 1\u20132: Immediate"),
      bullet("Start ETA communication to all sites (WhatsApp template)"),
      bullet("Schedule sensor calibration"),
      bullet("Begin tracking site wait per delivery"),

      h3("Month 1: Stabilization"),
      bullet("Complete sensor calibration. Start mandatory slump testing."),
      bullet("Draft demurrage clause for new contracts"),
      bullet("Review site wait data from first 2 weeks"),
      bullet("Share site-wait performance with top 5 customers"),

      h3("Month 2\u20133: Optimization"),
      bullet("Enforce demurrage on new contracts"),
      bullet("Assess whether site wait is declining"),
      bullet("Review rejection rate trend (target: below 2%)"),
      bullet("Evaluate whether turnaround has improved toward 95 min"),
      bullet("If turnaround is still above 100 min, assess dispatch sequencing"),

      spacer(),
      new Paragraph({ spacing: { after: 160 }, children: [
        normal("Target at 90 days: "), green("Turnaround below 100 min. Recovery of $85,000\u2013$138,000/month realized."),
      ] }),

      new Paragraph({ children: [new PageBreak()] }),

      // 7. CONFIDENCE
      h1("7. Confidence and Data Quality"),

      h3("Claim strength: Strongly supported"),
      p("Core performance metrics reported and consistent. Multiple operational signals support Fleet as the active constraint. Detailed TAT component breakdown would strengthen the conclusion further."),

      h3("Observed"),
      bullet("Dispatch runs on spreadsheet combined with WhatsApp"),
      bullet("Zone routing is informal and inconsistent"),
      bullet("Plant sits idle daily waiting for trucks to return"),
      bullet("Rejection rate 2.9%"),

      h3("Inferred"),
      bullet("Truck departures are not time-spaced, creating queue buildup at the batching plant during peak ordering periods"),
      bullet("Sites receive limited advance notice of arrival, reducing site readiness"),

      h3("What would improve this estimate"),
      bullet("3 days of timestamped truck departure data"),
      bullet("Site-level waiting time per delivery"),
      bullet("GPS-based trip breakdown (transit vs idle split)"),

      h3("Model limits"),
      bullet("Traffic congestion patterns not modeled"),
      bullet("Project type variation (high-rise vs ground pour) not differentiated"),
      bullet("Driver behavior and break patterns not captured"),

      spacer(), spacer(), divider(), spacer(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
        new TextRun({ text: "End of Report", size: 20, font: "Arial", color: "999999", italics: true }),
      ] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "alRMX Operations Advisory", size: 20, font: "Arial", color: "0F6E56", bold: true }),
      ] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const path = 'C:/Users/lsh29/Desktop/AlNoor_RiyadhEast_Assessment_FINAL.docx';
  fs.writeFileSync(path, buffer);
  console.log('Report generated: ' + path);
});
