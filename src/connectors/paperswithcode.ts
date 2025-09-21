import axios, { type AxiosResponse } from 'axios';
import { NewsSourceError } from '../utils/errors';
import { AbstractSourceConnector } from './base';
import type { RawItem, SourceConnectorInit, SourceFetchOptions } from './types';

const DEFAULT_TIMEOUT_MS = 15000;

interface PapersWithCodeResponse {
  results?: PapersWithCodeEntry[];
  next?: string | null;
  previous?: string | null;
}

interface PapersWithCodeEntry {
  id?: string;
  title?: string;
  paper_title?: string;
  url_abs?: string;
  url?: string;
  paper_url?: string;
  repository_url?: string;
  created_at?: string;
  published_at?: string;
  summary?: string;
  description?: string;
  paper_abstract?: string;
  authors?: string | string[];
  author_names?: string[];
}

export class PapersWithCodeConnector extends AbstractSourceConnector {
  private readonly baseUrl: URL;

  constructor(init: SourceConnectorInit) {
    super(init);
    this.baseUrl = new URL(init.config.url);
  }

  async fetch(options: SourceFetchOptions): Promise<RawItem[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const timeout = this.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxItems = options.maxItems ?? Number.MAX_SAFE_INTEGER;
    const items: RawItem[] = [];
    let nextUrl: string | null | undefined = this.url;

    try {
      while (nextUrl && items.length < maxItems) {
        const response: AxiosResponse<PapersWithCodeResponse | PapersWithCodeEntry[]> =
          await axios.get<PapersWithCodeResponse | PapersWithCodeEntry[]>(nextUrl, {
            timeout
          });

        const payload: PapersWithCodeResponse | PapersWithCodeEntry[] = response.data;
        const entries = this.resolveEntries(payload);

        for (const entry of entries) {
          const mapped = this.mapEntry(entry);
          if (mapped) {
            items.push(mapped);
          }

          if (items.length >= maxItems) {
            break;
          }
        }

        nextUrl = (payload as PapersWithCodeResponse).next ?? null;
      }
    } catch (error) {
      throw new NewsSourceError(this.id, 'Failed to fetch Papers with Code feed', error);
    }

    const filtered = this.filterWindow(items, options);
    return filtered.slice(0, maxItems);
  }

  private resolveEntries(
    payload: PapersWithCodeResponse | PapersWithCodeEntry[]
  ): PapersWithCodeEntry[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (Array.isArray(payload.results)) {
      return payload.results;
    }

    return [];
  }

  private mapEntry(entry: PapersWithCodeEntry): RawItem | undefined {
    const title = entry.title ?? entry.paper_title;
    const url = entry.url_abs ?? entry.url ?? entry.paper_url ?? entry.repository_url;
    const publishedAt = entry.published_at ?? entry.created_at;

    if (!title || !url || !publishedAt) {
      return undefined;
    }

    const absoluteUrl = this.toAbsoluteUrl(url);
    const fingerprint = this.generateDeterministicId(`${this.id}:${absoluteUrl}`);
    const datePrefix = new Date(publishedAt).toISOString().slice(0, 10);

    return {
      id: `${datePrefix}-${this.id}-${fingerprint.slice(0, 6)}`,
      title: this.normalizeWhitespace(title),
      url: absoluteUrl,
      publishedAt: new Date(publishedAt).toISOString(),
      source: this.id,
      summary: this.normalizeNullable(entry.summary ?? entry.description ?? entry.paper_abstract),
      authors: this.normalizeAuthors(entry),
      metadata: {
        repositoryUrl: entry.repository_url
      }
    };
  }

  private normalizeAuthors(entry: PapersWithCodeEntry): string[] | undefined {
    const authors = entry.author_names ?? entry.authors;

    if (!authors) {
      return undefined;
    }

    const list = Array.isArray(authors) ? authors : authors.split(/,|and/);

    const normalized = list.map((author) => this.normalizeWhitespace(author)).filter(Boolean);

    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeNullable(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = this.normalizeWhitespace(value);
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private toAbsoluteUrl(url: string): string {
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return this.sanitizeUrl(url);
    }
  }
}
