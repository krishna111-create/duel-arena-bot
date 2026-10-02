# Duel Arena — fixed v3

Telegram 2-player games bot with 15 games, room codes, inline gameplay, same-message updates and synchronized rematch.

## Fixed room flow
1. Create Room
2. Room code + game selection appear immediately
3. Creator selects a game before or after friend joins
4. Friend sends the 5-character code
5. If a game was preselected, the duel starts immediately
6. Otherwise both see game selection; creator chooses
7. Moves edit the existing game messages
8. Rematch starts only after both players press Rematch

## Run
```bash
npm install
```
Create `.env`:
```env
BOT_TOKEN=YOUR_BOTFATHER_TOKEN
```
Then:
```bash
npm start
```
