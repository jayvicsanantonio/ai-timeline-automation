# Contributing to AI Timeline Automation

Thank you for your interest in contributing to the AI Timeline Automation System! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Architecture Guidelines](#architecture-guidelines)

## 🤝 Code of Conduct

This project adheres to a code of conduct adapted from the [Contributor Covenant](https://www.contributor-covenant.org/). By participating, you are expected to uphold this code.

### Our Standards

- Be respectful and inclusive
- Focus on constructive feedback
- Accept responsibility for mistakes
- Show empathy towards other community members

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** 8+
- **Git** for version control
- **OpenAI API Key** for testing analysis features
- **GitHub Token** for testing GitHub integration

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/ai-timeline-automation.git
   cd ai-timeline-automation
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your development credentials
   ```

5. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

6. **Start development mode**:
   ```bash
   npm run dev
   ```

## 🔄 Development Process

### Workflow

1. **Create a branch** for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes** following our code style
3. **Write/update tests** for your changes
4. **Update documentation** if needed
5. **Test thoroughly**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run test:coverage
   ```

6. **Commit your changes** using conventional commits
7. **Push to your fork** and create a pull request

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Maintenance tasks

## 🎨 Code Style

### TypeScript Guidelines

- **Strict mode**: Always enabled
- **No `any` types**: Use proper typing or `unknown`
- **Explicit return types**: For public functions
- **Interface over type**: Use interfaces for object shapes

```typescript
// Good
interface UserConfig {
  apiKey: string;
  maxRetries: number;
}

function processConfig(config: UserConfig): Promise<ProcessedConfig> {
  // Implementation
}

// Avoid
function processConfig(config: any) {
  // Implementation
}
```

### Naming Conventions

- **Classes**: PascalCase (`EventAnalyzer`)
- **Functions/Variables**: camelCase (`analyzeEvents`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Files**: kebab-case (`event-analyzer.ts`)
- **Interfaces**: PascalCase, descriptive (`AnalyzedEvent`)

### Error Handling

```typescript
// Use custom error types
throw new NewsSourceError('HackerNews', 'API timeout', { retryCount: 3 });

// Implement proper error boundaries
const result = await errorBoundary.execute(
  () => collector.fetchEvents(),
  [] // fallback value
);
```

### Async/Await

- **Prefer async/await** over Promises
- **Handle errors** explicitly
- **Use proper typing** for async functions

```typescript
async function fetchData(): Promise<DataResult> {
  try {
    const data = await api.getData();
    return processData(data);
  } catch (error) {
    logger.error('Data fetch failed', error);
    throw new DataFetchError('Failed to retrieve data', { cause: error });
  }
}
```

## 🧪 Testing

### Test Structure

```typescript
describe('ComponentName', () => {
  let component: ComponentName;
  
  beforeEach(() => {
    component = new ComponentName();
  });

  describe('methodName', () => {
    it('should handle successful case', async () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = await component.methodName(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should handle error case', async () => {
      // Test error scenarios
      await expect(component.methodName(invalidInput))
        .rejects.toThrow('Expected error message');
    });
  });
});
```

### Test Guidelines

- **Unit tests**: Test individual components in isolation
- **Integration tests**: Test component interactions
- **Mock external dependencies**: Use Jest mocks for APIs
- **Test error scenarios**: Include failure cases
- **Descriptive test names**: Clear what is being tested

### Coverage Requirements

- **Minimum 80%** overall coverage
- **100%** for critical paths (error handling, data processing)
- **New code**: Must include tests
- **Bug fixes**: Add regression tests

## 📚 Documentation

### Code Documentation

```typescript
/**
 * Analyzes events for significance and impact
 * 
 * @param events - Raw events to analyze
 * @param config - Analysis configuration
 * @returns Promise resolving to analyzed events with scores
 * 
 * @throws {AnalysisError} When AI analysis fails
 * @throws {ValidationError} When events are invalid
 * 
 * @example
 * ```typescript
 * const analyzed = await analyzer.analyzeEvents(events, config);
 * console.log(`Found ${analyzed.length} significant events`);
 * ```
 */
async analyzeEvents(
  events: RawEvent[], 
  config: AnalysisConfig
): Promise<AnalyzedEvent[]> {
  // Implementation
}
```

### README Updates

- Update README.md for new features
- Include usage examples
- Update configuration documentation
- Add troubleshooting info for new issues

## 📝 Submitting Changes

### Commit Messages

Use [Conventional Commits](https://conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (no logic changes)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Maintenance tasks

**Examples:**
```
feat(collectors): add Reddit news source collector

- Implement RedditCollector class
- Add configuration for subreddit filtering
- Include rate limiting for Reddit API
- Add comprehensive unit tests

Closes #123
```

```
fix(github): handle rate limiting in PR creation

- Add exponential backoff for GitHub API calls
- Improve error messages for rate limit scenarios
- Add retry mechanism for failed PR creation

Fixes #456
```

### Pull Request Guidelines

#### PR Title
Follow the same convention as commit messages:
```
feat(scope): brief description of changes
```

#### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Changes Made
- List key changes made
- Include any new dependencies
- Note any configuration changes

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated existing tests if needed
- [ ] Manual testing completed

## Documentation
- [ ] Updated README if needed
- [ ] Updated code comments
- [ ] Updated type definitions
- [ ] Added JSDoc for new public APIs

## Checklist
- [ ] My code follows the project's code style
- [ ] I have performed a self-review of my code
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged
```

#### Review Process

1. **Automated checks** must pass (linting, tests, build)
2. **Code review** by maintainers
3. **Address feedback** if requested
4. **Squash and merge** after approval

## 🏗 Architecture Guidelines

### Adding New Data Sources

1. **Extend NewsSource** abstract class:
```typescript
export class NewSourceCollector extends NewsSource {
  constructor(config: NewsSourceConfig) {
    super(config);
  }

  async fetchEvents(): Promise<RawEvent[]> {
    // Implementation
  }
}
```

2. **Add configuration** support:
```typescript
// In config schema
NEW_SOURCE_API_KEY?: string;
```

3. **Register in orchestrator**:
```typescript
case 'newsource':
  return new NewSourceCollector(config);
```

4. **Add comprehensive tests**

### Modifying Analysis Logic

1. **Extend AnalyzedEvent** interface if needed
2. **Update analysis prompt** in EventAnalyzer
3. **Modify scoring algorithm** with care
4. **Add backward compatibility** for existing data
5. **Update tests** thoroughly

### GitHub Integration Changes

1. **Maintain API compatibility** 
2. **Handle rate limiting** properly
3. **Add error recovery** mechanisms
4. **Test with real GitHub API** in development
5. **Document new permissions** required

## 🐛 Bug Reports

### Before Reporting

1. **Check existing issues** for duplicates
2. **Test with latest version**
3. **Try to reproduce** consistently
4. **Gather relevant logs** and error messages

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run command '...'
2. With configuration '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- OS: [e.g., macOS 14.0]
- Node.js version: [e.g., 18.17.0]
- npm version: [e.g., 9.6.7]

**Logs**
Include relevant log output (remove sensitive information).

**Additional context**
Any other context about the problem.
```

## 💡 Feature Requests

### Before Requesting

1. **Check existing issues** and discussions
2. **Consider the scope** and complexity
3. **Think about use cases** and benefits
4. **Consider alternatives** or workarounds

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Use cases**
Specific scenarios where this would be helpful.

**Implementation ideas**
If you have ideas about how this could be implemented.

**Additional context**
Any other context about the feature request.
```

## 🏷 Labels and Project Management

### Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Improvements or additions to docs
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention is needed
- `question` - Further information is requested
- `wontfix` - This will not be worked on

### Priority Labels

- `priority: high` - Critical issues
- `priority: medium` - Normal priority
- `priority: low` - Nice to have

### Component Labels

- `collectors` - Data collection components
- `analyzers` - AI analysis components
- `github` - GitHub integration
- `config` - Configuration management
- `tests` - Testing related
- `ci/cd` - Continuous integration

## 📞 Getting Help

### Community

- **GitHub Discussions**: For questions and general discussion
- **Issues**: For bug reports and feature requests
- **Pull Requests**: For code contributions

### Maintainers

- Review pull requests
- Triage issues
- Make architectural decisions
- Release management

### Response Times

- **Bug reports**: Within 48 hours
- **Feature requests**: Within 1 week
- **Pull requests**: Within 1 week
- **Questions**: Within 24-48 hours

---

Thank you for contributing to the AI Timeline Automation System! Your contributions help make AI development more transparent and accessible. 🚀
