// .vitepress/theme/index.ts
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { useMermaidModal } from './composables/useMermaidModal'
import SimpleMermaidWrapper from '../components/SimpleMermaidWrapper.vue'
import MermaidModal from '../components/MermaidModal.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(MermaidModal)
    })
  },
  enhanceApp({ app }) {
    // Initialize modal composable
    const mermaidModal = useMermaidModal()

    // Provide modal state and functions globally
    app.provide('isModalOpen', mermaidModal.isModalOpen)
    app.provide('currentDiagramCode', mermaidModal.currentDiagramCode)
    app.provide('currentDiagramId', mermaidModal.currentDiagramId)
    app.provide('openMermaidModal', mermaidModal.openModal)
    app.provide('closeMermaidModal', mermaidModal.closeModal)

    // Register components globally
    app.component('SimpleMermaidWrapper', SimpleMermaidWrapper)
    app.component('MermaidModal', MermaidModal)
  }
} satisfies Theme
