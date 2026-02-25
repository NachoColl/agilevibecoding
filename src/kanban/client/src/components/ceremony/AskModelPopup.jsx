import { useEffect, useState } from 'react';
import { AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { getModels, generateMission, refineMission } from '../../lib/api';
import { useCeremonyStore } from '../../store/ceremonyStore';

const KEY_LABELS = {
  claude: 'Anthropic API Key (ANTHROPIC_API_KEY)',
  anthropic: 'Anthropic API Key (ANTHROPIC_API_KEY)',
  gemini: 'Google Gemini API Key (GEMINI_API_KEY)',
  openai: 'OpenAI API Key (OPENAI_API_KEY)',
};

/**
 * IssuesPopup
 * Sub-modal that displays all validation issues with full detail.
 * Supports selecting issues and triggering a targeted refine.
 */
function IssuesPopup({ issues, onClose, onRefineWithIssues }) {
  const [selectedIssueIndices, setSelectedIssueIndices] = useState(new Set());

  const severityColor = {
    critical: 'text-red-600',
    major: 'text-orange-600',
    minor: 'text-amber-600',
  };
  const severityBg = {
    critical: 'bg-red-50 border-red-100',
    major: 'bg-orange-50 border-orange-100',
    minor: 'bg-amber-50 border-amber-100',
  };

  function toggleIssue(i) {
    setSelectedIssueIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Validation Issues</h3>
            <p className="text-xs text-slate-400 mt-0.5">{issues.length} issue{issues.length !== 1 ? 's' : ''} found during validation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none ml-4"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Issues list */}
        <ul className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {issues.map((issue, i) => (
            <li
              key={i}
              onClick={() => toggleIssue(i)}
              className={`rounded-lg border px-3 py-2.5 cursor-pointer flex items-start gap-2.5 ${selectedIssueIndices.has(i) ? 'ring-2 ring-blue-500' : ''} ${severityBg[issue.severity] ?? 'bg-slate-50 border-slate-100'}`}
            >
              <input
                type="checkbox"
                checked={selectedIssueIndices.has(i)}
                onChange={() => toggleIssue(i)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 flex-shrink-0 accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold uppercase ${severityColor[issue.severity] ?? 'text-slate-600'}`}>
                    {issue.severity}
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-snug">{issue.description}</p>
                {issue.suggestion && (
                  <p className="text-xs text-slate-500 mt-1 leading-snug">
                    <span className="font-medium">Suggestion:</span> {issue.suggestion}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onRefineWithIssues(issues.filter((_, i) => selectedIssueIndices.has(i)));
              onClose();
            }}
            disabled={selectedIssueIndices.size === 0}
            className="px-4 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            Refine with selected
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * RefinePopup
 * Sub-modal for requesting targeted refinements to the generated mission & scope.
 */
function RefinePopup({ onSubmit, onClose }) {
  const [refinementRequest, setRefinementRequest] = useState('');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Refine Mission & Scope</h3>
            <p className="text-xs text-slate-400 mt-0.5">Describe what you'd like to change or improve.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none ml-4"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {/* Refinement textarea */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              What would you like to change or improve?
            </label>
            <textarea
              value={refinementRequest}
              onChange={(e) => setRefinementRequest(e.target.value)}
              rows={4}
              placeholder="E.g. Focus more on enterprise teams, make the mission mention mobile specifically…"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(refinementRequest)}
            disabled={!refinementRequest.trim()}
            className="px-4 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            Refine
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AskModelPopup
 * Sub-popup for generating a mission statement and initial scope via an LLM.
 * Two-column layout: left = controls/buttons, right = result output.
 *
 * Props:
 *   onUse(mission, scope) — called when the user accepts the generated result
 *   onClose()             — called when the user cancels / closes
 */
export function AskModelPopup({ onUse, onClose, onOpenSettings }) {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedValidatorModelId, setSelectedValidatorModelId] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showIssuesPopup, setShowIssuesPopup] = useState(false);
  const [showRefinePopup, setShowRefinePopup] = useState(false);

  const { missionProgressLog, clearMissionProgress } = useCeremonyStore();
  const latestProgress = missionProgressLog[missionProgressLog.length - 1] ?? null;

  useEffect(() => {
    getModels()
      .then((data) => {
        setModels(data);
        const firstReady = data.find((m) => m.hasApiKey);
        const generatorId = firstReady ? firstReady.modelId : (data.length > 0 ? data[0].modelId : '');
        setSelectedModelId(generatorId);
        const otherReady = data.find((m) => m.hasApiKey && m.modelId !== generatorId);
        setSelectedValidatorModelId(otherReady ? otherReady.modelId : generatorId);
      })
      .catch(() => setError('Failed to load available models.'));
  }, []);

  function recheckModels() {
    getModels()
      .then((data) => setModels(data))
      .catch(() => {});
  }

  const selectedModel = models.find((m) => m.modelId === selectedModelId);
  const selectedValidatorModel = models.find((m) => m.modelId === selectedValidatorModelId);

  // Derive missing providers from currently selected models
  const missingKeyProviders = (() => {
    const missing = new Set();
    if (selectedModel && !selectedModel.hasApiKey) missing.add(selectedModel.provider);
    if (selectedValidatorModel && !selectedValidatorModel.hasApiKey) missing.add(selectedValidatorModel.provider);
    return [...missing];
  })();

  async function handleGenerate() {
    if (!description.trim() || !selectedModelId || !selectedModel || !selectedValidatorModelId || !selectedValidatorModel) return;
    setGenerating(true);
    setError('');
    setResult(null);
    setShowIssuesPopup(false);
    clearMissionProgress();
    try {
      const data = await generateMission(
        description.trim(),
        selectedModelId,
        selectedModel.provider,
        selectedValidatorModelId,
        selectedValidatorModel.provider,
      );
      setResult(data);
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefine(refinementRequest) {
    const { missionStatement, initialScope } = result;
    setShowRefinePopup(false);
    setResult(null);
    setGenerating(true);
    setError('');
    setShowIssuesPopup(false);
    clearMissionProgress();
    try {
      const data = await refineMission(
        missionStatement, initialScope, refinementRequest,
        selectedModelId, selectedModel.provider,
        selectedValidatorModelId, selectedValidatorModel.provider,
      );
      setResult(data);
    } catch (err) {
      setError(err.message || 'Refinement failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleRefineFromIssues(selectedIssues) {
    setShowIssuesPopup(false);
    const request = 'Fix the following validation issues:\n' +
      selectedIssues.map(i =>
        `- [${i.severity.toUpperCase()}] ${i.field}: ${i.description} → ${i.suggestion}`
      ).join('\n');
    handleRefine(request);
  }

  function handleUse() {
    if (!result) return;
    onUse(result.missionStatement, result.initialScope);
  }

  function handleTryAgain() {
    setResult(null);
    setError('');
    setShowIssuesPopup(false);
  }

  const providers = [...new Set(models.map((m) => m.provider))];
  const scorePassed = result?.validationScore != null && result.validationScore >= 75;

  const canGenerate =
    !generating &&
    description.trim().length > 0 &&
    !!selectedModelId &&
    !!selectedValidatorModelId &&
    selectedModel?.hasApiKey !== false &&
    selectedValidatorModel?.hasApiKey !== false;

  // Shared model dropdown markup
  function ModelSelect({ label, value, onChange }) {
    const chosen = models.find((m) => m.modelId === value);
    return (
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={generating || models.length === 0}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 bg-white"
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

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card — fixed height two-column */}
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[540px]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">✨ Ask a Model</h3>
              <p className="text-xs text-slate-400 mt-0.5">Describe your idea — an LLM generates and validates your mission &amp; scope.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none ml-4"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body — two columns */}
          <div className="flex flex-1 min-h-0">

            {/* ── LEFT column: controls ────────────────────────────────────────── */}
            <div className="w-2/5 min-w-0 border-r border-slate-100 flex flex-col px-4 py-4 gap-3">

              <ModelSelect
                label="Generator Model"
                value={selectedModelId}
                onChange={setSelectedModelId}
              />

              <ModelSelect
                label="Validator Model"
                value={selectedValidatorModelId}
                onChange={setSelectedValidatorModelId}
              />

              {missingKeyProviders.length > 0 && (
                <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-900">API Key Missing</p>
                      <ul className="mt-1 space-y-0.5">
                        {missingKeyProviders.map((p) => (
                          <li key={p} className="flex items-center gap-1.5 text-xs text-amber-800">
                            <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                            {KEY_LABELS[p] || p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="flex items-center gap-1 text-xs font-medium bg-slate-900 text-white px-2.5 py-1 rounded-md hover:bg-slate-700 transition-colors"
                      >
                        <SettingsIcon className="w-3 h-3" />
                        Settings
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={recheckModels}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      Re-check
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  What are you building?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="E.g. A recipe sharing app for home cooks…"
                  disabled={generating}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">{error}</p>
              )}

              {/* Score badge + issues button */}
              {result?.validationScore != null && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      scorePassed
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {scorePassed ? '✓' : '⚠'} {result.validationScore}/100
                    &nbsp;·&nbsp;
                    {result.iterations} iter{result.iterations !== 1 ? 's' : ''}
                  </span>
                  {result.issues?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowIssuesPopup(true)}
                      className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                    >
                      Issues ({result.issues.length})
                    </button>
                  )}
                </div>
              )}

              {/* Spacer pushes buttons to bottom */}
              <div className="flex-1" />

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                {result ? (
                  <>
                    <button
                      type="button"
                      onClick={handleUse}
                      className="w-full px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Use This
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRefinePopup(true)}
                      className="w-full px-3 py-2 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Refine
                    </button>
                    <button
                      type="button"
                      onClick={handleTryAgain}
                      className="w-full px-3 py-2 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Try Again
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating…
                      </>
                    ) : 'Generate'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* ── RIGHT column: output ─────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0">

              {/* Generating state */}
              {generating && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" style={{ borderWidth: 3 }} />
                  <p className="text-sm font-medium text-slate-700">
                    {latestProgress ? latestProgress.message : 'Starting…'}
                  </p>
                  <p className="text-xs text-slate-400">This may take a moment while the models validate and refine the output.</p>
                </div>
              )}

              {/* Idle / no result yet */}
              {!generating && !result && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center text-slate-300">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <p className="text-sm font-medium text-slate-400">Generated mission &amp; scope will appear here</p>
                  <p className="text-xs text-slate-300">Fill in the form and click Generate</p>
                </div>
              )}

              {/* Result */}
              {!generating && result && (
                <div className="flex-1 flex flex-col gap-4 px-5 py-4 overflow-y-auto">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mission Statement</p>
                    <p className="text-sm text-slate-800 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed">
                      {result.missionStatement}
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Initial Scope</p>
                    <div className="flex-1 text-sm text-slate-800 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed overflow-y-auto min-h-0">
                      {result.initialScope.split('\n').map((line, i) => (
                        <p key={i} className="mb-1 last:mb-0">{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Issues detail popup */}
      {showIssuesPopup && result?.issues?.length > 0 && (
        <IssuesPopup
          issues={result.issues}
          onClose={() => setShowIssuesPopup(false)}
          onRefineWithIssues={handleRefineFromIssues}
        />
      )}

      {/* Refine popup */}
      {showRefinePopup && result && (
        <RefinePopup
          onSubmit={handleRefine}
          onClose={() => setShowRefinePopup(false)}
        />
      )}
    </>
  );
}
