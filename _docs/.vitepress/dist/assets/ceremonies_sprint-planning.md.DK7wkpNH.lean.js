import{_ as i,C as e,c as t,o as l,ah as n,G as p}from"./chunks/framework.DLm7UoXr.js";const m=JSON.parse('{"title":"Sprint Planning Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/sprint-planning.md","filePath":"ceremonies/sprint-planning.md"}'),r={name:"ceremonies/sprint-planning.md"};function o(c,s,h,d,k,u){const a=e("SimpleMermaidWrapper");return l(),t("div",null,[s[0]||(s[0]=n("",11)),p(a,{code:`sequenceDiagram
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

    Note over Proc: Stage 5: Multi-Agent Validation
    loop For each Epic
        Proc->>Decomp: Validate with 2-6 domain experts
        Decomp-->>Proc: Validation results (score, issues)
    end
    loop For each Story
        Proc->>Decomp: Validate with 3-8 domain experts
        Decomp-->>Proc: Validation results (score, issues)
    end

    Note over Proc: Stage 6: Renumber IDs
    Proc->>Proc: Assign context-XXXX IDs

    Note over Proc: Stage 7-8: Generate & Write
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

    Note over Proc: Stage 9: Track Tokens
    Proc->>Proc: Record token usage

    Proc->>User: Ceremony complete
    Proc->>User: Show summary + token usage`,id:"mermaid-diagram-2"}),s[1]||(s[1]=n("",71))])}const E=i(r,[["render",o]]);export{m as __pageData,E as default};
