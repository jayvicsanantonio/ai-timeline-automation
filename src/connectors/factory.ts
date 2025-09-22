import { loadSourcesConfig, type SourcesConfig } from '../config';
import { AbstractSourceConnector } from './base';
import { DeepMindBlogConnector } from './deepmind-blog';
import { OpenAIBlogConnector } from './openai-blog';
import { PapersWithCodeConnector } from './paperswithcode';
import { RssSourceConnector } from './rss-connector';
import type { SourceConnector, SourceConnectorInit } from './types';

export interface ConnectorBootstrapResult {
  windowDays: number;
  connectors: SourceConnector[];
}

export function computeIngestionWindow(
  windowDays: number,
  reference: Date = new Date()
): { windowStart: Date; windowEnd: Date } {
  const windowEnd = new Date(reference);
  const windowStart = new Date(reference);
  windowStart.setDate(windowStart.getDate() - Math.max(0, windowDays));

  return { windowStart, windowEnd };
}

function createConnector(init: SourceConnectorInit): SourceConnector | undefined {
  const { config } = init;

  if (config.enabled === false) {
    return undefined;
  }

  if (config.kind === 'rss') {
    if (config.id === 'openai_blog') {
      return new OpenAIBlogConnector(init);
    }
    return new RssSourceConnector(init);
  }

  if (config.kind === 'html') {
    return new DeepMindBlogConnector(init);
  }

  if (config.kind === 'api') {
    return new PapersWithCodeConnector(init);
  }

  console.warn(`Connector kind ${config.kind} is not yet supported. Skipping ${config.id}.`);
  return undefined;
}

export async function bootstrapConnectors(): Promise<ConnectorBootstrapResult> {
  const config: SourcesConfig = await loadSourcesConfig();
  const defaults = config.defaults ?? {};

  const connectors = config.sources
    .map((sourceConfig) => createConnector({ config: sourceConfig, defaults }))
    .filter((connector): connector is SourceConnector => Boolean(connector));

  return {
    windowDays: config.window_days,
    connectors
  };
}

export function isAbstractSourceConnector(
  value: SourceConnector
): value is AbstractSourceConnector {
  return value instanceof AbstractSourceConnector;
}
