# Project Expansion Ceremony

## Overview

The **Project Expansion** ceremony is the second ceremony in the Agile Vibe Coding framework. It decomposes ready Stories into Tasks and Subtasks, creating the complete implementation hierarchy down to atomic work units.

**Purpose:** Transform high-level Stories into detailed, implementable Tasks and Subtasks.

**Input:** Project/Epic/Story structure with work items in "ready" status (manually refined from "planned")

**Output:** Complete hierarchy down to Subtask level with atomic work items in "pending" status

---

## How It Works

The ceremony checks the AVC hierarchy for work items in "ready" status and processes each as follows:

### Processing Flow

For each ready work item:

1. **Check Scope Context**
   - Verify context completeness for implementation
   - Identify any missing information

2. **Determine Work Atomicity**

   **If work is atomic** (cannot be split further):
   - Mark work item as "pending" (ready for implementation)
   - No further decomposition needed

   **If work can be split** (complex, multi-step):
   - Create child AVC hierarchy with new context scopes
   - Generate work items with "pending" status
   - Update parent work item status to "pending"

   **If extra information required**:
   - Add list of clarifying questions
   - Mark work item status as "feedback required"
   - Wait for human input before proceeding

3. **Recursive Processing**
   - Continue until all work items are in "pending" status
   - Ensure complete hierarchy with no gaps

---

## Ceremony Stakeholders

### Human Stakeholders

| Role | Responsibilities |
|------|-----------------|
| Product Owner | Check initial scope assets and trigger ceremony |
| Product Team | Provide clarifications and answer questions raised by agents |

### AI Agents

| Agent | Responsibilities |
|-------|-----------------|
| Product Owner Agent | Controller agent executing ceremony workflow |
| Server Agent | Define and implement backend features, APIs, server-side logic |
| Client Agent | Define and implement SDK, frontend components, client-side functionality |
| Infrastructure Agent | Handle cloud deployment, infrastructure configuration, DevOps tasks |
| Testing Agent | Generate and execute test suites to verify implementations |

---

## Ceremony Output

### File Structure

```
.avc/project/
├── epic-001/
│   ├── story-001-001/
│   │   ├── task-001-001-001/      # New: Task level
│   │   │   ├── doc.md
│   │   │   ├── context.md
│   │   │   ├── work.json          # status: pending
│   │   │   ├── subtask-001-001-001-001/  # New: Subtask level
│   │   │   │   ├── doc.md
│   │   │   │   ├── context.md
│   │   │   │   └── work.json      # status: pending
│   │   │   └── subtask-001-001-001-002/
│   │   │       └── ...
│   │   └── task-001-001-002/
│   │       └── ...
│   └── ...
└── ...
```

### Output Summary

- **Tasks** - Decomposed from Stories (typically 2-5 tasks per story)
- **Subtasks** - Atomic work units (typically 1-3 subtasks per task)
- **Context Files** - Task and Subtask level contexts for AI implementation
- **Work Items** - Updated status tracking (ready → pending)

---

## Next Steps

After completing Project Expansion:

1. **Review Generated Tasks** - Verify decomposition makes sense
2. **Proceed to AI Coding** - Begin implementation of pending work items
3. **Track Progress** - Monitor work item status transitions

---

## Status

**Implementation Status:** 🚧 **Under Development**

This ceremony is planned for future release. The Sponsor Call ceremony must be completed first to establish the project hierarchy.

---

## See Also

- [Sponsor Call Ceremony](sponsor-call.md) - Must complete first
- [AI Coding Ceremony](ai-coding.md) - Follows after expansion
- [Context Retrospective](context-retrospective.md) - Updates contexts after learning
