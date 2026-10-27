import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DepartedContributor } from '../types.js';

export interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  trailers: Record<string, string>;
}

export interface LineBlame {
  author: string;
  email: string;
  commitHash: string;
  date: string;
  line: number;
}

export class GitAnalyzer {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
    if (!fs.existsSync(path.join(this.repoPath, '.git'))) {
      throw new Error(`Directory is not a git repository: ${this.repoPath}`);
    }
  }

  private runGit(args: string[]): string {
    try {
      return execSync(`git ${args.join(' ')}`, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch (err: any) {
      return '';
    }
  }

  public getRepoName(): string {
    const originUrl = this.runGit(['config', '--get', 'remote.origin.url']);
    if (originUrl) {
      const match = originUrl.match(/[\/:]([^\/:]+)\/([^\/:]+?)(?:\.git)?$/);
      if (match) return `${match[1]}/${match[2]}`;
    }
    return path.basename(this.repoPath);
  }

  public getTotalCommitCount(): number {
    const out = this.runGit(['rev-list', '--count', 'HEAD']);
    return parseInt(out, 10) || 0;
  }

  public getRecentCommits(limit: number = 100): CommitInfo[] {
    // Format: Hash%x1fAuthor%x1fEmail%x1fDate%x1fSubject%x1e
    const format = '%H%x1f%an%x1f%ae%x1f%aI%x1f%B%x1e';
    const output = this.runGit(['log', `-n`, `${limit}`, `--format=${format}`]);
    if (!output) return [];

    const commits: CommitInfo[] = [];
    const entries = output.split('\x1e').filter(e => e.trim().length > 0);

    for (const entry of entries) {
      const [hash, author, email, date, rawMessage] = entry.split('\x1f');
      if (!hash) continue;

      const message = (rawMessage || '').trim();
      const trailers: Record<string, string> = {};

      // Parse trailers like Entire-Checkpoint: ..., Entire-Session: ..., Co-authored-by: ...
      const lines = message.split('\n');
      for (const line of lines) {
        const trailerMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
        if (trailerMatch) {
          trailers[trailerMatch[1].toLowerCase()] = trailerMatch[2].trim();
        }
      }

      commits.push({
        hash,
        author: author || 'Unknown',
        email: email || '',
        date: date || new Date().toISOString(),
        message,
        trailers
      });
    }

    return commits;
  }

  public getBlameForLineRange(filePath: string, startLine: number, endLine: number): LineBlame {
    const relPath = path.relative(this.repoPath, filePath);
    const output = this.runGit(['blame', '-L', `${startLine},${endLine}`, '--line-porcelain', '--', relPath]);
    if (!output) {
      return {
        author: 'Unknown',
        email: '',
        commitHash: '0000000',
        date: new Date().toISOString(),
        line: startLine
      };
    }

    let commitHash = '';
    let author = 'Unknown';
    let email = '';
    let authorTime = '';

    for (const line of output.split('\n')) {
      if (/^[0-9a-f]{40}/.test(line)) {
        commitHash = line.split(' ')[0];
      } else if (line.startsWith('author ')) {
        author = line.substring(7);
      } else if (line.startsWith('author-mail ')) {
        email = line.substring(12).replace(/[<>]/g, '');
      } else if (line.startsWith('author-time ')) {
        const timestampSec = parseInt(line.substring(12), 10);
        authorTime = new Date(timestampSec * 1000).toISOString();
      }
    }

    return {
      author,
      email,
      commitHash,
      date: authorTime || new Date().toISOString(),
      line: startLine
    };
  }

  public pickaxeSearch(symbol: string): CommitInfo[] {
    const format = '%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e';
    const output = this.runGit(['log', `-S`, `"${symbol}"`, `--format=${format}`, '-n', '5']);
    if (!output) return [];

    const commits: CommitInfo[] = [];
    const entries = output.split('\x1e').filter(e => e.trim().length > 0);

    for (const entry of entries) {
      const [hash, author, email, date, message] = entry.split('\x1f');
      if (hash) {
        commits.push({
          hash,
          author: author || 'Unknown',
          email: email || '',
          date: date || new Date().toISOString(),
          message: message || '',
          trailers: {}
        });
      }
    }

    return commits;
  }

  public getDepartedContributors(inactivityMonths: number = 6): DepartedContributor[] {
    // 1. Fetch all commit authors with their first and last commit date
    const format = '%an%x1f%ae%x1f%aI';
    const output = this.runGit(['log', `--format=${format}`]);
    if (!output) return [];

    const authorStats: Map<string, {
      name: string;
      email: string;
      firstDate: Date;
      lastDate: Date;
      totalCommits: number;
      filesTouched: Set<string>;
    }> = new Map();

    let newestRepoDate = new Date(0);

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const [name, email, dateStr] = line.split('\x1f');
      if (!name || !dateStr) continue;

      const date = new Date(dateStr);
      if (date > newestRepoDate) newestRepoDate = date;

      const key = (name || email).toLowerCase();
      const existing = authorStats.get(key);

      if (!existing) {
        authorStats.set(key, {
          name,
          email: email || '',
          firstDate: date,
          lastDate: date,
          totalCommits: 1,
          filesTouched: new Set()
        });
      } else {
        existing.totalCommits++;
        if (date < existing.firstDate) existing.firstDate = date;
        if (date > existing.lastDate) existing.lastDate = date;
      }
    }

    // Reference date: the latest commit in the repository (or current date if repo is fresh)
    const refDate = newestRepoDate.getTime() > 0 ? newestRepoDate : new Date();

    const departed: DepartedContributor[] = [];

    for (const stat of authorStats.values()) {
      const diffMs = refDate.getTime() - stat.lastDate.getTime();
      const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.4375);

      if (diffMonths >= inactivityMonths && stat.totalCommits >= 1) {
        // Calculate surviving lines via short blame sample or estimate
        const surviving = this.estimateSurvivingLines(stat.name);

        departed.push({
          name: stat.name,
          email: stat.email,
          firstCommitDate: stat.firstDate.toISOString(),
          lastCommitDate: stat.lastDate.toISOString(),
          monthsInactive: Math.round(diffMonths * 10) / 10,
          totalCommits: stat.totalCommits,
          survivingLines: surviving,
          deadLines: 0, // Will be incremented when dead code detector runs
          signatureDomains: this.getAuthorDomains(stat.name),
          ofrendaTribute: '' // Generated by Gemma
        });
      }
    }

    return departed.sort((a, b) => b.survivingLines - a.survivingLines);
  }

  private estimateSurvivingLines(authorName: string): number {
    try {
      const out = this.runGit(['log', `--author=${authorName}`, '--shortstat', '-n', '50']);
      let lines = 0;
      for (const line of out.split('\n')) {
        const match = line.match(/(\d+)\s+insertions?\(\+\)/);
        if (match) {
          lines += parseInt(match[1], 10);
        }
      }
      return lines;
    } catch {
      return 100;
    }
  }

  private getAuthorDomains(authorName: string): string[] {
    try {
      const out = this.runGit(['log', `--author=${authorName}`, '--name-only', '-n', '30']);
      const dirCounts: Record<string, number> = {};
      for (const line of out.split('\n')) {
        if (!line.trim() || !line.includes('/')) continue;
        const dir = line.split('/')[0];
        dirCounts[dir] = (dirCounts[dir] || 0) + 1;
      }
      return Object.entries(dirCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([dir]) => `${dir}/`);
    } catch {
      return ['src/'];
    }
  }
}
