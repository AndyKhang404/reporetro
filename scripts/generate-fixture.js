import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
export function generateHauntedFixture(fixtureDir = './fixtures/haunted-repo') {
    const targetDir = path.resolve(fixtureDir);
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });
    const run = (cmd, env = {}) => {
        execSync(cmd, {
            cwd: targetDir,
            stdio: 'pipe',
            env: {
                ...process.env,
                GIT_AUTHOR_NAME: 'Elena Rostova',
                GIT_AUTHOR_EMAIL: 'elena@heritage-labs.org',
                GIT_COMMITTER_NAME: 'Elena Rostova',
                GIT_COMMITTER_EMAIL: 'elena@heritage-labs.org',
                GIT_AUTHOR_DATE: '2023-04-12T10:00:00Z',
                GIT_COMMITTER_DATE: '2023-04-12T10:00:00Z',
                ...env
            }
        });
    };
    const elenaEnv = {
        GIT_AUTHOR_NAME: 'Elena Rostova',
        GIT_AUTHOR_EMAIL: 'elena@heritage-labs.org',
        GIT_COMMITTER_NAME: 'Elena Rostova',
        GIT_COMMITTER_EMAIL: 'elena@heritage-labs.org',
        GIT_AUTHOR_DATE: '2023-04-12T10:00:00Z',
        GIT_COMMITTER_DATE: '2023-04-12T10:00:00Z'
    };
    const marcusEnv1 = {
        GIT_AUTHOR_NAME: 'Marcus Vance',
        GIT_AUTHOR_EMAIL: 'marcus@cloudbridge.dev',
        GIT_COMMITTER_NAME: 'Marcus Vance',
        GIT_COMMITTER_EMAIL: 'marcus@cloudbridge.dev',
        GIT_AUTHOR_DATE: '2024-02-15T14:30:00Z',
        GIT_COMMITTER_DATE: '2024-02-15T14:30:00Z'
    };
    const marcusEnv2 = {
        GIT_AUTHOR_NAME: 'Marcus Vance',
        GIT_AUTHOR_EMAIL: 'marcus@cloudbridge.dev',
        GIT_COMMITTER_NAME: 'Marcus Vance',
        GIT_COMMITTER_EMAIL: 'marcus@cloudbridge.dev',
        GIT_AUTHOR_DATE: '2024-05-10T09:15:00Z',
        GIT_COMMITTER_DATE: '2024-05-10T09:15:00Z'
    };
    const sofiaEnv = {
        GIT_AUTHOR_NAME: 'Sofia Chen',
        GIT_AUTHOR_EMAIL: 'sofia@active-maintainer.io',
        GIT_COMMITTER_NAME: 'Sofia Chen',
        GIT_COMMITTER_EMAIL: 'sofia@active-maintainer.io',
        GIT_AUTHOR_DATE: '2026-10-20T16:00:00Z',
        GIT_COMMITTER_DATE: '2026-10-20T16:00:00Z'
    };
    run('git init -b main');
    run('git config user.name "Elena Rostova"');
    run('git config user.email "elena@heritage-labs.org"');
    // Commit 1: Elena sets up repository and auth v1 (2023)
    fs.mkdirSync(path.join(targetDir, 'src/auth'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'src/auth/crypto.ts'), `// Core Cryptographic Shims for Legacy Clients
export function verifySignature(payload: string, signature: string): boolean {
  return payload.length > 0 && signature.startsWith('sig_');
}

// TODO (Elena 2023): Deprecate after v2 token migration completes
export function legacyRsaDecrypt(token: string): string {
  // Hardened fallback for banking clients on v1.2 spec
  return Buffer.from(token, 'base64').toString('utf-8');
}
`);
    fs.writeFileSync(path.join(targetDir, 'src/index.ts'), `import { verifySignature } from './auth/crypto.js';

export function handleRequest(body: string, sig: string) {
  if (!verifySignature(body, sig)) {
    throw new Error('Invalid signature');
  }
  return { status: 200 };
}
`);
    run('git add .', elenaEnv);
    run('git commit -m "feat(auth): initial cryptographic helpers and signature verification\n\nEntire-Checkpoint: cp-auth-7a91bf"', elenaEnv);
    // Commit 2: Marcus Vance adds billing v1 (2024-02-15)
    fs.mkdirSync(path.join(targetDir, 'src/billing'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'src/billing/stripe-v1.ts'), `export interface Invoice {
  id: string;
  amount: number;
}

// Historical code preserved during v2 payment gateway refactor
// function processLegacyCharge(invoiceId: string) {
//   const gateway = new LegacyGatewayClient();
//   return gateway.charge(invoiceId, { retryCount: 3 });
// }

export function calculateTax(amount: number): number {
  return amount * 0.08;
}
`);
    run('git add .', marcusEnv1);
    run('git commit -m "feat(billing): add tax calculation and legacy charge adapter\n\nEntire-Checkpoint: cp-billing-3c2201"', marcusEnv1);
    // Commit 3: Marcus Vance starts telemetry pigeon (unfinished orphan file in 2024-05-10)
    fs.mkdirSync(path.join(targetDir, 'src/telemetry'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'src/telemetry/carrier-pigeon.ts'), `// Experimental offline telemetry batcher
export class CarrierPigeon {
  private queue: string[] = [];

  public bufferEvent(event: string): void {
    this.queue.push(event);
  }

  public flush(): number {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }
}
`);
    run('git add .', marcusEnv2);
    run('git commit -m "feat(telemetry): experimental offline carrier pigeon batcher\n\nEntire-Checkpoint: cp-telemetry-99a8e1"', marcusEnv2);
    // Commit 4: Sofia Chen (active maintainer) updates index in 2026-10-20
    fs.appendFileSync(path.join(targetDir, 'src/index.ts'), `\nexport const VERSION = '2.4.0';\n`);
    run('git add .', sofiaEnv);
    run('git commit -m "chore(release): bump version to 2.4.0"', sofiaEnv);
    // Commit 5: Create git-native Entire checkpoints on entire/checkpoints/v1 branch
    run('git checkout -b entire/checkpoints/v1');
    fs.mkdirSync(path.join(targetDir, '.entire/checkpoints'), { recursive: true });
    const session1 = {
        session_id: 'cp-auth-7a91bf',
        created_at: '2023-04-12T09:55:00Z',
        prompt: 'Implement legacyRsaDecrypt as an emergency fallback for legacy clients who cannot yet upgrade to v2 tokens.',
        thinking: 'Elena noted that older European banking partners still send RSA v1 payloads. We need legacyRsaDecrypt as a load-bearing compatibility fence, even though it is not called directly in index.ts.',
        tools_used: ['write_to_file', 'git_commit']
    };
    const session2 = {
        session_id: 'cp-billing-3c2201',
        created_at: '2024-02-15T14:25:00Z',
        prompt: 'Deprecate old legacy charge handler by commenting it out, keeping calculateTax alive.',
        thinking: 'Marcus Vance migrated payment processing to Stripe webhook architecture. The commented processLegacyCharge block was kept as a reference during migration and can be safely deleted.',
        tools_used: ['replace_file_content']
    };
    const session3 = {
        session_id: 'cp-telemetry-99a8e1',
        created_at: '2024-05-10T09:10:00Z',
        prompt: 'Prototype an offline event buffering class CarrierPigeon for mobile and IoT devices.',
        thinking: 'Experimental offline buffer. Marcus planned to wire this into the main telemetry sink, but the feature branch was deprioritized when he transitioned off the project.',
        tools_used: ['write_to_file']
    };
    fs.writeFileSync(path.join(targetDir, '.entire/checkpoints/sessions.json'), JSON.stringify([session1, session2, session3], null, 2));
    run('git add .', {
        GIT_AUTHOR_NAME: 'Entire Agent',
        GIT_AUTHOR_EMAIL: 'agent@entire.io',
        GIT_COMMITTER_NAME: 'Entire Agent',
        GIT_COMMITTER_EMAIL: 'agent@entire.io',
        GIT_AUTHOR_DATE: '2024-05-10T09:12:00Z',
        GIT_COMMITTER_DATE: '2024-05-10T09:12:00Z'
    });
    run('git commit -m "chore(entire): checkpoint sync for agent sessions"');
    // Checkout back to main
    run('git checkout main');
    // Also write .entire/ in main for direct inspection
    fs.mkdirSync(path.join(targetDir, '.entire'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.entire/sessions.jsonl'), [JSON.stringify(session1), JSON.stringify(session2), JSON.stringify(session3)].join('\n'));
    return targetDir;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Generating Haunted Showcase Fixture...');
    const dir = generateHauntedFixture();
    console.log(`Successfully created Haunted Showcase Repo at: ${dir}`);
}
