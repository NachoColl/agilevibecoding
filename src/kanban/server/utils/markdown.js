import { marked } from 'marked';

/**
 * Configure marked with safe defaults
 */
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Line breaks as <br>
  headerIds: true, // Add IDs to headers
  mangle: false, // Don't mangle email addresses
});

/**
 * Render markdown to HTML
 * @param {string} markdown - Markdown content
 * @returns {string} HTML content
 */
export function renderMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  try {
    return marked.parse(markdown);
  } catch (error) {
    console.error('Error rendering markdown:', error);
    return `<p>Error rendering markdown: ${error.message}</p>`;
  }
}

/**
 * Sanitize markdown content (remove potentially dangerous content)
 * Note: For MVP, we're assuming trusted content from .avc/project/
 * In production, consider using DOMPurify or similar
 * @param {string} html - HTML content
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  // For now, just return as-is since content is from trusted source
  // TODO: Add proper sanitization if exposing to untrusted users
  return html;
}

/**
 * Extract the description (first paragraph after H1) from a doc.md string.
 * @param {string} markdown
 * @returns {string}
 */
export function extractDescriptionFromDoc(markdown) {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  let pastH1 = false;
  const descLines = [];
  for (const line of lines) {
    if (!pastH1) {
      if (line.startsWith('# ')) pastH1 = true;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('---')) break;
    if (line.trim() === '' && descLines.length > 0) break;
    if (line.trim()) descLines.push(line.trim());
  }
  return descLines.join(' ');
}

/**
 * Replace the first paragraph after H1 with newDescription.
 * Preserves all content below the first paragraph unchanged.
 * @param {string} markdown
 * @param {string} newDescription
 * @returns {string}
 */
export function updateDescriptionInDoc(markdown, newDescription) {
  if (!markdown) return `\n\n${newDescription}\n`;
  const lines = markdown.split('\n');
  let h1Idx = -1, paraStart = -1, paraEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (h1Idx === -1 && lines[i].startsWith('# ')) { h1Idx = i; continue; }
    if (h1Idx !== -1 && paraStart === -1 && lines[i].trim()) { paraStart = i; continue; }
    if (paraStart !== -1 && (!lines[i].trim() || lines[i].startsWith('#') || lines[i] === '---')) {
      paraEnd = i; break;
    }
  }
  if (paraStart === -1) {
    lines.splice(h1Idx + 1, 0, '', newDescription);
    return lines.join('\n');
  }
  if (paraEnd === -1) paraEnd = lines.length;
  lines.splice(paraStart, paraEnd - paraStart, newDescription);
  return lines.join('\n');
}
