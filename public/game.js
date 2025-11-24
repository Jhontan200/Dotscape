const socket = io();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const nicknameInput = document.getElementById('nickname');
const colorInput = document.getElementById('color-picker');
const skinSelector = document.getElementById('skin-selector');
const customSkinInput = document.getElementById('custom-skin-input');
const previewContainer = document.getElementById('preview-container');
const skinPreview = document.getElementById('skin-preview');
const myIdSpan = document.getElementById('my-id');

// Game Over Elements
const killerName = document.getElementById('killer-name');
const deathMessage = document.getElementById('death-message');
const killerSkinImg = document.getElementById('killer-skin-img');
const killerColorCircle = document.getElementById('killer-color-circle');
const statFinalMass = document.getElementById('stat-final-mass');
const statRank = document.getElementById('stat-rank');
const statFood = document.getElementById('stat-food');
const statTime = document.getElementById('stat-time');

// Botones de Navegación (Game Over)
const playBtn = document.getElementById('play-btn');
const goSpectateBtn = document.getElementById('go-spectate-btn');
const goMenuBtn = document.getElementById('go-menu-btn');
const restartBtn = document.getElementById('restart-btn');

// Controles de Espectador (Barra Inferior)
const spectatorControls = document.getElementById('spectator-controls');
const specDetailsBtn = document.getElementById('spec-details-btn');
const specRestartBtn = document.getElementById('spec-restart-btn');
const specMenuBtn = document.getElementById('spec-menu-btn');

const leaderboardDiv = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');


const lobbyScreen = document.getElementById('lobby-screen');
const playerCountDiv = document.getElementById('player-count');

const lobbyPlayerList = document.getElementById('lobby-player-list');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');

const victoryScreen = document.getElementById('victory-screen');
const winnerNameText = document.getElementById('winner-name');
const finalLeaderboardList = document.getElementById('final-leaderboard-list');
const restartCountdownSpan = document.getElementById('restart-countdown');

// --- PALETA DE COLORES NEÓN ---
const neonColors = [
    "#FF0055", // Neon Red/Pink
    "#00FF55", // Neon Green
    "#5500FF", // Neon Indigo
    "#FFFF00", // Neon Yellow
    "#00FFFF", // Cyan
    "#FF00FF", // Magenta
    "#FF5500", // Neon Orange
    "#AA00FF", // Purple
    "#00FF00", // Lime
    "#0080FF"  // Azure
];

// Función para asignar un color aleatorio al iniciar
function setRandomNeonColor() {
    const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    colorInput.value = randomColor;
}

// Ejecutamos esto apenas carga el script
setRandomNeonColor();

// Game State
let myId = null;
let players = {};
let food = [];
let ejectedMass = [];
let viruses = [];

// Coordenadas del Mouse (Locales)
let mouseX = 0;
let mouseY = 0;

let myCustomSkinData = null;
let viewZoom = 1;

// Spectator Mode State
let isSpectating = false;
let spectateTargetId = null;

// Skins Load
const loadedSkins = {
    earth: new Image(), moon: new Image(), mars: new Image(), virus: new Image()
};
loadedSkins.earth.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1024px-The_Earth_seen_from_Apollo_17.jpg';
loadedSkins.moon.src = 'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg';
loadedSkins.mars.src = 'https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg';
loadedSkins.virus.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/SARS-CoV-2_without_background.png/1009px-SARS-CoV-2_without_background.png';
const customSkinCache = {};

// Canvas Resize
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Controls
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') socket.emit('split');
    if (e.code === 'KeyW') socket.emit('eject');
    // Atajo ESC lleva al menú si estás espectando
    if (e.code === 'Escape' && isSpectating) {
        goToMenu();
    }
});

// Custom Skin Logic
customSkinInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = 100; tempCanvas.height = 100;
            tempCtx.drawImage(img, 0, 0, 100, 100);
            myCustomSkinData = tempCanvas.toDataURL('image/jpeg', 0.8);
            skinPreview.src = myCustomSkinData;
            previewContainer.classList.remove('hidden');
            skinSelector.value = "";
        }
    };
    reader.readAsDataURL(file);
});
skinSelector.addEventListener('change', () => {
    if (skinSelector.value !== "") {
        customSkinInput.value = ""; myCustomSkinData = null; previewContainer.classList.add('hidden');
    }
});

// --- SOCKET EVENTS ---
socket.on('playerInfo', (id) => { myId = id; myIdSpan.innerText = id; });
socket.on('serverFull', (msg) => { alert(msg); location.reload(); });

// Actualización de la sala de espera
// 1. EVENTO PRIVADO: Solo se ejecuta cuando YO entro a la sala
socket.on('joinedLobby', () => {
    loginScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    spectatorControls.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
});

// 2. EVENTO PÚBLICO: Se ejecuta para TODOS (actualiza la lista)
socket.on('lobbyUpdate', (data) => {
    // NOTA: Ya NO ocultamos/mostramos pantallas aquí. 
    // Solo actualizamos los datos visuales.

    // Actualizar contador
    playerCountDiv.innerText = `${data.count} / ${data.required}`;

    // Actualizar lista de nombres
    lobbyPlayerList.innerHTML = '';
    data.names.forEach((name, index) => {
        const li = document.createElement('li');
        li.innerText = `${index + 1}. ${name}`;
        lobbyPlayerList.appendChild(li);
    });
});

// El juego ha comenzado
socket.on('gameStarted', () => {
    lobbyScreen.classList.add('hidden');
    loginScreen.classList.add('hidden');
    countdownOverlay.classList.add('hidden');
    leaderboardDiv.classList.remove('hidden');

    if (!inputInterval) startInputLoop();
});

socket.on('stateUpdate', (data) => {
    food = data.food;
    ejectedMass = data.ejectedMass || [];
    viruses = data.viruses || [];
    updateLeaderboard(data.leaderboard);

    if (isSpectating && spectateTargetId && !data.players[spectateTargetId]) {
        if (data.leaderboard && data.leaderboard.length > 0) {
            spectateTargetId = data.leaderboard[0].id;
        }
    }

    const backendPlayers = data.players;
    for (const id in backendPlayers) {
        const bPlayer = backendPlayers[id];
        if (!players[id]) { players[id] = bPlayer; }
        else {
            players[id].nickname = bPlayer.nickname;
            players[id].color = bPlayer.color;
            players[id].skin = bPlayer.skin;
            players[id].customSkin = bPlayer.customSkin;
            const currentCellsMap = {};
            players[id].cells.forEach(c => currentCellsMap[c.id] = c);
            players[id].cells = bPlayer.cells.map(bCell => {
                const existingCell = currentCellsMap[bCell.id];
                if (existingCell) {
                    existingCell.targetX = bCell.x; existingCell.targetY = bCell.y; existingCell.targetRadius = bCell.radius;
                    return existingCell;
                } else {
                    return { id: bCell.id, x: bCell.x, y: bCell.y, radius: bCell.radius, targetX: bCell.x, targetY: bCell.y, targetRadius: bCell.radius };
                }
            });
        }
    }
    for (const id in players) { if (!backendPlayers[id]) delete players[id]; }
});

// --- GAME OVER HANDLER ---
socket.on('gameOver', (data) => {
    killerName.innerText = data.killerName;
    deathMessage.innerText = data.message;

    if (data.killerCustomSkin) {
        killerSkinImg.src = data.killerCustomSkin;
        killerSkinImg.classList.remove('hidden');
        killerColorCircle.classList.add('hidden');
    } else if (data.killerSkin && loadedSkins[data.killerSkin]) {
        killerSkinImg.src = loadedSkins[data.killerSkin].src;
        killerSkinImg.classList.remove('hidden');
        killerColorCircle.classList.add('hidden');
    } else {
        killerSkinImg.classList.add('hidden');
        killerColorCircle.classList.remove('hidden');
        killerColorCircle.style.backgroundColor = data.killerColor;
    }

    statFinalMass.innerText = data.stats.finalMass;
    statRank.innerText = data.stats.bestRank === 999 ? "-" : "#" + data.stats.bestRank;
    statFood.innerText = data.stats.cellsEaten;

    const secondsAlive = Math.floor(data.stats.timeAlive / 1000);
    const m = Math.floor(secondsAlive / 60);
    const s = secondsAlive % 60;
    statTime.innerText = `${m}m ${s}s`;

    spectateTargetId = data.killerId;

    gameOverScreen.classList.remove('hidden');
    leaderboardDiv.classList.add('hidden');
    spectatorControls.classList.add('hidden');
});

socket.on('startCountdown', (seconds) => {
    // Ocultar lobby, mostrar cuenta regresiva
    lobbyScreen.classList.add('hidden');
    countdownOverlay.classList.remove('hidden');

    let counter = seconds;
    countdownNumber.innerText = counter;

    const interval = setInterval(() => {
        counter--;
        if (counter > 0) {
            countdownNumber.innerText = counter;
        } else {
            // Cuando llega a 0, limpiamos (el evento gameStarted se encargará de quitar el overlay)
            clearInterval(interval);
        }
    }, 1000);
});


socket.on('roundWon', (data) => {
    // 1. Ocultar HUD del juego
    leaderboardDiv.classList.add('hidden');

    // 2. Llenar datos de victoria
    winnerNameText.innerText = data.winnerName;

    // Llenar el Top 10 final
    finalLeaderboardList.innerHTML = '';
    data.leaderboard.forEach((player, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${index + 1} ${player.name}</span> <span>${player.score}</span>`;
        finalLeaderboardList.appendChild(li);
    });

    // 3. Mostrar pantalla
    victoryScreen.classList.remove('hidden');

    // 4. Cuenta regresiva visual de 10s
    let timeLeft = 10;
    restartCountdownSpan.innerText = timeLeft;
    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) restartCountdownSpan.innerText = timeLeft;
        else clearInterval(timer);
    }, 1000);
});

socket.on('serverReset', () => {
    // Recargar la página es la forma más limpia de resetear todo el estado local
    // O llamar a goToMenu() y limpiar variables manualmente.
    // Dado que pediste "volver a poner nombre", location.reload() es lo más seguro y fácil.
    location.reload();
});

// --- LÓGICA DE BOTONES Y NAVEGACIÓN ---

playBtn.addEventListener('click', joinGame);

// 1. Acciones desde GAME OVER
restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    spectatorControls.classList.add('hidden');
    isSpectating = false;
    joinGame();
});

goMenuBtn.addEventListener('click', goToMenu);

goSpectateBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    leaderboardDiv.classList.remove('hidden');
    spectatorControls.classList.remove('hidden');
    isSpectating = true;
});

// 2. Acciones desde MODO ESPECTADOR
specDetailsBtn.addEventListener('click', () => {
    spectatorControls.classList.add('hidden');
    leaderboardDiv.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
});

specRestartBtn.addEventListener('click', () => {
    spectatorControls.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    isSpectating = false;
    joinGame();
});

specMenuBtn.addEventListener('click', goToMenu);

// Función auxiliar para ir al menú
function goToMenu() {
    gameOverScreen.classList.add('hidden');
    spectatorControls.classList.add('hidden');
    leaderboardDiv.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    isSpectating = false;
    spectateTargetId = null;
}

function joinGame() {
    const name = nicknameInput.value.trim() || ''; // .trim() quita espacios

    // REQUISITO: Nombre obligatorio
    if (name.length === 0) {
        alert("¡Debes ponerte un nombre para jugar!");
        return;
    }

    const color = colorInput.value;
    const skin = skinSelector.value;

    // Enviamos la petición, pero NO ocultamos el login todavía manualmente.
    // Esperaremos a que el servidor nos diga que entramos a la sala.
    socket.emit('startGame', { nickname: name, color: color, skin: skin, customSkin: myCustomSkinData });

}

function updateLeaderboard(topPlayers) {
    leaderboardList.innerHTML = '';
    if (!topPlayers) return;
    topPlayers.forEach((player, index) => {
        const li = document.createElement('li');

        // Creamos el HTML con el estilo de color
        // Usamos text-shadow para que se lea bien si el color es muy oscuro
        li.innerHTML = `
            <span style="color: ${player.color}; text-shadow: 0 0 2px black; font-weight: bold;">
                #${index + 1} ${player.name}
            </span> 
            <span>${player.score}</span>
        `;
        leaderboardList.appendChild(li);
    });
}

let inputInterval = null;
function startInputLoop() {
    if (inputInterval) clearInterval(inputInterval);
    inputInterval = setInterval(() => {
        if (!isSpectating && myId && players[myId] && players[myId].cells.length > 0) {
            let centerX = 0, centerY = 0;
            players[myId].cells.forEach(c => { centerX += c.x; centerY += c.y; });
            centerX /= players[myId].cells.length; centerY /= players[myId].cells.length;
            const vectorX = mouseX - canvas.width / 2; const vectorY = mouseY - canvas.height / 2;
            socket.emit('input', { x: centerX + vectorX, y: centerY + vectorY });
        }
    }, 1000 / 60);
}

function lerp(start, end, t) { return start + (end - start) * t; }

function drawVirus(ctx, x, y, radius) {
    ctx.fillStyle = '#33FF33'; ctx.strokeStyle = '#22AA22'; ctx.lineWidth = 5;
    const numSpikes = 20; const spikeHeight = 5;
    ctx.beginPath();
    for (let i = 0; i < numSpikes * 2; i++) {
        const angle = (Math.PI * 2 * i) / (numSpikes * 2);
        const r = (i % 2 === 0) ? radius + spikeHeight : radius - spikeHeight;
        const vx = x + Math.cos(angle) * r; const vy = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
}

function traceJellyPath(ctx, radius) {
    const resolution = Math.max(20, Math.min(120, Math.floor(radius * 1.5)));
    const time = Date.now() / 200;
    ctx.beginPath();
    for (let i = 0; i <= resolution; i++) {
        const angle = (Math.PI * 2 * i) / resolution;
        const offset = Math.sin(angle * 5 + time) * Math.cos(angle * 3 - time);
        const wobbleAmount = radius * 0.03;
        const r = radius + (offset * wobbleAmount);
        const x = Math.cos(angle) * r; const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawGrid() {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1;
    for (let x = 0; x <= 3000; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, 3000); }
    for (let y = 0; y <= 3000; y += 50) { ctx.moveTo(0, y); ctx.lineTo(3000, y); }
    ctx.stroke(); ctx.closePath();
}

function draw() {
    requestAnimationFrame(draw);
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let camX = 0, camY = 0;
    let totalMassForZoom = 0;
    let targetFound = false;

    if (!isSpectating && myId && players[myId] && players[myId].cells.length > 0) {
        const p = players[myId];
        p.cells.forEach(c => { camX += c.x; camY += c.y; totalMassForZoom += c.mass; });
        camX /= p.cells.length; camY /= p.cells.length;
        targetFound = true;
    }
    else if (isSpectating && spectateTargetId && players[spectateTargetId]) {
        const p = players[spectateTargetId];
        if (p.cells.length > 0) {
            p.cells.forEach(c => { camX += c.x; camY += c.y; totalMassForZoom += c.mass; });
            camX /= p.cells.length; camY /= p.cells.length;
            targetFound = true;
        }
    }

    if (!targetFound) {
        camX = 1500; camY = 1500; totalMassForZoom = 100;
    }

    // --- MEJORA DE CÁMARA ---
    let massZoom = 50 / (Math.sqrt(totalMassForZoom) + 40);
    const baseWidth = 1920;
    const baseHeight = 1080;
    let screenFactor = Math.max(canvas.width / baseWidth, canvas.height / baseHeight);
    let targetZoom = massZoom * screenFactor;
    const minZoom = 0.1 * screenFactor;
    const maxZoom = 1.5 * screenFactor;
    targetZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));

    viewZoom = lerp(viewZoom, targetZoom, 0.05);

    for (const id in players) {
        const p = players[id];
        p.cells.forEach(cell => {
            if (cell.targetX !== undefined) {
                cell.x = lerp(cell.x, cell.targetX, 0.1);
                cell.y = lerp(cell.y, cell.targetY, 0.1);
                cell.radius = lerp(cell.radius, cell.targetRadius, 0.1);
            }
        });
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(viewZoom, viewZoom);
    ctx.translate(-camX, -camY);

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 3000, 3000); ctx.clip();
    drawGrid();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 3000, 3000);

    food.forEach(f => { ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill(); });
    ejectedMass.forEach(em => { ctx.beginPath(); ctx.arc(em.x, em.y, em.radius, 0, Math.PI * 2); ctx.fillStyle = em.color; ctx.fill(); ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.stroke(); });

    let allCellsToDraw = [];
    for (const id in players) {
        const p = players[id];
        p.cells.forEach(c => { allCellsToDraw.push({ ...c, nickname: p.nickname, color: p.color, skin: p.skin, customSkin: p.customSkin, parentId: p.id }); });
    }
    allCellsToDraw.sort((a, b) => a.radius - b.radius);

    allCellsToDraw.forEach(cell => {
        ctx.save(); ctx.translate(cell.x, cell.y);
        traceJellyPath(ctx, cell.radius);
        let imageToDraw = null;
        if (cell.customSkin) {
            if (!customSkinCache[cell.parentId]) { const img = new Image(); img.src = cell.customSkin; customSkinCache[cell.parentId] = img; }
            if (customSkinCache[cell.parentId].complete) imageToDraw = customSkinCache[cell.parentId];
        } else if (cell.skin && loadedSkins[cell.skin] && loadedSkins[cell.skin].complete) { imageToDraw = loadedSkins[cell.skin]; }

        if (imageToDraw) { ctx.save(); ctx.clip(); ctx.drawImage(imageToDraw, -cell.radius, -cell.radius, cell.radius * 2, cell.radius * 2); ctx.restore(); }
        else { ctx.fillStyle = cell.color; ctx.fill(); }

        const borderWidth = Math.max(2, cell.radius * 0.05);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = borderWidth; ctx.stroke();

        ctx.lineWidth = borderWidth * 2;
        if (cell.x < cell.radius) { const h = Math.sqrt(Math.abs(cell.radius ** 2 - cell.x ** 2)); ctx.beginPath(); ctx.moveTo(-cell.x, -h); ctx.lineTo(-cell.x, h); ctx.stroke(); }
        if (cell.x > 3000 - cell.radius) { const d = 3000 - cell.x; const h = Math.sqrt(Math.abs(cell.radius ** 2 - d ** 2)); ctx.beginPath(); ctx.moveTo(d, -h); ctx.lineTo(d, h); ctx.stroke(); }
        if (cell.y < cell.radius) { const w = Math.sqrt(Math.abs(cell.radius ** 2 - cell.y ** 2)); ctx.beginPath(); ctx.moveTo(-w, -cell.y); ctx.lineTo(w, -cell.y); ctx.stroke(); }
        if (cell.y > 3000 - cell.radius) { const d = 3000 - cell.y; const w = Math.sqrt(Math.abs(cell.radius ** 2 - d ** 2)); ctx.beginPath(); ctx.moveTo(-w, d); ctx.lineTo(w, d); ctx.stroke(); }

        // --- CAMBIO AQUÍ: NOMBRE MÁS GRANDE ---
        if (cell.radius > 5) {
            // Aumenté el tamaño base de 10 a 16 y el multiplicador de 0.3 a 0.5
            ctx.fillStyle = 'white'; ctx.font = `bold ${Math.max(16, cell.radius * 0.5)}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
            ctx.strokeText(cell.nickname, 0, 0); ctx.fillText(cell.nickname, 0, 0);
        }
        ctx.restore();
    });
    ctx.restore();

    ctx.save(); viruses.forEach(v => drawVirus(ctx, v.x, v.y, v.radius)); ctx.restore();
    ctx.restore();
}
draw();