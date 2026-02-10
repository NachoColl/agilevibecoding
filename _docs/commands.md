# CLI Commands

## /init

Create AVC project structure and configuration files.

```sh
> /init
```

### What it does

Sets up your AVC project by creating the `.avc/` directory with the `avc.json` configuration file and a `.env` file for API keys. The command is safe to run multiple times—it preserves your existing configuration and API keys while adding any new settings from CLI updates.

**This command does not require API keys.**

After initialization, you'll be prompted to configure which LLM models to use for ceremonies. You can also reconfigure models anytime with the `/models` command.

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

Run the Sponsor Call ceremony to define your project with AI assistance.

**Alias**

`/sc`

**📖 [View detailed ceremony documentation →](ceremonies/sponsor-call.md)**

```sh
> /sponsor-call
```

### What it does

The Sponsor Call ceremony creates your project foundation through an AI-assisted questionnaire. It generates comprehensive documentation and architectural context that serves as the blueprint for your entire project.

**Process Flow**

1. **Interactive Questionnaire** - 5 questions to capture your project vision
2. **Generate Documentation** - AI creates structured `doc.md` (8 sections)
3. **Generate Context** - AI creates architectural `context.md`
4. **Validation** (optional) - AI validators check quality and completeness
5. **Sync to VitePress** - Documentation auto-synced to `.avc/documentation/index.md`

**AI Agents Used**

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

**Answering Questions**

- **Type your answer** - Multi-line input supported (Enter on empty line to submit)
- **Skip (Enter twice)** - Uses guideline from config OR AI generates suggestion
- **Only Mission Statement is mandatory** - All others can be skipped

### Configurable Guidelines

You can pre-configure default answers for any question in `.avc/avc.json`. When you skip a question, AVC first checks for a guideline, then falls back to AI suggestion.

**Configuration Structure**

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

### Supported LLM Providers

AVC supports multiple LLM providers. Configure your preferred provider per ceremony:

| Provider | Recommended Models | Best For |
|----------|-------------------|----------|
| **Claude** | `claude-sonnet-4-5-20250929` | General documentation, balanced cost/performance |
| **Gemini** | `gemini-2.5-flash`, `gemini-2.5-pro` | Fast generation, cost-efficient |
| **OpenAI** | `gpt-5.2-chat-latest`, `gpt-5.2-codex`, `o3-mini` | Code-heavy docs, flexible options |

**Example Configuration**:

```json
{
  "settings": {
    "ceremonies": [{
      "name": "sponsor-call",
      "provider": "openai",
      "defaultModel": "gpt-5.2-chat-latest"
    }]
  }
}
```

See [INSTALL.md](INSTALL.md#supported-providers) for API key setup instructions.

### Output Files

**Created**

- `.avc/project/doc.md` - 8-section project documentation (Mission, Users, Scope, Tech Stack, Architecture, Security, Quality, Success Metrics)
- `.avc/project/context.md` - Architectural context (inherited by all work items)
- `.avc/documentation/index.md` - Auto-synced from `doc.md` for VitePress documentation

**Updated**

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

**Validation Process**

1. Validator agent scores documentation (0-100)
2. If score < threshold → Improvement agent enhances document
3. Repeat up to `maxIterations` times
4. Final document must meet threshold or show critical issues

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

Next steps:
   1. Review .avc/project/doc.md for your project definition
   2. Run /documentation to view as website
   3. Run /project-expansion to create Epics and Stories
```


---

## /documentation

Build and serve project documentation as a local website.

**Alias**

`/d`

```sh
> /documentation
```

### What it does

Builds your project documentation using VitePress and starts a local preview server. The documentation is served as a static website that you can view in your browser, making it easy to review and share your project's structure and specifications.

The command runs the documentation server as a **background process**, allowing you to continue using the REPL while the server is running.

**This command does not require API keys.**

### Documentation Structure

The `/documentation` command works with files created during project initialization:

**Source Files**

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

**Default port**

4173 (VitePress preview default)

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

**Port already in use**

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

**Documentation not found**

Run `/init` first to create the documentation structure.

**Build fails**

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

## /models

View and configure which LLM models are used for ceremonies.

**Alias**

`/m`

```sh
> /models
```

### What it does

The `/models` command shows your current LLM model configuration for all ceremonies and allows you to interactively change which models are used for main generation, validation, and stage-specific processing.

This is useful when you:
- Want to use a different LLM provider (e.g., switch from Claude to Gemini)
- Need to use a faster/cheaper model for certain stages
- Have obtained new API keys and want to reconfigure
- Want to optimize costs by using different models for different stages

**This command does not require API keys to view configuration**, but you'll need API keys configured in `.env` to run ceremonies with the selected models.

### Interactive Configuration Flow

1. **View Current Configuration** - See all ceremonies and their configured models
2. **Prompt** - Choose whether to configure models (y/n)
3. **Select Ceremony** - Pick which ceremony to configure
4. **Select Stage** - Choose main generation, validation, or stage-specific
5. **Select Model** - Pick from all available models (with API key indicators)
6. **Repeat** - Configure additional stages or exit

### Model Display

Each model shows:
- **Display Name** - Human-readable model name
- **Status Indicator** - ✓ (API key available) or ⚠️ (no API key)
- **Model ID** - Technical identifier used by the provider
- **Pricing** - Input/output token costs per 1M tokens

**Example:**
```
› 1. Claude Sonnet 4.5 (current) ✓ - claude-sonnet-4-5-20250929 - $3.00/$15.00
  2. Claude Opus 4.5 ✓ - claude-opus-4-5-20250929 - $15.00/$75.00
  3. Gemini 2.5 Pro ⚠️ - gemini-2.5-pro - $1.25/$5.00
```

### Configuration Stages

Each ceremony can have different models configured for:

- **Main Generation** - Primary LLM used for content creation
- **Validation** - LLM used to verify quality and completeness
- **Stage-Specific** - Custom models for individual ceremony stages (suggestions, documentation, context)

### Output

```
🔧 Model Configuration

📋 Current Model Configuration:
Ceremony: sponsor-call - https://agilevibecoding.org/ceremonies/sponsor-call.html
• Main Generation: claude-sonnet-4-5-20250929 (claude)
• Validation: gemini-2.5-pro (gemini) ⚠️  No API key
• suggestions: claude-sonnet-4-5-20250929 (claude)
• documentation: claude-sonnet-4-5-20250929 (claude)
• context: claude-sonnet-4-5-20250929 (claude)

Configure models now? (y/n)
```

### API Key Warnings

Models without API keys show a ⚠️ warning, but **you can still select them**. This allows you to:
1. Configure your desired models first
2. Add the API keys to `.env` later
3. Run ceremonies once keys are available

### Configuration Persistence

All model configuration is stored in `.avc/avc.json` and persists across sessions. You can also manually edit this file if preferred:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "validation": {
          "enabled": true,
          "provider": "claude",
          "model": "claude-sonnet-4-5-20250929"
        }
      }
    ]
  }
}
```

### Available During Init

The `/models` configuration flow is also offered automatically after running `/init` for the first time. You can skip it during init and run `/models` anytime later.

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
| `/m` | `/models` |
| `/p` | `/processes` |
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
