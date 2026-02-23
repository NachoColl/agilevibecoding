import { create } from 'zustand';

/**
 * Ceremony Store
 * Manages the sponsor-call wizard state (not persisted).
 */
export const useCeremonyStore = create((set, get) => ({
  // ── Modal open/close ───────────────────────────────────────────────────────
  isOpen: false,

  // ── Wizard navigation ──────────────────────────────────────────────────────
  wizardStep: 1,
  analyzing: false,   // true while an analyze API call is in-flight

  // ── Step 1: Deployment strategy ───────────────────────────────────────────
  strategy: null,     // 'local-mvp' | 'cloud'

  // ── Step 2: Mission & Scope ───────────────────────────────────────────────
  mission: '',
  initialScope: '',

  // ── Step 3: Database ──────────────────────────────────────────────────────
  dbResult: null,     // API response from analyze/database
  dbChoice: null,     // 'sql' | 'nosql' (user selection)

  // ── Step 4: Architecture ──────────────────────────────────────────────────
  archOptions: [],    // array of architecture objects from analyze/architecture
  selectedArch: null, // chosen architecture object

  // ── Step 5: Review & Edit ─────────────────────────────────────────────────
  prefillResult: null, // API response from analyze/prefill

  // ── Requirements (all 7 template variables) ───────────────────────────────
  requirements: {
    MISSION_STATEMENT: '',
    INITIAL_SCOPE: '',
    TARGET_USERS: '',
    DEPLOYMENT_TARGET: '',
    TECHNICAL_CONSIDERATIONS: '',
    TECHNICAL_EXCLUSIONS: '',
    SECURITY_AND_COMPLIANCE_REQUIREMENTS: '',
  },

  // ── Mission generator progress ─────────────────────────────────────────────
  missionProgressLog: [],   // { step, message }

  // ── Steps 6-7: Running / Complete ─────────────────────────────────────────
  progressLog: [],          // { type:'progress'|'substep', message?, substep?, meta? }
  ceremonyStatus: 'idle',   // 'idle' | 'running' | 'complete' | 'error'
  ceremonyResult: null,
  ceremonyError: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  openWizard: () => set({ isOpen: true }),

  closeWizard: () => set({ isOpen: false }),

  resetWizard: () =>
    set({
      wizardStep: 1,
      analyzing: false,
      strategy: null,
      mission: '',
      initialScope: '',
      dbResult: null,
      dbChoice: null,
      archOptions: [],
      selectedArch: null,
      prefillResult: null,
      requirements: {
        MISSION_STATEMENT: '',
        INITIAL_SCOPE: '',
        TARGET_USERS: '',
        DEPLOYMENT_TARGET: '',
        TECHNICAL_CONSIDERATIONS: '',
        TECHNICAL_EXCLUSIONS: '',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: '',
      },
      progressLog: [],
      ceremonyStatus: 'idle',
      ceremonyResult: null,
      ceremonyError: null,
    }),

  setStrategy: (strategy) => set({ strategy }),

  setMission: (mission) => set({ mission }),

  setInitialScope: (initialScope) => set({ initialScope }),

  setDbResult: (dbResult) => set({ dbResult }),

  setDbChoice: (dbChoice) => set({ dbChoice }),

  setArchOptions: (archOptions) => set({ archOptions }),

  setSelectedArch: (selectedArch) => set({ selectedArch }),

  setPrefillResult: (prefillResult) => set({ prefillResult }),

  setAnalyzing: (analyzing) => set({ analyzing }),

  setWizardStep: (wizardStep) => set({ wizardStep }),

  updateRequirement: (key, value) =>
    set((state) => ({
      requirements: { ...state.requirements, [key]: value },
    })),

  setRequirements: (requirements) => set({ requirements }),

  // Called from App.jsx WebSocket message handler
  appendProgress: (entry) =>
    set((state) => ({
      progressLog: [...state.progressLog, entry],
    })),

  appendMissionProgress: (entry) =>
    set((state) => ({
      missionProgressLog: [...state.missionProgressLog, entry],
    })),

  clearMissionProgress: () => set({ missionProgressLog: [] }),

  setCeremonyStatus: (ceremonyStatus) => set({ ceremonyStatus }),

  setCeremonyResult: (ceremonyResult) => set({ ceremonyResult }),

  setCeremonyError: (ceremonyError) => set({ ceremonyError }),

  // Sync requirements from prefill result + step 1-2 data
  applyPrefill: (prefillResult, strategy, mission, initialScope) => {
    set((state) => ({
      prefillResult,
      requirements: {
        ...state.requirements,
        MISSION_STATEMENT: mission,
        INITIAL_SCOPE: initialScope,
        TARGET_USERS: prefillResult.TARGET_USERS || '',
        DEPLOYMENT_TARGET: prefillResult.DEPLOYMENT_TARGET || '',
        TECHNICAL_CONSIDERATIONS: prefillResult.TECHNICAL_CONSIDERATIONS || '',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS:
          prefillResult.SECURITY_AND_COMPLIANCE_REQUIREMENTS || '',
        // TECHNICAL_EXCLUSIONS stays as user entered (empty by default)
      },
    }));
  },

  // Initialize ceremony run
  startRun: () =>
    set({
      ceremonyStatus: 'running',
      progressLog: [],
      ceremonyResult: null,
      ceremonyError: null,
    }),
}));
