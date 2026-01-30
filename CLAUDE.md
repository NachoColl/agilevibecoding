# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

**Agile Vibe Coding (AVC)** is a framework for managing agent-based software development projects. This repository contains:

1. **npm CLI package** (`src/`) - Interactive command-line tool for running AVC ceremonies
2. **Documentation website** (root level) - VitePress-powered documentation site

**This is a framework/CLI tool repository**, not a sample application. It provides:
- An npm package (`@agile-vibe-coding/avc`) published to npm registry
- Public documentation at https://agilevibecoding.org
- CLI commands that users run to initialize and manage their AVC projects

---

## Repository Structure

```
agilevibecoding/
├── src/                      # npm CLI package source
│   ├── cli/                  # CLI implementation
│   │   ├── index.js          # Entry point (REPL)
│   │   ├── init.js           # /init command (setup project structure)
│   │   ├── repl-ink.js       # Interactive REPL UI (React Ink)
│   │   ├── template-processor.js  # Sponsor Call ceremony logic
│   │   ├── llm-provider.js   # Multi-model LLM abstraction
│   │   ├── llm-claude.js     # Claude provider implementation
│   │   └── llm-gemini.js     # Gemini provider implementation
│   ├── tests/                # Vitest test suite
│   │   ├── unit/             # Unit tests
│   │   └── integration/      # Integration tests
│   ├── package.json          # npm package configuration
│   └── vitest.config.js      # Test configuration
│
├── docs/                     # VitePress documentation site
│   ├── .vitepress/           # VitePress config and theme
│   │   ├── config.mts        # Site configuration
│   │   └── theme/            # Custom theme with CSS
│   ├── public/               # Static assets (logo, CNAME)
│   ├── index.md              # Home page (auto-synced from README.md)
│   ├── commands.md           # CLI commands reference (auto-synced)
│   ├── install.md            # Installation guide (auto-synced)
│   └── contribute.md         # Contributing guide (auto-synced)
│
├── README.md                 # Framework manifesto and overview
├── COMMANDS.md               # CLI commands reference
├── INSTALL.md                # Installation instructions
├── CONTRIBUTING.md           # Contributing guidelines
├── package.json              # Root package.json for VitePress
└── .github/workflows/        # GitHub Actions
    └── deploy-pages.yml      # Auto-deploy docs to GitHub Pages
```

---

## Key Components

### 1. npm CLI Package (`src/`)

The CLI is an **interactive REPL** built with React Ink that provides commands for managing AVC projects.

**Main commands:**
- `/init` - Create AVC project structure (`.avc/` folder, config files, `.env` template)
- `/sponsor-call` - Run Sponsor Call ceremony (AI-powered project initialization questionnaire)
- `/status` - Show project status
- `/help`, `/version`, `/exit` - Utility commands

**Architecture:**
- **Entry point:** `src/cli/index.js` - Starts REPL only (no direct command execution)
- **REPL UI:** `src/cli/repl-ink.js` - React Ink components for interactive interface
- **Ceremonies:** `src/cli/template-processor.js` - Implements Sponsor Call ceremony workflow
- **LLM providers:** Multi-model abstraction supporting Claude and Gemini
- **Testing:** Vitest with unit and integration tests (128 tests)

**Dependencies:**
- `@anthropic-ai/sdk` - Claude API client
- `@google/genai` - Gemini API client
- `ink` + `react` - Terminal UI framework
- `dotenv` - Environment variable management
- `vitest` - Testing framework

### 2. Documentation Website (VitePress)

**Location:** Root level + `docs/` folder

**Source files (root level):**
- `README.md` - Framework manifesto and overview
- `COMMANDS.md` - CLI commands reference
- `INSTALL.md` - Installation instructions
- `CONTRIBUTING.md` - Contributing guidelines

**Build system:**
- `npm run docs:sync` - Copy markdown files from root to `docs/` and transform links
- `npm run docs:build` - Build static site to `docs/.vitepress/dist`
- `npm run docs:preview` - Preview built site locally
- `npm run docs:dev` - Development server with live reload

**Deployment:**
- GitHub Actions workflow (`.github/workflows/deploy-pages.yml`)
- Triggers on push to master when documentation files change
- Deploys to GitHub Pages at https://agilevibecoding.org
- Custom domain configured via `docs/public/CNAME`

---

## Development Workflow

### Working on CLI Code

**Location:** `src/` folder

```bash
# Navigate to src folder
cd src

# Install dependencies
npm install

# Run tests
npm test                    # Run all tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report

# Test CLI locally
node cli/index.js           # Start REPL
```

**When modifying CLI:**
1. Make changes to files in `src/cli/`
2. Run tests: `npm test`
3. Test manually: `node cli/index.js`
4. Commit changes when all tests pass
5. Publish to npm: `npm version [patch|minor|major]` → `npm publish` (from `src/`)

### Working on Documentation

**Location:** Root level markdown files

```bash
# Edit source files
vim README.md               # Framework overview
vim COMMANDS.md             # CLI commands reference
vim INSTALL.md              # Installation guide
vim CONTRIBUTING.md         # Contributing guide

# Build and preview
npm run docs:build          # Build site
npm run docs:preview        # Preview at http://localhost:4173

# Or use development mode
npm run docs:dev            # Live reload at http://localhost:5173
```

**Sync workflow:**
- Edit markdown files in root directory (README.md, COMMANDS.md, etc.)
- Run `npm run docs:sync` to copy to `docs/` and transform internal links
- Run `npm run docs:build` to build static site
- Push to master → GitHub Actions deploys to https://agilevibecoding.org

**Link transformation:**
- `](README.md#anchor)` → `](/#anchor)` in commands.md
- `](COMMANDS.md)` → `](/commands)` in other files
- `](INSTALL.md)` → `](/install)` in other files
- `](CONTRIBUTING.md)` → `](/contribute)` in other files

### Working on Styling

**Custom CSS:** `docs/.vitepress/theme/custom.css`

Current styling features:
- Hierarchical heading colors with left borders (h2=blue, h3=green, h4=orange, h5=purple, h6=pink)
- Dark mode adjustments for all heading colors
- Diagram sizing and fullscreen support (vitepress-plugin-diagrams)

After CSS changes:
1. Edit `docs/.vitepress/theme/custom.css`
2. Run `npm run docs:build` to rebuild
3. Commit both `custom.css` and `custom.min.css`

---

## Testing

**Test suite:** Vitest (v2.1.9)
**Test count:** 128 tests total

```bash
cd src
npm test                    # Run all tests
npm run test:coverage       # With coverage report
```

**Test files:**
- `tests/unit/init.test.js` - Project initialization tests
- `tests/unit/llm-provider.test.js` - LLM provider factory tests
- `tests/unit/llm-claude.test.js` - Claude provider tests
- `tests/unit/llm-gemini.test.js` - Gemini provider tests
- `tests/integration/init-with-provider.test.js` - Integration tests
- `tests/integration/template-with-llm.test.js` - Template processor tests

**All tests must pass before publishing to npm.**

---

## Publishing

### Publishing CLI to npm

```bash
cd src

# Update version (creates git tag)
npm version patch           # 0.1.0 → 0.1.1
npm version minor           # 0.1.1 → 0.2.0
npm version major           # 0.2.0 → 1.0.0

# Publish to npm (runs tests automatically via prepublishOnly)
npm publish

# Push git tags
git push --follow-tags
```

**Package name:** `@agile-vibe-coding/avc`
**Registry:** https://www.npmjs.com/package/@agile-vibe-coding/avc

### Publishing Documentation

**Automatic deployment:**
- Push to master
- GitHub Actions workflow runs automatically
- Deploys to https://agilevibecoding.org

**Manual trigger:**
- Go to Actions tab on GitHub
- Run "Deploy GitHub Pages" workflow manually

---

## Important Notes

### This is NOT a Sample Application

- This repository IS the framework/CLI tool itself
- Users install the CLI via `npm install -g @agile-vibe-coding/avc`
- Users run CLI commands in their own projects
- Don't add sample project code here

### Framework Philosophy

From README.md:

> AVC does not replace your current AI coding tools. AVC adds an extra layer of control over the progress of the project lifetime. Just as real-world complex software requires multiple layers of knowledge and management we need a similar approach when working with AI agents—which may still struggle with the long term. AVC provides the organizational structure that sits above your day-to-day coding tools, ensuring long-term coherence and progress tracking.

The framework uses:
- Hierarchical work items (Epic → Story → Task → Subtask)
- Context inheritance via `context.md` files
- LLM-powered ceremonies (starting with Sponsor Call)
- Multi-model LLM support (Claude, Gemini)

### Documentation Folders

**Active:**
- `docs/` - VitePress site (synced from root markdown files)
- Root markdown files (README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md)

**Legacy (may be outdated):**
- `documentation/` - Old conceptual documentation (not currently used)

Focus on root markdown files and `docs/` for active documentation.

---

## Common Tasks

### Update CLI command

1. Edit `src/cli/[command-file].js`
2. Update tests in `src/tests/`
3. Run `npm test` to verify
4. Update `COMMANDS.md` with new behavior
5. Commit changes

### Update documentation

1. Edit root markdown file (README.md, COMMANDS.md, etc.)
2. Run `npm run docs:sync` to copy to docs/
3. Run `npm run docs:build` to build site
4. Commit both root file and docs/ version
5. Push to master → auto-deploys

### Update CSS styling

1. Edit `docs/.vitepress/theme/custom.css`
2. Run `npm run docs:build`
3. Commit `custom.css` and `custom.min.css`
4. Push to master → auto-deploys

### Add new LLM provider

1. Create `src/cli/llm-[provider].js` following existing pattern
2. Update `src/cli/llm-provider.js` factory
3. Add tests in `src/tests/unit/llm-[provider].test.js`
4. Update `src/package.json` dependencies
5. Run `npm test` to verify

---

## Version

CLI Version: 0.1.0
Documentation: https://agilevibecoding.org
Last Updated: 2026-01-30
