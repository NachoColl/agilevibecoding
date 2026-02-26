import { useState, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { getAgentContent, saveAgentContent, resetAgent } from '../../lib/api';

export function AgentEditorPopup({ agentName, onClose, onSaved, onReset }) {
  const [data, setData] = useState(null);       // { content, isCustomized, defaultContent }
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // pendingReset: editor has been loaded with defaultContent, Save will call resetAgent()
  const [pendingReset, setPendingReset] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPendingReset(false);
    getAgentContent(agentName)
      .then(d => {
        setData(d);
        setEditValue(d.content);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentName]);

  const isDirty = data && editValue !== data.content;

  const handleSave = async () => {
    if (!data || !isDirty) return;
    setSaving(true);
    setError(null);
    try {
      if (pendingReset) {
        // Reset to default: delete customized file
        await resetAgent(agentName);
        setData(prev => ({ ...prev, content: prev.defaultContent, isCustomized: false }));
        setPendingReset(false);
        onReset?.();
      } else {
        await saveAgentContent(agentName, editValue);
        setData(prev => ({ ...prev, content: editValue, isCustomized: true }));
        onSaved?.();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cancel closes the popup without saving
  const handleCancel = () => {
    onClose();
  };

  // Reset loads default content into the editor — persisted only on Save
  const handleReset = () => {
    if (!data?.defaultContent) return;
    setEditValue(data.defaultContent);
    setPendingReset(true);
  };

  const canReset = data?.isCustomized && !pendingReset;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono font-medium text-slate-700 truncate">
              {agentName}
            </span>
            {data?.isCustomized && !pendingReset && (
              <span className="flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                Custom
              </span>
            )}
            {pendingReset && (
              <span className="flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                Reset pending — save to apply
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors ml-4 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            <span className="w-4 h-4 border border-slate-300 border-t-slate-600 rounded-full animate-spin mr-2" />
            Loading…
          </div>
        ) : error && !data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-500 px-6 text-center">
            {error}
          </div>
        ) : (
          <textarea
            value={editValue}
            onChange={e => { setEditValue(e.target.value); setPendingReset(false); }}
            className="flex-1 resize-none font-mono text-xs text-slate-800 leading-relaxed px-5 py-4 focus:outline-none"
            spellCheck={false}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <div>
            {error && !loading && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            {saved && (
              <p className="text-xs text-green-600 font-medium">Saved ✓</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Reset: loads default content into editor; Save then applies it */}
            <button
              type="button"
              onClick={handleReset}
              disabled={!canReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={canReset ? 'Load default content into editor' : 'Only available for customized agents'}
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {saving ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  Saving
                </span>
              ) : pendingReset ? 'Save & Reset' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
