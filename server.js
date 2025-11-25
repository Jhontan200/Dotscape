const express = require('express');
const app = express();
const http = require('http');
const servidor = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(servidor);

const PUERTO = process.env.PORT || 3000;

const PUNTAJE_GANADOR = 50; // Meta para ganar

const MAX_JUGADORES = 10;
const ANCHO_MAPA = 3000;
const ALTO_MAPA = 3000;

// --- OPTIMIZACIÓN 1: BAJAR TICK RATE ---
const TASA_ACTUALIZACION = 60;

// --- MÁS COMIDA ---
const MAX_COMIDA = 250;
const VELOCIDAD_BASE = 8;
const MAX_CELULAS = 16;
const TEMPORIZADOR_FUSION = 45000;
const GANANCIA_MASA_EXPULSADA = 15;
const PERDIDA_MASA_EXPULSADA = 18;
const VELOCIDAD_EXPULSION = 28;

// --- CONFIGURACIÓN VIRUS ---
const MAX_VIRUS = 15;
const MASA_VIRUS = 60;
const RADIO_VIRUS = 60;

// --- FRASES DE MUERTE ALEATORIAS ---
const FRASES_MUERTE = [
  "ha cenado contigo",
  "te ha aplastado sin piedad",
  "te ha borrado del mapa",
  "usó tu masa para crecer",
  "te ha absorbido",
  "te pasó por encima",
  "te convirtió en su merienda"
];

// --- ESTADOS DEL JUEGO ---
const ESTADO_JUEGO = {
  ESPERANDO: 0,
  JUGANDO: 1,
  TERMINADO: 2
};


// --- CONFIGURACIÓN DE SALA ---
const LIMITE_MAXIMO_JUGADORES = 10;
const MIN_JUGADORES_PARA_INICIAR = 3;
const TIEMPO_ESPERA_INICIAL = 30;
const TIEMPO_EXTENSION = 5;

// Variables del Temporizador
let temporizadorSala = null;
let tiempoRestanteSala = 0;
let estaTemporizadorCorriendo = false;

let comida = [];
let jugadores = {};
let masaEyaculada = [];
let virus = [];

let estadoJuegoActual = ESTADO_JUEGO.ESPERANDO;
let jugadoresEnEspera = [];

let contadorIdCelulaUnica = 0;
function obtenerIdCelula() {
  return contadorIdCelulaUnica++;
}

function crearComida() {
  return {
    x: Math.random() * ANCHO_MAPA,
    y: Math.random() * ALTO_MAPA,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };
}

function crearVirus() {
  return {
    id: obtenerIdCelula(),
    x: Math.random() * ANCHO_MAPA,
    y: Math.random() * ALTO_MAPA,
    radius: RADIO_VIRUS,
    mass: MASA_VIRUS
  };
}

// Función auxiliar para enviar el estado del lobby a todos
function transmitirActualizacionSala() {

  const listaNombres = jugadoresEnEspera.map(id => {
    return jugadores[id] ? jugadores[id].nickname : 'Desconocido';
  });

  io.emit('lobbyUpdate', {
    count: jugadoresEnEspera.length,
    required: MIN_JUGADORES_PARA_INICIAR,
    names: listaNombres,
    timerActive: estaTemporizadorCorriendo,
    timeLeft: tiempoRestanteSala
  });
}

for (let i = 0; i < MAX_COMIDA; i++) comida.push(crearComida());
for (let i = 0; i < MAX_VIRUS; i++) virus.push(crearVirus());

app.use(express.static('public'));
// ← AÑADE ESTO
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});
// ← HASTA AQUÍ

// --- FUNCIÓN: LÓGICA DE EXPULSIÓN REUTILIZABLE ---
/**
 * Realiza la expulsión de masa para un jugador en la dirección del objetivo.
 * @param {object} jugador El objeto del jugador.
 * @param {number} objetivoX Coordenada X del punto de destino.
 * @param {number} objetivoY Coordenada Y del punto de destino.
 */
function realizarExpulsion(jugador, objetivoX, objetivoY) {
  if (!jugador || !jugador.playing) return;

  jugador.cells.forEach(cell => {
    if (cell.mass >= 35) {
      cell.mass -= PERDIDA_MASA_EXPULSADA;
      cell.radius = cell.mass;

      // Usar objetivoX/objetivoY pasados como argumento para la dirección
      const dx = objetivoX - cell.x;
      const dy = objetivoY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      masaEyaculada.push({
        id: obtenerIdCelula(),
        x: cell.x + dirX * cell.radius,
        y: cell.y + dirY * cell.radius,
        radius: GANANCIA_MASA_EXPULSADA,
        mass: GANANCIA_MASA_EXPULSADA,
        color: jugador.color,
        speedX: dirX * VELOCIDAD_EXPULSION,
        speedY: dirY * VELOCIDAD_EXPULSION,
        creationTime: Date.now()
      });
    }
  });
}

io.on('connection', (socket) => {
  if (Object.keys(jugadores).length >= LIMITE_MAXIMO_JUGADORES) {
    socket.emit('serverFull', 'Servidor lleno.');
    socket.disconnect(true);
    return;
  }

  console.log('🟢 Conectado:', socket.id);

  jugadores[socket.id] = {
    id: socket.id,
    nickname: 'Guest',
    color: '#FFFFFF',
    skin: '',
    customSkin: null,
    playing: false,
    canRejoin: false,
    targetX: 0,
    targetY: 0,
    cells: [],
    // --- ESTADÍSTICAS ---
    startTime: 0,
    maxMass: 0,
    cellsEaten: 0,
    bestRank: 999
  };

  socket.emit('playerInfo', socket.id);

  socket.on('startGame', (data) => {
    // 0. Validar datos básicos
    const nombre = data.nickname.trim().substring(0, 15);
    if (!nombre) return;

    const p = jugadores[socket.id];
    if (!p) return;

    // Actualizamos SIEMPRE los datos
    p.nickname = nombre;
    p.color = data.color;
    p.skin = data.skin;
    p.customSkin = data.customSkin;

    // --- LÓGICA DE ESTADOS ---

    // CASO A: Partida TERMINADA
    if (estadoJuegoActual === ESTADO_JUEGO.TERMINADO) {
      socket.emit('serverFull', 'La ronda terminó. Esperando reinicio...');
      return;
    }

    // CASO B: Partida EN CURSO (JUGANDO)
    if (estadoJuegoActual === ESTADO_JUEGO.JUGANDO) {
      // ¿Este jugador tiene permiso para reingresar?
      if (p.canRejoin) {
        // Reingreso inmediato
        p.playing = true;
        p.startTime = Date.now();
        p.cellsEaten = 0;
        p.maxMass = 20;
        p.cells = [{
          id: obtenerIdCelula(),
          x: Math.random() * ANCHO_MAPA,
          y: Math.random() * ALTO_MAPA,
          radius: 20,
          mass: 20,
          speedX: 0,
          speedY: 0,
          mergeTime: 0
        }];

        // Avisamos SOLO a este cliente que empiece a jugar
        socket.emit('gameStarted');
        return;
      }
      else {
        // Es un jugador nuevo que llegó tarde
        socket.emit('serverFull', 'Partida en curso. Espera a la siguiente ronda.');
        return;
      }
    }

    // CASO C: Estamos en SALA DE ESPERA
    if (estadoJuegoActual === ESTADO_JUEGO.ESPERANDO) {
      p.playing = false;
      p.isReady = true;

      if (!jugadoresEnEspera.includes(socket.id)) {
        jugadoresEnEspera.push(socket.id);
        // Si el reloj corría, extendemos tiempo
        if (estaTemporizadorCorriendo) {
          tiempoRestanteSala += TIEMPO_EXTENSION;
          io.emit('timerExtended', TIEMPO_EXTENSION);
        }
      }

      socket.emit('joinedLobby');
      gestionarTemporizadorSala();
      transmitirActualizacionSala();
    }

  });

  socket.on('input', (data) => {
    if (jugadores[socket.id] && jugadores[socket.id].playing) {
      jugadores[socket.id].targetX = data.x;
      jugadores[socket.id].targetY = data.y;
    }
  });

  socket.on('split', () => {
    const p = jugadores[socket.id];
    if (!p || !p.playing) return;
    let newCells = [];
    p.cells.forEach(cell => {
      if (cell.mass >= 35 && p.cells.length + newCells.length < MAX_CELULAS) {
        const masaDividida = cell.mass / 2;
        cell.mass = masaDividida;
        cell.radius = cell.mass;
        const dx = p.targetX - cell.x;
        const dy = p.targetY - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;
        newCells.push({
          id: obtenerIdCelula(),
          x: cell.x + dirX * cell.radius,
          y: cell.y + dirY * cell.radius,
          radius: masaDividida,
          mass: masaDividida,
          speedX: dirX * 25,
          speedY: dirY * 25,
          mergeTime: Date.now() + TEMPORIZADOR_FUSION
        });
        cell.mergeTime = Date.now() + TEMPORIZADOR_FUSION;
      }
    });
    p.cells = p.cells.concat(newCells);
  });

  // Handler de EXPULSAR
  socket.on('eject', () => {
    const p = jugadores[socket.id];
    if (!p || !p.playing) return;

    realizarExpulsion(p, p.targetX, p.targetY);
  });

  // --- NUEVO HANDLER: EXPULSIÓN ALEATORIA ---
  socket.on('ejectRandom', () => {
    const p = jugadores[socket.id];
    if (!p || !p.playing || p.cells.length === 0) return;

    // 1. Calcular el centroide del jugador (punto de origen)
    let centroX = 0, centroY = 0;
    p.cells.forEach(c => { centroX += c.x; centroY += c.y; });
    centroX /= p.cells.length;
    centroY /= p.cells.length;

    // 2. Generar un ángulo aleatorio (0 a 2π)
    const anguloAleatorio = Math.random() * 2 * Math.PI;

    // 3. Crear un punto de destino muy lejano
    const escalaMovimiento = 2000;
    const objetivoX = centroX + Math.cos(anguloAleatorio) * escalaMovimiento;
    const objetivoY = centroY + Math.sin(anguloAleatorio) * escalaMovimiento;

    // 4. Llamar a la lógica de expulsión con el destino aleatorio
    realizarExpulsion(p, objetivoX, objetivoY);
  });

  socket.on('disconnect', () => {
    delete jugadores[socket.id];
    const index = jugadoresEnEspera.indexOf(socket.id);

    if (index !== -1) {
      jugadoresEnEspera.splice(index, 1);

      // Cancelar reloj si somos menos del mínimo
      if (estaTemporizadorCorriendo && jugadoresEnEspera.length < MIN_JUGADORES_PARA_INICIAR) {
        console.log("🛑 Cancelando cuenta regresiva: Faltan jugadores.");
        clearInterval(temporizadorSala);
        estaTemporizadorCorriendo = false;
        temporizadorSala = null;
        tiempoRestanteSala = 0;
      }

      if (estadoJuegoActual === ESTADO_JUEGO.ESPERANDO) {
        transmitirActualizacionSala();
      }
    }
  });
});

function iniciarRondaJuego() {
  console.log('🚀 INICIANDO RONDA');
  estadoJuegoActual = ESTADO_JUEGO.JUGANDO;

  // Spawnear jugadores en espera
  jugadoresEnEspera.forEach(socketId => {
    const p = jugadores[socketId];
    if (p) {
      p.playing = true;
      p.canRejoin = true;

      p.startTime = Date.now();
      p.maxMass = 20;
      p.cellsEaten = 0;
      p.cells = [{
        id: obtenerIdCelula(),
        x: Math.random() * ANCHO_MAPA,
        y: Math.random() * ALTO_MAPA,
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

let temporizadorReiniciar = null;

function reiniciarServidor() {
  console.log('🔄 REINICIANDO SERVIDOR PARA NUEVA RONDA...');

  estadoJuegoActual = ESTADO_JUEGO.ESPERANDO;
  jugadoresEnEspera = [];

  // Limpiamos el mapa
  comida = [];
  masaEyaculada = [];
  virus = [];
  for (let i = 0; i < MAX_COMIDA; i++) comida.push(crearComida());
  for (let i = 0; i < MAX_VIRUS; i++) virus.push(crearVirus());

  // Reseteamos a los jugadores conectados
  for (const id in jugadores) {
    const p = jugadores[id];
    if (!p) continue;

    p.playing = false;
    p.canRejoin = false; // Ya no pueden reingresar a la ronda anterior
    p.cells = [];
    p.nickname = 'Guest';
    // Restablecer estadísticas
    p.startTime = 0;
    p.maxMass = 0;
    p.cellsEaten = 0;
    p.bestRank = 999;
  }

  io.emit('serverReset');
}

function gestionarTemporizadorSala() {
  // CASO 1: Arrancar el reloj si no está corriendo y cumplimos el mínimo
  if (!estaTemporizadorCorriendo && jugadoresEnEspera.length >= MIN_JUGADORES_PARA_INICIAR) {
    console.log("⏳ Iniciando cuenta regresiva del lobby...");
    estaTemporizadorCorriendo = true;
    tiempoRestanteSala = TIEMPO_ESPERA_INICIAL;

    // Intervalo de 1 segundo
    temporizadorSala = setInterval(() => {
      tiempoRestanteSala--;

      // Avisar a los clientes del nuevo tiempo
      transmitirActualizacionSala();

      // Si llega a 0, INICIAMOS EL JUEGO
      if (tiempoRestanteSala <= 0) {
        clearInterval(temporizadorSala);
        estaTemporizadorCorriendo = false;
        temporizadorSala = null;
        iniciarRondaJuego();
      }
    }, 1000);
  }
  // CASO 2: Extender tiempo si ya está corriendo
  else if (estaTemporizadorCorriendo && jugadoresEnEspera.length > MIN_JUGADORES_PARA_INICIAR) {
    tiempoRestanteSala += TIEMPO_EXTENSION;
    if (tiempoRestanteSala > 60) tiempoRestanteSala = 60;

    transmitirActualizacionSala();
  }
}

setInterval(() => {
  const ahora = Date.now();

  // Física de Masa Expulsada
  for (let i = masaEyaculada.length - 1; i >= 0; i--) {
    const em = masaEyaculada[i];
    em.x += em.speedX;
    em.y += em.speedY;
    em.speedX *= 0.9;
    em.speedY *= 0.9;
    if (em.x < 0 || em.x > ANCHO_MAPA || em.y < 0 || em.y > ALTO_MAPA) {
      masaEyaculada.splice(i, 1);
      continue;
    }
  }

  // Calcular Clasificación
  const clasificacion = Object.values(jugadores)
    .filter(p => p.playing)
    .map(p => ({
      id: p.id,
      name: p.nickname,
      score: Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0)),
      color: p.color
    }))
    .sort((a, b) => b.score - a.score);

  // LOGICA JUGADORES
  for (const id in jugadores) {
    const p = jugadores[id];
    if (!p.playing) continue;

    // 1. ACTUALIZAR ESTADÍSTICAS Y VERIFICAR VICTORIA
    const masaTotalActual = Math.floor(p.cells.reduce((acc, c) => acc + c.mass, 0));
    if (masaTotalActual > p.maxMass) p.maxMass = masaTotalActual;

    // --- CONDICIÓN DE VICTORIA ---
    if (estadoJuegoActual === ESTADO_JUEGO.JUGANDO && masaTotalActual >= PUNTAJE_GANADOR) {
      estadoJuegoActual = ESTADO_JUEGO.TERMINADO;

      console.log(`🏆 GANADOR: ${p.nickname} con ${masaTotalActual} puntos`);

      // Generar una lista final que incluya a TODOS
      const clasificacionFinal = Object.values(jugadores)
        .filter(player => player.playing || player.canRejoin)
        .map(player => ({
          id: player.id,
          name: player.nickname,
          score: Math.floor(player.cells.reduce((acc, c) => acc + c.mass, 0)),
          color: player.color
        }))
        .sort((a, b) => b.score - a.score);

      // Enviamos el evento de victoria a TODOS con la lista final
      io.emit('roundWon', {
        winnerName: p.nickname,
        leaderboard: clasificacionFinal.slice(0, 10)
      });

      // Temporizador de 10 segundos para reiniciar
      temporizadorReiniciar = setTimeout(() => {
        reiniciarServidor();
      }, 10000);
    }

    // Buscar mi posición en el ranking
    const miRango = clasificacion.findIndex(l => l.id === p.id) + 1;
    if (miRango > 0 && miRango < p.bestRank) p.bestRank = miRango;

    let celulasExplosionVirus = [];

    p.cells.forEach(cell => {
      // Movimiento
      const dx = p.targetX - cell.x;
      const dy = p.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocidad = Math.max(VELOCIDAD_BASE - (cell.radius / 20), 2);
      if (dist > 5) {
        const angle = Math.atan2(dy, dx);
        cell.x += Math.cos(angle) * velocidad;
        cell.y += Math.sin(angle) * velocidad;
      }
      cell.x += cell.speedX;
      cell.y += cell.speedY;
      cell.speedX *= 0.9;
      cell.speedY *= 0.9;

      const fuerzaMuro = 0.8;
      if (cell.x < cell.radius) cell.speedX += fuerzaMuro;
      if (cell.x > ANCHO_MAPA - cell.radius) cell.speedX -= fuerzaMuro;
      if (cell.y < cell.radius) cell.speedY += fuerzaMuro;
      if (cell.y > ALTO_MAPA - cell.radius) cell.speedY -= fuerzaMuro;
      cell.x = Math.max(0, Math.min(ANCHO_MAPA, cell.x));
      cell.y = Math.max(0, Math.min(ALTO_MAPA, cell.y));

      // COMER COMIDA
      for (let i = comida.length - 1; i >= 0; i--) {
        const f = comida[i];
        if (Math.sqrt((cell.x - f.x) ** 2 + (cell.y - f.y) ** 2) < cell.radius) {
          cell.mass += 0.5;
          cell.radius = cell.mass;
          p.cellsEaten++;
          comida.splice(i, 1);
        }
      }

      // COMER MASA EXPULSADA
      for (let i = masaEyaculada.length - 1; i >= 0; i--) {
        const em = masaEyaculada[i];
        if (Math.sqrt((cell.x - em.x) ** 2 + (cell.y - em.y) ** 2) < cell.radius) {
          cell.mass += em.mass;
          cell.radius = cell.mass;
          masaEyaculada.splice(i, 1);
        }
      }

      // VIRUS
      for (let vIndex = virus.length - 1; vIndex >= 0; vIndex--) {
        const v = virus[vIndex];
        const distV = Math.sqrt((cell.x - v.x) ** 2 + (cell.y - v.y) ** 2);
        if (distV < cell.radius + v.radius) {
          if (cell.mass < MASA_VIRUS) {
            continue;
          } else {
            virus.splice(vIndex, 1);
            virus.push(crearVirus());
            const maxSplits = MAX_CELULAS - (p.cells.length + celulasExplosionVirus.length);
            if (maxSplits > 0) {
              const piezas = Math.min(maxSplits, 8);
              const masaPorPieza = cell.mass / (piezas + 1);
              cell.mass = masaPorPieza;
              cell.radius = masaPorPieza;
              cell.mergeTime = Date.now() + TEMPORIZADOR_FUSION;
              for (let k = 0; k < piezas; k++) {
                const angle = (k / piezas) * Math.PI * 2;
                celulasExplosionVirus.push({
                  id: obtenerIdCelula(),
                  x: cell.x,
                  y: cell.y,
                  radius: masaPorPieza,
                  mass: masaPorPieza,
                  speedX: Math.cos(angle) * 20,
                  speedY: Math.sin(angle) * 20,
                  mergeTime: Date.now() + TEMPORIZADOR_FUSION
                });
              }
            }
          }
        }
      }
    });
    p.cells = p.cells.concat(celulasExplosionVirus);

    // FÍSICA INTERNA (Fusión y Separación)
    for (let i = 0; i < p.cells.length; i++) {
      for (let j = i + 1; j < p.cells.length; j++) {
        const c1 = p.cells[i];
        const c2 = p.cells[j];
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = c1.radius + c2.radius;
        if (dist < minDist) {
          if (ahora > c1.mergeTime && ahora > c2.mergeTime) {
            c1.mass += c2.mass;
            c1.radius = c1.mass;
            c2.mass = 0;
            c2.radius = 0;
            continue;
          }
          const penetracion = minDist - dist;
          if (penetracion > 0 && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const masaTotal = c1.mass + c2.mass;
            const f1 = c2.mass / masaTotal;
            const f2 = c1.mass / masaTotal;
            c1.x += nx * penetracion * f1;
            c1.y += ny * penetracion * f1;
            c2.x -= nx * penetracion * f2;
            c2.y -= ny * penetracion * f2;
          }
        }
      }
    }
    p.cells = p.cells.filter(c => c.mass > 0);
  }

  while (comida.length < MAX_COMIDA) comida.push(crearComida());
  while (virus.length < MAX_VIRUS) virus.push(crearVirus());

  // PvP & GAME OVER
  const todosJugadores = Object.values(jugadores).filter(p => p.playing);
  for (const pA of todosJugadores) {
    for (const pB of todosJugadores) {
      if (pA.id === pB.id) continue;
      for (const cA of pA.cells) {
        for (const cB of pB.cells) {
          const dist = Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2);
          if (dist < cA.radius && cA.radius > cB.radius * 1.2) {
            const masaAlMorir = cB.mass;

            cA.mass += cB.mass;
            cA.radius = cA.mass;

            pA.cellsEaten++;

            // 1. Marcamos la célula como muerta
            cB.mass = 0;
            cB.radius = 0;

            // 2. Contamos cuántas células VIVAS le quedan a pB
            const celulasVivas = pB.cells.filter(c => c.mass > 0).length;

            // 3. Si no le quedan células vivas (0), Game Over
            if (celulasVivas === 0) {
              const tiempoVivo = Date.now() - pB.startTime;
              const fraseAleatoria = FRASES_MUERTE[Math.floor(Math.random() * FRASES_MUERTE.length)];

              const datosMuerte = {
                killerName: pA.nickname,
                killerSkin: pA.skin,
                killerCustomSkin: pA.customSkin,
                killerColor: pA.color,
                killerId: pA.id,
                message: fraseAleatoria,
                stats: {
                  finalMass: Math.floor(masaAlMorir),
                  maxMass: pB.maxMass,
                  timeAlive: tiempoVivo,
                  cellsEaten: pB.cellsEaten,
                  bestRank: pB.bestRank
                }
              };

              io.to(pB.id).emit('gameOver', datosMuerte);
              pB.playing = false;
              pB.canRejoin = true; // Permitir reingreso inmediato si el juego sigue
            }
          }
        }
        pB.cells = pB.cells.filter(c => c.mass > 0);
      }
    }
  }

  // --- OPTIMIZACIÓN 2: FILTRADO DE VISTA (VIEW CULLING) ---
  const jugadoresReducidos = {};
  for (let id in jugadores) {
    const p = jugadores[id];
    if (p.playing) {
      jugadoresReducidos[id] = {
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

  const socketsConectados = io.sockets.sockets;

  for (const [socketId, socket] of socketsConectados) {
    const p = jugadores[socketId];

    let vistaX = ANCHO_MAPA / 2;
    let vistaY = ALTO_MAPA / 2;
    let distanciaVista = 1500;

    if (p && p.playing && p.cells.length > 0) {
      let totalX = 0, totalY = 0, masaTotal = 0;
      p.cells.forEach(c => {
        totalX += c.x;
        totalY += c.y;
        masaTotal += c.mass;
      });
      vistaX = totalX / p.cells.length;
      vistaY = totalY / p.cells.length;
      distanciaVista += Math.sqrt(masaTotal) * 2;
    }

    // Filtrado
    const comidaVisible = comida.filter(f =>
      Math.abs(f.x - vistaX) < distanciaVista &&
      Math.abs(f.y - vistaY) < distanciaVista
    ).map(f => ({
      x: Math.round(f.x),
      y: Math.round(f.y),
      color: f.color
    }));

    const virusVisible = virus.filter(v =>
      Math.abs(v.x - vistaX) < distanciaVista &&
      Math.abs(v.y - vistaY) < distanciaVista
    ).map(v => ({
      id: v.id,
      x: Math.round(v.x),
      y: Math.round(v.y),
      radius: Math.round(v.radius)
    }));

    const masaEyaculadaVisible = masaEyaculada.filter(em =>
      Math.abs(em.x - vistaX) < distanciaVista &&
      Math.abs(em.y - vistaY) < distanciaVista
    ).map(em => ({
      id: em.id,
      x: Math.round(em.x),
      y: Math.round(em.y),
      radius: Math.round(em.radius),
      color: em.color
    }));

    const jugadoresVisible = {};
    for (let pid in jugadoresReducidos) {
      const rp = jugadoresReducidos[pid];
      const esVisible = rp.cells.some(c =>
        Math.abs(c.x - vistaX) < distanciaVista + 500 &&
        Math.abs(c.y - vistaY) < distanciaVista + 500
      );

      if (esVisible) {
        jugadoresVisible[pid] = rp;
      }
    }

    socket.emit('stateUpdate', {
      players: jugadoresVisible,
      food: comidaVisible,
      ejectedMass: masaEyaculadaVisible,
      viruses: virusVisible,
      leaderboard: clasificacion.slice(0, 10)
    });
  }

}, 1000 / TASA_ACTUALIZACION);

servidor.listen(PUERTO, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PUERTO}`);
});