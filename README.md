# LPL Scorer

LPL Scorer is a simple web-based cricket scoring application built with **Node.js + Express + HTML/CSS/Vanilla JavaScript** and local JSON storage.

It supports:
- Team and player entry on the home page
- Match creation (Team A vs Team B)
- Live scoring buttons (`0,1,2,3,4,6,W,WD,NB`)
- Automatic updates for score, wickets, overs
- Batter strike rate and bowler economy updates
- Local storage in `data/match.json`

## Project Structure

- `server.js`
- `package.json`
- `public/`
  - `index.html`
  - `match.html`
  - `styles.css`
  - `script.js`
- `data/`
  - `match.json`

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open in your browser:
   ```
   http://localhost:3000
   ```

## Render Deployment

This app is ready for Render with no code changes:
- Uses `process.env.PORT || 3000`
- Start command is `node server.js`
- Static files are served from `public/`
