import { WebSocketServer } from 'ws';

/**
 * Setup WebSocket server for real-time updates
 * @param {http.Server} server - HTTP server instance
 * @param {object} dataStore - Data store with work items
 * @returns {WebSocketServer}
 */
export function setupWebSocket(server, dataStore, processRegistry = null, ceremonyService = null) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const clients = new Set();

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    // Send initial data
    ws.send(
      JSON.stringify({
        type: 'init',
        data: {
          message: 'Connected to AVC Kanban Board',
          timestamp: Date.now(),
        },
      })
    );

    // Send current process list so the client is immediately in sync
    if (processRegistry) {
      ws.send(JSON.stringify({ type: 'process:list', processes: processRegistry.list() }));
    }

    // Send current ceremony status so the client restores running state on reconnect
    if (ceremonyService) {
      const ceremonyStatus = ceremonyService.getStatus();
      if (ceremonyStatus.status === 'running') {
        ws.send(JSON.stringify({ type: 'ceremony:sync', ceremonyStatus }));
      }
    }

    // Handle client messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('WebSocket message received:', data);

        // Handle different message types
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  /**
   * Broadcast message to all connected clients
   * @param {object} message - Message to broadcast
   */
  function broadcast(message) {
    const payload = JSON.stringify(message);

    clients.forEach((client) => {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(payload);
      }
    });
  }

  /**
   * Broadcast work item update
   * @param {string} action - 'added' | 'changed' | 'deleted'
   * @param {string} workItemId - Work item ID
   */
  function broadcastWorkItemUpdate(action, workItemId) {
    const { items } = dataStore.getHierarchy();
    const item = items.get(workItemId);

    broadcast({
      type: 'work-item-update',
      action,
      data: {
        id: workItemId,
        item: item ? cleanWorkItemForBroadcast(item) : null,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Broadcast full refresh (when major changes occur)
   */
  function broadcastRefresh() {
    broadcast({
      type: 'refresh',
      data: {
        message: 'Work items updated, please refresh',
        timestamp: Date.now(),
      },
    });
  }

  function broadcastCeremonyProgress(message) {
    broadcast({ type: 'ceremony:progress', message });
  }

  function broadcastCeremonySubstep(substep, meta = {}) {
    broadcast({ type: 'ceremony:substep', substep, meta });
  }

  function broadcastCeremonyComplete(result) {
    broadcast({ type: 'ceremony:complete', result });
  }

  function broadcastCeremonyError(error) {
    broadcast({ type: 'ceremony:error', error });
  }

  function broadcastSprintPlanningProgress(message) {
    broadcast({ type: 'sprint-planning:progress', message });
  }

  function broadcastSprintPlanningSubstep(substep, meta) {
    broadcast({ type: 'sprint-planning:substep', substep, meta });
  }

  function broadcastSprintPlanningComplete(result) {
    broadcast({ type: 'sprint-planning:complete', result });
  }

  function broadcastSprintPlanningError(error) {
    broadcast({ type: 'sprint-planning:error', error });
  }

  function broadcastMissionProgress(step, message) {
    broadcast({ type: 'mission:progress', step, message });
  }

  function broadcastCostUpdate() {
    broadcast({ type: 'cost:update' });
  }

  function broadcastSprintPlanningPaused() {
    broadcast({ type: 'sprint-planning:paused' });
  }

  function broadcastSprintPlanningResumed() {
    broadcast({ type: 'sprint-planning:resumed' });
  }

  function broadcastSprintPlanningCancelled() {
    broadcast({ type: 'sprint-planning:cancelled' });
  }

  function broadcastSprintPlanningDetail(detail) {
    broadcast({ type: 'sprint-planning:detail', detail });
  }

  function broadcastCeremonyDetail(detail) {
    broadcast({ type: 'ceremony:detail', detail });
  }

  function broadcastCeremonyPaused() {
    broadcast({ type: 'ceremony:paused' });
  }

  function broadcastCeremonyResumed() {
    broadcast({ type: 'ceremony:resumed' });
  }

  function broadcastCeremonyCancelled() {
    broadcast({ type: 'ceremony:cancelled' });
  }

  function broadcastProcessStarted(record) {
    broadcast({
      type: 'process:started',
      processId: record.id,
      processType: record.type,
      label: record.label,
      startedAt: record.startedAt,
    });
  }

  function broadcastProcessStatus(processId, status, extra = {}) {
    broadcast({ type: 'process:status', processId, status, ...extra });
  }

  return {
    wss,
    broadcast,
    broadcastWorkItemUpdate,
    broadcastRefresh,
    broadcastCeremonyProgress,
    broadcastCeremonySubstep,
    broadcastCeremonyComplete,
    broadcastCeremonyError,
    broadcastCeremonyPaused,
    broadcastCeremonyResumed,
    broadcastCeremonyCancelled,
    broadcastSprintPlanningProgress,
    broadcastSprintPlanningSubstep,
    broadcastSprintPlanningDetail,
    broadcastSprintPlanningComplete,
    broadcastSprintPlanningError,
    broadcastSprintPlanningPaused,
    broadcastSprintPlanningResumed,
    broadcastSprintPlanningCancelled,
    broadcastCeremonyDetail,
    broadcastMissionProgress,
    broadcastCostUpdate,
    broadcastProcessStarted,
    broadcastProcessStatus,
    getClientCount: () => clients.size,
  };
}

/**
 * Clean work item for broadcast (remove circular references)
 * @param {object} item - Work item
 * @returns {object} Cleaned work item
 */
function cleanWorkItemForBroadcast(item) {
  return {
    id: item.id,
    name: item.name,
    type: item._type,
    status: item.status,
    parentId: item._parentId,
    childrenIds: item._children ? item._children.map((c) => c.id) : [],
  };
}
