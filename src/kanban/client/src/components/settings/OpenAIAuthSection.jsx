import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { saveApiKeys, connectOpenAIOAuth, disconnectOpenAIOAuth, getOpenAIOAuthStatus, testOpenAIOAuth } from '../../lib/api';

function formatExpiresIn(seconds) {
  if (seconds <= 0) return 'expired';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function OpenAIAuthSection({ apiKeyInfo, onSaved }) {
  const [authMode, setAuthMode] = useState(apiKeyInfo?.authMode || 'api-key');

  // API-key sub-state
  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  // OAuth sub-state
  const [oauthPhase, setOauthPhase] = useState(
    apiKeyInfo?.oauth?.connected ? 'connected' : 'idle'
  );
  const [oauthInfo, setOauthInfo] = useState(apiKeyInfo?.oauth || { connected: false });
  const [authorizeUrl, setAuthorizeUrl] = useState(null);
  const pollRef = useRef(null);
  const pollTimeoutRef = useRef(null);

  // Test sub-state
  const [testStatus, setTestStatus] = useState(null); // null | 'running' | { ok, response, model, elapsed } | { error }


  // Sync from parent settings refresh
  useEffect(() => {
    setAuthMode(apiKeyInfo?.authMode || 'api-key');
    setOauthInfo(apiKeyInfo?.oauth || { connected: false });
    if (apiKeyInfo?.oauth?.connected) {
      setOauthPhase('connected');
    }
  }, [apiKeyInfo]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getOpenAIOAuthStatus();
        if (status.connected) {
          setOauthInfo(status);
          setOauthPhase('connected');
          setAuthorizeUrl(null);
          stopPolling();
          onSaved();
        }
      } catch { /* ignore */ }
    }, 2000);

    // Auto-stop after 5 minutes
    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setOauthPhase('idle');
    }, 300_000);
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
  };

  const handleModeToggle = (mode) => {
    if (mode === authMode) return;
    if (authMode === 'oauth' && oauthPhase === 'connecting') {
      // Cancel an in-progress connection attempt when switching away
      stopPolling();
      setOauthPhase('idle');
      setAuthorizeUrl(null);
    }
    if (mode === 'oauth') {
      // Restore the correct phase when switching back to Subscription tab
      setOauthPhase(oauthInfo.connected ? 'connected' : 'idle');
    }
    setAuthMode(mode);
  };

  const handleConnect = async () => {
    setOauthPhase('connecting');
    setAuthorizeUrl(null);
    try {
      const result = await connectOpenAIOAuth();
      setAuthorizeUrl(result.authorizeUrl || null);
      startPolling();
    } catch (err) {
      setOauthPhase('idle');
      console.error('OAuth connect error:', err);
    }
  };

  const handleCancel = () => {
    stopPolling();
    setOauthPhase('idle');
    setAuthorizeUrl(null);
  };

  const handleDisconnect = async () => {
    try { await disconnectOpenAIOAuth(); } catch { /* ignore */ }
    setOauthPhase('idle');
    setOauthInfo({ connected: false });
    setTestStatus(null);
    setAuthMode('api-key');
    onSaved();
  };

  const handleTest = async () => {
    setTestStatus('running');
    try {
      const result = await testOpenAIOAuth();
      setTestStatus(result);
    } catch (err) {
      setTestStatus({ error: err.message });
    }
  };

  const handleSaveKey = async () => {
    setSaveStatus('saving');
    try {
      await saveApiKeys({ openai: keyValue });
      setSaveStatus('saved');
      setKeyValue('');
      onSaved();
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-36 flex-shrink-0">
          <p className="text-sm font-medium text-slate-800">OpenAI</p>
          <p className="text-xs text-slate-400">Auth mode</p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => handleModeToggle('api-key')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              authMode === 'api-key'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            API Key
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('oauth')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              authMode === 'oauth'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Subscription
          </button>
        </div>
      </div>

      {/* API Key mode */}
      {authMode === 'api-key' && (
        <div className="flex items-center gap-3 pl-0 pt-1">
          <div className="w-36 flex-shrink-0">
            <p className="text-xs text-slate-400">OPENAI_API_KEY</p>
          </div>

          <div className="w-16 flex-shrink-0">
            {apiKeyInfo?.isSet ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                ✓ Set
              </span>
            ) : (
              <span className="inline-flex items-center text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                Not set
              </span>
            )}
          </div>

          {apiKeyInfo?.isSet && !keyValue && (
            <p className="text-xs text-slate-400 font-mono flex-shrink-0">{apiKeyInfo.preview}</p>
          )}

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={apiKeyInfo?.isSet ? 'Enter new key to update…' : 'sk-…'}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveKey}
              disabled={!keyValue.trim() || saveStatus === 'saving'}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {saveStatus === 'saving' ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  Saving
                </span>
              ) : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* OAuth mode */}
      {authMode === 'oauth' && (
        <div className="pl-0 pt-1">
          {/* Idle — not yet connecting */}
          {oauthPhase === 'idle' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-amber-700">ℹ</span>{' '}
                Requires a <strong>ChatGPT Pro</strong> subscription ($200/mo).
                Only Codex-endpoint models work (<code className="font-mono bg-slate-100 px-1 rounded">gpt-5.2-codex</code>,{' '}
                <code className="font-mono bg-slate-100 px-1 rounded">gpt-5.3-codex</code>).
                This endpoint is unofficial and may change without notice.
              </p>
              <div>
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                >
                  Connect with ChatGPT ↗
                </button>
              </div>
            </div>
          )}

          {/* Connecting — waiting for browser callback */}
          {oauthPhase === 'connecting' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-600 flex items-center gap-2">
                <span className="w-3 h-3 border border-slate-400 border-t-slate-700 rounded-full animate-spin inline-block" />
                Waiting for browser login…
              </p>
              {authorizeUrl && (
                <p className="text-xs text-slate-500">
                  If your browser did not open,{' '}
                  <a
                    href={authorizeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline break-all"
                  >
                    click here to authenticate
                  </a>
                  .
                </p>
              )}
              <div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Connected */}
          {oauthPhase === 'connected' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  ✓ Connected
                </span>
                {oauthInfo.accountId && (
                  <span className="text-xs text-slate-500 font-mono">{oauthInfo.accountId}</span>
                )}
                {oauthInfo.expiresIn != null && (
                  <span className="text-xs text-slate-400">
                    · expires in {formatExpiresIn(oauthInfo.expiresIn)}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testStatus === 'running'}
                    className="px-3 py-1 text-xs font-medium border border-emerald-300 rounded-md text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                  >
                    {testStatus === 'running' ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-3 border border-emerald-400 border-t-emerald-700 rounded-full animate-spin" />
                        Testing…
                      </span>
                    ) : 'Test'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              {testStatus && testStatus !== 'running' && (
                <div className={`text-xs rounded-md px-3 py-2 font-mono ${testStatus.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}>
                  {testStatus.error
                    ? `✗ ${testStatus.error}`
                    : `✓ ${testStatus.response}  [${testStatus.model} · ${testStatus.elapsed}ms]`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
