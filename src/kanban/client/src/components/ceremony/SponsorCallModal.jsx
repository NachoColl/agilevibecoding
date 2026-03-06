import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { useCeremonyStore } from '../../store/ceremonyStore';
import {
  analyzeDatabase,
  analyzeArchitecture,
  prefillAnswers,
  runCeremony,
  getSettings,
  getModels,
  saveCeremonies,
  pauseCeremony,
  resumeCeremony,
  cancelCeremony,
  getSponsorCallDraft,
  saveSponsorCallDraft,
  deleteSponsorCallDraft,
} from '../../lib/api';
import { CeremonyWorkflowModal } from './CeremonyWorkflowModal';
import { ProviderSwitcherButton } from './ProviderSwitcherButton';

import { DeploymentStep } from './steps/DeploymentStep';
import { MissionStep } from './steps/MissionStep';
import { DatabaseStep } from './steps/DatabaseStep';
import { ArchitectureStep } from './steps/ArchitectureStep';
import { ReviewAnswersStep } from './steps/ReviewAnswersStep';
import { RunningStep } from './steps/RunningStep';
import { CompleteStep } from './steps/CompleteStep';

const KEY_LABELS = {
  anthropic: 'Anthropic API Key (ANTHROPIC_API_KEY)',
  gemini: 'Google Gemini API Key (GEMINI_API_KEY)',
  openai: 'OpenAI API Key (OPENAI_API_KEY)',
};

function normalizeProvider(provider = '') {
  const p = provider.toLowerCase();
  if (p === 'claude' || p === 'anthropic') return 'anthropic';
  return p;
}

function computeMissingProviders(settings) {
  const ceremony = settings.ceremonies?.find((c) => c.name === 'sponsor-call');
  const needed = new Set();

  // stages is an object: { stageName: { provider, model }, ... }
  if (ceremony?.stages && typeof ceremony.stages === 'object') {
    for (const stage of Object.values(ceremony.stages)) {
      if (stage?.provider) needed.add(normalizeProvider(stage.provider));
    }
  }

  // validation: top-level { model, provider } and/or sub-areas { areaName: { model, provider } }
  if (ceremony?.validation && typeof ceremony.validation === 'object') {
    if (ceremony.validation.provider) needed.add(normalizeProvider(ceremony.validation.provider));
    for (const val of Object.values(ceremony.validation)) {
      if (val && typeof val === 'object' && typeof val.provider === 'string') {
        needed.add(normalizeProvider(val.provider));
      }
    }
  }

  const apiKeys = settings.apiKeys ?? {};
  return [...needed].filter((p) => !apiKeys[p]?.isSet);
}

// Step definitions for the progress header (shown steps vary based on hasDb)
const ALL_STEPS = [
  { id: 1, label: 'Strategy' },
  { id: 2, label: 'Mission' },
  { id: 3, label: 'Database' },
  { id: 4, label: 'Architecture' },
  { id: 5, label: 'Review' },
  { id: 6, label: 'Generate' },
  { id: 7, label: 'Done' },
];

function StepProgress({ currentStep, hasDb }) {
  const visibleSteps = hasDb ? ALL_STEPS : ALL_STEPS.filter((s) => s.id !== 3);
  // Map real wizardStep → display index
  const getDisplayIndex = (step) => {
    if (!hasDb && step >= 4) return step - 1; // shift steps 4-7 down by 1 when db skipped
    return step;
  };
  const displayCurrent = getDisplayIndex(currentStep);

  return (
    <div className="flex items-center gap-1 flex-nowrap overflow-x-auto pb-0.5">
      {visibleSteps.map((s, idx) => {
        const displayIdx = idx + 1;
        const isDone = displayCurrent > displayIdx;
        const isCurrent = displayCurrent === displayIdx;

        return (
          <div key={s.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                isCurrent
                  ? 'bg-blue-600 text-white font-medium'
                  : isDone
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {isDone ? '✓' : displayIdx} {s.label}
            </div>
            {idx < visibleSteps.length - 1 && (
              <span className="text-slate-300 text-xs">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SponsorCallModal({ onClose, onOpenSettings, costLimitPending, onContinuePastCostLimit, onCancelFromCostLimit }) {
  const {
    isOpen,
    wizardStep,
    setWizardStep,
    analyzing,
    setAnalyzing,
    strategy,
    mission,
    initialScope,
    dbResult,
    setDbResult,
    dbChoice,
    archOptions,
    setArchOptions,
    selectedArch,
    applyPrefill,
    requirements,
    ceremonyStatus,
    isPaused,
    setCeremonyStatus,
    setCeremonyResult,
    setCeremonyError,
    appendProgress,
    startRun,
    resetWizard,
    closeWizard,
    setProcessId,
    setStrategy,
    setMission,
    setInitialScope,
    setDbChoice,
    setSelectedArch,
    setPrefillResult,
    setRequirements,
  } = useCeremonyStore();

  const [analyzingMessage, setAnalyzingMessage] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [transitioning, setTransitioning] = useState(null); // null | 'pausing' | 'cancelling'
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowCeremony, setWorkflowCeremony] = useState(null);
  const [workflowModels, setWorkflowModels] = useState([]);
  const [workflowMissionGenValidation, setWorkflowMissionGenValidation] = useState(null);
  const [workflowAllCeremonies, setWorkflowAllCeremonies] = useState([]);
  const [apiKeyCheck, setApiKeyCheck] = useState({ loading: true, missing: [] });
  const [settings, setSettings] = useState({ ceremonies: [], apiKeys: {} });
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [draftData, setDraftData] = useState(null);

  // Check required API keys when the modal opens
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setApiKeyCheck({ loading: false, missing: computeMissingProviders(s) });
          setSettings(s);
        }
      })
      .catch(() => {
        if (!cancelled) setApiKeyCheck({ loading: false, missing: [] }); // fail open
      });
    return () => { cancelled = true; };
  }, []);

  // Check for an existing draft when the wizard opens at step 1 (fresh open / post-refresh)
  // Only show resume prompt when ceremony is idle (not during a running ceremony reopen)
  useEffect(() => {
    if (!isOpen || wizardStep !== 1 || ceremonyStatus !== 'idle') return;
    let cancelled = false;
    getSponsorCallDraft().then((draft) => {
      if (!cancelled && draft && draft.wizardStep && draft.wizardStep > 1) {
        setDraftData(draft);
        setShowResumePrompt(true);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const recheckKeys = () => {
    setApiKeyCheck({ loading: true, missing: [] });
    getSettings()
      .then((s) => setApiKeyCheck({ loading: false, missing: computeMissingProviders(s) }))
      .catch(() => setApiKeyCheck({ loading: false, missing: [] }));
  };

  // Snapshot current wizard state and persist to server
  const saveDraft = (overrides = {}) => {
    const snap = useCeremonyStore.getState();
    saveSponsorCallDraft({
      wizardStep: snap.wizardStep,
      strategy: snap.strategy,
      mission: snap.mission,
      initialScope: snap.initialScope,
      dbResult: snap.dbResult,
      dbChoice: snap.dbChoice,
      archOptions: snap.archOptions,
      selectedArch: snap.selectedArch,
      prefillResult: snap.prefillResult,
      requirements: snap.requirements,
      ...overrides,
    }).catch(() => {});
  };

  const handleResumeDraft = () => {
    const d = draftData;
    setShowResumePrompt(false);
    setDraftData(null);
    if (!d) return;
    // Restore all wizard fields from draft
    if (d.strategy != null)     setStrategy(d.strategy);
    if (d.mission != null)      setMission(d.mission);
    if (d.initialScope != null) setInitialScope(d.initialScope);
    if (d.dbResult != null)     setDbResult(d.dbResult);
    if (d.dbChoice != null)     setDbChoice(d.dbChoice);
    if (d.archOptions != null)  setArchOptions(d.archOptions);
    if (d.selectedArch != null) setSelectedArch(d.selectedArch);
    if (d.prefillResult != null) setPrefillResult(d.prefillResult);
    if (d.requirements != null) setRequirements(d.requirements);
    setWizardStep(d.wizardStep);
  };

  const handleStartFresh = () => {
    setShowResumePrompt(false);
    setDraftData(null);
    deleteSponsorCallDraft();
    resetWizard();
  };

  const handleWorkflowSave = async (updatedCeremony, updatedMG) => {
    const base = workflowAllCeremonies.length > 0 ? workflowAllCeremonies : [updatedCeremony];
    const next = base.map((c) => c.name === updatedCeremony.name ? updatedCeremony : c);
    await saveCeremonies(next, { validation: updatedMG });
    setWorkflowCeremony(updatedCeremony);
    setWorkflowMissionGenValidation(updatedMG);
    setWorkflowAllCeremonies(next);
  };

  const handleWorkflowClose = () => {
    setWorkflowOpen(false);
    recheckKeys();
  };

  // Clear transitioning state when WS events arrive
  useEffect(() => {
    if (transitioning === 'pausing' && isPaused) setTransitioning(null);
  }, [isPaused, transitioning]);

  useEffect(() => {
    if (transitioning === 'cancelling' && ceremonyStatus === 'idle') setTransitioning(null);
  }, [ceremonyStatus, transitioning]);

  if (!isOpen) return null;

  const hasDb = dbResult?.hasDatabaseNeeds === true;

  const handlePause = async () => {
    setTransitioning('pausing');
    try { await pauseCeremony(); } catch (_) {}
  };

  const handleResume = async () => {
    try { await resumeCeremony(); } catch (_) {}
  };

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false);
    setTransitioning('cancelling');
    try { await cancelCeremony(); } catch (_) {}
  };

  // Close handler
  const handleClose = () => {
    if (ceremonyStatus === 'running') return; // block close while running
    closeWizard();
    if (onClose) onClose();
  };

  // Step 2 → (DB analysis) → Step 3 or 4
  const handleMissionNext = async () => {
    setAnalyzing(true);
    setAnalyzingMessage('Checking database needs…');
    try {
      const dbData = await analyzeDatabase(mission, initialScope, strategy);
      setDbResult(dbData);

      if (dbData.hasDatabaseNeeds) {
        setWizardStep(3); // Show database step
        saveDraft({ wizardStep: 3, dbResult: dbData });
      } else {
        // Skip database step — go straight to architecture
        setAnalyzingMessage('Analysing architecture options…');
        const archData = await analyzeArchitecture(mission, initialScope, null, strategy);
        setArchOptions(archData);
        setWizardStep(4);
        saveDraft({ wizardStep: 4, dbResult: dbData, archOptions: archData });
      }
    } catch (err) {
      console.error('Mission analysis error:', err);
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
      setAnalyzingMessage('');
    }
  };

  // Step 3 → Architecture analysis → Step 4
  const handleDatabaseNext = async () => {
    setAnalyzing(true);
    setAnalyzingMessage('Analysing architecture options…');
    try {
      const dbContext = dbResult ? { ...dbResult, userChoice: dbChoice } : null;
      const archData = await analyzeArchitecture(mission, initialScope, dbContext, strategy);
      setArchOptions(archData);
      setWizardStep(4);
      saveDraft({ wizardStep: 4, archOptions: archData });
    } catch (err) {
      console.error('Architecture analysis error:', err);
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
      setAnalyzingMessage('');
    }
  };

  // Step 4 → Prefill → Step 5
  const handleArchitectureNext = async () => {
    setAnalyzing(true);
    setAnalyzingMessage('Pre-filling requirements from your selections…');
    try {
      const dbContext = dbResult ? { ...dbResult, userChoice: dbChoice } : null;
      const prefill = await prefillAnswers(mission, initialScope, selectedArch, dbContext, strategy);
      applyPrefill(prefill, strategy, mission, initialScope);
      setWizardStep(5);
      // Save after applyPrefill updates requirements in the store
      setTimeout(() => saveDraft({ wizardStep: 5, prefillResult: prefill }), 0);
    } catch (err) {
      console.error('Prefill error:', err);
      alert(`Prefill failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
      setAnalyzingMessage('');
    }
  };

  // Step 5 → Run ceremony → Step 6
  const handleReviewNext = async () => {
    deleteSponsorCallDraft(); // ceremony is starting — draft no longer needed
    try {
      startRun();
      setWizardStep(6);
      const result = await runCeremony(requirements);
      if (result?.processId) setProcessId(result.processId);
    } catch (err) {
      console.error('Run ceremony error:', err);
      setCeremonyStatus('error');
      setCeremonyError(err.message);
    }
  };

  const renderStep = () => {
    switch (wizardStep) {
      case 1:
        return (
          <DeploymentStep
            onNext={() => {
              setWizardStep(2);
              saveDraft({ wizardStep: 2 });
            }}
          />
        );
      case 2:
        return <MissionStep onNext={handleMissionNext} onBack={() => setWizardStep(1)} analyzing={analyzing} onOpenSettings={onOpenSettings} />;
      case 3:
        return <DatabaseStep onNext={handleDatabaseNext} onBack={() => setWizardStep(2)} analyzing={analyzing} />;
      case 4:
        return <ArchitectureStep onNext={handleArchitectureNext} onBack={() => setWizardStep(hasDb ? 3 : 2)} analyzing={analyzing} onOpenSettings={onOpenSettings} />;
      case 5:
        return <ReviewAnswersStep onNext={handleReviewNext} onBack={() => setWizardStep(4)} />;
      case 6:
        return (
          <RunningStep
            transitioning={transitioning}
            onPause={handlePause}
            onResume={handleResume}
            onCancel={() => setShowCancelConfirm(true)}
            onBackground={closeWizard}
          />
        );
      case 7:
        return <CompleteStep onClose={handleClose} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={wizardStep !== 6 ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Resume draft overlay */}
        {showResumePrompt && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 rounded-2xl">
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center space-y-4">
              <p className="text-base font-semibold text-slate-900">Resume previous session?</p>
              <p className="text-sm text-slate-500">
                A previous wizard session was saved
                {draftData?.savedAt ? ` on ${new Date(draftData.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.
                Would you like to continue where you left off?
              </p>
              <div className="flex gap-3 justify-center pt-1">
                <button
                  onClick={handleStartFresh}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Start Fresh
                </button>
                <button
                  onClick={handleResumeDraft}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Resume
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cost-limit pause overlay */}
        {costLimitPending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 rounded-2xl">
            <div className="bg-white border border-amber-200 rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center space-y-4">
              <div className="text-3xl">⚠️</div>
              <p className="text-base font-semibold text-slate-900">Cost Limit Reached</p>
              <p className="text-sm text-slate-600">
                <span className="font-mono font-medium">${costLimitPending.cost.toFixed(4)}</span> spent
                {costLimitPending.threshold != null && (
                  <> (limit: <span className="font-mono">${Number(costLimitPending.threshold).toFixed(2)}</span>)</>
                )}
              </p>
              <p className="text-sm text-slate-500">
                The ceremony is paused. What would you like to do?
              </p>
              <div className="flex gap-3 justify-center pt-1">
                <button
                  onClick={onContinuePastCostLimit}
                  className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700"
                >
                  Continue Anyway
                </button>
                <button
                  onClick={onCancelFromCostLimit}
                  className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Cancel Ceremony
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Continue disables cost checking for the rest of this run.
              </p>
            </div>
          </div>
        )}

        {/* Cancel confirmation overlay */}
        {showCancelConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 rounded-2xl">
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center space-y-4">
              <p className="text-base font-semibold text-slate-900">Stop documentation generation?</p>
              <p className="text-sm text-slate-500">
                You can restart the ceremony later. Any files written so far will be kept.
              </p>
              <div className="flex gap-3 justify-center pt-1">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Keep Running
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Cancel Run
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-slate-900">Sponsor Call Ceremony</h1>
            <div className="mt-2">
              <StepProgress currentStep={wizardStep} hasDb={hasDb} />
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 mt-0.5 flex-shrink-0">
            {ceremonyStatus !== 'running' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const [s, m] = await Promise.all([getSettings(), getModels()]);
                    const sc = s.ceremonies?.find((c) => c.name === 'sponsor-call') ?? {};
                    setWorkflowCeremony(sc);
                    setWorkflowModels(m);
                    setWorkflowMissionGenValidation(s.missionGenerator?.validation ?? null);
                    setWorkflowAllCeremonies(s.ceremonies || []);
                    setWorkflowOpen(true);
                  } catch {}
                }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors whitespace-nowrap"
                title="View ceremony workflow"
              >
                <Info className="w-3.5 h-3.5" />
                How it works
              </button>
            )}
            {ceremonyStatus !== 'running' && (
              <ProviderSwitcherButton
                ceremonyName="sponsor-call"
                ceremonies={settings.ceremonies}
                apiKeys={settings.apiKeys}
                onApplied={(updated) => setSettings((prev) => ({ ...prev, ceremonies: updated }))}
              />
            )}
            {ceremonyStatus !== 'running' && (
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {apiKeyCheck.loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : apiKeyCheck.missing.length > 0 ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">API Keys Required</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Configure the following API keys before running the Sponsor Call ceremony:
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {apiKeyCheck.missing.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-xs text-amber-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {KEY_LABELS[p] || p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onOpenSettings?.()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4" />
                  Open Settings
                </button>
                <button
                  onClick={recheckKeys}
                  className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Re-check
                </button>
              </div>
            </div>
          ) : (
            renderStep()
          )}
        </div>

        {/* Status bar — always rendered to prevent height flicker */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 h-8 flex items-center gap-2">
          {analyzingMessage && (
            <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
          )}
          <p className={`text-xs truncate ${analyzingMessage ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
            {analyzingMessage}
          </p>
        </div>
      </div>

      {workflowOpen && workflowCeremony && (
        <CeremonyWorkflowModal
          ceremony={workflowCeremony}
          models={workflowModels}
          missionGenValidation={workflowMissionGenValidation}
          readOnly={ceremonyStatus === 'running'}
          onSave={ceremonyStatus !== 'running' ? handleWorkflowSave : undefined}
          onClose={handleWorkflowClose}
        />
      )}
    </div>
  );
}
