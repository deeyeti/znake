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
    float thresh = 0.18;
    return c * max(0.0, lum - thresh) / max(lum, 0.001);
}

// Wider, dreamier bloom using GL_LINEAR for free sub-pixel smoothness
vec3 bloom(vec2 uv)
{
    vec2 ts = 1.0 / uResolution;
    vec3 acc = vec3(0.0);
    float wTotal = 0.0;

    for (int x = -4; x <= 4; ++x)
    for (int y = -4; y <= 4; ++y)
    {
        float w = exp(-float(x*x + y*y) * 0.06);
        // Sample at progressively larger offsets (multi-scale bloom)
        vec2 off1 = vec2(x, y) * ts * 3.0;
        vec2 off2 = vec2(x, y) * ts * 7.0;
        vec3 s1 = extractBright(texture(uSceneSoft, uv + off1).rgb);
        vec3 s2 = extractBright(texture(uSceneSoft, uv + off2).rgb);
        acc += (s1 * 0.5 + s2 * 0.5) * w;
        wTotal += w;
    }
    return (acc / wTotal) * 3.5;
}

// Sparkle pseudo-random hash
float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float sparkle(vec2 uv, float t)
{
    vec2 cell = floor(uv * 40.0);
    float h = hash(cell);
    float phase = h * 6.28 + t * (1.5 + h * 2.0);
    float brightness = pow(max(sin(phase), 0.0), 16.0);
    // Only show sparkle on ~15% of cells
    return brightness * step(0.85, h) * 0.35;
}

// ── Main ─────────────────────────────────────────────────────────────────────

void main()
{
    // 1) Sharp base image (GL_NEAREST keeps pixels pixel-perfect)
    vec3 base = texture(uSceneSharp, vUV).rgb;

    // 2) Soft dreamy bloom additive layer
    vec3 glow = bloom(vUV);

    vec3 color = base + glow;

    // 3) Reinhard tone-mapping + gamma
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    // 4) Gentle vignette
    vec2  center   = vUV - 0.5;
    float vignette = 1.0 - smoothstep(0.45, 0.90, length(center) * 1.4);
    color *= vignette;

    // 5) Sparkle overlay
    float sp = sparkle(vUV, uTime);
    color += vec3(0.9, 0.8, 1.0) * sp;

    FragColor = vec4(color, 1.0);
}
