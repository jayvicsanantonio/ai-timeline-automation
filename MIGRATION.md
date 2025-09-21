# AI Timeline Automation Revamp Migration Plan

## Current Baseline (2025-09)
- **Execution flow** lives in `src/index.ts` and `WeeklyUpdateOrchestrator`; sources are instantiated with hard-coded lists derived from `NEWS_SOURCES` env, and per-source behavior cannot be configured without code changes.
- **Collectors** cover HackerNews, ArXiv, and a trio of RSS feeds. Pagination, retry, and rate limiting are ad hoc; there is no connector contract or shared utilities.
- **Analysis** relies on the Vercel `ai` SDK targeting OpenAI models; there is no provider abstraction, no fallback chain, and significance scores are 0–10 integers with limited documentation.
- **Deduplication** is heuristic (string similarity plus URL match) in `DeduplicationService`; there is no embedding-based similarity and thresholds are not externally configurable.
- **Output pipeline** pushes selected events directly into GitHub via `GitHubManager`, with PR bodies assembled inline; there is no reporting artifact or schema validation.
- **Config & secrets** come exclusively from `.env` via `loadConfig`; there is no YAML-backed configuration or config schema for sources/pipeline/LLM.
- **Observability** is limited to console logging; metrics, structured logs, and error tracking hooks are absent. Circuit breakers exist in utils but are not consistently applied.
- **Testing/CI** provide basic coverage (collectors, types, utils) but no contract tests, no golden outputs, and coverage thresholds are below the new >90% goal.

## Target End State
- **Config-first architecture**: YAML files in `/config` (`sources.yaml`, `pipeline.yaml`, `llm.yaml`) drive connector registration, dedupe thresholds, scoring weights, retries, and fallbacks. CLI commands accept overrides for reproducible runs.
- **Connector framework**: `SourceConnector` interface with typed output `RawItem`; connectors live in `src/connectors/` with shared HTTP clients, rate limiters, retry/backoff, and circuit breakers. Sources are enabled/disabled in config.
- **LLM adapter layer**: `LLMProvider` interface with `complete` and `embed`. Default `OpenAIGPT5LowProvider` implements GPT5 Low with budgets, retries, and timeouts; fallback providers (GPT-4o mini, local GGUF) chained per config. Provider selection and temperature/top_p live in `config/llm.yaml`.
- **Deterministic pipeline**: New orchestrated flow in `src/pipeline/` with stages ingest → clean → dedupe → analyze → score → filter → validate → persist. Each stage pure/idempotent for identical inputs and window.
- **Enhanced dedup**: Dual-stage dedup using MinHash (text) plus embedding cosine similarity with tunable thresholds from `pipeline.yaml`. Canonical URL hashing and fingerprint persisted with each timeline entry.
- **Scoring & categorization**: Dedicated `src/scoring/` module returning `{technical, commercial, social, composite}` in [0,1], composite weighted per config; category constrained to `{breakthrough, development, research, adoption}` with tag inference.
- **Outputs & PR automation**: Timeline events written to `data/timeline-events.json` after JSON Schema validation; run summary emitted to `reports/YYYY-MM-DD.md`. GitHub automation opens `automation/timeline/<date>` branches with templated PR body and changelog.
- **Observability & resilience**: JSON logs with correlation IDs, Prometheus metrics exporter, retry + circuit breaker wrappers around connectors and LLM, pluggable error tracker (Sentry stub). Rate limits respected from config.
- **Testing & DX**: Contract tests for each connector/provider, golden-file tests for timeline JSON and PR body, idempotency tests, schema validation tests, coverage >90% for pipeline + adapters. Makefile/pnpm scripts support lint/typecheck/test/run/report. Documentation updates (README + MIGRATION + CONFIG + SOURCES + LLM_ADAPTERS + RUNBOOK + ADR).

## Migration Phases & Milestones
1. **Foundation (Week 1)**: Introduce new folder layout (`src/{connectors,llm,pipeline,scoring,dedupe,observability,cli}`), add YAML config loader, stub CLI commands, and wire new config registry alongside existing flow (feature-flagged).
2. **Connector rewrite (Week 1–2)**: Implement `SourceConnector` base, migrate RSS → `OpenAIBlogConnector` as exemplar, then port ArXiv/HackerNews into new pattern. Add config-driven instantiation and shared HTTP utilities.
3. **LLM abstraction (Week 2)**: Create `LLMProvider` interface, implement GPT5 Low provider with fallback chain and embeddings, replace analyzer with provider-agnostic pipeline stage.
4. **Dedup & scoring overhaul (Week 2–3)**: Build embedding store + MinHash deduper with configurable thresholds; implement new scoring module and category/tag logic.
5. **Pipeline orchestration (Week 3)**: Assemble deterministic pipeline stages, enforce schema validation, integrate reporting, and ensure dry-run/idempotency behaviors.
6. **GitHub automation & reports (Week 3–4)**: Rebuild PR workflow with templated descriptions, branch naming, and report attachments; ensure data/timeline-events.json updates remain atomic.
7. **Observability & resilience (Week 4)**: Embed structured logging, metrics, error hook, retries, and circuit breakers; expose Prometheus endpoint and logging correlation IDs.
8. **Testing & CI hardening (Week 4)**: Add high-coverage Jest suites, contract/golden/idempotency tests, coverage gating, schema validation in CI, and updated GitHub Actions.
9. **Documentation & rollout (Week 4)**: Finalize README, CONFIG/MIGRATION/SOURCES/LLM_ADAPTERS/RUNBOOK, ADR for LLM adapter, sample report, and release checklist. Finish with dry run (`run:once`) producing ≥5 items and PR generation against upstream timeline repo.

## Risks & Mitigations
- **Config divergence**: Mitigate with schema validation and default merging, plus documentation in CONFIG.md.
- **LLM budget overruns**: Enforce per-run token budgets and fallback providers with automatic downgrade.
- **Determinism regressions**: Snapshot inputs/outputs in tests, add idempotency CI check, and persist fingerprints.
- **Connector rate limits**: Respect config-driven QPM limits with token bucket rate limiter and jittered retries.
- **Timeline data integrity**: Validate against JSON Schema and stable ID rules before writing; golden-file tests guard format changes.

This plan front-loads architecture work, then iteratively replaces collectors, analysis, and outputs while maintaining run safety and repository deliverables.
