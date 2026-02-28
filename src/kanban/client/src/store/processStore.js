import { create } from 'zustand';

/**
 * ProcessStore
 * Tracks lightweight process DTOs for the ProcessMonitorBar chip row.
 * Full ceremony logs live in sprintPlanningStore / ceremonyStore (accumulated via WS events).
 */
export const useProcessStore = create((set, get) => ({
  processes: [], // { id, type, label, status, startedAt, endedAt }

  /**
   * Called from App.jsx WebSocket message handler for process:* events.
   */
  handleProcessMessage: (message) => {
    const { processes } = get();

    switch (message.type) {
      case 'process:list':
        set({ processes: message.processes });
        break;

      case 'process:started':
        // Avoid duplicates on reconnect
        if (processes.find(p => p.id === message.processId)) break;
        set({
          processes: [...processes, {
            id: message.processId,
            type: message.processType,
            label: message.label,
            status: 'running',
            startedAt: message.startedAt,
            endedAt: null,
          }],
        });
        break;

      case 'process:status': {
        const updated = processes.map(p =>
          p.id === message.processId
            ? { ...p, status: message.status, endedAt: message.endedAt ?? p.endedAt }
            : p
        );
        set({ processes: updated });
        // Auto-remove cancelled processes after a brief moment so the chip disappears
        // rather than staying permanently grayed out (user must manually clear others).
        if (message.status === 'cancelled') {
          setTimeout(() => {
            set(s => ({ processes: s.processes.filter(p => p.id !== message.processId) }));
          }, 1000);
        }
        break;
      }
    }
  },

  /** Remove finished (complete/error/cancelled) records both locally and on server. */
  clearCompleted: async () => {
    try { await fetch('/api/processes', { method: 'DELETE' }); } catch (_) {}
    set(s => ({
      processes: s.processes.filter(p =>
        !['complete', 'error', 'cancelled'].includes(p.status)
      ),
    }));
  },
}));
