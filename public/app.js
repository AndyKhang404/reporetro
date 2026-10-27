document.addEventListener('DOMContentLoaded', () => {
  const repoInput = document.getElementById('repoInput');
  const scanForm = document.getElementById('scanForm');
  const btnScan = document.getElementById('btnScan');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const metricsBar = document.getElementById('metricsBar');

  const valDeadCode = document.getElementById('valDeadCode');
  const valDeparted = document.getElementById('valDeparted');
  const valHauntScore = document.getElementById('valHauntScore');
  const valCommits = document.getElementById('valCommits');

  const countGraveyard = document.getElementById('countGraveyard');
  const countOfrenda = document.getElementById('countOfrenda');

  const graveyardList = document.getElementById('graveyardList');
  const ofrendaList = document.getElementById('ofrendaList');
  const sessionsTimeline = document.getElementById('sessionsTimeline');

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Load sample on initial boot
  loadSampleRepo();

  btnLoadSample.addEventListener('click', () => {
    repoInput.value = './fixtures/haunted-repo';
    loadSampleRepo();
  });

  scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const repoPath = repoInput.value.trim();
    if (!repoPath) return;

    setLoading(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrlOrPath: repoPath })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Scan failed');
      }

      const report = await res.json();
      renderReport(report);
    } catch (err) {
      alert(`Error scanning repository: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  async function loadSampleRepo() {
    setLoading(true);
    try {
      const res = await fetch('/api/sample');
      if (res.ok) {
        const report = await res.json();
        renderReport(report);
      }
    } catch (err) {
      console.warn('Could not load sample automatically:', err);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    const textSpan = btnScan.querySelector('.btn-text');
    const spinner = btnScan.querySelector('.spinner');

    if (isLoading) {
      btnScan.disabled = true;
      textSpan.textContent = 'Archaeologists at work...';
      spinner.classList.remove('hidden');
    } else {
      btnScan.disabled = false;
      textSpan.textContent = 'Awaken the Ghosts';
      spinner.classList.add('hidden');
    }
  }

  function renderReport(report) {
    metricsBar.classList.remove('hidden');

    valDeadCode.textContent = report.deadCodeCount;
    valDeparted.textContent = report.departedCount;
    valHauntScore.textContent = `${report.averageHauntScore} / 100`;
    valCommits.textContent = report.totalCommitsScanned;

    countGraveyard.textContent = report.deadCodeCount;
    countOfrenda.textContent = report.departedCount;

    renderGraveyard(report.items);
    renderOfrenda(report.contributors);
    renderSessions(report.items);
  }

  function renderGraveyard(items) {
    if (!items || items.length === 0) {
      graveyardList.innerHTML = `
        <div class="empty-state card">
          <p>✨ No dead code or haunted relics found in this repository!</p>
        </div>`;
      return;
    }

    graveyardList.innerHTML = items.map(item => {
      const verdictLabel = formatVerdict(item.verdict);
      const icon = item.verdict === 'safe_to_exorcise' ? '🪦' : item.verdict === 'load_bearing_relic' ? '🕯️' : '🌼';
      const authorText = item.isAuthorDeparted ? `${escapeHtml(item.author)} (Departed)` : escapeHtml(item.author);

      let sessionHtml = '';
      if (item.agentSession) {
        sessionHtml = `
          <div class="relic-session-box">
            <div class="session-header">
              <span>🤖 Entire AI Session: ${escapeHtml(item.agentSession.sessionId)}</span>
              <span>Source: ${escapeHtml(item.agentSession.source)}</span>
            </div>
            ${item.agentSession.matchedPrompt ? `<p><strong>Prompt:</strong> "${escapeHtml(item.agentSession.matchedPrompt)}"</p>` : ''}
            ${item.agentSession.reasoningSnippet ? `<p style="margin-top: 4px; color: #a78bfa;"><strong>AI Thinking:</strong> ${escapeHtml(item.agentSession.reasoningSnippet)}</p>` : ''}
          </div>`;
      }

      return `
        <article class="graveyard-card">
          <div class="relic-top-row">
            <div class="relic-identity">
              <span class="relic-icon">${icon}</span>
              <div>
                <h3 class="relic-title">${escapeHtml(item.symbol || item.type)}</h3>
                <span class="relic-path">${escapeHtml(item.file)}:${item.line} • Author: <strong>${authorText}</strong></span>
              </div>
            </div>
            <div class="relic-badges">
              <span class="badge-score">Haunt: ${item.hauntScore}</span>
              <span class="verdict-tag ${item.verdict}">${verdictLabel}</span>
            </div>
          </div>

          <div class="relic-why-box">
            <div class="relic-why-title">📜 Why this code exists (Archaeological Narrative):</div>
            <p>${escapeHtml(item.whyItExists)}</p>
            <p style="margin-top: 6px; font-size: 0.82rem; color: #9ca3af;">
              <strong>Chesterton's Fence Rationale:</strong> ${escapeHtml(item.verdictRationale)}
            </p>
          </div>

          ${sessionHtml}

          <pre class="code-snippet-box"><code>${escapeHtml(item.excerpt)}</code></pre>
        </article>
      `;
    }).join('');
  }

  function renderOfrenda(contributors) {
    if (!contributors || contributors.length === 0) {
      ofrendaList.innerHTML = `
        <div class="empty-state card">
          <p>🌼 All commit contributors have been active recently.</p>
        </div>`;
      return;
    }

    ofrendaList.innerHTML = contributors.map(c => `
      <div class="ofrenda-card">
        <div class="ofrenda-header">
          <h3 class="ofrenda-name">${escapeHtml(c.name)}</h3>
          <span class="ofrenda-era">Active ${c.firstCommitDate.slice(0, 10)} → ${c.lastCommitDate.slice(0, 10)} (${Math.round(c.monthsInactive)} months departed)</span>
        </div>

        <div class="ofrenda-stats">
          <div>
            <div class="ofrenda-stat-label">Commits Given</div>
            <div class="ofrenda-stat-value">${c.totalCommits}</div>
          </div>
          <div>
            <div class="ofrenda-stat-label">Surviving Lines</div>
            <div class="ofrenda-stat-value">${c.survivingLines}</div>
          </div>
        </div>

        <div class="ofrenda-tribute">
          "${escapeHtml(c.ofrendaTribute)}"
        </div>
      </div>
    `).join('');
  }

  function renderSessions(items) {
    const sessionItems = items.filter(i => i.agentSession);

    if (sessionItems.length === 0) {
      sessionsTimeline.innerHTML = `
        <div class="empty-state card">
          <p>📜 No git-linked Entire checkpoints or session transcripts detected in this scan.</p>
        </div>`;
      return;
    }

    sessionsTimeline.innerHTML = sessionItems.map(item => `
      <div class="card timeline-event" style="margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="color: var(--ghost-purple); font-size: 1.05rem;">
            Entire Checkpoint: <code>${escapeHtml(item.agentSession.sessionId)}</code>
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">Commit ${item.commitHash.slice(0, 7)} • ${item.commitDate.slice(0, 10)}</span>
        </div>
        <p style="font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>File Modified:</strong> <code>${escapeHtml(item.file)}</code> (symbol: <code>${escapeHtml(item.symbol || 'module')}</code>)</p>
        ${item.agentSession.matchedPrompt ? `<div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem; font-size: 0.85rem;"><span style="color: var(--marigold-bright); font-weight: 700;">Human Prompt:</span> "${escapeHtml(item.agentSession.matchedPrompt)}"</div>` : ''}
        ${item.agentSession.reasoningSnippet ? `<div style="background: rgba(192, 132, 252, 0.08); padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem;"><span style="color: var(--ghost-purple); font-weight: 700;">Agent Reasoning:</span> ${escapeHtml(item.agentSession.reasoningSnippet)}</div>` : ''}
      </div>
    `).join('');
  }

  function formatVerdict(verdict) {
    if (verdict === 'load_bearing_relic') return '🕯️ Load-Bearing Relic';
    if (verdict === 'safe_to_exorcise') return '🪦 Safe to Lay to Rest';
    return '🌼 Unfinished Ghost Work';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
