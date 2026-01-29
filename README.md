# Agile Vibe Coding (AVC)

**A framework for managing agent-based software development projects**


Agile Vibe Coding (AVC) is a structured approach to consistent long-term software development with AI agents. The framework breaks down large projects into verifiable, trackable features that specialized agents can implement in parallel without conflicts, while continuously improving context quality through systematic measurement and retrospective analysis. 


## The Challenge

Large software projects stress LLM-based coding agents in ways that differ fundamentally from how human development teams operate. Unlike humans, which retain long-term memory and build overall abstract understanding through iteration, LLMs do not have these capacities. 

- LLMs are probabilistic and sensitive to prompt formulation.
- LLM's context should not be understood as a memory but as information.
- When context exceeds a model's effective range, coherence degrades.
- The linear predictive nature of LLMs enforces sequential reasoning, limiting native parallel deliberation.

Left unguided, AI coding agents drift. Context decays. Abstractions fracture. Logic duplicates. Regressions surface across independently generated features. 

These are not defects of the models, but natural consequences of bounded context, ephemeral reasoning, and probabilistic generation operating without the persistent internal understanding that humans develop over time.

Can we still build large, complex systems with LLMs despite these constraints? Yes. By shaping context, constraints, and verification through deliberate frameworks and disciplined practice, we guide LLMs toward coherent outcomes. Where models lack persistent understanding, we supply externalized knowledge through a framework: where reasoning is ephemeral, we anchor it in artifacts. 

Let's call it the Agile Vibe Coding framework.

## The Agile Vibe Coding framework


AVC does not replace your current AI coding tools. 

AVC adds an extra layer of control over the progress of the project lifetime. Just as real-world complex software requires multiple layers of knowledge and management we need a similar approach when working with AI agents-which may still struggle with the long term. AVC provides the organizational structure that sits above your day-to-day coding tools, ensuring long-term coherence and progress tracking. 

A hierarchy of assets, specialized agents, and workflows for handling the common challenges of sustained software delivery using LLMs.

### AVC assets hierarchy

**Agile Vibe Coding** follows the Agile hierarchy (Epic → Story → Task → Subtask), but places each level inside clear context boundaries.

```
project/
├── doc.md                                    # documentation
├── context.md                                # context scope                               
├── project.json                              # work item
└── context-0001/   
    ├── doc.md                                # documentation                          
    ├── context.md                            # context scope
    ├── epic.json                             # work item
    └── context-0001-0001/                    
        ├── context.md                        # ...
        ├── story.json                        
        └── context-0001-0001-0001/           
            ├── context.md                   
            ├── task.json                     
            ├── context-0001-0001-0001-0001/  
            │   ├── context.md               
            │   └── subtask.json              
            └── context-0001-0001-0001-0002/
                ├── context.md
                └── subtask.json
```


### Work Item

Work items are JSON files containing an LLM prompt request, the list of tests for work validation and the current work status.

```json
{
  "id": "context-0001-0001-0001-0001",
  "name": "Create JWT Payload Interface",
  "dependencies": [],
  "prompt": "Create TypeScript interface for JWT payload in src/types/JWTPayload.ts. Include properties: userId (string), email (string), role ('user' | 'admin' literal type), exp (number), iat (number). Add JSDoc comments. Export as named interface.",
  "statuses": [{
    "status": "pending",
    "timestamp": 1769442717798
  }],
  "validation": {
    "status": "pending",
    "tests": [{
      "status": "pending",
      "testPrompt": "Verify JWTPayload interface is properly exported with all required properties and correct types.",
      "validations": [{
        "criteria": "Interface exported from src/types/JWTPayload.ts",
        "status": "pending"
      }, {
        "criteria": "All 5 properties exist with correct types",
        "status": "pending"
      }, {
        "criteria": "TypeScript compiles without errors",
        "status": "pending"
      }]
    }],
    "allTestsPassed": false
  },
  "completedAt": null
}
```
*Work item definition*


### Context Inheritance (Downward Flow)

Each level in the hierarchy has a `context.md` file that **inherits from its parent and adds specifics**. When implementing a work unit, agents read ALL context files from project down to current level.

An example:

```
project/
├── context.md              # Level 1: Project  :: Language: TypeScript 5.0 [...]
└── epic-0001/
    ├── context.md          # Level 2: Epic     :: All passwords MUST be hashed [...]
    └── story-0001-0001/
        ├── context.md      # Level 3: Story    :: Password minimum 8 characters [...]
        ├── story.json
        └── task-0001-0001-0001/
            ├── context.md  # Level 4: Task     :: pattern -> class JWTService { [...] 
            └── task.json
```

**When an agent implements `task-0001-0001-0001`, it reads ALL five context.md files as the task context.**


### Tests (Upward Validation)

While context flows DOWN (project → subtask), **tests flow UP** (subtask → project) and each level validates a different granularity, which naturally should flow into the following test hirarchy:

```
Subtask Tests  → Unit Tests        (atomic work)
Task Tests     → Integration Tests (subtasks working together)
Story Tests    → E2E Tests         (user capability end-to-end)
Epic Tests     → System Tests      (domain-wide functionality)
```

Deepest level tests must pass first. Only when all subtask tests pass do you run task tests. Only when all task tests pass do you run story tests. This creates a **validation pyramid** where you catch issues early at the unit level.

### AVC Ceremonies

As with Agile project management, the Agile Vibe Coding framework contains a set of ceremonies and processes to manage the project moving forward.

#### **Sponsor Call** (Project Initialization)

The Sponsor Call ceremony is the first ceremony that defines the project vision and initial scope. This ceremony uses an AI-powered interactive questionnaire to create initial documentation, which will be used by subsequent ceremonies for creating work items.

**Two-step process:**

1. **Setup project structure** (`/init`):
   - Creates `.avc/` folder and configuration files
   - Creates `.env` file for API keys
   - No AI/LLM calls, no API keys required

2. **Run Sponsor Call ceremony** (`/sponsor-call`):
   - Interactive questionnaire with AI assistance
   - Generates project definition document
   - Requires API keys to be configured

This separation allows users to set up the project structure first, configure their API keys, and then run the AI-powered ceremony.

##### Ceremony stakeholders

The sponsor call ceremony requires the following human stakeholders and AI agents.

**Human stakeholders**

| stakeholder                         | reponsabilities
|-------------------------------------|-----------------|
| product owner                       | Initiates the ceremony.
| business key-stakeholders           | Defines the mission and initial scope.
| product team (infra/dev/security)   | Helps defining infrastructure, development, security and compliance initial scope requirements.


**AI Agents**

| agent                | responsibilities
|----------------------|-----------------|
| product owner        | The controller agent responsible for executing the ceremony workflow.



#### **Project Expansion** (Sprint Planning)

A project expansion ceremony is manually triggered and checks the AVC hierarchy for work items in *ready* status and process each as following:

- for each ready work item, it checks the scope context for completeness,

if no extra information is required, 

if it is an *atomic* work,

- it marks the work as pending

if the work can be split into multiple work items

- it creates a child AVC hierarchy with a new set of context scopes and work items with the ready status, 
- it then updates the parent work item status to *pending*;

if some extra information is required before processing a work item, 

- it adds a list of questions that need to be resolved before continuing,
- it marks the work item as *feedback* required.

This ceremony continues recursively until all work items are in pending status.


##### Ceremony stakeholders

The project expansion ceremony requires the following human stakeholders and AI agents.

**Human stakeholders**

| stakeholder   | reponsabilities
|---------------|-----------------|
| product owner | Check initial scope assets and trigger the ceremony (handled by the agent).
| product team  | Provide clarifications and answer questions raised by agents during the expansion process.       


**AI Agents**

| agent                | responsibilities
|----------------------|-----------------|
| product owner        | The controller agent responsible for executing the ceremony workflow.
| server agent         | Define and implement backend features, APIs, and server-side logic.
| client agent         | Define and implement SDK, frontend components, and client-side functionality.
| infrastructure agent | Define and handle cloud deployment, infrastructure configuration, and DevOps tasks.
| testing agent        | Generate and execute test suites to verify feature implementations. 


#### **Context Retrospective** 

A context retrospective updates all context scopes.


## CLI Commands

The AVC framework ships with an interactive REPL that exposes all commands. Full usage details, multi-provider configuration, and keyboard shortcuts are documented at:

**[CLI Commands Reference →](COMMANDS.md)**

---

## References

1. **Anthropic's Best Practices for Long-Running Agents** - [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) - Agents working across multiple context windows need structured environments with initializer agents to set up foundations and coding agents that maintain clean, documented code states for handoffs between sessions.

2. **Microservices Architecture** - [Microservices Patterns](https://microservices.io/patterns/microservices.html) - Structures applications as loosely coupled, deployable components organized around business capabilities, enabling teams to develop, test, and deploy services independently while maintaining system flexibility and scalability.

3. **Agile Manifesto** - [Agile Principles](https://agilemanifesto.org/principles.html) - Prioritizes delivering functional software rapidly while remaining responsive to changing customer needs through continuous collaboration and team empowerment.

4. **LLM Limitations Research** - [https://arxiv.org/html/2410.12972v2](https://arxiv.org/html/2410.12972v2) - Large language models exhibit significant weakness in combining knowledge and instruction-following, with performance drops of 40-80% when given simple answer-modifying instructions alongside knowledge tasks.



