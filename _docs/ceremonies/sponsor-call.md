# Sponsor Call Ceremony

## Overview

The **Sponsor Call** ceremony is the foundational ceremony in the Agile Vibe Coding framework. It creates your project's blueprint through an AI-assisted questionnaire, generating comprehensive documentation and architectural context that guides all subsequent work.

**Output**

- `project/context.md` as the root Context Scope, and 
- `project/doc.md` as the initial project documentation.

**Next Ceremony**

[`/project-expansion`](project-expansion.md) - Create Epics and Stories


## What It Does

The Sponsor Call ceremony:

1. **Collects Project Initial Requirements** 
2. **Generates Initial Documentation** (human oriented)
3. **Generates Initial Context Scope** (AI oriented)


## Ceremony Workflow

The Sponsor Call ceremony follows a  workflow that transforms user initial requirements into comprehensive project documentation. 

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

The ceremony starts by getting project mission statement and initial scope.

> **Only the mission statement is mandatory**, and AI agents will fill the gap for any skipped questions.


| # | Question | Mandatory | Purpose |
|---|----------|-----------|---------|
| 1 | **Mission Statement** | YES | Core purpose and value proposition |
| 2 | **Target Users** | NO | User types and their roles |
| 3 | **Initial Scope** | NO | Key features, main workflows, essential capabilities |
| 4 | **Deployment Target** | NO | Target deployment environment and infrastructure |
| 5 | **Technical Considerations** | NO | Technology stack, constraints, or preferences |
| 6 | **Security & Compliance Requirements** | NO | Regulatory, privacy, or security constraints |

#### User Requirements Agents

When user skips a question, we use agents to fill the gaps, which later can be edited.

| Agent | Purpose |
|-------|---------|
| [UX Researcher](/agents/suggestion-ux-researcher) | Generate target user suggestions when skipped |
| [Product Manager](/agents/suggestion-product-manager) | Generate initial scope suggestions when skipped |
| [Deployment Architect](/agents/suggestion-deployment-architect) | Generate deployment target suggestions when skipped |
| [Technical Architect](/agents/suggestion-technical-architect) | Generate technical considerations when skipped |
| [Security Specialist](/agents/suggestion-security-specialist) | Generate security & compliance suggestions when skipped |

The collected answers are then used to generate professional project documentation and architectural context through specialized AI agents. If validation is enabled, validator agents score the outputs and trigger iterative improvements until quality thresholds are met. Finally, the ceremony writes the generated files and syncs documentation to VitePress for immediate viewing. The entire process is orchestrated with progress tracking, auto-save functionality, and optional quality validation loops.

### AI Agents Used in Ceremony

| Stage | Agent | Purpose |
|-------|-------|---------|
| Documentation | [Documentation Creator](/agents/project-documentation-creator) | Transform questionnaire answers into 8-section project document |
| Documentation | [Documentation Validator](/agents/validator-documentation) | Score and validate documentation quality (0-100 scale) |
| Context | [Context Generator](/agents/project-context-generator) | Generate architectural context from questionnaire answers |
| Context | [Context Validator](/agents/validator-context) | Score and validate context quality (0-100 scale) |



### Stage 1: Interactive Questionnaire

**What happens:**
- Reads project template (`src/cli/templates/project.md`)
- Extracts 6 variables from template
- Presents each question with guidance
- Auto-saves progress every 30 seconds to `.avc/sponsor-call-progress.json`

**User options:**
- Type answer (multi-line supported)
- Press Enter twice to skip
- Edit previous answers (Ctrl+E in REPL)

**If question skipped:**
1. Check for guideline in `.avc/avc.json`
2. If found → use guideline value
3. If not found → invoke AI suggestion agent

### Stage 2: Template Replacement

**What happens:**
- Replaces `{{VARIABLE}}` placeholders with collected answers
- Formats lists as bullet points
- Creates initial markdown document

**No AI involved** - Simple string replacement

### Stage 3: Generate Documentation

**Agent**

[`project-documentation-creator.md`](/agents/project-documentation-creator)

**What happens:**
- Sends filled template to LLM
- Agent instructions guide LLM to create professional 8-section document
- Output: `.avc/project/doc.md`

**8 Sections Generated**

1. **Application Overview** - Mission, purpose, key objectives
2. **Target Users and Stakeholders** - User personas, roles, stakeholders
3. **Initial Scope** - Features and functional areas to implement
4. **Technical Considerations** - Technology stack, architecture, constraints
5. **Security and Compliance** - Security requirements, regulations, privacy
6. **User Workflows** - Primary user journeys and interactions
7. **Integration Requirements** - External systems, APIs, dependencies
8. **Success Criteria** - Metrics, KPIs, definition of done

### Stage 3b: Validation (Optional)

**Agent**

[`validator-documentation.md`](/agents/validator-documentation)

**What happens (if validation enabled):**
1. **Validator scores documentation** (0-100 scale)
   - Evaluates completeness, clarity, technical accuracy, and feasibility
   - Identifies issues by severity: **critical**, **major**, **minor**
   - Checks for logical flow gaps and missing information
2. **If score < threshold** (default 75):
   - `documentation-improver` agent enhances document based on feedback
   - Validator re-scores improved version
   - Iteration counter increments
3. **Loop continues until:**
   - Score >= acceptanceThreshold, OR
   - maxIterations reached (default 2)
4. **Final validation:**
   - If critical issues remain and `skipOnCriticalIssues: false`, ceremony may fail
   - If threshold met or iterations exhausted, ceremony proceeds with best version

**Iterative Improvement Process:**

Each improvement iteration:
- Receives validation feedback with specific issues
- AI improver addresses issues prioritizing critical → major → minor
- Maintains document structure and key information
- Improves clarity, completeness, and technical detail
- Returns enhanced version for re-validation

**Configuration**

```json
{
  "ceremonies": [{
    "name": "sponsor-call",
    "validation": {
      "enabled": true,
      "maxIterations": 2,
      "acceptanceThreshold": 75,
      "skipOnCriticalIssues": false
    }
  }]
}
```

### Stage 4: Generate Context

**Agent**

[`project-context-generator.md`](/agents/project-context-generator)

**What happens:**
- Sends 6 questionnaire answers to LLM
- Agent instructions guide LLM to create architectural context
- Output: `.avc/project/context.md`

**Context Includes:**
- Technology stack and frameworks
- Cross-cutting concerns (auth, logging, error handling)
- Architecture principles and patterns
- Development standards and conventions

**Inheritance**

This context is inherited by all Epic/Story/Task/Subtask contexts created in later ceremonies

### Stage 4b: Validation (Optional)

**Agent**

[`validator-context.md`](/agents/validator-context)

**What happens (if validation enabled):**
- Same validation process as documentation
- Ensures context meets quality standards
- Iteratively improves if needed

### Stage 5: Write Files

**What happens:**
- Creates `.avc/project/` directory if not exists
- Writes `doc.md` to `.avc/project/doc.md`
- Writes `context.md` to `.avc/project/context.md`

**No AI involved** - Simple file I/O

### Stage 6: Sync to VitePress

**What happens:**
- Copies `doc.md` content to `.avc/documentation/index.md`
- Enables immediate documentation viewing with `/documentation` command
- Preserves VitePress-specific formatting

**No AI involved** - File copy operation


## Configuration

### LLM Provider & Model

**File**

`.avc/avc.json`

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929"
      }
    ]
  }
}
```

**Supported Providers**

- **claude** - Anthropic API
  - `claude-sonnet-4-5-20250929` (default, best balance)
  - `claude-opus-4-5-20251101` (most capable, higher cost)
  - `claude-haiku-4-20250514` (fastest, lowest cost)
- **gemini** - Google Generative AI
  - `gemini-2.5-flash-latest` (fast, low cost)
  - `gemini-2.5-pro-latest` (high capability)

### Configurable Guidelines

Pre-configure default answers for any question in `.avc/avc.json`. When you skip a question, AVC first checks for a guideline, then falls back to AI suggestion.

**Complete Configuration Example**

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "guidelines": {
          "missionStatement": "Your default mission statement here",
          "targetUsers": "Your default target users here",
          "initialScope": "Your default initial scope here",
          "technicalConsiderations": "Your default tech stack here",
          "securityAndComplianceRequirements": "Your default security requirements here"
        }
      }
    ]
  }
}
```

**Default Guideline (Pre-configured)**

Only `technicalConsiderations` has a default guideline out of the box:

```
Use AWS serverless stack with Lambda functions for compute,
API Gateway for REST APIs, DynamoDB for database, S3 for storage.
Use CloudFormation for infrastructure definition and
AWS CodePipeline/CodeBuild for CI/CD deployment.
```

All other questions default to AI-generated suggestions when skipped (unless you configure guidelines for them).

### Validation Configuration

Enable AI-powered iterative validation:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "validation": {
          "enabled": true,
          "maxIterations": 3,
          "acceptanceThreshold": 75,
          "skipOnCriticalIssues": false
        }
      }
    ]
  }
}
```

**Parameters**

- `enabled` - Enable/disable validation (default: false)
- `maxIterations` - Max improvement cycles (default: 3)
- `acceptanceThreshold` - Minimum score 0-100 (default: 75)
- `skipOnCriticalIssues` - Stop if critical issues found (default: false)


## Ceremony Output

### Files Created

```
.avc/project/
├── doc.md              # 8-section project documentation
└── context.md          # Project-level architectural context

.avc/documentation/
└── index.md            # Auto-synced from doc.md (for VitePress)
```

### Files Updated

```
.avc/
└── ceremonies-history.json   # Ceremony execution history
```

### What's NOT Created

The following are created by the **`/project-expansion`** ceremony:
- Epic directories (`context-0001/`)
- Story directories (`context-0001-0001/`)
- Epic/Story `doc.md` files
- Epic/Story `context.md` files
- Epic/Story `work.json` metadata files


## Running the Ceremony

### Prerequisites

1. **Project Initialized**
   ```bash
   avc
   > /init
   ```

2. **API Key Configured** (in `.env` file)
   - For Claude: `ANTHROPIC_API_KEY=sk-ant-...`
   - For Gemini: `GEMINI_API_KEY=...`

### Execution

```bash
avc
> /sponsor-call
# or use alias:
> /sc
```

### Interactive Flow

1. **Questionnaire** (Stage 1)
   - Answer 6 questions
   - Press Enter twice to skip any question
   - Auto-saves progress every 30 seconds

2. **Processing** (Stages 2-7)
   - Watch progress updates:
     - Stage 4/5: Generating documentation...
     - Stage 5/5: Generating context...

3. **Completion**
   - View activity summary
   - Check token usage
   - Review generated files

### Progress & Resume

**Auto-Save**

- Every 30 seconds during questionnaire
- Saved to `.avc/sponsor-call-progress.json`

**Resume**

- If interrupted, next `/sponsor-call` detects incomplete progress
- Offers to resume from where you left off
- All previous answers preserved

**Manual Resume**

```bash
> /sponsor-call
# Detects incomplete progress
⚠️  Found incomplete ceremony from previous session
   Last activity: 2/5/2026, 10:30:45 AM
   Stage: questionnaire

Resume from where you left off? (y/n)
```


## Output Example

```
✅ Sponsor Call Completed

Activities performed:
• Collected 6 questionnaire answers
• Generated project documentation
• Generated project context
• Synced to VitePress documentation

Files created:
• .avc/project/doc.md
• .avc/project/context.md
• .avc/documentation/index.md

Next steps:
   1. Review .avc/project/doc.md for your project definition
   2. Run /documentation to view as website
   3. Run /project-expansion to create Epics and Stories
```


## Next Steps

After completing the Sponsor Call:

### 1. Review Generated Documents

**Project Documentation**

```bash
cat .avc/project/doc.md
```

**Project Context**

```bash
cat .avc/project/context.md
```

### 2. View as Website (Optional)

```bash
> /documentation
# Opens http://localhost:4173
```

### 3. Proceed to Next Ceremony

**Project Expansion** - Create Epics and Stories:
```bash
> /project-expansion
# or
> /pe
```

See [Project Expansion ceremony documentation](project-expansion.md)


## Troubleshooting

### Common Issues

**Issue**

"API key not set"

**Solution**

```bash
# Add to .env file
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Issue**

"Rate limit exceeded"

**Solution**

- Wait 1-2 minutes and retry
- AVC includes automatic retry with exponential backoff
- For persistent issues, consider using a different model

**Issue**

"Invalid JSON response"

**Solution**

- Rare issue with LLM provider
- Retry the ceremony
- If persistent, check provider status page

**Issue**

"Permission denied writing files"

**Solution**

- Check `.avc/` directory permissions
- Ensure you have write access to project directory

### Debug Logs

View detailed ceremony logs:
```bash
cat .avc/logs/sponsor-call-*.log
```

Logs include:
- Full questionnaire responses
- LLM request/response details
- File write operations
- Error stack traces


## Technical Implementation

### Code Location

- **Main Logic:** `src/cli/template-processor.js`
  - `processTemplate()` - Main workflow orchestrator
  - `generateFinalDocument()` - Documentation generation
  - `generateProjectContextContent()` - Context generation
  - `iterativeValidation()` - Validation loop

- **Ceremony Entry:** `src/cli/init.js`
  - `sponsorCall()` - CLI entry point
  - `sponsorCallWithAnswers()` - REPL integration

- **REPL Integration:** `src/cli/repl-ink.js`
  - `runSponsorCall()` - REPL command handler
  - Questionnaire UI components

### AI Agents

**Suggestion Agents (Optional)**

- `src/cli/agents/suggestion-business-analyst.md`
- `src/cli/agents/suggestion-ux-researcher.md`
- `src/cli/agents/suggestion-product-manager.md`
- `src/cli/agents/suggestion-technical-architect.md`
- `src/cli/agents/suggestion-security-specialist.md`

**Core Ceremony Agents**

- `src/cli/agents/project-documentation-creator.md`
- `src/cli/agents/project-context-generator.md`

**Validation Agents (Optional)**

- `src/cli/agents/validator-documentation.md`
- `src/cli/agents/validator-context.md`

### Tests

- **Unit Tests:** `src/tests/unit/questionnaire.test.js`
- **Integration Tests:** `src/tests/integration/template-with-llm.test.js`


## See Also

- [Project Expansion Ceremony](project-expansion.md) - Create Epics and Stories
- [Seed Ceremony](seed.md) - Decompose Stories into Tasks/Subtasks
- [AI Coding Ceremony](ai-coding.md) - Implement work items
- [Context Retrospective](context-retrospective.md) - Update contexts with learnings
