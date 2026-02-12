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
OPENAI_API_KEY=
```

Check your provider for the related keys and update the .env file.

**Example:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GEMINI_API_KEY=AIzaSy-your-gemini-key-here
OPENAI_API_KEY=sk-proj-your-openai-key-here
```

> **Note:** You only need to configure keys for the providers you want to use for Agile Vibe Coding ceremonies.


### Configuring Providers Per Ceremony

Each Agile Vibe Coding ceremony defines the models to use for each task.

Run `/models` command to modify the default models setup to your own needs.

