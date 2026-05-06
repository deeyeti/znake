#version 330 core

in vec3 vColor;
in vec2 vUV;

out vec4 FragColor;

// Rounded-rectangle SDF (uv in [0,1], r = corner radius in UV space)
float roundRect(vec2 uv, float r)
{
    vec2 q = abs(uv - 0.5) - (0.5 - r);
    return length(max(q, 0.0)) - r;
}

void main()
{
    float r   = 0.25;
    float d   = roundRect(vUV, r);
    float aa  = fwidth(d);
    float alpha = 1.0 - smoothstep(-aa, aa, d);

    if (alpha < 0.01) discard;

    // Cute pillow-style highlight (top-left shine)
    float highlight = smoothstep(0.45, 0.0, length(vUV - vec2(0.30, 0.30)));
    vec3  col = vColor + highlight * 0.22;

    // Soft outer glow edge
    float edgeGlow = smoothstep(0.0, -0.08, d);
    col += vColor * 0.08 * (1.0 - edgeGlow);

    FragColor = vec4(col, alpha * 0.95);
}
