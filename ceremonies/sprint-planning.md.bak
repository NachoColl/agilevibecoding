# Sprint Planning Ceremony

## Overview

The **Sprint Planning** ceremony creates or expands the project's Epic and Story hierarchy with intelligent duplicate detection. It decomposes project scope into domain-based Epics (3-7) and user-facing Stories (2-8 per Epic) with proper context inheritance.

**Purpose:** Create domain-based Epics and user-facing Stories with duplicate detection to support incremental project growth.

**Output:** Epic and Story directories with doc.md, context.md, and work.json files.

**Duration:** 5-15 minutes (depending on scope size)


## Prerequisites

Before running Sprint Planning:

1. **Sponsor Call completed:**
   - `.avc/project/project/doc.md` exists (for INITIAL_SCOPE)
   - `.avc/project/project/context.md` exists (for context inheritance)

2. **LLM provider configured:**
   - API key in `.env` file (ANTHROPIC_API_KEY or GEMINI_API_KEY)
   - Provider set in `.avc/avc.json`


## How It Works - Workflow

```mermaid
graph LR
    A[1. Validate Prerequisites] --> B[2. Read Existing Hierarchy]
    B --> C[3. Collect Scope]
    C --> D[4. Decompose into Epics/Stories]
    D --> E[5. Duplicate Detection]
    E --> F[6. Renumber IDs]
    F --> G[7. Generate Epic Contexts]
    G --> H[8. Generate Story Contexts]
    H --> I[9. Write Files]

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style G fill:#fff4e1
    style H fill:#fff4e1
```


## Processing Steps

### Step 1: Validate Prerequisites

Checks that project foundation exists:
- `.avc/project/project/doc.md` (for INITIAL_SCOPE extraction)
- `.avc/project/project/context.md` (for context inheritance)

**Error Handling:**
- If missing → Error: "Please run /sponsor-call first"

### Step 2: Read Existing Hierarchy

Scans `.avc/project/` for existing Epic and Story directories:
- Builds map of existing Epic names (case-insensitive)
- Builds map of existing Story names (case-insensitive)
- Tracks max Epic number (e.g., context-0003 → 3)
- Tracks max Story number per Epic (e.g., context-0001-0005 → 5)

**Purpose:** Enable duplicate detection and ID renumbering.

### Step 3: Collect Scope

Reads INITIAL_SCOPE section from `.avc/project/project/doc.md`:
- Extracts features list from "## Initial Scope" section
- Future enhancement: Prompt user for additional features to add

### Step 4: Decompose into Epics/Stories

Uses `epic-story-decomposer` agent to create hierarchy:

**Input:**
- INITIAL_SCOPE (from doc.md)
- Project context.md content
- List of existing Epic names (for duplicate detection)
- List of existing Story names (for duplicate detection)

**Output:**
- JSON with 3-7 new Epics
- Each Epic contains 2-8 new Stories
- Skips any Epics/Stories matching existing names

**Agent Instruction:**
```
Existing Epics: user management, payment processing
Existing Stories: user registration, login, checkout

Generate NEW Epics and Stories. Do not duplicate existing ones.
```

### Step 5: Duplicate Detection

Validates generated Epics/Stories against existing hierarchy:
- **Case-insensitive name matching**
- Skips duplicates automatically (agent-level)
- Logs warning if collision detected

**Example:**
```
Existing: "User Management" (context-0001)
New:      "user management" → SKIPPED (duplicate)
New:      "Payment Processing" → CREATED (context-0002)
```

### Step 6: Renumber IDs

Assigns IDs to avoid collisions:
- **Epics:** Start at maxEpicNum + 1
- **Stories:** Start at maxStoryNum[epicId] + 1 per Epic

**Example:**
```
Existing:
- context-0001 (Epic 1)
- context-0001-0001 (Story 1)
- context-0001-0002 (Story 2)

New allocation:
- context-0002 (Epic 2) ← maxEpicNum (1) + 1
- context-0002-0001 (Story 1)
- context-0002-0002 (Story 2)
```

### Step 7: Generate Epic Contexts

For each NEW Epic, generates context.md using `feature-context-generator` agent:

**Input:**
- Project context.md
- Epic details (name, domain, description, features)

**Output:**
- Epic context.md (~800 tokens)
- Focus: Domain-specific concerns, bounded context boundaries, Epic-level patterns

**Inheritance:**
- Epic contexts inherit from project context
- Epic contexts are passed down to Stories

### Step 8: Generate Story Contexts

For each NEW Story, generates context.md using `feature-context-generator` agent:

**Input:**
- Project context.md
- Epic context.md (parent)
- Story details (name, description, userType, acceptance criteria)

**Output:**
- Story context.md (~1500 tokens)
- Focus: User journey, acceptance criteria details, Story-level patterns

**Inheritance:**
- Story contexts inherit from Epic and Project contexts
- Story contexts are passed down to Tasks (created by Seed ceremony)

### Step 9: Write Files

Creates directory structure with 3 files per work item:

**Epic Files:**
```
.avc/project/context-0001/
├── doc.md         # Stub (updated during retrospective)
├── context.md     # Epic context (~800 tokens)
└── work.json      # Epic metadata
```

**Story Files:**
```
.avc/project/context-0001-0001/
├── doc.md         # Stub (updated during retrospective)
├── context.md     # Story context (~1500 tokens)
└── work.json      # Story metadata with children: []
```


## AI Agents Used

The Sprint Planning ceremony uses **2 specialized AI agents**:

### 1. Epic/Story Decomposer
- **File:** `agents/epic-story-decomposer.md`
- **Purpose:** Decompose project scope into Epics and Stories with duplicate detection
- **Input:** Project context + INITIAL_SCOPE + existing Epic/Story names
- **Output:** JSON with Epic/Story hierarchy (3-7 Epics, 2-8 Stories per Epic)
- **Duplicate Handling:** Skips Epics/Stories matching existing names (case-insensitive)
- **Validation:** Ensures 3-7 Epics, 2-8 Stories per Epic

### 2. Feature Context Generator
- **File:** `agents/feature-context-generator.md`
- **Purpose:** Generate context.md files for Epics and Stories
- **Input (Epic level):** Project context + Epic details
- **Output (Epic level):** Epic context.md (~800 tokens)
- **Input (Story level):** Project context + Epic context + Story details
- **Output (Story level):** Story context.md (~1500 tokens)
- **Token Budgets:** Epic ~800, Story ~1500


## Metadata Files (work.json)

### Epic work.json Structure

```json
{
  "id": "context-0001",
  "name": "Epic Name",
  "type": "epic",
  "domain": "domain-name",
  "description": "Epic description",
  "features": ["feature1", "feature2"],
  "status": "planned",
  "dependencies": [],
  "children": ["context-0001-0001", "context-0001-0002"],
  "metadata": {
    "created": "2025-01-15T10:30:00.000Z",
    "ceremony": "sprint-planning",
    "tokenBudget": 800
  }
}
```

### Story work.json Structure

```json
{
  "id": "context-0001-0001",
  "name": "Story Name",
  "type": "story",
  "userType": "end-user",
  "description": "Story description",
  "acceptance": ["criterion 1", "criterion 2"],
  "status": "planned",
  "dependencies": [],
  "children": [],  // Empty until /seed creates tasks
  "metadata": {
    "created": "2025-01-15T10:30:00.000Z",
    "ceremony": "sprint-planning",
    "tokenBudget": 1500
  }
}
```


## Usage

### First Expansion (After Sponsor Call)

```bash
avc
> /sprint-planning
```

Uses INITIAL_SCOPE from project doc.md to create initial Epics/Stories.

**Example Output:**
```
📊 Sprint Planning Ceremony

📋 Analyzing existing project structure...

No existing Epics/Stories found (first expansion)

🔄 Stage 1/3: Decomposing scope into Epics and Stories...

✅ Generated 4 new Epics with 18 new Stories

📝 Stage 2/3: Generating context files...

   ✅ context-0001/doc.md
   ✅ context-0001/context.md
   ✅ context-0001/work.json
      ✅ context-0001-0001/doc.md
      ✅ context-0001-0001/context.md
      ✅ context-0001-0001/work.json
      ...

💾 Stage 3/3: Writing hierarchy files...

✅ Project hierarchy expanded!

Created:
   • 4 new Epics
   • 18 new Stories

Total project structure:
   • 4 Epics
   • 18 Stories
   • 0 Tasks (run /seed to create tasks for stories)

📊 Token Usage:
   Input: 12,450 tokens
   Output: 8,320 tokens
   Total: 20,770 tokens
   API Calls: 23

✅ Token history updated

Next steps:
   1. Review Epic/Story structure in .avc/project/
   2. Run /seed <story-id> to decompose a Story into Tasks/Subtasks
```

### Subsequent Expansions (Add More Features)

```bash
> /sprint-planning
```

**Behavior:**
- Reads existing Epics/Stories
- Passes existing names to agent for duplicate detection
- Agent generates ONLY new Epics/Stories
- IDs are renumbered to avoid collisions

**Example Output:**
```
📋 Analyzing existing project structure...

Found 4 existing Epics, 18 existing Stories

🔄 Stage 1/3: Decomposing scope into Epics and Stories...

✅ Generated 1 new Epic with 3 new Stories

Created:
   • 1 new Epic
   • 3 new Stories

Total project structure:
   • 5 Epics
   • 21 Stories
   • 0 Tasks
```


## Duplicate Detection Algorithm

### How It Works

1. **Build Existing Maps** (Step 2):
   ```javascript
   const existingEpics = new Map(); // "user management" -> "context-0001"
   const existingStories = new Map(); // "user registration" -> "context-0001-0001"
   ```

2. **Pass to Agent** (Step 4):
   ```
   Existing Epics: user management, payment processing
   Existing Stories: user registration, login, checkout

   Generate NEW Epics and Stories. Skip existing ones.
   ```

3. **Agent Skips Duplicates**:
   - Case-insensitive matching
   - "User Management" matches "user management" → SKIP
   - "Analytics Dashboard" doesn't match → CREATE

4. **ID Renumbering** (Step 6):
   - New Epics: context-0005, context-0006, ...
   - New Stories: context-0005-0001, context-0005-0002, ...

### Why Duplicate Detection?

**Problem:** Without duplicate detection, re-running `/sprint-planning` would create:
- "User Management" (context-0001) - original
- "User Management" (context-0005) - duplicate!

**Solution:** Agent checks existing names and skips duplicates, enabling:
- Safe re-runs of ceremony
- Incremental project growth
- Adding features without recreating existing structure


## Error Handling

### Missing Prerequisites

**Error:**
```
❌ Project expansion failed: Project context not found.
   Please run /sponsor-call first to create the project foundation.
```

**Solution:** Run `/sponsor-call` first

### Invalid Scope Format

**Error:**
```
❌ Project expansion failed: Could not find Initial Scope section in project documentation
```

**Solution:** Verify `.avc/project/project/doc.md` has "## Initial Scope" section

### LLM Provider Errors

**Error:**
```
⚠️  Retry 1/3 in 2s: Epic/Story decomposition
   Error: rate limit exceeded
```

**Behavior:** Automatic retry with exponential backoff (3 attempts)


## Next Steps

After Sprint Planning completes:

1. **Review Epic/Story Structure:**
   - Check `.avc/project/context-*/` directories
   - Read Epic/Story context.md files
   - Validate Epic domains and Story acceptance criteria

2. **Decompose Stories into Tasks:**
   - Run `/seed <story-id>` for each Story
   - Example: `/seed context-0001-0001`
   - Creates Tasks and Subtasks for implementation

3. **Expand Again (Optional):**
   - Modify `.avc/project/project/doc.md` to add new features
   - Run `/sprint-planning` again
   - Duplicate detection ensures no collisions


## Tips

- **Start Small:** Run Sponsor Call with focused scope, then expand incrementally
- **Review Before Seeding:** Check Epic/Story structure before creating Tasks
- **Incremental Growth:** Add features over time by re-running ceremony
- **Context Inheritance:** Epic contexts flow down to Stories, which flow down to Tasks
