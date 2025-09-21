import { z } from 'zod';

export const SourceConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['rss', 'api', 'html', 'custom']).default('rss'),
  url: z.string().url({ message: 'Source url must be a valid URL' }),
  enabled: z.boolean().default(true),
  rate_limit_qpm: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional()
});

export type SourceConfigEntry = z.infer<typeof SourceConfigSchema>;

export const SourcesFileSchema = z.object({
  window_days: z.number().int().positive().default(3),
  defaults: z
    .object({
      rate_limit_qpm: z.number().int().positive().optional(),
      timeout_ms: z.number().int().positive().optional()
    })
    .partial()
    .default({}),
  sources: z.array(SourceConfigSchema)
});

export type SourcesFile = z.infer<typeof SourcesFileSchema>;

export const LlmFileSchema = z.object({
  default_provider: z.string().min(1),
  fallback_chain: z.array(z.string().min(1)).default([]),
  temperature: z.number().min(0).max(2).default(0.2),
  top_p: z.number().min(0).max(1).default(1),
  max_tokens: z.number().int().positive().default(1200),
  embeddings_model: z.string().min(1).default('text-embedding-latest'),
  budget: z
    .object({
      max_prompt_tokens: z.number().int().positive().optional(),
      max_completion_tokens: z.number().int().positive().optional()
    })
    .partial()
    .default({}),
  timeouts: z
    .object({
      request_ms: z.number().int().positive().default(20000)
    })
    .partial()
    .default({ request_ms: 20000 }),
  retries: z
    .object({
      attempts: z.number().int().positive().default(3),
      base_delay_ms: z.number().int().positive().default(250),
      max_delay_ms: z.number().int().positive().default(4000)
    })
    .partial()
    .default({ attempts: 3, base_delay_ms: 250, max_delay_ms: 4000 })
});

export type LlmFile = z.infer<typeof LlmFileSchema>;

export const PipelineFileSchema = z.object({
  dedupe: z.object({
    embed_similarity_min: z.number().min(0).max(1),
    minhash_jaccard_max: z.number().min(0).max(1),
    url_canonicalize: z.boolean().default(true),
    embedding_model: z.string().min(1).optional(),
    shingle_size: z.number().int().positive().default(3)
  }),
  scoring: z.object({
    weights: z.object({
      technical: z.number().min(0).max(1),
      commercial: z.number().min(0).max(1),
      social: z.number().min(0).max(1)
    }),
    min_composite: z.number().min(0).max(1)
  }),
  category_minimums: z.record(z.string(), z.number().min(0).max(1)),
  limits: z.object({
    max_items_per_run: z.number().int().positive(),
    max_items_per_source: z.number().int().positive()
  }),
  timeouts: z.object({
    connector_ms: z.number().int().positive(),
    llm_ms: z.number().int().positive()
  }),
  retries: z.object({
    attempts: z.number().int().positive(),
    base_ms: z.number().int().positive(),
    max_ms: z.number().int().positive()
  }),
  outputs: z.object({
    report_dir: z.string().min(1),
    timeline_path: z.string().min(1)
  }),
  errors: z.object({
    tracker: z.string().min(1)
  })
});

export type PipelineFile = z.infer<typeof PipelineFileSchema>;
