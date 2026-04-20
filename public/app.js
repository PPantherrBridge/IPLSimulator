const state = {
  teams: [],
  players: []
};

const $ = (sel) => document.querySelector(sel);

function setPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-tabs button').forEach((b) => b.classList.remove('active'));
  $(`#page-${name}`).classList.add('active');
  document.querySelector(`.nav-tabs button[data-page="${name}"]`).classList.add('active');
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function renderTeams() {
  const list = $('#teams-list');
  if (!state.teams.length) {
    list.innerHTML = '<p>No teams yet.</p>';
    return;
  }

  list.innerHTML = `
    <table>
      <thead><tr><th>Team</th><th>Budget</th><th>Squad Size</th></tr></thead>
      <tbody>
        ${state.teams
          .map((team) => `<tr><td>${team.name}</td><td>${team.budget}</td><td>${team.squad.length}</td></tr>`)
          .join('')}
      </tbody>
    </table>
  `;

  const teamOptions = state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  $('#team-a').innerHTML = teamOptions;
  $('#team-b').innerHTML = teamOptions;
}

function playerRow(player) {
  return `<tr>
      <td>${player.name}</td>
      <td>${player.role}</td>
      <td>${player.basePrice}</td>
      <td>${player.batting.aggression}/${player.batting.consistency}</td>
      <td>${player.bowling.economy}/${player.bowling.wicketTaking}</td>
      <td><button data-edit-player="${player.id}">Edit</button></td>
    </tr>`;
}

function renderPlayers() {
  const list = $('#players-list');
  if (!state.players.length) {
    list.innerHTML = '<p>No players yet.</p>';
    return;
  }

  list.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Base</th><th>Bat (A/C)</th><th>Bowl (E/W)</th><th>Action</th></tr></thead>
      <tbody>${state.players.map(playerRow).join('')}</tbody>
    </table>
    <p class="small">Click Edit to update key stats using quick prompts.</p>
  `;

  document.querySelectorAll('[data-edit-player]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.editPlayer);
      const p = state.players.find((x) => x.id === id);
      if (!p) return;

      const name = prompt('Name', p.name);
      if (!name) return;
      const aggression = Number(prompt('Batting aggression (0-10)', p.batting.aggression));
      const consistency = Number(prompt('Batting consistency (0-10)', p.batting.consistency));
      const economy = Number(prompt('Bowling economy (0-10)', p.bowling.economy));
      const wicketTaking = Number(prompt('Wicket taking (0-10)', p.bowling.wicketTaking));

      await api(`/api/players/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          batting: { aggression, consistency },
          bowling: { economy, wicketTaking }
        })
      });
      await refreshData();
    });
  });
}

async function refreshData() {
  state.teams = await api('/api/teams');
  state.players = await api('/api/players');
  renderTeams();
  renderPlayers();
}

document.querySelectorAll('.nav-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => setPage(btn.dataset.page));
});

$('#team-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await api('/api/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      budget: Number(form.get('budget'))
    })
  });
  e.target.reset();
  await refreshData();
});

$('#player-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await api('/api/players', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      role: form.get('role'),
      basePrice: Number(form.get('basePrice')),
      batting: {
        aggression: Number(form.get('aggression')),
        consistency: Number(form.get('consistency'))
      },
      bowling: {
        economy: Number(form.get('economy')),
        wicketTaking: Number(form.get('wicketTaking'))
      }
    })
  });
  e.target.reset();
  await refreshData();
});

$('#run-auction').addEventListener('click', async () => {
  const res = await api('/api/auction/simulate', { method: 'POST' });
  $('#auction-log').textContent = res.log.join('\n');
  state.teams = res.teams;
  renderTeams();
});

$('#run-match').addEventListener('click', async () => {
  const teamAId = Number($('#team-a').value);
  const teamBId = Number($('#team-b').value);
  if (!teamAId || !teamBId || teamAId === teamBId) {
    alert('Choose two different teams.');
    return;
  }

  const res = await api('/api/match/simulate', {
    method: 'POST',
    body: JSON.stringify({ teamAId, teamBId })
  });

  $('#match-result').innerHTML = `
    <h3>${res.resultText}</h3>
    <p>${res.innings1.team}: ${res.innings1.totalRuns}/${res.innings1.wickets} (${res.innings1.overs})</p>
    <p>${res.innings2.team}: ${res.innings2.totalRuns}/${res.innings2.wickets} (${res.innings2.overs})</p>
  `;
  $('#match-commentary').textContent = res.commentary.join('\n');
});

$('#run-league').addEventListener('click', async () => {
  const res = await api('/api/league/simulate', { method: 'POST' });
  $('#league-matches').textContent = res.matches.map((m) => `${m.teamA} vs ${m.teamB} -> ${m.result}`).join('\n');

  $('#points-table').innerHTML = `
    <table>
      <thead><tr><th>Team</th><th>M</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
      <tbody>
        ${res.table
          .map((r) => `<tr><td>${r.teamName}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.points}</td></tr>`)
          .join('')}
      </tbody>
    </table>
  `;
});

refreshData().catch((err) => {
  console.error(err);
  alert(err.message);
});
