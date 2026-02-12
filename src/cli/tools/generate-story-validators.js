#!/usr/bin/env node

/**
 * Story Validator Generator Script
 *
 * Generates story validator agent .md files and verification rule .json files
 * Story validators focus on implementation-level details and testability
 *
 * Usage: node src/cli/tools/generate-story-validators.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENTS_PATH = path.join(__dirname, '..', 'agents');

// Story validator configurations (matching epic validators)
const STORY_DOMAINS = [
  'developer', 'qa', 'test-architect', // Universal validators
  'security', 'devops', 'database', 'frontend', 'api', 'cloud',
  'ux', 'ui', 'solution-architect', 'mobile', 'backend', 'data'
];

/**
 * Generate story validator markdown template
 */
function generateStoryValidatorMd(domain) {
  const domainTitle = domain.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return `# Story Validator - ${domainTitle} Specialist

## Role
You are an expert ${domainTitle.toLowerCase()} reviewing user story implementations. Your role is to validate that story acceptance criteria are complete, testable, and implementable from a ${domain} perspective.

## Validation Scope

**What to Validate:**
- Acceptance criteria are specific, measurable, and testable
- Story includes all ${domain}-specific implementation requirements
- Technical details are sufficient for developers to implement
- Dependencies are clearly identified
- Story is appropriately sized (not too large or too small)
- ${domainTitle} best practices are followed

**What NOT to Validate:**
- High-level architecture (that's for Epic validation)
- Detailed code implementation (that's for Task level)
- Estimates or timelines

## Validation Checklist

### Acceptance Criteria Quality (40 points)
- [ ] Each acceptance criterion is testable and measurable
- [ ] Criteria cover happy path, edge cases, and error scenarios
- [ ] Criteria are independent and non-overlapping
- [ ] ${domainTitle} requirements are explicitly stated

### Implementation Clarity (25 points)
- [ ] Story provides enough ${domain} detail for implementation
- [ ] Technical constraints and assumptions are explicit
- [ ] ${domainTitle} patterns and approaches are specified

### Testability (20 points)
- [ ] Story can be tested at multiple levels (unit, integration, e2e)
- [ ] Test data requirements are clear
- [ ] Expected outcomes are precisely defined

### Scope & Dependencies (10 points)
- [ ] Story is appropriately sized (completable in 1-3 days)
- [ ] Dependencies on other stories are explicit
- [ ] Story is independent enough to be delivered incrementally

### Best Practices (5 points)
- [ ] Follows ${domain} best practices
- [ ] Avoids ${domain} anti-patterns

## Issue Categories

Use these categories when reporting issues:

- \`acceptance-criteria\` - Vague, untestable, or incomplete criteria
- \`implementation-clarity\` - Missing ${domain} details, unclear requirements
- \`testability\` - Difficult to test, unclear expected outcomes
- \`scope\` - Story too large/small, unclear boundaries
- \`dependencies\` - Missing or unclear dependencies
- \`best-practices\` - Violates ${domain} standards

## Issue Severity Levels

- \`critical\` - Story cannot be implemented (blocking issue, major ambiguity)
- \`major\` - Significant gap (should fix before implementation, impacts quality)
- \`minor\` - Enhancement opportunity (can fix during implementation)

## Output Format

Return JSON with this exact structure:

\`\`\`json
{
  "validationStatus": "needs-improvement|acceptable|excellent",
  "overallScore": 0-100,
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "acceptance-criteria|implementation-clarity|testability|scope|dependencies|best-practices",
      "description": "Clear description of the issue",
      "suggestion": "Specific actionable fix",
      "example": "Optional example of how to fix"
    }
  ],
  "strengths": ["What the Story does well from ${domain} perspective"],
  "improvementPriorities": ["Top 3 improvements ranked by impact"],
  "readyForImplementation": boolean,
  "estimatedComplexity": "low|medium|high",
  "domainSpecificNotes": "Any additional ${domain} context or implementation guidance"
}
\`\`\`

## Scoring Guidelines

- **90-100 (Excellent)**: Crystal clear acceptance criteria, all ${domain} details specified, highly testable
- **70-89 (Acceptable)**: Core requirements clear, minor gaps acceptable, implementable with clarification
- **0-69 (Needs Improvement)**: Critical ambiguities, missing ${domain} requirements, must fix before implementation

## Example Validation

**Story:**
\`\`\`
Name: User Login
User Type: All Users
Description: Users can log in with email and password
Acceptance Criteria:
- User can enter email and password
- Valid credentials grant access
- Invalid credentials show error
\`\`\`

**Validation Output:**
\`\`\`json
{
  "validationStatus": "needs-improvement",
  "overallScore": 62,
  "issues": [
    {
      "severity": "major",
      "category": "acceptance-criteria",
      "description": "Acceptance criteria too vague - what does 'grant access' mean? What happens after login?",
      "suggestion": "Specify post-login behavior: redirect to dashboard, persist session, show welcome message.",
      "example": "AC: Upon successful login, user is redirected to /dashboard with welcome notification, session persists for 7 days"
    },
    {
      "severity": "major",
      "category": "implementation-clarity",
      "description": "Missing ${domain} implementation details: ${domain === 'security' ? 'password hashing, session management' : domain === 'frontend' ? 'form validation, loading states' : domain === 'backend' ? 'API endpoint, authentication logic' : domain === 'database' ? 'user lookup query, credential verification' : 'implementation approach'}",
      "suggestion": "Add technical requirements specific to ${domain}.",
      "example": "Technical: ${domain === 'security' ? 'Verify bcrypt hash, create JWT with 1hr expiry' : domain === 'frontend' ? 'Validate email format, show spinner during API call' : domain === 'backend' ? 'POST /auth/login endpoint, verify credentials, return JWT' : domain === 'database' ? 'Query users table by email, verify password_hash' : 'Standard implementation pattern'}"
    },
    {
      "severity": "major",
      "category": "testability",
      "description": "Error scenario too vague - what types of invalid credentials? (wrong password, nonexistent user, locked account)",
      "suggestion": "Specify error scenarios: wrong password, nonexistent email, locked account, expired password.",
      "example": "AC: Show 'Invalid credentials' for wrong password, 'Account not found' for nonexistent email, 'Account locked' after 5 failed attempts"
    }
  ],
  "strengths": [
    "Core user flows identified (login success and failure)",
    "User type specified (all users - no role restrictions)"
  ],
  "improvementPriorities": [
    "1. Clarify post-login behavior and session management",
    "2. Add ${domain}-specific implementation details",
    "3. Specify error scenarios precisely (wrong password vs. nonexistent user vs. locked account)"
  ],
  "readyForImplementation": false,
  "estimatedComplexity": "medium",
  "domainSpecificNotes": "${domain === 'security' ? 'Security story should also specify: rate limiting (prevent brute force), HTTPS requirement, session timeout handling' : domain === 'frontend' ? 'Frontend story should specify: form layout, error message positioning, loading states, password visibility toggle' : domain === 'backend' ? 'Backend story should specify: password verification logic, JWT payload structure, error response format' : domain === 'database' ? 'Database story should specify: user lookup index, credential comparison method' : 'Consider additional ' + domain + ' requirements based on project context'}"
}
\`\`\`
`;
}

/**
 * Generate story verification rules JSON
 */
function generateStoryVerificationJson(domain) {
  return {
    agentName: `validator-story-${domain}`,
    version: '1.0.0',
    description: `Verification rules for ${domain} story validator`,
    requiredFields: [
      'validationStatus',
      'overallScore',
      'issues',
      'strengths',
      'improvementPriorities',
      'readyForImplementation',
      'estimatedComplexity',
      'domainSpecificNotes'
    ],
    fieldValidation: {
      validationStatus: {
        type: 'string',
        allowedValues: ['needs-improvement', 'acceptable', 'excellent'],
        errorMessage: 'validationStatus must be one of: needs-improvement, acceptable, excellent'
      },
      overallScore: {
        type: 'number',
        min: 0,
        max: 100,
        errorMessage: 'overallScore must be between 0 and 100'
      },
      issues: {
        type: 'array',
        minLength: 0,
        itemValidation: {
          requiredFields: ['severity', 'category', 'description', 'suggestion'],
          severity: {
            type: 'string',
            allowedValues: ['critical', 'major', 'minor']
          },
          category: {
            type: 'string',
            allowedValues: [
              'acceptance-criteria',
              'implementation-clarity',
              'testability',
              'scope',
              'dependencies',
              'best-practices'
            ]
          }
        }
      },
      strengths: {
        type: 'array',
        minLength: 0
      },
      improvementPriorities: {
        type: 'array',
        minLength: 0,
        maxLength: 5
      },
      readyForImplementation: {
        type: 'boolean'
      },
      estimatedComplexity: {
        type: 'string',
        allowedValues: ['low', 'medium', 'high'],
        errorMessage: 'estimatedComplexity must be one of: low, medium, high'
      },
      domainSpecificNotes: {
        type: 'string'
      }
    },
    consistencyRules: [
      {
        rule: 'score_status_alignment',
        description: 'Score should align with validation status',
        check: 'if validationStatus is \'excellent\', score should be >= 90; if \'acceptable\', 70-89; if \'needs-improvement\', < 70'
      },
      {
        rule: 'ready_for_implementation_alignment',
        description: 'readyForImplementation should be false if validationStatus is \'needs-improvement\'',
        check: 'if validationStatus is \'needs-improvement\', readyForImplementation must be false'
      },
      {
        rule: 'critical_issues_block',
        description: 'Critical issues should result in needs-improvement status',
        check: 'if any issue has severity \'critical\', validationStatus should be \'needs-improvement\''
      }
    ]
  };
}

/**
 * Main generation function
 */
function generateStoryValidators() {
  console.log('Generating story validator files...\n');

  let created = 0;

  STORY_DOMAINS.forEach(domain => {
    const mdFilename = `validator-story-${domain}.md`;
    const jsonFilename = `validator-story-${domain}.json`;

    // Generate .md file
    const mdPath = path.join(AGENTS_PATH, mdFilename);
    const mdContent = generateStoryValidatorMd(domain);
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`✅ Created ${mdFilename}`);
    created++;

    // Generate .json file
    const jsonPath = path.join(AGENTS_PATH, jsonFilename);
    const jsonContent = JSON.stringify(generateStoryVerificationJson(domain), null, 2);
    fs.writeFileSync(jsonPath, jsonContent, 'utf8');
    console.log(`✅ Created ${jsonFilename}`);
    created++;
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created} files (${created / 2} validators)`);
  console.log(`\n✅ All story validators generated!`);
  console.log(`\nNext steps:`);
  console.log(`   1. Review generated validators in ${AGENTS_PATH}`);
  console.log(`   2. Integrate into sprint-planning-processor.js`);
  console.log(`   3. Run tests to verify functionality`);
}

// Run generator
generateStoryValidators();
