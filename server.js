const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const QUESTION_BANK = [
  {q:"Which planet is known as the Red Planet?", a:["Mars","Venus","Jupiter","Mercury"], correct:0, type:"mc"},
  {q:"What is the largest ocean on Earth?", a:["Atlantic","Indian","Pacific","Arctic"], correct:2, type:"mc"},
  {q:"Which animal is known for changing its color to blend in?", a:["Elephant","Chameleon","Penguin","Giraffe"], correct:1, type:"mc"},
  {q:"What is 12 × 8?", a:["86","96","108","112"], correct:1, type:"mc"},
  {q:"Which country invented pizza in its modern form?", a:["Italy","France","Spain","Greece"], correct:0, type:"mc"},
  {q:"What gas do plants primarily absorb from the atmosphere?", a:["Oxygen","Hydrogen","Carbon dioxide","Nitrogen"], correct:2, type:"mc"},
  {q:"Who painted the Mona Lisa?", a:["Van Gogh","Leonardo da Vinci","Picasso","Michelangelo"], correct:1, type:"mc"},
  {q:"Which is the fastest land animal?", a:["Lion","Cheetah","Horse","Falcon"], correct:1, type:"mc"},
  {q:"What is the capital of Japan?", a:["Kyoto","Osaka","Tokyo","Hiroshima"], correct:2, type:"mc"},
  {q:"How many sides does a hexagon have?", a:["5","6","7","8"], correct:1, type:"mc"},
  {q:"Which sport uses a shuttlecock?", a:["Tennis","Badminton","Squash","Volleyball"], correct:1, type:"mc"},
  {q:"What is the chemical symbol for gold?", a:["Ag","Gd","Au","Go"], correct:2, type:"mc"},
  {q:"Name the fictional wizard who attends Hogwarts.", a:null, answer:"Harry Potter", type:"text"},
  {q:"Name the largest continent.", a:null, answer:"Asia", type:"text"},
  {q:"What is the opposite of 'ancient'?", a:null, answer:"modern", type:"text"},
  {q:"Name the primary star at the center of our solar system.", a:null, answer:"Sun", type:"text"}
];

function code() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function cleanName(name) {
  return String(name || "Player").trim().slice(0, 18) || "Player";
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    totalRounds: 8,
    question: room.status === "question" ? {
      q: room.question.q,
      a: room.question.a,
      type: room.question.type,
      timer: room.question.type === "text" ? 25 : 15
    } : null,
    questionStartedAt: room.questionStartedAt,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, score:p.score, eliminated:p.eliminated,
      locked: room.status === "question" ? !!p.wager : false,
      answered: room.status === "question" ? !!p.answer : false
    })),
    finalWagers: room.status === "final_wager" ? room.finalWagers : null,
    winner: room.winner || null
  };
}

function broadcast(room) {
  io.to(room.code).emit("state", publicState(room));
}

function nextQuestion(room) {
  if (room.round >= 8) {
    room.status = "final_wager";
    room.finalWagers = {};
    broadcast(room);
    return;
  }
  room.round++;
  const q = QUESTION_BANK[(room.round - 1) % QUESTION_BANK.length];
  room.question = q;
  room.questionStartedAt = Date.now();
  room.status = "question";
  room.players.forEach(p => { p.wager = null; p.answer = null; p.correct = null; });
  broadcast(room);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => resolveQuestion(room), q.type === "text" ? 25000 : 15000);
}

function resolveQuestion(room) {
  if (room.status !== "question") return;
  room.players.forEach(p => {
    if (p.eliminated) return;
    const risk = p.wager || 0;
    let correct = false;
    if (p.answer !== null && p.answer !== undefined) {
      correct = room.question.type === "mc"
        ? Number(p.answer) === room.question.correct
        : normalize(p.answer) === normalize(room.question.answer);
    }
    p.correct = correct;
    if (risk > 0) p.score += correct ? risk : -risk;
    if (p.score <= 0) { p.score = 0; p.eliminated = true; }
  });
  room.status = "reveal";
  broadcast(room);
  clearTimeout(room.timer);
  room.timer = setTimeout(() => nextQuestion(room), 2500);
}

function finishFinal(room) {
  for (const p of room.players.values()) {
    const wager = Number(room.finalWagers[p.id] || 0);
    const correct = p.finalAnswer === "correct";
    p.score = Math.max(0, p.score + (correct ? wager : -wager));
  }
  const active = [...room.players.values()].filter(p => !p.eliminated || p.score > 0);
  const ranked = [...active].sort((a,b) => b.score - a.score);
  room.winner = ranked[0] ? {name: ranked[0].name, score: ranked[0].score} : null;
  room.status = "finished";
  broadcast(room);
}

io.on("connection", socket => {
  socket.on("create", ({name, mode}) => {
    let c = code();
    while (rooms.has(c)) c = code();
    const room = {
      code:c, hostId:socket.id, mode:mode || "mixed", status:"lobby",
      round:0, players:new Map(), question:null, timer:null,
      finalWagers:{}, winner:null
    };
    room.players.set(socket.id, {id:socket.id, name:cleanName(name), score:1000, eliminated:false, wager:null, answer:null});
    rooms.set(c, room);
    socket.join(c);
    socket.emit("roomCreated", {code:c});
    broadcast(room);
  });

  socket.on("join", ({code, name}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) return socket.emit("errorMsg", "Room not found.");
    if (room.players.size >= 8) return socket.emit("errorMsg", "Room is full.");
    if (room.status === "finished") return socket.emit("errorMsg", "That game has finished.");
    room.players.set(socket.id, {id:socket.id, name:cleanName(name), score:1000, eliminated:false, wager:null, answer:null});
    socket.join(room.code);
    broadcast(room);
  });

  socket.on("start", () => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room || room.status !== "lobby" || room.players.size < 2) return;
    room.status = "countdown";
    room.countdownUntil = Date.now() + 30000;
    broadcast(room);
    clearTimeout(room.timer);
    room.timer = setTimeout(() => nextQuestion(room), 30000);
  });

  socket.on("wager", amount => {
    const room = [...rooms.values()].find(r => r.players.has(socket.id));
    if (!room || room.status !== "question") return;
    const p = room.players.get(socket.id);
    if (!p || p.eliminated) return;
    const allowed = [0.10,0.25,0.50,1];
    const pct = Number(amount);
    if (!allowed.includes(pct)) return;
    p.wager = Math.round(p.score * pct);
    broadcast(room);
  });

  socket.on("answer", answer => {
    const room = [...rooms.values()].find(r => r.players.has(socket.id));
    if (!room || room.status !== "question") return;
    const p = room.players.get(socket.id);
    if (!p || p.eliminated || p.answer !== null) return;
    p.answer = answer;
    broadcast(room);
    const eligible = [...room.players.values()].filter(x => !x.eliminated);
    if (eligible.length && eligible.every(x => x.answer !== null && x.wager !== null)) resolveQuestion(room);
  });

  socket.on("finalWager", amount => {
    const room = [...rooms.values()].find(r => r.players.has(socket.id));
    if (!room || room.status !== "final_wager") return;
    const p = room.players.get(socket.id);
    const n = Math.max(0, Math.min(Number(amount) || 0, p.score));
    room.finalWagers[socket.id] = Math.round(n);
    broadcast(room);
  });

  socket.on("finalAnswer", answer => {
    const room = [...rooms.values()].find(r => r.players.has(socket.id));
    if (!room || room.status !== "final_wager") return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.finalAnswer = answer === "correct" ? "correct" : "wrong";
    const active = [...room.players.values()].filter(x => !x.eliminated);
    if (active.every(x => x.finalAnswer)) finishFinal(room);
    else broadcast(room);
  });

  socket.on("disconnect", () => {
    for (const [c, room] of rooms) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if (room.hostId === socket.id) {
        const next = room.players.values().next().value;
        if (next) room.hostId = next.id;
      }
      if (!room.players.size) {
        clearTimeout(room.timer);
        rooms.delete(c);
      } else broadcast(room);
    }
  });
});

server.listen(PORT, () => console.log(`Risk It running on port ${PORT}`));
