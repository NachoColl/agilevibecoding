import{_ as a,C as s,c as i,o,ah as n,G as r}from"./chunks/framework.DLm7UoXr.js";const b=JSON.parse('{"title":"Sprint Planning Ceremony","description":"","frontmatter":{},"headers":[],"relativePath":"ceremonies/sprint-planning.md","filePath":"ceremonies/sprint-planning.md"}'),c={name:"ceremonies/sprint-planning.md"};function p(l,e,d,h,m,u){const t=s("SimpleMermaidWrapper");return o(),i("div",null,[e[0]||(e[0]=n(`<h1 id="sprint-planning-ceremony" tabindex="-1">Sprint Planning Ceremony <a class="header-anchor" href="#sprint-planning-ceremony" aria-label="Permalink to &quot;Sprint Planning Ceremony&quot;">​</a></h1><h2 id="overview" tabindex="-1">Overview <a class="header-anchor" href="#overview" aria-label="Permalink to &quot;Overview&quot;">​</a></h2><p>The <strong>Sprint Planning</strong> ceremony decomposes your project scope into domain-based Epics and Stories with intelligent duplicate detection.</p><p><strong>Input</strong></p><ul><li>Project documentation (.avc/project/project/doc.md)</li><li>Project context (.avc/project/project/context.md)</li><li>Existing Epics/Stories (optional)</li></ul><p><strong>Output</strong></p><div class="language- vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>.avc/project/</span></span>
<span class="line"><span>├── context-0001/              # Epic</span></span>
<span class="line"><span>│   ├── doc.md                 # Epic documentation stub</span></span>
<span class="line"><span>│   ├── context.md             # Epic context (~800 tokens)</span></span>
<span class="line"><span>│   └── work.json              # Epic metadata</span></span>
<span class="line"><span>└── context-0001-0001/         # Story</span></span>
<span class="line"><span>    ├── doc.md                 # Story documentation stub</span></span>
<span class="line"><span>    ├── context.md             # Story context (~1500 tokens)</span></span>
<span class="line"><span>    └── work.json              # Story metadata</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br></div></div><p><strong>Next Ceremony</strong></p><p><a href="./seed.html"><code>/seed &lt;story-id&gt;</code></a> - Decompose Stories into Tasks and Subtasks</p><h2 id="ceremony-workflow" tabindex="-1">Ceremony Workflow <a class="header-anchor" href="#ceremony-workflow" aria-label="Permalink to &quot;Ceremony Workflow&quot;">​</a></h2><p>The Sprint Planning ceremony reads your Initial Scope and project context, then uses AI agents to decompose it into Epics (3-7 domain groupings) and Stories (2-8 deliverable capabilities per Epic) with automatic duplicate detection.</p>`,11)),r(t,{code:`sequenceDiagram
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
    Proc->>User: Show summary + token usage`,id:"mermaid-diagram-3"}),e[1]||(e[1]=n(`<h3 id="scope-decomposition" tabindex="-1">Scope Decomposition <a class="header-anchor" href="#scope-decomposition" aria-label="Permalink to &quot;Scope Decomposition&quot;">​</a></h3><p>The ceremony reads the Initial Scope from your project documentation and decomposes it into domain-based Epics and Stories.</p><p><strong>Prerequisite Validation</strong></p><p>Before decomposition, the ceremony verifies:</p><ul><li>Project documentation exists (<code>.avc/project/project/doc.md</code>)</li><li>Project context exists (<code>.avc/project/project/context.md</code>)</li><li>Initial Scope section is present in documentation</li></ul><p><strong>Duplicate Detection</strong></p><p>The ceremony automatically:</p><ul><li>Scans existing Epic/Story work items</li><li>Builds case-insensitive name maps</li><li>Passes existing names to AI agents to prevent duplicates</li><li>Renumbers IDs to avoid collisions</li></ul><hr><h3 id="ceremony-agents" tabindex="-1">Ceremony Agents <a class="header-anchor" href="#ceremony-agents" aria-label="Permalink to &quot;Ceremony Agents&quot;">​</a></h3><h4 id="decomposition-agent" tabindex="-1">Decomposition Agent <a class="header-anchor" href="#decomposition-agent" aria-label="Permalink to &quot;Decomposition Agent&quot;">​</a></h4><p>The Initial Scope is decomposed into a hierarchical structure using AI-powered domain analysis.</p><table tabindex="0"><thead><tr><th>Agent</th><th>Purpose</th></tr></thead><tbody><tr><td><a href="/agents/epic-story-decomposer.html">Epic/Story Decomposer</a></td><td>Analyzes project scope and generates 3–7 domain-based Epics, each containing 2–8 Stories with duplicate detection</td></tr></tbody></table><h4 id="context-generation-agents" tabindex="-1">Context Generation Agents <a class="header-anchor" href="#context-generation-agents" aria-label="Permalink to &quot;Context Generation Agents&quot;">​</a></h4><p>Each Epic and Story receives a dedicated context file that inherits from the project context.</p><table tabindex="0"><thead><tr><th>Agent</th><th>Purpose</th></tr></thead><tbody><tr><td><a href="/agents/feature-context-generator.html">Feature Context Generator</a></td><td>Generates Epic context.md files (~800 tokens) with domain-specific patterns and architectural guidance</td></tr><tr><td><a href="/agents/feature-context-generator.html">Feature Context Generator</a></td><td>Generates Story context.md files (~1500 tokens) with user journey details and acceptance criteria context</td></tr></tbody></table><h2 id="next-steps" tabindex="-1">Next Steps <a class="header-anchor" href="#next-steps" aria-label="Permalink to &quot;Next Steps&quot;">​</a></h2><h3 id="review-generated-hierarchy" tabindex="-1">Review Generated Hierarchy <a class="header-anchor" href="#review-generated-hierarchy" aria-label="Permalink to &quot;Review Generated Hierarchy&quot;">​</a></h3><p><strong>Epic Structure</strong></p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/context-0001/context.md</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/context-0001/work.json</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br></div></div><p><strong>Story Structure</strong></p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/context-0001-0001/context.md</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/project/context-0001-0001/work.json</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br></div></div><h3 id="proceed-to-next-ceremony" tabindex="-1">Proceed to Next Ceremony <a class="header-anchor" href="#proceed-to-next-ceremony" aria-label="Permalink to &quot;Proceed to Next Ceremony&quot;">​</a></h3><p><strong>Seed</strong> - Decompose a Story into Tasks and Subtasks:</p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /seed context-0001-0001</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><p>See <a href="./seed.html">Seed ceremony documentation</a></p><h2 id="troubleshooting" tabindex="-1">Troubleshooting <a class="header-anchor" href="#troubleshooting" aria-label="Permalink to &quot;Troubleshooting&quot;">​</a></h2><p>View detailed ceremony logs:</p><div class="language-bash vp-adaptive-theme line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .avc/logs/sprint-planning-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">.log</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br></div></div><p>Logs include:</p><ul><li>Existing hierarchy scan results</li><li>Initial Scope extraction</li><li>LLM decomposition request/response</li><li>Context generation for each Epic/Story</li><li>File write operations</li><li>Error stack traces</li></ul>`,31))])}const k=a(c,[["render",p]]);export{b as __pageData,k as default};
