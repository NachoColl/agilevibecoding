import{_ as a,C as s,c as i,o,ah as n,G as r}from"./chunks/framework.DLm7UoXr.js";const b=JSON.parse('{"title":"Sprint Planning Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/sprint-planning.md","filePath":"ceremonies/sprint-planning.md"}'),c={name:"ceremonies/sprint-planning.md"};function p(l,e,d,h,m,u){const t=s("SimpleMermaidWrapper");return o(),i("div",null,[e[0]||(e[0]=n("",11)),r(t,{code:`sequenceDiagram
    actor User
    participant REPL as AVC REPL
    participant Proc as Processor
    participant ProjFS as Project Files
    participant HierFS as Hierarchy
    participant Decomp as Decomposer
    participant CtxGen as Context Gen
    participant OutFS as File System

    User->>REPL: /sprint-planning
    REPL->>Proc: execute()

    Note over Proc: Stage 1: Validate
    Proc->>ProjFS: Check doc.md exists?
    Proc->>ProjFS: Check context.md exists?
    alt Missing files
        Proc-->>User: Run /sponsor-call first
    end

    Note over Proc: Stage 2: Read Existing
    Proc->>HierFS: Scan work.json files
    HierFS-->>Proc: Existing Epics/Stories + max IDs

    Note over Proc: Stage 3: Collect Scope
    Proc->>ProjFS: Read doc.md
    ProjFS-->>Proc: Initial Scope section
    Proc->>ProjFS: Read context.md
    ProjFS-->>Proc: Project context

    Note over Proc: Stage 4: Decompose
    Proc->>Decomp: Generate Epics/Stories
    Decomp-->>Proc: Hierarchy JSON

    Note over Proc: Stage 5: Renumber IDs
    Proc->>Proc: Assign context-XXXX IDs

    Note over Proc: Stage 6-7: Generate & Write
    loop For each Epic
        Proc->>CtxGen: Generate Epic context
        CtxGen-->>Proc: context.md
        Proc->>OutFS: Write Epic files
    end

    loop For each Story
        Proc->>CtxGen: Generate Story context
        CtxGen-->>Proc: context.md
        Proc->>OutFS: Write Story files
    end

    Note over Proc: Stage 8: Track Tokens
    Proc->>Proc: Record token usage

    Proc->>User: Ceremony complete
    Proc->>User: Show summary + token usage`,id:"mermaid-diagram-3"}),e[1]||(e[1]=n("",31))])}const k=a(c,[["render",p]]);export{b as __pageData,k as default};
