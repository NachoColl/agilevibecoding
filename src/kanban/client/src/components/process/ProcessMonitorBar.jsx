import { Activity } from 'lucide-react';
import { useProcessStore } from '../../store/processStore';
import { useSprintPlanningStore } from '../../store/sprintPlanningStore';
import { useCeremonyStore } from '../../store/ceremonyStore';

const STATUS_PILL = {
  running:   'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  paused:    'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  complete:  'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  error:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100',
};

const STATUS_DOT = {
  running:   <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />,
  paused:    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />,
  complete:  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />,
  error:     <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />,
  cancelled: <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />,
};

function elapsed(startedAt, endedAt) {
  const ms = (endedAt ?? Date.now()) - startedAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ProcessMonitorBar() {
  const { processes, clearCompleted } = useProcessStore();

  if (processes.length === 0) return null;

  const hasCompleted = processes.some(p =>
    ['complete', 'error', 'cancelled'].includes(p.status)
  );

  const handleChipClick = (p) => {
    if (p.type === 'sprint-planning') {
      useSprintPlanningStore.getState().reopenModal();
    } else if (p.type === 'sponsor-call') {
      useCeremonyStore.getState().reopenWizard();
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
      <Activity className="w-4 h-4 text-slate-400 flex-shrink-0" />

      {processes.map(p => (
        <button
          key={p.id}
          onClick={() => handleChipClick(p)}
          title="Click to view"
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${STATUS_PILL[p.status] ?? STATUS_PILL.cancelled}`}
        >
          {STATUS_DOT[p.status] ?? STATUS_DOT.cancelled}
          <span className="font-medium">{p.label}</span>
          <span className="opacity-60">{elapsed(p.startedAt, p.endedAt)}</span>
        </button>
      ))}

      {hasCompleted && (
        <button
          onClick={clearCompleted}
          className="ml-auto text-xs text-slate-400 hover:text-slate-600 px-2 py-0.5 transition-colors"
        >
          Clear done
        </button>
      )}
    </div>
  );
}
