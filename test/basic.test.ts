import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { generateHauntedFixture } from '../src/fixture/generate.js';
import { GitAnalyzer } from '../src/git/analyzer.js';
import { AgentSessionCorrelator } from '../src/sessions/correlator.js';
import { DeadCodeDetector } from '../src/detector/dead-code.js';
import { RepoRetroOrchestrator } from '../src/mastra/agent.js';

async function runTests() {
  console.log('🧪 Running RepoRetro automated tests...\n');

  // Test 1: Generate Haunted Fixture
  const fixtureDir = path.resolve('./fixtures/haunted-repo');
  generateHauntedFixture(fixtureDir);
  assert.ok(fs.existsSync(path.join(fixtureDir, '.git')), 'Fixture .git must exist');
  console.log('✅ Test 1: Haunted Showcase fixture generated successfully.');

  // Test 2: Git Analyzer
  const git = new GitAnalyzer(fixtureDir);
  const commits = git.getRecentCommits();
  assert.ok(commits.length >= 4, `Expected at least 4 commits, got ${commits.length}`);

  const departed = git.getDepartedContributors(6);
  assert.ok(departed.length >= 2, `Expected at least 2 departed contributors, got ${departed.length}`);
  const elena = departed.find(d => d.name.includes('Elena'));
  assert.ok(elena, 'Elena Rostova must be identified as departed');
  console.log('✅ Test 2: Git Analyzer detected departed contributors and commits.');

  // Test 3: Session Correlator
  const correlator = new AgentSessionCorrelator(fixtureDir);
  const match = correlator.findSessionForCode('src/telemetry/carrier-pigeon.ts', 'CarrierPigeon');
  assert.ok(match, 'Session correlator must match CarrierPigeon checkpoint');
  assert.ok(match?.sessionId.includes('telemetry'), 'Session ID must match telemetry checkpoint');
  console.log('✅ Test 3: Entire checkpoint correlation matched CarrierPigeon session.');

  // Test 4: Dead Code Detector
  const detector = new DeadCodeDetector(fixtureDir, git, correlator, departed);
  const items = detector.detectAll();
  assert.ok(items.length >= 3, `Expected at least 3 dead code items, got ${items.length}`);

  const unreferenced = items.find(i => i.type === 'unreferenced_export');
  assert.ok(unreferenced, 'Must detect unreferenced exports');
  console.log('✅ Test 4: Dead Code Detector found unreferenced exports and relics.');

  // Test 5: Full Orchestrator End-to-End Run
  const orchestrator = new RepoRetroOrchestrator();
  const report = await orchestrator.analyzeRepo(fixtureDir);
  assert.ok(report.items.length > 0, 'Report must contain dead code items');
  assert.ok(report.contributors.length > 0, 'Report must contain departed contributors');
  assert.ok(report.averageHauntScore > 50, 'Average haunt score must be calculated');
  console.log('✅ Test 5: End-to-End Orchestrator generated valid report.');

  console.log('\n🎉 All tests passed successfully!');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
