/**
 * MockLLMProvider — instant canned responses for E2E testing.
 * Activated when AVC_LLM_MOCK=1 is set in the environment.
 *
 * Detects what kind of response to return by inspecting the prompt text.
 */
export class MockLLMProvider {
  constructor() {
    this.providerName = 'mock';
    this.model = 'mock-model';
    this.tokenUsage = { inputTokens: 0, outputTokens: 0, totalCalls: 0 };
  }

  async validateApiKey() {
    return { valid: true };
  }

  getTokenUsage() {
    return {
      inputTokens: this.tokenUsage.inputTokens,
      outputTokens: this.tokenUsage.outputTokens,
      totalTokens: this.tokenUsage.inputTokens + this.tokenUsage.outputTokens,
      totalCalls: this.tokenUsage.totalCalls,
      estimatedCost: 0,
      provider: 'mock',
      model: 'mock-model'
    };
  }

  _track(prompt = '') {
    this.tokenUsage.inputTokens += Math.ceil(prompt.length / 4);
    this.tokenUsage.outputTokens += 50;
    this.tokenUsage.totalCalls++;
  }

  /** generateJSON — detect call type from agent instructions (most reliable discriminator) */
  async generateJSON(prompt, agentInstructions = null) {
    this._track(prompt);

    const p = (prompt || '').toLowerCase();
    // Use agent instructions filename/content as the primary discriminator — it's
    // more reliable than prompt text which can contain overlapping keywords.
    const agent = (agentInstructions || '').toLowerCase();

    // Validation calls (validator-documentation.md / validator-context.md)
    // validator-documentation.md contains "validationStatus" and "overallScore" as output fields
    if (agent.includes('validationstatus') || agent.includes('overallscore') ||
        p.includes('validate the following')) {
      return {
        validationStatus: 'acceptable',
        overallScore: 90,
        issues: [],
        contentIssues: [],
        structuralIssues: [],
        applicationFlowGaps: [],
        strengths: ['Well-structured document (mock validation)'],
        improvementPriorities: [],
        readyForPublication: true,
        readyForUse: true
      };
    }

    // Database recommendation (database-recommender.md)
    // database-recommender.md uniquely contains "hasDatabaseNeeds" as an output field
    if (agent.includes('hasdatabaseneeds') || p.includes('determine if it needs a database')) {
      return {
        hasDatabaseNeeds: true,
        comparison: {
          sqlOption: {
            database: 'PostgreSQL',
            specificVersion: 'PostgreSQL 16',
            bestFor: 'Relational data with ACID guarantees',
            strengths: ['Strong consistency', 'Rich query language', 'Mature ecosystem'],
            weaknesses: ['Schema migrations required'],
            estimatedCosts: { monthly: '$0 (local Docker)' }
          },
          nosqlOption: {
            database: 'MongoDB',
            specificVersion: 'MongoDB 7',
            bestFor: 'Flexible document storage',
            strengths: ['Schema flexibility', 'Easy horizontal scaling'],
            weaknesses: ['Eventual consistency by default'],
            estimatedCosts: { monthly: '$0 (local Docker)' }
          },
          keyMetrics: {
            estimatedReadWriteRatio: '70/30',
            expectedThroughput: 'Low-medium (< 1000 req/s)',
            dataComplexity: 'Medium — relational entities with joins'
          }
        },
        recommendation: 'sql',
        confidence: 85,
        reasoning: 'Mock: task management apps benefit from relational integrity'
      };
    }

    // Architecture recommendations (architecture-recommender.md)
    // architecture-recommender.md uniquely contains "requiresCloudProvider" as an output field
    if (agent.includes('requirescloudprovider') || p.includes('recommend 3-5') || p.includes('deployment architectures')) {
      return {
        architectures: [
          {
            name: 'Local Hybrid Stack',
            description: 'Express.js/FastAPI backend on localhost with PostgreSQL in Docker',
            requiresCloudProvider: false,
            bestFor: 'Experienced developers who want fast debugging with database isolation',
            migrationPath: {
              targetCloud: 'AWS ECS / Azure Container Apps / GCP Cloud Run',
              steps: [
                'Containerize backend with Docker',
                'Push images to ECR/ACR/GCR',
                'Deploy to container orchestration service'
              ]
            }
          },
          {
            name: 'Full Docker Compose',
            description: 'All services in Docker Compose — database, backend, and frontend',
            requiresCloudProvider: false,
            bestFor: 'Teams who want identical environments across all machines',
            migrationPath: {
              targetCloud: 'AWS ECS / GCP Cloud Run',
              steps: ['Convert docker-compose.yml to ECS task definitions', 'Set up managed database']
            }
          }
        ]
      };
    }

    // Question prefilling (question-prefiller.md)
    // question-prefiller.md uniquely contains "TARGET_USERS" as an output field
    if (agent.includes('target_users') || p.includes('target_users')) {
      return {
        TARGET_USERS: 'Developers and project teams managing software development tasks',
        DEPLOYMENT_TARGET: 'Local development environment using Docker Compose; ready to migrate to AWS ECS or Azure Container Apps for production',
        TECHNICAL_CONSIDERATIONS: 'Node.js/Express.js or FastAPI backend, React 18 + Vite frontend, PostgreSQL 16 in Docker for local development with production migration path',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'JWT authentication with refresh tokens, bcrypt password hashing, HTTPS in production, standard OWASP security practices'
      };
    }

    // Context generation (project-context-generator.md)
    // project-context-generator.md uniquely contains "contextMarkdown" as an output field
    if (agent.includes('contextmarkdown') || agent.includes('context generator')) {
      const mockContext = `# Project Context

**Mission:** Build a test task manager app
**Architecture:** Local Hybrid Stack
**Database:** PostgreSQL 16
**Tech Stack:** Node.js, Express.js, React 18, Vite
**Deployment:** Local Docker Compose → AWS ECS
`;
      return {
        contextMarkdown: mockContext,
        tokenCount: Math.ceil(mockContext.length / 4),
        withinBudget: true
      };
    }

    // Generic fallback
    return { result: 'Mock JSON response', success: true };
  }

  /** generate — return a mock sponsor-call document */
  async generate(prompt, maxTokens = 256, systemInstructions = null) {
    this._track(prompt);

    const p = (prompt || '').toLowerCase();

    // Document generation
    if (p.includes('sponsor') || p.includes('project brief') || p.includes('enhance')) {
      return `# Sponsor Call — Test Task Manager

## Mission Statement
Build a test task manager app to help teams manage development tasks efficiently.

## Initial Scope & Key Features
MVP with task creation and basic authentication.

## Target Users
Developers and project teams managing software development tasks.

## Deployment Target
Local development environment with Docker Compose. Ready to migrate to AWS ECS when needed.

## Technical Considerations
Node.js/Express.js backend, React 18 + Vite frontend, PostgreSQL 16 in Docker.

## Security & Compliance
JWT authentication with refresh tokens, bcrypt password hashing, HTTPS in production.

## Architecture
Local Hybrid Stack: backend on localhost, database in Docker for isolation.

---
*Generated by AVC mock provider for E2E testing*
`;
    }

    // Improvement pass (iterative validation improve step)
    if (p.includes('improve') || p.includes('enhancement')) {
      return `# Sponsor Call — Test Task Manager (Improved)

## Mission Statement
Build a comprehensive test task manager app for development teams.

## Initial Scope & Key Features
MVP with task creation, assignment, and basic JWT authentication.

## Target Users
Software development teams and individual developers.

## Deployment Target
Local development with Docker Compose, production on AWS ECS.

## Technical Considerations
Express.js/Node.js backend, React 18 frontend, PostgreSQL 16 in Docker container.

## Security & Compliance
JWT + bcrypt authentication, OWASP security practices.

---
*Improved by AVC mock provider for E2E testing*
`;
    }

    return 'Mock text response from AVC E2E mock provider.';
  }

  /** generateText — alias for generate (used by migration guide generator) */
  async generateText(prompt, agentInstructions = null) {
    return this.generate(prompt, 4096, agentInstructions);
  }
}
