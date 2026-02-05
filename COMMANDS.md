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

Run the [Sponsor Call](README.md#sponsor-call-project-initialization) ceremony to define your project with AI assistance.

```sh
> /sponsor-call
```

### What it does

The [Sponsor Call](README.md#sponsor-call-project-initialization) ceremony creates the foundation of your project: initial context scope, work items, and comprehensive documentation. It guides you through an interactive questionnaire to capture your project vision.


| # | Variable | Description |
|---|----------|-------------|
| 1 | Mission Statement | Core purpose and value proposition of the application |
| 2 | Target Users | User types and their roles |
| 3 | Initial Scope | Key features, main workflows, and essential capabilities |
| 4 | Technical Considerations | Technology stack, constraints, or preferences |
| 5 | Security & Compliance Requirements | Regulatory, privacy, or security constraints |

Only the **Mission Statement** is mandatory. If you skip other questions, the ceremony provides intelligent defaults: Technical Considerations uses an AWS serverless guideline, while other questions are filled with AI-generated proposals based on your mission statement.

After collecting all inputs, the LLM enhances them into a structured project definition document saved to `.avc/project/doc.md`.

### Default Technical Guideline

When you skip the Technical Considerations question, AVC applies a default setup:

> Use AWS serverless stack with Lambda functions for compute, API Gateway for REST APIs, DynamoDB for database, S3 for storage. Use CloudFormation for infrastructure definition and AWS CodePipeline/CodeBuild for CI/CD deployment.

You can customize this guideline in `.avc/avc.json` under `settings.ceremonies[0].guidelines.technicalConsiderations`.

### Output

```
✅ Project defined successfully!

Next steps:
  1. Review .avc/project/doc.md for your project definition
  2. Review .avc/avc.json configuration
  3. Create your project context and work items
  4. Use AI agents to implement features
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
