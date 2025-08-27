# GitHub Repository Configuration Guide

## Setting Up Secrets and Variables

To test and run the AI Timeline automation workflow, you need to configure the following secrets and variables in your GitHub repository.

### 1. Navigate to Repository Settings
Go to: `https://github.com/jayvicsanantonio/ai-timeline-automation/settings`

### 2. Configure Secrets
Navigate to: **Secrets and variables** → **Actions** → **Repository secrets**

Add these secrets:

#### Required Secrets:
- **`OPENAI_API_KEY`**
  - Value: Your OpenAI API key (starts with `sk-`)
  - Get it from: https://platform.openai.com/api-keys

- **`GIT_TOKEN`**
  - Value: GitHub Personal Access Token
  - Get it from: https://github.com/settings/tokens
  - Required permissions: `repo` (full control of private repositories)

### 3. Configure Variables
Navigate to: **Secrets and variables** → **Actions** → **Repository variables**

Add these variables:

#### Required Variables:
- **`TIMELINE_REPO`**
  - Value: `jayvicsanantonio/ai-timeline`

#### Optional Variables (will use defaults if not set):
- **`NEWS_SOURCES`** 
  - Default: `hackernews,arxiv,rss`
  - Options: `hackernews,arxiv,rss` (comma-separated)

- **`LOG_LEVEL`**
  - Default: `info`
  - Options: `error,warn,info,debug`

- **`DRY_RUN`**
  - Default: `false`
  - Options: `true,false`

## Testing the Workflow

### Manual Trigger
1. Go to: `https://github.com/jayvicsanantonio/ai-timeline-automation/actions`
2. Select "Weekly AI Timeline Update" workflow
3. Click "Run workflow"
4. Choose your parameters:
   - **Dry run**: `true` (for testing)
   - **Max events**: `3`
   - **Significance threshold**: `7.0`
5. Click "Run workflow"

### Monitoring
- Check the workflow run progress in the Actions tab
- Review logs for any configuration issues
- Look for the generated `execution-summary.json` artifact

## Expected Results

### Successful Dry Run:
- ✅ Configuration validation passes
- ✅ News collection works (events from HackerNews, ArXiv, RSS)
- ✅ AI analysis completes (using OpenAI API)
- ✅ Events are selected based on significance
- ✅ No PR is created (dry run mode)
- ✅ Summary artifact is uploaded

### Successful Production Run:
- All dry run checks pass ✅
- **Plus**: A pull request is created in `jayvicsanantonio/ai-timeline`

## Troubleshooting

### Common Issues:
1. **"Missing required secrets"** - Check that `OPENAI_API_KEY` and `GIT_TOKEN` are set
2. **"Invalid OpenAI API key"** - Verify the API key is correct and active
3. **"Repository access denied"** - Check that `GIT_TOKEN` has `repo` permissions
4. **"Timeline repository not found"** - Verify `TIMELINE_REPO` variable is set correctly

### Debug Tips:
- Set `LOG_LEVEL` variable to `debug` for detailed logs
- Use `DRY_RUN=true` to test without creating PRs
- Check the uploaded artifacts for execution summary
