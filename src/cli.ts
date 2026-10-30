import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import { RepoRetroOrchestrator } from './mastra/agent.js';
import { ReportDatabase } from './cache/db.js';
import { generateHauntedFixture } from './fixture/generate.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'scan';

  if (command === 'serve') {
    const { startServer } = await import('./server/index.js');
    const port = parseInt(process.env.PORT || '3000', 10);
    startServer(port);
    return;
  }

  if (command === 'scan') {
    let targetPath = args[1] || './fixtures/haunted-repo';
    let isCloned = false;
    let tempDir = '';

    const trimmed = targetPath.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('git@')) {
      tempDir = path.resolve('./data/clones', `cli-clone-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      isCloned = true;

      console.log(`\n📦 Cloning shallow repository from ${trimmed}...`);
      try {
        execSync(`git clone --depth 50 "${trimmed}" "${tempDir}"`, {
          stdio: 'pipe',
          timeout: 60000,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'true'
          }
        });
        targetPath = tempDir;
      } catch (cloneErr: any) {
        if (isCloned && tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        const stderr = cloneErr.stderr ? cloneErr.stderr.toString().trim() : '';
        const details = stderr || cloneErr.message;
        if (details.includes('Repository not found') || details.includes('Authentication failed')) {
          console.error(`\n❌ Error: Repository not found or private (authentication failed): ${trimmed}`);
        } else {
          console.error(`\n❌ Git clone failed: ${details}`);
        }
        process.exit(1);
      }
    } else if (targetPath === './fixtures/haunted-repo' && !fs.existsSync(path.resolve(targetPath, '.git'))) {
      console.log('🕯️ Generating realistic Haunted Showcase Repository fixture...');
      generateHauntedFixture();
    }

    const resolved = path.resolve(targetPath);
    console.log(`\n================================================================`);
    console.log(`💀 REPORETRO: GHOST IN THE REPO ARCHAEOLOGICAL SCANNER`);
    console.log(`🕯️ Honoring the past in the spirit of Día de los Muertos`);
    console.log(`================================================================`);
    console.log(`🔍 Target Repository: ${resolved}`);

    const orchestrator = new RepoRetroOrchestrator();
    const db = new ReportDatabase();

    try {
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
      if (isCloned && tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  console.log(`Usage:`);
  console.log(`  npx tsx src/cli.ts scan [path-to-git-repo]`);
  console.log(`  npx tsx src/cli.ts serve`);
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
