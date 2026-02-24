import { defineConfig } from 'vitepress'
import { mermaidPlugin } from './theme/mermaid-plugin'

// Agile Vibe Coding Documentation Configuration
export default defineConfig({
  title: 'Agile Vibe Coding',
  description: 'AI-agent framework for long-running software development projects',
  base: '/',
  ignoreDeadLinks: true,

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Install', link: '/install' },
      { text: 'Commands', link: '/commands' },
      { text: 'Contribute', link: '/contribute' },
      { text: 'GitHub', link: 'https://github.com/NachoColl/agilevibecoding' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/' },
        ]
      },
      {
        text: 'Ceremonies',
        items: [
          { text: 'Sponsor Call', link: '/ceremonies/sponsor-call' },
          { text: 'Sprint Planning', link: '/ceremonies/sprint-planning' },
          { text: 'Seed', link: '/ceremonies/seed' },
          { text: 'AI Coding', link: '/ceremonies/ai-coding' },
          { text: 'Context Retrospective', link: '/ceremonies/context-retrospective' },
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Install', link: '/install' },
          { text: 'CLI Commands', link: '/commands' },
          { text: 'AVC Default LLMs', link: '/avc-default-llms' },
          { text: 'Contributing', link: '/contribute' },
        ]
      },
      {
        text: 'Agents',
        items: [
          {
            text: 'Mission & Scope',
            collapsed: false,
            items: [
              { text: 'Mission Generator',  link: '/agents/mission-scope-generator' },
              { text: 'Mission Validator',  link: '/agents/mission-scope-validator' },
            ]
          },
          {
            text: 'Documentation',
            collapsed: false,
            items: [
              { text: 'Creator', link: '/agents/project-documentation-creator' },
              { text: 'Updater', link: '/agents/documentation-updater' },
            ]
          },
          {
            text: 'Context Management',
            collapsed: false,
            items: [
              { text: 'Project Context',  link: '/agents/project-context-generator' },
              { text: 'Feature Context',  link: '/agents/feature-context-generator' },
              { text: 'Context Refiner',  link: '/agents/context-refiner' },
            ]
          },
          {
            text: 'Decomposition',
            collapsed: false,
            items: [
              { text: 'Epic / Story',    link: '/agents/epic-story-decomposer' },
              { text: 'Task / Subtask',  link: '/agents/task-subtask-decomposer' },
            ]
          },
          {
            text: 'Architecture & Database',
            collapsed: false,
            items: [
              { text: 'Architecture',       link: '/agents/architecture-recommender' },
              { text: 'Database',           link: '/agents/database-recommender' },
              { text: 'Database Deep Dive', link: '/agents/database-deep-dive' },
            ]
          },
          {
            text: 'Questionnaire',
            collapsed: false,
            items: [
              { text: 'Question Prefiller', link: '/agents/question-prefiller' },
            ]
          },
          {
            text: 'Domain Suggestions',
            collapsed: false,
            items: [
              { text: 'Product Manager',       link: '/agents/suggestion-product-manager' },
              { text: 'UX Researcher',         link: '/agents/suggestion-ux-researcher' },
              { text: 'Deployment Architect',  link: '/agents/suggestion-deployment-architect' },
              { text: 'Technical Architect',   link: '/agents/suggestion-technical-architect' },
              { text: 'Security Specialist',   link: '/agents/suggestion-security-specialist' },
              { text: 'Business Analyst',      link: '/agents/suggestion-business-analyst' },
            ]
          },
          {
            text: 'Validation',
            collapsed: false,
            items: [
              { text: 'Documentation Validator', link: '/agents/validator-documentation' },
              { text: 'Context Validator',       link: '/agents/validator-context' },
              { text: 'Validator Selector',      link: '/agents/validator-selector' },
            ]
          },
          {
            text: 'Cross-Validation',
            collapsed: false,
            items: [
              { text: 'Doc → Context', link: '/agents/cross-validator-doc-to-context' },
              { text: 'Context → Doc', link: '/agents/cross-validator-context-to-doc' },
            ]
          },
          {
            text: 'Epic Validators',
            collapsed: true,
            items: [
              { text: 'API',               link: '/agents/validator-epic-api' },
              { text: 'Backend',           link: '/agents/validator-epic-backend' },
              { text: 'Cloud',             link: '/agents/validator-epic-cloud' },
              { text: 'Data',              link: '/agents/validator-epic-data' },
              { text: 'Database',          link: '/agents/validator-epic-database' },
              { text: 'Developer',         link: '/agents/validator-epic-developer' },
              { text: 'DevOps',            link: '/agents/validator-epic-devops' },
              { text: 'Frontend',          link: '/agents/validator-epic-frontend' },
              { text: 'Mobile',            link: '/agents/validator-epic-mobile' },
              { text: 'QA',               link: '/agents/validator-epic-qa' },
              { text: 'Security',          link: '/agents/validator-epic-security' },
              { text: 'Solution Architect',link: '/agents/validator-epic-solution-architect' },
              { text: 'Test Architect',    link: '/agents/validator-epic-test-architect' },
              { text: 'UI',               link: '/agents/validator-epic-ui' },
              { text: 'UX',               link: '/agents/validator-epic-ux' },
            ]
          },
          {
            text: 'Story Validators',
            collapsed: true,
            items: [
              { text: 'API',               link: '/agents/validator-story-api' },
              { text: 'Backend',           link: '/agents/validator-story-backend' },
              { text: 'Cloud',             link: '/agents/validator-story-cloud' },
              { text: 'Data',              link: '/agents/validator-story-data' },
              { text: 'Database',          link: '/agents/validator-story-database' },
              { text: 'Developer',         link: '/agents/validator-story-developer' },
              { text: 'DevOps',            link: '/agents/validator-story-devops' },
              { text: 'Frontend',          link: '/agents/validator-story-frontend' },
              { text: 'Mobile',            link: '/agents/validator-story-mobile' },
              { text: 'QA',               link: '/agents/validator-story-qa' },
              { text: 'Security',          link: '/agents/validator-story-security' },
              { text: 'Solution Architect',link: '/agents/validator-story-solution-architect' },
              { text: 'Test Architect',    link: '/agents/validator-story-test-architect' },
              { text: 'UI',               link: '/agents/validator-story-ui' },
              { text: 'UX',               link: '/agents/validator-story-ux' },
            ]
          },
          {
            text: 'Other',
            collapsed: false,
            items: [
              { text: 'Migration Guide', link: '/agents/migration-guide-generator' },
            ]
          },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/NachoColl/agilevibecoding' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Nacho Coll'
    },

    search: {
      provider: 'local'
    },

    // Enable automatic outline (TOC) in the right sidebar
    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  },

  markdown: {
    config: (md) => {
      md.use(mermaidPlugin)
    },
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  }
})
