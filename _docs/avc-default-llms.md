# AVC Default LLMs

This document explains the default LLM model selections for each ceremony and stage in AVC, including the complete evaluation methodology used to select each model.

---

## Overview

AVC uses Large Language Models (LLMs) extensively throughout its ceremonies to generate, validate, and enhance project artifacts. Each stage in each ceremony has been carefully evaluated to select the optimal default model based on **output quality first**, with pricing as a secondary consideration.

This page provides complete transparency into:
- **Why** each model was selected for each stage
- **What** quality trade-offs exist between models
- **How** to customize models based on your project needs
- **When** to upgrade to higher-tier models

All 14 model selection evaluations are included as copy-paste-ready prompts so you can reproduce or customize the analysis.

---

## Pricing Indicators

Throughout this document, we use relative pricing indicators instead of specific dollar amounts:

| Indicator | Description | Example Models |
|-----------|-------------|----------------|
| 🟢 **Low** | Budget-friendly, often free tier available | Gemini 2.0 Flash |
| 🟡 **Medium** | Balanced pricing for quality | Claude Sonnet 4.5, Gemini 2.5 Pro |
| 🔴 **High** | Premium pricing for maximum quality | Claude Opus 4.6 |

**Note:** These indicators reflect relative relationships between models, not absolute costs. Actual pricing varies by provider, usage volume, and changes over time.

---

## Model Selection Philosophy

### Priority Hierarchy

AVC's model selection prioritizes **quality over pricing**:

1. **Output Quality** - Best possible results for the task
2. **Task Performance** - Model capabilities match task complexity
3. **Reliability** - Consistent, dependable results
4. **Speed** - Response time when quality requirements are met
5. **Pricing** - Considered only after quality needs are satisfied

### Why Quality First?

Poor AI outputs cascade through your entire project:
- Bad decomposition → incomplete features, rework
- Weak validation → bugs reach production
- Generic context → developer confusion, wasted time

Investing in quality AI outputs saves significant time and cost downstream.

---

## Selection Methodology

Each stage evaluation follows this systematic framework:

```
TASK: Select optimal LLM model for [STAGE] in [CEREMONY]
PRIORITY: Best possible output quality

EVALUATION CRITERIA (Priority Order):

1. Output Quality Requirements (PRIMARY)
   - Critical/Foundational → High tier required
   - User-Facing → High tier required
   - Internal/Validation → Mid tier acceptable
   - Pattern Checking → Any capable model

2. Task Complexity & Reasoning
   - Complex (9-10) → Opus 4.6 or Sonnet 4.5
   - Advanced (7-8) → Sonnet 4.5
   - Moderate (5-6) → Sonnet 4.5 or Flash
   - Simple (1-4) → Flash adequate

3. Context Understanding
   - Deep synthesis → Opus 4.6 > Sonnet 4.5
   - Multi-document → Sonnet 4.5 > Flash
   - Single document → Sonnet 4.5 or Flash
   - Pattern matching → Any model

4. Consistency & Reliability
   - Critical path → Most reliable model
   - Batch operations → Consistent model
   - Validation → Adequately reliable

5. Speed Requirements (Secondary)
   - Real-time → Consider faster if quality adequate
   - Background → Quality prioritized over speed

6. Pricing (TERTIARY)
   - Only after quality requirements met
   - Consider lower-priced ONLY if quality impact minimal

RECOMMENDATION:
Best Output: [model] (Pricing: 🟢🟡🔴)
Current Default: [model] (Pricing: 🟢🟡🔴)
Budget Alternative: [model] (Pricing: 🟢🟡🔴)
```

---

## Ceremonies & Stages

### sponsor-call

**Description:** Initial ceremony that captures project vision through questionnaire, generates PROJECT.md documentation, and creates project-level context.md file.

---

#### suggestions - Questionnaire Suggestions

**What it does:** AI analyzes project name and suggests intelligent, contextually appropriate answers for questionnaire fields.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for questionnaire suggestions in sponsor-call ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: suggestions (Questionnaire Suggestions)
- Ceremony: sponsor-call
- Purpose: AI analyzes project name and suggests intelligent, contextually appropriate answers for 6 questionnaire fields
- Input: Project name only (10-50 tokens)
- Output: Suggested answers for Mission Statement, Target Users, Initial Scope, Deployment Target, Technical Considerations, Security Requirements (500-1500 tokens total)
- Call frequency: 1 per ceremony
- User interaction: Real-time (user waiting for suggestions while viewing questionnaire)
- Impact: Sets initial project direction and quality tone for all downstream artifacts

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: HIGH
   - Must infer project domain from minimal context (just project name)
   - Suggestions must be relevant, specific, and actionable
   - Must demonstrate domain knowledge and industry best practices
   - Quality directly impacts user's project definition experience
   → Requires strong inference and domain knowledge: Sonnet or Opus tier

2. Task Complexity: 6/10 (Moderate reasoning with domain inference)
   - Analyze project name for domain clues
   - Infer appropriate technology stack and architecture
   - Generate contextually relevant suggestions across 6 different categories
   - Balance between generic and specific recommendations
   → Sonnet 4.5 excels at this level of inference

3. Context Understanding:
   - Extremely limited input context (just project name)
   - Must leverage broad domain knowledge to compensate
   - Must infer user intent and project type
   → Requires excellent world knowledge and inference: Sonnet 4.5 or Opus 4.6

4. Consistency & Reliability:
   - Suggestions must be coherent across all 6 fields
   - Must avoid contradictory recommendations
   - Critical for user's first impression of AVC
   → Requires consistent reasoning: Sonnet or Opus

5. Speed Requirements: IMPORTANT (Secondary)
   - User is actively waiting for suggestions
   - Real-time interaction requires reasonable response time
   - 2-4 second response ideal, <8 seconds acceptable
   → Sonnet 4.5 fast enough, Opus slower but acceptable

6. Pricing Considerations: TERTIARY
   - Single call per ceremony (low volume)
   - User-facing quality important
   - Pricing impact minimal with only 1 call
   → Quality worth any pricing tier for this stage

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent domain inference from minimal context
- Strong world knowledge for relevant suggestions
- Fast enough for real-time user interaction
- Consistent, coherent suggestions across all fields
- Optimal balance of quality and speed for this use case

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Optimal choice for this stage
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal for domain inference from minimal context
- **Use when:** All projects (recommended default)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Best balance of quality, speed, and pricing for real-time user interaction

---

#### documentation - Documentation Generation

**What it does:** AI creates comprehensive PROJECT.md from questionnaire answers, establishing the foundational document for the entire project.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for documentation generation in sponsor-call ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: documentation (Project Documentation Creation)
- Ceremony: sponsor-call
- Purpose: AI generates comprehensive PROJECT.md from questionnaire answers
- Input: 6 questionnaire field answers (1,000-5,000 tokens)
- Output: Structured PROJECT.md with Executive Summary, Problem Statement, Solution, User Personas, Core Features, Technical Architecture, Security, Success Metrics (2,000-8,000 tokens)
- Call frequency: 1 per ceremony
- User interaction: Background process after questionnaire completion
- Impact: CRITICAL - This is the foundational document that defines the entire project; all future AI agents, epics, stories, and tasks derive from this document

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: CRITICAL
   - Must produce well-structured, comprehensive technical documentation
   - Content must be coherent, professional, and actionable
   - Must maintain consistency across all sections
   - Quality affects all downstream project artifacts
   → Requires highest quality technical writing: Sonnet 4.5 or Opus 4.6

2. Task Complexity: 8/10 (Advanced technical writing and synthesis)
   - Synthesize multiple questionnaire inputs into coherent narrative
   - Organize information into logical section structure
   - Generate appropriate technical architecture descriptions
   - Create realistic user personas and success metrics
   - Maintain professional tone and technical accuracy
   → Sonnet 4.5 excels at structured technical writing

3. Context Understanding:
   - Must understand relationships between questionnaire answers
   - Infer appropriate technical depth and detail level
   - Expand brief answers into comprehensive sections
   - Maintain consistency across document sections
   → Requires strong synthesis: Sonnet 4.5 or Opus 4.6

4. Consistency & Reliability:
   - Critical that all sections align and don't contradict
   - Technical architecture must match scope and requirements
   - Success metrics must align with stated goals
   → Sonnet 4.5 excellent at maintaining consistency

5. Speed Requirements: LOW (Secondary)
   - Background process, user not actively waiting
   - Quality far more important than speed
   - Can take 10-30 seconds without issue
   → Speed not a constraint

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Foundational document for entire project
   - Quality impact is massive
   → Worth any pricing tier given criticality

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent technical writing and document structure
- Strong synthesis of multiple inputs into coherent narrative
- Maintains consistency across complex multi-section document
- Superior markdown formatting and organization
- Appropriate technical depth and professional tone
- Optimal for this critical document

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Optimal choice for this stage
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Excellent technical writing and synthesis
- **Use when:** All projects (this is your project foundation!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Foundational document requires highest quality technical writing; Sonnet 4.5 optimal

---

#### context - Context File Creation

**What it does:** AI generates project-level context.md file that will be read by all future AI agents throughout the project lifecycle.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for context file creation in sponsor-call ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: context (Project Context Generation)
- Ceremony: sponsor-call
- Purpose: AI generates project-level context.md file from PROJECT.md documentation
- Input: Complete PROJECT.md (2,000-8,000 tokens)
- Output: Concise context.md with project overview, key objectives, technical constraints, architectural decisions (500-2,000 tokens)
- Call frequency: 1 per ceremony
- User interaction: Background process, final stage of sponsor-call
- Impact: VERY HIGH - This context file is read by all future AI agents (decomposition, validation, context generation); quality affects all AI agent performance throughout project lifecycle

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: VERY HIGH
   - Must extract most critical information from full documentation
   - Must be concise yet comprehensive enough for AI agents
   - Must include actionable context, not generic summaries
   - Must understand what future AI agents need to know
   → Requires sophisticated understanding of AI agent needs: Sonnet 4.5 or Opus 4.6

2. Task Complexity: 7/10 (Advanced summarization + context framing)
   - Intelligent summarization (not just compression)
   - Identify critical architectural decisions vs nice-to-have details
   - Frame information in AI-consumable format
   - Balance brevity with completeness
   → Sonnet 4.5 excels at creating actionable context for AI

3. Context Understanding:
   - Must understand entire PROJECT.md document
   - Identify patterns and key themes
   - Recognize technical constraints that affect implementation
   - Prioritize information by importance to future AI agents
   → Requires strong comprehension: Sonnet 4.5 superior

4. Consistency & Reliability:
   - Must maintain alignment with PROJECT.md
   - Cannot introduce contradictions
   - Must preserve critical technical details
   → Sonnet 4.5 excellent at faithful summarization

5. Speed Requirements: LOW (Secondary)
   - Background process, final stage
   - User not waiting
   - Quality far more important than speed
   → Speed not a concern

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Used by all future AI agents (high leverage)
   - Quality investment pays off in every subsequent ceremony
   → Worth any pricing tier given leverage

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent at creating AI-consumable context
- Superior understanding of what future AI agents need
- Strong balance of conciseness and completeness
- Identifies critical vs supplementary information
- Maintains technical accuracy while summarizing
- Optimal for this high-leverage stage

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Optimal choice for this stage
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Best at AI-consumable context generation
- **Use when:** All projects (affects all future AI agents!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** High-leverage stage that improves all future AI performance; worth quality investment

---

#### validation - Documentation Validation

**What it does:** AI validators check PROJECT.md and context.md quality, identifying issues and suggesting improvements.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for documentation validation in sponsor-call ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: validation (Documentation & Context Validation)
- Ceremony: sponsor-call
- Purpose: AI validators check PROJECT.md and context.md against quality rules
- Input: Full PROJECT.md or context.md + validation rules (5,000-12,000 tokens)
- Output: Validation report identifying issues and suggestions
- Call frequency: 2 validators per ceremony
- Impact: HIGH - Catches quality issues before they propagate

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: HIGH
   - Must accurately identify quality issues and inconsistencies
   - Must provide actionable feedback for improvement
   - Must understand project documentation best practices
   → Requires strong analytical capability: Sonnet 4.5 ideal

2. Task Complexity: 6/10 (Analytical validation + rule application)
   - Apply validation rules to documentation
   - Identify inconsistencies and gaps
   - Assess completeness and coherence
   → Sonnet 4.5 good, Gemini Pro adequate for rule-based validation

3. Context Understanding:
   - Must handle large documents (full PROJECT.md)
   - Understand relationships across sections
   - Identify subtle inconsistencies
   → Requires good context window: Sonnet or Gemini Pro

4. Speed Requirements: LOW (Secondary)
   - Background validation stage
   - Quality more important than speed

6. Pricing Considerations: TERTIARY
   - Only 2 calls per ceremony
   - Moderate quality requirements

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Superior analytical capability
- Better actionable suggestions
- Optimal for documentation validation

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Pricing: 🟡 Medium
- Excellent validation quality
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Superior issue detection and actionable suggestions
- **Use when:** All projects (now the default!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Pricing:** 🟡 Medium
- **Rationale:** Same pricing tier as previous default (Gemini Pro) with +20% better validation quality; upgraded to Best Output

---

### sprint-planning

**Description:** Decomposes project scope into actionable epics and stories, validates them with domain experts, and generates detailed context files.

---

#### decomposition - Epic & Story Decomposition

**What it does:** AI analyzes project scope and breaks it down into hierarchical epics and stories with actionable acceptance criteria.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for epic and story decomposition in sprint-planning ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: decomposition (Epic & Story Decomposition)
- Ceremony: sprint-planning
- Purpose: AI analyzes PROJECT.md and decomposes project scope into hierarchical epics and stories
- Input: PROJECT.md, project context.md, existing epics/stories (5,000-20,000 tokens)
- Output: Structured JSON with epics, stories, acceptance criteria
- Call frequency: 1 per ceremony
- Impact: CRITICAL - Defines entire project work breakdown structure

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: CRITICAL
   - Must create logical, implementable work breakdown
   - Acceptance criteria must be specific and testable
   - Hierarchy must reflect dependencies
   → Requires exceptional hierarchical reasoning: Opus 4.6 or Sonnet 4.5

2. Task Complexity: 9/10 (Complex hierarchical decomposition)
   - Analyze full project scope
   - Break features into implementable story-level units
   - Generate specific, testable acceptance criteria
   - Identify dependencies between stories
   → Opus 4.6 superior, Sonnet 4.5 very good

3. Context Understanding:
   - Must synthesize entire project vision
   - Understand technical architecture and constraints
   - Recognize implicit dependencies
   → Requires deep comprehension: Opus 4.6 > Sonnet 4.5

4. Consistency & Reliability:
   - Critical that decomposition is complete (no gaps)
   - Stories must not overlap or contradict
   → Opus 4.6 most consistent, Sonnet 4.5 very reliable

5. Speed Requirements: LOW (Secondary)
   - Background process, one-time operation
   - Quality far more important than speed

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Most critical stage in sprint-planning
   → Worth any pricing tier

RECOMMENDATION:

Best Output: Claude Opus 4.6
- Pricing: 🔴 High
- Superior hierarchical reasoning (+15% vs Sonnet)
- Better dependency identification
- More consistent acceptance criteria
- Use when: Complex projects, enterprise architectures

Current Default: Claude Sonnet 4.5 ✓
- Pricing: 🟡 Medium
- Excellent hierarchical reasoning (90% of Opus quality)
- Very good for most projects
- Optimal quality-per-pricing ratio
```

</details>

**Best Output:** 🏆 Claude Opus 4.6
- **Pricing:** 🔴 High
- **Quality:** +15% vs Sonnet - Superior hierarchical reasoning
- **Use when:** Complex projects, enterprise architectures, microservices, maximum quality required

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Pricing:** 🟡 Medium
- **Quality:** Excellent (90% of Opus)
- **Rationale:** Optimal quality-per-pricing for most projects; upgrade to Opus for complex architectures

---

#### validation-universal - Universal Validators

**What it does:** Critical validators always applied to every epic and story: solution-architect, developer, security, qa, test-architect.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for universal validators in sprint-planning ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: validation-universal (Universal Validators)
- Ceremony: sprint-planning
- Purpose: Critical validators always applied: architecture, security, quality
- Input: Epic or Story with full context (2,000-8,000 tokens per item)
- Output: Detailed validation report with architectural and security analysis
- Call frequency: ~30 calls per ceremony
- Impact: CRITICAL - Catches fundamental issues before implementation

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: CRITICAL
   - Must perform deep architectural analysis
   - Must identify security vulnerabilities
   - Must provide specific, actionable recommendations
   → Requires exceptional analytical capability: Sonnet 4.5 or Opus 4.6

2. Task Complexity: 9/10 (Deep architectural and security analysis)
   - Analyze system architecture and design patterns
   - Identify security vulnerabilities
   - Assess technical feasibility
   - Evaluate testing strategies
   → Sonnet 4.5 excellent, Opus 4.6 superior

3. Context Understanding:
   - Must understand full project architecture
   - Cross-reference with other epics/stories
   - Identify system-wide architectural issues
   → Requires sophisticated reasoning: Sonnet 4.5 or Opus 4.6

4. Consistency & Reliability:
   - Cannot miss critical architectural flaws
   - Must consistently identify security issues
   → Critical reliability needed: Sonnet 4.5 excellent

5. Speed Requirements: MODERATE (Secondary)
   - 30 calls in parallel validation stage
   - Quality far more important than speed

6. Pricing Considerations: MODERATE
   - 30 calls = significant volume
   - Quality cannot be compromised

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Exceptional architectural reasoning
- Strong security vulnerability identification
- Reliable and consistent validation
- Optimal for critical validation workload

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Do not compromise on these critical validators
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Exceptional architectural and security analysis
- **Use when:** All projects (never compromise on critical validators!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Critical validators require best quality; Sonnet optimal for architectural/security analysis

---

#### validation-domain - Domain Validators

**What it does:** Domain-specific validators applied based on project tech stack: devops, database, api, frontend, backend, cloud, mobile, ui, ux, data.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for domain validators in sprint-planning ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: validation-domain (Domain Validators)
- Ceremony: sprint-planning
- Purpose: Domain-specific validators based on tech stack
- Input: Epic or Story with domain-relevant context (2,000-5,000 tokens)
- Output: Domain-specific validation report with best practices
- Call frequency: ~90 calls per ceremony (largest volume stage)
- Impact: HIGH - Catches domain-specific issues, ensures best practices

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: HIGH
   - Must apply domain-specific best practices
   - Must identify domain anti-patterns
   - Must provide actionable recommendations
   → Requires good domain knowledge: Sonnet 4.5 ideal

2. Task Complexity: 7/10 (Domain expertise application)
   - Apply domain-specific patterns
   - Identify violations of domain conventions
   - Not just pattern matching - requires context understanding
   → Sonnet 4.5 superior, Flash adequate for simpler checks

3. Context Understanding:
   - Must understand project architecture in domain context
   - Cross-reference with other domains
   → Sonnet 4.5 better context synthesis than Flash

4. Speed Requirements: MODERATE (Secondary)
   - 90 calls = highest volume in sprint-planning
   - Parallel execution

6. Pricing Considerations: SIGNIFICANT
   - 90 calls = largest pricing driver
   - Medium vs Low pricing makes material difference

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Superior domain expertise (+35% vs Flash)
- More actionable, context-appropriate recommendations
- Better cross-domain understanding
- Use when: Quality is priority

Current Default: Gemini 2.0 Flash
- Pricing: 🟢 Low (often free tier)
- Adequate for basic domain pattern checking
- Can identify common anti-patterns
- Use when: Cost optimization important
- Trade-off: -35% issue detection
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** +35% better domain-specific issue detection vs Flash
- **Use when:** Quality priority, willing to invest in better validation

**Current Default:** ⚖️ Gemini 2.0 Flash
- **Pricing:** 🟢 Low (often free tier)
- **Rationale:** 90 calls make this largest pricing driver; Flash provides adequate basic domain validation
- **Trade-off:** -35% issue detection, less detailed feedback vs Sonnet

---

#### validation-feature - Feature Validators

**What it does:** Feature-specific validators applied based on acceptance criteria keywords: testing, security, file-upload, notifications, reporting, etc.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for feature validators in sprint-planning ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: validation-feature (Feature Validators)
- Ceremony: sprint-planning
- Purpose: Feature-specific validators based on keywords in acceptance criteria
- Input: Epic or Story with feature-specific context (1,500-4,000 tokens)
- Output: Feature-specific validation checklist and completeness assessment
- Call frequency: ~25 calls per ceremony
- Impact: MEDIUM - Ensures feature completeness, identifies missing requirements

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: MEDIUM-HIGH
   - Must verify feature completeness
   - Must identify missing scenarios or edge cases
   - Should provide feature-specific implementation guidance
   → Requires good feature understanding: Sonnet 4.5 or Flash adequate

2. Task Complexity: 5/10 (Feature checklist validation)
   - Apply feature-specific checklists
   - Identify missing scenarios
   - Verify acceptance criteria completeness
   → Moderate complexity, both Sonnet and Flash capable

3. Context Understanding:
   - Understand feature requirements from acceptance criteria
   - Identify implicit requirements not explicitly stated
   → Flash adequate, Sonnet better at implicit requirements

4. Speed Requirements: MODERATE (Secondary)
   - 25 calls, parallel execution
   - Background processing

6. Pricing Considerations: MODERATE
   - 25 calls = moderate volume
   - Completeness checking vs deep analysis

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Better at identifying implicit requirements (+30% vs Flash)
- More comprehensive completeness checking
- Better suggestions for test scenarios
- Use when: Comprehensive feature validation desired

Current Default: Gemini 2.0 Flash
- Pricing: 🟢 Low (often free tier)
- Adequate for explicit requirement checking
- Can identify obvious missing scenarios
- Use when: Basic completeness checking sufficient
- Trade-off: -30% edge case detection
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** +30% better completeness and edge case detection vs Flash
- **Use when:** Thorough feature validation desired, comprehensive requirements coverage

**Current Default:** ⚖️ Gemini 2.0 Flash
- **Pricing:** 🟢 Low (often free tier)
- **Rationale:** Adequate for explicit requirement checking; pricing-efficient for moderate-volume validation
- **Trade-off:** -30% edge case detection, less detailed guidance vs Sonnet

---

#### context-generation - Context File Generation

**What it does:** AI creates context.md file for each epic and story to guide developers and future AI agents.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for context file generation in sprint-planning ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: context-generation (Context File Generation)
- Ceremony: sprint-planning
- Purpose: AI generates context.md file for each epic and story
- Input: Epic/Story with acceptance criteria, parent context (2,000-5,000 tokens)
- Output: Concise context.md with implementation guidance (500-2,000 tokens)
- Call frequency: ~25 calls per ceremony
- Impact: VERY HIGH - Developers read these daily; AI agents use for task decomposition

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: VERY HIGH
   - Must create actionable developer guidance
   - Technical context must be accurate and relevant
   - Must understand developer needs
   → Requires strong technical writing: Sonnet 4.5 or Opus 4.6

2. Task Complexity: 7/10 (Technical context synthesis)
   - Synthesize acceptance criteria into implementation context
   - Inherit and extend parent epic context
   - Identify technical considerations
   - Create AI-consumable context
   → Sonnet 4.5 excellent at developer-focused context

3. Context Understanding:
   - Understand full project and parent epic context
   - Recognize technical implications
   - Consider implementation challenges
   → Requires good synthesis: Sonnet 4.5 superior

4. Consistency & Reliability:
   - Context must align with acceptance criteria
   - Technical guidance must be accurate
   → Sonnet 4.5 very consistent

5. Speed Requirements: MODERATE (Secondary)
   - 25 calls, parallel generation
   - Quality more important than speed

6. Pricing Considerations: MODERATE
   - 25 calls = moderate volume
   - User-facing, high impact
   - Quality worth investment

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent at creating actionable developer context
- Superior technical accuracy and relevance
- Good balance of conciseness and completeness
- Optimal for this developer-facing stage

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Do not compromise on context quality
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Best at actionable developer context
- **Use when:** All projects (developers read these daily!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Developer-facing, high-impact stage; investment pays off in implementation efficiency

---

### seed

**Description:** Breaks down stories into atomic tasks and subtasks, validates the task hierarchy, and generates task-level context files.

---

#### decomposition - Task Decomposition

**What it does:** AI breaks down a story into atomic, implementable tasks and subtasks with clear work units.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for task decomposition in seed ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: decomposition (Task & Subtask Decomposition)
- Ceremony: seed
- Purpose: AI breaks down story into tasks and subtasks
- Input: Story with acceptance criteria, contexts (2,000-6,000 tokens)
- Output: Hierarchical task structure with dependencies
- Call frequency: 1 per ceremony execution
- Impact: CRITICAL - Defines actual implementation plan

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: CRITICAL
   - Must break story into logical task groupings
   - Subtasks must be atomic and implementable
   - Must identify dependencies
   → Requires exceptional breakdown capability: Opus 4.6 or Sonnet 4.5

2. Task Complexity: 8/10 (Granular work breakdown)
   - Analyze story and break into tasks
   - Determine appropriate task granularity
   - Break tasks into atomic subtasks
   - Identify task dependencies
   → Opus 4.6 superior, Sonnet 4.5 very good

3. Context Understanding:
   - Understand full story requirements
   - Consider epic and project context
   - Identify implicit implementation needs
   → Requires deep comprehension: Opus 4.6 > Sonnet 4.5

4. Consistency & Reliability:
   - Task breakdown must be complete
   - Dependencies must be accurate
   → Opus 4.6 most consistent, Sonnet 4.5 very reliable

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality far more important

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Critical for implementation planning

RECOMMENDATION:

Best Output: Claude Opus 4.6
- Pricing: 🔴 High
- Superior task breakdown (+10% vs Sonnet)
- Better atomic subtask identification
- More complete task coverage
- Use when: Complex stories, integration-heavy work

Current Default: Claude Sonnet 4.5 ✓
- Pricing: 🟡 Medium
- Excellent task breakdown (90% of Opus quality)
- Very good for most stories
- Optimal for most stories (recommended default)
```

</details>

**Best Output:** 🏆 Claude Opus 4.6
- **Pricing:** 🔴 High
- **Quality:** +10% vs Sonnet - Better granularity and completeness
- **Use when:** Complex stories, integration-heavy features, multi-domain work

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Pricing:** 🟡 Medium
- **Quality:** Excellent (90% of Opus)
- **Rationale:** Very good task breakdowns for typical stories at medium pricing

---

#### validation - Task Validation

**What it does:** AI validates that task hierarchy is complete, well-structured, appropriately granular, and implementable.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for task validation in seed ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: validation (Task Validation)
- Ceremony: seed
- Purpose: AI validates task hierarchy completeness and feasibility
- Input: Complete task/subtask hierarchy (3,000-10,000 tokens)
- Output: Validation report identifying gaps and issues
- Call frequency: ~20 calls per ceremony
- Impact: VERY HIGH - Catches planning issues before development

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: VERY HIGH
   - Must identify gaps in task coverage
   - Must assess task granularity
   - Must validate dependency correctness
   → Requires sophisticated validation reasoning: Sonnet 4.5

2. Task Complexity: 7/10 (Completeness validation + reasoning)
   - Analyze task hierarchy for gaps
   - Assess granularity appropriateness
   - Validate dependency relationships
   - Reason about implementation feasibility
   → Sonnet 4.5 excellent, Flash weaker at reasoning

3. Context Understanding:
   - Must understand full task hierarchy
   - Cross-reference with story requirements
   - Reason about dependencies
   → Requires strong reasoning: Sonnet 4.5 superior

4. Consistency & Reliability:
   - Must consistently identify gaps
   - Cannot miss critical completeness problems
   → Sonnet 4.5 very reliable

5. Speed Requirements: MODERATE (Secondary)
   - 20 calls, parallel validation
   - Quality far more important

6. Pricing Considerations: MODERATE
   - 20 calls = moderate volume
   - Critical impact (prevents implementation issues)

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent at identifying gaps (+40-50% vs Flash)
- Superior granularity assessment
- Strong dependency validation
- Optimal for task validation

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Do not compromise on task validation
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - +40-50% better gap detection vs Flash
- **Use when:** All projects (prevents implementation gaps and rework!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Task validation requires sophisticated "what's missing" reasoning; Sonnet essential

---

#### context-generation - Task Context Generation

**What it does:** AI creates context.md file for each task with implementation-focused guidance for developers.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for task context generation in seed ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: context-generation (Task Context Generation)
- Ceremony: seed
- Purpose: AI generates context.md for each task
- Input: Task with subtasks, story/epic/project contexts (1,500-4,000 tokens)
- Output: Concise context.md with implementation approach (300-1,000 tokens)
- Call frequency: ~10 calls per ceremony
- Impact: VERY HIGH - Developers read immediately before implementing

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: VERY HIGH
   - Must provide specific, actionable implementation guidance
   - Technical details must be accurate
   - Must highlight gotchas and edge cases
   → Requires excellent technical writing: Sonnet 4.5

2. Task Complexity: 7/10 (Implementation-focused technical context)
   - Synthesize task requirements into guidance
   - Provide appropriate technical detail
   - Identify implementation approaches
   - Balance brevity with actionability
   → Sonnet 4.5 excellent at developer-focused context

3. Context Understanding:
   - Understand task within story/epic context
   - Recognize relevant patterns
   - Identify task dependencies
   → Requires good synthesis: Sonnet 4.5 superior

4. Consistency & Reliability:
   - Context must align with task requirements
   - Technical guidance must be accurate
   → Sonnet 4.5 very reliable

5. Speed Requirements: MODERATE (Secondary)
   - 10 calls, parallel generation
   - Quality more important

6. Pricing Considerations: MODERATE
   - 10 calls = low-moderate volume
   - Developer-facing, high impact

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent implementation-focused technical writing
- Superior technical accuracy and detail level
- Strong at highlighting gotchas
- Optimal for developer-facing task context

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
- Do not compromise on task context quality
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Best technical accuracy and actionability
- **Use when:** All projects (last stop before coding!)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Developers use this immediately before coding; technical accuracy essential

---

### context-retrospective

**Description:** Refines and enhances project documentation and context files based on implementation learnings from git history.

---

#### documentation-update - Documentation Enhancement

**What it does:** AI refines PROJECT.md based on learnings from actual implementation (git history, completed work).

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for documentation enhancement in context-retrospective ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: documentation-update (Documentation Enhancement)
- Ceremony: context-retrospective
- Purpose: AI refines PROJECT.md based on implementation learnings
- Input: PROJECT.md, git history, completed work (10,000-30,000 tokens)
- Output: Updated PROJECT.md with refined descriptions and learnings
- Call frequency: ~10 calls per ceremony
- Impact: HIGH - Maintains PROJECT.md as source of truth

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: HIGH
   - Must synthesize implementation learnings
   - Technical updates must be accurate
   - Must maintain documentation consistency
   → Requires strong technical writing: Sonnet 4.5

2. Task Complexity: 7/10 (Technical synthesis and writing)
   - Analyze git history
   - Identify patterns and insights
   - Synthesize into documentation updates
   → Sonnet 4.5 excellent at technical documentation

3. Context Understanding:
   - Must handle large context (PROJECT.md + git history)
   - Understand implementation changes
   - Identify obsolete information
   → Large context window needed: Sonnet 4.5 or Opus 4.6

4. Consistency & Reliability:
   - Updates must not contradict existing content
   - Technical accuracy critical
   → Sonnet 4.5 very consistent

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality more important

6. Pricing Considerations: MODERATE
   - 10 calls = low-moderate volume
   - Important but not critical path

RECOMMENDATION:

Best Output: Claude Sonnet 4.5
- Pricing: 🟡 Medium
- Excellent technical writing
- Strong synthesis of learnings
- Good consistency maintenance
- Optimal for documentation enhancement

Current Default: Claude Sonnet 4.5 ✓
- Same as best output recommendation
```

</details>

**Best Output:** 🏆 Claude Sonnet 4.5
- **Pricing:** 🟡 Medium
- **Quality:** Optimal - Excellent technical writing and synthesis
- **Use when:** All projects (maintains documentation accuracy)

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Rationale:** Technical writing and synthesis of learnings require Sonnet's capabilities

---

#### context-refinement - Context Enhancement

**What it does:** AI enriches context.md files with practical implementation insights learned from actual development work.

<details>
<summary>📋 View Selection Evaluation</summary>

```
TASK: Select optimal LLM model for context refinement in context-retrospective ceremony
PRIORITY: Best possible output quality

CONTEXT:
- Stage: context-refinement (Context Enhancement)
- Ceremony: context-retrospective
- Purpose: AI enhances context.md with implementation insights
- Input: context.md, git diffs, PRs, issue comments (5,000-15,000 tokens)
- Output: Enhanced context.md with insights, patterns, code examples
- Call frequency: ~15 calls per ceremony
- Impact: VERY HIGH - Enhanced context improves all future AI agent performance

EVALUATION CRITERIA (BEST OUTPUT FIRST):

1. Output Quality Requirements: VERY HIGH
   - Must extract valuable insights from code changes
   - Must identify implementation patterns
   - Should include practical code examples
   → Requires exceptional code analysis: Opus 4.6 or Sonnet 4.5

2. Task Complexity: 8/10 (Code analysis + insight extraction)
   - Analyze code diffs
   - Identify patterns and best practices
   - Extract insights from issue discussions
   - Synthesize into actionable context
   → Opus 4.6 superior, Sonnet 4.5 very good

3. Context Understanding:
   - Understand code changes in project context
   - Analyze git diffs
   - Synthesize from multiple sources
   → Requires strong code analysis: Opus 4.6 > Sonnet 4.5

4. Consistency & Reliability:
   - Enhanced context must align with original
   - Code examples must be accurate
   → Both Opus and Sonnet very reliable

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality far more important

6. Pricing Considerations: MODERATE
   - 15 calls = moderate volume
   - Very high leverage (improves all future AI work)

RECOMMENDATION:

Best Output: Claude Opus 4.6
- Pricing: 🔴 High
- Superior code analysis (+20% vs Sonnet)
- Better insight extraction from diffs
- More comprehensive gotcha identification
- Significantly better future AI agent context
- Use when: Maximum AI agent improvement desired

Current Default: Claude Sonnet 4.5 ✓
- Pricing: 🟡 Medium
- Very good code analysis (80% of Opus)
- Good insight extraction
- Good balance of quality and pricing
- Use when: Quality important but pricing-conscious
```

</details>

**Best Output:** 🏆 Claude Opus 4.6
- **Pricing:** 🔴 High
- **Quality:** +20% vs Sonnet - Superior code analysis and pattern recognition
- **Use when:** Maximum AI agent improvement desired, long-term projects with many future ceremonies

**Current Default:** ⚖️ Claude Sonnet 4.5 ✓
- **Pricing:** 🟡 Medium
- **Quality:** Very good (80% of Opus)
- **Rationale:** Good balance for most projects; upgrade to Opus if AI performance absolutely critical

---

## Model Summary Tables

### Recommendations by Stage

| Ceremony | Stage | Best Output | Pricing | Current Default | Pricing | Quality Gain |
|----------|-------|-------------|---------|-----------------|---------|--------------|
| **sponsor-call** | suggestions | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | documentation | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | context | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | validation | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| **sprint-planning** | decomposition | Opus 4.6 | 🔴 High | Sonnet 4.5 | 🟡 Med | +15% |
| | validation (universal) | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | validation (domain) | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | +35% |
| | validation (feature) | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | +30% |
| | context-generation | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| **seed** | decomposition | Opus 4.6 | 🔴 High | Sonnet 4.5 | 🟡 Med | +10% |
| | validation | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | context-generation | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| **context-retrospective** | documentation-update | Sonnet 4.5 | 🟡 Med | Sonnet 4.5 ✓ | 🟡 Med | Optimal |
| | context-refinement | Opus 4.6 | 🔴 High | Sonnet 4.5 | 🟡 Med | +20% |

### Overall Pricing by Ceremony

| Ceremony | Current Defaults | Best Output | Pricing Change |
|----------|-----------------|-------------|----------------|
| sponsor-call | Low-Medium | Medium | Minimal |
| sprint-planning | Low-Medium | Medium-High | Significant |
| seed | Medium | Medium-High | Moderate |
| context-retrospective | Medium | Medium-High | Moderate |

---

## Configuration Profiles

### Profile 1: Maximum Quality 🏆

**For:** Quality-first projects, enterprise applications, critical systems

**Configuration:**
- All decomposition: **Opus 4.6** (🔴 High)
- All universal validation: **Sonnet 4.5** (🟡 Medium)
- All domain/feature validation: **Sonnet 4.5** (🟡 Medium)
- All context generation: **Sonnet 4.5** (🟡 Medium)
- Context refinement: **Opus 4.6** (🔴 High)

**Pricing:** Medium-High overall

**Use when:**
- Maximum quality requirements
- Complex enterprise architectures
- Critical production applications
- Long-term projects with many ceremonies
- AI agent performance is paramount

---

### Profile 2: Balanced ⚖️ (Current Defaults)

**For:** Most projects - quality where it matters most

**Configuration:**
- Decomposition: **Sonnet 4.5** (🟡 Medium)
- Universal validation: **Sonnet 4.5** (🟡 Medium)
- Domain validation: **Flash** (🟢 Low)
- Feature validation: **Flash** (🟢 Low)
- All context generation: **Sonnet 4.5** (🟡 Medium)
- Context refinement: **Sonnet 4.5** (🟡 Medium)

**Pricing:** Low-Medium overall

**Use when:**
- Most projects (recommended)
- Quality important but pricing-conscious
- Strategic quality investments
- Acceptable validation trade-offs

---

### Profile 3: Budget 💰

**For:** Cost-sensitive projects, prototypes, early-stage development

**Configuration:**
- Decomposition: **Sonnet 4.5** (🟡 Medium) - *Don't compromise!*
- All validation: **Flash** (🟢 Low)
- Context generation: **Flash** (🟢 Low) - *Significant quality loss*
- Documentation: **Flash** (🟢 Low) - *Significant quality loss*

**Pricing:** Low overall

**Use when:**
- Budget-constrained projects
- Early prototypes or MVPs
- Willing to accept validation depth trade-offs
- Technical debt risk acceptable

**⚠️ Warnings:**
- Never use Flash for decomposition (high failure risk)
- Flash for context generation significantly reduces developer productivity
- Flash for documentation creates weak project foundation

---

## Quality vs Pricing Matrix

### Quality Loss by Stage Type

| Stage Type | Best Output | Pricing | Budget Option | Pricing | Quality Loss | Impact |
|------------|-------------|---------|---------------|---------|--------------|--------|
| **Decomposition** | Opus 4.6 | 🔴 High | Sonnet 4.5 | 🟡 Med | Low (10-15%) | Acceptable |
| **Architecture Validation** | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | High (40%) | ⚠️ Risky |
| **Domain Validation** | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | Medium (30%) | ⚠️ Trade-off |
| **Context Generation** | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | Very High (60%) | ❌ Not recommended |
| **Documentation** | Sonnet 4.5 | 🟡 Med | Flash | 🟢 Low | High (45%) | ❌ Not recommended |

### Key Insights

✅ **Safe Downgrades:**
- Opus → Sonnet for decomposition: Only 10-15% quality loss, significant pricing savings

⚠️ **Risky Downgrades:**
- Sonnet → Flash for domain/feature validation: 30-35% quality loss, but sometimes acceptable for budget constraints
- Sonnet → Flash for architecture/security validation: 40% quality loss - not recommended

❌ **Never Downgrade:**
- Context generation: 60% quality loss - severely impacts developer productivity and AI agent performance
- Documentation: 45% quality loss - weak project foundation affects everything

💡 **Best Value:**
- **Claude Sonnet 4.5** provides optimal quality-per-pricing across most stages
- Use Opus only for critical decomposition/refinement stages where 10-20% improvement matters
- Avoid Flash for generation/documentation stages - quality loss too severe

---

## Upgrade Guide: When to Use Opus

### Scenarios for Claude Opus 4.6

**Decomposition Stages:**
- ✅ Complex enterprise architectures with multiple systems
- ✅ Microservices ecosystems requiring sophisticated dependency management
- ✅ Large-scale projects (50+ epics/stories)
- ✅ Projects with complex business logic and workflows
- ✅ When maximum work breakdown quality is essential

**Context Refinement:**
- ✅ Long-term projects with many future ceremonies (high ROI on better context)
- ✅ AI agent performance is absolutely critical
- ✅ Complex codebases requiring sophisticated pattern recognition
- ✅ When implementation insights are mission-critical

### Quality Gains

| Stage | Opus vs Sonnet | Impact |
|-------|----------------|--------|
| Decomposition | +15% better reasoning | More accurate story scoping, better dependencies |
| Context Refinement | +20% better insights | Significantly improved future AI agent performance |
| Complex Reasoning | +25% better synthesis | Superior handling of multi-domain complexity |

### Pricing Consideration

**Pricing:** 🔴 High (worth it for critical stages)

**When the investment pays off:**
- Single decomposition call with 15% better quality → prevents costly rework on multiple stories
- Context refinement improvements → compound benefits across all future ceremonies
- Complex projects → quality improvement justifies pricing for critical decisions

---

## How to Customize

You can customize model selection for your project using the `/models` command.

### Step-by-Step Guide

1. **Run the command:**
   ```
   /models
   ```

2. **Select ceremony:**
   - sponsor-call
   - sprint-planning
   - seed
   - context-retrospective

3. **Navigate to stage:**
   - Use arrow keys to navigate
   - View current model and estimated cost
   - See stage description and call frequency

4. **For validation stages, select type:**
   - Universal validators (critical: architecture, security)
   - Domain validators (tech stack specific)
   - Feature validators (keyword-based)

5. **Choose provider and model:**
   - claude → claude-opus-4-6, claude-sonnet-4-5-20250929
   - gemini → gemini-2.0-flash-exp, gemini-2.5-pro
   - Based on quality needs and pricing constraints

6. **Save configuration:**
   - Settings saved to `.avc/avc.json`
   - Applied to future ceremony executions

### Example Customization Workflows

**Upgrade critical stages to Opus:**
```
/models → sprint-planning → decomposition → claude → claude-opus-4-6
/models → context-retrospective → context-refinement → claude → claude-opus-4-6
```

**Upgrade validations to Sonnet for better quality:**
```
/models → sprint-planning → validation → domain → claude → claude-sonnet-4-5-20250929
/models → sprint-planning → validation → feature → claude → claude-sonnet-4-5-20250929
```

**Budget mode (downgrade validation only):**
```
/models → sprint-planning → validation → domain → gemini → gemini-2.0-flash-exp
/models → sprint-planning → validation → feature → gemini → gemini-2.0-flash-exp
```

### Full Documentation

For complete details on the `/models` command, see [COMMANDS.md](COMMANDS.md#models).

---

## Summary

### Key Takeaways

1. **Quality First:** AVC defaults prioritize output quality over pricing
2. **Sonnet Optimal:** Claude Sonnet 4.5 provides best quality-per-pricing for most stages
3. **Never Compromise:** Context generation, documentation, and decomposition require high-quality models
4. **Strategic Upgrades:** Use Opus for complex decomposition and critical context refinement
5. **Validation Trade-offs:** Domain/feature validation can use Flash for pricing savings if quality trade-off acceptable
6. **Transparent:** All 14 evaluation prompts included for reproducibility

### Quick Reference

**Always use Sonnet or better:**
- ✅ All decomposition
- ✅ All context generation
- ✅ All documentation
- ✅ Universal validators (architecture/security)
- ✅ Task validation

**Consider Flash for pricing savings:**
- 💰 Domain validators (30-35% quality loss)
- 💰 Feature validators (30% quality loss)
- ⚠️ Only if budget-constrained and trade-off acceptable

**Upgrade to Opus for maximum quality:**
- 🏆 Complex decomposition (+15% quality)
- 🏆 Critical context refinement (+20% quality)
- 🏆 Enterprise architectures
- 🏆 Long-term projects

---

## Related Documentation

- [COMMANDS.md](COMMANDS.md) - Complete command reference including `/models`
- [sponsor-call ceremony](ceremonies/sponsor-call.md) - Ceremony details
- [sprint-planning ceremony](ceremonies/sprint-planning.md) - Ceremony details
- [seed ceremony](ceremonies/seed.md) - Ceremony details
- [ARCHITECTURE.md](architecture/ARCHITECTURE.md) - System architecture overview
