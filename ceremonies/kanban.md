# Kanban Board

Visual project management interface for AVC work items.

## Overview

The AVC Kanban Board provides an interactive web interface for visualizing and managing your project's work items (Epics, Stories, Tasks, Subtasks). It transforms your hierarchical file-based work items into a visual workflow board with real-time updates.

**Command:** `/kanban` or `/k`

**Type:** Visualization Tool (not a ceremony)

**Requirements:**
- Initialized AVC project (`/init`)
- At least one work item (Epic, Story, Task, or Subtask)

**Does not require API keys**

## Key Features

### 🎯 Visual Workflow Management

**5 Workflow Columns:**
- **Backlog**: Planned and Pending work
- **Ready**: Work ready to start
- **In Progress**: Active development (Implementing, Feedback)
- **Review**: Testing and validation phase
- **Done**: Completed work

**Status Mapping:**
The board intelligently maps AVC's 9 statuses to 5 logical workflow stages:
- `planned`, `pending` → Backlog
- `ready` → Ready
- `implementing`, `feedback` → In Progress
- `implemented`, `testing` → Review
- `completed` → Done

### 🔍 Powerful Filtering

**Type Filters:**
- Toggle visibility of Epics (🏛️)
- Toggle visibility of Stories (📖)
- Toggle visibility of Tasks (⚙️)
- Toggle visibility of Subtasks (📝)
- Select/Deselect All button

**Column Visibility:**
- Show/hide individual columns
- Quick presets:
  - "All" - Show all columns
  - "Active Work" - Show Ready, In Progress, Review
  - "Hide Done" - Hide completed items

**Search:**
- Full-text search across:
  - Work item names
  - Work item IDs
  - Descriptions
  - Epic names
- 300ms debounced for performance
- Clear button (X) to reset

**Filter Persistence:**
All filter preferences are automatically saved to browser localStorage and restored on next visit.

### 📊 Grouping Modes

**By Status (Default):**
Traditional kanban board with 5 columns. Items flow left-to-right through the workflow.

```
┌─────────┐  ┌──────┐  ┌────────────┐  ┌────────┐  ┌──────┐
│ Backlog │  │ Ready│  │ In Progress│  │ Review │  │ Done │
├─────────┤  ├──────┤  ├────────────┤  ├────────┤  ├──────┤
│ STORY-1 │  │TASK-2│  │  EPIC-1    │  │STORY-3 │  │TASK-4│
│ TASK-5  │  │      │  │  TASK-6    │  │        │  │      │
└─────────┘  └──────┘  └────────────┘  └────────┘  └──────┘
```

**By Epic:**
Hierarchical view grouping work items under their parent Epic. Each epic shows:
- Epic header with name, ID, and status badge
- Progress bar (completed / total items)
- Collapsible sections (click chevron to expand/collapse)
- Work items grouped by status columns within each epic

```
🏛️ Epic 1: User Authentication                [===75%===] 3/4 completed
  ┌──────┐  ┌────────────┐  ┌────────┐  ┌──────┐
  │ Ready│  │ In Progress│  │ Review │  │ Done │
  ├──────┤  ├────────────┤  ├────────┤  ├──────┤
  │      │  │  STORY-1   │  │        │  │TASK-2│
  │      │  │            │  │        │  │TASK-3│
  │      │  │            │  │        │  │TASK-4│
  └──────┘  └────────────┘  └────────┘  └──────┘

🏛️ Epic 2: Data Management                    [==50%===] 1/2 completed
  ...
```

**By Type:**
Separate sections for each work item type (Epics, Stories, Tasks, Subtasks). Useful for focusing on specific types of work or reviewing type-specific progress.

```
🏛️ Epics
  ┌─────────┐  ┌──────┐  ┌────────────┐
  │ Backlog │  │ Ready│  │ In Progress│
  ├─────────┤  ├──────┤  ├────────────┤
  │ EPIC-2  │  │      │  │  EPIC-1    │
  └─────────┘  └──────┘  └────────────┘

📖 Stories
  ┌─────────┐  ┌──────┐  ┌────────────┐
  │ Backlog │  │ Ready│  │ In Progress│
  ├─────────┤  ├──────┤  ├────────────┤
  │STORY-3  │  │STORY-1│ │  STORY-2   │
  └─────────┘  └──────┘  └────────────┘
```

### 📱 Interactive Card Details

Click any card to open a detailed modal with tabbed navigation:

**Overview Tab:**
- Work item name and ID
- Type badge (Epic, Story, Task, Subtask)
- Status badge with color coding
- Epic association (if applicable)
- Description (markdown rendered)
- Children count with type breakdown

**Context Tab:**
- Inherited context from parent work items
- Full markdown rendering with syntax highlighting
- Typography styling for readability
- Empty state if no context defined

**Documentation Tab:**
- Work item's `doc.md` content
- Full markdown rendering
- Empty state with helpful message if no documentation

**Children Tab:**
- List of child work items with status indicators
- Color-coded status badges
- Quick overview of work item hierarchy
- Empty state if no children

**Modal Controls:**
- **Escape key**: Close modal
- **Arrow Left**: Navigate to previous card
- **Arrow Right**: Navigate to next card
- **Click outside**: Close modal

### ⚡ Real-time Updates

The board automatically updates when work item files change on disk:

1. **File Watcher**: Chokidar monitors `.avc/project/` directory
2. **WebSocket**: Server pushes updates to connected clients
3. **Auto-refresh**: Board reloads work items without page refresh
4. **Connection Management**: Automatic reconnection on disconnect (max 5 attempts)

**What triggers updates:**
- Creating new work items
- Editing work item metadata (status, name, description)
- Moving work items between directories
- Deleting work items

### 🎨 Beautiful Animations

Powered by Framer Motion for smooth, professional interactions:

**Card Animations:**
- Entrance: Fade in + slide up (staggered by index)
- Hover: Slight elevation + scale (1.02x)
- Tap: Scale down (0.98x)
- Exit: Fade out + slide left/right

**Grouping Transitions:**
- Smooth cross-fade when switching between grouping modes
- Staggered entrance for sections
- Collapse/expand animations for epic sections

**Loading States:**
- Skeleton screens while data loads
- Spinning loader for initial load
- Shimmer effect on skeleton elements

## Usage Guide

### Starting the Server

```sh
> /kanban
```

Output:
```
📊 Starting Kanban Board server...
   Backend: http://localhost:4174
   Frontend: http://localhost:5173

✓ Server started successfully!
   Open http://localhost:5173 in your browser

   View process output: /processes
```

The server runs in the background, allowing you to continue using the REPL.

### Basic Workflow

1. **Open Browser**: Navigate to http://localhost:5173
2. **View Board**: See all work items grouped by status
3. **Filter Items**: Use type filters to focus on specific work item types
4. **Search**: Use search bar to find specific items
5. **View Details**: Click cards to see full information
6. **Change Grouping**: Switch between Status/Epic/Type views
7. **Monitor Changes**: Board auto-updates as you modify work items

### Filtering Strategies

**Focus on Active Work:**
1. Click "Hide Done" preset in column visibility
2. Shows only Backlog, Ready, In Progress, Review

**Review Epic Progress:**
1. Switch to "By Epic" grouping
2. See progress bars for each epic
3. Collapse completed epics to focus on active work

**Type-Specific View:**
1. Switch to "By Type" grouping
2. Deselect all types except one (e.g., Stories)
3. Focus on single type across all statuses

**Find Specific Item:**
1. Use search bar (top right)
2. Type work item ID, name, or description keywords
3. Results filter in real-time

### Managing the Server

**View Process Status:**
```sh
> /processes
```

Shows:
- Process name: "Kanban Server"
- Status: Running/Stopped
- Port: 4174
- Uptime
- Output log

**Stop Server:**
1. Open `/processes` viewer
2. Select "Kanban Server"
3. Press 's' key
4. Confirm shutdown

**Restart Server:**
```sh
> /kanban
```

Automatically detects running server and restarts it.

## Configuration

### Server Ports

Edit `.avc/avc.json`:

```json
{
  "settings": {
    "kanban": {
      "port": 4174
    }
  }
}
```

**Default ports:**
- Backend API/WebSocket: 4174 (configurable)
- Frontend UI: 5173 (hardcoded in Vite config)

To change frontend port, edit `src/kanban/client/vite.config.js`:

```javascript
export default defineConfig({
  server: {
    port: 5173, // Change this
    proxy: {
      '/api': { target: 'http://localhost:4174' },
      '/ws': { target: 'ws://localhost:4174', ws: true }
    }
  }
});
```

### Filter Persistence

Filter preferences are stored in browser localStorage:

**Key:** `avc-kanban-filters`

**Data:**
```json
{
  "state": {
    "typeFilters": { "epic": true, "story": true, "task": true, "subtask": true },
    "columnVisibility": { "Backlog": true, "Ready": true, "In Progress": true, "Review": true, "Done": true },
    "searchQuery": "",
    "groupBy": "status"
  },
  "version": 0
}
```

**Clear filters:**
- Click "Reset" button in toolbar, or
- Clear browser localStorage for localhost:5173

## API Reference

The kanban server exposes REST and WebSocket APIs:

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
Query params: `?type=epic&status=ready`
```json
[
  {
    "id": "EPIC-001",
    "type": "epic",
    "name": "User Authentication",
    "status": "implementing",
    "description": "...",
    "epicId": null,
    "epicName": null,
    "parentId": null,
    "children": ["STORY-001", "STORY-002"]
  }
]
```

**GET /api/work-items/grouped**
Query params: `?groupBy=status|epic|type`

**GET /api/work-items/:id**
Returns single work item with full details.

**GET /api/work-items/:id/doc**
Returns work item's `doc.md` content as plain text.

**GET /api/work-items/:id/context**
Returns aggregated context from parent hierarchy as plain text.

### WebSocket

**Connection:** `ws://localhost:4174/ws`

**Server → Client Events:**
```json
{ "type": "update", "data": "Work items changed" }
{ "type": "ping" }
```

**Client → Server:**
```json
{ "type": "pong" }
```

Heartbeat: 30s ping/pong to keep connection alive.

## Keyboard Shortcuts

**Global:**
- `/` + Enter - Open command selector (in REPL)
- Ctrl+R - Restart REPL

**Kanban Board (in browser):**
- Arrow Keys - Navigate between cards in modal
- Escape - Close modal
- ↑/↓ - Navigate architecture/provider selectors

**Filter Toolbar:**
- Type to search (auto-debounced)
- Click to toggle filters
- Hover to see dropdown menus

## Troubleshooting

### No Work Items Displayed

**Problem:** Board shows "No Work Items" message

**Solutions:**
1. **Create work items:**
   - Run `/sponsor-call` to create epics
   - Use sprint planning to create stories/tasks
   - Manually create in `.avc/project/` directories

2. **Check file structure:**
   ```sh
   ls -R .avc/project/
   ```
   Should see `epic/`, `story/`, `task/`, `subtask/` directories with `item.json` files.

3. **Verify item.json format:**
   ```json
   {
     "id": "EPIC-001",
     "type": "epic",
     "name": "Epic Name",
     "status": "implementing",
     "description": "Description here"
   }
   ```

### Connection Issues

**Problem:** "Cannot connect to server" or WebSocket errors

**Solutions:**
1. **Check server status:**
   ```sh
   > /processes
   ```
   Verify "Kanban Server" is running.

2. **Check port availability:**
   ```sh
   lsof -i :4174
   lsof -i :5173
   ```

3. **Restart server:**
   ```sh
   > /kanban
   ```

4. **Check browser console:**
   Open DevTools (F12) → Console tab
   Look for connection errors or CORS issues

### Real-time Updates Not Working

**Problem:** Changes to work items don't appear in board

**Solutions:**
1. **Check WebSocket connection:**
   - Browser DevTools → Network tab → WS filter
   - Should see `ws://localhost:4174/ws` with status 101

2. **Manual refresh:**
   - Click refresh button (🔄) in toolbar
   - Or reload page (Ctrl+R)

3. **Restart server:**
   - Stop via `/processes`
   - Start again with `/kanban`

### Port Conflicts

**Problem:** "Port already in use" error

**Solutions:**
1. **Find process using port:**
   ```sh
   lsof -i :4174
   ```

2. **Kill process:**
   ```sh
   kill -9 <PID>
   ```

3. **Change port:**
   Edit `.avc/avc.json`:
   ```json
   {
     "settings": {
       "kanban": {
         "port": 5174
       }
     }
   }
   ```

4. **Update proxy:**
   Edit `src/kanban/client/vite.config.js` to match new backend port.

### Filter Not Working

**Problem:** Filters don't seem to apply

**Solutions:**
1. **Clear filters:**
   - Click "Reset" button in toolbar
   - Clears all filters and search

2. **Check "All" selected:**
   - If all type filters are off, nothing shows
   - Click "Select All" button

3. **Clear localStorage:**
   - Browser DevTools → Application → Local Storage
   - Delete `avc-kanban-filters` key
   - Reload page

### Performance Issues

**Problem:** Board is slow or laggy

**Solutions:**
1. **Reduce visible items:**
   - Use filters to show fewer items
   - Hide completed work ("Hide Done" preset)
   - Use search to narrow results

2. **Disable animations:**
   - Edit `tailwind.config.js`:
     ```javascript
     prefers-reduced-motion: 'reduce'
     ```

3. **Clear browser cache:**
   - Hard reload: Ctrl+Shift+R
   - Clear site data in DevTools

## Advanced Usage

### Custom Styling

The kanban board uses Tailwind CSS. To customize:

1. **Edit theme:**
   `src/kanban/client/tailwind.config.js`

2. **Add custom CSS:**
   `src/kanban/client/src/index.css`

3. **Rebuild:**
   ```sh
   cd src/kanban/client
   npm run build
   ```

### Development Mode

To work on kanban board code:

```sh
cd src/kanban/client
npm install
npm run dev
```

Frontend runs on Vite dev server with hot reload.

```sh
cd src/kanban/server
node start.js
```

Backend runs on Express with file watching.

### Testing

**Run unit tests:**
```sh
cd src/kanban/client
npm test
```

**Run with coverage:**
```sh
npm run test:coverage
```

**Test files:**
- `src/lib/__tests__/status-grouping.test.js` - Status mapping logic
- `src/lib/__tests__/api.test.js` - API client functions
- `src/store/__tests__/kanbanStore.test.js` - Zustand store
- `src/hooks/__tests__/useGrouping.test.js` - Grouping hook

## Best Practices

### Effective Board Usage

1. **Start with Status View:**
   - Understand overall workflow
   - Identify bottlenecks (columns with too many items)

2. **Use Epic View for Planning:**
   - Review epic progress
   - Ensure work is distributed across epics

3. **Use Type View for Focused Work:**
   - Focus on stories during development
   - Review tasks for sprint planning
   - Check subtasks for granular work

4. **Leverage Search:**
   - Find items by ID quickly
   - Search descriptions for keywords
   - Filter by epic name

5. **Monitor Column Visibility:**
   - Hide done items during active work
   - Show all for retrospectives
   - Focus on Ready/In Progress during sprints

### Performance Tips

1. **Filter aggressively** - Show only what you're working on
2. **Close modals** when not in use (Escape key)
3. **Use search** instead of scrolling through long lists
4. **Collapse epic sections** you're not actively working on
5. **Hide completed columns** unless reviewing past work

### Workflow Integration

1. **Daily Standup:**
   - Group by Epic
   - Filter to In Progress + Review
   - Review blockers and progress

2. **Sprint Planning:**
   - Group by Type
   - Filter to Stories + Tasks
   - Move items to Ready column

3. **Retrospective:**
   - Show all columns
   - Review completed work
   - Analyze workflow bottlenecks

4. **Epic Review:**
   - Group by Epic
   - Check progress bars
   - Identify epics needing attention

## Related Commands

- `/init` - Initialize AVC project (required before `/kanban`)
- `/sponsor-call` - Create initial epics
- `/processes` - View and manage background processes
- `/status` - View project status (alternative to kanban board)

## Additional Resources

- **COMMANDS.md** - Full CLI command reference
- **README.md** - AVC overview and installation
- **CONTRIBUTING.md** - Development guidelines

---

**Next:** After visualizing your work items, use `/status` to see detailed project metrics, or continue working on ceremonies to create more work items.
