import{_ as a,C as s,c as o,o as r,ah as t,G as i}from"./chunks/framework.DLm7UoXr.js";const b=JSON.parse('{"title":"Sponsor Call Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/sponsor-call.md","filePath":"ceremonies/sponsor-call.md"}'),l={name:"ceremonies/sponsor-call.md"};function d(c,e,p,h,u,m){const n=s("SimpleMermaidWrapper");return r(),o("div",null,[e[0]||(e[0]=t("",11)),i(n,{code:`sequenceDiagram
    actor User
    participant REPL as AVC REPL
    participant QA as Questionnaire
    participant Agent as AI Agents
    participant Doc as Doc Generator
    participant Val as Validator
    participant Ctx as Context Generator
    participant FS as File System

    User->>REPL: /sponsor-call
    REPL->>QA: Start questionnaire

    loop 6 Questions
        QA->>User: Present question
        alt User provides answer
            User->>QA: Type answer
        else User skips (Enter on empty)
            QA->>Agent: Request suggestion
            Agent->>QA: Generated suggestion
        end
        QA->>QA: Auto-save progress
    end

    QA->>REPL: Collect all answers
    REPL->>REPL: Replace template variables

    REPL->>Doc: Generate documentation
    Doc->>Agent: Call LLM with template + agent instructions
    Agent-->>Doc: 8-section project document

    opt Validation enabled
        loop Until score >= 75 OR maxIterations (2)
            Doc->>Val: Validate document
            Val-->>Doc: Score + issues
            alt Score < threshold
                Doc->>Agent: Improve document
                Agent-->>Doc: Enhanced version
            end
        end
    end

    Doc->>REPL: Return doc.md

    REPL->>Ctx: Generate context
    Ctx->>Agent: Call LLM with answers + agent instructions
    Agent-->>Ctx: Architectural context

    opt Validation enabled
        loop Until score >= 75 OR maxIterations (2)
            Ctx->>Val: Validate context
            Val-->>Ctx: Score + issues
            alt Score < threshold
                Ctx->>Agent: Improve context
                Agent-->>Ctx: Enhanced version
            end
        end
    end

    Ctx->>REPL: Return context.md

    REPL->>FS: Write .avc/project/doc.md
    REPL->>FS: Write .avc/project/context.md
    REPL->>FS: Copy to .avc/documentation/index.md

    REPL->>User: ✅ Ceremony complete
    REPL->>User: Show files created + token usage`,id:"mermaid-diagram-2"}),e[1]||(e[1]=t("",35))])}const y=a(l,[["render",d]]);export{b as __pageData,y as default};
