# CLI Commands

## /init

Create AVC project structure and configuration files.

```sh
> /init
```

### What it does

1. Creates the `.avc/` directory in the current working directory
2. Creates or updates `.avc/avc.json`:
   - **New project:** Creates default configuration with all settings
   - **Existing project:** Merges new attributes from CLI updates while preserving user customizations
   - Example: If a new CLI version adds `ceremonies` array, it's added to your config without overwriting your custom `contextScopes` or `agentTypes`
3. Creates `.env` file (if it doesn't exist):
   - **Preserves existing `.env`:** If you already have API keys configured, they are never deleted or overwritten
   - **Creates with placeholders:** If no `.env` exists, creates one with empty `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` entries
4. Adds `.env` to `.gitignore` (if the directory is a git repository)

**This command does NOT require API keys and does NOT make any LLM calls.**

### Smart merge behavior

When running `/init` on an existing project (e.g., after updating the AVC CLI), the command intelligently merges new configuration options:

**Example:** You updated from v0.0.9 (before `ceremonies`) to v0.1.0 (with `ceremonies`):

```json
// Your existing avc.json (v0.0.9)
{
  "projectName": "my-app",
  "settings": {
    "contextScopes": ["epic", "story"],  // Your customization
    "model": "claude-opus-4-5-20251101"
  }
}

// After running /init (merged with v0.1.0 defaults)
{
  "projectName": "my-app",  // ✓ Preserved
  "framework": "avc",  // ✓ Added
  "avcVersion": "0.1.0",  // ✓ Added
  "settings": {
    "contextScopes": ["epic", "story"],  // ✓ Your customization preserved
    "model": "claude-opus-4-5-20251101",  // ✓ Preserved
    "ceremonies": [...],  // ✓ New attribute added
    "workItemStatuses": [...],  // ✓ New attribute added
    "agentTypes": [...]  // ✓ New attribute added
  }
}
```

**Result:** Your customizations are never overwritten. New CLI features are automatically added to your config.

### Output

On success, the command prints:

```
✅ AVC project structure created successfully!

Next steps:
  1. Open .env file and add your API key(s)
     • ANTHROPIC_API_KEY for Claude
     • GEMINI_API_KEY for Gemini
  2. Run /sponsor-call to define your project
```

### Already initialized

If you run `/init` in a directory that already has `.avc/avc.json`, the command will check for updates and display:

```
✓ AVC project already initialized

Project is ready to use.
```

Or if new attributes were added:

```
✓ Updated .avc/avc.json with new configuration attributes

Project is ready to use.
```

---

## /sponsor-call

Run the [**Sponsor Call** ceremony](/#sponsor-call-project-initialization) to define your project with AI assistance.

**Prerequisite:** You must run `/init` first and configure API keys in `.env` file.

```sh
> /sponsor-call
```

### What it does

1. Validates that API keys are configured in `.env` file
2. Checks the configured LLM provider from `.avc/avc.json`
3. Launches an interactive questionnaire that collects five core project inputs:

| # | Variable | Plural? | Description |
|---|----------|---------|-------------|
| 1 | Mission Statement | No | Core purpose and value proposition of the application |
| 2 | Target Users | Yes | User types and their roles |
| 3 | Initial Scope | No | Key features, main workflows, and essential capabilities |
| 4 | Technical Considerations | Yes | Technology stack, constraints, or preferences |
| 5 | Security & Compliance Requirements | Yes | Regulatory, privacy, or security constraints |

4. Skipped questions are filled automatically by the configured LLM provider (AI suggestion)
5. After all inputs are collected, the LLM enhances the raw template into a structured project definition document
6. The final document is saved to `.avc/project/doc.md`

### Resumability

If the process is interrupted (e.g., the terminal is closed mid-questionnaire), `/sponsor-call` detects the incomplete state on next run and resumes from the last answered question.

### Multi-provider support

The LLM provider used during the ceremony is governed by the first entry in the `ceremonies` array of `.avc/avc.json`:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "provider": "claude"
      }
    ]
  }
}
```

Supported providers:

| Provider | Config value | Default model | Required env var |
|----------|-------------|---------------|------------------|
| Anthropic Claude | `claude` | `claude-sonnet-4-5-20250929` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |

To switch providers, update `provider` and `defaultModel` in `avc.json` and ensure the matching API key is set in `.env`.

### Output

On success, the command prints:

```
✅ Project defined successfully!

Next steps:
  1. Review .avc/project/doc.md for your project definition
  2. Review .avc/avc.json configuration
  3. Create your project context and work items
  4. Use AI agents to implement features
```

### Error: No API key

If you haven't configured API keys in `.env`, you'll see:

```
❌ API Key Validation Failed

   ANTHROPIC_API_KEY not found in .env file.

   Steps to fix:
   1. Open .env file in the current directory
   2. Add your API key: ANTHROPIC_API_KEY=your-key-here
   3. Save the file and run /sponsor-call again

   Get your API key:
   • https://console.anthropic.com/settings/keys
```

### Error: Project not initialized

If you run `/sponsor-call` before running `/init`, you'll see:

```
❌ Project not initialized

   Please run /init first to create the project structure.
```

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
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
