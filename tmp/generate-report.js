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

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, font: "Arial" })]
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, font: "Arial", ...opts })]
  });
}
function bold(text) {
  return new TextRun({ text, bold: true, size: 22, font: "Arial" });
}
function normal(text) {
  return new TextRun({ text, size: 22, font: "Arial" });
}
function italic(text) {
  return new TextRun({ text, italics: true, size: 22, font: "Arial", color: "666666" });
}
function red(text) {
  return new TextRun({ text, bold: true, size: 22, font: "Arial", color: "C0392B" });
}
function green(text) {
  return new TextRun({ text, bold: true, size: 22, font: "Arial", color: "1A6644" });
}
function spacer() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [] });
}
function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "0F6E56", space: 1 } },
    children: []
  });
}
function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial" })]
  });
}
function numItem(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: "Arial" })]
  });
}

function kpiRow(label, value, target, status) {
  const statusColor = status === 'red' ? 'FDECEC' : status === 'amber' ? 'FFF8ED' : 'F0FAF6';
  const textColor = status === 'red' ? 'C0392B' : status === 'amber' ? 'C96A00' : '1A6644';
  return new TableRow({
    children: [
      new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: label, size: 21, font: "Arial" })] })] }),
      new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: value, bold: true, size: 21, font: "Arial Narrow" })] })] }),
      new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: target, size: 21, font: "Arial", color: "666666" })] })] }),
      new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { fill: statusColor, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: status === 'red' ? 'Below target' : status === 'amber' ? 'Needs improvement' : 'On track', bold: true, size: 20, font: "Arial", color: textColor })] })] }),
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "0F6E56" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "1A1A1A" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1200, bottom: 1200, left: 1200 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "alRMX", font: "Arial", bold: true, size: 18, color: "0F6E56" }),
            new TextRun({ text: "  |  Operational Assessment Report  |  Confidential", font: "Arial", size: 16, color: "999999" }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "0F6E56", space: 4 } },
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Al Noor Ready Mix \u2013 Riyadh East  |  ", size: 16, color: "999999", font: "Arial" }),
            new TextRun({ text: "Page ", size: 16, color: "999999", font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999", font: "Arial" }),
          ]
        })]
      })
    },
    children: [

      // ═══════════════════════════════════════════════════════════════
      // COVER
      // ═══════════════════════════════════════════════════════════════
      spacer(), spacer(), spacer(), spacer(), spacer(),
      new Paragraph({ alignment: AlignmentType.LEFT, children: [
        new TextRun({ text: "alRMX", font: "Arial", bold: true, size: 52, color: "0F6E56" }),
      ] }),
      new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: "Operational Assessment Report", size: 36, font: "Arial", color: "1A1A1A" }),
      ] }),
      divider(),
      new Paragraph({ spacing: { after: 80 }, children: [
        new TextRun({ text: "Al Noor Ready Mix \u2013 Riyadh East", size: 28, font: "Arial", bold: true }),
      ] }),
      p("Assessment type: On-site (peak season)"),
      p("Assessment date: April 2026"),
      p("Prepared by: alRMX Operations Advisory"),
      spacer(), spacer(),
      new Paragraph({ spacing: { before: 400 }, children: [
        new TextRun({ text: "CONFIDENTIAL", size: 20, font: "Arial", bold: true, color: "C0392B" }),
      ] }),
      p("This document contains commercially sensitive operational and financial data.", { color: "666666", size: 20 }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 1. EXECUTIVE SUMMARY
      // ═══════════════════════════════════════════════════════════════
      h1("1. Executive Summary"),

      new Paragraph({ spacing: { after: 200 }, children: [
        normal("This plant is losing approximately "),
        red("$297,000/month"),
        normal(" in recoverable value. The primary constraint is "),
        red("dispatch coordination"),
        normal(", which drives queue buildup at the plant and uncoordinated site arrivals."),
      ] }),

      new Paragraph({ spacing: { after: 160 }, children: [
        normal("The plant operates at "),
        bold("67% utilization"),
        normal(" despite high demand. Turnaround averages "),
        bold("112 min"),
        normal(" vs an 80\u201390 min target. Trucks complete "),
        bold("5\u20136 deliveries/day"),
        normal(" instead of the achievable 7\u20138. The gap is not caused by fleet size (management\u2019s current assumption) but by how trucks are released and coordinated."),
      ] }),

      h3("Key numbers"),
      new Table({
        width: { size: 9506, type: WidthType.DXA },
        columnWidths: [5000, 4506],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Monthly revenue at risk")] })] }),
            new TableCell({ borders: noBorders, width: { size: 4506, type: WidthType.DXA }, children: [new Paragraph({ children: [red("$297,000/month")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Primary constraint")] })] }),
            new TableCell({ borders: noBorders, width: { size: 4506, type: WidthType.DXA }, children: [new Paragraph({ children: [bold("Dispatch coordination")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Estimated recoverable (90 days)")] })] }),
            new TableCell({ borders: noBorders, width: { size: 4506, type: WidthType.DXA }, children: [new Paragraph({ children: [green("$150,000\u2013$200,000/month")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 5000, type: WidthType.DXA }, children: [new Paragraph({ children: [normal("Capacity at risk")] })] }),
            new TableCell({ borders: noBorders, width: { size: 4506, type: WidthType.DXA }, children: [new Paragraph({ children: [bold("~33% of installed capacity")] })] }),
          ] }),
        ]
      }),

      spacer(),
      h3("Priority actions"),
      numItem("Introduce time-slotted dispatch (max 2 trucks per 15-min window) \u2013 expected recovery ~$105k/mo"),
      numItem("Structured ETA communication to sites 30 min before arrival \u2013 expected recovery ~$47k/mo"),
      numItem("Geographic zone routing during peak ordering periods \u2013 expected recovery ~$30k/mo"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 2. OPERATIONAL DIAGNOSIS
      // ═══════════════════════════════════════════════════════════════
      h1("2. Operational Diagnosis"),

      p("Al Noor Riyadh East operates a 75 m\u00B3/hr batching plant with a fleet of 20 trucks (16 effective daily). The plant runs 12 hours/day, 26 days/month, giving a theoretical monthly capacity of 23,400 m\u00B3. Actual production is approximately 15,700 m\u00B3/month (67% utilization)."),

      p("Demand is not the constraint. The plant reports high order volume and regular delivery delays. The gap between 67% actual and 85\u201390% target utilization is operational, not commercial."),

      h3("Performance vs. target"),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 2000, 2000, 2360],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "METRIC", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "ACTUAL", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "TARGET", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "STATUS", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
          ] }),
          kpiRow("Plant utilization", "67%", "85\u201390%", "red"),
          kpiRow("Turnaround time", "112 min", "80\u201390 min", "red"),
          kpiRow("Dispatch time", "32 min", "15 min", "red"),
          kpiRow("Deliveries/truck/day", "5\u20136", "7\u20138", "amber"),
          kpiRow("Fleet utilization", "70%", "85%+", "amber"),
          kpiRow("Rejection rate", "2.9%", "<2%", "amber"),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 3. BOTTLENECK ANALYSIS
      // ═══════════════════════════════════════════════════════════════
      h1("3. Bottleneck Analysis"),

      new Paragraph({ spacing: { after: 160 }, children: [
        normal("The primary constraint is "),
        red("dispatch coordination"),
        normal(". This is not a fleet size problem (management\u2019s current assumption). The 20-truck fleet has sufficient capacity if turnaround is reduced to target. The constraint is how trucks are released and coordinated."),
      ] }),

      h3("How dispatch drives the loss"),

      bullet("Trucks are released in clusters of 3\u20135 during peak periods, creating queue buildup at the batching plant. Plant-side waiting averages 20\u201330 min per truck."),
      bullet("Without structured sequencing, trucks from the same zone depart at different times and cross paths, adding avoidable transit time."),
      bullet("Sites receive less than 15 min advance notice. Pump crews are not staged when trucks arrive. Site waiting averages 25\u201335 min per delivery."),
      bullet("The combined idle time (plant queue + site wait) consumes 45\u201365 min per cycle that could be used for additional deliveries."),
      bullet("This is why trucks complete 5\u20136 trips/day instead of 7\u20138, despite adequate fleet size."),

      spacer(),
      new Paragraph({ spacing: { after: 120 }, children: [
        italic("Note: Management believes fleet size is the main constraint. This assessment shows that adding trucks without fixing dispatch will add more trucks to the same queues, not more deliveries."),
      ] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 4. ROOT CAUSE ANALYSIS
      // ═══════════════════════════════════════════════════════════════
      h1("4. Root Cause Analysis"),

      h3("Observed (confirmed on-site)"),
      bullet("Dispatch runs on spreadsheet combined with WhatsApp. No automated sequencing or scheduling."),
      bullet("Zone routing exists informally but is inconsistently followed. Depends on individual dispatcher judgment."),
      bullet("Trucks visibly queue at the plant during peak hours (06:00\u201310:00). 3\u20135 trucks observed waiting simultaneously."),
      bullet("Plant experiences both congestion periods (morning peak) and idle periods (midday when trucks are in transit)."),
      bullet("No formal measurement of truck departure intervals or site readiness timing."),
      bullet("No KPI tracking for dispatch performance."),

      h3("Inferred (based on observed patterns)"),
      bullet("Trucks are released in clusters rather than at steady intervals because no time-spacing mechanism exists."),
      bullet("The lack of advance ETA communication means sites cannot prepare, extending site wait to 25\u201335 min."),
      bullet("Dispatch variability creates a compounding effect: queue at plant leads to late site arrival leads to unprepared site leads to extended wait leads to late return leads to more queue."),
      bullet("The 2.9% rejection rate is partially driven by extended turnaround. Concrete sits longer in the drum, losing workability in Riyadh summer heat."),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 5. FINANCIAL IMPACT
      // ═══════════════════════════════════════════════════════════════
      h1("5. Financial Impact"),

      h3("How the loss is calculated"),
      p("The plant produces ~15,700 m\u00B3/month at 67% utilization. At 85% utilization (practical target given high demand), the plant would produce ~19,890 m\u00B3/month. The gap is ~4,190 m\u00B3/month."),

      new Paragraph({ spacing: { after: 120 }, children: [
        normal("At $20/m\u00B3 contribution margin, the capacity gap translates to approximately "),
        red("~$84,000/month"),
        normal(" in lost contribution from underutilization alone."),
      ] }),

      p("Additionally, turnaround excess (22\u201332 min per cycle) reduces fleet throughput. Each excess minute across 16 effective trucks and 26 operating days compounds to significant lost delivery capacity. The turnaround-driven loss is estimated at ~$189,000/month."),

      p("Quality losses from the 2.9% rejection rate (material cost + wasted cycle) add ~$24,000/month."),

      h3("Loss breakdown"),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [5000, 2360, 2000],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "DIMENSION", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "MONTHLY LOSS", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "CATEGORY", bold: true, size: 18, font: "Arial", color: "666666" })] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [bold("Dispatch / Turnaround")] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [red("$189,000")] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("Primary")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("Production underutilization")] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("$84,000")] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("Linked to dispatch")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("Quality / Rejections")] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("$24,000")] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [normal("Independent")] })] }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, shading: { fill: "FDECEC", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [bold("TOTAL")] })] }),
            new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, shading: { fill: "FDECEC", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [red("~$297,000")] })] }),
            new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: "FDECEC", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [] })] }),
          ] }),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 6. RECOMMENDED ACTIONS
      // ═══════════════════════════════════════════════════════════════
      h1("6. Recommended Actions"),

      // Action 1
      h3("Action 1: Time-slotted dispatch"),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Maximum 2 trucks released within any 15-minute window. Eliminates queue buildup at plant. Spreads truck departures evenly across operating hours."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Why it works: Clustered releases create queues of 3\u20135 trucks. Time-spacing ensures the batching plant always has a truck to load but never a queue. This directly converts plant-side waiting time (20\u201330 min) into additional delivery cycles."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [normal("Expected recovery: "), green("~$105,000/month")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This week")] }),

      // Action 2
      h3("Action 2: Structured ETA communication"),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Dispatcher sends ETA to site foreman 30 minutes before truck arrival with load details and expected pour time. Initially via WhatsApp, structured as a standard message template."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Why it works: Sites currently receive less than 15 min notice. Pump crews are not staged when trucks arrive. A 30-min advance ETA allows the site to prepare, reducing site waiting from 25\u201335 min toward 15 min."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [normal("Expected recovery: "), green("~$47,000/month")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This week")] }),

      // Action 3
      h3("Action 3: Geographic zone routing"),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Assign fixed truck-zone pairs during peak ordering periods. Trucks serving the same geographic area depart in sequence, reducing cross-routing and transit time."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Why it works: Without zoning, trucks going to nearby sites depart at different times and cross paths. Zoning reduces average transit time and creates predictable arrival patterns at sites."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [normal("Expected recovery: "), green("~$30,000/month")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This month")] }),

      // Action 4
      h3("Action 4: Demurrage enforcement"),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Where commercially viable, add demurrage clause to contracts: $2/min charge after 40 min site wait. For key accounts where penalties are not realistic, share site-wait data in monthly performance reviews instead."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [normal("Expected recovery: "), green("~$15,000/month"), normal(" (direct) + behavioral improvement")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This month (new contracts), 90 days (existing)")] }),

      // Action 5
      h3("Action 5: Sensor calibration and slump testing"),
      new Paragraph({ spacing: { after: 80 }, children: [
        normal("Schedule water-cement sensor calibration within 14 days. Implement mandatory slump test at dispatch point before every truck leaves. Review admixture inventory for expiry dates."),
      ] }),
      new Paragraph({ spacing: { after: 80 }, children: [normal("Expected recovery: "), green("~$12,000/month"), normal(" (reduced rejection rate toward 2%)")] }),
      new Paragraph({ spacing: { after: 160 }, children: [normal("Timeline: "), bold("This month")] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 7. IMPLEMENTATION ROADMAP
      // ═══════════════════════════════════════════════════════════════
      h1("7. Implementation Roadmap (90 Days)"),

      h3("Week 1\u20132: Immediate actions"),
      bullet("Implement time-slotted dispatch: max 2 trucks per 15-min window"),
      bullet("Start ETA communication to all sites (WhatsApp template)"),
      bullet("Begin tracking truck departure times on a timeline (manual log or dispatch board)"),
      bullet("Schedule sensor calibration"),

      h3("Month 1: Stabilization"),
      bullet("Implement zone routing for morning peak (assign truck-zone pairs)"),
      bullet("Review departure timing data from first 2 weeks. Confirm queue reduction."),
      bullet("Draft demurrage clause for new contracts"),
      bullet("Complete sensor calibration. Start mandatory slump testing."),
      bullet("Track site wait per delivery. Share weekly summary with operations manager."),

      h3("Month 2\u20133: Optimization"),
      bullet("Extend zone routing to full operating day"),
      bullet("Begin enforcing demurrage on new contracts"),
      bullet("Share site-wait performance data with top 5 customers in monthly reviews"),
      bullet("Review turnaround trend: target 90\u201395 min by week 8"),
      bullet("Assess whether utilization has improved toward 80%+. If not, diagnose remaining gaps."),
      bullet("Evaluate dispatch software if manual process reaches capacity"),

      spacer(),
      new Paragraph({ spacing: { after: 160 }, children: [
        normal("Target state at 90 days: "),
        green("Turnaround below 95 min. Utilization above 78%. Monthly recovery of $150,000\u2013$200,000 realized."),
      ] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 8. CONFIDENCE & DATA QUALITY
      // ═══════════════════════════════════════════════════════════════
      h1("8. Confidence and Data Quality"),

      h3("What is observed (confirmed on-site)"),
      bullet("Dispatch tool and process (spreadsheet + WhatsApp)"),
      bullet("Truck queuing at plant during peak hours"),
      bullet("Plant idle periods during midday"),
      bullet("Informal zone routing, inconsistently applied"),
      bullet("No formal dispatch KPI tracking"),

      h3("What is inferred"),
      bullet("Truck release clustering pattern (based on absence of time-spacing mechanism)"),
      bullet("Site unpreparedness (based on lack of ETA communication and reported site wait times)"),
      bullet("Rejection rate partially driven by extended turnaround (based on Riyadh summer temperatures and concrete workability window)"),

      h3("What is validated"),
      bullet("Core metrics (capacity, utilization, turnaround, fleet size) confirmed with plant management and operational records"),
      bullet("Turnaround breakdown estimated based on operator input, not GPS-measured"),
      bullet("Financial calculations use reported contribution margin ($20/m\u00B3), not independently verified"),

      h3("Where uncertainty exists"),
      bullet("Exact turnaround component split (plant wait vs. transit vs. site wait vs. washout) is estimated, not measured"),
      bullet("Recovery estimates per action are directional, not precise. Actual recovery depends on execution quality."),
      bullet("Rejection cause split (plant-side vs. customer-side) is based on plant management\u2019s assessment, which may understate plant-side causes"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════════════════════════
      // 9. ADDITIONAL DATA NEEDED
      // ═══════════════════════════════════════════════════════════════
      h1("9. Additional Data for Improved Precision"),

      h3("High priority"),
      bullet("3 days of timestamped truck departure data (confirms or disproves clustering pattern)"),
      bullet("Site-level waiting time logs per delivery (confirms site readiness as a driver)"),
      bullet("GPS-based trip breakdown for 10 consecutive deliveries (confirms transit vs. idle split)"),

      h3("Medium priority"),
      bullet("Dispatch sequence log for peak periods (confirms ordering and spacing)"),
      bullet("Rejection tickets with cause classification (confirms plant vs. customer split)"),
      bullet("Batch computer log with hourly production gaps (confirms idle period patterns)"),

      h3("Ongoing tracking"),
      bullet("Weekly turnaround time (target: declining trend toward 90 min)"),
      bullet("Weekly dispatch time (target: declining toward 15 min)"),
      bullet("Site wait per delivery (target: below 20 min)"),
      bullet("Rejection rate (target: below 2%)"),

      spacer(), spacer(),
      divider(),
      spacer(),

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
  const outPath = 'C:/Users/lsh29/Desktop/AlNoor_RiyadhEast_Assessment_Report.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Report generated: ' + outPath);
});
