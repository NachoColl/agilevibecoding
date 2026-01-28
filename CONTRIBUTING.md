# Contributing to Agile Vibe Coding (AVC)

Thank you for your interest in contributing to the Agile Vibe Coding framework! This project aims to make AI-agent-based software development more structured, sustainable, and efficient. We welcome contributions from the community.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Contribution Guidelines](#contribution-guidelines)
- [Code of Conduct](#code-of-conduct)
- [Questions and Support](#questions-and-support)

---

## Ways to Contribute

There are many ways to contribute to AVC:

### 📚 Documentation

- **Improve existing docs** - Fix typos, clarify explanations, add examples
- **Write tutorials** - Create step-by-step guides for specific use cases
- **Add use case examples** - Contribute real-world project examples
- **Translate documentation** - Help make AVC accessible in other languages

### 💻 Code Contributions

- **Fix bugs** - Help identify and fix issues in scripts or templates
- **Add features** - Implement new scripts or utilities
- **Improve scripts** - Optimize existing bash scripts for better performance
- **Create templates** - Add new agent prompt templates or context templates

### 🎯 Examples and Use Cases

- **Share real projects** - Contribute anonymized examples from actual projects
- **Create domain-specific templates** - Add examples for Python, Go, Rust, Java, etc.
- **Document patterns** - Share successful patterns you've discovered

### 🐛 Bug Reports and Feature Requests

- **Report issues** - Found a bug? [Open an issue](https://github.com/NachoColl/agilevibecoding/issues/new)
- **Request features** - Have an idea? [Open a feature request](https://github.com/NachoColl/agilevibecoding/issues/new)
- **Provide feedback** - Share your experience using AVC in [Issues](https://github.com/NachoColl/agilevibecoding/issues)

### 🧪 Testing and Validation

- **Test the framework** - Try AVC on different project types
- **Validate scripts** - Test scripts on various platforms (Linux, macOS, Windows/WSL)
- **Report compatibility issues** - Help us support more environments

---

## Getting Started

### Prerequisites

- Basic understanding of git and GitHub
- Familiarity with bash scripting (for script contributions)
- Experience with LLM coding agents (helpful but not required)
- Understanding of software development workflows

### Fork and Clone

1. **[Fork the repository](https://github.com/NachoColl/agilevibecoding/fork)** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/agilevibecoding.git
   cd agilevibecoding
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/NachoColl/agilevibecoding.git
   ```

### Explore the Structure

Before contributing, familiarize yourself with:

- **`README.md`** - User-facing documentation
- **`docs/`** - Detailed architecture and workflow documentation
- **`templates/`** - Reusable templates for user projects
- **`scripts/`** - Utility scripts for feature/test management
- **`prompts/`** - Agent prompt templates
- **`examples/`** - Example projects demonstrating AVC patterns

---

## Development Workflow

### 1. Create a Branch

Create a descriptive branch name:

```bash
git checkout -b feature/add-python-example
git checkout -b docs/improve-testing-guide
git checkout -b fix/query-pending-script-error
```

Branch naming conventions:
- `feature/` - New features or enhancements
- `docs/` - Documentation improvements
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `test/` - Testing improvements

### 2. Make Your Changes

- **Keep changes focused** - One feature/fix per PR
- **Follow existing patterns** - Match the style of existing code/docs
- **Test your changes** - Ensure scripts work and docs are accurate
- **Update related docs** - If you change functionality, update documentation

### 3. Commit Your Changes

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "docs: add Python project example with Django patterns

- Create example Python/Django project structure
- Add sprint context for Django patterns
- Include feature files demonstrating ORM usage
- Update examples/README.md with Python section"
```

Commit message format:
- `docs:` - Documentation changes
- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code refactoring
- `test:` - Testing improvements
- `chore:` - Maintenance tasks

### 4. Push and Create Pull Request

```bash
git push origin feature/add-python-example
```

Then [create a Pull Request](https://github.com/NachoColl/agilevibecoding/compare) on GitHub with:
- **Clear title** describing the change
- **Detailed description** explaining what and why
- **Reference issues** if applicable (e.g., "Fixes #123")
- **Screenshots** for UI/documentation changes

---

## Contribution Guidelines

### Documentation Standards

**Writing Style:**
- Use clear, concise language
- Write in second person ("you") for guides
- Use active voice
- Provide concrete examples
- Explain the "why" not just the "how"

**Markdown Formatting:**
- Use proper heading hierarchy (H1 → H2 → H3)
- Include code blocks with language specification
- Add links to related sections
- Keep lines to reasonable length (80-120 chars)

**Examples:**
- Provide complete, runnable examples
- Include expected output
- Show both success and error cases
- Use realistic project names and scenarios

### Script Standards

**Bash Scripts:**
- Use `#!/bin/bash` shebang
- Set `set -e` for error handling
- Include usage comments at the top
- Use descriptive variable names
- Add error messages with context
- Test on bash 3.2+ for compatibility
- Use `jq` for JSON parsing

**Example script header:**
```bash
#!/bin/bash
# Script Name - Brief description
# Usage: ./script-name.sh [OPTIONS]
#
# Description of what the script does and when to use it.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```

### Template Standards

**JSON Templates:**
- Include `_comment` fields explaining structure
- Provide `_examples` section with real-world cases
- Use descriptive placeholder values
- Document all fields with comments
- Keep templates well-formatted (2-space indent)

**Prompt Templates:**
- Be specific about agent role and expertise
- Include complete workflow instructions
- Provide concrete examples
- Document critical rules clearly
- Use clear section headings

### Example Project Standards

**Structure:**
- Include complete `README.md` explaining the example
- Provide realistic sprint context files
- Show feature and test file examples
- Demonstrate prompt-based approach
- Include actual code snippets in context

**Scope:**
- Keep examples focused on one domain/framework
- Make examples self-contained
- Use common, well-known technologies
- Avoid overly complex scenarios

---

## Testing Your Contributions

### Documentation

1. **Spell check** - Use a spell checker for documentation
2. **Link check** - Verify all links work
3. **Example validation** - Test that examples actually work
4. **Rendering** - Preview Markdown rendering

### Scripts

1. **Syntax check**:
   ```bash
   bash -n script.sh  # Check syntax without executing
   ```

2. **ShellCheck** (recommended):
   ```bash
   shellcheck script.sh  # Static analysis for bash scripts
   ```

3. **Test execution**:
   - Test with sample feature/test files
   - Test edge cases (empty files, missing fields)
   - Test error handling
   - Test on different platforms if possible

### Templates

1. **JSON validation**:
   ```bash
   jq empty template.json  # Validates JSON syntax
   ```

2. **Completeness check** - Ensure all necessary fields are documented
3. **Example testing** - Verify examples are realistic and helpful

---

## Pull Request Process

### Before Submitting

- [ ] Changes are tested and working
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions
- [ ] Code follows existing style
- [ ] No unrelated changes included
- [ ] Branch is up to date with main

### PR Description Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Documentation improvement
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Other (please describe)

## Changes Made
- Bullet list of specific changes
- Include file modifications
- Mention any new dependencies

## Testing
Describe how you tested these changes

## Related Issues
Fixes #(issue number) or Relates to #(issue number)

## Screenshots (if applicable)
Add screenshots for documentation or UI changes
```

### Review Process

1. **Automated checks** - CI/CD checks must pass (if configured)
2. **Maintainer review** - A maintainer will review your PR
3. **Feedback** - Address any requested changes
4. **Approval** - PR will be approved when ready
5. **Merge** - Maintainer will merge your contribution

### After Your PR is Merged

- **Update your fork**:
  ```bash
  git checkout main
  git pull upstream main
  git push origin main
  ```
- **Delete your branch** (optional):
  ```bash
  git branch -d feature/add-python-example
  git push origin --delete feature/add-python-example
  ```

---

## Code of Conduct

### Our Standards

- **Be respectful** - Treat everyone with respect and kindness
- **Be collaborative** - Work together constructively
- **Be inclusive** - Welcome and support people of all backgrounds
- **Be patient** - Remember everyone is learning
- **Be professional** - Keep discussions focused and productive

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Publishing others' private information
- Spam or excessive self-promotion
- Other conduct inappropriate in a professional setting

### Enforcement

Issues violating the Code of Conduct should be reported to the project maintainers. All complaints will be reviewed and investigated, resulting in appropriate responses.

---

## Questions and Support

### Before Asking

1. **Check existing documentation** - README, docs/
2. **Search issues** - Your question may already be answered in [existing issues](https://github.com/NachoColl/agilevibecoding/issues)
3. **Review examples** - See if examples cover your use case

### How to Ask

- **GitHub Issues** - For bugs, features, and general questions - [Open an issue](https://github.com/NachoColl/agilevibecoding/issues/new)
- **Discussions** - For open-ended questions and ideas - [GitHub Discussions](https://github.com/NachoColl/agilevibecoding/discussions) (if enabled)
- **Clear descriptions** - Provide context, examples, and what you've tried

### Response Times

This is a community project maintained by volunteers. Please be patient - we'll respond as soon as we can.

---

## Recognition

Contributors will be recognized in the following ways:

- **README.md** - Listed as contributors
- **Release notes** - Mentioned in version release notes
- **Git history** - Permanent record of contributions

---

## License

By contributing to AVC, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](LICENSE) file).

---

## Thank You!

Every contribution, no matter how small, helps improve AVC for the entire community. We appreciate your time and effort! 🎉

**Questions about contributing?** [Open an issue](https://github.com/NachoColl/agilevibecoding/issues/new) and tag it with `question` - we're happy to help!

---

**Version:** 1.0
**Last Updated:** 2026-01-20
