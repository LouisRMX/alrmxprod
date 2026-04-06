// ── Trip CSV Parser ────────────────────────────────────────────────────────
// Accepts CSV text with truck dispatch/return timestamps.
// Required columns: truck, dispatch, return
// Optional columns: site_arrival, site_departure (and any extras — silently ignored)
//
// Time format accepted: HH:MM or HH:MM:SS  (24-hour)
// Date is supplied separately as a YYYY-MM-DD string and combined here.
//
// Returns { rows, errors } — parse errors do not abort the whole file.

export interface ParsedRow {
  rowIndex:       number    // 1-based (row 1 = first data row, not header)
  truckId:        string
  dispatch:       string    // HH:MM from CSV
  siteArrival:    string | null
  siteDeparture:  string | null
  returnTime:     string    // HH:MM from CSV
}

export interface ParseError {
  rowIndex: number
  truck:    string
  message:  string
}

export interface ParseResult {
  rows:   ParsedRow[]
  errors: ParseError[]
}

// Column name aliases → canonical field
const ALIASES: Record<string, string> = {
  // truck
  truck: 'truck', vehicle: 'truck', truck_id: 'truck', 'truck id': 'truck',
  truck_no: 'truck', 'truck no': 'truck', plate: 'truck',
  // dispatch
  dispatch: 'dispatch', dispatched: 'dispatch', dispatch_time: 'dispatch',
  left_plant: 'dispatch', depart: 'dispatch', departure: 'dispatch',
  plant_exit: 'dispatch', 'plant exit': 'dispatch',
  // site_arrival
  site_arrival: 'site_arrival', arrived: 'site_arrival', arrived_site: 'site_arrival',
  site_in: 'site_arrival', 'site in': 'site_arrival', site_arrive: 'site_arrival',
  delivery_time: 'site_arrival',
  // site_departure
  site_departure: 'site_departure', departed: 'site_departure', left_site: 'site_departure',
  site_out: 'site_departure', 'site out': 'site_departure', site_depart: 'site_departure',
  // return
  return: 'return', returned: 'return', return_time: 'return', plant_return: 'return',
  'plant return': 'return', back: 'return', arrived_plant: 'return',
}

function canonicalize(header: string): string {
  return (ALIASES[header.toLowerCase().trim()] ?? header.toLowerCase().trim())
}

function parseTime(raw: string): string | null {
  if (!raw || raw.trim() === '') return null
  const cleaned = raw.trim()
  // Accepts HH:MM or HH:MM:SS
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleaned)) {
    const [h, m] = cleaned.split(':').map(Number)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  return null
}

export function parseTripCsv(csvText: string): ParseResult {
  const rows: ParsedRow[]   = []
  const errors: ParseError[] = []

  // Normalize line endings and split
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.filter(l => l.trim().length > 0)
  if (nonEmpty.length < 2) {
    return { rows: [], errors: [{ rowIndex: 0, truck: '', message: 'File is empty or has no data rows' }] }
  }

  // Parse header — auto-detect delimiter (semicolon for Danish/European Excel, comma otherwise)
  const headerLine = nonEmpty[0]
  const delimiter = headerLine.includes(';') ? ';' : ','
  const headers = headerLine.split(delimiter).map(h => canonicalize(h))

  const col = (name: string) => headers.indexOf(name)
  const truckCol   = col('truck')
  const dispCol    = col('dispatch')
  const returnCol  = col('return')
  const siteInCol  = col('site_arrival')
  const siteOutCol = col('site_departure')

  if (truckCol === -1 || dispCol === -1 || returnCol === -1) {
    const missing: string[] = []
    if (truckCol  === -1) missing.push('"truck"')
    if (dispCol   === -1) missing.push('"dispatch"')
    if (returnCol === -1) missing.push('"return"')
    return {
      rows: [],
      errors: [{ rowIndex: 0, truck: '', message: `Missing required columns: ${missing.join(', ')}` }],
    }
  }

  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i].split(delimiter).map(c => c.trim())
    const rowIndex = i  // 1-based

    const rawTruck   = cells[truckCol]   ?? ''
    const rawDisp    = cells[dispCol]    ?? ''
    const rawReturn  = cells[returnCol]  ?? ''
    const rawSiteIn  = siteInCol  >= 0 ? (cells[siteInCol]  ?? '') : ''
    const rawSiteOut = siteOutCol >= 0 ? (cells[siteOutCol] ?? '') : ''

    const truckId = rawTruck.trim()
    if (!truckId) {
      errors.push({ rowIndex, truck: '—', message: 'Missing truck identifier' })
      continue
    }

    const dispatch = parseTime(rawDisp)
    if (!dispatch) {
      errors.push({ rowIndex, truck: truckId, message: `Invalid dispatch time: "${rawDisp}"` })
      continue
    }

    const returnTime = parseTime(rawReturn)
    if (!returnTime) {
      errors.push({ rowIndex, truck: truckId, message: `Missing or invalid return time: "${rawReturn}"` })
      continue
    }

    rows.push({
      rowIndex,
      truckId,
      dispatch,
      siteArrival:   parseTime(rawSiteIn),
      siteDeparture: parseTime(rawSiteOut),
      returnTime,
    })
  }

  return { rows, errors }
}
