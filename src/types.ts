export type ChestertonVerdict = 'load_bearing_relic' | 'safe_to_exorcise' | 'unfinished_work';

export type DeadCodeType = 
  | 'unreferenced_export' 
  | 'commented_block' 
  | 'orphan_file' 
  | 'ancient_marker'
  | 'departed_ownership';

export interface AgentSessionMatch {
  sessionId: string;
  source: 'entire_checkpoint' | 'jsonl_transcript' | 'commit_trailer';
  timestamp?: string;
  matchedPrompt?: string;
  reasoningSnippet?: string;
  agentToolCalls?: string[];
}

export interface DeadCodeItem {
  id: string;
  type: DeadCodeType;
  file: string;
  line: number;
  endLine?: number;
  symbol?: string;
  excerpt: string;
  hauntScore: number; // 0 - 100
  author: string;
  authorEmail?: string;
  isAuthorDeparted: boolean;
  commitHash: string;
  commitDate: string;
  commitMessage: string;
  whyItExists: string;
  verdict: ChestertonVerdict;
  verdictRationale: string;
  agentSession?: AgentSessionMatch;
}

export interface DepartedContributor {
  name: string;
  email: string;
  firstCommitDate: string;
  lastCommitDate: string;
  monthsInactive: number;
  totalCommits: number;
  survivingLines: number;
  deadLines: number;
  signatureDomains: string[];
  ofrendaTribute: string;
}

export interface AnalysisReport {
  id: string;
  repoPath: string;
  repoName: string;
  scannedAt: string;
  totalFiles: number;
  totalCommitsScanned: number;
  deadCodeCount: number;
  departedCount: number;
  averageHauntScore: number;
  items: DeadCodeItem[];
  contributors: DepartedContributor[];
  summary: string;
}
