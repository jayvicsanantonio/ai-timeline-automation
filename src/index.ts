#!/usr/bin/env node

/**
 * Main entry point for the AI Timeline Update GitHub Action
 */

import * as fs from 'fs';
import { config, loadConfig, validateConfig } from './config';
import { WeeklyUpdateOrchestrator, OrchestratorResult } from './orchestrator';
import { ConfigurationError } from './utils/errors';

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
      githubToken: appConfig.githubToken,
      dryRun: appConfig.dryRun
    });
    
    // Step 3: Run the update (connectors are loaded from config at runtime)
    console.log('🎯 Running daily update workflow...\n');
    const result = await orchestrator.run();
    
    // Step 5: Write summary for GitHub Actions
    writeSummary(result);
    
    // Step 6: Handle results
    if (result.success) {
      console.log('✅ AI timeline update completed successfully!');
      
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
      console.error('⚠️ AI timeline update completed with warnings');
      
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
