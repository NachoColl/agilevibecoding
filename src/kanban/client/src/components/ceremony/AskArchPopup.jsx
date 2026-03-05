import { useEffect, useState } from 'react';
import { AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { getModels, getSettings, generateArchitecture, refineArchitecture } from '../../lib/api';

function normalizeProvider(p = '') {
  if (p === 'claude') return 'anthropic';
  return p;
}

const KEY_LABELS = {
  claude: 'Anthropic API Key (ANTHROPIC_API_KEY)',
  anthropic: 'Anthropic API Key (ANTHROPIC_API_KEY)',
  gemini: 'Google Gemini API Key (GEMINI_API_KEY)',
  openai: 'OpenAI API Key (OPENAI_API_KEY)',
};

const COST_TIER_COLOR = {
  'Free': 'text-green-600',
  '$':    'text-green-600',
  '$$':   'text-amber-500',
  '$$$':  'text-orange-500',
  '$$$$': 'text-red-500',
};

function RefinePopup({ onSubmit, onClose }) {
  const [refinementRequest, setRefinementRequest] = useState('');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Refine Architecture</h3>
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
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              What would you like to change or improve?
            </label>
            <textarea
              value={refinementRequest}
              onChange={(e) => setRefinementRequest(e.target.value)}
              rows={4}
              placeholder="E.g. Make it fully serverless, add edge caching, keep everything local…"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
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
 * AskArchPopup
 * Two-column popup for generating a single custom architecture via an LLM.
 *
 * Props:
 *   onUse(arch)     — called when user accepts the generated result
 *   onClose()       — called when user cancels / closes
 *   onOpenSettings  — optional callback to open settings panel
 */
export function AskArchPopup({ onUse, onClose, onOpenSettings }) {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showRefinePopup, setShowRefinePopup] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState(null);

  useEffect(() => {
    Promise.all([getModels(), getSettings()])
      .then(([data, settings]) => {
        setModels(data);
        setApiKeyStatus(settings.apiKeys ?? {});
        const firstReady = data.find((m) => settings.apiKeys?.[normalizeProvider(m.provider)]?.isSet);
        setSelectedModelId(firstReady ? firstReady.modelId : (data.length > 0 ? data[0].modelId : ''));
      })
      .catch(() => setError('Failed to load available models.'));
  }, []);

  function recheckKeys() {
    getSettings()
      .then((s) => setApiKeyStatus(s.apiKeys ?? {}))
      .catch(() => {});
  }

  const selectedModel = models.find((m) => m.modelId === selectedModelId);

  const missingKeyProviders = (() => {
    if (!apiKeyStatus || !selectedModel) return [];
    const missing = new Set();
    if (!apiKeyStatus[normalizeProvider(selectedModel.provider)]?.isSet) {
      missing.add(selectedModel.provider);
    }
    return [...missing];
  })();

  async function handleGenerate() {
    if (!description.trim() || !selectedModelId || !selectedModel) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const arch = await generateArchitecture(description.trim(), selectedModelId, selectedModel.provider);
      setResult(arch);
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefine(refinementRequest) {
    setShowRefinePopup(false);
    setResult(null);
    setGenerating(true);
    setError('');
    try {
      const arch = await refineArchitecture(result, refinementRequest, selectedModelId, selectedModel.provider);
      setResult(arch);
    } catch (err) {
      setError(err.message || 'Refinement failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleUse() {
    if (!result) return;
    onUse(result);
  }

  function handleTryAgain() {
    setResult(null);
    setError('');
  }

  const providers = [...new Set(models.map((m) => m.provider))];

  const canGenerate =
    !generating &&
    description.trim().length > 0 &&
    !!selectedModelId &&
    missingKeyProviders.length === 0;

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
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[540px]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">✨ Ask a Model</h3>
              <p className="text-xs text-slate-400 mt-0.5">Describe the architecture you need — an LLM will generate it for you.</p>
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

            {/* LEFT column: controls */}
            <div className="w-2/5 min-w-0 border-r border-slate-100 flex flex-col px-4 py-4 gap-3">

              <ModelSelect
                label="Generator Model"
                value={selectedModelId}
                onChange={setSelectedModelId}
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
                      onClick={recheckKeys}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      Re-check
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Describe the architecture you need
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="E.g. Microservices with Docker, local first, easy to scale to cloud later…"
                  disabled={generating}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">{error}</p>
              )}

              <div className="flex-1" />

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

            {/* RIGHT column: output */}
            <div className="flex-1 flex flex-col min-w-0">

              {generating && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" style={{ borderWidth: 3 }} />
                  <p className="text-sm font-medium text-slate-700">Generating architecture…</p>
                  <p className="text-xs text-slate-400">The model is crafting a custom architecture based on your description.</p>
                </div>
              )}

              {!generating && !result && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center text-slate-300">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <p className="text-sm font-medium text-slate-400">Custom architecture will appear here</p>
                  <p className="text-xs text-slate-300">Fill in the form and click Generate</p>
                </div>
              )}

              {!generating && result && (
                <div className="flex-1 flex flex-col gap-3 px-5 py-4 overflow-y-auto">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{result.name}</span>
                    {result.requiresCloudProvider
                      ? <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Cloud</span>
                      : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Local</span>
                    }
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{result.description}</p>
                  {result.bestFor && (
                    <p className="text-xs text-slate-500 italic">Best for: {result.bestFor}</p>
                  )}
                  {result.costTier && (
                    <p className={`text-sm font-semibold ${COST_TIER_COLOR[result.costTier] ?? 'text-slate-500'}`}>
                      {result.costTier}
                    </p>
                  )}
                  {result.migrationPath && (
                    <p className="text-xs text-slate-400">
                      Migration: {result.migrationPath.estimatedMigrationEffort}
                      ({result.migrationPath.migrationComplexity})
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showRefinePopup && result && (
        <RefinePopup
          onSubmit={handleRefine}
          onClose={() => setShowRefinePopup(false)}
        />
      )}
    </>
  );
}
