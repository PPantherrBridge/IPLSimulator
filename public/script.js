async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function parsePlayers(input) {
  return input
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function renderMatch(match) {
  const teamsTitle = document.getElementById('teamsTitle');
  const scoreLine = document.getElementById('scoreLine');
  const oversLine = document.getElementById('oversLine');
  const extrasLine = document.getElementById('extrasLine');
  const battingTableBody = document.getElementById('battingTableBody');
  const bowlingTableBody = document.getElementById('bowlingTableBody');
  const eventsList = document.getElementById('eventsList');

  if (!teamsTitle) {
    return;
  }

  teamsTitle.textContent = `${match.teamA.name || 'Team A'} vs ${match.teamB.name || 'Team B'}`;
  scoreLine.textContent = `${match.score.runs}/${match.score.wickets}`;
  oversLine.textContent = `Overs: ${match.score.overs}`;
  extrasLine.textContent = `Extras: ${match.score.extras}`;

  battingTableBody.innerHTML = match.batters
    .map((batter, index) => {
      const activeMarker = index === match.striker?.index ? '*' : '';
      return `<tr>
        <td>${batter.name}${activeMarker}</td>
        <td>${batter.runs}</td>
        <td>${batter.balls}</td>
        <td>${batter.strikeRate.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  bowlingTableBody.innerHTML = match.bowlers
    .map((bowler, index) => {
      const marker = index === match.currentBowler?.index ? ' (Current)' : '';
      return `<tr>
        <td>${bowler.name}${marker}</td>
        <td>${bowler.overs}</td>
        <td>${bowler.runsConceded}</td>
        <td>${bowler.wickets}</td>
        <td>${bowler.economy.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  eventsList.innerHTML = [...match.events].reverse().slice(0, 12).map((event) => `<li>${event}</li>`).join('');
}

async function initializeHomePage() {
  const form = document.getElementById('createMatchForm');
  if (!form) return;

  const status = document.getElementById('status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      teamAName: document.getElementById('teamAName').value.trim(),
      teamBName: document.getElementById('teamBName').value.trim(),
      teamAPlayers: parsePlayers(document.getElementById('teamAPlayers').value),
      teamBPlayers: parsePlayers(document.getElementById('teamBPlayers').value)
    };

    try {
      await apiRequest('/create-match', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      status.textContent = 'Match created. Redirecting to match page...';
      window.location.href = '/match.html';
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function initializeMatchPage() {
  const scoreLine = document.getElementById('scoreLine');
  if (!scoreLine) return;

  async function loadMatch() {
    try {
      const match = await apiRequest('/match');

      match.striker = {
        ...match.striker,
        index: match.batters.findIndex((item) => item.name === match.striker?.name)
      };
      match.currentBowler = {
        ...match.currentBowler,
        index: match.bowlers.findIndex((item) => item.name === match.currentBowler?.name)
      };

      renderMatch(match);
    } catch (error) {
      alert(error.message);
    }
  }

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest('/update-score', {
          method: 'POST',
          body: JSON.stringify({ action: button.dataset.action })
        });
        await loadMatch();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  await loadMatch();
}

initializeHomePage();
initializeMatchPage();
