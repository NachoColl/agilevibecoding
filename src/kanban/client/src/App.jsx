import { useEffect, useState, useMemo } from 'react';
import { getHealth } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';
import { useKanbanStore } from './store/kanbanStore';
import { useFilterStore } from './store/filterStore';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { FilterToolbar } from './components/kanban/FilterToolbar';
import { CardDetailModal } from './components/kanban/CardDetailModal';
import { groupItemsByColumn } from './lib/status-grouping';

function App() {
  const [health, setHealth] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Zustand stores
  const { workItems, loadWorkItems, loading, error } = useKanbanStore();
  const { typeFilters, searchQuery } = useFilterStore();

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

  // WebSocket connection for real-time updates
  useWebSocket({
    onMessage: (message) => {
      console.log('WebSocket message:', message);

      if (message.type === 'refresh' || message.type === 'work-item-update') {
        // Reload work items when backend notifies of changes
        loadWorkItems();
      }
    },
    onConnected: () => {
      console.log('WebSocket connected');
      setWsConnected(true);
    },
    onDisconnected: () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Initial data load
  useEffect(() => {
    const init = async () => {
      try {
        // Check backend health
        const healthData = await getHealth();
        setHealth(healthData);

        // Load work items
        await loadWorkItems();
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    init();
  }, [loadWorkItems]);

  // Handle card click - open detail modal
  const handleCardClick = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  // Handle modal navigation (prev/next)
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

  // Handle modal close
  const handleModalClose = () => {
    setModalOpen(false);
    // Don't clear selectedItem immediately to prevent flash during close animation
    setTimeout(() => setSelectedItem(null), 200);
  };

  // Loading state
  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading AVC Kanban Board...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !health) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Connection Error
          </h2>
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
              <h1 className="text-2xl font-bold text-slate-900">
                AVC Kanban Board
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {health?.projectRoot || 'Loading...'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* WebSocket status indicator */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                ></div>
                <span className="text-sm text-slate-600">
                  {wsConnected ? 'Live Updates' : 'Disconnected'}
                </span>
              </div>

              {/* Powered by link */}
              <a
                href="https://agilevibecoding.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Powered by AVC
              </a>
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
        <p>
          Built with React + Vite + Tailwind CSS + Framer Motion •{' '}
          <a
            href="https://github.com/NachoColl/agilevibecoding"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            GitHub
          </a>
        </p>
      </footer>

      {/* Detail Modal */}
      <CardDetailModal
        workItem={selectedItem}
        open={modalOpen}
        onOpenChange={handleModalClose}
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default App;
