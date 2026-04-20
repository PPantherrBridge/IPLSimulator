const state = {
  teams: [],
  players: []
};

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function teamNameById(teamId) {
  const team = state.teams.find((item) => item.id === teamId);
  return team ? team.name : 'Auction Pool';
}

function updateTeamSelects() {
  const selects = [
    document.getElementById('playerTeamId'),
    document.getElementById('gameTeamSelect')
  ].filter(Boolean);

  selects.forEach((select, index) => {
    const firstOption = index === 0 ? '<option value="">Auction Pool</option>' : '<option value="">Select Team</option>';
    select.innerHTML = firstOption + state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  });
}

function renderTeams() {
  const container = document.getElementById('teamsGrid');
  const template = document.getElementById('teamCardTemplate');
  container.innerHTML = '';

  state.teams.forEach((team) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.name').textContent = team.name;
    node.querySelector('.members').textContent = `Players: ${team.playerIds.length}`;

    node.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      const name = prompt('New team name:', team.name);
      if (!name) return;
      await api(`/api/teams/${team.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      await refresh();
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Delete ${team.name}?`)) return;
      await api(`/api/teams/${team.id}`, { method: 'DELETE' });
      await refresh();
    });

    container.appendChild(node);
  });
}

function renderPlayers() {
  const container = document.getElementById('playersGrid');
  const template = document.getElementById('playerCardTemplate');
  container.innerHTML = '';

  state.players.forEach((player) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.name').textContent = player.name;
    node.querySelector('.meta').textContent = `${player.role} | P:${player.power} C:${player.consistency} | ${player.status}`;
    node.querySelector('.team').textContent = `Team: ${teamNameById(player.teamId)}`;

    node.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      const name = prompt('Player name:', player.name);
      if (!name) return;
      const role = prompt('Role:', player.role) || player.role;
      const power = Number(prompt('Power (1-100):', player.power));
      const consistency = Number(prompt('Consistency (1-100):', player.consistency));
      await api(`/api/players/${player.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, role, power, consistency })
      });
      await refresh();
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Delete ${player.name}?`)) return;
      await api(`/api/players/${player.id}`, { method: 'DELETE' });
      await refresh();
    });

    const releaseBtn = node.querySelector('[data-action="release"]');
    if (player.teamId) {
      releaseBtn.addEventListener('click', async () => {
        await api(`/api/teams/${player.teamId}/release-player`, {
          method: 'POST',
          body: JSON.stringify({ playerId: player.id })
        });
        await refresh();
      });
    } else {
      releaseBtn.disabled = true;
    }

    container.appendChild(node);
  });
}

function renderAuction() {
  const container = document.getElementById('auctionGrid');
  const template = document.getElementById('auctionCardTemplate');
  const pool = state.players.filter((player) => player.status === 'IN_AUCTION');
  container.innerHTML = '';

  pool.forEach((player) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.name').textContent = player.name;
    node.querySelector('.ratings').textContent = `P:${player.power} | C:${player.consistency}`;

    const currentTeam = player.currentBidTeamId ? teamNameById(player.currentBidTeamId) : 'No team';
    node.querySelector('.bid').textContent = `Current Bid: ${player.currentBid || 0} | Team: ${currentTeam}`;

    const teamSelect = node.querySelector('.bid-team');
    teamSelect.innerHTML = '<option value="">Select Team</option>' +
      state.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('');

    const bidInput = node.querySelector('.bid-amount');

    node.querySelector('[data-action="bid"]').addEventListener('click', async () => {
      if (!teamSelect.value || !bidInput.value) {
        alert('Select team and enter bid amount.');
        return;
      }

      await api('/api/auction/bid', {
        method: 'POST',
        body: JSON.stringify({
          playerId: player.id,
          teamId: Number(teamSelect.value),
          bid: Number(bidInput.value)
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

    container.appendChild(node);
  });

  if (!pool.length) {
    container.innerHTML = '<p class="muted">No players in auction pool.</p>';
  }
}

function bindForms() {
  const teamForm = document.getElementById('teamForm');
  teamForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('teamName').value.trim();
    if (!name) return;
    await api('/api/teams', { method: 'POST', body: JSON.stringify({ name }) });
    teamForm.reset();
    await refresh();
  });

  const playerForm = document.getElementById('playerForm');
  playerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById('playerName').value.trim(),
      role: document.getElementById('playerRole').value.trim(),
      power: Number(document.getElementById('playerPower').value),
      consistency: Number(document.getElementById('playerConsistency').value),
      teamId: document.getElementById('playerTeamId').value || null
    };

    await api('/api/players', { method: 'POST', body: JSON.stringify(payload) });
    playerForm.reset();
    await refresh();
  });

  const gameTeamSelect = document.getElementById('gameTeamSelect');
  const gamePlayerSelect = document.getElementById('gamePlayerSelect');
  const status = document.getElementById('gameStatus');

  gameTeamSelect.addEventListener('change', () => {
    const teamId = Number(gameTeamSelect.value);
    const teamPlayers = state.players.filter((player) => player.teamId === teamId);
    gamePlayerSelect.innerHTML = '<option value="">Select Player</option>' +
      teamPlayers.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  });

  document.getElementById('startGameBtn').addEventListener('click', () => {
    const teamId = Number(gameTeamSelect.value);
    const playerId = Number(gamePlayerSelect.value);
    if (!teamId || !playerId) {
      status.textContent = 'Select both team and player first.';
      return;
    }

    const team = state.teams.find((t) => t.id === teamId);
    const player = state.players.find((p) => p.id === playerId);

    localStorage.setItem('lplGameMode', JSON.stringify({
      teamId,
      teamName: team?.name,
      playerId,
      playerName: player?.name,
      selectedAt: new Date().toISOString()
    }));

    status.textContent = `Game mode saved: ${team?.name} → ${player?.name}`;
  });
}

async function refresh() {
  const [teams, players] = await Promise.all([
    api('/api/teams'),
    api('/api/players')
  ]);

  state.teams = teams;
  state.players = players;
  updateTeamSelects();
  renderTeams();
  renderPlayers();
  renderAuction();
}

(async function init() {
  try {
    bindForms();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
})();
