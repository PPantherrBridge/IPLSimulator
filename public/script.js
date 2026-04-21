const state = { teams: [], players: [], season: {}, trophies: [], config: {} };

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const $ = (id) => document.getElementById(id);
const teamName = (id) => state.teams.find((t) => t.id === id)?.name || `Team ${id}`;
const roleText = (p) => `${p.battingStyle} - ${p.role}${p.bowlingType ? ` (${p.bowlingType})` : ''}`;

function bindTabs() {
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    };
  });
}

function renderDashboard() {
  const played = state.season.schedule?.filter((m) => m.played).length || 0;
  const total = state.season.schedule?.length || 0;
  $('dashboardStats').innerHTML = [
    ['Teams', state.teams.length],
    ['Players', state.players.length],
    ['Auction Pool', state.players.filter((p) => p.status === 'IN_AUCTION').length],
    ['Matches', `${played}/${total}`]
  ].map(([k, v]) => `<div class="stat"><div class="muted">${k}</div><strong>${v}</strong></div>`).join('');
}

function fillCreateTeamSelect() {
  $('newPlayerTeam').innerHTML = '<option value="">Auction Pool</option>' + state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
}

function renderTeams() {
  const grid = $('teamsGrid');
  grid.innerHTML = '';
  state.teams.forEach((team) => {
    const players = state.players.filter((p) => p.teamId === team.id);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${team.name}</h3>
      <p class="muted">Purse: ${team.purse.toLocaleString()} | Squad: ${players.length}</p>
      ${players.map((p) => `<div class="stat"><strong>${p.name}</strong><br/><span class="role-pill">${roleText(p)}</span><br/>P:${p.power} C:${p.consistency} <button data-release="${p.id}" class="danger">Release</button></div>`).join('') || '<p class="muted">No players.</p>'}
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('[data-release]').forEach((btn) => {
    btn.onclick = async () => {
      const playerId = Number(btn.dataset.release);
      const team = state.teams.find((t) => state.players.find((p) => p.id === playerId)?.teamId === t.id);
      await api(`/api/teams/${team.id}/release-player`, { method: 'POST', body: JSON.stringify({ playerId }) });
      await refresh();
    };
  });
}

function renderAuction() {
  const grid = $('auctionGrid');
  const pool = state.players.filter((p) => p.status === 'IN_AUCTION');
  $('auctionStatus').textContent = state.season.auction?.active
    ? `Auction Active | Pool: ${pool.length}`
    : `Auction Closed | Needs pool >= teams (${pool.length}/${state.teams.length})`;

  grid.innerHTML = '';
  if (!pool.length) {
    grid.innerHTML = '<div class="card"><p class="muted">No players in auction pool.</p></div>';
    return;
  }

  pool.forEach((player) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${player.name}</h3>
      <p><span class="role-pill">${roleText(player)}</span></p>
      <p class="muted">Current Bid: ${player.currentBid || 0} (${player.currentBidTeamId ? teamName(player.currentBidTeamId) : 'No bidder'})</p>
      <div class="row wrap">
        <select data-team>
          <option value="">Select Team</option>
          ${state.teams.map((t) => `<option value="${t.id}">${t.name} (₹${t.purse.toLocaleString()})</option>`).join('')}
        </select>
        <input data-bid type="number" placeholder="Bid Amount" />
        <button data-bid-btn>Bid</button>
        <button data-sold-btn class="success">Mark Sold</button>
      </div>`;

    card.querySelector('[data-bid-btn]').onclick = async () => {
      const teamId = Number(card.querySelector('[data-team]').value);
      const bid = Number(card.querySelector('[data-bid]').value);
      await api('/api/auction/bid', { method: 'POST', body: JSON.stringify({ playerId: player.id, teamId, bid }) });
      await refresh();
    };

    card.querySelector('[data-sold-btn]').onclick = async () => {
      await api('/api/auction/sold', { method: 'POST', body: JSON.stringify({ playerId: player.id }) });
      await refresh();
    };

    grid.appendChild(card);
  });
}

function matchResultText(match) {
  if (!match.result) return 'Pending';
  const { scoreA, scoreB } = match.result;
  return `${teamName(match.teamA)} ${scoreA.runs}/${scoreA.wickets} (${scoreA.overs}) vs ${teamName(match.teamB)} ${scoreB.runs}/${scoreB.wickets} (${scoreB.overs})`;
}

function renderMatches() {
  const grid = $('matchesGrid');
  grid.innerHTML = '';
  if (!state.season.started) {
    grid.innerHTML = '<div class="card"><p class="muted">Season not started.</p></div>';
    return;
  }

  const shuffled = [...state.season.schedule].sort(() => Math.random() - 0.5);
  const userTeamId = Number(localStorage.getItem('userTeamId') || '0');

  shuffled.forEach((match) => {
    const userMatch = match.teamA === userTeamId || match.teamB === userTeamId;
    const card = document.createElement('article');
    card.className = 'card match-card';
    card.innerHTML = `
      <h3>${teamName(match.teamA)} vs ${teamName(match.teamB)}</h3>
      <p class="muted">Status: ${match.played ? 'Completed' : 'Upcoming'}</p>
      <p>${matchResultText(match)}</p>
      ${match.result?.topBatters?.length ? `<p><strong>Top Batters:</strong> ${match.result.topBatters.map((b) => `${b.name} (${b.runs})`).join(', ')}</p>` : ''}
      ${match.result?.topBowlers?.length ? `<p><strong>Top Bowlers:</strong> ${match.result.topBowlers.map((b) => `${b.name} (${b.wickets})`).join(', ')}</p>` : ''}
      <div class="actions row wrap"></div>
    `;

    const actions = card.querySelector('.actions');
    if (!match.played && !userMatch) {
      const btn = document.createElement('button');
      btn.textContent = 'Simulate';
      btn.onclick = async () => { await api(`/api/matches/${match.id}/simulate`, { method: 'POST', body: JSON.stringify({ userTeamId }) }); await refresh(); };
      actions.appendChild(btn);
    }

    if (!match.played && userMatch) {
      const form = document.createElement('div');
      form.innerHTML = `
        <div class="card">
          <h4>Enter Result (User Match)</h4>
          <div class="row wrap"><label>Opponent:</label><select data-opp><option value="${match.teamA === userTeamId ? match.teamB : match.teamA}">${teamName(match.teamA === userTeamId ? match.teamB : match.teamA)}</option></select></div>
          <p><strong>Team A (${teamName(match.teamA)})</strong></p>
          <div class="row wrap"><input data-ra placeholder="Runs" type="number"/><input data-wa placeholder="Wickets" type="number"/><input data-oa placeholder="Overs"/></div>
          <p><strong>Team B (${teamName(match.teamB)})</strong></p>
          <div class="row wrap"><input data-rb placeholder="Runs" type="number"/><input data-wb placeholder="Wickets" type="number"/><input data-ob placeholder="Overs"/></div>
          <div class="row wrap"><select data-override><option value="">Auto winner</option><option value="${match.teamA}">${teamName(match.teamA)}</option><option value="${match.teamB}">${teamName(match.teamB)}</option></select><button data-save>Enter Result</button></div>
        </div>`;
      form.querySelector('[data-save]').onclick = async () => {
        const scoreA = { runs: Number(form.querySelector('[data-ra]').value), wickets: Number(form.querySelector('[data-wa]').value), overs: form.querySelector('[data-oa]').value || '20.0' };
        const scoreB = { runs: Number(form.querySelector('[data-rb]').value), wickets: Number(form.querySelector('[data-wb]').value), overs: form.querySelector('[data-ob]').value || '20.0' };
        const winnerOverride = form.querySelector('[data-override]').value || null;
        await api(`/api/matches/${match.id}/manual`, { method: 'POST', body: JSON.stringify({ scoreA, scoreB, winnerOverride }) });
        await refresh();
      };
      card.appendChild(form);
    }

    grid.appendChild(card);
  });
}

function renderPoints() {
  const rows = [...(state.season.pointsTable || [])].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  $('pointsBody').innerHTML = rows.map((r) => `<tr><td>${r.teamName}</td><td>${r.matchesPlayed}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.points}</td><td>${r.nrr.toFixed(3)}</td></tr>`).join('');
}

function renderHistory() {
  $('historyGrid').innerHTML = (state.season.history || []).map((h) => `
    <article class="card">
      <h3>${teamName(h.teamA)} vs ${teamName(h.teamB)}</h3>
      <p class="muted">Winner: ${teamName(h.winner)} | ${new Date(h.date).toLocaleString()}</p>
      <p>${h.scoreA.runs}/${h.scoreA.wickets} (${h.scoreA.overs}) vs ${h.scoreB.runs}/${h.scoreB.wickets} (${h.scoreB.overs})</p>
      <p><strong>Top Batters:</strong> ${(h.topBatters || []).map((b) => `${b.name} ${b.runs}`).join(', ') || 'NA'}</p>
      <p><strong>Top Bowlers:</strong> ${(h.topBowlers || []).map((b) => `${b.name} ${b.wickets}`).join(', ') || 'NA'}</p>
    </article>`).join('') || '<div class="card"><p class="muted">No match history yet.</p></div>';
}

function renderTrophies() {
  $('trophiesBody').innerHTML = (state.trophies || []).map((t) => `<tr><td>${t.teamName}</td><td>${t.titles}</td><td>${t.lastWinnerPlayer}</td><td>${t.captain}</td></tr>`).join('');
}

async function refresh() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);

  renderDashboard();
  fillCreateTeamSelect();
  renderTeams();
  renderAuction();
  renderMatches();
  renderPoints();
  renderHistory();
  renderTrophies();

  $('startSeasonBtn').style.display = state.season.started ? 'none' : 'inline-block';
}

function bindActions() {
  $('startAuctionBtn').onclick = async () => {
    try { await api('/api/auction/start', { method: 'POST' }); await refresh(); } catch (e) { alert(e.message); }
  };

  $('startSeasonBtn').onclick = async () => {
    await api('/api/season/start', { method: 'POST' });
    await refresh();
  };

  $('resetSeasonBtn').onclick = async () => {
    if (!confirm('Reset season only? Teams and auctions stay intact.')) return;
    await api('/api/season/reset', { method: 'POST' });
    await refresh();
  };

  $('teamCreateForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: $('newTeamName').value.trim(), purse: Number($('newTeamPurse').value) })
    });
    e.target.reset();
    await refresh();
  };

  $('playerCreateForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({
        name: $('newPlayerName').value.trim(),
        battingStyle: $('newPlayerBattingStyle').value,
        role: $('newPlayerRole').value,
        bowlingType: $('newPlayerBowlingType').value.trim() || null,
        power: Number($('newPlayerPower').value),
        consistency: Number($('newPlayerConsistency').value),
        teamId: $('newPlayerTeam').value || null
      })
    });
    e.target.reset();
    await refresh();
  };

  $('completeSeasonForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/season/complete', {
      method: 'POST',
      body: JSON.stringify({ playerOfLeague: $('playerOfLeague').value, captain: $('captainName').value })
    });
    e.target.reset();
    await refresh();
  };
}

(async function init() {
  bindTabs();
  bindActions();
  await refresh();
})();
