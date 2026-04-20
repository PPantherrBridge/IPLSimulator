const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const dataDir = path.join(__dirname, 'data');
const teamsFile = path.join(dataDir, 'teams.json');
const playersFile = path.join(dataDir, 'players.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getTeams() {
  return readJson(teamsFile, []);
}

function getPlayers() {
  return readJson(playersFile, []);
}

function normalizeStat(n) {
  return Math.max(0, Math.min(10, Number(n) || 0));
}

function getBattingStrength(player) {
  return normalizeStat(player.batting?.aggression) * 0.6 + normalizeStat(player.batting?.consistency) * 0.4;
}

function getBowlingStrength(player) {
  return normalizeStat(player.bowling?.economy) * 0.5 + normalizeStat(player.bowling?.wicketTaking) * 0.5;
}

function chooseOutcome(batStrength, bowlStrength) {
  const pressure = (bowlStrength - batStrength) / 15;
  const wicketChance = Math.min(0.32, Math.max(0.03, 0.06 + pressure * 0.2));
  const dotChance = Math.min(0.42, Math.max(0.12, 0.2 + pressure * 0.2));
  const fourChance = Math.min(0.32, Math.max(0.04, 0.12 + (batStrength - bowlStrength) * 0.02));
  const sixChance = Math.min(0.2, Math.max(0.01, 0.05 + (batStrength - bowlStrength) * 0.015));

  const r = Math.random();

  if (r < wicketChance) return { runs: 0, wicket: true, text: 'WICKET!' };
  if (r < wicketChance + dotChance) return { runs: 0, wicket: false, text: '0 run' };

  const singlesWeight = 0.45;
  const twosWeight = 0.18;
  const threesWeight = 0.04;
  const boundaryWeight = fourChance;
  const sixWeight = sixChance;
  const total = singlesWeight + twosWeight + threesWeight + boundaryWeight + sixWeight;
  const roll = Math.random() * total;

  if (roll < singlesWeight) return { runs: 1, wicket: false, text: '1 run' };
  if (roll < singlesWeight + twosWeight) return { runs: 2, wicket: false, text: '2 runs' };
  if (roll < singlesWeight + twosWeight + threesWeight) return { runs: 3, wicket: false, text: '3 runs' };
  if (roll < singlesWeight + twosWeight + threesWeight + boundaryWeight) return { runs: 4, wicket: false, text: 'FOUR!' };
  return { runs: 6, wicket: false, text: 'SIX!' };
}

function oversToString(balls) {
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${overs}.${rem}`;
}

function pickTopBatsmen(teamPlayers, count = 7) {
  return [...teamPlayers]
    .sort((a, b) => getBattingStrength(b) - getBattingStrength(a))
    .slice(0, count);
}

function pickTopBowlers(teamPlayers, count = 5) {
  return [...teamPlayers]
    .sort((a, b) => getBowlingStrength(b) - getBowlingStrength(a))
    .slice(0, count);
}

function simulateInnings(battingTeam, bowlingTeam, target = null) {
  const battingLineup = pickTopBatsmen(battingTeam.squad, Math.min(11, battingTeam.squad.length));
  const bowlers = pickTopBowlers(bowlingTeam.squad, Math.min(5, bowlingTeam.squad.length));

  if (battingLineup.length < 2 || bowlers.length < 1) {
    return {
      totalRuns: 0,
      wickets: 0,
      balls: 0,
      overs: '0.0',
      commentary: ['Not enough players to simulate innings.']
    };
  }

  let strikerIndex = 0;
  let nonStrikerIndex = 1;
  let nextBatter = 2;

  let runs = 0;
  let wickets = 0;
  let balls = 0;
  const commentary = [];

  for (let over = 0; over < 20; over++) {
    const bowler = bowlers[over % bowlers.length];
    commentary.push(`Over ${over + 1} - Bowler: ${bowler.name}`);

    for (let ball = 0; ball < 6; ball++) {
      if (wickets >= 10) break;

      const striker = battingLineup[strikerIndex];
      const batStrength = getBattingStrength(striker);
      const bowlStrength = getBowlingStrength(bowler);
      const outcome = chooseOutcome(batStrength, bowlStrength);

      balls += 1;
      runs += outcome.runs;

      commentary.push(`${oversToString(balls)} ${striker.name} vs ${bowler.name}: ${outcome.text}`);

      if (outcome.wicket) {
        wickets += 1;
        if (nextBatter < battingLineup.length) {
          strikerIndex = nextBatter;
          nextBatter += 1;
        }
      } else if (outcome.runs % 2 === 1) {
        const temp = strikerIndex;
        strikerIndex = nonStrikerIndex;
        nonStrikerIndex = temp;
      }

      if (target !== null && runs > target) {
        return {
          totalRuns: runs,
          wickets,
          balls,
          overs: oversToString(balls),
          commentary
        };
      }
    }

    const temp = strikerIndex;
    strikerIndex = nonStrikerIndex;
    nonStrikerIndex = temp;

    if (wickets >= 10) break;
  }

  return {
    totalRuns: runs,
    wickets,
    balls,
    overs: oversToString(balls),
    commentary
  };
}

function simulateMatch(teamA, teamB) {
  const tossWinner = Math.random() > 0.5 ? teamA : teamB;
  const batsFirst = Math.random() > 0.5 ? tossWinner : tossWinner.id === teamA.id ? teamB : teamA;
  const bowlsFirst = batsFirst.id === teamA.id ? teamB : teamA;

  const innings1 = simulateInnings(batsFirst, bowlsFirst, null);
  const innings2 = simulateInnings(bowlsFirst, batsFirst, innings1.totalRuns);

  let winner;
  let resultText;

  if (innings2.totalRuns > innings1.totalRuns) {
    winner = bowlsFirst.id;
    const wicketsLeft = 10 - innings2.wickets;
    resultText = `${bowlsFirst.name} won by ${wicketsLeft} wickets`;
  } else if (innings2.totalRuns < innings1.totalRuns) {
    winner = batsFirst.id;
    const margin = innings1.totalRuns - innings2.totalRuns;
    resultText = `${batsFirst.name} won by ${margin} runs`;
  } else {
    winner = null;
    resultText = 'Match tied';
  }

  return {
    tossWinner: tossWinner.name,
    batsFirst: batsFirst.name,
    innings1: {
      team: batsFirst.name,
      ...innings1
    },
    innings2: {
      team: bowlsFirst.name,
      ...innings2
    },
    winner,
    resultText,
    commentary: [...innings1.commentary, '--- Innings Break ---', ...innings2.commentary]
  };
}

function initTable(teams) {
  return teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    matches: 0,
    wins: 0,
    losses: 0,
    points: 0
  }));
}

function applyResult(table, teamAId, teamBId, winnerId) {
  const rowA = table.find((r) => r.teamId === teamAId);
  const rowB = table.find((r) => r.teamId === teamBId);
  if (!rowA || !rowB) return;

  rowA.matches += 1;
  rowB.matches += 1;

  if (winnerId === teamAId) {
    rowA.wins += 1;
    rowA.points += 2;
    rowB.losses += 1;
  } else if (winnerId === teamBId) {
    rowB.wins += 1;
    rowB.points += 2;
    rowA.losses += 1;
  } else {
    rowA.points += 1;
    rowB.points += 1;
  }
}

app.get('/api/teams', (req, res) => {
  const teams = getTeams();
  res.json(teams);
});

app.post('/api/teams', (req, res) => {
  const teams = getTeams();
  const { name, budget = 100 } = req.body;

  if (!name) return res.status(400).json({ error: 'Team name is required' });

  const team = {
    id: teams.length ? Math.max(...teams.map((t) => t.id)) + 1 : 1,
    name,
    budget: Number(budget) || 100,
    squad: []
  };

  teams.push(team);
  writeJson(teamsFile, teams);
  res.status(201).json(team);
});

app.get('/api/players', (req, res) => {
  const players = getPlayers();
  res.json(players);
});

app.post('/api/players', (req, res) => {
  const players = getPlayers();
  const payload = req.body;

  if (!payload.name || !payload.role) {
    return res.status(400).json({ error: 'name and role are required' });
  }

  const player = {
    id: players.length ? Math.max(...players.map((p) => p.id)) + 1 : 1,
    name: payload.name,
    role: payload.role,
    basePrice: Number(payload.basePrice) || 1,
    batting: {
      aggression: normalizeStat(payload.batting?.aggression),
      consistency: normalizeStat(payload.batting?.consistency)
    },
    bowling: {
      economy: normalizeStat(payload.bowling?.economy),
      wicketTaking: normalizeStat(payload.bowling?.wicketTaking)
    }
  };

  players.push(player);
  writeJson(playersFile, players);
  res.status(201).json(player);
});

app.put('/api/players/:id', (req, res) => {
  const players = getPlayers();
  const id = Number(req.params.id);
  const idx = players.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Player not found' });

  const current = players[idx];
  const payload = req.body;

  players[idx] = {
    ...current,
    name: payload.name ?? current.name,
    role: payload.role ?? current.role,
    basePrice: payload.basePrice !== undefined ? Number(payload.basePrice) : current.basePrice,
    batting: {
      aggression: payload.batting?.aggression !== undefined ? normalizeStat(payload.batting.aggression) : current.batting.aggression,
      consistency: payload.batting?.consistency !== undefined ? normalizeStat(payload.batting.consistency) : current.batting.consistency
    },
    bowling: {
      economy: payload.bowling?.economy !== undefined ? normalizeStat(payload.bowling.economy) : current.bowling.economy,
      wicketTaking: payload.bowling?.wicketTaking !== undefined ? normalizeStat(payload.bowling.wicketTaking) : current.bowling.wicketTaking
    }
  };

  writeJson(playersFile, players);
  res.json(players[idx]);
});

app.post('/api/auction/simulate', (req, res) => {
  const teams = getTeams();
  const players = getPlayers();

  const availablePlayers = players.filter((p) => !teams.some((t) => t.squad.some((sp) => sp.id === p.id)));
  const log = [];

  for (const player of availablePlayers) {
    const interestedTeams = teams.filter((team) => team.budget >= player.basePrice);
    if (!interestedTeams.length) {
      log.push(`No bids for ${player.name} (base ${player.basePrice})`);
      continue;
    }

    const bidders = interestedTeams.filter((team) => {
      const needsRole = team.squad.filter((p) => p.role === player.role).length < 4;
      const randomInterest = Math.random() > 0.2;
      return needsRole && randomInterest;
    });

    const activeBidders = bidders.length ? bidders : interestedTeams;

    let bid = player.basePrice;
    let highestTeam = activeBidders[Math.floor(Math.random() * activeBidders.length)];
    log.push(`${player.name} starts at ${bid}`);

    const rounds = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < rounds; i++) {
      const challengers = activeBidders.filter((t) => t.id !== highestTeam.id && t.budget > bid);
      if (!challengers.length) break;
      const challenger = challengers[Math.floor(Math.random() * challengers.length)];
      const increment = Math.floor(Math.random() * 4) + 1;
      const newBid = Math.min(challenger.budget, bid + increment);
      if (newBid <= bid) break;
      bid = newBid;
      highestTeam = challenger;
      log.push(`${highestTeam.name} bids ${bid} for ${player.name}`);
    }

    highestTeam.budget -= bid;
    highestTeam.squad.push(player);
    log.push(`${highestTeam.name} wins ${player.name} for ${bid}`);
  }

  writeJson(teamsFile, teams);
  res.json({ log, teams });
});

app.post('/api/match/simulate', (req, res) => {
  const teams = getTeams();
  const { teamAId, teamBId } = req.body;

  const teamA = teams.find((t) => t.id === Number(teamAId));
  const teamB = teams.find((t) => t.id === Number(teamBId));

  if (!teamA || !teamB) {
    return res.status(400).json({ error: 'Select valid teams' });
  }

  const simulated = simulateMatch(teamA, teamB);
  res.json(simulated);
});

app.post('/api/league/simulate', (req, res) => {
  const teams = getTeams();

  if (teams.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 teams' });
  }

  const table = initTable(teams);
  const matches = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const result = simulateMatch(teams[i], teams[j]);
      matches.push({
        teamA: teams[i].name,
        teamB: teams[j].name,
        result: result.resultText
      });
      applyResult(table, teams[i].id, teams[j].id, result.winner);
    }
  }

  table.sort((a, b) => b.points - a.points || b.wins - a.wins || a.teamName.localeCompare(b.teamName));
  res.json({ matches, table });
});

app.listen(PORT, () => {
  console.log(`IPL Simulator running locally at http://localhost:${PORT}`);
});
