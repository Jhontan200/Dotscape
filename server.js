const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;
const TICK_RATE = 60; 

// --- MEJORA 2: MÁS COMIDA ---
const MAX_FOOD = 200; // Aumentado de 100 a 200
const FOOD_RADIUS = 5;
let food = [];

// --- MEJORA 2: VELOCIDAD BASE ---
const BASE_SPEED = 8; // Aumentado de 5 a 8 para que sea más rápido al inicio

let players = {};

function createFood() {
  return {
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };
}

// Llenar comida inicial
for (let i = 0; i < MAX_FOOD; i++) food.push(createFood());

app.use(express.static('public'));

io.on('connection', (socket) => {
  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.emit('serverFull', 'Servidor lleno.');
    socket.disconnect(true);
    return;
  }

  console.log('🟢 Conectado:', socket.id);

  players[socket.id] = {
    id: socket.id,
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    radius: 20,
    color: '#FFFFFF',
    nickname: 'Guest',
    playing: false,
    targetX: 0,
    targetY: 0
  };

  socket.emit('playerInfo', socket.id);

  socket.on('startGame', (data) => {
    if (players[socket.id]) {
      players[socket.id].nickname = data.nickname.substring(0, 10) || 'Player';
      players[socket.id].color = data.color;
      players[socket.id].skin = data.skin;
      players[socket.id].customSkin = data.customSkin;
      players[socket.id].playing = true;
      players[socket.id].x = Math.random() * MAP_WIDTH;
      players[socket.id].y = Math.random() * MAP_HEIGHT;
      players[socket.id].radius = 20;
    }
  });

  socket.on('input', (data) => {
    if (players[socket.id] && players[socket.id].playing) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

setInterval(() => {
  // 1. MOVER JUGADORES
  for (const id in players) {
    const p = players[id];
    if (p.playing) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // --- MEJORA 2: FÓRMULA DE VELOCIDAD ---
      // Base 8. Restamos velocidad según el tamaño.
      // Mínimo 2 de velocidad para que los gigantes no se queden quietos.
      const currentSpeed = Math.max(BASE_SPEED - (p.radius / 20), 2);

      if (distance > 5) {
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * currentSpeed;
          p.y += Math.sin(angle) * currentSpeed;
          p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
          p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
      }

      // Comer Comida
      for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        const dist = Math.sqrt((p.x - f.x) ** 2 + (p.y - f.y) ** 2);
        if (dist < p.radius) {
          p.radius += 0.5; 
          food.splice(i, 1);
        }
      }
    }
  }

  // --- MEJORA 2: REGENERACIÓN RÁPIDA ---
  // Si falta comida, rellenamos inmediatamente hasta llegar a MAX_FOOD
  while (food.length < MAX_FOOD) {
      food.push(createFood());
  }

  // 2. COLISIONES PvP
  for (const idA in players) {
    for (const idB in players) {
      if (idA !== idB) {
        const pA = players[idA];
        const pB = players[idB];

        if (pA.playing && pB.playing) {
            const dist = Math.sqrt((pA.x - pB.x) ** 2 + (pA.y - pB.y) ** 2);
            
            if (dist < pA.radius && pA.radius > pB.radius * 1.2) {
                pA.radius += pB.radius * 0.2; // Ganas masa al comer
                
                // --- MEJORA 3: MENSAJE DE MUERTE (Sin alert) ---
                io.to(idB).emit('gameOver', `Fuiste comido por ${pA.nickname}`);

                pB.playing = false;
                pB.radius = 20;
                pB.x = Math.random() * MAP_WIDTH;
                pB.y = Math.random() * MAP_HEIGHT;
            }
        }
      }
    }
  }

  // --- MEJORA 1: LEADERBOARD ---
  // Crear lista ordenada por puntaje (radio)
  const leaderboard = Object.values(players)
      .filter(p => p.playing) // Solo los que juegan
      .sort((a, b) => b.radius - a.radius) // Ordenar de mayor a menor
      .slice(0, 10) // Tomar solo los top 10
      .map(p => ({ name: p.nickname, score: Math.floor(p.radius) })); // Solo datos necesarios

  io.emit('stateUpdate', { players, food, leaderboard }); // Enviamos todo

}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});