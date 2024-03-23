import { Player } from "./player.js";
import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:8080"],
  },
});
let players = [];
let lobbies = [];

io.on("connection", (socket) => {
  socket.on("login", (name) => {
    if (name.length < 3 || name.length > 12) {
      return;
    }
    const player = new Player(name);
    player.id = socket.id;
    players.push(player);
    socket.emit("logged-in");

    socket.broadcast.emit("player-joined", player);
  });

  socket.on("disconnect", () => {
    players = players.filter((player) => player.id !== socket.id);
    socket.broadcast.emit("player-disconnected", {
      playerId: socket.id,
    });
  });

  socket.on("create-lobby", (playerName) => {
    const lobby = {
      code: Math.floor(1000 + Math.random() * 9000).toString(),
      players: [{ id: socket.id, isHost: true, name: playerName }],
    };
    lobbies.push(lobby);
    socket.emit("lobby-created", lobby);
  });
  socket.on("join-lobby", (request) => {
    const lobby = lobbies.find((lobby) => lobby.code === request.code);
    console.log(lobbies);
    console.log("requested-join-lobby", request.code, "lobby", lobby);
    if (lobby) {
      lobby.players.push({ id: socket.id, isHost: false, name: request.name });
      socket.emit("lobby-joined", lobby);
    } else {
      socket.emit("lobby-not-found");
      console.log("lobby not found");
    }
  });
  socket.on("start-game", (lobbyCode) => {
    const lobby = lobbies.find((lobby) => lobby.code === lobbyCode);

    if (lobby) {
      io.to(lobby.code).emit("game-started", lobby);
    }
  });
  socket.on("lobbies", () => {
    socket.emit("lobbies", lobbies);
  });
  socket.on("leave-lobby", () => {
    //find the lobby the player is in
    const lobby = lobbies.find((lobby) =>
      lobby.players.find((player) => player.id === socket.id)
    );
    //remove player from lobby
    lobby.players = lobby.players.filter((player) => player.id !== socket.id);
    //switch the host if the host left
    if (lobby.players.length > 0 && lobby.players[0].isHost === false) {
      lobby.players[0].isHost = true;
      console.log("changing host to", lobby.players[0].name);
    }
    //check if lobby has any players if its not remove the lobby
    if (lobby.players.length === 0) {
      console.log("removing lobby no one is in it anymore");
      lobbies = lobbies.filter((l) => l.code !== lobby.code);

      console.log("lobby count", lobbies.length);
      return;
    }

    //send new host and disconnect info to all players in the lobby
    console.log("sending player-left to lobby", lobby.code);
    io.to(lobby.code).emit("player-left", {
      playerId: socket.id,
      newHost: lobby.players[0],
    });
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
