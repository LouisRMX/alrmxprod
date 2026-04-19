/**
 * Translation catalog for the Log tab.
 *
 * Custom lightweight i18n (no external library). The Log tab is the only
 * part of the platform that gets translated — Track, Diagnostics, and
 * admin views stay English since they're analyst-facing.
 *
 * Adding a new string:
 *   1. Add the key + English text to LogStrings type below
 *   2. Add the English value in CATALOG.en
 *   3. Add the Arabic value in CATALOG.ar (mark uncertain with "[verify]")
 *
 * Arabic conventions used:
 *   - Modern Standard Arabic (MSA / Fusha), not dialect
 *   - Western Arabic numerals (0123456789) kept in UI
 *   - Industry terms: الميزان (weighbridge), المصنع (plant), الصب (pouring)
 *   - Items marked with "[review]" need native speaker verification before
 *     customer presentation.
 */

export type LogLocale = 'en' | 'ar'

export const LOG_STRINGS = {
  // ── FieldLogView header ───────────────────────────────────────────
  'field.date': 'Date',
  'field.share_capture_link': 'Share field-capture link',
  'field.weekly_briefing': 'Weekly briefing',
  'field.logged_trips': 'Logged trips',

  // ── Sub-tabs ──────────────────────────────────────────────────────
  'tab.live': 'Live',
  'tab.diagnostics': 'Diagnostics',
  'tab.interventions': 'Interventions',
  'tab.review': 'Review',
  'tab.manual': 'Manual',
  'tab.upload': 'Upload',
  'tab.audio': 'Audio',

  // ── SyncStatusBar ─────────────────────────────────────────────────
  'sync.online_all_synced': 'All synced',
  'sync.last_sync': 'last sync',
  'sync.offline': 'Offline',
  'sync.offline_suffix': 'will sync when back online',
  'sync.pending': 'pending',
  'sync.oldest': 'oldest',
  'sync.retry': 'Retry sync',
  'sync.syncing': 'Syncing...',

  // ── Time relative helpers ─────────────────────────────────────────
  'time.just_now': 'just now',
  'time.min_ago': 'min ago',
  'time.h_m_ago': '{h}h {m}m ago',

  // ── Live Timer (LiveTripTimer) ────────────────────────────────────
  'live.measuring_as': 'Measuring as',
  'live.add_measurer_placeholder': 'New measurer name',
  'live.add': 'Add',
  'live.current_plant': 'Current plant',
  'live.not_specified': '(not specified)',
  'live.add_plant_placeholder': 'Plant 1, Plant 2, etc.',
  'live.measuring_from': 'Measuring from',
  'live.plant_queue_full_cycle': 'Plant queue (full cycle)',
  'live.single_stage_only_suffix': 'only',
  'live.single_stage_explainer': 'Single-stage mode: tap Start when the stage begins, Finish when it ends. Saved as a partial trip with just {stage} timing.',
  'live.start_new_trip': 'Start new trip',
  'live.start_measurement_of': 'Start {stage} measurement',
  'live.active_trips': 'Active trips',
  'live.no_active_trips': 'No active trips. Tap "Start new trip" when a truck enters the plant queue.',
  'live.pending_sync': 'Pending sync',
  'live.and_more': 'and {n} more',

  // ── Trip list item ────────────────────────────────────────────────
  'list.full_cycle': 'Full cycle',
  'list.open': 'Open',
  'list.min_in': 'min in',

  // ── Stage names (7 stages + labels) ───────────────────────────────
  'stage.plant_queue': 'Plant queue',
  'stage.loading': 'Loading',
  'stage.transit_out': 'Transit out',
  'stage.site_wait': 'Site wait',
  'stage.pouring': 'Pouring',
  'stage.washout': 'Washout',
  'stage.transit_back': 'Transit back',

  // Stage hints (shown below timer)
  'stage.hint.plant_queue': 'Waiting to enter loading bay',
  'stage.hint.loading': 'Batching and filling the mixer',
  'stage.hint.transit_out': 'Truck on the road to the site',
  'stage.hint.site_wait': 'At site, waiting to pour',
  'stage.hint.pouring': 'Discharging concrete',
  'stage.hint.washout': 'Cleaning drum after pour',
  'stage.hint.transit_back': 'Truck returning to plant',

  // Stage "next action" button labels (shown on big green Split button)
  'stage.next.plant_queue': 'Start loading',
  'stage.next.loading': 'Leaves plant',
  'stage.next.transit_out': 'Arrives at site',
  'stage.next.site_wait': 'Pour starts',
  'stage.next.pouring': 'Pour complete',
  'stage.next.washout': 'Leaves site',
  'stage.next.transit_back': 'Back at plant · Complete trip',

  // Single-stage "finish" button
  'stage.finish': 'Finish',

  // ── LiveTripCard ──────────────────────────────────────────────────
  'card.rec': 'REC',
  'card.back_to_list': 'Back to trip list (trip keeps running)',
  'card.back_to_list_short': 'Back to list',
  'card.stop_save_partial': 'Stop and save partial',
  'card.stop_confirm': 'Stop this trip?\n\nOK = Save partial with current timestamps.\nCancel = Keep running, or use Discard below.',
  'card.total_elapsed': 'Total elapsed',
  'card.stage_of': 'Stage {n} of {total}',
  'card.truck_driver_site': 'Truck · Driver · Site',
  'card.truck_id': 'Truck ID',
  'card.driver': 'Driver',
  'card.site': 'Site',
  'card.note_on': 'Note on',
  'card.note_placeholder': 'What happened during {stage}?',
  'card.trip_notes': 'Trip notes',
  'card.trip_notes_placeholder': 'General observations about this trip',
  'card.mark_rejected': 'Mark rejected',
  'card.load_rejected': 'Load rejected',
  'card.tap_to_unmark': 'Tap to unmark',
  'card.save_partial': 'Save partial',
  'card.save_partial_confirm': 'Save this trip as partial? Missing stages will be marked incomplete.',
  'card.discard': 'Discard',
  'card.discard_confirm': 'Discard this trip? Data cannot be recovered.',
  'card.set_plant': 'Set plant',
  'card.edit': 'Edit',
  'card.save': 'Save',

  // ── Trip Review (pre-save) ────────────────────────────────────────
  'review.trip_complete': 'Trip complete. Review the timestamps below. Tap any time to correct it before saving.',
  'review.save_trip': 'Save trip',
  'review.back_to_timer': 'Back to timer',
  'review.discard_trip': 'Discard trip',
  'review.ts_plant_queue': 'Plant queue start',
  'review.ts_loading': 'Loading start',
  'review.ts_departure': 'Departure (loaded)',
  'review.ts_arrival_site': 'Arrival on site',
  'review.ts_discharge_start': 'Discharge start',
  'review.ts_discharge_end': 'Discharge end',
  'review.ts_departure_site': 'Departure from site',
  'review.ts_arrival_plant': 'Arrival at plant',
  'review.not_recorded': 'Not recorded',
  'review.edited': 'Edited',

  // ── Save toast ────────────────────────────────────────────────────
  'toast.trip_saved': 'Trip saved',
  'toast.partial_saved': 'Partial saved',

  // ── Undo bar ──────────────────────────────────────────────────────
  'undo.undo': 'UNDO',
  'undo.trip_complete': 'Trip complete',
  'undo.stage_started': '{stage} started',

  // ── Review queue ──────────────────────────────────────────────────
  'reviewq.title': 'Review queue',
  'reviewq.subtitle': 'Trips flagged as outliers are excluded from weekly aggregates until reviewed. Include if the trip is real, Exclude if it\'s observer error or one-off breakdown.',
  'reviewq.pending': 'Pending',
  'reviewq.all': 'All',
  'reviewq.empty_pending': 'No trips awaiting review. Any outlier detected by the system will appear here.',
  'reviewq.empty_all': 'No outliers detected yet.',
  'reviewq.stage_breakdown': 'Stage breakdown',
  'reviewq.observer_notes': 'Observer notes',
  'reviewq.reason_optional': 'Reason (optional)',
  'reviewq.reason_placeholder': 'e.g. Pump truck broke down, waited for replacement',
  'reviewq.include': 'Include in dataset',
  'reviewq.including': 'Including...',
  'reviewq.exclude': 'Confirm exclude',
  'reviewq.excluding': 'Excluding...',
  'reviewq.included': 'Included',
  'reviewq.excluded': 'Excluded',
  'reviewq.auto_flagged': 'Auto-flagged',
  'reviewq.statistical_outlier': 'Statistical outlier',
  'reviewq.total_tat': 'Total TAT',
  'reviewq.min': 'min',
  'reviewq.week': 'Week',
  'reviewq.note': 'Note',
  'reviewq.unknown_truck': 'Unknown truck',
  'reviewq.truck': 'Truck',

  // ── Interventions ─────────────────────────────────────────────────
  'interv.title': 'Interventions',
  'interv.subtitle': 'Log when operational changes are made so tracking can attribute impact.',
  'interv.add': 'Add intervention',
  'interv.empty': 'No interventions logged yet. Add the first one when a change is implemented.',
  'interv.new': 'New intervention',
  'interv.edit': 'Edit intervention',
  'interv.date': 'Date',
  'interv.target_metric': 'Target metric',
  'interv.metric_choose': 'Choose metric',
  'interv.metric_tat': 'Turnaround (TAT)',
  'interv.metric_dispatch': 'Dispatch time',
  'interv.metric_reject': 'Reject rate',
  'interv.metric_deliveries': 'Deliveries per truck per day',
  'interv.metric_site_wait': 'Site wait',
  'interv.metric_loading': 'Loading time',
  'interv.metric_other': 'Other',
  'interv.title_label': 'Title',
  'interv.title_placeholder': 'e.g. Tightened dispatch window from 25 to 15 min',
  'interv.implemented_by': 'Implemented by',
  'interv.implemented_by_placeholder': 'Name or role',
  'interv.description_label': 'Description / expected impact',
  'interv.description_placeholder': 'What changed and what impact is expected (e.g. Expected: -10 min TAT by week 4)',
  'interv.title_required': 'Title is required',
  'interv.save_changes': 'Save changes',
  'interv.saving': 'Saving...',
  'interv.cancel': 'Cancel',
  'interv.delete': 'Delete',
  'interv.delete_confirm': 'Delete this intervention?',

  // ── Weekly briefing export ────────────────────────────────────────
  'brief.button': 'Weekly briefing',
  'brief.title': 'Weekly briefing',
  'brief.subtitle': 'Edit if needed, then copy to clipboard and paste into your stakeholder update.',
  'brief.executive': 'Executive',
  'brief.detailed': 'Detailed',
  'brief.generating': 'Generating...',
  'brief.copy': 'Copy to clipboard',
  'brief.regenerate': 'Regenerate',

  // ── Diagnostics ───────────────────────────────────────────────────
  'diag.loading': 'Loading trip data...',
  'diag.error': 'Error',
  'diag.no_trips': 'No trips logged yet. Start capturing on the Live tab.',
  'diag.range': 'Range',
  'diag.today': 'Today',
  'diag.last_7': 'Last 7 days',
  'diag.last_30': 'Last 30 days',
  'diag.all': 'All',
  'diag.complete': 'complete',
  'diag.partial': 'partial',
  'diag.breakdown_title': 'Trip-by-trip TAT breakdown',
  'diag.no_complete_trips': 'No complete trips yet. Log a full cycle to see breakdown.',
  'diag.showing_recent': 'Showing {n} most recent complete trips',
  'diag.stage_summary': 'Stage summary',
  'diag.median': 'Median',
  'diag.n': 'n',
  'diag.share_tat': '% of TAT',
  'diag.total_tat_median': 'Total TAT (median)',
  'diag.top_outliers': 'Top outliers',
  'diag.no_outliers': 'No outliers detected. Need more data or the operation is uniform.',
  'diag.measured_by': 'Measured by',
  'diag.expected_vs_measured': 'Reported vs measured TAT',
  'diag.reported': 'REPORTED (pre-assessment)',
  'diag.measured': 'MEASURED (on-site)',
  'diag.delta': 'DELTA',
  'diag.baseline_based_on': 'Based on {n} complete trips. As the sample grows, this measurement replaces the report\'s assumption.',
  'diag.log_3_trips': 'Log at least 3 complete trips to compare measured TAT to pre-assessment assumptions.',

  // ── Field capture token modal ─────────────────────────────────────
  'token.button': 'Share field-capture link',
  'token.title': 'Field-capture links',
  'token.subtitle': 'Share a URL with your on-site helpers. They can log trips without needing a login.',
  'token.generate_title': 'Generate new link',
  'token.label_placeholder': 'Label (e.g. Ali, site helper)',
  'token.days_7': '7 days (onsite week)',
  'token.days_30': '30 days',
  'token.days_60': '60 days',
  'token.days_90': '90 days (tracking)',
  'token.days_120': '120 days',
  'token.days_180': '180 days',
  'token.generate': 'Generate',
  'token.active_links': 'Active links',
  'token.loading': 'Loading...',
  'token.no_links': 'No links yet. Create one above.',
  'token.unlabeled': 'Unlabeled',
  'token.revoked': 'Revoked',
  'token.expired': 'Expired',
  'token.expires': 'Expires',
  'token.uses': 'uses',
  'token.use': 'use',
  'token.copy': 'Copy',
  'token.revoke': 'Revoke',
  'token.revoke_confirm': 'Revoke this link? Anyone using it will lose access immediately.',
  'token.copied': 'Link copied to clipboard',
  'token.copy_prompt': 'Copy this link:',

  // ── Locale toggle ─────────────────────────────────────────────────
  'locale.toggle': 'Language',
  'locale.english': 'EN',
  'locale.arabic': 'عربي',
} as const

export type LogStringKey = keyof typeof LOG_STRINGS

// ── Arabic translations ──────────────────────────────────────────────
// Modern Standard Arabic (MSA). Industry-specific terminology for
// ready-mix concrete operations. Markers [review] flag items where
// native speaker verification is recommended before release.

export const LOG_STRINGS_AR: Record<LogStringKey, string> = {
  // Field header
  'field.date': 'التاريخ',
  'field.share_capture_link': 'مشاركة رابط تسجيل الرحلات',
  'field.weekly_briefing': 'الإحاطة الأسبوعية',
  'field.logged_trips': 'الرحلات المسجلة',

  // Sub-tabs
  'tab.live': 'مباشر',
  'tab.diagnostics': 'التحليل',
  'tab.interventions': 'إجراءات التحسين',
  'tab.review': 'المراجعة',
  'tab.manual': 'يدوي',
  'tab.upload': 'رفع',
  'tab.audio': 'صوت',

  // Sync status
  'sync.online_all_synced': 'تمت مزامنة الكل',
  'sync.last_sync': 'آخر مزامنة',
  'sync.offline': 'غير متصل',
  'sync.offline_suffix': 'ستتم المزامنة عند الاتصال',
  'sync.pending': 'قيد الانتظار',
  'sync.oldest': 'الأقدم',
  'sync.retry': 'إعادة المزامنة',
  'sync.syncing': 'جاري المزامنة...',

  // Time relative
  'time.just_now': 'الآن',
  'time.min_ago': 'دقيقة مضت',
  'time.h_m_ago': '{h}س {m}د مضت',

  // Live Timer
  'live.measuring_as': 'المُقيس:',
  'live.add_measurer_placeholder': 'اسم مقيس جديد',
  'live.add': 'إضافة',
  'live.current_plant': 'المصنع الحالي',
  'live.not_specified': '(غير محدد)',
  'live.add_plant_placeholder': 'مصنع 1، مصنع 2، إلخ.',
  'live.measuring_from': 'القياس من',
  'live.plant_queue_full_cycle': 'طابور المصنع (دورة كاملة)',
  'live.single_stage_only_suffix': 'فقط',
  'live.single_stage_explainer': 'وضع المرحلة الواحدة: اضغط بدء عند بداية المرحلة، إنهاء عند انتهائها. تُحفظ كرحلة جزئية بقياس {stage} فقط.',
  'live.start_new_trip': 'بدء رحلة جديدة',
  'live.start_measurement_of': 'بدء قياس {stage}',
  'live.active_trips': 'الرحلات النشطة',
  'live.no_active_trips': 'لا توجد رحلات نشطة. اضغط "بدء رحلة جديدة" عند دخول الشاحنة إلى طابور المصنع.',
  'live.pending_sync': 'مزامنة معلقة',
  'live.and_more': 'و {n} أخرى',

  // List
  'list.full_cycle': 'دورة كاملة',
  'list.open': 'فتح',
  'list.min_in': 'دقيقة داخل',

  // Stage names
  'stage.plant_queue': 'طابور المصنع',
  'stage.loading': 'التحميل',
  'stage.transit_out': 'الذهاب إلى الموقع',
  'stage.site_wait': 'الانتظار في الموقع',
  'stage.pouring': 'الصب',
  'stage.washout': 'الغسيل',
  'stage.transit_back': 'العودة إلى المصنع',

  // Stage hints
  'stage.hint.plant_queue': 'في انتظار الدخول إلى منطقة التحميل',
  'stage.hint.loading': 'معايرة المواد وتعبئة الخلاطة',
  'stage.hint.transit_out': 'الشاحنة في الطريق إلى الموقع',
  'stage.hint.site_wait': 'في الموقع، في انتظار الصب',
  'stage.hint.pouring': 'صب الخرسانة',
  'stage.hint.washout': 'غسيل الخلاطة بعد الصب',
  'stage.hint.transit_back': 'الشاحنة تعود إلى المصنع',

  // Stage next action buttons
  'stage.next.plant_queue': 'بدء التحميل',
  'stage.next.loading': 'غادر المصنع',
  'stage.next.transit_out': 'وصل إلى الموقع',
  'stage.next.site_wait': 'بدء الصب',
  'stage.next.pouring': 'انتهى الصب',
  'stage.next.washout': 'غادر الموقع',
  'stage.next.transit_back': 'عاد إلى المصنع · إنهاء الرحلة',

  'stage.finish': 'إنهاء',

  // Card
  'card.rec': 'تسجيل',
  'card.back_to_list': 'العودة إلى قائمة الرحلات (الرحلة تستمر)',
  'card.back_to_list_short': 'العودة إلى القائمة',
  'card.stop_save_partial': 'إيقاف وحفظ جزئي',
  'card.stop_confirm': 'إيقاف هذه الرحلة؟\n\nموافق = حفظ جزئي بالأوقات الحالية.\nإلغاء = الاستمرار، أو استخدم تجاهل أدناه.',
  'card.total_elapsed': 'الوقت الكلي المنقضي',
  'card.stage_of': 'المرحلة {n} من {total}',
  'card.truck_driver_site': 'الشاحنة · السائق · الموقع',
  'card.truck_id': 'رقم الشاحنة',
  'card.driver': 'السائق',
  'card.site': 'الموقع',
  'card.note_on': 'ملاحظة على',
  'card.note_placeholder': 'ماذا حدث خلال {stage}؟',
  'card.trip_notes': 'ملاحظات الرحلة',
  'card.trip_notes_placeholder': 'ملاحظات عامة حول هذه الرحلة',
  'card.mark_rejected': 'تحديد كمرفوض',
  'card.load_rejected': 'تم رفض الحمولة',
  'card.tap_to_unmark': 'اضغط لإلغاء الرفض',
  'card.save_partial': 'حفظ جزئي',
  'card.save_partial_confirm': 'حفظ هذه الرحلة كجزئية؟ سيتم تعليم المراحل المفقودة كغير مكتملة.',
  'card.discard': 'تجاهل',
  'card.discard_confirm': 'تجاهل هذه الرحلة؟ لا يمكن استرداد البيانات.',
  'card.set_plant': 'تحديد المصنع',
  'card.edit': 'تعديل',
  'card.save': 'حفظ',

  // Review (pre-save)
  'review.trip_complete': '✓ اكتملت الرحلة. راجع الأوقات أدناه. اضغط أي وقت لتصحيحه قبل الحفظ.',
  'review.save_trip': 'حفظ الرحلة',
  'review.back_to_timer': 'العودة إلى المؤقت',
  'review.discard_trip': 'تجاهل الرحلة',
  'review.ts_plant_queue': 'بدء طابور المصنع',
  'review.ts_loading': 'بدء التحميل',
  'review.ts_departure': 'المغادرة (محملة)',
  'review.ts_arrival_site': 'الوصول إلى الموقع',
  'review.ts_discharge_start': 'بدء التفريغ',
  'review.ts_discharge_end': 'انتهاء التفريغ',
  'review.ts_departure_site': 'المغادرة من الموقع',
  'review.ts_arrival_plant': 'الوصول إلى المصنع',
  'review.not_recorded': 'غير مسجل',
  'review.edited': 'معدل',

  // Toast
  'toast.trip_saved': 'تم حفظ الرحلة',
  'toast.partial_saved': 'تم حفظ الرحلة الجزئية',

  // Undo
  'undo.undo': 'تراجع',
  'undo.trip_complete': 'اكتملت الرحلة',
  'undo.stage_started': 'بدأت {stage}',

  // Review queue
  'reviewq.title': 'قائمة المراجعة',
  'reviewq.subtitle': 'الرحلات المعلمة كقيم شاذة مستبعدة من الإجماليات الأسبوعية حتى تتم مراجعتها. اختر تضمين إذا كانت الرحلة صحيحة، أو استبعاد إذا كانت خطأ من المراقب أو حدث استثنائي.',
  'reviewq.pending': 'قيد الانتظار',
  'reviewq.all': 'الكل',
  'reviewq.empty_pending': 'لا توجد رحلات تنتظر المراجعة. أي قيمة شاذة يكتشفها النظام ستظهر هنا.',
  'reviewq.empty_all': 'لم يتم اكتشاف قيم شاذة بعد.',
  'reviewq.stage_breakdown': 'تفصيل المراحل',
  'reviewq.observer_notes': 'ملاحظات المراقب',
  'reviewq.reason_optional': 'السبب (اختياري)',
  'reviewq.reason_placeholder': 'مثال: تعطلت مضخة الشاحنة، انتظرنا البديل',
  'reviewq.include': 'تضمين في البيانات',
  'reviewq.including': 'جاري التضمين...',
  'reviewq.exclude': 'تأكيد الاستبعاد',
  'reviewq.excluding': 'جاري الاستبعاد...',
  'reviewq.included': 'مُضمَّن',
  'reviewq.excluded': 'مُستبعَد',
  'reviewq.auto_flagged': 'موسوم تلقائياً',
  'reviewq.statistical_outlier': 'قيمة شاذة إحصائياً',
  'reviewq.total_tat': 'إجمالي TAT',
  'reviewq.min': 'دقيقة',
  'reviewq.week': 'الأسبوع',
  'reviewq.note': 'ملاحظة',
  'reviewq.unknown_truck': 'شاحنة غير معروفة',
  'reviewq.truck': 'شاحنة',

  // Interventions
  'interv.title': 'إجراءات التحسين',
  'interv.subtitle': 'سجل وقت إجراء التغييرات التشغيلية حتى يتمكن التتبع من إسناد الأثر.',
  'interv.add': 'إضافة إجراء',
  'interv.empty': 'لم يتم تسجيل تدخلات بعد. أضف الأول عند تنفيذ تغيير.',
  'interv.new': 'تدخل جديد',
  'interv.edit': 'تعديل التدخل',
  'interv.date': 'التاريخ',
  'interv.target_metric': 'المقياس المستهدف',
  'interv.metric_choose': 'اختر مقياس',
  'interv.metric_tat': 'وقت الدورة (TAT)',
  'interv.metric_dispatch': 'وقت الدسباتش',
  'interv.metric_reject': 'نسبة الرفض',
  'interv.metric_deliveries': 'رحلات لكل شاحنة في اليوم',
  'interv.metric_site_wait': 'الانتظار في الموقع',
  'interv.metric_loading': 'وقت التحميل',
  'interv.metric_other': 'أخرى',
  'interv.title_label': 'العنوان',
  'interv.title_placeholder': 'مثال: تضييق نافذة الإرسال من 25 إلى 15 دقيقة',
  'interv.implemented_by': 'نُفذ بواسطة',
  'interv.implemented_by_placeholder': 'الاسم أو الدور',
  'interv.description_label': 'الوصف / الأثر المتوقع',
  'interv.description_placeholder': 'ما الذي تغير وما الأثر المتوقع (مثال: متوقع -10 دقائق TAT بحلول الأسبوع الرابع)',
  'interv.title_required': 'العنوان مطلوب',
  'interv.save_changes': 'حفظ التغييرات',
  'interv.saving': 'جاري الحفظ...',
  'interv.cancel': 'إلغاء',
  'interv.delete': 'حذف',
  'interv.delete_confirm': 'حذف هذا التدخل؟',

  // Weekly briefing
  'brief.button': 'الإحاطة الأسبوعية',
  'brief.title': 'الإحاطة الأسبوعية',
  'brief.subtitle': 'عدّل إذا لزم الأمر، ثم انسخ والصق في تحديث أصحاب المصلحة.',
  'brief.executive': 'تنفيذي',
  'brief.detailed': 'تفصيلي',
  'brief.generating': 'جاري الإنشاء...',
  'brief.copy': 'نسخ إلى الحافظة',
  'brief.regenerate': 'إعادة الإنشاء',

  // Diagnostics
  'diag.loading': 'جاري تحميل بيانات الرحلات...',
  'diag.error': 'خطأ',
  'diag.no_trips': 'لم تُسجل رحلات بعد. ابدأ التسجيل في تبويب المباشر.',
  'diag.range': 'النطاق',
  'diag.today': 'اليوم',
  'diag.last_7': 'آخر 7 أيام',
  'diag.last_30': 'آخر 30 يوماً',
  'diag.all': 'الكل',
  'diag.complete': 'مكتمل',
  'diag.partial': 'جزئي',
  'diag.breakdown_title': 'تفصيل TAT لكل رحلة',
  'diag.no_complete_trips': 'لا توجد رحلات مكتملة بعد. سجل دورة كاملة لرؤية التفصيل.',
  'diag.showing_recent': 'عرض {n} رحلات مكتملة حديثاً',
  'diag.stage_summary': 'ملخص المراحل',
  'diag.median': 'الوسيط',
  'diag.n': 'ن',
  'diag.share_tat': '% من TAT',
  'diag.total_tat_median': 'إجمالي TAT (وسيط)',
  'diag.top_outliers': 'أبرز القيم الشاذة',
  'diag.no_outliers': 'لم يتم اكتشاف قيم شاذة. يحتاج المزيد من البيانات أو العمليات موحدة.',
  'diag.measured_by': 'تم القياس بواسطة',
  'diag.expected_vs_measured': 'TAT: المُبلَّغ مقابل المُقاس',
  'diag.reported': 'مُبلَّغ (تقييم مسبق)',
  'diag.measured': 'مُقاس (في الموقع)',
  'diag.delta': 'الفرق',
  'diag.baseline_based_on': 'مبني على {n} رحلات مكتملة. مع نمو العينة، يحل هذا القياس محل افتراض التقرير.',
  'diag.log_3_trips': 'سجل 3 رحلات مكتملة على الأقل لمقارنة TAT المُقاس بافتراضات التقييم المسبق.',

  // Field capture token modal
  'token.button': 'مشاركة رابط تسجيل الرحلات',
  'token.title': 'روابط تسجيل الرحلات',
  'token.subtitle': 'شارك رابطاً مع مساعديك في الموقع. يمكنهم تسجيل الرحلات دون الحاجة لتسجيل دخول.',
  'token.generate_title': 'إنشاء رابط جديد',
  'token.label_placeholder': 'تسمية (مثال: علي، مساعد الموقع)',
  'token.days_7': '7 أيام (أسبوع في الموقع)',
  'token.days_30': '30 يوماً',
  'token.days_60': '60 يوماً',
  'token.days_90': '90 يوماً (تتبع)',
  'token.days_120': '120 يوماً',
  'token.days_180': '180 يوماً',
  'token.generate': 'إنشاء',
  'token.active_links': 'الروابط النشطة',
  'token.loading': 'جاري التحميل...',
  'token.no_links': 'لا توجد روابط بعد. أنشئ واحداً أعلاه.',
  'token.unlabeled': 'بدون تسمية',
  'token.revoked': 'ملغى',
  'token.expired': 'منتهي',
  'token.expires': 'ينتهي',
  'token.uses': 'استخدامات',
  'token.use': 'استخدام',
  'token.copy': 'نسخ',
  'token.revoke': 'إبطال',
  'token.revoke_confirm': 'إبطال هذا الرابط؟ أي شخص يستخدمه سيفقد الوصول فوراً.',
  'token.copied': 'تم نسخ الرابط إلى الحافظة',
  'token.copy_prompt': 'انسخ هذا الرابط:',

  // Locale toggle
  'locale.toggle': 'اللغة',
  'locale.english': 'EN',
  'locale.arabic': 'عربي',
}

export const CATALOG: Record<LogLocale, Record<LogStringKey, string>> = {
  en: LOG_STRINGS as Record<LogStringKey, string>,
  ar: LOG_STRINGS_AR,
}
