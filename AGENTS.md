# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`, grouped by responsibility: collectors ingest feeds, analyzers score events, the orchestrator coordinates weekly updates, GitHub helpers manage pull requests, and shared utilities sit under `lib/`, `providers/`, `types/`, and `utils/`. Tests reside alongside code in `src/**/__tests__`, with reusable fixtures in `tests/__fixtures__/`. Build artifacts land in `dist/`, while documentation is organized under `docs/` and `project-specs/` for quick reference.

## Build, Test, and Development Commands
Use `npm run dev` for a hot-reloading development loop via `tsx src/index.ts`. Ship-ready bundles come from `npm run build`, which cleans and transpiles to `dist/`. Production execution flows through `npm run update` or `npm start`. Maintain lint hygiene with `npm run lint` or auto-fixes using `npm run lint:fix`. Validate types through `npm run typecheck`, and drive the Jest suite with `npm test`, `npm run test:watch`, or `npm run test:coverage`.

## Coding Style & Naming Conventions
Target Node 18+ and strict TypeScript. Follow two-space indentation, semicolons, and prefer `async/await`. Exported APIs need explicit return types, and dependency injection should drive constructor design. Suppress intentional unused values with an `_` prefix to satisfy ESLint (`@typescript-eslint/recommended`). Name files in kebab-case (e.g., `timeline-orchestrator.ts`), classes and interfaces in PascalCase, and constants in UPPER_SNAKE_CASE.

## Testing Guidelines
Jest with `ts-jest` powers the suite. Name tests `*.test.ts` or `*.spec.ts` beside their modules, reusing fixtures from `tests/__fixtures__/`. Before merging, ensure coverage stays above 30% for lines/statements, 25% for branches, and 30% for functions; inspect `coverage/lcov-report/index.html` when investigating gaps. Favor targeted unit specs alongside orchestrated integration checks.

## Commit & Pull Request Guidelines
Craft imperative, sentence-case commit subjects under 72 characters (e.g., “Enhance timeline analyzer”). Keep each commit focused, expanding in the body when touching automation or CI. Branch names should reflect intent (`feature/...`, `fix/...`, `docs/...`). Pull requests must link relevant issues, summarize impact, document `npm test` results, and flag any `.env` or `NEWS_SOURCES_STATUS.md` adjustments. Screenshots or logs help reviewers when behavior changes.

## Security & Configuration Tips
Copy `.env.example` to `.env` and populate `OPENAI_API_KEY`, `GITHUB_TOKEN`, and feed overrides locally; never commit secrets. CI relies on GitHub Actions secrets, while scripts like `test-automation.sh` and `test-github-workflow.sh` mirror production smoke tests—run them before shipping major orchestrator updates.
