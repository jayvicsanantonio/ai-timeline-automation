/**
 * Unit tests for GitHubManager
 */

import { GitHubManager } from '../github-manager';
import { TimelineEntry } from '../../types';

// Mock Octokit
const mockOctokit = {
  rest: {
    repos: {
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn()
    },
    git: {
      createRef: jest.fn(),
      getRef: jest.fn()
    },
    pulls: {
      create: jest.fn(),
      update: jest.fn()
    },
    issues: {
      addLabels: jest.fn()
    }
  }
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(() => mockOctokit)
}));

describe('GitHubManager', () => {
  let manager: GitHubManager;
  const mockConfig = {
    token: 'test-token',
    owner: 'test-owner',
    repo: 'test-repo'
  };

  const mockTimelineEntries: TimelineEntry[] = [
    {
      id: 'entry-1',
      date: '2023-12-01',
      title: 'AI Breakthrough',
      description: 'Major breakthrough in AI',
      significance: 9.5,
      category: 'breakthrough',
      sources: [
        {
          title: 'AI News',
          url: 'https://example.com/ai-news',
          reliability: 'HIGH' as any
        }
      ],
      weekOf: '2023-11-27'
    },
    {
      id: 'entry-2',
      date: '2023-12-02',
      title: 'ML Development',
      description: 'New ML framework released',
      significance: 7.8,
      category: 'development',
      sources: [
        {
          title: 'ML Blog',
          url: 'https://example.com/ml-blog',
          reliability: 'MEDIUM' as any
        }
      ],
      weekOf: '2023-11-27'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new GitHubManager(mockConfig);
  });

  describe('Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(manager).toBeInstanceOf(GitHubManager);
    });

    it('should throw error with invalid configuration', () => {
      expect(() => {
        new GitHubManager({ token: '', owner: 'test', repo: 'test' });
      }).toThrow('GitHub token is required');

      expect(() => {
        new GitHubManager({ token: 'test', owner: '', repo: 'test' });
      }).toThrow('Repository owner is required');

      expect(() => {
        new GitHubManager({ token: 'test', owner: 'test', repo: '' });
      }).toThrow('Repository name is required');
    });
  });

  describe('createBranch', () => {
    it('should create a new branch successfully', async () => {
      const weekOf = '2023-11-27';
      const expectedBranchName = 'weekly-update-2023-11-27';

      // Mock getting the main branch ref
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: {
          object: { sha: 'main-branch-sha' }
        }
      });

      // Mock creating the new branch
      mockOctokit.rest.git.createRef.mockResolvedValue({
        data: { ref: `refs/heads/${expectedBranchName}` }
      });

      const branchName = await manager.createBranch(weekOf);

      expect(branchName).toBe(expectedBranchName);
      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/main'
      });
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: `refs/heads/${expectedBranchName}`,
        sha: 'main-branch-sha'
      });
    });

    it('should handle branch creation failure', async () => {
      const error = new Error('Branch already exists');
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'main-sha' } }
      });
      mockOctokit.rest.git.createRef.mockRejectedValue(error);

      await expect(manager.createBranch('2023-11-27')).rejects.toThrow('Branch already exists');
    });

    it('should handle main branch ref not found', async () => {
      const error = new Error('Not found');
      error.status = 404;
      mockOctokit.rest.git.getRef.mockRejectedValue(error);

      await expect(manager.createBranch('2023-11-27')).rejects.toThrow('Not found');
    });
  });

  describe('updateTimelineFile', () => {
    it('should update timeline file with new entries', async () => {
      const branchName = 'weekly-update-2023-11-27';
      const existingContent = JSON.stringify({
        lastUpdated: '2023-11-20T00:00:00Z',
        totalEntries: 1,
        entries: [
          {
            id: 'old-entry',
            date: '2023-11-20',
            title: 'Old Entry',
            description: 'Old description',
            significance: 8.0,
            category: 'development',
            sources: [],
            weekOf: '2023-11-20'
          }
        ]
      });

      // Mock getting existing file
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(existingContent).toString('base64'),
          sha: 'file-sha'
        }
      });

      // Mock updating file
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      await manager.updateTimelineFile(branchName, mockTimelineEntries);

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'data/timeline-events.json',
        ref: branchName
      });

      const updateCall = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      expect(updateCall.owner).toBe('test-owner');
      expect(updateCall.repo).toBe('test-repo');
      expect(updateCall.path).toBe('data/timeline-events.json');
      expect(updateCall.branch).toBe(branchName);
      expect(updateCall.sha).toBe('file-sha');

      // Verify the content includes new entries
      const updatedContent = JSON.parse(Buffer.from(updateCall.content, 'base64').toString());
      expect(updatedContent.entries).toHaveLength(3); // 1 old + 2 new
      expect(updatedContent.totalEntries).toBe(3);
      expect(updatedContent.entries[0].title).toBe('AI Breakthrough'); // Most recent first
    });

    it('should handle file not found (create new file)', async () => {
      const branchName = 'weekly-update-2023-11-27';
      const error = new Error('Not found');
      error.status = 404;

      // Mock file not found
      mockOctokit.rest.repos.getContent.mockRejectedValue(error);

      // Mock creating new file
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      await manager.updateTimelineFile(branchName, mockTimelineEntries);

      const createCall = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      expect(createCall.sha).toBeUndefined(); // No SHA for new file

      const newContent = JSON.parse(Buffer.from(createCall.content, 'base64').toString());
      expect(newContent.entries).toHaveLength(2);
      expect(newContent.totalEntries).toBe(2);
    });

    it('should maintain chronological order (most recent first)', async () => {
      const branchName = 'test-branch';
      
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'commit-sha' } }
      });

      // Add entries in mixed order
      const mixedEntries = [mockTimelineEntries[1], mockTimelineEntries[0]]; // 12-02, 12-01

      await manager.updateTimelineFile(branchName, mixedEntries);

      const createCall = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const content = JSON.parse(Buffer.from(createCall.content, 'base64').toString());
      
      // Should be sorted by date desc (most recent first)
      expect(content.entries[0].date).toBe('2023-12-02');
      expect(content.entries[1].date).toBe('2023-12-01');
    });

    it('should handle update file errors', async () => {
      const branchName = 'test-branch';
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      
      const error = new Error('Update failed');
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(error);

      await expect(manager.updateTimelineFile(branchName, mockTimelineEntries))
        .rejects.toThrow('Update failed');
    });
  });

  describe('createPullRequest', () => {
    it('should create pull request successfully', async () => {
      const branchName = 'weekly-update-2023-11-27';
      
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 123,
          html_url: 'https://github.com/test-owner/test-repo/pull/123'
        }
      });

      mockOctokit.rest.issues.addLabels.mockResolvedValue({});

      const result = await manager.createPullRequest(branchName, mockTimelineEntries);

      expect(result).toEqual({
        number: 123,
        url: 'https://github.com/test-owner/test-repo/pull/123'
      });

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Weekly AI Timeline Update - Week of 2023-11-27',
        head: branchName,
        base: 'main',
        body: expect.stringContaining('## 📅 Week of 2023-11-27')
      });

      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['automation', 'ai-timeline', 'weekly-update']
      });
    });

    it('should generate correct PR description', async () => {
      const branchName = 'weekly-update-2023-11-27';
      
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 123, html_url: 'https://github.com/test/test/pull/123' }
      });
      mockOctokit.rest.issues.addLabels.mockResolvedValue({});

      await manager.createPullRequest(branchName, mockTimelineEntries);

      const createCall = mockOctokit.rest.pulls.create.mock.calls[0][0];
      const description = createCall.body;

      expect(description).toContain('## 📅 Week of 2023-11-27');
      expect(description).toContain('### 🎯 Summary');
      expect(description).toContain('2 new events');
      expect(description).toContain('### 📝 Events Added');
      expect(description).toContain('**AI Breakthrough** (Significance: 9.5)');
      expect(description).toContain('**ML Development** (Significance: 7.8)');
      expect(description).toContain('### 🔗 Sources');
      expect(description).toContain('- [AI News](https://example.com/ai-news)');
      expect(description).toContain('- [ML Blog](https://example.com/ml-blog)');
    });

    it('should handle PR creation failure', async () => {
      const error = new Error('PR creation failed');
      mockOctokit.rest.pulls.create.mockRejectedValue(error);

      await expect(manager.createPullRequest('test-branch', mockTimelineEntries))
        .rejects.toThrow('PR creation failed');
    });

    it('should handle label addition failure gracefully', async () => {
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 123, html_url: 'https://github.com/test/test/pull/123' }
      });
      
      const labelError = new Error('Label addition failed');
      mockOctokit.rest.issues.addLabels.mockRejectedValue(labelError);

      // Should not throw error, just continue
      const result = await manager.createPullRequest('test-branch', mockTimelineEntries);
      
      expect(result).toEqual({
        number: 123,
        url: 'https://github.com/test/test/pull/123'
      });
    });
  });

  describe('getWeekString', () => {
    it('should format date correctly', () => {
      const date = new Date('2023-12-01T10:00:00Z');
      const weekString = manager.getWeekString(date);
      
      // Should return the Monday of that week
      expect(weekString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle different days of the week', () => {
      const monday = new Date('2023-11-27T10:00:00Z'); // Monday
      const friday = new Date('2023-12-01T10:00:00Z');  // Friday
      
      const mondayWeek = manager.getWeekString(monday);
      const fridayWeek = manager.getWeekString(friday);
      
      expect(mondayWeek).toBe(fridayWeek); // Same week
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockOctokit.rest.git.getRef.mockRejectedValue(networkError);

      await expect(manager.createBranch('2023-11-27')).rejects.toThrow('Network error');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Bad credentials');
      authError.status = 401;
      mockOctokit.rest.git.getRef.mockRejectedValue(authError);

      await expect(manager.createBranch('2023-11-27')).rejects.toThrow('Bad credentials');
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = new Error('API rate limit exceeded');
      rateLimitError.status = 403;
      mockOctokit.rest.git.getRef.mockRejectedValue(rateLimitError);

      await expect(manager.createBranch('2023-11-27')).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty timeline entries', async () => {
      const branchName = 'test-branch';
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'commit-sha' } }
      });

      await manager.updateTimelineFile(branchName, []);

      const createCall = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const content = JSON.parse(Buffer.from(createCall.content, 'base64').toString());
      
      expect(content.entries).toHaveLength(0);
      expect(content.totalEntries).toBe(0);
    });

    it('should handle malformed existing timeline file', async () => {
      const branchName = 'test-branch';
      const invalidContent = 'invalid json content';

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(invalidContent).toString('base64'),
          sha: 'file-sha'
        }
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      // Should create new timeline instead of crashing
      await manager.updateTimelineFile(branchName, mockTimelineEntries);

      const updateCall = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const content = JSON.parse(Buffer.from(updateCall.content, 'base64').toString());
      
      expect(content.entries).toHaveLength(2);
    });
  });
});
