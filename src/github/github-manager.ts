/**
 * GitHubManager - Manages GitHub operations for timeline updates
 */

import { Octokit } from '@octokit/rest';
import { TimelineEntry, AnalyzedEvent, toTimelineEntry } from '../types';
import { TimelineReader, TimelineData } from './timeline-reader';

/**
 * Configuration for GitHubManager
 */
export interface GitHubManagerConfig {
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Path to timeline-events.json file */
  filePath?: string;
  /** Base branch to create PRs against */
  baseBranch?: string;
  /** GitHub token for authentication */
  token?: string;
  /** Labels to add to PRs */
  defaultLabels?: string[];
}

/**
 * Result from creating a pull request
 */
export interface PullRequestResult {
  /** PR number */
  number: number;
  /** PR URL */
  url: string;
  /** Branch name */
  branch: string;
  /** Whether the PR was created (true) or already existed (false) */
  created: boolean;
}

/**
 * Manages GitHub operations for timeline updates
 */
export class GitHubManager {
  private octokit: Octokit;
  private config: Required<GitHubManagerConfig>;
  private timelineReader: TimelineReader;

  constructor(config: GitHubManagerConfig) {
    this.config = {
      owner: config.owner,
      repo: config.repo,
      filePath: config.filePath || 'data/timeline-events.json',
      baseBranch: config.baseBranch || 'main',
      token: config.token || process.env.GITHUB_TOKEN || '',
      defaultLabels: config.defaultLabels || ['automated', 'weekly-update']
    };

    this.octokit = new Octokit({
      auth: this.config.token
    });

    this.timelineReader = new TimelineReader({
      owner: this.config.owner,
      repo: this.config.repo,
      filePath: this.config.filePath,
      branch: this.config.baseBranch,
      token: this.config.token
    });
  }

  /**
   * Create a pull request with new timeline events
   */
  async createTimelineUpdatePR(
    events: AnalyzedEvent[],
    weekNumber?: number,
    year?: number
  ): Promise<PullRequestResult> {
    // Convert to timeline entries
    const timelineEntries = events.map(toTimelineEntry);
    
    if (timelineEntries.length === 0) {
      throw new Error('No events to add to timeline');
    }

    // Calculate week number if not provided
    const now = new Date();
    if (!weekNumber || !year) {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      weekNumber = weekNumber || Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
      year = year || now.getFullYear();
    }

    // Generate branch name
    const branchName = this.generateBranchName(year, weekNumber);
    console.log(`Creating PR with branch: ${branchName}`);

    try {
      // Check if PR already exists
      const existingPR = await this.checkExistingPR(branchName);
      if (existingPR) {
        console.log(`PR already exists: #${existingPR.number}`);
        return {
          number: existingPR.number,
          url: existingPR.html_url,
          branch: branchName,
          created: false
        };
      }

      // Fetch current timeline
      const currentTimeline = await this.timelineReader.fetchTimeline();
      
      // Validate new events
      const validation = this.timelineReader.validateNewEvents(timelineEntries, currentTimeline.events);
      if (!validation.valid) {
        throw new Error(`Event validation failed: ${validation.conflicts.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        console.warn('Validation warnings:', validation.warnings);
      }

      // Filter out any events that already exist
      const newEvents = this.timelineReader.filterNewEvents(timelineEntries, currentTimeline.events);
      if (newEvents.length === 0) {
        console.log('All events already exist in timeline');
        throw new Error('No new events to add');
      }

      // Create or update branch
      await this.createOrUpdateBranch(branchName);

      // Update timeline file
      await this.updateTimelineFile(
        currentTimeline,
        newEvents,
        branchName
      );

      // Generate PR description
      const description = this.generatePRDescription(events, newEvents, validation.warnings);

      // Create pull request
      const pr = await this.createPullRequest(
        branchName,
        `Weekly AI Timeline Update - Week ${weekNumber}, ${year}`,
        description
      );

      // Add labels
      await this.addLabels(pr.number, events);

      console.log(`Successfully created PR #${pr.number}: ${pr.html_url}`);
      
      return {
        number: pr.number,
        url: pr.html_url,
        branch: branchName,
        created: true
      };
    } catch (error) {
      console.error('Error creating timeline update PR:', error);
      throw error;
    }
  }

  /**
   * Generate branch name for the update
   */
  private generateBranchName(year: number, weekNumber: number): string {
    return `auto-update/week-${year}-${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Check if a PR already exists for the branch
   */
  private async checkExistingPR(branchName: string): Promise<any> {
    try {
      const { data: prs } = await this.octokit.pulls.list({
        owner: this.config.owner,
        repo: this.config.repo,
        head: `${this.config.owner}:${branchName}`,
        state: 'open'
      });

      return prs.length > 0 ? prs[0] : null;
    } catch (error) {
      console.error('Error checking for existing PR:', error);
      return null;
    }
  }

  /**
   * Create or update a branch
   */
  async createOrUpdateBranch(branchName: string): Promise<void> {
    try {
      // Get the SHA of the base branch
      const { data: baseBranch } = await this.octokit.repos.getBranch({
        owner: this.config.owner,
        repo: this.config.repo,
        branch: this.config.baseBranch
      });

      const baseSha = baseBranch.commit.sha;

      // Try to create the branch
      try {
        await this.octokit.git.createRef({
          owner: this.config.owner,
          repo: this.config.repo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        });
        console.log(`Created new branch: ${branchName}`);
      } catch (error: any) {
        if (error.status === 422) {
          // Branch already exists, update it
          await this.octokit.git.updateRef({
            owner: this.config.owner,
            repo: this.config.repo,
            ref: `heads/${branchName}`,
            sha: baseSha,
            force: true
          });
          console.log(`Updated existing branch: ${branchName}`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error creating/updating branch:', error);
      throw new Error(`Failed to create/update branch: ${error}`);
    }
  }

  /**
   * Update the timeline file with new events
   */
  async updateTimelineFile(
    currentTimeline: TimelineData,
    newEvents: TimelineEntry[],
    branchName: string
  ): Promise<string> {
    // Merge and sort events chronologically
    const allEvents = [...currentTimeline.events, ...newEvents]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Create updated content with the new structure
    const updatedData = {
      lastUpdated: new Date().toISOString(),
      totalEntries: allEvents.length,
      entries: allEvents
    };

    const updatedContent = JSON.stringify(updatedData, null, 2);

    // Update file on GitHub
    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.filePath,
        message: `Add ${newEvents.length} new AI timeline event${newEvents.length > 1 ? 's' : ''}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: currentTimeline.sha || undefined,
        branch: branchName
      });

      console.log(`Updated timeline file with ${newEvents.length} new events`);
      return updatedContent;
    } catch (error) {
      console.error('Error updating timeline file:', error);
      throw new Error(`Failed to update timeline file: ${error}`);
    }
  }

  // Public method for creating a PR (delegates to private method)
  async createPullRequest(
    branchName: string,
    title: string,
    body: string
  ): Promise<any> {
    try {
      const { data: pr } = await this.octokit.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title,
        body,
        head: branchName,
        base: this.config.baseBranch
      });

      return pr;
    } catch (error) {
      console.error('Error creating pull request:', error);
      throw new Error(`Failed to create pull request: ${error}`);
    }
  }

  /**
   * Generate PR description
   */
  private generatePRDescription(
    analyzedEvents: AnalyzedEvent[],
    addedEntries: TimelineEntry[],
    warnings: string[]
  ): string {
    const lines: string[] = [];
    
    lines.push('## 🤖 Weekly AI Timeline Update\n');
    lines.push(`This automated PR adds ${addedEntries.length} significant AI developments to the timeline.\n`);
    
    // Summary statistics
    lines.push('### 📊 Summary');
    lines.push(`- **Events analyzed**: ${analyzedEvents.length}`);
    lines.push(`- **Events added**: ${addedEntries.length}`);
    lines.push(`- **Date range**: ${this.getDateRange(addedEntries)}`);
    
    // Categories breakdown
    const categories = this.getCategoryBreakdown(addedEntries);
    lines.push(`- **Categories**: ${Object.entries(categories).map(([cat, count]) => `${cat} (${count})`).join(', ')}\n`);
    
    // Events details
    lines.push('### 📝 Events Added\n');
    analyzedEvents.forEach((event, index) => {
      const entry = addedEntries.find(e => e.id === event.id);
      if (!entry) return;
      
      lines.push(`#### ${index + 1}. ${event.title}`);
      lines.push(`- **Date**: ${new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
      lines.push(`- **Category**: \`${event.category}\``);
      lines.push(`- **Impact Score**: ${event.impactScore}/10`);
      
      // Significance breakdown
      if (event.significance) {
        lines.push('- **Significance**:');
        lines.push(`  - Technological Breakthrough: ${event.significance.technologicalBreakthrough}/10`);
        lines.push(`  - Industry Impact: ${event.significance.industryImpact}/10`);
        lines.push(`  - Adoption Scale: ${event.significance.adoptionScale}/10`);
        lines.push(`  - Novelty: ${event.significance.novelty}/10`);
      }
      
      lines.push(`\n${event.description}\n`);
      
      if (event.sources && event.sources.length > 0) {
        lines.push('**Sources:**');
        event.sources.forEach(source => {
          lines.push(`- ${source}`);
        });
        lines.push('');
      }
    });
    
    // Selection criteria
    lines.push('### 🎯 Selection Criteria');
    lines.push('Events were selected based on:');
    lines.push('- Technological breakthrough potential');
    lines.push('- Industry-wide impact');
    lines.push('- Expected adoption scale');
    lines.push('- Novelty of the development');
    lines.push(`- Minimum significance threshold: 7.0/10\n`);
    
    // Warnings if any
    if (warnings.length > 0) {
      lines.push('### ⚠️ Warnings');
      warnings.forEach(warning => {
        lines.push(`- ${warning}`);
      });
      lines.push('');
    }
    
    // Metadata
    lines.push('### 🔧 Metadata');
    lines.push('- **Generated by**: AI Timeline Automation');
    lines.push(`- **Timestamp**: ${new Date().toISOString()}`);
    lines.push('- **Type**: Automated weekly update');
    
    return lines.join('\n');
  }


  /**
   * Add labels to the pull request
   */
  private async addLabels(prNumber: number, events: AnalyzedEvent[]): Promise<void> {
    const labels = [...this.config.defaultLabels];
    
    // Add category-specific labels
    const categories = new Set(events.map(e => e.category));
    categories.forEach(category => {
      labels.push(`category:${category}`);
    });
    
    // Add impact level label
    const maxImpact = Math.max(...events.map(e => e.impactScore));
    if (maxImpact >= 9) {
      labels.push('impact:critical');
    } else if (maxImpact >= 7) {
      labels.push('impact:high');
    } else {
      labels.push('impact:moderate');
    }
    
    try {
      await this.octokit.issues.addLabels({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: prNumber,
        labels
      });
      console.log(`Added labels to PR #${prNumber}: ${labels.join(', ')}`);
    } catch (error) {
      console.warn('Error adding labels (they may not exist in the repo):', error);
    }
  }

  /**
   * Get date range of events
   */
  private getDateRange(events: TimelineEntry[]): string {
    if (events.length === 0) return 'N/A';
    
    const dates = events.map(e => new Date(e.date));
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const format = (date: Date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    if (earliest.getTime() === latest.getTime()) {
      return format(earliest);
    }
    
    return `${format(earliest)} - ${format(latest)}`;
  }

  /**
   * Get category breakdown
   */
  private getCategoryBreakdown(events: TimelineEntry[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    events.forEach(event => {
      breakdown[event.category] = (breakdown[event.category] || 0) + 1;
    });
    
    return breakdown;
  }
}
