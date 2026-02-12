#!/usr/bin/env node

/**
 * Validator Generator Script
 *
 * Generates validator agent .md files and verification rule .json files
 * for all remaining domains based on established patterns.
 *
 * Usage: node src/cli/tools/generate-validators.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENTS_PATH = path.join(__dirname, '..', 'agents');

// Validator domain configurations
const VALIDATORS = {
  epic: [
    {
      name: 'database',
      title: 'Database Specialist',
      expertise: 'database design, data modeling, query optimization, and database administration',
      scope: {
        validate: [
          'Data model design and schema definitions',
          'Database performance and query optimization',
          'Data integrity and consistency requirements',
          'Backup, recovery, and disaster recovery strategies',
          'Database scalability (sharding, replication, partitioning)',
          'Migration and schema evolution strategies'
        ],
        categories: [
          'completeness - Missing tables/entities, unclear relationships',
          'clarity - Ambiguous data model, unclear database boundaries',
          'technical-depth - Insufficient normalization/denormalization strategy, missing indexes',
          'consistency - Conflicting data requirements or constraints',
          'best-practices - Violates database design principles (normalization, indexing)'
        ]
      },
      example: {
        name: 'User Data Storage',
        domain: 'data-processing',
        description: 'Store user data',
        features: ['user table', 'profile storage'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'Database epic missing schema definition and relationships',
            suggestion: 'Define complete schema: tables, columns, data types, primary keys, foreign keys, indexes.',
            example: 'Schema: users table (id PK, email unique, password_hash, created_at), profiles table (user_id FK, bio, avatar_url)'
          },
          {
            severity: 'major',
            category: 'technical-depth',
            description: 'No mention of database technology (SQL vs NoSQL) or specific database engine',
            suggestion: 'Specify database type (PostgreSQL, MySQL, MongoDB, DynamoDB) based on data access patterns.',
            example: 'Technology: PostgreSQL for relational user data with ACID guarantees'
          }
        ]
      }
    },
    {
      name: 'api',
      title: 'API Specialist',
      expertise: 'RESTful API design, GraphQL, API security, and API lifecycle management',
      scope: {
        validate: [
          'API endpoints and resource models',
          'Request/response formats and data contracts',
          'API authentication and authorization',
          'Rate limiting and throttling strategies',
          'API versioning and backward compatibility',
          'Error handling and status codes'
        ],
        categories: [
          'completeness - Missing endpoints, unclear API surface',
          'clarity - Ambiguous API contracts, unclear resource models',
          'technical-depth - Insufficient API design detail, missing error handling',
          'consistency - Conflicting API patterns or conventions',
          'best-practices - Violates REST/GraphQL principles, poor API design'
        ]
      },
      example: {
        name: 'User API',
        domain: 'api',
        description: 'Expose user management APIs',
        features: ['user endpoints', 'authentication'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'API epic missing endpoint specifications (methods, paths, parameters)',
            suggestion: 'Define all endpoints: GET /users, POST /users, GET /users/:id, PUT /users/:id, DELETE /users/:id',
            example: 'Endpoints: GET /users (list), POST /users (create), GET /users/:id (get), PUT /users/:id (update), DELETE /users/:id (delete)'
          },
          {
            severity: 'major',
            category: 'technical-depth',
            description: 'No mention of API authentication mechanism',
            suggestion: 'Specify authentication: JWT bearer tokens, API keys, OAuth 2.0, session cookies.',
            example: 'Authentication: JWT bearer tokens in Authorization header, 1-hour expiry, refresh token support'
          }
        ]
      }
    },
    {
      name: 'cloud',
      title: 'Cloud Specialist',
      expertise: 'cloud architecture, AWS/Azure/GCP services, cloud cost optimization, and cloud security',
      scope: {
        validate: [
          'Cloud service selection and architecture',
          'Multi-region and high availability strategies',
          'Cloud cost optimization and resource sizing',
          'Cloud security and compliance (IAM, encryption)',
          'Serverless vs container vs VM trade-offs',
          'Cloud-native patterns and services'
        ],
        categories: [
          'completeness - Missing cloud services, unclear cloud architecture',
          'clarity - Ambiguous cloud terminology, unclear service boundaries',
          'technical-depth - Insufficient HA/DR strategy, missing cost considerations',
          'consistency - Conflicting cloud approaches or providers',
          'best-practices - Violates cloud best practices (well-architected framework)'
        ]
      },
      example: {
        name: 'Cloud Infrastructure',
        domain: 'infrastructure',
        description: 'Set up cloud infrastructure',
        features: ['compute', 'storage'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'Cloud epic missing specific service selections (EC2 vs Lambda, S3 vs EBS)',
            suggestion: 'Specify cloud services: compute (EC2, Lambda, ECS), storage (S3, EBS, EFS), networking (VPC, ALB).',
            example: 'Services: ECS Fargate for containers, S3 for object storage, RDS PostgreSQL for database, CloudFront CDN'
          },
          {
            severity: 'major',
            category: 'technical-depth',
            description: 'No mention of high availability or multi-AZ deployment',
            suggestion: 'Define HA strategy: multi-AZ deployment, auto-scaling, health checks, failover.',
            example: 'HA: Deploy across 3 AZs, auto-scaling group (min 2, max 10), ALB health checks, RDS Multi-AZ'
          }
        ]
      }
    },
    {
      name: 'qa',
      title: 'QA Engineer',
      expertise: 'quality assurance, test planning, defect management, and quality metrics',
      scope: {
        validate: [
          'Testing strategy and test coverage requirements',
          'Quality gates and acceptance criteria',
          'Defect management and bug triage processes',
          'Test automation and manual testing balance',
          'Performance and load testing requirements',
          'Quality metrics and success criteria'
        ],
        categories: [
          'completeness - Missing test scenarios, unclear quality criteria',
          'clarity - Ambiguous acceptance criteria, unclear test scope',
          'technical-depth - Insufficient test coverage, missing edge cases',
          'consistency - Conflicting quality requirements',
          'best-practices - Violates testing best practices (test pyramid, shift-left)'
        ]
      },
      example: {
        name: 'User Authentication',
        domain: 'user-management',
        description: 'Implement authentication',
        features: ['login', 'logout'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'Epic missing testability requirements and quality gates',
            suggestion: 'Define quality gates: unit test coverage (>80%), integration tests for all flows, security tests.',
            example: 'Quality Gates: 80% unit coverage, 100% integration coverage for auth flows, OWASP ZAP security scan, load test (1000 concurrent logins)'
          }
        ]
      }
    },
    {
      name: 'test-architect',
      title: 'Test Architect',
      expertise: 'test architecture, automation frameworks, test infrastructure, and testing patterns',
      scope: {
        validate: [
          'Test architecture and framework selection',
          'Test data management strategies',
          'Test environment and infrastructure needs',
          'Test automation patterns and anti-patterns',
          'Integration with CI/CD pipelines',
          'Test maintainability and scalability'
        ],
        categories: [
          'completeness - Missing test infrastructure, unclear test architecture',
          'clarity - Ambiguous test strategy, unclear automation scope',
          'technical-depth - Insufficient test framework design, missing CI/CD integration',
          'consistency - Conflicting test approaches',
          'best-practices - Violates test architecture principles (DRY, test pyramid, BDD)'
        ]
      },
      example: {
        name: 'E-commerce Checkout',
        domain: 'frontend',
        description: 'Build checkout flow',
        features: ['cart', 'payment', 'order confirmation'],
        issues: [
          {
            severity: 'major',
            category: 'technical-depth',
            description: 'Epic missing test automation framework and CI/CD integration',
            suggestion: 'Specify test framework: Jest for unit, Cypress for e2e, run tests in CI before merge.',
            example: 'Testing: Jest (unit), React Testing Library (component), Cypress (e2e), run in GitHub Actions on PR'
          }
        ]
      }
    },
    {
      name: 'ux',
      title: 'UX Designer',
      expertise: 'user experience design, user research, interaction design, and usability testing',
      scope: {
        validate: [
          'User flows and journey maps',
          'Usability and accessibility requirements',
          'User research and validation needs',
          'Information architecture and navigation',
          'User feedback and iteration strategies',
          'UX metrics and success criteria'
        ],
        categories: [
          'completeness - Missing user flows, unclear UX requirements',
          'clarity - Ambiguous user experience, unclear user goals',
          'technical-depth - Insufficient user research, missing usability testing',
          'consistency - Conflicting UX patterns',
          'best-practices - Violates UX principles (cognitive load, user control, consistency)'
        ]
      },
      example: {
        name: 'User Dashboard',
        domain: 'frontend',
        description: 'Build dashboard',
        features: ['widgets', 'charts'],
        issues: [
          {
            severity: 'major',
            category: 'completeness',
            description: 'Epic missing user flows and task analysis',
            suggestion: 'Define primary user tasks and flows: what users need to accomplish, key actions, success paths.',
            example: 'User Flows: (1) View key metrics at a glance, (2) Drill into specific metric details, (3) Customize dashboard layout'
          }
        ]
      }
    },
    {
      name: 'ui',
      title: 'UI Designer',
      expertise: 'user interface design, visual design, design systems, and UI component libraries',
      scope: {
        validate: [
          'Visual design and branding consistency',
          'UI component specifications',
          'Design system and component library',
          'Responsive design and breakpoints',
          'Accessibility (color contrast, typography, spacing)',
          'UI patterns and conventions'
        ],
        categories: [
          'completeness - Missing UI specifications, unclear component library',
          'clarity - Ambiguous visual design, unclear UI patterns',
          'technical-depth - Insufficient responsive design, missing accessibility specs',
          'consistency - Conflicting UI styles or components',
          'best-practices - Violates UI design principles (visual hierarchy, contrast, spacing)'
        ]
      },
      example: {
        name: 'Admin Panel',
        domain: 'frontend',
        description: 'Build admin interface',
        features: ['tables', 'forms'],
        issues: [
          {
            severity: 'major',
            category: 'completeness',
            description: 'Epic missing UI design system and component specifications',
            suggestion: 'Define design system: color palette, typography scale, spacing system, component library (tables, forms, buttons).',
            example: 'Design System: Material-UI component library, 8px spacing grid, primary color #1976d2, Roboto font family'
          }
        ]
      }
    },
    {
      name: 'mobile',
      title: 'Mobile Developer',
      expertise: 'iOS and Android development, mobile app architecture, and mobile UX patterns',
      scope: {
        validate: [
          'Mobile platform support (iOS, Android, cross-platform)',
          'Mobile-specific UX patterns and gestures',
          'Offline support and data synchronization',
          'Mobile performance and battery optimization',
          'Push notifications and background tasks',
          'App store deployment and distribution'
        ],
        categories: [
          'completeness - Missing mobile features, unclear platform support',
          'clarity - Ambiguous mobile requirements, unclear offline behavior',
          'technical-depth - Insufficient mobile architecture, missing performance optimization',
          'consistency - Conflicting mobile patterns',
          'best-practices - Violates mobile best practices (native patterns, offline-first)'
        ]
      },
      example: {
        name: 'Mobile App',
        domain: 'mobile',
        description: 'Build mobile application',
        features: ['user interface', 'data sync'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'Mobile epic missing platform specification (iOS, Android, React Native, Flutter)',
            suggestion: 'Specify mobile approach: native iOS + Android, React Native, Flutter, or PWA.',
            example: 'Platform: React Native for iOS and Android, share 90% codebase, native modules for camera/payments'
          }
        ]
      }
    },
    {
      name: 'backend',
      title: 'Backend Developer',
      expertise: 'server-side development, microservices, database integration, and API implementation',
      scope: {
        validate: [
          'Backend architecture and service design',
          'Database integration and ORM strategy',
          'Background jobs and async processing',
          'Caching and performance optimization',
          'Error handling and logging',
          'Service-to-service communication'
        ],
        categories: [
          'completeness - Missing backend services, unclear service boundaries',
          'clarity - Ambiguous backend logic, unclear data flows',
          'technical-depth - Insufficient architecture detail, missing error handling',
          'consistency - Conflicting backend patterns',
          'best-practices - Violates backend principles (separation of concerns, SOLID)'
        ]
      },
      example: {
        name: 'Order Processing',
        domain: 'api',
        description: 'Process customer orders',
        features: ['order creation', 'order status'],
        issues: [
          {
            severity: 'critical',
            category: 'technical-depth',
            description: 'Backend epic missing async processing strategy for order workflows',
            suggestion: 'Define async processing: background jobs for payment, inventory, notifications. Specify queue technology.',
            example: 'Async Processing: Bull queue with Redis, background jobs for payment processing, inventory updates, email notifications'
          }
        ]
      }
    },
    {
      name: 'data',
      title: 'Data Engineer',
      expertise: 'data pipelines, ETL processes, data warehousing, and big data technologies',
      scope: {
        validate: [
          'Data pipeline architecture and orchestration',
          'Data ingestion and extraction strategies',
          'Data transformation and quality checks',
          'Data storage and warehousing solutions',
          'Data governance and lineage tracking',
          'Data processing scalability (batch vs streaming)'
        ],
        categories: [
          'completeness - Missing data pipeline stages, unclear data flows',
          'clarity - Ambiguous data transformations, unclear data sources',
          'technical-depth - Insufficient data quality checks, missing scalability',
          'consistency - Conflicting data models or formats',
          'best-practices - Violates data engineering principles (idempotency, schema evolution)'
        ]
      },
      example: {
        name: 'Analytics Pipeline',
        domain: 'data-processing',
        description: 'Build analytics data pipeline',
        features: ['data ingestion', 'reporting'],
        issues: [
          {
            severity: 'critical',
            category: 'completeness',
            description: 'Data epic missing ETL pipeline stages and orchestration',
            suggestion: 'Define complete ETL: data sources, extraction schedule, transformations, loading to warehouse, orchestration tool.',
            example: 'ETL: Extract from PostgreSQL/S3 (hourly), transform with dbt, load to Snowflake, orchestrate with Airflow'
          }
        ]
      }
    }
  ],
  story: [
    // Story validators follow same pattern but focus on implementation details
  ]
};

/**
 * Generate epic validator markdown file
 */
function generateEpicValidatorMd(domain, config) {
  return `# Epic Validator - ${config.title}

## Role
You are an expert ${config.title.toLowerCase()} with 15+ years of experience in ${config.expertise}. Your role is to validate Epic definitions for ${domain}-specific completeness, technical soundness, and best practices.

## Validation Scope

**What to Validate:**
${config.scope.validate.map(item => `- ${item}`).join('\n')}

**What NOT to Validate:**
- Detailed implementation steps (that's for Stories/Tasks)
- Technology-specific choices (unless critical)
- Timeline or resource estimates

## Validation Checklist

### Completeness (40 points)
- [ ] Epic scope clearly defines ${domain} boundaries
- [ ] All critical ${domain} features are identified
- [ ] Dependencies on ${domain} services/infrastructure are explicit
- [ ] ${domain} success criteria are measurable

### Clarity (20 points)
- [ ] ${domain} terminology is used correctly
- [ ] Epic description is understandable to non-${domain} team members
- [ ] Features are described in business value terms

### Technical Depth (20 points)
- [ ] ${domain} architectural patterns are considered
- [ ] Performance/scalability concerns for ${domain} are addressed
- [ ] Quality considerations for ${domain} are identified

### Consistency (10 points)
- [ ] ${domain} approach aligns with project context
- [ ] Features don't overlap or conflict

### Best Practices (10 points)
- [ ] Industry-standard ${domain} patterns are followed
- [ ] ${domain} anti-patterns are avoided

## Issue Categories

Use these categories when reporting issues:

${config.scope.categories.map(cat => `- \`${cat}\``).join('\n')}

## Issue Severity Levels

- \`critical\` - Epic cannot proceed (blocking ${domain} issue)
- \`major\` - Significant ${domain} gap (should fix before Stories)
- \`minor\` - Enhancement opportunity (can fix later)

## Output Format

Return JSON with this exact structure:

\`\`\`json
{
  "validationStatus": "needs-improvement|acceptable|excellent",
  "overallScore": 0-100,
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "completeness|clarity|technical-depth|consistency|best-practices",
      "description": "Clear description of the ${domain} issue",
      "suggestion": "Specific actionable fix",
      "example": "Optional example of how to fix"
    }
  ],
  "strengths": ["What the Epic does well from ${domain} perspective"],
  "improvementPriorities": ["Top 3 ${domain} improvements ranked by impact"],
  "readyForStories": boolean,
  "domainSpecificNotes": "Any additional ${domain} context or warnings"
}
\`\`\`

## Scoring Guidelines

- **90-100 (Excellent)**: Comprehensive ${domain} coverage, clear boundaries, all best practices
- **70-89 (Acceptable)**: Core ${domain} concerns addressed, minor gaps acceptable
- **0-69 (Needs Improvement)**: Critical ${domain} gaps, must fix before proceeding

## Example Validation

**Epic:**
\`\`\`
Name: ${config.example.name}
Domain: ${config.example.domain}
Description: ${config.example.description}
Features: ${JSON.stringify(config.example.features)}
\`\`\`

**Validation Output:**
\`\`\`json
{
  "validationStatus": "needs-improvement",
  "overallScore": 65,
  "issues": ${JSON.stringify(config.example.issues, null, 2)},
  "strengths": [
    "Core ${domain} features identified"
  ],
  "improvementPriorities": [
    "1. Address critical ${domain} gaps identified above",
    "2. Add comprehensive ${domain} specifications",
    "3. Define ${domain} success criteria"
  ],
  "readyForStories": false,
  "domainSpecificNotes": "Consider additional ${domain} requirements based on project context"
}
\`\`\`
`;
}

/**
 * Generate verification rules JSON
 */
function generateVerificationJson(domain, type) {
  return {
    agentName: `validator-${type}-${domain}`,
    version: '1.0.0',
    description: `Verification rules for ${domain} ${type} validator`,
    requiredFields: [
      'validationStatus',
      'overallScore',
      'issues',
      'strengths',
      'improvementPriorities',
      'readyForStories',
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
            allowedValues: ['completeness', 'clarity', 'technical-depth', 'consistency', 'best-practices']
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
      readyForStories: {
        type: 'boolean'
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
        rule: 'ready_for_stories_alignment',
        description: 'readyForStories should be false if validationStatus is \'needs-improvement\'',
        check: 'if validationStatus is \'needs-improvement\', readyForStories must be false'
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
function generateValidators() {
  console.log('Generating validator files...\n');

  // Check which validators already exist
  const existingEpicValidators = [
    'security', 'devops', 'frontend', 'solution-architect', 'developer'
  ];

  let created = 0;
  let skipped = 0;

  // Generate epic validators
  VALIDATORS.epic.forEach(config => {
    const mdFilename = `validator-epic-${config.name}.md`;
    const jsonFilename = `validator-epic-${config.name}.json`;

    if (existingEpicValidators.includes(config.name)) {
      console.log(`⏭️  Skipping ${mdFilename} (already exists)`);
      skipped += 2;
      return;
    }

    // Generate .md file
    const mdPath = path.join(AGENTS_PATH, mdFilename);
    const mdContent = generateEpicValidatorMd(config.name, config);
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`✅ Created ${mdFilename}`);
    created++;

    // Generate .json file
    const jsonPath = path.join(AGENTS_PATH, jsonFilename);
    const jsonContent = JSON.stringify(generateVerificationJson(config.name, 'epic'), null, 2);
    fs.writeFileSync(jsonPath, jsonContent, 'utf8');
    console.log(`✅ Created ${jsonFilename}`);
    created++;
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created} files`);
  console.log(`   Skipped: ${skipped} files (already exist)`);
  console.log(`\nNext steps:`);
  console.log(`   1. Review generated validators in ${AGENTS_PATH}`);
  console.log(`   2. Customize domain-specific examples and notes`);
  console.log(`   3. Run story validator generation (coming next)`);
}

// Run generator
generateValidators();
