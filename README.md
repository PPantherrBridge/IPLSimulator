# LPL Scorer

LPL Scorer is a complete cricket league web app built with:
- **Backend:** Node.js + Express
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Storage:** Local JSON files (`data/teams.json`, `data/players.json`)

## Features

- Team CRUD (create, edit, delete)
- Player CRUD (create, edit, delete)
- Player ratings with range **1–100**
- Structured stats model:
  - `stats.batting` → runs, balls, fours, sixes, outs
  - `stats.bowling` → balls, runs, wickets, dots, wides, noballs
  - `stats.fielding` → catches, runouts, stumpings
- Release Player flow (team → auction pool)
- Auction card UI:
  - Shows name, P, C, current bid, bidding team
  - Place bid + mark player SOLD
- Game Mode:
  - Select Team + Player
  - Save selection in `localStorage`

## Render Compatibility

This app works on Render without code changes:
- Uses `process.env.PORT || 3000`
- Start command: `node server.js`
- Static files served from `public`

## Run Locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`
