---
title: "RepoRetro: Ghost in the Repo — Unearthing Dead Code & Honoring Departed Contributors with Gemma & Entire"
published: true
tags: ["hf26challenge", "devchallenge", "ai", "opensource"]
canonical_url: "https://github.com/AndyKhang404/reporetro"
cover_image: "https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/banner.png"
---

*This article is a submission for the [Hacktoberfest Open-Source AI Challenge: Week 4 ("Ghost in the Machine")](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).*

---

> *"Do not remove a fence until you know why it was put up in the first place."*  
> — G.K. Chesterton (Chesterton's Fence)

Every seasoned codebase is haunted.

In every mature repository, there are functions with zero active callers, orphaned billing modules preserved across three refactors, commented-out blocks that everyone is terrified to delete, and `TODO (Elena 2023)` comments left by engineers who haven't committed in three years. 

When modern developers encounter these artifacts, we face a dilemma. Traditional linters blindly shout: *"Unused export! Delete it!"* But seasoned engineers know the danger of heedless deletion: what if that function was an edge-case guard against a banking outage? What if that unreferenced class was an incomplete prototype an agent generated during a frantic sprint?

For **Hacktoberfest 2026 Week 4 ("Ghost in the Machine")**, I built **RepoRetro**: an open-source repository archaeologist that doesn't just treat dead code like garbage to be purged. In the Mexican tradition of **Día de los Muertos**, RepoRetro builds a digital **Ofrenda** for your repository. It unearths abandoned code, calculates a multi-factor **Haunt Score (0–100)**, queries past AI agent sessions via **Entire**, and uses **Google's open-weight Gemma** to reconstruct the historical rationale before delivering a **Chesterton's Fence verdict**: is this a *Load-Bearing Relic*, *Unfinished Work*, or *Safe to Exorcise*?

![RepoRetro: Ghost in the Repo Banner](https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/banner.png)

---

## What I Built

**RepoRetro** is a dual-interface repository intelligence tool:
1. **Interactive Candlelit Web Dashboard**: A rich Día de los Muertos themed interface with cempasúchil marigold glowing accents, live scan progress, graveyard statistics, and a dedicated **Ofrenda Tab** honoring departed contributors.
2. **Terminal CLI**: A fast command-line scanner (`npx reporetro scan .` or `npx tsx src/cli.ts scan`) that prints formatted archaeological reports directly to your stdout.

```plaintext
🕯️ REPORETRO: GHOST IN THE REPO ARCHAEOLOGY REPORT
═══════════════════════════════════════════════════════════════════════
Repository: haunted-repo
Scanned At: 2026-10-27T14:37:09.967Z
Files: 3 | Commits: 4 | Relics: 7 | Departed Contributors: 2
Average Haunt Score: 94 / 100 👻
═══════════════════════════════════════════════════════════════════════

🪦 THE GRAVEYARD (7 Relics Discovered):
  [UNREFERENCED EXPORT] legacyRsaDecrypt (src/auth/crypto.ts:7-12)
    Haunt Score: 95/100 | Author: Elena Rostova (Departed 42.3 mos ago)
    Commit: 3fd5802 (2023-04-12)
    Why: Introduced by Elena Rostova for v1.2 spec. Callers refactored away.
    Verdict: ⚰️ SAFE TO EXORCISE
    Rationale: Confirmed orphaned with zero internal importers.

  [UNREFERENCED EXPORT] CarrierPigeon (src/telemetry/carrier-pigeon.ts:2-7)
    Haunt Score: 95/100 | Author: Marcus Vance (Departed 29.3 mos ago)
    Commit: 06c86da (2024-05-10)
    Why: Generated during AI session cp-telemetry-99a8e1.
    Entire Session Match: Prompt "Prototype an offline event buffering class CarrierPigeon..."
    Agent Reasoning: Marcus planned to wire this into telemetry sink, but transitioned off.
    Verdict: 🚧 UNFINISHED WORK
    Rationale: File contains functional logic that was abandoned mid-architecture.

🏵️ THE OFRENDA (Honoring Departed Contributors):
  🕯️ Elena Rostova (elena@heritage-labs.org)
     Active: 2023-04-12 to 2023-04-12 | Departed: 42.3 months ago
     "Though inactive for 42 months, their architectural footprint endures across 
     the foundation of this repository."
  🕯️ Marcus Vance (marcus@cloudbridge.dev)
     Active: 2024-02-15 to 2024-05-10 | Departed: 29.3 months ago
     "Though inactive for 29 months, their architectural footprint endures across 
     the foundation of this repository."
```

---

## Demo & Visual Tour

### 1. The Code Graveyard & Chesterton's Fences

![The Code Graveyard Dashboard](https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/dashboard.png)

RepoRetro serves an altar-inspired UI with real-time analytics:
- **Haunt Score Meter (0–100)**: Combines unreferenced export counts, git decay time, author departure delta, and commented line density into a unified index.
- **The Graveyard View**: Lists every dead code relic with expandable commit history, author attribution, and correlated agent prompt history.
- **Chesterton's Fence Badges**:
  - 🕯️ **Load-Bearing Relic**: Keep and document (e.g., legacy banking fallback).
  - 🪦 **Safe to Lay to Rest**: Confirmed dead code ready for clean removal.
  - 🌼 **Unfinished Ghost Work**: Incomplete feature branch ready to resurrect.

---

### 2. Private Repository Scanning & Zero-Persistence Security

Real enterprise repositories and legacy codebases almost never live in public git URLs. To make RepoRetro viable for real teams, it supports user-added credentials across both the Web UI and CLI:

![Private Repository Credentials Panel](https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/screenshot-credentials.png)

- **Personal Access Tokens (PAT)**: Works with GitHub (classic and fine-grained PATs), GitLab (`read_repository`), and Bitbucket App Passwords.
- **SSH Private Keys**: Paste OpenSSH / PEM keys directly or load key files from your filesystem.
- **Intelligent URL Adaptation**: Automatically converts HTTPS URLs to SSH when an SSH key is given, and SSH (`git@...`) URLs to HTTPS when a token is provided.
- **Zero-Storage Ephemeral Security**: Credentials are kept strictly in-memory during cloning. They are never written to disk or the SQLite database. Git origins are automatically sanitized, and any credential strings in errors or logs are replaced with `***`.
- **Environment Variable Fallbacks**: Server deployments automatically detect `GITHUB_TOKEN`, `GIT_TOKEN`, `GIT_USERNAME`, `GIT_PASSWORD`, or `GIT_SSH_KEY` from `.env`.

---

### 3. The Día de los Muertos Ofrenda Tab

![Día de los Muertos Ofrenda Honoring Departed Contributors](https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/screenshot-ofrenda.png)

The **Ofrenda Tab** honors long-gone contributors who haven't committed in over 6 months:
- Computes their first and last commit eras, total commits given, and surviving lines of code still in `HEAD`.
- Generates poetic tributes celebrating their foundational craft.
- Transmutes the cold finger-pointing of `git blame` into a community celebration of human craftsmanship.

---

### 4. Archaeological Sessions & Entire Checkpoints

![Archaeological Sessions & Entire Checkpoints Timeline](https://raw.githubusercontent.com/AndyKhang404/reporetro/main/public/screenshot-sessions.png)

When AI coding agents write code, their thinking is usually lost once merged. RepoRetro inspects git commit trailers (`Entire-Checkpoint: ...`) and the git-native `entire/checkpoints/v1` tree to recover:
- The original human prompt that initiated the code.
- The agent's chain-of-thought reasoning snippet.
- Why the feature was paused or abandoned mid-architecture.

---

## System Architecture

```plaintext
                    ┌────────────────────────────────────────────────────────┐
                    │                   RepoRetro Web UI                     │
                    │         (Día de los Muertos Altar / Express API)       │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
     ┌───────────────────────┐                                     ┌───────────────────────┐
     │    DeadCodeDetector   │                                     │      GitAnalyzer      │
     │  - Unreferenced Exp.  │                                     │  - Git Blame & Log    │
     │  - Commented Blocks   │                                     │  - Commit Trailers    │
     │  - Ancient Markers    │                                     │  - Author Inactivity  │
     └───────────┬───────────┘                                     └───────────┬───────────┘
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │    AgentSessionCorrelator       │
                               │   - Entire Checkpoints Ref      │
                               │   - .entire/sessions.jsonl      │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │       Mastra Orchestrator       │
                               │     @mastra/core Agent + Tools  │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │       Gemma 2 (2B / 9B)         │
                               │   - Local Ollama / llama.cpp    │
                               │   - Archaeological Synthesis    │
                               │   - Chesterton's Fence Verdict  │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │     SQLite Storage & Cache      │
                               └─────────────────────────────────┘
```

---

## How I Built It

RepoRetro is crafted entirely in **TypeScript** using modern, modular tooling:

### 1. Open-Weight Gemma Integration (Featured Category: Best Use of Gemma)
To determine *why* a piece of code exists, RepoRetro sends the commit history, diff snippet, author tenure, and session transcripts to **Gemma 2** (`gemma-2-2b-it` or `gemma-2-9b-it`).
- **OpenAI-Compatible Client**: Seamlessly connects to local inference engines (Ollama, `llama.cpp`, vLLM) or hosted endpoints.
- **Archaeological Prompt Engineering**: Rather than asking Gemma to refactor or rewrite the code, Gemma acts as a historical detective, answering two critical questions:
  1. *What engineering problem was the author solving when this code was introduced?*
  2. *Applying Chesterton's Fence, is this code a Load-Bearing Relic, Unfinished Work, or Safe to Exorcise?*
- **Offline Fallback Engine**: If no inference endpoint is reachable, RepoRetro gracefully uses a deterministic rule-based archaeological synthesizer so users can run scans completely offline.

### 2. Entire Git-Native Checkpoints (Partner Category: Best Use of Entire)
In traditional development, when a human writes code, their thoughts are lost. In agentic development, agents produce rich tool calls, reasoning steps, and prompts—which are usually discarded once merged.

RepoRetro integrates with **Entire**, an open agent checkpointing protocol:
- It scans commits for `Entire-Checkpoint: <id>` trailers.
- It parses the `.entire/sessions.jsonl` log and queries the git-native `entire/checkpoints/v1` ref.
- When RepoRetro finds dead code in `src/telemetry/carrier-pigeon.ts`, it matches it to the exact Entire session where developer Marcus Vance asked:
  > *"Prototype an offline event buffering class CarrierPigeon for mobile and IoT devices."*
- RepoRetro pulls the agent's internal reasoning snippet, explaining to the modern maintainer that the code was left unreferenced because Marcus was reassigned before completing the sink integration.

### 3. Mastra Agent Framework (Partner Category: Best Use of Mastra)
RepoRetro orchestrates the analysis using **`@mastra/core`**:
- Implements custom Mastra tools: `inspectGitCommit` (extracting commit metadata and trailers) and `searchSession` (correlating agent transcripts).
- Encapsulates the entire archaeological reasoning workflow inside a Mastra `Agent`, allowing other automated pipelines or CI/CD agents to invoke RepoRetro programmatically.

### 4. Cloud Deployment (Featured Categories: Best Use of Render & DigitalOcean)
RepoRetro is ready for cloud deployment with zero manual configuration:
- **Render (`render.yaml`)**: Includes a complete Render Blueprint defining the Node.js web service, environment variables, health check path (`/api/health`), and automated build steps.
- **DigitalOcean (`.do/app.yaml` & `Dockerfile`)**: Multi-stage production container ready to deploy to DigitalOcean App Platform or run locally with `docker-compose up`.

---

## Why Does Open Innovation Matter?

The Hacktoberfest Week 4 prompt asks a poignant question: *Why does open innovation matter for what you built?*

When building a tool that inspects the history and ghosts of a repository, **openness is not just a license preference—it is a non-negotiable architectural requirement:**

1. **Codebase Privacy & Security**:
   A repository's git history holds a company's crown jewels: legacy security fixes, proprietary algorithms, internal author emails, and unreleased prototypes. If an archaeology tool required piping every commit diff, author timestamp, and line of code to a closed third-party SaaS API, most engineering organizations would never be allowed to run it. By running **open-weight Gemma models on local hardware** (via Ollama or `llama.cpp`), RepoRetro runs with **the internet completely disconnected**. Your codebase never leaves your workstation.

2. **The Threat of Vendor Lock-In on Developer History**:
   When developers rely on closed-source agent platforms, their prompts and session context are trapped in proprietary databases. If that vendor pivots, raises prices, or shuts down, the context of *why* your software was built disappears into the ether. By integrating with **Entire**, agent sessions live directly inside the repository as git-native objects (`entire/checkpoints/v1`). An open tool like RepoRetro ensures that your team's historical memory remains your property forever.

3. **Software Longevity**:
   Proprietary development tools decay as APIs change. Open innovation allows communities to maintain tools across decades. Just as open-source codebases preserve historical commits from 15 years ago, open archaeology tools guarantee that we can continue to inspect and understand our legacy systems for generations to come.

---

## The Spirit of It: Día de los Muertos & The Human Element

Too often in software engineering, we treat past code with cynicism. We look at legacy code, roll our eyes, and murmur: *"Who on earth wrote this mess?"*

RepoRetro flips this perspective. Codebases are human endeavors. The engineer who wrote that convoluted 200-line regex in 2022 might have been staying up until 3:00 AM preventing a production crash on Black Friday. The author who wrote an incomplete billing client might have been called away to another team or laid off during a company restructuring.

In the spirit of **Día de los Muertos**, RepoRetro honors those who came before us. By lighting a digital candle on the Ofrenda, displaying their surviving impact, and understanding their original intent before touching a single line, we build software with empathy, reverence, and respect.

---

## Try It Out

### Run the CLI
```bash
git clone https://github.com/AndyKhang404/reporetro.git
cd reporetro
npm install
npm run build

# Generate the included multi-era haunted repository fixture
npm run seed-fixture

# Scan any local repository
npm run cli scan fixtures/haunted-repo

# Scan a private repo using a Personal Access Token (PAT)
npm run cli scan https://github.com/owner/private-repo --token ghp_yourTokenHere

# Scan a private repo using an SSH key file
npm run cli scan git@github.com:owner/private-repo.git --ssh-key ~/.ssh/id_ed25519
```

### Launch the Altar Dashboard
```bash
# Start the web server
npm start
# Open http://localhost:3000 in your browser
```

---

## Prize Categories Entered

- **Best Use of Gemma ($200 Featured)**: Open-weight Gemma 2 powers local historical reasoning, commit intent synthesis, and Chesterton's Fence verdicts without code telemetry leaving the machine.
- **Best Use of Entire ($100 Partner)**: Queries git-native `entire/checkpoints/v1` and `.entire/sessions.jsonl` to correlate unreferenced code with the original developer prompts and agent reasoning.
- **Best Use of Mastra ($100 Partner)**: Orchestrates archaeological tools and inspection workflows with `@mastra/core/agent`.
- **Best Use of Render ($200 Featured)**: Native Infrastructure-as-Code via `render.yaml` Blueprint.
- **Best Use of DigitalOcean ($200 Featured)**: Production Docker container and `.do/app.yaml` App Platform spec.
- **Overall Winner ($250)**: A creative, deeply thematic fusion of Halloween ("Ghost in the Machine") and Día de los Muertos honoring the past of open-source software.

---

## Community Wisdom & Citations

The architectural philosophy of RepoRetro was deeply inspired by ongoing discussions in the developer community:
- [Chesterton's half-implemented fence that he built just in case](https://dev.to/thawkin3/chestertons-half-implemented-fence-that-he-built-just-in-case-5ape) by Tommy Hawkins — on why half-implemented features exist and why deleting them blindly is dangerous.
- [Your Git History Keeps the Code. Who Keeps the Lesson?](https://dev.to/eshevtsov/your-git-history-keeps-the-code-who-keeps-the-lesson-24do) by Evgeny Shevtsov — on the missing link between commit diffs and original intent.
- [Repository Intelligence in 2026: Why AI That Reads Your Git History Beats AI That Reads Your Files](https://dev.to/ailoitte_sk/repository-intelligence-in-2026-why-ai-that-reads-your-git-history-beats-ai-that-reads-your-files-3h0p) by Ailoitte — on why historical context matters more than static file analysis.

---

*Code and documentation licensed under the [MIT License](https://github.com/AndyKhang404/reporetro/blob/main/LICENSE).*
