# LPL Scorer - Hybrid League Simulation

LPL Scorer is a Render-ready cricket league simulator with:
- Team + player management
- Auction system
- Hybrid manual + automatic match results
- Points table, history, trophies, and season reset

## Stack
- Node.js + Express
- HTML/CSS/Vanilla JS
- JSON file storage only

## Key Features

### User Team Mode
Select a **Team + Player** on the dashboard and save to localStorage as:
```json
{ "teamId": 1, "playerId": 7 }
```

### Hybrid Match Logic
- If the user team is in the match: result is **manual input only**.
- If user team is not in the match: match is **auto simulated** using weighted randomness and team strength.

### Season System
- IPL-style round robin schedule
- Team-to-team match tracking (`matchesPlayedAgainst`)
- Points table (2 points per win)
- Minimal match history storage
- Season completion with Player of the League + Captain
- Trophy history tracking
- Full season reset while preserving trophy history

## Render Compatibility
- Uses `process.env.PORT || 3000`
- Start script is `npm start` (`node server.js`)
- Express serves static files from `public`

## Run
```bash
npm install
npm start
```
Open: `http://localhost:3000`
