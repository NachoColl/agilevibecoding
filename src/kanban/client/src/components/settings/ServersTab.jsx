import { useState } from 'react';
import { saveGeneralSettings } from '../../lib/api';

export function ServersTab({ settings, onSaved }) {
  const [kanbanPort, setKanbanPort] = useState(String(settings.kanbanPort || 4174));
  const [docsPort, setDocsPort] = useState(String(settings.docsPort || 4173));
  const [boardTitle, setBoardTitle] = useState(settings.boardTitle || 'AVC Kanban Board');
  const [portsStatus, setPortsStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [titleStatus, setTitleStatus] = useState(null);

  const handleSavePorts = async () => {
    setPortsStatus('saving');
    try {
      await saveGeneralSettings({
        kanbanPort: Number(kanbanPort),
        docsPort: Number(docsPort),
      });
      setPortsStatus('saved');
      onSaved();
      setTimeout(() => setPortsStatus(null), 2000);
    } catch {
      setPortsStatus('error');
      setTimeout(() => setPortsStatus(null), 2000);
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = boardTitle.trim();
    if (!trimmed) return;
    setTitleStatus('saving');
    try {
      await saveGeneralSettings({ boardTitle: trimmed });
      setTitleStatus('saved');
      onSaved();
      setTimeout(() => setTitleStatus(null), 2000);
    } catch {
      setTitleStatus('error');
      setTimeout(() => setTitleStatus(null), 2000);
    }
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-6">
      {/* General section */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">General</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-700 w-28 flex-shrink-0">Board title</label>
          <input
            type="text"
            value={boardTitle}
            onChange={(e) => setBoardTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }}
            className="flex-1 max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSaveTitle}
            disabled={!boardTitle.trim() || titleStatus === 'saving'}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            {titleStatus === 'saving' ? (
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                Saving
              </span>
            ) : titleStatus === 'saved' ? '✓ Saved' : titleStatus === 'error' ? '✗ Error' : 'Save'}
          </button>
        </div>
      </div>

      {/* Ports section */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Server Ports</h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 w-28 flex-shrink-0">Kanban board</label>
            <input
              type="number"
              min="1024"
              max="65535"
              value={kanbanPort}
              onChange={(e) => setKanbanPort(e.target.value)}
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 w-28 flex-shrink-0">Documentation</label>
            <input
              type="number"
              min="1024"
              max="65535"
              value={docsPort}
              onChange={(e) => setDocsPort(e.target.value)}
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <div className="w-28 flex-shrink-0" />
            <button
              type="button"
              onClick={handleSavePorts}
              disabled={portsStatus === 'saving'}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {portsStatus === 'saving' ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  Saving
                </span>
              ) : portsStatus === 'saved' ? '✓ Saved' : portsStatus === 'error' ? '✗ Error' : 'Save'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Changing ports requires restarting the servers (run <code className="font-mono bg-slate-100 px-1 rounded">/kanban</code> and <code className="font-mono bg-slate-100 px-1 rounded">/documentation</code>).
        </p>
      </div>
    </div>
  );
}
