// Markdown-it plugin to transform mermaid code blocks into SimpleMermaidWrapper components
import type MarkdownIt from 'markdown-it'

export function mermaidPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  let diagramIndex = 0

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = token.info.trim()

    if (info === 'mermaid') {
      const code = token.content.trim()
      const id = `mermaid-diagram-${diagramIndex++}`

      // Escape the code for Vue template attribute
      const escapedCode = escapeHtml(code)

      // Return Vue component instead of raw code block
      return `<SimpleMermaidWrapper code="${escapedCode}" id="${id}" />\n`
    }

    // Fallback to default fence renderer
    return fence(tokens, idx, options, env, self)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
