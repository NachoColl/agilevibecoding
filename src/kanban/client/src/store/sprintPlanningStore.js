import { create } from 'zustand';

export const useSprintPlanningStore = create((set) => ({
  isOpen: false,
  step: 1,        // 1: ready, 2: running, 3: select, 4: complete
  status: 'idle', // 'idle' | 'running' | 'awaiting-selection' | 'complete' | 'error'
  isPaused: false,
  progressLog: [],
  result: null,   // { epicsCreated, storiesCreated, totalEpics, totalStories, tokenUsage, model }
  error: null,
  processId: null, // active fork processId (set after run starts)
  decomposedHierarchy: null, // { epics: [...] } — populated during awaiting-selection

  openModal:               () => set({ isOpen: true, step: 1, status: 'idle', isPaused: false, progressLog: [], result: null, error: null, processId: null, decomposedHierarchy: null }),
  closeModal:              () => set({ isOpen: false }),
  // Reopen without resetting state — used by ProcessMonitorBar chip click
  reopenModal:             () => set((s) => ({
    isOpen: true,
    step: s.status === 'complete' ? 4
         : s.status === 'awaiting-selection' ? 3
         : (s.status === 'running' || s.status === 'error') ? 2
         : 1,
  })),
  setStep:                 (step)              => set({ step }),
  setStatus:               (status)            => set({ status }),
  setPaused:               (isPaused)          => set({ isPaused }),
  appendProgress:          (entry)             => set((s) => ({ progressLog: [...s.progressLog, entry] })),
  setProgressLog:          (entries)           => set({ progressLog: Array.isArray(entries) ? entries : [] }),
  setResult:               (result)            => set({ result }),
  setError:                (error)             => set({ error }),
  setProcessId:            (processId)         => set({ processId }),
  setDecomposedHierarchy:  (decomposedHierarchy) => set({ decomposedHierarchy }),
}));
