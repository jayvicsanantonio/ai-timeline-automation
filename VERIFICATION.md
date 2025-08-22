# AI Timeline Automation - Verification Guide

## 🎯 Overview

This guide helps you verify that the AI Timeline Automation works correctly and creates pull requests to your `ai-timeline` repository.

## ✅ Current Status

Based on our testing, the following components are **working correctly**:

1. **Build System**: TypeScript compilation succeeds
2. **Configuration Loading**: Environment variables are properly loaded
3. **News Collection**: Successfully collects events from HackerNews and ArXiv
4. **Deduplication**: Removes duplicate events
5. **Repository Targeting**: Configured to target `jayvicsanantonio/ai-timeline`
6. **Dry-Run Mode**: Prevents PR creation when enabled
7. **Metrics & Logging**: Tracks and reports execution metrics

## 🔧 Setup Requirements

### 1. Environment Variables

Update your `.env` file with valid credentials:

```bash
# Required for AI analysis
OPENAI_API_KEY=sk-your-actual-openai-api-key

# Required for PR creation (needs repo write access)
GITHUB_TOKEN=ghp_your-github-personal-access-token

# Target repository (already configured)
TIMELINE_REPO=jayvicsanantonio/ai-timeline

# Optional: Start with dry-run for testing
DRY_RUN=true
```

### 2. GitHub Token Permissions

Your GitHub token needs the following scopes:
- `repo` - Full control of private repositories
- `workflow` - Update GitHub Action workflows (if needed)

Create a token at: https://github.com/settings/tokens/new

## 📋 Verification Steps

### Step 1: Quick Test with Dry-Run

```bash
# Run the automated test script
./test-automation.sh
```

This script will:
- Validate your environment setup
- Build the project
- Run in dry-run mode
- Test GitHub authentication
- Check repository access

### Step 2: Manual Dry-Run Test

```bash
# Ensure dry-run is enabled
export DRY_RUN=true

# Build and run
npm run build
npm run update
```

Expected output:
- ✅ Collects 100+ events from news sources
- ✅ Analyzes events with AI (if OPENAI_API_KEY is valid)
- ✅ Selects top events above significance threshold
- ✅ Shows "DRY RUN MODE - No PR will be created"

### Step 3: Test with Real PR Creation

⚠️ **Warning**: This will create an actual PR in your repository!

```bash
# Disable dry-run
export DRY_RUN=false

# Optional: Limit events for testing
export MAX_EVENTS_PER_WEEK=2

# Run the automation
npm run update
```

Expected behavior:
1. Collects and analyzes events
2. Creates branch: `auto-update/week-YYYY-WW`
3. Updates `data/timeline-events.json`
4. Creates PR with detailed description
5. Adds appropriate labels

### Step 4: Verify the Pull Request

Check your repository for the new PR:
- URL: https://github.com/jayvicsanantonio/ai-timeline/pulls
- Branch name: `auto-update/week-2025-51` (or current week)
- PR should contain:
  - Summary of events analyzed
  - List of selected events with significance scores
  - Proper categorization and metadata

## 🧪 Test Scenarios

### Scenario 1: No Valid API Keys
```bash
# Use placeholder keys
OPENAI_API_KEY=invalid_key npm run update
```
- ✅ Should collect events
- ⚠️ Should fail to analyze (expected)
- ✅ Should not create PR (no events selected)

### Scenario 2: Valid Keys, Dry-Run
```bash
DRY_RUN=true npm run update
```
- ✅ Should complete full workflow
- ✅ Should NOT create PR
- ✅ Should save execution-summary.json

### Scenario 3: Full Execution
```bash
DRY_RUN=false npm run update
```
- ✅ Should create actual PR
- ✅ Should update timeline file
- ✅ Should add labels to PR

## 📊 Monitoring Execution

### Check Execution Summary
```bash
cat execution-summary.json | jq .
```

Example output:
```json
{
  "success": true,
  "metrics": {
    "totalCollected": 136,
    "afterDeduplication": 136,
    "analyzed": 50,
    "selected": 3,
    "duration": 45
  },
  "timestamp": "2025-08-22T20:00:00.000Z"
}
```

### Check Logs
```bash
# For detailed debugging
LOG_LEVEL=debug npm run update
```

## 🚨 Troubleshooting

### Issue: "No events analyzed"
- **Cause**: Invalid OPENAI_API_KEY
- **Fix**: Add valid OpenAI API key to .env

### Issue: "Failed to create pull request"
- **Cause**: Invalid GITHUB_TOKEN or no repository access
- **Fix**: 
  1. Generate new token with `repo` scope
  2. Ensure you have write access to the repository

### Issue: "Branch already exists"
- **Cause**: Previous run created the branch
- **Fix**: The automation handles this automatically by updating the existing branch

### Issue: "No events meet significance threshold"
- **Cause**: Events not significant enough
- **Fix**: Lower `SIGNIFICANCE_THRESHOLD` in .env (default: 7.0)

## 🔄 GitHub Actions Integration

The automation is designed to run weekly via GitHub Actions:

```yaml
# .github/workflows/weekly-update.yml
schedule:
  - cron: '0 0 * * 0'  # Every Sunday at midnight
```

To test the GitHub Action:
1. Push this code to a GitHub repository
2. Add secrets: OPENAI_API_KEY, GITHUB_TOKEN
3. Manually trigger: Actions → Weekly AI Timeline Update → Run workflow

## 📈 Success Metrics

A successful run should:
- Collect 50+ events from news sources
- Analyze at least 20 events with AI
- Select 1-3 highly significant events
- Create a well-formatted PR
- Complete in under 2 minutes

## 🎉 Verification Complete!

Once you see a PR created in your `ai-timeline` repository with:
- ✅ Proper branch naming
- ✅ Updated timeline-events.json
- ✅ Detailed PR description
- ✅ Appropriate labels

**Your automation is working perfectly!** 🚀

## 📝 Next Steps

1. Review and merge the created PR
2. Set up GitHub Actions for weekly automation
3. Adjust thresholds based on quality of selected events
4. Add more news sources as needed

For questions or issues, check the logs or run with `LOG_LEVEL=debug`.
