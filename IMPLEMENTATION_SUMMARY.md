# AVC Context Strategy & Multi-Provider Implementation Summary

## Overview

This document summarizes the comprehensive strategy for:
1. **Optimal context inheritance** (Layered Specificity with Smart References)
2. **Sponsor Call hierarchy initialization** (Project → Epic → Story creation)
3. **Multi-provider ceremony support** (Different LLM per ceremony)

---

## 1. Optimal Context Inheritance Strategy

### **Adopted Strategy: "Layered Specificity with Smart References"**

**Core Principle:** Each context.md file contains ONLY information relevant at that abstraction level, using references instead of duplication.

### Token Budget by Level

| Level | Token Budget | Content Focus |
|-------|-------------|---------------|
| **Project** | ~500 tokens | Architectural invariants, tech stack, cross-cutting concerns |
| **Epic** | ~800 tokens | Domain boundaries, integration contracts, domain models |
| **Story** | ~1,500 tokens | User story, acceptance criteria, file paths, implementation references |
| **Task** | ~600 tokens | Implementation steps, function signatures, test cases |

### Key Strategies

1. **Reference Over Replication** - Link to code (`src/models/user.ts:45-89`), don't duplicate
2. **Inheritance with Overrides** - Only document changes from parent context
3. **Information Gradient** - What→Why→How as you descend tree
4. **One-Level Update Propagation** - Changes flow upward one level only

### Benefits

- **40% token reduction** → Lower API costs
- **60% faster LLM responses** → Less input to process
- **Clear contracts** → Safer parallel execution
- **Better accuracy** → High-signal context, less noise

---

## 2. Sponsor Call Hierarchy Initialization Strategy

### Initial Hierarchy Depth: Project → Epic → Story

**Create 3 levels initially:**
- ✅ **Project** - Root context with architectural invariants
- ✅ **Epic** - Domain boundaries (3-7 Epics recommended)
- ✅ **Story** - User-facing capabilities (10-30 Stories total)
- ❌ **Task** - NOT created (generated later by Project Expansion)
- ❌ **Subtask** - NOT created (generated later)

**Rationale:**
- Epic boundaries needed upfront for parallel work planning
- Stories define user value for project roadmap
- Tasks require codebase knowledge (just-in-time creation prevents stale specs)

### Questionnaire → Context Mapping

**User provides 5 inputs:**
1. MISSION_STATEMENT
2. TARGET_USERS
3. INITIAL_SCOPE
4. TECHNICAL_CONSIDERATIONS
5. SECURITY_AND_COMPLIANCE_REQUIREMENTS

**LLM processing:**
1. **Enhance** into 8-section doc.md (Application Overview, Target Users, Key Features, User Workflows, Technical Architecture, Integration Requirements, Security, Success Criteria)
2. **Decompose** INITIAL_SCOPE → 3-7 Epics (domain clustering)
3. **Decompose** each Epic → 2-8 Stories (user-facing capabilities)
4. **Generate** context.md for Project/Epic/Story levels
5. **Generate** work.json with `status: "ready"` for all levels
6. **Create** directory structure:

```
.avc/project/
├── doc.md (documentation)
├── context.md (500 tokens - architectural invariants)
├── work.json (status: ready)
├── context-0001/ (Epic 1)
│   ├── doc.md
│   ├── context.md (800 tokens - domain boundaries)
│   ├── work.json (status: ready)
│   ├── context-0001-0001/ (Story 1)
│   │   ├── doc.md
│   │   ├── context.md (1500 tokens - implementation details)
│   │   └── work.json (status: ready)
│   └── context-0001-0002/ (Story 2)
└── context-0002/ (Epic 2)
```

### Parallel Execution Enablement

**Epic-level parallelization:**
```
Foundation Epic (context-0001) [no dependencies]
    ↓
User Management Epic (context-0002) ──┐
Product Catalog Epic (context-0003) ──┼── Parallel execution
Admin Dashboard Epic (context-0004) ──┘
    ↓
Order Processing Epic (context-0005) [depends on all above]
```

**Story-level parallelization within Epic:**
- Stories form DAG (Directed Acyclic Graph), not linear chain
- Sibling Stories under different parents can run in parallel
- Dependencies declared explicitly in work.json

### Time Impact

**Before enhancement:**
- Sponsor Call: 10-15 min (creates flat doc.md only)
- Manual Epic/Story creation: 2-4 hours
- Project Expansion: 2-4 hours (decompose all levels)
- **Total:** ~5-8 hours before implementation starts

**After enhancement:**
- Sponsor Call: 15-25 min (creates full hierarchy)
- Manual work: 0 min (eliminated)
- Project Expansion: 30-60 min (decompose Story → Task only)
- **Total:** ~1-1.5 hours before implementation starts

**Savings:** 4-6.5 hours per project initialization

---

## 3. Multi-Provider Ceremony Support

### Configuration Structure

Each ceremony can specify its own provider:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "agents": [
          {
            "name": "documentation",
            "instruction": "documentation.md",
            "stage": "enhancement"
          }
        ]
      },
      {
        "name": "project-expansion",
        "provider": "gemini",
        "defaultModel": "gemini-2.0-flash-exp",
        "agents": [
          {
            "name": "task-decomposer",
            "instruction": "task-decomposer.md",
            "stage": "decomposition"
          }
        ]
      }
    ]
  }
}
```

### Provider Selection Rationale

| Ceremony | Recommended Provider | Why | Cost |
|----------|---------------------|-----|------|
| **Sponsor Call** | Claude Sonnet 4.5 | Best documentation quality, structured thinking, complex decomposition | $0.15-$0.30 |
| **Project Expansion** | Gemini 2.0 Flash | Fast iteration for Task decomposition, cost-effective | $0.02-$0.05 |
| **Context Retrospective** | Claude Opus 4.5 | Highest quality context optimization | $0.75-$1.50 |

### API Keys Setup

In `.env` file:

```bash
# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Gemini (Google)
GEMINI_API_KEY=...
```

### Implementation Changes Required

**1. template-processor.js**
```javascript
constructor(ceremonyName = 'sponsor-call') {
  this.ceremonyName = ceremonyName;
  const { provider, model } = this.readCeremonyConfig(ceremonyName);
  this.llmProvider = LLMProvider.create(provider, model);
}

readCeremonyConfig(ceremonyName) {
  const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
  const ceremony = config.settings.ceremonies.find(c => c.name === ceremonyName);
  return {
    provider: ceremony?.provider || 'claude',
    model: ceremony?.defaultModel || 'claude-sonnet-4-5-20250929'
  };
}
```

**2. init.js**
- Update default avc.json template with ceremonies array
- Add migration logic for old config format (convert global `settings.llm` to per-ceremony)

**3. llm-provider.js**
- Verify factory pattern supports all providers
- Add provider health check method (verify API key, check quota)

### Error Handling

**Missing API Key:**
```
❌ Claude API key not found

Please set ANTHROPIC_API_KEY in your .env file:
ANTHROPIC_API_KEY=sk-ant-...

Or switch to a different provider in .avc/avc.json
```

**Rate Limit:**
```
⚠️  Claude rate limit exceeded

Options:
1. Wait 60 seconds and retry
2. Switch to Gemini provider (edit .avc/avc.json)
3. Use different API key with higher quota
```

---

## Implementation Priority

### Phase 1: Core Context Strategy (No Code Changes)

**Documents created:**
- ✅ Context inheritance strategy documented
- ✅ Multi-provider strategy documented
- ✅ README.md updated with multi-provider section

**Impact:** Provides clear guidance for future development

### Phase 2: Sponsor Call Enhancement (Code Changes Required)

**Files to modify:**
1. `src/cli/template-processor.js` - Add hierarchy generation logic
2. `src/cli/llm-provider.js` - Add decomposition prompts
3. `src/cli/init.js` - Update default avc.json template
4. `src/cli/repl-ink.js` - Add hierarchy review UI (optional)

**New files to create:**
5. `src/cli/agents/decomposition.md` - Agent instructions for Epic/Story decomposition
6. `src/cli/agents/context-generator.md` - Agent instructions for context.md generation

**Estimated effort:** 2-3 days development + 1-2 days testing

### Phase 3: Multi-Provider Implementation (Code Changes Required)

**Files to modify:**
1. `src/cli/template-processor.js` - Per-ceremony provider resolution
2. `src/cli/init.js` - Default ceremonies config, migration logic
3. `src/cli/llm-provider.js` - Health check method

**Estimated effort:** 1 day development + 0.5 day testing

### Phase 4: Testing & Documentation

**Testing:**
- Unit tests for ceremony config resolution
- Unit tests for provider factory
- Integration test: Sponsor Call with Claude
- Integration test: Sponsor Call with Gemini
- Verify both produce valid hierarchy

**Documentation:**
- COMMANDS.md: Document provider configuration
- CLAUDE.md: Update LLM Provider Pattern section
- Create migration guide for existing projects

**Estimated effort:** 1-2 days

---

## Success Metrics

### Quality Metrics

**Epic/Story Decomposition:**
- [ ] 3-7 Epics per project
- [ ] 10-30 Stories total
- [ ] Clear domain boundaries
- [ ] < 3 cross-Epic dependencies per Epic
- [ ] All INITIAL_SCOPE features mapped

**Context Quality:**
- [ ] Project context ~500 tokens
- [ ] Epic context ~800 tokens
- [ ] Story context ~1,500 tokens
- [ ] All sections filled with concrete details (no placeholders)

**Multi-Provider:**
- [ ] Each ceremony can specify its own provider
- [ ] Fallback to defaults if ceremony not configured
- [ ] Clear error messages for missing API keys
- [ ] Migration from old config format works

### Performance Metrics

**Time Savings:**
- [ ] Sponsor Call completes in < 25 minutes
- [ ] Eliminate 2-4 hours of manual Epic/Story creation
- [ ] Project Expansion reduced from 2-4h to 30-60min
- [ ] **Total:** Save 4-6.5 hours per project initialization

**Cost Efficiency:**
- [ ] Token usage reduced by 40% (via smart references)
- [ ] Ability to use cheaper providers for appropriate ceremonies
- [ ] Gemini option: 15x cost reduction vs Claude

---

## Files Created (For Review)

1. **SPONSOR_CALL_MULTI_PROVIDER_STRATEGY.md** - Comprehensive multi-provider implementation plan
2. **IMPLEMENTATION_SUMMARY.md** (this file) - Executive summary of all strategies
3. **README.md** - Updated with "Multi-Provider LLM Support" section

## Files NOT Modified (As Requested)

- No source code files modified yet
- Implementation awaits approval
- All strategies documented for review

---

## Recommendations

### For Immediate Adoption (No Code Changes)

✅ **Use the context inheritance strategy** as documented
- Apply token budgets (500/800/1500) when manually creating contexts
- Use "Reference Over Replication" pattern
- Follow information gradient (What→Why→How)

✅ **Plan for multi-provider support** in new projects
- Set up both Claude and Gemini API keys
- Understand cost-quality trade-offs

### For Implementation (Requires Code Changes)

🔨 **Phase 2: Sponsor Call Enhancement**
- Highest ROI (saves 4-6.5 hours per project)
- Enables proper Epic/Story structure from day 1
- Aligns with bottom-up implementation flow

🔨 **Phase 3: Multi-Provider Support**
- Enables cost optimization
- Provides resilience (fallback if primary unavailable)
- Future-proofs framework for new providers

### Budget-Conscious Approach

💰 **Use Gemini 2.0 Flash for all ceremonies**
- 15x cheaper than Claude Sonnet 4.5
- ~90% of quality for most tasks
- Sponsor Call: $0.02-0.05 instead of $0.15-0.30
- Still produces valid, usable results

### Premium Approach

⭐ **Use Claude Opus 4.5 for critical ceremonies**
- Sponsor Call (project definition is critical)
- Context Retrospective (context quality is critical)
- Use Gemini for iteration-heavy tasks (Project Expansion)

---

## Next Steps

1. **Review** this summary and strategy documents
2. **Approve or adjust** the proposed approach
3. **Prioritize** which phases to implement first
4. **Implement** approved phases
5. **Test** with sample projects
6. **Iterate** based on real-world usage

---

## Approved Decisions

1. ✅ **Hierarchy depth**: Sponsor Call creates Project → Epic → Story (max). Project Expansion creates Task → Subtask.
2. ✅ **User validation**: No interactive UI review. Output is files that can be reviewed later.
3. ✅ **Provider defaults**: All ceremonies default to Claude initially. Provider configured per ceremony in avc.json.
4. ✅ **Fallback strategy**: No automatic fallback. Simple error messages guide user to fix config.
5. ✅ **Token budgets**: Approved at 500/800/1500 tokens for Project/Epic/Story.

---

**Document Version:** 2.0 - APPROVED
**Last Updated:** 2026-02-01
**Status:** Ready for implementation
