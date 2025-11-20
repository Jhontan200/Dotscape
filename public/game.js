const socket = io();

// --- ELEMENTOS DEL DOM ---
const loginScreen = document.getElementById('login-screen');
const playBtn = document.getElementById('play-btn');
const nicknameInput = document.getElementById('nickname');
const colorInput = document.getElementById('color-picker');
const skinSelector = document.getElementById('skin-selector');
const customSkinInput = document.getElementById('custom-skin-input');
const previewContainer = document.getElementById('preview-container');
const skinPreview = document.getElementById('skin-preview');
const myIdSpan = document.getElementById('my-id');

const gameOverScreen = document.getElementById('game-over-screen');
const killerMessage = document.getElementById('killer-message');
const restartBtn = document.getElementById('restart-btn');
const leaderboardDiv = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// --- VARIABLES DE ESTADO ---
let myId = null;
let players = {}; // Aquí guardamos el estado suavizado (frontend)
let food = [];
let mouseX = 0;
let mouseY = 0;
let myCustomSkinData = null;

// Cache de imágenes predefinidas
const loadedSkins = {
    earth: new Image(),
    moon: new Image(),
    mars: new Image(),
    virus: new Image()
};
loadedSkins.earth.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1024px-The_Earth_seen_from_Apollo_17.jpg';
loadedSkins.moon.src = 'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg';
loadedSkins.mars.src = 'https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg';
loadedSkins.virus.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/SARS-CoV-2_without_background.png/1009px-SARS-CoV-2_without_background.png';

// Cache de imágenes personalizadas
const customSkinCache = {}; 

// Configuración Canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

canvas.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
});

// --- MANEJO DE IMAGEN PERSONALIZADA ---
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
            tempCanvas.width = 100;
            tempCanvas.height = 100;
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
        customSkinInput.value = "";
        myCustomSkinData = null;
        previewContainer.classList.add('hidden');
    }
});

// --- SOCKETS ---
socket.on('playerInfo', (id) => {
    myId = id;
    myIdSpan.innerText = id;
});

socket.on('serverFull', (msg) => {
    alert(msg);
    location.reload();
});

// --- AQUÍ OCURRE LA MAGIA DE LA FLUIDEZ ---
socket.on('stateUpdate', (data) => {
    // 1. Actualizar Comida (esto puede ser directo)
    food = data.food;
    updateLeaderboard(data.leaderboard);

    // 2. Sincronizar Jugadores con Interpolación
    const backendPlayers = data.players;

    // A. Actualizar o Crear jugadores existentes
    for (const id in backendPlayers) {
        const bPlayer = backendPlayers[id]; // Jugador del backend

        if (!players[id]) {
            // Si no existe en mi juego local, lo creo tal cual
            players[id] = bPlayer;
        } else {
            // Si YA existe, NO lo teletransporto.
            // Solo actualizo hacia DÓNDE quiere ir (Target)
            // y propiedades que no necesitan suavizado (color, skin, nombre)
            players[id].targetX = bPlayer.x;
            players[id].targetY = bPlayer.y;
            players[id].targetRadius = bPlayer.radius; // También suavizamos el crecimiento
            
            players[id].color = bPlayer.color;
            players[id].skin = bPlayer.skin;
            players[id].customSkin = bPlayer.customSkin;
            players[id].nickname = bPlayer.nickname;
            players[id].playing = bPlayer.playing;
        }
    }

    // B. Eliminar jugadores que se desconectaron
    for (const id in players) {
        if (!backendPlayers[id]) {
            delete players[id];
        }
    }
});

socket.on('gameOver', (mensaje) => {
    killerMessage.innerText = mensaje;
    gameOverScreen.classList.remove('hidden');
    leaderboardDiv.classList.add('hidden');
});

// --- CONTROLES JUEGO ---
playBtn.addEventListener('click', joinGame);
restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    joinGame();
});

function joinGame() {
    const name = nicknameInput.value || 'SinNombre';
    const color = colorInput.value;
    const skin = skinSelector.value;
    loginScreen.classList.add('hidden');
    leaderboardDiv.classList.remove('hidden');
    socket.emit('startGame', { nickname: name, color: color, skin: skin, customSkin: myCustomSkinData });
    if (!inputInterval) startInputLoop();
}

function updateLeaderboard(topPlayers) {
    leaderboardList.innerHTML = '';
    if (!topPlayers) return;
    topPlayers.forEach((player, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${index + 1} ${player.name}</span> <span>${player.score}</span>`;
        leaderboardList.appendChild(li);
    });
}

let inputInterval = null;
function startInputLoop() {
    if (inputInterval) clearInterval(inputInterval);
    inputInterval = setInterval(() => {
        if (myId && players[myId]) {
            // Enviamos la posición relativa (dirección)
            // Usamos la posición INTERPOLADA actual para calcular el vector
            const myPlayer = players[myId];
            const vectorX = mouseX - canvas.width / 2;
            const vectorY = mouseY - canvas.height / 2;
            socket.emit('input', { x: myPlayer.x + vectorX, y: myPlayer.y + vectorY });
        }
    }, 1000 / 60);
}

// Función LERP (Interpolación Lineal)
// start: donde estoy, end: donde quiero ir, t: velocidad (0 a 1)
function lerp(start, end, t) {
    return start + (end - start) * t;
}

function drawGrid() {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; // Más sutil
    ctx.lineWidth = 1;
    for (let x = 0; x <= 3000; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 3000);
    }
    for (let y = 0; y <= 3000; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(3000, y);
    }
    ctx.stroke();
    ctx.closePath();
}

function draw() {
    requestAnimationFrame(draw);
    
    ctx.fillStyle = '#0b0b0b'; // Fondo muy oscuro
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!myId || !players[myId]) return;

    const myPlayer = players[myId];

    // --- INTERPOLACIÓN (MATEMÁTICAS DE SUAVIDAD) ---
    for (const id in players) {
        const p = players[id];
        if (p.targetX !== undefined) {
            // Moverse un 10% de la distancia en cada frame
            // Esto crea un efecto de desaceleración suave al llegar
            p.x = lerp(p.x, p.targetX, 0.1);
            p.y = lerp(p.y, p.targetY, 0.1);
        }
        if (p.targetRadius !== undefined) {
            p.radius = lerp(p.radius, p.targetRadius, 0.1);
        }
    }

    ctx.save();
    // La cámara sigue a la posición SUAVIZADA
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.translate(-myPlayer.x, -myPlayer.y);

    drawGrid();

    // Bordes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, 3000, 3000);

    // Comida
    food.forEach(f => {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.closePath();
    });

    // Jugadores
    // Ordenamos por tamaño para que los grandes se dibujen encima de los pequeños
    const sortedPlayers = Object.values(players).sort((a, b) => a.radius - b.radius);

    sortedPlayers.forEach(p => {
        if (!p.playing) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.closePath();

        // Skins
        let imageToDraw = null;
        if (p.customSkin) {
            if (!customSkinCache[p.id]) {
                const img = new Image();
                img.src = p.customSkin;
                customSkinCache[p.id] = img;
            }
            if (customSkinCache[p.id].complete) imageToDraw = customSkinCache[p.id];
        } else if (p.skin && loadedSkins[p.skin] && loadedSkins[p.skin].complete) {
            imageToDraw = loadedSkins[p.skin];
        }

        if (imageToDraw) {
            ctx.clip();
            ctx.drawImage(imageToDraw, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        } else {
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.restore();

        // Borde celula
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(2, p.radius * 0.05); // Borde crece un poco con la célula
        ctx.stroke();

        // Nombre
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(12, p.radius * 0.4)}px Arial`; // Nombre crece con la célula
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(p.nickname, p.x, p.y); // Nombre EN el centro
        ctx.fillText(p.nickname, p.x, p.y);
    });

    ctx.restore();
}

draw();