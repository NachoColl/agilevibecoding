<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import mermaid from 'mermaid'

const props = defineProps<{
  code: string
  id: string
}>()

const openModal = inject<(code: string, id: string) => void>('openMermaidModal')
const container = ref<HTMLElement>()

onMounted(async () => {
  try {
    // Initialize mermaid with dark theme
    mermaid.initialize({
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

    // Render the diagram
    const { svg } = await mermaid.render(props.id, props.code)

    if (container.value) {
      container.value.innerHTML = svg

      // Add click handler to open modal
      const svgEl = container.value.querySelector('svg')
      if (svgEl && openModal) {
        svgEl.style.cursor = 'pointer'
        svgEl.addEventListener('click', () => openModal(props.code, props.id))
      }
    }
  } catch (error) {
    console.error('Mermaid rendering error:', error)
    if (container.value) {
      container.value.innerHTML = '<div style="color: red;">Error rendering diagram</div>'
    }
  }
})
</script>

<template>
  <div class="simple-mermaid-wrapper" ref="container"></div>
</template>

<style scoped>
.simple-mermaid-wrapper {
  display: flex;
  justify-content: center;
  margin: 2rem auto;
  max-width: 100%;
}

.simple-mermaid-wrapper :deep(svg) {
  max-width: 800px;
  max-height: 600px;
  width: auto;
  height: auto;
  cursor: pointer;
  transition: opacity 0.2s;
}

.simple-mermaid-wrapper :deep(svg:hover) {
  opacity: 0.85;
}

@media (max-width: 768px) {
  .simple-mermaid-wrapper :deep(svg) {
    max-width: 100%;
    max-height: 400px;
  }
}
</style>
