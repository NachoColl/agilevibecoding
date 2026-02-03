# Sponsor Call Ceremony - Workflow Documentation

## How It Works

```mermaid
graph LR
    A[Questionnaire] --> B[Template Replacement]
    B --> C[Document Enhancement]
    C --> D[Hierarchy Generation]
    D --> E[Context Generation]
    E --> F[File Writing]
    F --> G[Token Tracking]
```

## Step-by-Step Implementation

### **Step 1: Questionnaire**
*Collect answers, generate AI suggestions for skipped questions using domain-specific agents*

**Location:** `template-processor.js:652-727` (method: `processTemplate`)

**What Happens:**
1. **Read Template** (`line 656`)
   - Reads `cli/templates/project.md`
   - File path: `src/cli/templates/project.md`

2. **Extract Variables** (`line 659`)
   - Parses template for variables like `{{MISSION_STATEMENT}}`, `{{TARGET_USERS}}_PLURAL`, etc.
   - Uses regex: `/\{\{([A-Z_]+)(_PLURAL)?\}\}/g`
   - Method: `extractVariables()` (line 134-156)
   - **5 Questions Identified:**
     1. `MISSION_STATEMENT` - Core purpose and value proposition
     2. `TARGET_USERS` - User personas and roles (plural)
     3. `INITIAL_SCOPE` - Features and functional areas (plural)
     4. `TECHNICAL_CONSIDERATIONS` - Technology stack and architecture
     5. `SECURITY_AND_COMPLIANCE_REQUIREMENTS` - Security and compliance needs

3. **Interactive Prompting** (`line 710-726`)
   - For each variable, call `promptUser(variable, collectedValues)` (line 406-493)
   - Displays guidance/examples from template
   - User can:
     - Type answer (multi-line supported)
     - Press Enter immediately to skip → triggers AI suggestion with domain agent

4. **AI Suggestion Generation with Domain-Specific Agents** (for skipped questions) (`line 678-680`)
   - Method: `generateSuggestions(variableName, isPlural, context)` (line 409-434)
   - **Agent Selection** (`getAgentForVariable()` - line 343-364):
     ```javascript
     const agentMap = {
       'MISSION_STATEMENT': 'suggestion-business-analyst.md',
       'TARGET_USERS': 'suggestion-ux-researcher.md',
       'INITIAL_SCOPE': 'suggestion-product-manager.md',
       'TECHNICAL_CONSIDERATIONS': 'suggestion-technical-architect.md',
       'SECURITY_AND_COMPLIANCE_REQUIREMENTS': 'suggestion-security-specialist.md'
     };
     ```
   - **API Call with Specialized Agent:**
     ```javascript
     const text = await this.llmProvider.generate(
       prompt,              // Context + variable name
       isPlural ? 512 : 1024,  // Max output tokens
       agentInstructions    // Domain-specific agent as system prompt
     );
     ```

5. **Domain-Specific Agents** (5 specialized agents):

   **A. Business Analyst** (`suggestion-business-analyst.md`)
   - **For:** `MISSION_STATEMENT`
   - **Expertise:** Defining clear, compelling mission statements
   - **Output:** 50-100 word mission statement
   - **Format:** "Enable/Empower/Provide [users] to [action] through [approach]"
   - **Focus:** Value proposition, target users, core purpose
   - **Example:** "Enable small businesses to manage inventory and sales through an intuitive mobile-first platform..."

   **B. UX Researcher** (`suggestion-ux-researcher.md`)
   - **For:** `TARGET_USERS` (plural)
   - **Expertise:** Identifying user personas and roles
   - **Output:** 2-4 distinct user types with descriptions
   - **Considerations:** Domain context (B2B, B2C, Healthcare), role clarity, permission levels
   - **Example:** "1. Project Managers - Team leads who plan sprints and track progress"

   **C. Product Manager** (`suggestion-product-manager.md`)
   - **For:** `INITIAL_SCOPE` (plural)
   - **Expertise:** Defining features and prioritizing scope
   - **Output:** 5-8 high-level feature areas
   - **Categories:** Core (must-have), Secondary (important), Enhancement (nice-to-have)
   - **Focus:** User value, not technical implementation
   - **Example:** "1. User Authentication and Profile Management - Secure login, registration, and profile customization"

   **D. Technical Architect** (`suggestion-technical-architect.md`)
   - **For:** `TECHNICAL_CONSIDERATIONS`
   - **Expertise:** Technology stack, architecture patterns, scalability
   - **Output:** 100-200 word technical overview
   - **Covers:** Technology stack, architecture approach, scalability/performance, constraints
   - **Example:** "Use Node.js with Express for backend API, React for frontend SPA, PostgreSQL for data..."

   **E. Security Specialist** (`suggestion-security-specialist.md`)
   - **For:** `SECURITY_AND_COMPLIANCE_REQUIREMENTS`
   - **Expertise:** Security, privacy, compliance regulations
   - **Output:** 150-250 word security overview
   - **Covers:** Authentication/authorization, data protection, compliance (HIPAA, GDPR, PCI-DSS), monitoring
   - **Example:** "Implement OAuth 2.0 with MFA for healthcare providers. Encrypt all PHI using AES-256..."

6. **Progress Saving** (`line 716-725`)
   - After each answer, saves to `.avc/sponsor-call-progress.json`
   - Enables resume if user exits mid-questionnaire
   - Stores: `{ stage, totalQuestions, answeredQuestions, collectedValues, lastUpdate }`

**Files Involved:**
- Input: `src/cli/templates/project.md`
- Input (agents): `src/cli/agents/suggestion-*.md` (5 agent files)
- Output: In-memory `collectedValues` object
- Progress: `.avc/sponsor-call-progress.json`

**API Calls:**
- **0-5 API calls** (one per skipped question)
- Each call uses a **domain-specific agent** as system prompt
- Token limits: 512 for plural (arrays), 1024 for singular (longer responses)
- Uses LLM provider configured in `.avc/avc.json` (Claude or Gemini)

**Agent Files Summary:**
| Question | Agent | File | Output |
|----------|-------|------|--------|
| Mission Statement | Business Analyst | `suggestion-business-analyst.md` | 50-100 word mission |
| Target Users | UX Researcher | `suggestion-ux-researcher.md` | 2-4 user personas |
| Initial Scope | Product Manager | `suggestion-product-manager.md` | 5-8 feature areas |
| Technical Considerations | Technical Architect | `suggestion-technical-architect.md` | Tech stack + architecture |
| Security Requirements | Security Specialist | `suggestion-security-specialist.md` | Compliance + security controls |

---

### **Step 2: Template Replacement**
*Fill project template with collected answers*

**Location:** `template-processor.js:729-731`

**What Happens:**
1. **Variable Replacement** (`line 731`)
   - Method: `replaceVariables(templateContent, collectedValues)` (line 158-191)
   - Replaces all `{{VARIABLE}}` placeholders with collected values
   - Handles plural variables (arrays) by joining with newlines and bullet points
   - Example:
     ```
     {{TARGET_USERS}}_PLURAL with ["Developers", "Managers"]
     becomes:
     - Developers
     - Managers
     ```

2. **Output Format**
   - Creates plain markdown document with all variables filled
   - Example output:
     ```markdown
     # Project Name

     ## Mission Statement
     [User's answer or AI suggestion]

     ## Target Users
     - [User type 1]
     - [User type 2]
     ...
     ```

**Files Involved:**
- Input: Template content (string) + collectedValues (object)
- Output: In-memory `templateWithValues` (string)

**API Calls:** None (pure string manipulation)

---

### **Step 3: Document Enhancement**
*AI transforms template into professional 8-section document*

**Location:** `template-processor.js:733-734, 496-541`

**What Happens:**
1. **Load Agent Instructions** (`line 507`)
   - Reads agent file: `src/cli/agents/documentation.md` (11,085 bytes)
   - Agent role: **Documentation Specialist**
   - Contains detailed instructions for:
     - 8-section document structure (Mission, Users, Scope, Features, etc.)
     - Professional tone and formatting
     - Markdown best practices
     - Token budget: 2048 tokens

2. **API Call - Document Enhancement** (`line 518-521`)
   ```javascript
   const enhanced = await this.llmProvider.generate(
     userPrompt,          // Template with filled variables
     4096,                // Max output tokens
     agentInstructions    // documentation.md content as system prompt
   );
   ```
   - **Agent Used:** Documentation Specialist (`agents/documentation.md`)
   - **Input:** Template with all variables filled
   - **Output:** Professional 8-section markdown document
   - **Max Tokens:** 4096 output tokens

3. **Retry Logic** (`line 518`)
   - Uses `retryWithBackoff()` (line 1044-1067)
   - Retries up to 3 times on failure
   - Exponential backoff: 2s, 4s, 8s delays

**Files Involved:**
- Input: `src/cli/agents/documentation.md` (agent instructions)
- Input: `templateWithValues` (string)
- Output: In-memory `finalDocument` (enhanced markdown)

**API Calls:**
- **1 API call** for document enhancement
- Provider: Claude or Gemini (from config)
- Tokens: ~500-2000 input, 1000-4000 output (varies by project size)

---

### **Step 4: Hierarchy Generation**
*AI decomposes features into 3-7 Epics and 10-30 Stories*

**Location:** `template-processor.js:758-846, specific at 772-784`

**What Happens:**
1. **Load Agent Instructions** (`line 762-765`)
   - Reads agent file: `src/cli/agents/decomposition.md` (4,284 bytes)
   - Agent role: **Software Architect**
   - Contains instructions for:
     - Feature decomposition into Epics (3-7) and Stories (10-30)
     - Validation rules
     - JSON schema for output
     - ID naming conventions (epic-001, story-001-001)

2. **Build Decomposition Prompt** (`line 773`)
   - Method: `buildDecompositionPrompt(collectedValues)` (line 848-877)
   - Includes: mission, users, scope, features, technical considerations
   - Asks for JSON output with structure:
     ```json
     {
       "epics": [
         {
           "id": "epic-001",
           "name": "Epic Name",
           "description": "...",
           "stories": [
             {
               "id": "story-001-001",
               "name": "Story Name",
               "description": "...",
               "acceptanceCriteria": ["..."]
             }
           ]
         }
       ],
       "validation": { "epicCount": 5, "storyCount": 23 }
     }
     ```

3. **API Call - Hierarchy Decomposition** (`line 774-777`)
   ```javascript
   const hierarchy = await this.retryWithBackoff(
     () => this.llmProvider.generateJSON(decompositionPrompt, decompositionAgent),
     'hierarchy decomposition'
   );
   ```
   - **Agent Used:** Software Architect (`agents/decomposition.md`)
   - **Input:** All questionnaire answers + agent instructions
   - **Output:** JSON object with epics and stories
   - **Method:** `generateJSON()` - Forces JSON mode with schema validation

4. **Validation** (`line 780-782`)
   - Checks response has `epics` array
   - Validates structure matches expected schema
   - Throws error if invalid

5. **Output** (`line 784`)
   - Logs: `✅ Generated {N} Epics with {M} Stories`
   - Stores hierarchy in memory for next step

**Files Involved:**
- Input: `src/cli/agents/decomposition.md` (agent instructions)
- Input: `collectedValues` (questionnaire answers)
- Output: In-memory `hierarchy` object

**API Calls:**
- **1 API call** for decomposition
- Provider: Claude or Gemini (requires `generateJSON` support)
- Tokens: ~800-1500 input, 2000-5000 output
- **Note:** Only Claude supports `generateJSON` currently (uses JSON schema mode)

---

### **Step 5: Context Generation**
*AI creates context.md files for project/epics/stories*

**Location:** `template-processor.js:786-824`

**What Happens:**
1. **Load Agent Instructions** (`line 766-769`)
   - Reads agent file: `src/cli/agents/context-generator.md` (7,571 bytes)
   - Agent role: **Context Generator**
   - Contains instructions for:
     - Writing context.md files (200-400 tokens each)
     - Context inheritance rules
     - Information to include at each level
     - Token budget validation

2. **Calculate Total Contexts** (`line 790-791`)
   - Formula: `1 (project) + N epics + M stories`
   - Example: 1 + 5 epics + 23 stories = 29 contexts

3. **Generate Project Context** (`line 796-800`)
   ```javascript
   const projectContext = await this.retryWithBackoff(
     () => this.generateContext('project', 'project', collectedValues, contextGeneratorAgent),
     'project context'
   );
   ```
   - **API Call:** `generateJSON(prompt, agentInstructions)` (line 888)
   - Returns: `{ contextMarkdown, tokenCount, withinBudget }`
   - Target: 200-400 tokens

4. **Generate Epic Contexts** (`line 803-811`)
   - Loop through each epic
   - For each epic, call:
     ```javascript
     const epicContext = await this.retryWithBackoff(
       () => this.generateContext('epic', epic.id, { ...collectedValues, epic }, contextGeneratorAgent),
       `epic ${epic.id} context`
     );
     ```
   - Progress: `→ Epic epic-001: User Authentication (6/29)`

5. **Generate Story Contexts** (`line 814-821`)
   - Nested loop: for each story in each epic
   - Call:
     ```javascript
     await this.retryWithBackoff(
       () => this.generateContext('story', story.id, { ...collectedValues, epic, story }, contextGeneratorAgent),
       `story ${story.id} context`
     );
     ```
   - Progress: `   → Story story-001-001: Login Form (7/29)`

6. **Context Prompt Structure** (`line 909-946`)
   - Method: `buildContextPrompt(level, id, data)`
   - Includes:
     - **Project level:** Full questionnaire answers
     - **Epic level:** Project context + epic details
     - **Story level:** Project + epic context + story details
   - Ensures context inheritance

**Files Involved:**
- Input: `src/cli/agents/context-generator.md` (agent instructions)
- Input: `collectedValues` + hierarchy data
- Output: In-memory context objects (not saved yet)

**API Calls:**
- **29 API calls** (example: 1 project + 5 epics + 23 stories)
- Actual count: 1 + {epic count} + {story count}
- Provider: Claude or Gemini
- Tokens per call: ~300-800 input, 200-400 output
- **Total tokens for this step:** ~10,000-20,000 (most expensive step)

**Retry Logic:**
- Each API call wrapped in `retryWithBackoff()`
- Up to 3 retries per context
- Exponential backoff: 2s, 4s, 8s

---

### **Step 6: File Writing**
*Write all files to `.avc/project/` directory*

**Location:** `template-processor.js:826-828, 953-1030`

**What Happens:**
1. **Write Project Files** (`line 956-968`)
   - Create directory: `.avc/project/project/`
   - **Write file:** `.avc/project/project/context.md`
     - Content: `projectContext.contextMarkdown` (from Step 5)
     - Size: ~200-400 tokens (~800-1600 bytes)
   - **Write file:** `.avc/project/project/doc.md`
     - Content: `finalDocument` (enhanced document from Step 3)
     - Size: ~1000-4000 tokens (~4000-16000 bytes)
     - Written by `writeDocument()` method (line 542-559)

2. **Write Epic Files** (`line 971-1005`)
   - For each epic in hierarchy:
     - Create directory: `.avc/project/{epic-id}/`
     - **Write file:** `.avc/project/{epic-id}/doc.md`
       - Initial placeholder: `# {epic.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*`
       - Updated later during retrospective ceremony
     - **Write file:** `.avc/project/{epic-id}/context.md`
       - Content: Generated context for epic
       - Size: ~200-400 tokens

3. **Write Story Files** (`line 1007-1029`)
   - For each story in each epic:
     - Create directory: `.avc/project/{epic-id}/{story-id}/`
     - **Write file:** `.avc/project/{epic-id}/{story-id}/doc.md`
       - Initial content:
         ```markdown
         # {story.name}

         ## Description
         {story.description}

         ## Acceptance Criteria
         {bulleted list of criteria}

         *Additional documentation will be added during implementation.*
         ```
     - **Write file:** `.avc/project/{epic-id}/{story-id}/context.md`
       - Content: Generated context for story
       - Size: ~200-400 tokens

4. **Console Output** (`line 968, 983, 995, 1013, 1025`)
   - Prints progress: `✅ project/context.md`
   - Prints progress: `✅ epic-001/doc.md`
   - Prints progress: `✅ epic-001/context.md`
   - Prints progress: `✅ epic-001/story-001-001/doc.md`
   - Prints progress: `✅ epic-001/story-001-001/context.md`

**Files Created:**

Example structure (5 epics, 23 stories):
```
.avc/project/
├── project/
│   ├── doc.md              # Enhanced document from Step 3
│   └── context.md          # Project context
├── epic-001/
│   ├── doc.md              # Placeholder
│   ├── context.md          # Epic context
│   ├── story-001-001/
│   │   ├── doc.md          # Story description + acceptance criteria
│   │   └── context.md      # Story context
│   ├── story-001-002/
│   │   ├── doc.md
│   │   └── context.md
│   └── ...
├── epic-002/
│   └── ...
└── ...
```

**Total files created:** `2 + (epics × 2) + (stories × 2)`
- Example: 2 + (5 × 2) + (23 × 2) = **58 files**

**API Calls:** None (pure file I/O)

---

### **Step 7: Token Tracking**
*Save token usage statistics*

**Location:** `template-processor.js:830-845`

**What Happens:**
1. **Get Token Usage** (`line 832`)
   ```javascript
   const usage = this.llmProvider.getTokenUsage();
   ```
   - Returns: `{ inputTokens, outputTokens, totalTokens, totalCalls, provider, model }`
   - Accumulated across all API calls in Steps 1, 3, 4, 5

2. **Display Statistics** (`line 833-837`)
   ```
   📊 Token Usage:
      Input: 15,234 tokens
      Output: 8,456 tokens
      Total: 23,690 tokens
      API Calls: 31
   ```

3. **Save to Token History** (`line 840-843`)
   ```javascript
   this.tokenTracker.addExecution(this.ceremonyName, {
     input: usage.inputTokens,
     output: usage.outputTokens
   });
   ```
   - **Writes file:** `.avc/token-history.json`
   - Updates aggregations:
     - Global totals (daily, weekly, monthly, allTime)
     - Per-ceremony totals (sponsor-call: daily, weekly, monthly, allTime)
   - Enables tracking via `/tokens` command

4. **Confirmation** (`line 844`)
   - Prints: `✅ Token history updated`

**Files Involved:**
- Output: `.avc/token-history.json` (created/updated)

**API Calls:** None (local file write)

---

## Complete API Call Summary

### Total API Calls per Ceremony Execution

| Step | Agent | API Calls | Token Range (Input/Output) |
|------|-------|-----------|---------------------------|
| 1. Questionnaire | Domain-Specific Agents (5 types) | 0-5 | 200-400 / 100-1024 per skip |
| 3. Document Enhancement | Documentation Specialist | 1 | 500-2000 / 1000-4000 |
| 4. Hierarchy Generation | Software Architect | 1 | 800-1500 / 2000-5000 |
| 5. Context Generation | Context Generator | 1 + epics + stories | 300-800 / 200-400 per context |
| **Total** | **8 agent types** | **3-36 calls** | **10,000-30,000 total** |

**Step 1 Breakdown by Agent:**
| Question | Agent | Max Output Tokens |
|----------|-------|-------------------|
| Mission Statement | Business Analyst | 1024 |
| Target Users | UX Researcher | 512 (plural) |
| Initial Scope | Product Manager | 512 (plural) |
| Technical Considerations | Technical Architect | 1024 |
| Security Requirements | Security Specialist | 1024 |

### Example: 5 Epics, 23 Stories, 2 Skipped Questions

- AI Suggestions: 2 calls (~600 tokens)
- Document Enhancement: 1 call (~3,000 tokens)
- Hierarchy: 1 call (~4,000 tokens)
- Contexts: 29 calls (~11,600 tokens)
- **Total: 33 API calls, ~19,200 tokens**

---

## AI Agents Used

### Domain-Specific Suggestion Agents (Step 1)

#### 1. **Business Analyst** (`agents/suggestion-business-analyst.md`)
- **Used in:** Step 1 - MISSION_STATEMENT question
- **Role:** Define clear, compelling mission statements
- **Output format:** Plain text (50-100 words)
- **Focus:** Value proposition, target users, core purpose
- **Pattern:** "Enable/Empower/Provide [users] to [action] through [approach]"

#### 2. **UX Researcher** (`agents/suggestion-ux-researcher.md`)
- **Used in:** Step 1 - TARGET_USERS question
- **Role:** Identify and define user personas
- **Output format:** Numbered list (2-4 items)
- **Considerations:** Domain context, role clarity, permission levels
- **Patterns:** B2B (Admin, Power Users, Regular Users), B2C (End Users, Creators)

#### 3. **Product Manager** (`agents/suggestion-product-manager.md`)
- **Used in:** Step 1 - INITIAL_SCOPE question
- **Role:** Define features and prioritize scope
- **Output format:** Numbered list (5-8 items)
- **Categories:** Core (must-have), Secondary (important), Enhancement (nice-to-have)
- **Focus:** User value over technical implementation

#### 4. **Technical Architect** (`agents/suggestion-technical-architect.md`)
- **Used in:** Step 1 - TECHNICAL_CONSIDERATIONS question
- **Role:** Define technology stack, architecture patterns, scalability
- **Output format:** Structured paragraphs (100-200 words)
- **Covers:** Technology stack, architecture approach, scalability/performance, constraints
- **Patterns:** Monolith (MVP/small teams), Microservices (enterprise), Serverless (event-driven)

#### 5. **Security Specialist** (`agents/suggestion-security-specialist.md`)
- **Used in:** Step 1 - SECURITY_AND_COMPLIANCE_REQUIREMENTS question
- **Role:** Identify security, privacy, and compliance requirements
- **Output format:** Structured paragraphs (150-250 words)
- **Covers:** Authentication, data protection, compliance (HIPAA, GDPR, PCI-DSS), monitoring
- **Industry-specific:** Healthcare, Finance, E-Commerce, Enterprise B2B

### Core Ceremony Agents (Steps 3-5)

#### 6. **Documentation Specialist** (`agents/documentation.md`)
- **Used in:** Step 3 (Document Enhancement)
- **Role:** Transform filled template into professional 8-section document
- **Output format:** Markdown
- **Token budget:** 2048 tokens
- **Tone:** Professional, clear, comprehensive

#### 7. **Software Architect** (`agents/decomposition.md`)
- **Used in:** Step 4 (Hierarchy Generation)
- **Role:** Decompose features into Epics and Stories
- **Output format:** JSON with strict schema
- **Constraints:**
  - 3-7 Epics
  - 10-30 Stories total
  - Each Epic: 2-6 Stories
  - ID format: `epic-NNN`, `story-NNN-NNN`

#### 8. **Context Generator** (`agents/context-generator.md`)
- **Used in:** Step 5 (Context Generation)
- **Role:** Generate context.md files for each hierarchy level
- **Output format:** JSON with markdown content
- **Token budget:** 200-400 tokens per context
- **Levels:** Project, Epic, Story
- **Context inheritance:** Story sees Epic + Project context

**Total Agents:** 8 specialized agents across 7 workflow steps

---

## Configuration Files

### `.avc/avc.json`
```json
{
  "version": "0.1.0",
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

### `.avc/token-history.json`
```json
{
  "version": "1.0",
  "lastUpdated": "2026-02-02T18:30:00.000Z",
  "totals": {
    "daily": { "2026-02-02": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "weekly": { "2026-W05": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "monthly": { "2026-02": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "allTime": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 }
  },
  "sponsor-call": {
    "daily": { "2026-02-02": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "weekly": { "2026-W05": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "monthly": { "2026-02": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 } },
    "allTime": { "input": 19200, "output": 8500, "total": 27700, "executions": 1 }
  }
}
```

---

## Error Handling & Retries

### Retry Strategy (`retryWithBackoff` - line 1044-1067)

```javascript
async retryWithBackoff(fn, operation, maxRetries = 3) {
  const delays = [2000, 4000, 8000]; // 2s, 4s, 8s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = delays[attempt - 1];
      console.log(`   ⚠️  Retry ${attempt}/${maxRetries} for ${operation} (waiting ${delay/1000}s)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Applied to:**
- Document enhancement (Step 3)
- Hierarchy generation (Step 4)
- All context generation calls (Step 5) - 29 retry-wrapped calls

**Failure handling:**
- After 3 retries, throws error
- User sees error message
- Can resume from saved progress (questionnaire auto-saves)

---

## Performance Optimization

### Parallel Processing
- ❌ **Not used** - All API calls are sequential
- Reason: Context generation requires previous contexts (inheritance)

### Caching
- ✅ **Progress saving** - Resume questionnaire after interruption
- ✅ **Token tracking** - Persistent history across ceremonies
- ❌ **No API response caching** - Each run makes fresh API calls

### Future Optimizations
- Parallel context generation for same-level items (epics or stories)
- Batch API calls for stories within same epic
- Cache agent instructions in memory (currently re-read each time)

---

## Cost Estimation

Based on Claude Sonnet 4.5 pricing ($3/M input, $15/M output):

**Example ceremony (5 epics, 23 stories, 2 skips):**
- Input tokens: ~10,000 = $0.03
- Output tokens: ~9,000 = $0.14
- **Total cost: ~$0.17 per ceremony execution**

**Breakdown by step:**
1. AI Suggestions: $0.005 (2 calls)
2. Document Enhancement: $0.05 (1 call)
3. Hierarchy Generation: $0.04 (1 call)
4. Context Generation: $0.08 (29 calls)

**Note:** Actual costs saved in token-history.json for tracking via `/tokens` command.
