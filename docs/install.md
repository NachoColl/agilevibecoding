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

Run init command to initialize your project:

```sh
/init
```

## API Keys

AVC uses LLM providers to power ceremonies and generate project documentation. 

### Setting Up API Keys

When you run `/init`, AVC creates (if not already there) a `.env` file in your project directory with placeholders:

```env
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

Check your provider for the related keys and update the .env file.

**Example:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GEMINI_API_KEY=AIzaSy-your-gemini-key-here
```

> **Note:** You only need to configure keys for the providers you want to use for Agile Vibe Coding ceremonies.


### Configuring Providers Per Ceremony

Each ceremony in `.avc/avc.json` can use a different provider (model) - as for example:

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

## Supported Providers


| Provider | Models | API Key Variable | Get API Key |
|----------|--------|-----------------|-------------|
| **Claude** (Anthropic) | `claude-sonnet-4-5-20250929`<br>`claude-opus-4-5-20251101` | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Gemini** (Google) | `gemini-2.5-flash`<br>`gemini-2.5-pro` | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

