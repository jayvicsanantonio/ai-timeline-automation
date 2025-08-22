/**
 * Configuration management with environment variable validation
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';
import { ConfigurationError } from '../utils/errors';

// Load .env file if it exists
dotenv.config();

/**
 * Environment variable schema
 */
const EnvSchema = z.object({
  // Required - either OpenAI or OpenRouter API key
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GIT_TOKEN: z.string().min(1),
  TIMELINE_REPO: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, 'Must be in format owner/repo'),

  // AI Provider settings
  AI_PROVIDER: z.enum(['openai', 'openrouter']).default('openai'),
  AI_MODEL: z.string().optional(), // e.g., 'gpt-4o-mini' or 'moonshotai/kimi-k2:free'

  // Optional with defaults
  MAX_EVENTS_PER_WEEK: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(10))
    .default('3'),
  SIGNIFICANCE_THRESHOLD: z
    .string()
    .transform(Number)
    .pipe(z.number().min(0).max(10))
    .default('7.0'),
  NEWS_SOURCES: z.string().default('hackernews,arxiv,rss'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .default('info'),
  DRY_RUN: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),

  // Optional API keys for news sources
  HACKERNEWS_API_KEY: z.string().optional(),
  ARXIV_API_KEY: z.string().optional(),

  // Node environment
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('production'),
});

type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Application configuration
 */
export interface AppConfig {
  // Core settings
  aiProvider: 'openai' | 'openrouter';
  aiApiKey: string;
  aiModel: string;
  githubToken: string;
  timelineRepo: {
    owner: string;
    repo: string;
    full: string;
  };

  // Workflow settings
  maxEventsPerWeek: number;
  significanceThreshold: number;
  newsSources: string[];
  dryRun: boolean;

  // API Keys
  apiKeys: {
    hackernews?: string;
    arxiv?: string;
  };

  // System settings
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  nodeEnv: 'development' | 'test' | 'production';
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
}

class Configuration {
  private config?: AppConfig;
  private env?: EnvConfig;

  /**
   * Load and validate configuration
   */
  load(): AppConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // Validate environment variables
      const result = EnvSchema.safeParse(process.env);

      if (!result.success) {
        const missing = result.error.errors
          .filter((err) => err.message === 'Required')
          .map((err) => err.path.join('.'));

        const invalid = result.error.errors
          .filter((err) => err.message !== 'Required')
          .map((err) => `${err.path.join('.')}: ${err.message}`);

        let message = 'Invalid configuration:';
        if (missing.length > 0) {
          message += `\nMissing required variables: ${missing.join(
            ', '
          )}`;
        }
        if (invalid.length > 0) {
          message += `\nInvalid variables: ${invalid.join('; ')}`;
        }

        throw new ConfigurationError(message, missing);
      }

      this.env = result.data;

      // Validate AI provider configuration
      const provider = this.env.AI_PROVIDER;
      let aiApiKey: string | undefined;
      let aiModel: string;

      if (provider === 'openrouter') {
        aiApiKey = this.env.OPENROUTER_API_KEY;
        aiModel = this.env.AI_MODEL || 'moonshotai/kimi-k2:free';
        if (!aiApiKey) {
          throw new ConfigurationError(
            'OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter'
          );
        }
      } else {
        aiApiKey = this.env.OPENAI_API_KEY;
        aiModel = this.env.AI_MODEL || 'gpt-4o-mini';
        if (!aiApiKey) {
          throw new ConfigurationError(
            'OPENAI_API_KEY is required when AI_PROVIDER=openai'
          );
        }
      }

      // Parse timeline repo
      const [owner, repo] = this.env.TIMELINE_REPO.split('/');

      // Build configuration object
      this.config = {
        aiProvider: provider,
        aiApiKey,
        aiModel,
        githubToken: this.env.GIT_TOKEN,
        timelineRepo: {
          owner,
          repo,
          full: this.env.TIMELINE_REPO,
        },
        maxEventsPerWeek: this.env.MAX_EVENTS_PER_WEEK,
        significanceThreshold: this.env.SIGNIFICANCE_THRESHOLD,
        newsSources: this.env.NEWS_SOURCES.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        dryRun: this.env.DRY_RUN,
        apiKeys: {
          hackernews: this.env.HACKERNEWS_API_KEY,
          arxiv: this.env.ARXIV_API_KEY,
        },
        logLevel: this.env.LOG_LEVEL,
        nodeEnv: this.env.NODE_ENV,
        isDevelopment: this.env.NODE_ENV === 'development',
        isProduction: this.env.NODE_ENV === 'production',
        isTest: this.env.NODE_ENV === 'test',
      };

      return this.config;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to load configuration: ${error}`
      );
    }
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    const config = this.load();
    return config[key];
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.config !== undefined;
  }

  /**
   * Reload configuration (useful for testing)
   */
  reload(): AppConfig {
    this.config = undefined;
    this.env = undefined;
    return this.load();
  }

  /**
   * Get all configuration (for debugging)
   */
  getAll(): AppConfig {
    return this.load();
  }

  /**
   * Validate configuration without throwing
   */
  validate(): { valid: boolean; errors?: string[] } {
    try {
      this.load();
      return { valid: true };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        return {
          valid: false,
          errors: [error.message, ...(error.missingFields || [])],
        };
      }
      return { valid: false, errors: [String(error)] };
    }
  }

  /**
   * Log configuration (with secrets redacted)
   */
  logConfig(): void {
    const config = this.load();
    const redacted = {
      ...config,
      aiApiKey: this.redactSecret(config.aiApiKey),
      githubToken: this.redactSecret(config.githubToken),
      apiKeys: {
        hackernews: config.apiKeys.hackernews
          ? this.redactSecret(config.apiKeys.hackernews)
          : undefined,
        arxiv: config.apiKeys.arxiv
          ? this.redactSecret(config.apiKeys.arxiv)
          : undefined,
      },
    };

    console.log('Configuration loaded:');
    console.log(JSON.stringify(redacted, null, 2));
  }

  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '***';
    }
    return `${secret.substring(0, 4)}...${secret.substring(
      secret.length - 4
    )}`;
  }
}

// Export singleton instance
export const config = new Configuration();

// Export convenience functions
export function loadConfig(): AppConfig {
  return config.load();
}

export function getConfig<K extends keyof AppConfig>(
  key: K
): AppConfig[K] {
  return config.get(key);
}

export function validateConfig(): {
  valid: boolean;
  errors?: string[];
} {
  return config.validate();
}
