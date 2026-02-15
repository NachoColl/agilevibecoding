import { WebSocketServer } from 'ws';

/**
 * Setup WebSocket server for real-time updates
 * @param {http.Server} server - HTTP server instance
 * @param {object} dataStore - Data store with work items
 * @returns {WebSocketServer}
 */
export function setupWebSocket(server, dataStore) {
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

  return {
    wss,
    broadcast,
    broadcastWorkItemUpdate,
    broadcastRefresh,
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
