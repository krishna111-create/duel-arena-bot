function createReaction() {
  return {
    ready: {},
    live: false,
    startedAt: null,
    winnerId: null,
  };
}

function renderReaction(room) {
  const count = Object.keys(room.state.ready).length;
  return `⚡ *Reaction Duel*\n\nBoth players press START.\nThen wait for the signal and be the FIRST to tap!\n\n${count}/2 ready.`;
}

function reactionStart(room, userId) {
  if (!room.players.some(p => p.id === userId)) return { ok:false, message:"You are not in this room." };
  room.state.ready[userId] = true;
  const ready = Object.keys(room.state.ready).length === 2;
  return {
    ok:true,
    ready,
    message: ready ? "Both ready!" : "You're ready. Waiting for opponent..."
  };
}

function reactionTap(room, userId) {
  if (!room.state.live) return { finished:false, message:"Too early! Wait for the signal." };
  if (room.state.winnerId) return { finished:false, message:"Round already finished." };

  room.state.winnerId = userId;
  const winner = room.players.find(p => p.id === userId);
  const loser = room.players.find(p => p.id !== userId);
  const ms = Date.now() - room.state.startedAt;

  return {
    finished:true,
    message:"🏆 You won!",
    text:`⚡ *${winner.name} wins!*\n\n🏆 Reaction time: *${ms} ms*\n😵 ${loser.name} was slower!`
  };
}

module.exports = { createReaction, renderReaction, reactionStart, reactionTap };
