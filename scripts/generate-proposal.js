// AL-CEM Proposal Generator — Final Version
// node scripts/generate-proposal.js

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageBreak, Header, Footer, PageNumber, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');

// ── Brand ──────────────────────────────────────────────────────────────────────
const G_DARK  = '1B4332';
const G_MID   = '2D6A4F';
const G_LIGHT = 'D1FAE5';
const G_PALE  = 'F0FDF4';
const DARK    = '111827';
const GRAY    = '6B7280';
const WHITE   = 'FFFFFF';

// ── Page: A4 ──────────────────────────────────────────────────────────────────
const PW = 11906, PH = 16838;
const MG = { top: 1134, right: 1134, bottom: 1134, left: 1134 };
const CW = PW - MG.left - MG.right; // 9638 DXA

// ── Primitives ────────────────────────────────────────────────────────────────
const nb  = { style: BorderStyle.NONE, size: 0, color: WHITE };
const nbs = { top: nb, bottom: nb, left: nb, right: nb };

function t(text, o = {})  { return new TextRun({ text, font: 'Arial', ...o }); }
function p(runs, o = {})  { return new Paragraph({ children: Array.isArray(runs) ? runs : [runs], ...o }); }
function sp(n = 1)        { return p([t('')], { spacing: { before: n * 100, after: 0 } }); }

function cell(kids, { w, bg, borders = nbs, vAlign = VerticalAlign.TOP } = {}) {
  return new TableCell({
    children:      Array.isArray(kids) ? kids : [kids],
    width:         w ? { size: w, type: WidthType.DXA } : undefined,
    borders,
    shading:       bg ? { fill: bg, type: ShadingType.CLEAR } : undefined,
    margins:       { top: 100, bottom: 100, left: 150, right: 150 },
    verticalAlign: vAlign,
  });
}

function oneRow(kids, bg) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [cell(kids, { w: CW, bg, borders: nbs })] })],
  });
}

function rule(color = G_DARK, size = 5) {
  return { border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 4 } } };
}

// ── Dates ─────────────────────────────────────────────────────────────────────
const today    = new Date();
const fmt      = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dateStr  = fmt(today);
const validExp = new Date(today); validExp.setDate(validExp.getDate() + 60);
const validStr = fmt(validExp);

// ── Shared text helpers ───────────────────────────────────────────────────────
function heading(text) {
  return p([t(text, { bold: true, size: 26, color: G_DARK })],
    { ...rule(), spacing: { before: 340, after: 160 } });
}
function label(text) {
  return p([t(text, { bold: true, size: 21, color: G_MID })],
    { spacing: { before: 180, after: 60 } });
}
function body(text, opts = {}) {
  return p([t(text, { size: 21, color: DARK })], { spacing: { before: 60, after: 60 }, ...opts });
}
function bullet(text) {
  return p([t('–  ' + text, { size: 20, color: DARK })], { spacing: { before: 40, after: 40 }, indent: { left: 240 } });
}
function subbullet(text) {
  return p([t('·  ' + text, { size: 19, color: GRAY })], { spacing: { before: 30, after: 30 }, indent: { left: 480 } });
}
function note(text) {
  return p([t(text, { size: 19, color: GRAY, italics: true })], { spacing: { before: 60, after: 60 } });
}

// ── Fee box ───────────────────────────────────────────────────────────────────
function feeBox(amount, sub) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [cell([
      p([t(amount, { bold: true, size: 26, color: G_DARK }), sub ? t('  ' + sub, { size: 20, color: GRAY }) : t('')]),
    ], { w: CW, bg: G_PALE, borders: nbs })] })],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER
// ═══════════════════════════════════════════════════════════════════════════════
const cover = [
  oneRow([
    p([t('AL-CEM', { bold: true, size: 56, color: WHITE })]),
    p([t('Plant Diagnostics', { size: 26, color: G_LIGHT })]),
  ], G_DARK),

  sp(6),
  p([t('Ready-Mix Plant Throughput', { bold: true, size: 38, color: G_DARK })],
    { spacing: { before: 0, after: 60 } }),
  p([t('& Margin Recovery', { bold: true, size: 38, color: G_DARK })],
    { spacing: { before: 0, after: 80 } }),
  p([t('Operational Performance Program', { size: 24, color: GRAY })],
    { spacing: { before: 0, after: 600 } }),

  new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [2400, 7238],
    rows: [
      ['Prepared for',    '[Client Name], Saudi Arabia'],
      ['Prepared by',     'Kurt Christensen, Director — AL-CEM Plant Diagnostics'],
      ['Date',            dateStr],
      ['Valid until',     validStr],
      ['Confidentiality', 'Strictly Confidential'],
    ].map(([lbl, val]) => new TableRow({ children: [
      cell([p([t(lbl, { bold: true, size: 19, color: GRAY })])], { w: 2400 }),
      cell([p([t(val,  { size: 20, color: DARK })])],             { w: 7238 }),
    ]})),
  }),

  sp(10),
  p([t('Kurt Christensen, Director', { size: 19, color: GRAY })],
    { ...rule(), spacing: { before: 200, after: 0 } }),
  p([t('kurt.christensen@al-cem.com', { size: 19, color: GRAY })]),
  p([new PageBreak()]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — OPENING + 3 PHASES
// ═══════════════════════════════════════════════════════════════════════════════

const phases = [

  // Opening
  oneRow([
    p([t('Most GCC ready-mix plants are leaving between $60,000 and $120,000 per month unrealised. Not because capacity is insufficient — but because dispatch, fleet cycles and production are not operating as a coordinated system.', { size: 21, color: DARK })],
      { spacing: { before: 0, after: 100 } }),
    p([t('This program identifies where that value is going, confirms it on the ground, and ensures it stays captured.', { bold: true, size: 21, color: G_DARK })]),
  ], G_PALE),

  sp(1),

  // ── PHASE 1 ──────────────────────────────────────────────────────────────────
  heading('1.  Opportunity Identification (Remote)'),

  label('Purpose'),
  body('Establish whether a material financial opportunity exists — before anyone gets on a plane.'),

  label('Scope'),
  bullet('Structured operational data capture: dispatch, fleet, production, quality'),
  bullet('Alignment session with plant management'),
  bullet('Full system-level analysis'),
  bullet('Identification of the binding constraint'),

  label('Deliverable'),
  body('Opportunity Brief (English)'),
  subbullet('Where throughput is being lost'),
  subbullet('What is driving it'),
  subbullet('Estimated monthly value at stake'),
  subbullet('Confidence level in findings'),

  label('Value'),
  bullet('Makes hidden loss visible — in your numbers, not generic estimates'),
  bullet('Identifies the actual constraint, not the most obvious one'),
  bullet('Provides a clear financial basis for the next decision'),

  label('Outcome'),
  body('One of two results: a confirmed opportunity worth pursuing, or a clear answer that it is not.'),
  p([t('$3,000 is the cost of certainty.', { bold: true, size: 21, color: G_DARK })],
    { spacing: { before: 60, after: 80 } }),

  feeBox('USD 3,000', '(credited in full if proceeding to Phase 2)'),

  sp(2),

  // ── PHASE 2 ──────────────────────────────────────────────────────────────────
  heading('2.  Constraint Validation & Recovery Plan (On-Site)'),

  label('Purpose'),
  body('Confirm what is actually driving the constraint — not what it appears to be — and define the exact steps to unlock it.'),

  label('Scope'),
  bullet('Up to 5 days on-site'),
  bullet('Direct observation of truck cycles, dispatch timing and site coordination'),
  bullet('Validation of root causes against Phase 1 findings'),
  bullet('Separation of actual constraints from visible symptoms'),
  bullet('Recovery actions defined — sequenced and prioritised'),

  label('Deliverables'),
  bullet('Operational Intelligence Report (English)'),
  bullet('Executive Summary (Arabic)'),
  bullet('Management alignment session'),

  label('Value'),
  bullet('Replaces assumptions with observed operational reality'),
  bullet('Identifies what is genuinely driving the loss — not what looks like it is'),
  bullet('Actions implementable within weeks, without capital investment'),
  bullet('Tells you what to fix first, second and third — not just what is broken'),

  label('Outcome'),
  bullet('Verified financial opportunity — no longer estimated'),
  bullet('A prioritised recovery plan your team can act on immediately'),
  bullet('Shared understanding across management of what must change'),

  feeBox('USD 19,000', '(all travel and accommodation included)'),

  sp(2),

  // ── PHASE 3 ──────────────────────────────────────────────────────────────────
  heading('3.  Performance Capture & Control (Retainer)'),

  label('Purpose'),
  body('Ensure the recovery plan is executed — and that results are measured, not assumed.'),

  label('Scope'),
  bullet('Monthly tracking of key performance drivers against established baselines'),
  bullet('Before vs. after measurement across all identified dimensions'),
  bullet('Ongoing prioritisation as real-world conditions evolve'),
  bullet('Active follow-up on implementation gaps'),

  label('Platform Access'),
  body('All retainer clients receive full access to the AL-CEM performance platform — a dedicated tracking environment built specifically for ready-mix operations.'),
  bullet('Baselines from Phase 2 are pre-loaded — no setup required'),
  bullet('Your operations team logs a handful of metrics each week — takes under 10 minutes'),
  bullet('The platform converts raw inputs into financial performance reports automatically'),
  bullet('Live dashboard showing current performance vs. baseline across all tracked dimensions'),
  bullet('Full 90-day history — a permanent operational record, not a spreadsheet'),
  sp(0),
  oneRow([
    p([t('Without structured tracking, operational improvements cannot be verified — and unverified improvements do not hold. The platform is what converts the Recovery Plan from a document into a financial result.', { size: 20, color: G_DARK, italics: true })]),
  ], G_PALE),

  sp(1),
  label('Deliverable'),
  body('Monthly Performance & Recovery Report'),
  subbullet('Throughput improvement vs. baseline'),
  subbullet('KPI development across all tracked dimensions'),
  subbullet('Verified financial value captured month-to-date'),

  sp(0),
  body('Each week, your plant manager logs a few numbers. Each month, you receive a report showing exactly where performance moved — and what it was worth in dollars.'),

  label('Value'),
  bullet('Converts improvement plan into measured financial results'),
  bullet('Prevents regression as management attention moves on'),
  bullet('Creates the audit trail that proves ROI — the basis for expanding to the next plant'),
  bullet('After 90 days: a documented before-and-after case in your own operational data'),

  label('Outcome'),
  bullet('Sustained throughput improvement'),
  bullet('Verified financial impact — measured, not projected'),
  bullet('Operational control that holds after the engagement ends'),

  feeBox('USD 3,500 / plant / month', '(30 days notice, no minimum commitment)'),
  sp(0),
  note('The monthly fee is a fraction of the value it is designed to protect.'),

  sp(2),

  // ── PROGRAM LOGIC ─────────────────────────────────────────────────────────────
  oneRow([
    p([t('Identify  →  Validate  →  Capture', { bold: true, size: 24, color: G_DARK })],
      { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 } }),
    p([t('Start with one plant.  Expand based on results.', { size: 20, color: GRAY })],
      { alignment: AlignmentType.CENTER }),
  ], G_PALE),

  sp(1),

  // ── COMMERCIAL PRINCIPLE ──────────────────────────────────────────────────────
  p([t('Commercial Principle', { bold: true, size: 21, color: G_DARK })],
    { ...rule(G_DARK, 3), spacing: { before: 200, after: 120 } }),
  body('Every phase must justify the next. If it doesn\'t, we say so.'),
  body('No long-term commitment until value is demonstrated.'),

  p([new PageBreak()]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — SERVICE AGREEMENT + SIGNATURES
// ═══════════════════════════════════════════════════════════════════════════════

function clause(num, title, text) {
  return [
    p([t(`${num}.  ${title}`, { bold: true, size: 21, color: G_DARK })],
      { spacing: { before: 180, after: 60 } }),
    p([t(text, { size: 20, color: DARK })], { spacing: { before: 0, after: 0 } }),
  ];
}

const agreement = [
  heading('Service Agreement'),
  body('This Agreement is entered into between AL-CEM Plant Diagnostics ("AL-CEM") and [Client Full Legal Name] ("Client"), effective from the date of signature by both parties.'),

  ...clause('1', 'Services',
    'AL-CEM will deliver the phases described in this document on dates agreed in writing. Each phase is confirmed separately. Commencement of a subsequent phase requires written confirmation from the Client.'),
  ...clause('2', 'Fees',
    'Phase 1 is payable in full upon engagement. Phase 2 is payable in two equal instalments: 50% upon on-site confirmation, 50% upon delivery of the Intelligence Report. The Retainer is payable monthly from the agreed start date. All amounts are in USD. If any payment is not received within 14 days of its due date, AL-CEM may suspend services until settled.'),
  ...clause('3', 'Confidentiality',
    'Both parties agree to keep all information exchanged strictly confidential and not to disclose it to any third party without prior written consent. This obligation survives termination for three years.'),
  ...clause('4', 'Intellectual Property',
    'All methodologies and frameworks used by AL-CEM remain its exclusive property. Deliverables are provided for the Client\'s internal use only and may not be distributed without written consent.'),
  ...clause('5', 'Client Obligations',
    'The Client will provide plant access, relevant operational data, staff availability as reasonably requested, a single point of contact, and timely feedback on draft deliverables. Delays caused by the Client may result in adjusted timelines.'),
  ...clause('6', 'Liability',
    'AL-CEM will perform services with professional care but does not warrant specific financial outcomes. AL-CEM\'s total liability shall not exceed the total fees paid. Neither party is liable for indirect or consequential damages.'),
  ...clause('7', 'Termination',
    'Either party may terminate by written notice if the other materially breaches and fails to remedy within 14 days. Phase 1 and Phase 2 first-instalment fees are non-refundable once commenced. The Retainer may be cancelled with 30 days written notice.'),
  ...clause('8', 'Governing Law',
    'This Agreement is governed by internationally recognised principles of commercial contract law. Any dispute not resolved by negotiation within 30 days shall be referred to binding arbitration under mutually agreed international arbitration rules.'),

  sp(3),
  body('By signing below, both parties confirm acceptance of all terms in this Agreement.'),
  sp(2),

  new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [Math.round(CW / 2) - 200, 400, CW - Math.round(CW / 2) - 200],
    rows: [new TableRow({ children: [
      cell([
        p([t('FOR AL-CEM PLANT DIAGNOSTICS', { bold: true, size: 20, color: G_DARK })]),
        sp(2),
        p([t('Signature', { size: 19, color: GRAY })],
          { border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY } } }),
        sp(1),
        p([t('Kurt Christensen, Director', { bold: true, size: 20, color: DARK })]),
        p([t('kurt.christensen@al-cem.com', { size: 19, color: GRAY })]),
        sp(1),
        p([t('Date', { size: 19, color: GRAY })],
          { border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY } } }),
      ], { w: Math.round(CW / 2) - 200 }),
      cell([p([t('')])], { w: 400 }),
      cell([
        p([t('FOR [CLIENT COMPANY NAME]', { bold: true, size: 20, color: G_DARK })]),
        sp(2),
        p([t('Signature', { size: 19, color: GRAY })],
          { border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY } } }),
        sp(1),
        p([t('[Full Name and Title]', { size: 19, color: GRAY })]),
        p([t('[Company Name]', { size: 19, color: GRAY })]),
        sp(1),
        p([t('Date', { size: 19, color: GRAY })],
          { border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY } } }),
      ], { w: CW - Math.round(CW / 2) - 200 }),
    ]})],
  }),

  p([new PageBreak()]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — ARABIC SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
function ar(text, o = {}) { return new TextRun({ text, font: 'Arial', rightToLeft: true, ...o }); }
function arP(runs, o = {}) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    bidirectional: true, alignment: AlignmentType.RIGHT, ...o,
  });
}

const arabic = [
  oneRow([
    arP([ar('AL-CEM Plant Diagnostics', { bold: true, size: 44, color: WHITE })]),
    arP([ar('ملخص تنفيذي', { bold: true, size: 32, color: G_LIGHT })]),
    arP([ar('برنامج الأداء التشغيلي — محطة الخرسانة الجاهزة', { size: 22, color: G_LIGHT })]),
  ], G_DARK),

  sp(2),

  arP([ar('معظم محطات الخرسانة الجاهزة في منطقة الخليج تُفقد ما بين 60,000 و 120,000 دولار شهرياً من الإيرادات غير المُحققة — ليس بسبب نقص الطاقة الإنتاجية، بل بسبب عدم التنسيق بين الإرسال وأسطول الشاحنات والإنتاج.', { size: 21, color: DARK })],
    { spacing: { before: 160, after: 120 } }),

  arP([ar('هذا البرنامج يُحدد أين تذهب هذه القيمة، يُثبتها ميدانياً، ويضمن استرداد أقصى قدر منها.', { bold: true, size: 21, color: G_DARK })],
    { spacing: { before: 0, after: 200 } }),

  arP([ar('مراحل البرنامج', { bold: true, size: 24, color: G_DARK })],
    { ...rule(), spacing: { before: 200, after: 140 } }),

  new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [Math.round(CW * 0.32), CW - Math.round(CW * 0.32)],
    rows: [
      [['3,000 دولار', '(تُحسب عند الانتقال للمرحلة الثانية)'],
       'المرحلة الأولى: تحديد الفرصة (عن بُعد) — تحليل بيانات التشغيل، تحديد نقطة الاختناق الرئيسية، وتقدير القيمة المالية المتاحة', G_PALE],
      [['19,000 دولار', '(شاملاً السفر والإقامة)'],
       'المرحلة الثانية: التحقق الميداني وخطة الاسترداد — حضور ميداني حتى 5 أيام، تأكيد الأسباب الجذرية، وتقرير استخباراتي تشغيلي شامل', WHITE],
      [['3,500 دولار / شهر', '(30 يوماً إشعاراً مسبقاً)'],
       'المرحلة الثالثة: قياس الأداء والتحكم — متابعة شهرية للمؤشرات، قياس التحسن مقابل الخط الأساسي، وتقرير شهري بالقيمة المُستردة فعلياً', G_PALE],
    ].map(([[amount, sub], desc, bg]) => new TableRow({ children: [
      cell([
        arP([ar(amount, { bold: true, size: 22, color: G_DARK })]),
        arP([ar(sub,    { size: 18,   color: GRAY })]),
      ], { w: Math.round(CW * 0.32), bg }),
      cell([arP([ar(desc, { size: 20, color: DARK })])],
        { w: CW - Math.round(CW * 0.32), bg }),
    ]})),
  }),

  sp(2),
  oneRow([
    arP([ar('كل مرحلة يجب أن تُثبت قيمتها قبل الانتقال إلى التالية. لا التزام طويل الأمد حتى تتضح النتائج.', { bold: true, size: 21, color: G_DARK })]),
  ], G_PALE),

  sp(4),
  arP([ar('كورت كريستنسن، المدير التنفيذي — AL-CEM Plant Diagnostics', { size: 19, color: GRAY })],
    { ...rule(), spacing: { before: 200, after: 80 } }),
  arP([ar('kurt.christensen@al-cem.com', { size: 19, color: GRAY })]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD
// ═══════════════════════════════════════════════════════════════════════════════
const headerP = p([
  t('AL-CEM Plant Diagnostics  ·  Operational Performance Program', { size: 17, color: GRAY }),
  new TextRun({ children: ['\t'], font: 'Arial' }),
  t('Strictly Confidential', { size: 17, color: GRAY }),
], {
  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB', space: 4 } },
});

const footerP = p([
  t('AL-CEM Plant Diagnostics  ·  kurt.christensen@al-cem.com', { size: 16, color: GRAY }),
  new TextRun({ children: ['\t'], font: 'Arial' }),
  new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: GRAY }),
], {
  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB', space: 4 } },
});

const doc = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 21, color: DARK } } } },
  sections: [{
    properties: { page: { size: { width: PW, height: PH }, margin: MG } },
    headers: { default: new Header({ children: [headerP] }) },
    footers: { default: new Footer({ children: [footerP] }) },
    children: [...cover, ...phases, ...agreement, ...arabic],
  }],
});

const OUT = 'C:/Users/lsh29/Desktop/AL-CEM_Proposal_KSA_2026.docx';
Packer.toBuffer(doc)
  .then(buf => { fs.writeFileSync(OUT, buf); console.log('✓', OUT); })
  .catch(err => { console.error(err.message); process.exit(1); });
