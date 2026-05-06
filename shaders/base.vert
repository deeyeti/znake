#version 330 core

// Per-vertex
layout(location = 0) in vec2 aPos;      // unit quad [0,1]x[0,1]

// Per-instance
layout(location = 1) in vec2 aOffset;   // grid cell (col, row)
layout(location = 2) in vec3 aColor;    // cell colour
layout(location = 3) in float aIsHead;  // 1.0 if this is the snake head
layout(location = 4) in vec2 aMoveDir;  // snake movement direction

uniform mat4  uProjection;
uniform vec2  uCellSize;   // (WIN_W/GRID_W, WIN_H/GRID_H)

out vec3  vColor;
out vec2  vUV;
out float vIsHead;
out vec2  vMoveDir;

const float PAD = 0.06;

void main()
{
    vec2 localPos = aPos * (1.0 - 2.0 * PAD) + PAD;
    vec2 world    = (aOffset + localPos) * uCellSize;

    gl_Position = uProjection * vec4(world, 0.0, 1.0);
    vColor   = aColor;
    vUV      = aPos;
    vIsHead  = aIsHead;
    vMoveDir = aMoveDir;
}
