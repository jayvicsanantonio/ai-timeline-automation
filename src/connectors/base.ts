import crypto from 'node:crypto';
import type {
  RawItem,
  SourceConnector,
  SourceConnectorInit,
  SourceFetchOptions,
  SourceKind
} from './types';

export abstract class AbstractSourceConnector implements SourceConnector {
  readonly id: string;
  readonly kind: SourceKind;
  readonly url: string;
  protected readonly enabled: boolean;
  protected readonly rateLimitQpm?: number;
  protected readonly timeoutMs?: number;

  constructor({ config, defaults }: SourceConnectorInit) {
    this.id = config.id;
    this.kind = config.kind;
    this.url = config.url;
    this.enabled = config.enabled ?? true;
    this.rateLimitQpm = config.rate_limit_qpm ?? defaults?.rate_limit_qpm;
    this.timeoutMs = config.timeout_ms ?? defaults?.timeout_ms;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  abstract fetch(options: SourceFetchOptions): Promise<RawItem[]>;

  protected filterWindow<T extends RawItem>(items: T[], options: SourceFetchOptions): T[] {
    const { windowStart, windowEnd, maxItems } = options;

    const filtered = items.filter((item) => {
      const published = new Date(item.publishedAt);
      return published >= windowStart && published <= windowEnd;
    });

    if (typeof maxItems === 'number') {
      return filtered.slice(0, maxItems);
    }

    return filtered;
  }

  protected generateDeterministicId(seed: string): string {
    return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);
  }

  protected normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  protected sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('utm_term');
      parsed.searchParams.delete('utm_content');
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
