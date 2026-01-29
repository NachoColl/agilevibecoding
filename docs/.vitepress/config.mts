import { defineConfig } from 'vitepress'
import { configureDiagramsPlugin } from 'vitepress-plugin-diagrams'

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
        text: 'Reference',
        items: [
          { text: 'Install', link: '/install' },
          { text: 'CLI Commands', link: '/commands' },
          { text: 'Contributing', link: '/contribute' },
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
    lineNumbers: true,
    config: (md) => {
      configureDiagramsPlugin(md, {
        diagramsDir: 'docs/public/diagrams',
        publicPath: '/diagrams',
        krokiServerUrl: 'https://kroki.io'
      })
    }
  }
})
