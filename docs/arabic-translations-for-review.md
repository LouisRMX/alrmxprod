# Arabic translations for native review

This document lists every user-facing string in the Log tab with its
English source and proposed Arabic translation (Modern Standard
Arabic / Fusha). A native Saudi-Arabic speaker should review each row
and flag any that feel awkward or that use wrong industry terminology.

When reviewed, update the catalog at:
`src/lib/i18n/log-catalog.ts`

## Review conventions
- Prefer **Modern Standard Arabic (MSA)** — works across all GCC
  markets (Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman)
- Keep **Western Arabic numerals** (0-9) in the UI for consistency
  with the stopwatch and time displays
- Industry terms for ready-mix concrete:
  - **المصنع** = the plant (batching plant)
  - **الشاحنة** = truck
  - **الخرسانة** = concrete
  - **الصب** = pouring / discharging
  - **الغسيل** = washout / cleaning
  - **الميزان / جسر الميزان** = weighbridge (if we add it later)

## Flag terms that feel off
Mark any row with one of these prefixes when reviewing:
- `[CHANGE]` = translation is wrong, here is a better one
- `[AWKWARD]` = understandable but sounds odd, suggest alternative
- `[OK]` = reads naturally, no change needed (optional, most are this)

---

## Header + sub-tabs

| Key | English | Arabic (proposed) |
|---|---|---|
| field.date | Date | التاريخ |
| field.share_capture_link | Share field-capture link | مشاركة رابط التسجيل |
| field.weekly_briefing | Weekly briefing | التقرير الأسبوعي |
| field.logged_trips | Logged trips | الرحلات المسجلة |
| tab.live | Live | مباشر |
| tab.diagnostics | Diagnostics | التشخيص |
| tab.interventions | Interventions | التدخلات |
| tab.review | Review | المراجعة |
| tab.manual | Manual | يدوي |
| tab.upload | Upload | رفع |
| tab.audio | Audio | صوت |

## Sync status

| Key | English | Arabic |
|---|---|---|
| sync.online_all_synced | All synced | الجميع متزامن |
| sync.last_sync | last sync | آخر مزامنة |
| sync.offline | Offline | غير متصل |
| sync.offline_suffix | will sync when back online | ستتم المزامنة عند الاتصال |
| sync.pending | pending | قيد الانتظار |
| sync.oldest | oldest | الأقدم |
| sync.retry | Retry sync | إعادة المزامنة |
| sync.syncing | Syncing... | جاري المزامنة... |

## Live Timer

| Key | English | Arabic |
|---|---|---|
| live.measuring_as | Measuring as | القياس بواسطة |
| live.current_plant | Current plant | المصنع الحالي |
| live.measuring_from | Measuring from | القياس من |
| live.plant_queue_full_cycle | Plant queue (full cycle) | طابور المصنع (دورة كاملة) |
| live.start_new_trip | Start new trip | بدء رحلة جديدة |
| live.active_trips | Active trips | الرحلات النشطة |
| live.no_active_trips | No active trips. Tap "Start new trip" when a truck enters the plant queue. | لا توجد رحلات نشطة. اضغط "بدء رحلة جديدة" عند دخول الشاحنة طابور المصنع. |

## Stage names (7 stages)

| Key | English | Arabic |
|---|---|---|
| stage.plant_queue | Plant queue | طابور المصنع |
| stage.loading | Loading | التحميل |
| stage.transit_out | Transit out | الذهاب إلى الموقع |
| stage.site_wait | Site wait | الانتظار في الموقع |
| stage.pouring | Pouring | الصب |
| stage.washout | Washout | الغسيل |
| stage.transit_back | Transit back | العودة إلى المصنع |

## Stage hints (shown below timer)

| Key | English | Arabic |
|---|---|---|
| stage.hint.plant_queue | Waiting to enter loading bay | في انتظار الدخول إلى حوض التحميل |
| stage.hint.loading | Batching and filling the mixer | الخلط وملء الخلاطة |
| stage.hint.transit_out | Truck on the road to the site | الشاحنة في الطريق إلى الموقع |
| stage.hint.site_wait | At site, waiting to pour | في الموقع، في انتظار الصب |
| stage.hint.pouring | Discharging concrete | صب الخرسانة |
| stage.hint.washout | Cleaning drum after pour | تنظيف الخلاطة بعد الصب |
| stage.hint.transit_back | Truck returning to plant | الشاحنة تعود إلى المصنع |

## Stage split button labels (what tapping will record)

| Key | English | Arabic |
|---|---|---|
| stage.next.plant_queue | Start loading | بدء التحميل |
| stage.next.loading | Leaves plant | مغادرة المصنع |
| stage.next.transit_out | Arrives at site | الوصول إلى الموقع |
| stage.next.site_wait | Pour starts | بدء الصب |
| stage.next.pouring | Pour complete | انتهاء الصب |
| stage.next.washout | Leaves site | مغادرة الموقع |
| stage.next.transit_back | Back at plant · Complete trip | العودة إلى المصنع · إكمال الرحلة |

## Trip card

| Key | English | Arabic |
|---|---|---|
| card.rec | REC | تسجيل |
| card.total_elapsed | Total elapsed | الوقت الكلي المنقضي |
| card.truck_driver_site | Truck · Driver · Site | الشاحنة · السائق · الموقع |
| card.truck_id | Truck ID | رقم الشاحنة |
| card.driver | Driver | السائق |
| card.site | Site | الموقع |
| card.trip_notes | Trip notes | ملاحظات الرحلة |
| card.mark_rejected | Mark rejected | تعليم كمرفوض |
| card.load_rejected | Load rejected | تم رفض الحمولة |
| card.tap_to_unmark | Tap to unmark | اضغط لإلغاء التعليم |
| card.save_partial | Save partial | حفظ جزئي |
| card.discard | Discard | إلغاء |

## Review queue (outlier management)

| Key | English | Arabic |
|---|---|---|
| reviewq.title | Review queue | قائمة المراجعة |
| reviewq.pending | Pending | قيد الانتظار |
| reviewq.all | All | الكل |
| reviewq.include | Include in dataset | تضمين في البيانات |
| reviewq.exclude | Confirm exclude | تأكيد الاستبعاد |
| reviewq.auto_flagged | Auto-flagged | معلم تلقائياً |
| reviewq.statistical_outlier | Statistical outlier | قيمة شاذة إحصائياً |
| reviewq.total_tat | Total TAT | الوقت الكلي للدورة |
| reviewq.stage_breakdown | Stage breakdown | تفصيل المراحل |

## Interventions

| Key | English | Arabic |
|---|---|---|
| interv.title | Interventions | التدخلات |
| interv.add | Add intervention | إضافة تدخل |
| interv.target_metric | Target metric | المقياس المستهدف |
| interv.metric_tat | Turnaround (TAT) | وقت الدورة (TAT) |
| interv.metric_dispatch | Dispatch time | وقت الإرسال |
| interv.metric_reject | Reject rate | نسبة الرفض |
| interv.metric_deliveries | Deliveries per truck per day | رحلات لكل شاحنة في اليوم |
| interv.metric_site_wait | Site wait | الانتظار في الموقع |
| interv.metric_loading | Loading time | وقت التحميل |
| interv.metric_other | Other | أخرى |

## Diagnostics

| Key | English | Arabic |
|---|---|---|
| diag.range | Range | النطاق |
| diag.today | Today | اليوم |
| diag.last_7 | Last 7 days | آخر ٧ أيام |
| diag.last_30 | Last 30 days | آخر ٣٠ يوماً |
| diag.all | All | الكل |
| diag.complete | complete | مكتمل |
| diag.partial | partial | جزئي |
| diag.breakdown_title | Trip-by-trip TAT breakdown | تفصيل TAT لكل رحلة |
| diag.stage_summary | Stage summary | ملخص المراحل |
| diag.median | Median | الوسيط |
| diag.share_tat | % of TAT | ٪ من TAT |
| diag.top_outliers | Top outliers | أبرز القيم الشاذة |
| diag.measured_by | Measured by | قاس بواسطة |
| diag.expected_vs_measured | Reported vs measured TAT | المُبلَّغ مقابل المُقاس TAT |
| diag.reported | REPORTED (pre-assessment) | مُبلَّغ (تقييم مسبق) |
| diag.measured | MEASURED (on-site) | مُقاس (في الموقع) |
| diag.delta | DELTA | الفرق |

## Token / share link modal

| Key | English | Arabic |
|---|---|---|
| token.button | Share field-capture link | مشاركة رابط التسجيل |
| token.title | Field-capture links | روابط التسجيل |
| token.subtitle | Share a URL with your on-site helpers. They can log trips without needing a login. | شارك رابطاً مع مساعديك في الموقع. يمكنهم تسجيل الرحلات دون الحاجة لتسجيل دخول. |
| token.generate | Generate | إنشاء |
| token.active_links | Active links | الروابط النشطة |
| token.revoked | Revoked | ملغى |
| token.expired | Expired | منتهي |
| token.expires | Expires | ينتهي |
| token.copy | Copy | نسخ |
| token.revoke | Revoke | إلغاء |

## Weekly briefing modal

| Key | English | Arabic |
|---|---|---|
| brief.button | Weekly briefing | التقرير الأسبوعي |
| brief.title | Weekly briefing | التقرير الأسبوعي |
| brief.executive | Executive | تنفيذي |
| brief.detailed | Detailed | تفصيلي |
| brief.copy | Copy to clipboard | نسخ إلى الحافظة |
| brief.regenerate | Regenerate | إعادة الإنشاء |

(Full 180-entry catalog in `src/lib/i18n/log-catalog.ts`)

---

## Instructions for the reviewer

1. Open this file in a Markdown editor or the browser (GitHub renders it)
2. Read each row. Mentally translate the English yourself — does the
   Arabic match what you'd say?
3. For each row that needs attention, add a note:
   - `[CHANGE] <key>: <better translation>`
   - `[AWKWARD] <key>: <why, suggested alternative>`
   - `[OK]` rows don't need marking
4. Pay special attention to:
   - Stage names (frequent user-facing labels)
   - Button labels (short, must be instantly clear)
   - Button actions (Save, Cancel, Confirm etc)
5. Return the annotated file or a simple list of changes to Louis

## Questions?

Key context for the reviewer:
- The observer is likely a plant dispatcher or supervisor
- They use this on a smartphone (iPhone or Android) during active work
- Common level of tech comfort: can use WhatsApp, Google Maps
- Common level of English: can read simple technical English but
  prefers Arabic for reliable understanding under time pressure
- Dialect context: written MSA is expected, spoken context is Saudi/Gulf
