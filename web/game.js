// 16:9 landscape board — 48×27 grid = 20px cells
const GRID_W = 48;
const GRID_H = 27;
const WIN_W  = 960;
const WIN_H  = 540;
const CELL_W = WIN_W / GRID_W;  // 20
const CELL_H = WIN_H / GRID_H;  // 20
const STEP_MS = 100;

// Power-up durations
const PU_TICKS    = 50;   // 50 * 100ms = 5 seconds
const PU_LIFETIME = 25;   // ticks a powerup stays on board
const PU_SPAWN_GAP = 18;  // ticks between spawn attempts

// Cute pastel palette
const C_P1       = [1.0,   0.702, 0.851];  // #ffb3d9 pink
const C_P2       = [0.702, 0.831, 1.0  ];  // #b3d4ff blue
const C_FOOD     = [1.0,   0.961, 0.702];  // #fff5b3 yellow
const C_FOOD2    = [0.851, 0.702, 1.0  ];  // #d9b3ff lilac
const C_BG       = [0.102, 0.082, 0.145];  // #1a1525 deep purple
const C_GRID     = [0.16,  0.125, 0.22 ];  // subtle grid dot
const C_SPEED_PU  = [0.702, 1.0,   0.878];  // #b3ffd9 mint  ⚡
const C_SHIELD_PU = [1.0,   0.863, 0.431];  // #ffdc6e gold  🛡️

let game = {
    p1: { body: [], dir: {x:1,y:0}, nextDir: {x:1,y:0}, color: C_P1,
          alive: true, grew: false, speedTimer: 0, shieldTimer: 0 },
    p2: { body: [], dir: {x:-1,y:0}, nextDir: {x:-1,y:0}, color: C_P2,
          alive: true, grew: false, speedTimer: 0, shieldTimer: 0 },
    food: {x:0, y:0},
    powerup: {x:-1, y:-1, type:'none', lifetime:0},
    powerupSpawnTimer: PU_SPAWN_GAP,
    over: false,
    winner: 0
};

function occupied(x, y) {
    if (game.p1.body.some(s => s.x === x && s.y === y)) return true;
    if (game.p2.body.some(s => s.x === x && s.y === y)) return true;
    return false;
}

function spawnFood() {
    let free = [];
    for (let y = 0; y < GRID_H; ++y) {
        for (let x = 0; x < GRID_W; ++x) {
            if (!occupied(x, y)) free.push({ x, y });
        }
    }
    if (free.length === 0) return;
    game.food = free[Math.floor(Math.random() * free.length)];
}

function resetGame() {
    game.over = false;
    game.winner = 0;

    game.p1.body = [
        { x: 5, y: Math.floor(GRID_H / 2) },
        { x: 4, y: Math.floor(GRID_H / 2) },
        { x: 3, y: Math.floor(GRID_H / 2) }
    ];
    game.p1.dir = { x: 1, y: 0 };
    game.p1.nextDir = { x: 1, y: 0 };
    game.p1.alive = true;

    game.p2.body = [
        { x: GRID_W - 6, y: Math.floor(GRID_H / 2) },
        { x: GRID_W - 5, y: Math.floor(GRID_H / 2) },
        { x: GRID_W - 4, y: Math.floor(GRID_H / 2) }
    ];
    game.p2.dir = { x: -1, y: 0 };
    game.p2.nextDir = { x: -1, y: 0 };
    game.p2.alive = true;

    // Reset power-up state
    game.p1.speedTimer  = 0; game.p1.shieldTimer = 0;
    game.p2.speedTimer  = 0; game.p2.shieldTimer = 0;
    game.powerup = {x:-1, y:-1, type:'none', lifetime:0};
    game.powerupSpawnTimer = PU_SPAWN_GAP;

    spawnFood();
    updateUI();
}

function spawnPowerup() {
    // Pick a free cell not occupied by snakes or food
    let free = [];
    for (let y = 0; y < GRID_H; y++)
        for (let x = 0; x < GRID_W; x++)
            if (!occupied(x,y) && !(x===game.food.x && y===game.food.y))
                free.push({x,y});
    if (free.length === 0) return;
    let pos  = free[Math.floor(Math.random() * free.length)];
    let type = Math.random() < 0.5 ? 'speed' : 'shield';
    game.powerup = {x:pos.x, y:pos.y, type, lifetime:PU_LIFETIME};
    game.powerupSpawnTimer = PU_SPAWN_GAP + Math.floor(Math.random() * 10);
}

function activatePowerup(player, type) {
    if (type === 'speed')  player.speedTimer  = PU_TICKS;
    if (type === 'shield') player.shieldTimer = PU_TICKS;
}

function stepSnake(self, other) {
    let nd = self.nextDir;
    // Prevent 180 degree reversal
    if (nd.x + self.dir.x !== 0 || nd.y + self.dir.y !== 0) {
        self.dir = { ...nd };
    }

    let newHead = { x: self.body[0].x + self.dir.x, y: self.body[0].y + self.dir.y };

    // Wrap around screen
    newHead.x = (newHead.x + GRID_W) % GRID_W;
    newHead.y = (newHead.y + GRID_H) % GRID_H;

    self.body.unshift(newHead);
    self.grew = false;
    let ateFood = false, atePowerup = false;

    if (newHead.x === game.food.x && newHead.y === game.food.y) {
        self.grew = true;
        ateFood = true;
    } else if (game.powerup.type !== 'none' &&
               newHead.x === game.powerup.x && newHead.y === game.powerup.y) {
        atePowerup = true;  // powerup doesn't grow the snake
    }

    if (!self.grew) self.body.pop();

    // Collision check
    let dead = false;
    for (let i = 1; i < self.body.length; ++i)
        if (self.body[i].x === newHead.x && self.body[i].y === newHead.y) dead = true;
    for (let seg of other.body)
        if (seg.x === newHead.x && seg.y === newHead.y) dead = true;

    return { dead, ateFood, atePowerup };
}

function tickGame() {
    if (game.over) return;

    // Snapshot speed/shield BEFORE decrement (so we apply full-tick benefit)
    const p1speed  = game.p1.speedTimer  > 0;
    const p1shield = game.p1.shieldTimer > 0;
    const p2speed  = game.p2.speedTimer  > 0;
    const p2shield = game.p2.shieldTimer > 0;

    if (game.p1.speedTimer  > 0) game.p1.speedTimer--;
    if (game.p1.shieldTimer > 0) game.p1.shieldTimer--;
    if (game.p2.speedTimer  > 0) game.p2.speedTimer--;
    if (game.p2.shieldTimer > 0) game.p2.shieldTimer--;

    // Powerup lifetime
    if (game.powerup.type !== 'none') {
        if (--game.powerup.lifetime <= 0)
            game.powerup = {x:-1, y:-1, type:'none', lifetime:0};
    }
    // Spawn powerup if none on board
    if (game.powerup.type === 'none' && --game.powerupSpawnTimer <= 0)
        spawnPowerup();

    // Speed snakes move twice per tick; normal snakes move once
    let p1dead = false, p2dead = false;
    for (let step = 0; step < 2; step++) {
        const doP1 = step === 0 || p1speed;
        const doP2 = step === 0 || p2speed;
        let r1 = null, r2 = null;

        if (doP1 && !p1dead) r1 = stepSnake(game.p1, game.p2);
        if (doP2 && !p2dead) r2 = stepSnake(game.p2, game.p1);

        if (r1?.ateFood || r2?.ateFood) spawnFood();

        // Powerup pickup — snapshot type before clearing
        const puType = game.powerup.type;
        if (r1?.atePowerup) {
            activatePowerup(game.p1, puType);
            game.powerup = {x:-1, y:-1, type:'none', lifetime:0};
            game.powerupSpawnTimer = PU_SPAWN_GAP;
        }
        if (r2?.atePowerup) {
            activatePowerup(game.p2, puType);
            game.powerup = {x:-1, y:-1, type:'none', lifetime:0};
            game.powerupSpawnTimer = PU_SPAWN_GAP;
        }

        // Death — shielded players survive
        if (r1?.dead && !p1shield) p1dead = true;
        if (r2?.dead && !p2shield) p2dead = true;
    }

    if (p1dead || p2dead) {
        game.over = true;
        if (p1dead && p2dead) game.winner = -1;
        else if (p1dead)      game.winner = 2;
        else                  game.winner = 1;
    }

    updateUI();
}

function updateUI() {
    const p1Num   = document.getElementById('p1-num');
    const p2Num   = document.getElementById('p2-num');
    const p1Buff  = document.getElementById('p1-buff');
    const p2Buff  = document.getElementById('p2-buff');
    const statusEl = document.getElementById('status');

    if (p1Num) p1Num.textContent = Math.max(0, game.p1.body.length - 3);
    if (p2Num) p2Num.textContent = Math.max(0, game.p2.body.length - 3);

    if (p1Buff) {
        if      (game.p1.speedTimer  > 0) p1Buff.textContent = '⚡';
        else if (game.p1.shieldTimer > 0) p1Buff.textContent = '🛡️';
        else                              p1Buff.textContent = '';
    }
    if (p2Buff) {
        if      (game.p2.speedTimer  > 0) p2Buff.textContent = '⚡';
        else if (game.p2.shieldTimer > 0) p2Buff.textContent = '🛡️';
        else                              p2Buff.textContent = '';
    }

    if (game.over) {
        if (game.winner === 1) statusEl.innerText = '🎀 PLAYER 1 WINS! ✨';
        else if (game.winner === 2) statusEl.innerText = '💎 PLAYER 2 WINS! ✨';
        else statusEl.innerText = '🌸 IT\'S A DRAW! 🌸';
    } else {
        statusEl.innerText = '';
    }
}

// -----------------------------------------------------------------------------------------
// WEBGL2 RENDERING
// -----------------------------------------------------------------------------------------

const baseVS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aOffset;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aIsHead;
layout(location = 4) in vec2 aMoveDir;

uniform mat4 uProjection;
uniform vec2 uCellSize;

out vec3  vColor;
out vec2  vUV;
out float vIsHead;
out vec2  vMoveDir;

const float PAD = 0.06;

void main() {
    vec2 localPos = aPos * (1.0 - 2.0 * PAD) + PAD;
    vec2 world = (aOffset + localPos) * uCellSize;
    gl_Position = uProjection * vec4(world, 0.0, 1.0);
    vColor   = aColor;
    vUV      = aPos;
    vIsHead  = aIsHead;
    vMoveDir = aMoveDir;
}
`;

const baseFS = `#version 300 es
precision highp float;

in vec3  vColor;
in vec2  vUV;
in float vIsHead;
in vec2  vMoveDir;
out vec4 FragColor;

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sharp(float d) { return step(0.0, -d); }

void main() {
    vec2 p = vUV - 0.5;

    // 1. Outer rounded-box shape
    float dOuter = sdRoundedBox(p, vec2(0.42), 0.13);
    if (sharp(dOuter) < 0.5) discard;

    // 2. Internal dark outline
    float dInner     = sdRoundedBox(p, vec2(0.375), 0.08);
    float insideInner = sharp(dInner);
    vec3 col = mix(vColor * 0.28, vColor, insideInner);

    // 3. Top-left gloss sliver
    float dGloss = length((p - vec2(-0.13, 0.13)) / vec2(1.0, 0.65)) - 0.16;
    float gloss  = sharp(dGloss) * insideInner;
    col += vec3(0.28, 0.24, 0.28) * gloss;

    // 4. Eyes on head segments
    if (vIsHead > 0.5) {
        vec2 fwd  = vMoveDir;
        vec2 side = vec2(-fwd.y, fwd.x);

        vec2 eye1 = fwd * 0.17 + side *  0.11;
        vec2 eye2 = fwd * 0.17 - side *  0.11;

        float p1 = sharp(length(p - eye1) - 0.075);
        float p2 = sharp(length(p - eye2) - 0.075);
        if ((p1 + p2) > 0.5) col = vec3(0.10, 0.06, 0.16);

        vec2 gleamOff = vec2(0.026, 0.026);
        float g1 = sharp(length(p - eye1 - gleamOff) - 0.028);
        float g2 = sharp(length(p - eye2 - gleamOff) - 0.028);
        if ((g1 + g2) > 0.5) col = vec3(1.0);
    }

    FragColor = vec4(col, 1.0);
}
`;

const ppVS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aTexCoord;

out vec2 vUV;

void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
    vUV = aTexCoord;
}
`;

const ppFS = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 FragColor;

uniform sampler2D uSceneSharp;
uniform sampler2D uSceneSoft;
uniform vec2 uResolution;
uniform float uTime;

vec3 extractBright(vec3 c) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return c * max(0.0, lum - 0.18) / max(lum, 0.001);
}

vec3 bloom(vec2 uv) {
    vec2 ts = 1.0 / uResolution;
    vec3 acc = vec3(0.0);
    float wTotal = 0.0;
    for (int x = -4; x <= 4; ++x) {
        for (int y = -4; y <= 4; ++y) {
            float w = exp(-float(x*x + y*y) * 0.06);
            vec3 s1 = extractBright(texture(uSceneSoft, uv + vec2(float(x), float(y)) * ts * 3.0).rgb);
            vec3 s2 = extractBright(texture(uSceneSoft, uv + vec2(float(x), float(y)) * ts * 7.0).rgb);
            acc += (s1 * 0.5 + s2 * 0.5) * w;
            wTotal += w;
        }
    }
    return (acc / wTotal) * 3.5;
}

void main() {
    vec3 base  = texture(uSceneSharp, vUV).rgb;
    vec3 color = base + bloom(vUV);

    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    vec2 centre = vUV - 0.5;
    color *= 1.0 - smoothstep(0.45, 0.90, length(centre) * 1.4);

    FragColor = vec4(color, 1.0);
}
`;




function compileShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader Compile Error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("Program Link Error:", gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function ortho(left, right, bottom, top, near, far) {
    return new Float32Array([
        2 / (right - left), 0, 0, 0,
        0, 2 / (top - bottom), 0, 0,
        0, 0, -2 / (far - near), 0,
        -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1
    ]);
}

let gl;
let baseProg, ppProg;
let quadVAO, quadVBO, instanceVBO;
let screenVAO, screenVBO;
let fbo, fboTex;
let sampNearest, sampLinear;
let projMat;
let maxInstances = GRID_W * GRID_H * 2 + 200;
const INST_FLOATS = 8;  // offset(2) + color(3) + isHead(1) + moveDir(2)
let instanceData = new Float32Array(maxInstances * INST_FLOATS);

function initGL() {
    const canvas = document.getElementById('gameCanvas');
    gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
        alert("WebGL2 is not supported in this browser!");
        return;
    }

    baseProg = createProgram(gl, baseVS, baseFS);
    ppProg = createProgram(gl, ppVS, ppFS);

    // Quad for grid cells (Unit square)
    const quadVerts = new Float32Array([
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0,
        0.0, 0.0, 1.0, 1.0, 0.0, 1.0,
    ]);

    quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);

    quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    instanceVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

    // aOffset — vec2 (loc 1), stride = 8 floats * 4 bytes = 32
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);

    // aColor — vec3 (loc 2), offset 8 bytes
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 8);
    gl.vertexAttribDivisor(2, 1);

    // aIsHead — float (loc 3), offset 20 bytes
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 20);
    gl.vertexAttribDivisor(3, 1);

    // aMoveDir — vec2 (loc 4), offset 24 bytes
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 32, 24);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);

    // Screen Quad
    const screenVerts = new Float32Array([
        -1.0, -1.0, 0.0, 0.0,
        1.0, -1.0, 1.0, 0.0,
        1.0, 1.0, 1.0, 1.0,
        -1.0, -1.0, 0.0, 0.0,
        1.0, 1.0, 1.0, 1.0,
        -1.0, 1.0, 0.0, 1.0,
    ]);

    screenVAO = gl.createVertexArray();
    gl.bindVertexArray(screenVAO);
    screenVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, screenVBO);
    gl.bufferData(gl.ARRAY_BUFFER, screenVerts, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    // FBO Setup
    fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, WIN_W, WIN_H, 0, gl.RGB, gl.UNSIGNED_BYTE, null);

    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Samplers
    sampNearest = gl.createSampler();
    gl.samplerParameteri(sampNearest, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampNearest, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampNearest, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampNearest, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    sampLinear = gl.createSampler();
    gl.samplerParameteri(sampLinear, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(sampLinear, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(sampLinear, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampLinear, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    projMat = ortho(0, WIN_W, 0, WIN_H, -1, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function render(timeSec) {
    // --- Instance data build ---
    let numInstances = 0;


    function pushInst(x, y, r, g, b, isHead, mx, my) {
        if (numInstances >= maxInstances) return;
        let idx = numInstances * INST_FLOATS;
        instanceData[idx++] = x;
        instanceData[idx++] = y;
        instanceData[idx++] = r;
        instanceData[idx++] = g;
        instanceData[idx++] = b;
        instanceData[idx++] = isHead;
        instanceData[idx++] = mx;
        instanceData[idx++] = my;
        numInstances++;
    }

    function lerpC(a, b, t) {
        return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    }

    // Subtle grid dots — no head, no dir
    for (let gx = 0; gx < GRID_W; gx += 3)
        for (let gy = 0; gy < GRID_H; gy += 3)
            pushInst(gx, gy, C_GRID[0], C_GRID[1], C_GRID[2], 0, 0, 0);

    // Pulsing food — color cycling
    let pulse = 0.85 + 0.15 * Math.sin(timeSec * 5.0);
    let foodLerp = 0.5 + 0.5 * Math.sin(timeSec * 2.0);
    let fc = lerpC(C_FOOD, C_FOOD2, foodLerp);
    pushInst(game.food.x, game.food.y, fc[0]*pulse, fc[1]*pulse, fc[2]*pulse, 0, 0, 0);

    // Powerup — pulsing, distinct color per type
    if (game.powerup.type !== 'none') {
        const puPulse = 0.80 + 0.20 * Math.abs(Math.sin(timeSec * 6.0));
        const puC = game.powerup.type === 'speed' ? C_SPEED_PU : C_SHIELD_PU;
        pushInst(game.powerup.x, game.powerup.y,
                 puC[0]*puPulse, puC[1]*puPulse, puC[2]*puPulse, 0, 0, 0);
    }

    // Snake bodies — gradient fade, head[0] gets eyes
    // Shield active: tint body slightly brighter / white-ish
    const tailDim = 0.55;
    const d1 = game.p1.dir, d2 = game.p2.dir;
    for (let i = 0; i < game.p1.body.length; i++) {
        let t = game.p1.body.length > 1 ? i / (game.p1.body.length - 1) : 0;
        let fade = 1.0 - t * (1.0 - tailDim);
        let shield = game.p1.shieldTimer > 0 ? 0.25 : 0.0;
        let s = game.p1.body[i];
        pushInst(s.x, s.y,
            Math.min(1, C_P1[0]*fade + shield),
            Math.min(1, C_P1[1]*fade + shield),
            Math.min(1, C_P1[2]*fade + shield),
            (i===0)?1:0, d1.x, d1.y);
    }
    for (let i = 0; i < game.p2.body.length; i++) {
        let t = game.p2.body.length > 1 ? i / (game.p2.body.length - 1) : 0;
        let fade = 1.0 - t * (1.0 - tailDim);
        let shield = game.p2.shieldTimer > 0 ? 0.25 : 0.0;
        let s = game.p2.body[i];
        pushInst(s.x, s.y,
            Math.min(1, C_P2[0]*fade + shield),
            Math.min(1, C_P2[1]*fade + shield),
            Math.min(1, C_P2[2]*fade + shield),
            (i===0)?1:0, d2.x, d2.y);
    }

    // 1. Base Pass (Instanced Rendering to FBO)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, WIN_W, WIN_H);
    gl.clearColor(C_BG[0], C_BG[1], C_BG[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(baseProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(baseProg, "uProjection"), false, projMat);
    gl.uniform2f(gl.getUniformLocation(baseProg, "uCellSize"), CELL_W, CELL_H);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData, 0, numInstances * INST_FLOATS);

    gl.bindVertexArray(quadVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, numInstances);

    // 2. Post Process Pass (Screen Quad)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(ppProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.bindSampler(0, sampNearest);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.bindSampler(1, sampLinear);

    gl.uniform1i(gl.getUniformLocation(ppProg, "uSceneSharp"), 0);
    gl.uniform1i(gl.getUniformLocation(ppProg, "uSceneSoft"), 1);
    gl.uniform2f(gl.getUniformLocation(ppProg, "uResolution"), WIN_W, WIN_H);
    gl.uniform1f(gl.getUniformLocation(ppProg, "uTime"), timeSec);

    gl.bindVertexArray(screenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.bindSampler(0, null);
    gl.bindSampler(1, null);
}

// -----------------------------------------------------------------------------------------
// GAME LOOP & INPUT
// -----------------------------------------------------------------------------------------

let prevTime = performance.now();
let accumulator = 0.0;
let requestReset = false;

function loop(time) {
    let now = time;
    let delta = (now - prevTime) / 1000.0;
    prevTime = now;

    if (delta > 0.25) delta = 0.25;
    accumulator += delta;

    if (requestReset) {
        resetGame();
        requestReset = false;
    }

    while (accumulator >= STEP_MS / 1000.0) {
        tickGame();
        accumulator -= STEP_MS / 1000.0;
    }

    render(now / 1000.0);
    requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R' || e.key === 'Escape') {
        requestReset = true;
        return;
    }

    if (game.over) return;

    // P1 (WASD)
    if (e.key === 'w' || e.key === 'W') game.p1.nextDir = { x: 0, y: 1 };
    if (e.key === 's' || e.key === 'S') game.p1.nextDir = { x: 0, y: -1 };
    if (e.key === 'a' || e.key === 'A') game.p1.nextDir = { x: -1, y: 0 };
    if (e.key === 'd' || e.key === 'D') game.p1.nextDir = { x: 1, y: 0 };

    // P2 (Arrows)
    if (e.key === 'ArrowUp') game.p2.nextDir = { x: 0, y: 1 };
    if (e.key === 'ArrowDown') game.p2.nextDir = { x: 0, y: -1 };
    if (e.key === 'ArrowLeft') game.p2.nextDir = { x: -1, y: 0 };
    if (e.key === 'ArrowRight') game.p2.nextDir = { x: 1, y: 0 };
});

// Generate pixel star decorations in background
(function createStars() {
    const container = document.querySelector('.pixel-stars');
    if (!container) return;
    const colors = ['#ffb3d9', '#b3d4ff', '#d9b3ff', '#fff5b3', '#b3ffe0', '#ffd6b3'];
    for (let i = 0; i < 40; i++) {
        const star = document.createElement('div');
        star.className = 'pixel-star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        star.style.setProperty('--dur', (2 + Math.random() * 4) + 's');
        star.style.animationDelay = (Math.random() * 4) + 's';
        star.style.width = (2 + Math.random() * 4) + 'px';
        star.style.height = star.style.width;
        container.appendChild(star);
    }
})();

// START
initGL();
resetGame();
requestAnimationFrame(loop);
