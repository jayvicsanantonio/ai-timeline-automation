import fs from 'node:fs';
import path from 'node:path';
import nock from 'nock';
import { DeepMindBlogConnector } from '../deepmind-blog';
import type { SourceConnectorInit, SourceFetchOptions } from '../types';

const BASE_URL = 'https://deepmind.google';
const BLOG_PATH = '/discover/blog/';

function readFixture(filename: string): string {
  const fullPath = path.resolve(__dirname, '../../..', 'tests/__fixtures__', filename);
  return fs.readFileSync(fullPath, 'utf-8');
}

function buildOptions(): SourceFetchOptions {
  return {
    windowStart: new Date('2025-09-15T00:00:00Z'),
    windowEnd: new Date('2025-09-21T23:59:59Z')
  };
}

function buildConnector(): DeepMindBlogConnector {
  const init: SourceConnectorInit = {
    config: {
      id: 'deepmind_blog',
      kind: 'html',
      url: `${BASE_URL}${BLOG_PATH}`,
      enabled: true
    },
    defaults: {
      timeout_ms: 15000
    }
  };

  return new DeepMindBlogConnector(init);
}

describe('DeepMindBlogConnector', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it('parses posts from JSON-LD payloads', async () => {
    const html = readFixture('deepmind-blog.jsonld.html');

    nock(BASE_URL).get(BLOG_PATH).reply(200, html);

    const connector = buildConnector();
    const items = await connector.fetch(buildOptions());

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        title: 'Alpha Research Achieves New Milestone',
        source: 'deepmind_blog',
        authors: ['Dr. Ada Lovelace', 'Dr. Alan Turing']
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        title: 'Scaling Agents Responsibly',
        url: 'https://deepmind.google/discover/blog/scaling-agents-responsibly',
        summary: 'A framework for scaling agents with safety in mind.'
      })
    );
  });

  it('falls back to article markup when JSON-LD is missing', async () => {
    const html = readFixture('deepmind-blog.article.html');

    nock(BASE_URL).get(BLOG_PATH).reply(200, html);

    const connector = buildConnector();
    const items = await connector.fetch(buildOptions());

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        title: 'Robotics Planning with World Models',
        authors: ['Jane Smith'],
        summary: 'Insights into scaling world model planning for robotics.'
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        title: 'Responsible AI Toolkit Updates',
        authors: ['John Doe', 'Alex Roe']
      })
    );
  });
});
