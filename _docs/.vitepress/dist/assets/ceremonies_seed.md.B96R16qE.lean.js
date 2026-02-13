import{_ as e,C as t,c as i,o as l,ah as a,G as r}from"./chunks/framework.DLm7UoXr.js";const g=JSON.parse('{"title":"Seed Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/seed.md","filePath":"ceremonies/seed.md"}'),o={name:"ceremonies/seed.md"};function p(c,s,d,u,h,k){const n=t("SimpleMermaidWrapper");return l(),i("div",null,[s[0]||(s[0]=a("",10)),r(n,{code:`graph LR
    A[1. Validate Story ID] --> B[2. Check No Tasks]
    B --> C[3. Read Contexts]
    C --> D[4. Decompose Story]
    D --> E[5. Validate Structure]
    E --> F[6. Generate Task Contexts]
    F --> G[7. Generate Subtask Contexts]
    G --> H[8. Write Files]
    H --> I[9. Update Story]

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style F fill:#fff4e1
    style G fill:#fff4e1`,id:"mermaid-diagram-0"}),s[1]||(s[1]=a("",125))])}const m=e(o,[["render",p]]);export{g as __pageData,m as default};
