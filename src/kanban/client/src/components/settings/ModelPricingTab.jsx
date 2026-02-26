import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { saveModelPricing } from '../../lib/api';

const PROVIDER_COLORS = {
  claude:  'bg-orange-50 text-orange-700 border-orange-200',
  gemini:  'bg-blue-50 text-blue-700 border-blue-200',
  openai:  'bg-green-50 text-green-700 border-green-200',
};

const UNIT_OPTIONS = [
  { value: 'million',  label: 'per 1M tokens' },
  { value: 'thousand', label: 'per 1K tokens' },
];

function initState(models) {
  const state = {};
  for (const [modelId, info] of Object.entries(models)) {
    state[modelId] = {
      input:       String(info.pricing?.input  ?? ''),
      output:      String(info.pricing?.output ?? ''),
      unit:        info.pricing?.unit        ?? 'million',
      source:      info.pricing?.source      ?? '',
      lastUpdated: info.pricing?.lastUpdated ?? '',
    };
  }
  return state;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ModelPricingTab({ settings, onSaved }) {
  const models = settings.models || {};
  const [pricing, setPricing] = useState(() => initState(models));
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const modelEntries = Object.entries(models);

  const update = (modelId, field, value) => {
    setPricing((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], [field]: value },
    }));
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      // Build payload: { modelId: { pricing: { input, output, unit } } }
      const payload = {};
      for (const [modelId, p] of Object.entries(pricing)) {
        payload[modelId] = {
          pricing: {
            input:  parseFloat(p.input)  || 0,
            output: parseFloat(p.output) || 0,
            unit:   p.unit,
            source: p.source,
          },
        };
      }
      await saveModelPricing(payload);
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 2000);
    }
  };

  if (modelEntries.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-slate-500">
          No models configured yet. Run your first ceremony to populate model settings.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        Set the cost per token for each model. These rates are used by the cost tracker
        to estimate LLM spend. Prices are in <strong>USD</strong>.
      </p>

      <div className="flex flex-col gap-2">
        {modelEntries.map(([modelId, info]) => {
          const p = pricing[modelId] ?? { input: '', output: '', unit: 'million' };
          const providerColor = PROVIDER_COLORS[info.provider] || 'bg-slate-50 text-slate-600 border-slate-200';

          return (
            <div key={modelId} className="border border-slate-200 rounded-lg p-4">
              {/* Model header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-slate-800">
                  {info.displayName || modelId}
                </span>
                <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${providerColor}`}>
                  {info.provider}
                </span>
                <span className="text-xs text-slate-400 font-mono ml-auto">{modelId}</span>
                {p.lastUpdated && (
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    verified {formatDate(p.lastUpdated)}
                  </span>
                )}
              </div>

              {/* Pricing rows */}
              <div className="grid grid-cols-[80px_1fr_1fr] gap-x-3 gap-y-2 items-center text-xs">
                {/* Column headers */}
                <div />
                <div className="text-slate-400 font-medium">Price (USD $)</div>
                <div className="text-slate-400 font-medium">Unit</div>

                {/* Input row */}
                <label className="text-slate-600 font-medium">Input</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.input}
                  onChange={(e) => update(modelId, 'input', e.target.value)}
                  placeholder="0.00"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[120px]"
                />
                <select
                  value={p.unit}
                  onChange={(e) => update(modelId, 'unit', e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full max-w-[160px]"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {/* Output row */}
                <label className="text-slate-600 font-medium">Output</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.output}
                  onChange={(e) => update(modelId, 'output', e.target.value)}
                  placeholder="0.00"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[120px]"
                />
                {/* Unit selector is shared — show a static label for output to keep layout consistent */}
                <span className="text-slate-400">
                  {UNIT_OPTIONS.find((o) => o.value === p.unit)?.label}
                </span>

                {/* Source URL row — aligned with price inputs */}
                <label className="text-slate-600 font-medium">Source</label>
                <div className="col-span-2 flex items-center gap-1.5">
                  <input
                    type="url"
                    value={p.source}
                    readOnly
                    placeholder="https://provider.com/pricing"
                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 cursor-default focus:outline-none min-w-0"
                  />
                  {p.source && (
                    <a
                      href={p.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 shrink-0"
                      title="Open pricing page"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40"
        >
          {status === 'saving' ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Error' : 'Save Pricing'}
        </button>
      </div>
    </div>
  );
}
