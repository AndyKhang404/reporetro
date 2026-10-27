import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { AnalysisReport, DeadCodeItem, DepartedContributor } from '../types.js';

export class ReportDatabase {
  private db: Database.Database;

  constructor(dbPath: string = process.env.SQLITE_DB_PATH || './data/reporetro.db') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        total_files INTEGER NOT NULL,
        total_commits_scanned INTEGER NOT NULL,
        dead_code_count INTEGER NOT NULL,
        departed_count INTEGER NOT NULL,
        average_haunt_score REAL NOT NULL,
        summary TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dead_code_items (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL,
        end_line INTEGER,
        symbol TEXT,
        excerpt TEXT NOT NULL,
        haunt_score REAL NOT NULL,
        author TEXT NOT NULL,
        author_email TEXT,
        is_author_departed INTEGER NOT NULL,
        commit_hash TEXT NOT NULL,
        commit_date TEXT NOT NULL,
        commit_message TEXT NOT NULL,
        why_it_exists TEXT NOT NULL,
        verdict TEXT NOT NULL,
        verdict_rationale TEXT NOT NULL,
        agent_session_json TEXT,
        FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS contributors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        first_commit_date TEXT NOT NULL,
        last_commit_date TEXT NOT NULL,
        months_inactive REAL NOT NULL,
        total_commits INTEGER NOT NULL,
        surviving_lines INTEGER NOT NULL,
        dead_lines INTEGER NOT NULL,
        signature_domains TEXT NOT NULL,
        ofrenda_tribute TEXT NOT NULL,
        FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_items_report ON dead_code_items (report_id);
      CREATE INDEX IF NOT EXISTS idx_contrib_report ON contributors (report_id);
    `);
  }

  public saveReport(report: AnalysisReport): void {
    const insertReport = this.db.prepare(`
      INSERT OR REPLACE INTO reports (
        id, repo_path, repo_name, scanned_at, total_files, total_commits_scanned,
        dead_code_count, departed_count, average_haunt_score, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = this.db.prepare(`
      INSERT OR REPLACE INTO dead_code_items (
        id, report_id, type, file, line, end_line, symbol, excerpt, haunt_score,
        author, author_email, is_author_departed, commit_hash, commit_date,
        commit_message, why_it_exists, verdict, verdict_rationale, agent_session_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertContributor = this.db.prepare(`
      INSERT INTO contributors (
        report_id, name, email, first_commit_date, last_commit_date, months_inactive,
        total_commits, surviving_lines, dead_lines, signature_domains, ofrenda_tribute
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // Clean previous items for this report id if any
      this.db.prepare('DELETE FROM dead_code_items WHERE report_id = ?').run(report.id);
      this.db.prepare('DELETE FROM contributors WHERE report_id = ?').run(report.id);

      insertReport.run(
        report.id,
        report.repoPath,
        report.repoName,
        report.scannedAt,
        report.totalFiles,
        report.totalCommitsScanned,
        report.deadCodeCount,
        report.departedCount,
        report.averageHauntScore,
        report.summary
      );

      for (const item of report.items) {
        insertItem.run(
          item.id,
          report.id,
          item.type,
          item.file,
          item.line,
          item.endLine ?? null,
          item.symbol ?? null,
          item.excerpt,
          item.hauntScore,
          item.author,
          item.authorEmail ?? null,
          item.isAuthorDeparted ? 1 : 0,
          item.commitHash,
          item.commitDate,
          item.commitMessage,
          item.whyItExists,
          item.verdict,
          item.verdictRationale,
          item.agentSession ? JSON.stringify(item.agentSession) : null
        );
      }

      for (const contrib of report.contributors) {
        insertContributor.run(
          report.id,
          contrib.name,
          contrib.email,
          contrib.firstCommitDate,
          contrib.lastCommitDate,
          contrib.monthsInactive,
          contrib.totalCommits,
          contrib.survivingLines,
          contrib.deadLines,
          JSON.stringify(contrib.signatureDomains),
          contrib.ofrendaTribute
        );
      }
    });

    transaction();
  }

  public getReport(id: string): AnalysisReport | null {
    const reportRow = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any;
    if (!reportRow) return null;

    const itemRows = this.db.prepare('SELECT * FROM dead_code_items WHERE report_id = ? ORDER BY haunt_score DESC').all(id) as any[];
    const contribRows = this.db.prepare('SELECT * FROM contributors WHERE report_id = ? ORDER BY months_inactive DESC').all(id) as any[];

    const items: DeadCodeItem[] = itemRows.map(row => ({
      id: row.id,
      type: row.type,
      file: row.file,
      line: row.line,
      endLine: row.end_line ?? undefined,
      symbol: row.symbol ?? undefined,
      excerpt: row.excerpt,
      hauntScore: row.haunt_score,
      author: row.author,
      authorEmail: row.author_email ?? undefined,
      isAuthorDeparted: row.is_author_departed === 1,
      commitHash: row.commit_hash,
      commitDate: row.commit_date,
      commitMessage: row.commit_message,
      whyItExists: row.why_it_exists,
      verdict: row.verdict,
      verdictRationale: row.verdict_rationale,
      agentSession: row.agent_session_json ? JSON.parse(row.agent_session_json) : undefined
    }));

    const contributors: DepartedContributor[] = contribRows.map(row => ({
      name: row.name,
      email: row.email,
      firstCommitDate: row.first_commit_date,
      lastCommitDate: row.last_commit_date,
      monthsInactive: row.months_inactive,
      totalCommits: row.total_commits,
      survivingLines: row.surviving_lines,
      deadLines: row.dead_lines,
      signatureDomains: JSON.parse(row.signature_domains),
      ofrendaTribute: row.ofrenda_tribute
    }));

    return {
      id: reportRow.id,
      repoPath: reportRow.repo_path,
      repoName: reportRow.repo_name,
      scannedAt: reportRow.scanned_at,
      totalFiles: reportRow.total_files,
      totalCommitsScanned: reportRow.total_commits_scanned,
      deadCodeCount: reportRow.dead_code_count,
      departedCount: reportRow.departed_count,
      averageHauntScore: reportRow.average_haunt_score,
      summary: reportRow.summary,
      items,
      contributors
    };
  }

  public listReports(): Array<Omit<AnalysisReport, 'items' | 'contributors'>> {
    const rows = this.db.prepare('SELECT * FROM reports ORDER BY scanned_at DESC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      repoPath: r.repo_path,
      repoName: r.repo_name,
      scannedAt: r.scanned_at,
      totalFiles: r.total_files,
      totalCommitsScanned: r.total_commits_scanned,
      deadCodeCount: r.dead_code_count,
      departedCount: r.departed_count,
      averageHauntScore: r.average_haunt_score,
      summary: r.summary
    }));
  }
}
