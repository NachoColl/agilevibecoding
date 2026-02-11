// .vitepress/theme/index.ts
import { h, nextTick, watch } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    const { isDark } = useData()

    const initMermaid = () => {
      const mermaidRenderer = createMermaidRenderer({
        // Mermaid configuration - force dark theme always
        theme: 'dark',
        startOnLoad: false,
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
        },
        sequence: {
          diagramMarginX: 50,
          diagramMarginY: 10,
        },
      })

      // Toolbar customization
      mermaidRenderer.setToolbar({
        showLanguageLabel: false,
        desktop: {
          zoomIn: 'enabled',
          zoomOut: 'enabled',
          zoomLevel: 'enabled',
          zoomReset: 'enabled',
          fullscreen: 'enabled',
          copyCode: 'enabled',
          download: 'enabled',
          positions: { vertical: 'top', horizontal: 'right' },
        },
        mobile: {
          zoomIn: 'enabled',
          zoomOut: 'enabled',
          zoomLevel: 'disabled',
          zoomReset: 'enabled',
          fullscreen: 'enabled',
          copyCode: 'disabled',
          download: 'disabled',
          positions: { vertical: 'bottom', horizontal: 'right' },
        },
        fullscreen: {
          zoomIn: 'enabled',
          zoomOut: 'enabled',
          zoomLevel: 'enabled',
          zoomReset: 'enabled',
          fullscreen: 'enabled',
          copyCode: 'enabled',
          download: 'enabled',
          positions: { vertical: 'top', horizontal: 'right' },
        },
      })
    }

    nextTick(() => initMermaid())

    watch(
      () => isDark.value,
      () => initMermaid()
    )

    return h(DefaultTheme.Layout)
  },
} satisfies Theme
