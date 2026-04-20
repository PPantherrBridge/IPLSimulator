const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const playersFile = path.join(dataDir, 'players.json');
const teamsFile = path.join(dataDir, 'teams.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getTeams() {
  return readJson(teamsFile, []);
}

function getPlayers() {
  return readJson(playersFile, []);
}

function saveTeams(teams) {
  writeJson(teamsFile, teams);
}

function savePlayers(players) {
  writeJson(playersFile, players);
}

function nextId(items) {
  return items.length ? Math.max(...items.map((x) => x.id)) + 1 : 1;
}

function emptyStats() {
  return {
    batting: { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0 },
    bowling: { balls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noballs: 0 },
    fielding: { catches: 0, runouts: 0, stumpings: 0 }
  };
}

function clampRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.min(100, Math.max(1, Math.round(num)));
}

function syncTeamPlayerReferences(teams, players) {
  const teamById = new Map(teams.map((team) => [team.id, team]));

  teams.forEach((team) => {
    team.playerIds = [];
  });

  players.forEach((player) => {
    if (player.teamId === null || player.teamId === undefined) {
      player.teamId = null;
      player.status = 'IN_AUCTION';
      return;
    }

    const team = teamById.get(player.teamId);
    if (!team) {
      player.teamId = null;
      player.status = 'IN_AUCTION';
      return;
    }

    player.status = 'IN_TEAM';
    team.playerIds.push(player.id);
  });
}

app.get('/api/teams', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  syncTeamPlayerReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(teams);
});

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const { name } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Team name is required.' });
  }

  const team = {
    id: nextId(teams),
    name: String(name).trim(),
    playerIds: []
  };

  teams.push(team);
  saveTeams(teams);
  return res.status(201).json(team);
});

app.put('/api/teams/:id', (req, res) => {
  const teams = getTeams();
  const id = Number(req.params.id);
  const team = teams.find((item) => item.id === id);

  if (!team) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Team name is required.' });
  }

  team.name = String(name).trim();
  saveTeams(teams);
  return res.json(team);
});

app.delete('/api/teams/:id', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const id = Number(req.params.id);

  const index = teams.findIndex((team) => team.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  players.forEach((player) => {
    if (player.teamId === id) {
      player.teamId = null;
      player.status = 'IN_AUCTION';
      player.currentBid = 0;
      player.currentBidTeamId = null;
    }
  });

  teams.splice(index, 1);
  syncTeamPlayerReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  return res.json({ success: true });
});

app.get('/api/players', (req, res) => {
  const players = getPlayers();
  res.json(players);
});

app.post('/api/players', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();

  const {
    name,
    role,
    teamId = null,
    power = 50,
    consistency = 50,
    stats = emptyStats()
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  const safeTeamId = teamId === null || teamId === '' ? null : Number(teamId);
  if (safeTeamId !== null && !teams.some((team) => team.id === safeTeamId)) {
    return res.status(400).json({ error: 'Invalid teamId.' });
  }

  const player = {
    id: nextId(players),
    name: String(name).trim(),
    teamId: safeTeamId,
    role: String(role || 'RHB').trim(),
    power: clampRating(power),
    consistency: clampRating(consistency),
    status: safeTeamId ? 'IN_TEAM' : 'IN_AUCTION',
    currentBid: 0,
    currentBidTeamId: null,
    stats: {
      batting: { ...emptyStats().batting, ...(stats?.batting || {}) },
      bowling: { ...emptyStats().bowling, ...(stats?.bowling || {}) },
      fielding: { ...emptyStats().fielding, ...(stats?.fielding || {}) }
    }
  };

  players.push(player);
  syncTeamPlayerReferences(teams, players);
  savePlayers(players);
  saveTeams(teams);

  return res.status(201).json(player);
});

app.put('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const id = Number(req.params.id);
  const player = players.find((item) => item.id === id);

  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  const updates = req.body;

  if (updates.name !== undefined) {
    if (!String(updates.name).trim()) {
      return res.status(400).json({ error: 'Player name cannot be empty.' });
    }
    player.name = String(updates.name).trim();
  }

  if (updates.role !== undefined) {
    player.role = String(updates.role).trim() || 'RHB';
  }

  if (updates.power !== undefined) {
    player.power = clampRating(updates.power);
  }

  if (updates.consistency !== undefined) {
    player.consistency = clampRating(updates.consistency);
  }

  if (updates.teamId !== undefined) {
    if (updates.teamId === null || updates.teamId === '') {
      player.teamId = null;
      player.status = 'IN_AUCTION';
    } else {
      const requestedTeamId = Number(updates.teamId);
      if (!teams.some((team) => team.id === requestedTeamId)) {
        return res.status(400).json({ error: 'Invalid teamId.' });
      }
      player.teamId = requestedTeamId;
      player.status = 'IN_TEAM';
    }
  }

  if (updates.stats) {
    player.stats = {
      batting: { ...emptyStats().batting, ...player.stats?.batting, ...(updates.stats.batting || {}) },
      bowling: { ...emptyStats().bowling, ...player.stats?.bowling, ...(updates.stats.bowling || {}) },
      fielding: { ...emptyStats().fielding, ...player.stats?.fielding, ...(updates.stats.fielding || {}) }
    };
  }

  syncTeamPlayerReferences(teams, players);
  savePlayers(players);
  saveTeams(teams);

  return res.json(player);
});

app.delete('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const id = Number(req.params.id);
  const index = players.findIndex((player) => player.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  players.splice(index, 1);
  syncTeamPlayerReferences(teams, players);
  savePlayers(players);
  saveTeams(teams);
  return res.json({ success: true });
});

app.post('/api/teams/:teamId/release-player', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.body.playerId);

  const team = teams.find((item) => item.id === teamId);
  const player = players.find((item) => item.id === playerId);

  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (player.teamId !== teamId) {
    return res.status(400).json({ error: 'Player does not belong to this team.' });
  }

  player.teamId = null;
  player.status = 'IN_AUCTION';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamPlayerReferences(teams, players);
  savePlayers(players);
  saveTeams(teams);
  return res.json({ success: true, player });
});

app.get('/api/auction/pool', (req, res) => {
  const players = getPlayers().filter((player) => player.status === 'IN_AUCTION');
  res.json(players);
});

app.post('/api/auction/bid', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const { playerId, teamId, bid } = req.body;

  const player = players.find((item) => item.id === Number(playerId));
  const team = teams.find((item) => item.id === Number(teamId));
  const safeBid = Number(bid);

  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (player.status !== 'IN_AUCTION') {
    return res.status(400).json({ error: 'Player is not in auction pool.' });
  }
  if (!Number.isFinite(safeBid) || safeBid <= (player.currentBid || 0)) {
    return res.status(400).json({ error: 'Bid must be higher than current bid.' });
  }

  player.currentBid = safeBid;
  player.currentBidTeamId = team.id;
  savePlayers(players);

  return res.json(player);
});

app.post('/api/auction/sold', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const { playerId } = req.body;
  const player = players.find((item) => item.id === Number(playerId));

  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (player.status !== 'IN_AUCTION') {
    return res.status(400).json({ error: 'Player is already in a team.' });
  }
  if (!player.currentBidTeamId) {
    return res.status(400).json({ error: 'No active bidder. Place a bid first.' });
  }

  const team = teams.find((item) => item.id === player.currentBidTeamId);
  if (!team) {
    return res.status(400).json({ error: 'Bid team does not exist.' });
  }

  player.teamId = team.id;
  player.status = 'IN_TEAM';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamPlayerReferences(teams, players);
  savePlayers(players);
  saveTeams(teams);

  return res.json(player);
});

app.listen(PORT, () => {
  ensureDataDir();
  console.log(`LPL Scorer running on port ${PORT}`);
});
