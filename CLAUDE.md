# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI Timeline Automation System** that collects, analyzes, and curates significant AI developments from multiple sources into a structured timeline. The system uses AI-powered analysis to determine significance and automatically creates GitHub pull requests to update timeline repositories.

## Essential Commands

### Development
```bash
# Start development with auto-reload
npm run dev

# Build the project
npm run build

# Run the automation (main command)
npm run update
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- collectors/hackernews.test.ts
```

### Code Quality
```bash
# Lint TypeScript files
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Type checking only (no build)
npm run typecheck

# Clean build directory
npm run clean
```

## Core Architecture

### Main Workflow (`src/index.ts`)
Entry point that coordinates the entire automation workflow:
1. **Configuration validation** using Zod schemas
2. **Collector initialization** based on configured news sources
3. **Orchestrator execution** that manages the complete pipeline
4. **Result handling** with GitHub Actions integration

### Orchestrator Pattern (`src/orchestrator/weekly-update-orchestrator.ts`)
Central coordinator that manages:
- **Multi-source data collection** with parallel execution
- **Circuit breaker and retry policies** for resilience
- **Deduplication and AI analysis** pipeline
- **GitHub PR creation** for timeline updates
- **Comprehensive error handling** and metrics collection

### Collector Architecture (`src/collectors/`)
Pluggable data source integrations:
- **HackerNews Collector**: Top AI stories with score filtering
- **ArXiv Collector**: Latest AI/ML research papers (cs.AI, cs.LG)
- **RSS Collector**: Configurable tech blog feeds
- **Extensible design**: Easy to add new collectors by implementing `NewsCollector` interface

### AI Analysis Pipeline (`src/analyzers/event-analyzer.ts`)
Uses OpenAI API for:
- **Significance scoring**: Multi-dimensional analysis (technical, commercial, social impact)
- **Content categorization**: Breakthrough, development, research, adoption
- **Smart filtering**: Configurable significance thresholds

### GitHub Integration (`src/github/`)
- **GitHub Manager**: PR creation and repository management
- **Timeline Reader**: Existing timeline parsing and validation
- **Automated PR workflow**: Branch creation, content updates, and submission

### Resilience Infrastructure (`src/utils/`)
- **Circuit Breaker**: Prevents cascade failures across services
- **Retry Policies**: Configurable retry with exponential backoff
- **Error Handling**: Structured error types with proper context
- **Metrics Collection**: Performance and success tracking

## Configuration System

### Environment Variables (Required)
```bash
OPENAI_API_KEY=sk-...          # OpenAI API key for AI analysis
GIT_TOKEN=ghp_...              # GitHub token for PR creation
TIMELINE_REPO=owner/repo       # Target timeline repository
```

### Optional Configuration
```bash
AI_MODEL=gpt-4o-mini           # OpenAI model (default: gpt-4o-mini)
MAX_EVENTS_PER_WEEK=3          # Max events per update (default: 3)
SIGNIFICANCE_THRESHOLD=7.0     # Min significance score (default: 7.0)
NEWS_SOURCES=hackernews,arxiv,rss  # Comma-separated sources
LOG_LEVEL=info                 # Logging level
DRY_RUN=false                  # Test mode without PR creation
```

### Configuration Validation (`src/config/index.ts`)
- **Zod schemas** for runtime validation
- **Environment loading** with dotenv support
- **Type-safe configuration** with proper defaults
- **Secret redaction** for logging

## File Structure Patterns

### Module Organization
- Each module exports through `index.ts` for clean imports
- Test files use `__tests__/` directories alongside source
- Types are centralized in `src/types/` with specific exports

### Key Directories
```
src/
├── analyzers/          # AI-powered content analysis
├── collectors/         # Data source integrations
├── github/            # GitHub API integration
├── lib/               # Core business logic (deduplication)
├── orchestrator/      # Main workflow coordination
├── types/             # TypeScript type definitions
├── utils/             # Infrastructure utilities
└── config/           # Configuration management
```

## Testing Strategy

- **Jest** with ts-jest for TypeScript support
- **Unit tests** required for all components
- **Integration tests** for workflow validation
- **Coverage thresholds** enforced (branches: 25%, functions/lines/statements: 30%)
- **Test isolation** with proper mocking of external dependencies

## GitHub Actions Integration

The project includes comprehensive GitHub Actions workflows:
- **Weekly automation** (`weekly-update.yml`) runs every Sunday
- **CI pipeline** with test validation
- **Manual triggers** with configurable parameters
- **Artifact collection** and failure notifications
- **Environment variable validation** before execution

## Development Notes

- **TypeScript strict mode** enabled with comprehensive type checking
- **ESLint configuration** with TypeScript-specific rules
- **Error handling** follows structured patterns with custom error types
- **Logging** uses structured JSON format with correlation IDs
- **Rate limiting** implemented for respectful API usage
- **Dependency injection** used for testability and modularity

## Binary Distribution

The project builds to a CLI tool:
- **Binary name**: `ai-timeline-update`
- **Entry point**: `dist/index.js`
- **Node.js requirement**: >=18.0.0