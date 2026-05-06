#version 330 core

in vec2 vUV;
out vec4 FragColor;

uniform sampler2D uSceneSharp;
uniform sampler2D uSceneSoft;
uniform vec2      uResolution;
uniform float     uTime;

// ── Helpers ──────────────────────────────────────────────────────────────────

vec3 extractBright(vec3 c)
{
    float lum    = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float thresh = 0.18;
    return c * max(0.0, lum - thresh) / max(lum, 0.001);
}

// Wider, dreamier bloom using GL_LINEAR for free sub-pixel smoothness
vec3 bloom(vec2 uv)
{
    vec2 ts     = 1.0 / uResolution;
    vec3 acc    = vec3(0.0);
    float total = 0.0;

    for (int x = -4; x <= 4; ++x)
    for (int y = -4; y <= 4; ++y)
    {
        float w  = exp(-float(x*x + y*y) * 0.06);
        vec2 o1  = vec2(x, y) * ts * 3.0;
        vec2 o2  = vec2(x, y) * ts * 7.0;
        vec3 s1  = extractBright(texture(uSceneSoft, uv + o1).rgb);
        vec3 s2  = extractBright(texture(uSceneSoft, uv + o2).rgb);
        acc     += (s1 * 0.5 + s2 * 0.5) * w;
        total   += w;
    }
    return (acc / total) * 3.5;
}

// ── Main ─────────────────────────────────────────────────────────────────────

void main()
{
    vec3 base  = texture(uSceneSharp, vUV).rgb;
    vec3 glow  = bloom(vUV);
    vec3 color = base + glow;

    // Tone-mapping + gamma
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    // Gentle vignette — soft dark edges, open centre
    vec2  centre   = vUV - 0.5;
    float vignette = 1.0 - smoothstep(0.45, 0.90, length(centre) * 1.4);
    color *= vignette;

    FragColor = vec4(color, 1.0);
}
