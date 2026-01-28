# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

**Agile Vibe Coding (AVC)** is a framework for managing long-running agent-based software development projects using classic Agile hierarchy (Epic → Story → Task → Subtask). It breaks large projects into atomic subtasks (5-30 minutes each) that can be implemented incrementally with continuous verification and parallel execution without conflicts.

The framework uses **hierarchical numbering** (`epic-0001`, `story-0001-0001`, `task-0001-0001-0001`, `subtask-0001-0001-0001-0001`) and **context at every level** through `context.md` files that inherit from parent levels. Each subtask has its own folder with both `context.md` (implementation guidance) and `subtask.json` (work definition).

The framework takes its starting points from [Anthropic's best practices for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) and the [Agile Manifesto principles](https://agilemanifesto.org/principles.html), adapted for AI-agent collaboration with comprehensive written context replacing human communication.

Long-running development is sustainable through parallel execution - multiple agents work on different subtasks simultaneously without merge conflicts via individual subtask folders and separate code files. Context quality improves through systematic analysis of agent questions and rework patterns. Progress persists across sessions via tracking files and git history, with each subtask independently testable and committed separately.

This is a **framework/template repository**, not an application to build or run. It provides documentation, templates, examples, and scripts that users copy into their own projects.

---

## Key Architecture Concepts

### Four-Agent System

1. **Initializer Agent** (run once)
   - Sets up tracking infrastructure (feature files, test files, progress logs, baseline git commit)
   - See `prompts/initializer.md`

2. **Controller Agent** (every session)
   - Orchestrates feature selection by reading progress files and git history
   - Spawns specialized coding and testing agents with complete context
   - Updates tracking after completion
   - See `prompts/controller.md`

3. **Coding Agents** (specialized by domain)
   - Server/Client/Infrastructure/Documentation agents
   - Implement individual features based on prompts (5-30 min each)
   - Features complete implementation stage, NOT entire feature
   - See `prompts/coding-agent.md`

4. **Testing Agent** (after implementation)
   - Generates tests from test prompts using LLM
   - Executes generated tests to verify implementation
   - Features only "completed" when all tests pass
   - See `prompts/testing-agent.md`

### Hierarchical Context Strategy

**Core principle:** Context exists at every level (Project → Epic → Story → Task → Subtask) with inheritance.

- Each level has a `context.md` file that inherits from parent and adds specifics
- Hierarchy uses **numbered folders**: `epic-0001/`, `story-0001-0001/`, `task-0001-0001-0001/`, `subtask-0001-0001-0001-0001/`
- Work units (story.json, task.json, subtask.json) all use the **same JSON structure**
- Context provides HOW to build (patterns, standards), work units define WHAT to build (prompts)
- Agents read ALL context.md files in hierarchy (project → epic → story → task → subtask)
- Eliminates duplication (write patterns once per level, inherited by children)
- Enables 2-3x faster implementation (agents spend 70% time coding vs 30% searching)
- See `templates/example-hierarchy/` for complete example

### Parallel Execution Without Conflicts

**Core capability:** Multiple agents can implement different subtasks simultaneously without merge conflicts, making long-running projects sustainable through concurrent development.

**How conflicts are prevented:**

1. **Individual subtask folders** (one folder per subtask with context.md + subtask.json)
   - Folders: `subtask-0001-0001-0001-0001/`, `subtask-0001-0001-0001-0002/`, etc.
   - File-system level atomicity prevents conflicts
   - Git handles merges naturally (different folders/files modified)

2. **Two-stage exclusive updates**
   - Coding agent marks subtask.implementation.status "implementing" BEFORE starting work
   - Testing agent marks subtask.validation.status "validating" BEFORE generating tests
   - Other agents skip in-progress subtasks
   - Git commits at each stage serve as synchronization points

3. **Separate code files**
   - Each subtask typically modifies different source files
   - Example: subtask-0001-0001-0001-0001 creates `JWTPayload.ts`, subtask-0001-0001-0001-0002 creates `JWTService.ts`
   - Rare conflicts are caught by git and easily resolved

4. **Hierarchical context enables independence**
   - All subtasks inherit context from their parents (project → epic → story → task → subtask)
   - Agents don't need to coordinate or communicate
   - Each agent has complete information to work independently

**Example parallel workflow:**
```
Terminal 1 (Coding): Implements subtask-0001-0001-0001-0001 (JWT interface) → commits to JWTPayload.ts → status: "implemented"
Terminal 2 (Coding): Implements subtask-0001-0001-0001-0002 (JWT generation) → commits to JWTService.ts → status: "implemented"
Terminal 3 (Testing): Validates subtask-0001-0001-0001-0001 → runs tests → all pass → status: "completed"
Terminal 4 (Testing): Validates subtask-0001-0001-0001-0002 → runs tests → all pass → status: "completed"
Terminal 5 (Coding): Implements subtask-0001-0001-0002-0001 (Auth middleware) → commits to authMiddleware.ts → status: "implemented"

All five agents work simultaneously on different subtasks, no conflicts
Two-stage completion: Implementation (5-30 min) → Validation (2-10 min)
Result: 3 subtasks fully completed in parallel (40 min) vs sequentially (120 min)
Long-running impact: 500 subtasks across 10 parallel agents = days instead of weeks
```

### Folder Structure

**Hierarchical folders with context at every level:**

Each work unit (story, task, subtask) lives in its own numbered folder containing:
- `context.md` - Inherits from parent + adds specifics
- Work unit JSON - `story.json`, `task.json`, or `subtask.json` (all same structure)

**Example:**
```
project/
├── context.md
└── epic-0001/
    ├── context.md
    └── story-0001-0001/
        ├── context.md
        ├── story.json
        └── task-0001-0001-0001/
            ├── context.md
            ├── task.json
            ├── subtask-0001-0001-0001-0001/
            │   ├── context.md
            │   └── subtask.json
            └── subtask-0001-0001-0001-0002/
                ├── context.md
                └── subtask.json
```

See `templates/example-hierarchy/` for complete working example.

---

## Directory Structure

```
agilevibecoding/
├── documentation/           # Framework documentation
│   ├── ARCHITECTURE.md      # Complete agent architecture
│   ├── WORKFLOW.md          # Agent workflow and coordination
│   ├── SHARED_CONTEXT_STRATEGY.md  # Context delivery approach
│   ├── AUTO_GENERATION.md   # Auto-generating feature descriptions
│   └── FILE_STRUCTURE.md    # File organization options
├── docs/                    # VitePress website (only index.md shown)
│   ├── .vitepress/          # VitePress configuration
│   ├── public/              # Static assets (logo, CNAME)
│   └── index.md             # Home page (copy of README.md)
├── prompts/                 # Agent prompt templates
│   ├── initializer.md       # Initializer agent prompt
│   ├── controller.md        # Controller agent prompt
│   ├── coding-agent.md      # Coding agent prompt template
│   └── testing-agent.md     # Testing agent prompt template
├── templates/               # Templates for user projects
│   ├── context.md           # Project-level context template
│   ├── init.sh              # Environment setup script template
│   └── example-hierarchy/   # Complete hierarchical example
│       └── epic-0001/
│           ├── context.md
│           └── story-0001-0001/
│               ├── context.md
│               ├── story.json
│               └── task-0001-0001-0001/
│                   ├── context.md
│                   ├── task.json
│                   ├── subtask-0001-0001-0001-0001/
│                   │   ├── context.md
│                   │   └── subtask.json
│                   └── subtask-0001-0001-0001-0002/
│                       ├── context.md
│                       └── subtask.json
├── scripts/                 # Utility scripts (copy to user projects)
│   ├── query-pending.sh     # Find next pending work units
│   ├── rebuild-index.sh     # Regenerate index files
│   ├── status.sh            # Check work unit status
│   ├── update-status.sh     # Update work unit status atomically
│   ├── generate-work-units.sh # Generate work unit files from patterns
│   ├── run-validations.sh   # Execute validation tests
│   └── migrate-to-hierarchy.sh # Migrate old format to hierarchical
├── examples/                # Example projects
│   └── auth-api/            # REST API example with authentication
└── README.md                # Main documentation
```

---

## Important Implementation Details

### Work Unit Tracking

All work units (story, task, subtask) use the **same JSON structure**:
- `id`: Hierarchical identifier (e.g., "subtask-0001-0001-0001-0001")
- `name`: Short description (e.g., "Create JWT Payload Interface")
- `scope`: Parent scope path (e.g., "epic-0001/story-0001-0001/task-0001-0001-0001")
- `status`: "pending" | "implementing" | "implemented" | "validating" | "completed" | "blocked"
- `dependencies`: Array of work unit IDs that must complete first
- `prompt`: Natural language description of WHAT to build (LLM interprets)
- `implementation`: Object tracking implementation stage
  - `status`: "pending" | "implementing" | "implemented"
  - `files`: Array of paths to files modified/created
  - `completedAt`: ISO timestamp
  - `gitCommit`: Commit hash
- `validation`: Object tracking validation/testing stage
  - `status`: "pending" | "validating" | "completed" | "failed"
  - `tests`: Array of test definitions with testPrompt and validations
  - `allTestsPassed`: Boolean (only true when ALL tests pass)
- `completedAt`: ISO timestamp (set when validation completes)

**Context Access:** Agents implementing a work unit must read ALL context.md files in the hierarchy:
- For `subtask-0001-0001-0001-0001`, read:
  - `project/context.md`
  - `epic-0001/context.md`
  - `epic-0001/story-0001-0001/context.md`
  - `epic-0001/story-0001-0001/task-0001-0001-0001/context.md`
  - `epic-0001/story-0001-0001/task-0001-0001-0001/subtask-0001-0001-0001-0001/context.md`

The combined context provides the full HOW (patterns, standards, constraints) for implementing the WHAT (prompt).

### Validation Structure

Validation is embedded in each work unit's `validation` object:
- `status`: Overall validation status ("pending" | "validating" | "completed" | "failed")
- `tests`: Array of test definitions
  - `status`: Test status ("pending" | "validating" | "passed" | "failed")
  - `testPrompt`: Natural language description of HOW to verify (LLM generates tests)
  - `validations`: Array of specific validation criteria
    - `criteria`: Description of what to verify
    - `status`: "pending" | "passed" | "failed"
- `allTestsPassed`: Boolean (only true when ALL validation criteria pass)

### Git Commit Format

Two-stage commit format:

**Stage 1: Implementation Commit**
```
feat(impl): [Work unit name] - [brief description]

ID: subtask-0001-0001-0001-0001
Scope: epic-0001/story-0001-0001/task-0001-0001-0001
Files: src/types/JWTPayload.ts
Stage: Implementation
Status: Implemented (ready for validation)

Co-Authored-By: [Agent Type] Agent <noreply@anthropic.com>
```

**Stage 2: Validation Commit**
```
test: [Work unit name] - validation complete

ID: subtask-0001-0001-0001-0001
Scope: epic-0001/story-0001-0001/task-0001-0001-0001
Validations: 5
Passed: 5/5
Stage: Validation
Status: ✅ All validations passing - Work unit completed

Co-Authored-By: Testing Agent <noreply@anthropic.com>
```

### Progress Tracking Files

1. **claude-progress.txt** - Human-readable session log with recent activity and next steps
2. **index files** - Machine-readable progress summaries at each level (can be regenerated)
3. **init.sh** - Environment verification script
4. **Git history** - Source of truth for completed work units

---

## Common Development Tasks

### Finding Pending Work Units
```bash
# Find all pending subtasks ready for implementation
./scripts/query-pending.sh --level subtask --stage implementation

# Find all subtasks ready for validation (implementation completed)
./scripts/query-pending.sh --level subtask --stage validation

# Find pending in specific epic
./scripts/query-pending.sh --epic epic-0001 --level subtask

# Find pending in specific story
./scripts/query-pending.sh --story story-0001-0001 --level subtask

# Limit results
./scripts/query-pending.sh --limit 5
```

### Checking Work Unit Status
```bash
# View subtask status (shows both implementation and validation stages)
./scripts/status.sh subtask-0001-0001-0001-0001

# View task status (rollup of all subtasks)
./scripts/status.sh task-0001-0001-0001

# View story status (rollup of all tasks)
./scripts/status.sh story-0001-0001
```

### Updating Status
```bash
# Update subtask implementation status
./scripts/update-status.sh subtask-0001-0001-0001-0001 implemented abc123f

# Update subtask to completed (when all validations pass)
./scripts/update-status.sh subtask-0001-0001-0001-0001 completed

# Update individual validation status
./scripts/update-status.sh subtask-0001-0001-0001-0001 validation-01 passed
```

### Running Validations
```bash
# Execute all validations for a subtask
./scripts/run-validations.sh subtask-0001-0001-0001-0001

# Run specific validation
./scripts/run-validations.sh subtask-0001-0001-0001-0001 validation-01
```

### Regenerating Indexes
```bash
# Rebuild all index files
./scripts/rebuild-index.sh

# Rebuild index for specific epic
./scripts/rebuild-index.sh epic-0001
```

### Generating Work Units
```bash
# Generate work unit files from patterns
./scripts/generate-work-units.sh --template templates/example-hierarchy

# Generate subtasks for a specific task
./scripts/generate-work-units.sh --parent task-0001-0001-0001
```

### Migration
```bash
# Migrate old format to hierarchical structure
./scripts/migrate-to-hierarchy.sh
```

---

## Working with This Repository

### When Making Changes to Framework Documentation

1. **documentation/** - Core architecture and workflow documentation
   - Keep ARCHITECTURE.md in sync with actual agent behavior
   - Update WORKFLOW.md when coordination logic changes
   - HIERARCHICAL_CONTEXT_STRATEGY.md explains the context delivery approach

2. **docs/** - VitePress website (public facing)
   - Only index.md should be visible on the website
   - index.md is copied from README.md during deployment
   - All other documentation stays in documentation/ folder

3. **prompts/** - Agent prompt templates
   - These are copied by users into their projects
   - Changes here affect all future projects using AVC
   - Test changes with example projects first

4. **README.md** - Primary user-facing documentation
   - Comprehensive guide for users setting up their first project
   - Keep "Quick Start" section up to date
   - Examples should match actual example projects

### When Adding/Modifying Examples

- Examples in `examples/` demonstrate AVC patterns
- `auth-api/` is the primary example showing Epic → Story → Task → Subtask hierarchy
- Each example should have complete hierarchical structure with context.md at every level
- Work unit JSON files should demonstrate proper structure and references
- Use hierarchical numbering (epic-0001, story-0001-0001, etc.)

### When Updating Scripts

- Scripts in `scripts/` are meant to be copied to user projects
- Keep them POSIX-compatible (bash 3.2+)
- Use `jq` for JSON parsing (widely available)
- Include usage comments at top of each script
- Test with hierarchical folder structure (story.json, task.json, subtask.json)

### When Modifying Templates

- Templates in `templates/` are starting points for users
- `example-hierarchy/` shows complete Epic → Story → Task → Subtask structure
- All work units (story.json, task.json, subtask.json) use identical JSON structure
- `context.md` appears at every level showing hierarchical context inheritance
- Folder structure with hierarchical numbering is as important as file content
- Keep templates well-commented with examples

---

## Key Design Principles

1. **Atomic, Verifiable Subtasks**: Each subtask is 5-30 minutes for implementation, 2-10 minutes for validation, independently verifiable, two git commits (implementation + validation)
2. **Prompt-Based Development**: Work units defined by prompts that LLMs interpret, not explicit commands
3. **Two-Stage Completion**: Work units complete implementation stage first, then validation stage - only "completed" when all validations pass
4. **Hierarchical Context**: Epic → Story → Task → Subtask with context.md at every level, each inheriting from parent and adding specifics
5. **Unified Work Unit Structure**: All levels (story, task, subtask) use identical JSON structure - differentiated only by scope and folder location
6. **Hierarchical Numbering**: Parent prefix encoding (epic-0001, story-0001-0001, task-0001-0001-0001, subtask-0001-0001-0001-0001) makes relationships explicit
7. **Parallel Execution**: Multiple agents work simultaneously without conflicts via separate work unit files in hierarchical folders
8. **Context Quality Self-Improvement**: Track agent questions and rework patterns to continuously improve context
9. **Continuous Validation**: Validate after every implementation, not at end of story
10. **Git as State**: Git history is source of truth, tracking files are regenerable
11. **Specialized Agents**: Domain-specific coding agents + dedicated validation agent
12. **Session Continuity**: Every session starts by reading progress files and git log
13. **Retrospective Analysis**: Regular context quality reviews to optimize framework effectiveness

---

## Testing Strategy

When making changes to AVC framework:

1. **Test with auth-api example**
   ```bash
   cd examples/auth-api
   ../../scripts/query-pending.sh --level subtask --stage implementation
   ../../scripts/query-pending.sh --level subtask --stage validation
   ```

2. **Verify script functionality**
   ```bash
   # Test query-pending finds work units by level and stage
   ./scripts/query-pending.sh --epic epic-0001 --level subtask --limit 3

   # Test status shows both implementation and validation stages
   ./scripts/status.sh subtask-0001-0001-0001-0001

   # Test status shows rollup at task level
   ./scripts/status.sh task-0001-0001-0001

   # Test rebuild-index regenerates properly
   ./scripts/rebuild-index.sh
   ```

3. **Validate agent prompts**
   - Ensure prompts in `prompts/` align with ARCHITECTURE.md workflow
   - Test that coding-agent.md enforces two-stage completion
   - Test that validation-agent.md generates and runs validations correctly
   - Verify hierarchical context references work correctly
   - Verify git commit format is clear for both stages

---

## Important Caveats

### This is NOT a Build Project

- No package.json, no build commands
- No tests to run (it's documentation and templates)
- No application to execute
- Users copy files to their own projects

### Framework vs User Project

- **Framework** (this repo): Documentation, templates, examples
- **User Project**: Actual implementation using AVC patterns
- Don't add implementation-specific code here
- Keep focused on reusable patterns and templates

### Framework Foundations

This framework synthesizes two foundational sources:

**1. Anthropic Best Practices for Long-Running Agents**
https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

Technical implementation patterns:
- Incremental progress with verifiable tasks
- Systematic documentation and tracking
- Git-based state management
- Continuous verification
- Session continuity through progress files
- Parallel execution without conflicts

**2. Agile Manifesto Principles**
https://agilemanifesto.org/principles.html

Process and collaboration patterns (adapted for AI agents):
- Early and continuous delivery (subtask-level granularity, 5-30 min each)
- Welcome changing requirements (cheap rework with agents)
- Working software as primary progress measure
- Continuous attention to technical excellence
- Simplicity - maximize work not done
- Regular reflection and adaptation (context quality retrospectives)

[See detailed Agile analysis in README.md]

---

## Related Documentation

For detailed understanding:
- `documentation/ARCHITECTURE.md` - Complete agent system architecture
- `documentation/WORKFLOW.md` - Agent coordination and workflow analysis
- `documentation/HIERARCHICAL_CONTEXT_STRATEGY.md` - Hierarchical context delivery (2-3x speedup)
- `documentation/AUTO_GENERATION.md` - Auto-generating work unit descriptions
- `examples/auth-api/README.md` - Practical example walkthrough with hierarchical structure

---

## Version

Framework Version: 3.0 (Hierarchical Structure)
Last Updated: 2026-01-24
