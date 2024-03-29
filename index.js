import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
  },
});

let players = new Map();
let lobbies = [];
const startCountdown = 10;
const maxTime = 20;
const fps = 30;

function onRequestGame(socket, language) {
  var player = players.get(socket.id);
  player.language = language;
  players.set(socket.id, player);
  console.log("User looking for game with language : " + language);

  let foundLobby = null;
  if (lobbies != null || lobbies != undefined) {
    lobbies.forEach((lobby) => {
      if (lobby.language == language) {
        if (lobby.players.length <= 8) {
          foundLobby = lobby;
        }
      }
    });
  }
  if (foundLobby === null) {
    let newLobby = {
      code: Math.floor(1000 + Math.random() * 9000).toString(),
      players: [],
      language: language,
      state: "waiting",
      currentPlayerId: -1,
      currentPlayerIndex: -1,
      time: maxTime,
      maxTime: maxTime,
    };
    lobbies.push(newLobby);
    console.log("there is no avaible lobby for this user", newLobby.code)
    foundLobby = newLobby;
  }
  socket.emit("lobby-found", foundLobby.code);
}

function joinLobby(socket, code) {
  console.log("player wants to join lobby with code", code);
  var player = players.get(socket.id);
  const lobby = lobbies.find((lobby) => lobby.code === code);
  console.log(lobby.maxTime);
  lobby.players.push(player);
  player.lobby = code;
  io.to(code).emit("player-joined-lobby", player);
  socket.join(code);
  console.log("player joined lobby", code);
  socket.emit("lobby-joined", lobby);
  if (lobby.players.length >= 2 && lobby.state === "waiting") {
    startLobby(lobby);
  }
}
function startLobby(lobby) {
  lobby.time = maxTime;
  lobby.maxTime = maxTime;

  console.log("startLobby maxTime:" + lobby.maxTime);
  lobby.state = "countdown";
  io.to(lobby.code).emit("start-countdown", startCountdown);
  setTimeout(() => {
    startRoom(lobby);
  }, startCountdown * 1000);
}
function login(socket, name) {
  if (name.length < 3 || name.length > 12) {
    return;
  }
  let player = players.get(socket.id);
  player.id = socket.id;
  player.name = name;
  player.lobby = null;
  player.language = "en";
  player.heart = 2;
  player.eliminated = false;
  players.set(socket.id, player);
  socket.emit("logged-in");
}
io.on("connection", (socket) => {

  let player = {
    id: socket.id,
    name: "",
    lobby: null,
    language: "en",
    heart: 2,
    eliminated: false,
  };
  players.set(socket.id, player);

  socket.on("looking-for-game", (language) => {
    onRequestGame(socket, language);
  });
  socket.on("join-lobby", (code) => {
    joinLobby(socket, code);
  });
  socket.on("login", (name) => {
    login(socket, name);
  });
  socket.on("disconnect", () => {
    leaveLobby(socket);
    if (players.delete(socket.id)) {
      console.log("User disconnected " + players.size);
    }
  });
});

function leaveLobby(socket) {
  const player = players.get(socket.id);
  if (player === undefined || player == null) {
    console.log("player doesnt exist");
    return;
  }
  if (player.lobby === null) {
    console.log("player is not in a lobby");
    return;
  }
  for (let i = 0; i < lobbies.length; i++) {
    if (player.lobby == lobbies[i].code) {
      const lobby = lobbies[i];
      socket.leave(lobby.code);

      lobby.players = lobby.players.filter((player) => player.id !== socket.id);

      console.log("player left the room");
      if (lobby.players.length === 0) {
        lobbies = lobbies.filter((l) => l.code !== lobby.code);
        console.log("removing empty lobby");
        console.log("new lobby count", lobbies.length);
        return;
      }

      io.to(lobby.code).emit("player-left-lobby", {
        id: socket.id,
      });

      if (lobby.state === "game") {
        if (lobby.players.length === 1) {
          console.log("only one player left game over", lobby.players[0].id);
          gameOver(lobby);
        }
        if (lobby.currentPlayerId === socket.id) {
          changeTurn(lobby);
        }
      }
    }
  }
}

function gameOver(lobby) {
  lobby.state = "ending";
  if (lobby.players.length > 1) {
    var winner = lobby.players.filter((player) => !player.eliminated);
    if (winner.length == 0) {
      console.log("Can't find any winner! Resetting Lobby! This is an error!");
      reset(lobby);
    } else {
      io.to(lobby.code).emit("game-over", winner[0].id);
    }
  }
  setTimeout(() => {
    reset(lobby);
  }, 3000);
}

function reset(lobby) {
  lobby.currentPlayerId = -1;
  lobby.currentPlayerIndex = -1;
  for (let i = 0; i < lobby.players.length; i++) {
    lobby.players[i].heart = 2;
    lobby.players[i].eliminated = false;
  }
  lobby.time = maxTime;
  lobby.state = "waiting";
  io.to(lobby.code).emit("reset");
}

function startRoom(lobby) {
  lobby.currentPlayerIndex = Math.floor(Math.random() * lobby.players.length);
  const randomPlayer = lobby.players[lobby.currentPlayerIndex];
  lobby.currentPlayerId = randomPlayer.id;
  lobby.state = "game";
  io.to(lobby.code).emit("start-game", lobby.currentPlayerId);
}

function eliminatePlayer(lobby, player) {
  player.eliminated = true;
  io.to(lobby.code).emit("eliminate", { id: player.id });
  console.log("player eliminated", player.name);
}

function lobyTimeout(lobby) {
  if (lobby.state === "game") {
    var currentPlayer = lobby.players[lobby.currentPlayerIndex];
    currentPlayer.heart -= 1;
    if (currentPlayer.heart === 0) {
      eliminatePlayer(lobby, currentPlayer);
    }
    else {
      io.to(lobby.code).emit("heart", { id: currentPlayer.id, heart: currentPlayer.heart });
    }
    changeTurn(lobby);
  }
}

function changeTurn(lobby) {
  var alivePlayers = lobby.players.filter((player) => !player.eliminated);
  if (alivePlayers.length >= 2) {
    let newIndex = -1;
    do {
      lobby.currentPlayerIndex += 1;
      newIndex = lobby.currentPlayerIndex % lobby.players.length;
    }
    while (lobby.players[newIndex].eliminated);
    lobby.currentPlayerIndex = newIndex;
    lobby.currentPlayerId = lobby.players[newIndex].id;
    console.log("turn changed to player", lobby.players[newIndex].name);

    lobby.maxTime = lobby.maxTime - 1;
    lobby.time = lobby.maxTime;
    io.to(lobby.code).emit("turn-changed",
      {
        currentPlayerId: lobby.currentPlayerId,
        maxTime: lobby.maxTime,
        time: lobby.time
      });
  }
  else {
    gameOver(lobby);
    return;
  }
}
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

function onUpdate(frame) {
  for (let lobby of lobbies) {
    if (lobby.state === "game") {
      if (lobby.time <= 0) {
        lobyTimeout(lobby);
      }
      else {
        lobby.time -= 1 / fps;
        if (frame % 15 == 0) {
          io.to(lobby.code).emit("time", lobby.time);
        }
      }
    }
    if (lobby.players.length >= 2 && lobby.state === "waiting") {
      startLobby(lobby);
    }
  }
}

const funcs = [];

const skip = Symbol('skip');
const start = Date.now();
let time = start;

const animFrame = () => {
  const fns = funcs.slice();
  funcs.length = 0;

  const t = Date.now();
  const dt = t - start;
  const t1 = 1e3 / fps;

  for (const f of fns)
    if (f !== skip) f(dt);

  while (time <= t + t1 / 4) time += t1;
  setTimeout(animFrame, time - t);
};

const requestAnimationFrame = func => {
  funcs.push(func);
  return funcs.length - 1;
};

const cancelAnimationFrame = id => {
  funcs[id] = skip;
};

animFrame();
const update = frame => {
  onUpdate(frame);
  requestAnimationFrame(update);
};


requestAnimationFrame(update);
