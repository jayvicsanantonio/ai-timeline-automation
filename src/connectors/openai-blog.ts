import { type RssFeedItem, RssSourceConnector } from './rss-connector';
import type { SourceConnectorInit } from './types';

export class OpenAIBlogConnector extends RssSourceConnector {
  private readonly displayName: string;

  constructor(init: SourceConnectorInit) {
    super(init);
    this.displayName = init.config.metadata?.source_name ?? 'OpenAI Blog';
  }

  protected mapItem(item: RssFeedItem) {
    const mapped = super.mapItem(item);
    if (!mapped) {
      return undefined;
    }

    return {
      ...mapped,
      source: this.displayName,
      metadata: {
        ...mapped.metadata,
        sourceDisplayName: this.displayName
      }
    };
  }
}
