const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const WINNING_SCORE = 50; // Meta para ganar

const MAX_PLAYERS = 2;
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

// --- OPTIMIZACIÓN 1: BAJAR TICK RATE ---
const TICK_RATE = 60;

// --- CAMBIO AQUÍ: MÁS COMIDA ---
const MAX_FOOD = 250;
const BASE_SPEED = 8;
const MAX_CELLS = 16;
const MERGE_TIMER = 45000;
const EJECT_MASS_GAIN = 15;
const EJECT_MASS_LOSS = 18;
const EJECT_SPEED = 28;

// --- CONFIGURACIÓN VIRUS ---
const MAX_VIRUSES = 15;
const VIRUS_MASS = 60;
const VIRUS_RADIUS = 60;

// --- FRASES DE MUERTE ALEATORIAS ---
const DEATH_PHRASES = [
  "ha cenado contigo",
  "te ha aplastado sin piedad",
  "te ha borrado del mapa",
  "usó tu masa para crecer",
  "te ha absorbido",
  "te pasó por encima",
  "te convirtió en su merienda"
];

// --- ESTADOS DEL JUEGO ---
const GAME_STATE = {
  WAITING: 0,   // Sala de espera
  nY_PLAYING: 1, // Juego en curso
  ENDED: 2      // Juego terminado (mostrando ganador)
};

let food = [];
let players = {};
let ejectedMass = [];
let viruses = [];

let currentGameState = GAME_STATE.WAITING;
let waitingPlayers = []; // Lista de sockets esperando

let uniqueCellIdCounter = 0;
function getCellId() {
  return uniqueCellIdCounter++;
}

function createFood() {
  return {
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };
}

function createVirus() {
  return {
    id: getCellId(),
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    radius: VIRUS_RADIUS,
    mass: VIRUS_MASS
  };
}

// Función auxiliar para enviar el estado del lobby a todos
function broadcastLobbyUpdate() {
  // Mapeamos los IDs de espera a sus Nombres reales
  const namesList = waitingPlayers.map(id => {
    return players[id] ? players[id].nickname : 'Desconocido';
  });

  io.emit('lobbyUpdate', {
    count: waitingPlayers.length,
    required: MAX_PLAYERS,
    names: namesList // Enviamos la lista de nombres
  });
}

for (let i = 0; i < MAX_FOOD; i++) food.push(createFood());
for (let i = 0; i < MAX_VIRUSES; i++) viruses.push(createVirus());

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
    nickname: 'Guest',
    color: '#FFFFFF',
    skin: '',
    customSkin: null,
    playing: false,
    targetX: 0,
    targetY: 0,
    cells: [],
    // --- NUEVAS ESTADÍSTICAS ---
    startTime: 0,
    maxMass: 0,
    cellsEaten: 0,
    bestRank: 999
  };

  socket.emit('playerInfo', socket.id);

  socket.on('startGame', (data) => {
    // Solo permitimos unirse si estamos en modo ESPERA
    if (currentGameState !== GAME_STATE.WAITING) {
      socket.emit('serverFull', 'Partida en curso. Espera a que termine.');
      return;
    }

    // Validar nombre obligatorio (Requisito UI)
    const name = data.nickname.trim().substring(0, 10);
    if (!name) return; // Si no hay nombre, ignorar

    if (players[socket.id]) {
      const p = players[socket.id];
      p.nickname = name || 'Jugador';
      p.color = data.color;
      p.skin = data.skin;
      p.customSkin = data.customSkin;

      // IMPORTANTE: Aún NO está jugando (playing = false)
      p.playing = false;
      p.isReady = true; // Nuevo flag para saber que está en sala de espera

      // Verificar si ya está en la lista de espera para no duplicar
      if (!waitingPlayers.includes(socket.id)) {
        waitingPlayers.push(socket.id);
      }

      socket.emit('joinedLobby');
      // 1. Enviamos la actualización con nombres
      broadcastLobbyUpdate();

      // 2. Comprobamos si llenamos la sala
      if (waitingPlayers.length >= MAX_PLAYERS) {
        // EN LUGAR DE startGameRound(), iniciamos la cuenta regresiva
        console.log("Iniciando cuenta regresiva...");
        io.emit('startCountdown', 3); // Avisamos a los clientes: "3 segundos"

        // El servidor espera 3 segundos antes de crear las células
        setTimeout(() => {
          startGameRound();
        }, 3000);
      }
    }
  });

  socket.on('input', (data) => {
    if (players[socket.id] && players[socket.id].playing) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  socket.on('split', () => {
    const p = players[socket.id];
    if (!p || !p.playing) return;
    let newCells = [];
    p.cells.forEach(cell => {
      if (cell.mass >= 35 && p.cells.length + newCells.length < MAX_CELLS) {
        const splitMass = cell.mass / 2;
        cell.mass = splitMass;
        cell.radius = cell.mass;
        const dx = p.targetX - cell.x;
        const dy = p.targetY - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;
        newCells.push({
          id: getCellId(),
          x: cell.x + dirX * cell.radius,
          y: cell.y + dirY * cell.radius,
          radius: splitMass,
          mass: splitMass,
          speedX: dirX * 25,
          speedY: dirY * 25,
          mergeTime: Date.now() + MERGE_TIMER
        });
        cell.mergeTime = Date.now() + MERGE_TIMER;
      }
    });
    p.cells = p.cells.concat(newCells);
  });

  socket.on('eject', () => {
    const p = players[socket.id];
    if (!p || !p.playing) return;
    p.cells.forEach(cell => {
      if (cell.mass >= 35) {
        cell.mass -= EJECT_MASS_LOSS;
        cell.radius = cell.mass;
        const dx = p.targetX - cell.x;
        const dy = p.targetY - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;
        ejectedMass.push({
          id: getCellId(),
          x: cell.x + dirX * cell.radius,
          y: cell.y + dirY * cell.radius,
          radius: EJECT_MASS_GAIN,
          mass: EJECT_MASS_GAIN,
          color: p.color,
          speedX: dirX * EJECT_SPEED,
          speedY: dirY * EJECT_SPEED,
          creationTime: Date.now()
        });
      }
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];

    // Si estaba esperando, lo sacamos de la lista
    const index = waitingPlayers.indexOf(socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
      if (currentGameState === GAME_STATE.WAITING) {
        broadcastLobbyUpdate(); // Usamos la nueva función
      }
    }
  });
});

function startGameRound() {
  console.log('🚀 INICIANDO RONDA CON 10 JUGADORES');
  currentGameState = GAME_STATE.PLAYING;

  // Recorrer a los jugadores en espera y "spawnearlos"
  waitingPlayers.forEach(socketId => {
    const p = players[socketId];
    if (p) {
      p.playing = true; // Ahora sí juegan
      // Reiniciar estadísticas y posición
      p.startTime = Date.now();
      p.maxMass = 20;
      p.cellsEaten = 0;
      p.cells = [{
        id: getCellId(),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 20,
        mass: 20,
        speedX: 0,
        speedY: 0,
        mergeTime: 0
      }];
    }
  });

  // Avisar al frontend que el juego inició
  io.emit('gameStarted');
}

function resetServer() {
  console.log('🔄 REINICIANDO SERVIDOR PARA NUEVA RONDA...');

  currentGameState = GAME_STATE.WAITING;
  waitingPlayers = []; // Vaciamos la lista de espera

  // Limpiamos el mapa
  food = [];
  ejectedMass = [];
  viruses = [];
  for (let i = 0; i < MAX_FOOD; i++) food.push(createFood());
  for (let i = 0; i < MAX_VIRUSES; i++) viruses.push(createVirus());

  // Reseteamos a los jugadores conectados
  for (const id in players) {
    const p = players[id];
    if (!p.playing || currentGameState === GAME_STATE.ENDED) continue;

    p.playing = false;
    p.cells = [];
    p.nickname = 'Guest'; // Borramos el nombre para obligar a ponerlo de nuevo
    // IMPORTANTE: No los desconectamos del socket, solo del juego lógico
  }

  // Avisamos a todos los clientes que vuelvan al menú
  io.emit('serverReset');
}

setInterval(() => {
  const now = Date.now();

  // Ejected Mass Physics
  for (let i = ejectedMass.length - 1; i >= 0; i--) {
    const em = ejectedMass[i];
    em.x += em.speedX;
    em.y += em.speedY;
    em.speedX *= 0.9;
    em.speedY *= 0.9;
    if (em.x < 0 || em.x > MAP_WIDTH || em.y < 0 || em.y > MAP_HEIGHT) {
      ejectedMass.splice(i, 1);
      continue;
    }
  }

  // --- CALCULAR LEADERBOARD PRIMERO ---
  const leaderboard = Object.values(players)
    .filter(p => p.playing)
    .map(p => ({
      id: p.id,
      name: p.nickname,
      score: Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0)),
      color: p.color
    }))
    .sort((a, b) => b.score - a.score);

  // LOGICA JUGADORES (FÍSICA, MOVIMIENTO, INTERACCIONES)
  for (const id in players) {
    const p = players[id];
    if (!p.playing) continue;

    // 1. ACTUALIZAR ESTADÍSTICAS
    // 1. ACTUALIZAR ESTADÍSTICAS Y VERIFICAR VICTORIA
    const currentTotalMass = Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0));
    if (currentTotalMass > p.maxMass) p.maxMass = currentTotalMass;

    // --- CONDICIÓN DE VICTORIA ---
    if (currentGameState === GAME_STATE.PLAYING && currentTotalMass >= WINNING_SCORE) {
      currentGameState = GAME_STATE.ENDED; // Congelar lógica del juego

      console.log(`🏆 GANADOR: ${p.nickname} con ${currentTotalMass} puntos`);

      // Enviamos el evento de victoria a TODOS
      io.emit('roundWon', {
        winnerName: p.nickname,
        leaderboard: leaderboard.slice(0, 10) // Enviamos el top 10 final
      });

      // Temporizador de 10 segundos para reiniciar
      setTimeout(() => {
        resetServer();
      }, 10000);
    }

    // Buscar mi posición en el ranking
    const myRank = leaderboard.findIndex(l => l.id === p.id) + 1;
    if (myRank > 0 && myRank < p.bestRank) p.bestRank = myRank;

    let virusExplosionCells = [];

    p.cells.forEach(cell => {
      // Movimiento
      const dx = p.targetX - cell.x;
      const dy = p.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.max(BASE_SPEED - (cell.radius / 20), 2);
      if (dist > 5) {
        const angle = Math.atan2(dy, dx);
        cell.x += Math.cos(angle) * speed;
        cell.y += Math.sin(angle) * speed;
      }
      cell.x += cell.speedX;
      cell.y += cell.speedY;
      cell.speedX *= 0.9;
      cell.speedY *= 0.9;

      const wallForce = 0.8;
      if (cell.x < cell.radius) cell.speedX += wallForce;
      if (cell.x > MAP_WIDTH - cell.radius) cell.speedX -= wallForce;
      if (cell.y < cell.radius) cell.speedY += wallForce;
      if (cell.y > MAP_HEIGHT - cell.radius) cell.speedY -= wallForce;
      cell.x = Math.max(0, Math.min(MAP_WIDTH, cell.x));
      cell.y = Math.max(0, Math.min(MAP_HEIGHT, cell.y));

      // COMER COMIDA
      for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (Math.sqrt((cell.x - f.x) ** 2 + (cell.y - f.y) ** 2) < cell.radius) {
          cell.mass += 0.5;
          cell.radius = cell.mass;
          p.cellsEaten++;
          food.splice(i, 1);
        }
      }

      // COMER MASA
      for (let i = ejectedMass.length - 1; i >= 0; i--) {
        const em = ejectedMass[i];
        if (Math.sqrt((cell.x - em.x) ** 2 + (cell.y - em.y) ** 2) < cell.radius) {
          cell.mass += em.mass;
          cell.radius = cell.mass;
          ejectedMass.splice(i, 1);
        }
      }

      // VIRUS
      for (let vIndex = viruses.length - 1; vIndex >= 0; vIndex--) {
        const v = viruses[vIndex];
        const distV = Math.sqrt((cell.x - v.x) ** 2 + (cell.y - v.y) ** 2);
        if (distV < cell.radius + v.radius) {
          if (cell.mass < VIRUS_MASS) {
            continue;
          } else {
            viruses.splice(vIndex, 1);
            viruses.push(createVirus());
            const maxSplits = MAX_CELLS - (p.cells.length + virusExplosionCells.length);
            if (maxSplits > 0) {
              const pieces = Math.min(maxSplits, 8);
              const massPerPiece = cell.mass / (pieces + 1);
              cell.mass = massPerPiece;
              cell.radius = massPerPiece;
              cell.mergeTime = Date.now() + MERGE_TIMER;
              for (let k = 0; k < pieces; k++) {
                const angle = (k / pieces) * Math.PI * 2;
                virusExplosionCells.push({
                  id: getCellId(),
                  x: cell.x,
                  y: cell.y,
                  radius: massPerPiece,
                  mass: massPerPiece,
                  speedX: Math.cos(angle) * 20,
                  speedY: Math.sin(angle) * 20,
                  mergeTime: Date.now() + MERGE_TIMER
                });
              }
            }
          }
        }
      }
    });
    p.cells = p.cells.concat(virusExplosionCells);

    // FÍSICA INTERNA
    for (let i = 0; i < p.cells.length; i++) {
      for (let j = i + 1; j < p.cells.length; j++) {
        const c1 = p.cells[i];
        const c2 = p.cells[j];
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = c1.radius + c2.radius;
        if (dist < minDist) {
          if (now > c1.mergeTime && now > c2.mergeTime) {
            c1.mass += c2.mass;
            c1.radius = c1.mass;
            c2.mass = 0;
            c2.radius = 0;
            continue;
          }
          const penetration = minDist - dist;
          if (penetration > 0 && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const totalMass = c1.mass + c2.mass;
            const m1Factor = c2.mass / totalMass;
            const m2Factor = c1.mass / totalMass;
            c1.x += nx * penetration * m1Factor;
            c1.y += ny * penetration * m1Factor;
            c2.x -= nx * penetration * m2Factor;
            c2.y -= ny * penetration * m2Factor;
          }
        }
      }
    }
    p.cells = p.cells.filter(c => c.mass > 0);
  }

  while (food.length < MAX_FOOD) food.push(createFood());
  while (viruses.length < MAX_VIRUSES) viruses.push(createVirus());

  // PvP & GAME OVER (CORREGIDO)
  const allPlayers = Object.values(players).filter(p => p.playing);
  for (const pA of allPlayers) {
    for (const pB of allPlayers) {
      if (pA.id === pB.id) continue;
      for (const cA of pA.cells) {
        for (const cB of pB.cells) {
          const dist = Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2);
          if (dist < cA.radius && cA.radius > cB.radius * 1.2) {
            cA.mass += cB.mass;
            cA.radius = cA.mass;

            pA.cellsEaten++;

            // 1. Marcamos la célula como muerta
            cB.mass = 0;
            cB.radius = 0;

            // 2. Contamos cuántas células VIVAS le quedan realmente a pB
            const livingCells = pB.cells.filter(c => c.mass > 0).length;

            // 3. Si no le quedan células vivas (0), Game Over
            if (livingCells === 0) {
              const timeAlive = Date.now() - pB.startTime;
              const randomPhrase = DEATH_PHRASES[Math.floor(Math.random() * DEATH_PHRASES.length)];

              const deathData = {
                killerName: pA.nickname,
                killerSkin: pA.skin,
                killerCustomSkin: pA.customSkin,
                killerColor: pA.color,
                killerId: pA.id,
                message: randomPhrase,
                stats: {
                  finalMass: Math.floor(cB.mass),
                  maxMass: pB.maxMass,
                  timeAlive: timeAlive,
                  cellsEaten: pB.cellsEaten,
                  bestRank: pB.bestRank
                }
              };

              io.to(pB.id).emit('gameOver', deathData);
              pB.playing = false;
            }
          }
        }
        pB.cells = pB.cells.filter(c => c.mass > 0);
      }
    }
  }

  // --- OPTIMIZACIÓN 2: VIEW CULLING ---
  const reducedPlayers = {};
  for (let id in players) {
    const p = players[id];
    if (p.playing) {
      reducedPlayers[id] = {
        id: p.id,
        nickname: p.nickname,
        color: p.color,
        skin: p.skin,
        customSkin: p.customSkin,
        cells: p.cells.map(c => ({
          id: c.id,
          x: Math.round(c.x),
          y: Math.round(c.y),
          radius: Math.round(c.radius)
        }))
      };
    }
  }

  const connectedSockets = io.sockets.sockets;

  for (const [socketId, socket] of connectedSockets) {
    const p = players[socketId];

    let viewX = MAP_WIDTH / 2;
    let viewY = MAP_HEIGHT / 2;
    let viewDist = 1500;

    if (p && p.playing && p.cells.length > 0) {
      let totalX = 0, totalY = 0, totalMass = 0;
      p.cells.forEach(c => {
        totalX += c.x;
        totalY += c.y;
        totalMass += c.mass;
      });
      viewX = totalX / p.cells.length;
      viewY = totalY / p.cells.length;
      viewDist += Math.sqrt(totalMass) * 2;
    }

    // Filtrado
    const visibleFood = food.filter(f =>
      Math.abs(f.x - viewX) < viewDist &&
      Math.abs(f.y - viewY) < viewDist
    ).map(f => ({
      x: Math.round(f.x),
      y: Math.round(f.y),
      color: f.color
    }));

    const visibleViruses = viruses.filter(v =>
      Math.abs(v.x - viewX) < viewDist &&
      Math.abs(v.y - viewY) < viewDist
    ).map(v => ({
      id: v.id,
      x: Math.round(v.x),
      y: Math.round(v.y),
      radius: Math.round(v.radius)
    }));

    const visibleEjected = ejectedMass.filter(em =>
      Math.abs(em.x - viewX) < viewDist &&
      Math.abs(em.y - viewY) < viewDist
    ).map(em => ({
      id: em.id,
      x: Math.round(em.x),
      y: Math.round(em.y),
      radius: Math.round(em.radius),
      color: em.color
    }));

    const visiblePlayers = {};
    for (let pid in reducedPlayers) {
      const rp = reducedPlayers[pid];
      const isVisible = rp.cells.some(c =>
        Math.abs(c.x - viewX) < viewDist + 500 &&
        Math.abs(c.y - viewY) < viewDist + 500
      );

      if (isVisible) {
        visiblePlayers[pid] = rp;
      }
    }

    socket.emit('stateUpdate', {
      players: visiblePlayers,
      food: visibleFood,
      ejectedMass: visibleEjected,
      viruses: visibleViruses,
      leaderboard: leaderboard.slice(0, 10)
    });
  }

}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});