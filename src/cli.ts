import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import { RepoRetroOrchestrator } from './mastra/agent.js';
import { ReportDatabase } from './cache/db.js';
import { generateHauntedFixture } from './fixture/generate.js';
import { cloneRepository, isRemoteGitUrl } from './git/cloner.js';
import { GitCredentials } from './types.js';

function parseCliArgs(args: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--token' || arg === '-t') {
      flags.token = args[++i];
    } else if (arg === '--username' || arg === '-u') {
      flags.username = args[++i];
    } else if (arg === '--password' || arg === '-p') {
      flags.password = args[++i];
    } else if (arg === '--ssh-key' || arg === '-k') {
      flags.sshKeyPath = args[++i];
    } else if (arg.startsWith('--token=')) {
      flags.token = arg.substring(8);
    } else if (arg.startsWith('--username=')) {
      flags.username = arg.substring(11);
    } else if (arg.startsWith('--password=')) {
      flags.password = arg.substring(11);
    } else if (arg.startsWith('--ssh-key=')) {
      flags.sshKeyPath = arg.substring(10);
    } else if (arg === '--help' || arg === '-h') {
      flags.help = 'true';
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { flags, positional } = parseCliArgs(rawArgs);
  const command = positional[0] || 'scan';

  if (flags.help || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'serve') {
    const { startServer } = await import('./server/index.js');
    const port = parseInt(process.env.PORT || '3000', 10);
    startServer(port);
    return;
  }

  if (command === 'scan') {
    let targetPath = positional[1] || './fixtures/haunted-repo';
    const credentials: GitCredentials = {
      token: flags.token,
      username: flags.username,
      password: flags.password,
      sshKeyPath: flags.sshKeyPath
    };

    if (targetPath === './fixtures/haunted-repo' && !fs.existsSync(path.resolve(targetPath, '.git'))) {
      console.log('🕯️ Generating realistic Haunted Showcase Repository fixture...');
      generateHauntedFixture();
    }

    let clonedRepo: { targetPath: string; isTemporary: boolean; cleanup: () => void } | null = null;
    try {
      if (isRemoteGitUrl(targetPath)) {
        console.log(`\n📦 Cloning repository from ${targetPath}...`);
      }
      clonedRepo = await cloneRepository(targetPath, { credentials });
      const resolved = clonedRepo.targetPath;

      console.log(`\n================================================================`);
      console.log(`💀 REPORETRO: GHOST IN THE REPO ARCHAEOLOGICAL SCANNER`);
      console.log(`🕯️ Honoring the past in the spirit of Día de los Muertos`);
      console.log(`================================================================`);
      console.log(`🔍 Target Repository: ${resolved}`);

      const orchestrator = new RepoRetroOrchestrator();
      const db = new ReportDatabase();

      const startTime = Date.now();
      const report = await orchestrator.analyzeRepo(resolved);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      db.saveReport(report);

    console.log(`\n✅ Scan completed in ${duration}s (Report ID: ${report.id})`);
    console.log(`📦 Modules Scanned: ${report.totalFiles} | Total Commits: ${report.totalCommitsScanned}`);
    console.log(`🪦 Dead Code Relics Found: ${report.deadCodeCount}`);
    console.log(`🕯️ Long-Gone Contributors (>=6m inactive): ${report.departedCount}`);
    console.log(`📊 Average Haunt Score: ${report.averageHauntScore}/100\n`);

    // 1. Print Ofrenda for Departed Contributors
    console.log(`----------------------------------------------------------------`);
    console.log(`🌼 DÍA DE LOS MUERTOS OFRENDA: LONG-GONE CONTRIBUTORS`);
    console.log(`----------------------------------------------------------------`);
    if (report.contributors.length === 0) {
      console.log(`No departed contributors detected (all authors active recently).`);
    } else {
      for (const contrib of report.contributors) {
        console.log(`\n🕯️  ${contrib.name} <${contrib.email || 'no-email'}>`);
        console.log(`   • Active: ${contrib.firstCommitDate.slice(0, 10)} → ${contrib.lastCommitDate.slice(0, 10)} (${Math.round(contrib.monthsInactive)} months departed)`);
        console.log(`   • Footprint: ${contrib.totalCommits} commits, ${contrib.survivingLines} surviving lines in HEAD, ${contrib.deadLines} dead/relic lines`);
        console.log(`   • Key Domains: ${contrib.signatureDomains.join(', ')}`);
        console.log(`   • Ofrenda Tribute: "${contrib.ofrendaTribute}"`);
      }
    }

    // 2. Print Dead Code Graveyard
    console.log(`\n----------------------------------------------------------------`);
    console.log(`🪦 THE GRAVEYARD: DEAD CODE RELICS & CHESTERTON'S FENCE VERDICTS`);
    console.log(`----------------------------------------------------------------`);
    if (report.items.length === 0) {
      console.log(`No dead code detected in this codebase! Clean as a whistle.`);
    } else {
      for (const item of report.items) {
        const icon = item.verdict === 'safe_to_exorcise' ? '🪦' : item.verdict === 'load_bearing_relic' ? '🕯️' : '🌼';
        const authorTag = item.isAuthorDeparted ? `${item.author} (DEPARTED)` : item.author;

        console.log(`\n${icon} [Haunt Score: ${item.hauntScore}] ${item.file}:${item.line} - ${item.symbol || item.type}`);
        console.log(`   • Author: ${authorTag} in commit ${item.commitHash.slice(0, 7)} (${item.commitDate.slice(0, 10)})`);
        if (item.agentSession) {
          console.log(`   • AI Agent Session: ${item.agentSession.sessionId} (${item.agentSession.source})`);
          if (item.agentSession.matchedPrompt) {
            console.log(`     Prompt: "${item.agentSession.matchedPrompt.slice(0, 100)}..."`);
          }
        }
        console.log(`   • Why it exists: ${item.whyItExists}`);
        console.log(`   • Verdict: ${item.verdict.toUpperCase()}`);
        console.log(`   • Rationale: ${item.verdictRationale}`);
      }
    }

    console.log(`\n================================================================`);
    console.log(`🌐 Start the Web Dashboard with: npx tsx src/cli.ts serve`);
    console.log(`================================================================\n`);
    return;
    } finally {
      if (clonedRepo) {
        clonedRepo.cleanup();
      }
    }
  }

  printHelp();
}

function printHelp() {
  console.log(`
💀 REPORETRO: GHOST IN THE REPO CLI
Archaeological scanner for dead code, relics, and departed contributors.

Usage:
  npx reporetro scan [path-or-git-url] [options]
  npx reporetro serve [--port 3000]

Options:
  -t, --token <token>          Personal access token (PAT) for private git repos
  -u, --username <username>    Git username (optional, defaults by git host)
  -p, --password <password>    Git password or token
  -k, --ssh-key <path>         Path to SSH private key file for git@... / ssh://... URLs
  -h, --help                   Display this help message

Environment Variables Supported:
  GIT_TOKEN, GITHUB_TOKEN      Personal access token for GitHub/GitLab
  GIT_USERNAME, GIT_PASSWORD   HTTP basic credentials
  GIT_SSH_KEY, GIT_SSH_KEY_PATH SSH private key text or key file path

Examples:
  # Scan local repository or bundled fixture
  npm run cli scan
  npm run cli scan ./my-project

  # Scan public GitHub repository
  npm run cli scan https://github.com/AndyKhang404/reporetro

  # Scan private repository with Personal Access Token
  npm run cli scan https://github.com/owner/private-repo --token ghp_yourTokenHere

  # Scan private repository via SSH key
  npm run cli scan git@github.com:owner/private-repo.git --ssh-key ~/.ssh/id_ed25519
`);
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
