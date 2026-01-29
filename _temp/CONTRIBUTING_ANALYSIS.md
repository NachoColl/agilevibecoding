# CONTRIBUTING.md Analysis & Update Plan

**Date:** 2026-01-29
**Status:** PLAN (Not Implemented)

---

## Executive Summary

The current `CONTRIBUTING.md` file describes an **outdated project structure** from when AVC was a framework with bash scripts and template directories. The project has since evolved into a **modern Node.js CLI tool** written in JavaScript/TypeScript, but the contributing guide was never updated to reflect this transformation.

**Discrepancy Level:** 🔴 **CRITICAL** - Most guidance is irrelevant to actual codebase

---

## Current State vs. CONTRIBUTING.md Claims

### 1. **Programming Languages**

| CONTRIBUTING.md Claims | Actual Codebase | Status |
|------------------------|-----------------|--------|
| Bash scripting (lines 59, 164-184) | JavaScript (ESM modules) | ❌ WRONG |
| Shell scripts with `#!/bin/bash` | Node.js CLI with `#!/usr/bin/env node` | ❌ WRONG |
| Python, Go, Rust, Java examples (line 37) | No such examples exist | ❌ WRONG |
| ShellCheck for validation (line 236) | Vitest for testing | ❌ WRONG |

### 2. **Technology Stack**

| CONTRIBUTING.md Claims | Actual Stack | Status |
|------------------------|--------------|--------|
| `jq` for JSON parsing | Native JavaScript/JSON.parse() | ❌ WRONG |
| bash 3.2+ compatibility | Node.js >=18.0.0 (from package.json) | ❌ WRONG |
| No mention of npm/Node.js | npm package published to npmjs.org | ❌ MISSING |
| No testing framework mentioned | Vitest + coverage + integration tests | ❌ MISSING |
| No mention of React/Ink | React + Ink for CLI UI | ❌ MISSING |

### 3. **Project Structure**

| CONTRIBUTING.md Claims | Actual Structure | Status |
|------------------------|------------------|--------|
| `scripts/` directory at root | Does NOT exist | ❌ WRONG |
| `templates/` at root | Does NOT exist (exists at `src/cli/templates/`) | ❌ WRONG |
| `examples/` directory | Does NOT exist | ❌ WRONG |
| `prompts/` directory | Does NOT exist | ❌ WRONG |
| No mention of `src/` directory | Primary code location | ❌ MISSING |
| No mention of `docs/` for VitePress | Exists with full documentation site | ❌ MISSING |

### 4. **Development Workflow**

| CONTRIBUTING.md Claims | Actual Workflow | Status |
|------------------------|-----------------|--------|
| Test bash scripts with `bash -n` | `npm test` (Vitest) | ❌ WRONG |
| Test with ShellCheck | `npm run test:unit` / `test:integration` | ❌ WRONG |
| JSON validation with `jq empty` | No special validation needed | ❌ IRRELEVANT |
| No mention of npm scripts | 6 test scripts defined in package.json | ❌ MISSING |
| No mention of CI/CD | GitHub Actions with npm publish workflow | ❌ MISSING |

### 5. **Code Standards**

| CONTRIBUTING.md Claims | Actual Standards | Status |
|------------------------|------------------|--------|
| Bash script header format | JavaScript ESM modules | ❌ WRONG |
| `set -e` for error handling | try/catch in JavaScript | ❌ WRONG |
| POSIX compatibility | Node.js compatibility | ❌ WRONG |
| No code style guide | No ESLint/Prettier configured | ⚠️ GAP |
| No commit message format | Uses conventional commits (feat:, fix:, docs:) | ✅ CORRECT |

### 6. **What IS Correct**

| Aspect | Status |
|--------|--------|
| Git workflow (fork, branch, PR) | ✅ Still valid |
| Branch naming (feature/, docs/, fix/) | ✅ Still valid |
| Commit message prefixes (feat:, fix:, docs:) | ✅ Still valid |
| Code of Conduct | ✅ Still valid |
| Issue reporting process | ✅ Still valid |

---

## Actual Codebase Structure

```
agilevibecoding/
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml      # VitePress deployment
│       └── publish-avc.yml        # npm publish with tests
├── docs/                          # VitePress documentation site
│   ├── .vitepress/
│   │   ├── config.mts             # TypeScript config
│   │   └── theme/
│   │       ├── custom.css
│   │       └── index.ts
│   ├── commands.md                # CLI commands reference
│   ├── index.md                   # Home page (synced from README)
│   └── install.md                 # Installation guide
├── documentation/                 # Framework documentation (legacy?)
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW.md
│   └── ...
├── src/                           # ⭐ MAIN SOURCE CODE
│   ├── cli/
│   │   ├── index.js               # Entry point
│   │   ├── init.js                # /init command
│   │   ├── repl-ink.js            # React/Ink REPL UI
│   │   ├── llm-provider.js        # LLM abstraction
│   │   ├── llm-claude.js          # Claude provider
│   │   ├── llm-gemini.js          # Gemini provider
│   │   ├── logger.js              # Logging utility
│   │   ├── template-processor.js  # Template processing
│   │   └── templates/
│   │       └── project.md         # Sponsor call template
│   ├── tests/
│   │   ├── unit/                  # 5 test files, 102 tests
│   │   ├── integration/           # 2 test files, 26 tests
│   │   ├── manual/                # Manual test checklists
│   │   ├── helpers/               # Test utilities
│   │   └── fixtures/              # Test data
│   ├── package.json               # npm package config
│   └── vitest.config.js           # Test configuration
├── README.md                      # Main documentation
├── COMMANDS.md                    # CLI command reference
├── INSTALL.md                     # Installation instructions
├── CONTRIBUTING.md                # ⚠️ OUTDATED - Needs update
├── CLAUDE.md                      # Context for Claude Code AI
└── package.json                   # Root package (docs)
```

---

## Dependencies Analysis

### Runtime Dependencies (`src/package.json`)
```json
{
  "@anthropic-ai/sdk": "^0.20.0",      // Claude API
  "@google/genai": "^1.37.0",          // Gemini API
  "dotenv": "^16.4.0",                 // Environment variables
  "ink": "^5.0.1",                     // React for CLIs
  "ink-select-input": "^6.0.0",        // CLI selection UI
  "ink-spinner": "^5.0.0",             // Loading indicators
  "react": "^18.3.1"                   // React runtime
}
```

### Development Dependencies
```json
{
  "@vitest/coverage-v8": "^2.1.9",     // Test coverage
  "@vitest/ui": "^2.1.9",              // Test UI
  "vitest": "^2.1.9",                  // Test runner
  "memfs": "^4.56.10",                 // In-memory FS for tests
  "sinon": "^19.0.5",                  // Test mocking
  "@sinonjs/fake-timers": "^12.0.0"    // Time mocking
}
```

---

## Required Changes - PLAN

### Phase 1: Remove Outdated Content

**Delete/Remove:**
- [ ] Lines 59-60: "Familiarity with bash scripting"
- [ ] Lines 164-184: Entire "Bash Scripts" section
- [ ] Lines 188-194: "JSON Templates" section (not applicable)
- [ ] Lines 230-244: "Scripts" testing section (bash/shellcheck)
- [ ] Lines 248-254: "Templates" validation section (jq)
- [ ] Lines 37-38: References to Python/Go/Rust/Java examples

### Phase 2: Add JavaScript/Node.js Standards

**New Section: JavaScript Code Standards**

```markdown
### JavaScript/Node.js Standards

**Code Style:**
- Use ES modules (ESM) syntax (`import`/`export`)
- Use modern JavaScript (ES2022+)
- Follow existing naming conventions:
  - camelCase for variables and functions
  - PascalCase for classes
  - UPPER_SNAKE_CASE for constants
- Use async/await for asynchronous operations
- Avoid var, use const/let appropriately

**File Structure:**
- All source code in `src/cli/`
- Test files in `src/tests/unit/` or `src/tests/integration/`
- Follow existing file naming: kebab-case.js

**Error Handling:**
- Use try/catch blocks for async operations
- Provide helpful error messages with context
- Log errors using the Logger class

**Example module:**
```javascript
#!/usr/bin/env node
import { SomeClass } from './some-class.js';
import fs from 'fs';
import path from 'path';

export class MyFeature {
  constructor(options = {}) {
    this.option = options.option || 'default';
  }

  async performAction() {
    try {
      // Implementation
      return result;
    } catch (error) {
      console.error(`Failed to perform action: ${error.message}`);
      throw error;
    }
  }
}
```
```

### Phase 3: Add Testing Standards

**New Section: Testing Standards**

```markdown
### Testing Standards

**Test Organization:**
- Unit tests: `src/tests/unit/*.test.js`
- Integration tests: `src/tests/integration/*.test.js`
- Test helpers: `src/tests/helpers/`
- Test fixtures: `src/tests/fixtures/`

**Running Tests:**
```bash
npm test                  # Run all tests
npm run test:unit         # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:watch        # Watch mode
npm run test:coverage     # Generate coverage report
```

**Writing Tests:**
- Use Vitest framework
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies (fs, API calls)
- Test both success and error paths
- Aim for >50% code coverage on new code

**Example test:**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyFeature } from '../../cli/my-feature.js';

describe('MyFeature', () => {
  let feature;

  beforeEach(() => {
    feature = new MyFeature({ option: 'test' });
  });

  it('performs action successfully', async () => {
    const result = await feature.performAction();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('handles errors gracefully', async () => {
    vi.spyOn(feature, 'internalMethod').mockRejectedValue(
      new Error('Test error')
    );

    await expect(feature.performAction()).rejects.toThrow('Test error');
  });
});
```
```

### Phase 4: Add npm Package Contribution Guide

**New Section: npm Package Development**

```markdown
### npm Package Development

**Setup:**
```bash
cd src
npm install        # Install dependencies
npm test          # Verify tests pass
```

**Local Development:**
```bash
# Test CLI locally without publishing
npm link          # Link package globally
avc               # Run your local version

# Or run directly
node cli/index.js
```

**Before Publishing:**
- [ ] Update version in `src/package.json`
- [ ] Run `npm test` - all tests must pass
- [ ] Update CHANGELOG (if exists)
- [ ] Test CLI commands manually

**Publishing:**
- Package is auto-published to npm via GitHub Actions
- Push to `master` branch with version bump
- CI/CD runs tests and publishes if:
  - Version is new (not on npmjs.org)
  - Code changes detected (not just version bump)
  - All tests pass

**Manual publish (maintainers only):**
```bash
cd src
npm publish --access public
```
```

### Phase 5: Update Prerequisites

**Replace:**
```markdown
### Prerequisites

- Basic understanding of git and GitHub
- Node.js >= 18.0.0 and npm
- JavaScript/ES6+ knowledge
- Familiarity with async/await patterns
- Experience with LLM APIs (helpful but not required)
```

### Phase 6: Add Code Quality Tools

**New Section: Code Quality (Future)**

```markdown
### Code Quality Tools

**Planned (not yet implemented):**
- ESLint for JavaScript linting
- Prettier for code formatting
- Husky for pre-commit hooks

**Current:**
- Vitest for testing
- GitHub Actions for CI/CD
- Coverage reports (min 50% threshold)
```

### Phase 7: Update Examples Section

**Replace domain examples:**

Instead of "Create domain-specific templates - Add examples for Python, Go, Rust, Java"

Use:
```markdown
### 🎯 Examples and Use Cases

- **Improve CLI UX** - Enhance the REPL interface, add new commands
- **Add LLM Providers** - Integrate OpenAI, Cohere, or other providers
- **Extend Ceremonies** - Create new ceremony templates beyond Sponsor Call
- **Document Workflows** - Share successful project initialization patterns
```

### Phase 8: Update File References

**Find and replace throughout:**
- `scripts/` → `src/cli/`
- `templates/` → `src/cli/templates/`
- `bash script` → `JavaScript module`
- `shell` → `Node.js`

### Phase 9: Add VitePress Documentation Guide

**New Section: Documentation Contributions**

```markdown
### Documentation Standards

**VitePress Site (`docs/`):**

The documentation website is built with VitePress and auto-synced from root files.

**File Sync:**
- `README.md` → `docs/index.md`
- `COMMANDS.md` → `docs/commands.md`
- `INSTALL.md` → `docs/install.md`

**DO NOT edit files in `docs/` directly** - they are auto-generated.

**Making Documentation Changes:**
1. Edit source files at root (README.md, COMMANDS.md, INSTALL.md)
2. Run `npm run docs:sync` to update docs/
3. Test locally: `npm run docs:dev`
4. Build: `npm run docs:build`

**VitePress Configuration:**
- Config: `docs/.vitepress/config.mts` (TypeScript)
- Theme: `docs/.vitepress/theme/custom.css`
- Static assets: `docs/public/`
```

### Phase 10: Add "Contribute" Page to VitePress Website

**New VitePress Page:**

The updated CONTRIBUTING.md should be synced to the website as a new page, following the same pattern as Install and Commands.

**Implementation Steps:**

1. **Update root `package.json` docs:sync script:**
```json
"docs:sync": "cp README.md docs/index.md && cp COMMANDS.md docs/commands.md && cp INSTALL.md docs/install.md && cp CONTRIBUTING.md docs/contribute.md && sed -i 's|](README.md#|](/#|g' docs/commands.md && sed -i 's|](COMMANDS.md)|](/commands)|g' docs/install.md && sed -i 's|](INSTALL.md)|](/install)|g' docs/commands.md && sed -i 's|](CONTRIBUTING.md)|](/contribute)|g' docs/install.md"
```

2. **Update docs:watch script:**
```json
"docs:watch": "while true; do BEFORE=$(stat -c %Y README.md COMMANDS.md INSTALL.md CONTRIBUTING.md 2>/dev/null | md5sum); sleep 1; AFTER=$(stat -c %Y README.md COMMANDS.md INSTALL.md CONTRIBUTING.md 2>/dev/null | md5sum); if [ \"$BEFORE\" != \"$AFTER\" ]; then npm run docs:sync; fi; done"
```

3. **Update `docs/.vitepress/config.mts`:**
```typescript
export default defineConfig({
  // ...
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Install', link: '/install' },
      { text: 'Commands', link: '/commands' },
      { text: 'Contribute', link: '/contribute' },  // ⭐ NEW
      { text: 'GitHub', link: 'https://github.com/NachoColl/agilevibecoding' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Installation', link: '/install' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Commands', link: '/commands' }
        ]
      },
      {
        text: 'Community',                           // ⭐ NEW SECTION
        items: [
          { text: 'Contributing', link: '/contribute' }
        ]
      }
    ]
  }
});
```

4. **Files Created/Modified:**
- ✅ `CONTRIBUTING.md` (rewritten at root - source file)
- ✅ `docs/contribute.md` (auto-synced from CONTRIBUTING.md)
- ✅ `package.json` (updated sync scripts)
- ✅ `docs/.vitepress/config.mts` (added nav & sidebar)

5. **Test the Integration:**
```bash
# Sync files
npm run docs:sync

# Verify contribute.md was created
ls docs/contribute.md

# Test locally
npm run docs:dev
# Visit http://localhost:5173/contribute

# Build for production
npm run docs:build
```

6. **Link Adjustments:**

In CONTRIBUTING.md, any internal links should use relative paths that work both:
- In GitHub (viewing CONTRIBUTING.md directly)
- In VitePress (as /contribute page)

**Example:**
```markdown
See [CLI Commands](COMMANDS.md) for reference.
<!-- Will be auto-converted to [CLI Commands](/commands) by sed -->

See [Installation Guide](INSTALL.md) for setup.
<!-- Will be auto-converted to [Installation Guide](/install) -->
```

**Benefits:**
- ✅ Consistent with Install and Commands pages
- ✅ Single source of truth (CONTRIBUTING.md at root)
- ✅ Auto-synced with docs:watch during development
- ✅ Discoverable via website navigation
- ✅ Same styling as other documentation pages

---

## Migration Strategy

### Option A: Complete Rewrite (RECOMMENDED)
- Start fresh with actual tech stack
- Keep only git workflow sections
- Add comprehensive JavaScript/npm guide
- **Effort:** 4-6 hours
- **Benefit:** Clear, accurate guidance

### Option B: Incremental Update
- Remove bash sections gradually
- Add JavaScript sections alongside
- Mark deprecated sections
- **Effort:** 2-3 hours
- **Risk:** Confusion from mixed guidance

### Option C: Dual Guide
- Keep CONTRIBUTING.md for framework users
- Add CONTRIBUTING_CLI.md for CLI development
- **Effort:** 3-4 hours
- **Risk:** Maintenance burden, unclear which to follow

---

## Recommended Approach: Option A

**Rationale:**
1. Project has clearly evolved to npm CLI tool
2. Framework/bash approach is legacy
3. Clean slate prevents confusion
4. Matches actual CI/CD and codebase

**Structure:**
```markdown
# Contributing to AVC CLI

## Quick Start
- Fork and clone
- cd src && npm install
- npm test

## Ways to Contribute
- 💻 Code (JavaScript/Node.js)
- 📚 Documentation (Markdown/VitePress)
- 🐛 Bug Reports
- 🧪 Testing (Vitest)
- 🎨 UI/UX (React/Ink)

## Development Guide
- JavaScript Standards
- Testing Standards
- npm Package Development
- Documentation Updates

## Pull Request Process
[Keep existing PR template]

## Code of Conduct
[Keep existing]
```

---

## Files to Update

1. **CONTRIBUTING.md** - Complete rewrite (source file at root)
2. **package.json** - Update docs:sync and docs:watch scripts to include CONTRIBUTING.md
3. **docs/.vitepress/config.mts** - Add "Contribute" to nav and sidebar
4. **docs/contribute.md** - Auto-generated from CONTRIBUTING.md (via docs:sync)
5. **README.md** - Verify it matches current state (check "Contributing" section if exists)
6. **CLAUDE.md** - Update if it references scripts/templates/examples directories
7. **.github/PULL_REQUEST_TEMPLATE.md** - Create if doesn't exist
8. **.github/ISSUE_TEMPLATE/** - Create issue templates for bugs/features

---

## Additional Improvements (Beyond Fixing Discrepancies)

### Code Quality
- [ ] Add ESLint configuration
- [ ] Add Prettier configuration
- [ ] Add pre-commit hooks (husky)
- [ ] Add EditorConfig file

### Documentation
- [ ] Add CHANGELOG.md
- [ ] Add API documentation (JSDoc comments)
- [ ] Add architecture diagrams in docs
- [ ] Add troubleshooting guide

### Development
- [ ] Add development/debugging guide
- [ ] Document environment variables
- [ ] Add local testing instructions
- [ ] Create developer setup script

---

## Timeline Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| 1-4: Rewrite core sections | 3 hours | 🔴 Critical |
| 5-7: Add new sections | 2 hours | 🔴 Critical |
| 8-9: Update references | 1 hour | 🟡 High |
| 10: Add to VitePress website | 0.5 hours | 🔴 Critical |
| Code quality additions | 2 hours | 🟢 Medium |
| Extra documentation | 3 hours | 🟢 Medium |

**Total:** ~11.5 hours for complete update

---

## Success Criteria

- [ ] No references to bash/shell scripting
- [ ] All code examples use JavaScript/Node.js
- [ ] Testing guide uses Vitest
- [ ] File structure matches actual codebase
- [ ] Technology stack accurately described
- [ ] All links and paths are valid
- [ ] New contributors can follow guide successfully
- [ ] "Contribute" page visible on agilevibecoding.org website
- [ ] Navigation includes link to /contribute
- [ ] Page renders correctly on VitePress site
- [ ] Auto-sync from CONTRIBUTING.md works properly

---

## Questions for Maintainer

1. **Is the framework approach (bash/templates/examples) completely deprecated?**
   - If yes: Remove all references
   - If no: Create separate guide for framework vs CLI

2. **Should we add ESLint/Prettier as mandatory?**
   - Improves code consistency
   - Adds setup complexity for contributors

3. **Should CLAUDE.md also be updated?**
   - It references scripts/templates/examples directories
   - May be outdated in other ways

4. **Target audience for contributors:**
   - JavaScript developers?
   - CLI tool users wanting to add features?
   - Documentation writers?

---

**End of Analysis - Ready for Review**
