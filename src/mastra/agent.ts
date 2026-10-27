import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitAnalyzer } from '../git/analyzer.js';
import { DeadCodeDetector } from '../detector/dead-code.js';
import { AgentSessionCorrelator } from '../sessions/correlator.js';
import { GemmaClient } from '../ai/gemma.js';
import { AnalysisReport, DeadCodeItem, DepartedContributor } from '../types.js';

export function createRepoRetroAgent(repoPath: string, gemma: GemmaClient, git: GitAnalyzer, correlator: AgentSessionCorrelator) {
  const inspectGitCommitTool = createTool({
    id: 'inspect_git_commit',
    description: 'Inspect a commit hash to retrieve its message, author, date, and Entire metadata trailers',
    inputSchema: z.object({
      commitHash: z.string().describe('The full or short commit hash')
    }),
    outputSchema: z.object({
      commitHash: z.string(),
      author: z.string(),
      date: z.string(),
      message: z.string(),
      entireCheckpointId: z.string().optional()
    }),
    execute: async (input: { commitHash: string }) => {
      const commits = git.getRecentCommits(50);
      const found = commits.find(c => c.hash.startsWith(input.commitHash) || input.commitHash.startsWith(c.hash));
      return {
        commitHash: found?.hash || input.commitHash,
        author: found?.author || 'Unknown',
        date: found?.date || new Date().toISOString(),
        message: found?.message || 'Commit message not found',
        entireCheckpointId: found?.trailers['entire-checkpoint']
      };
    }
  });

  const searchSessionTool = createTool({
    id: 'search_agent_session',
    description: 'Search Entire checkpoints and agent transcripts for reasons why code was introduced',
    inputSchema: z.object({
      file: z.string(),
      symbol: z.string().optional()
    }),
    outputSchema: z.object({
      hasSession: z.boolean(),
      sessionId: z.string().optional(),
      reasoning: z.string().optional()
    }),
    execute: async (input: { file: string; symbol?: string }) => {
      const match = correlator.findSessionForCode(input.file, input.symbol);
      return {
        hasSession: !!match,
        sessionId: match?.sessionId,
        reasoning: match?.reasoningSnippet
      };
    }
  });

  return new Agent({
    id: 'reporetro-archaeologist',
    name: 'RepoRetro Archaeologist',
    instructions: `You are RepoRetro, an open-source repository archaeologist honoring Hacktoberfest 2026's "Ghost in the Machine" and Día de los Muertos.
Your mission is to find dead code and long-gone contributors, correlate git commit history with Entire agent sessions, and decide if dead code is a load-bearing relic or safe to lay to rest.`,
    model: {
      id: 'openai/gemma-2-2b-it',
      url: process.env.GEMMA_BASE_URL || 'http://localhost:8080/v1'
    },
    tools: {
      inspectGitCommit: inspectGitCommitTool,
      searchSession: searchSessionTool
    }
  });
}

export class RepoRetroOrchestrator {
  private gemma: GemmaClient;

  constructor() {
    this.gemma = new GemmaClient();
  }

  public async analyzeRepo(repoPath: string): Promise<AnalysisReport> {
    const git = new GitAnalyzer(repoPath);
    const correlator = new AgentSessionCorrelator(repoPath);
    const repoName = git.getRepoName();

    // 1. Find departed contributors (> 6 months inactive)
    const monthsThreshold = parseInt(process.env.DEPARTED_CONTRIBUTOR_MONTHS || '6', 10);
    const departed = git.getDepartedContributors(monthsThreshold);

    // 2. Detect dead code & code relics
    const detector = new DeadCodeDetector(repoPath, git, correlator, departed);
    const deadItems = detector.detectAll();

    // 3. Update departed contributors with count of dead lines they authored
    for (const item of deadItems) {
      if (item.isAuthorDeparted) {
        const found = departed.find(d => d.name.toLowerCase() === item.author.toLowerCase() || (item.authorEmail && d.email.toLowerCase() === item.authorEmail.toLowerCase()));
        if (found) {
          const lines = (item.endLine && item.endLine > item.line) ? (item.endLine - item.line + 1) : 1;
          found.deadLines += lines;
        }
      }
    }

    // 4. Enrich top dead code items with Gemma archaeological explanation
    const enrichedItems: DeadCodeItem[] = [];
    // Process up to 15 top items with Gemma for fast, high-quality responses
    for (let i = 0; i < deadItems.length; i++) {
      const item = deadItems[i];
      if (i < 15) {
        const sessionContext = item.agentSession
          ? `Entire Checkpoint: ${item.agentSession.sessionId}\nPrompt: ${item.agentSession.matchedPrompt || ''}\nReasoning: ${item.agentSession.reasoningSnippet || ''}`
          : undefined;

        const explanation = await this.gemma.explainDeadCode(
          item,
          `Commit: ${item.commitHash}\nDate: ${item.commitDate}\nMessage: ${item.commitMessage}`,
          sessionContext
        );

        enrichedItems.push({
          ...item,
          whyItExists: explanation.whyItExists,
          verdict: explanation.verdict,
          verdictRationale: explanation.verdictRationale
        });
      } else {
        enrichedItems.push(item);
      }
    }

    // 5. Generate Día de los Muertos Ofrenda tribute cards for departed contributors
    const enrichedDeparted: DepartedContributor[] = [];
    for (let i = 0; i < departed.length; i++) {
      const d = departed[i];
      if (i < 5) {
        const tribute = await this.gemma.generateOfrendaTribute(d);
        enrichedDeparted.push({ ...d, ofrendaTribute: tribute });
      } else {
        enrichedDeparted.push({
          ...d,
          ofrendaTribute: `Honoring ${d.name}'s architectural legacy of ${d.totalCommits} commits across ${d.signatureDomains.join(', ')}.`
        });
      }
    }

    const totalFiles = (deadItems.length > 0) ? new Set(deadItems.map(i => i.file)).size : 1;
    const avgScore = deadItems.length > 0
      ? Math.round(deadItems.reduce((acc, curr) => acc + curr.hauntScore, 0) / deadItems.length)
      : 0;

    const summary = `Scanned ${repoName}: discovered ${deadItems.length} code relics across ${totalFiles} modules and honored ${departed.length} departed contributors in the spirit of Día de los Muertos.`;

    const reportId = `repo-${Math.abs(this.hashCode(repoName))}-${Date.now().toString(36)}`;

    return {
      id: reportId,
      repoPath,
      repoName,
      scannedAt: new Date().toISOString(),
      totalFiles,
      totalCommitsScanned: git.getTotalCommitCount(),
      deadCodeCount: deadItems.length,
      departedCount: departed.length,
      averageHauntScore: avgScore,
      items: enrichedItems,
      contributors: enrichedDeparted,
      summary
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
