import { DeadCodeItem, DepartedContributor, ChestertonVerdict } from '../types.js';

export class GemmaClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private isAvailable: boolean | null = null;

  constructor() {
    this.baseUrl = (process.env.GEMMA_BASE_URL || 'http://localhost:8080/v1').replace(/\/+$/, '');
    this.apiKey = process.env.GEMMA_API_KEY || 'local';
    this.model = process.env.GEMMA_MODEL || 'gemma-2-2b-it';
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);

      // 1. Check llama-server native /health endpoint
      const rootUrl = this.baseUrl.replace(/\/v1\/?$/, '');
      try {
        const healthRes = await fetch(`${rootUrl}/health`, { signal: controller.signal });
        if (healthRes.ok) {
          clearTimeout(id);
          this.isAvailable = true;
          return true;
        }
      } catch {}

      // 2. Fallback to OpenAI-compatible /v1/models endpoint
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
      clearTimeout(id);
      this.isAvailable = res.ok;
      return res.ok;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  public async explainDeadCode(
    item: DeadCodeItem,
    commitContext: string,
    sessionContext?: string
  ): Promise<{ whyItExists: string; verdict: ChestertonVerdict; verdictRationale: string }> {
    const prompt = `You are RepoRetro, an open-source software archaeologist powered by Google Gemma.
You are investigating a piece of dead code or a code relic found in a git repository.
Analyze the provided code excerpt, commit history, and AI agent session transcript to explain WHY this code exists and whether it is safe to remove.

Artifact Details:
- Type: ${item.type}
- File: ${item.file} (lines ${item.line}-${item.endLine || item.line})
- Symbol: ${item.symbol || 'N/A'}
- Author: ${item.author} (${item.isAuthorDeparted ? 'Departed Contributor' : 'Active Contributor'})
- Commit Hash: ${item.commitHash}
- Commit Date: ${item.commitDate}
- Commit Message: ${item.commitMessage}

Code Excerpt:
\`\`\`
${item.excerpt}
\`\`\`

Git Context:
${commitContext}

AI Agent Session / Entire Checkpoint:
${sessionContext || 'No linked agent session found.'}

Respond with a JSON object in this exact format:
{
  "whyItExists": "2-3 sentences explaining the historical reason this code was created, citing the commit or agent session.",
  "verdict": "load_bearing_relic" | "safe_to_exorcise" | "unfinished_work",
  "verdictRationale": "1-2 sentences justifying the verdict based on Chesterton's Fence principles."
}`;

    try {
      const response = await this.queryGemma(prompt);
      const parsed = this.parseJsonFromMarkdown(response);
      if (parsed && parsed.whyItExists && parsed.verdict) {
        return {
          whyItExists: parsed.whyItExists,
          verdict: parsed.verdict as ChestertonVerdict,
          verdictRationale: parsed.verdictRationale || 'Evaluated via Gemma archaeological analysis.'
        };
      }
    } catch {}

    // Fallback heuristic explanation if model is offline or unparseable
    return this.fallbackExplainDeadCode(item, sessionContext);
  }

  public async generateOfrendaTribute(contributor: DepartedContributor): Promise<string> {
    const prompt = `You are RepoRetro, honoring the spirit of Día de los Muertos in Hacktoberfest 2026.
Write a respectful, warm, 2-paragraph remembrance tribute for a departed contributor who helped build this open-source repository.

Contributor:
- Name: ${contributor.name}
- Active Era: ${contributor.firstCommitDate.slice(0, 10)} to ${contributor.lastCommitDate.slice(0, 10)}
- Months Inactive: ${contributor.monthsInactive} months
- Total Commits: ${contributor.totalCommits}
- Surviving Lines of Code in HEAD: ${contributor.survivingLines}
- Primary Domains Built: ${contributor.signatureDomains.join(', ')}

In the spirit of Día de los Muertos ofrendas, honor their legacy. Mention what they built, the foundation they laid, and why their surviving code continues to serve the project today even in their absence.`;

    try {
      const response = await this.queryGemma(prompt);
      if (response && response.trim().length > 50) {
        return response.trim();
      }
    } catch {}

    // Fallback tribute
    return `In honor of ${contributor.name}, who contributed ${contributor.totalCommits} commits between ${contributor.firstCommitDate.slice(0, 10)} and ${contributor.lastCommitDate.slice(0, 10)}. Though inactive for ${Math.round(contributor.monthsInactive)} months, their architectural footprint endures across ${contributor.signatureDomains.join(', ')} with ${contributor.survivingLines} surviving lines continuing to power the foundation of this repository.`;
  }

  private async queryGemma(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for local CPU inference

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Gemma API error: ${res.statusText}`);

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  private parseJsonFromMarkdown(text: string): any {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      }
      return JSON.parse(text.trim());
    } catch {
      return null;
    }
  }

  private fallbackExplainDeadCode(item: DeadCodeItem, sessionContext?: string): {
    whyItExists: string;
    verdict: ChestertonVerdict;
    verdictRationale: string;
  } {
    const hasSession = !!sessionContext || !!item.agentSession;
    const authorName = item.author;

    if (item.type === 'unreferenced_export') {
      return {
        whyItExists: hasSession
          ? `Generated during an AI coding session by ${authorName} in commit ${item.commitHash.slice(0, 7)} as a planned helper. Callers were refactored or superseded before merging.`
          : `Originally introduced by ${authorName} in commit ${item.commitHash.slice(0, 7)} (${item.commitDate.slice(0, 10)}). Surrounding callers were removed in subsequent refactors.`,
        verdict: item.hauntScore > 80 ? 'safe_to_exorcise' : 'load_bearing_relic',
        verdictRationale: item.hauntScore > 80
          ? 'Confirmed orphaned with zero internal importers. Safe to remove after deprecation cycle.'
          : "Potential Chesterton fence: may serve external consumers, dynamic imports, or entrypoint scripts."
      };
    } else if (item.type === 'orphan_file') {
      return {
        whyItExists: `Standalone module created by ${authorName} in commit ${item.commitHash.slice(0, 7)}. Never wired into main entrypoints.`,
        verdict: 'unfinished_work',
        verdictRationale: 'File contains functional logic that was abandoned or left as an incomplete architectural branch.'
      };
    } else {
      return {
        whyItExists: `Historic code relic preserved in comments by ${authorName} during an in-place migration around ${item.commitDate.slice(0, 10)}.`,
        verdict: 'safe_to_exorcise',
        verdictRationale: 'Commented-out code causes cognitive clutter and is safely preserved in git history.'
      };
    }
  }
}
