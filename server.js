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
const AUCTION_INCREMENT = 100000;
const AUCTION_TIMER_SECONDS = 10;
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

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clampRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.round(n)));
}
function clampInt(v, min, max, fallback = min) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function parseOvers(overs) {
  const safe = String(overs || '0.0');
  const [o, b = '0'] = safe.split('.');
  const balls = Math.max(0, Math.min(5, Number(b) || 0));
  return Math.max(0, (Number(o) || 0) + balls / 6);
}
function oversFromBalls(balls) {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}
function ballsFromOversString(overs) {
  const [o, b = '0'] = String(overs || '0.0').split('.');
  return (Number(o) || 0) * 6 + Math.max(0, Math.min(5, Number(b) || 0));
}

function defaultTeam(name = 'Team') {
  return { id: 0, name, purse: DEFAULT_PURSE, playerIds: [], playingXI: [], bench: [] };
}
function defaultPlayer(name = 'Player') {
  return {
    id: 0,
    name,
    teamId: null,
    battingStyle: 'RHB',
    role: 'Batter',
    bowlingType: null,
    power: 50,
    consistency: 50,
    basePrice: 200000,
    status: 'IN_AUCTION',
    currentBid: 0,
    currentBidTeamId: null,
    stats: {
      season: {
        totalRuns: 0,
        totalBalls: 0,
        wickets: 0,
        runsGiven: 0,
        ballsBowled: 0,
        matches: 0
      }
    }
  };
}
function defaultSeason() {
  return {
    started: false,
    completed: false,
    auction: {
      status: 'NOT_STARTED',
      queue: [],
      currentIndex: 0,
      currentPlayerId: null,
      currentBid: 0,
      currentTeam: null,
      timer: AUCTION_TIMER_SECONDS,
      increment: AUCTION_INCREMENT,
      bidHistory: []
    },
    schedule: [],
    history: [],
    scorecards: [],
    pointsTable: [],
    awards: null
  };
}

function normalizeTeam(team) {
  return {
    ...defaultTeam(team.name),
    ...team,
    purse: Number.isFinite(Number(team.purse)) ? Number(team.purse) : DEFAULT_PURSE,
    playerIds: Array.isArray(team.playerIds) ? team.playerIds : [],
    playingXI: Array.isArray(team.playingXI) ? team.playingXI : [],
    bench: Array.isArray(team.bench) ? team.bench : []
  };
}
function normalizePlayer(player) {
  const role = VALID_ROLES.includes(player.role) ? player.role : (player.role === 'LHB' || player.role === 'RHB' ? 'Batter' : 'All-Rounder');
  const battingStyle = VALID_BATTING_STYLES.includes(player.battingStyle) ? player.battingStyle : (player.role === 'LHB' ? 'LHB' : 'RHB');
  return {
    ...defaultPlayer(player.name),
    ...player,
    battingStyle,
    role,
    bowlingType: player.bowlingType || null,
    power: clampRating(player.power),
    consistency: clampRating(player.consistency),
    basePrice: Number(player.basePrice) > 0 ? Number(player.basePrice) : 200000,
    stats: {
      season: {
        totalRuns: Number(player.stats?.season?.totalRuns || player.stats?.battingRuns || player.stats?.batting?.runs || 0),
        totalBalls: Number(player.stats?.season?.totalBalls || player.stats?.battingBalls || player.stats?.batting?.balls || 0),
        wickets: Number(player.stats?.season?.wickets || player.stats?.wickets || player.stats?.bowling?.wickets || 0),
        runsGiven: Number(player.stats?.season?.runsGiven || 0),
        ballsBowled: Number(player.stats?.season?.ballsBowled || 0),
        matches: Number(player.stats?.season?.matches || 0)
      }
    }
  };
}

function getTeams() { return readJson(files.teams, []).map(normalizeTeam); }
function saveTeams(teams) { writeJson(files.teams, teams.map(normalizeTeam)); }
function getPlayers() { return readJson(files.players, []).map(normalizePlayer); }
function savePlayers(players) { writeJson(files.players, players.map(normalizePlayer)); }
function getSeason() { return { ...defaultSeason(), ...readJson(files.season, defaultSeason()) }; }
function saveSeason(season) { writeJson(files.season, { ...defaultSeason(), ...season }); }
function getTrophies() { return readJson(files.trophies, []); }
function saveTrophies(trophies) { writeJson(files.trophies, trophies); }

function syncTeamReferences(teams, players) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  teams.forEach((team) => { team.playerIds = []; });

  players.forEach((p) => {
    const team = teamMap.get(p.teamId);
    if (!team) {
      p.teamId = null;
      p.status = 'IN_AUCTION';
      return;
    }
    p.status = 'IN_TEAM';
    team.playerIds.push(p.id);
  });

  teams.forEach((team) => {
    const ids = new Set(team.playerIds);
    team.playingXI = team.playingXI.filter((id) => ids.has(id));
    team.bench = team.bench.filter((id) => ids.has(id) && !team.playingXI.includes(id));

    const leftovers = team.playerIds.filter((id) => !team.playingXI.includes(id) && !team.bench.includes(id));
    if (team.playingXI.length < 11) {
      const fill = leftovers.splice(0, 11 - team.playingXI.length);
      team.playingXI.push(...fill);
    }
    team.bench.push(...leftovers.filter((id) => !team.playingXI.includes(id)));
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
  const forRate = row.oversFaced ? row.runsScored / row.oversFaced : 0;
  const againstRate = row.oversBowled ? row.runsConceded / row.oversBowled : 0;
  row.nrr = Number((forRate - againstRate).toFixed(3));
}

function createSchedule(teams) {
  let id = 1;
  const list = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      list.push({ id: id++, teamA: teams[i].id, teamB: teams[j].id, played: false, result: null });
    }
  }
  return shuffle(list);
}

function ensureAuctionQueue(season, players) {
  const pool = players.filter((p) => p.status === 'IN_AUCTION').map((p) => p.id);
  if (!season.auction.queue.length) season.auction.queue = shuffle(pool);
  if (!season.auction.currentPlayerId) {
    const current = season.auction.queue[season.auction.currentIndex] || null;
    season.auction.currentPlayerId = current;
    if (current) {
      const player = players.find((p) => p.id === current);
      season.auction.currentBid = player ? player.basePrice : 0;
      season.auction.currentTeam = null;
      season.auction.timer = AUCTION_TIMER_SECONDS;
    }
  }
}

function teamStrength(teamId, players, teams) {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return 50;
  const xi = team.playingXI.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const src = xi.length ? xi : players.filter((p) => p.teamId === teamId).slice(0, 11);
  if (!src.length) return 50;
  return src.reduce((sum, p) => sum + p.power * 0.65 + p.consistency * 0.35, 0) / src.length;
}

function generateBattingStats(lineup, teamRuns, inningsBalls) {
  const players = shuffle(lineup).slice(0, Math.min(lineup.length, 11));
  let remainingRuns = teamRuns;
  let remainingBalls = inningsBalls;
  const stats = [];

  players.forEach((player, idx) => {
    const left = players.length - idx;
    const maxRuns = Math.max(0, remainingRuns - (left - 1) * 0);
    const minRuns = idx === players.length - 1 ? remainingRuns : 0;
    const runs = idx === players.length - 1 ? remainingRuns : rand(minRuns, Math.max(minRuns, Math.min(maxRuns, Math.round(teamRuns / left + 25))));

    const minBalls = runs;
    const maxBalls = Math.max(minBalls, remainingBalls - (left - 1));
    const balls = idx === players.length - 1 ? Math.max(minBalls, remainingBalls) : rand(minBalls, Math.max(minBalls, Math.min(maxBalls, runs + 25)));

    remainingRuns -= runs;
    remainingBalls -= balls;

    stats.push({ playerId: player.id, runs, balls });
  });

  return stats;
}

function generateBowlingStats(lineup, concededRuns, teamWickets, inningsBalls) {
  const bowlers = lineup.filter((p) => p.role === 'Bowler' || p.role === 'All-Rounder');
  const pool = (bowlers.length ? bowlers : lineup).slice(0, 6);
  let ballsLeft = inningsBalls;
  let runsLeft = concededRuns;
  let wicketsLeft = teamWickets;
  const stats = [];

  pool.forEach((player, idx) => {
    const left = pool.length - idx;
    const maxBalls = Math.min(24, ballsLeft - (left - 1) * 6);
    const balls = idx === pool.length - 1 ? ballsLeft : Math.max(6, rand(6, Math.max(6, maxBalls)));
    const overs = oversFromBalls(Math.min(24, balls));

    const maxRuns = Math.max(0, runsLeft - (left - 1) * 2);
    const runsGiven = idx === pool.length - 1 ? runsLeft : rand(0, maxRuns);

    const wickets = idx === pool.length - 1 ? wicketsLeft : rand(0, Math.max(0, wicketsLeft));

    ballsLeft -= balls;
    runsLeft -= runsGiven;
    wicketsLeft -= wickets;

    stats.push({ playerId: player.id, overs, runsGiven, wickets });
  });

  return stats;
}

function simulateMatchData(match, teams, players) {
  const teamA = teams.find((t) => t.id === match.teamA);
  const teamB = teams.find((t) => t.id === match.teamB);
  const lineupA = teamA.playingXI.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const lineupB = teamB.playingXI.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  if (lineupA.length < 11 || lineupB.length < 11) return { error: 'Both teams require valid Playing XI (11).' };

  const strengthA = teamStrength(match.teamA, players, teams);
  const strengthB = teamStrength(match.teamB, players, teams);
  const firstRuns = clampInt(rand(130, 250) + Math.round((strengthA - strengthB) * 0.6), 120, 300, 160);
  const firstWickets = rand(3, 10);
  const firstOversBalls = firstWickets === 10 ? rand(72, 120) : 120;
  const target = firstRuns + 1;

  const chaseWin = Math.random() < 0.52;
  const secondRuns = chaseWin ? rand(target, Math.min(300, target + 25)) : rand(90, Math.max(90, target - 1));
  const secondWickets = rand(2, 10);
  const secondOversBalls = chaseWin ? rand(72, 119) : 120;

  const scoreA = { runs: firstRuns, wickets: firstWickets, overs: oversFromBalls(firstOversBalls) };
  const scoreB = { runs: secondRuns, wickets: secondWickets, overs: oversFromBalls(secondOversBalls) };

  const battingA = generateBattingStats(lineupA, firstRuns, firstOversBalls);
  const bowlingA = generateBowlingStats(lineupA, secondRuns, secondWickets, secondOversBalls);
  const battingB = generateBattingStats(lineupB, secondRuns, secondOversBalls);
  const bowlingB = generateBowlingStats(lineupB, firstRuns, firstWickets, firstOversBalls);

  return { scoreA, scoreB, battingA, battingB, bowlingA, bowlingB };
}

function applyScorecardToSeason(scorecard, players) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  scorecard.battingStats.forEach((s) => {
    const p = playerMap.get(s.playerId);
    if (!p) return;
    p.stats.season.totalRuns += s.runs;
    p.stats.season.totalBalls += s.balls;
  });
  scorecard.bowlingStats.forEach((s) => {
    const p = playerMap.get(s.playerId);
    if (!p) return;
    p.stats.season.wickets += s.wickets;
    p.stats.season.runsGiven += s.runsGiven;
    p.stats.season.ballsBowled += ballsFromOversString(s.overs);
  });
  const involved = new Set([...scorecard.battingStats.map((s) => s.playerId), ...scorecard.bowlingStats.map((s) => s.playerId)]);
  involved.forEach((id) => {
    const p = playerMap.get(id);
    if (p) p.stats.season.matches += 1;
  });
}

function updateTableFromMatch(match, scoreA, scoreB) {
  const season = getSeason();
  const tableA = season.pointsTable.find((t) => t.teamId === match.teamA);
  const tableB = season.pointsTable.find((t) => t.teamId === match.teamB);

  const winner = scoreB.runs > scoreA.runs ? match.teamB : match.teamA;
  tableA.matchesPlayed += 1;
  tableB.matchesPlayed += 1;
  if (winner === match.teamA) {
    tableA.wins += 1;
    tableA.points += 2;
    tableB.losses += 1;
  } else {
    tableB.wins += 1;
    tableB.points += 2;
    tableA.losses += 1;
  }

  tableA.runsScored += scoreA.runs;
  tableA.oversFaced += parseOvers(scoreA.overs);
  tableA.runsConceded += scoreB.runs;
  tableA.oversBowled += parseOvers(scoreB.overs);

  tableB.runsScored += scoreB.runs;
  tableB.oversFaced += parseOvers(scoreB.overs);
  tableB.runsConceded += scoreA.runs;
  tableB.oversBowled += parseOvers(scoreA.overs);

  updateNrr(tableA);
  updateNrr(tableB);

  return { season, winner };
}

function calculateAwards(players) {
  const enriched = players.map((p) => {
    const s = p.stats.season;
    const average = s.matches ? s.totalRuns / s.matches : 0;
    const strikeRate = s.totalBalls ? (s.totalRuns * 100) / s.totalBalls : 0;
    const oversBowled = s.ballsBowled / 6;
    const economy = oversBowled ? s.runsGiven / oversBowled : 0;
    const clutch = Math.min(15, s.matches * 0.5 + s.wickets * 0.2);
    const mvpScore = s.totalRuns * 0.5 + s.wickets * 20 + clutch;
    return { id: p.id, name: p.name, average, strikeRate, economy, mvpScore, ...s };
  });

  const orange = [...enriched].sort((a, b) => b.totalRuns - a.totalRuns)[0] || null;
  const purple = [...enriched].sort((a, b) => b.wickets - a.wickets)[0] || null;
  const mvp = [...enriched].sort((a, b) => b.mvpScore - a.mvpScore)[0] || null;

  return {
    orangeCap: orange ? { playerId: orange.id, name: orange.name, runs: orange.totalRuns } : null,
    purpleCap: purple ? { playerId: purple.id, name: purple.name, wickets: purple.wickets } : null,
    mvp: mvp ? { playerId: mvp.id, name: mvp.name, score: Number(mvp.mvpScore.toFixed(2)) } : null,
    bestStrikeRate: [...enriched].sort((a, b) => b.strikeRate - a.strikeRate)[0] || null,
    bestEconomy: [...enriched].filter((p) => p.ballsBowled >= 24).sort((a, b) => a.economy - b.economy)[0] || null
  };
}

app.get('/api/bootstrap', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const season = getSeason();
  const trophies = getTrophies();

  syncTeamReferences(teams, players);
  ensureAuctionQueue(season, players);

  saveTeams(teams);
  savePlayers(players);
  saveSeason(season);

  res.json({ teams, players, season, trophies, config: { defaultPurse: DEFAULT_PURSE, auctionIncrement: AUCTION_INCREMENT, timer: AUCTION_TIMER_SECONDS } });
});

app.post('/api/auction/start', (req, res) => {
  const season = getSeason();
  const teams = getTeams();
  const players = getPlayers();

  const pool = players.filter((p) => p.status === 'IN_AUCTION');
  if (pool.length < teams.length) return res.status(400).json({ error: 'Auction requires at least one player per team in pool.' });
  if (season.started) return res.status(400).json({ error: 'Cannot start auction after season start.' });

  season.auction.status = 'RUNNING';
  season.auction.queue = shuffle(pool.map((p) => p.id));
  season.auction.currentIndex = 0;
  season.auction.currentPlayerId = season.auction.queue[0] || null;
  const player = players.find((p) => p.id === season.auction.currentPlayerId);
  season.auction.currentBid = player ? player.basePrice : 0;
  season.auction.currentTeam = null;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory = [];
  saveSeason(season);

  res.json(season.auction);
});

app.post('/api/auction/end', (req, res) => {
  const season = getSeason();
  season.auction.status = 'COMPLETED';
  season.auction.currentPlayerId = null;
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/skip', (req, res) => {
  const season = getSeason();
  if (season.auction.status !== 'RUNNING') return res.status(400).json({ error: 'Auction not running.' });

  season.auction.currentIndex += 1;
  season.auction.currentPlayerId = season.auction.queue[season.auction.currentIndex] || null;
  season.auction.currentBid = 0;
  season.auction.currentTeam = null;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory = [];
  if (!season.auction.currentPlayerId) season.auction.status = 'COMPLETED';
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/bid', (req, res) => {
  const { teamId, amount } = req.body;
  const season = getSeason();
  const teams = getTeams();
  const players = getPlayers();

  if (season.auction.status !== 'RUNNING') return res.status(400).json({ error: 'Auction not running.' });
  const player = players.find((p) => p.id === season.auction.currentPlayerId);
  if (!player) return res.status(400).json({ error: 'No active player.' });

  const team = teams.find((t) => t.id === Number(teamId));
  const bid = Number(amount);
  if (!team || !Number.isFinite(bid)) return res.status(400).json({ error: 'Invalid bid.' });

  const minBid = Math.max(player.basePrice, season.auction.currentBid + season.auction.increment);
  if (bid < minBid) return res.status(400).json({ error: `Bid must be at least ${minBid}.` });
  if (bid > team.purse) return res.status(400).json({ error: 'Bid exceeds purse.' });

  season.auction.currentBid = bid;
  season.auction.currentTeam = team.id;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory.unshift({ teamId: team.id, amount: bid, at: new Date().toISOString() });
  season.auction.bidHistory = season.auction.bidHistory.slice(0, 8);

  player.currentBid = bid;
  player.currentBidTeamId = team.id;

  savePlayers(players);
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/finalize', (req, res) => {
  const season = getSeason();
  const teams = getTeams();
  const players = getPlayers();

  if (season.auction.status !== 'RUNNING') return res.status(400).json({ error: 'Auction not running.' });
  const player = players.find((p) => p.id === season.auction.currentPlayerId);
  if (!player) return res.status(400).json({ error: 'No active player.' });

  if (season.auction.currentTeam) {
    const buyer = teams.find((t) => t.id === season.auction.currentTeam);
    if (buyer && buyer.purse >= season.auction.currentBid) {
      buyer.purse -= season.auction.currentBid;
      player.teamId = buyer.id;
      player.status = 'IN_TEAM';
      player.currentBid = 0;
      player.currentBidTeamId = null;
      buyer.bench.push(player.id);
    }
  }

  season.auction.currentIndex += 1;
  season.auction.currentPlayerId = season.auction.queue[season.auction.currentIndex] || null;
  season.auction.currentBid = 0;
  season.auction.currentTeam = null;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory = [];
  if (!season.auction.currentPlayerId) season.auction.status = 'COMPLETED';

  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  saveSeason(season);

  res.json({ auction: season.auction });
});

app.post('/api/season/start', (req, res) => {
  const season = getSeason();
  const teams = getTeams();
  if (!['COMPLETED', 'SKIPPED'].includes(season.auction.status)) return res.status(400).json({ error: 'Finish or skip auction before starting season.' });
  const invalidTeam = teams.find((t) => t.playingXI.length !== 11);
  if (invalidTeam) {
    return res.status(400).json({ error: `Team ${invalidTeam.name} does not have a valid Playing XI (11).` });
  }

  season.started = true;
  season.completed = false;
  season.schedule = createSchedule(teams);
  season.history = [];
  season.scorecards = [];
  season.pointsTable = createPointsTable(teams);
  season.awards = null;
  saveSeason(season);

  res.json(season);
});

app.post('/api/season/skip-auction', (req, res) => {
  const season = getSeason();
  if (season.started) return res.status(400).json({ error: 'Season already started.' });
  season.auction.status = 'SKIPPED';
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/season/reset', (req, res) => {
  const season = getSeason();
  const players = getPlayers();

  season.started = false;
  season.completed = false;
  season.schedule = [];
  season.history = [];
  season.scorecards = [];
  season.pointsTable = [];
  season.awards = null;
  season.auction = {
    ...defaultSeason().auction,
    status: 'NOT_STARTED'
  };

  players.forEach((p) => {
    p.stats.season = { totalRuns: 0, totalBalls: 0, wickets: 0, runsGiven: 0, ballsBowled: 0, matches: 0 };
  });

  savePlayers(players);
  saveSeason(season);
  res.json({ success: true });
});

app.post('/api/teams/:id/lineup', (req, res) => {
  const teamId = Number(req.params.id);
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });

  const playingXI = Array.isArray(req.body.playingXI) ? req.body.playingXI.map(Number) : [];
  if (playingXI.length !== 11) return res.status(400).json({ error: 'Playing XI must be exactly 11 players.' });
  const owned = new Set(team.playerIds);
  if (playingXI.some((id) => !owned.has(id))) return res.status(400).json({ error: 'Playing XI includes non-owned player.' });

  team.playingXI = [...new Set(playingXI)];
  if (team.playingXI.length !== 11) return res.status(400).json({ error: 'Playing XI contains duplicates.' });
  team.bench = team.playerIds.filter((id) => !team.playingXI.includes(id));

  saveTeams(teams);
  res.json(team);
});

app.post('/api/matches/:id/simulate', (req, res) => {
  const matchId = Number(req.params.id);
  const userTeamId = Number(req.body.userTeamId || 0);
  const season = getSeason();
  const teams = getTeams();
  const players = getPlayers();

  const match = season.schedule.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });
  if ([match.teamA, match.teamB].includes(userTeamId)) return res.status(400).json({ error: 'User match requires manual entry.' });

  const data = simulateMatchData(match, teams, players);
  if (data.error) return res.status(400).json({ error: data.error });

  const { season: newSeason, winner } = updateTableFromMatch(match, data.scoreA, data.scoreB);
  match.played = true;
  match.result = { winner, scoreA: data.scoreA, scoreB: data.scoreB };

  const scorecard = {
    matchId: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: data.scoreA,
    scoreB: data.scoreB,
    battingStats: [...data.battingA, ...data.battingB],
    bowlingStats: [...data.bowlingA, ...data.bowlingB]
  };

  newSeason.scorecards.push(scorecard);
  newSeason.history.push({ id: newSeason.history.length + 1, ...scorecard, winner, date: new Date().toISOString() });

  applyScorecardToSeason(scorecard, players);
  savePlayers(players);
  saveSeason(newSeason);

  res.json(match);
});

app.post('/api/matches/:id/manual', (req, res) => {
  const matchId = Number(req.params.id);
  const season = getSeason();
  const players = getPlayers();
  const match = season.schedule.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });

  const scoreA = { runs: clampInt(req.body.scoreA?.runs, 0, 400, 0), wickets: clampInt(req.body.scoreA?.wickets, 0, 10, 0), overs: String(req.body.scoreA?.overs || '20.0') };
  const scoreB = { runs: clampInt(req.body.scoreB?.runs, 0, 400, 0), wickets: clampInt(req.body.scoreB?.wickets, 0, 10, 0), overs: String(req.body.scoreB?.overs || '20.0') };
  const battingStats = Array.isArray(req.body.battingStats) ? req.body.battingStats : [];
  const bowlingStats = Array.isArray(req.body.bowlingStats) ? req.body.bowlingStats : [];

  for (const b of battingStats) {
    if ((Number(b.balls) || 0) < (Number(b.runs) || 0)) return res.status(400).json({ error: 'Batting validation failed: balls must be >= runs.' });
  }
  for (const bw of bowlingStats) {
    const balls = ballsFromOversString(bw.overs);
    if (balls > 24) return res.status(400).json({ error: 'Bowler overs cannot exceed 4.0.' });
  }

  const winner = scoreB.runs > scoreA.runs ? match.teamB : match.teamA;
  const { season: newSeason } = updateTableFromMatch(match, scoreA, scoreB);
  match.played = true;
  match.result = { winner, scoreA, scoreB };

  const scorecard = { matchId: match.id, teamA: match.teamA, teamB: match.teamB, scoreA, scoreB, battingStats, bowlingStats };
  newSeason.scorecards.push(scorecard);
  newSeason.history.push({ id: newSeason.history.length + 1, ...scorecard, winner, date: new Date().toISOString() });

  applyScorecardToSeason(scorecard, players);
  savePlayers(players);
  saveSeason(newSeason);
  res.json(match);
});

app.post('/api/season/complete', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  if (!season.started) return res.status(400).json({ error: 'Season not started.' });
  if (season.schedule.some((m) => !m.played)) return res.status(400).json({ error: 'All matches must be completed.' });

  const standings = [...season.pointsTable].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  const champion = standings[0];
  const awards = calculateAwards(players);
  season.awards = awards;
  season.completed = true;

  const trophies = getTrophies();
  const existing = trophies.find((t) => t.teamName === champion.teamName);
  const playerOfSeason = awards.mvp?.name || req.body.playerOfSeason || 'Unknown';
  const captain = req.body.captain || 'Unknown';
  if (existing) {
    existing.titles += 1;
    existing.playerOfSeason = playerOfSeason;
    existing.captain = captain;
  } else {
    trophies.push({ teamName: champion.teamName, titles: 1, playerOfSeason, captain });
  }

  saveTrophies(trophies);
  saveSeason(season);
  res.json({ champion, awards, trophies });
});

app.get('/api/teams', (req, res) => res.json(getTeams()));
app.get('/api/players', (req, res) => res.json(getPlayers()));

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Team name required.' });
  const team = { ...defaultTeam(name), id: (teams.length ? Math.max(...teams.map((t) => t.id)) + 1 : 1), purse: Number(req.body.purse) || DEFAULT_PURSE };
  teams.push(team);
  saveTeams(teams);
  res.status(201).json(team);
});

app.post('/api/players', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Player name required.' });

  const teamId = req.body.teamId === null || req.body.teamId === '' ? null : Number(req.body.teamId);
  const player = {
    ...defaultPlayer(name),
    id: (players.length ? Math.max(...players.map((p) => p.id)) + 1 : 1),
    teamId,
    battingStyle: VALID_BATTING_STYLES.includes(req.body.battingStyle) ? req.body.battingStyle : 'RHB',
    role: VALID_ROLES.includes(req.body.role) ? req.body.role : 'Batter',
    bowlingType: req.body.bowlingType || null,
    power: clampRating(req.body.power),
    consistency: clampRating(req.body.consistency),
    basePrice: Number(req.body.basePrice) > 0 ? Number(req.body.basePrice) : 200000,
    status: teamId == null ? 'IN_AUCTION' : 'IN_TEAM'
  };

  players.push(player);
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.status(201).json(player);
});

app.post('/api/teams/:teamId/release-player', (req, res) => {
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.body.playerId);
  const teams = getTeams();
  const players = getPlayers();
  const p = players.find((x) => x.id === playerId && x.teamId === teamId);
  if (!p) return res.status(400).json({ error: 'Player not found in team.' });
  p.teamId = null;
  p.status = 'IN_AUCTION';
  p.currentBid = 0;
  p.currentBidTeamId = null;
  syncTeamReferences(teams, players);
  saveTeams(teams);
  savePlayers(players);
  res.json(p);
});

app.listen(PORT, () => {
  console.log(`LPL Scorer listening on ${PORT}`);
});
