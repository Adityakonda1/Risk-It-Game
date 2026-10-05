# RISK IT — Multiplayer Trivia Game

A real-time multiplayer trivia wagering game built with Node.js, Express, and Socket.IO.

## Game rules
- 2–8 players
- Everyone starts with 1,000 points
- 8 rounds
- Secret risk: 10%, 25%, 50%, or 100% of current score
- Correct answer: gain the wager
- Wrong answer: lose the wager
- Multiple choice questions: 15 seconds
- Free-text questions: 25 seconds
- Players reaching 0 are eliminated
- Late joiners start at 1,000 points and join from the next question
- After Round 8, a final Risk It All wager decides the winner
- Multiple-choice answer positions can be randomized in a future multiplayer hardening pass

## Run locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:3000 in two or more browser windows/devices on the same reachable machine.

## Deploy

This is structured for common Node hosts such as Render, Railway, Replit, or similar services. Use:
- Build/install: `npm install`
- Start: `npm start`

The server listens on `process.env.PORT`.

## Important

The included version is a working multiplayer prototype. For a competition submission, the next hardening pass should add:
- persistent room/session recovery
- stronger host disconnect handling
- server-side randomized answer ordering per player
- custom question entry
- reconnect support
- production rate limiting and validation
- a proper final-question UI instead of the prototype confirmation prompt
