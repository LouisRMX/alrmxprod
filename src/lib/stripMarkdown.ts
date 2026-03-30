/**
 * Strips common markdown formatting from AI-generated text.
 * Keeps the content but removes symbols that render as literal characters
 * in plain-text contexts (PDF export, pre-wrap divs).
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove heading markers: ## Heading, ### Heading
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold+italic: ***text*** or ___text___
    .replace(/\*{3}(.+?)\*{3}/g, '$1')
    .replace(/_{3}(.+?)_{3}/g, '$1')
    // Remove bold: **text** or __text__
    .replace(/\*{2}(.+?)\*{2}/g, '$1')
    .replace(/_{2}(.+?)_{2}/g, '$1')
    // Remove italic: *text* or _text_  (single, not inside words)
    .replace(/\*(.+?)\*/g, '$1')
    // Remove inline code: `code`
    .replace(/`(.+?)`/g, '$1')
    // Remove horizontal rules: --- or *** or ___
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
