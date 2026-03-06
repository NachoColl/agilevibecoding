import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { saveApiKeys } from '../../lib/api';
import { OpenAIAuthSection } from './OpenAIAuthSection';

const PROVIDERS = [
  { key: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-…' },
  { key: 'gemini',    label: 'Google (Gemini)', envKey: 'GEMINI_API_KEY', placeholder: 'AIza…' },
];

function ApiKeyRow({ provider, apiKeyInfo, onSaved }) {
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error' | 'clearing'

  const handleSave = async () => {
    setStatus('saving');
    try {
      await saveApiKeys({ [provider.key]: value });
      setStatus('saved');
      setValue('');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const handleClear = async () => {
    setStatus('clearing');
    try {
      await saveApiKeys({ [provider.key]: '' });
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 2000);
    }
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      {/* Provider name */}
      <div className="w-36 flex-shrink-0">
        <p className="text-sm font-medium text-slate-800">{provider.label}</p>
        <p className="text-xs text-slate-400">{provider.envKey}</p>
      </div>

      {/* Status badge */}
      <div className="w-16 flex-shrink-0">
        {apiKeyInfo.isSet ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            ✓ Set
          </span>
        ) : (
          <span className="inline-flex items-center text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
            Not set
          </span>
        )}
      </div>

      {/* Preview */}
      {apiKeyInfo.isSet && !value && (
        <p className="text-xs text-slate-400 font-mono flex-shrink-0">{apiKeyInfo.preview}</p>
      )}

      {/* Key input */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={apiKeyInfo.isSet ? 'Enter new key to update…' : provider.placeholder}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        {apiKeyInfo.isSet && !value && (
          <button
            type="button"
            onClick={handleClear}
            disabled={status === 'clearing'}
            className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {status === 'clearing' ? '…' : 'Reset'}
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim() || status === 'saving'}
          className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {status === 'saving' ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              Saving
            </span>
          ) : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Error' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function ApiKeysTab({ settings, onSaved }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-slate-500 mb-4">
        API keys are stored in your project's <code className="font-mono bg-slate-100 px-1 rounded">.env</code> file.
        Enter a new key and click Save to update. Clear the field and save to remove a key.
      </p>
      <div>
        {PROVIDERS.map((provider) => (
          <ApiKeyRow
            key={provider.key}
            provider={provider}
            apiKeyInfo={settings.apiKeys[provider.key]}
            onSaved={onSaved}
          />
        ))}
        <OpenAIAuthSection
          apiKeyInfo={settings.apiKeys.openai}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
