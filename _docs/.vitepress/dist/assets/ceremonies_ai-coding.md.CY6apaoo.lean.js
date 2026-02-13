import{_ as a,C as n,c as s,o as r,ah as t,G as o}from"./chunks/framework.DLm7UoXr.js";const b=JSON.parse('{"title":"AI Coding Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/ai-coding.md","filePath":"ceremonies/ai-coding.md"}'),l={name:"ceremonies/ai-coding.md"};function c(p,e,d,u,m,h){const i=n("SimpleMermaidWrapper");return r(),s("div",null,[e[0]||(e[0]=t("",8)),o(i,{code:`graph LR
    A[Select Pending Work] --> B[AI Coding]
    B --> C[Run Tests]
    C --> D{Tests Pass?}
    D -->|No| B
    D -->|Yes| E[Human Review]
    E --> F{Approved?}
    F -->|No| B
    F -->|Yes| G[Mark Done]
    G --> A`,id:"mermaid-diagram-0"}),e[1]||(e[1]=t("",56))])}const k=a(l,[["render",c]]);export{b as __pageData,k as default};
