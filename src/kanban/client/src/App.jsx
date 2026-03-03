import { useEffect, useState, useMemo, useRef } from 'react';
import { Pencil, Check, X, BookOpen, Settings, DollarSign } from 'lucide-react';
import { getHealth, getBoardTitle, updateBoardTitle, getDocsUrl, getSettings, getModels, getCostSummary, getProjectStatus, getCeremonyStatus, continuePastCostLimit, cancelCeremony } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';
import { useKanbanStore } from './store/kanbanStore';
import { useFilterStore } from './store/filterStore';
import { useCeremonyStore } from './store/ceremonyStore';
import { useSprintPlanningStore } from './store/sprintPlanningStore';
import { useProcessStore } from './store/processStore';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { ProjectFileEditorPopup } from './components/ProjectFileEditorPopup';
import { FilterToolbar } from './components/kanban/FilterToolbar';
import { ProcessMonitorBar } from './components/process/ProcessMonitorBar';
import { CardDetailModal } from './components/kanban/CardDetailModal';
import { SponsorCallModal } from './components/ceremony/SponsorCallModal';
import { SprintPlanningModal } from './components/ceremony/SprintPlanningModal';
import { EpicStorySelectionModal } from './components/ceremony/EpicStorySelectionModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { CostModal } from './components/stats/CostModal';
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

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = useState(null);
  const [modelsSnapshot, setModelsSnapshot] = useState([]);

  // Cost chip + modal state
  const [costSummary, setCostSummary] = useState(null);
  const [costModalOpen, setCostModalOpen] = useState(false);

  // Cost-limit pause dialog — { cost, threshold, runningType } when ceremony hits limit
  const [costLimitPending, setCostLimitPending] = useState(null);

  // Refine work item state — { itemId, jobId, message } / { itemId, jobId, result } / { itemId, jobId, error }
  const [refineProgress, setRefineProgress] = useState(null);
  const [refineResult, setRefineResult] = useState(null);
  const [refineError, setRefineError] = useState(null);

  // Project file status + editor popup
  const [projectFilesStatus, setProjectFilesStatus] = useState({ docExists: false });
  const [projectFilesLoaded, setProjectFilesLoaded] = useState(false);
  const [editingProjectFile, setEditingProjectFile] = useState(null); // 'doc' | null

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
    setProgressLog: setCeremonyProgressLog,
    setWizardStep,
    setPaused: setCeremonyPaused,
    setProcessId: setCeremonyProcessId,
  } = useCeremonyStore();

  const {
    isOpen: sprintPlanningOpen,
    openModal: openSprintPlanning,
    closeModal: closeSprintPlanning,
    reopenModal: reopenSprintPlanning,
    setStep: setSprintPlanningStep,
    setStatus: setSprintPlanningStatus,
    appendProgress: appendSprintPlanningProgress,
    setProgressLog: setSprintPlanningProgressLog,
    setResult: setSprintPlanningResult,
    setError: setSprintPlanningError,
    status: sprintPlanningStatus,
    setPaused: setSprintPlanningPaused,
    setProcessId: setSprintPlanningProcessId,
    setDecomposedHierarchy: setSprintPlanningDecomposedHierarchy,
  } = useSprintPlanningStore();

  const { handleProcessMessage } = useProcessStore();

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
      } else if (message.type === 'ceremony:detail') {
        appendProgress({ type: 'detail', detail: message.detail });
      } else if (message.type === 'ceremony:complete') {
        setCostLimitPending(null);
        setCeremonyStatus('complete');
        setCeremonyResult(message.result);
        setWizardStep(7);
        loadWorkItems();
        getProjectStatus().then(setProjectFilesStatus).catch(() => { });
      } else if (message.type === 'ceremony:error') {
        setCeremonyStatus('error');
        setCeremonyError(message.error);
      } else if (message.type === 'mission:progress') {
        appendMissionProgress({ step: message.step, message: message.message });
      } else if (message.type === 'ceremony:cost-limit') {
        setCostLimitPending({ cost: message.cost, threshold: message.threshold, runningType: message.runningType });
      } else if (message.type === 'cost:update') {
        getCostSummary().then(setCostSummary).catch(() => { });
      } else if (message.type === 'sprint-planning:progress') {
        appendSprintPlanningProgress({ type: 'progress', message: message.message });
      } else if (message.type === 'sprint-planning:substep') {
        appendSprintPlanningProgress({ type: 'substep', substep: message.substep, meta: message.meta });
      } else if (message.type === 'sprint-planning:detail') {
        appendSprintPlanningProgress({ type: 'detail', detail: message.detail });
      } else if (message.type === 'sprint-planning:decomposition-complete') {
        setSprintPlanningDecomposedHierarchy(message.hierarchy);
        setSprintPlanningStatus('awaiting-selection');
        setSprintPlanningStep(3);
      } else if (message.type === 'sprint-planning:complete') {
        setCostLimitPending(null);
        setSprintPlanningStatus('complete');
        setSprintPlanningResult(message.result);
        setSprintPlanningDecomposedHierarchy(null);
        setSprintPlanningStep(4);
        loadWorkItems();
      } else if (message.type === 'sprint-planning:error') {
        setSprintPlanningStatus('error');
        setSprintPlanningError(message.error);
      } else if (message.type === 'sprint-planning:paused') {
        setSprintPlanningPaused(true);
      } else if (message.type === 'sprint-planning:resumed') {
        setSprintPlanningPaused(false);
      } else if (message.type === 'sprint-planning:cancelled') {
        setCostLimitPending(null);
        setSprintPlanningStatus('idle');
        setSprintPlanningStep(1);
        setSprintPlanningPaused(false);
        setSprintPlanningDecomposedHierarchy(null);
      } else if (message.type === 'ceremony:paused') {
        setCeremonyPaused(true);
      } else if (message.type === 'ceremony:resumed') {
        setCeremonyPaused(false);
      } else if (message.type === 'ceremony:cancelled') {
        setCostLimitPending(null);
        setCeremonyStatus('idle');
        setWizardStep(1);
        setCeremonyPaused(false);
      } else if (message.type === 'refine:progress') {
        setRefineProgress({ itemId: message.itemId, jobId: message.jobId, message: message.message });
      } else if (message.type === 'refine:complete') {
        setRefineProgress(null);
        setRefineResult({ itemId: message.itemId, jobId: message.jobId, result: message.result });
      } else if (message.type === 'refine:error') {
        setRefineProgress(null);
        setRefineError({ itemId: message.itemId, jobId: message.jobId, error: message.error });
      } else if (message.type === 'process:started') {
        handleProcessMessage(message);
        if (message.processType === 'sprint-planning') {
          setSprintPlanningProcessId(message.processId);
        } else if (message.processType === 'sponsor-call') {
          setCeremonyProcessId(message.processId);
        }
      } else if (message.type === 'process:list' || message.type === 'process:status') {
        handleProcessMessage(message);
      } else if (message.type === 'ceremony:sync') {
        // Server sends this on WebSocket connect when a ceremony is already running.
        // Restores client state without requiring an HTTP round-trip.
        const cs = message.ceremonyStatus;
        if (cs?.status === 'running' || cs?.status === 'cost-limit-pending' || cs?.status === 'awaiting-selection') {
          if (cs.runningType === 'sprint-planning') {
            if (cs.status === 'awaiting-selection') {
              setSprintPlanningStatus('awaiting-selection');
              setSprintPlanningDecomposedHierarchy(cs.decomposedHierarchy || null);
              setSprintPlanningStep(3);
            } else {
              setSprintPlanningStatus('running');
            }
            if (cs.processId) setSprintPlanningProcessId(cs.processId);
            if (cs.progress?.length) setSprintPlanningProgressLog(cs.progress);
          } else if (cs.runningType === 'sponsor-call') {
            setCeremonyStatus('running');
            if (cs.processId) setCeremonyProcessId(cs.processId);
            if (cs.progress?.length) setCeremonyProgressLog(cs.progress);
          }
          if (cs.status === 'cost-limit-pending' && cs.costLimitInfo) {
            setCostLimitPending({ ...cs.costLimitInfo, runningType: cs.runningType });
          }
        }
      }
    },
  });

  // Initial data load
  useEffect(() => {
    const init = async () => {
      try {
        const [healthData, title, docsUrlData, filesStatus, ceremonyState] = await Promise.all([
          getHealth(),
          getBoardTitle(),
          getDocsUrl(),
          getProjectStatus(),
          getCeremonyStatus().catch(() => null),
        ]);
        setHealth(healthData);
        setBoardTitle(title);
        setDocsUrl(docsUrlData);
        setProjectFilesStatus(filesStatus);

        // Restore running ceremony state BEFORE revealing projectFilesLoaded so the
        // board never shows "Start" buttons for an already-running ceremony.
        if (ceremonyState?.status === 'running' || ceremonyState?.status === 'cost-limit-pending' || ceremonyState?.status === 'awaiting-selection') {
          if (ceremonyState.runningType === 'sprint-planning') {
            if (ceremonyState.status === 'awaiting-selection') {
              setSprintPlanningStatus('awaiting-selection');
              setSprintPlanningDecomposedHierarchy(ceremonyState.decomposedHierarchy || null);
              setSprintPlanningStep(3);
            } else {
              setSprintPlanningStatus('running');
            }
            if (ceremonyState.processId) setSprintPlanningProcessId(ceremonyState.processId);
            if (ceremonyState.progress?.length) setSprintPlanningProgressLog(ceremonyState.progress);
          } else if (ceremonyState.runningType === 'sponsor-call') {
            setCeremonyStatus('running');
            if (ceremonyState.processId) setCeremonyProcessId(ceremonyState.processId);
            if (ceremonyState.progress?.length) setCeremonyProgressLog(ceremonyState.progress);
          }
          if (ceremonyState.status === 'cost-limit-pending' && ceremonyState.costLimitInfo) {
            setCostLimitPending({ ...ceremonyState.costLimitInfo, runningType: ceremonyState.runningType });
          }
        }

        setProjectFilesLoaded(true);

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

  // Poll cost summary every 60 seconds
  useEffect(() => {
    getCostSummary().then(setCostSummary).catch(() => { });
    const id = setInterval(() => getCostSummary().then(setCostSummary).catch(() => { }), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // ── Settings modal ─────────────────────────────────────────────────────────

  const openSettings = async () => {
    try {
      const [data, modelList] = await Promise.all([getSettings(), getModels()]);
      setSettingsSnapshot(data);
      setModelsSnapshot(modelList);
      setSettingsOpen(true);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSettingsSaved = async () => {
    try {
      const data = await getSettings();
      setSettingsSnapshot(data);
      const title = await getBoardTitle();
      setBoardTitle(title);
    } catch (err) {
      console.error('Failed to refresh settings:', err);
    }
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
              {/* Real-time updates status */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${wsStatus === 'connected'
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

              {/* Cost chip */}
              {costSummary != null && (
                <button
                  onClick={() => setCostModalOpen(true)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-0.5 hover:border-slate-300 transition-colors"
                  title="LLM cost this month — click for details"
                >
                  <DollarSign className="w-3 h-3" />
                  {costSummary.totalCost < 0.01 && costSummary.totalCost > 0
                    ? '< 0.01'
                    : costSummary.totalCost.toFixed(2)}
                  <span className="text-slate-400">/mo</span>
                </button>
              )}

              {/* Settings button */}
              <button
                onClick={openSettings}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                title="Project settings"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>

              {/* Documentation link */}
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                title="Open project documentation"
              >
                <BookOpen className="w-4 h-4" />
                Project Documentation
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Toolbar */}
      <FilterToolbar />

      {/* Process Monitor Bar */}
      <ProcessMonitorBar />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full px-4 sm:px-6 lg:px-8 py-6">
          <KanbanBoard
            onCardClick={handleCardClick}
            projectFilesReady={projectFilesStatus.docExists}
            onStartProject={
              projectFilesLoaded &&
                !projectFilesStatus.docExists && ceremonyStatus !== 'running'
                ? () => { resetWizard(); openWizard(); }
                : undefined
            }
            onEditProjectDoc={() => setEditingProjectFile('doc')}
            onStartSprintPlanning={
              projectFilesLoaded &&
                projectFilesStatus.docExists &&
                sprintPlanningStatus !== 'running' &&
                sprintPlanningStatus !== 'awaiting-selection' &&
                ceremonyStatus !== 'running'
                ? openSprintPlanning
                : undefined
            }
            onOpenSprintPlanningSelection={
              sprintPlanningStatus === 'awaiting-selection' ? reopenSprintPlanning : undefined
            }
            sponsorCallRunning={ceremonyStatus === 'running'}
          />
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
          Agile Vibe Coding
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
        refineProgress={refineProgress}
        refineResult={refineResult}
        refineError={refineError}
        onClearRefine={() => { setRefineResult(null); setRefineError(null); setRefineProgress(null); }}
      />

      {/* Sponsor Call Ceremony Modal */}
      {ceremonyOpen && (
        <SponsorCallModal
          onOpenSettings={openSettings}
          costLimitPending={costLimitPending?.runningType === 'sponsor-call' ? costLimitPending : null}
          onContinuePastCostLimit={async () => { try { await continuePastCostLimit(); setCostLimitPending(null); } catch (_) {} }}
          onCancelFromCostLimit={async () => { try { await cancelCeremony(); setCostLimitPending(null); } catch (_) {} }}
        />
      )}

      {/* Sprint Planning Ceremony Modal */}
      {sprintPlanningOpen && (
        <SprintPlanningModal
          onClose={closeSprintPlanning}
          costLimitPending={costLimitPending?.runningType === 'sprint-planning' ? costLimitPending : null}
          onContinuePastCostLimit={async () => { try { await continuePastCostLimit(); setCostLimitPending(null); } catch (_) {} }}
          onCancelFromCostLimit={async () => { try { await cancelCeremony(); setCostLimitPending(null); } catch (_) {} }}
        />
      )}

      {/* Epic/Story Selection Popup — shown independently when decomposition completes */}
      <EpicStorySelectionModal />

      {/* Settings Modal */}
      {settingsOpen && settingsSnapshot && (
        <SettingsModal
          settings={settingsSnapshot}
          models={modelsSnapshot}
          onClose={() => setSettingsOpen(false)}
          onSaved={handleSettingsSaved}
        />
      )}

      {/* Cost Modal */}
      {costModalOpen && <CostModal onClose={() => setCostModalOpen(false)} />}

      {/* Project File Editor Popup */}
      {editingProjectFile && (
        <ProjectFileEditorPopup
          fileType={editingProjectFile}
          onClose={() => setEditingProjectFile(null)}
        />
      )}
    </div>
  );
}

export default App;
