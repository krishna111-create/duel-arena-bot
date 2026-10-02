require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const {
  createTicTacToe,
  renderTicTacToe,
  tttMove,
} = require("./games/tictactoe");
const {
  createRps,
  renderRps,
  rpsMove,
} = require("./games/rps");
const {
  createReaction,
  renderReaction,
  reactionStart,
  reactionTap,
} = require("./games/reaction");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing in .env");

const bot = new Telegraf(token);

// MVP storage: rooms disappear when the process restarts.
// We can add MongoDB/Redis later without changing the basic UI.
const rooms = new Map();
const userState = new Map();

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎮 Create Room", "create_room")],
    [Markup.button.callback("🔑 Join Room", "join_room")],
    [Markup.button.callback("📖 How to Play", "help")],
  ]);
}

function gameMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("❌⭕ Tic-Tac-Toe", "game_ttt")],
    [Markup.button.callback("✊ Rock Paper Scissors", "game_rps")],
    [Markup.button.callback("⚡ Reaction Duel", "game_reaction")],
    [Markup.button.callback("🔙 Back", "back_menu")],
  ]);
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function gameLabel(type) {
  return {
    ttt: "❌⭕ Tic-Tac-Toe",
    rps: "✊ Rock Paper Scissors",
    reaction: "⚡ Reaction Duel",
  }[type];
}

function createRoom(type, player) {
  const code = randomCode();
  const room = {
    code,
    type,
    players: [player],
    state: null,
    messageIds: {},
    status: "waiting",
  };

  if (type === "ttt") room.state = createTicTacToe();
  if (type === "rps") room.state = createRps();
  if (type === "reaction") room.state = createReaction();

  rooms.set(code, room);
  return room;
}

function getPlayer(room, userId) {
  return room.players.find((p) => p.id === userId);
}

function otherPlayer(room, userId) {
  return room.players.find((p) => p.id !== userId);
}

async function safeEdit(ctx, text, keyboard) {
  try {
    await ctx.editMessageText(text, keyboard);
  } catch (e) {
    if (!String(e.message).includes("message is not modified")) throw e;
  }
}

bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    `🎮 *Duel Arena*\n\n2-player games directly inside Telegram.\n\nCreate a room, share the code, and challenge a friend!`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

bot.action("back_menu", async (ctx) => {
  await ctx.answerCbQuery();
  await safeEdit(ctx, "🎮 *Duel Arena*\n\nChoose an option:", mainMenu());
});

bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `📖 *How it works*\n\n1. Create a room.\n2. Pick a game.\n3. Send the 5-character room code to your friend.\n4. Your friend taps Join Room and enters the code.\n5. The match starts automatically.\n\n🎮 Games in this MVP:\n• Tic-Tac-Toe\n• Rock Paper Scissors\n• Reaction Duel`,
    Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "back_menu")]])
  );
});

bot.action("create_room", async (ctx) => {
  await ctx.answerCbQuery();
  await safeEdit(ctx, "🎮 *Choose a game*", gameMenu());
});

async function setupCreatedRoom(ctx, type) {
  const room = createRoom(type, {
    id: ctx.from.id,
    name: ctx.from.first_name || "Player 1",
  });

  await safeEdit(
    ctx,
    `✅ *Room Created!*\n\n🎮 ${gameLabel(type)}\n🔐 Room Code: \`${room.code}\`\n\nSend this code to your friend.\n\nWaiting for Player 2...`,
    Markup.inlineKeyboard([
      [Markup.button.callback("❌ Cancel Room", `cancel:${room.code}`)],
    ])
  );
}

bot.action("game_ttt", async (ctx) => {
  await ctx.answerCbQuery();
  await setupCreatedRoom(ctx, "ttt");
});

bot.action("game_rps", async (ctx) => {
  await ctx.answerCbQuery();
  await setupCreatedRoom(ctx, "rps");
});

bot.action("game_reaction", async (ctx) => {
  await ctx.answerCbQuery();
  await setupCreatedRoom(ctx, "reaction");
});

bot.action("join_room", async (ctx) => {
  await ctx.answerCbQuery();
  userState.set(ctx.from.id, { mode: "join" });
  await ctx.reply("🔑 Send the 5-character *room code*:", { parse_mode: "Markdown" });
});

bot.action(/^cancel:(.+)$/, async (ctx) => {
  const code = ctx.match[1];
  const room = rooms.get(code);
  if (!room || room.players[0].id !== ctx.from.id) {
    return ctx.answerCbQuery("Room not found.");
  }
  rooms.delete(code);
  await ctx.answerCbQuery("Room cancelled.");
  await safeEdit(ctx, "❌ Room cancelled.", mainMenu());
});

bot.on("text", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (!state || state.mode !== "join") return;

  const code = ctx.message.text.trim().toUpperCase();
  userState.delete(ctx.from.id);

  const room = rooms.get(code);
  if (!room) return ctx.reply("❌ Room not found. Check the code and try again.", mainMenu());
  if (room.players.length >= 2) return ctx.reply("❌ This room is already full.", mainMenu());
  if (room.players.some((p) => p.id === ctx.from.id)) return ctx.reply("❌ You are already in this room.");

  room.players.push({
    id: ctx.from.id,
    name: ctx.from.first_name || "Player 2",
  });
  room.status = "playing";

  await ctx.reply(`✅ Joined room \`${code}\`!\n🎮 ${gameLabel(room.type)}`, { parse_mode: "Markdown" });

  // Notify player 1 with a new game message.
  await bot.telegram.sendMessage(
    room.players[0].id,
    `🔥 *Opponent joined!*\n\n🎮 ${gameLabel(room.type)}\n👤 ${room.players[0].name} vs ${room.players[1].name}`,
    { parse_mode: "Markdown" }
  );

  if (room.type === "ttt") {
    await sendTtt(room);
  } else if (room.type === "rps") {
    await sendRps(room);
  } else {
    await sendReaction(room);
  }
});

async function sendTtt(room) {
  const text = renderTicTacToe(room);
  const keyboard = Markup.inlineKeyboard(
    room.state.board.map((row, r) =>
      row.map((cell, c) =>
        Markup.button.callback(cell || "⬜", `ttt:${room.code}:${r}:${c}`)
      )
    )
  );
  for (const p of room.players) {
    await bot.telegram.sendMessage(p.id, text, { parse_mode: "Markdown", ...keyboard });
  }
}

bot.action(/^ttt:([^:]+):(\d):(\d)$/, async (ctx) => {
  const [, code, r, c] = ctx.match;
  const room = rooms.get(code);
  if (!room || room.type !== "ttt") return ctx.answerCbQuery("Game expired.");
  const result = tttMove(room, ctx.from.id, Number(r), Number(c));
  await ctx.answerCbQuery(result.message);
  if (!result.ok) return;

  if (result.finished) {
    const resultText = result.winner
      ? `🏆 *${result.winner.name} wins!*\n\n${renderTicTacToe(room)}`
      : `🤝 *Draw!*\n\n${renderTicTacToe(room)}`;
    for (const p of room.players) {
      await bot.telegram.sendMessage(
        p.id,
        resultText,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Play Again", `rematch:${code}`), Markup.button.callback("🏠 Menu", "back_menu")]]) }
      );
    }
    room.status = "finished";
  } else {
    // Send a fresh board message to both players.
    await sendTtt(room);
  }
});

async function sendRps(room) {
  const text = renderRps(room);
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("✊ Rock", `rps:${room.code}:rock`),
      Markup.button.callback("📄 Paper", `rps:${room.code}:paper`),
      Markup.button.callback("✂️ Scissors", `rps:${room.code}:scissors`),
    ],
  ]);
  for (const p of room.players) {
    await bot.telegram.sendMessage(p.id, text, { ...keyboard });
  }
}

bot.action(/^rps:([^:]+):(rock|paper|scissors)$/, async (ctx) => {
  const [, code, choice] = ctx.match;
  const room = rooms.get(code);
  if (!room || room.type !== "rps") return ctx.answerCbQuery("Game expired.");

  const result = rpsMove(room, ctx.from.id, choice);
  await ctx.answerCbQuery(result.message);
  if (!result.finished) return;

  for (const p of room.players) {
    await bot.telegram.sendMessage(
      p.id,
      result.text,
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Play Again", `rematch:${code}`), Markup.button.callback("🏠 Menu", "back_menu")]]) }
    );
  }
  room.status = "finished";
});

async function sendReaction(room) {
  room.state = createReaction();
  const text = renderReaction(room);
  for (const p of room.players) {
    await bot.telegram.sendMessage(
      p.id,
      text,
      Markup.inlineKeyboard([[Markup.button.callback("⚡ START", `reaction_start:${room.code}`)]])
    );
  }
}

bot.action(/^reaction_start:(.+)$/, async (ctx) => {
  const code = ctx.match[1];
  const room = rooms.get(code);
  if (!room || room.type !== "reaction") return ctx.answerCbQuery("Game expired.");
  const result = reactionStart(room, ctx.from.id);
  await ctx.answerCbQuery(result.message);
  if (!result.ok) return;
  if (result.ready) {
    for (const p of room.players) {
      await bot.telegram.sendMessage(p.id, "⏳ Get ready... don't tap yet!");
    }
    setTimeout(async () => {
      room.state.live = true;
      room.state.startedAt = Date.now();
      for (const p of room.players) {
        await bot.telegram.sendMessage(
          p.id,
          "🚨 *TAP NOW! TAP NOW! TAP NOW!*",
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⚡ TAP!", `reaction_tap:${room.code}`)]]) }
        );
      }
    }, 1200 + Math.floor(Math.random() * 2500));
  }
});

bot.action(/^reaction_tap:(.+)$/, async (ctx) => {
  const code = ctx.match[1];
  const room = rooms.get(code);
  if (!room || room.type !== "reaction") return ctx.answerCbQuery("Game expired.");
  const result = reactionTap(room, ctx.from.id);
  await ctx.answerCbQuery(result.message);
  if (!result.finished) return;

  for (const p of room.players) {
    await bot.telegram.sendMessage(
      p.id,
      result.text,
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Play Again", `rematch:${code}`), Markup.button.callback("🏠 Menu", "back_menu")]]) }
    );
  }
  room.status = "finished";
});

bot.action(/^rematch:(.+)$/, async (ctx) => {
  const code = ctx.match[1];
  const room = rooms.get(code);
  if (!room || room.players.length !== 2) return ctx.answerCbQuery("Room expired.");
  room.status = "playing";
  if (room.type === "ttt") {
    room.state = createTicTacToe();
    await ctx.answerCbQuery("New match!");
    await sendTtt(room);
  } else if (room.type === "rps") {
    room.state = createRps();
    await ctx.answerCbQuery("New round!");
    await sendRps(room);
  } else {
    room.state = createReaction();
    await ctx.answerCbQuery("New reaction duel!");
    await sendReaction(room);
  }
});

bot.catch((err) => console.error("BOT ERROR:", err));

bot.launch().then(() => console.log("🎮 Duel Arena is running!"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
