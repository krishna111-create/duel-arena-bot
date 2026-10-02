require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing in .env');
const bot = new Telegraf(token);

const rooms = new Map();
const userRoom = new Map();
const GAME_LIST = [
  ['ttt','Tic-Tac-Toe'],['rps','Rock Paper Scissors'],['reaction','Reaction Duel'],
  ['connect4','Connect Four'],['fourxo','Four XO'],['number','Number Duel'],
  ['higherlower','Higher / Lower'],['dice','Dice Duel'],['oddeven','Odd / Even'],
  ['math','Quick Math'],['color','Color Match'],['highernumber','Higher Number'],
  ['word','Word Scramble'],['memory','Memory Duel'],['coin','Coin Duel']
];
const games = new Map(GAME_LIST);

function code(){ return Math.random().toString(36).slice(2,7).toUpperCase(); }
function playerName(ctx){ return ctx.from.first_name || ctx.from.username || `Player ${ctx.from.id}`; }
function esc(s){ return String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
function roomOf(uid){ const c=userRoom.get(uid); return c ? rooms.get(c) : null; }
function other(room, uid){ return room.players.find(p=>p!==uid); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function rnd(n){ return Math.floor(Math.random()*n); }
function shuffle(a){ return [...a].sort(()=>Math.random()-.5); }

function home(){ return Markup.inlineKeyboard([
  [Markup.button.callback('🎮 Create Room','home:create'),Markup.button.callback('🔑 Join Room','home:join')],
  [Markup.button.callback('📖 How to Play','home:help')]
]); }
function gameButtons(room){
  const rows=[];
  for(let i=0;i<GAME_LIST.length;i+=2){ rows.push(GAME_LIST.slice(i,i+2).map(([id,n])=>Markup.button.callback(n,`pick:${room.code}:${id}`))); }
  rows.push([Markup.button.callback('❌ Cancel','room:cancel')]);
  return Markup.inlineKeyboard(rows);
}
function rematchKeyboard(room){
  const count=room.rematch.size;
  return Markup.inlineKeyboard([[Markup.button.callback(`🔄 Rematch (${count}/2)`,`rematch:${room.code}`)],[Markup.button.callback('🚪 Leave Room',`leave:${room.code}`)]]);
}
function gameInfo(room){
  return `⚔️ <b>${esc(games.get(room.game))}</b>\n\n👤 ${esc(room.names[room.players[0]])}  vs  ${esc(room.names[room.players[1]])}`;
}

async function editPlayer(room, uid, text, keyboard){
  const mid=room.messages[uid]; if(!mid) return;
  try { await bot.telegram.editMessageText(uid, mid, undefined, text, {parse_mode:'HTML', ...keyboard}); }
  catch(e){ if(!String(e.description||e.message).includes('message is not modified')) console.error('edit',uid,e.description||e.message); }
}
async function editAll(room, textFn, keyboardFn){
  await Promise.all(room.players.map(uid=>editPlayer(room,uid,textFn(uid),keyboardFn ? keyboardFn(uid) : undefined)));
}

function playerIndex(room,uid){ return room.players.indexOf(uid); }
function symbol(room,uid){ return playerIndex(room,uid)===0?'X':'O'; }
function currentUid(room){ return room.players[room.state.turn||0]; }

function initGame(room,id){
  room.game=id; room.rematch=new Set(); room.result=null; room.state={turn:0,moves:0};
  switch(id){
    case 'ttt': room.state.board=Array(9).fill(null); break;
    case 'rps': room.state.choices={}; break;
    case 'reaction': room.state.ready=new Set(); room.state.go=false; room.state.taps={}; break;
    case 'connect4': room.state.board=Array(42).fill(null); break;
    case 'fourxo': room.state.board=Array(16).fill(null); break;
    case 'number': room.state.target=rnd(100)+1; room.state.guesses={}; break;
    case 'higherlower': room.state.a=rnd(90)+1; room.state.b=rnd(90)+1; while(room.state.b===room.state.a) room.state.b=rnd(90)+1; room.state.choices={}; break;
    case 'dice': room.state.rolls={}; break;
    case 'oddeven': room.state.choices={}; room.state.n=rnd(6)+1; break;
    case 'math': room.state.q=makeMath(); room.state.answers={}; break;
    case 'color': room.state.round=rnd(6); room.state.answers={}; break;
    case 'highernumber': room.state.a=rnd(100)+1; room.state.b=rnd(100)+1; room.state.answers={}; break;
    case 'word': { const w=WORDS[rnd(WORDS.length)]; room.state.word=w; room.state.scramble=shuffle(w.split('')).join(''); room.state.answers={}; break; }
    case 'memory': room.state.cards=shuffle(['🍎','🍎','🍌','🍌','🍇','🍇','🍉','🍉','🍓','🍓','🥝','🥝','🍒','🍒','🥭','🥭']); room.state.revealed=[]; room.state.matched=[]; room.state.pick={}; room.state.busy=false; break;
    case 'coin': room.state.choices={}; room.state.side=Math.random()<.5?'Heads':'Tails'; break;
  }
}
function makeMath(){ const a=rnd(15)+1,b=rnd(15)+1,op=['+','-','×'][rnd(3)]; return {a,b,op,ans:op==='+'?a+b:op==='-'?a-b:a*b}; }
const WORDS=['planet','rocket','battle','castle','dragon','winner','friend','arena','galaxy','thunder','victory','matrix'];
const COLORS=[['🔴','Red'],['🔵','Blue'],['🟢','Green'],['🟡','Yellow'],['🟣','Purple'],['🟠','Orange']];

function boardRows(board,w,fn){ const rows=[]; for(let i=0;i<board.length;i+=w) rows.push(board.slice(i,i+w).map((v,j)=>Markup.button.callback(v||'·',fn(i+j)))); return rows; }
function winnerLine(room,w){ return w===null?'🤝 <b>Draw!</b>':`🏆 <b>${esc(room.names[room.players[w]])} wins!</b>`; }
function checkLines(board,lines){ for(const [a,b,c] of lines) if(board[a]&&board[a]===board[b]&&board[b]===board[c]) return board[a]; return null; }
function tttWinner(b){ const w=checkLines(b,[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]); return w? (w==='X'?0:1) : b.every(Boolean)?null:undefined; }
function c4Winner(b){ const lines=[]; for(let r=0;r<6;r++)for(let c=0;c<7;c++){let i=r*7+c;if(c<=3)lines.push([i,i+1,i+2,i+3]);if(r<=2)lines.push([i,i+7,i+14,i+21]);if(r<=2&&c<=3)lines.push([i,i+8,i+16,i+24]);if(r<=2&&c>=3)lines.push([i,i+6,i+12,i+18]);} for(const l of lines)if(l.every(i=>b[i]&&b[i]===b[l[0]]))return b[l[0]]==='🔵'?0:1; return b.every(Boolean)?null:undefined; }
function fourxoWinner(b){ const lines=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++){let i=r*4+c;if(c<=1)lines.push([i,i+1,i+2]);if(r<=1)lines.push([i,i+4,i+8]);if(r<=1&&c<=1)lines.push([i,i+5,i+10]);if(r<=1&&c>=2)lines.push([i,i+3,i+6]);}for(const l of lines)if(l.every(i=>b[i]&&b[i]===b[l[0]]))return b[l[0]]==='❌'?0:1;return b.every(Boolean)?null:undefined;}

function render(room,uid){
  const s=room.state, idx=playerIndex(room,uid), turn=currentUid(room);
  let text=gameInfo(room)+'\n\n'; let kb;
  if(room.result!==null){ return {text:text+room.result, kb:rematchKeyboard(room)}; }
  switch(room.game){
    case 'ttt': text+=`You are <b>${symbol(room,uid)}</b>.\n${turn===uid?'👉 Your turn':'⏳ Waiting for opponent'}\n\n${s.board.map((v,i)=>v||String(i+1)).join(' │ ').replace(/(.{9})/g,'$1\n')}`; kb=Markup.inlineKeyboard(boardRows(s.board,3,i=>`move:${room.code}:ttt:${i}`)); break;
    case 'rps': text+=s.choices[uid]?`You chose <b>${s.choices[uid]}</b>.\n⏳ Waiting for opponent...`:`Choose your move:`; kb=Markup.inlineKeyboard([['🪨 Rock','📄 Paper','✂️ Scissors'].map((x,i)=>Markup.button.callback(x,`move:${room.code}:rps:${i}`))]); break;
    case 'reaction': text+=!s.go?`Both players press READY. When GO appears, press TAP as fast as you can.\n\n${s.ready.size}/2 ready`:`⚡ <b>GO!</b> TAP NOW!`; kb=Markup.inlineKeyboard([[Markup.button.callback(!s.go?'✅ READY':'⚡ TAP!',`move:${room.code}:reaction:tap`)]]); break;
    case 'connect4': text+=`You are ${idx===0?'🔵':'🟡'}.\n${turn===uid?'👉 Your turn':'⏳ Waiting for opponent'}\n\n`; kb=Markup.inlineKeyboard([[0,1,2,3,4,5,6].map(c=>Markup.button.callback(String(c+1),`move:${room.code}:connect4:${c}`))]); text+=renderC4(s.board); break;
    case 'fourxo': text+=`You are ${idx===0?'❌':'⭕'}.\n${turn===uid?'👉 Your turn':'⏳ Waiting for opponent'}\n\n`; kb=Markup.inlineKeyboard(boardRows(s.board,4,i=>`move:${room.code}:fourxo:${i}`)); break;
    case 'number': text+=`🎯 Target is between 1 and 100.\nEach player chooses a number; closest wins.\n\n${s.guesses[uid]?'Your pick: '+s.guesses[uid]:'Choose:'}`; kb=Markup.inlineKeyboard(numberRows(room.code,1,100)); break;
    case 'higherlower': text+=`Which number is higher?\n\n🔹 ${s.a}      🔸 ${s.b}`; kb=Markup.inlineKeyboard([[Markup.button.callback(String(s.a),`move:${room.code}:higherlower:a`),Markup.button.callback(String(s.b),`move:${room.code}:higherlower:b`)]]); break;
    case 'dice': text+=`🎲 Roll your die.\n${s.rolls[uid]?'Your roll: '+s.rolls[uid]:'Choose Roll.'}`; kb=Markup.inlineKeyboard([[Markup.button.callback('🎲 Roll','move:'+room.code+':dice:roll')]]); break;
    case 'oddeven': text+=`Number: <b>${s.n}</b>\nChoose Odd or Even.`; kb=Markup.inlineKeyboard([[Markup.button.callback('Odd',`move:${room.code}:oddeven:Odd`),Markup.button.callback('Even',`move:${room.code}:oddeven:Even`)]]); break;
    case 'math': text+=`Solve: <b>${s.q.a} ${s.q.op} ${s.q.b} = ?</b>`; kb=Markup.inlineKeyboard(mathRows(room.code,s.q.ans)); break;
    case 'color': {const [emoji,name]=COLORS[s.round]; text+=`Match the color!\n\nTarget: <b>${name}</b> ${emoji}`; kb=Markup.inlineKeyboard(COLORS.map(([e,n])=>Markup.button.callback(e,`move:${room.code}:color:${n}`)).reduce((a,x,i)=>(i%3?a[a.length-1].push(x):a.push([x]),a),[]));break;}
    case 'highernumber': text+=`Which number is higher?\n\n<b>${s.a}</b>  vs  <b>${s.b}</b>`; kb=Markup.inlineKeyboard([[Markup.button.callback(String(s.a),`move:${room.code}:highernumber:a`),Markup.button.callback(String(s.b),`move:${room.code}:highernumber:b`)]]);break;
    case 'word': text+=`Unscramble:\n\n🔤 <b>${s.scramble.toUpperCase()}</b>`; kb=Markup.inlineKeyboard(shuffle(WORDS.filter(w=>w.length===s.word.length)).slice(0,6).map(w=>Markup.button.callback(w,`move:${room.code}:word:${w}`)).reduce((a,x,i)=>(i%2?a[a.length-1].push(x):a.push([x]),a),[]));break;
    case 'memory': text+=`Find matching pairs.\nMatched: ${s.matched.length/2}/8\n\n`; kb=Markup.inlineKeyboard(boardRows(s.cards.map((v,i)=>s.revealed.includes(i)||s.matched.includes(i)?v:'❔'),4,i=>`move:${room.code}:memory:${i}`));break;
    case 'coin': text+=`🪙 Guess the coin side:`; kb=Markup.inlineKeyboard([[Markup.button.callback('Heads',`move:${room.code}:coin:Heads`),Markup.button.callback('Tails',`move:${room.code}:coin:Tails`)]]);break;
  }
  return {text,kb};
}
function numberRows(code,min,max){ const nums=shuffle(Array.from({length:max-min+1},(_,i)=>i+min)).slice(0,12); return Markup.inlineKeyboard(nums.reduce((a,n,i)=>(i%4?a[a.length-1].push(Markup.button.callback(String(n),`move:${code}:number:${n}`)):a.push([Markup.button.callback(String(n),`move:${code}:number:${n}`)]),a))); }
function mathRows(code,ans){const vals=shuffle([ans,ans+1,ans-1,ans+2,ans-2,ans+3,ans+4,ans-3]).slice(0,6);return Markup.inlineKeyboard(vals.reduce((a,n,i)=>(i%3?a[a.length-1].push(Markup.button.callback(String(n),`move:${code}:math:${n}`)):a.push([Markup.button.callback(String(n),`move:${code}:math:${n}`)]),a)));}
function renderC4(b){let out='';for(let r=0;r<6;r++)out+=b.slice(r*7,r*7+7).map(x=>x||'⚪').join('')+'\n';return out;}

async function showGame(room){ await editAll(room,()=>render(room,0).text,()=>render(room,room.players[0]).kb); }
async function showCurrent(room){ await Promise.all(room.players.map(uid=>{const r=render(room,uid);return editPlayer(room,uid,r.text,r.kb);})); }
function finish(room, winnerText){ room.result=winnerText; room.rematch=new Set(); }

async function handleMove(ctx,room,uid,game,arg){
  if(room.game!==game) return;
  const s=room.state, idx=playerIndex(room,uid);
  if(room.result!==null){ await ctx.answerCbQuery('Game finished. Use Rematch.'); return; }
  if(['ttt','connect4','fourxo'].includes(game) && currentUid(room)!==uid){ await ctx.answerCbQuery('Wait for your turn.'); return; }
  switch(game){
    case 'ttt': if(s.board[arg])return ctx.answerCbQuery('Already used.'); s.board[arg]=symbol(room,uid); s.moves++; {const w=tttWinner(s.board);if(w!==undefined){finish(room,winnerLine(room,w));}else s.turn=1-s.turn;} break;
    case 'rps': if(s.choices[uid])return; s.choices[uid]=['Rock','Paper','Scissors'][Number(arg)]; if(Object.keys(s.choices).length===2){const [a,b]=room.players;const x=s.choices[a],y=s.choices[b];let res=x===y?'🤝 Draw!':((x==='Rock'&&y==='Scissors')||(x==='Paper'&&y==='Rock')||(x==='Scissors'&&y==='Paper'))?`🏆 <b>${esc(room.names[a])} wins!</b>`:`🏆 <b>${esc(room.names[b])} wins!</b>`;finish(room,res);} break;
    case 'reaction': if(!s.go){s.ready.add(uid);if(s.ready.size===2){s.go=true;setTimeout(async()=>{if(room.state.go&&!room.result){room.state.startedAt=Date.now();await showCurrent(room);}},1200);}}else if(!s.taps[uid]){s.taps[uid]=Date.now();if(Object.keys(s.taps).length===2){const a=room.players[0],b=room.players[1];finish(room,`🏆 <b>${esc(room.names[s.taps[a]<s.taps[b]?a:b])} wins!</b>`);}} break;
    case 'connect4': {let col=Number(arg);let row=-1;for(let r=5;r>=0;r--)if(!s.board[r*7+col]){row=r;break;}if(row<0)return ctx.answerCbQuery('Column full.');s.board[row*7+col]=idx===0?'🔵':'🟡';const w=c4Winner(s.board);if(w!==undefined)finish(room,winnerLine(room,w));else s.turn=1-s.turn;}break;
    case 'fourxo': if(s.board[arg])return ctx.answerCbQuery('Already used.');s.board[arg]=idx===0?'❌':'⭕';const w=fourxoWinner(s.board);if(w!==undefined)finish(room,winnerLine(room,w));else s.turn=1-s.turn;break;
    case 'number': if(s.guesses[uid])return;s.guesses[uid]=Number(arg);if(Object.keys(s.guesses).length===2){const a=room.players[0],b=room.players[1];const da=Math.abs(s.guesses[a]-s.target),db=Math.abs(s.guesses[b]-s.target);finish(room,da===db?'🤝 <b>Draw!</b>':winnerLine(room,da<db?0:1)+`\n🎯 Target: <b>${s.target}</b>`);} break;
    case 'higherlower': if(s.choices[uid])return;s.choices[uid]=arg; if(Object.keys(s.choices).length===2){const correct=s.a>s.b?'a':'b';const winners=room.players.filter(p=>s.choices[p]===correct);finish(room,winners.length===2?'🤝 <b>Both correct!</b>':winners.length===1?`🏆 <b>${esc(room.names[winners[0]])} wins!</b>`:'💥 <b>Both wrong!</b>');} break;
    case 'dice': if(s.rolls[uid])return;s.rolls[uid]=rnd(6)+1;if(Object.keys(s.rolls).length===2){const a=room.players[0],b=room.players[1];finish(room,s.rolls[a]===s.rolls[b]?`🤝 <b>Draw! Both rolled ${s.rolls[a]}</b>`:`🏆 <b>${esc(room.names[s.rolls[a]>s.rolls[b]?a:b])} wins!</b>`);}break;
    case 'oddeven': if(s.choices[uid])return;s.choices[uid]=arg;if(Object.keys(s.choices).length===2){const sum=s.n+(rnd(6)+1), correct=sum%2?'Odd':'Even';const wins=room.players.filter(p=>s.choices[p]===correct);finish(room,wins.length===1?`🏆 <b>${esc(room.names[wins[0]])} wins!</b>\n🎲 Total: ${sum}`:'🤝 <b>Draw / no winner!</b>');}break;
    case 'math': if(s.answers[uid])return;s.answers[uid]=Number(arg);if(Object.keys(s.answers).length===2){const a=room.players[0],b=room.players[1],wa=s.answers[a]===s.q.ans,wb=s.answers[b]===s.q.ans;finish(room,wa&&!wb?`🏆 <b>${esc(room.names[a])} wins!</b>`:wb&&!wa?`🏆 <b>${esc(room.names[b])} wins!</b>`:wa&&wb?'🤝 <b>Both correct!</b>':'💥 <b>Both wrong!</b>');}break;
    case 'color': if(s.answers[uid])return;s.answers[uid]=arg;if(Object.keys(s.answers).length===2){const correct=COLORS[s.round][1],wins=room.players.filter(p=>s.answers[p]===correct);finish(room,wins.length===1?`🏆 <b>${esc(room.names[wins[0]])} wins!</b>`:'🤝 <b>Draw!</b>');}break;
    case 'highernumber': if(s.answers[uid])return;s.answers[uid]=arg;if(Object.keys(s.answers).length===2){const correct=s.a>s.b?'a':s.b>s.a?'b':'tie';const wins=room.players.filter(p=>s.answers[p]===correct);finish(room,wins.length===1?`🏆 <b>${esc(room.names[wins[0]])} wins!</b>`:wins.length===2?'🤝 <b>Both correct!</b>':'🤝 <b>Draw!</b>');}break;
    case 'word': if(s.answers[uid])return;s.answers[uid]=arg;if(Object.keys(s.answers).length===2){const wins=room.players.filter(p=>s.answers[p]===s.word);finish(room,wins.length===1?`🏆 <b>${esc(room.names[wins[0]])} wins!</b>`:'🤝 <b>Draw!</b>');}break;
    case 'memory': if(s.busy||s.matched.includes(Number(arg)))return;s.revealed.push(Number(arg));s.pick[uid]=Number(arg);if(s.revealed.length===2){s.busy=true;const [a,b]=s.revealed;if(s.cards[a]===s.cards[b]){s.matched.push(a,b);s.revealed=[];s.busy=false;s.pick={};s.turn=idx;if(s.matched.length===16){finish(room,`🏆 <b>${esc(room.names[uid])} found the final pair and wins!</b>`);}}else{await showCurrent(room);await sleep(800);s.revealed=[];s.busy=false;s.pick={};s.turn=1-idx;} } break;
    case 'coin': if(s.choices[uid])return;s.choices[uid]=arg;if(Object.keys(s.choices).length===2){const wins=room.players.filter(p=>s.choices[p]===s.side);finish(room,wins.length===1?`🏆 <b>${esc(room.names[wins[0]])} wins!</b>\n🪙 ${s.side}`:wins.length===2?'🤝 <b>Both guessed correctly!</b>':`💥 <b>Nobody guessed correctly.</b>\n🪙 ${s.side}`);}break;
  }
  await showCurrent(room); await ctx.answerCbQuery();
}

bot.start(async ctx=>{
  const old=roomOf(ctx.from.id); if(old) return ctx.reply('⚔️ You are already in a room. Finish or leave it first.');
  await ctx.reply('⚔️ <b>Duel Arena</b>\n\nPlay fast 2-player games with a friend.\n\n🎮 Create a room or join one with a code.',{parse_mode:'HTML',...home()});
});
bot.action('home:create',async ctx=>{const uid=ctx.from.id;if(roomOf(uid))return ctx.answerCbQuery('You are already in a room.');let c=code();while(rooms.has(c))c=code();const room={code:c,players:[uid],names:{[uid]:playerName(ctx)},messages:{},rematch:new Set(),game:null,selectedGame:null,state:null,result:null};rooms.set(c,room);userRoom.set(uid,c);const m=await ctx.editMessageText(`⚔️ <b>Duel Arena Room</b>\n\n🔐 Room Code: <code>${c}</code>\n\nSend this code to your friend.\n\n🎮 <b>Choose your game now:</b>\nYour selection will be used when your friend joins.`,{parse_mode:'HTML',...gameButtons(room)});room.messages[uid]=m.message_id;await ctx.answerCbQuery();});
bot.action('home:join',async ctx=>{await ctx.editMessageText('🔑 <b>Join Room</b>\n\nSend the 5-character room code in chat.',{parse_mode:'HTML',...Markup.inlineKeyboard([[Markup.button.callback('↩️ Back','back:home')]])});await ctx.answerCbQuery();});
bot.action('home:help',async ctx=>{await ctx.editMessageText('📖 <b>How to Play</b>\n\n1. Create a room.\n2. Share the code.\n3. Friend joins.\n4. Pick a game.\n5. Play using the buttons.\n6. Both players can press Rematch.\n\nAll game moves update the existing game message instead of sending a new game screen.',{parse_mode:'HTML',...Markup.inlineKeyboard([[Markup.button.callback('↩️ Back','back:home')]])});await ctx.answerCbQuery();});
bot.action('back:home',async ctx=>{await ctx.editMessageText('⚔️ <b>Duel Arena</b>\n\nChoose an option:',{parse_mode:'HTML',...home()});await ctx.answerCbQuery();});

bot.on('text',async ctx=>{
  const uid=ctx.from.id;
  const t=ctx.message.text.trim().toUpperCase();
  const existing=roomOf(uid);
  if(existing) return ctx.reply('Use the buttons in your current room, or /cancel to leave it.');
  if(/^[A-Z0-9]{5}$/.test(t) && rooms.has(t)){
    const r=rooms.get(t);
    if(r.players.length>=2) return ctx.reply('❌ Room is full.');
    r.players.push(uid);
    r.names[uid]=playerName(ctx);
    userRoom.set(uid,t);
    const m=await ctx.reply(`⚔️ <b>Joined Duel Arena</b>\n\n🔐 Room Code: <code>${t}</code>\n👥 ${r.players.map(x=>esc(r.names[x])).join(' vs ')}\n\n⏳ Preparing the duel...`,{parse_mode:'HTML'});
    r.messages[uid]=m.message_id;
    if(r.selectedGame){
      initGame(r,r.selectedGame);
      await showCurrent(r);
    } else {
      await Promise.all(r.players.map(p=>editPlayer(r,p,`⚔️ <b>Duel Arena</b>\n\n👥 ${r.players.map(x=>esc(r.names[x])).join(' vs ')}\n\n🎮 <b>Choose a game:</b>`,gameButtons(r))));
    }
    return;
  }
  await ctx.reply('❌ Invalid room code. Send the 5-character code your friend shared.');
});
bot.action('room:cancel',async ctx=>{const uid=ctx.from.id,room=roomOf(uid);if(!room)return ctx.answerCbQuery('No active room.');for(const p of room.players)userRoom.delete(p);rooms.delete(room.code);await ctx.editMessageText('❌ Room cancelled.\n\nUse /start to create or join another room.');await ctx.answerCbQuery();});
bot.action(/^pick:(.+):(.+)$/,async ctx=>{
  const [,code,id]=ctx.match;
  const room=rooms.get(code);
  const uid=ctx.from.id;
  if(!room||!room.players.includes(uid)) return ctx.answerCbQuery('Room not found.');
  if(room.players[0]!==uid) return ctx.answerCbQuery('Only the room creator can choose the game.');
  if(!games.has(id)) return ctx.answerCbQuery('Unknown game.');
  room.selectedGame=id;
  room.result=null;
  room.rematch=new Set();
  if(room.players.length<2){
    await editPlayer(room,uid,`⚔️ <b>Duel Arena Room</b>\n\n🔐 Room Code: <code>${room.code}</code>\n\n🎮 Selected: <b>${esc(games.get(id))}</b>\n\n⏳ Waiting for your friend to join...`,Markup.inlineKeyboard([[Markup.button.callback('🔄 Change Game','change:game')],[Markup.button.callback('❌ Cancel Room','room:cancel')]]));
    return ctx.answerCbQuery(`${games.get(id)} selected.`);
  }
  initGame(room,id);
  await showCurrent(room);
  await ctx.answerCbQuery(`Starting ${games.get(id)}...`);
});
bot.action('change:game',async ctx=>{
  const room=roomOf(ctx.from.id);
  if(!room||room.players[0]!==ctx.from.id) return ctx.answerCbQuery('Only the room creator can change the game.');
  if(room.state||room.game) return ctx.answerCbQuery('The game has already started.');
  room.selectedGame=null;
  await editPlayer(room,ctx.from.id,`⚔️ <b>Duel Arena Room</b>\n\n🔐 Room Code: <code>${room.code}</code>\n\n🎮 <b>Choose a game:</b>`,gameButtons(room));
  await ctx.answerCbQuery();
});
bot.action(/^move:(.+):(.+):(.+)$/,async ctx=>{const [,code,game,arg]=ctx.match,room=rooms.get(code);if(!room||!room.players.includes(ctx.from.id))return ctx.answerCbQuery('Room not found.');await handleMove(ctx,room,ctx.from.id,game,arg);});
bot.action(/^rematch:(.+)$/,async ctx=>{const room=rooms.get(ctx.match[1]),uid=ctx.from.id;if(!room||!room.players.includes(uid))return ctx.answerCbQuery('Room not found.');if(room.result===null)return ctx.answerCbQuery('Finish the game first.');if(room.rematch.has(uid))return ctx.answerCbQuery('You already requested rematch.');room.rematch.add(uid);if(room.rematch.size<2){room.result=`🔄 <b>${esc(room.names[uid])} wants a rematch.</b>\n\nWaiting for the other player...`;await showCurrent(room);return ctx.answerCbQuery('Rematch requested.');}const g=room.game;initGame(room,g);await showCurrent(room);await ctx.answerCbQuery('Rematch started!');});
bot.action(/^leave:(.+)$/,async ctx=>{const room=rooms.get(ctx.match[1]),uid=ctx.from.id;if(!room||!room.players.includes(uid))return ctx.answerCbQuery('Room not found.');for(const p of room.players)userRoom.delete(p);rooms.delete(room.code);await ctx.editMessageText('🚪 You left the room.\n\nUse /start to play again.');await ctx.answerCbQuery();});
bot.command('help',ctx=>ctx.reply('⚔️ Duel Arena\n\nCreate a room, share the code, pick one of 15 games and duel.\n\nMoves edit the same Telegram game message. Rematch requires both players.'));
bot.command('cancel',async ctx=>{const room=roomOf(ctx.from.id);if(!room)return ctx.reply('No active room.');for(const p of room.players)userRoom.delete(p);rooms.delete(room.code);ctx.reply('❌ Room cancelled.');});

bot.catch(err=>console.error('BOT ERROR:',err));
bot.launch().then(()=>console.log('🎮 Duel Arena v2.0 is running!')).catch(err=>console.error('Launch failed:',err));
process.once('SIGINT',()=>bot.stop('SIGINT'));process.once('SIGTERM',()=>bot.stop('SIGTERM'));
