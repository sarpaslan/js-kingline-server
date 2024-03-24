import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:8080"],
  },
});
let players = new Map();
let lobbies = [];
const countdown = 3;

io.on("connection", (socket) => {
  socket.on("looking-for-game", (language) => {
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
        time: 20,
      };
      lobbies.push(newLobby);
      console.log(
        "there is no avaible lobby for this user creating one",
        newLobby.code
      );
      foundLobby = newLobby;
    }
    socket.emit("lobby-found", foundLobby.code);
  });
  socket.on("join-lobby", (code) => {
    console.log("player wants to join lobby with code", code);
    var player = players.get(socket.id);
    const lobby = lobbies.find((lobby) => lobby.code === code);
    lobby.players.push(player);
    io.to(code).emit("player-joined-lobby", player);

    socket.join(code);
    socket.emit("lobby-joined", lobby);

    if (lobby.players.length >= 2 && lobby.state === "waiting") {
      lobby.state = "countdown";
      io.to(code).emit("start-countdown", countdown);
      setTimeout(() => {
        io.to(code).emit("start-game");
        const randomPlayer =
          lobby.players[Math.floor(Math.random() * lobby.players.length)];
        lobby.currentPlayerId = randomPlayer.id;
        lobby.state = "game";
        io.to(code).emit("turn-changed", lobby.currentPlayerId);
      }, countdown * 1000);
    }
  });

  socket.on("login", (name) => {
    if (name.length < 3 || name.length > 12) {
      return;
    }
    var player = {
      id: socket.id,
      name: name,
      lobby: null,
      language: "en",
      heart: 2,
    };
    players.set(socket.id, player);
    socket.emit("logged-in");
  });

  socket.on("disconnect", () => {
    leaveLobby(socket);
  });
});

function leaveLobby(socket) {
  const lobby = lobbies.find((lobby) =>
    lobby.players.find((player) => player.id === socket.id)
  );
  console.log("leave lobby called");
  if (!lobby) {
    return;
  }
  socket.leave(lobby.code);

  console.log("player left the socket code is", lobby.code);

  lobby.players = lobby.players.filter((player) => player.id !== socket.id);

  if (lobby.players.length === 0) {
    lobbies = lobbies.filter((l) => l.code !== lobby.code);
    console.log("lobby count", lobbies.length);
    return;
  }

  io.to(lobby.code).emit("player-left-lobby", {
    id: socket.id,
  });

  if (lobby.state === "game") {
    if (lobby.players.length === 1) {
      console.log("only one player left game over", lobby.players[0].id);
      lobby.state = "ending";
      lobby.currentPlayerId = -1;
      io.to(lobby.code).emit("game-over", lobby.players[0].id);
      setTimeout(() => {
        lobby.state = "waiting";
      }, 3000);
    }
    if (lobby.currentPlayerId === socket.id) {
      const nextPlayer = lobby.players.find(
        (player) => player.id !== socket.id
      );
      lobby.currentPlayerId = nextPlayer.id;
      io.to(lobby.code).emit("turn-changed", lobby.currentPlayerId);
    }
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
