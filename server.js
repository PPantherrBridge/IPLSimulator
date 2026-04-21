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
const MASTER_VERSION = '2026-04-master-players-v1';
const AUCTION_INCREMENT = 100000;
const AUCTION_TIMER_SECONDS = 10;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDir() { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); }
function readJson(filePath, fallback) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function writeJson(filePath, data) { ensureDir(); fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

function clamp(v, min, max, fallback = min) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function parseOvers(overs) {
  const [o, b = '0'] = String(overs || '0.0').split('.');
  const balls = Math.max(0, Math.min(5, Number(b) || 0));
  return (Number(o) || 0) + balls / 6;
}
function oversFromBalls(balls) {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}
function ballsFromOvers(overs) {
  const [o, b = '0'] = String(overs || '0.0').split('.');
  return (Number(o) || 0) * 6 + Math.max(0, Math.min(5, Number(b) || 0));
}

function defaultSeason() {
  return {
    meta: { masterVersion: null },
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

const MASTER_TEAMS = ['RCB', 'MI', 'CSK', 'KKR', 'SRH', 'GT'];
const MASTER_PLAYERS = [
  ['RCB','Enoch','LHB','ALL_ROUNDER','LEFT_ARM_ORTHODOX',98,79,95,70,75],
  ['RCB','Monish','RHB','ALL_ROUNDER','FAST',96,90,97,80,70],
  ['RCB','Shakthi','RHB','ALL_ROUNDER','LEG_SPIN',85,75,80,85,82],
  ['RCB','Mohan','RHB','BATTER','NONE',90,70,75,65,70],
  ['RCB','Naveen','RHB','ALL_ROUNDER','MEDIUM',96,96,70,75,95],
  ['RCB','Ashwin','RHB','ALL_ROUNDER','FAST',92,90,85,95,90],
  ['RCB','Harsha','RHB','ALL_ROUNDER','MEDIUM',75,70,65,70,75],
  ['RCB','Shivu','RHB','ALL_ROUNDER','FAST_MEDIUM',95,99,88,90,99],
  ['RCB','Bavith','RHB','ALL_ROUNDER','FAST',88,82,75,95,85],
  ['RCB','Chandan','LHB','ALL_ROUNDER','OFF_SPIN',70,70,60,70,72],

  ['MI','Shreyans','RHB','ALL_ROUNDER','FAST',96,80,95,85,85],
  ['MI','Jayanth','RHB','ALL_ROUNDER','OFF_SPIN',89,80,90,75,82],
  ['MI','Eshaan','RHB','ALL_ROUNDER','MEDIUM_FAST',80,70,75,65,70],
  ['MI','Adith','LHB','WICKETKEEPER','FAST_MEDIUM',80,85,80,90,88],
  ['MI','Bhuvan','RHB','BATTER','NONE',90,90,70,80,92],
  ['MI','AdithyaB','RHB','ALL_ROUNDER','FAST',60,50,60,70,65],
  ['MI','Sachin','RHB','ALL_ROUNDER','MEDIUM',80,80,65,85,88],
  ['MI','Lakshya','AMB','BOWLER','FAST',50,60,55,90,70],
  ['MI','Vikas','RHB','BOWLER','MEDIUM',60,50,50,70,60],
  ['MI','Devendra','RHB','BATTER','NONE',60,70,60,65,72],

  ['CSK','Karthik','RHB','ALL_ROUNDER','MEDIUM',90,95,85,75,95],
  ['CSK','Pradeep','RHB','ALL_ROUNDER','EXPRESS',98,68,98,95,75],
  ['CSK','Immanuel','RHB','ALL_ROUNDER','MEDIUM',70,60,65,70,68],
  ['CSK','Joseph','RHB','ALL_ROUNDER','FAST',90,70,80,85,78],
  ['CSK','Madhan','LHB','BATTER','NONE',97,80,75,70,88],
  ['CSK','Ganesh','RHB','WICKETKEEPER','NONE',66,68,60,65,70],
  ['CSK','Sampath','RHB','ALL_ROUNDER','SLOW',70,80,65,80,85],
  ['CSK','VikasCSK','RHB','ALL_ROUNDER','FAST',90,80,85,88,82],
  ['CSK','Abishek','LHB','ALL_ROUNDER','FAST',60,60,70,80,72],
  ['CSK','Anand','RHB','BOWLER','EXPRESS',69,70,60,98,75],

  ['KKR','Gowardhan','RHB','BATTER','NONE',94,70,95,60,70],
  ['KKR','Ishaan','RHB','ALL_ROUNDER','FAST',90,84,90,80,85],
  ['KKR','Bhargav','RHB','ALL_ROUNDER','MEDIUM_FAST',90,75,80,75,78],
  ['KKR','Mithil','RHB','BATTER','NONE',89,95,65,70,95],
  ['KKR','ShivuKKR','RHB','ALL_ROUNDER','EXPRESS',80,80,75,98,88],
  ['KKR','Adithya','LHB','ALL_ROUNDER','SLOW',70,65,60,65,70],
  ['KKR','Harshith','RHB','ALL_ROUNDER','SLOW',60,70,60,70,72],
  ['KKR','Harinandan','RHB','WICKETKEEPER','MEDIUM',70,60,65,68,70],
  ['KKR','Raghav','LHB','ALL_ROUNDER','MEDIUM',84,80,70,90,85],
  ['KKR','Dhruv','RHB','BATTER','NONE',40,100,55,60,98],

  ['SRH','Harshavardhan','RHB','ALL_ROUNDER','SLOW',99,70,99,75,70],
  ['SRH','Prem','LHB','ALL_ROUNDER','FAST',90,65,92,80,75],
  ['SRH','SaiTalwaar','RHB','ALL_ROUNDER','FAST',95,65,90,85,65],
  ['SRH','PavanSRH','RHB','ALL_ROUNDER','MEDIUM',96,70,88,80,72],
  ['SRH','Deva','LHB','ALL_ROUNDER','OFF_SPIN',75,80,65,75,90],
  ['SRH','Rishab','LHB','BATTER','NONE',93,87,85,95,92],
  ['SRH','Suvas','LHB','ALL_ROUNDER','LEG_SPIN',66,69,60,80,78],
  ['SRH','Dhanush','RHB','ALL_ROUNDER','EXPRESS',85,90,75,99,90],
  ['SRH','Brudvith','RHB','WICKETKEEPER','NONE',67,70,60,70,72],
  ['SRH','Anirudh','RHB','BATTER','NONE',85,70,80,92,88],

  ['GT','Yogendra','RHB','BATTER','NONE',99,68,99,70,72],
  ['GT','PavanGT','RHB','BATTER','NONE',90,80,90,75,85],
  ['GT','Anil','RHB','BATTER','NONE',95,70,80,70,75],
  ['GT','MohanGT','RHB','ALL_ROUNDER','FAST',85,85,85,95,85],
  ['GT','Devraj','AMB','BATTER','NONE',98,95,88,85,99],
  ['GT','Dharshan','RHB','ALL_ROUNDER','MEDIUM',85,75,75,80,80],
  ['GT','Vikram','RHB','ALL_ROUNDER','OFF_SPIN',80,80,70,82,85],
  ['GT','Shiva','LHB','ALL_ROUNDER','LEG_SPIN',75,70,72,80,82],
  ['GT','Nanda','LHB','ALL_ROUNDER','LEFT_ARM_ORTHODOX',65,70,65,75,78],
  ['GT','Koushik','RHB','WICKETKEEPER','NONE',89,90,85,95,90]
];

function makeMasterData() {
  const teams = MASTER_TEAMS.map((name, idx) => ({ id: idx + 1, name, purse: DEFAULT_PURSE, playerIds: [], playingXI: [], bench: [] }));
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));

  const players = MASTER_PLAYERS.map((row, idx) => {
    const [teamName, name, hand, role, bowlingType, p, c, pp, doAttr, cl] = row;
    return {
      id: idx + 1,
      name,
      teamId: teamIdByName.get(teamName),
      hand,
      role,
      bowlingType,
      p,
      c,
      pp,
      do: doAttr,
      cl,
      basePrice: 200000 + p * 10000,
      status: 'IN_TEAM',
      currentBid: 0,
      currentBidTeamId: null,
      stats: {
        season: { totalRuns: 0, totalBalls: 0, wickets: 0, runsGiven: 0, ballsBowled: 0, matches: 0 }
      }
    };
  });

  players.forEach((p) => {
    const team = teams.find((t) => t.id === p.teamId);
    team.playerIds.push(p.id);
    team.playingXI.push(p.id);
  });

  return { teams, players };
}

function getTeams() { return readJson(files.teams, []); }
function saveTeams(teams) { writeJson(files.teams, teams); }
function getPlayers() { return readJson(files.players, []); }
function savePlayers(players) { writeJson(files.players, players); }
function getSeason() { return { ...defaultSeason(), ...readJson(files.season, defaultSeason()) }; }
function saveSeason(season) { writeJson(files.season, { ...defaultSeason(), ...season }); }
function getTrophies() { return readJson(files.trophies, []); }
function saveTrophies(trophies) { writeJson(files.trophies, trophies); }

function ensureMasterDataLoaded() {
  const season = getSeason();
  if (season.meta?.masterVersion === MASTER_VERSION) return;

  const { teams, players } = makeMasterData();
  season.meta = { masterVersion: MASTER_VERSION };
  season.started = false;
  season.completed = false;
  season.schedule = [];
  season.history = [];
  season.scorecards = [];
  season.pointsTable = [];
  season.awards = null;
  season.auction = { ...defaultSeason().auction, status: 'NOT_STARTED' };

  saveTeams(teams);
  savePlayers(players);
  saveSeason(season);
}

function teamLineup(team, players) {
  const ids = (team.playingXI && team.playingXI.length ? team.playingXI : team.playerIds);
  return ids.map((id) => players.find((p) => p.id === id)).filter(Boolean);
}

function bowlingStrength(player) {
  const base = player.do * 0.45 + player.c * 0.3 + player.cl * 0.25;
  if (player.role === 'BOWLER') return base + 8;
  if (player.role === 'ALL_ROUNDER') return base + 3;
  return base - 5;
}

function battingStrengthPP(player) { return player.pp * 0.55 + player.p * 0.3 + player.c * 0.15; }
function battingStrengthMiddle(player) { return player.c * 0.55 + player.p * 0.25 + player.cl * 0.2; }
function battingStrengthDeath(player) { return player.do * 0.4 + player.cl * 0.45 + player.p * 0.15; }

function simulateInnings(battingTeam, bowlingTeam, players, target = null) {
  const batters = shuffle(teamLineup(battingTeam, players));
  const bowlers = teamLineup(bowlingTeam, players);

  const bowlQuality = bowlers.length
    ? bowlers.reduce((s, b) => s + bowlingStrength(b), 0) / bowlers.length
    : 65;

  const ppImpact = batters.slice(0, 4).reduce((s, b) => s + battingStrengthPP(b), 0) / Math.max(1, Math.min(4, batters.length));
  const midImpact = batters.reduce((s, b) => s + battingStrengthMiddle(b), 0) / Math.max(1, batters.length);
  const deathImpact = batters.slice(-4).reduce((s, b) => s + battingStrengthDeath(b), 0) / Math.max(1, Math.min(4, batters.length));

  let ppRuns = clamp(35 + (ppImpact - bowlQuality) * 0.6 + rand(-8, 12), 20, 85, 45);
  let midRuns = clamp(55 + (midImpact - bowlQuality) * 0.7 + rand(-15, 20), 35, 140, 70);
  let deathRuns = clamp(35 + (deathImpact - bowlQuality) * 0.8 + rand(-12, 25), 18, 120, 45);

  let total = ppRuns + midRuns + deathRuns;
  total = clamp(total, 100, 280, 150);

  const wickets = clamp(4 + Math.round((bowlQuality - midImpact) / 20) + rand(-2, 2), 2, 10, 6);
  const oversBalls = wickets === 10 ? rand(84, 120) : 120;

  if (target != null) {
    const chaseBias = (ppImpact + midImpact + deathImpact) / 3 - bowlQuality;
    const chaseWin = Math.random() < (0.42 + Math.max(-0.12, Math.min(0.12, chaseBias / 200)));
    if (chaseWin) {
      total = clamp(rand(target, target + 22), target, 280, target);
    } else {
      total = clamp(rand(Math.max(80, target - 35), target - 1), 80, target - 1, target - 5);
    }
  }

  const battingStats = buildBattingStats(batters, total, oversBalls);
  const bowlingStats = buildBowlingStats(bowlers, total, wickets, oversBalls);

  return {
    runs: total,
    wickets,
    overs: oversFromBalls(oversBalls),
    battingStats,
    bowlingStats
  };
}

function buildBattingStats(lineup, totalRuns, totalBalls) {
  const active = lineup.slice(0, Math.min(11, lineup.length));
  let remainingRuns = totalRuns;
  let remainingBalls = totalBalls;
  const stats = [];

  active.forEach((p, idx) => {
    const left = active.length - idx;
    const expected = Math.max(0, Math.round((p.p * 0.6 + p.c * 0.4) / 8));
    const runs = idx === active.length - 1
      ? remainingRuns
      : clamp(rand(0, expected + 25), 0, Math.max(0, remainingRuns - (left - 1) * 0), 0);
    const balls = idx === active.length - 1
      ? Math.max(1, remainingBalls)
      : clamp(Math.round(runs * (1 + (100 - p.c) / 160) + rand(0, 12)), 1, Math.max(1, remainingBalls - (left - 1)), 1);

    remainingRuns -= runs;
    remainingBalls -= balls;
    stats.push({ playerId: p.id, runs, balls });
  });

  return stats;
}

function buildBowlingStats(lineup, concededRuns, wickets, inningsBalls) {
  const pool = lineup.filter((p) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER');
  const bowlers = (pool.length ? pool : lineup).slice(0, Math.min(6, lineup.length));

  let ballsLeft = inningsBalls;
  let runsLeft = concededRuns;
  let wktsLeft = wickets;
  const stats = [];

  bowlers.forEach((b, idx) => {
    const left = bowlers.length - idx;
    const maxBalls = Math.min(24, ballsLeft - (left - 1) * 6);
    const balls = idx === bowlers.length - 1 ? ballsLeft : clamp(rand(6, Math.max(6, maxBalls)), 6, 24, 6);
    const runsGiven = idx === bowlers.length - 1 ? runsLeft : clamp(rand(8, Math.max(8, runsLeft - (left - 1) * 6)), 0, runsLeft, 10);
    const wkts = idx === bowlers.length - 1 ? wktsLeft : clamp(rand(0, Math.max(0, wktsLeft)), 0, wktsLeft, 0);

    ballsLeft -= balls;
    runsLeft -= runsGiven;
    wktsLeft -= wkts;

    stats.push({ playerId: b.id, overs: oversFromBalls(balls), runsGiven, wickets: wkts });
  });

  return stats;
}

function applyScorecard(players, scorecard) {
  const map = new Map(players.map((p) => [p.id, p]));
  scorecard.battingStats.forEach((b) => {
    const p = map.get(b.playerId);
    if (!p) return;
    p.stats.season.totalRuns += b.runs;
    p.stats.season.totalBalls += b.balls;
    p.stats.season.matches += 1;
  });
  scorecard.bowlingStats.forEach((b) => {
    const p = map.get(b.playerId);
    if (!p) return;
    p.stats.season.wickets += b.wickets;
    p.stats.season.runsGiven += b.runsGiven;
    p.stats.season.ballsBowled += ballsFromOvers(b.overs);
  });
}

function createSchedule(teams) {
  const out = [];
  let id = 1;
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      out.push({ id: id++, teamA: teams[i].id, teamB: teams[j].id, played: false, result: null });
    }
  }
  return shuffle(out);
}

function createPointsTable(teams) {
  return teams.map((t) => ({ teamId: t.id, teamName: t.name, matchesPlayed: 0, wins: 0, losses: 0, points: 0, runsScored: 0, oversFaced: 0, runsConceded: 0, oversBowled: 0, nrr: 0 }));
}
function updateNrr(row) {
  const forRate = row.oversFaced ? row.runsScored / row.oversFaced : 0;
  const againstRate = row.oversBowled ? row.runsConceded / row.oversBowled : 0;
  row.nrr = Number((forRate - againstRate).toFixed(3));
}
function updatePoints(season, match, scoreA, scoreB) {
  const a = season.pointsTable.find((r) => r.teamId === match.teamA);
  const b = season.pointsTable.find((r) => r.teamId === match.teamB);
  const winner = scoreB.runs > scoreA.runs ? match.teamB : match.teamA;

  a.matchesPlayed += 1; b.matchesPlayed += 1;
  if (winner === match.teamA) { a.wins += 1; a.points += 2; b.losses += 1; }
  else { b.wins += 1; b.points += 2; a.losses += 1; }

  a.runsScored += scoreA.runs; a.oversFaced += parseOvers(scoreA.overs); a.runsConceded += scoreB.runs; a.oversBowled += parseOvers(scoreB.overs);
  b.runsScored += scoreB.runs; b.oversFaced += parseOvers(scoreB.overs); b.runsConceded += scoreA.runs; b.oversBowled += parseOvers(scoreA.overs);
  updateNrr(a); updateNrr(b);

  return winner;
}

function calculateAwards(players) {
  const seasonRows = players.map((p) => {
    const s = p.stats.season;
    const strikeRate = s.totalBalls ? (s.totalRuns * 100) / s.totalBalls : 0;
    const overs = s.ballsBowled / 6;
    const economy = overs ? s.runsGiven / overs : 0;
    const clutch = p.cl * 0.3 + (s.matches || 0) * 0.5;
    const mvp = s.totalRuns * 0.5 + s.wickets * 20 + clutch;
    return { id: p.id, name: p.name, ...s, strikeRate, economy, mvp };
  });

  return {
    orangeCap: [...seasonRows].sort((x, y) => y.totalRuns - x.totalRuns)[0] || null,
    purpleCap: [...seasonRows].sort((x, y) => y.wickets - x.wickets)[0] || null,
    mvp: [...seasonRows].sort((x, y) => y.mvp - x.mvp)[0] || null
  };
}

function ensureAuctionQueue(season, players) {
  if (!season.auction.queue.length) {
    season.auction.queue = shuffle(players.filter((p) => p.status === 'IN_AUCTION').map((p) => p.id));
  }
}

app.get('/api/bootstrap', (req, res) => {
  ensureMasterDataLoaded();
  const teams = getTeams();
  const players = getPlayers();
  const season = getSeason();
  const trophies = getTrophies();
  res.json({ teams, players, season, trophies, config: { auctionIncrement: AUCTION_INCREMENT, timer: AUCTION_TIMER_SECONDS, defaultPurse: DEFAULT_PURSE } });
});

app.post('/api/auction/start', (req, res) => {
  ensureMasterDataLoaded();
  const season = getSeason();
  const players = getPlayers();
  const teams = getTeams();

  if (season.started) return res.status(400).json({ error: 'Cannot auction after season start.' });
  const pool = players.filter((p) => p.status === 'IN_AUCTION');
  if (pool.length < teams.length) return res.status(400).json({ error: `Auction requires at least ${teams.length} players in pool.` });

  season.auction = { ...defaultSeason().auction, status: 'RUNNING' };
  season.auction.queue = shuffle(pool.map((p) => p.id));
  season.auction.currentIndex = 0;
  season.auction.currentPlayerId = season.auction.queue[0] || null;
  const current = players.find((p) => p.id === season.auction.currentPlayerId);
  season.auction.currentBid = current ? current.basePrice : 0;
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

app.post('/api/season/skip-auction', (req, res) => {
  const season = getSeason();
  if (season.started) return res.status(400).json({ error: 'Season already started.' });
  season.auction.status = 'SKIPPED';
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/bid', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  const teams = getTeams();

  if (season.auction.status !== 'RUNNING') return res.status(400).json({ error: 'Auction not running.' });
  const player = players.find((p) => p.id === season.auction.currentPlayerId);
  const team = teams.find((t) => t.id === Number(req.body.teamId));
  const amount = Number(req.body.amount);
  if (!player || !team || !Number.isFinite(amount)) return res.status(400).json({ error: 'Invalid bid.' });

  const minBid = Math.max(player.basePrice, season.auction.currentBid + season.auction.increment);
  if (amount < minBid) return res.status(400).json({ error: `Minimum bid is ${minBid}.` });
  if (amount > team.purse) return res.status(400).json({ error: 'Bid exceeds purse.' });

  season.auction.currentBid = amount;
  season.auction.currentTeam = team.id;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory.unshift({ teamId: team.id, amount, at: new Date().toISOString() });
  season.auction.bidHistory = season.auction.bidHistory.slice(0, 8);

  player.currentBid = amount;
  player.currentBidTeamId = team.id;

  savePlayers(players);
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/finalize', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  const teams = getTeams();
  const player = players.find((p) => p.id === season.auction.currentPlayerId);
  if (season.auction.status !== 'RUNNING' || !player) return res.status(400).json({ error: 'No active auction player.' });

  if (season.auction.currentTeam) {
    const buyer = teams.find((t) => t.id === season.auction.currentTeam);
    if (buyer && buyer.purse >= season.auction.currentBid) {
      buyer.purse -= season.auction.currentBid;
      player.teamId = buyer.id;
      player.status = 'IN_TEAM';
      player.currentBid = 0;
      player.currentBidTeamId = null;
      if (!buyer.playerIds.includes(player.id)) buyer.playerIds.push(player.id);
      if (!buyer.bench.includes(player.id) && !buyer.playingXI.includes(player.id)) buyer.bench.push(player.id);
    }
  }

  season.auction.currentIndex += 1;
  season.auction.currentPlayerId = season.auction.queue[season.auction.currentIndex] || null;
  season.auction.currentBid = 0;
  season.auction.currentTeam = null;
  season.auction.timer = AUCTION_TIMER_SECONDS;
  season.auction.bidHistory = [];

  if (season.auction.currentPlayerId) {
    const next = players.find((p) => p.id === season.auction.currentPlayerId);
    season.auction.currentBid = next ? next.basePrice : 0;
  } else {
    season.auction.status = 'COMPLETED';
  }

  saveTeams(teams);
  savePlayers(players);
  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/auction/skip', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  if (season.auction.status !== 'RUNNING') return res.status(400).json({ error: 'Auction not running.' });

  season.auction.currentIndex += 1;
  season.auction.currentPlayerId = season.auction.queue[season.auction.currentIndex] || null;
  season.auction.currentTeam = null;
  season.auction.bidHistory = [];
  season.auction.timer = AUCTION_TIMER_SECONDS;
  const next = players.find((p) => p.id === season.auction.currentPlayerId);
  season.auction.currentBid = next ? next.basePrice : 0;
  if (!season.auction.currentPlayerId) season.auction.status = 'COMPLETED';

  saveSeason(season);
  res.json(season.auction);
});

app.post('/api/season/start', (req, res) => {
  const season = getSeason();
  const teams = getTeams();

  if (season.started) return res.status(400).json({ error: 'Season already started.' });
  if (!['COMPLETED', 'SKIPPED'].includes(season.auction.status)) return res.status(400).json({ error: 'Complete or skip auction first.' });

  season.started = true;
  season.completed = false;
  season.schedule = createSchedule(teams);
  season.pointsTable = createPointsTable(teams);
  season.history = [];
  season.scorecards = [];
  season.awards = null;
  season.auction.status = 'LOCKED';
  saveSeason(season);

  res.json(season);
});

app.post('/api/matches/:id/simulate', (req, res) => {
  const season = getSeason();
  const teams = getTeams();
  const players = getPlayers();
  const match = season.schedule.find((m) => m.id === Number(req.params.id));
  const userTeamId = Number(req.body.userTeamId || 0);

  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });
  if ([match.teamA, match.teamB].includes(userTeamId)) return res.status(400).json({ error: 'User-team match requires manual entry.' });

  const teamA = teams.find((t) => t.id === match.teamA);
  const teamB = teams.find((t) => t.id === match.teamB);
  const inningsA = simulateInnings(teamA, teamB, players);
  const inningsB = simulateInnings(teamB, teamA, players, inningsA.runs + 1);

  const scoreA = { runs: inningsA.runs, wickets: inningsA.wickets, overs: inningsA.overs };
  const scoreB = { runs: inningsB.runs, wickets: inningsB.wickets, overs: inningsB.overs };
  const winner = updatePoints(season, match, scoreA, scoreB);

  const scorecard = {
    matchId: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA,
    scoreB,
    battingStats: [...inningsA.battingStats, ...inningsB.battingStats],
    bowlingStats: [...inningsA.bowlingStats, ...inningsB.bowlingStats]
  };

  match.played = true;
  match.result = { winner, scoreA, scoreB };
  season.history.push({ id: season.history.length + 1, ...scorecard, winner, date: new Date().toISOString() });
  season.scorecards.push(scorecard);

  applyScorecard(players, scorecard);
  savePlayers(players);
  saveSeason(season);
  res.json(match);
});

app.post('/api/matches/:id/manual', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  const match = season.schedule.find((m) => m.id === Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  if (match.played) return res.status(400).json({ error: 'Match already played.' });

  const scoreA = { runs: clamp(req.body.scoreA?.runs, 0, 400, 0), wickets: clamp(req.body.scoreA?.wickets, 0, 10, 0), overs: String(req.body.scoreA?.overs || '20.0') };
  const scoreB = { runs: clamp(req.body.scoreB?.runs, 0, 400, 0), wickets: clamp(req.body.scoreB?.wickets, 0, 10, 0), overs: String(req.body.scoreB?.overs || '20.0') };
  const battingStats = Array.isArray(req.body.battingStats) ? req.body.battingStats : [];
  const bowlingStats = Array.isArray(req.body.bowlingStats) ? req.body.bowlingStats : [];

  for (const b of battingStats) {
    if (Number(b.balls) < Number(b.runs)) return res.status(400).json({ error: 'Batting validation failed: balls must be >= runs.' });
  }
  for (const bw of bowlingStats) {
    if (ballsFromOvers(bw.overs) > 24) return res.status(400).json({ error: 'Bowler overs cannot exceed 4.0.' });
  }

  const winner = updatePoints(season, match, scoreA, scoreB);
  const scorecard = { matchId: match.id, teamA: match.teamA, teamB: match.teamB, scoreA, scoreB, battingStats, bowlingStats };

  match.played = true;
  match.result = { winner, scoreA, scoreB };
  season.history.push({ id: season.history.length + 1, ...scorecard, winner, date: new Date().toISOString() });
  season.scorecards.push(scorecard);

  applyScorecard(players, scorecard);
  savePlayers(players);
  saveSeason(season);
  res.json(match);
});

app.post('/api/season/complete', (req, res) => {
  const season = getSeason();
  const players = getPlayers();
  if (!season.started) return res.status(400).json({ error: 'Season not started.' });
  if (season.schedule.some((m) => !m.played)) return res.status(400).json({ error: 'Complete all matches first.' });

  const standings = [...season.pointsTable].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  const champion = standings[0];
  const awards = calculateAwards(players);

  season.completed = true;
  season.awards = awards;
  saveSeason(season);

  const trophies = getTrophies();
  const existing = trophies.find((t) => t.teamName === champion.teamName);
  const playerOfSeason = awards.mvp?.name || 'Unknown';
  const captain = String(req.body.captain || 'Unknown');
  if (existing) {
    existing.titles += 1;
    existing.playerOfSeason = playerOfSeason;
    existing.captain = captain;
  } else {
    trophies.push({ teamName: champion.teamName, titles: 1, playerOfSeason, captain });
  }
  saveTrophies(trophies);

  res.json({ champion, awards, trophies });
});

app.post('/api/season/reset', (req, res) => {
  const season = getSeason();
  const players = getPlayers();

  season.started = false;
  season.completed = false;
  season.schedule = [];
  season.pointsTable = [];
  season.history = [];
  season.scorecards = [];
  season.awards = null;
  season.auction = { ...defaultSeason().auction, status: 'NOT_STARTED' };

  players.forEach((p) => {
    p.stats.season = { totalRuns: 0, totalBalls: 0, wickets: 0, runsGiven: 0, ballsBowled: 0, matches: 0 };
  });

  savePlayers(players);
  saveSeason(season);
  res.json({ success: true });
});

app.post('/api/teams/:teamId/release-player', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.body.playerId);
  const team = teams.find((t) => t.id === teamId);
  const player = players.find((p) => p.id === playerId && p.teamId === teamId);
  if (!team || !player) return res.status(400).json({ error: 'Player not found in team.' });

  player.teamId = null;
  player.status = 'IN_AUCTION';
  player.currentBid = 0;
  player.currentBidTeamId = null;

  team.playerIds = team.playerIds.filter((id) => id !== playerId);
  team.playingXI = team.playingXI.filter((id) => id !== playerId);
  team.bench = team.bench.filter((id) => id !== playerId);

  saveTeams(teams);
  savePlayers(players);
  res.json(player);
});

app.put('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const p = players.find((x) => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Player not found.' });

  if (req.body.name !== undefined) p.name = String(req.body.name);
  if (req.body.hand !== undefined) p.hand = String(req.body.hand);
  if (req.body.role !== undefined) p.role = String(req.body.role);
  if (req.body.bowlingType !== undefined) p.bowlingType = String(req.body.bowlingType);
  if (req.body.p !== undefined) p.p = clamp(req.body.p, 1, 100, p.p);
  if (req.body.c !== undefined) p.c = clamp(req.body.c, 1, 100, p.c);
  if (req.body.pp !== undefined) p.pp = clamp(req.body.pp, 1, 100, p.pp);
  if (req.body.do !== undefined) p.do = clamp(req.body.do, 1, 100, p.do);
  if (req.body.cl !== undefined) p.cl = clamp(req.body.cl, 1, 100, p.cl);
  if (req.body.basePrice !== undefined) p.basePrice = Math.max(100000, Number(req.body.basePrice) || p.basePrice);

  savePlayers(players);
  res.json(p);
});

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Team name required.' });
  const id = teams.length ? Math.max(...teams.map((t) => t.id)) + 1 : 1;
  const team = { id, name, purse: Number(req.body.purse) || DEFAULT_PURSE, playerIds: [], playingXI: [], bench: [] };
  teams.push(team);
  saveTeams(teams);
  res.status(201).json(team);
});

app.post('/api/players', (req, res) => {
  const players = getPlayers();
  const teams = getTeams();
  const id = players.length ? Math.max(...players.map((p) => p.id)) + 1 : 1;
  const teamId = req.body.teamId === null || req.body.teamId === '' ? null : Number(req.body.teamId);
  const player = {
    id,
    name: String(req.body.name || `Player ${id}`),
    teamId,
    hand: String(req.body.hand || 'RHB'),
    role: String(req.body.role || 'ALL_ROUNDER'),
    bowlingType: String(req.body.bowlingType || 'MEDIUM'),
    p: clamp(req.body.p, 1, 100, 60),
    c: clamp(req.body.c, 1, 100, 60),
    pp: clamp(req.body.pp, 1, 100, 60),
    do: clamp(req.body.do, 1, 100, 60),
    cl: clamp(req.body.cl, 1, 100, 60),
    basePrice: Math.max(100000, Number(req.body.basePrice) || 200000),
    status: teamId ? 'IN_TEAM' : 'IN_AUCTION',
    currentBid: 0,
    currentBidTeamId: null,
    stats: { season: { totalRuns: 0, totalBalls: 0, wickets: 0, runsGiven: 0, ballsBowled: 0, matches: 0 } }
  };

  players.push(player);
  if (teamId) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      team.playerIds.push(player.id);
      if (team.playingXI.length < 11) team.playingXI.push(player.id);
      else team.bench.push(player.id);
    }
  }

  saveTeams(teams);
  savePlayers(players);
  res.status(201).json(player);
});

app.get('/api/teams', (req, res) => { ensureMasterDataLoaded(); res.json(getTeams()); });
app.get('/api/players', (req, res) => { ensureMasterDataLoaded(); res.json(getPlayers()); });

app.listen(PORT, () => {
  console.log(`LPL Scorer listening on ${PORT}`);
});
