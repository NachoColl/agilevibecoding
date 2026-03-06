import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { saveCeremonies } from '../../lib/api';

// Map ceremony provider name → apiKeys property name
const PROVIDER_TO_KEY = { claude: 'anthropic', gemini: 'gemini', openai: 'openai' };
// Display labels (extendable as new providers are added)
const PROVIDER_LABELS = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' };

/**
 * Apply a provider preset to a ceremony object (immutable).
 * Merges preset provider/model/stages while preserving non-model keys
 * (useContextualSelection, maxIterations, etc.) from the existing config.
 */
function applyProviderPreset(ceremony, providerKey) {
  const preset = ceremony.providerPresets?.[providerKey];
  if (!preset) return ceremony;

  const updated = { ...ceremony, provider: preset.provider, defaultModel: preset.defaultModel };

  // Merge stages: start from current stages to preserve extra keys, overlay preset values
  const newStages = {};
  const allStageNames = new Set([
    ...Object.keys(updated.stages || {}),
    ...Object.keys(preset.stages || {}),
  ]);
  for (const stageName of allStageNames) {
    const existing = updated.stages?.[stageName] ?? {};
    const presetStage = preset.stages?.[stageName];
    if (presetStage) {
      newStages[stageName] = { ...existing, provider: presetStage.provider, model: presetStage.model };
    } else {
      newStages[stageName] = existing;
    }
  }
  updated.stages = newStages;

  // Handle validation (sponsor-call specific)
  if (preset.validation && updated.validation) {
    updated.validation = {
      ...updated.validation,
      provider: preset.validation.provider,
      model: preset.validation.model,
    };
    if (preset.validation.refinement && updated.validation.refinement) {
      updated.validation.refinement = {
        ...updated.validation.refinement,
        provider: preset.validation.refinement.provider,
        model: preset.validation.refinement.model,
      };
    }
    if (preset.validation.documentation && updated.validation.documentation) {
      updated.validation.documentation = {
        ...updated.validation.documentation,
        provider: preset.validation.documentation.provider,
        model: preset.validation.documentation.model,
      };
    }
  }

  return updated;
}

export function ProviderSwitcherButton({ ceremonyName, ceremonies, apiKeys, onApplied }) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef(null);

  const ceremony = ceremonies?.find((c) => c.name === ceremonyName);
  const currentProvider = ceremony?.provider;
  const presets = ceremony?.providerPresets;

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (!presets || Object.keys(presets).length === 0) return null;

  const providerKeys = Object.keys(presets);
  const currentLabel = PROVIDER_LABELS[currentProvider] || currentProvider || '—';

  const handleSelect = async (providerKey) => {
    if (!ceremony || providerKey === currentProvider) { setIsOpen(false); return; }
    setIsOpen(false);
    setSaving(true);
    try {
      const updated = applyProviderPreset(ceremony, providerKey);
      const updatedCeremonies = ceremonies.map((c) => c.name === ceremonyName ? updated : c);
      await saveCeremonies(updatedCeremonies, null);
      onApplied(updatedCeremonies);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={saving}
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-60"
        title="Switch AI provider preset"
      >
        {saving ? (
          <span className="w-3 h-3 border border-slate-400 border-t-slate-700 rounded-full animate-spin" />
        ) : (
          <span className="font-medium">⚡ {currentLabel}</span>
        )}
        {!saving && <ChevronDown className="w-3 h-3" />}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
          {providerKeys.map((key) => {
            const label = PROVIDER_LABELS[key] || key;
            const apiKeyProp = PROVIDER_TO_KEY[key];
            const hasKey = apiKeys?.[apiKeyProp]?.isSet ?? false;
            const isCurrent = key === currentProvider;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelect(key)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
              >
                <span className={isCurrent ? 'font-medium text-slate-900' : 'text-slate-700'}>
                  {label}
                </span>
                <div className="flex items-center gap-1.5">
                  {isCurrent && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      hasKey ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {hasKey ? 'key set' : 'no key'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
