# Context Retrospective Ceremony

## Overview

The **Context Retrospective** ceremony updates all context scopes based on learnings from implementation. This ensures that AI agents have accurate, up-to-date context for future work.

**Purpose:** Refine and update context.md files at all hierarchy levels based on implementation experience.

**Input:** Completed work items with implementation documentation and learnings

**Output:** Updated context.md files reflecting current understanding of the project

---

## How It Works

### Context Update Process

The ceremony analyzes completed work and updates contexts:

1. **Review Implementation**
   - Analyze completed work items
   - Extract key learnings and decisions
   - Identify pattern changes

2. **Update Context Files**
   - **Project Context** - High-level architecture decisions
   - **Epic Context** - Feature domain insights
   - **Story Context** - Implementation details
   - **Task Context** - Technical discoveries

3. **Validate Updates**
   - Ensure context optimization maintained
   - Verify context inheritance preserved
   - Check for consistency across levels

---

## What Gets Updated

### Types of Updates

**Architectural Decisions:**
- Technology choices made during implementation
- Design patterns discovered to be effective
- Performance optimizations applied

**Domain Knowledge:**
- Business rule clarifications
- Edge cases discovered
- User workflow refinements

**Technical Insights:**
- API design decisions
- Data model changes
- Integration patterns

**Constraints & Assumptions:**
- Technical limitations discovered
- Performance characteristics measured
- Security requirements clarified

---

## Ceremony Stakeholders

### Human Stakeholders

| Role | Responsibilities |
|------|-----------------|
| Development Team | Provide implementation insights and learnings |
| Product Owner | Validate domain knowledge updates |
| Technical Lead | Review architectural decision updates |

### AI Agents

| Agent | Responsibilities |
|-------|-----------------|
| Context Analyzer | Extract learnings from implementation docs |
| Context Generator | Regenerate updated context files |
| Validation Agent | Verify context quality and consistency |

---

## When to Run

**Recommended Triggers:**
- After completing a Sprint (every 1-2 weeks)
- After major architectural decisions
- Before starting work on dependent features
- When context drift is noticed (AI agents misunderstanding scope)

**Frequency:** Sprint boundary or as-needed basis

---

## Ceremony Output

### Updated Files

```
.avc/project/
├── project/
│   └── context.md              # Updated with architectural learnings
├── epic-001/
│   ├── context.md              # Updated with domain insights
│   ├── story-001-001/
│   │   ├── context.md          # Updated with implementation details
│   │   └── task-001-001-001/
│   │       └── context.md      # Updated with technical discoveries
│   └── ...
└── ...
```

### Output Summary

- **Updated Contexts** - All context.md files refreshed with learnings
- **Change Log** - Documentation of what changed and why
- **Validation Report** - Confirmation of context quality

---

## Benefits

**Improved AI Accuracy:**
- AI agents have current, accurate information
- Reduced hallucinations and misunderstandings
- Better implementation suggestions

**Knowledge Preservation:**
- Captures tribal knowledge in context files
- Onboards new team members (human or AI) faster
- Prevents repeated mistakes

**Consistency:**
- Ensures all agents work with same understanding
- Aligns implementation across features
- Maintains architectural coherence

---

## Next Steps

After completing Context Retrospective:

1. **Review Updated Contexts** - Verify changes are accurate
2. **Continue Implementation** - Resume AI Coding with updated contexts
3. **Plan Next Sprint** - Use refined contexts for Project Expansion

---

## Status

**Implementation Status:** 🚧 **Under Development**

This ceremony is planned for future release. Requires completion of Sponsor Call and Project Expansion first.

---

## See Also

- [Sponsor Call Ceremony](sponsor-call.md) - Creates initial contexts
- [Project Expansion](project-expansion.md) - Adds task-level contexts
- [AI Coding Ceremony](ai-coding.md) - Generates implementation learnings
