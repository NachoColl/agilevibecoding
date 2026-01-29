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

AVC uses LLM providers to power ceremonies and generate project documentation. **You must configure API keys** for the providers you plan to use.

### Supported Providers

AVC currently supports the following LLM providers:

| Provider | Models | API Key Variable | Get API Key |
|----------|--------|-----------------|-------------|
| **Claude** (Anthropic) | `claude-sonnet-4-5-20250929`<br>`claude-opus-4-5-20251101` | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Gemini** (Google) | `gemini-2.5-flash`<br>`gemini-2.5-pro` | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

### Setting Up API Keys

When you run `/init` for the first time, AVC creates a `.env` file in your project directory with placeholders:

```env
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

**Steps:**

1. Open the `.env` file in your project directory
2. Add your API key(s) for the provider(s) you want to use
3. Save the file

**Example:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GEMINI_API_KEY=AIzaSy-your-gemini-key-here
```

> **Note:** You only need to configure keys for the providers you're actually using. Check your `.avc/avc.json` file to see which provider is configured for each ceremony.

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

See [CLI Commands](/commands) for the full command reference.
