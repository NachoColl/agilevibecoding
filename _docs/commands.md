# CLI Commands

## /init

Initializes AVC project structure with default configuration.

```sh
> /init
```

### What it does

- Creates `.avc/` folder with project structure
- Generates `avc.json` configuration with optimal defaults
- Creates `.env` template for API keys
- Sets up default models:
  - Claude Sonnet 4.5 for most stages
  - Claude Opus 4.6 for complex decomposition tasks

**This command does not require API keys.**

### After initialization

1. Add your API keys to `.env` file
2. (Optional) Run `/models` to customize LLM model configuration
3. Run `/sponsor-call` to start defining your project

The default configuration is production-ready and works immediately. The command is safe to run multiple times—it preserves your existing configuration and API keys while adding any new settings from CLI updates.

### Output

```
✅ AVC project structure created successfully!

Next steps:
  1. Open .env file and add your API key(s)
     • ANTHROPIC_API_KEY for Claude
     • GEMINI_API_KEY for Gemini
  2. Run /sponsor-call to define your project
```


## /sponsor-call

Creates your project foundation through an AI-assisted questionnaire, generating comprehensive documentation (`doc.md`) and architectural context (`context.md`) that guides all subsequent development work.

**Alias:** `/sc`

**📖 [Full ceremony documentation →](ceremonies/sponsor-call.md)**

```sh
> /sponsor-call
```

### Architecture-Aware Workflow

The sponsor-call ceremony features intelligent architecture recommendation that reduces ceremony time by ~60%:

1. **Answer Initial Questions**
   - **Mission Statement** (mandatory) - What problem are you solving?
   - **Initial Scope** - Key features and capabilities

2. **Architecture Selection** (automatic after scope)
   - AI analyzes your project and recommends 3-5 deployment architectures
   - Interactive selector with keyboard navigation:
     - `↑/↓`: Navigate options
     - `Enter`: Select architecture
     - `Esc`: Skip (continue with manual answers)
   - Examples: "Next.js Full-Stack on Vercel", "AWS Serverless Backend + SPA", "CLI Tool"

3. **Cloud Provider Selection** (conditional)
   - Shown only if architecture requires cloud provider (AWS/Azure/GCP)
   - Select your preferred cloud platform
   - `Esc` to skip and use architecture-agnostic answers

4. **Intelligent Question Pre-filling**
   - AI generates contextual answers for remaining questions:
     - Target Users
     - Deployment Target
     - Technical Considerations
     - Security Requirements
   - Answers are pre-filled based on your architecture selection

5. **Review and Edit**
   - Preview shows all answers with indicators:
     - 🤖 = AI-suggested (can be edited)
     - ✏️ = User-entered
   - Edit any answer before submission
   - All AI suggestions are fully editable

**Benefits:**
- Expert architecture guidance without deep DevOps knowledge
- Ensures consistent, contextually appropriate answers
- Educational - learn recommended approaches for your project type
- Fast iteration while maintaining quality



## /documentation

Build and serve project documentation as a local website.

**Alias**

`/d`

```sh
> /documentation
```

### What it does

Builds your project documentation using VitePress and starts a local preview server. The documentation is served as a static website that you can view in your browser, making it easy to review and share your project's structure and specifications.

The command runs the documentation server as a **background process**, allowing you to continue using the REPL while the server is running.

**This command does not require API keys.**

### Documentation Structure

The `/documentation` command works with files created during project initialization:

**Source Files**

- `.avc/documentation/index.md` - Main documentation page (auto-synced from `.avc/project/doc.md` during Sponsor Call)
- `.avc/documentation/.vitepress/config.mts` - VitePress configuration (site title, theme, navigation)
- `.avc/documentation/public/` - Static assets (images, logos, custom files)

**Generated Files (gitignored):**
- `.avc/documentation/.vitepress/dist/` - Built static site (HTML, CSS, JS)
- `.avc/documentation/.vitepress/cache/` - VitePress build cache

### Server Configuration

The documentation server port is configurable in `.avc/avc.json`:

```json
{
  "settings": {
    "documentation": {
      "port": 4173
    }
  }
}
```

**Default port**

4173 (VitePress preview default)

### Port Conflict Handling

The command intelligently handles port conflicts:

1. **AVC Server Already Running (Managed Process):**
   - Restarts the existing server
   - Shows: `🔄 Documentation server already running, restarting...`

2. **AVC Server Running Externally (Previous Session):**
   - Verifies it's an AVC server (checks for AVC metatag)
   - Automatically kills and restarts
   - Shows: `⚠️ AVC documentation server already running (external process)`

3. **Non-AVC Process Using Port:**
   - Shows process details (PID, command)
   - Asks for confirmation before killing
   - User can cancel and change port in config

### Background Process Management

The documentation server runs as a managed background process:

- **View process status:** Use `/processes` (or `/p`) command
- **Stop server:** Select the process and press 's' to stop
- **Auto-cleanup:** Stopped processes disappear after 3 seconds
- **View logs:** Process output is captured and viewable in process details

### Output

```
📚 Building documentation...
✓ Documentation built successfully

📦 Starting documentation server in background...
   URL: http://localhost:4173
   View process output: /processes
```

### Example Workflow

```sh
# 1. Initialize project and run Sponsor Call
> /init
> /sponsor-call

# 2. Build and serve documentation
> /documentation

# 3. Open browser to http://localhost:4173

# 4. Check process status
> /processes

# 5. Stop server when done
> /processes
# (Select "Documentation Server" and press 's')
```

### Troubleshooting

**Port already in use**

Edit `.avc/avc.json` to change the port:
```json
{
  "settings": {
    "documentation": {
      "port": 5173
    }
  }
}
```

**Documentation not found**

Run `/init` first to create the documentation structure.

**Build fails**

Ensure VitePress dependencies are installed:
```sh
npm install vitepress --save-dev
```

### Integration with Sponsor Call

The Sponsor Call ceremony automatically syncs the generated project definition to `.avc/documentation/index.md`, making it immediately available for documentation viewing:

1. Run `/sponsor-call` → Creates `.avc/project/doc.md`
2. Document is auto-synced to `.avc/documentation/index.md`
3. Run `/documentation` → Builds and serves the documentation
4. View your project definition as a formatted website


## /kanban

Visualize your AVC project work items in an interactive kanban board web interface.

**Alias:** `/k`

**📖 [Full ceremony documentation →](ceremonies/kanban.md)**

```sh
> /kanban
```

### What it does

Launches a full-stack web application that provides a visual kanban board for managing your AVC work items (Epics, Stories, Tasks, Subtasks). The board displays your project's hierarchical work structure with real-time updates as files change.

The command runs as a **background process**, allowing you to continue using the REPL while the kanban board is running.

**This command does not require API keys.**

### Requirements

- Must have work items created in your project (at least one Epic, Story, Task, or Subtask)
- Project must be initialized with `/init`

### Features

**Visual Organization:**
- **5 Workflow Columns**: Backlog, Ready, In Progress, Review, Done
- **9 AVC Statuses Mapped**: Planned/Pending → Backlog, Ready → Ready, Implementing/Feedback → In Progress, Implemented/Testing → Review, Completed → Done
- **Drag & Drop** (future): Move cards between columns
- **Real-time Updates**: WebSocket sync when work item files change

**Filtering & Search:**
- **Type Filters**: Toggle visibility of Epics, Stories, Tasks, Subtasks
- **Column Visibility**: Show/hide specific workflow columns
- **Search**: Full-text search across work item names, IDs, descriptions, and epic names
- **Filter Persistence**: Your filter preferences are saved in browser localStorage

**Grouping Modes:**
- **By Status** (default): Traditional kanban columns
- **By Epic**: Hierarchical view showing epics with their child items grouped by status
- **By Type**: Separate sections for Epics, Stories, Tasks, Subtasks

**Card Details:**
- Click any card to open detailed modal
- **Overview Tab**: Full work item details with status, type, epic association, children count
- **Context Tab**: Inherited context from parent work items (markdown rendered)
- **Documentation Tab**: Work item's doc.md content (markdown rendered)
- **Children Tab**: List of child work items with status indicators
- **Keyboard Navigation**: Arrow keys to navigate between cards, Esc to close

**Animations:**
- Smooth entrance animations for cards and columns
- Hover effects with elevation
- Framer Motion-powered transitions between grouping modes

### Server Configuration

The kanban server port is configurable in `.avc/avc.json`:

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
- Backend API/WebSocket: 4174
- Frontend UI: 5173

### Port Conflict Handling

The command intelligently handles port conflicts:

1. **AVC Kanban Server Already Running (Managed Process):**
   - Restarts the existing server
   - Shows: `🔄 Kanban server already running, restarting...`

2. **AVC Kanban Server Running Externally (Previous Session):**
   - Verifies it's an AVC kanban server (checks health endpoint)
   - Automatically kills and restarts
   - Shows: `⚠️ AVC kanban server already running (external process)`

3. **Non-AVC Process Using Port:**
   - Shows process details (PID, command)
   - Asks for confirmation before killing
   - User can cancel and change port in config

### Background Process Management

The kanban server runs as a managed background process:

- **View process status:** Use `/processes` (or `/p`) command
- **Stop server:** Select the process and press 's' to stop
- **Auto-cleanup:** Stopped processes disappear after 3 seconds
- **View logs:** Process output is captured and viewable in process details

### Output

```
📊 Starting Kanban Board server...
   Backend: http://localhost:4174
   Frontend: http://localhost:5173

✓ Server started successfully!
   Open http://localhost:5173 in your browser

   View process output: /processes
```

### Example Workflow

```sh
# 1. Initialize project and create work items
> /init
> /sponsor-call
# (Create epics, stories, tasks through ceremonies)

# 2. Launch kanban board
> /kanban

# 3. Open browser to http://localhost:5173

# 4. Interact with board:
#    - Filter by type (Epics, Stories, Tasks)
#    - Search for work items
#    - Click cards to view details
#    - Switch grouping modes (Status / Epic / Type)

# 5. Check process status
> /processes

# 6. Stop server when done
> /processes
# (Select "Kanban Server" and press 's')
```

### Troubleshooting

**No work items to display**

The kanban board requires at least one work item. Create work items through:
- `/sponsor-call` - Creates initial epics
- Sprint planning ceremonies - Creates stories and tasks
- Manual creation in `.avc/project/` directories

**Port already in use**

Edit `.avc/avc.json` to change the port:
```json
{
  "settings": {
    "kanban": {
      "port": 5174
    }
  }
}
```

**Browser shows "Cannot connect"**

Check that both backend (4174) and frontend (5173) servers are running:
```sh
> /processes
```

If only one is running, restart with `/kanban`.

**Real-time updates not working**

The WebSocket connection may have failed. Check browser console for connection errors. Refresh the page to reconnect.

### Technology Stack

**Backend:**
- Express.js - HTTP API server
- WebSocket (ws) - Real-time updates
- Chokidar - File watching for changes

**Frontend:**
- React 18 - UI framework
- Vite - Build tool and dev server
- Tailwind CSS - Styling
- Framer Motion - Animations
- Zustand - State management
- lucide-react - Icons
- react-markdown - Markdown rendering


## /models

View and configure which LLM models are used for ceremonies.

**Alias**

`/m`

```sh
> /models
```

### What it does

The `/models` command shows your current LLM model configuration for all ceremonies and allows you to interactively change which models are used for main generation, validation, and stage-specific processing.

This is useful when you:
- Want to use a different LLM provider (e.g., switch from Claude to Gemini)
- Need to use a faster/cheaper model for certain stages
- Have obtained new API keys and want to reconfigure
- Want to optimize costs by using different models for different stages

**This command does not require API keys to view configuration**, but you'll need API keys configured in `.env` to run ceremonies with the selected models.

### Interactive Configuration Flow

1. **View Current Configuration** - See all ceremonies and their configured models
2. **Prompt** - Choose whether to configure models (y/n)
3. **Select Ceremony** - Pick which ceremony to configure
4. **Select Stage** - Choose main generation, validation, or stage-specific
5. **Select Model** - Pick from all available models (with API key indicators)
6. **Repeat** - Configure additional stages or exit

### Model Display

Each model shows:
- **Display Name** - Human-readable model name
- **Status Indicator** - ✓ (API key available) or ⚠️ (no API key)
- **Model ID** - Technical identifier used by the provider
- **Pricing** - Input/output token costs per 1M tokens

**Example:**
```
› 1. Claude Sonnet 4.5 (current) ✓ - claude-sonnet-4-5-20250929 - $3.00/$15.00
  2. Claude Opus 4.5 ✓ - claude-opus-4-5-20250929 - $15.00/$75.00
  3. Gemini 2.5 Pro ⚠️ - gemini-2.5-pro - $1.25/$5.00
```

### Configuration Stages

Each ceremony can have different models configured for:

- **Main Generation** - Primary LLM used for content creation
- **Validation** - LLM used to verify quality and completeness
- **Stage-Specific** - Custom models for individual ceremony stages (suggestions, documentation, context)

### Output

```
🔧 Model Configuration

📋 Current Model Configuration:
Ceremony: sponsor-call - https://agilevibecoding.org/ceremonies/sponsor-call.html
• Main Generation: claude-sonnet-4-5-20250929 (claude)
• Validation: gemini-2.5-pro (gemini) ⚠️  No API key
• suggestions: claude-sonnet-4-5-20250929 (claude)
• documentation: claude-sonnet-4-5-20250929 (claude)
• context: claude-sonnet-4-5-20250929 (claude)

Configure models now? (y/n)
```

### API Key Warnings

Models without API keys show a ⚠️ warning, but **you can still select them**. This allows you to:
1. Configure your desired models first
2. Add the API keys to `.env` later
3. Run ceremonies once keys are available

### Configuration Persistence

All model configuration is stored in `.avc/avc.json` and persists across sessions. You can also manually edit this file if preferred:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "validation": {
          "enabled": true,
          "provider": "claude",
          "model": "claude-sonnet-4-5-20250929"
        }
      }
    ]
  }
}
```

### When to Use

Run `/models` anytime you want to customize which LLM models are used for each ceremony stage. The default configuration uses optimal models and works immediately, so model configuration is entirely optional.


## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` + Enter | Open interactive command selector |
| Tab | Auto-complete command name |
| ↑ / ↓ | Navigate command history |
| Esc | Cancel selector or dismiss update notification |
| Ctrl+R | Restart the REPL |

## Command aliases

| Alias | Expands to |
|-------|-----------|
| `/i` | `/init` |
| `/sc` | `/sponsor-call` |
| `/d` | `/documentation` |
| `/k` | `/kanban` |
| `/m` | `/models` |
| `/p` | `/processes` |
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
