# Sprint Planning Ceremony

## Overview

The **Sprint Planning** ceremony decomposes your project scope into domain-based Epics and user-facing Stories with intelligent duplicate detection.

**Input**

- Project documentation (.avc/project/project/doc.md)
- Project context (.avc/project/project/context.md)
- Existing Epics/Stories (optional)

**Output**

```
.avc/project/
├── context-0001/              # Epic
│   ├── doc.md                 # Epic documentation stub
│   ├── context.md             # Epic context (~800 tokens)
│   └── work.json              # Epic metadata
└── context-0001-0001/         # Story
    ├── doc.md                 # Story documentation stub
    ├── context.md             # Story context (~1500 tokens)
    └── work.json              # Story metadata
```

**Next Ceremony**

[`/seed <story-id>`](seed.md) - Decompose Stories into Tasks and Subtasks


## Ceremony Workflow

The Sprint Planning ceremony reads your Initial Scope and project context, then uses AI agents to decompose it into Epics (3-7 domain groupings) and Stories (2-8 user capabilities per Epic) with automatic duplicate detection.

```mermaid
sequenceDiagram
    actor User
    participant REPL as AVC REPL
    participant Proc as Sprint Planning Processor
    participant ProjFS as Project Files
    participant HierFS as Existing Hierarchy
    participant Decomp as Epic/Story Decomposer
    participant CtxGen as Context Generator
    participant OutFS as File System

    User->>REPL: /sprint-planning
    REPL->>Proc: execute()

    Note over Proc: Stage 1: Validate
    Proc->>ProjFS: Check doc.md exists?
    Proc->>ProjFS: Check context.md exists?
    alt Missing files
        Proc-->>User: ❌ Run /sponsor-call first
    end

    Note over Proc: Stage 2: Read Existing
    Proc->>HierFS: Scan .avc/project/*/work.json
    HierFS-->>Proc: Existing Epics/Stories maps + max IDs

    Note over Proc: Stage 3: Collect Scope
    Proc->>ProjFS: Read doc.md
    ProjFS-->>Proc: Extract ## Initial Scope section
    Proc->>ProjFS: Read context.md
    ProjFS-->>Proc: Project context

    Note over Proc: Stage 4: Decompose
    Proc->>Decomp: Generate Epics/Stories
    Note right of Decomp: Input:<br/>- Initial Scope<br/>- Project context<br/>- Existing Epic names<br/>- Existing Story names
    Decomp-->>Proc: Hierarchy JSON (3-7 Epics, 2-8 Stories each)

    Note over Proc: Stage 5: Renumber IDs
    Proc->>Proc: Assign context-XXXX IDs<br/>(avoid collisions)

    Note over Proc: Stage 6-7: Generate & Write
    loop For each Epic
        Proc->>CtxGen: Generate Epic context
        CtxGen-->>Proc: Epic context.md (~800 tokens)
        Proc->>OutFS: Write epic.id/doc.md (stub)
        Proc->>OutFS: Write epic.id/context.md
        Proc->>OutFS: Write epic.id/work.json

        loop For each Story in Epic
            Proc->>CtxGen: Generate Story context
            CtxGen-->>Proc: Story context.md (~1500 tokens)
            Proc->>OutFS: Write story.id/doc.md (stub)
            Proc->>OutFS: Write story.id/context.md
            Proc->>OutFS: Write story.id/work.json
        end
    end

    Note over Proc: Stage 8: Track Tokens
    Proc->>Proc: Record token usage

    Proc->>User: ✅ Ceremony complete
    Proc->>User: Show Epics/Stories created + token usage
```

### Workflow Details

The ceremony executes through 8 stages:

**1. Validate Prerequisites**
- Verifies `.avc/project/project/doc.md` exists (contains Initial Scope)
- Verifies `.avc/project/project/context.md` exists (for context inheritance)
- Fails with error if Sponsor Call not completed

**2. Read Existing Hierarchy**
- Scans `.avc/project/` for existing `work.json` files
- Builds maps of existing Epic/Story names (case-insensitive)
- Tracks maximum ID numbers to avoid collisions

**3. Collect Scope**
- Extracts `## Initial Scope` section from project doc.md
- Reads project context.md for agent instructions

**4. Decompose with AI**
- Calls [epic-story-decomposer](/agents/epic-story-decomposer) agent
- Passes existing Epic/Story names for duplicate detection
- Generates 3-7 domain-based Epics
- Generates 2-8 user-facing Stories per Epic
- Skips duplicates automatically

**5. Renumber IDs**
- Assigns `context-XXXX` IDs to new Epics
- Assigns `context-XXXX-XXXX` IDs to new Stories
- Ensures no collisions with existing IDs

**6-7. Generate Contexts & Write Files**
- For each Epic:
  - Calls [feature-context-generator](/agents/feature-context-generator) agent
  - Generates Epic context.md (~800 tokens)
  - Writes doc.md (stub), context.md, work.json
- For each Story:
  - Calls feature-context-generator agent with Epic + Project context
  - Generates Story context.md (~1500 tokens)
  - Writes doc.md (stub), context.md, work.json

**8. Track Tokens**
- Records token usage to `.avc/tokens.json`
- Displays summary to user


## Next Steps

After completing Sprint Planning:

### Review Generated Hierarchy

**Epic Structure**
```bash
cat .avc/project/context-0001/context.md
cat .avc/project/context-0001/work.json
```

**Story Structure**
```bash
cat .avc/project/context-0001-0001/context.md
cat .avc/project/context-0001-0001/work.json
```

### Proceed to Next Ceremony

**Seed** - Decompose a Story into Tasks and Subtasks:
```bash
> /seed context-0001-0001
```

See [Seed ceremony documentation](seed.md)


## Troubleshooting

View detailed ceremony logs:
```bash
cat .avc/logs/sprint-planning-*.log
```

Logs include:
- Existing hierarchy scan results
- Initial Scope extraction
- LLM decomposition request/response
- Context generation for each Epic/Story
- File write operations
- Error stack traces
