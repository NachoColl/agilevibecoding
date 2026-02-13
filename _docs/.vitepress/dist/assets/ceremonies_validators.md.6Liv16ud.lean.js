import{_ as n,C as e,c as t,o as l,ah as a,G as o}from"./chunks/framework.DLm7UoXr.js";const m=JSON.parse('{"title":"Validator Agents","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/validators.md","filePath":"ceremonies/validators.md"}'),r={name:"ceremonies/validators.md"};function p(c,s,d,h,u,k){const i=e("SimpleMermaidWrapper");return l(),t("div",null,[s[0]||(s[0]=a("",7)),o(i,{code:`graph LR
  A[Generate] --> B[Validate]
  B --> C{Issues?}
  C -->|Yes| D[Improve]
  D --> E{Max Iter?}
  E -->|No| B
  E -->|Yes| F[Accept]
  C -->|No| F[Accept]

  style A fill:#e1f5ff
  style B fill:#fff4e1
  style D fill:#ffebee
  style F fill:#e8f5e9`,id:"mermaid-diagram-3"}),s[1]||(s[1]=a("",70))])}const b=n(r,[["render",p]]);export{m as __pageData,b as default};
