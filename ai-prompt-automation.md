# AI Prompt Automation – Revamp the AI Timeline System

This file is a ready-to-run prompt for an AI Coding agent. It instructs the agent to totally revamp the AI Timeline Automation System, replace the news sources, and migrate analysis to GPT5 Low with a clean provider abstraction. It also defines strict acceptance criteria, tests, observability, and release steps.

> Target repo: `https://github.com/jayvicsanantonio/ai-timeline`  
> Primary output updated via PRs: `data/timeline-events.json`

---

## How to use this file

1. Copy the entire prompt block below and paste it into your AI Coding agent.
2. Set environment variables and secrets as described in the prompt.
3. Let the agent implement the plan, open a PR, and generate a report for the run.
4. Review CI results and merge once the Definition of Done is satisfied.

---

## Agent Prompt

```
Role
You are a Principal AI Automation Engineer. You will totally revamp an existing repo that automates AI-news collection and timeline updates. You will change the news sources and migrate analysis to GPT5 Low behind a clean LLM adapter. You own architecture, code quality, observability, tests, and the end-to-end release.

Repo
Target: https://github.com/jayvicsanantonio/ai-timeline
Primary output file to update via automated PRs: data/timeline-events.json

High-level objectives
1. Replace the current ingestion with a new, configurable multi-source pipeline.
2. Swap the LLM to GPT5 Low using a provider-agnostic interface, with graceful fallbacks.
3. Keep the system’s behavior guarantees:
   - Deduplicate across sources
   - Multi-dimensional significance scoring
   - Categorization and impact assessment
   - Smart filtering by thresholds
   - Automated PRs against the repo
   - Strong monitoring, metrics, and logging
4. Deliver a clean, documented implementation with reproducible runs, strong tests, and a runbook.

Non-negotiable acceptance criteria
- Config-first ingestion. All sources declared in config/sources.yaml. No hardcoding. Each source implements SourceConnector with fetch() -> Iterable<RawItem>.
- LLM abstraction. Introduce LLMProvider interface with complete(), embed(). Default provider is GPT5 Low. Support a fallback chain picked by config.
- Deterministic pipelines. One run is idempotent for the same time window and inputs. Safe to re-run.
- Dedup implemented with both:
  - Semantic similarity via embeddings
  - Textual similarity via MinHash or robust fuzzy hashing
  Thresholds are tunable in config/pipeline.yaml.
- Scoring returns {technical, commercial, social, composite} in [0,1]. Composite is a documented weighted blend from config.
- Categorization into {breakthrough, development, research, adoption} plus tags.
- Filtering by thresholds from config, with an evaluation report per run.
- GitHub PR automation creates atomic PRs with a templated description, changelog, and an attached reports/<YYYY-MM-DD>.md.
- Observability
  - JSON logs with correlation IDs
  - Metrics (Prometheus-ready) for counts, durations, error rates, dedup ratios, source latency
  - Error tracking hook (pluggable, Sentry-ready)
- Resilience
  - Circuit breakers around each connector and around the LLM
  - Retries with exponential backoff and jitter
  - Respectful rate limits per source
- Security
  - No secrets in code or logs
  - All credentials via env vars or .env.local
  - Per-source request signing handled in connectors only
- Tests
  - Greater than 90 percent coverage on core pipeline and all adapters
  - Golden-file tests for JSON output and PR body rendering
  - Contract tests for every SourceConnector and the LLMProvider
- Docs and DX
  - README.md updated
  - MIGRATION.md, CONFIG.md, SOURCES.md, LLM_ADAPTERS.md
  - RUNBOOK.md with common failures and remedies
  - Makefile or pnpm scripts for common tasks

Tech and structure
- Prefer TypeScript on Node 20+. If the repo is not TS today, propose a safe migration path and implement it.
- Suggested folders:
  /src
    /connectors/
    /llm/
    /pipeline/
    /scoring/
    /dedupe/
    /github/
    /observability/
    /config/
    /cli/
  /config
    sources.yaml
    pipeline.yaml
    llm.yaml
  /reports
  /scripts
  /tests
  data/timeline-events.json  (kept)

- Scripts (Make or pnpm): setup, lint, typecheck, test, build, run:once, run:daily, report:open, ci.

LLM: GPT5 Low default
- Add config/llm.yaml:
  default_provider: openai_gpt5_low
  fallback_chain:
    - openai_gpt4o_mini
    - local_gguf_small
  temperature: 0.2
  top_p: 1.0
  max_tokens: 1200
  embeddings_model: text-embedding-latest

- Env:
  OPENAI_API_KEY=
  LLM_PROVIDER=openai_gpt5_low

- Implement OpenAIGPT5LowProvider with timeouts, retries, and budget caps per run.

New ingestion sources
- Make ingestion purely config-driven. Example config/sources.yaml:
  window_days: 3
  sources:
    - id: arxiv
      kind: rss
      url: https://arxiv.org/rss/cs.AI
      rate_limit_qpm: 30
      enabled: true
    - id: deepmind_blog
      kind: html
      url: https://deepmind.google/discover/blog/
      enabled: true
    - id: openai_blog
      kind: rss
      url: https://openai.com/blog/rss.xml
      enabled: true
    - id: anthropic
      kind: rss
      url: https://www.anthropic.com/news.xml
      enabled: true
    - id: huggingface
      kind: rss
      url: https://huggingface.co/blog/feed.xml
      enabled: true
    - id: paperswithcode
      kind: api
      url: https://paperswithcode.com/api/latest
      enabled: false

- RawItem shape: {id, title, url, published_at, source, authors?, summary?}
- Each connector handles pagination, 429s, and parsing. Prefer official feeds over scraping.

Pipeline steps
1) Ingest
   - Pull windowed items from all enabled connectors
   - Normalize to RawItem
   - Annotate with ingested_at and source latency metrics
2) Clean
   - Strip tracking params, normalize whitespace, canonicalize URLs
3) Deduplicate
   - Compute embeddings, MinHash signature, URL canonical key
   - Drop near-duplicates using thresholds from pipeline.yaml
4) Analyze with LLM
   - Summarize succinctly
   - Assign {technical, commercial, social} in [0,1] each with rationale
   - Category is one of {breakthrough, development, research, adoption}
   - Tags up to 6
   - Produce a structured JSON payload
5) Score and Filter
   - Compute composite score using weights in pipeline.yaml
   - Keep items above min_composite and category-specific floors
6) Validate output
   - Enforce JSON Schema for data/timeline-events.json
   - Ensure chronological order and stable IDs
7) Write and PR
   - Append new events
   - Regenerate reports/<date>.md with run summary and metrics
   - Create a GitHub PR with a templated body and checklist

JSON Schema for data/timeline-events.json
- Use Draft 2020-12 schema and validate in CI:
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "array",
    "items": {
      "type": "object",
      "required": ["id","date","title","url","source","category","summary","significance","tags","dedupe_fingerprint"],
      "properties": {
        "id": {"type":"string","pattern":"^[a-z0-9-]+$"},
        "date": {"type":"string","format":"date"},
        "title": {"type":"string","minLength":5},
        "url": {"type":"string","format":"uri"},
        "source": {"type":"string"},
        "category": {"type":"string","enum":["breakthrough","development","research","adoption"]},
        "summary": {"type":"string","minLength":20,"maxLength":600},
        "significance": {
          "type":"object",
          "required":["technical","commercial","social","composite"],
          "properties": {
            "technical":{"type":"number","minimum":0,"maximum":1},
            "commercial":{"type":"number","minimum":0,"maximum":1},
            "social":{"type":"number","minimum":0,"maximum":1},
            "composite":{"type":"number","minimum":0,"maximum":1}
          }
        },
        "tags": {"type":"array","items":{"type":"string"},"maxItems":10},
        "authors": {"type":"array","items":{"type":"string"}},
        "dedupe_fingerprint":{"type":"string"},
        "added_by":{"type":"string","enum":["automation","manual"]},
        "retrieved_at":{"type":"string","format":"date-time"}
      },
      "additionalProperties": false
    }
  }

ID rule
- id is YYYY-MM-DD-<kebab-title-or-slugified-source> plus a short hash if needed.

Observability
- Logging: JSON lines with fields ts, level, corr_id, span, event, source_id, item_id, duration_ms.
- Metrics: Prometheus counters, gauges, histograms:
  - items_ingested_total{source=}
  - items_kept_total
  - dedupe_ratio
  - llm_tokens_total{kind=prompt|completion}
  - connector_latency_ms_bucket{source=}
  - pipeline_run_seconds
- Errors: Hook for Sentry or noop stub, configured in pipeline.yaml.

GitHub integration
- Prefer a GitHub App with fine-grained permissions. Fallback to GITHUB_TOKEN.
- PRs:
  - Title: chore(timeline): update events for <YYYY-MM-DD>
  - Body: overview, counts, top 5 items with scores, link to reports/<date>.md, checklist
- Branch naming: automation/timeline/<YYYY-MM-DD>

Config samples
- pipeline.yaml:
  dedupe:
    embed_similarity_min: 0.88
    minhash_jaccard_max: 0.12
    url_canonicalize: true
  scoring:
    weights: { technical: 0.5, commercial: 0.3, social: 0.2 }
    min_composite: 0.62
  category_minimums:
    breakthrough: 0.70
    development: 0.60
    research: 0.58
    adoption: 0.55
  limits:
    max_items_per_run: 40
    max_items_per_source: 20
  timeouts:
    connector_ms: 15000
    llm_ms: 20000
  retries:
    attempts: 3
    base_ms: 300
    max_ms: 4000

Tests to implement
- Connector contract tests with recorded fixtures
- Dedup unit tests for thresholds and tie-breakers
- LLM adapter tests with mocked responses and budget caps
- Schema validation test against timeline-events.json
- PR body golden test
- Idempotency test: same window twice yields no extra commits

CLI
- src/cli/index.ts with:
  - ingest (window override)
  - run (end-to-end, dry-run flag)
  - report (open last run report)
  - validate (schema and links)

CI and scheduling
- GitHub Actions:
  - ci.yml: lint, typecheck, test, schema validate
  - schedule.yml: cron daily, open PR only if output differs
- Cache dependencies, upload reports as artifact

Deliverables
- Code per structure
- MIGRATION.md, CONFIG.md, SOURCES.md, LLM_ADAPTERS.md, RUNBOOK.md
- Updated README.md with quickstart
- docs/ADR-0001-llm-adapter.md explaining GPT5 Low default and fallback
- Sample reports/<date>.md
- Passing CI with coverage badge

Definition of done checklist
- [ ] All acceptance criteria satisfied
- [ ] run:once succeeds locally with at least 5 real items kept
- [ ] timeline-events.json passes schema and link checks
- [ ] A PR is created with the new items and a report
- [ ] Metrics confirmed in logs and Prometheus endpoint reachable
- [ ] RUNBOOK.md includes at least 6 failure modes with remedies
- [ ] Tests passing in CI with greater than 90 percent core coverage

Guardrails
- Never leak API keys in logs or PRs
- Respect robots and rate limits
- Prefer official feeds over scraping
- All network calls use timeouts, retries, and circuit breakers

First actions to perform now
1) Audit current repo and produce MIGRATION.md with a one-page delta plan.
2) Scaffold folders and add config/*.yaml with sensible defaults.
3) Implement LLM adapter for GPT5 Low, then a simple openai_blog RSS connector.
4) Wire ingest -> dedupe -> analyze -> score -> filter -> write -> PR on a small dry run.
5) Land tests and CI, then expand connectors.
```

---

## Env and secrets

Create `.env.local` or use CI secrets:

```
OPENAI_API_KEY=
LLM_PROVIDER=openai_gpt5_low
GITHUB_APP_ID=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_TOKEN=
SENTRY_DSN=
```

---

## Notes

- Keep runs idempotent for the same time window.
- Favor official APIs or feeds. If scraping is truly needed, isolate it in a connector and test selectors.
- Measure everything. Logs tell the story, metrics prove it.
