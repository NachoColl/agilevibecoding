import { useState, useEffect, useRef } from 'react';
import { Wand2, Check, X, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { getModels, getSettings, refineWorkItem, applyWorkItemChanges } from '../../lib/api';

function normalizeProvider(p = '') {
  if (p === 'claude') return 'anthropic';
  return p;
}

function ModelSelect({ label, value, onChange, models, disabled }) {
  const providers = [...new Set(models.map((m) => m.provider))];
  const chosen = models.find((m) => m.modelId === value);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60 bg-white"
      >
        {models.length === 0 && <option value="">Loading…</option>}
        {providers.map((p) => (
          <optgroup key={p} label={p.charAt(0).toUpperCase() + p.slice(1)}>
            {models.filter((m) => m.provider === p).map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {m.displayName}{!m.hasApiKey ? ' (no key)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {chosen && !chosen.hasApiKey && (
        <p className="text-xs text-amber-600 mt-0.5">
          ⚠ No API key — add to <code>.env</code>
        </p>
      )}
    </div>
  );
}

function FieldDiff({ label, before, after }) {
  const beforeStr = Array.isArray(before) ? before.join('\n') : (before ?? '');
  const afterStr = Array.isArray(after) ? after.join('\n') : (after ?? '');
  if (!beforeStr && !afterStr) return null;
  if (beforeStr === afterStr) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      {beforeStr && (
        <div className="mb-1 px-2.5 py-2 bg-red-50 border border-red-100 rounded text-xs text-red-700 leading-relaxed line-through">
          {beforeStr}
        </div>
      )}
      {afterStr && (
        <div className="px-2.5 py-2 bg-green-50 border border-green-100 rounded text-xs text-green-700 leading-relaxed">
          {afterStr}
        </div>
      )}
    </div>
  );
}

function StoryUpdateCard({ impact, checked, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="flex-shrink-0 accent-violet-600"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">
            {impact.proposedStory?.name ?? impact.storyId}
          </p>
          <p className="text-xs text-slate-400 truncate">{impact.storyId}</p>
        </div>
        {impact.changesNeeded && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && impact.changesNeeded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          <p className="text-xs text-slate-600 leading-relaxed">{impact.changesNeeded}</p>
        </div>
      )}
    </div>
  );
}

function NewStoryCard({ story, checked, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const acs = story?.acceptance ?? story?.acceptanceCriteria ?? [];
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="flex-shrink-0 accent-emerald-600"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
              NEW
            </span>
            <p className="text-xs font-medium text-slate-800 truncate">{story?.name}</p>
          </div>
          {story?.description && (
            <p className="text-xs text-slate-500 truncate">{story.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600"
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
          {story?.description && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5">Description</p>
              <p className="text-xs text-slate-700 leading-relaxed">{story.description}</p>
            </div>
          )}
          {acs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5">Acceptance Criteria</p>
              <ul className="space-y-0.5">
                {acs.map((ac, i) => (
                  <li key={i} className="flex items-start gap-1 text-xs text-slate-700">
                    <span className="text-slate-400 mt-0.5 flex-shrink-0">•</span>
                    <span>{ac}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SEVERITY_COLOR = {
  critical: 'text-red-600',
  major: 'text-orange-600',
  minor: 'text-amber-600',
};
const SEVERITY_BG = {
  critical: 'bg-red-50 border-red-100',
  major: 'bg-orange-50 border-orange-100',
  minor: 'bg-amber-50 border-amber-100',
};

function scoreBadgeClass(score) {
  if (score >= 95) return 'bg-green-100 text-green-700';
  if (score >= 80) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

/**
 * RefineWorkItemPopup
 * Three-phase popup:
 *   configure → running (while LLM runs) → results (accept / discard)
 *
 * Props:
 *   item            - full work item from CardDetailModal (includes metadata.validationResult)
 *   refineProgress  - { itemId, jobId, message } from WS, or null
 *   refineResult    - { itemId, jobId, result } from WS, or null
 *   refineError     - { itemId, jobId, error } from WS, or null
 *   onClose()       - close popup without accepting
 *   onAccepted()    - called after successful apply (triggers detail reload)
 */
export function RefineWorkItemPopup({
  item,
  refineProgress,
  refineResult,
  refineError,
  onClose,
  onAccepted,
}) {
  // ── Configure state ─────────────────────────────────────────────────────────
  const vr = item?.metadata?.validationResult;
  const allIssues = [
    ...(vr?.criticalIssues || []).map((i) => ({ ...i, severity: 'critical' })),
    ...(vr?.majorIssues || []).map((i) => ({ ...i, severity: 'major' })),
    ...(vr?.minorIssues || []).map((i) => ({ ...i, severity: 'minor' })),
  ];

  // Pre-select all critical issues
  const [selectedIssueIndices, setSelectedIssueIndices] = useState(
    () => new Set(
      allIssues
        .map((issue, i) => (issue.severity === 'critical' ? i : null))
        .filter((i) => i !== null)
    )
  );
  const [refinementRequest, setRefinementRequest] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedValidatorModelId, setSelectedValidatorModelId] = useState('');
  const [configError, setConfigError] = useState('');

  // Local "refine started, waiting for first WS progress" state
  const [refining, setRefining] = useState(false);

  // ── Running state ───────────────────────────────────────────────────────────
  const [progressLog, setProgressLog] = useState([]);
  const progressEndRef = useRef(null);

  // ── Results state ───────────────────────────────────────────────────────────
  const [storyCheckboxes, setStoryCheckboxes] = useState(null); // { [storyImpactIndex]: boolean }
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // ── Phase derivation ────────────────────────────────────────────────────────
  const phase = refineResult
    ? 'results'
    : refining || refineProgress
    ? 'running'
    : 'configure';

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Load models on mount
  useEffect(() => {
    Promise.all([getModels(), getSettings()])
      .then(([data, settings]) => {
        setModels(data);
        const firstReady = data.find(
          (m) => settings.apiKeys?.[normalizeProvider(m.provider)]?.isSet
        );
        const genId = firstReady
          ? firstReady.modelId
          : data.length > 0
          ? data[0].modelId
          : '';
        setSelectedModelId(genId);
        const otherReady = data.find(
          (m) =>
            settings.apiKeys?.[normalizeProvider(m.provider)]?.isSet &&
            m.modelId !== genId
        );
        setSelectedValidatorModelId(otherReady ? otherReady.modelId : genId);
      })
      .catch(() => setConfigError('Failed to load models.'));
  }, []);

  // Accumulate progress messages
  useEffect(() => {
    if (refineProgress?.message) {
      setProgressLog((prev) => [...prev, refineProgress.message]);
    }
  }, [refineProgress]);

  // Auto-scroll progress log
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  // When result arrives, reset refining and initialise story checkboxes
  useEffect(() => {
    if (!refineResult) return;
    setRefining(false);
    const impacts = refineResult.result?.storyImpacts || [];
    const init = {};
    impacts.forEach((impact, i) => {
      // Pre-check: all impacted updates and all new stories
      init[i] = impact.type === 'new' || impact.impacted === true;
    });
    setStoryCheckboxes(init);
  }, [refineResult]);

  // When error arrives, go back to configure with the error message shown
  useEffect(() => {
    if (!refineError) return;
    setRefining(false);
    setConfigError(
      typeof refineError.error === 'string'
        ? refineError.error
        : 'Refinement failed — please try again.'
    );
  }, [refineError]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function toggleIssue(i) {
    setSelectedIssueIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleRefine() {
    const selectedModel = models.find((m) => m.modelId === selectedModelId);
    const selectedValidatorModel = models.find(
      (m) => m.modelId === selectedValidatorModelId
    );
    if (!selectedModel || !selectedValidatorModel) return;

    const selectedIssues = allIssues.filter((_, i) => selectedIssueIndices.has(i));

    setRefining(true);
    setConfigError('');
    setProgressLog([]);

    try {
      await refineWorkItem(item.id, {
        refinementRequest,
        selectedIssues,
        modelId: selectedModelId,
        provider: selectedModel.provider,
        validatorModelId: selectedValidatorModelId,
        validatorProvider: selectedValidatorModel.provider,
      });
      // Job started — WebSocket broadcasts refine:progress / refine:complete / refine:error
    } catch (err) {
      setRefining(false);
      setConfigError(err.message || 'Failed to start refinement.');
    }
  }

  async function handleAccept() {
    if (!refineResult) return;
    const { proposedItem, storyImpacts = [] } = refineResult.result;

    const acceptedStoryChanges = storyImpacts
      .filter((_, i) => storyCheckboxes?.[i])
      .map((impact) => ({
        type: impact.type,
        storyId: impact.storyId ?? null,
        proposedStory: impact.proposedStory,
      }));

    setAccepting(true);
    setAcceptError('');
    try {
      await applyWorkItemChanges(item.id, proposedItem, acceptedStoryChanges);
      onAccepted?.();
    } catch (err) {
      setAcceptError(err.message || 'Failed to apply changes.');
      setAccepting(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const selectedModel = models.find((m) => m.modelId === selectedModelId);
  const selectedValidatorModel = models.find(
    (m) => m.modelId === selectedValidatorModelId
  );
  const canRefine =
    !refining &&
    !!selectedModelId &&
    !!selectedValidatorModelId &&
    !!selectedModel &&
    !!selectedValidatorModel;
  const selectedIssueCount = selectedIssueIndices.size;

  // Results phase derived values
  const resultData = refineResult?.result;
  const storyImpacts = resultData?.storyImpacts || [];
  const updateImpacts = storyImpacts
    .map((impact, i) => ({ impact, i }))
    .filter(({ impact }) => impact.type === 'update' && impact.impacted);
  const newImpacts = storyImpacts
    .map((impact, i) => ({ impact, i }))
    .filter(({ impact }) => impact.type === 'new');

  const checkedStoryCount = Object.values(storyCheckboxes || {}).filter(Boolean).length;
  const isEpic = item.type === 'epic';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'running') onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full transition-all duration-200 ${
          phase === 'results' ? 'max-w-2xl' : 'max-w-xl'
        }`}
        style={{ maxHeight: '88vh' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-violet-600" />
              Refine with AI
              {phase !== 'configure' && (
                <span
                  className={`ml-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                    phase === 'running'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-violet-100 text-violet-700'
                  }`}
                >
                  {phase === 'running' ? 'Running…' : 'Results'}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{item.name}</p>
          </div>
          {phase !== 'running' && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors ml-4 flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── CONFIGURE PHASE ────────────────────────────────────────────────── */}
        {phase === 'configure' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            {/* Issues checklist */}
            {allIssues.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Validation Issues ({allIssues.length})
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIssueIndices(
                          new Set(allIssues.map((_, i) => i))
                        )
                      }
                      className="text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIssueIndices(new Set())}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      None
                    </button>
                  </div>
                </div>
                <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {allIssues.map((issue, i) => (
                    <li
                      key={i}
                      onClick={() => toggleIssue(i)}
                      className={`rounded-lg border px-3 py-2 cursor-pointer flex items-start gap-2.5 transition-shadow ${
                        selectedIssueIndices.has(i) ? 'ring-2 ring-violet-400' : ''
                      } ${SEVERITY_BG[issue.severity] ?? 'bg-slate-50 border-slate-100'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIssueIndices.has(i)}
                        onChange={() => toggleIssue(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 flex-shrink-0 accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-xs font-semibold uppercase ${
                            SEVERITY_COLOR[issue.severity] ?? 'text-slate-500'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <p className="text-xs text-slate-800 mt-0.5 leading-snug">
                          {issue.description}
                        </p>
                        {issue.suggestion && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                            <span className="font-medium">Suggestion:</span>{' '}
                            {issue.suggestion}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-100 rounded-lg">
                <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                <p className="text-xs text-green-700">
                  No validation issues found — you can still refine with a custom request.
                </p>
              </div>
            )}

            {/* Free-text request */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Refinement request{' '}
                <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                value={refinementRequest}
                onChange={(e) => setRefinementRequest(e.target.value)}
                rows={3}
                placeholder={
                  isEpic
                    ? 'E.g. Sharpen the scope, add examples, expand the features list…'
                    : 'E.g. Make acceptance criteria more testable, add edge cases…'
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            {/* Model selectors */}
            <div className="grid grid-cols-2 gap-3">
              <ModelSelect
                label="Generator Model"
                value={selectedModelId}
                onChange={setSelectedModelId}
                models={models}
                disabled={false}
              />
              <ModelSelect
                label="Validator Model"
                value={selectedValidatorModelId}
                onChange={setSelectedValidatorModelId}
                models={models}
                disabled={false}
              />
            </div>

            {configError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{configError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── RUNNING PHASE ──────────────────────────────────────────────────── */}
        {phase === 'running' && (
          <div className="flex-1 flex flex-col overflow-hidden px-5 py-4 min-h-0">
            <div className="flex flex-col items-center gap-3 mb-4 flex-shrink-0">
              <span
                className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin"
              />
              <p className="text-sm font-medium text-slate-700">
                Refining {item.type}…
              </p>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg px-3 py-2.5 space-y-1 min-h-0">
              {progressLog.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Starting…</p>
              ) : (
                progressLog.map((msg, i) => (
                  <p key={i} className="text-xs text-slate-600 leading-snug">
                    {msg}
                  </p>
                ))
              )}
              <div ref={progressEndRef} />
            </div>
          </div>
        )}

        {/* ── RESULTS PHASE ──────────────────────────────────────────────────── */}
        {phase === 'results' && resultData && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
            {/* Score comparison */}
            {(() => {
              const oldScore = item?.metadata?.validationResult?.averageScore;
              const newScore =
                resultData.validationResult?.averageScore ??
                resultData.proposedItem?.metadata?.validationResult?.averageScore;
              if (newScore == null) return null;
              return (
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Validation Score
                  </p>
                  <div className="flex items-center gap-2">
                    {oldScore != null && (
                      <>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadgeClass(oldScore)}`}
                        >
                          {oldScore}/100
                        </span>
                        <span className="text-slate-400 text-xs">→</span>
                      </>
                    )}
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadgeClass(newScore)}`}
                    >
                      {newScore}/100
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Field diffs */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Proposed Changes
              </p>
              <FieldDiff
                label="Description"
                before={resultData.originalItem?.description}
                after={resultData.proposedItem?.description}
              />
              {isEpic && (
                <FieldDiff
                  label="Features"
                  before={resultData.originalItem?.features}
                  after={resultData.proposedItem?.features}
                />
              )}
              {!isEpic && (
                <FieldDiff
                  label="Acceptance Criteria"
                  before={resultData.originalItem?.acceptance ?? resultData.originalItem?.acceptanceCriteria}
                  after={resultData.proposedItem?.acceptance ?? resultData.proposedItem?.acceptanceCriteria}
                />
              )}
              {resultData.originalItem?.description ===
                resultData.proposedItem?.description &&
                !resultData.originalItem?.features &&
                !resultData.originalItem?.acceptanceCriteria && (
                  <p className="text-xs text-slate-400 italic">
                    No textual changes detected — check dependencies or metadata.
                  </p>
                )}
            </div>

            {/* Existing stories to update */}
            {updateImpacts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Existing Stories to Update ({updateImpacts.length})
                </p>
                <div className="space-y-2">
                  {updateImpacts.map(({ impact, i }) => (
                    <StoryUpdateCard
                      key={i}
                      impact={impact}
                      checked={storyCheckboxes?.[i] ?? true}
                      onToggle={() =>
                        setStoryCheckboxes((prev) => ({
                          ...prev,
                          [i]: !prev?.[i],
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* New stories to add */}
            {newImpacts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  New Stories to Add ({newImpacts.length})
                </p>
                <div className="space-y-2">
                  {newImpacts.map(({ impact, i }) => (
                    <NewStoryCard
                      key={i}
                      story={impact.proposedStory}
                      checked={storyCheckboxes?.[i] ?? true}
                      onToggle={() =>
                        setStoryCheckboxes((prev) => ({
                          ...prev,
                          [i]: !prev?.[i],
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {acceptError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{acceptError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between gap-2">
          {phase === 'configure' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRefine}
                disabled={!canRefine}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {selectedIssueCount > 0
                  ? `Refine (${selectedIssueCount} issue${selectedIssueCount !== 1 ? 's' : ''})`
                  : 'Refine'}
              </button>
            </>
          )}

          {phase === 'running' && (
            <p className="w-full text-center text-xs text-slate-400 italic">
              Waiting for LLM response — please keep this window open.
            </p>
          )}

          {phase === 'results' && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={accepting}
                className="px-4 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40"
              >
                {accepting ? (
                  <>
                    <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {checkedStoryCount > 0
                      ? `Accept + ${checkedStoryCount} story change${checkedStoryCount !== 1 ? 's' : ''}`
                      : 'Accept Changes'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
