# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`: `collectors/` ingest feeds, `analyzers/` score events, `orchestrator/` coordinates weekly updates, `github/` manages PRs, and shared helpers land in `lib/`, `providers/`, `types/`, `utils/`. Tests sit beside code in `src/**/__tests__` with reusable fixtures in `tests/__fixtures__/`. Build outputs go to `dist/`, and reference docs sit in `docs/` and `project-specs/`.

## Build, Test, and Development Commands
- `npm run dev` — run `tsx src/index.ts` with reload for local work.
- `npm run build` — transpile to `dist/` after `npm run clean`.
- `npm run update` / `npm start` — execute the production entrypoint in Node.
- `npm run lint` / `npm run lint:fix` — enforce ESLint rules defined in `.eslintrc.json`.
- `npm run typecheck` — run `tsc --noEmit`; gate pull requests on a clean exit.
- `npm test`, `npm run test:watch`, `npm run test:coverage` — drive the Jest suite and collect coverage reports.

## Coding Style & Naming Conventions
Stick to Node 18+, strict TypeScript, two-space indentation, and semicolons. Favor `async/await`, explicit return types on exported APIs, and dependency-injected constructors. ESLint (`@typescript-eslint/recommended`) flags unused identifiers—prefix intentional ignores with `_`—and warns on `any`. Name classes and interfaces in PascalCase, functions and variables in camelCase, constants in UPPER_SNAKE_CASE, and files in kebab-case such as `timeline-orchestrator.ts`.

## Testing Guidelines
Jest with `ts-jest` targets `src/**/__tests__` (see `jest.config.js`). Add `.test.ts` or `.spec.ts` files next to the module under test and pull shared payloads from `tests/__fixtures__/`. Maintain the configured minimums (≥30% lines/statements, ≥25% branches, ≥30% functions) and inspect `coverage/lcov-report/index.html` before submitting. Use `npm run test:watch` for tight feedback loops.

## Commit & Pull Request Guidelines
Write imperative, sentence-case subjects ≤72 characters—recent history shows verbs like “Enhance”, “Fix”, and “Add”. Keep commits focused, add detail in the body when touching automation or CI, and push from branches named after the change type (`feature/...`, `fix/...`, `docs/...`, etc.). Pull requests should link issues, summarize impact, include evidence of `npm test` (or coverage) runs, and highlight changes to `.env` expectations or `NEWS_SOURCES_STATUS.md`.

## Environment & Secrets
Copy `.env.example` to `.env` and populate keys (`OPENAI_API_KEY`, `GITHUB_TOKEN`, feed overrides). Never commit secrets; rely on GitHub Actions secrets for scheduled updates. Scripts like `test-automation.sh` and `test-github-workflow.sh` provide local smoke tests that mimic the CI environment.
