# 🐍 znake

A 2-player competitive Snake/Tron hybrid rendered with **OpenGL 3.3 Core Profile** and a modern retro pixel-art aesthetic.

| Feature | Details |
|---------|---------|
| **Aesthetic** | Cute modern retro pixel art — pastel Catppuccin palette |
| **Post-processing** | Bloom/glow (multi-scale Gaussian), vignette, scanlines, chromatic aberration |
| **Shaders** | GLSL 330 — instanced base pass + FBO post-process pass |
| **Rendering** | Instanced quads (single draw call per frame), Sampler Objects |
| **Collision** | Wrap-around walls, self & cross-body collision detection |
| **Game Loop** | Fixed 100 ms tick, uncapped render rate |

## Controls

| Player | Keys | Colour |
|--------|------|--------|
| Player 1 | `W A S D` | 🌸 Pastel Pink `#f5c2e7` |
| Player 2 | `↑ ↓ ← →` | 🩵 Pastel Blue `#89b4fa` |
| Reset | `R` or `Esc` | — |

Food spawns as **Pastel Yellow** `#f9e2af` on a random unoccupied cell.

## Build

### Prerequisites
- **CMake ≥ 3.20**
- **C++17 compiler** (MSVC 2019+, GCC 11+, Clang 13+)
- **Git** (for FetchContent to pull GLFW, GLM, GLAD2)
- An **OpenGL 3.3** capable GPU/driver

### Steps

```bash
git clone https://github.com/<your-user>/znake.git
cd znake
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
./build/bin/znake          # Linux/macOS
build\bin\Release\znake.exe  # Windows
```

> Shaders are automatically copied next to the binary by CMake.

## Architecture

```
znake/
├── CMakeLists.txt        # FetchContent: GLFW 3.4, GLM 1.0.1, GLAD2
├── src/
│   └── main.cpp          # Game loop, state, instanced rendering, FBO
└── shaders/
    ├── base.vert         # Instanced grid-cell vertex shader
    ├── base.frag         # Rounded-rect SDF, per-cell colour
    ├── postprocess.vert  # Full-screen quad
    └── postprocess.frag  # Bloom + vignette + scanlines + aberration
```

### Rendering Pipeline

```
Game State
    │
    ▼
[Base Pass]  ─── instanced quads ──►  FBO Texture (GL_NEAREST)
    │                                      │
    │                              ┌───────┴──────────┐
    │                         Sampler 0           Sampler 1
    │                         GL_NEAREST          GL_LINEAR
    │                              └───────┬──────────┘
    │                                      ▼
    └──────────────────────────► [Post-Process Pass]
                                      bloom (multi-scale Gaussian)
                                    + vignette
                                    + scanlines
                                    + chromatic aberration
                                      │
                                      ▼
                                 Default Framebuffer
```

## Mechanics

- **Growth** — eating food grows the snake by 1 cell (back not popped that tick)
- **Walls** — toroidal wrap-around (no wall death)
- **Death** — head enters any body segment (own or opponent's) → game over
- **Score** — displayed in the window title bar (`body length - 3`)
