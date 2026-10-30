import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { GitCredentials, CloneOptions } from '../types.js';

export interface ClonedRepo {
  targetPath: string;
  isTemporary: boolean;
  cleanup: () => void;
}

export interface ParsedGitUrl {
  protocol: 'https' | 'http' | 'ssh' | 'git' | 'local';
  host: string;
  owner: string;
  repo: string;
  fullPath: string;
  cleanUrl: string;
  embeddedUsername?: string;
  embeddedPassword?: string;
}

/**
 * Checks whether the input string represents a remote git URL.
 */
export function isRemoteGitUrl(urlOrPath: string): boolean {
  const trimmed = urlOrPath.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('git@') ||
    trimmed.startsWith('ssh://') ||
    trimmed.startsWith('git://')
  );
}

/**
 * Parses and normalizes various git URL formats.
 */
export function parseGitUrl(rawUrl: string): ParsedGitUrl {
  const trimmed = rawUrl.trim();

  // 1. SSH scp-style: git@github.com:owner/repo.git
  const scpMatch = trimmed.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (scpMatch) {
    const host = scpMatch[1];
    const fullPath = scpMatch[2].replace(/^\/+/, '');
    const parts = fullPath.split('/');
    const owner = parts.length > 1 ? parts[0] : '';
    const repo = parts[parts.length - 1];
    return {
      protocol: 'ssh',
      host,
      owner,
      repo,
      fullPath,
      cleanUrl: `git@${host}:${fullPath}.git`
    };
  }

  // 2. SSH URL: ssh://git@github.com[:port]/owner/repo.git
  if (trimmed.startsWith('ssh://')) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname;
      const fullPath = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
      const parts = fullPath.split('/');
      const owner = parts.length > 1 ? parts[0] : '';
      const repo = parts[parts.length - 1];
      return {
        protocol: 'ssh',
        host,
        owner,
        repo,
        fullPath,
        cleanUrl: `ssh://git@${host}/${fullPath}.git`
      };
    } catch {
      // Fallback
    }
  }

  // 3. HTTP / HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname;
      const fullPath = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
      const parts = fullPath.split('/');
      const owner = parts.length > 1 ? parts[0] : '';
      const repo = parts[parts.length - 1];
      const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';

      return {
        protocol,
        host,
        owner,
        repo,
        fullPath,
        cleanUrl: `${protocol}://${host}/${fullPath}.git`,
        embeddedUsername: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        embeddedPassword: parsed.password ? decodeURIComponent(parsed.password) : undefined
      };
    } catch {
      // Fallback
    }
  }

  return {
    protocol: 'local',
    host: '',
    owner: '',
    repo: path.basename(trimmed),
    fullPath: trimmed,
    cleanUrl: trimmed
  };
}

/**
 * Resolves effective credentials from explicit options, embedded URL credentials,
 * and environment variables (GIT_TOKEN, GITHUB_TOKEN, GIT_USERNAME, etc.).
 */
export function resolveCredentials(
  optionsCreds?: GitCredentials,
  urlCreds?: { embeddedUsername?: string; embeddedPassword?: string }
): GitCredentials | undefined {
  const token =
    optionsCreds?.token?.trim() ||
    process.env.GIT_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    urlCreds?.embeddedPassword?.trim();

  const username =
    optionsCreds?.username?.trim() ||
    urlCreds?.embeddedUsername?.trim() ||
    process.env.GIT_USERNAME?.trim();

  const password =
    optionsCreds?.password?.trim() ||
    process.env.GIT_PASSWORD?.trim() ||
    (token ? undefined : urlCreds?.embeddedPassword?.trim());

  const sshKey =
    optionsCreds?.sshKey?.trim() ||
    process.env.GIT_SSH_KEY?.trim();

  const sshKeyPath =
    optionsCreds?.sshKeyPath?.trim() ||
    process.env.GIT_SSH_KEY_PATH?.trim() ||
    process.env.GIT_SSH_KEY_FILE?.trim();

  if (!token && !username && !password && !sshKey && !sshKeyPath) {
    return undefined;
  }

  return {
    token: token || undefined,
    username: username || undefined,
    password: password || undefined,
    sshKey: sshKey || undefined,
    sshKeyPath: sshKeyPath || undefined
  };
}

/**
 * Scrubs tokens, passwords, and private keys from strings before logging or returning to clients.
 */
export function sanitizeGitOutput(text: string, secrets: (string | undefined)[]): string {
  let sanitized = text;

  // Mask embedded credentials in URLs (e.g., https://user:pass@host)
  sanitized = sanitized.replace(/(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi, '$1***:***@');
  sanitized = sanitized.replace(/(https?:\/\/)([^@\s]+)@/gi, '$1***@');

  // Mask specific secret values
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(escaped, 'g'), '***');
    }
  }

  return sanitized;
}

/**
 * Prepares the appropriate clone URL based on the credentials available.
 * Converts HTTPS -> SSH when an SSH key is given, or SSH -> HTTPS when a token is given.
 */
export function adaptUrlForCredentials(parsed: ParsedGitUrl, creds?: GitCredentials): string {
  if (!creds) {
    return parsed.cleanUrl;
  }

  const hasSshCreds = Boolean(creds.sshKey || creds.sshKeyPath);
  const hasHttpCreds = Boolean(creds.token || creds.password || creds.username);

  // If user provided an SSH key for an HTTPS URL, adapt to SSH
  if (hasSshCreds && !hasHttpCreds && (parsed.protocol === 'https' || parsed.protocol === 'http')) {
    if (parsed.host && parsed.fullPath) {
      return `git@${parsed.host}:${parsed.fullPath}.git`;
    }
  }

  // If user provided HTTP token/password for an SSH URL, adapt to HTTPS
  if (hasHttpCreds && !hasSshCreds && parsed.protocol === 'ssh') {
    if (parsed.host && parsed.fullPath) {
      return `https://${parsed.host}/${parsed.fullPath}.git`;
    }
  }

  return parsed.cleanUrl;
}

/**
 * Clones a repository (local or remote) with support for private user credentials.
 * Automatically cleans up any temporary credentials and clones upon request.
 */
export async function cloneRepository(
  urlOrPath: string,
  options?: CloneOptions
): Promise<ClonedRepo> {
  const trimmed = urlOrPath.trim();

  // Handle local path
  if (!isRemoteGitUrl(trimmed)) {
    const localPath = path.resolve(trimmed);
    if (!fs.existsSync(path.join(localPath, '.git'))) {
      throw new Error(`Not a valid git repository at path: ${trimmed}`);
    }
    return {
      targetPath: localPath,
      isTemporary: false,
      cleanup: () => {}
    };
  }

  // Parse remote URL
  const parsed = parseGitUrl(trimmed);
  const creds = resolveCredentials(options?.credentials, {
    embeddedUsername: parsed.embeddedUsername,
    embeddedPassword: parsed.embeddedPassword
  });

  const targetCloneUrl = adaptUrlForCredentials(parsed, creds);
  const depth = options?.depth || 50;
  const timeoutMs = options?.timeoutMs || 60000;

  // Setup temporary clone directory
  const clonesBaseDir = path.resolve('./data/clones');
  if (!fs.existsSync(clonesBaseDir)) {
    fs.mkdirSync(clonesBaseDir, { recursive: true });
  }

  const tempDir = path.join(
    clonesBaseDir,
    `clone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const cleanups: (() => void)[] = [];
  cleanups.push(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  const cleanup = () => {
    for (const fn of cleanups.reverse()) {
      try { fn(); } catch {}
    }
  };

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    GIT_TERMINAL_PROMPT: '0'
  };

  const secretsToMask: string[] = [];
  const gitArgs: string[] = [];

  try {
    // 1. Configure SSH Authentication
    if (creds?.sshKey || creds?.sshKeyPath) {
      let keyFilePath = '';

      if (creds.sshKey) {
        // Write private key to a temporary file with 0600 permissions
        const tempKeyPath = path.join(clonesBaseDir, `.ssh_key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        fs.writeFileSync(tempKeyPath, creds.sshKey.trim() + '\n', { mode: 0o600 });
        cleanups.push(() => {
          if (fs.existsSync(tempKeyPath)) {
            try { fs.unlinkSync(tempKeyPath); } catch {}
          }
        });
        keyFilePath = tempKeyPath;
        secretsToMask.push(creds.sshKey);
      } else if (creds.sshKeyPath) {
        const resolvedKeyPath = creds.sshKeyPath.replace(/^~(?=$|\/|\\)/, os.homedir());
        if (!fs.existsSync(resolvedKeyPath)) {
          throw new Error(`Specified SSH key file does not exist: ${creds.sshKeyPath}`);
        }
        keyFilePath = path.resolve(resolvedKeyPath);
      }

      env.GIT_SSH_COMMAND = `ssh -i "${keyFilePath}" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes -o BatchMode=yes`;
    }
    // 2. Configure HTTPS / HTTP Authentication
    else if (creds?.token || creds?.password || creds?.username) {
      let effectiveUsername = creds.username;
      let effectivePassword = creds.password || creds.token || '';

      if (creds.token) {
        secretsToMask.push(creds.token);
      }
      if (creds.password) {
        secretsToMask.push(creds.password);
      }

      // Default username for major git hosts if user only provided a token
      if (!effectiveUsername) {
        if (parsed.host.includes('github.com')) {
          effectiveUsername = 'x-access-token';
        } else if (parsed.host.includes('gitlab.com')) {
          effectiveUsername = 'oauth2';
        } else if (parsed.host.includes('bitbucket.org')) {
          effectiveUsername = 'x-token-auth';
        } else {
          effectiveUsername = 'git';
        }
      }

      env.REPORETRO_GIT_USERNAME = effectiveUsername;
      env.REPORETRO_GIT_PASSWORD = effectivePassword;

      // Create temporary GIT_ASKPASS helper script
      const askpassScript = path.join(
        clonesBaseDir,
        `.askpass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.sh`
      );
      const askpassContent = `#!/bin/sh\ncase "$1" in\n  *Username*|*username*) echo "$REPORETRO_GIT_USERNAME" ;;\n  *Password*|*password*) echo "$REPORETRO_GIT_PASSWORD" ;;\n  *) echo "$REPORETRO_GIT_PASSWORD" ;;\nesac\n`;
      fs.writeFileSync(askpassScript, askpassContent, { mode: 0o700 });
      cleanups.push(() => {
        if (fs.existsSync(askpassScript)) {
          try { fs.unlinkSync(askpassScript); } catch {}
        }
      });

      env.GIT_ASKPASS = askpassScript;

      // Also set credential.helper for git versions that prioritize it over GIT_ASKPASS
      gitArgs.push(
        `-c "credential.helper=!f() { echo \\"username=\\$REPORETRO_GIT_USERNAME\\"; echo \\"password=\\$REPORETRO_GIT_PASSWORD\\"; }; f"`
      );
    } else {
      // No credentials provided; ensure git doesn't hang waiting for credentials
      env.GIT_ASKPASS = 'true';
    }

    const command = `git ${gitArgs.join(' ')} clone --depth ${depth} "${targetCloneUrl}" "${tempDir}"`;

    execSync(command, {
      stdio: 'pipe',
      timeout: timeoutMs,
      env
    });

    // Reset origin URL to clean URL so no temporary credential artifacts remain
    try {
      execSync(`git config remote.origin.url "${parsed.cleanUrl}"`, {
        cwd: tempDir,
        stdio: 'ignore'
      });
    } catch {}

    return {
      targetPath: tempDir,
      isTemporary: true,
      cleanup
    };
  } catch (err: any) {
    cleanup();

    const rawStderr = err.stderr ? err.stderr.toString().trim() : '';
    const rawStdout = err.stdout ? err.stdout.toString().trim() : '';
    const rawDetails = rawStderr || rawStdout || err.message || '';
    const sanitizedDetails = sanitizeGitOutput(rawDetails, secretsToMask);

    const isAuthFailure =
      sanitizedDetails.includes('Authentication failed') ||
      sanitizedDetails.includes('Permission denied (publickey)') ||
      sanitizedDetails.includes('could not read Username') ||
      sanitizedDetails.includes('Invalid username or token');

    const isNotFound =
      sanitizedDetails.includes('Repository not found') ||
      sanitizedDetails.includes('not found') ||
      sanitizedDetails.includes('does not exist');

    if (isAuthFailure) {
      throw new Error(
        `Authentication failed for private repository (${parsed.cleanUrl}). ` +
        `Please verify your Personal Access Token, username/password, or SSH key.`
      );
    }

    if (isNotFound) {
      throw new Error(
        `Repository not found or private (authentication failed): ${parsed.cleanUrl}. ` +
        `If this repository is private, provide credentials via the scan form or CLI flags.`
      );
    }

    throw new Error(`Git clone failed: ${sanitizedDetails}`);
  }
}
