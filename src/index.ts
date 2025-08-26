#!/usr/bin/env node

/**
 * Main entry point for the AI Timeline Update GitHub Action
 */

import * as fs from 'fs';
import { config, loadConfig, validateConfig } from './config';
import { WeeklyUpdateOrchestrator, OrchestratorResult } from './orchestrator';
import { HackerNewsCollector } from './collectors/hackernews';
import { ArXivCollector } from './collectors/arxiv';
import { RSSCollector } from './collectors/rss';
import { DEFAULT_RATE_LIMIT, SourceReliability } from './types';
import { ConfigurationError } from './utils/errors';

/**
 * Initialize collectors based on configuration
 */
function initializeCollectors(sources: string[]) {
  const collectors = [];
  
  for (const source of sources) {
    switch (source.toLowerCase()) {
      case 'hackernews':
      case 'hn':
        collectors.push(new HackerNewsCollector());
        break;
      
      case 'arxiv':
        collectors.push(new ArXivCollector());
        break;
      
      case 'rss': {
        // Initialize with default RSS feeds
        const rssFeeds = [
          { url: 'https://openai.com/blog/rss.xml', sourceName: 'OpenAI Blog' },
          { url: 'https://blog.google/technology/ai/rss', sourceName: 'Google AI Blog' },
          { url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', sourceName: 'MIT News AI' },
        ];
        
        rssFeeds.forEach(feed => {
          const url = new URL(feed.url);
          const origin = `${url.protocol}//${url.host}`;
          const name = `RSS-${url.hostname}`;
          collectors.push(new RSSCollector(name, {
            enabled: true,
            baseUrl: origin,
            rateLimit: DEFAULT_RATE_LIMIT,
            reliability: SourceReliability.JOURNALISM,
            feedUrl: feed.url,
            sourceName: feed.sourceName,
          }));
        });
        break;
      }
      
      default:
        console.warn(`Unknown news source: ${source}`);
    }
  }
  
  return collectors;
}

/**
 * Write execution summary to file for GitHub Actions
 */
function writeSummary(result: OrchestratorResult): void {
  const summary = {
    success: result.success,
    metrics: result.metrics,
    prUrl: result.prUrl,
    errors: result.errors.map(e => e.message),
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('execution-summary.json', JSON.stringify(summary, null, 2));
  console.log('📝 Summary written to execution-summary.json');
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🚀 AI Timeline Update - Starting\n');
  
  try {
    // Step 1: Validate configuration
    console.log('📋 Validating configuration...');
    const validation = validateConfig();
    
    if (!validation.valid) {
      throw new ConfigurationError(
        'Configuration validation failed',
        validation.errors
      );
    }
    
    // Load configuration
    const appConfig = loadConfig();
    
    // Log configuration (with secrets redacted)
    if (appConfig.logLevel === 'debug') {
      config.logConfig();
    } else {
      // Show key configuration in normal mode
      console.log('Configuration loaded:');
      console.log(JSON.stringify({
        aiProvider: appConfig.aiProvider,
        aiModel: appConfig.aiModel,
        timelineRepo: appConfig.timelineRepo.full,
        maxEventsPerWeek: appConfig.maxEventsPerWeek,
        significanceThreshold: appConfig.significanceThreshold,
        newsSources: appConfig.newsSources,
        dryRun: appConfig.dryRun,
        logLevel: appConfig.logLevel
      }, null, 2));
    }
    
    console.log('✅ Configuration validated\n');
    
    // Check for dry run mode
    if (appConfig.dryRun) {
      console.log('🔍 DRY RUN MODE - No PR will be created\n');
    }
    
    // Step 2: Initialize orchestrator
    console.log('🔧 Initializing orchestrator...');
    const orchestrator = new WeeklyUpdateOrchestrator({
      timelineRepo: appConfig.timelineRepo.full,
      maxEventsPerWeek: appConfig.maxEventsPerWeek,
      significanceThreshold: appConfig.significanceThreshold,
      githubToken: appConfig.githubToken
    });
    
    // Step 3: Register collectors
    console.log('📡 Registering news collectors...');
    const collectors = initializeCollectors(appConfig.newsSources);
    
    if (collectors.length === 0) {
      throw new Error('No news collectors initialized');
    }
    
    collectors.forEach(collector => {
      orchestrator.registerCollector(collector);
    });
    
    console.log(`✅ Registered ${collectors.length} collectors\n`);
    
    // Step 4: Run the weekly update
    console.log('🎯 Running weekly update workflow...\n');
    const result = await orchestrator.run();
    
    // Step 5: Write summary for GitHub Actions
    writeSummary(result);
    
    // Step 6: Handle results
    if (result.success) {
      console.log('✅ Weekly update completed successfully!');
      
      if (result.prUrl) {
        console.log(`📌 Pull Request: ${result.prUrl}`);
        
        // Set GitHub Actions output
        if (process.env.GITHUB_OUTPUT) {
          fs.appendFileSync(
            process.env.GITHUB_OUTPUT,
            `pr_url=${result.prUrl}\n`
          );
        }
      }
      
      process.exit(0);
    } else {
      console.error('⚠️ Weekly update completed with warnings');
      
      if (result.errors.length > 0) {
        console.error('\nErrors encountered:');
        result.errors.forEach(err => {
          console.error(`  - ${err.message}`);
        });
      }
      
      // Exit with warning code if no critical errors
      const hasCriticalError = result.errors.some(
        err => err.name === 'ConfigurationError' || err.name === 'GitHubError'
      );
      
      process.exit(hasCriticalError ? 1 : 0);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    
    // Log full error in debug mode
    if (process.env.LOG_LEVEL === 'debug') {
      console.error('Stack trace:', error);
    }
    
    // Create error summary
    writeSummary({
      success: false,
      analyzed: [],
      selected: [],
      metrics: {
        totalCollected: 0,
        afterDeduplication: 0,
        analyzed: 0,
        selected: 0,
        duration: 0
      },
      errors: [error as Error]
    });
    
    process.exit(1);
  }
}

/**
 * Handle unhandled rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { main };
