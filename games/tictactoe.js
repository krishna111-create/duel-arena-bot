function createTicTacToe() {
  return {
    board: Array.from({ length: 3 }, () => Array(3).fill("")),
    turn: 0,
    symbols: {},
  };
}

function renderTicTacToe(room) {
  const s = room.state;
  const current = room.players[s.turn];
  return `❌⭕ *Tic-Tac-Toe*\n\n👤 ${room.players[0].name}: ❌\n👤 ${room.players[1].name}: ⭕\n\n${s.board.map(r => r.map(c => c || "⬜").join("")).join("\n")}\n\n👉 Turn: *${current.name}*`;
}

function winner(board) {
  const lines = [
    [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]],
    [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
    [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]]
  ];
  for (const line of lines) {
    const [a,b,c] = line;
    if (board[a[0]][a[1]] && board[a[0]][a[1]] === board[b[0]][b[1]] && board[a[0]][a[1]] === board[c[0]][c[1]]) {
      return board[a[0]][a[1]];
    }
  }
  return null;
}

function tttMove(room, userId, r, c) {
  const s = room.state;
  const playerIndex = room.players.findIndex(p => p.id === userId);
  if (playerIndex < 0) return { ok:false, message:"You are not in this room." };
  if (playerIndex !== s.turn) return { ok:false, message:"Wait for your turn." };
  if (s.board[r][c]) return { ok:false, message:"That cell is already taken." };

  const symbol = playerIndex === 0 ? "❌" : "⭕";
  s.board[r][c] = symbol;

  const win = winner(s.board);
  if (win) {
    return { ok:true, finished:true, winner:room.players[playerIndex] };
  }

  if (s.board.flat().every(Boolean)) {
    return { ok:true, finished:true, winner:null };
  }

  s.turn = s.turn === 0 ? 1 : 0;
  return { ok:true, finished:false, message:"Move accepted!" };
}

module.exports = { createTicTacToe, renderTicTacToe, tttMove };
