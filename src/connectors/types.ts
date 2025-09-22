import type { SourceConfigEntry } from '../config';

export type SourceKind = SourceConfigEntry['kind'];

export interface RawItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  summary?: string;
  authors?: string[];
  metadata?: Record<string, unknown>;
}

export interface SourceFetchOptions {
  windowStart: Date;
  windowEnd: Date;
  maxItems?: number;
  correlationId?: string;
  signal?: AbortSignal;
}

export interface SourceConnector {
  readonly id: string;
  readonly kind: SourceKind;
  readonly url: string;
  isEnabled(): boolean;
  fetch(options: SourceFetchOptions): Promise<RawItem[]>;
}

export interface ConnectorContext {
  correlationId?: string;
  startedAt: Date;
}

export interface ConnectorMetrics {
  latencyMs: number;
  itemCount: number;
  success: boolean;
  errorMessage?: string;
}

export interface ConnectorResult {
  items: RawItem[];
  metrics: ConnectorMetrics;
}

export interface SourceConnectorInit {
  config: SourceConfigEntry;
  defaults?: {
    rate_limit_qpm?: number;
    timeout_ms?: number;
  };
}
