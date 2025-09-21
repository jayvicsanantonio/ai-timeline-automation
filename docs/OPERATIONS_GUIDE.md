# AI Timeline Automation – Operations Guide

## 1. Prerequisites & Setup
1. **Install dependencies**
   ```bash
   npm ci          # preferred for clean installs/CI
   # or npm install
   ```
2. **Configure repository secrets and variables** (GitHub → Settings → Secrets and variables → Actions):
   - Secrets:
     - `OPENAI_API_KEY`
     - `GIT_TOKEN` (PAT or GitHub App token with contents/pulls scope)
     - Optional: `HACKERNEWS_API_KEY`, `ARXIV_API_KEY`
   - Repository variables:
     - `TIMELINE_REPO` (e.g., `owner/repo`)
     - Optional: `DRY_RUN`, `NEWS_SOURCES`, `LOG_LEVEL`, `SUMMARY_ISSUE_NUMBER`

## 2. Configuration Files
- `config/sources.yaml` &mdash; enable/disable connectors, update URLs, tweak rate limits & `window_days`.
- `config/pipeline.yaml` &mdash; dedupe thresholds, scoring weights, per-run/item limits, timeouts, retries.
- `config/llm.yaml` &mdash; default LLM provider, fallback chain, token budgets, request timeout.

## 3. Local Dry Run (No PRs, uses mock LLM)
```bash
LLM_PROVIDER=mock_llm \
DRY_RUN=true \
OPENAI_API_KEY=sk-your-key \
GIT_TOKEN=fake-token \
TIMELINE_REPO=owner/repo \
npm run dev
```
- Ingests real feeds, dedupes, analyses with a deterministic mock provider, and writes `execution-summary.json`.
- Output logs show per-source counts, dedupe results, selected events, and confirm PR creation is skipped.

## 4. Local Production Simulation (Creates PR)
```bash
LLM_PROVIDER=openai_gpt5_low \
DRY_RUN=false \
OPENAI_API_KEY=real-key \
GIT_TOKEN=personal-access-token \
TIMELINE_REPO=owner/repo \
npm run update
```
- Runs the entire pipeline and opens a PR (`automation/timeline/<date>`) against `TIMELINE_REPO`.
- Generates `reports/<YYYY-MM-DD>.md` and updates `data/timeline-events.json` before PR creation.
- Recommended to test on a fork first.

## 5. GitHub Actions (Daily Automation)
- Workflow: `.github/workflows/daily-update.yml`.
- Schedule: `cron: '0 6 * * *'` (06:00 UTC daily).
- Manual trigger: “Actions” tab → *Daily AI Timeline Update* → *Run workflow* (inputs for `dry_run`, `max_events`, `significance_threshold`).
- Workflow steps:
  1. Checkout (with PAT).
  2. Install deps, build.
  3. Validate required secrets.
  4. Run `npm run update` (logs to `timeline-update.log`).
  5. Upload `execution-summary.json` + log as artefact.
  6. Optional issue comment via `SUMMARY_ISSUE_NUMBER` variable.
  7. On failure, opens a GitHub issue alert.

## 6. Testing Commands
- `npm run typecheck` &mdash; TypeScript validation (no emit).
- `npm test` &mdash; full Jest suite.
- `npm test -- connectors` &mdash; connector contract tests (uses fixtures under `tests/__fixtures__/`).

## 7. Connector Cheat Sheet
- **OpenAIBlog** (RSS) &mdash; metadata: `source_name`.
- **DeepMindBlog** (HTML/JSON-LD) &mdash; handles structured data + article fallback; add fixtures if DeepMind changes layout.
- **PapersWithCode** (API) &mdash; respects pagination and window limits; normalises authors/summary.
- **Anthropic** &mdash; currently disabled (their RSS returns 404). Re-enable when a valid feed exists.

## 8. LLM Controls
- Default provider: GPT-5 Low (`openai_gpt5_low`).
- Fallback chain: GPT-5 Low → GPT-4o mini → Local GGUF stub → (optionally mock when forced).
- Override provider: `export LLM_PROVIDER=mock_llm` (good for development or CI dry runs).
- Debug chain: `LLM_DEBUG=true` logs provider instantiation order.

## 9. Troubleshooting Tips
| Symptom | Likely Cause & Fix |
| --- | --- |
| No PR created in dry-run | Expected behaviour (dry-run short-circuits PR). Check `execution-summary.json` for metrics. |
| No events selected | Adjust `significance_threshold` / scoring weights in `config/pipeline.yaml`; confirm LLM provider. |
| OpenAI 401 errors | Ensure valid `OPENAI_API_KEY` and not forcing `mock_llm`. |
| GitHub “Bad credentials” | Verify `GIT_TOKEN` scope and `TIMELINE_REPO` value. |
| Connector fetch failure | Inspect `timeline-update.log`. Update connector parser or configuration. |

## 10. Routine Maintenance Checklist
1. **Before merging changes**
   - `npm run typecheck`
   - `npm test`
   - Dry-run (`LLM_PROVIDER=mock_llm DRY_RUN=true npm run dev`)
2. **After updating configs**
   - Re-run tests.
   - Spot-check connector outputs (fixtures if needed).
3. **Monitoring**
   - Review daily GitHub Action run (06:00 UTC).
   - Check artefacts (`execution-summary.json`, `timeline-update.log`).
   - If `SUMMARY_ISSUE_NUMBER` is set, read the daily comments.
4. **Production validation**
   - Periodically run full pipeline locally (with real LLM + PAT).
   - Inspect generated `reports/<date>.md` and timeline diff before approving PRs.

> Tip for new engineers: start with the dry-run command, inspect the logs and summary, then move on to the full run once secrets are in place. All runtime knobs are in `config/` or environment variables, so changing behaviour rarely requires touching the TypeScript code.
