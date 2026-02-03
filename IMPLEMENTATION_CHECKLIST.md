# Implementation Checklist - Approved

Based on approved decisions, this checklist details the implementation tasks.

---

## Approved Requirements

1. ✅ **Sponsor Call** creates: Project → Epic → Story (maximum depth)
2. ✅ **Project Expansion** creates: Task → Subtask (from ready Stories)
3. ✅ **No UI review** during command execution (files can be reviewed later)
4. ✅ **Provider per ceremony** in avc.json, all defaulting to Claude
5. ✅ **No fallback strategy** (simple error messages)
6. ✅ **Token budgets**: 500/800/1500 for Project/Epic/Story

---

## Phase 1: Update Configuration Template

**File:** `src/cli/init.js`

### Task 1.1: Update Default avc.json Template

**Current ceremonies configuration:**
```javascript
ceremonies: [
  {
    name: 'sponsor-call',
    defaultModel: 'claude-sonnet-4-5-20250929',
    provider: 'claude',
    agents: [
      {
        name: 'documentation',
        instruction: 'documentation.md',
        stage: 'enhancement'
      }
    ],
    guidelines: { ... }
  }
]
```

**Add to ceremonies array:**
```javascript
ceremonies: [
  {
    name: 'sponsor-call',
    provider: 'claude',
    defaultModel: 'claude-sonnet-4-5-20250929',
    agents: [
      {
        name: 'documentation',
        instruction: 'documentation.md',
        stage: 'enhancement'
      },
      {
        name: 'decomposition',
        instruction: 'decomposition.md',
        stage: 'hierarchy-generation'
      },
      {
        name: 'context-generator',
        instruction: 'context-generator.md',
        stage: 'context-generation'
      }
    ],
    guidelines: { ... }
  },
  {
    name: 'project-expansion',
    provider: 'claude',
    defaultModel: 'claude-sonnet-4-5-20250929',
    agents: [
      {
        name: 'task-decomposer',
        instruction: 'task-decomposer.md',
        stage: 'task-decomposition'
      }
    ]
  },
  {
    name: 'context-retrospective',
    provider: 'claude',
    defaultModel: 'claude-sonnet-4-5-20250929',
    agents: [
      {
        name: 'context-optimizer',
        instruction: 'context-optimizer.md',
        stage: 'optimization'
      }
    ]
  }
]
```

**Checklist:**
- [ ] Add new agent definitions for decomposition and context-generator
- [ ] Add project-expansion ceremony configuration
- [ ] Add context-retrospective ceremony configuration
- [ ] All ceremonies default to Claude

---

## Phase 2: Multi-Provider Support

**Files:** `src/cli/template-processor.js`, `src/cli/llm-provider.js`

### Task 2.1: Add Ceremony-Specific Provider Resolution

**File:** `src/cli/template-processor.js`

**Current:**
```javascript
readModelConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
    const ceremony = config.settings?.ceremonies?.[0];
    if (ceremony) {
      return { provider: ceremony.provider || 'claude', model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929' };
    }
    return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
  } catch (error) {
    console.warn('⚠️  Could not read model config, using default');
    return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
  }
}
```

**Change to:**
```javascript
constructor(ceremonyName = 'sponsor-call', progressPath = null, nonInteractive = false) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });

  this.ceremonyName = ceremonyName;
  this.templatePath = path.join(__dirname, 'templates/project.md');
  this.outputDir = path.join(process.cwd(), '.avc/project');
  this.outputPath = path.join(this.outputDir, 'doc.md');
  this.avcConfigPath = path.join(process.cwd(), '.avc/avc.json');
  this.progressPath = progressPath;
  this.nonInteractive = nonInteractive;

  // Read ceremony-specific configuration
  const { provider, model } = this.readCeremonyConfig(ceremonyName);
  this._providerName = provider;
  this._modelName = model;
  this.llmProvider = null;
}

/**
 * Read ceremony-specific configuration
 */
readCeremonyConfig(ceremonyName) {
  try {
    const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
    const ceremony = config.settings?.ceremonies?.find(c => c.name === ceremonyName);

    if (!ceremony) {
      console.warn(`⚠️  Ceremony '${ceremonyName}' not found in config, using defaults`);
      return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
    }

    return {
      provider: ceremony.provider || 'claude',
      model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929'
    };
  } catch (error) {
    console.warn(`⚠️  Could not read ceremony config: ${error.message}`);
    return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
  }
}
```

**Checklist:**
- [ ] Add `ceremonyName` parameter to constructor
- [ ] Change `readModelConfig()` to `readCeremonyConfig(ceremonyName)`
- [ ] Find ceremony by name instead of using first ceremony
- [ ] Add warning if ceremony not found
- [ ] Keep fallback to Claude defaults

### Task 2.2: Add API Key Validation

**File:** `src/cli/llm-provider.js`

**Add method to base provider:**
```javascript
/**
 * Base LLM Provider class
 */
export class LLMProvider {
  static create(provider = process.env.LLM_PROVIDER || 'claude', model = null) {
    switch (provider.toLowerCase()) {
      case 'claude':
        return new ClaudeProvider(model);
      case 'gemini':
        return new GeminiProvider(model);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Validate API key is set
   * @throws {Error} if API key is missing
   */
  validateApiKey() {
    throw new Error('validateApiKey() must be implemented by subclass');
  }
}
```

**Implement in ClaudeProvider:**
```javascript
validateApiKey() {
  if (!this.apiKey || this.apiKey.trim() === '') {
    throw new Error(`
❌ Claude API key not found

Please set ANTHROPIC_API_KEY in your .env file:
ANTHROPIC_API_KEY=sk-ant-...

Or switch to a different provider in .avc/avc.json
    `.trim());
  }
}
```

**Implement in GeminiProvider:**
```javascript
validateApiKey() {
  if (!this.apiKey || this.apiKey.trim() === '') {
    throw new Error(`
❌ Gemini API key not found

Please set GEMINI_API_KEY in your .env file:
GEMINI_API_KEY=...

Or switch to a different provider in .avc/avc.json
    `.trim());
  }
}
```

**Call in template-processor:**
```javascript
async process() {
  // Initialize LLM provider
  this.llmProvider = LLMProvider.create(this._providerName, this._modelName);
  this.llmProvider.validateApiKey(); // Validate before proceeding

  console.log(`Using ${this._providerName} (${this._modelName}) for ${this.ceremonyName} ceremony\n`);

  // Rest of process...
}
```

**Checklist:**
- [ ] Add `validateApiKey()` to LLMProvider base class
- [ ] Implement validation in ClaudeProvider
- [ ] Implement validation in GeminiProvider
- [ ] Call validation in template-processor.process()
- [ ] Show helpful error messages with .env and config guidance

---

## Phase 3: Sponsor Call Hierarchy Generation

**Files:** `src/cli/template-processor.js`, new agent files

### Task 3.1: Create Agent Instructions

**File:** `src/cli/agents/decomposition.md`

```markdown
# Epic and Story Decomposition Agent

You are an expert software architect specializing in domain-driven design and feature decomposition.

## Your Task

Given a project's Initial Scope (list of features/functional areas), decompose it into:
1. **Epics** (3-7 domain-based groupings)
2. **Stories** (2-8 user-facing capabilities per Epic)

## Epic Decomposition Rules

1. Each Epic represents a **cohesive functional domain**
2. Features sharing data models belong together
3. Cross-cutting features (auth, logging) get a separate "Foundation" Epic
4. Epics should be **parallelizable** (minimal inter-Epic dependencies)
5. Create 3-7 Epics (not too few, not too many)

## Story Decomposition Rules

1. Each Story delivers **value to a user** (user-facing capability)
2. Stories should be **testable end-to-end** (acceptance criteria)
3. Stories should be **implementable in 1-3 days**
4. Each Story should have **3-8 acceptance criteria**
5. Create 2-8 Stories per Epic

## Dependency Strategy

**Epic-level:**
- Foundation Epic: no dependencies
- Domain Epics: depend only on Foundation
- Integration Epic: depends on Domain Epics

**Story-level:**
- Dependencies form DAG (Directed Acyclic Graph), not linear chain
- Sibling Stories under different parents can run in parallel

## Output Format

Return JSON:

```json
{
  "epics": [
    {
      "id": "context-0001",
      "name": "Foundation Services",
      "domain": "infrastructure",
      "description": "Authentication, authorization, logging, error handling",
      "features": ["authentication", "authorization", "logging"],
      "dependencies": [],
      "stories": [
        {
          "id": "context-0001-0001",
          "name": "Authentication Service",
          "userType": "all users",
          "description": "Allow users to authenticate with email/password",
          "acceptance": [
            "User can log in with valid credentials",
            "Invalid credentials show clear error",
            "Session persists across browser restart",
            "Rate limiting prevents brute force attacks"
          ],
          "dependencies": []
        }
      ]
    }
  ],
  "validation": {
    "epicCount": 4,
    "storyCount": 15,
    "dependencyGraphValid": true,
    "allFeaturesMapping": true
  }
}
```

## Validation

Before returning, verify:
- [ ] 3-7 Epics created
- [ ] Each Epic has 2-8 Stories
- [ ] All features from Initial Scope are mapped to Stories
- [ ] Dependency graph is acyclic (no circular dependencies)
- [ ] Foundation Epic has no dependencies
```

**Checklist:**
- [ ] Create `src/cli/agents/decomposition.md` with instructions above
- [ ] Test prompt produces valid JSON structure
- [ ] Test with various INITIAL_SCOPE examples

### Task 3.2: Create Context Generator Agent

**File:** `src/cli/agents/context-generator.md`

```markdown
# Context Generator Agent

You generate context.md files for AVC work items following the "Layered Specificity" strategy.

## Token Budgets

- **Project level:** ~500 tokens (architectural invariants)
- **Epic level:** ~800 tokens (domain boundaries)
- **Story level:** ~1500 tokens (implementation details)

## Project Context Template (~500 tokens)

```markdown
# Project Context

## Technology Stack
[From TECHNICAL_CONSIDERATIONS - extract specific versions]
- Language/Runtime: [e.g., Node.js 18+, TypeScript 5.0]
- Framework: [e.g., Express, React]
- Database: [e.g., PostgreSQL 14]
- Infrastructure: [e.g., AWS, Docker]

## Cross-Cutting Concerns

### Security & Compliance
[From SECURITY_AND_COMPLIANCE_REQUIREMENTS]
- Authentication pattern: [e.g., JWT with RS256]
- Authorization pattern: [e.g., RBAC]
- Data encryption: [e.g., AES-256 for sensitive fields]
- Compliance: [e.g., GDPR, HIPAA]

### Performance Requirements
[From TECHNICAL_CONSIDERATIONS]
- API response time: [e.g., < 200ms p95]
- Database query time: [e.g., < 50ms p95]
- Concurrent users: [e.g., 10k]

### Architecture Principles
[Inferred from MISSION_STATEMENT + TECHNICAL_CONSIDERATIONS]
- API design: [e.g., REST with JSON]
- Error handling: [e.g., Custom AppError class]
- Logging: [e.g., Structured JSON logs with correlation IDs]
- Testing: [e.g., TDD with 80% coverage minimum]
```

## Epic Context Template (~800 tokens)

```markdown
# Epic: [Epic Name]

## Domain Scope
[From Epic description - what's IN scope, what's OUT]

This Epic encompasses: [list capabilities]
Excludes: [list what's not in this Epic]

## Domain Models
[LLM-generated based on Epic scope and features]

[EntityName] {
  [field]: [type]
  ...
}

## Integration Contracts

### Provides to other Epics
- [functionName(params): returnType] - [description]

### Consumes from other Epics
- [Epic name]: [API or event consumed]

## Epic-Specific Constraints
[From SECURITY + TECHNICAL specific to this domain]
- [Constraint 1]
- [Constraint 2]

## Technology Choices
[Inherited from Project + domain-specific additions]
- [Framework components used in this Epic]
- [Libraries specific to this domain]
```

## Story Context Template (~1500 tokens)

```markdown
# Story: [Story Name]

## User Story
As a [user type from TARGET_USERS],
I want to [capability],
So that [benefit from MISSION_STATEMENT].

## Acceptance Criteria
[From Story acceptance array]
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Implementation Scope

### Files to Create
[LLM-generated based on Epic context + tech stack]
- `[path/to/file]` - [purpose]

### Files to Modify
[If applicable]
- `[path/to/file]` - [changes needed]

### Dependencies
- Internal: [Other Stories/Epics needed]
- External: [Third-party services from TECHNICAL_CONSIDERATIONS]

### Implementation Patterns
[Inherited from Project + Epic context]
- [Pattern name]: [how to apply]

## Test Strategy

### Unit Tests
- [What to test at unit level]

### Integration Tests
- [What to test at integration level]

### E2E Tests
- [User workflow to verify]
```

## Instructions

1. **Use concrete details** from the input, not placeholders
2. **Stay within token budget** for the level
3. **Reference, don't duplicate** (e.g., "See Project context for auth pattern" instead of repeating)
4. **Be specific** (e.g., "PostgreSQL 14" not "database")

## Output Format

Return JSON:

```json
{
  "level": "project|epic|story",
  "id": "project|context-XXXX|context-XXXX-XXXX",
  "contextMarkdown": "[generated context.md content]",
  "tokenCount": 487,
  "withinBudget": true
}
```
```

**Checklist:**
- [ ] Create `src/cli/agents/context-generator.md`
- [ ] Test generates contexts within token budgets
- [ ] Test references parent context instead of duplicating

### Task 3.3: Add Hierarchy Generation Logic

**File:** `src/cli/template-processor.js`

**Add new method after `process()`:**

```javascript
/**
 * Generate hierarchical structure (Project → Epic → Story)
 */
async generateHierarchy(enhancedDoc, userResponses) {
  console.log('\n📊 Generating project hierarchy...\n');

  // Step 1: Decompose Initial Scope into Epics and Stories
  const decompositionAgent = this.getAgentForStage('hierarchy-generation');
  const decompositionPrompt = this.buildDecompositionPrompt(enhancedDoc, userResponses);

  console.log('   Decomposing features into Epics and Stories...');
  const decomposition = await this.llmProvider.generateJSON(decompositionPrompt, decompositionAgent);

  console.log(`   ✓ Identified ${decomposition.epics.length} Epics`);
  console.log(`   ✓ Identified ${decomposition.epics.reduce((sum, e) => sum + e.stories.length, 0)} Stories\n`);

  // Step 2: Generate Project-level context
  console.log('   Generating Project context...');
  const projectContext = await this.generateContext({
    level: 'project',
    content: enhancedDoc,
    userResponses,
    tokenBudget: 500
  });

  // Step 3: Generate Epic contexts and Story contexts
  for (let i = 0; i < decomposition.epics.length; i++) {
    const epic = decomposition.epics[i];
    console.log(`   Generating Epic ${i + 1}/${decomposition.epics.length}: ${epic.name}`);

    epic.context = await this.generateContext({
      level: 'epic',
      parentContext: projectContext,
      epicData: epic,
      userResponses,
      tokenBudget: 800
    });

    for (let j = 0; j < epic.stories.length; j++) {
      const story = epic.stories[j];
      console.log(`     Generating Story ${j + 1}/${epic.stories.length}: ${story.name}`);

      story.context = await this.generateContext({
        level: 'story',
        parentContext: epic.context,
        storyData: story,
        epicData: epic,
        userResponses,
        tokenBudget: 1500
      });
    }
  }

  console.log('\n✓ Hierarchy generation complete\n');

  return {
    project: {
      context: projectContext
    },
    epics: decomposition.epics
  };
}

/**
 * Build decomposition prompt
 */
buildDecompositionPrompt(enhancedDoc, userResponses) {
  return `
Given this project information:

**Mission Statement:**
${userResponses.MISSION_STATEMENT}

**Target Users:**
${userResponses.TARGET_USERS}

**Initial Scope (Features):**
${userResponses.INITIAL_SCOPE}

**Technical Considerations:**
${userResponses.TECHNICAL_CONSIDERATIONS}

**Security & Compliance:**
${userResponses.SECURITY_AND_COMPLIANCE_REQUIREMENTS}

Decompose the Initial Scope into Epics (3-7) and Stories (2-8 per Epic).
Follow the rules in your agent instructions.
  `.trim();
}

/**
 * Generate context.md for a specific level
 */
async generateContext(params) {
  const { level, parentContext, content, epicData, storyData, userResponses, tokenBudget } = params;

  const contextAgent = this.getAgentForStage('context-generation');
  const contextPrompt = this.buildContextPrompt(level, parentContext, content, epicData, storyData, userResponses, tokenBudget);

  const result = await this.llmProvider.generateJSON(contextPrompt, contextAgent);

  if (!result.withinBudget) {
    console.warn(`⚠️  ${level} context exceeds token budget (${result.tokenCount}/${tokenBudget} tokens)`);
  }

  return result.contextMarkdown;
}

/**
 * Build context generation prompt
 */
buildContextPrompt(level, parentContext, content, epicData, storyData, userResponses, tokenBudget) {
  let prompt = `Generate a context.md file for ${level} level.\n\n`;

  prompt += `**Token Budget:** ~${tokenBudget} tokens\n\n`;

  if (level === 'project') {
    prompt += `**Input:**\n`;
    prompt += `Mission: ${userResponses.MISSION_STATEMENT}\n`;
    prompt += `Tech Stack: ${userResponses.TECHNICAL_CONSIDERATIONS}\n`;
    prompt += `Security: ${userResponses.SECURITY_AND_COMPLIANCE_REQUIREMENTS}\n\n`;
  }

  if (level === 'epic') {
    prompt += `**Parent Context:**\n${parentContext}\n\n`;
    prompt += `**Epic Data:**\n`;
    prompt += `Name: ${epicData.name}\n`;
    prompt += `Description: ${epicData.description}\n`;
    prompt += `Features: ${epicData.features.join(', ')}\n`;
    prompt += `Dependencies: ${epicData.dependencies.join(', ') || 'None'}\n\n`;
  }

  if (level === 'story') {
    prompt += `**Parent Context (Epic):**\n${parentContext}\n\n`;
    prompt += `**Story Data:**\n`;
    prompt += `Name: ${storyData.name}\n`;
    prompt += `User Type: ${storyData.userType}\n`;
    prompt += `Description: ${storyData.description}\n`;
    prompt += `Acceptance Criteria:\n${storyData.acceptance.map(a => `- ${a}`).join('\n')}\n`;
    prompt += `Dependencies: ${storyData.dependencies.join(', ') || 'None'}\n\n`;
  }

  prompt += `Follow the ${level} context template in your instructions.`;

  return prompt;
}
```

**Update main `process()` method:**

```javascript
async process() {
  this.llmProvider = LLMProvider.create(this._providerName, this._modelName);
  this.llmProvider.validateApiKey();

  console.log(`Using ${this._providerName} (${this._modelName}) for ${this.ceremonyName} ceremony\n`);

  // Existing: Read template and collect values
  const template = fs.readFileSync(this.templatePath, 'utf8');
  const collectedValues = this.parseTemplate(template);

  // Existing: Replace variables
  let processedContent = template;
  for (const [variable, value] of Object.entries(collectedValues)) {
    processedContent = processedContent.replace(new RegExp(`{{${variable}}}`, 'g'), value);
  }

  // Existing: Enhance document
  console.log('\n🤖 Enhancing project documentation...\n');
  const enhancedContent = await this.enhanceWithLLM(processedContent);

  // NEW: Generate hierarchy
  const hierarchy = await this.generateHierarchy(enhancedContent, collectedValues);

  // NEW: Write hierarchy to files
  await this.writeHierarchyToFiles(hierarchy, enhancedContent);

  console.log('\n✅ Sponsor Call ceremony complete!\n');
  console.log('   Project structure created in .avc/project/\n');
}
```

**Checklist:**
- [ ] Add `generateHierarchy()` method
- [ ] Add `buildDecompositionPrompt()` method
- [ ] Add `generateContext()` method
- [ ] Add `buildContextPrompt()` method
- [ ] Update `process()` to call hierarchy generation
- [ ] Add logging for user feedback

### Task 3.4: Write Hierarchy to Files

**File:** `src/cli/template-processor.js`

```javascript
/**
 * Write hierarchy (Project/Epic/Story) to files
 */
async writeHierarchyToFiles(hierarchy, enhancedDoc) {
  const projectDir = path.join(process.cwd(), '.avc/project');

  console.log('\n📝 Writing files...\n');

  // 1. Write Project-level files
  console.log('   Writing project files...');

  // Project doc.md (enhanced documentation)
  fs.writeFileSync(
    path.join(projectDir, 'doc.md'),
    enhancedDoc,
    'utf8'
  );

  // Project context.md
  fs.writeFileSync(
    path.join(projectDir, 'context.md'),
    hierarchy.project.context,
    'utf8'
  );

  // Project work.json
  fs.writeFileSync(
    path.join(projectDir, 'work.json'),
    JSON.stringify({
      id: 'project',
      name: this.getProjectName(),
      status: 'ready',
      dependencies: [],
      prompt: 'Project initialized. Run /project-expansion to decompose Epics into Tasks.',
      validation: {
        status: 'pending',
        tests: [],
        allTestsPassed: false
      },
      createdAt: new Date().toISOString(),
      completedAt: null
    }, null, 2),
    'utf8'
  );

  // 2. Write Epic-level files
  for (let i = 0; i < hierarchy.epics.length; i++) {
    const epic = hierarchy.epics[i];
    const epicDir = path.join(projectDir, epic.id);

    console.log(`   Writing Epic ${i + 1}/${hierarchy.epics.length}: ${epic.name}`);

    // Create Epic directory
    if (!fs.existsSync(epicDir)) {
      fs.mkdirSync(epicDir, { recursive: true });
    }

    // Epic doc.md
    fs.writeFileSync(
      path.join(epicDir, 'doc.md'),
      `# ${epic.name}\n\n${epic.description}\n\n## Features\n\n${epic.features.map(f => `- ${f}`).join('\n')}`,
      'utf8'
    );

    // Epic context.md
    fs.writeFileSync(
      path.join(epicDir, 'context.md'),
      epic.context,
      'utf8'
    );

    // Epic work.json
    fs.writeFileSync(
      path.join(epicDir, 'work.json'),
      JSON.stringify({
        id: epic.id,
        name: epic.name,
        status: 'ready',
        dependencies: epic.dependencies,
        prompt: `Expand this Epic into Tasks during Project Expansion ceremony.`,
        validation: {
          status: 'pending',
          tests: [],
          allTestsPassed: false
        },
        createdAt: new Date().toISOString(),
        completedAt: null
      }, null, 2),
      'utf8'
    );

    // 3. Write Story-level files
    for (let j = 0; j < epic.stories.length; j++) {
      const story = epic.stories[j];
      const storyDir = path.join(epicDir, story.id);

      console.log(`     Writing Story ${j + 1}/${epic.stories.length}: ${story.name}`);

      // Create Story directory
      if (!fs.existsSync(storyDir)) {
        fs.mkdirSync(storyDir, { recursive: true });
      }

      // Story doc.md
      fs.writeFileSync(
        path.join(storyDir, 'doc.md'),
        `# ${story.name}\n\n${story.description}\n\n## Acceptance Criteria\n\n${story.acceptance.map(a => `- [ ] ${a}`).join('\n')}`,
        'utf8'
      );

      // Story context.md
      fs.writeFileSync(
        path.join(storyDir, 'context.md'),
        story.context,
        'utf8'
      );

      // Story work.json
      fs.writeFileSync(
        path.join(storyDir, 'work.json'),
        JSON.stringify({
          id: story.id,
          name: story.name,
          status: 'ready',
          dependencies: story.dependencies,
          prompt: `Expand this Story into Tasks during Project Expansion ceremony.`,
          validation: {
            status: 'pending',
            tests: [],
            allTestsPassed: false
          },
          createdAt: new Date().toISOString(),
          completedAt: null
        }, null, 2),
        'utf8'
      );
    }
  }

  console.log('\n✓ All files written successfully\n');
}

/**
 * Get project name from questionnaire or default
 */
getProjectName() {
  // Try to extract from mission statement or use directory name
  const dirName = path.basename(process.cwd());
  return dirName || 'AVC Project';
}
```

**Checklist:**
- [ ] Add `writeHierarchyToFiles()` method
- [ ] Write Project-level files (doc.md, context.md, work.json)
- [ ] Write Epic-level files for each Epic
- [ ] Write Story-level files for each Story
- [ ] All work.json files have `status: "ready"`
- [ ] Log progress for user feedback

---

## Phase 4: Update LLM Provider for JSON Generation

**File:** `src/cli/llm-provider.js`, `src/cli/llm-claude.js`, `src/cli/llm-gemini.js`

### Task 4.1: Add generateJSON() Method

**Base class:**
```javascript
/**
 * Generate structured JSON output
 * @param {string} prompt - The generation prompt
 * @param {string} agentInstructions - Agent-specific instructions
 * @returns {Promise<Object>} - Parsed JSON result
 */
async generateJSON(prompt, agentInstructions) {
  throw new Error('generateJSON() must be implemented by subclass');
}
```

**ClaudeProvider implementation:**
```javascript
async generateJSON(prompt, agentInstructions) {
  const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: fullPrompt
    }],
    system: 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.'
  });

  const content = response.content[0].text;

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonStr);
}
```

**GeminiProvider implementation:**
```javascript
async generateJSON(prompt, agentInstructions) {
  const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

  const result = await this.model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json' // Gemini's JSON mode
    }
  });

  const content = result.response.text();
  return JSON.parse(content);
}
```

**Checklist:**
- [ ] Add `generateJSON()` to base LLMProvider class
- [ ] Implement in ClaudeProvider with JSON extraction
- [ ] Implement in GeminiProvider with native JSON mode
- [ ] Handle parsing errors gracefully

---

## Phase 5: Testing

### Task 5.1: Unit Tests

**File:** `src/tests/unit/ceremony-provider.test.js`

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateProcessor } from '../../cli/template-processor.js';
import fs from 'fs';

describe('Ceremony Provider Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read ceremony config for sponsor-call', () => {
    const processor = new TemplateProcessor('sponsor-call');
    const config = processor.readCeremonyConfig('sponsor-call');

    expect(config.provider).toBe('claude');
    expect(config.model).toBe('claude-sonnet-4-5-20250929');
  });

  it('should fall back to defaults for unknown ceremony', () => {
    const processor = new TemplateProcessor('unknown-ceremony');
    const config = processor.readCeremonyConfig('unknown-ceremony');

    expect(config.provider).toBe('claude');
    expect(config.model).toBe('claude-sonnet-4-5-20250929');
  });
});
```

**Checklist:**
- [ ] Test ceremony config resolution
- [ ] Test fallback to defaults
- [ ] Test with missing config file

### Task 5.2: Integration Tests

**File:** `src/tests/integration/sponsor-call-hierarchy.test.js`

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateProcessor } from '../../cli/template-processor.js';
import fs from 'fs';
import path from 'path';

describe('Sponsor Call Hierarchy Generation', () => {
  const testDir = path.join(process.cwd(), '.avc-test');
  const projectDir = path.join(testDir, 'project');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    process.chdir(testDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create Project/Epic/Story structure', async () => {
    const mockResponses = {
      MISSION_STATEMENT: 'Build a task management app',
      TARGET_USERS: 'Team managers, Developers',
      INITIAL_SCOPE: 'User auth, Task creation, Task tracking, Team collaboration',
      TECHNICAL_CONSIDERATIONS: 'Node.js, React, PostgreSQL',
      SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'GDPR, JWT auth'
    };

    const processor = new TemplateProcessor('sponsor-call', null, true);
    // Mock LLM calls for testing
    processor.llmProvider = createMockProvider();

    await processor.process();

    // Verify structure
    expect(fs.existsSync(path.join(projectDir, 'doc.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'context.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'work.json'))).toBe(true);

    // Verify at least one Epic exists
    const files = fs.readdirSync(projectDir);
    const epicDirs = files.filter(f => f.startsWith('context-') && fs.statSync(path.join(projectDir, f)).isDirectory());
    expect(epicDirs.length).toBeGreaterThan(0);

    // Verify Epic has Stories
    const firstEpic = epicDirs[0];
    const epicFiles = fs.readdirSync(path.join(projectDir, firstEpic));
    const storyDirs = epicFiles.filter(f => f.startsWith('context-') && fs.statSync(path.join(projectDir, firstEpic, f)).isDirectory());
    expect(storyDirs.length).toBeGreaterThan(0);
  });
});
```

**Checklist:**
- [ ] Test hierarchy creation
- [ ] Test file structure
- [ ] Test work.json content
- [ ] Test context.md content (token budgets)

---

## Phase 6: Documentation

### Task 6.1: Update README.md

**Add after Multi-Provider section:**

```markdown
### Sponsor Call Ceremony Output

The Sponsor Call ceremony now creates a complete hierarchical project structure:

```
.avc/project/
├── doc.md                    # Enhanced project documentation
├── context.md                # Project-level context (~500 tokens)
├── work.json                 # Project work item (status: ready)
├── context-0001/             # Epic 1 (e.g., Foundation Services)
│   ├── doc.md
│   ├── context.md            # Epic-level context (~800 tokens)
│   ├── work.json             # Epic work item (status: ready)
│   ├── context-0001-0001/    # Story 1 (e.g., Authentication Service)
│   │   ├── doc.md
│   │   ├── context.md        # Story-level context (~1500 tokens)
│   │   └── work.json         # Story work item (status: ready)
│   └── context-0001-0002/    # Story 2
│       └── ...
└── context-0002/             # Epic 2
    └── ...
```

**What's Created:**
- **3-7 Epics** (domain-based feature groupings)
- **10-30 Stories** (user-facing capabilities, 2-8 per Epic)
- **Context files** at each level following token budgets
- **Work items** in "ready" status for Project Expansion

**Next Step:** Run `/project-expansion` to decompose Stories into Tasks and Subtasks
```

**Checklist:**
- [ ] Document new Sponsor Call output
- [ ] Show file structure example
- [ ] Explain Epic/Story counts
- [ ] Link to Project Expansion

### Task 6.2: Update COMMANDS.md

**Update `/sponsor-call` section:**

```markdown
### /sponsor-call

Runs the Sponsor Call ceremony to initialize your project.

**Two-step process:**
1. `/init` - Create project structure and config
2. `/sponsor-call` - Run interactive questionnaire

**What it does:**
1. Collects 5 questionnaire responses (Mission, Users, Scope, Tech, Security)
2. Generates enhanced project documentation
3. Decomposes Initial Scope into Epics (3-7) and Stories (2-8 per Epic)
4. Creates context.md files at Project/Epic/Story levels
5. Writes complete hierarchy to `.avc/project/`

**Output:**
- Project/Epic/Story structure in `.avc/project/`
- All work items in "ready" status
- Token-optimized contexts (500/800/1500 tokens)

**LLM Provider:**
Configured in `.avc/avc.json` (defaults to Claude Sonnet 4.5)

**Next step:**
Run `/project-expansion` to decompose Stories into Tasks
```

**Checklist:**
- [ ] Update command description
- [ ] Document new output structure
- [ ] Mention provider configuration
- [ ] Link to next ceremony

---

## Summary Checklist

### Phase 1: Configuration ✅
- [ ] Update avc.json template with ceremonies
- [ ] Add decomposition and context-generator agents
- [ ] Add project-expansion ceremony config

### Phase 2: Multi-Provider ✅
- [ ] Add ceremonyName parameter to constructor
- [ ] Implement readCeremonyConfig()
- [ ] Add API key validation
- [ ] Show helpful error messages

### Phase 3: Hierarchy Generation ✅
- [ ] Create decomposition.md agent instructions
- [ ] Create context-generator.md agent instructions
- [ ] Implement generateHierarchy()
- [ ] Implement generateContext()
- [ ] Implement writeHierarchyToFiles()

### Phase 4: LLM Provider ✅
- [ ] Add generateJSON() to base class
- [ ] Implement in ClaudeProvider
- [ ] Implement in GeminiProvider

### Phase 5: Testing ✅
- [ ] Unit tests for ceremony config
- [ ] Integration tests for hierarchy creation
- [ ] Verify file structure
- [ ] Verify token budgets

### Phase 6: Documentation ✅
- [ ] Update README.md with new output
- [ ] Update COMMANDS.md with /sponsor-call details
- [ ] Update CLAUDE.md if needed

---

## Ready to Implement

All requirements are approved and documented. Implementation can begin.

**Estimated Timeline:**
- Phase 1-2 (Config + Multi-Provider): 1 day
- Phase 3 (Hierarchy Generation): 2 days
- Phase 4 (LLM Provider): 0.5 day
- Phase 5 (Testing): 1 day
- Phase 6 (Documentation): 0.5 day
- **Total: 5 days**
