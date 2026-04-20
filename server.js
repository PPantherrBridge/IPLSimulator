const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const matchFile = path.join(dataDir, 'match.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(matchFile)) {
    const starterData = {
      teamA: { name: '', players: [] },
      teamB: { name: '', players: [] },
      innings: {
        totalRuns: 0,
        wickets: 0,
        balls: 0,
        extras: 0,
        strikerIndex: 0,
        nonStrikerIndex: 1,
        nextBatterIndex: 2,
        overNumber: 0,
        batters: [],
        bowlers: [],
        currentBowlerIndex: 0,
        currentBowlerBallCount: 0
      },
      events: []
    };

    fs.writeFileSync(matchFile, JSON.stringify(starterData, null, 2));
  }
}

function readMatchData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(matchFile, 'utf8'));
}

function writeMatchData(data) {
  fs.writeFileSync(matchFile, JSON.stringify(data, null, 2));
}

function toDisplayOvers(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function normalizePlayers(rawPlayers) {
  if (!Array.isArray(rawPlayers)) return [];

  return rawPlayers
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      runs: 0,
      balls: 0,
      strikeRate: 0
    }));
}

function createBowlingCards(teamPlayers) {
  const safePlayers = teamPlayers.length ? teamPlayers : [{ name: 'Bowler 1' }];

  return safePlayers.map((player) => ({
    name: player.name,
    balls: 0,
    runsConceded: 0,
    wickets: 0,
    overs: '0.0',
    economy: 0
  }));
}

function computeBatterStrikeRate(batter) {
  if (!batter.balls) return 0;
  return Number(((batter.runs / batter.balls) * 100).toFixed(2));
}

function computeBowlerEconomy(bowler) {
  if (!bowler.balls) return 0;
  const overs = bowler.balls / 6;
  return Number((bowler.runsConceded / overs).toFixed(2));
}

function ensureCurrentBowler(innings) {
  if (!innings.bowlers.length) {
    innings.bowlers = [{
      name: 'Bowler 1',
      balls: 0,
      runsConceded: 0,
      wickets: 0,
      overs: '0.0',
      economy: 0
    }];
  }

  innings.currentBowlerIndex = innings.currentBowlerIndex % innings.bowlers.length;
}

function createInnings(teamAPlayers, teamBPlayers) {
  const batters = normalizePlayers(teamAPlayers);
  const bowlers = createBowlingCards(normalizePlayers(teamBPlayers));

  return {
    totalRuns: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    strikerIndex: 0,
    nonStrikerIndex: batters.length > 1 ? 1 : 0,
    nextBatterIndex: batters.length > 1 ? 2 : 1,
    overNumber: 0,
    batters,
    bowlers,
    currentBowlerIndex: 0,
    currentBowlerBallCount: 0
  };
}

function buildMatchResponse(matchData) {
  const innings = matchData.innings;
  ensureCurrentBowler(innings);

  const striker = innings.batters[innings.strikerIndex] || null;
  const nonStriker = innings.batters[innings.nonStrikerIndex] || null;
  const currentBowler = innings.bowlers[innings.currentBowlerIndex] || null;

  return {
    teamA: matchData.teamA,
    teamB: matchData.teamB,
    score: {
      runs: innings.totalRuns,
      wickets: innings.wickets,
      overs: toDisplayOvers(innings.balls),
      extras: innings.extras
    },
    striker,
    nonStriker,
    currentBowler,
    batters: innings.batters,
    bowlers: innings.bowlers,
    events: matchData.events
  };
}

function rotateStrikeAtOverEnd(innings) {
  const temp = innings.strikerIndex;
  innings.strikerIndex = innings.nonStrikerIndex;
  innings.nonStrikerIndex = temp;
}

function rotateBowlerAtOverEnd(innings) {
  if (innings.bowlers.length <= 1) return;
  innings.currentBowlerIndex = (innings.currentBowlerIndex + 1) % innings.bowlers.length;
}

function addLegalBall(innings, runs, isWicket) {
  ensureCurrentBowler(innings);

  const striker = innings.batters[innings.strikerIndex];
  const bowler = innings.bowlers[innings.currentBowlerIndex];

  innings.totalRuns += runs;
  innings.balls += 1;
  innings.currentBowlerBallCount += 1;

  if (striker) {
    striker.runs += runs;
    striker.balls += 1;
    striker.strikeRate = computeBatterStrikeRate(striker);
  }

  bowler.balls += 1;
  bowler.runsConceded += runs;
  bowler.overs = toDisplayOvers(bowler.balls);
  bowler.economy = computeBowlerEconomy(bowler);

  if (isWicket) {
    innings.wickets += 1;
    bowler.wickets += 1;

    if (innings.nextBatterIndex < innings.batters.length) {
      innings.strikerIndex = innings.nextBatterIndex;
      innings.nextBatterIndex += 1;
    }
  } else if (runs % 2 === 1) {
    const temp = innings.strikerIndex;
    innings.strikerIndex = innings.nonStrikerIndex;
    innings.nonStrikerIndex = temp;
  }

  if (innings.currentBowlerBallCount === 6) {
    innings.currentBowlerBallCount = 0;
    innings.overNumber += 1;
    rotateStrikeAtOverEnd(innings);
    rotateBowlerAtOverEnd(innings);
  }
}

function addExtraBall(innings, type) {
  ensureCurrentBowler(innings);
  const bowler = innings.bowlers[innings.currentBowlerIndex];

  innings.totalRuns += 1;
  innings.extras += 1;
  bowler.runsConceded += 1;
  bowler.economy = computeBowlerEconomy(bowler);

  if (type === 'NB') {
    const striker = innings.batters[innings.strikerIndex];
    if (striker) {
      striker.runs += 1;
      striker.strikeRate = computeBatterStrikeRate(striker);
    }
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-match', (req, res) => {
  const { teamAName, teamBName, teamAPlayers, teamBPlayers } = req.body;

  const safeTeamAName = String(teamAName || '').trim();
  const safeTeamBName = String(teamBName || '').trim();

  if (!safeTeamAName || !safeTeamBName) {
    return res.status(400).json({ error: 'Team names are required.' });
  }

  const innings = createInnings(teamAPlayers, teamBPlayers);

  if (!innings.batters.length) {
    return res.status(400).json({ error: 'Team A must have at least one player.' });
  }

  const matchData = {
    teamA: {
      name: safeTeamAName,
      players: normalizePlayers(teamAPlayers)
    },
    teamB: {
      name: safeTeamBName,
      players: normalizePlayers(teamBPlayers)
    },
    innings,
    events: ['Match created. Scoring started.']
  };

  writeMatchData(matchData);

  return res.json({ message: 'Match created successfully.', match: buildMatchResponse(matchData) });
});

app.get('/match', (req, res) => {
  const matchData = readMatchData();
  return res.json(buildMatchResponse(matchData));
});

app.post('/update-score', (req, res) => {
  const { action } = req.body;
  const validActions = ['0', '1', '2', '3', '4', '6', 'W', 'WD', 'NB'];

  if (!validActions.includes(String(action))) {
    return res.status(400).json({ error: 'Invalid action.' });
  }

  const matchData = readMatchData();
  const innings = matchData.innings;

  if (innings.wickets >= 10 || innings.balls >= 120) {
    return res.status(400).json({ error: 'Innings complete. Cannot update score.' });
  }

  if (action === 'W') {
    addLegalBall(innings, 0, true);
    matchData.events.push(`Wicket! Score: ${innings.totalRuns}/${innings.wickets}`);
  } else if (action === 'WD' || action === 'NB') {
    addExtraBall(innings, action);
    matchData.events.push(`${action} called. +1 run`);
  } else {
    const runs = Number(action);
    addLegalBall(innings, runs, false);
    matchData.events.push(`${runs} run(s). Score: ${innings.totalRuns}/${innings.wickets}`);
  }

  if (matchData.events.length > 120) {
    matchData.events = matchData.events.slice(matchData.events.length - 120);
  }

  writeMatchData(matchData);
  return res.json(buildMatchResponse(matchData));
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`LPL Scorer server running on port ${PORT}`);
});
