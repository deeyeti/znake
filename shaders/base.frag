#version 330 core

in vec3  vColor;
in vec2  vUV;
in float vIsHead;
in vec2  vMoveDir;

out vec4 FragColor;

// ── SDF for a rounded box centred at origin ───────────────────────────────────
// p  = point in [-0.5, 0.5]
// b  = half-extents
// r  = corner radius
float sdRoundedBox(vec2 p, vec2 b, float r)
{
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// ── Sharp step (pixel-art style, no soft AA) ──────────────────────────────────
float sharp(float d)
{
    return step(0.0, -d);
}

void main()
{
    // UV re-centred to [-0.5, 0.5]
    vec2 p = vUV - 0.5;

    // ── 1. Outer rounded-box shape ────────────────────────────────────────────
    float boxR  = 0.13;           // corner radius
    float boxB  = 0.42;           // half-extent (< 0.5 → gap around cell)
    float dOuter = sdRoundedBox(p, vec2(boxB), boxR);

    float insideOuter = sharp(dOuter);
    if (insideOuter < 0.5) discard;

    // ── 2. Internal dark outline ──────────────────────────────────────────────
    float outlineW = 0.045;
    float dInner   = sdRoundedBox(p, vec2(boxB - outlineW), boxR * 0.65);
    float insideInner = sharp(dInner);   // 1 = inside the inner box

    vec3 outlineCol = vColor * 0.28;     // much darker than base
    vec3 col = mix(outlineCol, vColor, insideInner);

    // ── 3. Internal gloss/highlight (top-left sliver) ─────────────────────────
    // Small ellipse in the top-left quadrant of the inner region
    vec2  glossCentre = vec2(-0.13, 0.13);
    float glossR      = 0.16;
    float dGloss      = length((p - glossCentre) / vec2(1.0, 0.65)) - glossR;
    float gloss       = sharp(dGloss) * insideInner;
    col += vec3(0.28, 0.24, 0.28) * gloss;   // subtle pearlescent tint

    // ── 4. Cute eyes (head segments only) ────────────────────────────────────
    if (vIsHead > 0.5)
    {
        // Derive perpendicular from movement direction
        // MoveDir is already a unit-grid vector: (±1,0) or (0,±1)
        vec2 fwd  = vMoveDir;                        // forward
        vec2 side = vec2(-fwd.y, fwd.x);             // sideways (left-hand perp)

        float eyeFwd  = 0.17;   // distance from centre toward forward
        float eyeSep  = 0.11;   // half-separation sideways
        float pupilR  = 0.075;
        float gleamR  = 0.028;

        vec2 eye1 = fwd * eyeFwd + side * eyeSep;
        vec2 eye2 = fwd * eyeFwd - side * eyeSep;

        // Pupils
        float p1 = sharp(length(p - eye1) - pupilR);
        float p2 = sharp(length(p - eye2) - pupilR);

        if ((p1 + p2) > 0.5)
            col = vec3(0.10, 0.06, 0.16);  // very dark plum pupil

        // Gleam highlights (offset up-right within each pupil)
        vec2  gleamOff = vec2(0.026, 0.026);
        float g1 = sharp(length(p - eye1 - gleamOff) - gleamR);
        float g2 = sharp(length(p - eye2 - gleamOff) - gleamR);

        if ((g1 + g2) > 0.5)
            col = vec3(1.0);
    }

    FragColor = vec4(col, 1.0);
}
