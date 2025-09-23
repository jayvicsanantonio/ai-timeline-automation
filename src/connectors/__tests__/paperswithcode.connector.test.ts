import fs from 'node:fs';
import path from 'node:path';
import { PapersWithCodeConnector } from '../paperswithcode';
import type { SourceConnectorInit, SourceFetchOptions } from '../types';

const BASE_URL = 'https://paperswithcode.com';
const API_PATH = '/api/latest';

function readFixture(filename: string): string {
  const fullPath = path.resolve(__dirname, '../../..', 'tests/__fixtures__', filename);
  return fs.readFileSync(fullPath, 'utf-8');
}

function buildConnector(): PapersWithCodeConnector {
  const init: SourceConnectorInit = {
    config: {
      id: 'paperswithcode',
      kind: 'api',
      url: `${BASE_URL}${API_PATH}`,
      enabled: true
    },
    defaults: {
      timeout_ms: 15000
    }
  };

  return new PapersWithCodeConnector(init);
}

describe('PapersWithCodeConnector', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it('collects paginated API results within the requested window', async () => {
    const page1 = readFixture('paperswithcode-page-1.json');
    const page2 = readFixture('paperswithcode-page-2.json');

    fetchSpy
      .mockResolvedValueOnce(
        new Response(page1, {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(page2, {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      );

    const connector = buildConnector();
    const options: SourceFetchOptions = {
      windowStart: new Date('2025-09-17T00:00:00Z'),
      windowEnd: new Date('2025-09-20T00:00:00Z')
    };

    const items = await connector.fetch(options);

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual(
      expect.objectContaining({
        title: 'Awesome Model for Vision',
        authors: ['Alice Example', 'Bob Example'],
        metadata: expect.objectContaining({
          repositoryUrl: 'https://github.com/example/awesome-model'
        })
      })
    );
    expect(items[2]).toEqual(
      expect.objectContaining({
        title: 'Benchmarking Foundation Agents',
        summary: 'Benchmarks for evaluating foundation agents.'
      })
    );
  });

  it('respects maxItems in fetch options', async () => {
    const page1 = readFixture('paperswithcode-page-1.json');

    fetchSpy.mockResolvedValueOnce(
      new Response(page1, {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const connector = buildConnector();
    const options: SourceFetchOptions = {
      windowStart: new Date('2025-09-17T00:00:00Z'),
      windowEnd: new Date('2025-09-20T00:00:00Z'),
      maxItems: 1
    };

    const items = await connector.fetch(options);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Awesome Model for Vision');
  });
});
