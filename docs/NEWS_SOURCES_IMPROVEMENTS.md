# 📰 News Sources Improvement Plan

## Overview

This document outlines the implementation plan for properly mapping the currently unrecognized news source tokens (`openai`, `anthropic`, `verge`, `mittech`, `googleai`) to their respective collectors.

## 🎯 Goal

Enable individual control over news sources via environment variables, allowing users to selectively enable/disable specific sources rather than using the generic `rss` token.

## 📋 Implementation Tasks

### Task 1: Update initializeCollectors Function

**File:** `src/index.ts`

**Current Issue:** 5 tokens in NEWS_SOURCES have no mapping to collectors.

**Solution:** Add individual case statements for each RSS source.

```typescript
/**
 * Initialize collectors based on configuration
 * Updated to support individual RSS feed tokens
 */
function initializeCollectors(sources: string[]) {
  const collectors = [];
  
  for (const source of sources) {
    switch (source.toLowerCase()) {
      // Existing API collectors
      case 'hackernews':
      case 'hn':
        collectors.push(new HackerNewsCollector());
        break;
      
      case 'arxiv':
        collectors.push(new ArXivCollector());
        break;
      
      // Individual RSS feed mappings
      case 'openai':
        collectors.push(new RSSCollector('openai-blog', {
          enabled: true,
          baseUrl: 'https://openai.com',
          feedUrl: 'https://openai.com/blog/rss.xml',
          sourceName: 'OpenAI Blog',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.OFFICIAL,
          requireAIContent: false, // All content is AI-related
        }, 10)); // Highest priority
        break;
      
      case 'anthropic':
        collectors.push(new RSSCollector('anthropic-blog', {
          enabled: true,
          baseUrl: 'https://www.anthropic.com',
          feedUrl: 'https://www.anthropic.com/rss.xml',
          sourceName: 'Anthropic Blog',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.OFFICIAL,
          requireAIContent: false, // All content is AI-related
        }, 9));
        break;
      
      case 'verge':
      case 'theverge':
        collectors.push(new RSSCollector('verge-ai', {
          enabled: true,
          baseUrl: 'https://www.theverge.com',
          feedUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
          sourceName: 'The Verge AI',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.JOURNALISM,
          requireAIContent: false, // Pre-filtered to AI section
        }, 6));
        break;
      
      case 'mittech':
      case 'mit':
        collectors.push(new RSSCollector('mit-tech-review', {
          enabled: true,
          baseUrl: 'https://www.technologyreview.com',
          feedUrl: 'https://www.technologyreview.com/feed/',
          sourceName: 'MIT Technology Review',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.JOURNALISM,
          requireAIContent: true, // Filter for AI content
        }, 7));
        break;
      
      case 'googleai':
      case 'google':
        collectors.push(new RSSCollector('google-ai-blog', {
          enabled: true,
          baseUrl: 'https://blog.google',
          feedUrl: 'https://blog.google/technology/ai/rss',
          sourceName: 'Google AI Blog',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.OFFICIAL,
          requireAIContent: false, // Pre-filtered to AI section
        }, 9));
        break;
      
      // Additional tech blogs
      case 'venturebeat':
      case 'vb':
        collectors.push(new RSSCollector('venturebeat-ai', {
          enabled: true,
          baseUrl: 'https://venturebeat.com',
          feedUrl: 'https://venturebeat.com/category/ai/feed/',
          sourceName: 'VentureBeat AI',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.JOURNALISM,
          requireAIContent: false, // Pre-filtered to AI category
        }, 7));
        break;
      
      case 'mitnews':
        collectors.push(new RSSCollector('mit-news-ai', {
          enabled: true,
          baseUrl: 'https://news.mit.edu',
          feedUrl: 'https://news.mit.edu/rss/topic/artificial-intelligence2',
          sourceName: 'MIT News AI',
          rateLimit: { requests: 10, windowMs: 60000 },
          reliability: SourceReliability.ACADEMIC,
          requireAIContent: false, // Pre-filtered to AI topic
        }, 8));
        break;
      
      // Legacy support - activate multiple RSS feeds
      case 'rss':
      case 'blogs':
        // Add default blog collection
        collectors.push(
          ...this.createDefaultRSSCollectors()
        );
        break;
      
      // Tech blog collection
      case 'techblogs':
        const { createTechBlogCollectors } = require('./collectors/rss');
        collectors.push(...createTechBlogCollectors());
        break;
      
      default:
        console.warn(`Unknown news source: ${source}`);
    }
  }
  
  return collectors;
}

/**
 * Helper to create default RSS collectors
 */
function createDefaultRSSCollectors() {
  const feeds = [
    { 
      id: 'openai-blog',
      url: 'https://openai.com/blog/rss.xml', 
      sourceName: 'OpenAI Blog',
      priority: 10
    },
    { 
      id: 'anthropic-blog',
      url: 'https://www.anthropic.com/rss.xml', 
      sourceName: 'Anthropic Blog',
      priority: 9
    },
    { 
      id: 'google-ai-blog',
      url: 'https://blog.google/technology/ai/rss', 
      sourceName: 'Google AI Blog',
      priority: 9
    },
    { 
      id: 'mit-news-ai',
      url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', 
      sourceName: 'MIT News AI',
      priority: 8
    },
  ];
  
  return feeds.map(feed => {
    const url = new URL(feed.url);
    const origin = `${url.protocol}//${url.host}`;
    
    return new RSSCollector(feed.id, {
      enabled: true,
      baseUrl: origin,
      rateLimit: DEFAULT_RATE_LIMIT,
      reliability: SourceReliability.OFFICIAL,
      feedUrl: feed.url,
      sourceName: feed.sourceName,
    }, feed.priority);
  });
}
```

### Task 2: Add Missing RSS Feed URLs

Some RSS feeds might need verification or updates:

| Source | Current URL | Status | Notes |
|--------|------------|--------|-------|
| OpenAI | https://openai.com/blog/rss.xml | ✅ Verified | Official blog RSS |
| Anthropic | https://www.anthropic.com/rss.xml | ⚠️ Needs verification | May need to check actual RSS URL |
| Google AI | https://blog.google/technology/ai/rss | ✅ Verified | Official Google AI blog |
| The Verge | https://www.theverge.com/rss/ai-artificial-intelligence/index.xml | ✅ Verified | AI section RSS |
| MIT Tech Review | https://www.technologyreview.com/feed/ | ✅ Verified | Main feed (needs AI filtering) |

### Task 3: Add Source Reliability Enum Value

**File:** `src/types/sources.ts`

Add new reliability level for academic sources:

```typescript
export enum SourceReliability {
  OFFICIAL = 10,     // Official company blogs
  ACADEMIC = 9,      // Academic institutions
  JOURNALISM = 7,    // Tech journalism
  COMMUNITY = 5,     // Community-driven
  AGGREGATOR = 3,    // News aggregators
}
```

### Task 4: Update Documentation

**File:** `README.md`

Add comprehensive list of supported sources:

```markdown
## 📰 Supported News Sources

Configure the `NEWS_SOURCES` environment variable with comma-separated values:

### API Sources
- `hackernews` or `hn` - Hacker News top AI stories
- `arxiv` - ArXiv AI/ML research papers

### Company Blogs
- `openai` - OpenAI official blog
- `anthropic` - Anthropic official blog
- `googleai` or `google` - Google AI blog

### Tech Journalism
- `verge` or `theverge` - The Verge AI section
- `mittech` or `mit` - MIT Technology Review
- `venturebeat` or `vb` - VentureBeat AI section

### Academic Sources
- `mitnews` - MIT News AI topics

### Collections
- `rss` or `blogs` - All default RSS feeds
- `techblogs` - All tech journalism feeds

### Example Configurations

```bash
# Maximum coverage
NEWS_SOURCES=hackernews,arxiv,openai,anthropic,googleai,verge,mittech

# Research focused
NEWS_SOURCES=arxiv,mitnews,mittech

# Company announcements only
NEWS_SOURCES=openai,anthropic,googleai

# Community and journalism
NEWS_SOURCES=hackernews,verge,venturebeat
```

### Task 5: Add Feed Validation Script

Create a utility script to verify RSS feeds are accessible:

**File:** `scripts/validate-feeds.ts`

```typescript
#!/usr/bin/env node

import Parser from 'rss-parser';

const RSS_FEEDS = [
  { name: 'OpenAI', url: 'https://openai.com/blog/rss.xml' },
  { name: 'Anthropic', url: 'https://www.anthropic.com/rss.xml' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'MIT News AI', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2' },
];

async function validateFeeds() {
  const parser = new Parser();
  const results = [];
  
  for (const feed of RSS_FEEDS) {
    try {
      console.log(`Checking ${feed.name}...`);
      const result = await parser.parseURL(feed.url);
      
      results.push({
        name: feed.name,
        url: feed.url,
        status: '✅',
        itemCount: result.items?.length || 0,
        lastUpdate: result.items?.[0]?.pubDate || 'Unknown',
      });
      
      console.log(`  ✅ Success: ${result.items?.length} items found`);
    } catch (error) {
      results.push({
        name: feed.name,
        url: feed.url,
        status: '❌',
        error: error.message,
      });
      
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }
  
  // Print summary
  console.log('\n📊 Feed Validation Summary\n');
  console.table(results);
}

validateFeeds().catch(console.error);
```

Add to package.json:
```json
{
  "scripts": {
    "validate-feeds": "tsx scripts/validate-feeds.ts"
  }
}
```

### Task 6: Add Configuration Examples

**File:** `.env.example`

Update with better examples:

```bash
# News Sources Configuration Examples
# =====================================

# Option 1: Comprehensive Coverage (Recommended)
NEWS_SOURCES=hackernews,arxiv,openai,anthropic,googleai,verge,mittech

# Option 2: Research Focused
# NEWS_SOURCES=arxiv,mittech,mitnews

# Option 3: Company Announcements
# NEWS_SOURCES=openai,anthropic,googleai

# Option 4: Tech Journalism
# NEWS_SOURCES=verge,venturebeat,mittech

# Option 5: Minimal (Fast)
# NEWS_SOURCES=hackernews,arxiv

# Option 6: Everything (Slow but complete)
# NEWS_SOURCES=hackernews,arxiv,rss,techblogs
```

## 📅 Implementation Timeline

### Phase 1: Core Mapping (1-2 hours)
1. Update `initializeCollectors()` function
2. Test each individual source token
3. Verify RSS feed URLs are accessible

### Phase 2: Validation (30 minutes)
1. Create feed validation script
2. Run validation for all RSS feeds
3. Update any broken feed URLs

### Phase 3: Documentation (30 minutes)
1. Update README with source list
2. Update .env.example with configurations
3. Create user guide for source selection

### Phase 4: Testing (1 hour)
1. Test each source individually
2. Test common combinations
3. Verify deduplication works across sources

## 🧪 Testing Plan

### Unit Tests

Create `src/__tests__/collectors-mapping.test.ts`:

```typescript
describe('News Source Mapping', () => {
  it('should map openai token to OpenAI RSS collector', () => {
    const collectors = initializeCollectors(['openai']);
    expect(collectors).toHaveLength(1);
    expect(collectors[0].name).toBe('openai-blog');
  });
  
  it('should map anthropic token to Anthropic RSS collector', () => {
    const collectors = initializeCollectors(['anthropic']);
    expect(collectors).toHaveLength(1);
    expect(collectors[0].name).toBe('anthropic-blog');
  });
  
  // ... tests for each token
  
  it('should handle multiple sources', () => {
    const collectors = initializeCollectors(['hackernews', 'arxiv', 'openai']);
    expect(collectors).toHaveLength(3);
  });
  
  it('should warn about unknown sources', () => {
    const consoleSpy = jest.spyOn(console, 'warn');
    initializeCollectors(['unknown-source']);
    expect(consoleSpy).toHaveBeenCalledWith('Unknown news source: unknown-source');
  });
});
```

### Integration Tests

```bash
# Test individual sources
NEWS_SOURCES=openai npm run dev
NEWS_SOURCES=anthropic npm run dev
NEWS_SOURCES=verge npm run dev
NEWS_SOURCES=mittech npm run dev
NEWS_SOURCES=googleai npm run dev

# Test combinations
NEWS_SOURCES=openai,anthropic,googleai npm run dev
NEWS_SOURCES=hackernews,arxiv,verge,mittech npm run dev
```

## 🎯 Success Criteria

1. ✅ All 5 unmapped tokens (`openai`, `anthropic`, `verge`, `mittech`, `googleai`) work individually
2. ✅ Users can selectively enable/disable specific sources
3. ✅ Documentation clearly explains available sources
4. ✅ Feed validation script confirms all RSS URLs are accessible
5. ✅ Tests pass for all source mappings

## 🚀 Future Enhancements

### Additional Sources to Consider

1. **Tech News Sites**
   - TechCrunch AI: `techcrunch`
   - Wired AI: `wired`
   - Ars Technica: `arstechnica`
   - The Information: `theinformation`

2. **Research Institutions**
   - Stanford AI Lab: `stanford`
   - Berkeley AI Research: `bair`
   - DeepMind Blog: `deepmind`
   - Meta AI: `metaai`

3. **Developer Platforms**
   - Hugging Face Blog: `huggingface`
   - GitHub Blog AI: `github`
   - Stack Overflow Blog: `stackoverflow`

4. **Social/Community**
   - Reddit r/MachineLearning: `reddit-ml`
   - Twitter AI Lists: `twitter-ai`
   - LinkedIn AI News: `linkedin`

### Dynamic Source Loading

Consider implementing a plugin system:

```typescript
interface NewsSourcePlugin {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'scraper';
  config: any;
  collector: NewsSource;
}

class PluginManager {
  private plugins: Map<string, NewsSourcePlugin> = new Map();
  
  async loadPlugin(pluginPath: string) {
    const plugin = await import(pluginPath);
    this.plugins.set(plugin.id, plugin);
  }
  
  getCollector(id: string): NewsSource | null {
    return this.plugins.get(id)?.collector || null;
  }
}
```

## 📝 Notes

- RSS feeds may change URLs or become unavailable
- Some feeds require user agent headers or authentication
- Consider caching feed URLs and falling back if primary fails
- Monitor feed quality and remove low-value sources
- Add telemetry to track which sources provide the most valuable events

---

*This improvement plan will enable fine-grained control over news sources and make the system more maintainable and user-friendly.*
