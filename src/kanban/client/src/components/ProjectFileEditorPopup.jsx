import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getProjectDocRaw, getProjectContextRaw, updateProjectDoc, updateProjectContext } from '../lib/api';

const FILE_CONFIG = {
  doc: {
    title: 'Project Documentation',
    filename: 'doc.md',
    load: getProjectDocRaw,
    save: updateProjectDoc,
  },
  context: {
    title: 'Project Context',
    filename: 'context.md',
    load: getProjectContextRaw,
    save: updateProjectContext,
  },
};

export function ProjectFileEditorPopup({ fileType, onClose }) {
  const config = FILE_CONFIG[fileType];
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const isDirty = content !== savedContent;

  useEffect(() => {
    config.load().then((text) => {
      setContent(text ?? '');
      setSavedContent(text ?? '');
      setLoading(false);
    });
  }, [fileType]);

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await config.save(content);
      setSavedContent(content);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      setContent(savedContent);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl h-[80vh] mx-4 bg-white rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{config.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{config.filename}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400" />
            </div>
          ) : (
            <textarea
              className="w-full h-full resize-none font-mono text-sm text-slate-800 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-200 flex-shrink-0">
          {savedFlash && (
            <span className="text-sm text-green-600 font-medium mr-auto">Saved ✓</span>
          )}
          <button
            onClick={handleCancel}
            disabled={!isDirty}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
