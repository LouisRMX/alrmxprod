CODEBASE CONTEXT — LÆS DETTE FØRST
---
Repository: github.com/LouisRMX/alrmxprod
Stack: Next.js 15 (App Router), Supabase, Vercel
Al kode ligger under src/

Relevant mappestruktur:
- Assessment-flowet: src/app/dashboard/assess/
- Rapporter: src/app/dashboard/reports/
- API-endpoints: src/app/api/ (undermapper: generate-report, ai-stream, admin, webhook/assessment-complete)
- Komponenter: src/components/
- Hjælpefunktioner: src/lib/
- Supabase migrations/schema: supabase/

Det nye GPS-modul skal placeres:
- UI-komponenter: src/components/gps-upload/
- Forretningslogik: src/lib/gps/
- API-endpoints: src/app/api/gps/ (nye routes: upload, analyze)
- GPS-upload step integreres i det eksisterende assessment-flow under src/app/dashboard/assess/
- Nye Supabase-tabeller tilføjes som ny migration-fil under supabase/

Før du skriver én linje kode:
1. Læs src/app/dashboard/assess/ for at forstå det eksisterende assessment-flow
2. Læs src/lib/ for at forstå eksisterende hjælpefunktioner og mønstre
3. Læs src/components/ for at forstå eksisterende design-system og komponenter
4. Læs supabase/ for at forstå eksisterende tabelstruktur og RLS-mønstre
Genrug eksisterende mønstre, komponenter og konventioner konsekvent.
---

BENCHMARK-KONTEKST — KRITISK
---
Al-RMX bruger allerede en dynamisk turnaround-benchmark:
TARGET_TA = 60 + (delivery_radius_km × 1.5 × 2)
Eksempel: 12 km radius → 78 min target (ikke en fast global tal)
Flag-grænse: TARGET_TA × 1.2

GPS-modulet SKAL hente plantens delivery_radius fra assessments-tabellen,
answers-kolonne, felt: "delivery_radius". Værdien er en string
('10', '12', etc.) — parse til float.
Fallback: 12.0 km hvis feltet mangler eller ikke kan parses.
Beregn TARGET_TA dynamisk. Brug aldrig et fast benchmark-tal som 75 eller 80 min.
Alle turnaround-sammenligninger i rapporten skal bruge plantens
eget TARGET_TA — konsistent med eksisterende scoring-logik.
---

Du er en senior full-stack product engineer.

Din opgave er at bygge et robust CSV-baseret truck GPS upload-modul
inde i det eksisterende Al-RMX assessment-flow.

Dette er IKKE et API-integrationsprojekt.
Dette er IKKE en fleet management-platform.
Dette er en letvægts, pålidelig upload-og-analyse-feature inde i
et eksisterende assessment-produkt.

Kundeoplevelsen skal forblive ekstremt simpel:
1. Kunde downloader GPS-eksport fra sit flådesystem for de sidste 30 dage
2. Kunde uploader CSV-filen
3. Kunde vælger tidszone (én dropdown)
4. Platform registrerer format automatisk, mapper kolonner, beregner
   metrics og indsætter konklusioner i assessment-rapporten
5. Kunden ser aldrig rå datatabeller

---
PRIMÆRT MÅL
---

Byg den bedste praktiske løsning til CSV-upload og analyse af
truck-bevægelsesdata i Al-RMX assessment-flowet.

Løsningen skal:
- Acceptere CSV-uploads
- Registrere GPS-datastrukturtype automatisk (se Lag 2)
- Parse forskellige kolonnenavngivningskonventioner fra
  forskellige GPS-systemer
- Inkludere et genanvendeligt kolonnemapper-trin — kun vist som fallback
- Normalisere data til ét internt skema
- Beregne logistics performance metrics efter korrekt hierarki
- Generere en struktureret "Logistics Intelligence"-sektion
  automatisk til assessment-rapporten via fast skabelon
- Være robust, simpel og produktionsklar
- Foretrække klarhed og pålidelighed over smart arkitektur

---
ARKITEKTUR: 5 LAG
---

Lag 1: Upload + Tidszone
Lag 2: GPS-formatregistrering
Lag 3: Kolonnemapping (auto først, manuelt som fallback)
Lag 4: Normalisering + Metrics Engine
Lag 5: Assessment Report Output

---
LAG 1: UPLOAD + TIDSZONE
---

Byg en CSV-upload-komponent inde i Al-RMX assessment-flowet.
Placer den som et nyt trin i src/app/dashboard/assess/ —
efter eksisterende dataindtastning, før rapport-generering.
Genrug eksisterende UI-komponenter og design-system.

UI-krav:
- GPS-upload er et valgfrit trin i assessment-flowet.
  Vis en "Skip — I don't have GPS data" knap tydeligt
  ved siden af upload-knappen. Kunden skal altid kunne
  skippe uden konsekvens for resten af flowet.
  Rapporten genereres normalt — Logistics Intelligence-
  sektionen udelades simpelthen hvis ingen GPS-data
  er uploadet.
- Drag-and-drop og klik-for-upload
- Kun CSV
- Hjælpetekst: "Upload a GPS or fleet export for the last 30 days"
- Umiddelbart efter upload, vis én tidszone-dropdown:
  "What timezone does your GPS system use?"
  Muligheder: UTC / AST (UTC+3) / GST (UTC+4)
  Standard: AST (UTC+3) — mest almindelig i GCC
- Dette er det eneste konfigurationstrin kunden ser som standard

Validering (på rå upload, før normalisering):
- Tom fil
- Ulæselig CSV
- For få rækker (minimum 20 rækker)
- Ingen identificerbar timestamp-kolonne efter mapping-forsøg
- Fil linket til assessment_id i Supabase

Storage:
- Gem uploaded fil i Supabase Storage
- Sti: assessments/{assessment_id}/gps/{filename}
- Implementér RLS: kun assessment-ejer kan tilgå filen
- Følg eksisterende RLS-mønstre i supabase/-mappen
- Gem metadata i uploaded_gps_files-tabel (se datamodel nedenfor)

Genupload:
- Tillad kunden at erstatte filen til enhver tid
- Rapporten bruger altid den seneste logistics_analysis_result
  med status = 'complete'. Tidligere resultater sættes til
  archived = true.

Statusvisning (synlig for kunden):
- Uploaded
- Analyzing format...
- Ready to confirm (hvis manuel mapping er nødvendig)
- Processing...
- Complete
- Failed: [handlingsorienteret besked]

---
LAG 2: GPS-FORMATREGISTRERING
---

Dette er det første behandlingstrin efter upload.
Før kolonnemapping: registrér hvilken type GPS-data der er uploadet.

Der er tre fundamentalt forskellige GPS-eksportstrukturer:

TYPE A — Event Stream
Rå positionsevents, én række pr. GPS-ping eller statusevent.
Typisk én række hvert 30-120 sekunder pr. truck.
Karakteristika: Høj rækkeantal, gentagne truck-ID'er, ingen
eksplicitte stop/ankomst-kolonner, timestamps på hver række.
Eksempelkolonner: Truck ID, Timestamp, Lat, Lon, Speed, Status

TYPE B — Geofence Log
Events udløst når truck krydser en defineret zone.
Én række pr. geofence-krydsningsevent.
Karakteristika: Mellemhøj rækkeantal, event_type-kolonne med
værdier som "arrival"/"departure" eller "enter"/"exit",
stednavne til stede.
Eksempelkolonner: Vehicle, Event Type, Location, Arrived At,
Departed At

TYPE C — Trip Summary
Én række pr. afsluttet tur eller levering.
Karakteristika: Lavt rækkeantal relativt til flådestørrelse,
eksplicitte varighed/distance-kolonner, sandsynligvis allerede
aggregeret.
Eksempelkolonner: Trip ID, Truck, Origin, Destination,
Start Time, End Time, Distance, Duration

Registreringslogik:
- Inspicer rækkeantal, kolonnenavne og værdimønstre
- Timestamp-kolonne med gentagne truck-ID'er og speed-værdier → TYPE A
- event_type-kolonne med arrival/departure-værdier ELLER
  parrede start/slut-tidskolonner → TYPE B
- Eksplicitte varighed- eller distance-kolonner,
  lav rækketæthed pr. truck → TYPE C
- Hvis registrering er tvetydig: standard TYPE B som
  mest almindeligt GCC-flådeeksportformat
- Gem registreret type i uploaded_gps_files.detected_format_type
- Anvend korrekt parsing-strategi i Lag 4 baseret på registreret type

TYPE A UDEN LOCATION_NAME:
Hent plantens GPS-koordinater fra plant-record
(plant.latitude / plant.longitude). Brug 500 meter radius
som "at plant" geofence til at afgøre om truck er på planten
eller på site. Hvis plant-record ikke har koordinater: sæt
inferred_location_type = unknown for alle rækker og reducer
analysis_confidence_score med 0.3.

---
LAG 3: KOLONNEMAPPING
---

Forsøg automatisk kolonnemapping først.
Vis manuel mapping-interface kun som fallback.

Automatisk mapping:
Brug et alias-dictionary til at matche uploadede kolonnenavne
til interne kanoniske felter.

Kanoniske felter og kendte aliaser:

truck_id:
  Truck ID, Vehicle ID, Unit ID, Asset ID, Fleet ID,
  Registration, Vehicle, Truck, Unit, Asset

event_timestamp:
  Timestamp, Event Time, Date Time, Time, DateTime,
  Date/Time, Created At, Recorded At

stop_start_time:
  Arrival Time, Stop Start, Arrived At, Entry Time,
  Start Time, Check In, Geofence Entry

stop_end_time:
  Departure Time, Stop End, Departed At, Exit Time,
  End Time, Check Out, Geofence Exit

location_name:
  Location, Address, Site, Geofence, Zone, Destination,
  Place, Stop Name, Customer

latitude:
  Lat, Latitude, GPS Lat, Y

longitude:
  Lon, Lng, Long, Longitude, GPS Lon, X

event_type:
  Event, Event Type, Activity, Status, Type, Action

driver_id:
  Driver, Driver ID, Operator, Driver Name

speed:
  Speed, Speed (km/h), Velocity

odometer:
  Odometer, Mileage, Distance, Odometer (km)

trip_id:
  Trip ID, Trip, Journey ID, Route ID

Matching-logik:
- Normaliser begge sider: lowercase, fjern mellemrum og
  specialtegn
- Match på eksakt normaliseret streng først
- Match på substring dernæst
- Hvis confidence > 0.85 på alle påkrævede felter:
  auto-anvend og spring manuel mapper over
- Hvis confidence < 0.85 på ét eller flere påkrævede felter:
  vis manuel mapper

Manuel mapper UI:
- Vis kun når auto-mapping confidence er utilstrækkelig
- Uploadede kolonnenavne til venstre
- Kanoniske felt-dropdowns til højre
- Forhåndsvisning af 5 eksempelrækker under mapping-tabellen
- "Skip"-mulighed for valgfrie felter
- Gem mapping som genanvendelig skabelon med:
  - template_name (auto-foreslået fra filnavn-mønster)
  - customer_id
  - format_type
- Ved fremtidige uploads: auto-registrer og anvend
  matchende gemt skabelon
- Kundeside-besked når mapper vises:
  "We couldn't fully recognize your GPS format automatically.
   Please match your columns below — this takes about
   30 seconds and will be remembered for future uploads."

---
LAG 4: NORMALISERING + METRICS ENGINE
---

DEL A: NORMALISERING

Normaliser alle uploadede data til ét internt skema
uanset kildeformat.

Internt normalized_gps_events-tabel:
- id
- assessment_id
- upload_id (foreign key til uploaded_gps_files)
- truck_id
- event_timestamp (UTC, normaliseret med timezone_selected
  fra Lag 1)
- stop_start_time (UTC, nullable)
- stop_end_time (UTC, nullable)
- location_name (nullable)
- latitude (nullable)
- longitude (nullable)
- event_type (nullable)
- driver_id (nullable)
- speed (nullable)
- odometer (nullable)
- inferred_location_type: plant | site | transit | unknown
- raw_row_reference (integer, original CSV-rækkenummer)
- mapping_template_id (foreign key, nullable)
- derived_delivery_id (nullable, tildelt under
  metrics-beregning)

Lokationstype-inferens:
- location_name indeholder: plant, batching, RMC, factory,
  depot → inferred_location_type = plant
- location_name indeholder: site, project, pour, delivery,
  client → inferred_location_type = site
- speed > 5 km/h → inferred_location_type = transit
- For TYPE A uden location_name: brug plant-koordinater
  og 500m geofence som beskrevet i Lag 2
- Ellers → unknown

Tidszone-korrektion:
- Konvertér alle timestamps til UTC med timezone_selected
- Gem kun UTC i normaliseret tabel
- Behold raw_row_reference til audit

DEL B: METRICS ENGINE

METRICS-HIERARKI

METRIC 1 — Primær (beregn altid hvis data tillader):
Gennemsnitlig Turnaround Tid

Definition: Gennemsnitlig total tid fra truck forlader plant
med last til truck returnerer til plant klar til næste last.
Komponenter: Transit til site + ventetid på site + losning +
retur-transit + plant-tomgangstid før næste dispatch.

Benchmark: DYNAMISK — hentes fra assessments-tabellen:
  delivery_radius = parse_float(answers['delivery_radius'])
  TARGET_TA = 60 + (delivery_radius × 1.5 × 2)
  Fallback: delivery_radius = 12.0 km hvis feltet mangler
  Flag hvis gennemsnit > TARGET_TA × 1.2
  Dette er konsistent med Al-RMX's eksisterende
  turnaround-scoring logik.

Beregningslogik pr. formattype:
- TYPE B/C: Hvis plant-afgangs- og plant-ankomst-timestamps
  er identificerbare, beregn direkte
- TYPE A: Inferer ved at identificere sekvenser hvor truck
  forlader plant-geofence, besøger site, returnerer til plant
- Hvis plant-lokation ikke er identificerbar: beregn delvis
  turnaround (site-ankomst til site-afgang + estimeret retur)
  og markér som delvist estimat

METRIC 2 — Sekundær:
Gennemsnitlig Ventetid på Site

Definition: Tid truck er stationær på leveringssite før
afgang. Proxy for demurrage-eksponering og site-beredskab.
Beregning: stop_end_time minus stop_start_time for
site-events. Hvis ikke direkte tilgængelig, inferer fra
event-sekvenser på site-lokationstype.
Benchmark: 25 minutter.
Flag hvis gennemsnit > 40 minutter.

METRIC 3 — Sekundær:
Sandsynlige Returloads

Definition: Estimeret antal ture hvor truck returnerede til
plant usædvanligt hurtigt efter et kort site-besøg, hvilket
tyder på load-afvisning eller returlast.
Beregning: Identificer site-besøg hvor stop-varighed
< 15 minutter OG umiddelbar retur til plant. Disse er
sandsynlige returload-events.
Udtryk som: antal og procentdel af analyserede leveringer.

Understøttende sub-metrics (beregn hvor muligt):
- Median turnaround-tid
- P90 turnaround-tid (værste 10% af ture)
- Gennemsnitlige ture pr. truck pr. dag
- Antal trucks inkluderet i analysen
- Antal analysérbare ture
- Procentdel af rækker succesfuldt parset
- Analyse-confidence score (0.0–1.0 baseret på
  data-fuldstændighed)

Confidence score-logik:
- 1.0: Alle tre primære metrics beregnelige med >80%
  rækker parset
- 0.7–0.9: Primær metric beregnelig, sekundære metrics
  delvise
- 0.4–0.6: Kun delvis turnaround beregnelig
- <0.4: Utilstrækkelige data — generer ikke rapport-sektion,
  vis fejlbesked til bruger

Hvis en metric ikke kan beregnes pålideligt, returner:
"Insufficient data quality to calculate reliably"
Vis aldrig tomme værdier eller nuller for uberegnede metrics.

Gem resultater i logistics_analysis_results-tabel.

---
LAG 5: ASSESSMENT REPORT OUTPUT
---

VIGTIGT — INTEGRATION MED EKSISTERENDE RAPPORT-FLOW:
Logistics Intelligence-sektionen genereres IKKE via AI og
er IKKE en del af generate-report/route.ts AI-streaminget.
Den udfyldes via fast skabelon i reportGenerator.ts ved
analyze-kørsel og gemmes i:
  logistics_analysis_results.generated_section_text
  (ny tekstkolonne i tabellen)

ReportView.tsx henter denne kolonne direkte fra Supabase og
viser den som en separat sektion under de AI-genererede
sektioner. Ingen streaming, ingen AI-kald, ingen integration
med generate-report/route.ts.

Generer en fast-struktur "Logistics Intelligence"-sektion
til indsættelse i Al-RMX assessment-rapporten.

Hent TARGET_TA fra assessment-record før rapport-generering.
Alle turnaround-sammenligninger bruger plantens eget TARGET_TA.

Brug denne præcise skabelon. Erstat alle [PARENTESER] med
beregnede værdier. Opfind ingen findings. Brug ikke
adjektiver uden tal bag dem. Skriv som konsulent, ikke AI.

---

LOGISTICS INTELLIGENCE
Baseret på [TRIPS_ANALYZED] leveringer på tværs af
[TRUCKS_ANALYZED] trucks over [DATE_RANGE_DAYS] dage.
Analyse-confidence: [CONFIDENCE_LABEL]
([CONFIDENCE_SCORE_PCT]%)

---

TURNAROUND PERFORMANCE
Gennemsnitlig turnaround-tid: [AVG_TURNAROUND] minutter
(Plant target: [TARGET_TA] min baseret på [RADIUS] km
leveringsradius | P90: [P90_TURNAROUND] min)

HVIS AVG > TARGET_TA × 1.2:
Turnaround-tid er [X] minutter over plantemålet. Med
[TRUCKS_ANALYZED] trucks og [AVG_TRIPS] ture pr. truck
pr. dag ville en reduktion på 20 minutter give cirka
[CALCULATED_EXTRA_TRIPS] ekstra leveringskapacitet pr. dag
uden flådeudvidelse.

HVIS AVG mellem TARGET_TA og TARGET_TA × 1.2:
Turnaround-tid er inden for acceptabelt interval men over
plantemål. Målrettede dispatch-forbedringer kan genvinde
[CALCULATED_MINUTES] minutter pr. truck pr. dag.

HVIS AVG < TARGET_TA:
Turnaround-tid performer på eller under plantemål.
Flådekapacitet bruges effektivt.

---

VENTETID PÅ SITE
Gennemsnitlig ventetid på site: [AVG_WAITING] minutter
(Benchmark: 25 minutter | Median: [MEDIAN_WAITING] min)

HVIS AVG > 40:
Ventetid på site er [X] minutter over benchmark på tværs
af [TRIPS_ANALYZED] analyserede ture. Dette repræsenterer
cirka [CALCULATED_HOURS] timers uproduktiv truck-tid pr.
dag og direkte demurrage-eksponering hvis ikke faktureret
til klienter.

HVIS AVG 25–40:
Ventetid er moderat forhøjet. Sandsynligvis site-specifik
friktion snarere end et systemisk dispatch-problem.

HVIS METRIC UTILGÆNGELIG:
Ventetid på site: Insufficient data quality to calculate
reliably.

---

RETURLOAD-SIGNALER
Sandsynlige returloads identificeret: [RETURN_LOAD_COUNT]
([RETURN_LOAD_PCT]% af analyserede ture)

HVIS PCT > 5%:
[RETURN_LOAD_PCT]% af ture viser karakteristika konsistente
med load-afvisning eller returlast. Ved en gennemsnitlig
lastværdi på [ASSUMED_LOAD_VALUE] pr. m³ og estimeret
[AVG_LOAD_SIZE] m³ pr. last repræsenterer dette potentiel
omsætningslækage på cirka [CALCULATED_LEAKAGE] pr. måned.
Bemærk: Lastværdi og -størrelse bør bekræftes med
planteregistreringer for præcis beregning.

HVIS PCT < 5%:
Returload-rate er lav. Ingen signifikant overskuds- eller
afvisningsmønster registreret i tilgængelige data.

HVIS METRIC UTILGÆNGELIG:
Returload-analyse: Insufficient data quality to calculate
reliably.

---

DATANOTE
Denne analyse er afledt af GPS/flådeeksportdata leveret af
planten. Metrics markeret som estimater er baseret på
infererede turgrænser og bør behandles som retningsgivende
indikatorer. Præcise tal kræver krydskontrol med
batchregistreringer og dispatch-logs — en komponent i den
fulde Al-RMX fysiske assessment.

---

CONFIDENCE-LABELS:
- 0.8–1.0 → "High"
- 0.6–0.79 → "Moderate"
- 0.4–0.59 → "Low — treat as directional only"
- <0.4 → Generer ikke sektion. Vis besked:
  "GPS data provided does not contain sufficient information
   for reliable logistics analysis. Please contact your GPS
   vendor for a more detailed export, or this section will
   be completed during the physical assessment."

---
ADMIN / DEBUG MODE
---

Intern visning — ikke synlig for kunder.
Tilgængelig via admin-rolle flag i Supabase (følg eksisterende
admin-mønster i src/app/api/admin/).

Vis:
- Registreret GPS-formattype
- Rå uploadede kolonnenavne
- Auto-mapping confidence pr. felt
- Anvendt mapping-skabelon
- 10 eksempel-normaliserede rækker
- Metric-beregningsstatus pr. metric
- Confidence score-breakdown
- Parse-fejllog med rækkereferencer
- Tidszone-konverteringseksempel (3 rækker før/efter)

---
DATAMODEL
---

Nye tabeller — tilføj som ny Supabase migration-fil
under supabase/ og følg eksisterende navngivnings-
og RLS-mønstre:

uploaded_gps_files:
  id, assessment_id, original_filename, upload_timestamp,
  timezone_selected, detected_format_type,
  mapping_template_id, processing_status, parse_error_log,
  analysis_confidence_score, storage_path, archived boolean

mapping_templates:
  id, customer_id, template_name, format_type,
  column_mappings (jsonb), created_at, last_used_at,
  use_count
  RLS: customer_id-baseret — brugere ser kun egne skabeloner

normalized_gps_events:
  id, assessment_id, upload_id, truck_id, event_timestamp,
  stop_start_time, stop_end_time, location_name, latitude,
  longitude, event_type, driver_id, speed, odometer,
  inferred_location_type, raw_row_reference,
  mapping_template_id, derived_delivery_id

logistics_analysis_results:
  id, assessment_id, upload_id, avg_turnaround_minutes,
  median_turnaround_minutes, p90_turnaround_minutes,
  target_ta_minutes (gemt fra assessment ved beregningstidspunkt),
  delivery_radius_km (gemt fra assessment ved beregningstidspunkt),
  avg_waiting_time_minutes, median_waiting_time_minutes,
  probable_return_loads_count, probable_return_loads_pct,
  avg_trips_per_truck_per_day, trucks_analyzed,
  trips_analyzed, rows_parsed_pct, confidence_score,
  calculation_notes, generated_section_text text,
  archived boolean default false, created_at

Supabase Storage:
  Bucket: gps-uploads
  Sti: assessments/{assessment_id}/gps/{filename}
  RLS: autentificeret bruger skal eje assessment for at
  læse eller skrive — følg eksisterende RLS-mønster

---
MODULÆR KODESTRUKTUR
---

Byg som separate moduler — ikke én stor komponent:

src/components/gps-upload/
  UploadDropzone.tsx      — fil-upload UI + tidszone-selector + skip-knap
  ColumnMapper.tsx        — manuel mapping UI (fallback)
  MappingPreview.tsx      — 5-rækkers forhåndsvisning
  ProcessingStatus.tsx    — statusindikator-komponent

src/lib/gps/
  detectFormat.ts         — GPS type A/B/C registreringslogik
  autoMapper.ts           — alias-dictionary + auto-mapping
  normalizer.ts           — data-normalisering til internt skema
  metricsEngine.ts        — turnaround, ventetid, returloads
  reportGenerator.ts      — fast skabelon-udfyldning → generated_section_text

src/app/api/gps/
  upload/route.ts         — fil-upload handler + Supabase Storage
  analyze/route.ts        — trigger: registrering → mapping →
                            normalisering → metrics → skabelon-generering

---
FEJLBESKEDER
---

Brug handlingsorienteret sprog:

Ingen timestamp fundet:
"We could not identify a timestamp column in your file.
 Please map the column containing the date and time for
 each truck event."

For få rækker:
"Your file contains fewer than 20 data rows, which is not
 sufficient for reliable analysis. Please export at least
 30 days of GPS data."

Intet truck-ID:
"We could not identify a truck or vehicle ID column.
 If your export covers only one truck, please add a column
 with the truck registration or ID before uploading."

Ugyldige timestamps:
"Several rows contain unreadable timestamps. This is often
 caused by timezone formatting. Please verify your export
 settings or try selecting a different timezone above."

Tvetydigt format:
"We could not automatically recognize your GPS export
 format. Please complete the column mapping below — it
 takes about 30 seconds and will be saved for future
 uploads."

---
BEGRÆNSNINGER
---

- Ingen eksterne API-integrationer
- Ingen Excel-import i v1 (kun CSV)
- Ingen rå datatabeller synlige for kunder
- Ingen overkomplicerede vendor-specifikke adaptere
- Arabiske kolonnenavne understøttes ikke i v1 — kun engelsk.
  Dokumentér dette eksplicit i UI-hjælpeteksten.
- Genbrug eksisterende Al-RMX design-system konsekvent
- Hold alle nye database-operationer inden for
  eksisterende RLS-mønstre

---
IMPLEMENTERINGSINSTRUKTIONER
---

Før du skriver én linje kode:
1. Læs src/app/dashboard/assess/ — forstå assessment-flowet
2. Læs src/lib/ — forstå eksisterende mønstre og utilities
3. Læs src/components/ — forstå design-system
4. Læs supabase/ — forstå eksisterende skema og RLS
5. Opsummer implementeringsplan i 10 bullets
6. Byg derefter lag for lag

Succeskriterier:
- Kunde uploader én CSV med minimal friktion
- Skip-mulighed er altid synlig — GPS-upload blokerer aldrig flowet
- System registrerer format og mapper kolonner automatisk
  i >80% af tilfælde
- Turnaround-metric beregnes med plantens eget TARGET_TA
  og fremgår tydeligt i rapporten
- Logistics Intelligence-sektionen vises i ReportView.tsx
  som statisk tekst hentet fra Supabase — ingen AI-streaming
- Hele modulet følger eksisterende kodekonventioner konsekvent
