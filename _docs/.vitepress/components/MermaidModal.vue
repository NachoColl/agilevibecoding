<script setup lang="ts">
import { inject, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import mermaid from 'mermaid'

const isModalOpen = inject<{ value: boolean }>('isModalOpen')!
const currentDiagramCode = inject<{ value: string }>('currentDiagramCode')!
const currentDiagramId = inject<{ value: string }>('currentDiagramId')!
const closeModal = inject<() => void>('closeMermaidModal')!

const diagramContainer = ref<HTMLElement>()
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)

// Render diagram when modal opens
watch(() => isModalOpen.value, async (open) => {
  if (open && currentDiagramCode.value) {
    await nextTick()

    if (diagramContainer.value) {
      try {
        // Initialize mermaid with dark theme
        mermaid.initialize({
          theme: 'dark',
          startOnLoad: false,
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
          },
          sequence: {
            diagramMarginX: 50,
            diagramMarginY: 10,
          },
        })

        // Clear previous content
        diagramContainer.value.innerHTML = ''

        // Create a unique ID for this render
        const modalDiagramId = `${currentDiagramId.value}-modal`

        // Render the diagram
        const { svg } = await mermaid.render(modalDiagramId, currentDiagramCode.value)
        diagramContainer.value.innerHTML = svg

        // Reset transform
        scale.value = 1
        translateX.value = 0
        translateY.value = 0

        // Apply transform to SVG
        const svgEl = diagramContainer.value.querySelector('svg')
        if (svgEl) {
          svgEl.style.transformOrigin = 'center center'
          updateTransform()
        }
      } catch (error) {
        console.error('Error rendering mermaid in modal:', error)
        diagramContainer.value.innerHTML = '<div style="color: red;">Error rendering diagram</div>'
      }
    }
  }
})

// Transform functions
function updateTransform() {
  const svgEl = diagramContainer.value?.querySelector('svg')
  if (svgEl) {
    svgEl.style.transform = `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`
  }
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.2, 5)
  updateTransform()
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.2, 0.5)
  updateTransform()
}

function resetZoom() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  updateTransform()
}

function copyCode() {
  if (currentDiagramCode.value) {
    navigator.clipboard.writeText(currentDiagramCode.value)
      .then(() => console.log('Diagram code copied to clipboard'))
      .catch(err => console.error('Failed to copy:', err))
  }
}

function downloadSVG() {
  const svgEl = diagramContainer.value?.querySelector('svg')
  if (svgEl) {
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentDiagramId.value}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }
}

// Pan functionality
function handleMouseDown(e: MouseEvent) {
  isDragging.value = true
  startX.value = e.clientX - translateX.value
  startY.value = e.clientY - translateY.value
}

function handleMouseMove(e: MouseEvent) {
  if (isDragging.value) {
    translateX.value = e.clientX - startX.value
    translateY.value = e.clientY - startY.value
    updateTransform()
  }
}

function handleMouseUp() {
  isDragging.value = false
}

// Wheel zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.5, Math.min(5, scale.value * delta))
  updateTransform()
}

// Handle ESC key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isModalOpen.value) {
    closeModal()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="isModalOpen"
        class="mermaid-modal-overlay"
        @click.self="closeModal"
      >
        <div class="mermaid-modal-container">
          <button class="modal-close" @click="closeModal" aria-label="Close modal">
            ×
          </button>

          <!-- Toolbar -->
          <div class="modal-toolbar">
            <button @click="zoomIn" class="toolbar-btn" title="Zoom In">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
              </svg>
            </button>
            <button @click="zoomOut" class="toolbar-btn" title="Zoom Out">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
              </svg>
            </button>
            <button @click="resetZoom" class="toolbar-btn" title="Reset">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
              </svg>
            </button>
            <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
            <button @click="copyCode" class="toolbar-btn" title="Copy Code">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
              </svg>
            </button>
            <button @click="downloadSVG" class="toolbar-btn" title="Download SVG">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
              </svg>
            </button>
          </div>

          <div
            ref="diagramContainer"
            class="modal-diagram-content"
            @mousedown="handleMouseDown"
            @mousemove="handleMouseMove"
            @mouseup="handleMouseUp"
            @mouseleave="handleMouseUp"
            @wheel="handleWheel"
          ></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal Overlay */
.mermaid-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Modal Container */
.mermaid-modal-container {
  position: relative;
  width: 90vw;
  height: 90vh;
  background: var(--vp-c-bg);
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Close Button */
.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 24px;
  font-weight: bold;
  line-height: 1;
  cursor: pointer;
  z-index: 10001;
  transition: opacity 0.2s, background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  opacity: 0.8;
  background: rgba(0, 0, 0, 0.9);
}

/* Toolbar */
.modal-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 6px;
  padding: 8px;
  z-index: 10001;
}

.toolbar-btn {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.zoom-level {
  color: white;
  font-size: 12px;
  padding: 0 4px;
  min-width: 50px;
  text-align: center;
}

/* Diagram Content Area */
.modal-diagram-content {
  flex: 1;
  overflow: hidden;
  padding: 60px 20px 20px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

.modal-diagram-content:active {
  cursor: grabbing;
}

.modal-diagram-content :deep(svg) {
  transition: transform 0.1s ease-out;
  max-width: none !important;
  max-height: none !important;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .mermaid-modal-container {
    width: 95vw;
    height: 95vh;
  }

  .modal-close {
    width: 44px;
    height: 44px;
    font-size: 28px;
  }

  .modal-toolbar {
    flex-wrap: wrap;
    max-width: calc(100vw - 80px);
  }

  .toolbar-btn {
    padding: 8px;
  }
}

/* Fade transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
