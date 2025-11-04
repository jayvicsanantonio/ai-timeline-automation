import { type RssFeedItem, RssSourceConnector } from './rss-connector';

export class OpenAIBlogConnector extends RssSourceConnector {
  protected mapItem(item: RssFeedItem) {
    const mapped = super.mapItem(item);
    if (!mapped) {
      return undefined;
    }

    const sourceDisplayName = mapped.sourceDisplayName ?? this.getSourceName() ?? 'OpenAI Blog';

    return {
      ...mapped,
      metadata: {
        ...mapped.metadata,
        sourceDisplayName
      }
    };
  }
}
