import { useEffect, useState, useMemo, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { getHealth, getBoardTitle, updateBoardTitle, getDocsUrl } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';
import { useKanbanStore } from './store/kanbanStore';
import { useFilterStore } from './store/filterStore';
import { useCeremonyStore } from './store/ceremonyStore';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { FilterToolbar } from './components/kanban/FilterToolbar';
import { CardDetailModal } from './components/kanban/CardDetailModal';
import { SponsorCallModal } from './components/ceremony/SponsorCallModal';
import { groupItemsByColumn } from './lib/status-grouping';

function App() {
  const [health, setHealth] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Board title state
  const [boardTitle, setBoardTitle] = useState('AVC Kanban Board');
  const [docsUrl, setDocsUrl] = useState('http://localhost:4173');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const titleInputRef = useRef(null);

  // Zustand stores
  const { workItems, loadWorkItems, loading, error } = useKanbanStore();
  const { typeFilters, searchQuery } = useFilterStore();
  const {
    isOpen: ceremonyOpen,
    openWizard,
    resetWizard,
    ceremonyStatus,
    setCeremonyStatus,
    setCeremonyResult,
    setCeremonyError,
    appendProgress,
    appendMissionProgress,
    setWizardStep,
  } = useCeremonyStore();

  // Get filtered items for navigation
  const filteredItems = useMemo(() => {
    let filtered = workItems.filter((item) => typeFilters[item.type]);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.epicName && item.epicName.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [workItems, typeFilters, searchQuery]);

  // WebSocket connection for real-time updates + ceremony events
  const { wsStatus } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'refresh' || message.type === 'work-item-update') {
        loadWorkItems();
      } else if (message.type === 'ceremony:progress') {
        appendProgress({ type: 'progress', message: message.message });
      } else if (message.type === 'ceremony:substep') {
        appendProgress({ type: 'substep', substep: message.substep, meta: message.meta });
      } else if (message.type === 'ceremony:complete') {
        setCeremonyStatus('complete');
        setCeremonyResult(message.result);
        setWizardStep(7);
        loadWorkItems();
      } else if (message.type === 'ceremony:error') {
        setCeremonyStatus('error');
        setCeremonyError(message.error);
      } else if (message.type === 'mission:progress') {
        appendMissionProgress({ step: message.step, message: message.message });
      }
    },
  });

  // Initial data load
  useEffect(() => {
    const init = async () => {
      try {
        const [healthData, title, docsUrlData] = await Promise.all([
          getHealth(),
          getBoardTitle(),
          getDocsUrl(),
        ]);
        setHealth(healthData);
        setBoardTitle(title);
        setDocsUrl(docsUrlData);
        await loadWorkItems();
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    init();
  }, [loadWorkItems]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  // ── Title editing handlers ─────────────────────────────────────────────────

  const startEditTitle = () => {
    setTitleInput(boardTitle);
    setEditingTitle(true);
  };

  const cancelEditTitle = () => {
    setEditingTitle(false);
    setTitleInput('');
  };

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === boardTitle) {
      cancelEditTitle();
      return;
    }
    try {
      await updateBoardTitle(trimmed);
      setBoardTitle(trimmed);
    } catch (err) {
      console.error('Failed to save title:', err);
    }
    setEditingTitle(false);
    setTitleInput('');
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') cancelEditTitle();
  };

  // ── Card navigation ────────────────────────────────────────────────────────

  const handleCardClick = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleNavigate = (direction) => {
    if (!selectedItem || filteredItems.length === 0) return;

    const currentIndex = filteredItems.findIndex((item) => item.id === selectedItem.id);
    if (currentIndex === -1) return;

    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1;
    } else {
      newIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0;
    }

    setSelectedItem(filteredItems[newIndex]);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setTimeout(() => setSelectedItem(null), 200);
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading {boardTitle}...</p>
        </div>
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Connection Error</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              {/* Editable board title */}
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={titleInputRef}
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    className="text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-blue-500 outline-none min-w-0 w-72"
                  />
                  <button
                    onClick={saveTitle}
                    className="text-green-600 hover:text-green-700 transition-colors"
                    title="Save"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={cancelEditTitle}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Cancel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEditTitle}
                  className="group flex items-center gap-2 text-left"
                  title="Click to edit board title"
                >
                  <h1 className="text-2xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                    {boardTitle}
                  </h1>
                  <Pencil className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                </button>
              )}
              <p className="text-sm text-slate-600 mt-1">
                {health?.projectRoot || 'Loading...'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Documentation link */}
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
                title="Open project documentation"
              >
                Docs ↗
              </a>

              {/* Sponsor Call button */}
              {ceremonyStatus !== 'running' && !loading && workItems.length === 0 && (
                <button
                  onClick={() => {
                    resetWizard();
                    openWizard();
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  title="Start sponsor call ceremony"
                >
                  🚀 Start Project
                </button>
              )}

              {/* Real-time updates status */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    wsStatus === 'connected'
                      ? 'bg-green-500 animate-pulse'
                      : wsStatus === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-slate-400'
                  }`}
                ></div>
                <span className="text-sm text-slate-500">
                  {wsStatus === 'connected'
                    ? 'Live updates'
                    : wsStatus === 'connecting'
                    ? 'Connecting...'
                    : 'No live updates'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Toolbar */}
      <FilterToolbar />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full px-4 sm:px-6 lg:px-8 py-6">
          <KanbanBoard onCardClick={handleCardClick} />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-sm text-slate-500 flex-shrink-0">
        <a
          href="https://agilevibecoding.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 hover:underline"
        >
          Powered by AVC
        </a>
      </footer>

      {/* Detail Modal */}
      <CardDetailModal
        workItem={selectedItem}
        open={modalOpen}
        onOpenChange={handleModalClose}
        onNavigate={handleNavigate}
        onItemClick={handleCardClick}
        allItems={workItems}
      />

      {/* Sponsor Call Ceremony Modal */}
      {ceremonyOpen && <SponsorCallModal />}
    </div>
  );
}

export default App;
