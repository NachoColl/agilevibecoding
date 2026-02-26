import { useEffect, useRef, useState } from 'react';
import { X, Info } from 'lucide-react';
import { useSprintPlanningStore } from '../../store/sprintPlanningStore';
import { runSprintPlanning, getProjectDocRaw } from '../../lib/api';

// ── Step progress header ─────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Ready' },
  { id: 2, label: 'Running' },
  { id: 3, label: 'Complete' },
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
  const [scopePreview, setScopePreview] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getProjectDocRaw()
      .then((raw) => {
        if (cancelled) return;
        // Try to extract Initial Scope / Scope section
        const scopeMatch = raw.match(/##\s+(?:Initial\s+)?Scope\b[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
        if (scopeMatch) {
          setScopePreview(scopeMatch[1].trim().slice(0, 500));
        } else {
          setScopePreview(raw.trim().slice(0, 400));
        }
      })
      .catch(() => {
        if (!cancelled) setScopePreview('(Could not load doc.md)');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Ready to Plan</h2>
        <p className="text-sm text-slate-500 mt-1">
          Decompose your project documentation into Epics and Stories using multi-agent AI.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Scope Preview (from doc.md)</p>
        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading…</span>
          </div>
        ) : (
          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
            {scopePreview || '(no content)'}
          </pre>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <button
          onClick={onStart}
          disabled={loading}
          className="px-6 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          🚀 Start Sprint Planning
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Running ───────────────────────────────────────────────────────────

function parseStageNumber(message) {
  const m = message?.match(/Stage\s+(\d+)\/(\d+)/i);
  if (m) return { current: parseInt(m[1]), total: parseInt(m[2]) };
  return null;
}

function RunningStep() {
  const { progressLog, status, error } = useSprintPlanningStore();
  const logBottomRef = useRef(null);

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  const progressMessages = progressLog.filter((e) => e.type === 'progress');
  const substepMessages = progressLog.filter((e) => e.type === 'substep');

  let currentStage = null;
  let totalStages = 8;
  for (const p of [...progressMessages].reverse()) {
    const parsed = parseStageNumber(p.message);
    if (parsed) {
      currentStage = parsed.current;
      totalStages = parsed.total;
      break;
    }
  }

  const progressPct = currentStage ? Math.round((currentStage / totalStages) * 100) : 5;
  const latestProgress = progressMessages[progressMessages.length - 1]?.message || 'Starting…';

  if (status === 'error') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Sprint Planning Failed</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-1">Error</p>
          <p className="text-sm text-red-600">{error || 'An unknown error occurred.'}</p>
        </div>
        <p className="text-sm text-slate-500">
          Check that your API key is configured correctly in your project's{' '}
          <code className="bg-slate-100 px-1 rounded">.env</code> file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Running Sprint Planning</h2>
        <p className="text-sm text-slate-500 mt-1">
          The AI is decomposing your project scope. This typically takes 2–5 minutes.
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

      <div className="bg-slate-900 rounded-lg p-4 h-56 overflow-y-auto font-mono text-xs">
        {progressMessages.length === 0 && substepMessages.length === 0 ? (
          <p className="text-slate-400 animate-pulse">Initializing…</p>
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
        Please keep this window open while sprint planning runs…
      </p>
    </div>
  );
}

// ── Step 3: Complete ──────────────────────────────────────────────────────────

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

export function SprintPlanningModal({ onClose }) {
  const {
    isOpen,
    step,
    status,
    setStep,
    setStatus,
    setError,
    closeModal,
  } = useSprintPlanningStore();

  if (!isOpen) return null;

  const handleClose = () => {
    if (status === 'running') return; // block close while running
    closeModal();
    onClose?.();
  };

  const handleStart = async () => {
    setStatus('running');
    setStep(2);
    try {
      await runSprintPlanning();
      // Completion is handled via WebSocket in App.jsx
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1: return <ReadyStep onStart={handleStart} />;
      case 2: return <RunningStep />;
      case 3: return <CompleteStep onClose={handleClose} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={status !== 'running' ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-slate-900">Sprint Planning Ceremony</h1>
            <div className="mt-2">
              <StepProgress currentStep={step} />
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 mt-0.5 flex-shrink-0">
            {status !== 'running' && (
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
        </div>
      </div>
    </div>
  );
}
