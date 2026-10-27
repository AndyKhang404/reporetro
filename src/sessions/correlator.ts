import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AgentSessionMatch } from '../types.js';

interface RawSessionTurn {
  sessionId: string;
  source: 'entire_checkpoint' | 'jsonl_transcript' | 'commit_trailer';
  timestamp?: string;
  userPrompt?: string;
  agentReasoning?: string;
  filesTouched: string[];
  symbolsMentioned: string[];
}

export class AgentSessionCorrelator {
  private repoPath: string;
  private indexedSessions: RawSessionTurn[] = [];

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
    this.indexAvailableSessions();
  }

  private indexAvailableSessions(): void {
    // 1. Scan for Entire git ref or directory
    this.scanEntireGitRefs();

    // 2. Scan standard directory locations for session transcripts
    const candidateDirs = [
      path.join(this.repoPath, '.entire'),
      path.join(this.repoPath, '.agent-sessions'),
      path.join(this.repoPath, '.devrelay'),
      path.join(this.repoPath, 'agent-sessions'),
      path.join(this.repoPath, '.sessions')
    ];

    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        this.scanSessionDirectory(dir);
      }
    }
  }

  private scanEntireGitRefs(): void {
    try {
      // Check if entire/checkpoints/v1 exists
      const refCheck = execSync('git rev-parse --verify entire/checkpoints/v1 2>/dev/null', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      }).trim();

      if (refCheck) {
        // List files in entire/checkpoints/v1
        const filesOut = execSync('git ls-tree -r entire/checkpoints/v1 --name-only 2>/dev/null', {
          cwd: this.repoPath,
          encoding: 'utf-8'
        }).trim();

        for (const file of filesOut.split('\n')) {
          if (!file.endsWith('.json') && !file.endsWith('.jsonl') && !file.endsWith('.md')) continue;
          try {
            const content = execSync(`git show entire/checkpoints/v1:${file} 2>/dev/null`, {
              cwd: this.repoPath,
              encoding: 'utf-8',
              maxBuffer: 5 * 1024 * 1024
            });
            this.parseSessionContent(content, `entire:${file}`, 'entire_checkpoint');
          } catch {}
        }
      }
    } catch {}
  }

  private scanSessionDirectory(dir: string): void {
    try {
      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const relFile of files) {
        const fullPath = path.join(dir, relFile);
        if (!fs.statSync(fullPath).isFile()) continue;

        if (relFile.endsWith('.json') || relFile.endsWith('.jsonl') || relFile.endsWith('.md')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const source = relFile.includes('entire') ? 'entire_checkpoint' : 'jsonl_transcript';
            this.parseSessionContent(content, relFile, source);
          } catch {}
        }
      }
    } catch {}
  }

  private parseSessionContent(
    content: string,
    filename: string,
    source: 'entire_checkpoint' | 'jsonl_transcript'
  ): void {
    if (filename.endsWith('.jsonl')) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          this.indexParsedObject(obj, filename, source);
        } catch {}
      }
    } else if (filename.endsWith('.json')) {
      try {
        const obj = JSON.parse(content);
        if (Array.isArray(obj)) {
          for (const item of obj) this.indexParsedObject(item, filename, source);
        } else {
          this.indexParsedObject(obj, filename, source);
        }
      } catch {}
    } else if (filename.endsWith('.md')) {
      // Markdown session format
      this.indexedSessions.push({
        sessionId: path.basename(filename, '.md'),
        source,
        userPrompt: content.slice(0, 500),
        agentReasoning: content.slice(500, 1500),
        filesTouched: this.extractFilenames(content),
        symbolsMentioned: this.extractSymbols(content)
      });
    }
  }

  private indexParsedObject(
    obj: any,
    fallbackId: string,
    source: 'entire_checkpoint' | 'jsonl_transcript'
  ): void {
    const sessionId = obj.session_id || obj.sessionId || obj.id || fallbackId;
    const prompt = obj.prompt || obj.user_prompt || obj.content || obj.input || '';
    const reasoning = obj.thinking || obj.reasoning || obj.explanation || obj.summary || '';
    const fullText = JSON.stringify(obj);

    this.indexedSessions.push({
      sessionId,
      source,
      timestamp: obj.timestamp || obj.created_at,
      userPrompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      agentReasoning: typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning),
      filesTouched: this.extractFilenames(fullText),
      symbolsMentioned: this.extractSymbols(fullText)
    });
  }

  private extractFilenames(text: string): string[] {
    const matches = text.match(/[a-zA-Z0-9_\-\.\/]+\.(ts|js|py|json|md|go|rs)/g) || [];
    return Array.from(new Set(matches.map(m => path.basename(m))));
  }

  private extractSymbols(text: string): string[] {
    const matches = text.match(/\b(function|class|const|def)\s+([a-zA-Z0-9_]+)/g) || [];
    return Array.from(new Set(matches.map(m => m.split(/\s+/)[1])));
  }

  public findSessionForCode(
    file: string,
    symbol?: string,
    commitHash?: string,
    commitMessage?: string,
    trailers?: Record<string, string>
  ): AgentSessionMatch | undefined {
    // 1. Direct trailer match
    if (trailers) {
      const explicitSession = trailers['entire-checkpoint'] || trailers['entire-session'] || trailers['agent-session'];
      if (explicitSession) {
        const found = this.indexedSessions.find(s => s.sessionId.includes(explicitSession));
        return {
          sessionId: explicitSession,
          source: 'entire_checkpoint',
          matchedPrompt: found?.userPrompt || `Linked via commit trailer Entire-Checkpoint: ${explicitSession}`,
          reasoningSnippet: found?.agentReasoning || `Commit ${commitHash?.slice(0, 7)} generated under Entire session ${explicitSession}`,
          agentToolCalls: ['git_commit', 'write_to_file']
        };
      }
    }

    const baseName = path.basename(file);

    // 2. Search indexed sessions
    for (const session of this.indexedSessions) {
      const touchesFile = session.filesTouched.some(f => f === baseName || f === file);
      const touchesSymbol = symbol && session.symbolsMentioned.some(s => s === symbol);

      if (touchesSymbol || (touchesFile && symbol && (session.userPrompt?.includes(symbol) || session.agentReasoning?.includes(symbol)))) {
        return {
          sessionId: session.sessionId,
          source: session.source,
          timestamp: session.timestamp,
          matchedPrompt: session.userPrompt?.slice(0, 300),
          reasoningSnippet: session.agentReasoning?.slice(0, 400),
          agentToolCalls: ['edit_file', 'verify_tests']
        };
      }
    }

    // 3. Fallback: check if commit message mentions an agent
    if (commitMessage && (commitMessage.includes('Entire:') || commitMessage.includes('Agent:') || commitMessage.includes('co-authored-by: entire'))) {
      return {
        sessionId: `entire-${commitHash?.slice(0, 7) || 'auto'}`,
        source: 'commit_trailer',
        matchedPrompt: `Commit message: "${commitMessage.slice(0, 200)}"`,
        reasoningSnippet: `Agent created this change in commit ${commitHash?.slice(0, 7)}`,
        agentToolCalls: ['git_commit']
      };
    }

    return undefined;
  }
}
