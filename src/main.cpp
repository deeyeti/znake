/*  znake — 2-player Snake/Tron hybrid
    P1: WASD  |  Pastel Pink  (#f5c2e7)
    P2: Arrow keys  |  Pastel Blue  (#89b4fa)
    Food: Pastel Yellow  (#f9e2af)
    ESC / R: reset
*/

#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <algorithm>
#include <chrono>
#include <deque>
#include <fstream>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <vector>

// ─── Constants ───────────────────────────────────────────────────────────────
static constexpr int    GRID_W     = 48;
static constexpr int    GRID_H     = 27;
static constexpr int    WIN_W      = 960;
static constexpr int    WIN_H      = 540;
static constexpr float  CELL_W     = (float)WIN_W / GRID_W;  // 20
static constexpr float  CELL_H     = (float)WIN_H / GRID_H;  // 20
static constexpr double STEP_SECS  = 0.10;
static constexpr int    PU_TICKS   = 50;   // 5s at 100ms/tick
static constexpr int    PU_LIFETIME  = 25;
static constexpr int    PU_SPAWN_GAP = 18;

// Colours — cute pastel palette
static const glm::vec3 C_P1       = {1.000f, 0.702f, 0.851f};
static const glm::vec3 C_P2       = {0.702f, 0.831f, 1.000f};
static const glm::vec3 C_FOOD     = {1.000f, 0.961f, 0.702f};
static const glm::vec3 C_FOOD2    = {0.851f, 0.702f, 1.000f};
static const glm::vec3 C_BG       = {0.102f, 0.082f, 0.145f};
static const glm::vec3 C_GRID     = {0.160f, 0.125f, 0.220f};
static const glm::vec3 C_SPEED_PU  = {0.702f, 1.000f, 0.878f}; // mint  ⚡
static const glm::vec3 C_SHIELD_PU = {1.000f, 0.863f, 0.431f}; // gold  🛡

// ─── Utilities ───────────────────────────────────────────────────────────────
static std::string readFile(const std::string& path)
{
    std::ifstream f(path);
    if (!f)
    {
        std::cerr << "[ERR] Cannot open file: " << path << "\n";
        std::exit(1);
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static GLuint compileShader(GLenum type, const std::string& src)
{
    GLuint id = glCreateShader(type);
    const char* c = src.c_str();
    glShaderSource(id, 1, &c, nullptr);
    glCompileShader(id);
    GLint ok;
    glGetShaderiv(id, GL_COMPILE_STATUS, &ok);
    if (!ok)
    {
        char log[1024];
        glGetShaderInfoLog(id, sizeof log, nullptr, log);
        std::cerr << "[GLSL] " << log << "\n";
        std::exit(1);
    }
    return id;
}

static GLuint buildProgram(const std::string& vsrc, const std::string& fsrc)
{
    GLuint vs = compileShader(GL_VERTEX_SHADER,   vsrc);
    GLuint fs = compileShader(GL_FRAGMENT_SHADER, fsrc);
    GLuint prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);
    GLint ok;
    glGetProgramiv(prog, GL_LINK_STATUS, &ok);
    if (!ok)
    {
        char log[1024];
        glGetProgramInfoLog(prog, sizeof log, nullptr, log);
        std::cerr << "[LINK] " << log << "\n";
        std::exit(1);
    }
    glDeleteShader(vs);
    glDeleteShader(fs);
    return prog;
}

// ─── Game State ──────────────────────────────────────────────────────────────
struct Snake
{
    std::deque<glm::ivec2> body;
    glm::ivec2             dir;
    glm::ivec2             nextDir;
    glm::vec3              color;
    bool                   grew        = false;
    bool                   alive       = true;
    int                    speedTimer  = 0;  // ticks remaining
    int                    shieldTimer = 0;
};

enum class PUType { None, Speed, Shield };

struct PowerUp
{
    glm::ivec2 pos   = {-1, -1};
    PUType     type  = PUType::None;
    int        life  = 0;
};

struct GameState
{
    Snake     p1, p2;
    glm::ivec2 food;
    PowerUp   powerup;
    int       puSpawnTimer = PU_SPAWN_GAP;
    bool      over    = false;
    int       winner  = 0;
};

static std::mt19937 rng(std::random_device{}());

static bool occupied(const GameState& g, glm::ivec2 pos)
{
    for (auto& s : g.p1.body) if (s == pos) return true;
    for (auto& s : g.p2.body) if (s == pos) return true;
    return false;
}

static void spawnFood(GameState& g)
{
    std::vector<glm::ivec2> free;
    free.reserve(GRID_W * GRID_H);
    for (int y = 0; y < GRID_H; ++y)
        for (int x = 0; x < GRID_W; ++x)
        {
            glm::ivec2 p{x, y};
            if (!occupied(g, p) && p != g.food) free.push_back(p);
        }
    if (free.empty()) return;
    std::uniform_int_distribution<int> d(0, (int)free.size() - 1);
    g.food = free[d(rng)];
}

static void spawnPowerup(GameState& g)
{
    std::uniform_int_distribution<int> tx(0, GRID_W-1), ty(0, GRID_H-1);
    std::vector<glm::ivec2> free;
    free.reserve(GRID_W * GRID_H);
    for (int y = 0; y < GRID_H; ++y)
        for (int x = 0; x < GRID_W; ++x)
        {
            glm::ivec2 p{x,y};
            if (!occupied(g, p) && p != g.food) free.push_back(p);
        }
    if (free.empty()) return;
    std::uniform_int_distribution<int> pick(0, (int)free.size()-1);
    std::uniform_int_distribution<int> typeD(0, 1);
    g.powerup.pos  = free[pick(rng)];
    g.powerup.type = typeD(rng) ? PUType::Speed : PUType::Shield;
    g.powerup.life = PU_LIFETIME;
    std::uniform_int_distribution<int> gapD(0, 9);
    g.puSpawnTimer = PU_SPAWN_GAP + gapD(rng);
}

static void resetGame(GameState& g)
{
    g.over   = false;
    g.winner = 0;

    g.p1.body.clear();
    g.p1.body.push_back({5, GRID_H / 2});
    g.p1.body.push_back({4, GRID_H / 2});
    g.p1.body.push_back({3, GRID_H / 2});
    g.p1.dir = g.p1.nextDir = {1, 0};
    g.p1.color = C_P1; g.p1.alive = true; g.p1.grew = false;
    g.p1.speedTimer = g.p1.shieldTimer = 0;

    g.p2.body.clear();
    g.p2.body.push_back({GRID_W - 6, GRID_H / 2});
    g.p2.body.push_back({GRID_W - 5, GRID_H / 2});
    g.p2.body.push_back({GRID_W - 4, GRID_H / 2});
    g.p2.dir = g.p2.nextDir = {-1, 0};
    g.p2.color = C_P2; g.p2.alive = true; g.p2.grew = false;
    g.p2.speedTimer = g.p2.shieldTimer = 0;

    g.powerup = {};
    g.puSpawnTimer = PU_SPAWN_GAP;
    spawnFood(g);
}

// stepSnake: returns {dead, atePowerup}
struct StepResult { bool dead; bool atePowerup; };

static StepResult stepSnake(Snake& self, const Snake& other, GameState& g, bool& foodEaten)
{
    glm::ivec2 nd = self.nextDir;
    if (nd + self.dir != glm::ivec2{0,0}) self.dir = nd;

    glm::ivec2 newHead = self.body.front() + self.dir;
    newHead.x = (newHead.x + GRID_W) % GRID_W;
    newHead.y = (newHead.y + GRID_H) % GRID_H;

    self.body.push_front(newHead);
    self.grew = false;

    bool atePowerup = false;
    if (newHead == g.food) {
        self.grew = true; foodEaten = true;
    } else if (g.powerup.type != PUType::None && newHead == g.powerup.pos) {
        atePowerup = true;  // no grow
    }
    if (!self.grew) self.body.pop_back();

    for (int i = 1; i < (int)self.body.size(); ++i)
        if (self.body[i] == newHead) return {true, atePowerup};
    for (auto& seg : other.body)
        if (seg == newHead) return {true, atePowerup};

    return {false, atePowerup};
}

static void tickGame(GameState& g)
{
    if (g.over) return;

    // Snapshot then decrement timers
    bool p1speed  = g.p1.speedTimer  > 0;
    bool p1shield = g.p1.shieldTimer > 0;
    bool p2speed  = g.p2.speedTimer  > 0;
    bool p2shield = g.p2.shieldTimer > 0;
    if (g.p1.speedTimer  > 0) g.p1.speedTimer--;
    if (g.p1.shieldTimer > 0) g.p1.shieldTimer--;
    if (g.p2.speedTimer  > 0) g.p2.speedTimer--;
    if (g.p2.shieldTimer > 0) g.p2.shieldTimer--;

    // Powerup lifetime
    if (g.powerup.type != PUType::None)
        if (--g.powerup.life <= 0) g.powerup = {};
    if (g.powerup.type == PUType::None && --g.puSpawnTimer <= 0)
        spawnPowerup(g);

    bool p1dead = false, p2dead = false;
    for (int step = 0; step < 2; ++step)
    {
        bool doP1 = (step == 0) || p1speed;
        bool doP2 = (step == 0) || p2speed;
        bool fe1 = false, fe2 = false;
        StepResult r1{}, r2{};

        if (doP1 && !p1dead) r1 = stepSnake(g.p1, g.p2, g, fe1);
        if (doP2 && !p2dead) r2 = stepSnake(g.p2, g.p1, g, fe2);

        if (fe1 || fe2) spawnFood(g);

        PUType puType = g.powerup.type;
        if (r1.atePowerup) {
            if (puType == PUType::Speed)  g.p1.speedTimer  = PU_TICKS;
            if (puType == PUType::Shield) g.p1.shieldTimer = PU_TICKS;
            g.powerup = {}; g.puSpawnTimer = PU_SPAWN_GAP;
        }
        if (r2.atePowerup) {
            if (puType == PUType::Speed)  g.p2.speedTimer  = PU_TICKS;
            if (puType == PUType::Shield) g.p2.shieldTimer = PU_TICKS;
            g.powerup = {}; g.puSpawnTimer = PU_SPAWN_GAP;
        }

        if (r1.dead && !p1shield) p1dead = true;
        if (r2.dead && !p2shield) p2dead = true;
    }

    if (p1dead || p2dead) {
        g.over = true;
        if (p1dead && p2dead) g.winner = -1;
        else if (p1dead)      g.winner =  2;
        else                  g.winner =  1;
    }
}

// ─── OpenGL Render State ─────────────────────────────────────────────────────
struct InstanceData
{
    glm::vec2 offset;    // grid cell
    glm::vec3 color;     // pastel colour
    float     isHead;    // 1.0 = head segment
    glm::vec2 moveDir;   // snake direction (unit grid vector)
};

struct GL
{
    // Base pass
    GLuint baseProg   = 0;
    GLuint quadVAO    = 0;
    GLuint quadVBO    = 0;
    GLuint instanceVBO = 0;

    // FBO
    GLuint fbo        = 0;
    GLuint fboTex     = 0;
    GLuint fboRB      = 0;   // depth/stencil renderbuffer

    // Samplers
    GLuint sampNearest = 0;
    GLuint sampLinear  = 0;

    // Post-process pass
    GLuint ppProg     = 0;
    GLuint screenVAO  = 0;
    GLuint screenVBO  = 0;

    glm::mat4 proj{1.f};
};

static void buildQuadVAO(GL& gl)
{
    // Unit quad: two CCW triangles, vertices in [0,1]x[0,1]
    float verts[] = {
        0.f, 0.f,
        1.f, 0.f,
        1.f, 1.f,
        0.f, 0.f,
        1.f, 1.f,
        0.f, 1.f,
    };

    glGenVertexArrays(1, &gl.quadVAO);
    glGenBuffers(1,     &gl.quadVBO);
    glGenBuffers(1,     &gl.instanceVBO);

    glBindVertexArray(gl.quadVAO);

    // aPos (loc 0)
    glBindBuffer(GL_ARRAY_BUFFER, gl.quadVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof verts, verts, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);

    // Instance buffer
    glBindBuffer(GL_ARRAY_BUFFER, gl.instanceVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(InstanceData) * GRID_W * GRID_H * 4,
                 nullptr, GL_DYNAMIC_DRAW);

    // aOffset — vec2 (loc 1)
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, sizeof(InstanceData),
                          (void*)offsetof(InstanceData, offset));
    glVertexAttribDivisor(1, 1);

    // aColor — vec3 (loc 2)
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 3, GL_FLOAT, GL_FALSE, sizeof(InstanceData),
                          (void*)offsetof(InstanceData, color));
    glVertexAttribDivisor(2, 1);

    // aIsHead — float (loc 3)
    glEnableVertexAttribArray(3);
    glVertexAttribPointer(3, 1, GL_FLOAT, GL_FALSE, sizeof(InstanceData),
                          (void*)offsetof(InstanceData, isHead));
    glVertexAttribDivisor(3, 1);

    // aMoveDir — vec2 (loc 4)
    glEnableVertexAttribArray(4);
    glVertexAttribPointer(4, 2, GL_FLOAT, GL_FALSE, sizeof(InstanceData),
                          (void*)offsetof(InstanceData, moveDir));
    glVertexAttribDivisor(4, 1);

    glBindVertexArray(0);
}

static void buildScreenVAO(GL& gl)
{
    // Full-screen quad in NDC
    float verts[] = {
        // pos      uv
        -1.f, -1.f,  0.f, 0.f,
         1.f, -1.f,  1.f, 0.f,
         1.f,  1.f,  1.f, 1.f,
        -1.f, -1.f,  0.f, 0.f,
         1.f,  1.f,  1.f, 1.f,
        -1.f,  1.f,  0.f, 1.f,
    };

    glGenVertexArrays(1, &gl.screenVAO);
    glGenBuffers(1,     &gl.screenVBO);

    glBindVertexArray(gl.screenVAO);
    glBindBuffer(GL_ARRAY_BUFFER, gl.screenVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof verts, verts, GL_STATIC_DRAW);

    // aPos (loc 0)
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), nullptr);

    // aTexCoord (loc 1)
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float),
                          (void*)(2 * sizeof(float)));
    glBindVertexArray(0);
}

static void buildFBO(GL& gl)
{
    glGenFramebuffers(1,  &gl.fbo);
    glGenTextures(1,       &gl.fboTex);
    glGenRenderbuffers(1,  &gl.fboRB);

    glBindTexture(GL_TEXTURE_2D, gl.fboTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, WIN_W, WIN_H, 0,
                 GL_RGB, GL_UNSIGNED_BYTE, nullptr);
    // Will be overridden by sampler objects
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    glBindRenderbuffer(GL_RENDERBUFFER, gl.fboRB);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, WIN_W, WIN_H);

    glBindFramebuffer(GL_FRAMEBUFFER, gl.fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
                           GL_TEXTURE_2D, gl.fboTex, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT,
                              GL_RENDERBUFFER, gl.fboRB);

    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
        std::cerr << "[FBO] Incomplete!\n";

    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    // ── Sampler objects ──
    glGenSamplers(1, &gl.sampNearest);
    glSamplerParameteri(gl.sampNearest, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glSamplerParameteri(gl.sampNearest, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glSamplerParameteri(gl.sampNearest, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glSamplerParameteri(gl.sampNearest, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    glGenSamplers(1, &gl.sampLinear);
    glSamplerParameteri(gl.sampLinear, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glSamplerParameteri(gl.sampLinear, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glSamplerParameteri(gl.sampLinear, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glSamplerParameteri(gl.sampLinear, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

// ─── Key callback ─────────────────────────────────────────────────────────────
static GameState* g_gameState = nullptr;
static bool       g_resetFlag = false;

static void keyCallback(GLFWwindow* win, int key, int /*sc*/, int action, int /*mod*/)
{
    if (action == GLFW_PRESS || action == GLFW_REPEAT)
    {
        // Reset
        if (key == GLFW_KEY_R || key == GLFW_KEY_ESCAPE)
        {
            g_resetFlag = true;
            return;
        }

        if (!g_gameState || g_gameState->over) return;

        // P1 — WASD
        if (key == GLFW_KEY_W) g_gameState->p1.nextDir = { 0,  1};
        if (key == GLFW_KEY_S) g_gameState->p1.nextDir = { 0, -1};
        if (key == GLFW_KEY_A) g_gameState->p1.nextDir = {-1,  0};
        if (key == GLFW_KEY_D) g_gameState->p1.nextDir = { 1,  0};

        // P2 — Arrow keys
        if (key == GLFW_KEY_UP)    g_gameState->p2.nextDir = { 0,  1};
        if (key == GLFW_KEY_DOWN)  g_gameState->p2.nextDir = { 0, -1};
        if (key == GLFW_KEY_LEFT)  g_gameState->p2.nextDir = {-1,  0};
        if (key == GLFW_KEY_RIGHT) g_gameState->p2.nextDir = { 1,  0};
    }

    if (action == GLFW_PRESS && key == GLFW_KEY_F11)
    {
        // Quick toggle fullscreen (optional convenience)
        GLFWmonitor* mon = glfwGetPrimaryMonitor();
        const GLFWvidmode* vm = glfwGetVideoMode(mon);
        glfwSetWindowMonitor(win, mon, 0, 0, vm->width, vm->height, vm->refreshRate);
    }
}

// ─── Render ──────────────────────────────────────────────────────────────────
static void renderFrame(const GameState& g, GL& gl, float time)
{
    // Collect instances
    std::vector<InstanceData> instances;
    instances.reserve(512);

    auto push = [&](glm::ivec2 cell, glm::vec3 col, float isHead, glm::vec2 dir)
    {
        instances.push_back({ glm::vec2(cell), col, isHead, dir });
    };

    // Subtle grid dots (every 3rd cell) — no head, no direction
    for (int gx = 0; gx < GRID_W; gx += 3)
        for (int gy = 0; gy < GRID_H; gy += 3)
            push({gx, gy}, C_GRID, 0.f, {0.f, 0.f});

    // Food — pulsing, color cycling, no eyes
    float pulse    = 0.85f + 0.15f * std::sin(time * 5.0f);
    float foodLerp = 0.5f  + 0.5f  * std::sin(time * 2.0f);
    glm::vec3 fc   = glm::mix(C_FOOD, C_FOOD2, foodLerp);
    push(g.food, fc * pulse, 0.f, {0.f, 0.f});

    // Power-up — pulsing mint (speed) or gold (shield)
    if (g.powerup.type != PUType::None)
    {
        float puPulse = 0.80f + 0.20f * std::abs(std::sin(time * 6.0f));
        glm::vec3 puC = (g.powerup.type == PUType::Speed) ? C_SPEED_PU : C_SHIELD_PU;
        push(g.powerup.pos, puC * puPulse, 0.f, {0.f, 0.f});
    }

    // Snake bodies — gradient fade, shield tint, eyes on head
    const float tailDim = 0.55f;
    const float shieldTint = 0.25f;
    glm::vec2 dir1 = glm::vec2(g.p1.dir);
    glm::vec2 dir2 = glm::vec2(g.p2.dir);

    for (int i = 0; i < (int)g.p1.body.size(); ++i)
    {
        float t    = g.p1.body.size() > 1 ? (float)i / ((float)g.p1.body.size() - 1.f) : 0.f;
        float fade = 1.0f - t * (1.0f - tailDim);
        float sh   = (g.p1.shieldTimer > 0) ? shieldTint : 0.f;
        glm::vec3 col = glm::min(g.p1.color * fade + sh, glm::vec3(1.f));
        push(g.p1.body[i], col, (i == 0) ? 1.f : 0.f, dir1);
    }
    for (int i = 0; i < (int)g.p2.body.size(); ++i)
    {
        float t    = g.p2.body.size() > 1 ? (float)i / ((float)g.p2.body.size() - 1.f) : 0.f;
        float fade = 1.0f - t * (1.0f - tailDim);
        float sh   = (g.p2.shieldTimer > 0) ? shieldTint : 0.f;
        glm::vec3 col = glm::min(g.p2.color * fade + sh, glm::vec3(1.f));
        push(g.p2.body[i], col, (i == 0) ? 1.f : 0.f, dir2);
    }

    // ── Base pass → FBO ──────────────────────────────────────────────────────
    glBindFramebuffer(GL_FRAMEBUFFER, gl.fbo);
    glViewport(0, 0, WIN_W, WIN_H);
    glClearColor(C_BG.r, C_BG.g, C_BG.b, 1.f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    glUseProgram(gl.baseProg);
    glUniformMatrix4fv(glGetUniformLocation(gl.baseProg, "uProjection"),
                       1, GL_FALSE, glm::value_ptr(gl.proj));
    glUniform2f(glGetUniformLocation(gl.baseProg, "uCellSize"), CELL_W, CELL_H);

    // Upload instance data
    glBindBuffer(GL_ARRAY_BUFFER, gl.instanceVBO);
    glBufferSubData(GL_ARRAY_BUFFER, 0,
                    (GLsizeiptr)(instances.size() * sizeof(InstanceData)),
                    instances.data());

    glBindVertexArray(gl.quadVAO);
    glDrawArraysInstanced(GL_TRIANGLES, 0, 6, (GLsizei)instances.size());
    glBindVertexArray(0);

    // ── Post-process pass → default framebuffer ───────────────────────────────
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, WIN_W, WIN_H);
    glClearColor(0.f, 0.f, 0.f, 1.f);
    glClear(GL_COLOR_BUFFER_BIT);

    glUseProgram(gl.ppProg);

    // Bind FBO texture to unit 0 (nearest) and unit 1 (linear)
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, gl.fboTex);
    glBindSampler(0, gl.sampNearest);

    glActiveTexture(GL_TEXTURE1);
    glBindTexture(GL_TEXTURE_2D, gl.fboTex);
    glBindSampler(1, gl.sampLinear);

    glUniform1i(glGetUniformLocation(gl.ppProg, "uSceneSharp"), 0);
    glUniform1i(glGetUniformLocation(gl.ppProg, "uSceneSoft"),  1);
    glUniform2f(glGetUniformLocation(gl.ppProg, "uResolution"), (float)WIN_W, (float)WIN_H);
    glUniform1f(glGetUniformLocation(gl.ppProg, "uTime"), time);

    glBindVertexArray(gl.screenVAO);
    glDrawArrays(GL_TRIANGLES, 0, 6);
    glBindVertexArray(0);

    // Cleanup samplers
    glBindSampler(0, 0);
    glBindSampler(1, 0);
}

// ─── Main ────────────────────────────────────────────────────────────────────
int main()
{
    // ── GLFW init ──
    if (!glfwInit())
    {
        std::cerr << "GLFW init failed\n";
        return 1;
    }

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
#ifdef __APPLE__
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
#endif
    glfwWindowHint(GLFW_RESIZABLE, GLFW_FALSE);

    GLFWwindow* win = glfwCreateWindow(WIN_W, WIN_H, "znake ~*~", nullptr, nullptr);
    if (!win)
    {
        std::cerr << "Window creation failed\n";
        glfwTerminate();
        return 1;
    }
    glfwMakeContextCurrent(win);
    glfwSwapInterval(1);  // vsync on

    // ── GLAD init ──
    if (!gladLoadGL(glfwGetProcAddress))
    {
        std::cerr << "GLAD load failed\n";
        return 1;
    }
    std::cout << "OpenGL " << glGetString(GL_VERSION) << "\n";

    // ── OpenGL global state ──
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    // ── Build shaders ──
    GL gl;

    std::string baseVS  = readFile("shaders/base.vert");
    std::string baseFS  = readFile("shaders/base.frag");
    std::string ppVS    = readFile("shaders/postprocess.vert");
    std::string ppFS    = readFile("shaders/postprocess.frag");

    gl.baseProg = buildProgram(baseVS, baseFS);
    gl.ppProg   = buildProgram(ppVS,   ppFS);

    // Orthographic projection: maps (0,0)→(WIN_W,WIN_H) to NDC
    gl.proj = glm::ortho(0.f, (float)WIN_W, 0.f, (float)WIN_H, -1.f, 1.f);

    // ── Build GPU objects ──
    buildQuadVAO(gl);
    buildScreenVAO(gl);
    buildFBO(gl);

    // ── Game state ──
    GameState game;
    resetGame(game);
    g_gameState = &game;

    glfwSetKeyCallback(win, keyCallback);

    // ── Fixed-timestep loop ──
    double prevTime   = glfwGetTime();
    double accumulator = 0.0;

    while (!glfwWindowShouldClose(win))
    {
        glfwPollEvents();

        if (g_resetFlag)
        {
            resetGame(game);
            g_resetFlag = false;
        }

        double now   = glfwGetTime();
        double delta = now - prevTime;
        prevTime     = now;

        // Clamp to avoid spiral of death
        if (delta > 0.25) delta = 0.25;
        accumulator += delta;

        // Fixed game ticks
        while (accumulator >= STEP_SECS)
        {
            tickGame(game);
            accumulator -= STEP_SECS;
        }

        // Window title with score info
        {
            std::string title = "znake | P1: " +
                                std::to_string((int)game.p1.body.size() - 3) +
                                "  P2: " +
                                std::to_string((int)game.p2.body.size() - 3);
            if (game.over)
            {
                if      (game.winner ==  1) title += "  ~  P1 WINS!  (R to reset)";
                else if (game.winner ==  2) title += "  ~  P2 WINS!  (R to reset)";
                else                        title += "  ~  DRAW!  (R to reset)";
            }
            glfwSetWindowTitle(win, title.c_str());
        }

        renderFrame(game, gl, (float)now);
        glfwSwapBuffers(win);
    }

    // ── Cleanup ──
    glDeleteProgram(gl.baseProg);
    glDeleteProgram(gl.ppProg);
    glDeleteVertexArrays(1, &gl.quadVAO);
    glDeleteBuffers(1, &gl.quadVBO);
    glDeleteBuffers(1, &gl.instanceVBO);
    glDeleteVertexArrays(1, &gl.screenVAO);
    glDeleteBuffers(1, &gl.screenVBO);
    glDeleteFramebuffers(1, &gl.fbo);
    glDeleteTextures(1, &gl.fboTex);
    glDeleteRenderbuffers(1, &gl.fboRB);
    glDeleteSamplers(1, &gl.sampNearest);
    glDeleteSamplers(1, &gl.sampLinear);

    glfwDestroyWindow(win);
    glfwTerminate();
    return 0;
}
