import{_ as a,C as s,c as o,o as r,ah as t,G as i}from"./chunks/framework.DLm7UoXr.js";const b=JSON.parse('{"title":"Sponsor Call Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/sponsor-call.md","filePath":"ceremonies/sponsor-call.md"}'),l={name:"ceremonies/sponsor-call.md"};function d(c,e,p,h,u,m){const n=s("SimpleMermaidWrapper");return r(),o("div",null,[e[0]||(e[0]=t(`<h1 id="sponsor-call-ceremony" tabindex="-1">Sponsor Call Ceremony <a class="header-anchor" href="#sponsor-call-ceremony" aria-label="Permalink to &quot;Sponsor Call Ceremony&quot;">​</a></h1><h2 id="overview" tabindex="-1">Overview <a class="header-anchor" href="#overview" aria-label="Permalink to &quot;Overview&quot;">​</a></h2><p>The <strong>Sponsor Call</strong> ceremony is the foundational ceremony in the Agile Vibe Coding framework. It creates your project&#39;s brief and root context scope.</p><p><strong>Input</strong></p><p>Project team defined mission, scope and technical requirements.</p><p><strong>Output</strong></p><div class="language- vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>.avc/project/</span></span>
<span class="line"><span>├── doc.md              # project documentation</span></span>
<span class="line"><span>└── context.md          # root context scope</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br></div></div><p><strong>Next Ceremony</strong></p><p><a href="./sprint-planning.html"><code>/sprint-planning</code></a> - Create Epics and Stories</p><h2 id="ceremony-workflow" tabindex="-1">Ceremony Workflow <a class="header-anchor" href="#ceremony-workflow" aria-label="Permalink to &quot;Ceremony Workflow&quot;">​</a></h2><p>The Sponsor Call ceremony follows a workflow that transforms user initial requirements into comprehensive project documentation (project brief) and a root context scope.</p>`,11)),i(n,{code:`sequenceDiagram
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
    REPL->>User: Show files created + token usage`,id:"mermaid-diagram-2"}),e[1]||(e[1]=t('<h3 id="project-scope-gathering" tabindex="-1">Project Scope Gathering <a class="header-anchor" href="#project-scope-gathering" aria-label="Permalink to &quot;Project Scope Gathering&quot;">​</a></h3><p>The ceremony begins by asking the project team to define:</p><ul><li>The <strong>mission statement</strong></li><li>The <strong>initial scope</strong></li><li>Any additional <strong>technical requirements</strong> or <strong>security constraints</strong></li></ul><blockquote><p><strong>Only the Mission Statement is mandatory.</strong><br> If any other question is skipped, AI agents will generate structured suggestions that can be reviewed and edited later.</p></blockquote><h4 id="scope-questionnaire" tabindex="-1">Scope Questionnaire <a class="header-anchor" href="#scope-questionnaire" aria-label="Permalink to &quot;Scope Questionnaire&quot;">​</a></h4><table tabindex="0"><thead><tr><th>#</th><th>Question</th><th>Purpose</th></tr></thead><tbody><tr><td>1</td><td><strong>Mission Statement</strong></td><td>Defines the core purpose and value proposition of the project</td></tr><tr><td>2</td><td>Target Users</td><td>Identifies user types and their roles</td></tr><tr><td>3</td><td>Initial Scope</td><td>Outlines key features, primary workflows, and essential capabilities</td></tr><tr><td>4</td><td>Deployment Target</td><td>Specifies the intended deployment environment and infrastructure</td></tr><tr><td>5</td><td>Technical Considerations</td><td>Captures technology stack preferences, constraints, or requirements</td></tr><tr><td>6</td><td>Security &amp; Compliance Requirements</td><td>Defines regulatory, privacy, and security obligations</td></tr></tbody></table><hr><h3 id="ceremony-agents" tabindex="-1">Ceremony Agents <a class="header-anchor" href="#ceremony-agents" aria-label="Permalink to &quot;Ceremony Agents&quot;">​</a></h3><h4 id="project-scope-agents" tabindex="-1">Project Scope Agents <a class="header-anchor" href="#project-scope-agents" aria-label="Permalink to &quot;Project Scope Agents&quot;">​</a></h4><p>If a question is skipped, specialized agents generate structured proposals that can later be refined by the team.</p><table tabindex="0"><thead><tr><th>Agent</th><th>Purpose</th></tr></thead><tbody><tr><td><a href="/agents/suggestion-ux-researcher.html">UX Researcher</a></td><td>Generates target user suggestions</td></tr><tr><td><a href="/agents/suggestion-product-manager.html">Product Manager</a></td><td>Proposes an initial feature scope</td></tr><tr><td><a href="/agents/suggestion-deployment-architect.html">Deployment Architect</a></td><td>Suggests deployment environments and infrastructure</td></tr><tr><td><a href="/agents/suggestion-technical-architect.html">Technical Architect</a></td><td>Recommends technology stack and architectural constraints</td></tr><tr><td><a href="/agents/suggestion-security-specialist.html">Security Specialist</a></td><td>Proposes security and compliance requirements</td></tr></tbody></table><hr><h3 id="documentation-context-generation" tabindex="-1">Documentation &amp; Context Generation <a class="header-anchor" href="#documentation-context-generation" aria-label="Permalink to &quot;Documentation &amp; Context Generation&quot;">​</a></h3><p>The collected answers are transformed into formal project artifacts using specialized AI agents.</p><h4 id="documentation-agents" tabindex="-1">Documentation Agents <a class="header-anchor" href="#documentation-agents" aria-label="Permalink to &quot;Documentation Agents&quot;">​</a></h4><table tabindex="0"><thead><tr><th>Agent</th><th>Purpose</th></tr></thead><tbody><tr><td><a href="/agents/project-documentation-creator.html">Documentation Creator</a></td><td>Converts questionnaire responses into a structured 8-section project document</td></tr><tr><td><a href="/agents/validator-documentation.html">Documentation Validator</a></td><td>Scores and validates documentation quality (0–100 scale)</td></tr></tbody></table><h4 id="context-agents" tabindex="-1">Context Agents <a class="header-anchor" href="#context-agents" aria-label="Permalink to &quot;Context Agents&quot;">​</a></h4><table tabindex="0"><thead><tr><th>Agent</th><th>Purpose</th></tr></thead><tbody><tr><td><a href="/agents/project-context-generator.html">Context Generator</a></td><td>Generates architectural context from questionnaire inputs</td></tr><tr><td><a href="/agents/validator-context.html">Context Validator</a></td><td>Scores and validates context quality (0–100 scale)</td></tr></tbody></table><h2 id="next-steps" tabindex="-1">Next Steps <a class="header-anchor" href="#next-steps" aria-label="Permalink to &quot;Next Steps&quot;">​</a></h2><p>After completing the Sponsor Call:</p><h3 id="review-generated-documents" tabindex="-1">Review Generated Documents <a class="header-anchor" href="#review-generated-documents" aria-label="Permalink to &quot;Review Generated Documents&quot;">​</a></h3><p><strong>Project Documentation</strong></p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/doc.md</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><blockquote><p>Run <code>/documentation</code> to view</p></blockquote><p><strong>Project Context</strong></p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/context.md</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><h3 id="proceed-to-next-ceremony" tabindex="-1">Proceed to Next Ceremony <a class="header-anchor" href="#proceed-to-next-ceremony" aria-label="Permalink to &quot;Proceed to Next Ceremony&quot;">​</a></h3><p><strong>Sprint Planning</strong> - Create Epics and Stories:</p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /sprint-planning</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><p>See <a href="./sprint-planning.html">Sprint Planning ceremony documentation</a></p><h2 id="troubleshooting" tabindex="-1">Troubleshooting <a class="header-anchor" href="#troubleshooting" aria-label="Permalink to &quot;Troubleshooting&quot;">​</a></h2><p>View detailed ceremony logs:</p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/logs/sponsor-call-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">.log</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><p>Logs include:</p><ul><li>Full questionnaire responses</li><li>LLM request/response details</li><li>File write operations</li><li>Error stack traces</li></ul>',35))])}const y=a(l,[["render",d]]);export{b as __pageData,y as default};
