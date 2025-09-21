/**
 * Unit tests for GitHubManager
 */

import { Octokit } from '@octokit/rest';
import type { AnalyzedEvent } from '../../types';
import { GitHubManager } from '../github-manager';
import { TimelineReader } from '../timeline-reader';

// Mock Octokit
jest.mock('@octokit/rest');

// Mock TimelineReader
jest.mock('../timeline-reader', () => ({
  TimelineReader: jest.fn().mockImplementation(() => ({
    fetchTimeline: jest.fn().mockResolvedValue({
      events: [],
      sha: 'test-sha',
      content: JSON.stringify({
        lastUpdated: '2024-01-01T00:00:00Z',
        totalEntries: 0,
        entries: []
      })
    }),
    validateNewEvents: jest.fn().mockReturnValue({
      valid: true,
      conflicts: [],
      warnings: []
    }),
    filterNewEvents: jest.fn().mockImplementation((newEvents) => newEvents)
  }))
}));

describe('GitHubManager', () => {
  let manager: GitHubManager;
  const mockConfig = {
    owner: 'test-owner',
    repo: 'test-repo',
    token: 'test-token'
  };

  const mockAnalyzedEvents: AnalyzedEvent[] = [
    {
      id: '2024-01-15-ai-breakthrough',
      title: 'AI Breakthrough',
      date: '2024-01-15T00:00:00Z',
      description: 'Major breakthrough in AI',
      category: 'research',
      sources: ['https://example.com/ai-news'],
      impactScore: 9.5,
      significance: {
        technologicalBreakthrough: 9,
        industryImpact: 8,
        adoptionScale: 7,
        novelty: 9
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Octokit mock
    const mockOctokitInstance = {
      repos: {
        getBranch: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'main-sha' } }
        }),
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'new-commit-sha' } }
        })
      },
      git: {
        createRef: jest.fn().mockResolvedValue({}),
        updateRef: jest.fn().mockResolvedValue({})
      },
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({
          data: {
            number: 123,
            html_url: 'https://github.com/test-owner/test-repo/pull/123'
          }
        })
      },
      issues: {
        addLabels: jest.fn().mockResolvedValue({})
      }
    };

    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(
      () => mockOctokitInstance as any
    );

    manager = new GitHubManager(mockConfig);
  });

  describe('Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(manager).toBeInstanceOf(GitHubManager);
    });

    it('should use default values for optional config', () => {
      const minimalManager = new GitHubManager({
        owner: 'owner',
        repo: 'repo'
      });
      expect(minimalManager).toBeInstanceOf(GitHubManager);
    });
  });

  describe('createTimelineUpdatePR', () => {
    it('should create a pull request with new timeline events', async () => {
      const result = await manager.createTimelineUpdatePR(mockAnalyzedEvents);

      expect(result).toEqual({
        number: 123,
        url: 'https://github.com/test-owner/test-repo/pull/123',
        branch: expect.stringMatching(/^auto-update\/week-\d{4}-\d{2}$/),
        created: true
      });
    });

    it('should handle empty events array', async () => {
      await expect(manager.createTimelineUpdatePR([])).rejects.toThrow(
        'No events to add to timeline'
      );
    });

    it('should detect existing PR and return without creating', async () => {
      const mockOctokitInstance = (Octokit as jest.MockedClass<typeof Octokit>).mock.results[0]
        .value;

      // Mock existing PR
      mockOctokitInstance.pulls.list = jest.fn().mockResolvedValue({
        data: [
          {
            number: 100,
            html_url: 'https://github.com/test-owner/test-repo/pull/100'
          }
        ]
      });

      const result = await manager.createTimelineUpdatePR(mockAnalyzedEvents, 1, 2024);

      expect(result).toEqual({
        number: 100,
        url: 'https://github.com/test-owner/test-repo/pull/100',
        branch: 'auto-update/week-2024-01',
        created: false
      });
    });

    it('should handle specific week and year parameters', async () => {
      const result = await manager.createTimelineUpdatePR(mockAnalyzedEvents, 10, 2024);

      expect(result.branch).toBe('auto-update/week-2024-10');
    });
  });

  describe('Error handling', () => {
    it('should handle GitHub API errors gracefully', async () => {
      const mockOctokitInstance = (Octokit as jest.MockedClass<typeof Octokit>).mock.results[0]
        .value;

      mockOctokitInstance.repos.getBranch = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(manager.createTimelineUpdatePR(mockAnalyzedEvents)).rejects.toThrow(
        'Failed to create/update branch'
      );
    });

    it('should handle validation failures', async () => {
      const mockTimelineReader = (TimelineReader as jest.MockedClass<typeof TimelineReader>).mock
        .results[0].value;

      mockTimelineReader.validateNewEvents = jest.fn().mockReturnValue({
        valid: false,
        conflicts: ['Event ID already exists'],
        warnings: []
      });

      await expect(manager.createTimelineUpdatePR(mockAnalyzedEvents)).rejects.toThrow(
        'Event validation failed'
      );
    });

    it('should handle case where all events already exist', async () => {
      const mockTimelineReader = (TimelineReader as jest.MockedClass<typeof TimelineReader>).mock
        .results[0].value;

      mockTimelineReader.filterNewEvents = jest.fn().mockReturnValue([]);

      await expect(manager.createTimelineUpdatePR(mockAnalyzedEvents)).rejects.toThrow(
        'No new events to add'
      );
    });
  });
});
