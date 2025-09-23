import Parser from 'rss-parser';
import { NewsSourceError } from '../utils/errors';
import { fetchText } from '../utils/http';
import { AbstractSourceConnector } from './base';
import type { RawItem, SourceFetchOptions } from './types';

const DEFAULT_TIMEOUT_MS = 15000;

export interface RssFeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
  contentSnippet?: string;
  creator?: string;
  authors?: string[];
}

export class RssSourceConnector extends AbstractSourceConnector {
  private readonly parser: Parser<RssFeedItem>;

  constructor(init: ConstructorParameters<typeof AbstractSourceConnector>[0]) {
    super(init);
    this.parser = new Parser({
      customFields: {
        item: ['contentSnippet', 'creator']
      }
    });
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
        headers: {
          'User-Agent': 'ai-timeline-bot/1.0 (+https://github.com/jayvicsanantonio/ai-timeline)'
        }
      });

      const feed = await this.parser.parseString(payload);
      const items = (feed.items ?? [])
        .filter((item) => Boolean(item.link) && Boolean(item.title))
        .map((item) => this.mapItem(item))
        .filter((item): item is RawItem => Boolean(item?.publishedAt));

      return this.filterWindow(items, options);
    } catch (error) {
      throw new NewsSourceError(this.id, 'Failed to fetch RSS feed', error);
    }
  }

  protected mapItem(item: RssFeedItem): RawItem | undefined {
    if (!item.link || !item.title) {
      return undefined;
    }

    const publishedAt = item.isoDate || new Date().toISOString();
    const sanitizedUrl = this.sanitizeUrl(item.link);
    const fingerprint = this.generateDeterministicId(`${this.id}:${sanitizedUrl}`);
    const datePrefix = new Date(publishedAt).toISOString().slice(0, 10);

    return {
      id: `${datePrefix}-${this.id}-${fingerprint.slice(0, 6)}`,
      title: this.normalizeWhitespace(item.title),
      url: sanitizedUrl,
      publishedAt,
      source: this.id,
      summary: item.contentSnippet?.trim(),
      authors: this.extractAuthors(item)
    };
  }

  protected extractAuthors(item: RssFeedItem): string[] | undefined {
    const authors = item.authors ?? (item.creator ? [item.creator] : undefined);

    return authors?.map((author) => this.normalizeWhitespace(author));
  }
}
