import { useEffect, useRef } from 'react';
import { useCeremonyStore } from '../../../store/ceremonyStore';

// Stage labels (unused but kept for future tooltips)
const STAGE_LABELS = [
  'Processing requirements',
  'Preparing project template',
  'Preparing for documentation generation',
  'Creating project documentation',
  'Validating documentation',
  'Generating context files',
  'Finalizing ceremony',
];

function parseStageNumber(message) {
  // e.g. "Stage 4/5: Creating project documentation..."
  const m = message?.match(/Stage\s+(\d+)\/(\d+)/i);
  if (m) return { current: parseInt(m[1]), total: parseInt(m[2]) };
  return null;
}

export function RunningStep() {
  const { progressLog, ceremonyStatus, ceremonyError, setWizardStep } = useCeremonyStore();
  const logBottomRef = useRef(null);

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  // Auto-advance to CompleteStep when ceremony finishes
  useEffect(() => {
    if (ceremonyStatus === 'complete') {
      setWizardStep(7);
    }
  }, [ceremonyStatus, setWizardStep]);

  // Find the latest stage progress message
  const progressMessages = progressLog.filter((e) => e.type === 'progress');
  const substepMessages = progressLog.filter((e) => e.type === 'substep');

  let currentStage = null;
  let totalStages = 5;
  for (const p of [...progressMessages].reverse()) {
    const parsed = parseStageNumber(p.message);
    if (parsed) {
      currentStage = parsed.current;
      totalStages = parsed.total;
      break;
    }
  }

  const progressPct = currentStage ? Math.round((currentStage / totalStages) * 100) : 5;
  const latestProgress = progressMessages[progressMessages.length - 1]?.message || 'Starting ceremony...';

  if (ceremonyStatus === 'error') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Generation Failed</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-1">Error</p>
          <p className="text-sm text-red-600">{ceremonyError || 'An unknown error occurred.'}</p>
        </div>
        <p className="text-sm text-slate-500">
          Check that your API key is configured correctly in your project's <code>.env</code> file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Generating Documentation</h2>
        <p className="text-sm text-slate-500 mt-1">
          The AI is generating your project documentation. This typically takes 1–3 minutes.
        </p>
      </div>

      {/* Stage progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-600">{latestProgress}</span>
          <span className="text-xs text-slate-400">{progressPct}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Substep log */}
      <div className="bg-slate-900 rounded-lg p-4 h-56 overflow-y-auto font-mono text-xs">
        {substepMessages.length === 0 && progressMessages.length === 0 ? (
          <p className="text-slate-400 animate-pulse">Initializing...</p>
        ) : (
          <div className="space-y-0.5">
            {progressMessages.map((entry, i) => (
              <p key={`p-${i}`} className="text-blue-400">
                ▸ {entry.message}
              </p>
            ))}
            {substepMessages.slice(-20).map((entry, i) => (
              <p key={`s-${i}`} className="text-slate-300">
                {'  '}{entry.substep}
              </p>
            ))}
            <div ref={logBottomRef} />
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center animate-pulse">
        Please keep this window open while generation runs...
      </p>
    </div>
  );
}
