# Multi-Provider Strategy for Sponsor Call Ceremony

## Overview

The AVC framework supports **different LLM providers per ceremony**. Each ceremony can use Claude, Gemini, or future providers based on ceremony-specific requirements (cost, speed, capability).

---

## Configuration Structure

### Per-Ceremony Provider Configuration

**File:** `.avc/avc.json`

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "agents": [
          {
            "name": "documentation",
            "instruction": "documentation.md",
            "stage": "enhancement"
          },
          {
            "name": "decomposition",
            "instruction": "decomposition.md",
            "stage": "hierarchy-generation"
          }
        ],
        "guidelines": {
          "technicalConsiderations": "Use AWS serverless stack..."
        }
      },
      {
        "name": "project-expansion",
        "provider": "gemini",
        "defaultModel": "gemini-2.0-flash-exp",
        "agents": [
          {
            "name": "task-decomposer",
            "instruction": "task-decomposer.md",
            "stage": "decomposition"
          }
        ]
      },
      {
        "name": "context-retrospective",
        "provider": "claude",
        "defaultModel": "claude-opus-4-5-20251101",
        "agents": [
          {
            "name": "context-optimizer",
            "instruction": "context-optimizer.md",
            "stage": "optimization"
          }
        ]
      }
    ]
  }
}
```

**Key Points:**
- Each ceremony has independent `provider` and `defaultModel` configuration
- Ceremonies can have multiple agents, each running at different stages
- Agent instructions are stored in `src/cli/agents/` directory
- Guidelines are ceremony-specific customizations

---

## Provider Selection Rationale

### Why Different Providers for Different Ceremonies?

| Ceremony | Recommended Provider | Rationale |
|----------|---------------------|-----------|
| **Sponsor Call** | Claude Sonnet 4.5 | Best at long-form documentation, structured thinking (scratchpad), complex decomposition tasks |
| **Project Expansion** | Gemini 2.0 Flash | Fast iteration for Task decomposition, cost-effective for recursive operations |
| **Context Retrospective** | Claude Opus 4.5 | Highest quality for critical context optimization, better nuance understanding |
| **Code Implementation** | Claude Sonnet 3.5 | Best code generation quality, strong at following patterns |
| **Test Generation** | Gemini Pro | Fast, cost-effective for test case generation |

### Cost-Performance Trade-offs

**Example Sponsor Call Ceremony:**

| Provider | Model | Cost per Ceremony | Quality | Speed |
|----------|-------|-------------------|---------|-------|
| Claude | Sonnet 4.5 | $0.15-0.30 | ⭐⭐⭐⭐⭐ | Medium |
| Claude | Opus 4.5 | $0.75-1.50 | ⭐⭐⭐⭐⭐ | Slow |
| Gemini | 2.0 Flash | $0.02-0.05 | ⭐⭐⭐⭐ | Fast |
| Gemini | Pro | $0.05-0.10 | ⭐⭐⭐⭐ | Medium |

**Recommendation for Sponsor Call:**
- **Default:** Claude Sonnet 4.5 (best quality-cost balance)
- **Budget-conscious:** Gemini 2.0 Flash (15x cheaper, 90% quality)
- **Premium:** Claude Opus 4.5 (best quality, 5x cost)

---

## Implementation Plan Updates

### 1. Ceremony-Specific Provider Resolution

**Current Flow:**
```javascript
// template-processor.js
constructor() {
  const { provider, model } = this.readModelConfig();
  this.llmProvider = LLMProvider.create(provider, model);
}
```

**Enhanced Flow:**
```javascript
// template-processor.js
constructor(ceremonyName = 'sponsor-call') {
  this.ceremonyName = ceremonyName;
  const { provider, model } = this.readCeremonyConfig(ceremonyName);
  this.llmProvider = LLMProvider.create(provider, model);
}

readCeremonyConfig(ceremonyName) {
  const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
  const ceremony = config.settings.ceremonies.find(c => c.name === ceremonyName);

  if (!ceremony) {
    console.warn(`⚠️  Ceremony '${ceremonyName}' not found, using defaults`);
    return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
  }

  return {
    provider: ceremony.provider || 'claude',
    model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929'
  };
}
```

### 2. Multi-Stage Provider Support (Advanced)

**Use Case:** Different stages within a ceremony use different providers

**Example:** Sponsor Call using Claude for enhancement, Gemini for decomposition

```json
{
  "name": "sponsor-call",
  "stages": [
    {
      "name": "enhancement",
      "provider": "claude",
      "model": "claude-sonnet-4-5-20250929",
      "agent": "documentation"
    },
    {
      "name": "decomposition",
      "provider": "gemini",
      "model": "gemini-2.0-flash-exp",
      "agent": "decomposition"
    },
    {
      "name": "validation",
      "provider": "claude",
      "model": "claude-sonnet-4-5-20250929",
      "agent": "validator"
    }
  ]
}
```

**Implementation:**
```javascript
// template-processor.js
async runCeremonyStage(stageName) {
  const stageConfig = this.getStageConfig(stageName);
  const provider = LLMProvider.create(stageConfig.provider, stageConfig.model);
  const agentInstructions = this.loadAgentInstructions(stageConfig.agent + '.md');

  return await provider.execute(agentInstructions, this.context);
}
```

### 3. Provider Fallback Chain

**Problem:** Primary provider might be unavailable or rate-limited

**Solution:** Fallback to secondary provider

```json
{
  "name": "sponsor-call",
  "providers": [
    { "provider": "claude", "model": "claude-sonnet-4-5-20250929", "priority": 1 },
    { "provider": "gemini", "model": "gemini-2.0-flash-exp", "priority": 2 },
    { "provider": "claude", "model": "claude-sonnet-3-5-20241022", "priority": 3 }
  ]
}
```

**Implementation:**
```javascript
async createProviderWithFallback(ceremonyName) {
  const config = this.readCeremonyConfig(ceremonyName);
  const providers = config.providers.sort((a, b) => a.priority - b.priority);

  for (const providerConfig of providers) {
    try {
      const provider = LLMProvider.create(providerConfig.provider, providerConfig.model);
      await provider.healthCheck(); // Verify API key and quota
      console.log(`✅ Using ${providerConfig.provider} (${providerConfig.model})`);
      return provider;
    } catch (error) {
      console.warn(`⚠️  ${providerConfig.provider} unavailable: ${error.message}`);
      continue; // Try next provider
    }
  }

  throw new Error('All configured providers failed');
}
```

---

## Sponsor Call Multi-Provider Workflow

### Enhanced Ceremony Flow with Provider Selection

**Step 1: Read Ceremony Configuration**
```javascript
const config = readCeremonyConfig('sponsor-call');
// {
//   provider: 'claude',
//   defaultModel: 'claude-sonnet-4-5-20250929',
//   agents: [...]
// }
```

**Step 2: Initialize Provider**
```javascript
const provider = LLMProvider.create(config.provider, config.model);
// Creates ClaudeProvider or GeminiProvider based on config
```

**Step 3: Execute Ceremony Stages**

**Stage A: Documentation Enhancement** (uses configured provider)
```javascript
const enhancementAgent = loadAgentInstructions('documentation.md');
const enhancedDoc = await provider.enhanceDocument(
  userResponses,
  enhancementAgent
);
```

**Stage B: Epic Decomposition** (uses configured provider)
```javascript
const decompositionAgent = loadAgentInstructions('decomposition.md');
const epics = await provider.decomposeIntoEpics(
  enhancedDoc.initialScope,
  decompositionAgent
);
```

**Stage C: Story Decomposition** (uses configured provider, loops per Epic)
```javascript
for (const epic of epics) {
  const stories = await provider.decomposeIntoStories(
    epic,
    decompositionAgent
  );
  epic.stories = stories;
}
```

**Stage D: Context Generation** (uses configured provider, loops per level)
```javascript
// Project context
const projectContext = await provider.generateContext({
  level: 'project',
  content: enhancedDoc,
  tokenBudget: 500
});

// Epic contexts
for (const epic of epics) {
  epic.context = await provider.generateContext({
    level: 'epic',
    parentContext: projectContext,
    epicScope: epic,
    tokenBudget: 800
  });

  // Story contexts
  for (const story of epic.stories) {
    story.context = await provider.generateContext({
      level: 'story',
      parentContext: epic.context,
      storyScope: story,
      tokenBudget: 1500
    });
  }
}
```

**Key Point:** All stages use the same provider instance configured for the ceremony, ensuring consistent quality and behavior.

---

## Provider-Specific Optimizations

### Claude-Specific Features

**Use Extended Thinking for Complex Decomposition:**
```javascript
// Claude supports extended thinking (internal monologue)
if (provider instanceof ClaudeProvider) {
  const result = await provider.generateWithThinking({
    prompt: decompositionPrompt,
    thinkingBudget: 10000, // 10k tokens for internal reasoning
    outputBudget: 5000      // 5k tokens for final output
  });
  // Result includes both thinking process and final answer
}
```

**Use Prompt Caching for Repeated Calls:**
```javascript
// Claude supports prompt caching (cheaper for repeated context)
if (provider instanceof ClaudeProvider) {
  provider.enableCaching({
    systemPrompt: true,      // Cache agent instructions
    projectContext: true,    // Cache project-level context
    epicContext: true        // Cache Epic-level context
  });
  // Subsequent calls reuse cached content at 90% discount
}
```

### Gemini-Specific Features

**Use Grounding for Tech Stack Recommendations:**
```javascript
// Gemini supports grounding with Google Search
if (provider instanceof GeminiProvider) {
  const result = await provider.generateWithGrounding({
    prompt: technicalConsiderationsPrompt,
    groundingSource: 'google-search',
    query: 'best practices for TypeScript microservices 2026'
  });
  // Result includes citations from search results
}
```

**Use JSON Mode for Structured Outputs:**
```javascript
// Gemini has native JSON mode
if (provider instanceof GeminiProvider) {
  const epics = await provider.generateJSON({
    prompt: epicDecompositionPrompt,
    schema: epicDecompositionSchema // JSON Schema for validation
  });
  // Guaranteed valid JSON output
}
```

---

## Testing Multi-Provider Support

### Unit Tests

**Test 1: Provider Resolution**
```javascript
describe('Ceremony Provider Configuration', () => {
  it('should load correct provider for sponsor-call ceremony', () => {
    const config = readCeremonyConfig('sponsor-call');
    expect(config.provider).toBe('claude');
    expect(config.defaultModel).toBe('claude-sonnet-4-5-20250929');
  });

  it('should fall back to defaults for unknown ceremony', () => {
    const config = readCeremonyConfig('unknown-ceremony');
    expect(config.provider).toBe('claude');
  });
});
```

**Test 2: Provider Creation**
```javascript
describe('LLMProvider Factory', () => {
  it('should create ClaudeProvider when provider=claude', () => {
    const provider = LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('should create GeminiProvider when provider=gemini', () => {
    const provider = LLMProvider.create('gemini', 'gemini-2.0-flash-exp');
    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});
```

### Integration Tests

**Test 3: End-to-End Ceremony with Different Providers**
```javascript
describe('Sponsor Call with Multiple Providers', () => {
  it('should complete ceremony with Claude provider', async () => {
    const ceremony = new SponsorCallCeremony('sponsor-call');
    const result = await ceremony.run(mockUserResponses);

    expect(result.epics.length).toBeGreaterThan(0);
    expect(result.stories.length).toBeGreaterThan(0);
    expect(fs.existsSync('.avc/project/context.md')).toBe(true);
  });

  it('should complete ceremony with Gemini provider', async () => {
    // Temporarily override config
    updateCeremonyConfig('sponsor-call', { provider: 'gemini' });

    const ceremony = new SponsorCallCeremony('sponsor-call');
    const result = await ceremony.run(mockUserResponses);

    expect(result.epics.length).toBeGreaterThan(0);
    // Verify Gemini-specific features were used
    expect(result.metadata.provider).toBe('gemini');
  });
});
```

---

## Error Handling

### Provider-Specific Errors

**API Key Missing:**
```javascript
try {
  const provider = LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');
} catch (error) {
  if (error.code === 'MISSING_API_KEY') {
    console.error(`
❌ Claude API key not found

Please set ANTHROPIC_API_KEY in your .env file:
ANTHROPIC_API_KEY=sk-ant-...

Or switch to a different provider in .avc/avc.json:
{
  "ceremonies": [
    {
      "name": "sponsor-call",
      "provider": "gemini",  // Use Gemini instead
      "defaultModel": "gemini-2.0-flash-exp"
    }
  ]
}
    `);
    process.exit(1);
  }
}
```

**Rate Limit Exceeded:**
```javascript
try {
  const result = await provider.enhanceDocument(content);
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.warn(`
⚠️  ${provider.name} rate limit exceeded

Options:
1. Wait ${error.retryAfter} seconds and run /sponsor-call again
2. Switch to different provider in .avc/avc.json
3. Use a different API key with higher quota
    `);

    // Prompt user for action
    const action = await promptUser('Retry (R) or Switch Provider (S)?');
    if (action === 'S') {
      // Show provider selection menu
      switchProvider();
    }
  }
}
```

**Model Not Available:**
```javascript
try {
  const provider = LLMProvider.create('claude', 'claude-opus-5-preview');
} catch (error) {
  if (error.code === 'MODEL_NOT_AVAILABLE') {
    console.error(`
❌ Model 'claude-opus-5-preview' is not available

Available Claude models:
- claude-opus-4-5-20251101 (best quality)
- claude-sonnet-4-5-20250929 (recommended)
- claude-sonnet-3-5-20241022 (legacy)

Update .avc/avc.json with an available model.
    `);
    process.exit(1);
  }
}
```

---

## Migration Guide

### For Existing Projects

**Old Configuration (single global provider):**
```json
{
  "settings": {
    "llm": {
      "provider": "claude",
      "model": "claude-sonnet-4-5-20250929"
    }
  }
}
```

**New Configuration (per-ceremony providers):**
```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929"
      },
      {
        "name": "project-expansion",
        "provider": "gemini",
        "defaultModel": "gemini-2.0-flash-exp"
      }
    ]
  }
}
```

**Automatic Migration:**
```javascript
// init.js - when reading old config format
function migrateToPerCeremonyProviders(config) {
  if (config.settings.llm && !config.settings.ceremonies) {
    // Old format detected, migrate
    console.log('⚙️  Migrating to per-ceremony provider configuration...');

    const globalProvider = config.settings.llm.provider || 'claude';
    const globalModel = config.settings.llm.model || 'claude-sonnet-4-5-20250929';

    config.settings.ceremonies = [
      {
        name: 'sponsor-call',
        provider: globalProvider,
        defaultModel: globalModel
      }
    ];

    delete config.settings.llm; // Remove old config
    fs.writeFileSync(avcConfigPath, JSON.stringify(config, null, 2));
    console.log('✅ Migration complete');
  }

  return config;
}
```

---

## Documentation Updates

### README.md Section to Add

**Location:** After "LLM Provider Pattern" section

```markdown
### Multi-Provider Ceremony Support

Each AVC ceremony can use a different LLM provider based on ceremony-specific requirements.

**Configuration:** `.avc/avc.json`

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "provider": "claude",
        "defaultModel": "claude-sonnet-4-5-20250929"
      },
      {
        "name": "project-expansion",
        "provider": "gemini",
        "defaultModel": "gemini-2.0-flash-exp"
      }
    ]
  }
}
```

**Supported Providers:**
- **Claude** (Anthropic) - Best for long-form documentation, complex reasoning
- **Gemini** (Google) - Fast, cost-effective for iteration-heavy tasks

**API Keys:** Set in `.env` file
```bash
# Claude
ANTHROPIC_API_KEY=sk-ant-...

# Gemini
GEMINI_API_KEY=...
```

**Provider Selection Rationale:**

| Ceremony | Recommended | Why |
|----------|-------------|-----|
| Sponsor Call | Claude Sonnet 4.5 | Best documentation quality, structured thinking |
| Project Expansion | Gemini 2.0 Flash | Fast Task decomposition, cost-effective |
| Context Retrospective | Claude Opus 4.5 | Highest quality context optimization |

**Cost Comparison (Sponsor Call):**
- Claude Sonnet 4.5: $0.15-0.30 per ceremony (recommended)
- Gemini 2.0 Flash: $0.02-0.05 per ceremony (budget-friendly)
- Claude Opus 4.5: $0.75-1.50 per ceremony (premium quality)

**Changing Providers:**

Edit `.avc/avc.json`:
```json
{
  "ceremonies": [
    {
      "name": "sponsor-call",
      "provider": "gemini",  // Changed from "claude"
      "defaultModel": "gemini-2.0-flash-exp"
    }
  ]
}
```

Then set the required API key in `.env`.
```

---

## Implementation Checklist

### Core Changes

- [ ] **template-processor.js**
  - [ ] Add `ceremonyName` parameter to constructor
  - [ ] Implement `readCeremonyConfig(ceremonyName)` method
  - [ ] Update provider initialization to use ceremony config
  - [ ] Add error handling for missing ceremony config

- [ ] **llm-provider.js**
  - [ ] Verify factory pattern supports all providers
  - [ ] Add provider health check method
  - [ ] Add provider-specific feature detection

- [ ] **init.js**
  - [ ] Update default `avc.json` template with ceremonies array
  - [ ] Add migration logic for old config format
  - [ ] Document ceremony configuration in generated `.env.example`

### Advanced Features (Optional)

- [ ] **Multi-stage provider support**
  - [ ] Allow different providers per ceremony stage
  - [ ] Implement stage-level config parsing

- [ ] **Provider fallback chain**
  - [ ] Implement health check and retry logic
  - [ ] Add fallback provider selection

- [ ] **Provider-specific optimizations**
  - [ ] Claude: Prompt caching for repeated calls
  - [ ] Claude: Extended thinking for complex tasks
  - [ ] Gemini: JSON mode for structured outputs
  - [ ] Gemini: Grounding with search

### Documentation

- [ ] **README.md**
  - [ ] Add "Multi-Provider Ceremony Support" section
  - [ ] Document provider selection rationale
  - [ ] Add cost comparison table
  - [ ] Include migration guide

- [ ] **CLAUDE.md**
  - [ ] Update "LLM Provider Pattern" section
  - [ ] Add per-ceremony configuration examples
  - [ ] Document provider-specific features

- [ ] **COMMANDS.md**
  - [ ] Document `/sponsor-call` provider configuration
  - [ ] Show how to check current provider
  - [ ] Explain how to switch providers

### Testing

- [ ] **Unit tests**
  - [ ] Test ceremony config resolution
  - [ ] Test provider factory with different configs
  - [ ] Test migration logic

- [ ] **Integration tests**
  - [ ] Run Sponsor Call with Claude
  - [ ] Run Sponsor Call with Gemini
  - [ ] Verify both produce valid hierarchy

---

## Summary

This multi-provider strategy enables:

✅ **Flexibility**: Choose best provider per ceremony based on requirements
✅ **Cost Optimization**: Use cheaper providers for iteration-heavy tasks
✅ **Quality Control**: Use premium providers for critical ceremonies
✅ **Resilience**: Fallback to alternative providers if primary unavailable
✅ **Future-Proof**: Easy to add new providers (OpenAI, Mistral, etc.)

**Recommendation for Sponsor Call:**
- **Default**: Claude Sonnet 4.5 (best quality-cost balance)
- **Budget**: Gemini 2.0 Flash (15x cheaper, excellent results)
- **Premium**: Claude Opus 4.5 (highest quality for complex projects)

Users can easily switch providers by editing `.avc/avc.json` without code changes.
