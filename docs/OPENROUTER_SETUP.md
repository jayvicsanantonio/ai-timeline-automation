# Using OpenRouter with AI Timeline Automation

## Overview

This automation now supports **OpenRouter** as an alternative to OpenAI, allowing you to use free or low-cost AI models including the `moonshotai/kimi-k2:free` model.

## Why OpenRouter?

- **Free models available** - Several high-quality models with free tiers
- **Wide model selection** - Access to models from multiple providers
- **Cost-effective** - Generally lower costs than direct OpenAI API
- **Single API** - Access multiple AI providers through one API

## Quick Setup

### 1. Get an OpenRouter API Key

1. Visit [OpenRouter.ai](https://openrouter.ai)
2. Sign up for a free account
3. Go to [API Keys](https://openrouter.ai/keys)
4. Create a new API key

### 2. Configure Environment Variables

Update your `.env` file:

```bash
# AI Provider Configuration
AI_PROVIDER=openrouter
AI_MODEL=moonshotai/kimi-k2:free  # Free model!

# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# GitHub Configuration
GITHUB_TOKEN=ghp_your_github_token
TIMELINE_REPO=jayvicsanantonio/ai-timeline

# Optional Settings
DRY_RUN=true  # Test first without creating PR
```

### 3. Test the Configuration

```bash
# Build the project
npm run build

# Run in dry-run mode to test
npm run update
```

## Available Free Models on OpenRouter

The automation supports any OpenRouter model. Here are recommended free options:

| Model | Provider | Best For |
|-------|----------|----------|
| `moonshotai/kimi-k2:free` | Moonshot AI | Long context, good reasoning |
| `meta-llama/llama-3-8b-instruct:free` | Meta | General purpose, reliable |
| `mistralai/mistral-7b-instruct:free` | Mistral | Fast, efficient |
| `qwen/qwen-2-7b-instruct:free` | Alibaba | Multilingual support |
| `google/gemma-7b-it:free` | Google | Instruction following |
| `microsoft/phi-3-mini-128k-instruct:free` | Microsoft | Small but capable |
| `nousresearch/nous-capybara-7b:free` | Nous Research | Creative tasks |

## Switching Between Providers

### Use OpenRouter

```bash
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
AI_MODEL=moonshotai/kimi-k2:free
```

### Use OpenAI

```bash
AI_PROVIDER=openai
OPENROUTER_API_KEY=your_key
AI_MODEL=gpt-4o-mini  # or gpt-3.5-turbo, gpt-4, etc.
```

## Testing Different Models

You can easily test different models by changing the `AI_MODEL` variable:

```bash
# Test with Kimi K2 (good for analysis)
AI_MODEL=moonshotai/kimi-k2:free npm run update

# Test with Llama 3 (balanced performance)
AI_MODEL=meta-llama/llama-3-8b-instruct:free npm run update

# Test with Mistral (fast)
AI_MODEL=mistralai/mistral-7b-instruct:free npm run update
```

## Cost Considerations

### Free Tier Limits

Most free models on OpenRouter have rate limits:
- Requests per minute: 10-20
- Requests per day: 100-1000
- Check [OpenRouter Pricing](https://openrouter.ai/models) for current limits

### Paid Models

If you need higher limits or better models:
1. Add credits to your OpenRouter account
2. Use premium models like:
   - `openai/gpt-4-turbo-preview`
   - `anthropic/claude-3-opus`
   - `google/gemini-pro`

## Troubleshooting

### "Invalid API Key" Error

```bash
# Check your key format (should start with sk-or-)
echo $OPENROUTER_API_KEY

# Ensure it's set correctly
export OPENROUTER_API_KEY=sk-or-v1-your-actual-key
```

### "Model not found" Error

Ensure the model name is exact:
```bash
# Correct (includes :free suffix for free models)
AI_MODEL=moonshotai/kimi-k2:free

# Wrong
AI_MODEL=kimi-k2
AI_MODEL=moonshotai/kimi
```

### "Rate limit exceeded" Error

Free models have rate limits. Solutions:
1. Wait a few minutes and retry
2. Switch to a different free model
3. Add credits for higher limits

### No Events Analyzed

Some models may struggle with structured output. Try:
1. Switch to a different model
2. Reduce `MAX_EVENTS_PER_WEEK` to process fewer events
3. Use a more capable model like `meta-llama/llama-3-8b-instruct:free`

## Performance Comparison

Based on testing with AI news analysis:

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| `moonshotai/kimi-k2:free` | Medium | Good | Free |
| `meta-llama/llama-3-8b-instruct:free` | Fast | Good | Free |
| `mistralai/mistral-7b-instruct:free` | Very Fast | Fair | Free |
| `openai/gpt-4o-mini` | Fast | Excellent | $0.15/1M tokens |
| `openai/gpt-4-turbo` | Medium | Best | $10/1M tokens |

## GitHub Actions Setup

To use OpenRouter in GitHub Actions:

1. Add secret to your repository:
   - Go to Settings → Secrets → Actions
   - Add `OPENROUTER_API_KEY` with your key

2. Update workflow file:
```yaml
env:
  AI_PROVIDER: openrouter
  AI_MODEL: moonshotai/kimi-k2:free
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TIMELINE_REPO: ${{ github.repository }}
```

## Example Output

When using OpenRouter, you'll see:
```
📋 Validating configuration...
Configuration loaded:
{
  "aiProvider": "openrouter",
  "aiModel": "moonshotai/kimi-k2:free",
  "timelineRepo": "jayvicsanantonio/ai-timeline",
  ...
}
✅ Configuration validated

Using OpenRouter with model: moonshotai/kimi-k2:free
```

## Support

- OpenRouter Documentation: https://openrouter.ai/docs
- OpenRouter Discord: https://discord.gg/openrouter
- Project Issues: https://github.com/jayvicsanantonio/ai-timeline-automation/issues
