import { useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { saveCeremonies } from '../../lib/api';
import { CeremonyWorkflowModal } from '../ceremony/CeremonyWorkflowModal';

function humanize(str) {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModelSelect({ value, onChange, models }) {
  const providers = [...new Set(models.map((m) => m.provider))];
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={models.length === 0}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 bg-white w-full max-w-xs"
    >
      {models.length === 0 && <option value="">No models available</option>}
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
  );
}

function ModelRow({ label, value, onChange, models, indent }) {
  return (
    <tr className="border-t border-slate-100">
      <td className={`py-2 pr-3 text-xs text-slate-700 font-medium ${indent ? 'pl-4' : ''}`}>
        {label}
      </td>
      <td className="py-2">
        <ModelSelect value={value} onChange={onChange} models={models} />
      </td>
    </tr>
  );
}

function SectionHeader({ label }) {
  return (
    <tr>
      <td
        colSpan={2}
        className="pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide"
      >
        {label}
      </td>
    </tr>
  );
}

function CeremonySection({ ceremony, models, onChange }) {
  const [open, setOpen] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(false);

  // stages is an object: { stageName: { provider, model } }
  const stageEntries = Object.entries(ceremony.stages || {});

  // Validation sub-areas: keys whose value is an object with a `model` property
  const validationSubAreas = Object.entries(ceremony.validation || {}).filter(
    ([, v]) => v && typeof v === 'object' && typeof v.model === 'string'
  );

  const updateStageModel = (stageName, modelId) => {
    const found = models.find((m) => m.modelId === modelId);
    onChange({
      ...ceremony,
      stages: {
        ...ceremony.stages,
        [stageName]: {
          ...ceremony.stages[stageName],
          model: modelId,
          provider: found?.provider || ceremony.stages[stageName]?.provider || '',
        },
      },
    });
  };

  const updateValidationModel = (modelId) => {
    const found = models.find((m) => m.modelId === modelId);
    onChange({
      ...ceremony,
      validation: {
        ...ceremony.validation,
        model: modelId,
        provider: found?.provider || ceremony.validation?.provider || '',
      },
    });
  };

  const updateValidationSubAreaModel = (area, modelId) => {
    const found = models.find((m) => m.modelId === modelId);
    onChange({
      ...ceremony,
      validation: {
        ...ceremony.validation,
        [area]: {
          ...ceremony.validation[area],
          model: modelId,
          provider: found?.provider || ceremony.validation[area]?.provider || '',
        },
      },
    });
  };

  const updateValidationField = (field, value) => {
    onChange({
      ...ceremony,
      validation: { ...ceremony.validation, [field]: value },
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-slate-800">
          {ceremony.displayName || humanize(ceremony.name || '')}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setWorkflowOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setWorkflowOpen(true); } }}
            className="text-slate-400 hover:text-blue-500 transition-colors p-0.5 rounded"
            title="View workflow"
          >
            <Info className="w-3.5 h-3.5" />
          </span>
          {open
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />
          }
        </span>
      </button>

      {open && (
        <div className="px-4 py-3">
          {stageEntries.length === 0 && validationSubAreas.length === 0 && !ceremony.validation?.model ? (
            <p className="text-xs text-slate-400">No stages configured for this ceremony.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="pb-1 font-medium w-5/12">Stage / Area</th>
                  <th className="pb-1 font-medium">Model</th>
                </tr>
              </thead>
              <tbody>
                {/* ── Stages ───────────────────────────────────────────── */}
                {stageEntries.length > 0 && (
                  <SectionHeader label="Stages" />
                )}
                {stageEntries.map(([stageName, stageConfig]) => (
                  <ModelRow
                    key={stageName}
                    label={humanize(stageName)}
                    value={stageConfig.model}
                    onChange={(modelId) => updateStageModel(stageName, modelId)}
                    models={models}
                  />
                ))}

                {/* ── Validation ───────────────────────────────────────── */}
                {(ceremony.validation?.model || validationSubAreas.length > 0) && (
                  <SectionHeader label="Validation" />
                )}
                {ceremony.validation?.model && (
                  <ModelRow
                    label="Validator (default)"
                    value={ceremony.validation.model}
                    onChange={updateValidationModel}
                    models={models}
                  />
                )}
                {validationSubAreas.map(([area, areaConfig]) => (
                  <ModelRow
                    key={area}
                    label={`${humanize(area)} validator`}
                    value={areaConfig.model}
                    onChange={(modelId) => updateValidationSubAreaModel(area, modelId)}
                    models={models}
                    indent
                  />
                ))}
              </tbody>
            </table>
          )}

          {/* Numeric validation params */}
          {ceremony.validation && (
            <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Max iterations</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={ceremony.validation.maxIterations ?? 3}
                  onChange={(e) => updateValidationField('maxIterations', Number(e.target.value))}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Acceptance threshold</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={ceremony.validation.acceptanceThreshold ?? 75}
                  onChange={(e) => updateValidationField('acceptanceThreshold', Number(e.target.value))}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400">/100</span>
              </div>
            </div>
          )}
        </div>
      )}
      {workflowOpen && (
        <CeremonyWorkflowModal
          ceremony={ceremony}
          models={models}
          onClose={() => setWorkflowOpen(false)}
        />
      )}
    </div>
  );
}

export function CeremonyModelsTab({ settings, models, onSaved }) {
  const [ceremonies, setCeremonies] = useState(
    () => JSON.parse(JSON.stringify(settings.ceremonies || []))
  );
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const handleSave = async () => {
    setStatus('saving');
    try {
      await saveCeremonies(ceremonies);
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 2000);
    }
  };

  if (!ceremonies.length) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-slate-500">
          No ceremony configurations found yet. Run your first ceremony from the kanban board
          to populate settings here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {ceremonies.map((ceremony, idx) => (
        <CeremonySection
          key={ceremony.name || idx}
          ceremony={ceremony}
          models={models}
          onChange={(updated) => {
            const next = [...ceremonies];
            next[idx] = updated;
            setCeremonies(next);
          }}
        />
      ))}
      <div className="flex justify-end pt-2">
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
          ) : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Error' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
