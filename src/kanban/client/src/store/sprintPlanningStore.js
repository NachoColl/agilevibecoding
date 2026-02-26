import { create } from 'zustand';

export const useSprintPlanningStore = create((set) => ({
  isOpen: false,
  step: 1,        // 1: ready, 2: running, 3: complete
  status: 'idle', // 'idle' | 'running' | 'complete' | 'error'
  progressLog: [],
  result: null,   // { epicsCreated, storiesCreated, totalEpics, totalStories, tokenUsage, model }
  error: null,

  openModal:      () => set({ isOpen: true, step: 1, status: 'idle', progressLog: [], result: null, error: null }),
  closeModal:     () => set({ isOpen: false }),
  setStep:        (step)   => set({ step }),
  setStatus:      (status) => set({ status }),
  appendProgress: (entry)  => set((s) => ({ progressLog: [...s.progressLog, entry] })),
  setResult:      (result) => set({ result }),
  setError:       (error)  => set({ error }),
}));
