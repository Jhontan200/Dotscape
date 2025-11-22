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

// --- OPTIMIZACIÓN 1: BAJAR TICK RATE ---
const TICK_RATE = 60; 

const MAX_FOOD = 200;
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

let food = [];
let players = {};
let ejectedMass = [];
let viruses = []; 

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
    if (players[socket.id]) {
      const p = players[socket.id];
      p.nickname = data.nickname.substring(0, 10) || 'Player';
      p.color = data.color;
      p.skin = data.skin;
      p.customSkin = data.customSkin;
      p.playing = true;
      
      // Reiniciar estadísticas
      p.startTime = Date.now();
      p.maxMass = 20;
      p.cellsEaten = 0;
      p.bestRank = Object.keys(players).length; // Empezamos últimos

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
  });
});

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
        score: Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0))
    }))
    .sort((a, b) => b.score - a.score);

  // LOGICA JUGADORES (FÍSICA, MOVIMIENTO, INTERACCIONES)
  for (const id in players) {
    const p = players[id];
    if (!p.playing) continue;

    // 1. ACTUALIZAR ESTADÍSTICAS
    const currentTotalMass = Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0));
    if (currentTotalMass > p.maxMass) p.maxMass = currentTotalMass;
    
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

  // PvP & GAME OVER
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

            if (pB.cells.length === 1) {
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
            cB.mass = 0;
            cB.radius = 0;
          }
        }
        pB.cells = pB.cells.filter(c => c.mass > 0);
      }
    }
  }

  // --- OPTIMIZACIÓN 2: VIEW CULLING (RECORTE DE VISIÓN) ---
  
  // 1. Preparamos los jugadores reducidos (con redondeo) para no recalcularlos N veces
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
          x: Math.round(c.x), // Redondear coordenadas
          y: Math.round(c.y),
          radius: Math.round(c.radius)
        }))
      };
    }
  }

  // 2. Obtenemos todos los sockets conectados
  const connectedSockets = io.sockets.sockets;

  // 3. Iteramos sobre cada cliente conectado
  for (const [socketId, socket] of connectedSockets) {
    const p = players[socketId];
    
    // Variables para definir el área de visión
    let viewX = MAP_WIDTH / 2;
    let viewY = MAP_HEIGHT / 2;
    let viewDist = 1500; // Vista base bastante amplia

    // Si el jugador está jugando, centramos la cámara en sus células
    if (p && p.playing && p.cells.length > 0) {
        let totalX = 0, totalY = 0, totalMass = 0;
        p.cells.forEach(c => {
            totalX += c.x;
            totalY += c.y;
            totalMass += c.mass;
        });
        viewX = totalX / p.cells.length;
        viewY = totalY / p.cells.length;
        
        // Aumentar el rango de visión si el jugador es grande (Zoom out)
        viewDist += Math.sqrt(totalMass) * 2; 
    }
    
    // --- FILTRADO (CULLING) ---
    
    // Filtrar COMIDA visible (con redondeo)
    const visibleFood = food.filter(f => 
        Math.abs(f.x - viewX) < viewDist && 
        Math.abs(f.y - viewY) < viewDist
    ).map(f => ({
        x: Math.round(f.x),
        y: Math.round(f.y),
        color: f.color
    }));

    // Filtrar VIRUS visibles (con redondeo)
    const visibleViruses = viruses.filter(v => 
        Math.abs(v.x - viewX) < viewDist && 
        Math.abs(v.y - viewY) < viewDist
    ).map(v => ({
        id: v.id,
        x: Math.round(v.x),
        y: Math.round(v.y),
        radius: Math.round(v.radius)
    }));

    // Filtrar MASA EYECTADA visible (con redondeo)
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

    // Filtrar JUGADORES visibles
    const visiblePlayers = {};
    for (let pid in reducedPlayers) {
        const rp = reducedPlayers[pid];
        // Comprobamos si ALGUNA célula del jugador rival es visible
        const isVisible = rp.cells.some(c => 
            Math.abs(c.x - viewX) < viewDist + 500 && // Buffer extra para jugadores
            Math.abs(c.y - viewY) < viewDist + 500
        );
        
        if (isVisible) {
            visiblePlayers[pid] = rp;
        }
    }

    // Enviamos el paquete personalizado SOLO a este socket
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