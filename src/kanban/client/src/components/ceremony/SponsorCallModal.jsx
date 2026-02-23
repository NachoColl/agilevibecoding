import { useState } from 'react';
import { X } from 'lucide-react';
import { useCeremonyStore } from '../../store/ceremonyStore';
import {
  analyzeDatabase,
  analyzeArchitecture,
  prefillAnswers,
  runCeremony,
} from '../../lib/api';

import { DeploymentStep } from './steps/DeploymentStep';
import { MissionStep } from './steps/MissionStep';
import { DatabaseStep } from './steps/DatabaseStep';
import { ArchitectureStep } from './steps/ArchitectureStep';
import { ReviewAnswersStep } from './steps/ReviewAnswersStep';
import { RunningStep } from './steps/RunningStep';
import { CompleteStep } from './steps/CompleteStep';

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
    <div className="flex items-center gap-1 flex-wrap">
      {visibleSteps.map((s, idx) => {
        const displayIdx = idx + 1;
        const isDone = displayCurrent > displayIdx;
        const isCurrent = displayCurrent === displayIdx;

        return (
          <div key={s.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
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

export function SponsorCallModal({ onClose }) {
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
    answers,
    ceremonyStatus,
    setCeremonyStatus,
    setCeremonyResult,
    setCeremonyError,
    appendProgress,
    startRun,
    resetWizard,
    closeWizard,
  } = useCeremonyStore();

  const [analyzingMessage, setAnalyzingMessage] = useState('');

  if (!isOpen) return null;

  const hasDb = dbResult?.hasDatabaseNeeds === true;

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
      } else {
        // Skip database step — go straight to architecture
        setAnalyzingMessage('Analysing architecture options…');
        const archData = await analyzeArchitecture(mission, initialScope, null, strategy);
        setArchOptions(archData);
        setWizardStep(4);
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
    try {
      const dbContext = dbResult ? { ...dbResult, userChoice: dbChoice } : null;
      const archData = await analyzeArchitecture(mission, initialScope, dbContext, strategy);
      setArchOptions(archData);
      setWizardStep(4);
    } catch (err) {
      console.error('Architecture analysis error:', err);
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Step 4 → Prefill → Step 5
  const handleArchitectureNext = async () => {
    setAnalyzing(true);
    try {
      const dbContext = dbResult ? { ...dbResult, userChoice: dbChoice } : null;
      const prefill = await prefillAnswers(mission, initialScope, selectedArch, dbContext, strategy);
      applyPrefill(prefill, strategy, mission, initialScope);
      setWizardStep(5);
    } catch (err) {
      console.error('Prefill error:', err);
      alert(`Prefill failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Step 5 → Run ceremony → Step 6
  const handleReviewNext = async () => {
    try {
      startRun();
      setWizardStep(6);
      await runCeremony(answers);
    } catch (err) {
      console.error('Run ceremony error:', err);
      setCeremonyStatus('error');
      setCeremonyError(err.message);
    }
  };

  const renderStep = () => {
    switch (wizardStep) {
      case 1:
        return <DeploymentStep onNext={() => setWizardStep(2)} />;
      case 2:
        return <MissionStep onNext={handleMissionNext} onBack={() => setWizardStep(1)} analyzing={analyzing} />;
      case 3:
        return <DatabaseStep onNext={handleDatabaseNext} onBack={() => setWizardStep(2)} analyzing={analyzing} />;
      case 4:
        return <ArchitectureStep onNext={handleArchitectureNext} onBack={() => setWizardStep(hasDb ? 3 : 2)} analyzing={analyzing} />;
      case 5:
        return <ReviewAnswersStep onNext={handleReviewNext} onBack={() => setWizardStep(4)} />;
      case 6:
        return <RunningStep />;
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-slate-900">Sponsor Call Ceremony</h1>
            <div className="mt-2">
              <StepProgress currentStep={wizardStep} hasDb={hasDb} />
            </div>
          </div>
          {ceremonyStatus !== 'running' && (
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 transition-colors ml-4 mt-0.5"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{renderStep()}</div>

        {/* Status bar — always rendered to prevent height flicker */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 h-8 flex items-center">
          <p className="text-xs text-slate-400 truncate">{analyzingMessage}</p>
        </div>
      </div>
    </div>
  );
}
