# AI Timeline Automation Revamp Overview

## 1. Architecture Shift – Config-First & Deterministic
- **YAML-driven connectors**: `config/sources.yaml` declares every source (URL, enable flag, rate limit, ingestion window). The connector factory (`src/connectors/factory.ts`) instantiates only enabled sources.
- **Pipeline configuration**: `config/pipeline.yaml` centralises dedupe thresholds, scoring weights, limits, timeouts, and retries; `config/llm.yaml` defines LLM defaults, fallback order, and token budgets. Runs are reproducible and idempotent.

## 2. New Ingestion Framework
- **Connectors**
  - `RssSourceConnector` normalises RSS feeds.
  - `OpenAIBlogConnector` adds OpenAI-specific metadata.
  - `DeepMindBlogConnector` scrapes HTML/JSON-LD (with fixtures + contract tests).
  - `PapersWithCodeConnector` paginates the latest API, enforces window limits, and normalises authors/summary.
- **Windowing**: `computeIngestionWindow()` respects `window_days`, guaranteeing deterministic runs.

## 3. Orchestrator Overhaul (`src/orchestrator/weekly-update-orchestrator.ts`)
- Staged pipeline: ingest → clean → dedupe → analyse → score → filter → PR (optional).
- Metrics tracked per stage; `execution-summary.json` persisted for CI and local diagnostics.
- **Dry-run aware**: `dryRun` short-circuits PR creation while keeping the run successful when events meet thresholds.

## 4. LLM Abstraction (`src/llm/`)
- Common provider interface (`LLMProvider`) with budgets, retries, and usage tracking.
- Providers: GPT-5 Low (default), GPT-4o mini, Local GGUF stub, and a new `MockLLMProvider` for offline runs.
- `createLLMProvider()` reads config, honours `LLM_PROVIDER` overrides, and chains fallbacks automatically.

## 5. Analyzer Refactor (`src/analyzers/event-analyzer.ts`)
- Uses the provider chain directly; prompts the LLM to emit strict JSON validated with Zod.
- Embeds provider metadata (id/model) and respects pipeline thresholds/limits.

## 6. Legacy Cleanup
- Removed `src/collectors`, `src/lib/index.ts`, obsolete docs/scripts, and generated artefacts (e.g., `coverage/`, `logs/`).
- Consolidated workflows into `.github/workflows/daily-update.yml` (06:00 UTC schedule).

## 7. Testing & Tooling
- Added connector contract tests with recorded fixtures (`tests/__fixtures__/`).
- `npm test` covers connectors, GitHub automation, and utilities.
- Added `madge` (dev) to detect module orphans during cleanup.

## 8. Key Files After Revamp
- `config/` – YAML configs for sources, pipeline, LLM.
- `src/connectors/` – new connectors + tests.
- `src/llm/` – provider implementations, factory, mock provider.
- `src/orchestrator/weekly-update-orchestrator.ts` – deterministic pipeline.
- `.github/workflows/daily-update.yml` – daily automation entry point.
