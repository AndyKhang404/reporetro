import express from 'express';
import path from 'path';
import fs from 'fs';
import { RepoRetroOrchestrator } from '../mastra/agent.js';
import { ReportDatabase } from '../cache/db.js';
import { GemmaClient } from '../ai/gemma.js';
import { generateHauntedFixture } from '../fixture/generate.js';
import { cloneRepository } from '../git/cloner.js';
import { GitCredentials } from '../types.js';

export function createServer() {
  const app = express();
  app.use(express.json());

  const publicDir = path.resolve('public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const orchestrator = new RepoRetroOrchestrator();
  const db = new ReportDatabase();
  const gemma = new GemmaClient();

  // Health check
  app.get('/api/health', async (req, res) => {
    const gemmaOk = await gemma.checkHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      gemma: {
        provider: 'llama-server',
        online: gemmaOk,
        endpoint: process.env.GEMMA_BASE_URL || 'http://localhost:8080/v1',
        model: process.env.GEMMA_MODEL || 'gemma-2-2b-it'
      }
    });
  });

  // List recent reports
  app.get('/api/reports', (req, res) => {
    try {
      const reports = db.listReports();
      res.json({ reports });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get specific report
  app.get('/api/reports/:id', (req, res) => {
    try {
      const report = db.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get or generate Haunted Showcase Sample
  app.get('/api/sample', async (req, res) => {
    try {
      const fixtureDir = path.resolve('./fixtures/haunted-repo');
      if (!fs.existsSync(path.join(fixtureDir, '.git'))) {
        generateHauntedFixture(fixtureDir);
      }

      const existingReports = db.listReports();
      const sampleReportSummary = existingReports.find(r => r.repoName.includes('haunted-repo'));

      if (sampleReportSummary) {
        const full = db.getReport(sampleReportSummary.id);
        if (full) return res.json(full);
      }

      // Generate fresh
      const report = await orchestrator.analyzeRepo(fixtureDir);
      db.saveReport(report);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Scan a repo with optional private credentials
  app.post('/api/scan', async (req, res) => {
    const {
      repoUrlOrPath,
      credentials,
      token,
      username,
      password,
      sshKey,
      sshKeyPath
    } = req.body;

    if (!repoUrlOrPath || typeof repoUrlOrPath !== 'string') {
      return res.status(400).json({ error: 'repoUrlOrPath is required' });
    }

    const resolvedCredentials: GitCredentials = {
      token: credentials?.token ?? token,
      username: credentials?.username ?? username,
      password: credentials?.password ?? password,
      sshKey: credentials?.sshKey ?? sshKey,
      sshKeyPath: credentials?.sshKeyPath ?? sshKeyPath
    };

    let clonedRepo: { targetPath: string; isTemporary: boolean; cleanup: () => void } | null = null;
    try {
      clonedRepo = await cloneRepository(repoUrlOrPath, { credentials: resolvedCredentials });
      const report = await orchestrator.analyzeRepo(clonedRepo.targetPath);
      db.saveReport(report);
      res.json(report);
    } catch (err: any) {
      console.error('Scan error:', err.message || err);
      res.status(500).json({ error: err.message || 'Failed to scan repository' });
    } finally {
      if (clonedRepo) {
        clonedRepo.cleanup();
      }
    }
  });

  // Fallback to index.html for SPA/Web dashboard
  app.get('*', (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('RepoRetro API Server is running. Visit /api/health or /api/sample');
    }
  });

  return app;
}

export function startServer(port: number = parseInt(process.env.PORT || '3000', 10)) {
  const app = createServer();
  const server = app.listen(port, () => {
    console.log(`\n================================================================`);
    console.log(`🕯️  REPORETRO WEB DASHBOARD: RUNNING ON PORT ${port}`);
    console.log(`🌐  Local URL: http://localhost:${port}`);
    console.log(`💀  Día de los Muertos & Ghost in the Repo Archaeologist`);
    console.log(`================================================================\n`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
}
