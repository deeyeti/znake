// 16:9 landscape board — 32×18 grid = 40px cells (bigger for easier gameplay)
const GRID_W = 32;
const GRID_H = 18;
const WIN_W  = 1280;
const WIN_H  = 720;
const CELL_W = WIN_W / GRID_W;  // 40
const CELL_H = WIN_H / GRID_H;  // 40
const STEP_MS = 100;

const PU_TICKS    = 50;   // 5 seconds of effect
const PU_RESPAWN  = 50;   // 5 seconds after pickup before it respawns
const TRAIL_LEN   = 10;  // speed trail length in cells

const C_P1  = [1.0,   0.702, 0.851];
const C_P2  = [0.702, 0.831, 1.0  ];
const C_FOOD = [1.0,  0.961, 0.702];
const C_BG  = [0.102, 0.082, 0.145];
const C_GRID = [0.16, 0.125, 0.22 ];
// Speed trail colour (gold) — used in WebGL render
const C_TRAIL = [1.0, 0.78, 0.2];

// --- Game state ---
let game = {
    p1: { body: [], dir: {x:1,y:0}, nextDir: {x:1,y:0},
          alive: true, grew: false, speedTimer: 0, shieldTimer: 0, trail: [] },
    p2: { body: [], dir: {x:-1,y:0}, nextDir: {x:-1,y:0},
          alive: true, grew: false, speedTimer: 0, shieldTimer: 0, trail: [] },
    food: {x:0, y:0},
    speedPU:  { x:-1, y:-1, exists: false, spawnTimer: 5  },
    shieldPU: { x:-1, y:-1, exists: false, spawnTimer: 15 },
    over: false, winner: 0
};

function occupied(x, y) {
    if (game.p1.body.some(s => s.x===x && s.y===y)) return true;
    if (game.p2.body.some(s => s.x===x && s.y===y)) return true;
    return false;
}

function freeCell(exclude) {
    let free = [];
    for (let y = 0; y < GRID_H; y++)
        for (let x = 0; x < GRID_W; x++)
            if (!occupied(x,y) && !exclude.some(e=>e&&e.x===x&&e.y===y))
                free.push({x,y});
    return free.length ? free[Math.floor(Math.random()*free.length)] : null;
}

function spawnFood() {
    let pos = freeCell([game.speedPU.exists?game.speedPU:null,
                        game.shieldPU.exists?game.shieldPU:null]);
    if (pos) game.food = pos;
}

function spawnSpeedPU() {
    let pos = freeCell([game.food, game.shieldPU.exists?game.shieldPU:null]);
    if (pos) { game.speedPU.x=pos.x; game.speedPU.y=pos.y; game.speedPU.exists=true; }
}
function spawnShieldPU() {
    let pos = freeCell([game.food, game.speedPU.exists?game.speedPU:null]);
    if (pos) { game.shieldPU.x=pos.x; game.shieldPU.y=pos.y; game.shieldPU.exists=true; }
}

function resetGame() {
    game.over = false; game.winner = 0;
    const my = Math.floor(GRID_H/2);
    game.p1.body = [{x:5,y:my},{x:4,y:my},{x:3,y:my}];
    game.p1.dir = game.p1.nextDir = {x:1,y:0};
    game.p1.alive = true; game.p1.speedTimer=0; game.p1.shieldTimer=0; game.p1.trail=[];
    game.p2.body = [{x:GRID_W-6,y:my},{x:GRID_W-5,y:my},{x:GRID_W-4,y:my}];
    game.p2.dir = game.p2.nextDir = {x:-1,y:0};
    game.p2.alive = true; game.p2.speedTimer=0; game.p2.shieldTimer=0; game.p2.trail=[];
    game.speedPU  = {x:-1,y:-1,exists:false,spawnTimer:5};
    game.shieldPU = {x:-1,y:-1,exists:false,spawnTimer:15};
    spawnFood();
    updateUI();
}

function stepSnake(self, other, shielded) {
    let nd = self.nextDir;
    if (nd.x+self.dir.x!==0 || nd.y+self.dir.y!==0) self.dir={...nd};
    let newHead = {
        x: (self.body[0].x+self.dir.x+GRID_W)%GRID_W,
        y: (self.body[0].y+self.dir.y+GRID_H)%GRID_H
    };
    self.body.unshift(newHead);
    self.grew = false;
    let ateFood=false, ateSpeed=false, ateShield=false;
    if (newHead.x===game.food.x && newHead.y===game.food.y) {
        self.grew=true; ateFood=true;
    } else if (game.speedPU.exists && newHead.x===game.speedPU.x && newHead.y===game.speedPU.y) {
        ateSpeed=true;
    } else if (game.shieldPU.exists && newHead.x===game.shieldPU.x && newHead.y===game.shieldPU.y) {
        ateShield=true;
    }
    if (!self.grew) self.body.pop();
    let dead=false;
    for (let i=1;i<self.body.length;++i)
        if (self.body[i].x===newHead.x&&self.body[i].y===newHead.y) dead=true;
    // Shield: pass through other snake
    if (!shielded)
        for (let seg of other.body)
            if (seg.x===newHead.x&&seg.y===newHead.y) dead=true;
    return {dead,ateFood,ateSpeed,ateShield};
}

function tickGame() {
    if (game.over) return;
    const p1speed=game.p1.speedTimer>0, p1shield=game.p1.shieldTimer>0;
    const p2speed=game.p2.speedTimer>0, p2shield=game.p2.shieldTimer>0;
    if (game.p1.speedTimer>0)  { game.p1.speedTimer--;  if(game.p1.speedTimer===0) game.p1.trail=[]; }
    if (game.p1.shieldTimer>0) game.p1.shieldTimer--;
    if (game.p2.speedTimer>0)  { game.p2.speedTimer--;  if(game.p2.speedTimer===0) game.p2.trail=[]; }
    if (game.p2.shieldTimer>0) game.p2.shieldTimer--;
    // Powerup spawn timers (only when not on board)
    if (!game.speedPU.exists  && --game.speedPU.spawnTimer  <= 0) spawnSpeedPU();
    if (!game.shieldPU.exists && --game.shieldPU.spawnTimer <= 0) spawnShieldPU();
    let p1dead=false, p2dead=false;
    for (let step=0; step<2; step++) {
        const doP1=step===0||p1speed, doP2=step===0||p2speed;
        let r1=null,r2=null;
        if (doP1&&!p1dead) r1=stepSnake(game.p1,game.p2,p1shield);
        if (doP2&&!p2dead) r2=stepSnake(game.p2,game.p1,p2shield);
        if (r1?.ateFood||r2?.ateFood) spawnFood();
        if (r1?.ateSpeed)  { game.p1.speedTimer=PU_TICKS;  game.speedPU.exists=false;  game.speedPU.spawnTimer=PU_RESPAWN; }
        if (r1?.ateShield) { game.p1.shieldTimer=PU_TICKS; game.shieldPU.exists=false; game.shieldPU.spawnTimer=PU_RESPAWN; }
        if (r2?.ateSpeed)  { game.p2.speedTimer=PU_TICKS;  game.speedPU.exists=false;  game.speedPU.spawnTimer=PU_RESPAWN; }
        if (r2?.ateShield) { game.p2.shieldTimer=PU_TICKS; game.shieldPU.exists=false; game.shieldPU.spawnTimer=PU_RESPAWN; }
        // Update speed trails
        if (p1speed && doP1 && !p1dead && r1 && !r1.dead) {
            game.p1.trail.unshift({...game.p1.body[0]});
            if (game.p1.trail.length>TRAIL_LEN) game.p1.trail.pop();
        }
        if (p2speed && doP2 && !p2dead && r2 && !r2.dead) {
            game.p2.trail.unshift({...game.p2.body[0]});
            if (game.p2.trail.length>TRAIL_LEN) game.p2.trail.pop();
        }
        if (r1?.dead&&!p1shield) p1dead=true;
        if (r2?.dead&&!p2shield) p2dead=true;
    }
    if (p1dead||p2dead) {
        game.over=true;
        if (p1dead&&p2dead) game.winner=-1;
        else if (p1dead)    game.winner=2;
        else                game.winner=1;
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
    const buffStr = (p) => {
        let s = '';
        if (p.speedTimer  > 0) s += '⚡';
        if (p.shieldTimer > 0) s += '🛡️';
        return s;
    };
    if (p1Buff) p1Buff.textContent = buffStr(game.p1);
    if (p2Buff) p2Buff.textContent = buffStr(game.p2);
    if (statusEl) {
        if (game.over) {
            if (game.winner===1)       statusEl.innerText = '🎀 PLAYER 1 WINS! ✨';
            else if (game.winner===2)  statusEl.innerText = '💎 PLAYER 2 WINS! ✨';
            else                       statusEl.innerText = '🌸 IT\'S A DRAW! 🌸';
        } else statusEl.innerText = '';
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
void main() {
    vec3 color = texture(uSceneSharp, vUV).rgb;
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0/2.2));
    vec2 c = vUV - 0.5;
    color *= 1.0 - smoothstep(0.45, 0.90, length(c) * 1.4);
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

    // Pulsing food — solid yellow
    const pulse = 0.85 + 0.15 * Math.sin(timeSec * 5.0);
    pushInst(game.food.x, game.food.y, C_FOOD[0]*pulse, C_FOOD[1]*pulse, C_FOOD[2]*pulse, 0, 0, 0);
    // Grid dots
    for (let gx=0;gx<GRID_W;gx+=4)
        for (let gy=0;gy<GRID_H;gy+=4)
            pushInst(gx,gy,C_GRID[0],C_GRID[1],C_GRID[2],0,0,0);

    // Speed trail (gold) — drawn BEFORE body so body renders on top
    const goldDim = 0.45;
    const drawTrail = (trail) => {
        trail.forEach((pos, i) => {
            const fade = goldDim * (1 - i / TRAIL_LEN);
            pushInst(pos.x, pos.y, C_TRAIL[0]*fade*2, C_TRAIL[1]*fade*2, C_TRAIL[2]*fade, 0, 0, 0);
        });
    };
    drawTrail(game.p1.trail);
    drawTrail(game.p2.trail);

    // Snake bodies — solid colour, no gradient, head gets eyes
    const d1=game.p1.dir, d2=game.p2.dir;
    for (let i=0;i<game.p1.body.length;i++) {
        const s=game.p1.body[i];
        pushInst(s.x,s.y,C_P1[0],C_P1[1],C_P1[2],(i===0)?1:0,d1.x,d1.y);
    }
    for (let i=0;i<game.p2.body.length;i++) {
        const s=game.p2.body[i];
        pushInst(s.x,s.y,C_P2[0],C_P2[1],C_P2[2],(i===0)?1:0,d2.x,d2.y);
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

// 2D canvas overlay: emoji powerups, shield glow, speed trail glow
let overlayCtx = null;
function initOverlay() {
    const oc = document.getElementById('overlayCanvas');
    if (!oc) return;
    overlayCtx = oc.getContext('2d');
    // Polyfill roundRect for older browsers
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
            r = Math.min(r, w/2, h/2);
            this.moveTo(x+r,y); this.lineTo(x+w-r,y);
            this.arcTo(x+w,y, x+w,y+h, r); this.lineTo(x+w,y+h-r);
            this.arcTo(x+w,y+h, x,y+h, r); this.lineTo(x+r,y+h);
            this.arcTo(x,y+h, x,y, r); this.lineTo(x,y+r);
            this.arcTo(x,y, x+w,y, r); this.closePath();
        };
    }
}

function cellToCanvas(x, y) {
    // WebGL y=0 is bottom; 2D canvas y=0 is top — flip y
    return { cx: (x + 0.5) * CELL_W, cy: WIN_H - (y + 0.5) * CELL_H };
}

function renderOverlay(timeSec) {
    if (!overlayCtx) return;
    const ctx = overlayCtx;
    ctx.clearRect(0, 0, WIN_W, WIN_H);
    const fs = Math.floor(CELL_H * 0.78);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = fs + 'px serif';

    // Shield glow — bright blue shadow around each body segment
    const drawShieldGlow = (body, alpha) => {
        ctx.save();
        ctx.shadowColor = `rgba(80,160,255,${alpha})`;
        ctx.shadowBlur = CELL_H * 0.7;
        ctx.fillStyle = `rgba(100,180,255,0.18)`;
        for (const seg of body) {
            const {cx,cy} = cellToCanvas(seg.x, seg.y);
            ctx.beginPath();
            ctx.roundRect(cx-CELL_W*0.48, cy-CELL_H*0.48, CELL_W*0.96, CELL_H*0.96, CELL_H*0.15);
            ctx.fill();
        }
        ctx.restore();
    };
    if (game.p1.shieldTimer>0) drawShieldGlow(game.p1.body, 0.85);
    if (game.p2.shieldTimer>0) drawShieldGlow(game.p2.body, 0.85);

    // Speed trail glow — golden shadow
    const drawTrailGlow = (trail) => {
        trail.forEach((pos, i) => {
            const alpha = (1 - i/TRAIL_LEN) * 0.7;
            const {cx,cy} = cellToCanvas(pos.x, pos.y);
            ctx.save();
            ctx.shadowColor = `rgba(255,200,30,${alpha})`;
            ctx.shadowBlur = CELL_H * 0.8;
            ctx.fillStyle = `rgba(255,190,20,${alpha*0.4})`;
            ctx.beginPath();
            ctx.roundRect(cx-CELL_W*0.38, cy-CELL_H*0.38, CELL_W*0.76, CELL_H*0.76, CELL_H*0.12);
            ctx.fill();
            ctx.restore();
        });
    };
    drawTrailGlow(game.p1.trail);
    drawTrailGlow(game.p2.trail);

    // Powerup emojis — pulsing scale
    const pu = 1.0 + 0.08 * Math.sin(timeSec * 5);
    ctx.save(); ctx.scale(pu, pu);
    if (game.speedPU.exists) {
        const {cx,cy} = cellToCanvas(game.speedPU.x, game.speedPU.y);
        ctx.fillText('⚡', cx/pu, cy/pu);
    }
    if (game.shieldPU.exists) {
        const {cx,cy} = cellToCanvas(game.shieldPU.x, game.shieldPU.y);
        ctx.fillText('🛡️', cx/pu, cy/pu);
    }
    ctx.restore();
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
    renderOverlay(now / 1000.0);
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
initOverlay();
resetGame();
requestAnimationFrame(loop);
