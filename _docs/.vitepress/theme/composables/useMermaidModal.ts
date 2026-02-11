// Global state management for mermaid modal
import { ref } from 'vue'

const isModalOpen = ref(false)
const currentDiagramCode = ref('')
const currentDiagramId = ref('')

export function useMermaidModal() {
  function openModal(code: string, id: string) {
    currentDiagramCode.value = code
    currentDiagramId.value = id
    isModalOpen.value = true
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
  }

  function closeModal() {
    isModalOpen.value = false
    currentDiagramCode.value = ''
    currentDiagramId.value = ''
    // Restore body scroll
    document.body.style.overflow = ''
  }

  return {
    isModalOpen,
    currentDiagramCode,
    currentDiagramId,
    openModal,
    closeModal
  }
}
