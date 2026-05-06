#version 330 core

// Per-vertex
layout(location = 0) in vec2 aPos;      // unit quad [0,1]x[0,1]

// Per-instance
layout(location = 1) in vec2 aOffset;   // grid cell (col, row)
layout(location = 2) in vec3 aColor;    // cell colour

uniform mat4  uProjection;
uniform vec2  uCellSize;   // (WIN_W/GRID_W, WIN_H/GRID_H)

out vec3 vColor;
out vec2 vUV;              // local UV [0,1] for rounded-rect SDF

const float PAD = 0.07;   // gap between cells (fraction of cell)

void main()
{
    // Shrink the unit quad by PAD on each side → grid look
    vec2 localPos = aPos * (1.0 - 2.0 * PAD) + PAD;

    // World position in pixels
    vec2 world = (aOffset + localPos) * uCellSize;

    gl_Position = uProjection * vec4(world, 0.0, 1.0);
    vColor = aColor;
    vUV    = aPos;          // 0..1 across each cell
}
