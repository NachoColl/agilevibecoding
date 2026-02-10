# Agent Harness Architecture

**A framework for managing long-running AI agent development projects**


## Overview

This document defines the agent harness architecture for implementing complex software projects using specialized AI coding agents. Based on [Anthropic's best practices for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), this architecture breaks large projects into atomic features that can be implemented incrementally with continuous verification.

### Key Principles

1. **Incremental Progress** - Work on one feature at a time (5-30 minutes each), not entire phases
2. **Systematic Documentation** - Maintain progress files and feature tracking
3. **Git-Based State** - Each feature completion = one git commit with standard format
4. **Verification Required** - Test after every feature before marking complete
5. **Session Continuity** - Each agent session starts by reading progress files and git history
6. **Shared Context** - Features within a phase share comprehensive implementation context
7. **Specialized Agents** - Domain-specific agents with expertise (server, client, infra, testing, docs)


## Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│  INITIALIZER AGENT (Run Once)                                   │
│  - Creates tracking infrastructure                              │
│  - Generates/verifies feature files                             │
│  - Writes init.sh environment setup script                      │
│  - Creates claude-progress.txt                                  │
│  - Establishes git baseline commit                              │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONTROLLER AGENT (Every Session)                               │
│  - Reads claude-progress.txt on session start                   │
│  - Reviews git log for recent changes                           │
│  - Runs baseline tests to verify system health                  │
│  - Selects next feature (based on dependencies)                 │
│  - Reads phase context.md for specifications                    │
│  - Spawns specialized coding agent with complete context        │
│  - Updates progress tracking after completion                   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CODING AGENTS (Specialized by Domain)                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Server/Backend Agent                                    │    │
│  │ - Implements backend services and APIs                 │    │
│  │ - Builds Express/FastAPI/etc. endpoints                │    │
│  │ - Creates database models and services                 │    │
│  │ - Tests endpoints before committing                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Client/Frontend Agent                                   │    │
│  │ - Implements SDK or frontend components                │    │
│  │ - Integrates with existing client libraries            │    │
│  │ - Creates UI components and state management           │    │
│  │ - Tests client operations                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Infrastructure Agent                                    │    │
│  │ - Creates CloudFormation/Terraform resources           │    │
│  │ - Builds deployment scripts and CI/CD                  │    │
│  │ - Configures cloud services (AWS/GCP/Azure)            │    │
│  │ - Tests infrastructure deployment                      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Testing Agent                                           │    │
│  │ - Implements unit and integration tests                │    │
│  │ - Creates test harnesses and fixtures                  │    │
│  │ - Runs E2E tests and verifies cleanup                  │    │
│  │ - Configures CI/CD test pipelines                      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Documentation Agent                                     │    │
│  │ - Writes user guides and tutorials                     │    │
│  │ - Creates API reference documentation                  │    │
│  │ - Updates README and getting started guides            │    │
│  │ - Generates code examples                              │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```


## Agent Roles and Responsibilities

### Initializer Agent

**Purpose:** Set up the tracking infrastructure (run once at project start)

**Responsibilities:**
- Generate or verify feature files from implementation plan
- Create tracking infrastructure (`claude-progress.txt`, `init.sh`, `index.json`)
- Establish git baseline commit
- Verify directory structure

**Input:**
- Implementation plan (phases, features)
- Phase context files (specifications)

**Output:**
- Feature files (individual JSON files or features.json)
- `claude-progress.txt` (session log)
- `init.sh` (environment setup script)
- Git baseline commit

**Duration:** One session (~30 minutes)

**Prompt:** See `../prompts/initializer.md`


### Controller Agent

**Purpose:** Orchestrate feature selection and agent spawning (run every session)

**Responsibilities:**
- Read progress files to resume from last session
- Review git log to understand recent work
- Run baseline tests to verify system health
- Select next feature based on dependencies and phase
- Read phase context to gather specifications
- Spawn specialized coding agent with complete context
- Update progress tracking after feature completion

**Input:**
- `claude-progress.txt` (last session state)
- Git history (commits since start)
- Feature files (status, dependencies)
- Phase context files (specifications)
- Baseline test results

**Output:**
- Selected feature for implementation
- Complete context for coding agent
- Updated progress files
- Session log entries

**Duration:** Ongoing (coordinates 10-20 features per session)

**Prompt:** See `../prompts/controller.md`

**Workflow:**

```
1. Session Start
   ├─ Read claude-progress.txt
   ├─ Review git log --oneline --since="1 week ago"
   └─ Run baseline tests (npm test, build, etc.)

2. Feature Selection
   ├─ Query pending features
   ├─ Check dependencies are met
   ├─ Select based on phase/priority
   └─ Mark feature as "in_progress"

3. Context Gathering
   ├─ Read feature-XXX.json
   ├─ Read phase-N/context.md
   └─ Extract relevant specifications

4. Agent Spawning
   ├─ Identify agent type (server/client/infra/testing/docs)
   ├─ Construct agent prompt with full context
   └─ Spawn coding agent

5. Completion Tracking
   ├─ Verify feature tests pass
   ├─ Verify git commit created
   ├─ Update feature status to "completed"
   ├─ Update index.json
   └─ Update claude-progress.txt

6. Repeat
   └─ Select next feature
```


### Coding Agents (Specialized)

**Purpose:** Implement individual features with domain expertise

**Types:**

1. **Server/Backend Agent**
   - Backend services, APIs, database models
   - Technologies: Node.js, Python, Go, Java, etc.
   - Express, FastAPI, Django, Spring Boot

2. **Client/Frontend Agent**
   - SDKs, frontend components, UI
   - Technologies: TypeScript, React, Vue, Angular
   - State management, API integration

3. **Infrastructure Agent**
   - Cloud resources, deployment scripts
   - Technologies: CloudFormation, Terraform, Pulumi
   - AWS, GCP, Azure, Kubernetes

4. **Testing Agent**
   - Unit tests, integration tests, E2E tests
   - Technologies: Jest, Pytest, Cypress, Playwright
   - Test harnesses, fixtures, CI/CD

5. **Documentation Agent**
   - User guides, API docs, tutorials
   - Technologies: Markdown, OpenAPI, JSDoc
   - README, getting started, examples

**Responsibilities:**
- Receive feature assignment with complete context
- Implement exactly as specified in context
- Run test command to verify implementation
- Create git commit with standard format
- Update feature status to "completed"

**Input:**
- Feature assignment (ID, name, file path)
- Complete specification from phase context
- Implementation patterns and best practices
- Test command and expected behaviors
- Success criteria

**Output:**
- Implemented code
- Passing tests
- Git commit
- Updated feature status

**Duration:** 5-30 minutes per feature

**Prompt:** See `../prompts/coding-agent.md`

**Workflow:**

```
1. Receive Assignment
   ├─ Feature ID and name
   ├─ File path to modify/create
   ├─ Complete specification from context
   └─ Test command and expected output

2. Implementation
   ├─ Read existing code (if modifying)
   ├─ Implement according to specification
   ├─ Follow patterns from context
   └─ Handle edge cases and errors

3. Testing
   ├─ Run test command
   ├─ Verify expected output
   ├─ Check expected behaviors
   └─ Fix any failures

4. Commit
   ├─ Stage changes
   ├─ Create commit with standard format
   └─ Verify commit created

5. Report
   ├─ Update feature status to "completed"
   ├─ Report git commit hash
   └─ Note any issues or deviations
```


## Feature Structure

### Feature File Format

Each feature is defined in a JSON file:

```json
{
  "id": "feature-001",
  "name": "Create User interface",
  "description": "Create User interface in src/types/User.ts with properties: id (string), name (string), email (string), createdAt (Date). See phase-1/context.md 'User Interface' section for complete specification.",
  "phase": "phase-1",
  "status": "pending",
  "dependencies": [],
  "file": "src/types/User.ts",
  "contextReference": {
    "file": "phase-1/context.md",
    "section": "User Interface",
    "lines": "45-67"
  },
  "testCommand": "npm run build && grep -q 'interface User' dist/types/User.d.ts",
  "expectedOutput": "TypeScript build succeeds, User interface exported",
  "expectedBehaviors": [
    "User interface created with all required properties",
    "Interface exported and available for import",
    "TypeScript compiles without errors"
  ],
  "estimatedMinutes": 10,
  "assignedAgent": "server",
  "gitCommit": null,
  "completedAt": null
}
```

### Status Values

- `pending` - Not yet started
- `in_progress` - Currently being worked on
- `completed` - Implementation done, tests passing, committed
- `blocked` - Cannot proceed due to dependencies or issues

### Dependencies

Features can depend on other features:

```json
{
  "id": "feature-015",
  "name": "SessionManager.getSession()",
  "dependencies": ["feature-001", "feature-002"],
  ...
}
```

Controller agent only selects features where all dependencies are `completed`.


## Phase Context Structure

Each phase has a `context.md` file with comprehensive specifications:

```markdown
# Phase 1: Foundation

## Overview
This phase establishes the core types, interfaces, and base services.

## Complete Specifications

### User Interface
Complete TypeScript interface definition:
```typescript
export interface User {
  id: string;           // Unique identifier (UUID v4)
  name: string;         // Full name
  email: string;        // Email address (validated)
  createdAt: Date;      // Creation timestamp
  updatedAt: Date;      // Last update timestamp
  role: 'admin' | 'user'; // User role
}
```

**Expected Behaviors:**
- All properties are required
- `id` should be UUID v4 format
- `email` should be validated
- Timestamps use Date type

### UserService Class

Implementation pattern:
```typescript
export class UserService {
  constructor(private db: Database) {}

  async create(data: CreateUserDTO): Promise<User> {
    // Validate input
    // Generate UUID
    // Set timestamps
    // Save to database
    // Return user
  }

  // ... other methods
}
```

## Implementation Patterns

### Error Handling
```typescript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', { error });
  throw new ServiceError('User-friendly message', error);
}
```

### Testing Pattern
```typescript
describe('UserService', () => {
  it('creates user with valid data', async () => {
    const service = new UserService(mockDb);
    const user = await service.create({ name: 'Test', email: 'test@example.com' });
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

## Dependencies
- TypeScript
- UUID library
- Validation library
- Database client

## Success Criteria
- All types exported and available
- Services implement all methods
- Tests pass
- TypeScript compiles without errors
```


## Progress Tracking

### claude-progress.txt

Human-readable session log:

```
=== Project Name - Progress Log ===
Last Updated: 2026-01-19 10:30:00
Session: 5
Completed: 96/247 (38.9%)

== Recent Activity ==
[2026-01-19 10:25] ✅ feature-015 COMPLETED
  SessionManager.getAvailableSession()
  Commit: abc123f
  Duration: 8 minutes

[2026-01-19 10:15] ✅ feature-014 COMPLETED
  SessionManager.isInCooldown()
  Commit: def456g
  Duration: 5 minutes

== Current Task ==
feature-016: CookieRefreshService.schedule()
Phase: phase-1
Status: in_progress
Started: 2026-01-19 10:28

== Next Up ==
feature-017: OperationExecutor.search()
feature-018: OperationExecutor.getTweet()
feature-019: OperationExecutor.getProfile()

== Notes ==
- Phase 1 nearing completion (66/68 done)
- All core types implemented
- SessionManager fully functional
```

### index.json (Optional)

Machine-readable progress summary:

```json
{
  "projectName": "Your Project",
  "version": "1.0.0",
  "totalFeatures": 247,
  "completedFeatures": 96,
  "completionPercentage": 38.9,
  "lastUpdated": "2026-01-19T10:30:00Z",
  "currentSession": 5,
  "phases": [
    {
      "phaseId": "phase-1",
      "phaseName": "Foundation",
      "totalFeatures": 68,
      "completedFeatures": 66,
      "completionPercentage": 97.1,
      "status": "in_progress"
    },
    {
      "phaseId": "phase-2",
      "phaseName": "API Layer",
      "totalFeatures": 35,
      "completedFeatures": 30,
      "completionPercentage": 85.7,
      "status": "in_progress"
    }
  ],
  "recentCommits": [
    {
      "hash": "abc123f",
      "featureId": "feature-015",
      "message": "SessionManager.getAvailableSession()",
      "timestamp": "2026-01-19T10:25:00Z"
    }
  ]
}
```


## Git Workflow

### Commit Format

**Standard format for all feature commits:**

```
feat: [Feature name] - [brief description]

Feature ID: feature-XXX
Phase: phase-N
File: src/path/to/file.ts
Test: npm run test:unit -- ComponentName
Status: ✅ Tests passing

[Optional: Additional notes]

Co-Authored-By: [Agent Type] Agent <noreply@anthropic.com>
```

**Example:**
```
feat: Create User interface - user type definition

Feature ID: feature-001
Phase: phase-1
File: src/types/User.ts
Test: npm run build
Status: ✅ Build passing

Co-Authored-By: Server Agent <noreply@anthropic.com>
```

### Git History as State

The git log serves as a permanent record:

```bash
# View recent features implemented
git log --oneline --grep="Feature ID" --since="1 week ago"

# Find specific feature commit
git log --grep="feature-015"

# See what was implemented in a session
git log --since="2 hours ago" --oneline
```

Controller agent uses git history to:
- Understand what's been completed
- Verify feature commits exist
- Resume after interruptions
- Detect rework or fixes


## Session Continuity Protocol

### Starting a New Session

1. **Read Progress Files**
   ```bash
   cat avc/tracking/claude-progress.txt
   ```

2. **Review Git History**
   ```bash
   git log --oneline --since="1 week ago"
   ```

3. **Run Baseline Tests**
   ```bash
   npm test
   npm run build
   ```

4. **Check Current State**
   ```bash
   ./avc/scripts/query-pending.sh --limit 10
   ```

5. **Select Next Feature**
   - Check dependencies met
   - Consider phase progression
   - Verify no conflicts

6. **Proceed with Implementation**

### Resuming After Interruption

If a session is interrupted:

1. **Check Last Commit**
   ```bash
   git log -1 --oneline
   ```

2. **Verify Feature Status**
   ```bash
   ./avc/scripts/feature-status.sh feature-XXX
   ```

3. **Reset if Incomplete**
   ```bash
   # If feature marked in_progress but no commit
   ./avc/scripts/update-feature.sh feature-XXX pending
   ```

4. **Continue from Last Completed**


## Parallel Execution

### Enabling Parallelization

Features within the same phase sharing context can run in parallel:

**Approach 1: Multiple Coding Agent Sessions**
- Use individual feature files (natural file locking)
- Each agent works in separate terminal/session
- Git conflicts are rare (different files)

**Approach 2: Feature Batching**
- Controller assigns batch of features to one agent
- Agent implements sequentially
- Commits batch at end

**Conflict Prevention:**
- Use individual feature files (not single features.json)
- Controller marks feature "in_progress" before assignment
- Use file timestamps to detect stale assignments
- ONE Controller agent at a time

### Example Parallel Workflow

```
Session 1 (Terminal 1):
- Controller selects feature-001, feature-002, feature-003
- Spawns Server Agent
- Agent implements all three
- Updates status as each completes

Session 2 (Terminal 2):
- Controller selects feature-004, feature-005
- Spawns Server Agent
- Agent implements both
- No conflicts (different feature files)

Both sessions update git independently
Git handles merge (different files modified)
```


## Testing Strategy

### Test After Every Feature

**Never batch testing to end of phase.**

Each feature must:
1. Run its specific test command
2. Verify expected output
3. Verify expected behaviors
4. Pass before git commit

### Test Types by Phase

**Phase 1 (Foundation):**
- Unit tests for types and services
- `npm run build` (TypeScript compilation)
- Type checking with `tsc --noEmit`

**Phase 2 (API Layer):**
- Route testing with curl or Supertest
- Request/response validation
- Error handling verification

**Phase 3 (Integration):**
- App startup tests
- Configuration loading tests
- Middleware integration tests

**Phase 4 (Client SDK):**
- SDK method tests
- Integration with existing client
- Mode switching tests

**Phase 5 (Infrastructure):**
- CloudFormation validation
- Deployment dry-run
- Resource configuration tests

**Phase 6 (Testing):**
- E2E test execution
- Test harness verification
- Cleanup validation

**Phase 7 (Documentation):**
- Documentation build
- Link checking
- Example code validation

### Baseline Tests

Run before starting new features:

```bash
# Core tests
npm test

# Build verification
npm run build

# Linting
npm run lint

# Type checking
npm run type-check
```

If baseline tests fail, fix before implementing new features.


## Error Handling and Recovery

### Feature Implementation Fails

**Scenario:** Test command fails during implementation

**Recovery:**
1. Agent attempts to fix (up to 3 tries)
2. If still failing, mark feature as "blocked"
3. Create issue note in claude-progress.txt
4. Move to next feature
5. Return to blocked feature later

### Dependency Conflicts

**Scenario:** Feature requires changes to completed feature

**Recovery:**
1. Update the original feature's files
2. Rerun tests
3. Create new commit (amendment or fix commit)
4. Update both feature statuses
5. Continue with current feature

### Session Interruption

**Scenario:** Session ends mid-feature

**Recovery:**
1. Next session reads claude-progress.txt
2. Checks last commit timestamp
3. If feature marked "in_progress" but no recent commit:
   - Reset feature to "pending"
   - Discard uncommitted changes
4. Continue from last completed feature


## Best Practices

### 1. Keep Features Atomic
- 5-30 minutes implementation time
- One clear deliverable
- Independently testable
- Single git commit

### 2. Write Comprehensive Context
- Complete specifications with code examples
- Implementation patterns
- Error handling guidelines
- Testing strategies

### 3. Test Continuously
- After every feature
- Don't batch to end of phase
- Catch issues early
- Maintain working state

### 4. Use Specialized Agents
- Match agent to task domain
- Clear responsibilities
- One feature per invocation

### 5. Maintain Progress Files
- Update after every feature
- Human-readable format
- Include timestamps
- Note any issues

### 6. Follow Git Conventions
- Standard commit format
- One commit per feature
- Descriptive messages
- Include feature ID

### 7. Enable Parallelization
- Use individual feature files
- Shared context per phase
- Coordinate via progress files
- ONE Controller at a time


## Metrics and ROI

### Implementation Speed

**Without AVC:**
- 60% time searching for specs
- 30% time implementing
- 10% time testing
- 15-20 minutes per feature average
- High rework rate
- Inconsistent implementations

**With AVC:**
- 10% time reading context
- 70% time implementing
- 20% time testing
- 5-10 minutes per feature average
- Low rework rate
- Consistent implementations

**Improvement:** 2-3x faster

### Quality Metrics

**With AVC:**
- Consistent implementations (shared patterns)
- Complete implementations (full specifications)
- Proper error handling (patterns in context)
- Comprehensive tests (test strategies in context)
- Fewer clarifying questions (context is complete)

### Project Outcomes

**Time Savings:**
- 10 minutes saved per feature
- For 247 features: **41 hours saved**
- Plus: reduced rework time
- Plus: fewer clarifying questions

**Quality Improvements:**
- Higher code consistency
- Better test coverage
- Clearer documentation
- Easier maintenance

**ROI Analysis:**
- Investment: 12-14 hours (setup)
- Savings: 50-60 hours (implementation)
- Return: **4:1 ROI**


## Conclusion

The Agent Harness Architecture provides a structured, scalable approach to implementing complex software projects with AI agents. By breaking projects into atomic features, providing comprehensive context, and maintaining continuous verification, teams can achieve:

- **2-3x faster implementation**
- **Consistent, high-quality code**
- **Verifiable progress**
- **Parallel execution capability**
- **Easy recovery from interruptions**

This architecture is proven with real-world projects (200+ features) and based on Anthropic's best practices for long-running agent systems.


**Version:** 1.0
**Last Updated:** 2026-01-19
