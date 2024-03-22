import { Player } from "./player.js";
import { Server } from "socket.io";
import http from "http"; // Importing the built-in HTTP module for creating a server

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:8080"],
  },
});
let players = [];

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

  socket.on("get-players", () => {
    const localPlayerId = socket.id;
    players.forEach((player) => {
      player.localPlayer = player.id === localPlayerId;
    });

    socket.emit("players", players);
  });

  socket.on("update-player-position", (data) => {
    const updatedPlayer = players.find((player) => player.id === socket.id);
    if (updatedPlayer) {
      updatedPlayer.x = data.x;
      updatedPlayer.y = data.y;
      socket.broadcast.emit("player-position-updated", {
        playerId: socket.id,
        x: data.x,
        y: data.y,
      });
    }
  });

  socket.on("disconnect", () => {
    players = players.filter((player) => player.id !== socket.id);
    socket.broadcast.emit("player-disconnected", {
      playerId: socket.id,
    });
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
