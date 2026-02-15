# AVC Kanban Board

Visual kanban board for managing AVC project work items.

## Overview

The AVC Kanban Board is a full-stack web application that provides an interactive visual interface for managing work items in an Agile Vibe Coding project. It consists of:

- **Backend Server** (`server/`) - Express.js API with WebSocket support
- **Frontend Client** (`client/`) - React SPA with real-time updates

## Features

### Core Functionality

- **Visual Workflow**: 5-column kanban board (Backlog → Ready → In Progress → Review → Done)
- **Work Item Management**: View and filter Epics, Stories, Tasks, Subtasks
- **Real-time Updates**: WebSocket synchronization when work items change
- **Advanced Grouping**: View by Status, Epic, or Type
- **Interactive Details**: Click cards for full work item information
- **Powerful Filtering**: Type filters, column visibility, full-text search
- **Beautiful Animations**: Framer Motion-powered transitions and interactions

### Technical Features

- **File Watching**: Chokidar monitors `.avc/project/` for changes
- **WebSocket**: Real-time bidirectional communication
- **State Management**: Zustand with localStorage persistence
- **Responsive UI**: Tailwind CSS with mobile-friendly design
- **Markdown Rendering**: Full support for documentation and context
- **Keyboard Navigation**: Arrow keys, Escape, and shortcuts

## Architecture

```
kanban/
├── server/              # Backend Express.js application
│   ├── start.js         # Server entry point
│   ├── api.js           # REST API routes
│   ├── work-items.js    # Work item data layer
│   └── README.md        # Server documentation
├── client/              # Frontend React application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utility functions
│   │   ├── store/       # Zustand state management
│   │   └── main.jsx     # React entry point
│   ├── public/          # Static assets
│   ├── vite.config.js   # Vite configuration
│   └── README.md        # Client documentation
└── README.md            # This file
```

## Usage

### Starting the Server

From the AVC CLI:

```sh
> /kanban
```

This starts both backend and frontend servers:
- Backend API/WebSocket: http://localhost:4174
- Frontend UI: http://localhost:5173

### Development

**Backend (server):**

```sh
cd server
node start.js
```

**Frontend (client):**

```sh
cd client
npm install
npm run dev
```

The Vite dev server proxies API requests to the backend.

## Configuration

Edit `.avc/avc.json` in your AVC project:

```json
{
  "settings": {
    "kanban": {
      "port": 4174
    }
  }
}
```

**Ports:**
- `port` - Backend server port (default: 4174)
- Frontend port is hardcoded to 5173 in `client/vite.config.js`

## API Reference

### REST Endpoints

**GET /api/health**
```json
{ "status": "ok", "uptime": 12345, "port": 4174 }
```

**GET /api/stats**
```json
{
  "totalItems": 42,
  "byStatus": { "planned": 5, "ready": 3, ... },
  "byType": { "epic": 2, "story": 15, ... }
}
```

**GET /api/work-items**
Returns array of work items. Optional query params: `type`, `status`

**GET /api/work-items/grouped**
Returns grouped work items. Query param: `groupBy` (status|epic|type)

**GET /api/work-items/:id**
Returns single work item with full details.

**GET /api/work-items/:id/doc**
Returns work item documentation (doc.md) as plain text.

**GET /api/work-items/:id/context**
Returns aggregated context from parent hierarchy as plain text.

### WebSocket

**Connection:** `ws://localhost:4174/ws`

**Events:**
- Server → Client: `{ "type": "update", "data": "..." }`
- Server → Client: `{ "type": "ping" }`
- Client → Server: `{ "type": "pong" }`

Heartbeat interval: 30 seconds

## Status Mapping

AVC's 9 statuses are mapped to 5 kanban columns:

| AVC Status | Kanban Column |
|------------|---------------|
| `planned` | Backlog |
| `pending` | Backlog |
| `ready` | Ready |
| `implementing` | In Progress |
| `feedback` | In Progress |
| `implemented` | Review |
| `testing` | Review |
| `completed` | Done |

## Testing

**Client tests:**

```sh
cd client
npm test
npm run test:coverage
```

**Test files:**
- `src/lib/__tests__/status-grouping.test.js` - Status mapping logic
- `src/lib/__tests__/api.test.js` - API client
- `src/store/__tests__/kanbanStore.test.js` - Zustand store
- `src/hooks/__tests__/useGrouping.test.js` - Grouping hook

**Server tests:**

Currently no unit tests for server. Integration testing via manual QA.

## Dependencies

### Backend

- `express` - Web framework
- `cors` - CORS middleware
- `chokidar` - File watching
- `ws` - WebSocket server
- `marked` - Markdown parser (for future features)

### Frontend

- `react` ^18.3.1 - UI framework
- `react-dom` ^18.3.1 - React DOM bindings
- `vite` ^6.0.5 - Build tool
- `zustand` ^5.0.2 - State management
- `framer-motion` ^11.15.0 - Animations
- `lucide-react` ^0.468.0 - Icons
- `react-markdown` ^9.0.1 - Markdown rendering
- `tailwindcss` ^3.4.17 - CSS framework
- `@tailwindcss/typography` ^0.5.19 - Markdown styling
- `vitest` ^2.1.9 - Testing framework
- `@testing-library/react` ^16.1.0 - React testing utilities

## Development Workflow

### Adding New Features

1. **Backend (API):**
   - Add route to `server/api.js`
   - Add data layer logic to `server/work-items.js`
   - Test endpoint manually

2. **Frontend (UI):**
   - Add component to `client/src/components/`
   - Add hook if needed to `client/src/hooks/`
   - Update store if state changes needed
   - Write tests in `__tests__/` directories

### Building for Production

**Client:**

```sh
cd client
npm run build
```

Outputs to `client/dist/` (gitignored).

**Server:**

No build step needed. Node.js runs directly.

### Debugging

**Backend:**

```sh
DEBUG=* node server/start.js
```

**Frontend:**

Open browser DevTools:
- Console - JavaScript errors and logs
- Network - API and WebSocket traffic
- React DevTools - Component hierarchy and state

## Integration with AVC CLI

The kanban server is integrated into the AVC CLI via:

1. **Command Handler** (`src/cli/repl-ink.js:runKanban`)
   - Checks for work items
   - Handles port conflicts
   - Spawns background process
   - Displays server URLs

2. **Server Manager** (`src/cli/kanban-server-manager.js`)
   - Port availability checking
   - Process identification (PID lookup)
   - Graceful shutdown

3. **Background Process** (`src/cli/process-manager.js`)
   - Lifecycle management
   - Output capture
   - Event emission
   - Auto-cleanup

## Troubleshooting

### Server won't start

**Check port availability:**
```sh
lsof -i :4174
lsof -i :5173
```

**Kill conflicting process:**
```sh
kill -9 <PID>
```

**Change port:**
Edit `.avc/avc.json` and `client/vite.config.js`

### No work items displayed

**Verify work items exist:**
```sh
ls -R .avc/project/
```

Should see `epic/`, `story/`, `task/`, `subtask/` directories.

**Check item.json format:**
```json
{
  "id": "EPIC-001",
  "type": "epic",
  "name": "Epic Name",
  "status": "implementing"
}
```

### WebSocket not connecting

**Check server logs:**
```sh
> /processes
```

Select "Kanban Server" to view output.

**Check browser console:**
F12 → Console tab → Look for WebSocket errors

**Verify health endpoint:**
```sh
curl http://localhost:4174/api/health
```

### Filters not working

**Clear localStorage:**
Browser DevTools → Application → Local Storage → Delete `avc-kanban-filters`

**Reset filters:**
Click "Reset" button in filter toolbar.

## Future Enhancements

Potential features for future versions:

- [ ] Drag & drop to change work item status
- [ ] Inline editing of work item properties
- [ ] Batch operations (bulk status change)
- [ ] Custom column definitions
- [ ] Export to CSV/JSON
- [ ] Performance metrics (cycle time, lead time)
- [ ] Swimlanes for assignees
- [ ] Board snapshots for retrospectives
- [ ] Integration with git branches
- [ ] Mobile app (React Native)

## Contributing

See root `CONTRIBUTING.md` for development guidelines.

### Code Style

- **Backend**: Node.js with ES modules
- **Frontend**: React functional components with hooks
- **CSS**: Tailwind utility classes
- **State**: Zustand for global, React hooks for local
- **Testing**: Vitest with AAA pattern

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] No console errors in browser
- [ ] Markdown files updated
- [ ] No lint warnings
- [ ] Mobile responsive
- [ ] Keyboard accessible

## License

MIT - See root LICENSE file

## Support

- **Documentation**: [ceremonies/kanban.md](../../ceremonies/kanban.md)
- **Commands**: [COMMANDS.md](../../COMMANDS.md)
- **Issues**: https://github.com/anthropics/agilevibecoding/issues

---

**Version:** 0.1.0
**Last Updated:** 2026-02-14
