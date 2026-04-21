const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const files = {
  teams: path.join(dataDir, 'teams.json'),
  players: path.join(dataDir, 'players.json'),
  season: path.join(dataDir, 'season.json'),
  trophies: path.join(dataDir, 'trophies.json')
};

const DEFAULT_PURSE = 10000000;
const VALID_ROLES = ['Batter', 'Bowler', 'All-Rounder', 'Wicketkeeper'];
const VALID_BATTING_STYLES = ['LHB', 'RHB'];

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

function nextId(list) {
  return list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1;
}

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function clampInt(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseOvers(overs) {
  if (typeof overs === 'number' && Number.isFinite(overs)) return Math.max(0.1, overs);
  const safe = String(overs || '20.0').trim();
  const [wholeRaw, ballsRaw = '0'] = safe.split('.');
  const whole = Math.max(0, Number(wholeRaw) || 0);
  const balls = Math.max(0, Math.min(5, Number(ballsRaw) || 0));
  return Math.max(0.1, whole + balls / 6);
}

function toOversString(oversFloat) {
  const whole = Math.floor(oversFloat);
  const balls = Math.round((oversFloat - whole) * 6);
  return `${whole}.${balls}`;
}

function formatRole(player) {
  const bowling = player.bowlingType ? ` (${player.bowlingType})` : '';
  return `${player.battingStyle} - ${player.role}${bowling}`;
}

function defaultTeam(name = 'Unnamed Team') {
  return { id: 0, name, purse: DEFAULT_PURSE, playerIds: [] };
}

function defaultPlayer(name = 'Unnamed') {
  return {
    id: 0,
    name,
    teamId: null,
    battingStyle: 'RHB',
    role: 'Batter',
    bowlingType: null,
    power: 50,
    consistency: 50,
    status: 'IN_AUCTION',
    currentBid: 0,
    currentBidTeamId: null,
    stats: { battingRuns: 0, battingBalls: 0, wickets: 0, matches: 0 }
  };
}

function defaultSeason() {
  return {
    started: false,
    completed: false,
    auction: { active: false },
    schedule: [],
    history: [],
    pointsTable: []
  };
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRunsBase() {
  const r = Math.random();
  if (r < 0.35) return rand(120, 170);
  if (r < 0.75) return rand(171, 230);
  if (r < 0.93) return rand(231, 300);
  if (r < 0.99) return rand(301, 360);
  return rand(361, 400);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeTeam(team) {
  return {
    ...defaultTeam(team.name),
    ...team,
    purse: Number.isFinite(Number(team.purse)) ? Number(team.purse) : DEFAULT_PURSE,
    playerIds: Array.isArray(team.playerIds) ? team.playerIds : []
  };
}

function normalizePlayer(player) {
  const roleGuess = VALID_ROLES.includes(player.role) ? player.role : (player.role === 'LHB' || player.role === 'RHB' ? 'Batter' : 'All-Rounder');
  const styleGuess = VALID_BATTING_STYLES.includes(player.battingStyle)
    ? player.battingStyle
    : (player.role === 'LHB' ? 'LHB' : 'RHB');

  return {
    ...defaultPlayer(player.name),
    ...player,
    battingStyle: styleGuess,
    role: roleGuess,
    bowlingType: player.bowlingType || null,
    power: clampRating(player.power),
    consistency: clampRating(player.consistency),
    stats: {
      battingRuns: Number(player.stats?.battingRuns || player.stats?.batting?.runs || 0),
      battingBalls: Number(player.stats?.battingBalls || player.stats?.batting?.balls || 0),
      wickets: Number(player.stats?.wickets || player.stats?.bowling?.wickets || 0),
      matches: Number(player.stats?.matches || 0)
    }
  };
}

function getTeams() {
  return readJson(files.teams, []).map(normalizeTeam);
}
function saveTeams(teams) { writeJson(files.teams, teams.map(normalizeTeam)); }

function getPlayers() {
  return readJson(files.players, []).map(normalizePlayer);
}
function savePlayers(players) { writeJson(files.players, players.map(normalizePlayer)); }

function getSeason() {
  return { ...defaultSeason(), ...readJson(files.season, defaultSeason()) };
}
function saveSeason(season) { writeJson(files.season, { ...defaultSeason(), ...season }); }

function getTrophies() { return readJson(files.trophies, []); }
function saveTrophies(trophies) { writeJson(files.trophies, trophies); }

function syncTeamReferences(teams, players) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  teams.forEach((t) => { t.playerIds = []; });
  players.forEach((p) => {
    if (p.teamId == null || !teamMap.has(p.teamId)) {
      p.teamId = null;
      p.status = 'IN_AUCTION';
      return;
    }
    p.status = 'IN_TEAM';
    teamMap.get(p.teamId).playerIds.push(p.id);
  });
}

function createPointsTable(teams) {
  return teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    points: 0,
    runsScored: 0,
    oversFaced: 0,
    runsConceded: 0,
    oversBowled: 0,
    nrr: 0
  }));
}

function updateNrr(row) {
  const forRate = row.oversFaced > 0 ? row.runsScored / row.oversFaced : 0;
  const againstRate = row.oversBowled > 0 ? row.runsConceded / row.oversBowled : 0;
  row.nrr = Number((forRate - againstRate).toFixed(3));
}

function createSchedule(teams) {
  const matches = [];
  let id = 1;
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      matches.push({
        id: id++,
        teamA: teams[i].id,
        teamB: teams[j].id,
        played: false,
        result: null
      });
    }
  }
  return shuffle(matches);
}

function teamStrength(teamId, players) {
  const squad = players.filter((p) => p.teamId === teamId);
  if (!squad.length) return 50;
  return squad.reduce((acc, p) => acc + p.power * 0.65 + p.consistency * 0.35, 0) / squad.length;
}

function pickPlayingXi(teamId, players) {
  const squad = shuffle(players.filter((p) => p.teamId === teamId));
  return squad.slice(0, Math.min(11, squad.length));
}

function simulateInnings({ battingTeamId, bowlingTeamId, players, target }) {
  const battingStrength = teamStrength(battingTeamId, players);
  const bowlingStrength = teamStrength(bowlingTeamId, players);
  const base = weightedRunsBase();
  const balance = (battingStrength - bowlingStrength) * 0.85;
  let runs = clampInt(base + balance, 120, 400, 150);

  const wickets = clampInt(10 - (battingStrength / 18) + rand(-2, 3), 2, 10, 6);
  let overs = wickets === 10 ? (rand(12, 19) + rand(0, 5) / 10) : 20;

  if (target != null) {
    if (Math.random() < 0.52) {
      runs = clampInt(rand(Math.max(120, target + 1), Math.min(400, target + 35)), target + 1, 400, target + 1);
      overs = Number((rand(14, 19) + rand(0, 5) / 10).toFixed(1));
    } else {
      runs = clampInt(rand(Math.max(80, target - 45), Math.max(90, target - 1)), 80, target - 1, target - 5);
      overs = 20;
    }
  }

  const batters = pickPlayingXi(battingTeamId, players);
  const bowlers = pickPlayingXi(bowlingTeamId, players).filter((p) => p.role === 'Bowler' || p.role === 'All-Rounder');
  const battingStats = [];
  const bowlingStats = [];

  let ballsRemaining = Math.round(parseOvers(toOversString(overs)) * 6);
  let runsRemaining = runs;
  const battingWeights = batters.map((p) => p.power * 0.7 + p.consistency * 0.3 + (p.role === 'Wicketkeeper' ? 5 : 0));
  const totalBatWeight = battingWeights.reduce((a, b) => a + b, 0) || 1;

  batters.forEach((player, idx) => {
    const share = battingWeights[idx] / totalBatWeight;
    const pruns = idx === batters.length - 1 ? Math.max(0, runsRemaining) : Math.max(0, Math.round(runs * share + rand(-8, 8)));
    const balls = Math.max(1, Math.round((pruns * (100 - player.consistency) * 0.03) + (pruns / 1.2) + rand(0, 8)));

    runsRemaining -= pruns;
    ballsRemaining = Math.max(0, ballsRemaining - balls);

    battingStats.push({
      playerId: player.id,
      name: player.name,
      runs: pruns,
      balls
    });
  });

  const wicketPool = bowlers.length ? bowlers : pickPlayingXi(bowlingTeamId, players);
  const bowlWeights = wicketPool.map((p) => (p.role === 'Bowler' ? 1.2 : 1) * (p.power * 0.55 + p.consistency * 0.45));
  const totalBowlWeight = bowlWeights.reduce((a, b) => a + b, 0) || 1;
  let wicketsRemaining = wickets;

  wicketPool.forEach((player, idx) => {
    const baseWickets = Math.floor((wickets * bowlWeights[idx]) / totalBowlWeight);
    const pw = idx === wicketPool.length - 1 ? wicketsRemaining : Math.max(0, baseWickets + rand(0, 1));
    wicketsRemaining = Math.max(0, wicketsRemaining - pw);
    bowlingStats.push({
      playerId: player.id,
      name: player.name,
      wickets: pw
    });
  });

  return {
    runs,
    wickets,
    overs: toOversString(parseOvers(toOversString(overs))),
    battingTop: battingStats.sort((a, b) => b.runs - a.runs).slice(0, 3),
    bowlingTop: bowlingStats.sort((a, b) => b.wickets - a.wickets).slice(0, 3),
    battingStats,
    bowlingStats
  };
}

function applyPlayerStats(players, inningsA, inningsB) {
  const map = new Map(players.map((p) => [p.id, p]));
  [inningsA, inningsB].forEach((inn) => {
    inn.battingStats.forEach((s) => {
      const p = map.get(s.playerId);
      if (!p) return;
      p.stats.battingRuns += s.runs;
      p.stats.battingBalls += s.balls;
      p.stats.matches += 1;
    });
    inn.bowlingStats.forEach((s) => {
      const p = map.get(s.playerId);
      if (!p) return;
      p.stats.wickets += s.wickets;
    });
  });
}

function recordResult(match, scoreA, scoreB, topA, topB) {
  const season = getSeason();
  const teams = getTeams();
  const winner = scoreB.runs > scoreA.runs ? match.teamB : match.teamA;
  const pointsA = season.pointsTable.find((r) => r.teamId === match.teamA);
  const pointsB = season.pointsTable.find((r) => r.teamId === match.teamB);

  [pointsA, pointsB].forEach((r) => { r.matchesPlayed += 1; });
  if (winner === match.teamA) {
    pointsA.wins += 1; pointsA.points += 2; pointsB.losses += 1;
  } else {
    pointsB.wins += 1; pointsB.points += 2; pointsA.losses += 1;
  }

  pointsA.runsScored += scoreA.runs;
  pointsA.oversFaced += parseOvers(scoreA.overs);
  pointsA.runsConceded += scoreB.runs;
  pointsA.oversBowled += parseOvers(scoreB.overs);

  pointsB.runsScored += scoreB.runs;
  pointsB.oversFaced += parseOvers(scoreB.overs);
  pointsB.runsConceded += scoreA.runs;
  pointsB.oversBowled += parseOvers(scoreA.overs);

  updateNrr(pointsA);
  updateNrr(pointsB);

  const seasonMatch = season.schedule.find((m) => m.id === match.id);
  seasonMatch.played = true;
  seasonMatch.result = {
    winner,
    scoreA,
    scoreB,
    topBatters: [...topA.battingTop, ...topB.battingTop].sort((a, b) => b.runs - a.runs).slice(0, 3),
    topBowlers: [...topA.bowlingTop, ...topB.bowlingTop].sort((a, b) => b.wickets - a.wickets).slice(0, 3)
  };

  season.history.push({
    id: season.history.length ? Math.max(...season.history.map((x) => x.id)) + 1 : 1,
    matchId: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    winner,
    scoreA,
    scoreB,
    topBatters: seasonMatch.result.topBatters,
    topBowlers: seasonMatch.result.topBowlers,
    date: new Date().toISOString()
  });

  saveSeason(season);
  saveTeams(teams);
  return seasonMatch;
}

app.get('/api/bootstrap', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const season = getSeason();
  const trophies = getTrophies();

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);

  res.json({ teams, players, season, trophies, config: { defaultPurse: DEFAULT_PURSE } });
});

app.post('/api/season/start', (req, res) => {
  const teams = getTeams();
  if (teams.length < 2) return res.status(400).json({ error: 'Need at least 2 teams.' });

  const season = {
    ...defaultSeason(),
    started: true,
    schedule: createSchedule(teams),
    pointsTable: createPointsTable(teams)
  };

  saveSeason(season);
  res.json(season);
});

app.post('/api/season/reset', (req, res) => {
  const season = getSeason();
  season.started = false;
  season.completed = false;
  season.schedule = [];
  season.history = [];
  season.pointsTable = [];
  saveSeason(season);
  res.json({ success: true, message: 'Season reset complete. Teams and auction data retained.' });
});

app.post('/api/season/complete', (req, res) => {
  const { playerOfLeague, captain } = req.body;
  const season = getSeason();
  if (!season.started) return res.status(400).json({ error: 'Season not started.' });
  if (season.schedule.some((m) => !m.played)) return res.status(400).json({ error: 'Complete all matches first.' });

  const sorted = [...season.pointsTable].sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.wins - a.wins);
  const champion = sorted[0];
  if (!champion) return res.status(400).json({ error: 'No champion found.' });

  const trophies = getTrophies();
  const existing = trophies.find((t) => t.teamName === champion.teamName);
  if (existing) {
    existing.titles += 1;
    existing.lastWinnerPlayer = String(playerOfLeague || 'Unknown');
    existing.captain = String(captain || 'Unknown');
  } else {
    trophies.push({ teamName: champion.teamName, titles: 1, lastWinnerPlayer: String(playerOfLeague || 'Unknown'), captain: String(captain || 'Unknown') });
  }

  season.completed = true;
  saveSeason(season);
  saveTrophies(trophies);

  res.json({ champion, trophies });
});

app.post('/api/matches/:id/simulate', (req, res) => {
  const matchId = Number(req.params.id);
  const { userTeamId } = req.body;
  const season = getSeason();
  const players = getPlayers();
  const match = season.schedule.find((m) => m.id === matchId);

  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });
  if (Number(userTeamId) === match.teamA || Number(userTeamId) === match.teamB) {
    return res.status(400).json({ error: 'User team match must be entered manually.' });
  }

  const inningsA = simulateInnings({ battingTeamId: match.teamA, bowlingTeamId: match.teamB, players });
  const inningsB = simulateInnings({ battingTeamId: match.teamB, bowlingTeamId: match.teamA, players, target: inningsA.runs });

  applyPlayerStats(players, inningsA, inningsB);
  savePlayers(players);

  const result = recordResult(match, { runs: inningsA.runs, wickets: inningsA.wickets, overs: inningsA.overs }, { runs: inningsB.runs, wickets: inningsB.wickets, overs: inningsB.overs }, inningsA, inningsB);
  res.json(result);
});

app.post('/api/matches/:id/manual', (req, res) => {
  const matchId = Number(req.params.id);
  const { scoreA, scoreB, winnerOverride } = req.body;

  const season = getSeason();
  const match = season.schedule.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });

  const safeA = {
    runs: clampInt(scoreA?.runs, 0, 500, 0),
    wickets: clampInt(scoreA?.wickets, 0, 10, 0),
    overs: String(scoreA?.overs || '20.0')
  };
  const safeB = {
    runs: clampInt(scoreB?.runs, 0, 500, 0),
    wickets: clampInt(scoreB?.wickets, 0, 10, 0),
    overs: String(scoreB?.overs || '20.0')
  };

  let winner = safeB.runs > safeA.runs ? match.teamB : match.teamA;
  if ([match.teamA, match.teamB].includes(Number(winnerOverride))) {
    winner = Number(winnerOverride);
  }

  // ensure chase logic is always consistent with scoreboard when no override
  if (!winnerOverride) {
    winner = safeB.runs > safeA.runs ? match.teamB : match.teamA;
  }

  const mockA = { battingTop: [], bowlingTop: [] };
  const mockB = { battingTop: [], bowlingTop: [] };
  const recorded = recordResult(match, safeA, safeB, mockA, mockB);
  recorded.result.winner = winner;

  const s = getSeason();
  const seasonMatch = s.schedule.find((m) => m.id === match.id);
  seasonMatch.result.winner = winner;
  const hist = s.history.find((h) => h.matchId === match.id);
  if (hist) hist.winner = winner;
  saveSeason(s);

  res.json(seasonMatch);
});

app.post('/api/auction/start', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const season = getSeason();
  const auctionPool = players.filter((p) => p.status === 'IN_AUCTION');

  if (auctionPool.length < teams.length) {
    return res.status(400).json({ error: `Auction needs at least ${teams.length} players in pool.` });
  }

  season.auction = { active: true };
  saveSeason(season);
  res.json({ success: true, auctionPool: auctionPool.length });
});

app.post('/api/auction/bid', (req, res) => {
  const { playerId, teamId, bid } = req.body;
  const players = getPlayers();
  const teams = getTeams();
  const season = getSeason();

  if (!season.auction?.active) return res.status(400).json({ error: 'Auction is not active.' });

  const player = players.find((p) => p.id === Number(playerId));
  const team = teams.find((t) => t.id === Number(teamId));
  const safeBid = Number(bid);

  if (!player || !team) return res.status(404).json({ error: 'Player or team not found.' });
  if (player.status !== 'IN_AUCTION') return res.status(400).json({ error: 'Player not in auction pool.' });
  if (!Number.isFinite(safeBid) || safeBid <= player.currentBid) return res.status(400).json({ error: 'Bid must be higher than current bid.' });
  if (safeBid > team.purse) return res.status(400).json({ error: 'Bid exceeds team purse.' });

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
  if (player.status !== 'IN_AUCTION' || !player.currentBidTeamId) return res.status(400).json({ error: 'Player has no winning bid.' });

  const buyer = teams.find((t) => t.id === player.currentBidTeamId);
  if (!buyer) return res.status(400).json({ error: 'Invalid buyer team.' });
  if (player.currentBid > buyer.purse) return res.status(400).json({ error: 'Buyer purse is insufficient.' });

  buyer.purse -= player.currentBid;
  player.teamId = buyer.id;
  player.status = 'IN_TEAM';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json({ player, buyerPurse: buyer.purse });
});

app.post('/api/teams/:teamId/release-player', (req, res) => {
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.body.playerId);
  const players = getPlayers();
  const teams = getTeams();

  const player = players.find((p) => p.id === playerId);
  if (!player || player.teamId !== teamId) return res.status(400).json({ error: 'Player not found in this team.' });

  player.teamId = null;
  player.status = 'IN_AUCTION';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(player);
});

app.get('/api/teams', (req, res) => res.json(getTeams()));
app.get('/api/players', (req, res) => res.json(getPlayers()));

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const name = String(req.body.name || '').trim();
  const purse = Number(req.body.purse);
  if (!name) return res.status(400).json({ error: 'Team name required.' });

  const team = { id: nextId(teams), name, purse: Number.isFinite(purse) ? purse : DEFAULT_PURSE, playerIds: [] };
  teams.push(team);
  saveTeams(teams);
  res.status(201).json(team);
});

app.post('/api/players', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const body = req.body || {};

  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Player name required.' });

  const teamId = body.teamId === null || body.teamId === '' ? null : Number(body.teamId);
  if (teamId !== null && !teams.some((t) => t.id === teamId)) return res.status(400).json({ error: 'Invalid team selected.' });

  const player = {
    id: nextId(players),
    name,
    teamId,
    battingStyle: VALID_BATTING_STYLES.includes(body.battingStyle) ? body.battingStyle : 'RHB',
    role: VALID_ROLES.includes(body.role) ? body.role : 'Batter',
    bowlingType: body.bowlingType ? String(body.bowlingType).trim() : null,
    power: clampRating(body.power),
    consistency: clampRating(body.consistency),
    status: teamId == null ? 'IN_AUCTION' : 'IN_TEAM',
    currentBid: 0,
    currentBidTeamId: null,
    stats: { battingRuns: 0, battingBalls: 0, wickets: 0, matches: 0 }
  };

  players.push(player);
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.status(201).json(player);
});

app.listen(PORT, () => {
  console.log(`LPL Scorer listening on ${PORT}`);
});
