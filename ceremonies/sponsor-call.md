# Sponsor Call Ceremony

## Overview

The **Sponsor Call** ceremony is the foundational ceremony in the Agile Vibe Coding framework. It creates your project's brief and root context scope.

**Output**

```
.avc/project/
├── doc.md              # project documentation
└── context.md          # root context scope
```

**Next Ceremony**

[`/project-expansion`](project-expansion.md) - Create Epics and Stories


## Ceremony Workflow

The Sponsor Call ceremony follows a  workflow that transforms user initial requirements into comprehensive project documentation (project brief) and a root context scope.

```mermaid
sequenceDiagram
    actor User
    participant REPL as AVC REPL
    participant QA as Questionnaire
    participant Agent as AI Agents
    participant Doc as Doc Generator
    participant Val as Validator
    participant Ctx as Context Generator
    participant FS as File System

    User->>REPL: /sponsor-call
    REPL->>QA: Start questionnaire

    loop 6 Questions
        QA->>User: Present question
        alt User provides answer
            User->>QA: Type answer
        else User skips (Enter on empty)
            QA->>Agent: Request suggestion
            Agent->>QA: Generated suggestion
        end
        QA->>QA: Auto-save progress
    end

    QA->>REPL: Collect all answers
    REPL->>REPL: Replace template variables

    REPL->>Doc: Generate documentation
    Doc->>Agent: Call LLM with template + agent instructions
    Agent-->>Doc: 8-section project document

    opt Validation enabled
        loop Until score >= 75 OR maxIterations (2)
            Doc->>Val: Validate document
            Val-->>Doc: Score + issues
            alt Score < threshold
                Doc->>Agent: Improve document
                Agent-->>Doc: Enhanced version
            end
        end
    end

    Doc->>REPL: Return doc.md

    REPL->>Ctx: Generate context
    Ctx->>Agent: Call LLM with answers + agent instructions
    Agent-->>Ctx: Architectural context

    opt Validation enabled
        loop Until score >= 75 OR maxIterations (2)
            Ctx->>Val: Validate context
            Val-->>Ctx: Score + issues
            alt Score < threshold
                Ctx->>Agent: Improve context
                Agent-->>Ctx: Enhanced version
            end
        end
    end

    Ctx->>REPL: Return context.md

    REPL->>FS: Write .avc/project/doc.md
    REPL->>FS: Write .avc/project/context.md
    REPL->>FS: Copy to .avc/documentation/index.md

    REPL->>User: ✅ Ceremony complete
    REPL->>User: Show files created + token usage
```

### User Requirements

The ceremony starts by running /sponsor-call command, asking the user to define the project mission statement, the initial scope and any extra technical requirement or security concerns.

> **Only the mission statement is mandatory**, and AI agents will fill the gap for any skipped questions.

| # | Question | Purpose |
|---|----------|---------|
| 1 | **Mission Statement** | Core purpose and value proposition |
| 2 | Target Users | User types and their roles |
| 3 | Initial Scope | Key features, main workflows, essential capabilities |
| 4 | Deployment Target | Target deployment environment and infrastructure |
| 5 | Technical Considerations | Technology stack, constraints, or preferences |
| 6 | Security & Compliance Requirements | Regulatory, privacy, or security constraints |

#### User Requirements Agents

When user skips a question, we use agents to fill the gaps, which later can be edited.

| Agent | Purpose |
|-------|---------|
| [UX Researcher](/agents/suggestion-ux-researcher) | Generate target user suggestions when skipped |
| [Product Manager](/agents/suggestion-product-manager) | Generate initial scope suggestions when skipped |
| [Deployment Architect](/agents/suggestion-deployment-architect) | Generate deployment target suggestions when skipped |
| [Technical Architect](/agents/suggestion-technical-architect) | Generate technical considerations when skipped |
| [Security Specialist](/agents/suggestion-security-specialist) | Generate security & compliance suggestions when skipped |

The collected answers are then used to generate professional project documentation and architectural context through specialized AI agents. 

| Stage | Agent | Purpose |
|-------|-------|---------|
| Documentation | [Documentation Creator](/agents/project-documentation-creator) | Transform questionnaire answers into 8-section project document |
| Documentation | [Documentation Validator](/agents/validator-documentation) | Score and validate documentation quality (0-100 scale) |
| Context | [Context Generator](/agents/project-context-generator) | Generate architectural context from questionnaire answers |
| Context | [Context Validator](/agents/validator-context) | Score and validate context quality (0-100 scale) |

If validation is enabled, validator agents score the outputs and trigger iterative improvements until quality thresholds are met. Finally, the ceremony writes the generated files and syncs documentation to VitePress for immediate viewing. The entire process is orchestrated with progress tracking, auto-save functionality, and optional quality validation loops.


## Next Steps

After completing the Sponsor Call:

### Review Generated Documents

**Project Documentation**

```bash
cat .avc/project/doc.md
```

> Run ```/documentation``` to view 

**Project Context**

```bash
cat .avc/project/context.md
```

### Proceed to Next Ceremony

**Project Expansion** - Create Epics and Stories:
```bash
> /project-expansion
```

See [Project Expansion ceremony documentation](project-expansion.md)

## Troubleshooting

View detailed ceremony logs:
```bash
cat .avc/logs/sponsor-call-*.log
```

Logs include:
- Full questionnaire responses
- LLM request/response details
- File write operations
- Error stack traces
