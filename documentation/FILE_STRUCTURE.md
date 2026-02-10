# Feature Tracking File Structure Analysis

**Date:** 2026-01-19
**Question:** Single features.json vs individual files per feature?


## Option 1: Single features.json File (Current Design)

### Structure

```
avc/tracking/
├── features.json          # ALL 247 features in one file
├── claude-progress.txt
└── init.sh
```

**File size:** ~50-100 KB (247 features × ~200-400 bytes each)

### Implementation

```json
{
  "projectName": "BWS X SDK Remote Sessions",
  "totalFeatures": 247,
  "completedFeatures": 96,
  "phases": [
    {
      "phaseId": "phase-1",
      "features": [
        {
          "id": "feature-001",
          "status": "completed",
          "name": "...",
          "gitCommit": "abc123"
        },
        {
          "id": "feature-002",
          "status": "pending",
          "name": "..."
        }
        // ... 245 more features
      ]
    }
  ]
}
```

### Read Operations

```bash
# Controller selects next feature
cat avc/tracking/features.json | jq '.phases[].features[] | select(.status=="pending") | select(.dependencies | all(. as $dep | any(.phases[].features[]; .id==$dep and .status=="completed")))'

# Get progress summary
cat avc/tracking/features.json | jq '{total: .totalFeatures, completed: .completedFeatures}'

# Check specific feature
cat avc/tracking/features.json | jq '.phases[].features[] | select(.id=="feature-016")'
```

### Write Operations

```bash
# Update feature status (PROBLEMATIC)
jq '(.phases[].features[] | select(.id=="feature-016")) |= .status="in_progress"' features.json > temp.json && mv temp.json features.json

# Problem: Race condition if two agents write simultaneously
```

### Pros ✅

1. **Simple to query**: One file read gets all features
2. **Easy to calculate totals**: Sum completed/pending in one pass
3. **Atomic view**: See entire project state at once
4. **Small disk footprint**: One file vs 247 files
5. **Easy to version control**: One file in git history
6. **Simple for humans**: cat features.json | jq queries

### Cons ❌

1. **Concurrent write conflicts**: Two agents can't update simultaneously
   - Agent A updates feature-016
   - Agent B updates feature-017
   - Both read → modify → write
   - **Second write clobbers first write** 💥

2. **File locking required**: Need explicit locking mechanism
   ```bash
   flock avc/tracking/features.json.lock -c "jq ... > features.json"
   ```

3. **Large file rewrites**: Every update rewrites entire 100KB file
   - Inefficient for single feature updates
   - Risk of corruption if write interrupted

4. **Git conflicts**: If multiple sessions run in parallel
   - Session A: git commit features.json (feature-016 done)
   - Session B: git commit features.json (feature-017 done)
   - **Merge conflict** when pulling

5. **No feature-level history**: Git shows "features.json updated" not "feature-016 completed"

6. **Harder to parallelize**: Can't safely run multiple Controllers

### Risk Assessment: 🔴 HIGH

**Parallel execution:** UNSAFE without explicit locking
**Recovery from crashes:** File corruption risk
**Scalability:** Poor (grows linearly with features)


## Option 2: Individual Files Per Feature

### Structure

```
avc/tracking/
├── features/
│   ├── phase-1/
│   │   ├── feature-001.json
│   │   ├── feature-002.json
│   │   ├── feature-003.json
│   │   └── ... (68 files)
│   ├── phase-2/
│   │   ├── feature-069.json
│   │   └── ... (35 files)
│   ├── phase-3/
│   │   └── ... (22 files)
│   ├── phase-4/
│   │   └── ... (28 files)
│   ├── phase-5/
│   │   └── ... (48 files)
│   ├── phase-6/
│   │   └── ... (30 files)
│   └── phase-7/
│       └── ... (17 files)
├── index.json              # Lightweight index/summary
├── claude-progress.txt
└── init.sh
```

**Total files:** 247 feature files + 1 index = 248 files

### Individual Feature File

```json
{
  "id": "feature-016",
  "name": "SessionManager.isInCooldown() - cooldown checking",
  "description": "Implement cooldown checking logic for browser sessions",
  "phase": "phase-1",
  "file": "src/server/services/SessionManager.ts",
  "testCommand": "npm run test:unit -- SessionManager",
  "status": "pending",
  "dependencies": ["feature-015"],
  "estimatedMinutes": 15,
  "completedAt": null,
  "gitCommit": null,
  "contextFiles": [
    "src/server/services/SessionManager.ts",
    "src/server/types/session.ts"
  ],
  "agentType": "server",
  "relatedFeatures": ["feature-015", "feature-017"]
}
```

**File size:** ~400-800 bytes each

### Index File (Lightweight)

```json
{
  "projectName": "BWS X SDK Remote Sessions",
  "totalFeatures": 247,
  "completedFeatures": 96,
  "phases": [
    {
      "phaseId": "phase-1",
      "phaseName": "Server Foundation",
      "totalFeatures": 68,
      "completedFeatures": 68,
      "featureFiles": "avc/tracking/features/phase-1/"
    }
  ],
  "lastUpdated": "2026-01-19T15:30:00Z"
}
```

### Read Operations

```bash
# Controller selects next feature
for file in avc/tracking/features/phase-*/*.json; do
  status=$(jq -r '.status' "$file")
  if [ "$status" == "pending" ]; then
    # Check dependencies met
    # Select this feature
    echo "$file"
    break
  fi
done

# Get progress summary (read index)
cat avc/tracking/index.json | jq '{total: .totalFeatures, completed: .completedFeatures}'

# Check specific feature (direct read)
cat avc/tracking/features/phase-1/feature-016.json
```

### Write Operations

```bash
# Update feature status (SAFE - no conflicts)
jq '.status="in_progress" | .updatedAt="2026-01-19T15:30:00Z"' \
  avc/tracking/features/phase-1/feature-016.json > temp.json \
  && mv temp.json avc/tracking/features/phase-1/feature-016.json

# Update index (separate operation)
# Recalculate totals by counting files
completed=$(find avc/tracking/features -name "*.json" -exec jq -r '.status' {} \; | grep -c "completed")
jq ".completedFeatures=$completed" avc/tracking/index.json > temp.json \
  && mv temp.json avc/tracking/index.json
```

### Pros ✅

1. **No write conflicts**: Each feature = separate file
   - Agent A updates feature-016.json
   - Agent B updates feature-017.json
   - **No conflict** ✅

2. **Atomic updates**: File write is atomic at filesystem level
   - Write to temp file → rename to final name
   - Rename is atomic on POSIX systems

3. **Parallel execution safe**: Multiple agents can run simultaneously
   - Each agent locks different feature file
   - Natural parallelism

4. **Clear git history**: Each commit shows specific feature
   ```
   git log --oneline avc/tracking/features/phase-1/feature-016.json
   abc123 feat: Mark feature-016 as completed
   def456 lock: Mark feature-016 as in_progress
   ```

5. **File-based locking**: File presence = lock
   ```bash
   # Agent "locks" feature by creating in-progress marker
   touch avc/tracking/features/phase-1/.feature-016.lock
   # ... work on feature ...
   rm avc/tracking/features/phase-1/.feature-016.lock
   ```

6. **Easy recovery**: Corrupted file affects only one feature
   - Single file corruption = lose 1/247 of data
   - vs single file corruption = lose ALL data

7. **Selective reading**: Only read files you need
   - Controller reads index + next few pending features
   - Not all 247 features

8. **Better git diffs**: See exactly what changed
   ```diff
   diff --git a/avc/tracking/features/phase-1/feature-016.json
   -  "status": "pending"
   +  "status": "completed"
   +  "completedAt": "2026-01-19T15:30:00Z"
   +  "gitCommit": "abc123f"
   ```

9. **Scalability**: Scales to 1000+ features without degradation

### Cons ❌

1. **More files**: 247 files vs 1 file
   - Clutter in file tree
   - Mitigation: Organized by phase

2. **More disk operations**: Read multiple files for summary
   - Query all pending features = 247 file reads
   - Mitigation: Use index.json for summaries

3. **Index maintenance**: Need to update index.json
   - After each feature completion, recalculate totals
   - Potential for index to become stale

4. **Complexity**: More complex to implement
   - Need directory creation
   - Need index update logic
   - Need file iteration logic

5. **Disk space**: More inodes used
   - 247 files × 4KB block size = ~1MB (vs 100KB for single file)
   - Negligible on modern systems

### Risk Assessment: 🟢 LOW

**Parallel execution:** SAFE (natural file-level locking)
**Recovery from crashes:** Isolated to single feature
**Scalability:** Excellent (constant-time updates)


## Option 3: Hybrid Approach

### Structure

```
avc/tracking/
├── features/
│   ├── phase-1/
│   │   ├── feature-001.json
│   │   └── ... (individual files)
│   └── ... (other phases)
├── index.json              # Fast summary queries
├── cache/
│   ├── pending.json        # Cached list of pending features
│   └── completed.json      # Cached list of completed features
├── claude-progress.txt
└── init.sh
```

### How It Works

**Individual files for updates:**
- Each feature update touches only one file
- No write conflicts

**Index for fast queries:**
- Updated after each feature completion
- Provides totals, phase summaries

**Cache files for common queries:**
- `pending.json`: List of all pending features (regenerated on demand)
- `completed.json`: List of all completed features
- Controller reads cache instead of scanning 247 files

### Cache Update Strategy

**On feature completion:**
```bash
# 1. Update individual feature file
jq '.status="completed"' feature-016.json > temp && mv temp feature-016.json

# 2. Update index
jq '.completedFeatures += 1' index.json > temp && mv temp index.json

# 3. Regenerate cache (async, optional)
./scripts/rebuild-cache.sh &
```

**Cache rebuild (fast):**
```bash
#!/bin/bash
# Rebuild pending.json and completed.json
find avc/tracking/features -name "*.json" | while read file; do
  status=$(jq -r '.status' "$file")
  if [ "$status" == "pending" ]; then
    jq -c '.' "$file" >> pending.json.tmp
  elif [ "$status" == "completed" ]; then
    jq -c '.' "$file" >> completed.json.tmp
  fi
done

mv pending.json.tmp cache/pending.json
mv completed.json.tmp cache/completed.json
```

### Pros ✅

**Combines benefits of both approaches:**
- ✅ No write conflicts (individual files)
- ✅ Fast queries (cached summaries)
- ✅ Parallel execution safe
- ✅ Clear git history
- ✅ Easy recovery

### Cons ❌

- More complexity (cache management)
- Cache can become stale (need rebuild)
- More files (features + index + cache)


## Comparison Matrix

| Aspect | Single File | Individual Files | Hybrid |
|--------|-------------|------------------|--------|
| **Write Conflicts** | ❌ High risk | ✅ No conflicts | ✅ No conflicts |
| **Parallel Execution** | ❌ Unsafe | ✅ Safe | ✅ Safe |
| **Query Speed** | ✅ Fast (1 read) | ❌ Slow (247 reads) | ✅ Fast (cache) |
| **Git History** | ❌ Opaque | ✅ Clear | ✅ Clear |
| **Recovery** | ❌ All or nothing | ✅ Isolated | ✅ Isolated |
| **Complexity** | ✅ Simple | ⚠️ Moderate | ❌ Complex |
| **Disk Usage** | ✅ Minimal | ⚠️ Higher | ❌ Highest |
| **Scalability** | ❌ Poor | ✅ Excellent | ✅ Excellent |
| **File Count** | ✅ 1 file | ⚠️ 247 files | ❌ 250+ files |


## Detailed Scenario Analysis

### Scenario 1: Normal Operation (Sequential)

**User runs ONE Controller, features completed sequentially**

**Single File:**
- ✅ Works fine
- No conflicts
- Simple queries

**Individual Files:**
- ✅ Works fine
- Slightly more disk I/O
- Clear history

**Winner:** Tie (both work well)


### Scenario 2: Parallel Controllers (Risky but useful)

**User accidentally runs TWO Controllers simultaneously**

**Single File:**
```bash
Controller A:
1. Read features.json
2. Select feature-016
3. Update features.json (feature-016 = "in_progress")
4. Write features.json

Controller B (simultaneous):
1. Read features.json (sees feature-016 as "pending" if A hasn't written yet)
2. Select feature-016 (DUPLICATE!)
3. Update features.json (feature-016 = "in_progress")
4. Write features.json (OVERWRITES A's changes!)

Result: ❌ Both agents work on feature-016
```

**Individual Files:**
```bash
Controller A:
1. Scan features/phase-1/
2. Select feature-016.json
3. Update feature-016.json → "in_progress"
4. Write feature-016.json

Controller B (simultaneous):
1. Scan features/phase-1/
2. See feature-016.json status="in_progress" → SKIP
3. Select feature-017.json
4. Update feature-017.json → "in_progress"

Result: ✅ A works on feature-016, B works on feature-017 (parallel!)
```

**Winner:** Individual Files (enables parallelism)


### Scenario 3: Feature Completion

**Agent completes feature, updates tracking**

**Single File:**
```bash
1. Read features.json (100KB)
2. Parse JSON
3. Find feature-016
4. Update status
5. Regenerate JSON
6. Write features.json (100KB) ← Full file rewrite
7. Git commit (100KB diff)
```

**Individual Files:**
```bash
1. Read feature-016.json (500 bytes)
2. Parse JSON
3. Update status
4. Write feature-016.json (500 bytes) ← Only this file
5. Git commit (500 byte diff)
```

**Winner:** Individual Files (less I/O, cleaner commits)


### Scenario 4: Query All Pending Features

**Controller needs to select next feature**

**Single File:**
```bash
cat features.json | jq '.phases[].features[] | select(.status=="pending")'
# One file read, fast query
```

**Individual Files (no cache):**
```bash
for file in features/phase-*/*.json; do
  if [ "$(jq -r '.status' "$file")" == "pending" ]; then
    cat "$file"
  fi
done
# 247 file reads, slow
```

**Individual Files (with cache):**
```bash
cat cache/pending.json
# One file read, fast query
```

**Winner:** Single File OR Hybrid (both fast)


### Scenario 5: Crash During Update

**Agent crashes while writing feature completion**

**Single File:**
```bash
1. Agent reads features.json
2. Agent updates feature-016 in memory
3. Agent writes features.json
   → CRASH during write
   → File corrupted or partially written
   → ALL 247 features lost or corrupted ❌
```

**Individual Files:**
```bash
1. Agent reads feature-016.json
2. Agent updates in memory
3. Agent writes to temp file
4. Agent renames temp → feature-016.json
   → CRASH during rename
   → Either old file OR new file exists
   → Only feature-016 affected, other 246 features safe ✅
```

**Winner:** Individual Files (isolated failure)


## Implementation Complexity

### Single File Implementation

```bash
# Initializer creates features.json
cat > avc/tracking/features.json << 'EOF'
{
  "totalFeatures": 247,
  "phases": [ ... ]
}
EOF
```

**Lines of code:** ~50 lines (simple)


### Individual Files Implementation

```bash
# Initializer creates directory structure
mkdir -p avc/tracking/features/phase-{1..7}

# Create 247 individual files
for feature in "${features[@]}"; do
  cat > "avc/tracking/features/phase-$phase/feature-$id.json" << EOF
{
  "id": "$id",
  "name": "$name",
  ...
}
EOF
done

# Create index
cat > avc/tracking/index.json << 'EOF'
{
  "totalFeatures": 247,
  "completedFeatures": 0
}
EOF
```

**Lines of code:** ~150 lines (moderate complexity)


## Recommendation

### For BWS X SDK Remote Sessions Project

**Recommended:** **Individual Files Per Feature** (Option 2)

**Rationale:**

1. **Safety First**: No risk of write conflicts
   - Current design assumes "ONE Controller at a time"
   - But humans make mistakes
   - Individual files provide safety net

2. **Clear Git History**: See exactly what changed
   - "feat: Complete feature-016" shows one file changed
   - vs "update features.json" is opaque

3. **Recovery**: Isolated failures
   - One corrupted file = 1 feature lost
   - vs entire tracking system lost

4. **Scalability**: Project might grow
   - 247 features now
   - Might add more phases later
   - Individual files scale better

5. **Parallel Potential**: Future enhancement
   - Might want to run multiple agents later
   - Individual files enable this

**Trade-offs Accepted:**

- More files in repo (247 vs 1)
  - Acceptable: organized in phase folders
- Slightly more complex queries
  - Acceptable: can add index.json for summaries
- More disk space (~1MB vs 100KB)
  - Negligible on modern systems

**Implementation Plan:**

1. Create `avc/tracking/features/phase-{1..7}/` directories
2. Generate 247 individual `.json` files
3. Create `avc/tracking/index.json` for summaries
4. Optional: Add cache files later if query performance becomes issue


## Alternative: Start Simple, Migrate Later

**Phase 1:** Use single `features.json` (simple)
- Implement with file locking
- Document "ONE Controller at a time" rule
- Get system working

**Phase 2:** Migrate to individual files (if needed)
- If conflicts occur
- If parallel execution desired
- Migration script:
  ```bash
  jq '.phases[].features[]' features.json | while read feature; do
    id=$(echo "$feature" | jq -r '.id')
    phase=$(echo "$feature" | jq -r '.phase')
    echo "$feature" > "features/$phase/$id.json"
  done
  ```

**Pros:**
- Start with simpler implementation
- Migrate only if needed
- Learn from experience

**Cons:**
- Migration effort later
- Risk of conflicts in Phase 1
- Git history less clear initially


## Final Decision Matrix

| Criteria | Weight | Single File | Individual Files | Hybrid |
|----------|--------|-------------|------------------|--------|
| Safety (no conflicts) | 🔴 High | 3/10 | 10/10 | 10/10 |
| Simplicity | 🟡 Medium | 10/10 | 6/10 | 3/10 |
| Git history clarity | 🟡 Medium | 4/10 | 10/10 | 10/10 |
| Query performance | 🟡 Medium | 10/10 | 5/10 | 10/10 |
| Recovery | 🔴 High | 2/10 | 10/10 | 10/10 |
| Scalability | 🟢 Low | 5/10 | 10/10 | 10/10 |
| **Weighted Score** | | **4.8** | **8.7** | **8.2** |

**Winner: Individual Files (Option 2)**


## Next Steps

**If choosing Individual Files:**

1. Update ARCHITECTURE.md to reflect file-per-feature approach
2. Create directory structure generator in Initializer
3. Create helper scripts:
   - `scripts/query-pending.sh` - Find next pending feature
   - `scripts/rebuild-index.sh` - Regenerate index.json
   - `scripts/feature-status.sh` - Check specific feature
4. Generate 247 individual feature files

**If choosing Single File:**

1. Add explicit file locking to ARCHITECTURE.md
2. Document "ONE Controller at a time" requirement
3. Create recovery script for file corruption
4. Generate single features.json file

**Decision needed:** Which approach should we use?
