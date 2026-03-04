import { useEffect, useRef, useState } from 'react';
import { X, Info, ArrowDownToLine } from 'lucide-react';
import { useSprintPlanningStore } from '../../store/sprintPlanningStore';
import { runSprintPlanning, getSettings, getModels, saveCeremonies, pauseCeremony, resumeCeremony, cancelCeremony, resetCeremony } from '../../lib/api';
import { CeremonyWorkflowModal } from './CeremonyWorkflowModal';

// ── Step progress header ─────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Ready' },
  { id: 2, label: 'Running' },
  { id: 3, label: 'Select Epics/Stories' },
  { id: 4, label: 'Complete' },
];

function StepProgress({ currentStep }) {
  return (
    <div className="flex items-center gap-1 flex-nowrap">
      {STEPS.map((s, idx) => {
        const isDone = currentStep > s.id;
        const isCurrent = currentStep === s.id;
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
              {isDone ? '✓' : s.id} {s.label}
            </div>
            {idx < STEPS.length - 1 && (
              <span className="text-slate-300 text-xs">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// ── Step 1: Ready ─────────────────────────────────────────────────────────────

function ReadyStep({ onStart }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Ready to Plan</h2>
        <p className="text-sm text-slate-500 mt-1">
          AI will decompose your project documentation into Epics and Stories using multi-agent analysis.
        </p>
      </div>

      <div className="flex items-center justify-end pt-2">
        <button
          onClick={onStart}
          className="px-5 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          Start
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Running ───────────────────────────────────────────────────────────

function parseStageNumber(message) {
  const m = message?.match(/Stage\s+(\d+(?:\.\d+)?)\/(\d+)/i);
  if (m) return { current: parseFloat(m[1]), total: parseInt(m[2]) };
  return null;
}

function parseStageTotals(message) {
  const m = message?.match(/\((\d+)\s+epics?,\s*(\d+)\s+stories?\)/i);
  if (m) return { total: parseInt(m[1]) + parseInt(m[2]) };
  const m2 = message?.match(/\((\d+)\s+stories?\)/i);
  if (m2) return { total: parseInt(m2[1]) };
  return null;
}

// Group flat progressLog into a 3-level hierarchy:
//   Level 1 — stage headers  (type:'progress')
//   Level 2 — substeps       (type:'substep')  → { text, details[] }
//   Level 3 — details        (type:'detail')   → appended to last substep's details[]
//             If no substep exists yet, details go into group.orphanDetails[]
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

function RunningStep({ transitioning, onPause, onResume, onCancel, onBackground }) {
  const { progressLog, status, error, isPaused, setStatus, setStep, setError } = useSprintPlanningStore();
  const logBottomRef = useRef(null);

  const handleForceReset = async () => {
    try { await resetCeremony(); } catch (_) {}
    setStatus('idle');
    setStep(1);
    setError(null);
  };

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  const stageGroups = buildStageGroups(progressLog);

  const STAGE_WEIGHTS = {
    '1/6':   [0,  3],
    '2/6':   [3,  7],
    '3/6':   [7,  12],
    '4/6':   [12, 22],
    '4.5/6': [22, 24],
    '5/6':   [24, 76],
    '6/7':   [76, 90],
    '7/7':   [90, 100],
  };

  const currentGroup = [...stageGroups].reverse().find(g => parseStageNumber(g.message));

  let progressPct = 5;
  if (currentGroup) {
    const parsed = parseStageNumber(currentGroup.message);
    const key = `${parsed.current}/${parsed.total}`;
    const [stageStart, stageEnd] = STAGE_WEIGHTS[key] ?? [0, 90];

    const totals = parseStageTotals(currentGroup.message);
    if (totals && totals.total > 0) {
      let countedItems = 0;
      if (key === '5/6') {
        countedItems = currentGroup.substeps.filter(s => s.text?.includes('Validating ')).length;
      } else if (key === '6/7') {
        countedItems = currentGroup.substeps.filter(s => s.text?.includes('Distributing documentation')).length;
      } else if (key === '7/7') {
        countedItems = currentGroup.substeps.filter(s => s.text?.includes('Enriching documentation')).length;
      }
      const fraction = Math.min(countedItems, totals.total) / totals.total;
      progressPct = Math.round(stageStart + fraction * (stageEnd - stageStart));
    } else {
      progressPct = stageStart;
    }
  }
  const latestProgress = stageGroups[stageGroups.length - 1]?.message || 'Starting…';

  if (status === 'error') {
    const isAlreadyRunning = error?.includes('already running');
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Sprint Planning Failed</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-1">Error</p>
          <p className="text-sm text-red-600">{error || 'An unknown error occurred.'}</p>
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
        ) : error === 'Not found' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              The server may be running an older version. Run{' '}
              <code className="bg-slate-100 px-1 rounded">/kanban</code> in the AVC terminal to restart it, then try again.
            </p>
            <button
              onClick={handleForceReset}
              className="px-4 py-2 text-sm rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-colors"
            >
              Cancel &amp; Retry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              You can dismiss this error and start a new sprint planning session.
            </p>
            <button
              onClick={handleForceReset}
              className="px-4 py-2 text-sm rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-colors"
            >
              Cancel &amp; Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Running Sprint Planning</h2>
        <p className="text-sm text-slate-500 mt-1">
          The AI is decomposing your project scope and validating each work item. Duration varies with project size and validation iterations — from a few minutes to 30+ minutes for larger projects.
        </p>
      </div>

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

      <div className="bg-slate-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
        {stageGroups.length === 0 ? (
          <p className="text-slate-400 animate-pulse">Initializing…</p>
        ) : (
          <div className="space-y-2">
            {stageGroups.map((group, gi) => {
              const isActive = gi === stageGroups.length - 1 && status === 'running';
              return (
                <div key={gi}>
                  {/* Stage header */}
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
                  {/* Orphan details — arrived before any substep in this group */}
                  {group.orphanDetails?.length > 0 && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                      {group.orphanDetails.map((d, di) => (
                        <p key={di} className="text-slate-500">{d}</p>
                      ))}
                    </div>
                  )}
                  {/* Substeps (Level 2) + Details (Level 3) */}
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
        {onBackground && !transitioning ? (
          <button
            type="button"
            onClick={onBackground}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1.5 transition-colors"
            title="Hide this window — ceremony keeps running in the background"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Run in Background
          </button>
        ) : <span />}

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

// ── Step 4: Complete ──────────────────────────────────────────────────────────

const EXAMPLE_ISSUES = [
  { stage: 'Project Documentation', ruleId: 'fix-header-formatting',    name: 'Fix Header Spacing',                 severity: 'major'  },
  { stage: 'Project Documentation', ruleId: 'add-section-spacing',      name: 'Add Section Spacing',                severity: 'minor'  },
  { stage: 'Project Context',       ruleId: 'token-count-too-short',    name: 'Expand If Too Short',                severity: 'major'  },
  { stage: 'Project Context',       ruleId: 'no-redundant-info',        name: 'Remove Truly Redundant Information', severity: 'minor'  },
  { stage: 'Context Validation',    ruleId: 'fix-unclosed-code-blocks', name: 'Fix Unclosed Code Blocks',           severity: 'major'  },
];

function IssueTag({ severity }) {
  const cls =
    severity === 'critical' ? 'bg-red-100 text-red-700' :
    severity === 'major'    ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-500';
  return (
    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>
      {severity}
    </span>
  );
}

function CompleteStep({ onClose }) {
  const { result } = useSprintPlanningStore();
  const r = result || {};

  const tokenInput  = r.tokenUsage?.input  || 0;
  const tokenOutput = r.tokenUsage?.output || 0;
  const tokenTotal  = r.tokenUsage?.total  || tokenInput + tokenOutput;

  const costTotal = tokenTotal > 0
    ? `$${((tokenInput * 0.000015) + (tokenOutput * 0.000075)).toFixed(4)}`
    : '—';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-xl font-semibold text-slate-900">Sprint Planning Complete</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your project has been decomposed into Epics and Stories. The kanban board will refresh.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <div className="text-2xl font-bold text-slate-900">{r.epicsCreated ?? 0}</div>
          <div className="text-xs text-slate-500">Epics created</div>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <div className="text-2xl font-bold text-slate-900">{r.storiesCreated ?? 0}</div>
          <div className="text-xs text-slate-500">Stories created</div>
        </div>
      </div>

      {(r.totalEpics != null || r.totalStories != null) && (
        <p className="text-xs text-center text-slate-400">
          Total in project: {r.totalEpics ?? 0} Epics · {r.totalStories ?? 0} Stories
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Input tokens"    value={tokenInput.toLocaleString()} />
        <Stat label="Output tokens"   value={tokenOutput.toLocaleString()} />
        <Stat label="Estimated cost"  value={costTotal} />
      </div>

      {r.model && (
        <p className="text-xs text-center text-slate-400">
          Model: <span className="font-mono">{r.model}</span>
        </p>
      )}

      {(() => {
        const isExample = r.validationIssues === undefined;
        const issues = r.validationIssues ?? EXAMPLE_ISSUES;
        return issues.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Quality fixes applied
              {isExample && <span className="ml-2 normal-case font-normal text-slate-300">(example preview)</span>}
            </p>
            <div className="space-y-1.5">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                  <IssueTag severity={issue.severity} />
                  <span className="text-slate-400 flex-shrink-0">{issue.stage}</span>
                  <span className="text-slate-600">{issue.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      <div className="flex justify-center pt-2">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function SprintPlanningModal({ onClose, costLimitPending, onContinuePastCostLimit, onCancelFromCostLimit }) {
  const {
    isOpen,
    step,
    status,
    isPaused,
    setStep,
    setStatus,
    setError,
    closeModal,
    setProcessId,
  } = useSprintPlanningStore();

  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowCeremony, setWorkflowCeremony] = useState(null);
  const [workflowModels, setWorkflowModels] = useState([]);
  const [workflowAllCeremonies, setWorkflowAllCeremonies] = useState([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [transitioning, setTransitioning] = useState(null); // null | 'pausing' | 'cancelling'

  if (!isOpen) return null;

  const isBlocked = status === 'running' || status === 'awaiting-selection';

  const handleClose = () => {
    if (isBlocked) return;
    closeModal();
    onClose?.();
  };

  const handleStart = async () => {
    setStatus('running');
    setStep(2);
    try {
      const result = await runSprintPlanning();
      if (result?.processId) setProcessId(result.processId);
      // Completion is handled via WebSocket in App.jsx
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const openWorkflow = async () => {
    try {
      const [s, m] = await Promise.all([getSettings(), getModels()]);
      const sc = s.ceremonies?.find((c) => c.name === 'sprint-planning') ?? { name: 'sprint-planning' };
      setWorkflowCeremony(sc);
      setWorkflowModels(m);
      setWorkflowAllCeremonies(s.ceremonies || []);
      setWorkflowOpen(true);
    } catch {}
  };

  const handleWorkflowSave = async (updatedCeremony) => {
    const base = workflowAllCeremonies.length > 0 ? workflowAllCeremonies : [updatedCeremony];
    const next = base.map((c) => c.name === updatedCeremony.name ? updatedCeremony : c);
    await saveCeremonies(next, null);
    setWorkflowCeremony(updatedCeremony);
    setWorkflowAllCeremonies(next);
  };

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

  // Clear transitioning state when WS events arrive (isPaused / status change)
  useEffect(() => {
    if (transitioning === 'pausing' && isPaused) setTransitioning(null);
  }, [isPaused, transitioning]);

  useEffect(() => {
    if (transitioning === 'cancelling' && status === 'idle') setTransitioning(null);
  }, [status, transitioning]);

  const renderStep = () => {
    switch (step) {
      case 1: return <ReadyStep onStart={handleStart} />;
      case 2: return (
        <RunningStep
          transitioning={transitioning}
          onPause={handlePause}
          onResume={handleResume}
          onCancel={() => setShowCancelConfirm(true)}
          onBackground={closeModal}
        />
      );
      case 3: return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <p className="text-sm text-slate-500">Reviewing decomposed work…</p>
        </div>
      );
      case 4: return <CompleteStep onClose={handleClose} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={!isBlocked ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
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
              <p className="text-base font-semibold text-slate-900">Cancel sprint planning?</p>
              <p className="text-sm text-slate-500">
                Any epics and stories created in this run will be permanently deleted.
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
            <h1 className="text-base font-semibold text-slate-900">Sprint Planning Ceremony</h1>
            <div className="mt-2">
              <StepProgress currentStep={step} />
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 mt-0.5 flex-shrink-0">
            {!isBlocked && (
              <button
                type="button"
                onClick={openWorkflow}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors whitespace-nowrap"
                title="View ceremony workflow"
              >
                <Info className="w-3.5 h-3.5" />
                How it works
              </button>
            )}
            {!isBlocked && (
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
          {renderStep()}
        </div>

        {/* Status bar */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 h-8 flex items-center gap-2">
          {status === 'running' && (
            <>
              <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-blue-600 font-medium truncate">Running sprint planning…</p>
            </>
          )}
          {status === 'awaiting-selection' && (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-600 font-medium truncate">Waiting for your selection to continue…</p>
            </>
          )}
        </div>
      </div>

      {workflowOpen && workflowCeremony && (
        <CeremonyWorkflowModal
          ceremony={workflowCeremony}
          models={workflowModels}
          readOnly={status === 'running'}
          onSave={status !== 'running' ? handleWorkflowSave : undefined}
          onClose={() => setWorkflowOpen(false)}
        />
      )}
    </div>
  );
}
