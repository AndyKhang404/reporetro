import fs from 'fs';
import path from 'path';
import { GitAnalyzer } from '../git/analyzer.js';
import { AgentSessionCorrelator } from '../sessions/correlator.js';
import { DeadCodeItem, DeadCodeType, DepartedContributor } from '../types.js';

interface RawSymbol {
  symbol: string;
  file: string;
  line: number;
  kind: string;
  excerpt: string;
}

export class DeadCodeDetector {
  private repoPath: string;
  private git: GitAnalyzer;
  private correlator: AgentSessionCorrelator;
  private departedMap: Map<string, DepartedContributor>;

  constructor(repoPath: string, git: GitAnalyzer, correlator: AgentSessionCorrelator, departed: DepartedContributor[]) {
    this.repoPath = path.resolve(repoPath);
    this.git = git;
    this.correlator = correlator;
    this.departedMap = new Map();
    for (const d of departed) {
      this.departedMap.set(d.name.toLowerCase(), d);
      if (d.email) this.departedMap.set(d.email.toLowerCase(), d);
    }
  }

  public detectAll(): DeadCodeItem[] {
    const sourceFiles = this.collectSourceFiles(this.repoPath);
    const allContents = new Map<string, string>();

    for (const file of sourceFiles) {
      try {
        allContents.set(file, fs.readFileSync(file, 'utf-8'));
      } catch {}
    }

    const items: DeadCodeItem[] = [];

    // 1. Detect unreferenced exports
    const unreferenced = this.detectUnreferencedExports(sourceFiles, allContents);
    items.push(...unreferenced);

    // 2. Detect commented-out code blocks
    const commented = this.detectCommentedBlocks(sourceFiles, allContents);
    items.push(...commented);

    // 3. Detect ancient zombie markers (TODO, HACK, DEPRECATED)
    const markers = this.detectAncientMarkers(sourceFiles, allContents);
    items.push(...markers);

    // 4. Detect orphan files
    const orphans = this.detectOrphanFiles(sourceFiles, allContents);
    items.push(...orphans);

    // Sort by Haunt Score descending
    return items.sort((a, b) => b.hauntScore - a.hauntScore);
  }

  private collectSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']);

    const walk = (currentDir: string) => {
      let entries: string[];
      try {
        entries = fs.readdirSync(currentDir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignoreDirs.has(entry) || entry.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && /\.(ts|js|mjs|cjs|py|go|rs|jsx|tsx)$/.test(entry)) {
          // Skip test files from being marked as dead exports themselves
          results.push(fullPath);
        }
      }
    };

    walk(dir);
    return results;
  }

  private detectUnreferencedExports(files: string[], contents: Map<string, string>): DeadCodeItem[] {
    const items: DeadCodeItem[] = [];
    const exportedSymbols: RawSymbol[] = [];

    for (const file of files) {
      if (this.isEntryPoint(file)) continue;
      const content = contents.get(file) || '';
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match TypeScript/JavaScript exports: export (async)? function foo, export const foo, export class Foo
        const exportMatch = line.match(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([a-zA-Z0-9_$]+)/);
        if (exportMatch) {
          const symbol = exportMatch[1];
          if (symbol && !['default', 'init', 'main'].includes(symbol)) {
            exportedSymbols.push({
              symbol,
              file,
              line: i + 1,
              kind: 'export',
              excerpt: lines.slice(i, Math.min(i + 5, lines.length)).join('\n')
            });
          }
        }
      }
    }

    // Now check if each exported symbol appears in any OTHER file
    for (const sym of exportedSymbols) {
      let referencesCount = 0;
      const symbolRegex = new RegExp(`\\b${sym.symbol}\\b`);

      for (const [otherFile, otherContent] of contents.entries()) {
        if (otherFile === sym.file) continue;
        if (symbolRegex.test(otherContent)) {
          referencesCount++;
          break; // Found at least one external reference
        }
      }

      if (referencesCount === 0) {
        items.push(this.buildDeadCodeItem(
          sym.file,
          sym.line,
          sym.line + 5,
          'unreferenced_export',
          sym.symbol,
          sym.excerpt
        ));
      }
    }

    return items;
  }

  private detectCommentedBlocks(files: string[], contents: Map<string, string>): DeadCodeItem[] {
    const items: DeadCodeItem[] = [];

    for (const file of files) {
      const content = contents.get(file) || '';
      const lines = content.split('\n');

      let blockStart = -1;
      let blockLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const isCommentedCode = (trimmed.startsWith('//') && /[\{\}\(\)=;><]|function|const|let|return|import/.test(trimmed)) ||
          (trimmed.startsWith('#') && /def |class |=|return|import/.test(trimmed));

        if (isCommentedCode) {
          if (blockStart === -1) blockStart = i + 1;
          blockLines.push(lines[i]);
        } else {
          if (blockLines.length >= 3) {
            items.push(this.buildDeadCodeItem(
              file,
              blockStart,
              i,
              'commented_block',
              undefined,
              blockLines.slice(0, 6).join('\n')
            ));
          }
          blockStart = -1;
          blockLines = [];
        }
      }

      if (blockLines.length >= 3) {
        items.push(this.buildDeadCodeItem(
          file,
          blockStart,
          lines.length,
          'commented_block',
          undefined,
          blockLines.slice(0, 6).join('\n')
        ));
      }
    }

    return items;
  }

  private detectAncientMarkers(files: string[], contents: Map<string, string>): DeadCodeItem[] {
    const items: DeadCodeItem[] = [];

    for (const file of files) {
      const content = contents.get(file) || '';
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/(TODO|FIXME|HACK|DEPRECATED):?\s+(.*)/i.test(line)) {
          const excerpt = line.trim();
          items.push(this.buildDeadCodeItem(
            file,
            i + 1,
            i + 1,
            'ancient_marker',
            undefined,
            excerpt
          ));
        }
      }
    }

    return items;
  }

  private detectOrphanFiles(files: string[], contents: Map<string, string>): DeadCodeItem[] {
    const items: DeadCodeItem[] = [];

    for (const file of files) {
      if (this.isEntryPoint(file)) continue;

      const baseNameWithoutExt = path.basename(file).replace(/\.[^.]+$/, '');
      let imported = false;

      const importRegex = new RegExp(`['"].*?${baseNameWithoutExt}(?:\\.[a-zA-Z]+)?['"]`);

      for (const [otherFile, otherContent] of contents.entries()) {
        if (otherFile === file) continue;
        if (importRegex.test(otherContent)) {
          imported = true;
          break;
        }
      }

      if (!imported) {
        const fileContent = contents.get(file) || '';
        const excerpt = fileContent.split('\n').slice(0, 8).join('\n');
        items.push(this.buildDeadCodeItem(
          file,
          1,
          Math.min(fileContent.split('\n').length, 30),
          'orphan_file',
          path.basename(file),
          excerpt
        ));
      }
    }

    return items;
  }

  private isEntryPoint(file: string): boolean {
    const base = path.basename(file).toLowerCase();
    const rel = path.relative(this.repoPath, file).toLowerCase();
    return (
      base === 'index.ts' || base === 'index.js' ||
      base === 'main.ts' || base === 'main.py' ||
      base === 'cli.ts' || base === 'server.ts' ||
      base === 'app.ts' || base.includes('test') ||
      rel.startsWith('test/') || rel.startsWith('scripts/')
    );
  }

  private buildDeadCodeItem(
    file: string,
    startLine: number,
    endLine: number,
    type: DeadCodeType,
    symbol?: string,
    excerpt: string = ''
  ): DeadCodeItem {
    const relPath = path.relative(this.repoPath, file);
    const blame = this.git.getBlameForLineRange(file, startLine, endLine);

    const isAuthorDeparted = this.departedMap.has(blame.author.toLowerCase()) ||
      (blame.email && this.departedMap.has(blame.email.toLowerCase()));

    const commitDate = new Date(blame.date);
    const now = new Date();
    const ageMonths = Math.max(1, (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));

    // Calculate Haunt Score (0 - 100)
    let score = 30; // base score
    // Age score: up to 30 points
    score += Math.min(30, ageMonths * 2.5);
    // Type severity
    if (type === 'orphan_file') score += 20;
    else if (type === 'unreferenced_export') score += 15;
    else if (type === 'commented_block') score += 10;
    else if (type === 'ancient_marker') score += 5;

    // Departed author multiplier: +20 points
    if (isAuthorDeparted) score += 20;

    const hauntScore = Math.min(99, Math.round(score));

    // Check Entire / agent session correlation
    const sessionMatch = this.correlator.findSessionForCode(
      relPath,
      symbol,
      blame.commitHash
    );

    // Initial placeholder archaeological explanation and verdict (enriched by Gemma)
    return {
      id: `ghost-${Math.abs(this.hashCode(`${relPath}:${startLine}:${symbol || type}`))}`,
      type,
      file: relPath,
      line: startLine,
      endLine,
      symbol,
      excerpt: excerpt.trim(),
      hauntScore,
      author: blame.author,
      authorEmail: blame.email,
      isAuthorDeparted: !!isAuthorDeparted,
      commitHash: blame.commitHash,
      commitDate: blame.date,
      commitMessage: `Authored in commit ${blame.commitHash.slice(0, 7)}`,
      whyItExists: `Introduced by ${blame.author} around ${blame.date.slice(0, 10)}.`,
      verdict: isAuthorDeparted && hauntScore > 75 ? 'safe_to_exorcise' : 'load_bearing_relic',
      verdictRationale: isAuthorDeparted 
        ? 'Author has departed and no active references remain.' 
        : 'Potential Chesterton fence awaiting AI archaeological verification.',
      agentSession: sessionMatch
    };
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}
