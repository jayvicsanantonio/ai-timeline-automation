import { type CheerioAPI, load as loadHtml } from 'cheerio';
import { NewsSourceError } from '../utils/errors';
import { fetchText } from '../utils/http';
import { AbstractSourceConnector } from './base';
import type { RawItem, SourceConnectorInit, SourceFetchOptions } from './types';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DEFAULT_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

type JsonLdNode = {
  '@type'?: string | string[];
  headline?: string;
  name?: string;
  url?: string;
  mainEntityOfPage?: { '@id'?: string } | string;
  '@id'?: string;
  datePublished?: string;
  dateCreated?: string;
  description?: string;
  abstract?: string;
  author?: JsonLdAuthor | JsonLdAuthor[];
  creator?: JsonLdAuthor | JsonLdAuthor[];
};

type JsonLdAuthor = {
  '@type'?: string;
  name?: string;
};

export class DeepMindBlogConnector extends AbstractSourceConnector {
  private readonly baseUrl: string;
  private readonly requestHeaders: Record<string, string>;

  constructor(init: SourceConnectorInit) {
    super(init);
    const base = new URL(init.config.url);
    this.baseUrl = `${base.protocol}//${base.host}`;

    const metadata = (init.config.metadata ?? {}) as Record<string, unknown>;
    const metadataUserAgent = metadata['user_agent'];
    const metadataAcceptLanguage = metadata['accept_language'];
    const metadataHeaders = this.normalizeHeaders(metadata['http_headers']);
    const refererHeader = this.normalizeReferer(metadata['referer']);

    const userAgent = typeof metadataUserAgent === 'string' && metadataUserAgent.trim().length > 0
      ? metadataUserAgent.trim()
      : DEFAULT_USER_AGENT;

    const acceptLanguage =
      typeof metadataAcceptLanguage === 'string' && metadataAcceptLanguage.trim().length > 0
        ? metadataAcceptLanguage.trim()
        : DEFAULT_ACCEPT_LANGUAGE;

    this.requestHeaders = {
      Accept: DEFAULT_ACCEPT,
      'Accept-Language': acceptLanguage,
      'User-Agent': userAgent,
      'Cache-Control': 'no-cache',
      ...metadataHeaders
    };

    if (refererHeader) {
      this.requestHeaders.Referer = refererHeader;
    }
  }

  async fetch(options: SourceFetchOptions): Promise<RawItem[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const timeout = this.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const payload = await fetchText(this.url, {
        timeout,
        signal: options.signal,
        headers: this.requestHeaders
      });

      const $ = loadHtml(payload);
      const candidates = [...this.extractFromJsonLd($), ...this.extractFromArticles($)];
      const unique = this.deduplicateById(candidates);
      return this.filterWindow(unique, options);
    } catch (error) {
      throw new NewsSourceError(this.id, 'Failed to fetch HTML source', error);
    }
  }

  private normalizeHeaders(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const headers: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
      if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
        headers[key] = rawValue.trim();
      }
    }

    return headers;
  }

  private normalizeReferer(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const refererUrl = new URL(trimmed);
      return refererUrl.toString();
    } catch {
      console.warn(`Invalid referer configured for ${this.id}: ${value}`);
      return undefined;
    }
  }

  private extractFromJsonLd($: CheerioAPI): RawItem[] {
    const results: RawItem[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        const nodes = this.unwrapJsonLdNodes(parsed);
        nodes.forEach((node) => {
          const item = this.mapJsonLdNode(node);
          if (item) {
            results.push(item);
          }
        });
      } catch (error) {
        // Ignore parse errors but continue with other script tags
        console.warn(`DeepMindBlogConnector JSON-LD parse error: ${(error as Error).message}`);
      }
    });

    return results;
  }

  private extractFromArticles($: CheerioAPI): RawItem[] {
    const results: RawItem[] = [];

    $('article').each((_, element) => {
      const article = $(element);
      const link = article.find('a[href]').first().attr('href');
      const title = article.find('h1, h2, h3').first().text().trim();
      const datetime =
        article.find('time[datetime]').attr('datetime') ||
        article.find('time').first().text().trim();
      const summary = article.find('p').first().text().trim();
      const authorsText = article.find('[itemprop="author"], .author').text();

      if (!link || !title) {
        return;
      }

      const publishedAt = this.resolvePublishedAt(datetime);
      const absoluteUrl = this.toAbsoluteUrl(link);
      const fingerprint = this.generateDeterministicId(`${this.id}:${absoluteUrl}`);
      const datePrefix = new Date(publishedAt).toISOString().slice(0, 10);

      results.push({
        id: `${datePrefix}-${this.id}-${fingerprint.slice(0, 6)}`,
        title: this.normalizeWhitespace(title),
        url: absoluteUrl,
        publishedAt,
        source: this.id,
        summary: summary ? this.normalizeWhitespace(summary) : undefined,
        authors: this.normalizeAuthorList(authorsText)
      });
    });

    return results;
  }

  private unwrapJsonLdNodes(value: unknown): JsonLdNode[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((node) => this.unwrapJsonLdNodes(node));
    }

    if (typeof value === 'object') {
      const maybeNode = value as Record<string, unknown>;
      if (Array.isArray(maybeNode['@graph'])) {
        return this.unwrapJsonLdNodes(maybeNode['@graph']);
      }
      return [maybeNode as JsonLdNode];
    }

    return [];
  }

  private mapJsonLdNode(node: JsonLdNode): RawItem | undefined {
    if (!node) {
      return undefined;
    }

    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (!types || !types.filter(Boolean).some((type) => type === 'BlogPosting')) {
      return undefined;
    }

    const title = node.headline ?? node.name;
    const url =
      node.url ??
      (typeof node.mainEntityOfPage === 'string'
        ? node.mainEntityOfPage
        : node.mainEntityOfPage?.['@id']) ??
      node['@id'];
    const publishedAtRaw = node.datePublished ?? node.dateCreated;

    if (!title || !url || !publishedAtRaw) {
      return undefined;
    }

    const absoluteUrl = this.toAbsoluteUrl(url);
    const fingerprint = this.generateDeterministicId(`${this.id}:${absoluteUrl}`);
    const publishedAt = this.resolvePublishedAt(publishedAtRaw);
    const datePrefix = new Date(publishedAt).toISOString().slice(0, 10);

    return {
      id: `${datePrefix}-${this.id}-${fingerprint.slice(0, 6)}`,
      title: this.normalizeWhitespace(title),
      url: absoluteUrl,
      publishedAt,
      source: this.id,
      summary: this.normalizeNullable(node.description ?? node.abstract),
      authors: this.normalizeJsonLdAuthors(node.author ?? node.creator)
    };
  }

  private normalizeNullable(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = this.normalizeWhitespace(value);
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeJsonLdAuthors(
    author: JsonLdAuthor | JsonLdAuthor[] | undefined
  ): string[] | undefined {
    if (!author) {
      return undefined;
    }

    const authors = Array.isArray(author) ? author : [author];
    const names = authors
      .map((item) => item?.name)
      .filter((name): name is string => Boolean(name))
      .map((name) => this.normalizeWhitespace(name));

    return names.length > 0 ? names : undefined;
  }

  private normalizeAuthorList(value: string | undefined): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const authors = value
      .split(/,|and/)
      .map((part) => this.normalizeWhitespace(part))
      .filter(Boolean);

    return authors.length > 0 ? authors : undefined;
  }

  private toAbsoluteUrl(url: string): string {
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return this.sanitizeUrl(url);
    }
  }

  private deduplicateById(items: RawItem[]): RawItem[] {
    const map = new Map<string, RawItem>();
    for (const item of items) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }

  private resolvePublishedAt(raw?: string): string {
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
      console.warn(`DeepMindBlogConnector received unparsable date "${raw}", using current time.`);
    }

    return new Date().toISOString();
  }
}
