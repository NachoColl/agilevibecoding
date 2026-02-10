# Contributing to Agile Vibe Coding (AVC)

Thank you for your interest in contributing to the Agile Vibe Coding framework! 

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

## Ways to Contribute

### 💻 Code Contributions

- **Fix bugs** - Help identify and fix issues in the CLI
- **Add features** - Implement new commands or ceremonies
- **Improve UI/UX** - Enhance the React/Ink REPL interface
- **Add LLM providers** - Integrate new AI providers (OpenAI, Cohere, etc.)
- **Optimize performance** - Improve CLI speed and responsiveness

### 📚 Documentation

- **Improve docs** - Fix typos, clarify explanations, add examples
- **Write tutorials** - Create guides for specific workflows
- **Update website** - Contribute to the VitePress documentation site
- **Add API docs** - Document JavaScript modules with JSDoc

### 🐛 Bug Reports

Found a bug? [Open an issue](https://github.com/NachoColl/agilevibecoding/issues/new) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version)

### 🎯 Feature Requests

Have an idea? [Open a feature request](https://github.com/NachoColl/agilevibecoding/issues/new) with:
- Description of the feature
- Use case and benefits
- Proposed implementation approach (optional)


## Fork and Clone

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/agilevibecoding.git
   cd agilevibecoding
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/NachoColl/agilevibecoding.git
   ```

## Development Setup

### 1. Install Dependencies

The project has two `package.json` files:

**Root (documentation site):**
```bash
npm install        # Install VitePress for docs
```

**src/ (CLI application):**
```bash
cd src
npm install        # Install CLI dependencies
```

### 2. Run Tests

```bash
cd src
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
```

All tests must pass before submitting a PR.

### 3. Run CLI Locally

**Option A: Direct execution (quick testing)**
```bash
cd src
node cli/index.js
```

**Option B: Install globally (recommended for full testing)**
```bash
# Navigate to the src directory
cd src

# Install the package globally from local source
npm install -g .

# Now 'avc' command is available globally
cd ~/test-project
avc
/init
/status
/exit

# After making code changes, reinstall
cd /path/to/agilevibecoding/src
npm install -g .

# Uninstall when done testing
npm uninstall -g @agile-vibe-coding/avc
```

**Option C: Symlink with npm link (alternative)**
```bash
cd src
npm link              # Create global symlink
avc                   # Run from anywhere (auto-updates with code changes)
npm unlink -g @agile-vibe-coding/avc  # Unlink when done
```

**Which option to use:**
- **Option A** - Quick local testing without installation
- **Option B** - Full testing as end users would experience it (requires reinstall after changes)
- **Option C** - Development mode with auto-updates (but can cause issues with some IDEs)

### 4. Documentation Site

```bash
# From root directory
npm run docs:dev      # Start dev server with hot-reload
npm run docs:build    # Build for production
npm run docs:preview  # Preview production build
```

Visit `http://localhost:5173` to see the docs site.


## Code Standards

### JavaScript Style

**ES Modules (ESM):**
- Use `import`/`export` syntax (not `require`)
- File extension: `.js` (ES modules configured in package.json)
- Use `#!/usr/bin/env node` shebang for entry points

**Naming Conventions:**
- `camelCase` for variables and functions
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for constants
- `kebab-case.js` for file names

**Code Quality:**
- Use modern JavaScript (ES2022+)
- Prefer `const` over `let`, avoid `var`
- Use async/await for asynchronous operations
- Destructure objects/arrays when possible
- Add JSDoc comments for public APIs

**Example:**
```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * Processes a template file
 * @param {string} templatePath - Path to template
 * @param {Object} variables - Template variables
 * @returns {Promise<string>} Processed content
 */
export async function processTemplate(templatePath, variables) {
  try {
    const content = await fs.promises.readFile(templatePath, 'utf8');
    return replaceVariables(content, variables);
  } catch (error) {
    console.error(`Failed to process template: ${error.message}`);
    throw error;
  }
}
```

### Error Handling

- Use try/catch for async operations
- Provide helpful error messages with context
- Use the Logger class for consistent logging
- Don't swallow errors silently

**Example:**
```javascript
import { Logger } from './logger.js';

const logger = new Logger('FeatureName');

try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error);
  throw new Error(`Could not complete operation: ${error.message}`);
}
```

### File Organization

```
src/
├── cli/                    # Main source code
│   ├── index.js            # Entry point (#!/usr/bin/env node)
│   ├── repl-ink.js         # React/Ink REPL UI
│   ├── init.js             # /init command
│   ├── llm-provider.js     # LLM abstraction layer
│   ├── llm-claude.js       # Claude provider
│   ├── llm-gemini.js       # Gemini provider
│   ├── logger.js           # Logging utility
│   ├── template-processor.js
│   └── templates/
│       └── project.md      # Ceremony templates
├── tests/
│   ├── unit/               # Unit tests (*.test.js)
│   ├── integration/        # Integration tests
│   ├── helpers/            # Test utilities
│   ├── fixtures/           # Test data
│   └── manual/             # Manual test checklists
├── package.json            # npm configuration
└── vitest.config.js        # Test configuration
```

---

## Testing Guidelines

### Test Framework

We use **Vitest** for all testing:
- Unit tests for individual modules
- Integration tests for component interaction
- 50% minimum coverage threshold
- All tests run in CI/CD before merge

### Writing Tests

**Test Structure (AAA Pattern):**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyClass } from '../../cli/my-class.js';

describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    instance = new MyClass({ option: 'test' });
  });

  it('performs operation successfully', async () => {
    // Arrange
    const input = { data: 'test' };

    // Act
    const result = await instance.performOperation(input);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('handles errors gracefully', async () => {
    // Arrange
    vi.spyOn(instance, 'internalMethod').mockRejectedValue(
      new Error('Test error')
    );

    // Act & Assert
    await expect(instance.performOperation({}))
      .rejects.toThrow('Test error');
  });
});
```

### Test Coverage

- **Unit tests:** Test individual functions/classes in isolation
- **Integration tests:** Test component interaction (e.g., LLM provider + template processor)
- **Mock external dependencies:** fs, API calls, environment variables
- **Test both paths:** Success cases and error cases

**Coverage Requirements:**
- Minimum 50% line coverage
- All new code should include tests
- Critical paths should have 80%+ coverage

### Running Tests

```bash
cd src

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode (for development)
npm run test:watch

# Run specific test file
npm test tests/unit/logger.test.js
```

---

## Pull Request Process

### Before Submitting

- [ ] Fork and create a feature branch
- [ ] Make focused changes (one feature/fix per PR)
- [ ] Write/update tests for your changes
- [ ] All tests pass (`npm test`)
- [ ] Code follows style guidelines
- [ ] Update documentation if needed
- [ ] Commit messages follow conventions

### Branch Naming

```bash
git checkout -b feature/add-openai-provider
git checkout -b fix/logger-crash-on-rotation
git checkout -b _docs/improve-setup-guide
```

Conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `_docs/` - Documentation
- `refactor/` - Code refactoring
- `test/` - Test improvements

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add OpenAI provider integration

- Create llm-openai.js with OpenAI SDK
- Add OpenAI to provider factory
- Include tests for OpenAI provider
- Update INSTALL.md with OpenAI setup"
```

**Format:**
```
<type>: <short description>

<longer description with details>
<list of changes>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Testing improvements
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### PR Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Breaking change

## Changes Made
- Specific change 1
- Specific change 2
- Files modified

## Testing
- [ ] All tests pass
- [ ] Added new tests for changes
- [ ] Manual testing completed

## Related Issues
Fixes #123
```

### Review Process

1. **Automated checks** - CI/CD runs tests automatically
2. **Code review** - Maintainer reviews code quality
3. **Feedback** - Address requested changes
4. **Approval** - PR approved when ready
5. **Merge** - Maintainer merges to main

---

## npm Package Development

### Local Development

```bash
cd src

# Install dependencies
npm install

# Run tests
npm test

# Test CLI locally (choose one method):

# Method 1: Direct execution (no installation)
node cli/index.js

# Method 2: Install globally (recommended)
npm install -g .     # Install from local source
avc                  # Run from anywhere
npm install -g .     # Reinstall after code changes
npm uninstall -g @agile-vibe-coding/avc  # Uninstall when done

# Method 3: Symlink (auto-updates)
npm link            # Create global symlink
avc                 # Run your local version
npm unlink -g @agile-vibe-coding/avc  # Unlink when done
```

### Publishing (Maintainers Only)

The package is **automatically published** via GitHub Actions:

**Publish Workflow:**
1. Update version in `src/package.json`
2. Commit and push to `master` branch
3. GitHub Actions runs:
   - Check version (skip if already published)
   - Run unit tests
   - Run integration tests
   - Generate coverage report
   - Publish to npmjs.org (if tests pass)

**Manual publish (emergency only):**
```bash
cd src
npm publish --access public
```

**Version Bumping:**
```bash
cd src
npm version patch   # 0.1.0 → 0.1.1 (bug fixes)
npm version minor   # 0.1.0 → 0.2.0 (new features)
npm version major   # 0.1.0 → 1.0.0 (breaking changes)
```

---

## Documentation Contributions

### VitePress Website

The documentation site uses **VitePress** with auto-sync from root files.

**DO NOT edit files in `_docs/` directly** - they are auto-generated!

**Source Files (edit these):**
- `README.md` → synced to `_docs/index.md`
- `COMMANDS.md` → synced to `_docs/commands.md`
- `INSTALL.md` → synced to `_docs/install.md`
- `CONTRIBUTING.md` → synced to `_docs/contribute.md`

**Workflow:**
```bash
# 1. Edit source file
vim README.md

# 2. Sync to _docs/
npm run docs:sync

# 3. Test locally
npm run docs:dev
# Visit http://localhost:5173

# 4. Build for production
npm run docs:build
```

**Auto-sync During Development:**
```bash
npm run docs:dev
# Watches README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md
# Auto-syncs on file changes
```

### Markdown Style

- Use proper heading hierarchy (H1 → H2 → H3)
- Include code blocks with language hints
- Add links to related sections
- Keep lines readable (wrap at ~80-120 chars)
- Use tables for structured data
- Include examples for complex topics

---

## Code of Conduct

### Our Standards

- **Be respectful** - Treat everyone with kindness
- **Be collaborative** - Work together constructively
- **Be inclusive** - Welcome people of all backgrounds
- **Be patient** - Everyone is learning
- **Be professional** - Keep discussions focused

### Unacceptable Behavior

- Harassment or discrimination
- Personal attacks or trolling
- Publishing private information
- Spam or self-promotion
- Unprofessional conduct

### Reporting

Report Code of Conduct violations to project maintainers. All complaints will be reviewed and investigated promptly.

---

## Getting Help

### Before Asking

1. Check [documentation](https://agilevibecoding.org)
2. Search [existing issues](https://github.com/NachoColl/agilevibecoding/issues)
3. Review [CLI commands](/commands)

### How to Ask

- **GitHub Issues** - For bugs and features: [New Issue](https://github.com/NachoColl/agilevibecoding/issues/new)
- **Clear descriptions** - Include context, examples, what you tried
- **Minimal examples** - Provide code that reproduces the issue

### Response Times

This is a community project maintained by volunteers. Please be patient - we'll respond as soon as we can.

---

## Development Tools

### Current Setup

- **Test framework:** Vitest 2.1.9
- **Coverage tool:** @vitest/coverage-v8
- **CLI framework:** React + Ink 5.0.1
- **LLM SDKs:** @anthropic-ai/sdk, @google/genai
- **Docs:** VitePress 1.6.4

### Future Improvements

**Planned:**
- ESLint for code linting
- Prettier for code formatting
- Husky for pre-commit hooks
- TypeScript support (optional)

---

## Project Structure

### Repository Layout

```
agilevibecoding/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       ├── deploy-pages.yml
│       └── publish-avc.yml
├── _docs/                   # VitePress documentation (auto-generated)
│   ├── .vitepress/
│   │   ├── config.mts      # VitePress configuration
│   │   └── theme/
│   ├── index.md            # Home (from README.md)
│   ├── commands.md         # Commands (from COMMANDS.md)
│   ├── install.md          # Install (from INSTALL.md)
│   └── contribute.md       # Contributing (from CONTRIBUTING.md)
├── documentation/          # Framework documentation (reference)
├── src/                    # Main CLI application
│   ├── cli/                # Source code
│   ├── tests/              # Test suites
│   ├── package.json        # npm package config
│   └── vitest.config.js    # Test configuration
├── README.md               # Main documentation (source)
├── COMMANDS.md             # CLI reference (source)
├── INSTALL.md              # Installation guide (source)
├── CONTRIBUTING.md         # This file (source)
├── CLAUDE.md               # AI assistant context
└── package.json            # Root package (docs)
```

---

## Recognition

Contributors are recognized through:

- **Git history** - Permanent record of contributions
- **Release notes** - Mentioned in version releases
- **README** - Listed in contributors section (future)

---

## License

By contributing to AVC, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE) file).

---

## Thank You!

Every contribution helps make AVC better for the community. Whether you're fixing a typo or adding a major feature, we appreciate your time and effort! 🎉

**Questions?** [Open an issue](https://github.com/NachoColl/agilevibecoding/issues/new) tagged with `question` - we're here to help!

---

**Last Updated:** 2026-01-29
