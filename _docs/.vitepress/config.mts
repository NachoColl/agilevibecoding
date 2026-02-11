import { defineConfig } from 'vitepress'

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
          { text: 'Contributing', link: '/contribute' },
        ]
      },
      {
        text: 'Agents',
        items: [
          {
            text: 'Documentation',
            collapsed: false,
            items: [
              { text: 'Creator', link: '/agents/project-documentation-creator' },
              { text: 'Updater', link: '/agents/documentation-updater' }
            ]
          },
          {
            text: 'Decomposition',
            collapsed: false,
            items: [
              { text: 'Epic/Story', link: '/agents/epic-story-decomposer' },
              { text: 'Task/Subtask', link: '/agents/task-subtask-decomposer' }
            ]
          },
          {
            text: 'Context Management',
            collapsed: false,
            items: [
              { text: 'Project', link: '/agents/project-context-generator' },
              { text: 'Feature', link: '/agents/feature-context-generator' },
              { text: 'Refiner', link: '/agents/context-refiner' }
            ]
          },
          {
            text: 'Domain Suggestions',
            collapsed: false,
            items: [
              { text: 'Business Analyst', link: '/agents/suggestion-business-analyst' },
              { text: 'UX Researcher', link: '/agents/suggestion-ux-researcher' },
              { text: 'Product Manager', link: '/agents/suggestion-product-manager' },
              { text: 'Technical Architect', link: '/agents/suggestion-technical-architect' },
              { text: 'Security Specialist', link: '/agents/suggestion-security-specialist' }
            ]
          }
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
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  }
})
