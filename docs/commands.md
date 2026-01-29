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
3. Creates `.env` file (if it doesn't exist):
   - **Preserves existing `.env`:** If you already have API keys configured, they are never deleted or overwritten
   - **Creates with placeholders:** If no `.env` exists, creates one with empty `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` entries
4. Adds `.env` to `.gitignore` (if the directory is a git repository)


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


## /sponsor-call

Run the [**Sponsor Call** ceremony](/#sponsor-call-project-initialization) to create an initial context and work items for your project.

```sh
> /sponsor-call
```

### What it does

The Sponsor Call ceremony creates the foundation of your project by generating:
- **Initial context scope** - Project vision, goals, and constraints
- **Set of work items** - Structured breakdown of features and tasks
- **Initial documentation** - Comprehensive project definition document

The ceremony launches an interactive questionnaire that collects five core project inputs:

| # | Variable | Description |
|---|----------|-------------|
| 1 | Mission Statement | Core purpose and value proposition of the application |
| 2 | Target Users | User types and their roles |
| 3 | Initial Scope | Key features, main workflows, and essential capabilities |
| 4 | Technical Considerations | Technology stack, constraints, or preferences |
| 5 | Security & Compliance Requirements | Regulatory, privacy, or security constraints |

**Note:** Only the **Mission Statement** (question 1) is mandatory. All other questions will be filled with AI-generated proposals if you skip them.

After all inputs are collected, the LLM enhances the raw inputs into a structured project definition document saved to `.avc/project/doc.md`.


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
