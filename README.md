# 🎮 Duel Arena — Telegram 2-Player Games Bot

A simple Telegram bot MVP with room codes and three games:

- ❌⭕ Tic-Tac-Toe
- ✊ Rock Paper Scissors
- ⚡ Reaction Duel

## 1. Install

Requires Node.js 18+.

```bash
npm install
```

## 2. Configure

Copy `.env.example` to `.env` and add your BotFather token:

```env
BOT_TOKEN=YOUR_TOKEN
```

## 3. Run

```bash
npm start
```

Open your bot in Telegram and send `/start`.

## Room flow

Create Room → choose game → bot generates a 5-character code → friend uses Join Room → match starts.

## Important

This MVP stores rooms in RAM. If the process restarts, active rooms disappear.

For a public bot, the next upgrade should be:
1. MongoDB/Redis for persistent rooms
2. Anti-spam/rate limits
3. Player stats + leaderboard
4. Room expiry
5. Better inline message editing
6. More games
