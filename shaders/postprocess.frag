#version 330 core

in vec2 vUV;
out vec4 FragColor;

// Two samplers for the SAME FBO texture:
//   uSceneSharp → bound with GL_NEAREST (crisp pixels)
//   uSceneSoft  → bound with GL_LINEAR  (soft bloom taps)
uniform sampler2D uSceneSharp;
uniform sampler2D uSceneSoft;
uniform vec2      uResolution;
uniform float     uTime;

// ── Helpers ──────────────────────────────────────────────────────────────────

vec3 extractBright(vec3 c)
{
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float thresh = 0.30;
    return c * max(0.0, lum - thresh) / max(lum, 0.001);
}

// 5×5 Gaussian bloom using GL_LINEAR for free sub-pixel smoothness
vec3 bloom(vec2 uv)
{
    vec2 ts = 1.0 / uResolution;
    vec3 acc = vec3(0.0);
    float wTotal = 0.0;

    for (int x = -3; x <= 3; ++x)
    for (int y = -3; y <= 3; ++y)
    {
        float w = exp(-float(x*x + y*y) * 0.09);
        // Sample at progressively larger offsets (multi-scale bloom)
        vec2 off1 = vec2(x, y) * ts * 2.0;
        vec2 off2 = vec2(x, y) * ts * 5.0;
        vec3 s1 = extractBright(texture(uSceneSoft, uv + off1).rgb);
        vec3 s2 = extractBright(texture(uSceneSoft, uv + off2).rgb);
        acc += (s1 * 0.6 + s2 * 0.4) * w;
        wTotal += w;
    }
    return (acc / wTotal) * 2.8;
}

// ── Main ─────────────────────────────────────────────────────────────────────

void main()
{
    // 1) Sharp base image (GL_NEAREST keeps pixels pixel-perfect)
    vec3 base = texture(uSceneSharp, vUV).rgb;

    // 2) Soft bloom additive layer
    vec3 glow = bloom(vUV);

    vec3 color = base + glow;

    // 3) Reinhard tone-mapping + gamma
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    // 4) Vignette
    vec2  center   = vUV - 0.5;
    float vignette = 1.0 - smoothstep(0.30, 0.80, length(center) * 1.6);
    color *= vignette;

    // 5) Subtle scanlines (CRT feel, 1-pixel every 2px, very faint)
    float scanline = 1.0 - 0.04 * mod(floor(vUV.y * uResolution.y), 2.0);
    color *= scanline;

    // 6) Subtle chromatic aberration at screen edges
    float aberration = length(center) * 0.012;
    float r = texture(uSceneSharp, vUV + vec2( aberration, 0.0)).r;
    float b = texture(uSceneSharp, vUV + vec2(-aberration, 0.0)).b;
    color.r = mix(color.r, r, 0.3);
    color.b = mix(color.b, b, 0.3);

    FragColor = vec4(color, 1.0);
}
