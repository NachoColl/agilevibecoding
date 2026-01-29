# Install

Install AVC globally via [npm](https://www.npmjs.com/package/@agile-vibe-coding/avc):

```sh
npm install -g @agile-vibe-coding/avc
```

Then launch it:

```sh
avc
```

![AVC CLI v0.1.0](/images/avc-0.1.0-snapshot.png)

Type `/` and press Enter to open the command selector, or type a command name directly.

---

## API Keys Required

AVC uses LLM providers to power the Sponsor Call ceremony and generate project documentation. API keys are **not required** for initial project setup, but **are required** when running the Sponsor Call ceremony.

### Supported Providers

AVC currently supports the following LLM providers:

| Provider | Models | API Key Variable | Get API Key |
|----------|--------|-----------------|-------------|
| **Claude** (Anthropic) | `claude-sonnet-4-5-20250929`<br>`claude-opus-4-5-20251101` | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Gemini** (Google) | `gemini-2.5-flash`<br>`gemini-2.5-pro` | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

### Setting Up API Keys

When you run `/init`, AVC creates a `.env` file in your project directory with placeholders:

```env
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

**Steps:**

1. Run `/init` to create the project structure and `.env` file
2. Open the `.env` file in your project directory
3. Add your API key(s) for the provider(s) you want to use
4. Save the file
5. Run `/sponsor-call` to define your project with AI assistance

**Example:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GEMINI_API_KEY=AIzaSy-your-gemini-key-here
```

> **Note:** You only need to configure keys for the providers you're actually using. Check your `.avc/avc.json` file to see which provider is configured for the Sponsor Call ceremony.

### File Preservation

- **`.env` file is never overwritten:** If you already have a `.env` file with API keys, running `/init` again will not delete or overwrite your keys
- **Your API keys are safe:** Running `/init` multiple times (e.g., after CLI updates) preserves your existing configuration

### Configuring Providers Per Ceremony

Each ceremony in `.avc/avc.json` can use a different provider:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929"
      }
    ]
  }
}
```

Change `"provider"` to `"claude"` or `"gemini"` based on your preference.

---

See [CLI Commands](COMMANDS.md) for the full command reference.
