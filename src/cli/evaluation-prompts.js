/**
 * Evaluation prompts for LLM model selection across all AVC ceremonies and stages
 * Extracted from AVC_DEFAULT_LLMS.md
 *
 * Each prompt is used to query LLM providers about which of their models
 * is best suited for the specific stage's requirements.
 */

export const EVALUATION_PROMPTS = [
  {
    id: 'sponsor-call-suggestions',
    ceremony: 'sponsor-call',
    stage: 'suggestions',
    stageName: 'Questionnaire Suggestions',
    prompt: `TASK: Select optimal LLM model for questionnaire suggestions in sponsor-call ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 6/10 (Moderate reasoning with domain inference)
   - Analyze project name for domain clues
   - Infer appropriate technology stack and architecture
   - Generate contextually relevant suggestions across 6 different categories
   - Balance between generic and specific recommendations

3. Context Understanding:
   - Extremely limited input context (just project name)
   - Must leverage broad domain knowledge to compensate
   - Must infer user intent and project type
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Suggestions must be coherent across all 6 fields
   - Must avoid contradictory recommendations
   - Critical for user's first impression of AVC
   → Requires appropriate model capabilities

5. Speed Requirements: IMPORTANT (Secondary)
   - User is actively waiting for suggestions
   - Real-time interaction requires reasonable response time
   - 2-4 second response ideal, <8 seconds acceptable

6. Pricing Considerations: TERTIARY
   - Single call per ceremony (low volume)
   - User-facing quality important
   - Pricing impact minimal with only 1 call
   → Quality worth any pricing tier for this stage

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - Excellent domain inference from minimal context (project name)
2. SECONDARY: World Knowledge - Strong understanding of business domains and technical stacks
3. TERTIARY: Task Complexity - Moderate (7/10) - requires intelligent suggestion generation
4. Speed Requirements: MODERATE - User waiting in real-time (2-4s ideal, <8s acceptable)
5. Pricing: TERTIARY - Single call per ceremony, minimal impact

Selection Guidance:
- Prioritize models with strong domain/business knowledge for accurate suggestions
- Require excellent inference capabilities from very limited context
- Must support real-time interaction speed (<8 seconds)
- Pricing is not a constraint (quality worth any tier for user-facing interaction)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 1,
      impact: 'HIGH',
      taskComplexity: 6,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sponsor-call-documentation',
    ceremony: 'sponsor-call',
    stage: 'documentation',
    stageName: 'Documentation Generation',
    prompt: `TASK: Select optimal LLM model for documentation generation in sponsor-call ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 8/10 (Advanced technical writing and synthesis)
   - Synthesize multiple questionnaire inputs into coherent narrative
   - Organize information into logical section structure
   - Generate appropriate technical architecture descriptions
   - Create realistic user personas and success metrics
   - Maintain professional tone and technical accuracy

3. Context Understanding:
   - Must understand relationships between questionnaire answers
   - Infer appropriate technical depth and detail level
   - Expand brief answers into comprehensive sections
   - Maintain consistency across document sections
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Critical that all sections align and don't contradict
   - Technical architecture must match scope and requirements
   - Success metrics must align with stated goals

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

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - CRITICAL - Foundational project document
2. SECONDARY: Technical Writing - Excellent multi-section document structure
3. TERTIARY: Task Complexity - High (8/10) - requires synthesis of diverse inputs
4. Speed Requirements: LOW - Background process, quality >>> speed
5. Pricing: TERTIARY - Single call, massive quality impact justifies any tier

Selection Guidance:
- Prioritize models with exceptional technical writing and document synthesis
- Require strong markdown formatting and organizational structure
- Must maintain consistency across complex 9-section document
- Must synthesize questionnaire inputs, suggestions, and context into coherent narrative
- Speed is not a constraint (can take 10-30 seconds)
- Pricing not a limitation (worth premium for project foundation)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 1,
      impact: 'CRITICAL',
      taskComplexity: 8,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sponsor-call-context',
    ceremony: 'sponsor-call',
    stage: 'context',
    stageName: 'Context File Creation',
    prompt: `TASK: Select optimal LLM model for context file creation in sponsor-call ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Advanced summarization + context framing)
   - Intelligent summarization (not just compression)
   - Identify critical architectural decisions vs nice-to-have details
   - Frame information in AI-consumable format
   - Balance brevity with completeness

3. Context Understanding:
   - Must understand entire PROJECT.md document
   - Identify patterns and key themes
   - Recognize technical constraints that affect implementation
   - Prioritize information by importance to future AI agents
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Must maintain alignment with PROJECT.md
   - Cannot introduce contradictions
   - Must preserve critical technical details

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

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - VERY HIGH - Used by all future AI agents
2. SECONDARY: AI Context Generation - Excellent understanding of what AI agents need
3. TERTIARY: Task Complexity - High (8/10) - distillation with accuracy preservation
4. Speed Requirements: LOW - Background process, quality >>> speed
5. Pricing: TERTIARY - Single call, very high leverage (affects all future ceremonies)

Selection Guidance:
- Prioritize models with exceptional AI-to-AI context generation capabilities
- Require strong balance of conciseness and completeness
- Must identify critical vs supplementary information effectively
- Must maintain technical accuracy while summarizing
- Must avoid introducing contradictions with source documentation
- Speed not a constraint (background processing)
- Pricing justified by high leverage (used in every future ceremony)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 1,
      impact: 'VERY HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sponsor-call-validation',
    ceremony: 'sponsor-call',
    stage: 'validation',
    stageName: 'Documentation Validation',
    prompt: `TASK: Select optimal LLM model for documentation validation in sponsor-call ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 6/10 (Analytical validation + rule application)
   - Apply validation rules to documentation
   - Identify inconsistencies and gaps
   - Assess completeness and coherence

3. Context Understanding:
   - Must handle large documents (full PROJECT.md)
   - Understand relationships across sections
   - Identify subtle inconsistencies
   → Requires appropriate model capabilities

4. Speed Requirements: LOW (Secondary)
   - Background validation stage
   - Quality more important than speed

6. Pricing Considerations: TERTIARY
   - Only 2 calls per ceremony
   - Moderate quality requirements

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - HIGH - Analytical validation with actionable feedback
2. SECONDARY: Task Complexity - Moderate (6/10) - rule application + gap identification
3. TERTIARY: Context Understanding - Must handle large documents with cross-section relationships
4. Speed Requirements: LOW - Background validation, quality >>> speed
5. Pricing: TERTIARY - 2 calls per ceremony, moderate impact

Selection Guidance:
- Prioritize models with strong analytical and critical thinking capabilities
- Require ability to identify subtle inconsistencies and gaps
- Must provide actionable, specific feedback for improvement
- Must understand project documentation best practices
- Speed not a constraint (background processing)
- Consider pricing tier relative to quality improvement

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 2,
      impact: 'HIGH',
      taskComplexity: 6,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sprint-planning-decomposition',
    ceremony: 'sprint-planning',
    stage: 'decomposition',
    stageName: 'Epic & Story Decomposition',
    prompt: `TASK: Select optimal LLM model for epic and story decomposition in sprint-planning ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 9/10 (Complex hierarchical decomposition)
   - Analyze full project scope
   - Break features into implementable story-level units
   - Generate specific, testable acceptance criteria
   - Identify dependencies between stories

3. Context Understanding:
   - Must synthesize entire project vision
   - Understand technical architecture and constraints
   - Recognize implicit dependencies
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Critical that decomposition is complete (no gaps)
   - Stories must not overlap or contradict

5. Speed Requirements: LOW (Secondary)
   - Background process, one-time operation
   - Quality far more important than speed

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Most critical stage in sprint-planning
   → Worth any pricing tier

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - CRITICAL - Defines entire project work structure
2. SECONDARY: Task Complexity - Very High (9/10) - complex hierarchical decomposition
3. TERTIARY: Hierarchical Reasoning - Exceptional domain breakdown with dependencies
4. Speed Requirements: LOW - Background process, quality >>> speed
5. Pricing: TERTIARY - Single call, most critical stage, worth any tier

Selection Guidance:
- Prioritize models with exceptional hierarchical reasoning and decomposition
- Require deep project synthesis and implicit dependency recognition
- Must generate complete, non-overlapping, consistent epic/story structure
- Must produce specific, testable acceptance criteria at story level
- Consistency and completeness are paramount (gaps cause downstream failures)
- Speed not a constraint (one-time background operation)
- Pricing justified by critical impact on entire project

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 1,
      impact: 'CRITICAL',
      taskComplexity: 9,
      currentDefault: 'Claude Opus 4.6'
    }
  },

  {
    id: 'sprint-planning-validation-universal',
    ceremony: 'sprint-planning',
    stage: 'validation-universal',
    stageName: 'Universal Validators',
    prompt: `TASK: Select optimal LLM model for universal validators in sprint-planning ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 9/10 (Deep architectural and security analysis)
   - Analyze system architecture and design patterns
   - Identify security vulnerabilities
   - Assess technical feasibility
   - Evaluate testing strategies

3. Context Understanding:
   - Must understand full project architecture
   - Cross-reference with other epics/stories
   - Identify system-wide architectural issues
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Cannot miss critical architectural flaws
   - Must consistently identify security issues
   → Critical appropriate model capabilities

5. Speed Requirements: MODERATE (Secondary)
   - 30 calls in parallel validation stage
   - Quality far more important than speed

6. Pricing Considerations: MODERATE
   - 30 calls = significant volume
   - Quality cannot be compromised

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - CRITICAL - Deep architectural and security analysis
2. SECONDARY: Task Complexity - Very High (9/10) - system-wide analysis
3. TERTIARY: Reliability - Cannot miss critical architectural flaws or security issues
4. Speed Requirements: MODERATE - 30 calls in parallel, quality still paramount
5. Pricing: MODERATE - 30 calls = significant volume, but quality cannot be compromised

Selection Guidance:
- Prioritize models with exceptional architectural reasoning and security analysis
- Require consistent, reliable identification of vulnerabilities and design flaws
- Must provide specific, actionable recommendations for improvements
- Must understand system-wide architecture and cross-reference between components
- Reliability is critical (false negatives in security/architecture are high-risk)
- Do not compromise on quality for these critical validators

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 30,
      impact: 'CRITICAL',
      taskComplexity: 9,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sprint-planning-validation-domain',
    ceremony: 'sprint-planning',
    stage: 'validation-domain',
    stageName: 'Domain Validators',
    prompt: `TASK: Select optimal LLM model for domain validators in sprint-planning ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Domain expertise application)
   - Apply domain-specific patterns
   - Identify violations of domain conventions
   - Not just pattern matching - requires context understanding

3. Context Understanding:
   - Must understand project architecture in domain context
   - Cross-reference with other domains

4. Speed Requirements: MODERATE (Secondary)
   - 90 calls = highest volume in sprint-planning
   - Parallel execution

6. Pricing Considerations: SIGNIFICANT
   - 90 calls = largest pricing driver
   - Medium vs Low pricing makes material difference

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - HIGH - Domain-specific best practices and anti-patterns
2. SECONDARY: Task Complexity - High (7/10) - requires domain expertise, not just pattern matching
3. TERTIARY: Volume Impact - HIGHEST (90 calls) - largest pricing driver in ceremony
4. Speed Requirements: MODERATE - Parallel execution, but quality important
5. Pricing: SIGNIFICANT - 90 calls make pricing tier materially impactful

Selection Guidance:
- Prioritize models with strong domain knowledge (DevOps, Database, API, Frontend, etc.)
- Require ability to apply domain-specific best practices and identify anti-patterns
- Must provide actionable, context-appropriate recommendations
- Consider pricing tier carefully (90 calls = 3-4x cost difference between tiers)
- Balance domain expertise depth vs pricing efficiency
- Acceptable to use lower tier if basic domain pattern checking sufficient

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 90,
      impact: 'HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sprint-planning-validation-feature',
    ceremony: 'sprint-planning',
    stage: 'validation-feature',
    stageName: 'Feature Validators',
    prompt: `TASK: Select optimal LLM model for feature validators in sprint-planning ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 5/10 (Feature checklist validation)
   - Apply feature-specific checklists
   - Identify missing scenarios
   - Verify acceptance criteria completeness

3. Context Understanding:
   - Understand feature requirements from acceptance criteria
   - Identify implicit requirements not explicitly stated

4. Speed Requirements: MODERATE (Secondary)
   - 25 calls, parallel execution
   - Background processing

6. Pricing Considerations: MODERATE
   - 25 calls = moderate volume
   - Completeness checking vs deep analysis

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - MEDIUM-HIGH - Feature completeness and edge case identification
2. SECONDARY: Task Complexity - Moderate (5/10) - checklist application with implicit requirement detection
3. TERTIARY: Volume Impact - MODERATE (25 calls) - pricing tier makes moderate impact
4. Speed Requirements: MODERATE - Parallel execution in background
5. Pricing: MODERATE - 25 calls = moderate volume, balance quality vs cost

Selection Guidance:
- Prioritize models capable of identifying implicit requirements (not just explicit ones)
- Require feature completeness checking (missing scenarios, edge cases)
- Should provide test scenario suggestions
- Consider pricing tier (25 calls = 2-3x cost difference between tiers)
- Balance edge case detection quality vs pricing efficiency
- Acceptable to use lower tier if basic explicit requirement checking sufficient

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 25,
      impact: 'MEDIUM',
      taskComplexity: 5,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'sprint-planning-context-generation',
    ceremony: 'sprint-planning',
    stage: 'context-generation',
    stageName: 'Context File Generation',
    prompt: `TASK: Select optimal LLM model for context file generation in sprint-planning ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Technical context synthesis)
   - Synthesize acceptance criteria into implementation context
   - Inherit and extend parent epic context
   - Identify technical considerations
   - Create AI-consumable context

3. Context Understanding:
   - Understand full project and parent epic context
   - Recognize technical implications
   - Consider implementation challenges
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Context must align with acceptance criteria
   - Technical guidance must be accurate

5. Speed Requirements: MODERATE (Secondary)
   - 25 calls, parallel generation
   - Quality more important than speed

6. Pricing Considerations: MODERATE
   - 25 calls = moderate volume
   - User-facing, high impact
   - Quality worth investment

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - VERY HIGH - Developers read daily, AI agents use for decomposition
2. SECONDARY: Technical Writing - Actionable developer guidance with accuracy
3. TERTIARY: Task Complexity - High (7/10) - synthesis with context inheritance
4. Speed Requirements: MODERATE - 25 calls in parallel, quality >>> speed
5. Pricing: MODERATE - 25 calls, high impact justifies investment

Selection Guidance:
- Prioritize models with excellent technical writing and developer-focused context
- Require accurate technical guidance and implementation considerations
- Must balance conciseness with completeness (500-2,000 token output)
- Must properly inherit and extend parent context
- Quality directly impacts developer productivity and AI agent effectiveness
- Do not compromise on context quality (high leverage on downstream work)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 25,
      impact: 'VERY HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'seed-decomposition',
    ceremony: 'seed',
    stage: 'decomposition',
    stageName: 'Task Decomposition',
    prompt: `TASK: Select optimal LLM model for task decomposition in seed ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 8/10 (Granular work breakdown)
   - Analyze story and break into tasks
   - Determine appropriate task granularity
   - Break tasks into atomic subtasks
   - Identify task dependencies

3. Context Understanding:
   - Understand full story requirements
   - Consider epic and project context
   - Identify implicit implementation needs
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Task breakdown must be complete
   - Dependencies must be accurate

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality far more important

6. Pricing Considerations: TERTIARY
   - Single call per ceremony
   - Critical for implementation planning

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - CRITICAL - Defines actual implementation plan
2. SECONDARY: Task Complexity - Very High (8/10) - granular work breakdown with dependencies
3. TERTIARY: Breakdown Capability - Exceptional atomic subtask identification
4. Speed Requirements: LOW - Background processing, quality >>> speed
5. Pricing: TERTIARY - Single call, critical impact justifies any tier

Selection Guidance:
- Prioritize models with exceptional hierarchical decomposition and breakdown capability
- Require accurate identification of atomic, implementable subtasks
- Must properly identify task dependencies
- Must understand full story requirements in epic/project context
- Completeness is critical (missing tasks cause implementation delays)
- Reliability paramount (inconsistent granularity causes confusion)
- Single call makes pricing tier less significant than quality

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 1,
      impact: 'CRITICAL',
      taskComplexity: 8,
      currentDefault: 'Claude Opus 4.6'
    }
  },

  {
    id: 'seed-validation',
    ceremony: 'seed',
    stage: 'validation',
    stageName: 'Task Validation',
    prompt: `TASK: Select optimal LLM model for task validation in seed ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Completeness validation + reasoning)
   - Analyze task hierarchy for gaps
   - Assess granularity appropriateness
   - Validate dependency relationships
   - Reason about implementation feasibility

3. Context Understanding:
   - Must understand full task hierarchy
   - Cross-reference with story requirements
   - Reason about dependencies
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Must consistently identify gaps
   - Cannot miss critical completeness problems

5. Speed Requirements: MODERATE (Secondary)
   - 20 calls, parallel validation
   - Quality far more important

6. Pricing Considerations: MODERATE
   - 20 calls = moderate volume
   - Critical impact (prevents implementation issues)

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - VERY HIGH - Catches planning issues before development
2. SECONDARY: Validation Reasoning - Sophisticated gap identification and granularity assessment
3. TERTIARY: Task Complexity - High (7/10) - completeness validation with dependency reasoning
4. Speed Requirements: MODERATE - 20 calls in parallel, quality >>> speed
5. Pricing: MODERATE - 20 calls, critical impact justifies investment

Selection Guidance:
- Prioritize models with excellent completeness validation and gap identification
- Require sophisticated reasoning about task granularity appropriateness
- Must validate dependency correctness and implementation feasibility
- Must cross-reference task hierarchy with story requirements
- Cannot miss critical completeness problems (false negatives are costly)
- Do not compromise on quality (prevents downstream implementation issues)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 20,
      impact: 'VERY HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'seed-context-generation',
    ceremony: 'seed',
    stage: 'context-generation',
    stageName: 'Task Context Generation',
    prompt: `TASK: Select optimal LLM model for task context generation in seed ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Implementation-focused technical context)
   - Synthesize task requirements into guidance
   - Provide appropriate technical detail
   - Identify implementation approaches
   - Balance brevity with actionability

3. Context Understanding:
   - Understand task within story/epic context
   - Recognize relevant patterns
   - Identify task dependencies
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Context must align with task requirements
   - Technical guidance must be accurate

5. Speed Requirements: MODERATE (Secondary)
   - 10 calls, parallel generation
   - Quality more important

6. Pricing Considerations: MODERATE
   - 10 calls = low-moderate volume
   - Developer-facing, high impact

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - VERY HIGH - Developers read immediately before implementing
2. SECONDARY: Technical Writing - Implementation-focused guidance with accuracy
3. TERTIARY: Task Complexity - High (7/10) - synthesis with appropriate detail level
4. Speed Requirements: MODERATE - 10 calls in parallel, quality >>> speed
5. Pricing: MODERATE - 10 calls, developer-facing, high impact

Selection Guidance:
- Prioritize models with excellent technical writing for implementation guidance
- Require ability to highlight gotchas, edge cases, and implementation approaches
- Must provide specific, actionable guidance (not generic advice)
- Must balance brevity with actionability (300-1,000 token output)
- Technical details must be accurate (errors cause developer confusion)
- Do not compromise on quality (directly impacts implementation efficiency)

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 10,
      impact: 'VERY HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'context-retrospective-documentation-update',
    ceremony: 'context-retrospective',
    stage: 'documentation-update',
    stageName: 'Documentation Enhancement',
    prompt: `TASK: Select optimal LLM model for documentation enhancement in context-retrospective ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 7/10 (Technical synthesis and writing)
   - Analyze git history
   - Identify patterns and insights
   - Synthesize into documentation updates

3. Context Understanding:
   - Must handle large context (PROJECT.md + git history)
   - Understand implementation changes
   - Identify obsolete information
   → Large context window needed appropriate model capabilities

4. Consistency & Reliability:
   - Updates must not contradict existing content
   - Technical accuracy critical

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality more important

6. Pricing Considerations: MODERATE
   - 10 calls = low-moderate volume
   - Important but not critical path

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - HIGH - Maintains PROJECT.md as source of truth
2. SECONDARY: Technical Writing - Synthesis of implementation learnings
3. TERTIARY: Task Complexity - High (7/10) - git history analysis + documentation
4. Speed Requirements: LOW - Background processing, quality >>> speed
5. Pricing: MODERATE - 10 calls, important but not critical path

Selection Guidance:
- Prioritize models with excellent technical writing and documentation synthesis
- Require ability to analyze git history and identify implementation patterns
- Must maintain consistency with existing documentation (no contradictions)
- Must handle large context (PROJECT.md + git history = 10K-30K tokens)
- Technical accuracy critical (documentation is project source of truth)
- Consider balance of quality vs pricing for moderate-volume task

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 10,
      impact: 'HIGH',
      taskComplexity: 7,
      currentDefault: 'Claude Sonnet 4.5'
    }
  },

  {
    id: 'context-retrospective-context-refinement',
    ceremony: 'context-retrospective',
    stage: 'context-refinement',
    stageName: 'Context Enhancement',
    prompt: `TASK: Select optimal LLM model for context refinement in context-retrospective ceremony
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
   → Requires appropriate model capabilities

2. Task Complexity: 8/10 (Code analysis + insight extraction)
   - Analyze code diffs
   - Identify patterns and best practices
   - Extract insights from issue discussions
   - Synthesize into actionable context

3. Context Understanding:
   - Understand code changes in project context
   - Analyze git diffs
   - Synthesize from multiple sources
   → Requires appropriate model capabilities

4. Consistency & Reliability:
   - Enhanced context must align with original
   - Code examples must be accurate
   → Both appropriate model capabilities

5. Speed Requirements: LOW (Secondary)
   - Background processing
   - Quality far more important

6. Pricing Considerations: MODERATE
   - 15 calls = moderate volume
   - Very high leverage (improves all future AI work)

RECOMMENDATION:

Based on evaluation criteria above, select the model that best meets:
1. PRIMARY: Output Quality - VERY HIGH - Enhances context for all future AI agents
2. SECONDARY: Code Analysis - Exceptional insight extraction from git diffs
3. TERTIARY: Task Complexity - Very High (8/10) - pattern identification + synthesis
4. Speed Requirements: LOW - Background processing, quality >>> speed
5. Pricing: MODERATE - 15 calls, very high leverage (improves all future ceremonies)

Selection Guidance:
- Prioritize models with exceptional code analysis and pattern recognition
- Require ability to extract valuable insights from code diffs and PRs
- Must identify implementation patterns, gotchas, and best practices
- Must synthesize from multiple sources (git diffs, issues, comments)
- Code examples must be accurate (errors propagate to future AI work)
- Very high leverage justifies premium tier (enhanced context used in all future work)
- Quality directly impacts all future AI agent effectiveness

Consider all available models from any provider (Claude, Gemini, OpenAI, etc.)`,
    metadata: {
      callFrequency: 15,
      impact: 'VERY HIGH',
      taskComplexity: 8,
      currentDefault: 'Claude Opus 4.6'
    }
  }
];

/**
 * Get evaluation prompt by ID
 * @param {string} id - Prompt ID (e.g., 'sponsor-call-suggestions')
 * @returns {Object|null} Evaluation prompt object or null if not found
 */
export function getPromptById(id) {
  return EVALUATION_PROMPTS.find(p => p.id === id) || null;
}

/**
 * Get all prompts for a specific ceremony
 * @param {string} ceremony - Ceremony name (e.g., 'sponsor-call')
 * @returns {Array} Array of evaluation prompts for the ceremony
 */
export function getPromptsByCeremony(ceremony) {
  return EVALUATION_PROMPTS.filter(p => p.ceremony === ceremony);
}

/**
 * Get prompt statistics
 * @returns {Object} Statistics about evaluation prompts
 */
export function getPromptStats() {
  const ceremonies = [...new Set(EVALUATION_PROMPTS.map(p => p.ceremony))];
  const totalCalls = EVALUATION_PROMPTS.reduce((sum, p) => sum + p.metadata.callFrequency, 0);

  return {
    totalPrompts: EVALUATION_PROMPTS.length,
    ceremonies: ceremonies.length,
    ceremonyList: ceremonies,
    estimatedTotalCalls: totalCalls,
    impactDistribution: {
      CRITICAL: EVALUATION_PROMPTS.filter(p => p.metadata.impact === 'CRITICAL').length,
      'VERY HIGH': EVALUATION_PROMPTS.filter(p => p.metadata.impact === 'VERY HIGH').length,
      HIGH: EVALUATION_PROMPTS.filter(p => p.metadata.impact === 'HIGH').length,
      MEDIUM: EVALUATION_PROMPTS.filter(p => p.metadata.impact === 'MEDIUM').length
    }
  };
}
