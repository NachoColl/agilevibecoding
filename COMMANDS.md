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

Run the Sponsor Call ceremony to define your project with AI assistance.

**Prerequisite:** Run `/init` first and configure API keys in `.env` file.

```sh
> /sponsor-call
```

### What it does

The Sponsor Call ceremony creates the foundation of your project: initial context scope, work items, and comprehensive documentation. It guides you through an interactive questionnaire to capture your project vision.

The ceremony collects five inputs through a questionnaire:

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

When you skip the Technical Considerations question, AVC applies this default for non-technical users:

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
