// Shared utilities for tax transaction pattern matching
// Used by both client (transaction-table) and server (smart-match, import APIs)

/**
 * Strip trailing noise from transaction descriptions to produce a clean pattern.
 * e.g. "EFT DEPOSIT PAYPAL TRANSFER XXXXXXXXXXX078" → "EFT DEPOSIT PAYPAL TRANSFER"
 * e.g. "ATH MOVIL 3694 ON 01/31/25" → "ATH MOVIL 3694"
 */
export function cleanPattern(raw: string): string {
  let p = raw
    // Remove trailing masked digits (XXXX078, XXXXXXXXX1234)
    .replace(/\s+X{2,}\d*\s*$/, "")
    // Remove trailing dates (ON 01/31/25, 01/31/2025, 2025-01-31)
    .replace(/\s+(?:ON\s+)?\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i, "")
    .replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, "")
    // Remove trailing reference numbers (#12345, REF: 12345, REF 12345)
    .replace(/\s+(?:#|REF:?\s*)\d+\s*$/i, "")
    // Remove trailing long digit sequences (6+ digits, likely reference/account numbers)
    .replace(/\s+\d{6,}\s*$/, "")
    // Remove trailing asterisks and short codes (*1234, ** 5678)
    .replace(/\s+\*{1,2}\s*\d+\s*$/, "")
    .trim()
  // Escape regex special characters so the pattern matches literally
  p = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return p
}

/**
 * Normalize a transaction description for grouping purposes.
 * More aggressive than cleanPattern — also strips mid-string noise.
 * Two transactions with the same normalized form should be "the same merchant".
 */
/**
 * Test if a transaction text matches a rule pattern.
 * Tries exact regex first, then falls back to word-prefix matching
 * to handle bank truncation (e.g. "PURCHASE GAS STATIO" matches "PURCHASE GAS STATION").
 */
export function matchesRule(text: string, regex: RegExp, pattern: string): boolean {
  // Fast path: exact regex match
  if (regex.test(text)) return true

  // Fallback: word-prefix matching for truncated descriptions
  // Unescape the regex pattern to get the original literal words
  const literal = pattern.replace(/\\([.*+?^${}()|[\]\\])/g, "$1")
  const patternWords = literal.toUpperCase().split(/\s+/).filter(Boolean)
  const textWords = text.toUpperCase().split(/\s+/).filter(Boolean)
  if (patternWords.length === 0) return false

  // Find the pattern words as a contiguous subsequence in the text,
  // allowing the last text word to be a prefix of the last pattern word
  for (let start = 0; start <= textWords.length - patternWords.length; start++) {
    let matched = true
    for (let i = 0; i < patternWords.length; i++) {
      const tw = textWords[start + i]
      const pw = patternWords[i]
      if (i === patternWords.length - 1 && start + i === textWords.length - 1) {
        // Last word of both: allow text to be a prefix of pattern (truncation)
        // Require at least 3 chars to avoid spurious matches
        if (tw.length >= 3 && pw.startsWith(tw)) continue
      }
      if (tw !== pw) { matched = false; break }
    }
    if (matched) return true
  }

  // Also check: pattern's last word is a prefix of text's corresponding word
  // (transaction has full word, rule was saved from truncated version)
  for (let start = 0; start <= textWords.length - patternWords.length; start++) {
    let matched = true
    for (let i = 0; i < patternWords.length; i++) {
      const tw = textWords[start + i]
      const pw = patternWords[i]
      if (i === patternWords.length - 1) {
        if (pw.length >= 3 && tw.startsWith(pw)) continue
      }
      if (tw !== pw) { matched = false; break }
    }
    if (matched) return true
  }

  return false
}

export function normalizeForGrouping(raw: string): string {
  let p = raw.toUpperCase().trim()
    // Remove masked digits anywhere (XXXX078)
    .replace(/X{2,}\d*/g, "")
    // Remove dates anywhere (01/31/25, 2025-01-31, ON 01/31/25)
    .replace(/\b(?:ON\s+)?\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    // Remove reference numbers (#12345, REF: 12345)
    .replace(/(?:#|REF:?\s*)\d+/gi, "")
    // Remove long digit sequences (6+ digits)
    .replace(/\b\d{6,}\b/g, "")
    // Remove trailing short digit sequences (likely store numbers: #1234)
    .replace(/\s+\d{1,5}\s*$/, "")
    // Remove asterisk codes (*1234)
    .replace(/\*{1,2}\s*\d+/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
  return p
}
