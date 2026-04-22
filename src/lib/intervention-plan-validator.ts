/**
 * Post-generation validator for intervention plans.
 *
 * Runs regex + arithmetic checks on the streamed markdown. Returns a list
 * of violations. Caller decides whether to auto-regenerate (with the
 * violations as feedback) or surface them to the user.
 *
 * Design notes:
 * - Pure function. No IO. Easy to unit-test.
 * - Each check is independent so regressions surface clearly.
 * - Arithmetic parser is conservative: only flags formulas whose result
 *   is off by more than 10% from what the stated operands compute to.
 *   Rounding drift is tolerated.
 */

export interface Violation {
  code: string
  severity: 'critical' | 'major' | 'minor'
  message: string
  snippet?: string // short context from the plan
}

export interface ValidatorInput {
  markdown: string
  recovery_low_usd: number | null
  recovery_high_usd: number | null
  number_of_plants: number
}

export interface ValidatorResult {
  ok: boolean
  violations: Violation[]
  /** Short revision-instruction payload to inject into a regeneration
   *  prompt. Empty string when ok. */
  revisionFeedback: string
}

// ── Banned tokens (case-insensitive, word boundaries where sensible) ──

const BANNED_CAUSAL_VERBS = [
  // core forms + common conjugations
  /\b(drives?|driven|driving|drove)\b/gi,
  /\b(creates?|created|creating)\b/gi,
  /\b(causes?|caused|causing)\b/gi,
  /\bleads?\s+to\b/gi,
  /\bled\s+to\b/gi,
  /\bleading\s+to\b/gi,
  /\bstems?\s+from\b/gi,
  /\bstemmed\s+from\b/gi,
  /\bstemming\s+from\b/gi,
  /\barises?\s+from\b/gi,
  /\barising\s+from\b/gi,
  /\bflows?\s+from\b/gi,
  /\bflowing\s+from\b/gi,
  /\bresults?\s+from\b/gi,
  /\bresulting\s+from\b/gi,
  /\bproduces?\b/gi,
  /\bproduced\b/gi,
  /\bproducing\b/gi,
  /\bgenerates?\b/gi,
  /\bgenerated\b/gi,
  /\bgenerating\b/gi,
]

const BANNED_JARGON = [
  /\boptimi[sz]e[ds]?\b/gi,
  /\boptimi[sz]ing\b/gi,
  /\boptimi[sz]ation\b/gi,
  /\boptimal(ly)?\b/gi,
  /\bsuboptimi[sz]ation\b/gi,
  /\bsuboptimal\b/gi,
  /\bleverag(e|ed|ing)\b/gi,
  /\bstreamlin(e|ed|ing)\b/gi,
  /\brobust(ly)?\b/gi,
  /\bsynerg(y|ies|istic)\b/gi,
  /\butili[sz](e[ds]?|ation|ing)\b/gi,
  /\bactionable\b/gi,
  /\bdeep[\s-]dive\b/gi,
]

// Em-dash characters: U+2014 (—), U+2013 (–), or double hyphens in ASCII
const EM_DASH = /\u2014|\u2013|--/g

// "significantly 20%", "roughly $50k", "about 170 min" etc.
const VAGUE_QUANTIFIER_BEFORE_NUMBER =
  /\b(significantly|severely|substantially|approximately|roughly|around|about)\s+[\$]?\d/gi

// Singular-plant language forbidden when number_of_plants >= 2
const SINGULAR_PLANT_PHRASES = [
  /\bsingle\s+plant\b/gi,
  /\bone\s+plant\b/gi,
  /\ba\s+single\s+plant\b/gi,
]

// USD impact line pattern. Captures dollar amount in "USD impact: $XX,XXX/month" or
// "$ impact if confirmed: $XX,XXX/month" formats. Handles k/m suffixes too.
const USD_IMPACT_LINE = /(?:USD\s+impact|\$\s+impact(?:\s+if\s+confirmed)?)\s*:?\s*\*?\*?\s*\$([\d,]+(?:\.\d+)?)\s*(k|K|m|M|thousand|million)?(?:\/month|\s+monthly|\s+per\s+month)?/gi

// Arithmetic line pattern: "0.8 × $296,344 = $237,075" (accepts × * x, comma-separated numbers)
const ARITHMETIC_LINE = /\b(\d+(?:\.\d+)?)\s*[×x*]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*=\s*\$?([\d,]+(?:\.\d+)?)/g

// Section anchors
const PHASE_1_HEADER = /^##\s*phase\s*1/im
const PHASE_2_HEADER = /^##\s*phase\s*2/im
const PHASE_3_HEADER = /^##\s*phase\s*3/im

export function validatePlan(input: ValidatorInput): ValidatorResult {
  const violations: Violation[] = []
  const md = input.markdown

  // ── 1. Banned causal verbs
  for (const re of BANNED_CAUSAL_VERBS) {
    const matches = md.match(re)
    if (matches) {
      // Deduplicate by lowercase form for a cleaner message
      const uniq = Array.from(new Set(matches.map(m => m.toLowerCase())))
      violations.push({
        code: 'banned_causal_verb',
        severity: 'minor',
        message: `Banned causal verbs present: ${uniq.join(', ')}. Replace with "is consistent with", "points to", "contributes to", "is associated with".`,
      })
    }
  }

  // ── 2. Banned jargon
  for (const re of BANNED_JARGON) {
    const matches = md.match(re)
    if (matches) {
      const uniq = Array.from(new Set(matches.map(m => m.toLowerCase())))
      violations.push({
        code: 'banned_jargon',
        severity: 'minor',
        message: `Banned jargon present: ${uniq.join(', ')}. Replace with plain alternatives.`,
      })
    }
  }

  // ── 3. Em-dashes
  const emDashes = md.match(EM_DASH)
  if (emDashes && emDashes.length > 0) {
    violations.push({
      code: 'em_dash',
      severity: 'minor',
      message: `${emDashes.length} em-dash(es) present. Replace with comma, colon, or period.`,
    })
  }

  // ── 4. Vague quantifiers before numbers
  const vagueMatches = md.match(VAGUE_QUANTIFIER_BEFORE_NUMBER)
  if (vagueMatches) {
    const uniq = Array.from(new Set(vagueMatches.map(m => m.toLowerCase().trim())))
    violations.push({
      code: 'vague_quantifier',
      severity: 'minor',
      message: `Vague quantifier before number: ${uniq.slice(0, 5).join(' | ')}. Cite the number directly or use a range.`,
    })
  }

  // ── 5. Singular-plant language when shared-fleet multi-plant
  if (input.number_of_plants >= 2) {
    for (const re of SINGULAR_PLANT_PHRASES) {
      const matches = md.match(re)
      if (matches) {
        violations.push({
          code: 'single_plant_phrase_in_multi_plant',
          severity: 'critical',
          message: `Plan contains "${matches[0]}" but this is a shared-fleet ${input.number_of_plants}-plant operation. Use "the ${input.number_of_plants} plants", "across the plants", "shared-fleet operation".`,
          snippet: contextSnippet(md, matches[0]),
        })
      }
    }
  }

  // ── 6. Phase 1 + Phase 2 USD cap
  if (input.recovery_high_usd && input.recovery_low_usd) {
    const phase1And2 = extractPhase1And2(md)
    if (phase1And2.text) {
      const impactUsds = extractUsdImpactValues(phase1And2.text)
      const sum = impactUsds.reduce((a, b) => a + b, 0)
      if (sum > 0) {
        const floor = input.recovery_low_usd * 0.8
        const ceiling = input.recovery_high_usd * 1.0
        if (sum > ceiling) {
          violations.push({
            code: 'phase_sum_exceeds_cap',
            severity: 'critical',
            message: `Phase 1 + Phase 2 USD impact sum is $${formatNumber(sum)}/month, exceeding the hard cap of $${formatNumber(ceiling)}/month (recovery_high_usd × 1.0). Revise Phase 2 interventions downward, or mark overlapping opportunities as TBD. Target a total between $${formatNumber(floor)} and $${formatNumber(ceiling)}.`,
          })
        } else if (sum < floor) {
          violations.push({
            code: 'phase_sum_below_floor',
            severity: 'major',
            message: `Phase 1 + Phase 2 USD impact sum is $${formatNumber(sum)}/month, below the floor of $${formatNumber(floor)}/month (recovery_low_usd × 0.8). The pre-assessment already promised this recoverable band — interventions appear under-priced.`,
          })
        }
      }
    }
  }

  // ── 7. Arithmetic self-check
  const arithViolations = detectArithmeticDrift(md)
  violations.push(...arithViolations)

  // ── Build revision feedback
  const revisionFeedback = buildRevisionFeedback(violations)

  return {
    ok: violations.length === 0 || violations.every(v => v.severity === 'minor'),
    violations,
    revisionFeedback,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractPhase1And2(md: string): { text: string } {
  const p1 = md.search(PHASE_1_HEADER)
  const p3 = md.search(PHASE_3_HEADER)
  if (p1 < 0) return { text: '' }
  const end = p3 > p1 ? p3 : md.length
  return { text: md.slice(p1, end) }
}

function extractUsdImpactValues(text: string): number[] {
  const out: number[] = []
  // Only match lines that are labeled as "USD impact" specifically, to avoid
  // capturing costs or unrelated dollar figures.
  const impactLineRe = /(?:USD\s+impact|\*\*USD\s+impact\*\*)\s*:?\s*\*?\*?\s*\$([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?/gi
  let m: RegExpExecArray | null
  while ((m = impactLineRe.exec(text)) !== null) {
    const base = parseFloat(m[1].replace(/,/g, ''))
    const suffix = (m[2] ?? '').toLowerCase()
    const mult = suffix === 'k' ? 1000 : suffix === 'm' ? 1_000_000 : 1
    out.push(base * mult)
  }
  return out
}

function detectArithmeticDrift(md: string): Violation[] {
  const violations: Violation[] = []
  let m: RegExpExecArray | null
  // Reset lastIndex because the pattern is /g
  ARITHMETIC_LINE.lastIndex = 0
  while ((m = ARITHMETIC_LINE.exec(md)) !== null) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2].replace(/,/g, ''))
    const claimed = parseFloat(m[3].replace(/,/g, ''))
    if (!isFinite(a) || !isFinite(b) || !isFinite(claimed)) continue
    const expected = a * b
    if (expected === 0) continue
    const diff = Math.abs(claimed - expected) / expected
    if (diff > 0.1) {
      violations.push({
        code: 'arithmetic_drift',
        severity: 'major',
        message: `Formula "${m[0].trim()}" computes to ${Math.round(expected).toLocaleString()}, not ${m[3]}. Drift ${Math.round(diff * 100)}%. Either fix the result or correct the operand.`,
        snippet: m[0].trim(),
      })
    }
  }
  return violations
}

function buildRevisionFeedback(violations: Violation[]): string {
  if (violations.length === 0) return ''
  const criticals = violations.filter(v => v.severity === 'critical')
  const majors = violations.filter(v => v.severity === 'major')
  const minors = violations.filter(v => v.severity === 'minor')

  const parts: string[] = []
  if (criticals.length > 0) {
    parts.push('## CRITICAL issues to fix (plan will not be shown to client until resolved)')
    for (const v of criticals) {
      parts.push(`- [${v.code}] ${v.message}${v.snippet ? ` (near: "${v.snippet}")` : ''}`)
    }
  }
  if (majors.length > 0) {
    parts.push('\n## Major issues to fix')
    for (const v of majors) {
      parts.push(`- [${v.code}] ${v.message}${v.snippet ? ` (near: "${v.snippet}")` : ''}`)
    }
  }
  if (minors.length > 0) {
    parts.push('\n## Minor polish')
    for (const v of minors) {
      parts.push(`- [${v.code}] ${v.message}`)
    }
  }
  parts.push('\nProduce the full revised plan now, keeping the same section structure. Only change what the issues require. All other content stays.')
  return parts.join('\n')
}

function contextSnippet(md: string, phrase: string): string {
  const idx = md.toLowerCase().indexOf(phrase.toLowerCase())
  if (idx < 0) return phrase
  const start = Math.max(0, idx - 40)
  const end = Math.min(md.length, idx + phrase.length + 40)
  return md.slice(start, end).replace(/\s+/g, ' ').trim()
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
