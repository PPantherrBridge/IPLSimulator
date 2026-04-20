const state = {
  teams: [],
  players: [],
  season: { started: false, completed: false, schedule: [], history: [], pointsTable: [] },
  trophies: []
};

function userMode() {
  return JSON.parse(localStorage.getItem('lplUserMode') || '{}');
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function teamName(teamId) {
  return state.teams.find((t) => t.id === teamId)?.name || `Team ${teamId}`;
}

function playerName(playerId) {
  return state.players.find((p) => p.id === playerId)?.name || `Player ${playerId}`;
}

function bindTabs() {
  const tabs = document.querySelectorAll('#tabs button');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function fillTeamSelects() {
  const userTeamSelect = document.getElementById('userTeamSelect');
  const newPlayerTeam = document.getElementById('newPlayerTeam');

  userTeamSelect.innerHTML = '<option value="">Select User Team</option>' +
    state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');

  newPlayerTeam.innerHTML = '<option value="">Auction Pool</option>' +
    state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
}

function fillUserPlayers() {
  const mode = userMode();
  const userPlayerSelect = document.getElementById('userPlayerSelect');
  const players = state.players.filter((p) => p.teamId === Number(mode.teamId));

  userPlayerSelect.innerHTML = '<option value="">Select User Player</option>' +
    players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');

  if (mode.playerId) {
    userPlayerSelect.value = String(mode.playerId);
  }
}

function renderTeams() {
  const teamsGrid = document.getElementById('teamsGrid');
  const teamTemplate = document.getElementById('teamCardTemplate');
  const badgeTemplate = document.getElementById('playerBadgeTemplate');
  teamsGrid.innerHTML = '';

  state.teams.forEach((team) => {
    const node = teamTemplate.content.cloneNode(true);
    node.querySelector('.team-name').textContent = team.name;
    node.querySelector('.team-meta').textContent = `Players: ${team.playerIds.length}`;

    node.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      const name = prompt('Edit team name', team.name);
      if (!name) return;
      await api(`/api/teams/${team.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      await refresh();
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Delete ${team.name}?`)) return;
      await api(`/api/teams/${team.id}`, { method: 'DELETE' });
      await refresh();
    });

    const playersContainer = node.querySelector('.players-list');
    const teamPlayers = state.players.filter((p) => p.teamId === team.id);
    teamPlayers.forEach((player) => {
      const badge = badgeTemplate.content.cloneNode(true);
      badge.querySelector('.label').textContent = `${player.name} (${player.role}) P:${player.power} C:${player.consistency}`;

      badge.querySelector('[data-action="edit"]').addEventListener('click', async () => {
        const name = prompt('Player name', player.name);
        if (!name) return;
        const role = prompt('Role', player.role) || player.role;
        const power = Number(prompt('Power (1-100)', player.power));
        const consistency = Number(prompt('Consistency (1-100)', player.consistency));

        await api(`/api/players/${player.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, role, power, consistency })
        });
        await refresh();
      });

      badge.querySelector('[data-action="release"]').addEventListener('click', async () => {
        await api(`/api/teams/${team.id}/release-player`, {
          method: 'POST',
          body: JSON.stringify({ playerId: player.id })
        });
        await refresh();
      });

      badge.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete ${player.name}?`)) return;
        await api(`/api/players/${player.id}`, { method: 'DELETE' });
        await refresh();
      });

      playersContainer.appendChild(badge);
    });

    teamsGrid.appendChild(node);
  });
}

function renderAuction() {
  const auctionGrid = document.getElementById('auctionGrid');
  const auctionTemplate = document.getElementById('auctionCardTemplate');
  auctionGrid.innerHTML = '';

  const pool = state.players.filter((p) => p.status === 'IN_AUCTION');
  if (!pool.length) {
    auctionGrid.innerHTML = '<div class="card"><p class="muted">No players in auction pool.</p></div>';
    return;
  }

  pool.forEach((player) => {
    const node = auctionTemplate.content.cloneNode(true);
    node.querySelector('.name').textContent = player.name;
    node.querySelector('.ratings').textContent = `${player.role} | P:${player.power} C:${player.consistency}`;
    node.querySelector('.bid').textContent = `Current Bid: ${player.currentBid || 0} | Team: ${player.currentBidTeamId ? teamName(player.currentBidTeamId) : '-'}`;

    const teamSelect = node.querySelector('.bid-team');
    teamSelect.innerHTML = '<option value="">Select Team</option>' +
      state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');

    const bidValue = node.querySelector('.bid-value');

    node.querySelector('[data-action="bid"]').addEventListener('click', async () => {
      if (!teamSelect.value || !bidValue.value) {
        alert('Select a team and bid value.');
        return;
      }

      await api('/api/auction/bid', {
        method: 'POST',
        body: JSON.stringify({
          playerId: player.id,
          teamId: Number(teamSelect.value),
          bid: Number(bidValue.value)
        })
      });
      await refresh();
    });

    node.querySelector('[data-action="sold"]').addEventListener('click', async () => {
      await api('/api/auction/sold', {
        method: 'POST',
        body: JSON.stringify({ playerId: player.id })
      });
      await refresh();
    });

    auctionGrid.appendChild(node);
  });
}

function renderMatches() {
  const matchesGrid = document.getElementById('matchesGrid');
  const template = document.getElementById('matchCardTemplate');
  matchesGrid.innerHTML = '';

  if (!state.season.started) {
    matchesGrid.innerHTML = '<div class="card"><p class="muted">Season not started. Click "Start Season".</p></div>';
    return;
  }

  const mode = userMode();
  state.season.schedule.forEach((match) => {
    const node = template.content.cloneNode(true);

    const teamA = teamName(match.teamA);
    const teamB = teamName(match.teamB);
    node.querySelector('.match-title').textContent = `${teamA} vs ${teamB}`;

    if (match.played && match.result) {
      const winnerName = teamName(match.result.winner);
      node.querySelector('.match-status').textContent = `Played | Winner: ${winnerName} | ${teamA} ${match.result.scoreA.runs}/${match.result.scoreA.wickets} (${match.result.scoreA.overs}) vs ${teamB} ${match.result.scoreB.runs}/${match.result.scoreB.wickets} (${match.result.scoreB.overs})`;
      matchesGrid.appendChild(node);
      return;
    }

    const userInvolved = Number(mode.teamId) === match.teamA || Number(mode.teamId) === match.teamB;
    node.querySelector('.match-status').textContent = userInvolved
      ? 'User team match: Enter result manually.'
      : 'Auto simulation available.';

    const autoArea = node.querySelector('.auto-area');
    if (!userInvolved) {
      const btn = document.createElement('button');
      btn.textContent = 'Simulate Match';
      btn.addEventListener('click', async () => {
        await api(`/api/matches/${match.id}/simulate`, {
          method: 'POST',
          body: JSON.stringify({ userTeamId: Number(mode.teamId) || null })
        });
        await refresh();
      });
      autoArea.appendChild(btn);
    } else {
      node.querySelector('.manual-form').classList.remove('hidden');
      const manualForm = node.querySelector('.manual-form');
      const winner = manualForm.querySelector('.winner');
      winner.innerHTML = `
        <option value="${match.teamA}">${teamA}</option>
        <option value="${match.teamB}">${teamB}</option>
      `;

      manualForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const scoreA = {
          runs: Number(manualForm.querySelector('.runs-a').value),
          wickets: Number(manualForm.querySelector('.wkts-a').value),
          overs: manualForm.querySelector('.overs-a').value || '20.0'
        };
        const scoreB = {
          runs: Number(manualForm.querySelector('.runs-b').value),
          wickets: Number(manualForm.querySelector('.wkts-b').value),
          overs: manualForm.querySelector('.overs-b').value || '20.0'
        };

        await api(`/api/matches/${match.id}/manual`, {
          method: 'POST',
          body: JSON.stringify({
            winner: Number(winner.value),
            scoreA,
            scoreB,
            playerStats: []
          })
        });
        await refresh();
      });
    }

    matchesGrid.appendChild(node);
  });
}

function renderPoints() {
  const body = document.getElementById('pointsBody');
  body.innerHTML = '';
  const rows = [...state.season.pointsTable].sort((a, b) => b.points - a.points || b.wins - a.wins);

  rows.forEach((row) => {
    body.innerHTML += `<tr>
      <td>${row.teamName}</td>
      <td>${row.matchesPlayed}</td>
      <td>${row.wins}</td>
      <td>${row.losses}</td>
      <td>${row.points}</td>
    </tr>`;
  });
}

function renderHistory() {
  const body = document.getElementById('historyBody');
  body.innerHTML = '';

  state.season.history.forEach((item) => {
    body.innerHTML += `<tr>
      <td>${item.id}</td>
      <td>${teamName(item.teamA)} vs ${teamName(item.teamB)}</td>
      <td>${teamName(item.winner)}</td>
      <td>${item.scoreA.runs}/${item.scoreA.wickets} & ${item.scoreB.runs}/${item.scoreB.wickets}</td>
      <td>${new Date(item.date).toLocaleString()}</td>
    </tr>`;
  });
}

function renderTrophies() {
  const body = document.getElementById('trophiesBody');
  body.innerHTML = '';

  state.trophies.forEach((trophy) => {
    body.innerHTML += `<tr>
      <td>${trophy.teamName}</td>
      <td>${trophy.titles}</td>
      <td>${trophy.lastWinnerPlayer}</td>
      <td>${trophy.captain}</td>
    </tr>`;
  });
}

function bindActions() {
  document.getElementById('startSeasonBtn').addEventListener('click', async () => {
    await api('/api/season/start', { method: 'POST' });
    await refresh();
  });

  document.getElementById('resetSeasonBtn').addEventListener('click', async () => {
    if (!confirm('Reset season? This clears schedule, points and history.')) return;
    await api('/api/season/reset', { method: 'POST' });
    await refresh();
  });

  document.getElementById('saveUserModeBtn').addEventListener('click', () => {
    const teamId = Number(document.getElementById('userTeamSelect').value);
    const playerId = Number(document.getElementById('userPlayerSelect').value);

    if (!teamId || !playerId) {
      document.getElementById('userModeStatus').textContent = 'Select both team and player.';
      return;
    }

    localStorage.setItem('lplUserMode', JSON.stringify({ teamId, playerId }));
    document.getElementById('userModeStatus').textContent = `Saved: ${teamName(teamId)} - ${playerName(playerId)}`;
  });

  document.getElementById('userTeamSelect').addEventListener('change', () => {
    const teamId = Number(document.getElementById('userTeamSelect').value);
    const players = state.players.filter((p) => p.teamId === teamId);
    const playerSelect = document.getElementById('userPlayerSelect');
    playerSelect.innerHTML = '<option value="">Select User Player</option>' +
      players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  });

  document.getElementById('teamCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('newTeamName').value.trim();
    if (!name) return;
    await api('/api/teams', { method: 'POST', body: JSON.stringify({ name }) });
    event.target.reset();
    await refresh();
  });

  document.getElementById('playerCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('newPlayerName').value.trim(),
        role: document.getElementById('newPlayerRole').value.trim(),
        power: Number(document.getElementById('newPlayerPower').value),
        consistency: Number(document.getElementById('newPlayerConsistency').value),
        teamId: document.getElementById('newPlayerTeam').value || null
      })
    });

    event.target.reset();
    await refresh();
  });

  document.getElementById('completeSeasonForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    await api('/api/season/complete', {
      method: 'POST',
      body: JSON.stringify({
        playerOfLeague: document.getElementById('playerOfLeague').value.trim(),
        captain: document.getElementById('captainName').value.trim()
      })
    });

    event.target.reset();
    await refresh();
  });
}

async function refresh() {
  const data = await api('/api/bootstrap');
  state.teams = data.teams;
  state.players = data.players;
  state.season = data.season;
  state.trophies = data.trophies;

  fillTeamSelects();
  renderTeams();
  renderAuction();
  renderMatches();
  renderPoints();
  renderHistory();
  renderTrophies();

  const mode = userMode();
  if (mode.teamId) {
    document.getElementById('userTeamSelect').value = String(mode.teamId);
  }
  fillUserPlayers();

  if (mode.teamId && mode.playerId) {
    document.getElementById('userModeStatus').textContent = `Saved: ${teamName(Number(mode.teamId))} - ${playerName(Number(mode.playerId))}`;
  } else {
    document.getElementById('userModeStatus').textContent = 'No user mode saved.';
  }
}

(async function init() {
  try {
    bindTabs();
    bindActions();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
})();
