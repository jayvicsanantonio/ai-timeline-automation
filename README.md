# AI Timeline Automation System

[![Daily AI Timeline Update](https://github.com/jayvicsanantonio/ai-timeline-automation/actions/workflows/daily-update.yml/badge.svg)](https://github.com/jayvicsanantonio/ai-timeline-automation/actions/workflows/daily-update.yml)
[![CI](https://github.com/jayvicsanantonio/ai-timeline-automation/actions/workflows/ci.yml/badge.svg)](https://github.com/jayvicsanantonio/ai-timeline-automation/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

 **Automated AI news gathering and timeline update system** that collects, analyzes, and curates significant AI developments from multiple sources into a structured timeline.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

The AI Timeline Automation System automatically:

1. **Collects** AI-related news and research from multiple sources (DeepMind Blog, OpenAI Blog, Hugging Face Blog, Microsoft AI News, Google AI News, and more curated feeds)
2. **Deduplicates** similar content to avoid redundancy
3. **Analyzes** content using AI to determine significance and impact
4. **Curates** the most important developments based on configurable thresholds
5. **Updates** a timeline repository via automated pull requests
6. **Monitors** the entire process with comprehensive metrics and logging

## Features

### **Multi-Source Data Collection**

- **DeepMind/OpenAI/Hugging Face Blogs**: Official announcements and research posts
- **Extensible RSS/API connectors**: Enable or add new feeds in `config/sources.yaml`
- **Extensible**: Easy to add new data sources

### **AI-Powered Analysis**

- **Significance Scoring**: Multi-dimensional analysis (technical, commercial, social impact)
- **Content Categorization**: Automatic classification of developments
- **Impact Assessment**: Breakthrough, development, research, adoption categories
- **Smart Filtering**: Configurable significance thresholds

### **Robust Automation**

- **Error Handling**: Circuit breakers and retry mechanisms
- **Rate Limiting**: Respectful API usage with backoff strategies
- **Deduplication**: Advanced similarity detection across sources
- **GitHub Integration**: Automated PR creation and timeline updates

### **Monitoring & Observability**

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Metrics Collection**: Comprehensive performance and success tracking
- **Error Tracking**: Detailed error reporting and recovery metrics
- **Execution Summaries**: Complete workflow visibility

## Architecture

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Data Sources │ │ Processing │ │ Output │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ • HackerNews │───▶│ • Collection │───▶│ • Timeline JSON │
│ • Vendor Blogs │ │ • Deduplication │ │ • GitHub PR │
│ • RSS Feeds │ │ • AI Analysis │ │ • Notifications │
└─────────────────┘ │ • Scoring │ └─────────────────┘
 │ • Selection │
 └─────────────────┘

Core Components:
├── Collectors/ - Data source integrations
├── Analyzers/ - AI-powered content analysis
├── GitHub/ - Repository and PR management
├── ️ Utils/ - Error handling, retry, logging
├── Orchestrator/ - Main workflow coordination
└── ️ Config/ - Environment and settings
```

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** 8+
- **OpenAI API Key**: Required for AI-powered analysis
- **GitHub Token** with repository access

### 1. Clone and Install

```bash
git clone <repository-url>
cd ai-timeline-automation
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and settings
```

### 3. Run Development Mode

```bash
npm run dev
```

### 4. Build and Deploy

```bash
npm run build
npm run update
```

## Installation

### Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development with auto-reload
npm run dev
```

### Production Deployment

```bash
# Install production dependencies only
npm ci --only=production

# Build for production
npm run build

# Run the automation
npm start
```

## ️ Configuration

### Required Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-... # OpenAI API key (required)
AI_MODEL=gpt-4o-mini # Optional, defaults to gpt-4o-mini

# GitHub Integration
GIT_TOKEN=ghp_... # GitHub personal access token
TIMELINE_REPO=username/ai-timeline # Target repository (owner/repo)

# Optional Configuration
MAX_EVENTS_PER_WEEK=3 # Maximum events to include per week
SIGNIFICANCE_THRESHOLD=7.0 # Minimum significance score (0-10)
NEWS_SOURCES=hackernews,openai_blog,rss # Comma-separated source list
LOG_LEVEL=info # Logging level (error|warn|info|debug)
DRY_RUN=false # Set to true for testing without GitHub updates

# Optional API Keys
HACKERNEWS_API_KEY=... # HackerNews API key (if required)
```

## Usage

### Command Line Interface

```bash
# Run the complete automation workflow
npm run update

# Development mode with auto-reload
npm run dev

# Run specific commands
npm run build # Build TypeScript
npm run test # Run test suite
npm run lint # Lint code
npm run typecheck # Type checking only
```

### GitHub Actions (Automated)

The system includes a pre-configured GitHub Actions workflow that runs weekly:

```yaml
# .github/workflows/weekly-update.yml
# Runs every Sunday at 00:00 UTC
# Supports manual triggers with custom parameters
```

## ‍ Development

### Project Structure

```
src/
├── analyzers/ # AI-powered content analysis
│ ├── event-analyzer.ts
│ └── __tests__/
├── collectors/ # Data source integrations
│ ├── hackernews.ts
│ ├── arxiv.ts
│ ├── rss.ts
│ └── __tests__/
├── github/ # GitHub API integration
│ ├── github-manager.ts
│ ├── timeline-reader.ts
│ └── __tests__/
├── lib/ # Core business logic
│ ├── deduplication.ts
│ └── __tests__/
├── orchestrator/ # Main workflow coordination
│ ├── weekly-update-orchestrator.ts
│ └── __tests__/
├── types/ # TypeScript type definitions
│ ├── events.ts
│ └── sources.ts
├── utils/ # Utilities and infrastructure
│ ├── errors.ts
│ ├── retry.ts
│ ├── circuit-breaker.ts
│ ├── logger.ts
│ ├── metrics.ts
│ └── __tests__/
├── config/ # Configuration management
│ └── index.ts
└── index.ts # Main entry point
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test files
npm test -- collectors/hackernews.test.ts
```

## Deployment

### GitHub Actions (Recommended)

The project includes a complete GitHub Actions workflow:

1. **Enable GitHub Actions** in your repository
2. **Configure Secrets** in repository settings:
 ```
 OPENAI_API_KEY=sk-...
 GIT_TOKEN=ghp_... # GitHub Personal Access Token
 ```
3. **Configure Variables**:
 ```
 TIMELINE_REPO=username/ai-timeline
 NEWS_SOURCES=hackernews,arxiv,rss
 LOG_LEVEL=info
 ```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

**Problem**: `401 Unauthorized` or `403 Forbidden` responses

**Solutions**:

```bash
# Check API key validity
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models

# Verify GitHub token permissions
curl -H "Authorization: token $GIT_TOKEN" https://api.github.com/user

# Ensure token has required scopes:
# - repo (for repository access)
# - workflow (if updating workflows)
```

#### 2. Configuration Errors

**Problem**: `ConfigurationError: Missing required variables`

**Solutions**:

```bash
# Validate all required environment variables are set
npm run typecheck

# Check .env file format
cat .env

# Validate configuration
node -e "console.log(require('./dist/config').validateConfig())"
```

### Debug Mode

Enable detailed debugging:

```bash
# Set debug logging
LOG_LEVEL=debug npm run update

# Enable dry run for testing
DRY_RUN=true LOG_LEVEL=debug npm run update
```

## Contributing

### Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create** a feature branch
4. **Make** your changes
5. **Test** thoroughly
6. **Submit** a pull request

### Development Guidelines

#### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Automated linting
- **Prettier**: Code formatting
- **Conventional Commits**: Structured commit messages

#### Testing Requirements

- **Unit Tests**: Required for all new components
- **Integration Tests**: Required for workflow changes
- **Coverage**: Maintain >80% code coverage
- **Type Safety**: No `any` types without justification

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Questions or Issues?**

- Open an [issue](../../issues)
- Start a [discussion](../../discussions)
- Check the [wiki](../../wiki) for additional documentation

**Happy Automating!**
