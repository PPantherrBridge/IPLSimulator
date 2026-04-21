const state = { teams: [], players: [], season: {}, trophies: [], config: {} };
let auctionTimer = null;

const $ = (id) => document.getElementById(id);
const teamName = (id) => state.teams.find((t) => t.id === id)?.name || `Team ${id}`;
const playerById = (id) => state.players.find((p) => p.id === id);
const roleText = (p) => `${p.hand} - ${p.role}${p.bowlingType && p.bowlingType !== 'NONE' ? ` (${p.bowlingType})` : ''}`;

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function bindTabs() {
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    };
  });
}

function renderDashboard() {
  $('dashboardStats').innerHTML = [
    ['Teams', state.teams.length],
    ['Players', state.players.length],
    ['Auction Pool', state.players.filter((p) => p.status === 'IN_AUCTION').length],
    ['Auction', state.season.auction?.status || 'NA'],
    ['Season', state.season.started ? 'Running' : 'Not Started']
  ].map(([k, v]) => `<div class="stat"><div class="muted">${k}</div><strong>${v}</strong></div>`).join('');
}

function fillSelectors() {
  const options = state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  $('newPlayerTeam').innerHTML = '<option value="">Auction Pool</option>' + options;
  $('userTeamSelect').innerHTML = '<option value="">User Team</option>' + options;
  const saved = localStorage.getItem('userTeamId');
  if (saved) $('userTeamSelect').value = saved;
}

function renderTeams() {
  const grid = $('teamsGrid');
  grid.innerHTML = '';
  state.teams.forEach((team) => {
    const squad = team.playerIds.map((id) => playerById(id)).filter(Boolean);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${team.name}</h3>
      <p class="muted">Purse: ₹${team.purse.toLocaleString()} | Squad: ${squad.length}</p>
      ${squad.map((p) => `<div class="stat"><strong>${p.name}</strong> <span class="role-pill">${roleText(p)}</span><br/>P:${p.p} C:${p.c} PP:${p.pp} DO:${p.do} CL:${p.cl}<br/><button data-edit="${p.id}">Edit</button> <button data-release="${team.id}:${p.id}" class="danger">Release</button></div>`).join('') || '<p class="muted">No players</p>'}
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('[data-release]').forEach((btn) => {
    btn.onclick = async () => {
      const [teamId, playerId] = btn.dataset.release.split(':').map(Number);
      await api(`/api/teams/${teamId}/release-player`, { method: 'POST', body: JSON.stringify({ playerId }) });
      await refresh();
    };
  });

  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = async () => {
      const player = playerById(Number(btn.dataset.edit));
      const name = prompt('Name', player.name);
      if (!name) return;
      const p = Number(prompt('P (1-100)', player.p));
      const c = Number(prompt('C (1-100)', player.c));
      const pp = Number(prompt('PP (1-100)', player.pp));
      const doVal = Number(prompt('DO (1-100)', player.do));
      const cl = Number(prompt('CL (1-100)', player.cl));
      await api(`/api/players/${player.id}`, { method: 'PUT', body: JSON.stringify({ name, p, c, pp, do: doVal, cl }) });
      await refresh();
    };
  });
}

async function aiBidAttempt() {
  const a = state.season.auction;
  if (a.status !== 'RUNNING' || !a.currentPlayerId) return;
  const player = playerById(a.currentPlayerId);
  const userTeam = Number(localStorage.getItem('userTeamId') || 0);
  const aiTeams = state.teams.filter((t) => t.id !== userTeam);

  for (const t of aiTeams) {
    const interest = (player.p * 0.6 + player.c * 0.4) - ((a.currentBid || player.basePrice) / state.config.defaultPurse) * 100;
    const aggression = rand(25, 95);
    const chance = Math.max(5, Math.min(90, interest + aggression * 0.2));
    const next = (a.currentBid || player.basePrice) + a.increment;
    if (t.purse >= next && Math.random() * 100 < chance * 0.12) {
      try { await api('/api/auction/bid', { method: 'POST', body: JSON.stringify({ teamId: t.id, amount: next }) }); } catch (e) {}
    }
  }
}

function startAuctionTimer() {
  if (auctionTimer) clearInterval(auctionTimer);
  auctionTimer = setInterval(async () => {
    if (state.season.auction.status !== 'RUNNING') return;
    state.season.auction.timer -= 1;
    $('auctionStatus').textContent = `Status: RUNNING | Timer: ${state.season.auction.timer}s`;
    await aiBidAttempt();
    if (state.season.auction.timer <= 0) {
      await api('/api/auction/finalize', { method: 'POST' });
      await refresh();
    }
  }, 1000);
}

function renderAuction() {
  const a = state.season.auction || {};
  $('auctionStatus').textContent = `Status: ${a.status || 'NA'} | Timer: ${a.timer ?? '-'}s`;
  const player = playerById(a.currentPlayerId);

  $('currentAuctionPlayer').innerHTML = player ? `
    <div class="live-player">
      <h3>${player.name}</h3>
      <p><span class="role-pill">${roleText(player)}</span></p>
      <p>P:${player.p} C:${player.c} | Base: ₹${player.basePrice.toLocaleString()}</p>
      <p class="highlight">Current Bid: ₹${(a.currentBid || player.basePrice).toLocaleString()} | Leader: ${a.currentTeam ? teamName(a.currentTeam) : 'No bids'}</p>
    </div>` : '<p class="muted">No active auction player.</p>';

  $('bidHistory').innerHTML = (a.bidHistory || []).map((b) => `<li>${teamName(b.teamId)} bid ₹${b.amount.toLocaleString()}</li>`).join('') || '<li>No bids yet.</li>';
  $('purseGrid').innerHTML = state.teams.map((t) => `<div class="stat">${t.name}<br/><strong>₹${t.purse.toLocaleString()}</strong></div>`).join('');

  if (a.status === 'RUNNING') startAuctionTimer();
  else if (auctionTimer) { clearInterval(auctionTimer); auctionTimer = null; }
}

function renderMatches() {
  const grid = $('matchesGrid');
  grid.innerHTML = '';
  if (!state.season.started) {
    grid.innerHTML = '<div class="card"><p class="muted">Season not started.</p></div>';
    return;
  }

  const userTeam = Number(localStorage.getItem('userTeamId') || 0);
  state.season.schedule.forEach((m) => {
    const userMatch = [m.teamA, m.teamB].includes(userTeam);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<h3>${teamName(m.teamA)} vs ${teamName(m.teamB)}</h3><p>${m.played ? 'Completed' : 'Pending'}</p>${m.result ? `<p>${m.result.scoreA.runs}/${m.result.scoreA.wickets} (${m.result.scoreA.overs}) vs ${m.result.scoreB.runs}/${m.result.scoreB.wickets} (${m.result.scoreB.overs})</p>` : ''}`;

    if (!m.played && !userMatch) {
      const b = document.createElement('button');
      b.textContent = 'Simulate';
      b.onclick = async () => { await api(`/api/matches/${m.id}/simulate`, { method: 'POST', body: JSON.stringify({ userTeamId: userTeam }) }); await refresh(); };
      card.appendChild(b);
    }

    if (!m.played && userMatch) {
      const form = document.createElement('div');
      form.innerHTML = `
        <div class="row wrap"><input data-ra type="number" placeholder="Team A Runs"/><input data-wa type="number" placeholder="Wickets"/><input data-oa value="20.0"/></div>
        <div class="row wrap"><input data-rb type="number" placeholder="Team B Runs"/><input data-wb type="number" placeholder="Wickets"/><input data-ob value="20.0"/></div>
        <textarea data-bat rows="3" placeholder='Batting JSON'></textarea>
        <textarea data-bowl rows="3" placeholder='Bowling JSON'></textarea>
        <button data-save>Enter Result</button>
      `;
      form.querySelector('[data-save]').onclick = async () => {
        const payload = {
          scoreA: { runs: Number(form.querySelector('[data-ra]').value), wickets: Number(form.querySelector('[data-wa]').value), overs: form.querySelector('[data-oa]').value },
          scoreB: { runs: Number(form.querySelector('[data-rb]').value), wickets: Number(form.querySelector('[data-wb]').value), overs: form.querySelector('[data-ob]').value },
          battingStats: JSON.parse(form.querySelector('[data-bat]').value || '[]'),
          bowlingStats: JSON.parse(form.querySelector('[data-bowl]').value || '[]')
        };
        await api(`/api/matches/${m.id}/manual`, { method: 'POST', body: JSON.stringify(payload) });
        await refresh();
      };
      card.appendChild(form);
    }
    grid.appendChild(card);
  });
}

function renderPoints() {
  $('pointsBody').innerHTML = [...(state.season.pointsTable || [])]
    .sort((a, b) => b.points - a.points || b.nrr - a.nrr)
    .map((r) => `<tr><td>${r.teamName}</td><td>${r.matchesPlayed}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.points}</td><td>${r.nrr.toFixed(3)}</td></tr>`)
    .join('');
}

function renderScorecards() {
  $('scorecardsGrid').innerHTML = (state.season.scorecards || []).map((s) => `
    <article class="card">
      <h3>${teamName(s.teamA)} vs ${teamName(s.teamB)}</h3>
      <p>${s.scoreA.runs}/${s.scoreA.wickets} (${s.scoreA.overs}) vs ${s.scoreB.runs}/${s.scoreB.wickets} (${s.scoreB.overs})</p>
      <table><thead><tr><th>Player</th><th>Runs</th><th>Balls</th><th>SR</th></tr></thead><tbody>${s.battingStats.map((b) => `<tr><td>${playerById(b.playerId)?.name || b.playerId}</td><td>${b.runs}</td><td>${b.balls}</td><td>${b.balls ? ((b.runs * 100) / b.balls).toFixed(2) : '0.00'}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Player</th><th>Overs</th><th>Runs</th><th>Wkts</th></tr></thead><tbody>${s.bowlingStats.map((b) => `<tr><td>${playerById(b.playerId)?.name || b.playerId}</td><td>${b.overs}</td><td>${b.runsGiven}</td><td>${b.wickets}</td></tr>`).join('')}</tbody></table>
    </article>
  `).join('') || '<div class="card"><p class="muted">No scorecards yet.</p></div>';
}

function renderAwards() {
  const a = state.season.awards;
  $('awardsCard').innerHTML = !a ? '<p class="muted">Awards will appear after season completion.</p>' : `
    <h3>Awards</h3>
    <p><strong>Orange Cap:</strong> ${a.orangeCap?.name || 'NA'} (${a.orangeCap?.totalRuns || 0})</p>
    <p><strong>Purple Cap:</strong> ${a.purpleCap?.name || 'NA'} (${a.purpleCap?.wickets || 0})</p>
    <p><strong>MVP:</strong> ${a.mvp?.name || 'NA'}</p>
  `;
}

function renderHistory() {
  $('historyGrid').innerHTML = (state.trophies || []).map((t) => `<article class="card"><h3>${t.teamName}</h3><p>Titles: ${t.titles}</p><p>Player of Season: ${t.playerOfSeason}</p><p>Captain: ${t.captain}</p></article>`).join('') || '<div class="card"><p class="muted">No trophies yet.</p></div>';
}

async function refresh() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);

  renderDashboard();
  fillSelectors();
  renderTeams();
  renderAuction();
  renderMatches();
  renderPoints();
  renderScorecards();
  renderAwards();
  renderHistory();

  const startBtn = $('startSeasonBtn');
  const seasonStarted = state.season.started;
  startBtn.disabled = seasonStarted;
  startBtn.style.display = seasonStarted ? 'none' : 'inline-block';
}

function bindActions() {
  $('userTeamSelect').onchange = () => localStorage.setItem('userTeamId', $('userTeamSelect').value || '');

  $('playerCreateForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({
        name: $('newPlayerName').value,
        hand: $('newPlayerHand').value,
        role: $('newPlayerRole').value,
        bowlingType: $('newPlayerBowlingType').value || 'NONE',
        p: Number($('newPlayerP').value),
        c: Number($('newPlayerC').value),
        pp: Number($('newPlayerPP').value),
        do: Number($('newPlayerDO').value),
        cl: Number($('newPlayerCL').value),
        basePrice: Number($('newPlayerBasePrice').value),
        teamId: $('newPlayerTeam').value || null
      })
    });
    e.target.reset();
    await refresh();
  };

  $('startAuctionBtn').onclick = async () => { await api('/api/auction/start', { method: 'POST' }); await refresh(); };
  $('endAuctionBtn').onclick = async () => { await api('/api/auction/end', { method: 'POST' }); await refresh(); };
  $('skipAuctionBtn').onclick = async () => { await api('/api/season/skip-auction', { method: 'POST' }); await refresh(); };
  $('skipPlayerBtn').onclick = async () => { await api('/api/auction/skip', { method: 'POST' }); await refresh(); };
  $('startSeasonBtn').onclick = async () => { await api('/api/season/start', { method: 'POST' }); await refresh(); };
  $('resetSeasonBtn').onclick = async () => { if (confirm('Reset season?')) { await api('/api/season/reset', { method: 'POST' }); await refresh(); } };

  document.querySelectorAll('[data-bid]').forEach((btn) => {
    btn.onclick = async () => {
      const teamId = Number(localStorage.getItem('userTeamId') || 0);
      if (!teamId) return alert('Select user team.');
      const player = playerById(state.season.auction.currentPlayerId);
      const next = (state.season.auction.currentBid || player?.basePrice || 0) + Number(btn.dataset.bid);
      await api('/api/auction/bid', { method: 'POST', body: JSON.stringify({ teamId, amount: next }) });
      await refresh();
    };
  });
}

(async function init() {
  bindTabs();
  bindActions();
  await refresh();
})();
