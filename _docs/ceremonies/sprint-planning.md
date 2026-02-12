# Sprint Planning Ceremony

## Overview

The **Sprint Planning** ceremony decomposes your project scope into domain-based Epics and Stories.

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

The Sprint Planning ceremony reads your Initial Scope and project context, then uses AI agents to decompose it into Epics and Stories.

```mermaid
sequenceDiagram
    actor User
    participant REPL as AVC REPL
    participant Proc as Processor
    participant ProjFS as Project Files
    participant HierFS as Hierarchy
    participant Decomp as Decomposer
    participant CtxGen as Context Gen
    participant OutFS as File System

    User->>REPL: /sprint-planning
    REPL->>Proc: execute()

    Note over Proc: Stage 1: Validate
    Proc->>ProjFS: Check doc.md exists?
    Proc->>ProjFS: Check context.md exists?
    alt Missing files
        Proc-->>User: Run /sponsor-call first
    end

    Note over Proc: Stage 2: Read Existing
    Proc->>HierFS: Scan work.json files
    HierFS-->>Proc: Existing Epics/Stories + max IDs

    Note over Proc: Stage 3: Collect Scope
    Proc->>ProjFS: Read doc.md
    ProjFS-->>Proc: Initial Scope section
    Proc->>ProjFS: Read context.md
    ProjFS-->>Proc: Project context

    Note over Proc: Stage 4: Decompose
    Proc->>Decomp: Generate Epics/Stories
    Decomp-->>Proc: Hierarchy JSON

    Note over Proc: Stage 5: Renumber IDs
    Proc->>Proc: Assign context-XXXX IDs

    Note over Proc: Stage 6-7: Generate & Write
    loop For each Epic
        Proc->>CtxGen: Generate Epic context
        CtxGen-->>Proc: context.md
        Proc->>OutFS: Write Epic files
    end

    loop For each Story
        Proc->>CtxGen: Generate Story context
        CtxGen-->>Proc: context.md
        Proc->>OutFS: Write Story files
    end

    Note over Proc: Stage 8: Track Tokens
    Proc->>Proc: Record token usage

    Proc->>User: Ceremony complete
    Proc->>User: Show summary + token usage
```

### Scope Decomposition

The ceremony reads the Initial Scope from your project documentation and decomposes it into domain-based Epics and Stories.

**Prerequisite Validation**

Before decomposition, the ceremony verifies:
- Project documentation exists (`.avc/project/project/doc.md`)
- Project context exists (`.avc/project/project/context.md`)

**Duplicate Detection**

The ceremony automatically:
- Scans existing Epic/Story work items
- Builds case-insensitive name maps
- Passes existing names to AI agents to prevent duplicates
- Renumbers IDs to avoid collisions


### Ceremony Agents

The Initial Scope is decomposed into a hierarchical structure using AI-powered domain analysis.

| Agent | Purpose |
|-------|---------|
| [Epic/Story Decomposer](/agents/epic-story-decomposer) | Analyzes project scope and generates 3–7 domain-based Epics, each containing 2–8 Stories with duplicate detection |


Each Epic and Story receives a dedicated context file that inherits from the project context.

| Agent | Purpose |
|-------|---------|
| [Feature Context Generator](/agents/feature-context-generator) | Generates Epic context.md files (~800 tokens) with domain-specific patterns and architectural guidance |
| [Feature Context Generator](/agents/feature-context-generator) | Generates Story context.md files (~1500 tokens) with user journey details and acceptance criteria context |


## Next Steps

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
