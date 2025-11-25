const socket = io();

// Elementos del DOM
const pantallaInicioSesion = document.getElementById('login-screen');
const pantallaFinJuego = document.getElementById('game-over-screen');
const entradaApodo = document.getElementById('nickname');
const entradaColor = document.getElementById('color-picker');
const selectorAspecto = document.getElementById('skin-selector');
const entradaAspectoPersonalizado = document.getElementById('custom-skin-input');
const contenedorPrevisualizacion = document.getElementById('preview-container');
const previsualizacionAspecto = document.getElementById('skin-preview');
const miIdSpan = document.getElementById('my-id');

// Elementos de Fin de Juego
const nombreAsesino = document.getElementById('killer-name');
const mensajeMuerte = document.getElementById('death-message');
const imagenAspectoAsesino = document.getElementById('killer-skin-img');
const circuloColorAsesino = document.getElementById('killer-color-circle');
const estadisticaMasaFinal = document.getElementById('stat-final-mass');
const estadisticaRango = document.getElementById('stat-rank');
const estadisticaComida = document.getElementById('stat-food');
const estadisticaTiempo = document.getElementById('stat-time');

// Botones de Navegación (Fin de Juego)
const botonJugar = document.getElementById('play-btn');
const botonIrEspectar = document.getElementById('go-spectate-btn');
const botonIrMenu = document.getElementById('go-menu-btn');
const botonReiniciar = document.getElementById('restart-btn');

// Controles de Espectador (Barra Inferior)
const controlesEspectador = document.getElementById('spectator-controls');
const botonDetallesEspectador = document.getElementById('spec-details-btn');
const botonReiniciarEspectador = document.getElementById('spec-restart-btn');
const botonMenuEspectador = document.getElementById('spec-menu-btn');

const divClasificacion = document.getElementById('leaderboard');
const listaClasificacion = document.getElementById('leaderboard-list');
const lienzo = document.getElementById('game-canvas');
const ctx = lienzo.getContext('2d');

const pantallaSalaEspera = document.getElementById('lobby-screen');
const divContadorJugadores = document.getElementById('player-count');

const listaJugadoresSalaEspera = document.getElementById('lobby-player-list');
const superposicionCuentaRegresiva = document.getElementById('countdown-overlay');
const numeroCuentaRegresiva = document.getElementById('countdown-number');

const pantallaVictoria = document.getElementById('victory-screen');
const textoNombreGanador = document.getElementById('winner-name');
const listaClasificacionFinal = document.getElementById('final-leaderboard-list');
const spanCuentaRegresivaReiniciar = document.getElementById('restart-countdown');

// --- CONTROLES MÓVILES ---
const controlesMoviles = document.getElementById('mobile-controls');
const baseJoystick = document.getElementById('joystick-base');
const palancaJoystick = document.getElementById('joystick-handle');
const botonDividir = document.getElementById('btn-split');

// Estado del Joystick
let vectorActual = { x: 0, y: 0 };
let estaJoystickActivo = false;
let estaJuegoCorriendo = false;
const esDispositivoTactil = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;


// --- PALETA DE COLORES NEÓN ---
const coloresNeon = [
    "#FF0055",
    "#00FF55",
    "#5500FF",
    "#FFFF00",
    "#00FFFF",
    "#FF00FF",
    "#FF5500",
    "#AA00FF",
    "#00FF00",
    "#0080FF"
];

function establecerColorNeonAleatorio() {
    const colorAleatorio = coloresNeon[Math.floor(Math.random() * coloresNeon.length)];
    entradaColor.value = colorAleatorio;
}

establecerColorNeonAleatorio();

// Estado del Juego
let miId = null;
let jugadores = {};
let comida = [];
let masaEyaculada = [];
let virus = [];

// Coordenadas del Ratón (Locales)
let ratonX = 0;
let ratonY = 0;

let misDatosAspectoPersonalizado = null;
let zoomVista = 1;

// Estado del Modo Espectador
let estaEspectando = false;
let idObjetivoEspectador = null;

// Carga de Aspectos
const aspectosCargados = {
    earth: new Image(), moon: new Image(), mars: new Image(), virus: new Image()
};
aspectosCargados.earth.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1024px-The_Earth_seen_from_Apollo_17.jpg';
aspectosCargados.moon.src = 'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg';
aspectosCargados.mars.src = 'https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg';
aspectosCargados.virus.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/SARS-CoV-2_without_background.png/1009px-SARS-CoV-2_without_background.png';
const cacheAspectoPersonalizado = {};

// Redimensionamiento del Lienzo
lienzo.width = window.innerWidth; lienzo.height = window.innerHeight;
window.addEventListener('resize', () => { lienzo.width = window.innerWidth; lienzo.height = window.innerHeight; });
lienzo.addEventListener('mousemove', (e) => {
    ratonX = e.clientX;
    ratonY = e.clientY;
});

// Controles
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') socket.emit('split');
    if (e.code === 'KeyW') socket.emit('eject');
    if (e.code === 'Escape' && estaEspectando) {
        irAMenu();
    }
});

// --- LÓGICA JOYSTICK COMPLETA ---
function actualizarJoystick(e) {
    e.preventDefault();
    let clientX, clientY;
    if (e.touches) {
        if (!e.touches[0]) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const rect = baseJoystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radioMaximo = rect.width / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distancia = Math.sqrt(dx * dx + dy * dy);

    if (distancia > radioMaximo) {
        const angulo = Math.atan2(dy, dx);
        palancaJoystick.style.left = radioMaximo * Math.cos(angulo) + 'px';
        palancaJoystick.style.top = radioMaximo * Math.sin(angulo) + 'px';
        vectorActual.x = Math.cos(angulo);
        vectorActual.y = Math.sin(angulo);
    } else {
        palancaJoystick.style.left = dx + 'px';
        palancaJoystick.style.top = dy + 'px';
        vectorActual.x = dx / radioMaximo;
        vectorActual.y = dy / radioMaximo;
    }
}

function detenerJoystick() {
    if (!estaJoystickActivo) return;
    estaJoystickActivo = false;
    palancaJoystick.style.left = '50%';
    palancaJoystick.style.top = '50%';
    vectorActual = { x: 0, y: 0 };
}

if (esDispositivoTactil() && controlesMoviles) {
    controlesMoviles.classList.remove('hidden');

    baseJoystick.addEventListener('touchstart', (e) => {
        estaJoystickActivo = true;
        actualizarJoystick(e);
    });
    window.addEventListener('touchmove', (e) => {
        if (estaJoystickActivo) actualizarJoystick(e);
    });
    window.addEventListener('touchend', detenerJoystick);

    if (botonDividir) {
        botonDividir.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (estaJuegoCorriendo && !estaEspectando) {
                socket.emit('split');
            }
        });
    }

}


// Lógica de Aspecto Personalizado
entradaAspectoPersonalizado.addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (evento) => {
        const img = new Image();
        img.src = evento.target.result;
        img.onload = () => {
            const lienzoTemporal = document.createElement('canvas');
            const ctxTemporal = lienzoTemporal.getContext('2d');
            lienzoTemporal.width = 100; lienzoTemporal.height = 100;
            ctxTemporal.drawImage(img, 0, 0, 100, 100);
            misDatosAspectoPersonalizado = lienzoTemporal.toDataURL('image/jpeg', 0.8);
            previsualizacionAspecto.src = misDatosAspectoPersonalizado;
            contenedorPrevisualizacion.classList.remove('hidden');
            selectorAspecto.value = "";
        }
    };
    lector.readAsDataURL(archivo);
});
selectorAspecto.addEventListener('change', () => {
    if (selectorAspecto.value !== "") {
        entradaAspectoPersonalizado.value = ""; misDatosAspectoPersonalizado = null; contenedorPrevisualizacion.classList.add('hidden');
    }
});

// --- EVENTOS SOCKET ---
socket.on('playerInfo', (id) => { miId = id; miIdSpan.innerText = id; });
socket.on('serverFull', (msg) => { alert(msg); location.reload(); });

// Actualización de la sala de espera
socket.on('joinedLobby', () => {
    pantallaInicioSesion.classList.add('hidden');
    pantallaFinJuego.classList.add('hidden');
    controlesEspectador.classList.add('hidden');
    pantallaSalaEspera.classList.remove('hidden');
    if (controlesMoviles) controlesMoviles.classList.add('hidden');
});

let ultimaListaNombresJSON = "";

socket.on('lobbyUpdate', (data) => {
    if (!data.timerActive) {
        divContadorJugadores.innerText = `${data.count} / ${data.required} para iniciar`;
        divContadorJugadores.style.color = "#4CAF50";
        const textoInfo = document.querySelector('.lobby-info p');
        if (textoInfo) textoInfo.innerText = "Esperando jugadores...";
    } else {
        divContadorJugadores.innerText = `INICIO EN: ${data.timeLeft}s`;
        divContadorJugadores.style.color = "#FF5722";
        const textoInfo = document.querySelector('.lobby-info p');
        if (textoInfo) textoInfo.innerText = "¡La partida va a comenzar!";
    }

    const currentNamesJSON = JSON.stringify(data.names);

    if (currentNamesJSON !== ultimaListaNombresJSON) {
        listaJugadoresSalaEspera.innerHTML = '';
        data.names.forEach((name, index) => {
            const li = document.createElement('li');
            li.innerText = `${index + 1}. ${name}`;
            listaJugadoresSalaEspera.appendChild(li);
        });

        ultimaListaNombresJSON = currentNamesJSON;
    }
});

// El juego ha comenzado
socket.on('gameStarted', () => {
    estaJuegoCorriendo = true;
    pantallaSalaEspera.classList.add('hidden');
    pantallaInicioSesion.classList.add('hidden');
    superposicionCuentaRegresiva.classList.add('hidden');
    divClasificacion.classList.remove('hidden');
    if (esDispositivoTactil() && controlesMoviles) controlesMoviles.classList.remove('hidden');

    if (!intervaloEntrada) iniciarBucleEntrada();
});

socket.on('stateUpdate', (data) => {
    comida = data.food;
    masaEyaculada = data.ejectedMass || [];
    virus = data.viruses || [];
    actualizarClasificacion(data.leaderboard);

    if (estaEspectando && idObjetivoEspectador && !data.players[idObjetivoEspectador]) {
        if (data.leaderboard && data.leaderboard.length > 0) {
            idObjetivoEspectador = data.leaderboard[0].id;
        }
    }

    const jugadoresBackend = data.players;
    for (const id in jugadoresBackend) {
        const bPlayer = jugadoresBackend[id];
        if (!jugadores[id]) { jugadores[id] = bPlayer; }
        else {
            jugadores[id].nickname = bPlayer.nickname;
            jugadores[id].color = bPlayer.color;
            jugadores[id].skin = bPlayer.skin;
            jugadores[id].customSkin = bPlayer.customSkin;
            const mapaCelulasActuales = {};
            jugadores[id].cells.forEach(c => mapaCelulasActuales[c.id] = c);
            jugadores[id].cells = bPlayer.cells.map(bCell => {
                const celulaExistente = mapaCelulasActuales[bCell.id];
                if (celulaExistente) {
                    celulaExistente.targetX = bCell.x; celulaExistente.targetY = bCell.y; celulaExistente.targetRadius = bCell.radius;
                    return celulaExistente;
                } else {
                    return { id: bCell.id, x: bCell.x, y: bCell.y, radius: bCell.radius, targetX: bCell.x, targetY: bCell.y, targetRadius: bCell.radius };
                }
            });
        }
    }
    for (const id in jugadores) { if (!jugadoresBackend[id]) delete jugadores[id]; }
});

// --- MANEJADOR DE FIN DE JUEGO ---
socket.on('gameOver', (data) => {
    estaJuegoCorriendo = false;
    nombreAsesino.innerText = data.killerName;
    mensajeMuerte.innerText = data.message;

    if (data.killerCustomSkin) {
        imagenAspectoAsesino.src = data.killerCustomSkin;
        imagenAspectoAsesino.classList.remove('hidden');
        circuloColorAsesino.classList.add('hidden');
    } else if (data.killerSkin && aspectosCargados[data.killerSkin]) {
        imagenAspectoAsesino.src = aspectosCargados[data.killerSkin].src;
        imagenAspectoAsesino.classList.remove('hidden');
        circuloColorAsesino.classList.add('hidden');
    } else {
        imagenAspectoAsesino.classList.add('hidden');
        circuloColorAsesino.classList.remove('hidden');
        circuloColorAsesino.style.backgroundColor = data.killerColor;
    }

    estadisticaMasaFinal.innerText = data.stats.finalMass;
    estadisticaRango.innerText = data.stats.bestRank === 999 ? "-" : "#" + data.stats.bestRank;
    estadisticaComida.innerText = data.stats.cellsEaten;

    const segundosVivo = Math.floor(data.stats.timeAlive / 1000);
    const m = Math.floor(segundosVivo / 60);
    const s = segundosVivo % 60;
    estadisticaTiempo.innerText = `${m}m ${s}s`;

    idObjetivoEspectador = data.killerId;

    pantallaFinJuego.classList.remove('hidden');
    divClasificacion.classList.add('hidden');
    controlesEspectador.classList.add('hidden');
    if (controlesMoviles) controlesMoviles.classList.add('hidden');
});

socket.on('startCountdown', (seconds) => {
    pantallaSalaEspera.classList.add('hidden');
    superposicionCuentaRegresiva.classList.remove('hidden');

    let contador = seconds;
    numeroCuentaRegresiva.innerText = contador;

    const intervalo = setInterval(() => {
        contador--;
        if (contador > 0) {
            numeroCuentaRegresiva.innerText = contador;
        } else {
            clearInterval(intervalo);
        }
    }, 1000);
});


socket.on('roundWon', (data) => {
    estaJuegoCorriendo = false;
    divClasificacion.classList.add('hidden');
    controlesEspectador.classList.add('hidden');
    if (controlesMoviles) controlesMoviles.classList.add('hidden');

    textoNombreGanador.innerText = data.winnerName;

    listaClasificacionFinal.innerHTML = '';
    data.leaderboard.forEach((player, index) => {
        const li = document.createElement('li');

        if (player.id === miId) {
            li.classList.add('highlight-self');
        }

        li.innerHTML = `
            <span style="color: ${player.id === miId ? '#fff' : player.color}; text-shadow: 0 0 2px black;">
                #${index + 1} ${player.name}
            </span> 
            <span>${player.score}</span>
        `;
        listaClasificacionFinal.appendChild(li);
    });

    pantallaVictoria.classList.remove('hidden');

    let tiempoRestante = 10;
    spanCuentaRegresivaReiniciar.innerText = tiempoRestante;
    const temporizador = setInterval(() => {
        tiempoRestante--;
        if (tiempoRestante >= 0) spanCuentaRegresivaReiniciar.innerText = tiempoRestante;
        else clearInterval(temporizador);
    }, 1000);
});

socket.on('serverReset', () => {
    location.reload();
});

// --- LÓGICA DE BOTONES Y NAVEGACIÓN ---

botonJugar.addEventListener('click', unirseAlJuego);

botonReiniciar.addEventListener('click', () => {
    pantallaFinJuego.classList.add('hidden');
    controlesEspectador.classList.add('hidden');
    if (esDispositivoTactil() && controlesMoviles) controlesMoviles.classList.remove('hidden');
    estaEspectando = false;
    unirseAlJuego();
});

botonIrMenu.addEventListener('click', irAMenu);

botonIrEspectar.addEventListener('click', () => {
    pantallaFinJuego.classList.add('hidden');
    divClasificacion.classList.remove('hidden');
    controlesEspectador.classList.remove('hidden');
    if (controlesMoviles) controlesMoviles.classList.add('hidden');
    estaEspectando = true;
});

botonDetallesEspectador.addEventListener('click', () => {
    controlesEspectador.classList.add('hidden');
    divClasificacion.classList.add('hidden');
    pantallaFinJuego.classList.remove('hidden');
});

botonReiniciarEspectador.addEventListener('click', () => {
    controlesEspectador.classList.add('hidden');
    pantallaFinJuego.classList.add('hidden');
    if (esDispositivoTactil() && controlesMoviles) controlesMoviles.classList.remove('hidden');
    estaEspectando = false;
    unirseAlJuego();
});

botonMenuEspectador.addEventListener('click', irAMenu);

function irAMenu() {
    estaJuegoCorriendo = false;
    pantallaFinJuego.classList.add('hidden');
    controlesEspectador.classList.add('hidden');
    divClasificacion.classList.add('hidden');
    pantallaInicioSesion.classList.remove('hidden');
    if (controlesMoviles) controlesMoviles.classList.add('hidden');
    estaEspectando = false;
    idObjetivoEspectador = null;
}

function unirseAlJuego() {
    const nombre = entradaApodo.value.trim() || '';

    if (nombre.length === 0) {
        alert("¡Debes ponerte un nombre para jugar!");
        return;
    }

    const color = entradaColor.value;
    const aspecto = selectorAspecto.value;

    socket.emit('startGame', { nickname: nombre, color: color, skin: aspecto, customSkin: misDatosAspectoPersonalizado });

}

function actualizarClasificacion(topPlayers) {
    listaClasificacion.innerHTML = '';
    if (!topPlayers) return;
    topPlayers.forEach((player, index) => {
        const li = document.createElement('li');

        li.innerHTML = `
            <span style="color: ${player.color}; text-shadow: 0 0 2px black; font-weight: bold;">
                #${index + 1} ${player.name}
            </span> 
            <span>${player.score}</span>
        `;
        listaClasificacion.appendChild(li);
    });
}

let intervaloEntrada = null;
function iniciarBucleEntrada() {
    if (intervaloEntrada) clearInterval(intervaloEntrada);
    intervaloEntrada = setInterval(() => {
        if (!estaEspectando && miId && jugadores[miId] && jugadores[miId].cells.length > 0) {
            let centroX = 0, centroY = 0;
            jugadores[miId].cells.forEach(c => { centroX += c.x; centroY += c.y; });
            centroX /= jugadores[miId].cells.length; centroY /= jugadores[miId].cells.length;

            let objetivoX, objetivoY;
            if (esDispositivoTactil() && (estaJoystickActivo || (vectorActual.x !== 0 || vectorActual.y !== 0))) {
                const escalaMovimiento = 1500;
                objetivoX = centroX + vectorActual.x * escalaMovimiento;
                objetivoY = centroY + vectorActual.y * escalaMovimiento;
            } else {
                const vectorX = ratonX - lienzo.width / 2;
                const vectorY = ratonY - lienzo.height / 2;
                objetivoX = centroX + vectorX;
                objetivoY = centroY + vectorY;
            }

            socket.emit('input', { x: objetivoX, y: objetivoY });
        }
    }, 1000 / 60);
}

function interpolacionLineal(inicio, fin, t) { return inicio + (fin - inicio) * t; }

function dibujarVirus(ctx, x, y, radius) {
    ctx.fillStyle = '#33FF33'; ctx.strokeStyle = '#22AA22'; ctx.lineWidth = 5;
    const numPicos = 20; const alturaPico = 5;
    ctx.beginPath();
    for (let i = 0; i < numPicos * 2; i++) {
        const angulo = (Math.PI * 2 * i) / (numPicos * 2);
        const r = (i % 2 === 0) ? radius + alturaPico : radius - alturaPico;
        const vx = x + Math.cos(angulo) * r; const vy = y + Math.sin(angulo) * r;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
}

function trazarRutaGelatina(ctx, radius) {
    const resolucion = Math.max(20, Math.min(120, Math.floor(radius * 1.5)));
    const tiempo = Date.now() / 200;
    ctx.beginPath();
    for (let i = 0; i <= resolucion; i++) {
        const angulo = (Math.PI * 2 * i) / resolucion;
        const desplazamiento = Math.sin(angulo * 5 + tiempo) * Math.cos(angulo * 3 - tiempo);
        const cantidadOscilacion = radius * 0.03;
        const r = radius + (desplazamiento * cantidadOscilacion);
        const x = Math.cos(angulo) * r; const y = Math.sin(angulo) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function dibujarCuadricula() {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1;
    for (let x = 0; x <= 3000; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, 3000); }
    for (let y = 0; y <= 3000; y += 50) { ctx.moveTo(0, y); ctx.lineTo(3000, y); }
    ctx.stroke(); ctx.closePath();
}

function dibujar() {
    requestAnimationFrame(dibujar);
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);

    let camaraX = 0, camaraY = 0;
    let masaTotalParaZoom = 0;
    let objetivoEncontrado = false;

    if (!estaEspectando && miId && jugadores[miId] && jugadores[miId].cells.length > 0) {
        const p = jugadores[miId];
        p.cells.forEach(c => { camaraX += c.x; camaraY += c.y; masaTotalParaZoom += c.mass; });
        camaraX /= p.cells.length; camaraY /= p.cells.length;
        objetivoEncontrado = true;
    }
    else if (estaEspectando && idObjetivoEspectador && jugadores[idObjetivoEspectador]) {
        const p = jugadores[idObjetivoEspectador];
        if (p.cells.length > 0) {
            p.cells.forEach(c => { camaraX += c.x; camaraY += c.y; masaTotalParaZoom += c.mass; });
            camaraX /= p.cells.length; camaraY /= p.cells.length;
            objetivoEncontrado = true;
        }
    }

    if (!objetivoEncontrado) {
        camaraX = 1500; camaraY = 1500; masaTotalParaZoom = 100;
    }

    let zoomMasa = 50 / (Math.sqrt(masaTotalParaZoom) + 40);
    const anchoBase = 1920;
    const altoBase = 1080;
    let factorPantalla = Math.max(lienzo.width / anchoBase, lienzo.height / altoBase);
    let zoomObjetivo = zoomMasa * factorPantalla;
    const zoomMinimo = 0.1 * factorPantalla;
    const zoomMaximo = 1.5 * factorPantalla;
    zoomObjetivo = Math.max(zoomMinimo, Math.min(zoomMaximo, zoomObjetivo));

    zoomVista = interpolacionLineal(zoomVista, zoomObjetivo, 0.05);

    for (const id in jugadores) {
        const p = jugadores[id];
        p.cells.forEach(cell => {
            if (cell.targetX !== undefined) {
                cell.x = interpolacionLineal(cell.x, cell.targetX, 0.1);
                cell.y = interpolacionLineal(cell.y, cell.targetY, 0.1);
                cell.radius = interpolacionLineal(cell.radius, cell.targetRadius, 0.1);
            }
        });
    }

    ctx.save();
    ctx.translate(lienzo.width / 2, lienzo.height / 2);
    ctx.scale(zoomVista, zoomVista);
    ctx.translate(-camaraX, -camaraY);

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 3000, 3000); ctx.clip();
    dibujarCuadricula();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 3000, 3000);

    comida.forEach(f => { ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill(); });
    masaEyaculada.forEach(em => { ctx.beginPath(); ctx.arc(em.x, em.y, em.radius, 0, Math.PI * 2); ctx.fillStyle = em.color; ctx.fill(); ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.stroke(); });

    let todasCelulasADibujar = [];
    for (const id in jugadores) {
        const p = jugadores[id];
        p.cells.forEach(c => { todasCelulasADibujar.push({ ...c, nickname: p.nickname, color: p.color, skin: p.skin, customSkin: p.customSkin, parentId: p.id }); });
    }
    todasCelulasADibujar.sort((a, b) => a.radius - b.radius);

    todasCelulasADibujar.forEach(cell => {
        ctx.save(); ctx.translate(cell.x, cell.y);
        trazarRutaGelatina(ctx, cell.radius);
        let imagenADibujar = null;
        if (cell.customSkin) {
            if (!cacheAspectoPersonalizado[cell.parentId]) { const img = new Image(); img.src = cell.customSkin; cacheAspectoPersonalizado[cell.parentId] = img; }
            if (cacheAspectoPersonalizado[cell.parentId].complete) imagenADibujar = cacheAspectoPersonalizado[cell.parentId];
        } else if (cell.skin && aspectosCargados[cell.skin] && aspectosCargados[cell.skin].complete) { imagenADibujar = aspectosCargados[cell.skin]; }

        if (imagenADibujar) { ctx.save(); ctx.clip(); ctx.drawImage(imagenADibujar, -cell.radius, -cell.radius, cell.radius * 2, cell.radius * 2); ctx.restore(); }
        else { ctx.fillStyle = cell.color; ctx.fill(); }

        const anchoBorde = Math.max(2, cell.radius * 0.05);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = anchoBorde; ctx.stroke();

        ctx.lineWidth = anchoBorde * 2;
        if (cell.x < cell.radius) { const h = Math.sqrt(Math.abs(cell.radius ** 2 - cell.x ** 2)); ctx.beginPath(); ctx.moveTo(-cell.x, -h); ctx.lineTo(-cell.x, h); ctx.stroke(); }
        if (cell.x > 3000 - cell.radius) { const d = 3000 - cell.x; const h = Math.sqrt(Math.abs(cell.radius ** 2 - d ** 2)); ctx.beginPath(); ctx.moveTo(d, -h); ctx.lineTo(d, h); ctx.stroke(); }
        if (cell.y < cell.radius) { const w = Math.sqrt(Math.abs(cell.radius ** 2 - cell.y ** 2)); ctx.beginPath(); ctx.moveTo(-w, -cell.y); ctx.lineTo(w, -cell.y); ctx.stroke(); }
        if (cell.y > 3000 - cell.radius) { const d = 3000 - cell.y; const w = Math.sqrt(Math.abs(cell.radius ** 2 - d ** 2)); ctx.beginPath(); ctx.moveTo(-w, d); ctx.lineTo(w, d); ctx.stroke(); }

        if (cell.radius > 5) {
            ctx.fillStyle = 'white'; ctx.font = `bold ${Math.max(16, cell.radius * 0.5)}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
            ctx.strokeText(cell.nickname, 0, 0); ctx.fillText(cell.nickname, 0, 0);
        }
        ctx.restore();
    });
    ctx.restore();

    ctx.save(); virus.forEach(v => dibujarVirus(ctx, v.x, v.y, v.radius)); ctx.restore();
    ctx.restore();
}
dibujar();