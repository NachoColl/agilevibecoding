# Agent Harness Workflow Analysis

**Date:** 2026-01-19
**Purpose:** Answer critical operational questions before implementation

---

## Critical Questions to Resolve

### 1. How are subagents created and how do they pick features?

#### Current Design (from ARCHITECTURE.md)

**Controller Agent:**
- Reads `claude-progress.txt`
- Reviews `features.json`
- **Selects ONE feature** with status="pending"
- Spawns specialized coding agent
- Passes feature to agent

**Issue Identified:** Architecture doesn't specify HOW agents are spawned in Claude Code.

#### Proposed Implementation

**Using Claude Code's Task Tool:**

The Controller Agent would:
1. Read `claude-progress.txt`
2. Read `features.json`
3. Select next pending feature with dependencies met
4. **Update feature status to "in_progress" BEFORE spawning** (critical for conflict prevention)
5. Write updated `features.json`
6. Use Task tool to spawn coding agent with feature context

**Task Tool Invocation Example:**
```
Task tool called with:
- subagent_type: "general-purpose" (or specialized if available)
- description: "Implement feature-016: SessionManager.isInCooldown()"
- prompt: Full context including feature details, file paths, test commands
```

**Feature Selection Logic:**
```javascript
function selectNextFeature(features) {
  // Priority order:
  // 1. Features marked "in_progress" (resume interrupted work)
  // 2. Features with all dependencies met, status="pending"
  // 3. Features in current phase (don't skip ahead)

  // First check for interrupted work
  const inProgress = features.find(f => f.status === 'in_progress');
  if (inProgress) {
    return inProgress; // Resume interrupted feature
  }

  // Select next pending feature
  const pending = features.filter(f => {
    if (f.status !== 'pending') return false;

    // Check dependencies
    const depsMet = f.dependencies.every(depId => {
      const dep = features.find(d => d.id === depId);
      return dep && dep.status === 'completed';
    });

    return depsMet;
  });

  // Return first available
  return pending[0] || null;
}
```

---

### 2. How do we prevent conflicts (2 agents selecting same feature)?

#### Problem Statement

If multiple Controller sessions run simultaneously:
- Session A selects feature-016, updates to "in_progress"
- Session B reads features.json before A writes
- Session B also selects feature-016
- **CONFLICT:** Both agents work on same feature

#### Solution: Atomic Status Updates

**Critical Rule:** Update feature status to "in_progress" BEFORE spawning agent

**Workflow:**
```
Controller Agent:
1. Read features.json
2. Select feature X
3. **UPDATE features.json: feature X status = "in_progress"**
4. **WRITE features.json to disk**
5. Spawn coding agent for feature X

If another Controller starts:
1. Read features.json
2. Feature X now shows "in_progress" → SKIP
3. Select feature Y instead
```

**File-based Locking (Simple Approach):**
```bash
# Controller agent could use file locking
if [ ! -f "avc/tracking/.lock" ]; then
  touch avc/tracking/.lock
  # ... select feature, update status ...
  rm avc/tracking/.lock
else
  echo "Another controller is running, waiting..."
  sleep 5
fi
```

**Git-based Locking (Better Approach):**
```bash
# Before selecting feature:
git pull origin main

# Select feature, update status
# Update features.json

# Commit immediately
git add avc/tracking/features.json
git commit -m "lock: Mark feature-016 as in_progress"
git push origin main

# If push fails (someone else pushed):
# Pull, re-select next available feature
```

**Recommendation:**
- **Single Controller per session** (simplest)
- Mark status "in_progress" before spawning
- Use git commits as atomic operations
- Coding agents are spawned ONE AT A TIME, not in parallel

---

### 3. What context is delivered to different agents?

#### Problem Statement

Coding agents need enough context to:
- Understand the codebase structure
- Know what dependencies exist
- Implement features correctly
- Avoid breaking existing code

But they shouldn't have TOO much context:
- Risk of context overflow
- Risk of modifying unrelated code
- Risk of over-engineering

#### Proposed Context Delivery

**Minimal Context (Feature-Specific):**

When Controller spawns a coding agent, include:

```
**Feature Assignment:**
- Feature ID: feature-016
- Feature Name: SessionManager.isInCooldown() - cooldown checking
- File to modify: src/server/services/SessionManager.ts
- Test command: npm run test:unit -- SessionManager
- Dependencies: feature-015 (completed)
- Estimated time: 15 minutes

**Context to Read:**
1. Current implementation: src/server/services/SessionManager.ts
2. Related types: src/server/types/session.ts
3. Recent commits: git log --oneline -5
4. Test file: test/unit/server/SessionManager.test.ts

**Related Features (for reference):**
- feature-015: SessionManager.getAvailableSession() (just completed)
- feature-017: SessionManager.setCooldown() (next in sequence)

**Instructions:**
1. Read the files listed in "Context to Read"
2. Implement ONLY the isInCooldown() method
3. Do NOT modify other methods unless necessary
4. Run test command
5. Create git commit
6. Update features.json
```

**Full Context (Available on Request):**

Coding agents can read any file if needed:
- Full implementation plan: `avc/planning/IMPLEMENTATION_PLAN.md`
- Architecture design: `avc/planning/SERVER_PACKAGE_DESIGN.md`
- Other related files

**Context Discovery Tools:**

Agents should use:
- `grep` to find related code
- `git log` to understand recent changes
- `git blame` to see who wrote what
- Test files to understand expected behavior

---

### 4. How does successfully implemented task feedback new context?

#### Current Design

**After Feature Completion:**

Coding agent should:
1. ✅ Run test command → tests pass
2. ✅ Create git commit
3. ✅ Update `features.json` (status: "completed", commitHash: "abc123")
4. ✅ Update `claude-progress.txt` (add to recent activity)
5. ✅ Return to Controller

**Issue:** How exactly are files updated?

#### Proposed Feedback Mechanism

**Step-by-Step Feedback:**

```
Coding Agent completes feature-016:

1. Implementation done
   └─ Code written to src/server/services/SessionManager.ts

2. Run test command
   └─ $ npm run test:unit -- SessionManager
   └─ ✅ Tests pass

3. Create git commit
   └─ $ git add src/server/services/SessionManager.ts
   └─ $ git add test/unit/server/SessionManager.test.ts (if modified)
   └─ $ git commit -m "feat: SessionManager.isInCooldown() - cooldown checking

       Feature ID: feature-016
       File: src/server/services/SessionManager.ts
       Phase: Phase 1 - Server Foundation

       Implements cooldown checking logic for browser sessions.
       Returns true if current time is before cooldown expiration.

       Test: npm run test:unit -- SessionManager
       Status: ✅ Tests passing

       Co-Authored-By: Server Agent <noreply@anthropic.com>"

4. Get commit hash
   └─ $ git rev-parse HEAD
   └─ abc123f4567890abcdef1234567890abcdef12

5. Update features.json
   └─ Read avc/tracking/features.json
   └─ Find feature-016
   └─ Update:
      {
        "id": "feature-016",
        "status": "completed",  // was "in_progress"
        "completedAt": "2026-01-19T15:30:00Z",
        "gitCommit": "abc123f"
      }
   └─ Write avc/tracking/features.json

6. Update claude-progress.txt
   └─ Read avc/tracking/claude-progress.txt
   └─ Update "Recent Activity" section:
      [2026-01-19 15:30:00] ✅ feature-016 COMPLETED
        SessionManager.isInCooldown() - cooldown checking
        File: src/server/services/SessionManager.ts
        Test: npm run test:unit -- SessionManager
        Commit: abc123f

   └─ Update summary:
      Completed: 16 (was 15)
      In Progress: 0 (was 1)

   └─ Write avc/tracking/claude-progress.txt

7. Commit tracking updates
   └─ $ git add avc/tracking/features.json
   └─ $ git add avc/tracking/claude-progress.txt
   └─ $ git commit -m "track: Mark feature-016 as completed"

8. Return to Controller
   └─ Report: "feature-016 completed, commit abc123f"
```

**Atomic Updates:**

CRITICAL: Git commits ensure atomicity:
- Feature implementation → git commit #1
- Tracking updates → git commit #2

If agent crashes between commits:
- Feature code is committed (safe)
- Tracking files not updated (can be fixed manually)
- Next session: Check git log, update tracking files

**Recovery Mechanism:**

If tracking files become out of sync:
```bash
# Script to sync tracking files with git history
git log --oneline --grep="^feat:" | while read commit msg; do
  # Extract feature ID from commit message
  feature_id=$(echo "$msg" | grep -oP 'Feature ID: \K[^,]+')

  # Update features.json if not marked complete
  # ...
done
```

---

## Recommended Workflow Changes

### Before Creating features.json

**Add these fields to feature definitions:**

```json
{
  "id": "feature-016",
  "name": "SessionManager.isInCooldown() - cooldown checking",
  "description": "...",
  "file": "src/server/services/SessionManager.ts",
  "testCommand": "npm run test:unit -- SessionManager",
  "status": "pending",  // or "in_progress", "completed", "blocked"
  "dependencies": ["feature-015"],
  "estimatedMinutes": 15,
  "completedAt": null,
  "gitCommit": null,

  // NEW FIELDS:
  "contextFiles": [  // Files coding agent should read
    "src/server/services/SessionManager.ts",
    "src/server/types/session.ts",
    "test/unit/server/SessionManager.test.ts"
  ],
  "relatedFeatures": [  // Features to reference
    "feature-015",  // Previous in sequence
    "feature-017"   // Next in sequence
  ],
  "agentType": "server",  // Which specialized agent to use
  "phase": "phase-1"
}
```

### Controller Agent Protocol

**Enhanced startup:**

```
Controller Agent Session:

1. Check for concurrent controllers
   └─ Check for avc/tracking/.lock file
   └─ If exists: wait or exit

2. Read progress files
   └─ Read avc/tracking/claude-progress.txt
   └─ Read avc/tracking/features.json
   └─ Review git log --oneline -10

3. Verify baseline
   └─ Run npm run build
   └─ Run npm run test:unit
   └─ Ensure tests pass before proceeding

4. Select next feature
   └─ Use selection logic (see above)
   └─ If no features available: report completion

5. Mark feature in-progress
   └─ Update features.json: status="in_progress"
   └─ Write features.json
   └─ Git commit: "lock: Start feature-XXX"

6. Spawn coding agent
   └─ Use Task tool
   └─ Pass feature context
   └─ Wait for completion

7. Verify completion
   └─ Check git log for feature commit
   └─ Check features.json updated
   └─ Check tests still pass

8. Select next feature (repeat from step 4)
```

---

## Potential Issues & Mitigations

### Issue 1: Context Overflow

**Problem:** Coding agents receive too much context, waste tokens

**Mitigation:**
- Provide only essential files in context
- Use "contextFiles" field to limit scope
- Agents can read additional files if needed

### Issue 2: Parallel Execution

**Problem:** User might run multiple Controllers simultaneously

**Mitigation:**
- Document: "Run ONE Controller at a time"
- Use file locking: `.lock` file
- Git push failures indicate conflicts

### Issue 3: Incomplete Updates

**Problem:** Agent crashes mid-update, tracking files out of sync

**Mitigation:**
- Git commits ensure feature code is safe
- Recovery script can sync tracking files from git log
- Manual review of claude-progress.txt catches issues

### Issue 4: Dependency Violations

**Problem:** Agent starts feature before dependencies complete

**Mitigation:**
- Controller enforces dependency checking
- features.json dependencies field is authoritative
- Selection logic filters out features with unmet deps

### Issue 5: Test Failures

**Problem:** Agent implements feature but tests fail

**Mitigation:**
- Agent retries (max 3 attempts)
- If still failing: mark as "blocked"
- Update claude-progress.txt with blocker note
- Controller skips blocked features

---

## Summary & Recommendations

### 1. Subagent Creation
- ✅ Use Task tool with "general-purpose" subagent_type
- ✅ Pass feature context in prompt
- ✅ Controller selects features, agents implement

### 2. Conflict Prevention
- ✅ Mark status "in_progress" BEFORE spawning agent
- ✅ Use git commits for atomic updates
- ✅ Run ONE Controller at a time (document this)
- ✅ File locking optional but recommended

### 3. Context Delivery
- ✅ Provide feature-specific context (minimal)
- ✅ Include contextFiles list for agent to read
- ✅ Agents discover additional context as needed
- ✅ Avoid overwhelming agents with full codebase

### 4. Feedback Mechanism
- ✅ Two-commit approach: feature + tracking
- ✅ Git log is source of truth
- ✅ Tracking files can be reconstructed if needed
- ✅ claude-progress.txt is human-readable audit log

### Next Steps

1. ✅ Add "contextFiles" and "agentType" to feature definitions
2. ✅ Create Controller Agent prompt with enhanced protocol
3. ✅ Create recovery script for syncing tracking files
4. ✅ Document "ONE Controller at a time" rule
5. ✅ Generate features.json with enhanced fields

**Status:** Ready to proceed with features.json generation after incorporating these enhancements.
