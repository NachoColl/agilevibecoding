# CLI Commands

## /init

Create AVC project structure and configuration files.

```sh
> /init
```

### What it does

Sets up your AVC project by creating the `.avc/` directory with the `avc.json` configuration file and a `.env` file for API keys. The command is safe to run multiple times—it preserves your existing configuration and API keys while adding any new settings from CLI updates.

**This command does not require API keys.**

### Output

```
✅ AVC project structure created successfully!

Next steps:
  1. Open .env file and add your API key(s)
     • ANTHROPIC_API_KEY for Claude
     • GEMINI_API_KEY for Gemini
  2. Run /sponsor-call to define your project
```

---

## /sponsor-call

Run the [Sponsor Call](/#sponsor-call-project-initialization) ceremony to define your project with AI assistance.

**Alias:** `/sc`

```sh
> /sponsor-call
```

### What it does

The Sponsor Call ceremony creates your project foundation through an AI-assisted questionnaire. It generates comprehensive documentation and architectural context that serves as the blueprint for your entire project.

**Process Flow:**
1. **Interactive Questionnaire** - 5 questions to capture your project vision
2. **Generate Documentation** - AI creates structured `doc.md` (8 sections, ~3000-5000 tokens)
3. **Generate Context** - AI creates architectural `context.md` (~500 tokens)
4. **Validation** (optional) - AI validators check quality and completeness
5. **Sync to VitePress** - Documentation auto-synced to `.avc/documentation/index.md`

**AI Agents Used:**
- **Suggestion Agents** (if you skip questions): Business Analyst, UX Researcher, Product Manager, Technical Architect, Security Specialist
- **Documentation Creator**: `project-documentation-creator.md` → Creates 8-section project doc
- **Context Generator**: `project-context-generator.md` → Creates architectural context
- **Validators** (optional): `validator-documentation.md`, `validator-context.md`

### Questionnaire

| # | Variable | Description | Configurable |
|---|----------|-------------|--------------|
| 1 | Mission Statement | Core purpose and value proposition | ✅ |
| 2 | Target Users | User types and their roles | ✅ |
| 3 | Initial Scope | Key features, main workflows, essential capabilities | ✅ |
| 4 | Technical Considerations | Technology stack, constraints, or preferences | ✅ |
| 5 | Security & Compliance Requirements | Regulatory, privacy, or security constraints | ✅ |

**Answering Questions:**
- **Type your answer** - Multi-line input supported (Enter on empty line to submit)
- **Skip (Enter twice)** - Uses guideline from config OR AI generates suggestion
- **Only Mission Statement is mandatory** - All others can be skipped

### Configurable Guidelines

You can pre-configure default answers for any question in `.avc/avc.json`. When you skip a question, AVC first checks for a guideline, then falls back to AI suggestion.

**Configuration Structure:**
```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "guidelines": {
          "missionStatement": "Your default mission statement here",
          "targetUsers": "Your default target users here",
          "initialScope": "Your default initial scope here",
          "technicalConsiderations": "Your default tech stack here",
          "securityAndComplianceRequirements": "Your default security requirements here"
        }
      }
    ]
  }
}
```

**Default Guideline (Pre-configured):**

Only `technicalConsiderations` has a default guideline out of the box:

```
Use AWS serverless stack with Lambda functions for compute,
API Gateway for REST APIs, DynamoDB for database, S3 for storage.
Use CloudFormation for infrastructure definition and
AWS CodePipeline/CodeBuild for CI/CD deployment.
```

**All other questions default to AI-generated suggestions** when skipped (unless you configure guidelines for them).

### Output Files

**Created:**
- `.avc/project/doc.md` - 8-section project documentation (Mission, Users, Scope, Tech Stack, Architecture, Security, Quality, Success Metrics)
- `.avc/project/context.md` - Architectural context (~500 tokens, inherited by all work items)
- `.avc/documentation/index.md` - Auto-synced from `doc.md` for VitePress documentation

**Updated:**
- `.avc/token-history.json` - Token usage tracking
- `.avc/ceremonies-history.json` - Ceremony execution history

### Validation (Optional)

Enable AI-powered validation to iteratively improve documentation quality:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "validation": {
          "enabled": true,
          "maxIterations": 3,
          "acceptanceThreshold": 75,
          "skipOnCriticalIssues": false
        }
      }
    ]
  }
}
```

**Validation Process:**
1. Validator agent scores documentation (0-100)
2. If score < threshold → Improvement agent enhances document
3. Repeat up to `maxIterations` times
4. Final document must meet threshold or show critical issues

### Token Usage & Cost

The ceremony tracks and displays:
- **Input tokens** - Prompt + context sent to LLM
- **Output tokens** - Generated content from LLM
- **Total tokens** - Sum of input + output
- **API calls** - Number of LLM requests
- **Estimated cost** - Based on model pricing

**Typical Usage:**
- Without validation: ~15,000-25,000 tokens (~$0.08-$0.13 with Claude Sonnet 4.5)
- With validation: ~30,000-50,000 tokens (~$0.16-$0.27 with Claude Sonnet 4.5)

### Output Example

```
✅ Sponsor Call Completed

Activities performed:
• Collected 5 questionnaire answers
• Generated project documentation
• Generated project context
• Synced to VitePress documentation

Files created:
• .avc/project/doc.md
• .avc/project/context.md
• .avc/documentation/index.md

📊 Token Usage:
   Input: 8,234 tokens
   Output: 4,521 tokens
   Total: 12,755 tokens
   API Calls: 3
   Estimated Cost: $0.07

Next steps:
   1. Review .avc/project/doc.md for your project definition
   2. Run /documentation to view as website
   3. Run /project-expansion to create Epics and Stories
```


---

## /documentation

Build and serve project documentation as a local website.

**Alias:** `/d`

```sh
> /documentation
```

### What it does

Builds your project documentation using VitePress and starts a local preview server. The documentation is served as a static website that you can view in your browser, making it easy to review and share your project's structure and specifications.

The command runs the documentation server as a **background process**, allowing you to continue using the REPL while the server is running.

**This command does not require API keys.**

### Documentation Structure

The `/documentation` command works with files created during project initialization:

**Source Files:**
- `.avc/documentation/index.md` - Main documentation page (auto-synced from `.avc/project/doc.md` during Sponsor Call)
- `.avc/documentation/.vitepress/config.mts` - VitePress configuration (site title, theme, navigation)
- `.avc/documentation/public/` - Static assets (images, logos, custom files)

**Generated Files (gitignored):**
- `.avc/documentation/.vitepress/dist/` - Built static site (HTML, CSS, JS)
- `.avc/documentation/.vitepress/cache/` - VitePress build cache

### Server Configuration

The documentation server port is configurable in `.avc/avc.json`:

```json
{
  "settings": {
    "documentation": {
      "port": 4173
    }
  }
}
```

**Default port:** 4173 (VitePress preview default)

### Port Conflict Handling

The command intelligently handles port conflicts:

1. **AVC Server Already Running (Managed Process):**
   - Restarts the existing server
   - Shows: `🔄 Documentation server already running, restarting...`

2. **AVC Server Running Externally (Previous Session):**
   - Verifies it's an AVC server (checks for AVC metatag)
   - Automatically kills and restarts
   - Shows: `⚠️ AVC documentation server already running (external process)`

3. **Non-AVC Process Using Port:**
   - Shows process details (PID, command)
   - Asks for confirmation before killing
   - User can cancel and change port in config

### Background Process Management

The documentation server runs as a managed background process:

- **View process status:** Use `/processes` (or `/p`) command
- **Stop server:** Select the process and press 's' to stop
- **Auto-cleanup:** Stopped processes disappear after 3 seconds
- **View logs:** Process output is captured and viewable in process details

### Output

```
📚 Building documentation...
✓ Documentation built successfully

📦 Starting documentation server in background...
   URL: http://localhost:4173
   View process output: /processes
```

### Example Workflow

```sh
# 1. Initialize project and run Sponsor Call
> /init
> /sponsor-call

# 2. Build and serve documentation
> /documentation

# 3. Open browser to http://localhost:4173

# 4. Check process status
> /processes

# 5. Stop server when done
> /processes
# (Select "Documentation Server" and press 's')
```

### Troubleshooting

**Port already in use:**
Edit `.avc/avc.json` to change the port:
```json
{
  "settings": {
    "documentation": {
      "port": 5173
    }
  }
}
```

**Documentation not found:**
Run `/init` first to create the documentation structure.

**Build fails:**
Ensure VitePress dependencies are installed:
```sh
npm install vitepress --save-dev
```

### Integration with Sponsor Call

The Sponsor Call ceremony automatically syncs the generated project definition to `.avc/documentation/index.md`, making it immediately available for documentation viewing:

1. Run `/sponsor-call` → Creates `.avc/project/doc.md`
2. Document is auto-synced to `.avc/documentation/index.md`
3. Run `/documentation` → Builds and serves the documentation
4. View your project definition as a formatted website

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` + Enter | Open interactive command selector |
| Tab | Auto-complete command name |
| ↑ / ↓ | Navigate command history |
| Esc | Cancel selector or dismiss update notification |
| Ctrl+R | Restart the REPL |

## Command aliases

| Alias | Expands to |
|-------|-----------|
| `/i` | `/init` |
| `/sc` | `/sponsor-call` |
| `/d` | `/documentation` |
| `/p` | `/processes` |
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
