import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import {
  isRemoteGitUrl,
  parseGitUrl,
  adaptUrlForCredentials,
  resolveCredentials,
  sanitizeGitOutput,
  cloneRepository
} from '../src/git/cloner.js';
import { generateHauntedFixture } from '../src/fixture/generate.js';

async function runCredentialsTests() {
  console.log('🧪 Running RepoRetro Credentials & Private Repo Tests...\n');

  // Test 1: Remote URL detection
  assert.strictEqual(isRemoteGitUrl('https://github.com/owner/repo.git'), true);
  assert.strictEqual(isRemoteGitUrl('http://gitlab.local/group/project'), true);
  assert.strictEqual(isRemoteGitUrl('git@github.com:owner/repo.git'), true);
  assert.strictEqual(isRemoteGitUrl('ssh://git@github.com/owner/repo.git'), true);
  assert.strictEqual(isRemoteGitUrl('./fixtures/haunted-repo'), false);
  assert.strictEqual(isRemoteGitUrl('/home/user/project'), false);
  console.log('✅ Test 1: Remote Git URL detection verified.');

  // Test 2: Git URL parsing & extraction
  const scpParsed = parseGitUrl('git@github.com:AndyKhang404/reporetro.git');
  assert.strictEqual(scpParsed.protocol, 'ssh');
  assert.strictEqual(scpParsed.host, 'github.com');
  assert.strictEqual(scpParsed.owner, 'AndyKhang404');
  assert.strictEqual(scpParsed.repo, 'reporetro');

  const httpParsed = parseGitUrl('https://github.com/AndyKhang404/reporetro.git');
  assert.strictEqual(httpParsed.protocol, 'https');
  assert.strictEqual(httpParsed.host, 'github.com');
  assert.strictEqual(httpParsed.owner, 'AndyKhang404');
  assert.strictEqual(httpParsed.repo, 'reporetro');

  const embeddedParsed = parseGitUrl('https://myuser:secret123@gitlab.com/team/private-repo.git');
  assert.strictEqual(embeddedParsed.protocol, 'https');
  assert.strictEqual(embeddedParsed.host, 'gitlab.com');
  assert.strictEqual(embeddedParsed.embeddedUsername, 'myuser');
  assert.strictEqual(embeddedParsed.embeddedPassword, 'secret123');
  assert.strictEqual(embeddedParsed.cleanUrl, 'https://gitlab.com/team/private-repo.git');
  console.log('✅ Test 2: Git URL parsing and credential extraction verified.');

  // Test 3: URL adaptation between SSH and HTTPS
  const httpsUrl = parseGitUrl('https://github.com/org/private-repo.git');
  const adaptedToSsh = adaptUrlForCredentials(httpsUrl, { sshKey: 'dummy-ssh-key' });
  assert.strictEqual(adaptedToSsh, 'git@github.com:org/private-repo.git');

  const sshUrl = parseGitUrl('git@github.com:org/private-repo.git');
  const adaptedToHttps = adaptUrlForCredentials(sshUrl, { token: 'ghp_dummytoken' });
  assert.strictEqual(adaptedToHttps, 'https://github.com/org/private-repo.git');

  const unchanged = adaptUrlForCredentials(httpsUrl, { token: 'ghp_dummytoken' });
  assert.strictEqual(unchanged, 'https://github.com/org/private-repo.git');
  console.log('✅ Test 3: Intelligent URL adaptation between HTTPS and SSH verified.');

  // Test 4: Credential resolution priority and fallback
  const resolvedDirect = resolveCredentials({
    token: 'my-custom-token',
    username: 'my-custom-user'
  });
  assert.strictEqual(resolvedDirect?.token, 'my-custom-token');
  assert.strictEqual(resolvedDirect?.username, 'my-custom-user');

  // Fallback to process.env
  const originalGitToken = process.env.GIT_TOKEN;
  try {
    process.env.GIT_TOKEN = 'env-token-fallback';
    const resolvedFromEnv = resolveCredentials({});
    assert.strictEqual(resolvedFromEnv?.token, 'env-token-fallback');
  } finally {
    if (originalGitToken !== undefined) {
      process.env.GIT_TOKEN = originalGitToken;
    } else {
      delete process.env.GIT_TOKEN;
    }
  }
  console.log('✅ Test 4: Credential resolution and environment fallback verified.');

  // Test 5: Credential sanitization (zero leaks in logs or errors)
  const secretToken = 'ghp_SUPER_SECRET_TOKEN_12345';
  const secretKey = 'PRIVATE_KEY_PAYLOAD';
  const leakedError = `fatal: Authentication failed for 'https://${secretToken}@github.com/private/repo' with key ${secretKey}`;
  const sanitized = sanitizeGitOutput(leakedError, [secretToken, secretKey]);

  assert.ok(!sanitized.includes(secretToken), 'Token must be scrubbed');
  assert.ok(!sanitized.includes(secretKey), 'SSH key must be scrubbed');
  assert.ok(sanitized.includes('***'), 'Sanitized text must contain masks');
  console.log('✅ Test 5: Credential scrubbing and mask protection verified.');

  // Test 6: Local repository clone and cleanup
  const fixtureDir = path.resolve('./fixtures/haunted-repo');
  generateHauntedFixture(fixtureDir);

  const localCloned = await cloneRepository(fixtureDir);
  assert.strictEqual(localCloned.isTemporary, false);
  assert.strictEqual(localCloned.targetPath, fixtureDir);

  // Test clone error handling for invalid private repo credentials
  let caughtError: Error | null = null;
  try {
    await cloneRepository('https://github.com/AndyKhang404/nonexistent-private-repo-12345.git', {
      credentials: { token: 'ghp_invalid_dummy_token_abcdef' },
      timeoutMs: 10000
    });
  } catch (err: any) {
    caughtError = err;
  }
  assert.ok(caughtError !== null, 'Clone should fail for invalid private repository');
  assert.ok(
    caughtError!.message.includes('Authentication failed') ||
    caughtError!.message.includes('Repository not found or private'),
    `Expected authentication/not found error, got: ${caughtError!.message}`
  );
  assert.ok(!caughtError!.message.includes('ghp_invalid_dummy_token_abcdef'), 'Error must not leak the token');
  console.log('✅ Test 6: Clone error handling and credential protection verified.');

  console.log('\n🎉 All credentials and private repository tests passed successfully!');
}

runCredentialsTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Credentials test failed:', err);
  process.exit(1);
});
