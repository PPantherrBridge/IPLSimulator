const state = { teams: [], players: [], season: {}, trophies: [], config: {} };
let auctionTimer = null;

const $ = (id) => document.getElementById(id);
const teamName = (id) => state.teams.find((t) => t.id === id)?.name || `Team ${id}`;
const playerById = (id) => state.players.find((p) => p.id === id);
const roleText = (p) => `${p.battingStyle} - ${p.role}${p.bowlingType ? ` (${p.bowlingType})` : ''}`;

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

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
  const auction = state.season.auction || {};
  $('dashboardStats').innerHTML = [
    ['Teams', state.teams.length],
    ['Players', state.players.length],
    ['Auction Pool', state.players.filter((p) => p.status === 'IN_AUCTION').length],
    ['Auction', auction.status || 'NA'],
    ['Matches', `${state.season.schedule?.filter((m) => m.played).length || 0}/${state.season.schedule?.length || 0}`]
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
    const xi = team.playingXI.map((id) => playerById(id)).filter(Boolean);
    const bench = team.bench.map((id) => playerById(id)).filter(Boolean);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${team.name}</h3>
      <p class="muted">Purse: ₹${team.purse.toLocaleString()} | Squad: ${team.playerIds.length}</p>
      <h4>Playing XI (${team.playingXI.length})</h4>
      ${xi.map((p) => `<div class="stat">${p.name} <span class="role-pill">${roleText(p)}</span> <button data-to-bench="${team.id}:${p.id}" class="warn">To Bench</button></div>`).join('') || '<p class="muted">No XI</p>'}
      <h4>Bench (${team.bench.length})</h4>
      ${bench.map((p) => `<div class="stat">${p.name} <span class="role-pill">${roleText(p)}</span> <button data-to-xi="${team.id}:${p.id}">To XI</button> <button data-release="${team.id}:${p.id}" class="danger">Release</button></div>`).join('') || '<p class="muted">No bench</p>'}
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('[data-to-xi]').forEach((btn) => {
    btn.onclick = async () => {
      const [teamIdStr, playerIdStr] = btn.dataset.toXi.split(':');
      const teamId = Number(teamIdStr);
      const playerId = Number(playerIdStr);
      const team = state.teams.find((t) => t.id === teamId);
      const xi = [...team.playingXI];
      if (xi.length < 11) xi.push(playerId);
      else xi[10] = playerId;
      await api(`/api/teams/${teamId}/lineup`, { method: 'POST', body: JSON.stringify({ playingXI: xi }) });
      await refresh();
    };
  });

  document.querySelectorAll('[data-to-bench]').forEach((btn) => {
    btn.onclick = async () => {
      const [teamIdStr, playerIdStr] = btn.dataset.toBench.split(':');
      const teamId = Number(teamIdStr);
      const playerId = Number(playerIdStr);
      const team = state.teams.find((t) => t.id === teamId);
      const xi = team.playingXI.filter((id) => id !== playerId);
      if (team.bench.length) xi.push(team.bench[0]);
      if (xi.length >= 11) await api(`/api/teams/${teamId}/lineup`, { method: 'POST', body: JSON.stringify({ playingXI: xi.slice(0, 11) }) });
      await refresh();
    };
  });

  document.querySelectorAll('[data-release]').forEach((btn) => {
    btn.onclick = async () => {
      const [teamId, playerId] = btn.dataset.release.split(':').map(Number);
      await api(`/api/teams/${teamId}/release-player`, { method: 'POST', body: JSON.stringify({ playerId }) });
      await refresh();
    };
  });
}

function aiBidAttempt() {
  const auction = state.season.auction;
  if (auction.status !== 'RUNNING' || !auction.currentPlayerId) return;
  const p = playerById(auction.currentPlayerId);
  const aiTeams = state.teams.filter((t) => t.id !== Number(localStorage.getItem('userTeamId') || 0));

  aiTeams.forEach(async (team) => {
    const interest = p.power * 0.6 + p.consistency * 0.4 - (auction.currentBid / state.config.defaultPurse) * 100;
    const aggression = rand(35, 90);
    const chance = Math.min(90, Math.max(5, interest * 0.8 + aggression * 0.2));
    const canAfford = team.purse >= auction.currentBid + auction.increment;
    if (canAfford && Math.random() * 100 < chance * 0.12) {
      const bid = auction.currentBid + auction.increment;
      try { await api('/api/auction/bid', { method: 'POST', body: JSON.stringify({ teamId: team.id, amount: bid }) }); await refresh(); } catch (e) {}
    }
  });
}

function startAuctionCountdown() {
  if (auctionTimer) clearInterval(auctionTimer);
  auctionTimer = setInterval(async () => {
    if (state.season.auction.status !== 'RUNNING') return;
    state.season.auction.timer -= 1;
    $('auctionStatus').textContent = `Status: RUNNING | Timer: ${state.season.auction.timer}s`;
    aiBidAttempt();
    if (state.season.auction.timer <= 0) {
      await api('/api/auction/finalize', { method: 'POST' });
      await refresh();
    }
  }, 1000);
}

function renderAuction() {
  const auction = state.season.auction || {};
  $('auctionStatus').textContent = `Status: ${auction.status || 'NA'} | Timer: ${auction.timer ?? '-'}s`;

  const player = playerById(auction.currentPlayerId);
  $('currentAuctionPlayer').innerHTML = player ? `
    <div class="live-player">
      <h3>${player.name}</h3>
      <p><span class="role-pill">${roleText(player)}</span></p>
      <p>P:${player.power} C:${player.consistency} | Base: ₹${player.basePrice.toLocaleString()}</p>
      <p class="highlight">Current Bid: ₹${(auction.currentBid || player.basePrice).toLocaleString()} | Leader: ${auction.currentTeam ? teamName(auction.currentTeam) : 'No bids yet'}</p>
    </div>` : '<p class="muted">No active player.</p>';

  $('bidHistory').innerHTML = (auction.bidHistory || []).map((x) => `<li>${teamName(x.teamId)} bid ₹${x.amount.toLocaleString()}</li>`).join('') || '<li>No bids yet.</li>';
  $('purseGrid').innerHTML = state.teams.map((t) => `<div class="stat">${t.name}<br/><strong>₹${t.purse.toLocaleString()}</strong></div>`).join('');

  if (auction.status === 'RUNNING') startAuctionCountdown();
  else if (auctionTimer) { clearInterval(auctionTimer); auctionTimer = null; }
}

function renderMatches() {
  const grid = $('matchesGrid');
  grid.innerHTML = '';
  if (!state.season.started) {
    grid.innerHTML = '<div class="card"><p class="muted">Season not started.</p></div>';
    return;
  }

  const userTeamId = Number(localStorage.getItem('userTeamId') || 0);
  [...state.season.schedule].sort(() => Math.random() - 0.5).forEach((m) => {
    const userMatch = [m.teamA, m.teamB].includes(userTeamId);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<h3>${teamName(m.teamA)} vs ${teamName(m.teamB)}</h3><p>${m.played ? 'Completed' : 'Pending'}</p>${m.result ? `<p>${m.result.scoreA.runs}/${m.result.scoreA.wickets} (${m.result.scoreA.overs}) vs ${m.result.scoreB.runs}/${m.result.scoreB.wickets} (${m.result.scoreB.overs})</p>` : ''}`;

    if (!m.played && !userMatch) {
      const b = document.createElement('button');
      b.textContent = 'Simulate';
      b.onclick = async () => { await api(`/api/matches/${m.id}/simulate`, { method: 'POST', body: JSON.stringify({ userTeamId }) }); await refresh(); };
      card.appendChild(b);
    }

    if (!m.played && userMatch) {
      const form = document.createElement('div');
      form.innerHTML = `
        <p class="muted">User Match Input</p>
        <div class="row wrap"><input data-ra type="number" placeholder="Team A Runs"/><input data-wa type="number" placeholder="Wkts"/><input data-oa placeholder="Overs" value="20.0"/></div>
        <div class="row wrap"><input data-rb type="number" placeholder="Team B Runs"/><input data-wb type="number" placeholder="Wkts"/><input data-ob placeholder="Overs" value="20.0"/></div>
        <textarea data-bat rows="4" placeholder='Batting JSON [{"playerId":1,"runs":30,"balls":35}]'></textarea>
        <textarea data-bowl rows="4" placeholder='Bowling JSON [{"playerId":2,"overs":"4.0","runsGiven":20,"wickets":2}]'></textarea>
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
      <h4>Batting</h4>
      <table><thead><tr><th>Player</th><th>Runs</th><th>Balls</th><th>SR</th></tr></thead><tbody>${s.battingStats.map((b) => `<tr><td>${playerById(b.playerId)?.name || b.playerId}</td><td>${b.runs}</td><td>${b.balls}</td><td>${b.balls ? ((b.runs*100)/b.balls).toFixed(2) : '0.00'}</td></tr>`).join('')}</tbody></table>
      <h4>Bowling</h4>
      <table><thead><tr><th>Player</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Econ</th></tr></thead><tbody>${s.bowlingStats.map((b) => `<tr><td>${playerById(b.playerId)?.name || b.playerId}</td><td>${b.overs}</td><td>${b.runsGiven}</td><td>${b.wickets}</td><td>${(Number(b.runsGiven)/(Number(b.overs.split('.')[0]) + Number((b.overs.split('.')[1]||0))/6 || 1)).toFixed(2)}</td></tr>`).join('')}</tbody></table>
    </article>
  `).join('') || '<div class="card"><p class="muted">No scorecards yet.</p></div>';
}

function renderAwards() {
  const a = state.season.awards;
  if (!a) { $('awardsCard').innerHTML = '<p class="muted">Awards available after season completion.</p>'; return; }
  $('awardsCard').innerHTML = `
    <h3>Season Awards</h3>
    <p><strong>Orange Cap:</strong> ${a.orangeCap?.name || 'NA'} (${a.orangeCap?.runs || 0} runs)</p>
    <p><strong>Purple Cap:</strong> ${a.purpleCap?.name || 'NA'} (${a.purpleCap?.wickets || 0} wickets)</p>
    <p><strong>MVP:</strong> ${a.mvp?.name || 'NA'} (Score ${a.mvp?.score || 0})</p>
    <p><strong>Best Strike Rate:</strong> ${a.bestStrikeRate?.name || 'NA'} (${a.bestStrikeRate?.strikeRate?.toFixed?.(2) || '0.00'})</p>
    <p><strong>Best Economy:</strong> ${a.bestEconomy?.name || 'NA'} (${a.bestEconomy?.economy?.toFixed?.(2) || '0.00'})</p>
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

  const canStartSeason = ['COMPLETED', 'SKIPPED'].includes(state.season.auction?.status);
  $('startSeasonBtn').disabled = !canStartSeason;
  $('startSeasonBtn').style.display = state.season.started ? 'none' : 'inline-block';
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function bindActions() {
  $('userTeamSelect').onchange = () => localStorage.setItem('userTeamId', $('userTeamSelect').value || '');

  $('teamCreateForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/teams', { method: 'POST', body: JSON.stringify({ name: $('newTeamName').value, purse: Number($('newTeamPurse').value) }) });
    e.target.reset();
    await refresh();
  };

  $('playerCreateForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({
        name: $('newPlayerName').value,
        battingStyle: $('newPlayerBattingStyle').value,
        role: $('newPlayerRole').value,
        bowlingType: $('newPlayerBowlingType').value || null,
        power: Number($('newPlayerPower').value),
        consistency: Number($('newPlayerConsistency').value),
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
      if (!teamId) return alert('Select your user team first.');
      const next = (state.season.auction.currentBid || playerById(state.season.auction.currentPlayerId)?.basePrice || 0) + Number(btn.dataset.bid);
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
