# AVC Kanban Board - Frontend

Modern React frontend for the AVC Kanban Board.

## Tech Stack

- **React 18** - UI framework with hooks
- **Vite 6** - Build tool and dev server
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **@tailwindcss/typography** - Markdown styling
- **Zustand 5.0** - Lightweight state management with persistence
- **Framer Motion 11.15** - Production-grade animation library
- **Lucide React** - Beautiful icon library (300+ icons)
- **React Markdown 9.0** - Markdown rendering with GFM support
- **Vitest 2.1** - Fast unit testing framework
- **@testing-library/react 16.1** - React testing utilities

## Development

### Start Dev Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

The backend API must be running on `http://localhost:4174`.

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ui/                 # shadcn/ui-inspired components
│   │   ├── dialog.jsx      # Modal dialog with animations
│   │   ├── tabs.jsx        # Tabbed interface
│   │   └── badge.jsx       # Status badges
│   ├── kanban/             # Kanban-specific components
│   │   ├── KanbanBoard.jsx         # Main board container
│   │   ├── KanbanColumn.jsx        # Workflow column
│   │   ├── KanbanCard.jsx          # Work item card
│   │   ├── CardDetailModal.jsx     # Detailed work item view
│   │   ├── FilterToolbar.jsx       # Filtering controls
│   │   ├── GroupingSelector.jsx    # Grouping mode switcher
│   │   └── EpicSection.jsx         # Epic grouping view
│   └── layout/             # Layout components
│       └── LoadingScreen.jsx       # Loading states & skeletons
├── hooks/
│   ├── useWebSocket.js     # WebSocket with auto-reconnect
│   └── useGrouping.js      # Grouping logic (status/epic/type)
│   └── __tests__/          # Hook unit tests
│       └── useGrouping.test.js
├── store/                  # Zustand state management
│   ├── kanbanStore.js      # Work items state
│   ├── filterStore.js      # Filters with localStorage persistence
│   └── __tests__/          # Store unit tests
│       └── kanbanStore.test.js
├── lib/
│   ├── api.js              # API client functions
│   ├── utils.js            # Utility functions (cn, clsx)
│   ├── status-grouping.js  # Status → column mapping
│   └── __tests__/          # Lib unit tests
│       ├── status-grouping.test.js
│       └── api.test.js
├── App.jsx                 # Root component
├── main.jsx                # React entry point
└── index.css               # Global styles and Tailwind imports
```

## API Endpoints

The frontend communicates with the backend API:

- `GET /api/health` - Health check
- `GET /api/stats` - Statistics
- `GET /api/work-items` - All work items
- `GET /api/work-items/grouped` - Grouped by column
- `GET /api/work-items/:id` - Single work item
- `GET /api/work-items/:id/doc` - Documentation (HTML)
- `GET /api/work-items/:id/context` - Context (HTML)
- `WS /ws` - WebSocket for real-time updates

## Real-Time Updates

The frontend connects to the backend WebSocket server for live updates:

- File changes in `.avc/project/` automatically refresh the board
- No manual refresh needed
- Connection status indicator in header

## Implementation Status

**🎉 ALL STEPS COMPLETE**

### ✅ Step 3: Frontend Setup
- Vite + React 18 project initialized
- Tailwind CSS with @tailwindcss/typography
- shadcn/ui-inspired components (Dialog, Tabs, Badge)
- API client with REST endpoints
- WebSocket hook with auto-reconnection

### ✅ Step 4: State Management + UI Components
- Zustand stores (kanbanStore, filterStore)
- localStorage persistence for filters
- KanbanBoard, KanbanColumn, KanbanCard components
- FilterToolbar with type filters, search, column visibility
- Framer Motion animations (entrance, hover, transitions)

### ✅ Step 5: Detail Modal
- CardDetailModal with tabbed navigation
- Overview, Context, Documentation, Children tabs
- Markdown rendering with syntax highlighting
- Keyboard navigation (arrow keys, Escape)
- Fetch full details on modal open

### ✅ Step 6: Grouping + Animations
- useGrouping hook with 3 modes: Status, Epic, Type
- EpicSection component with collapsible sections
- GroupingSelector for mode switching
- Progress bars for epic completion tracking
- Smooth transitions between grouping modes
- LoadingScreen with skeleton states

### ✅ Step 7: Testing + Documentation
- Unit tests for all core modules:
  - status-grouping.test.js (grouping logic)
  - api.test.js (API client)
  - kanbanStore.test.js (Zustand store)
  - useGrouping.test.js (grouping hook)
- Vitest configuration
- COMMANDS.md updated with /kanban documentation
- ceremonies/kanban.md user guide created
- READMEs updated (kanban/, client/)

## Features

### Visual Organization
- 5-column workflow (Backlog → Ready → In Progress → Review → Done)
- 9 AVC statuses mapped to logical columns
- Card-based interface with status badges
- Type icons (🏛️ Epic, 📖 Story, ⚙️ Task, 📝 Subtask)

### Filtering & Search
- Type filters (Epics, Stories, Tasks, Subtasks)
- Column visibility toggles
- Full-text search (300ms debounced)
- Filter presets (All, Active Work, Hide Done)
- localStorage persistence

### Grouping Modes
- **By Status**: Traditional kanban columns
- **By Epic**: Hierarchical sections with progress bars
- **By Type**: Separate sections per work item type

### Real-time Updates
- WebSocket connection to backend
- Auto-refresh when files change
- Connection status indicator
- Automatic reconnection (max 5 attempts)

### Interactive Details
- Click cards to open modal
- 4 tabbed sections (Overview, Context, Docs, Children)
- Markdown rendering with @tailwindcss/typography
- Keyboard navigation between cards
- Smooth animations powered by Framer Motion

## Testing

Run all unit tests:

```bash
npm test
```

Run with coverage:

```bash
npm run test:coverage
```

Watch mode:

```bash
npm run test:watch
```

**Test Coverage:**
- `lib/` - Status grouping, API client
- `store/` - Zustand state management
- `hooks/` - useGrouping hook
- All critical business logic covered
