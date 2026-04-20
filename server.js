const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const files = {
  teams: path.join(dataDir, 'teams.json'),
  players: path.join(dataDir, 'players.json'),
  initialTeams: path.join(dataDir, 'initial_teams.json'),
  initialPlayers: path.join(dataDir, 'initial_players.json'),
  season: path.join(dataDir, 'season.json'),
  trophies: path.join(dataDir, 'trophies.json')
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, fallback) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function emptyStats() {
  return {
    batting: { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0 },
    bowling: { balls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noballs: 0 },
    fielding: { catches: 0, runouts: 0, stumpings: 0 }
  };
}

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function getTeams() {
  return readJson(files.teams, []);
}

function getPlayers() {
  return readJson(files.players, []);
}

function getSeason() {
  return readJson(files.season, {
    started: false,
    completed: false,
    schedule: [],
    history: [],
    pointsTable: []
  });
}

function getTrophies() {
  return readJson(files.trophies, []);
}

function saveTeams(data) {
  writeJson(files.teams, data);
}

function savePlayers(data) {
  writeJson(files.players, data);
}

function saveSeason(data) {
  writeJson(files.season, data);
}

function saveTrophies(data) {
  writeJson(files.trophies, data);
}

function nextId(list) {
  return list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1;
}

function syncTeamReferences(teams, players) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  teams.forEach((t) => {
    t.playerIds = [];
    if (!t.matchesPlayedAgainst) t.matchesPlayedAgainst = {};
  });

  players.forEach((p) => {
    if (p.teamId == null) {
      p.teamId = null;
      p.status = 'IN_AUCTION';
      return;
    }

    const team = teamMap.get(p.teamId);
    if (!team) {
      p.teamId = null;
      p.status = 'IN_AUCTION';
      return;
    }

    p.status = 'IN_TEAM';
    team.playerIds.push(p.id);
  });
}

function createSchedule(teams) {
  const schedule = [];
  let id = 1;

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      schedule.push({
        id: id++,
        teamA: teams[i].id,
        teamB: teams[j].id,
        played: false,
        result: null
      });
    }
  }

  return schedule;
}

function defaultPointsTable(teams) {
  return teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    points: 0
  }));
}

function weightedRandomScore() {
  const r = Math.random();

  if (r < 0.55) return rand(120, 180);
  if (r < 0.88) return rand(181, 260);
  if (r < 0.96) return rand(261, 320);
  if (r < 0.988) return rand(321, 349);
  if (r < 0.998) return rand(350, 399);
  return 400;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function teamStrength(teamId, players) {
  const squad = players.filter((p) => p.teamId === teamId);
  if (!squad.length) return 50;

  const avgPower = squad.reduce((sum, p) => sum + p.power, 0) / squad.length;
  const avgConsistency = squad.reduce((sum, p) => sum + p.consistency, 0) / squad.length;
  return avgPower * 0.6 + avgConsistency * 0.4;
}

function buildInningsScore(strength) {
  const base = weightedRandomScore();
  const score = Math.min(400, Math.round(base + strength / 12));
  const wickets = rand(3, 10);
  const overs = wickets === 10 ? `${rand(12, 19)}.${rand(0, 5)}` : '20.0';

  return { runs: score, wickets, overs };
}

function getTeamName(teams, teamId) {
  return teams.find((t) => t.id === teamId)?.name || `Team ${teamId}`;
}

function recordMatchResult(match, winnerId, scoreA, scoreB) {
  const teams = getTeams();
  const season = getSeason();

  const pointsA = season.pointsTable.find((row) => row.teamId === match.teamA);
  const pointsB = season.pointsTable.find((row) => row.teamId === match.teamB);

  if (!pointsA || !pointsB) {
    return { error: 'Points table rows not found.' };
  }

  pointsA.matchesPlayed += 1;
  pointsB.matchesPlayed += 1;

  if (winnerId === match.teamA) {
    pointsA.wins += 1;
    pointsA.points += 2;
    pointsB.losses += 1;
  } else {
    pointsB.wins += 1;
    pointsB.points += 2;
    pointsA.losses += 1;
  }

  const teamAObj = teams.find((t) => t.id === match.teamA);
  const teamBObj = teams.find((t) => t.id === match.teamB);
  teamAObj.matchesPlayedAgainst[match.teamB] = (teamAObj.matchesPlayedAgainst[match.teamB] || 0) + 1;
  teamBObj.matchesPlayedAgainst[match.teamA] = (teamBObj.matchesPlayedAgainst[match.teamA] || 0) + 1;

  const seasonMatch = season.schedule.find((m) => m.id === match.id);
  seasonMatch.played = true;
  seasonMatch.result = {
    winner: winnerId,
    scoreA,
    scoreB
  };

  season.history.push({
    id: season.history.length ? Math.max(...season.history.map((x) => x.id)) + 1 : 1,
    teamA: match.teamA,
    teamB: match.teamB,
    winner: winnerId,
    scoreA,
    scoreB,
    date: new Date().toISOString()
  });

  saveTeams(teams);
  saveSeason(season);

  return { season, teams };
}

app.get('/api/bootstrap', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const season = getSeason();
  const trophies = getTrophies();

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);

  res.json({ teams, players, season, trophies });
});

app.post('/api/season/start', (req, res) => {
  const teams = getTeams();
  const season = {
    started: true,
    completed: false,
    schedule: createSchedule(teams),
    history: [],
    pointsTable: defaultPointsTable(teams)
  };

  teams.forEach((team) => {
    team.matchesPlayedAgainst = {};
  });

  saveTeams(teams);
  saveSeason(season);
  res.json(season);
});

app.post('/api/matches/:id/simulate', (req, res) => {
  const matchId = Number(req.params.id);
  const { userTeamId } = req.body;

  const season = getSeason();
  const match = season.schedule.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });
  if (Number(userTeamId) === match.teamA || Number(userTeamId) === match.teamB) {
    return res.status(400).json({ error: 'User team match must be entered manually.' });
  }

  const players = getPlayers();
  const strengthA = teamStrength(match.teamA, players);
  const strengthB = teamStrength(match.teamB, players);

  const scoreA = buildInningsScore(strengthA);
  const scoreB = buildInningsScore(strengthB);
  const winner = scoreA.runs >= scoreB.runs ? match.teamA : match.teamB;

  const recorded = recordMatchResult(match, winner, scoreA, scoreB);
  if (recorded.error) return res.status(400).json({ error: recorded.error });

  res.json({ matchId, winner, scoreA, scoreB });
});

app.post('/api/matches/:id/manual', (req, res) => {
  const matchId = Number(req.params.id);
  const { winner, scoreA, scoreB, playerStats } = req.body;

  const season = getSeason();
  const match = season.schedule.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });
  if (![match.teamA, match.teamB].includes(Number(winner))) {
    return res.status(400).json({ error: 'Winner must be one of the two teams.' });
  }

  const safeScoreA = {
    runs: Number(scoreA?.runs) || 0,
    wickets: Number(scoreA?.wickets) || 0,
    overs: String(scoreA?.overs || '20.0')
  };
  const safeScoreB = {
    runs: Number(scoreB?.runs) || 0,
    wickets: Number(scoreB?.wickets) || 0,
    overs: String(scoreB?.overs || '20.0')
  };

  const recorded = recordMatchResult(match, Number(winner), safeScoreA, safeScoreB);
  if (recorded.error) return res.status(400).json({ error: recorded.error });

  if (Array.isArray(playerStats) && playerStats.length) {
    const players = getPlayers();
    playerStats.forEach((entry) => {
      const player = players.find((p) => p.id === Number(entry.playerId));
      if (!player) return;

      if (entry.batting) {
        player.stats.batting.runs += Number(entry.batting.runs) || 0;
        player.stats.batting.balls += Number(entry.batting.balls) || 0;
        player.stats.batting.fours += Number(entry.batting.fours) || 0;
        player.stats.batting.sixes += Number(entry.batting.sixes) || 0;
        player.stats.batting.outs += Number(entry.batting.outs) || 0;
      }
    });
    savePlayers(players);
  }

  res.json({ matchId, winner: Number(winner), scoreA: safeScoreA, scoreB: safeScoreB });
});

app.post('/api/season/complete', (req, res) => {
  const { playerOfLeague, captain } = req.body;
  const season = getSeason();
  if (!season.started) return res.status(400).json({ error: 'Season not started.' });
  if (season.schedule.some((m) => !m.played)) {
    return res.status(400).json({ error: 'All matches must be completed first.' });
  }

  const sorted = [...season.pointsTable].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const champion = sorted[0];
  if (!champion) return res.status(400).json({ error: 'No champion found.' });

  const trophies = getTrophies();
  const existing = trophies.find((t) => t.teamName === champion.teamName);
  if (existing) {
    existing.titles += 1;
    existing.lastWinnerPlayer = String(playerOfLeague || 'Unknown');
    existing.captain = String(captain || 'Unknown');
  } else {
    trophies.push({
      teamName: champion.teamName,
      titles: 1,
      lastWinnerPlayer: String(playerOfLeague || 'Unknown'),
      captain: String(captain || 'Unknown')
    });
  }

  season.completed = true;
  saveSeason(season);
  saveTrophies(trophies);

  res.json({ champion, trophies });
});

app.post('/api/season/reset', (req, res) => {
  const initialTeams = readJson(files.initialTeams, []);
  const initialPlayers = readJson(files.initialPlayers, []);

  saveTeams(initialTeams);
  savePlayers(initialPlayers);
  saveSeason({
    started: false,
    completed: false,
    schedule: [],
    history: [],
    pointsTable: []
  });

  res.json({ success: true });
});

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Team name required.' });

  const team = {
    id: nextId(teams),
    name: String(name).trim(),
    playerIds: [],
    matchesPlayedAgainst: {}
  };
  teams.push(team);
  saveTeams(teams);
  res.status(201).json(team);
});

app.get('/api/teams', (req, res) => {
  const teams = getTeams();
  res.json(teams);
});

app.put('/api/teams/:id', (req, res) => {
  const teams = getTeams();
  const team = teams.find((t) => t.id === Number(req.params.id));
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!req.body.name || !String(req.body.name).trim()) return res.status(400).json({ error: 'Team name required.' });

  team.name = String(req.body.name).trim();
  saveTeams(teams);
  res.json(team);
});

app.delete('/api/teams/:id', (req, res) => {
  const id = Number(req.params.id);
  const teams = getTeams();
  const players = getPlayers();
  const index = teams.findIndex((t) => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Team not found.' });

  players.forEach((p) => {
    if (p.teamId === id) {
      p.teamId = null;
      p.status = 'IN_AUCTION';
      p.currentBid = 0;
      p.currentBidTeamId = null;
    }
  });

  teams.splice(index, 1);
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json({ success: true });
});

app.post('/api/players', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const { name, role, power, consistency, teamId = null } = req.body;

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Player name required.' });
  if (teamId !== null && teamId !== '' && !teams.some((t) => t.id === Number(teamId))) {
    return res.status(400).json({ error: 'Invalid team.' });
  }

  const player = {
    id: nextId(players),
    name: String(name).trim(),
    teamId: teamId === null || teamId === '' ? null : Number(teamId),
    role: String(role || 'RHB').trim(),
    power: clampRating(power),
    consistency: clampRating(consistency),
    status: teamId === null || teamId === '' ? 'IN_AUCTION' : 'IN_TEAM',
    currentBid: 0,
    currentBidTeamId: null,
    stats: emptyStats()
  };

  players.push(player);
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.status(201).json(player);
});

app.get('/api/players', (req, res) => {
  const players = getPlayers();
  res.json(players);
});

app.put('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const player = players.find((p) => p.id === Number(req.params.id));
  if (!player) return res.status(404).json({ error: 'Player not found.' });

  if (req.body.name !== undefined) player.name = String(req.body.name).trim();
  if (req.body.role !== undefined) player.role = String(req.body.role).trim();
  if (req.body.power !== undefined) player.power = clampRating(req.body.power);
  if (req.body.consistency !== undefined) player.consistency = clampRating(req.body.consistency);

  if (req.body.teamId !== undefined) {
    if (req.body.teamId === null || req.body.teamId === '') {
      player.teamId = null;
      player.status = 'IN_AUCTION';
      player.currentBid = 0;
      player.currentBidTeamId = null;
    } else {
      const teamId = Number(req.body.teamId);
      if (!teams.some((t) => t.id === teamId)) return res.status(400).json({ error: 'Invalid team.' });
      player.teamId = teamId;
      player.status = 'IN_TEAM';
    }
  }

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(player);
});

app.delete('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const index = players.findIndex((p) => p.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Player not found.' });

  players.splice(index, 1);
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json({ success: true });
});

app.post('/api/teams/:teamId/release-player', (req, res) => {
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.body.playerId);
  const teams = getTeams();
  const players = getPlayers();

  const player = players.find((p) => p.id === playerId);
  if (!player || player.teamId !== teamId) return res.status(400).json({ error: 'Player not in this team.' });

  player.teamId = null;
  player.status = 'IN_AUCTION';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(player);
});

app.post('/api/auction/bid', (req, res) => {
  const { playerId, teamId, bid } = req.body;
  const players = getPlayers();
  const teams = getTeams();

  const player = players.find((p) => p.id === Number(playerId));
  const team = teams.find((t) => t.id === Number(teamId));
  const safeBid = Number(bid);

  if (!player || !team) return res.status(404).json({ error: 'Player or team not found.' });
  if (player.status !== 'IN_AUCTION') return res.status(400).json({ error: 'Player not in auction.' });
  if (!Number.isFinite(safeBid) || safeBid <= player.currentBid) return res.status(400).json({ error: 'Bid too low.' });

  player.currentBid = safeBid;
  player.currentBidTeamId = team.id;
  savePlayers(players);
  res.json(player);
});

app.post('/api/auction/sold', (req, res) => {
  const { playerId } = req.body;
  const players = getPlayers();
  const teams = getTeams();
  const player = players.find((p) => p.id === Number(playerId));

  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (!player.currentBidTeamId) return res.status(400).json({ error: 'No active bid.' });

  player.teamId = player.currentBidTeamId;
  player.status = 'IN_TEAM';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(player);
});

app.listen(PORT, () => {
  console.log(`LPL Scorer listening on ${PORT}`);
});
