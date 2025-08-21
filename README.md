# AI News Automation

Automated system for gathering weekly AI-related news and events, analyzing their significance, and maintaining a curated timeline of major AI developments.

## Overview

This system runs weekly (every Sunday at 00:00 UTC) to:
1. Gather AI news from multiple sources
2. Analyze and rank events by significance
3. Select the top 3 most impactful events
4. Create a pull request to update the AI timeline repository

## Features

- **Multi-source news gathering**: Collects from HackerNews, ArXiv, tech blogs, and company announcements
- **AI-powered analysis**: Uses LLMs to evaluate event significance across multiple dimensions
- **Automated PR creation**: Generates well-documented pull requests with selected events
- **Resilient architecture**: Circuit breakers, retry logic, and graceful degradation
- **Type-safe**: Built with TypeScript for maintainability

## Architecture

The system consists of three main layers:
- **News Gathering Layer**: Collectors for various news sources with deduplication
- **Analysis Layer**: Event analysis and ranking using Vercel AI SDK
- **Repository Layer**: GitHub integration for timeline updates

## Setup

### Prerequisites

- Node.js 18+ 
- GitHub account with personal access token
- OpenAI API key (or alternative LLM provider)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-news-automation.git
cd ai-news-automation
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Configuration

Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `GITHUB_TOKEN`: GitHub personal access token with repo permissions
- `TIMELINE_REPO`: Target repository for timeline updates (format: `owner/repo`)

Optional configuration:
- `MAX_EVENTS_PER_WEEK`: Maximum events to add per update (default: 3)
- `SIGNIFICANCE_THRESHOLD`: Minimum score for event inclusion (default: 7.0)
- `NEWS_SOURCES`: Comma-separated list of enabled sources

## Development

### Running locally

```bash
# Run the automation once
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Project Structure

```
src/
├── collectors/     # News source collectors
├── analyzers/      # Event analysis and ranking
├── github/         # GitHub integration
├── types/          # TypeScript type definitions
├── lib/            # Shared utilities and services
└── index.ts        # Main entry point
```

## GitHub Actions

The automation runs via GitHub Actions on a weekly schedule. See `.github/workflows/weekly-update.yml` for configuration.

### Manual Trigger

You can manually trigger the workflow from the Actions tab in GitHub or via GitHub CLI:

```bash
gh workflow run weekly-update.yml
```

## Testing

The project includes comprehensive test coverage:
- Unit tests for all collectors and analyzers
- Integration tests for end-to-end workflow
- Mock fixtures for external API responses

Run tests:
```bash
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
```

## Contributing

Please see the project specifications in the `project-specs/` directory for detailed requirements and design documentation.

## License

MIT
