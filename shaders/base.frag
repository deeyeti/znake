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
    float r   = 0.18;
    float d   = roundRect(vUV, r);
    float aa  = fwidth(d);
    float alpha = 1.0 - smoothstep(-aa, aa, d);

    if (alpha < 0.01) discard;

    // Slight inner highlight for depth
    float highlight = smoothstep(0.35, 0.0, length(vUV - vec2(0.35, 0.35)));
    vec3  col = vColor + highlight * 0.15;

    FragColor = vec4(col, alpha);
}
