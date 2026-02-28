import { useEffect, useRef } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { useCeremonyStore } from '../../../store/ceremonyStore';
import { resetCeremony } from '../../../lib/api';

function parseStageNumber(message) {
  const m = message?.match(/Stage\s+(\d+)\/(\d+)/i);
  if (m) return { current: parseInt(m[1]), total: parseInt(m[2]) };
  return null;
}

function buildStageGroups(progressLog) {
  const groups = [];
  for (const entry of progressLog) {
    if (entry.type === 'progress') {
      groups.push({ message: entry.message, substeps: [], orphanDetails: [] });
    } else if (entry.type === 'substep' && groups.length > 0) {
      groups[groups.length - 1].substeps.push({ text: entry.substep, details: [] });
    } else if (entry.type === 'detail' && groups.length > 0) {
      const group = groups[groups.length - 1];
      const substeps = group.substeps;
      if (substeps.length > 0) {
        substeps[substeps.length - 1].details.push(entry.detail);
      } else {
        group.orphanDetails.push(entry.detail);
      }
    }
  }
  return groups;
}

export function RunningStep({ transitioning, onPause, onResume, onCancel, onBackground }) {
  const { progressLog, ceremonyStatus, ceremonyError, isPaused, setWizardStep, setCeremonyStatus, setCeremonyError } = useCeremonyStore();
  const logBottomRef = useRef(null);

  const handleForceReset = async () => {
    try { await resetCeremony(); } catch (_) {}
    setCeremonyStatus('idle');
    setCeremonyError(null);
    setWizardStep(1);
  };

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  // Auto-advance to CompleteStep when ceremony finishes
  useEffect(() => {
    if (ceremonyStatus === 'complete') {
      setWizardStep(7);
    }
  }, [ceremonyStatus, setWizardStep]);

  const stageGroups = buildStageGroups(progressLog);

  let currentStage = null;
  let totalStages = 5;
  for (const g of [...stageGroups].reverse()) {
    const parsed = parseStageNumber(g.message);
    if (parsed) {
      currentStage = parsed.current;
      totalStages = parsed.total;
      break;
    }
  }

  const progressPct = currentStage ? Math.round((currentStage / totalStages) * 100) : 5;
  const latestProgress = stageGroups[stageGroups.length - 1]?.message || 'Starting ceremony...';

  if (ceremonyStatus === 'error') {
    const isAlreadyRunning = ceremonyError?.includes('already running');
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Generation Failed</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-1">Error</p>
          <p className="text-sm text-red-600">{ceremonyError || 'An unknown error occurred.'}</p>
        </div>
        {isAlreadyRunning ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              A ceremony is already running on the server. You can force-stop it and reset the state — this will discard any in-progress work.
            </p>
            <button
              onClick={handleForceReset}
              className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Force Stop &amp; Reset
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Check that your API key is configured correctly in your project's <code>.env</code> file.
          </p>
        )}
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

      {/* Stage log — hierarchical */}
      <div className="bg-slate-900 rounded-lg p-4 h-56 overflow-y-auto font-mono text-xs">
        {stageGroups.length === 0 ? (
          <p className="text-slate-400 animate-pulse">Initializing...</p>
        ) : (
          <div className="space-y-2">
            {stageGroups.map((group, gi) => {
              const isActive = gi === stageGroups.length - 1 && ceremonyStatus === 'running';
              return (
                <div key={gi}>
                  <div className="flex items-center gap-1.5">
                    {isActive ? (
                      <span className="inline-block w-3 h-3 border border-blue-400 border-t-blue-200 rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <span className="text-green-500 flex-shrink-0">✓</span>
                    )}
                    <span className={isActive ? 'text-blue-300 font-medium' : 'text-slate-400'}>
                      {group.message}
                    </span>
                  </div>
                  {group.orphanDetails?.length > 0 && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                      {group.orphanDetails.map((d, di) => (
                        <p key={di} className="text-slate-500">{d}</p>
                      ))}
                    </div>
                  )}
                  {group.substeps.length > 0 && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                      {group.substeps.map((sub, si) => (
                        <div key={si}>
                          <p className="text-slate-400">{sub.text}</p>
                          {sub.details.length > 0 && (
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                              {sub.details.map((d, di) => (
                                <p key={di} className="text-slate-500">{d}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {transitioning === 'cancelling' && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-block w-3 h-3 border border-red-400 border-t-red-200 rounded-full animate-spin flex-shrink-0" />
                <span className="text-red-400 font-medium">Cancelling…</span>
              </div>
            )}
            <div ref={logBottomRef} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {/* Left: run in background */}
        {onBackground && !transitioning && (
          <button
            type="button"
            onClick={onBackground}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1.5 transition-colors"
            title="Hide this window — ceremony keeps running in the background"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Run in Background
          </button>
        )}
        {transitioning && <span />}

        {/* Right: pause / resume / cancel */}
        <div className="flex items-center gap-2">
          {transitioning === 'pausing' ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="inline-block w-3 h-3 border border-slate-400 border-t-slate-200 rounded-full animate-spin" />Pausing…</span>
          ) : transitioning === 'cancelling' ? (
            <span className="flex items-center gap-1.5 text-xs text-red-400"><span className="inline-block w-3 h-3 border border-red-400 border-t-red-200 rounded-full animate-spin" />Cancelling…</span>
          ) : !isPaused ? (
            <button
              onClick={onPause}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              className="px-4 py-2 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              ▶ Resume
            </button>
          )}
          {!transitioning && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              ✕ Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
