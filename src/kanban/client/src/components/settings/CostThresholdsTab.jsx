import { useState } from 'react';
import { saveCostThresholds } from '../../lib/api';

const CEREMONIES = [
  { key: 'sponsor-call',    label: 'Sponsor Call',    desc: 'Wizard to define project mission, scope, and architecture' },
  { key: 'sprint-planning', label: 'Sprint Planning',  desc: 'Generates epics, stories, and feature contexts' },
  { key: 'seed',            label: 'Seed',             desc: 'Populates initial epics and stories from a seed document' },
];

function initState(costThresholds) {
  const state = {};
  for (const { key } of CEREMONIES) {
    const val = costThresholds?.[key];
    state[key] = val != null ? String(val) : '';
  }
  return state;
}

export function CostThresholdsTab({ settings, onSaved }) {
  const [values, setValues] = useState(() => initState(settings.costThresholds));
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const update = (key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const payload = {};
      for (const { key } of CEREMONIES) {
        const raw = values[key].trim();
        payload[key] = raw === '' ? null : parseFloat(raw) || null;
      }
      await saveCostThresholds(payload);
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 2000);
    }
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        Set a maximum spend (in <strong>USD</strong>) per ceremony run. Leave empty for unlimited.
        When the running cost exceeds the limit, the ceremony stops automatically.
      </p>

      <div className="flex flex-col gap-2">
        {CEREMONIES.map(({ key, label, desc }) => (
          <div key={key} className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm text-slate-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={values[key]}
                  onChange={(e) => update(key, e.target.value)}
                  placeholder="Unlimited"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
        ))}
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
          ) : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Error' : 'Save Cost Limits'}
        </button>
      </div>
    </div>
  );
}
