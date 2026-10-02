function createRps() {
  return { choices: {} };
}

function renderRps(room) {
  const count = Object.keys(room.state.choices).length;
  return `✊📄✂️ *Rock Paper Scissors*\n\nChoose secretly.\n\n${count}/2 players have locked in their choice.`;
}

function rpsMove(room, userId, choice) {
  if (!room.players.some(p => p.id === userId)) return { finished:false, message:"You are not in this room." };
  if (room.state.choices[userId]) return { finished:false, message:"You already chose." };

  room.state.choices[userId] = choice;
  const count = Object.keys(room.state.choices).length;
  if (count < 2) return { finished:false, message:"Choice locked. Waiting for opponent..." };

  const [a,b] = room.players;
  const ca = room.state.choices[a.id];
  const cb = room.state.choices[b.id];

  const beats = { rock:"scissors", scissors:"paper", paper:"rock" };
  let text;
  if (ca === cb) {
    text = `🤝 *Draw!*\n\n${a.name}: ${ca}\n${b.name}: ${cb}`;
  } else {
    const winner = beats[ca] === cb ? a : b;
    text = `🏆 *${winner.name} wins!*\n\n${a.name}: ${ca}\n${b.name}: ${cb}`;
  }
  return { finished:true, message:"Round complete!", text };
}

module.exports = { createRps, renderRps, rpsMove };
