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
