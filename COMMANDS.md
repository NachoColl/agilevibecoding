# CLI Commands

## Install

Install AVC globally via [npm](https://www.npmjs.com/package/@agile-vibe-coding/avc):

```sh
npm install -g @agile-vibe-coding/avc
```

Then launch it:

```sh
avc
```

Type `/` and press Enter to open the command selector, or type a command name directly.

---

## /init

Initialize an AVC project by running the [**Sponsor Call** ceremony](README.md#avc-ceremonies).

```sh
> /init
```

### What it does

1. Creates the `.avc/` directory in the current working directory.
2. Writes `.avc/avc.json` with default project settings (ceremonies, context scopes, work-item statuses, agent types).
3. Creates a `.env` file with placeholder entries for `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`.
4. Adds `.env` to `.gitignore` (if the directory is a git repository).
5. Launches an interactive questionnaire that collects the five core project inputs:

| # | Variable | Plural? | Description |
|---|----------|---------|-------------|
| 1 | Mission Statement | No | Core purpose and value proposition of the application |
| 2 | Target Users | Yes | User types and their roles |
| 3 | Initial Scope | No | Key features, main workflows, and essential capabilities |
| 4 | Technical Considerations | Yes | Technology stack, constraints, or preferences |
| 5 | Security & Compliance Requirements | Yes | Regulatory, privacy, or security constraints |

6. Skipped questions are filled automatically by the configured LLM provider (AI suggestion).
7. After all inputs are collected, the LLM enhances the raw template into a structured project definition document.
8. The final document is saved to `.avc/project/doc.md`.

### Resumability

If the process is interrupted (e.g., the terminal is closed mid-questionnaire), `/init` detects the incomplete state on next run and resumes from the last answered question.

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
✅ AVC project initialized successfully!

Next steps:
  1. Add your API key to .env file
  2. Review .avc/project/doc.md for your project definition
  3. Review .avc/avc.json configuration
  4. Create your project context and work items
  5. Use AI agents to implement features
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
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
