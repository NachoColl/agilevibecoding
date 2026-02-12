# Changelog

All notable changes to the Agile Vibe Coding (AVC) framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Smart Validator Selection (Hybrid Approach)** - LLM-based validator selection for unknown/novel domains
  - Hybrid approach: static rules for known domains (fast), LLM for unknown domains (smart)
  - New validator-selector agent analyzes epic/story descriptions semantically
  - Automatic selection of 5-8 most relevant validators for novel domains (blockchain, ML, IoT)
  - Caches selected validators in work.json metadata for reproducibility
  - Opt-in via `useSmartSelection: true` in ceremony configuration
  - Cost: +$0.003 per unknown domain epic/story (uses Gemini Flash by default)
  - Documentation in `/architecture/validation.md` with examples

- **Per-Stage LLM Model Configuration for Sprint Planning Ceremony** - Configure different models for decomposition, validation, and context generation stages to optimize cost and quality
  - Stage-level model selection: decomposition, validation, context-generation
  - Validation-type-specific configuration: universal, domain, feature validators can use different models
  - Interactive `/models` command with validation-type sub-selection UI
  - Cost optimization: 62-73% savings by using efficient models for routine tasks while reserving powerful models for critical validation
  - Fallback resolution: validation-type → validation-stage → ceremony-default → global-default
  - Updated documentation in `/ceremonies/sprint-planning.md` and `/architecture/validation.md` with cost optimization examples

- **Multi-Agent Epic and Story Validation System** - Sprint Planning ceremony now validates every Epic and Story using 2-8 specialized domain validators before creating work items
  - 15 Epic validator agents (solution-architect, developer, security, devops, database, frontend, api, cloud, qa, test-architect, ux, ui, mobile, backend, data)
  - 15 Story validator agents matching Epic validators with implementation-focused criteria
  - Intelligent routing based on domain, features, and inferred characteristics
  - Parallel validation execution for performance
  - Aggregated validation results showing overall score, critical/major/minor issues, improvement priorities, and validator consensus
  - Validation is informative, not blocking - work items created even with warnings
  - Comprehensive test coverage (55 new unit tests)
  - Full documentation in `/architecture/validation.md`

### Changed
- Sprint Planning ceremony now includes new Stage 5: Multi-Agent Validation (stages renumbered accordingly)
- Enhanced Sprint Planning ceremony documentation with detailed validation workflow and examples
- Enhanced ModelConfigurator to support validation-type sub-configuration
- Enhanced Epic/Story validators to use validation-type-specific models

### Technical Details
- Modified files: `sprint-planning-processor.js` (per-stage provider selection), `epic-story-validator.js` (validation-type providers), `init-model-config.js` (validation types), `repl-ink.js` (validation-type UI mode)
- New methods: `getProviderForStage()`, `getProviderForValidator()`, `getValidationType()`, `getValidationTypes()`, `getValidationTypeConfig()`
- Test suite: 456 → 511 tests (all passing)

---

## [0.1.4] - 2025-01-XX

### Added
- Initial public release
- Core ceremonies: Sponsor Call, Sprint Planning, Seed
- Multi-LLM support: Claude, Gemini, OpenAI
- REPL interface with Ink-based UI
- Documentation website with VitePress

### Fixed
- Various bug fixes and stability improvements

---

## [0.1.0] - 2024-12-XX

### Added
- Initial framework implementation
- Basic ceremony structure
- Command-line interface

[Unreleased]: https://github.com/anthropics/avc/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/anthropics/avc/releases/tag/v0.1.4
[0.1.0]: https://github.com/anthropics/avc/releases/tag/v0.1.0
