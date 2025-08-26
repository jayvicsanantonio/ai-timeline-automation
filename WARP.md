# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository: ai-timeline-automation (Node.js + TypeScript)

- Primary entrypoint: src/index.ts → built to dist/index.js
- CI: .github/workflows/weekly-update.yml (scheduled + manual)
- Tests: Jest (ts-jest), config at jest.config.js
- Linting: ESLint (@typescript-eslint)
- Type checking: tsc (strict)

Common commands

- Install dependencies
```bash path=null start=null
npm install
```

- Build TypeScript → dist/
```bash path=null start=null
npm run build
```

- Type-check only (no emit)
```bash path=null start=null
npm run typecheck
```

- Development mode (run ts directly with tsx)
```bash path=null start=null
npm run dev
```

- Run the full automation (expects environment configured)
```bash path=null start=null
# from built output
npm run update
# alias
npm start
```

- Lint and autofix
```bash path=null start=null
npm run lint
npm run lint:fix
```

- Tests: run all / watch / coverage
```bash path=null start=null
npm test
npm run test:watch
npm run test:coverage
```

- Run a single test file (examples)
```bash path=null start=null
# by path
npm test -- src/__tests__/integration.test.ts
# or with jest directly
npx jest src/collectors/hackernews.test.ts
```

Environment configuration (essentials)

Copy .env.example → .env and set at minimum:
- OPENROUTER_API_KEY: for analysis
- GITHUB_TOKEN: PAT used for repo operations
- TIMELINE_REPO: owner/repo for the target timeline

Optional/behavioral:
- MAX_EVENTS_PER_WEEK (default 3)
- SIGNIFICANCE_THRESHOLD (default 7.0)
- NEWS_SOURCES (comma list; e.g., hackernews,arxiv,rss)
- LOG_LEVEL (error|warn|info|debug)
- DRY_RUN (true|false)
- HACKERNEWS_API_KEY, ARXIV_API_KEY (if required by sources)

Key scripts and where they’re used

- npm run dev → tsx src/index.ts (local iterative runs)
- npm run build → tsc (uses tsconfig.json)
- npm run update / npm start → node dist/index.js (used in CI job)
- npm test / coverage / watch → Jest with ts-jest (see jest.config.js)
- npm run lint / lint:fix → ESLint over .ts files (see .eslintrc.json)
- npm run typecheck → tsc --noEmit

High-level architecture (big picture)

Workflow orchestration
- src/index.ts
  - Validates and loads config from environment (via src/config)
  - Initializes collectors based on NEWS_SOURCES
  - Constructs WeeklyUpdateOrchestrator and executes the weekly workflow
  - Writes a machine-readable summary to execution-summary.json (consumed by CI steps)

Core orchestrator
- src/orchestrator/weekly-update-orchestrator.ts
  - Coordinates end-to-end steps:
    1) Collect events from all registered collectors (parallel with retry + circuit breaker)
    2) Deduplicate events
    3) Analyze events using EventAnalyzer (OpenAI-backed)
    4) Select top N by significance
    5) Create/update a branch and open a PR in TIMELINE_REPO
  - Metrics captured: totalCollected, afterDeduplication, analyzed, selected, duration
  - Uses utility abstractions for resilience: CircuitBreakerFactory, RetryPolicy

Data collection layer (sources)
- src/collectors/
  - hackernews.ts, arxiv.ts, rss.ts implement NewsCollector-like interfaces
  - src/collectors/index.ts provides helpers to compose default or custom sets

Analysis layer
- src/analyzers/event-analyzer.ts
  - Ingests raw events and produces analyzed events with significance and impact breakdown
  - Selection helpers to cap to MAX_EVENTS_PER_WEEK and apply SIGNIFICANCE_THRESHOLD

Repository integration
- src/github/
  - github-manager.ts: branch management, file updates, PR creation (via @octokit/rest)
  - timeline-reader.ts: reads current timeline state for incremental updates

Shared types and schemas
- src/types/
  - events.ts, sources.ts define strongly-typed contracts (zod schemas) for raw/analyzed events and source configs

Utilities & infrastructure concerns
- src/utils/
  - circuit-breaker.ts, retry.ts: standardized resilience policies per subsystem (collectors, analyzer, GitHub)
  - errors.ts: typed error hierarchy (ConfigurationError, RateLimitError, etc.) and aggregation
  - logger.ts, metrics.ts: structured logging and execution metrics summarization

Build/test/lint configuration

- tsconfig.json: ES2022, commonjs, strict, declaration + source maps; rootDir src → outDir dist
- jest.config.js: ts-jest preset; roots at src; coverage thresholds (80%) and reporters
- .eslintrc.json: eslint:recommended + @typescript-eslint/recommended; Node + ES2022 + Jest env

CI automation (GitHub Actions)

- .github/workflows/weekly-update.yml
  - Schedule: every Sunday 00:00 UTC
  - Manual trigger: workflow_dispatch with inputs (dry_run, max_events, significance_threshold)
  - Steps:
    - npm ci && npm run build
    - Validate required secrets (OPENROUTER_API_KEY, GITHUB_TOKEN, TIMELINE_REPO)
    - npm run update with env and optional NEWS_SOURCES/LOG_LEVEL
    - Upload logs and (optionally) comment summary to an issue

Important references from README.md

- Quick start (install → configure → dev → build/update)
- Required environment variables and their intent
- Troubleshooting commands to validate auth and configuration
- Testing/coverage expectations

Assistant tool/rules files observed

- .claude/settings.local.json: contains a local permission example; does not affect Node build/tests. No Cursor/Copilot rules detected in this repo.

Notes and gotchas specific to this codebase

- Deduplication import path: Orchestrator currently imports from '../services/deduplication' while the implementation resides at 'src/lib/deduplication.ts'. If you encounter a module not found error around DeduplicationService, verify/align this import path.
- Running locally vs CI: npm run update expects dist/ to exist; ensure npm run build first (or use npm run dev for tsx execution during development).
- Secrets in shell usage: prefer exporting envs or using a .env file loaded by dotenv; avoid echoing secrets in the terminal output.
