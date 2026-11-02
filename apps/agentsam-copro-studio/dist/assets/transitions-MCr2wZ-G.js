var e=Object.freeze([{id:`gl:BlockDissolve`,name:`Block Dissolve`,glsl:`// Author: nwoeanhinnogaehr
// License: MIT
// Description: The incoming image appears in small random blocks
// Tags: dissolve, blocks, noise
// Ported from https://gist.github.com/nwoeanhinnogaehr/b93818de23d4511fde10

uniform float blocksize; // = 0.02

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), step(rand(floor(uv / blocksize)), progress));
}
`,parameters:{blocksize:{type:`float`,default:.02}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/BlockDissolve.glsl`,license:`MIT`},description:`The incoming image appears in small random blocks`},{id:`gl:BookFlip`,name:`Book Flip`,glsl:`// Author: hong
// License: MIT
// Description: The outgoing image turns like a book page from right to left, revealing the incoming one
// Tags: page, flip, 3d

// Avoids dividing by zero when the page is edge-on (progress = 0.5).
float nonZero(float x) {
  return abs(x) < 1e-4 ? (x < 0.0 ? -1e-4 : 1e-4) : x;
}

vec2 skewRight(vec2 p) {
  float skewX = (p.x - progress)/nonZero(0.5 - progress) * 0.5;
  float skewY =  (p.y - 0.5)/(0.5 + progress * (p.x - 0.5) / 0.5)* 0.5  + 0.5;
  return vec2(skewX, skewY);
}

vec2 skewLeft(vec2 p) {
  float skewX = (p.x - 0.5)/nonZero(progress - 0.5) * 0.5 + 0.5;
  float skewY = (p.y - 0.5) / (0.5 + (1.0 - progress ) * (0.5 - p.x) / 0.5) * 0.5  + 0.5;
  return vec2(skewX, skewY);
}

vec4 addShade() {
  float shadeVal  =  max(0.7, abs(progress - 0.5) * 2.0);
  return vec4(vec3(shadeVal ), 1.0);
}

vec4 transition (vec2 p) {
  float pr = step(1.0 - progress, p.x);

  if (p.x < 0.5) {
    return mix(getFromColor(p), getToColor(skewLeft(p)) * addShade(), pr);
  } else {
    return mix(getFromColor(skewRight(p)) * addShade(), getToColor(p),   pr);
  }
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/BookFlip.glsl`,license:`MIT`},description:`The outgoing image turns like a book page from right to left, revealing the incoming one`},{id:`gl:Bounce`,name:`Bounce`,glsl:`// Author: Adrian Purser
// License: MIT
// Description: The outgoing image drops out of the frame with a few bounces, revealing the incoming one
// Tags: bounce, slide, vertical, shadow

// @color Color of the shadow cast on the incoming image
uniform vec4 shadow_colour; // = vec4(0.,0.,0.,.6)
// @range(0.01, 0.5) Height of the shadow, relative to the image height
uniform float shadow_height; // = 0.075
// @range(1, 10, 1) Number of bounces before settling
uniform float bounces; // = 3.0

const float PI = 3.14159265358;

vec4 transition (vec2 uv) {
  float time = progress;
  float stime = sin(time * PI / 2.);
  float phase = time * PI * bounces;
  float y = (abs(cos(phase))) * (1.0 - stime);
  float d = uv.y - y;
  vec4 to = getToColor(uv);
  return mix(
    mix(
      to,
      vec4(shadow_colour.rgb, 1.0), // shadow_colour.a is in the amount: the shadow darkens, it does not make the image transparent
      step(d, shadow_height) * (1. - mix(
        ((d / shadow_height) * shadow_colour.a) + (1.0 - shadow_colour.a),
        1.0,
        smoothstep(0.95, 1., progress) // fade-out the shadow at the end
      )) * to.a // cast on the incoming image, not on its transparent areas
    ),
    getFromColor(vec2(uv.x, uv.y + (1.0 - y))),
    step(d, 0.0)
  );
}
`,parameters:{shadow_colour:{type:`vec4`,default:[0,0,0,.6]},shadow_height:{type:`float`,default:.075},bounces:{type:`float`,default:3}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Bounce.glsl`,license:`MIT`},description:`The outgoing image drops out of the frame with a few bounces, revealing the incoming one`},{id:`gl:BowTieHorizontal`,name:`Bow Tie Horizontal`,glsl:`// Author: huynx
// License: MIT
// Description: Two triangles grow from the left and right edges into a bow tie that reveals the incoming image
// Tags: wipe, shape, horizontal

const vec2 bottom_left = vec2(0.0, 1.0);
const vec2 bottom_right = vec2(1.0, 1.0);
const vec2 top_left = vec2(0.0, 0.0);
const vec2 top_right = vec2(1.0, 0.0);
const vec2 center = vec2(0.5, 0.5);

float check(vec2 p1, vec2 p2, vec2 p3)
{
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

bool PointInTriangle (vec2 pt, vec2 p1, vec2 p2, vec2 p3)
{
    bool b1, b2, b3;
    b1 = check(pt, p1, p2) < 0.0;
    b2 = check(pt, p2, p3) < 0.0;
    b3 = check(pt, p3, p1) < 0.0;
    return ((b1 == b2) && (b2 == b3));
}

bool in_left_triangle(vec2 p){
  vec2 vertex1, vertex2, vertex3;
  vertex1 = vec2(progress, 0.5);
  vertex2 = vec2(0.0, 0.5-progress);
  vertex3 = vec2(0.0, 0.5+progress);
  if (PointInTriangle(p, vertex1, vertex2, vertex3))
  {
    return true;
  }
  return false;
}

bool in_right_triangle(vec2 p){
  vec2 vertex1, vertex2, vertex3;
  vertex1 = vec2(1.0-progress, 0.5);
  vertex2 = vec2(1.0, 0.5-progress);
  vertex3 = vec2(1.0, 0.5+progress);
  if (PointInTriangle(p, vertex1, vertex2, vertex3))
  {
    return true;
  }
  return false;
}

float blur_edge(vec2 bot1, vec2 bot2, vec2 top, vec2 testPt)
{
  vec2 lineDir = bot1 - top;
  vec2 perpDir = vec2(lineDir.y, -lineDir.x);
  vec2 dirToPt1 = bot1 - testPt;
  float dist1 = abs(dot(normalize(perpDir), dirToPt1));
  
  lineDir = bot2 - top;
  perpDir = vec2(lineDir.y, -lineDir.x);
  dirToPt1 = bot2 - testPt;
  float min_dist = min(abs(dot(normalize(perpDir), dirToPt1)), dist1);
  
  if (min_dist < 0.005) {
    return min_dist / 0.005;
  }
  else  {
    return 1.0;
  };
}


vec4 transition (vec2 uv) {
  if (in_left_triangle(uv))
  {
    if (progress < 0.1)
    {
      return getFromColor(uv);
    }
    if (uv.x < 0.5)
    {
      vec2 vertex1 = vec2(progress, 0.5);
      vec2 vertex2 = vec2(0.0, 0.5-progress);
      vec2 vertex3 = vec2(0.0, 0.5+progress);
      return mix(
        getFromColor(uv),
        getToColor(uv),
        blur_edge(vertex2, vertex3, vertex1, uv)
      );
    }
    else
    {
      if (progress > 0.0)
      {
        return getToColor(uv);
      }
      else
      {
        return getFromColor(uv);
      }
    }    
  }
  else if (in_right_triangle(uv))
  {
    if (uv.x >= 0.5)
    {
      vec2 vertex1 = vec2(1.0-progress, 0.5);
      vec2 vertex2 = vec2(1.0, 0.5-progress);
      vec2 vertex3 = vec2(1.0, 0.5+progress);
      return mix(
        getFromColor(uv),
        getToColor(uv),
        blur_edge(vertex2, vertex3, vertex1, uv)
      );  
    }
    else
    {
      return getFromColor(uv);
    }
  }
  else {
    return getFromColor(uv);
  }
}`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/BowTieHorizontal.glsl`,license:`MIT`},description:`Two triangles grow from the left and right edges into a bow tie that reveals the incoming image`},{id:`gl:BowTieVertical`,name:`Bow Tie Vertical`,glsl:`// Author: huynx
// License: MIT
// Description: Two triangles grow from the top and bottom edges into a bow tie that reveals the incoming image
// Tags: wipe, shape, vertical

float check(vec2 p1, vec2 p2, vec2 p3)
{
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

bool PointInTriangle (vec2 pt, vec2 p1, vec2 p2, vec2 p3)
{
    bool b1, b2, b3;
    b1 = check(pt, p1, p2) < 0.0;
    b2 = check(pt, p2, p3) < 0.0;
    b3 = check(pt, p3, p1) < 0.0;
    return ((b1 == b2) && (b2 == b3));
}

bool in_top_triangle(vec2 p){
  vec2 vertex1, vertex2, vertex3;
  vertex1 = vec2(0.5, progress);
  vertex2 = vec2(0.5-progress, 0.0);
  vertex3 = vec2(0.5+progress, 0.0);
  if (PointInTriangle(p, vertex1, vertex2, vertex3))
  {
    return true;
  }
  return false;
}

bool in_bottom_triangle(vec2 p){
  vec2 vertex1, vertex2, vertex3;
  vertex1 = vec2(0.5, 1.0 - progress);
  vertex2 = vec2(0.5-progress, 1.0);
  vertex3 = vec2(0.5+progress, 1.0);
  if (PointInTriangle(p, vertex1, vertex2, vertex3))
  {
    return true;
  }
  return false;
}

float blur_edge(vec2 bot1, vec2 bot2, vec2 top, vec2 testPt)
{
  vec2 lineDir = bot1 - top;
  vec2 perpDir = vec2(lineDir.y, -lineDir.x);
  vec2 dirToPt1 = bot1 - testPt;
  float dist1 = abs(dot(normalize(perpDir), dirToPt1));
  
  lineDir = bot2 - top;
  perpDir = vec2(lineDir.y, -lineDir.x);
  dirToPt1 = bot2 - testPt;
  float min_dist = min(abs(dot(normalize(perpDir), dirToPt1)), dist1);
  
  if (min_dist < 0.005) {
    return min_dist / 0.005;
  }
  else  {
    return 1.0;
  };
}


vec4 transition (vec2 uv) {
  if (in_top_triangle(uv))
  {
    if (progress < 0.1)
    {
      return getFromColor(uv);
    }
    if (uv.y < 0.5)
    {
      vec2 vertex1 = vec2(0.5, progress);
      vec2 vertex2 = vec2(0.5-progress, 0.0);
      vec2 vertex3 = vec2(0.5+progress, 0.0);
      return mix(
        getFromColor(uv),
        getToColor(uv),
        blur_edge(vertex2, vertex3, vertex1, uv)
      );
    }
    else
    {
      if (progress > 0.0)
      {
        return getToColor(uv);
      }
      else
      {
        return getFromColor(uv);
      }
    }    
  }
  else if (in_bottom_triangle(uv))
  {
    if (uv.y >= 0.5)
    {
      vec2 vertex1 = vec2(0.5, 1.0-progress);
      vec2 vertex2 = vec2(0.5-progress, 1.0);
      vec2 vertex3 = vec2(0.5+progress, 1.0);
      return mix(
        getFromColor(uv),
        getToColor(uv),
        blur_edge(vertex2, vertex3, vertex1, uv)
      );  
    }
    else
    {
      return getFromColor(uv);
    }
  }
  else {
    return getFromColor(uv);
  }
}`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/BowTieVertical.glsl`,license:`MIT`},description:`Two triangles grow from the top and bottom edges into a bow tie that reveals the incoming image`},{id:`gl:BurnThrough`,name:`Burn Through`,glsl:`// Author: liubailin2020@gmail.com
// License: MIT
// Description: The outgoing image burns away in noisy, glowing patches
// Tags: burn, fire, noise

// @color Color of the burning edges
uniform vec3 burnColor; // = vec3(1.0, 0.5, 0.0)

float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

// Based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

#define OCTAVES 4
float fbm (in vec2 st) {
    float value = 0.0;
    float amplitude = .5;
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

vec4 transition (vec2 uv) {
    if (progress <= 0.0) return getFromColor(uv);
    if (progress >= 1.0) return getToColor(uv);
    vec4 from = getFromColor(uv);
    vec4 to = getToColor(uv);
    float n = fbm(uv * 4.);
    float l = smoothstep(progress, progress + 0.05, n);
    float edge = (1.0 - l) * l * 5.0;
    return mix(to, from, l) + vec4(burnColor, 0.0) * edge;
}
`,parameters:{burnColor:{type:`vec3`,default:[1,.5,0]}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/BurnThrough.glsl`,license:`MIT`},description:`The outgoing image burns away in noisy, glowing patches`},{id:`gl:CircleIris`,name:`Circle Iris`,glsl:`// Author: Fernando Kuteken
// License: MIT
// Description: The outgoing image closes into a circle over a background color, then the incoming one opens from it
// Tags: circle, iris, shape

// @param Center of the circle
uniform vec2 center; // = vec2(0.5, 0.5)
// @color Background color
uniform vec4 backColor; // = vec4(0.1, 0.1, 0.1, 1.0)

vec4 transition (vec2 uv) {
  
  float distance = length(uv - center);
  float radius = sqrt(8.0) * abs(progress - 0.5);
  
  if (distance > radius) {
    return backColor;
  }
  else {
    if (progress < 0.5) return getFromColor(uv);
    else return getToColor(uv);
  }
}
`,parameters:{center:{type:`vec2`,default:[.5,.5]},backColor:{type:`vec4`,default:[.1,.1,.1,1]}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/CircleIris.glsl`,license:`MIT`},description:`The outgoing image closes into a circle over a background color, then the incoming one opens from it`},{id:`gl:CircleOpen`,name:`Circle Open`,glsl:`// Author: gre
// License: MIT
// Description: A soft-edged circle opens from the center to reveal the incoming image
// Tags: circle, iris, wipe
// @param Softness of the circle's edge
uniform float smoothness; // = 0.3
// @param Open the circle; false closes it instead
uniform bool opening; // = true

const vec2 center = vec2(0.5, 0.5);
const float SQRT_2 = 1.414213562373;

vec4 transition (vec2 uv) {
  float x = opening ? progress : 1.-progress;
  float m = smoothstep(-smoothness, 0.0, SQRT_2*distance(center, uv) - x*(1.+smoothness));
  return mix(getFromColor(uv), getToColor(uv), opening ? 1.-m : m);
}
`,parameters:{smoothness:{type:`float`,default:.3},opening:{type:`bool`,default:!0}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/CircleOpen.glsl`,license:`MIT`},description:`A soft-edged circle opens from the center to reveal the incoming image`},{id:`gl:ColorDistance`,name:`Color Distance`,glsl:`// License: MIT
// Author: P-Seebauer
// Description: Pixels switch to the incoming image in order of how close their colors are
// Tags: blend, color
// ported by gre from https://gist.github.com/P-Seebauer/2a5fa2f77c883dd661f9

uniform float power; // = 5.0

vec4 transition(vec2 p) {
  vec4 fTex = getFromColor(p);
  vec4 tTex = getToColor(p);
  float m = step(distance(fTex, tTex), progress);
  return mix(
    mix(fTex, tTex, m),
    tTex,
    pow(progress, power)
  );
}
`,parameters:{power:{type:`float`,default:5}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/ColorDistance.glsl`,license:`MIT`},description:`Pixels switch to the incoming image in order of how close their colors are`},{id:`gl:CrossWarp`,name:`Cross Warp`,glsl:`// Author: Eke Péter <peterekepeter@gmail.com>
// License: MIT
// Description: The outgoing image zooms in while the incoming one zooms out into place, sweeping from right to left
// Tags: warp, zoom, horizontal
vec4 transition(vec2 p) {
  float x = progress;
  x=smoothstep(.0,1.0,(x*2.0+p.x-1.0));
  return mix(getFromColor((p-.5)*(1.-x)+.5), getToColor((p-.5)*x+.5), x);
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/CrossWarp.glsl`,license:`MIT`},description:`The outgoing image zooms in while the incoming one zooms out into place, sweeping from right to left`},{id:`gl:CrossZoom`,name:`Cross Zoom`,glsl:`// License: MIT
// Author: rectalogic
// Description: A crossfade through a strong zoom blur
// Tags: zoom, blur, blend
// ported by gre from https://gist.github.com/rectalogic/b86b90161503a0023231

// Converted from https://github.com/rectalogic/rendermix-basic-effects/blob/master/assets/com/rendermix/CrossZoom/CrossZoom.frag
// Which is based on https://github.com/evanw/glfx.js/blob/master/src/filters/blur/zoomblur.js
// With additional easing functions from https://github.com/rectalogic/rendermix-basic-effects/blob/master/assets/com/rendermix/Easing/Easing.glsllib

// @range(0, 1) Blur strength
uniform float strength; // = 0.4

const float PI = 3.141592653589793;

float Linear_ease(in float begin, in float change, in float duration, in float time) {
    return change * time / duration + begin;
}

float Exponential_easeInOut(in float begin, in float change, in float duration, in float time) {
    if (time == 0.0)
        return begin;
    else if (time == duration)
        return begin + change;
    time = time / (duration / 2.0);
    if (time < 1.0)
        return change / 2.0 * pow(2.0, 10.0 * (time - 1.0)) + begin;
    return change / 2.0 * (-pow(2.0, -10.0 * (time - 1.0)) + 2.0) + begin;
}

float Sinusoidal_easeInOut(in float begin, in float change, in float duration, in float time) {
    return -change / 2.0 * (cos(PI * time / duration) - 1.0) + begin;
}

float rand (vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec4 crossFade(in vec2 uv, in float dissolve) {
    return mix(getFromColor(uv), getToColor(uv), dissolve);
}

vec4 transition(vec2 uv) {
    vec2 texCoord = uv.xy / vec2(1.0).xy;

    // Linear interpolate center across center half of the image
    vec2 center = vec2(Linear_ease(0.25, 0.5, 1.0, progress), 0.5);
    float dissolve = Exponential_easeInOut(0.0, 1.0, 1.0, progress);

    // Mirrored sinusoidal loop. 0->strength then strength->0
    float strength = Sinusoidal_easeInOut(0.0, strength, 0.5, progress);

    vec4 color = vec4(0.0);
    float total = 0.0;
    vec2 toCenter = center - texCoord;

    /* randomize the lookup values to hide the fixed number of samples */
    float offset = rand(uv);

    for (float t = 0.0; t <= 40.0; t++) {
        float percent = (t + offset) / 40.0;
        float weight = 4.0 * (percent - percent * percent);
        color += crossFade(texCoord + toCenter * percent * strength, dissolve) * weight;
        total += weight;
    }
    return color / total;
}
`,parameters:{strength:{type:`float`,default:.4}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/CrossZoom.glsl`,license:`MIT`},description:`A crossfade through a strong zoom blur`},{id:`gl:Directional`,name:`Directional`,glsl:`// Author: Gaëtan Renaudeau
// License: MIT
// Description: The incoming image pushes the outgoing one out in a given direction
// Tags: slide, push, directional

// @param Direction of the movement
uniform vec2 direction; // = vec2(0.0, 1.0)

vec4 transition (vec2 uv) {
  vec2 p = uv + progress * sign(direction);
  vec2 f = fract(p);
  return mix(
    getToColor(f),
    getFromColor(f),
    step(0.0, p.y) * step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0)
  );
}
`,parameters:{direction:{type:`vec2`,default:[0,1]}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Directional.glsl`,license:`MIT`},description:`The incoming image pushes the outgoing one out in a given direction`},{id:`gl:DirectionalWarp`,name:`Directional Warp`,glsl:`// Author: pschroen
// License: MIT
// Description: A diagonal wipe with a warped, smeared edge
// Tags: wipe, warp, directional

// @param Softness of the edge
uniform float smoothness; // = 0.1
// @param Direction of the wipe
uniform vec2 direction; // = vec2(-1.0, 1.0)

const vec2 center = vec2(0.5, 0.5);

vec4 transition (vec2 uv) {
  vec2 v = normalize(direction);
  v /= abs(v.x) + abs(v.y);
  float d = v.x * center.x + v.y * center.y;
  float m = 1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness)));
  return mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m);
}
`,parameters:{smoothness:{type:`float`,default:.1},direction:{type:`vec2`,default:[-1,1]}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/DirectionalWarp.glsl`,license:`MIT`},description:`A diagonal wipe with a warped, smeared edge`},{id:`gl:DirectionalWipe`,name:`Directional Wipe`,glsl:`// Author: gre
// License: MIT
// Description: A soft-edged diagonal wipe
// Tags: wipe, directional

// @param Direction of the wipe
uniform vec2 direction; // = vec2(1.0, -1.0)
// @param Softness of the edge
uniform float smoothness; // = 0.5
 
const vec2 center = vec2(0.5, 0.5);
 
vec4 transition (vec2 uv) {
  vec2 v = normalize(direction);
  v /= abs(v.x)+abs(v.y);
  float d = v.x * center.x + v.y * center.y;
  float m =
    (1.0-step(progress, 0.0)) * // there is something wrong with our formula that makes m not equals 0.0 with progress is 0.0
    (1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d-0.5+progress*(1.+smoothness))));
  return mix(getFromColor(uv), getToColor(uv), m);
}
`,parameters:{direction:{type:`vec2`,default:[1,-1]},smoothness:{type:`float`,default:.5}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/DirectionalWipe.glsl`,license:`MIT`},description:`A soft-edged diagonal wipe`},{id:`gl:Dreamy`,name:`Dreamy`,glsl:`// Author: mikolalysenko
// License: MIT
// Description: A crossfade with a gentle wavy distortion
// Tags: wave, blend

vec2 offset(float progress, float x, float theta) {
  float phase = progress*progress + progress + theta;
  float shifty = 0.03*progress*cos(10.0*(progress+x));
  return vec2(0, shifty);
}
vec4 transition(vec2 p) {
  return mix(getFromColor(p + offset(progress, p.x, 0.0)), getToColor(p + offset(1.0-progress, p.x, 3.14)), progress);
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Dreamy.glsl`,license:`MIT`},description:`A crossfade with a gentle wavy distortion`},{id:`gl:DreamyZoom`,name:`Dreamy Zoom`,glsl:`// Author: Zeh Fernando
// License: MIT
// Description: Zooms and rotates into a bright flash, then out to the incoming image
// Tags: zoom, rotate, flash

// Definitions --------
#define DEG2RAD 0.03926990816987241548078304229099 // 1/180*PI


// Transition parameters --------

// In degrees
uniform float rotation; // = 6

// Multiplier
uniform float scale; // = 1.2


// The code proper --------

vec4 transition(vec2 uv) {
  // Massage parameters
  float phase = progress < 0.5 ? progress * 2.0 : (progress - 0.5) * 2.0;
  float angleOffset = progress < 0.5 ? mix(0.0, rotation * DEG2RAD, phase) : mix(-rotation * DEG2RAD, 0.0, phase);
  float newScale = progress < 0.5 ? mix(1.0, scale, phase) : mix(scale, 1.0, phase);
  
  vec2 center = vec2(0, 0);

  // Calculate the source point
  vec2 assumedCenter = vec2(0.5, 0.5);
  vec2 p = (uv.xy - vec2(0.5, 0.5)) / newScale * vec2(ratio, 1.0);

  // This can probably be optimized (with distance())
  float angle = atan(p.y, p.x) + angleOffset;
  float dist = distance(center, p);
  p.x = cos(angle) * dist / ratio + 0.5;
  p.y = sin(angle) * dist + 0.5;
  vec4 c = progress < 0.5 ? getFromColor(p) : getToColor(p);

  // Finally, apply the color
  // The flash lights up the image, not the transparent areas around it.
  return vec4(c.rgb + (progress < 0.5 ? mix(0.0, 1.0, phase) : mix(1.0, 0.0, phase)), c.a);
}
`,parameters:{rotation:{type:`float`,default:6},scale:{type:`float`,default:1.2}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/DreamyZoom.glsl`,license:`MIT`},description:`Zooms and rotates into a bright flash, then out to the incoming image`},{id:`gl:Fade`,name:`Fade`,glsl:`// Author: gre
// License: MIT
// Description: A linear crossfade between the two images
// Tags: fade, blend

vec4 transition (vec2 uv) {
  return mix(
    getFromColor(uv),
    getToColor(uv),
    progress
  );
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Fade.glsl`,license:`MIT`},description:`A linear crossfade between the two images`},{id:`gl:FilmBurn`,name:`Film Burn`,glsl:`// Author: Anastasia Dunbar
// License: MIT
// Description: Glowing film-burn light leaks wash over the image and reveal the incoming one
// Tags: burn, film, light-leak
// @param Random seed
uniform float Seed; // = 2.31
float sigmoid(float x, float a) {
    float b = pow(x*2.,a)/2.;
    if (x > .5) {
        b = 1.-pow(2.-(x*2.),a)/2.;
    }
	return b;
}
float rand(float co){
    return fract(sin((co*24.9898)+Seed)*43758.5453);
}
float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
float apow(float a,float b) { return pow(abs(a),b)*sign(b); }
vec3 pow3(vec3 a,vec3 b) { return vec3(apow(a.r,b.r),apow(a.g,b.g),apow(a.b,b.b)); }
float smooth_mix(float a,float b,float c) { return mix(a,b,sigmoid(c,2.)); }
float random(vec2 co, float shft){
    co += 10.;
    return smooth_mix(fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft)*.5),78.233+Seed))) * 43758.5453),fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft+1.)*.5),78.233+Seed))) * 43758.5453),fract(shft));
}
float smooth_random(vec2 co, float shft) {
	return smooth_mix(smooth_mix(random(floor(co),shft),random(floor(co+vec2(1.,0.)),shft),fract(co.x)),smooth_mix(random(floor(co+vec2(0.,1.)),shft),random(floor(co+vec2(1.,1.)),shft),fract(co.x)),fract(co.y));
}
vec4 blendedColor(vec2 p) {
    return mix(getFromColor(p), getToColor(p), sigmoid(progress,10.));
}
#define pi 3.14159265358979323
#define clamps(x) clamp(x,0.,1.)

vec4 transition(vec2 p) {
  vec3 f = vec3(0.);
  for (float i = 0.; i < 13.; i++) {
    f += sin(((p.x*rand(i)*6.)+(progress*8.))+rand(i+1.43))*sin(((p.y*rand(i+4.4)*6.)+(progress*6.))+rand(i+2.4));
    f += 1.-clamps(length(p-vec2(smooth_random(vec2(progress*1.3),i+1.),smooth_random(vec2(progress*.5),i+6.25)))*mix(20.,70.,rand(i)));
  }
  f += 4.;
  f /= 11.;
  f = pow3(f*vec3(1.,0.7,0.6),vec3(1.,2.-sin(progress*pi),1.3));
  f *= sin(progress*pi);
  
  p -= .5;
  p *= 1.+(smooth_random(vec2(progress*5.),6.3)*sin(progress*pi)*.05);
  p += .5;
  
  vec4 blurred_image = vec4(0.);
  float bluramount = sin(progress*pi)*.03;
  #define repeats  50.
  for (float i = 0.; i < repeats; i++) { 
      vec2 q = vec2(cos(degrees((i/repeats)*360.)),sin(degrees((i/repeats)*360.))) *  (rand(vec2(i,p.x+p.y))+bluramount); 
      vec2 uv2 = p+(q*bluramount);
      blurred_image += blendedColor(uv2);
  }
  blurred_image /= repeats;
  
  return blurred_image+vec4(f,0.);
}
`,parameters:{Seed:{type:`float`,default:2.31}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/FilmBurn.glsl`,license:`MIT`},description:`Glowing film-burn light leaks wash over the image and reveal the incoming one`},{id:`gl:GlitchDisplace`,name:`Glitch Displace`,glsl:`// Author: Matt DesLauriers
// License: MIT
// Description: Blocks of the image are displaced in a glitch that flashes into the incoming image
// Tags: glitch, displace

float random(vec2 co)
{
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt= dot(co.xy ,vec2(a,b));
    float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}
float voronoi( in vec2 x ) {
    vec2 p = floor( x );
    vec2 f = fract( x );
    float res = 8.0;
    for( float j=-1.; j<=1.; j++ )
    for( float i=-1.; i<=1.; i++ ) {
        vec2  b = vec2( i, j );
        vec2  r = b - f + random( p + b );
        float d = dot( r, r );
        res = min( res, d );
    }
    return sqrt( res );
}

vec2 displace(vec4 tex, vec2 texCoord, float dotDepth, float textureDepth, float strength) {
    float b = voronoi(.003 * texCoord + 2.0);
    float g = voronoi(0.2 * texCoord);
    float r = voronoi(texCoord - 1.0);
    vec4 dt = tex * 1.0;
    vec4 dis = dt * dotDepth + 1.0 - tex * textureDepth;

    dis.x = dis.x - 1.0 + textureDepth*dotDepth;
    dis.y = dis.y - 1.0 + textureDepth*dotDepth;
    dis.x *= strength;
    dis.y *= strength;
    vec2 res_uv = texCoord ;
    res_uv.x = res_uv.x + dis.x - 0.0;
    res_uv.y = res_uv.y + dis.y;
    return res_uv;
}

float ease1(float t) {
  return t == 0.0 || t == 1.0
    ? t
    : t < 0.5
      ? +0.5 * pow(2.0, (20.0 * t) - 10.0)
      : -0.5 * pow(2.0, 10.0 - (t * 20.0)) + 1.0;
}
float ease2(float t) {
  return t == 1.0 ? t : 1.0 - pow(2.0, -10.0 * t);
}



vec4 transition(vec2 uv) {
  vec2 p = uv.xy / vec2(1.0).xy;
  vec4 color1 = getFromColor(p);
  vec4 color2 = getToColor(p);
  vec2 disp = displace(color1, p, 0.33, 0.7, 1.0-ease1(progress));
  vec2 disp2 = displace(color2, p, 0.33, 0.5, ease2(progress));
  vec4 dColor1 = getToColor(disp);
  vec4 dColor2 = getFromColor(disp2);
  float val = ease1(progress);
  vec3 gray = vec3(dot(min(dColor2, dColor1).rgb, vec3(0.299, 0.587, 0.114)));
  dColor2 = vec4(gray * 2.0, dColor2.a);
  color1 = mix(color1, dColor2, smoothstep(0.0, 0.5, progress));
  color2 = mix(color2, dColor1, smoothstep(1.0, 0.5, progress));
  return mix(color1, color2, val);
  //gl_FragColor = mix(gl_FragColor, dColor, smoothstep(0.0, 0.5, progress));

   //gl_FragColor = mix(texture2D(from, p), texture2D(to, p), progress);
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/GlitchDisplace.glsl`,license:`MIT`},description:`Blocks of the image are displaced in a glitch that flashes into the incoming image`},{id:`gl:GlitchMemories`,name:`Glitch Memories`,glsl:`// Author: Gunnar Roth
// based on work from natewave
// License: MIT
// Description: A crossfade with glitchy, color-shifted blocks
// Tags: glitch, chromatic, blend
vec4 transition(vec2 p) {
  vec2 block = floor(p.xy / vec2(16));
  vec2 uv_noise = block / vec2(64);
  uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64);
  vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 *(1.0 -progress) : vec2(0.0);
  vec2 red = p + dist * 0.2;
  vec2 green = p + dist * .3;
  vec2 blue = p + dist * .5;

  vec4 center = mix(getFromColor(green), getToColor(green), progress);
  return vec4(mix(getFromColor(red), getToColor(red), progress).r, center.g, mix(getFromColor(blue), getToColor(blue), progress).b, center.a);
}

`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/GlitchMemories.glsl`,license:`MIT`},description:`A crossfade with glitchy, color-shifted blocks`},{id:`gl:GridFlip`,name:`Grid Flip`,glsl:`// License: MIT
// Author: TimDonselaar
// Description: The image splits into a grid of tiles that flip one by one to the incoming image
// Tags: grid, tiles, flip
// ported by gre from https://gist.github.com/TimDonselaar/9bcd1c4b5934ba60087bdb55c2ea92e5

// @param Number of tiles (columns, rows)
uniform ivec2 size; // = ivec2(4)
uniform float pause; // = 0.1
uniform float dividerWidth; // = 0.05
// @color Color behind the tiles
uniform vec4 bgcolor; // = vec4(0.0, 0.0, 0.0, 1.0)
uniform float randomness; // = 0.1
 
float rand (vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float getDelta(vec2 p) {
  vec2 rectanglePos = floor(vec2(size) * p);
  vec2 rectangleSize = vec2(1.0 / vec2(size).x, 1.0 / vec2(size).y);
  float top = rectangleSize.y * (rectanglePos.y + 1.0);
  float bottom = rectangleSize.y * rectanglePos.y;
  float left = rectangleSize.x * rectanglePos.x;
  float right = rectangleSize.x * (rectanglePos.x + 1.0);
  float minX = min(abs(p.x - left), abs(p.x - right));
  float minY = min(abs(p.y - top), abs(p.y - bottom));
  return min(minX, minY);
}

float getDividerSize() {
  vec2 rectangleSize = vec2(1.0 / vec2(size).x, 1.0 / vec2(size).y);
  return min(rectangleSize.x, rectangleSize.y) * dividerWidth;
}

vec4 transition(vec2 p) {
  if(progress < pause) {
    float currentProg = progress / pause;
    float a = 1.0;
    if(getDelta(p) < getDividerSize()) {
      a = 1.0 - currentProg;
    }
    return mix(bgcolor, getFromColor(p), a);
  }
  else if(progress < 1.0 - pause){
    if(getDelta(p) < getDividerSize()) {
      return bgcolor;
    } else {
      float currentProg = (progress - pause) / (1.0 - pause * 2.0);
      vec2 q = p;
      vec2 rectanglePos = floor(vec2(size) * q);
      
      float r = rand(rectanglePos) - randomness;
      float cp = smoothstep(0.0, 1.0 - r, currentProg);
    
      float rectangleSize = 1.0 / vec2(size).x;
      float delta = rectanglePos.x * rectangleSize;
      float offset = rectangleSize / 2.0 + delta;
      
      p.x = (p.x - offset)/abs(cp - 0.5)*0.5 + offset;
      vec4 a = getFromColor(p);
      vec4 b = getToColor(p);
      
      float s = step(abs(vec2(size).x * (q.x - delta) - 0.5), abs(cp - 0.5));
      return mix(bgcolor, mix(b, a, step(cp, 0.5)), s);
    }
  }
  else {
    float currentProg = (progress - 1.0 + pause) / pause;
    float a = 1.0;
    if(getDelta(p) < getDividerSize()) {
      a = currentProg;
    }
    return mix(bgcolor, getToColor(p), a);
  }
}
`,parameters:{size:{type:`ivec2`,default:[4,4]},pause:{type:`float`,default:.1},dividerWidth:{type:`float`,default:.05},bgcolor:{type:`vec4`,default:[0,0,0,1]},randomness:{type:`float`,default:.1}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/GridFlip.glsl`,license:`MIT`},description:`The image splits into a grid of tiles that flip one by one to the incoming image`},{id:`gl:InvertedPageCurl`,name:`Inverted Page Curl`,glsl:`// Author: Hewlett-Packard
// License: BSD 3 Clause
// Description: The outgoing image curls away like a page, revealing the incoming one
// Tags: page, curl, 3d
// Adapted by Sergey Kosarevsky from:
// http://rectalogic.github.io/webvfx/examples_2transition-shader-pagecurl_8html-example.html

/*
Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following disclaimer
     in the documentation and/or other materials provided with the
     distribution.
   * Neither the name of Hewlett-Packard nor the names of its
     contributors may be used to endorse or promote products derived from
     this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
in vec2 texCoord;
*/

const float MIN_AMOUNT = -0.16;
const float MAX_AMOUNT = 1.5;

const float PI = 3.141592653589793;

const float scale = 512.0;
const float sharpness = 3.0;

const float cylinderRadius = 1.0 / PI / 2.0;

// These depend on the progress uniform and must be computed per-fragment.
// Global initializers with uniforms are invalid in GLSL ES and fail on Mesa.
float amount;
float cylinderCenter;
float cylinderAngle;

vec3 hitPoint(float hitAngle, float yc, vec3 point, mat3 rrotation)
{
        float hitPoint = hitAngle / (2.0 * PI);
        point.y = hitPoint;
        return rrotation * point;
}

vec4 antiAlias(vec4 color1, vec4 color2, float distanc)
{
        distanc *= scale;
        if (distanc < 0.0) return color2;
        if (distanc > 2.0) return color1;
        float dd = pow(1.0 - distanc / 2.0, sharpness);
        return ((color2 - color1) * dd) + color1;
}

float distanceToEdge(vec3 point)
{
        float dx = abs(point.x > 0.5 ? 1.0 - point.x : point.x);
        float dy = abs(point.y > 0.5 ? 1.0 - point.y : point.y);
        if (point.x < 0.0) dx = -point.x;
        if (point.x > 1.0) dx = point.x - 1.0;
        if (point.y < 0.0) dy = -point.y;
        if (point.y > 1.0) dy = point.y - 1.0;
        if ((point.x < 0.0 || point.x > 1.0) && (point.y < 0.0 || point.y > 1.0)) return sqrt(dx * dx + dy * dy);
        return min(dx, dy);
}

vec4 seeThrough(float yc, vec2 p, mat3 rotation, mat3 rrotation)
{
        float hitAngle = PI - (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) - cylinderAngle);
        vec3 point = hitPoint(hitAngle, yc, rotation * vec3(p, 1.0), rrotation);
        if (yc <= 0.0 && (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0))
        {
            return getToColor(p);
        }

        if (yc > 0.0) return getFromColor(p);

        vec4 color = getFromColor(point.xy);
        vec4 tcolor = vec4(0.0);

        return antiAlias(color, tcolor, distanceToEdge(point));
}

vec4 seeThroughWithShadow(float yc, vec2 p, vec3 point, mat3 rotation, mat3 rrotation)
{
        float shadow = distanceToEdge(point) * 30.0;
        shadow = (1.0 - shadow) / 3.0;

        if (shadow < 0.0) shadow = 0.0; else shadow *= amount;

        vec4 shadowColor = seeThrough(yc, p, rotation, rrotation);
        shadowColor.r -= shadow;
        shadowColor.g -= shadow;
        shadowColor.b -= shadow;

        return shadowColor;
}

vec4 backside(float yc, vec3 point)
{
        vec4 color = getFromColor(point.xy);
        float gray = (color.r + color.b + color.g) / 15.0;
        gray += (8.0 / 10.0) * (pow(max(0.0, 1.0 - abs(yc / cylinderRadius)), 2.0 / 10.0) / 2.0 + (5.0 / 10.0));
        color.rgb = vec3(gray);
        return color;
}

vec4 behindSurface(vec2 p, float yc, vec3 point, mat3 rrotation)
{
        float safeAmount = amount >= 0.0 ? max(amount, 1e-4) : min(amount, -1e-4);
        float shado = (1.0 - ((-cylinderRadius - yc) / safeAmount * 7.0)) / 6.0;
        shado *= 1.0 - abs(point.x - 0.5);

        yc = (-cylinderRadius - cylinderRadius - yc);

        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;
        point = hitPoint(hitAngle, yc, point, rrotation);

        if (yc < 0.0 && point.x >= 0.0 && point.y >= 0.0 && point.x <= 1.0 && point.y <= 1.0 && (hitAngle < PI || amount > 0.5))
        {
                float dx = point.x - 0.5;
                float dy = point.y - 0.5;
                shado = 1.0 - (sqrt(dx * dx + dy * dy) / (71.0 / 100.0));
                float nyc = -yc / cylinderRadius;
                shado *= nyc * nyc * nyc;
                shado *= 0.5;
        }
        else
        {
                shado = 0.0;
        }
        vec4 to = getToColor(p);
        return vec4(to.rgb - shado, to.a);
}

vec4 transition(vec2 p) {
  amount = progress * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
  cylinderCenter = amount;
  cylinderAngle = 2.0 * PI * amount;

  const float angle = 100.0 * PI / 180.0;
        float c = cos(-angle);
        float s = sin(-angle);

        mat3 rotation = mat3( c, s, 0,
                                                                -s, c, 0,
                                                                -0.801, 0.8900, 1
                                                                );
        c = cos(angle);
        s = sin(angle);

        mat3 rrotation = mat3(	c, s, 0,
                                                                        -s, c, 0,
                                                                        0.98500, 0.985, 1
                                                                );

        vec3 point = rotation * vec3(p, 1.0);

        float yc = point.y - cylinderCenter;

        if (yc < -cylinderRadius)
        {
                // Behind surface
                return behindSurface(p,yc, point, rrotation);
        }

        if (yc > cylinderRadius)
        {
                // Flat surface
                return getFromColor(p);
        }

        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;

        float hitAngleMod = mod(hitAngle, 2.0 * PI);
        if ((hitAngleMod > PI && amount < 0.5) || (hitAngleMod > PI/2.0 && amount < 0.0))
        {
                return seeThrough(yc, p, rotation, rrotation);
        }

        point = hitPoint(hitAngle, yc, point, rrotation);

        if (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0)
        {
                return seeThroughWithShadow(yc, p, point, rotation, rrotation);
        }

        vec4 color = backside(yc, point);

        vec4 otherColor;
        if (yc < 0.0)
        {
                float dx2 = point.x - 0.5;
                float dy2 = point.y - 0.5;
                float shado = 1.0 - (sqrt(dx2 * dx2 + dy2 * dy2) / 0.71);
                float nyc2 = -yc / cylinderRadius;
                shado *= nyc2 * nyc2 * nyc2;
                shado *= 0.5;
                otherColor = vec4(0.0, 0.0, 0.0, shado * getToColor(p).a); // a shadow on the incoming image
        }
        else
        {
                otherColor = getFromColor(p);
        }

        color = antiAlias(color, otherColor, cylinderRadius - abs(yc));

        vec4 cl = seeThroughWithShadow(yc, p, point, rotation, rrotation);
        float dist = distanceToEdge(point);

        return antiAlias(color, cl, dist);
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/InvertedPageCurl.glsl`,license:`BSD 3 Clause`},description:`The outgoing image curls away like a page, revealing the incoming one`},{id:`gl:Morph`,name:`Morph`,glsl:`// Author: paniq
// License: MIT
// Description: A crossfade in which each image is displaced by the other's colors, like a morph
// Tags: morph, distort, blend
// @param Strength of the displacement
uniform float strength; // = 0.1

vec4 transition(vec2 p) {
  vec4 ca = getFromColor(p);
  vec4 cb = getToColor(p);
  
  vec2 oa = (((ca.rg+ca.b)*0.5)*2.0-1.0);
  vec2 ob = (((cb.rg+cb.b)*0.5)*2.0-1.0);
  vec2 oc = mix(oa,ob,0.5)*strength;
  
  float w0 = progress;
  float w1 = 1.0-w0;
  return mix(getFromColor(p+oc*w0), getToColor(p-oc*w1), progress);
}
`,parameters:{strength:{type:`float`,default:.1}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Morph.glsl`,license:`MIT`},description:`A crossfade in which each image is displaced by the other's colors, like a morph`},{id:`gl:Pixelize`,name:`Pixelize`,glsl:`// Author: gre
// License: MIT
// Description: Both images pixelate, crossfade, then sharpen again
// Tags: pixelate, blend
// forked from https://gist.github.com/benraziel/c528607361d90a072e98

// minimum number of squares (when the effect is at its higher level)
// @param Number of squares at the strongest pixelation
uniform ivec2 squaresMin; // = ivec2(20)
// zero disable the stepping
// @param Number of pixelation steps; 0 for a continuous effect
uniform int steps; // = 50

vec4 transition(vec2 uv) {
  float d = min(progress, 1.0 - progress);
  float dist = steps>0 ? ceil(d * float(steps)) / float(steps) : d;
  vec2 squareSize = 2.0 * dist / vec2(squaresMin);
  vec2 p = dist>0.0 ? (floor(uv / squareSize) + 0.5) * squareSize : uv;
  return mix(getFromColor(p), getToColor(p), progress);
}
`,parameters:{squaresMin:{type:`ivec2`,default:[20,20]},steps:{type:`int`,default:50}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Pixelize.glsl`,license:`MIT`},description:`Both images pixelate, crossfade, then sharpen again`},{id:`gl:PolkaDotsCurtain`,name:`Polka Dots Curtain`,glsl:`// Author: bobylito
// License: MIT
// Description: The incoming image appears through growing polka dots
// Tags: dots, pattern
const float SQRT_2 = 1.414213562373;
// @param Number of dots across the image
uniform float dots; // = 20.0
uniform vec2 center; // = vec2(0, 0)

vec4 transition(vec2 uv) {
  bool nextImage = distance(fract(uv * dots), vec2(0.5, 0.5)) < ( progress / distance(uv, center));
  return nextImage ? getToColor(uv) : getFromColor(uv);
}
`,parameters:{dots:{type:`float`,default:20},center:{type:`vec2`,default:[0,0]}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/PolkaDotsCurtain.glsl`,license:`MIT`},description:`The incoming image appears through growing polka dots`},{id:`gl:Ripple`,name:`Ripple`,glsl:`// Author: gre
// License: MIT
// Description: Ripples spread from the center while crossfading
// Tags: ripple, wave, blend
// @param Frequency of the ripples
uniform float amplitude; // = 100.0
// @param Speed of the ripples
uniform float speed; // = 50.0

vec4 transition (vec2 uv) {
  vec2 dir = uv - vec2(.5);
  float dist = length(dir);
  vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + .5) / 30. * progress;
  return mix(
    getFromColor(uv + offset),
    getToColor(uv),
    smoothstep(0.2, 1.0, progress)
  );
}
`,parameters:{amplitude:{type:`float`,default:100},speed:{type:`float`,default:50}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Ripple.glsl`,license:`MIT`},description:`Ripples spread from the center while crossfading`},{id:`gl:SimpleZoom`,name:`Simple Zoom`,glsl:`// Author: 0gust1
// License: MIT
// Description: Zooms into the outgoing image, then fades to the incoming one
// Tags: zoom, fade

// @range(0.2, 1) Part of the transition spent zooming
uniform float zoom_quickness; // = 0.8
vec2 zoom(vec2 uv, float amount) {
  return 0.5 + ((uv - 0.5) * (1.0-amount));	
}

vec4 transition (vec2 uv) {
  float nQuick = clamp(zoom_quickness,0.2,1.0);
  return mix(
    getFromColor(zoom(uv, smoothstep(0.0, nQuick, progress))),
    getToColor(uv),
   smoothstep(nQuick-0.2, 1.0, progress)
  );
}`,parameters:{zoom_quickness:{type:`float`,default:.8}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/SimpleZoom.glsl`,license:`MIT`},description:`Zooms into the outgoing image, then fades to the incoming one`},{id:`gl:SimpleZoomOut`,name:`Simple Zoom Out`,glsl:`// Author: Tianshuo
// License: MIT
// Description: The incoming image zooms out into place while fading in
// Tags: zoom, fade


// @range(0.2, 1) Part of the transition spent zooming
uniform float zoom_quickness; // = 0.8
// @param Fade instead of cutting to the incoming image
uniform bool fade; // = true
vec2 zoom(vec2 uv, float amount) {
  return 0.5 + ((uv - 0.5) * (1.0-amount));	
}

vec4 transition (vec2 uv) {
  float nQuick = clamp(zoom_quickness,0.2,1.0);
  return mix(
    getFromColor(uv),
    getToColor(zoom(uv,1.-smoothstep(1.-nQuick, 1., progress))),
   fade?smoothstep(1.0-nQuick, 1., progress):(progress<1.0-nQuick?0.0:1.0)
  );
}
`,parameters:{zoom_quickness:{type:`float`,default:.8},fade:{type:`bool`,default:!0}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/SimpleZoomOut.glsl`,license:`MIT`},description:`The incoming image zooms out into place while fading in`},{id:`gl:StereoViewer`,name:`Stereo Viewer`,glsl:`// Tunable parameters
// How much to zoom (out) for the effect ~ 0.5 - 1.0
// @range(0.5, 1) How much the images zoom out
uniform float zoom; // = 0.88
// Corner radius as a fraction of the image height
uniform float corner_radius;  // = 0.22

// Author: Ted Schundler
// License: BSD 2 Clause
// Description: Both images shrink into rounded cards that swap, like a stereo viewer toy
// Tags: cards, zoom, retro
// Free for use and modification by anyone with credit

// Copyright (c) 2016, Theodore K Schundler
// All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

///////////////////////////////////////////////////////////////////////////////
// Stereo Viewer Toy Transition                                              //
//                                                                           //
// Inspired by ViewMaster / Image3D image viewer devices.                    //
// This effect is similar to what you see when you press the device's lever. //
// There is a quick zoom in / out to make the transition 'valid' for GLSL.io //
///////////////////////////////////////////////////////////////////////////////

const vec4 black = vec4(0.0); // where no image is drawn: transparent
const vec2 c00 = vec2(0.0, 0.0); // the four corner points
const vec2 c01 = vec2(0.0, 1.0);
const vec2 c11 = vec2(1.0, 1.0);
const vec2 c10 = vec2(1.0, 0.0);

// Check if a point is within a given corner
bool in_corner(vec2 p, vec2 corner, vec2 radius) {
  // determine the direction we want to be filled
  vec2 axis = (c11 - corner) - corner;

  // warp the point so we are always testing the bottom left point with the
  // circle centered on the origin
  p = p - (corner + axis * radius);
  p *= axis / radius;
  return (p.x > 0.0 && p.y > -1.0) || (p.y > 0.0 && p.x > -1.0) || dot(p, p) < 1.0;
}

// Check all four corners
// return a float for v2 for anti-aliasing?
bool test_rounded_mask(vec2 p, vec2 corner_size) {
  return
      in_corner(p, c00, corner_size) &&
      in_corner(p, c01, corner_size) &&
      in_corner(p, c10, corner_size) &&
      in_corner(p, c11, corner_size);
}

// Screen blend mode - https://en.wikipedia.org/wiki/Blend_modes
// This more closely approximates what you see than linear blending
vec4 screen(vec4 a, vec4 b) {
  return 1.0 - (1.0 - a) * (1.0 -b);
}

// Given RGBA, find a value that when screened with itself
// will yield the original value.
vec4 unscreen(vec4 c) {
  return 1.0 - sqrt(1.0 - c);
}

// Grab a pixel, only if it isn't masked out by the rounded corners
vec4 sample_with_corners_from(vec2 p, vec2 corner_size) {
  p = (p - 0.5) / zoom + 0.5;
  if (!test_rounded_mask(p, corner_size)) {
    return black;
  }
  return unscreen(getFromColor(p));
}

vec4 sample_with_corners_to(vec2 p, vec2 corner_size) {
  p = (p - 0.5) / zoom + 0.5;
  if (!test_rounded_mask(p, corner_size)) {
    return black;
  }
  return unscreen(getToColor(p));
}

// special sampling used when zooming - extra zoom parameter and don't unscreen
vec4 simple_sample_with_corners_from(vec2 p, vec2 corner_size, float zoom_amt) {
  p = (p - 0.5) / (1.0 - zoom_amt + zoom * zoom_amt) + 0.5;
  if (!test_rounded_mask(p, corner_size)) {
    return black;
  }
  return getFromColor(p);
}

vec4 simple_sample_with_corners_to(vec2 p, vec2 corner_size, float zoom_amt) {
  p = (p - 0.5) / (1.0 - zoom_amt + zoom * zoom_amt) + 0.5;
  if (!test_rounded_mask(p, corner_size)) {
    return black;
  }
  return getToColor(p);
}

// Basic 2D affine transform matrix helpers
// These really shouldn't be used in a fragment shader - I should work out the
// the math for a translate & rotate function as a pair of dot products instead

mat3 rotate2d(float angle, float ratio) {
  float s = sin(angle);
  float c = cos(angle);
  return mat3(
    c, s ,0.0,
    -s, c, 0.0,
    0.0, 0.0, 1.0);
}

mat3 translate2d(float x, float y) {
  return mat3(
    1.0, 0.0, 0,
    0.0, 1.0, 0,
    -x, -y, 1.0);
}

mat3 scale2d(float x, float y) {
  return mat3(
    x, 0.0, 0,
    0.0, y, 0,
    0, 0, 1.0);
}

// Split an image and rotate one up and one down along off screen pivot points
vec4 get_cross_rotated(vec3 p3, float angle, vec2 corner_size, float ratio) {
  angle = angle * angle; // easing
  angle /= 2.4; // works out to be a good number of radians

  mat3 center_and_scale = translate2d(-0.5, -0.5) * scale2d(1.0, ratio);
  mat3 unscale_and_uncenter = scale2d(1.0, 1.0/ratio) * translate2d(0.5,0.5);
  mat3 slide_left = translate2d(-2.0,0.0);
  mat3 slide_right = translate2d(2.0,0.0);
  mat3 rotate = rotate2d(angle, ratio);

  mat3 op_a = center_and_scale * slide_right * rotate * slide_left * unscale_and_uncenter;
  mat3 op_b = center_and_scale * slide_left * rotate * slide_right * unscale_and_uncenter;

  vec4 a = sample_with_corners_from((op_a * p3).xy, corner_size);
  vec4 b = sample_with_corners_from((op_b * p3).xy, corner_size);

  return screen(a, b);
}

// Image stays put, but this time move two masks
vec4 get_cross_masked(vec3 p3, float angle, vec2 corner_size, float ratio) {
  angle = 1.0 - angle;
  angle = angle * angle; // easing
  angle /= 2.4;

  vec4 img;

  mat3 center_and_scale = translate2d(-0.5, -0.5) * scale2d(1.0, ratio);
  mat3 unscale_and_uncenter = scale2d(1.0 / zoom, 1.0 / (zoom * ratio)) * translate2d(0.5,0.5);
  mat3 slide_left = translate2d(-2.0,0.0);
  mat3 slide_right = translate2d(2.0,0.0);
  mat3 rotate = rotate2d(angle, ratio);

  mat3 op_a = center_and_scale * slide_right * rotate * slide_left * unscale_and_uncenter;
  mat3 op_b = center_and_scale * slide_left * rotate * slide_right * unscale_and_uncenter;

  bool mask_a = test_rounded_mask((op_a * p3).xy, corner_size);
  bool mask_b = test_rounded_mask((op_b * p3).xy, corner_size);

  if (mask_a || mask_b) {
    img = sample_with_corners_to(p3.xy, corner_size);
    return screen(mask_a ? img : black, mask_b ? img : black);
  } else {
    return black;
  }
}

vec4 transition(vec2 uv) {
  float a;
  vec2 p=uv.xy/vec2(1.0).xy;
  vec3 p3 = vec3(p.xy, 1.0); // for 2D matrix transforms

  // corner is warped to represent to size after mapping to 1.0, 1.0
  vec2 corner_size = vec2(corner_radius / ratio, corner_radius);

  if (progress <= 0.0) {
    // 0.0: start with the base frame always
    return getFromColor(p);
  } else if (progress < 0.1) {
    // 0.0-0.1: zoom out and add rounded corners
    a = progress / 0.1;
    return  simple_sample_with_corners_from(p, corner_size * a, a);
  } else if (progress < 0.48) {
    // 0.1-0.48: Split original image apart
    a = (progress - 0.1)/0.38;
    return get_cross_rotated(p3, a, corner_size, ratio);
  } else if (progress < 0.9) {
    // 0.48-0.52: black
    // 0.52 - 0.9: unmask new image
    return get_cross_masked(p3, (progress - 0.52)/0.38, corner_size, ratio);
  } else if (progress < 1.0) {
    // zoom out and add rounded corners
    a = (1.0 - progress) / 0.1;
    return simple_sample_with_corners_to(p, corner_size * a, a);
  } else {
    // 1.0 end with base frame
    return getToColor(p);
  }
}
`,parameters:{zoom:{type:`float`,default:.88},corner_radius:{type:`float`,default:.22}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/StereoViewer.glsl`,license:`BSD 2 Clause`},description:`Both images shrink into rounded cards that swap, like a stereo viewer toy`},{id:`gl:Swirl`,name:`Swirl`,glsl:`// License: MIT
// Author: Sergey Kosarevsky
// Description: Both images swirl around the center while crossfading
// Tags: swirl, rotate, blend
// ( http://www.linderdaum.com )
// ported by gre from https://gist.github.com/corporateshark/cacfedb8cca0f5ce3f7c

vec4 transition(vec2 UV)
{
	float Radius = 1.0;

	float T = progress;

	UV -= vec2( 0.5, 0.5 );

	float Dist = length(UV);

	if ( Dist < Radius )
	{
		float Percent = (Radius - Dist) / Radius;
		float A = ( T <= 0.5 ) ? mix( 0.0, 1.0, T/0.5 ) : mix( 1.0, 0.0, (T-0.5)/0.5 );
		float Theta = Percent * Percent * A * 8.0 * 3.14159;
		float S = sin( Theta );
		float C = cos( Theta );
		UV = vec2( dot(UV, vec2(C, -S)), dot(UV, vec2(S, C)) );
	}
	UV += vec2( 0.5, 0.5 );

	vec4 C0 = getFromColor(UV);
	vec4 C1 = getToColor(UV);

	return mix( C0, C1, T );
}
`,parameters:{},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Swirl.glsl`,license:`MIT`},description:`Both images swirl around the center while crossfading`},{id:`gl:WaterDrop`,name:`Water Drop`,glsl:`// Author: Paweł Płóciennik
// License: MIT
// Description: Ripples spread from the center like a drop falling into water, crossfading to the incoming image
// Tags: ripple, water, blend
// @param Frequency of the ripples
uniform float amplitude; // = 30
// @param Speed of the ripples
uniform float speed; // = 30

vec4 transition(vec2 p) {
  vec2 dir = p - vec2(.5);
  float dist = length(dir);

  if (dist > progress) {
    return mix(getFromColor( p), getToColor( p), progress);
  } else {
    vec2 offset = dir * sin(dist * amplitude - progress * speed);
    return mix(getFromColor( p + offset), getToColor( p), progress);
  }
}
`,parameters:{amplitude:{type:`float`,default:30},speed:{type:`float`,default:30}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/WaterDrop.glsl`,license:`MIT`},description:`Ripples spread from the center like a drop falling into water, crossfading to the incoming image`},{id:`gl:Wind`,name:`Wind`,glsl:`// Author: gre
// License: MIT
// Description: A ragged left-to-right wipe, as if the image was blown away by the wind
// Tags: wipe, horizontal, noise

// @range(0, 1) Width of the ragged edge
uniform float size; // = 0.2
// @param Wipe from right to left instead
uniform bool reversed; // = false

float rand (vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec4 transition (vec2 uv) {
  float x = reversed ? 1. - uv.x : uv.x;
  float r = rand(vec2(0, uv.y));
  float m = smoothstep(0.0, -size, x*(1.0-size) + size*r - (progress * (1.0 + size)));
  return mix(
    getFromColor(uv),
    getToColor(uv),
    m
  );
}
`,parameters:{size:{type:`float`,default:.2},reversed:{type:`bool`,default:!1}},provenance:{repository:`gl-transitions/gl-transitions`,path:`transitions/Wind.glsl`,license:`MIT`},description:`A ragged left-to-right wipe, as if the image was blown away by the wind`},{id:`copro:anamorphic-flash`,name:`Anamorphic Flash`,glsl:`vec4 transition(vec2 uv) { float flash=pow(sin(progress*3.14159265),12.0); vec2 d=vec2(flash*.025,0.); vec4 c=mix(getFromColor(uv+d),getToColor(uv-d),smoothstep(.35,.65,progress)); return vec4(c.rgb+vec3(.5,.65,.8)*flash,c.a); }`,parameters:{},provenance:{repository:`original`,license:`FSL-1.1-MIT`},description:`Original CoPro cinematic transition.`},{id:`copro:shutter-bands`,name:`Shutter Bands`,glsl:`vec4 transition(vec2 uv) { float row=floor(uv.y*12.0); float phase=fract(row*.618); float p=smoothstep(phase*.3, .7+phase*.3,progress); return mix(getFromColor(uv),getToColor(uv),step(fract(uv.x*3.0),p)); }`,parameters:{},provenance:{repository:`original`,license:`FSL-1.1-MIT`},description:`Original CoPro cinematic transition.`},{id:`copro:focus-pull`,name:`Focus Pull`,glsl:`vec4 transition(vec2 uv) { float b=sin(progress*3.14159265)*.012; vec4 a=vec4(0.); vec4 c=vec4(0.); for(int i=0;i<9;i++){float x=float(i)-4.;vec2 o=vec2(x*b,0.);a+=getFromColor(uv+o)/9.;c+=getToColor(uv+o)/9.;}return mix(a,c,smoothstep(.25,.75,progress)); }`,parameters:{},provenance:{repository:`original`,license:`FSL-1.1-MIT`},description:`Original CoPro cinematic transition.`},{id:`copro:blueprint-reveal`,name:`Blueprint Reveal`,glsl:`vec4 transition(vec2 uv) { vec2 cell=floor(uv*vec2(16.,9.));float d=(cell.x+cell.y)/25.;float p=smoothstep(d*.6,d*.6+.4,progress);float edge=sin(p*3.14159265)*.16;return mix(getFromColor(uv),getToColor(uv),p)+vec4(.2,.8,.7,0.)*edge; }`,parameters:{},provenance:{repository:`original`,license:`FSL-1.1-MIT`},description:`Original CoPro cinematic transition.`}]),t=e=>structuredClone(e),n={fade:`gl:Fade`,crossfade:`gl:Fade`,wipe:`gl:DirectionalWipe`,zoom:`gl:SimpleZoom`,glitch:`gl:GlitchMemories`};function r(r){let i=e.find(e=>e.id===(n[r]||r));if(!i)throw Error(`copro_transition_unknown:`+r);return t(i)}function i(e={}){if(typeof e==`string`&&(e={type:e}),e.type===`none`)return{type:`none`,durationUs:0,parameters:{}};let n=r(e.type),i=e.durationUs??3e5;if(!Number.isSafeInteger(i)||i<=0)throw RangeError(`copro_transition_duration_invalid`);if(e.parameters!==void 0&&(!e.parameters||typeof e.parameters!=`object`||Array.isArray(e.parameters)))throw TypeError(`copro_transition_parameters_invalid`);let a={};for(let t of Object.keys(e.parameters||{}))if(!Object.hasOwn(n.parameters,t))throw Error(`copro_transition_parameter_unknown:`+t);for(let[r,i]of Object.entries(n.parameters)){let n=e.parameters?.[r]??t(i.default),o=i.type===`int`||i.type.startsWith(`ivec`),s=e=>Number.isFinite(e)&&Math.abs(e)<=1e6&&(!o||Number.isSafeInteger(e));if(i.type===`bool`?typeof n!=`boolean`:i.type.includes(`vec`)?!Array.isArray(n)||n.length!==Number(i.type.at(-1))||!n.every(s):!s(n))throw TypeError(`copro_transition_parameter_invalid:`+r);a[r]=n}return{type:n.id,durationUs:i,parameters:a}}function a(e,t){if(!Number.isSafeInteger(e)||!Number.isSafeInteger(t)||t<=0)throw RangeError(`copro_transition_time_invalid`);return Math.max(0,Math.min(1,e/t))}var o=`attribute vec2 position; varying vec2 vUv; void main(){vUv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;function s(e,t=`highp`){return`precision ${t} float; varying vec2 vUv;
 uniform sampler2D fromTexture; uniform sampler2D toTexture;
 uniform float progress; uniform float ratio; uniform float fromRatio; uniform float toRatio;
 vec2 coverUv(vec2 uv,float imageRatio){return (uv-.5)*vec2(min(ratio/imageRatio,1.0),min(imageRatio/ratio,1.0))+.5;}
 vec4 getFromColor(vec2 uv){return texture2D(fromTexture,coverUv(uv,fromRatio));}
 vec4 getToColor(vec2 uv){return texture2D(toTexture,coverUv(uv,toRatio));}
 ${e.glsl}
 void main(){if(progress<=0.0){gl_FragColor=getFromColor(vUv);}else if(progress>=1.0){gl_FragColor=getToColor(vUv);}else{gl_FragColor=transition(vUv);}}`}function c(e,{contextAttributes:t={}}={}){let n=e?.getContext?.(`webgl`,{alpha:!0,premultipliedAlpha:!1,preserveDrawingBuffer:!0,...t});if(!n)throw Error(`copro_webgl_unavailable`);let c=!1,l=!1,u,d=[],f=new Map;function p(e,t){let r=n.createShader(e);if(n.shaderSource(r,t),n.compileShader(r),!n.getShaderParameter(r,n.COMPILE_STATUS)){let e=n.getShaderInfoLog(r);throw n.deleteShader(r),Error(`copro_shader_compile_failed:`+e)}return r}function m(){u=n.createBuffer(),n.bindBuffer(n.ARRAY_BUFFER,u),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),n.STATIC_DRAW),d=[0,1].map(()=>{let e=n.createTexture();return n.bindTexture(n.TEXTURE_2D,e),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),e})}function h(e){if(f.has(e.id))return f.get(e.id);let t=n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT)?.precision?`highp`:`mediump`,r,i,a;try{if(r=p(n.VERTEX_SHADER,o),i=p(n.FRAGMENT_SHADER,s(e,t)),a=n.createProgram(),n.attachShader(a,r),n.attachShader(a,i),n.linkProgram(a),!n.getProgramParameter(a,n.LINK_STATUS))throw Error(`copro_shader_link_failed:`+n.getProgramInfoLog(a));return f.set(e.id,a),a}catch(e){throw a&&n.deleteProgram(a),e}finally{r&&n.deleteShader(r),i&&n.deleteShader(i)}}function g(){if(c)throw Error(`copro_transition_renderer_disposed`);if(l||n.isContextLost())throw Error(`copro_webgl_context_lost`)}function _(e){e.preventDefault(),l=!0,f.clear()}function v(){c||(l=!1,m())}return e.addEventListener?.(`webglcontextlost`,_),e.addEventListener?.(`webglcontextrestored`,v),m(),Object.freeze({compile(e){return g(),h(r(e)),{type:e,compiled:!0}},render({transition:e,from:t,to:o,timeUs:s=0}){g();let c=i(e),l=r(c.type===`none`?`gl:Fade`:c.type),f=h(l);n.useProgram(f);let p=n.drawingBufferWidth,m=n.drawingBufferHeight;if(p<1||m<1)throw Error(`copro_transition_canvas_empty`);n.viewport(0,0,p,m),n.bindBuffer(n.ARRAY_BUFFER,u);let _=n.getAttribLocation(f,`position`);n.enableVertexAttribArray(_),n.vertexAttribPointer(_,2,n.FLOAT,!1,0,0);let v=(e,t,...r)=>{let i=n.getUniformLocation(f,e);i!==null&&n[t](i,...r)};for(let[e,r]of[t,o].entries()){let t=r?.displayWidth||r?.videoWidth||r?.naturalWidth||r?.width,i=r?.displayHeight||r?.videoHeight||r?.naturalHeight||r?.height;if(!(t>0&&i>0))throw Error(`copro_transition_source_invalid`);n.activeTexture(n.TEXTURE0+e),n.bindTexture(n.TEXTURE_2D,d[e]),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,r),v(e?`toTexture`:`fromTexture`,`uniform1i`,e),v(e?`toRatio`:`fromRatio`,`uniform1f`,t/i)}let y=c.type===`none`?1:a(s,c.durationUs);v(`progress`,`uniform1f`,y),v(`ratio`,`uniform1f`,p/m);for(let[e,t]of Object.entries(l.parameters)){let n=c.parameters[e]??t.default;t.type.includes(`vec`)?v(e,`uniform${t.type.at(-1)}${t.type.startsWith(`i`)?`i`:`f`}v`,n):v(e,t.type===`float`?`uniform1f`:`uniform1i`,t.type===`bool`?Number(n):n)}n.disable(n.BLEND),n.drawArrays(n.TRIANGLE_STRIP,0,4);let b=n.getError();if(b!==n.NO_ERROR)throw Error(`copro_webgl_error:`+b);return{type:c.type,progress:y,width:p,height:m}},dispose(){if(!c){c=!0,e.removeEventListener?.(`webglcontextlost`,_),e.removeEventListener?.(`webglcontextrestored`,v);for(let e of f.values())n.deleteProgram(e);for(let e of d)n.deleteTexture(e);n.deleteBuffer(u),f.clear()}}})}export{c as createCoProTransitionRenderer};