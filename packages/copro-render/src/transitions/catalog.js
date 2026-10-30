// Generated from pinned source blobs; see provenance.json and THIRD_PARTY_NOTICES.md.
export const TRANSITIONS = Object.freeze([
  {
    "id": "gl:BlockDissolve",
    "name": "Block Dissolve",
    "glsl": "// Author: nwoeanhinnogaehr\n// License: MIT\n// Description: The incoming image appears in small random blocks\n// Tags: dissolve, blocks, noise\n// Ported from https://gist.github.com/nwoeanhinnogaehr/b93818de23d4511fde10\n\nuniform float blocksize; // = 0.02\n\nfloat rand(vec2 co) {\n  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);\n}\n\nvec4 transition(vec2 uv) {\n  return mix(getFromColor(uv), getToColor(uv), step(rand(floor(uv / blocksize)), progress));\n}\n",
    "parameters": {
      "blocksize": {
        "type": "float",
        "default": 0.02
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/BlockDissolve.glsl",
      "license": "MIT"
    },
    "description": "The incoming image appears in small random blocks"
  },
  {
    "id": "gl:BookFlip",
    "name": "Book Flip",
    "glsl": "// Author: hong\n// License: MIT\n// Description: The outgoing image turns like a book page from right to left, revealing the incoming one\n// Tags: page, flip, 3d\n\n// Avoids dividing by zero when the page is edge-on (progress = 0.5).\nfloat nonZero(float x) {\n  return abs(x) < 1e-4 ? (x < 0.0 ? -1e-4 : 1e-4) : x;\n}\n\nvec2 skewRight(vec2 p) {\n  float skewX = (p.x - progress)/nonZero(0.5 - progress) * 0.5;\n  float skewY =  (p.y - 0.5)/(0.5 + progress * (p.x - 0.5) / 0.5)* 0.5  + 0.5;\n  return vec2(skewX, skewY);\n}\n\nvec2 skewLeft(vec2 p) {\n  float skewX = (p.x - 0.5)/nonZero(progress - 0.5) * 0.5 + 0.5;\n  float skewY = (p.y - 0.5) / (0.5 + (1.0 - progress ) * (0.5 - p.x) / 0.5) * 0.5  + 0.5;\n  return vec2(skewX, skewY);\n}\n\nvec4 addShade() {\n  float shadeVal  =  max(0.7, abs(progress - 0.5) * 2.0);\n  return vec4(vec3(shadeVal ), 1.0);\n}\n\nvec4 transition (vec2 p) {\n  float pr = step(1.0 - progress, p.x);\n\n  if (p.x < 0.5) {\n    return mix(getFromColor(p), getToColor(skewLeft(p)) * addShade(), pr);\n  } else {\n    return mix(getFromColor(skewRight(p)) * addShade(), getToColor(p),   pr);\n  }\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/BookFlip.glsl",
      "license": "MIT"
    },
    "description": "The outgoing image turns like a book page from right to left, revealing the incoming one"
  },
  {
    "id": "gl:Bounce",
    "name": "Bounce",
    "glsl": "// Author: Adrian Purser\n// License: MIT\n// Description: The outgoing image drops out of the frame with a few bounces, revealing the incoming one\n// Tags: bounce, slide, vertical, shadow\n\n// @color Color of the shadow cast on the incoming image\nuniform vec4 shadow_colour; // = vec4(0.,0.,0.,.6)\n// @range(0.01, 0.5) Height of the shadow, relative to the image height\nuniform float shadow_height; // = 0.075\n// @range(1, 10, 1) Number of bounces before settling\nuniform float bounces; // = 3.0\n\nconst float PI = 3.14159265358;\n\nvec4 transition (vec2 uv) {\n  float time = progress;\n  float stime = sin(time * PI / 2.);\n  float phase = time * PI * bounces;\n  float y = (abs(cos(phase))) * (1.0 - stime);\n  float d = uv.y - y;\n  vec4 to = getToColor(uv);\n  return mix(\n    mix(\n      to,\n      vec4(shadow_colour.rgb, 1.0), // shadow_colour.a is in the amount: the shadow darkens, it does not make the image transparent\n      step(d, shadow_height) * (1. - mix(\n        ((d / shadow_height) * shadow_colour.a) + (1.0 - shadow_colour.a),\n        1.0,\n        smoothstep(0.95, 1., progress) // fade-out the shadow at the end\n      )) * to.a // cast on the incoming image, not on its transparent areas\n    ),\n    getFromColor(vec2(uv.x, uv.y + (1.0 - y))),\n    step(d, 0.0)\n  );\n}\n",
    "parameters": {
      "shadow_colour": {
        "type": "vec4",
        "default": [
          0.0,
          0.0,
          0.0,
          0.6
        ]
      },
      "shadow_height": {
        "type": "float",
        "default": 0.075
      },
      "bounces": {
        "type": "float",
        "default": 3.0
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Bounce.glsl",
      "license": "MIT"
    },
    "description": "The outgoing image drops out of the frame with a few bounces, revealing the incoming one"
  },
  {
    "id": "gl:BowTieHorizontal",
    "name": "Bow Tie Horizontal",
    "glsl": "// Author: huynx\n// License: MIT\n// Description: Two triangles grow from the left and right edges into a bow tie that reveals the incoming image\n// Tags: wipe, shape, horizontal\n\nconst vec2 bottom_left = vec2(0.0, 1.0);\nconst vec2 bottom_right = vec2(1.0, 1.0);\nconst vec2 top_left = vec2(0.0, 0.0);\nconst vec2 top_right = vec2(1.0, 0.0);\nconst vec2 center = vec2(0.5, 0.5);\n\nfloat check(vec2 p1, vec2 p2, vec2 p3)\n{\n  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);\n}\n\nbool PointInTriangle (vec2 pt, vec2 p1, vec2 p2, vec2 p3)\n{\n    bool b1, b2, b3;\n    b1 = check(pt, p1, p2) < 0.0;\n    b2 = check(pt, p2, p3) < 0.0;\n    b3 = check(pt, p3, p1) < 0.0;\n    return ((b1 == b2) && (b2 == b3));\n}\n\nbool in_left_triangle(vec2 p){\n  vec2 vertex1, vertex2, vertex3;\n  vertex1 = vec2(progress, 0.5);\n  vertex2 = vec2(0.0, 0.5-progress);\n  vertex3 = vec2(0.0, 0.5+progress);\n  if (PointInTriangle(p, vertex1, vertex2, vertex3))\n  {\n    return true;\n  }\n  return false;\n}\n\nbool in_right_triangle(vec2 p){\n  vec2 vertex1, vertex2, vertex3;\n  vertex1 = vec2(1.0-progress, 0.5);\n  vertex2 = vec2(1.0, 0.5-progress);\n  vertex3 = vec2(1.0, 0.5+progress);\n  if (PointInTriangle(p, vertex1, vertex2, vertex3))\n  {\n    return true;\n  }\n  return false;\n}\n\nfloat blur_edge(vec2 bot1, vec2 bot2, vec2 top, vec2 testPt)\n{\n  vec2 lineDir = bot1 - top;\n  vec2 perpDir = vec2(lineDir.y, -lineDir.x);\n  vec2 dirToPt1 = bot1 - testPt;\n  float dist1 = abs(dot(normalize(perpDir), dirToPt1));\n  \n  lineDir = bot2 - top;\n  perpDir = vec2(lineDir.y, -lineDir.x);\n  dirToPt1 = bot2 - testPt;\n  float min_dist = min(abs(dot(normalize(perpDir), dirToPt1)), dist1);\n  \n  if (min_dist < 0.005) {\n    return min_dist / 0.005;\n  }\n  else  {\n    return 1.0;\n  };\n}\n\n\nvec4 transition (vec2 uv) {\n  if (in_left_triangle(uv))\n  {\n    if (progress < 0.1)\n    {\n      return getFromColor(uv);\n    }\n    if (uv.x < 0.5)\n    {\n      vec2 vertex1 = vec2(progress, 0.5);\n      vec2 vertex2 = vec2(0.0, 0.5-progress);\n      vec2 vertex3 = vec2(0.0, 0.5+progress);\n      return mix(\n        getFromColor(uv),\n        getToColor(uv),\n        blur_edge(vertex2, vertex3, vertex1, uv)\n      );\n    }\n    else\n    {\n      if (progress > 0.0)\n      {\n        return getToColor(uv);\n      }\n      else\n      {\n        return getFromColor(uv);\n      }\n    }    \n  }\n  else if (in_right_triangle(uv))\n  {\n    if (uv.x >= 0.5)\n    {\n      vec2 vertex1 = vec2(1.0-progress, 0.5);\n      vec2 vertex2 = vec2(1.0, 0.5-progress);\n      vec2 vertex3 = vec2(1.0, 0.5+progress);\n      return mix(\n        getFromColor(uv),\n        getToColor(uv),\n        blur_edge(vertex2, vertex3, vertex1, uv)\n      );  \n    }\n    else\n    {\n      return getFromColor(uv);\n    }\n  }\n  else {\n    return getFromColor(uv);\n  }\n}",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/BowTieHorizontal.glsl",
      "license": "MIT"
    },
    "description": "Two triangles grow from the left and right edges into a bow tie that reveals the incoming image"
  },
  {
    "id": "gl:BowTieVertical",
    "name": "Bow Tie Vertical",
    "glsl": "// Author: huynx\n// License: MIT\n// Description: Two triangles grow from the top and bottom edges into a bow tie that reveals the incoming image\n// Tags: wipe, shape, vertical\n\nfloat check(vec2 p1, vec2 p2, vec2 p3)\n{\n  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);\n}\n\nbool PointInTriangle (vec2 pt, vec2 p1, vec2 p2, vec2 p3)\n{\n    bool b1, b2, b3;\n    b1 = check(pt, p1, p2) < 0.0;\n    b2 = check(pt, p2, p3) < 0.0;\n    b3 = check(pt, p3, p1) < 0.0;\n    return ((b1 == b2) && (b2 == b3));\n}\n\nbool in_top_triangle(vec2 p){\n  vec2 vertex1, vertex2, vertex3;\n  vertex1 = vec2(0.5, progress);\n  vertex2 = vec2(0.5-progress, 0.0);\n  vertex3 = vec2(0.5+progress, 0.0);\n  if (PointInTriangle(p, vertex1, vertex2, vertex3))\n  {\n    return true;\n  }\n  return false;\n}\n\nbool in_bottom_triangle(vec2 p){\n  vec2 vertex1, vertex2, vertex3;\n  vertex1 = vec2(0.5, 1.0 - progress);\n  vertex2 = vec2(0.5-progress, 1.0);\n  vertex3 = vec2(0.5+progress, 1.0);\n  if (PointInTriangle(p, vertex1, vertex2, vertex3))\n  {\n    return true;\n  }\n  return false;\n}\n\nfloat blur_edge(vec2 bot1, vec2 bot2, vec2 top, vec2 testPt)\n{\n  vec2 lineDir = bot1 - top;\n  vec2 perpDir = vec2(lineDir.y, -lineDir.x);\n  vec2 dirToPt1 = bot1 - testPt;\n  float dist1 = abs(dot(normalize(perpDir), dirToPt1));\n  \n  lineDir = bot2 - top;\n  perpDir = vec2(lineDir.y, -lineDir.x);\n  dirToPt1 = bot2 - testPt;\n  float min_dist = min(abs(dot(normalize(perpDir), dirToPt1)), dist1);\n  \n  if (min_dist < 0.005) {\n    return min_dist / 0.005;\n  }\n  else  {\n    return 1.0;\n  };\n}\n\n\nvec4 transition (vec2 uv) {\n  if (in_top_triangle(uv))\n  {\n    if (progress < 0.1)\n    {\n      return getFromColor(uv);\n    }\n    if (uv.y < 0.5)\n    {\n      vec2 vertex1 = vec2(0.5, progress);\n      vec2 vertex2 = vec2(0.5-progress, 0.0);\n      vec2 vertex3 = vec2(0.5+progress, 0.0);\n      return mix(\n        getFromColor(uv),\n        getToColor(uv),\n        blur_edge(vertex2, vertex3, vertex1, uv)\n      );\n    }\n    else\n    {\n      if (progress > 0.0)\n      {\n        return getToColor(uv);\n      }\n      else\n      {\n        return getFromColor(uv);\n      }\n    }    \n  }\n  else if (in_bottom_triangle(uv))\n  {\n    if (uv.y >= 0.5)\n    {\n      vec2 vertex1 = vec2(0.5, 1.0-progress);\n      vec2 vertex2 = vec2(0.5-progress, 1.0);\n      vec2 vertex3 = vec2(0.5+progress, 1.0);\n      return mix(\n        getFromColor(uv),\n        getToColor(uv),\n        blur_edge(vertex2, vertex3, vertex1, uv)\n      );  \n    }\n    else\n    {\n      return getFromColor(uv);\n    }\n  }\n  else {\n    return getFromColor(uv);\n  }\n}",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/BowTieVertical.glsl",
      "license": "MIT"
    },
    "description": "Two triangles grow from the top and bottom edges into a bow tie that reveals the incoming image"
  },
  {
    "id": "gl:BurnThrough",
    "name": "Burn Through",
    "glsl": "// Author: liubailin2020@gmail.com\n// License: MIT\n// Description: The outgoing image burns away in noisy, glowing patches\n// Tags: burn, fire, noise\n\n// @color Color of the burning edges\nuniform vec3 burnColor; // = vec3(1.0, 0.5, 0.0)\n\nfloat random (in vec2 st) {\n    return fract(sin(dot(st.xy,\n                         vec2(12.9898,78.233)))*\n        43758.5453123);\n}\n\n// Based on Morgan McGuire @morgan3d\n// https://www.shadertoy.com/view/4dS3Wd\nfloat noise (in vec2 st) {\n    vec2 i = floor(st);\n    vec2 f = fract(st);\n\n    float a = random(i);\n    float b = random(i + vec2(1.0, 0.0));\n    float c = random(i + vec2(0.0, 1.0));\n    float d = random(i + vec2(1.0, 1.0));\n\n    vec2 u = f * f * (3.0 - 2.0 * f);\n\n    return mix(a, b, u.x) +\n            (c - a)* u.y * (1.0 - u.x) +\n            (d - b) * u.x * u.y;\n}\n\n#define OCTAVES 4\nfloat fbm (in vec2 st) {\n    float value = 0.0;\n    float amplitude = .5;\n    for (int i = 0; i < OCTAVES; i++) {\n        value += amplitude * noise(st);\n        st *= 2.;\n        amplitude *= .5;\n    }\n    return value;\n}\n\nvec4 transition (vec2 uv) {\n    if (progress <= 0.0) return getFromColor(uv);\n    if (progress >= 1.0) return getToColor(uv);\n    vec4 from = getFromColor(uv);\n    vec4 to = getToColor(uv);\n    float n = fbm(uv * 4.);\n    float l = smoothstep(progress, progress + 0.05, n);\n    float edge = (1.0 - l) * l * 5.0;\n    return mix(to, from, l) + vec4(burnColor, 0.0) * edge;\n}\n",
    "parameters": {
      "burnColor": {
        "type": "vec3",
        "default": [
          1.0,
          0.5,
          0.0
        ]
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/BurnThrough.glsl",
      "license": "MIT"
    },
    "description": "The outgoing image burns away in noisy, glowing patches"
  },
  {
    "id": "gl:CircleIris",
    "name": "Circle Iris",
    "glsl": "// Author: Fernando Kuteken\n// License: MIT\n// Description: The outgoing image closes into a circle over a background color, then the incoming one opens from it\n// Tags: circle, iris, shape\n\n// @param Center of the circle\nuniform vec2 center; // = vec2(0.5, 0.5)\n// @color Background color\nuniform vec4 backColor; // = vec4(0.1, 0.1, 0.1, 1.0)\n\nvec4 transition (vec2 uv) {\n  \n  float distance = length(uv - center);\n  float radius = sqrt(8.0) * abs(progress - 0.5);\n  \n  if (distance > radius) {\n    return backColor;\n  }\n  else {\n    if (progress < 0.5) return getFromColor(uv);\n    else return getToColor(uv);\n  }\n}\n",
    "parameters": {
      "center": {
        "type": "vec2",
        "default": [
          0.5,
          0.5
        ]
      },
      "backColor": {
        "type": "vec4",
        "default": [
          0.1,
          0.1,
          0.1,
          1.0
        ]
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/CircleIris.glsl",
      "license": "MIT"
    },
    "description": "The outgoing image closes into a circle over a background color, then the incoming one opens from it"
  },
  {
    "id": "gl:CircleOpen",
    "name": "Circle Open",
    "glsl": "// Author: gre\n// License: MIT\n// Description: A soft-edged circle opens from the center to reveal the incoming image\n// Tags: circle, iris, wipe\n// @param Softness of the circle's edge\nuniform float smoothness; // = 0.3\n// @param Open the circle; false closes it instead\nuniform bool opening; // = true\n\nconst vec2 center = vec2(0.5, 0.5);\nconst float SQRT_2 = 1.414213562373;\n\nvec4 transition (vec2 uv) {\n  float x = opening ? progress : 1.-progress;\n  float m = smoothstep(-smoothness, 0.0, SQRT_2*distance(center, uv) - x*(1.+smoothness));\n  return mix(getFromColor(uv), getToColor(uv), opening ? 1.-m : m);\n}\n",
    "parameters": {
      "smoothness": {
        "type": "float",
        "default": 0.3
      },
      "opening": {
        "type": "bool",
        "default": true
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/CircleOpen.glsl",
      "license": "MIT"
    },
    "description": "A soft-edged circle opens from the center to reveal the incoming image"
  },
  {
    "id": "gl:ColorDistance",
    "name": "Color Distance",
    "glsl": "// License: MIT\n// Author: P-Seebauer\n// Description: Pixels switch to the incoming image in order of how close their colors are\n// Tags: blend, color\n// ported by gre from https://gist.github.com/P-Seebauer/2a5fa2f77c883dd661f9\n\nuniform float power; // = 5.0\n\nvec4 transition(vec2 p) {\n  vec4 fTex = getFromColor(p);\n  vec4 tTex = getToColor(p);\n  float m = step(distance(fTex, tTex), progress);\n  return mix(\n    mix(fTex, tTex, m),\n    tTex,\n    pow(progress, power)\n  );\n}\n",
    "parameters": {
      "power": {
        "type": "float",
        "default": 5.0
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/ColorDistance.glsl",
      "license": "MIT"
    },
    "description": "Pixels switch to the incoming image in order of how close their colors are"
  },
  {
    "id": "gl:CrossWarp",
    "name": "Cross Warp",
    "glsl": "// Author: Eke Péter <peterekepeter@gmail.com>\n// License: MIT\n// Description: The outgoing image zooms in while the incoming one zooms out into place, sweeping from right to left\n// Tags: warp, zoom, horizontal\nvec4 transition(vec2 p) {\n  float x = progress;\n  x=smoothstep(.0,1.0,(x*2.0+p.x-1.0));\n  return mix(getFromColor((p-.5)*(1.-x)+.5), getToColor((p-.5)*x+.5), x);\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/CrossWarp.glsl",
      "license": "MIT"
    },
    "description": "The outgoing image zooms in while the incoming one zooms out into place, sweeping from right to left"
  },
  {
    "id": "gl:CrossZoom",
    "name": "Cross Zoom",
    "glsl": "// License: MIT\n// Author: rectalogic\n// Description: A crossfade through a strong zoom blur\n// Tags: zoom, blur, blend\n// ported by gre from https://gist.github.com/rectalogic/b86b90161503a0023231\n\n// Converted from https://github.com/rectalogic/rendermix-basic-effects/blob/master/assets/com/rendermix/CrossZoom/CrossZoom.frag\n// Which is based on https://github.com/evanw/glfx.js/blob/master/src/filters/blur/zoomblur.js\n// With additional easing functions from https://github.com/rectalogic/rendermix-basic-effects/blob/master/assets/com/rendermix/Easing/Easing.glsllib\n\n// @range(0, 1) Blur strength\nuniform float strength; // = 0.4\n\nconst float PI = 3.141592653589793;\n\nfloat Linear_ease(in float begin, in float change, in float duration, in float time) {\n    return change * time / duration + begin;\n}\n\nfloat Exponential_easeInOut(in float begin, in float change, in float duration, in float time) {\n    if (time == 0.0)\n        return begin;\n    else if (time == duration)\n        return begin + change;\n    time = time / (duration / 2.0);\n    if (time < 1.0)\n        return change / 2.0 * pow(2.0, 10.0 * (time - 1.0)) + begin;\n    return change / 2.0 * (-pow(2.0, -10.0 * (time - 1.0)) + 2.0) + begin;\n}\n\nfloat Sinusoidal_easeInOut(in float begin, in float change, in float duration, in float time) {\n    return -change / 2.0 * (cos(PI * time / duration) - 1.0) + begin;\n}\n\nfloat rand (vec2 co) {\n  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);\n}\n\nvec4 crossFade(in vec2 uv, in float dissolve) {\n    return mix(getFromColor(uv), getToColor(uv), dissolve);\n}\n\nvec4 transition(vec2 uv) {\n    vec2 texCoord = uv.xy / vec2(1.0).xy;\n\n    // Linear interpolate center across center half of the image\n    vec2 center = vec2(Linear_ease(0.25, 0.5, 1.0, progress), 0.5);\n    float dissolve = Exponential_easeInOut(0.0, 1.0, 1.0, progress);\n\n    // Mirrored sinusoidal loop. 0->strength then strength->0\n    float strength = Sinusoidal_easeInOut(0.0, strength, 0.5, progress);\n\n    vec4 color = vec4(0.0);\n    float total = 0.0;\n    vec2 toCenter = center - texCoord;\n\n    /* randomize the lookup values to hide the fixed number of samples */\n    float offset = rand(uv);\n\n    for (float t = 0.0; t <= 40.0; t++) {\n        float percent = (t + offset) / 40.0;\n        float weight = 4.0 * (percent - percent * percent);\n        color += crossFade(texCoord + toCenter * percent * strength, dissolve) * weight;\n        total += weight;\n    }\n    return color / total;\n}\n",
    "parameters": {
      "strength": {
        "type": "float",
        "default": 0.4
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/CrossZoom.glsl",
      "license": "MIT"
    },
    "description": "A crossfade through a strong zoom blur"
  },
  {
    "id": "gl:Directional",
    "name": "Directional",
    "glsl": "// Author: Gaëtan Renaudeau\n// License: MIT\n// Description: The incoming image pushes the outgoing one out in a given direction\n// Tags: slide, push, directional\n\n// @param Direction of the movement\nuniform vec2 direction; // = vec2(0.0, 1.0)\n\nvec4 transition (vec2 uv) {\n  vec2 p = uv + progress * sign(direction);\n  vec2 f = fract(p);\n  return mix(\n    getToColor(f),\n    getFromColor(f),\n    step(0.0, p.y) * step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0)\n  );\n}\n",
    "parameters": {
      "direction": {
        "type": "vec2",
        "default": [
          0.0,
          1.0
        ]
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Directional.glsl",
      "license": "MIT"
    },
    "description": "The incoming image pushes the outgoing one out in a given direction"
  },
  {
    "id": "gl:DirectionalWarp",
    "name": "Directional Warp",
    "glsl": "// Author: pschroen\n// License: MIT\n// Description: A diagonal wipe with a warped, smeared edge\n// Tags: wipe, warp, directional\n\n// @param Softness of the edge\nuniform float smoothness; // = 0.1\n// @param Direction of the wipe\nuniform vec2 direction; // = vec2(-1.0, 1.0)\n\nconst vec2 center = vec2(0.5, 0.5);\n\nvec4 transition (vec2 uv) {\n  vec2 v = normalize(direction);\n  v /= abs(v.x) + abs(v.y);\n  float d = v.x * center.x + v.y * center.y;\n  float m = 1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness)));\n  return mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m);\n}\n",
    "parameters": {
      "smoothness": {
        "type": "float",
        "default": 0.1
      },
      "direction": {
        "type": "vec2",
        "default": [
          -1.0,
          1.0
        ]
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/DirectionalWarp.glsl",
      "license": "MIT"
    },
    "description": "A diagonal wipe with a warped, smeared edge"
  },
  {
    "id": "gl:DirectionalWipe",
    "name": "Directional Wipe",
    "glsl": "// Author: gre\n// License: MIT\n// Description: A soft-edged diagonal wipe\n// Tags: wipe, directional\n\n// @param Direction of the wipe\nuniform vec2 direction; // = vec2(1.0, -1.0)\n// @param Softness of the edge\nuniform float smoothness; // = 0.5\n \nconst vec2 center = vec2(0.5, 0.5);\n \nvec4 transition (vec2 uv) {\n  vec2 v = normalize(direction);\n  v /= abs(v.x)+abs(v.y);\n  float d = v.x * center.x + v.y * center.y;\n  float m =\n    (1.0-step(progress, 0.0)) * // there is something wrong with our formula that makes m not equals 0.0 with progress is 0.0\n    (1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d-0.5+progress*(1.+smoothness))));\n  return mix(getFromColor(uv), getToColor(uv), m);\n}\n",
    "parameters": {
      "direction": {
        "type": "vec2",
        "default": [
          1.0,
          -1.0
        ]
      },
      "smoothness": {
        "type": "float",
        "default": 0.5
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/DirectionalWipe.glsl",
      "license": "MIT"
    },
    "description": "A soft-edged diagonal wipe"
  },
  {
    "id": "gl:Dreamy",
    "name": "Dreamy",
    "glsl": "// Author: mikolalysenko\n// License: MIT\n// Description: A crossfade with a gentle wavy distortion\n// Tags: wave, blend\n\nvec2 offset(float progress, float x, float theta) {\n  float phase = progress*progress + progress + theta;\n  float shifty = 0.03*progress*cos(10.0*(progress+x));\n  return vec2(0, shifty);\n}\nvec4 transition(vec2 p) {\n  return mix(getFromColor(p + offset(progress, p.x, 0.0)), getToColor(p + offset(1.0-progress, p.x, 3.14)), progress);\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Dreamy.glsl",
      "license": "MIT"
    },
    "description": "A crossfade with a gentle wavy distortion"
  },
  {
    "id": "gl:DreamyZoom",
    "name": "Dreamy Zoom",
    "glsl": "// Author: Zeh Fernando\n// License: MIT\n// Description: Zooms and rotates into a bright flash, then out to the incoming image\n// Tags: zoom, rotate, flash\n\n// Definitions --------\n#define DEG2RAD 0.03926990816987241548078304229099 // 1/180*PI\n\n\n// Transition parameters --------\n\n// In degrees\nuniform float rotation; // = 6\n\n// Multiplier\nuniform float scale; // = 1.2\n\n\n// The code proper --------\n\nvec4 transition(vec2 uv) {\n  // Massage parameters\n  float phase = progress < 0.5 ? progress * 2.0 : (progress - 0.5) * 2.0;\n  float angleOffset = progress < 0.5 ? mix(0.0, rotation * DEG2RAD, phase) : mix(-rotation * DEG2RAD, 0.0, phase);\n  float newScale = progress < 0.5 ? mix(1.0, scale, phase) : mix(scale, 1.0, phase);\n  \n  vec2 center = vec2(0, 0);\n\n  // Calculate the source point\n  vec2 assumedCenter = vec2(0.5, 0.5);\n  vec2 p = (uv.xy - vec2(0.5, 0.5)) / newScale * vec2(ratio, 1.0);\n\n  // This can probably be optimized (with distance())\n  float angle = atan(p.y, p.x) + angleOffset;\n  float dist = distance(center, p);\n  p.x = cos(angle) * dist / ratio + 0.5;\n  p.y = sin(angle) * dist + 0.5;\n  vec4 c = progress < 0.5 ? getFromColor(p) : getToColor(p);\n\n  // Finally, apply the color\n  // The flash lights up the image, not the transparent areas around it.\n  return vec4(c.rgb + (progress < 0.5 ? mix(0.0, 1.0, phase) : mix(1.0, 0.0, phase)), c.a);\n}\n",
    "parameters": {
      "rotation": {
        "type": "float",
        "default": 6.0
      },
      "scale": {
        "type": "float",
        "default": 1.2
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/DreamyZoom.glsl",
      "license": "MIT"
    },
    "description": "Zooms and rotates into a bright flash, then out to the incoming image"
  },
  {
    "id": "gl:Fade",
    "name": "Fade",
    "glsl": "// Author: gre\n// License: MIT\n// Description: A linear crossfade between the two images\n// Tags: fade, blend\n\nvec4 transition (vec2 uv) {\n  return mix(\n    getFromColor(uv),\n    getToColor(uv),\n    progress\n  );\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Fade.glsl",
      "license": "MIT"
    },
    "description": "A linear crossfade between the two images"
  },
  {
    "id": "gl:FilmBurn",
    "name": "Film Burn",
    "glsl": "// Author: Anastasia Dunbar\n// License: MIT\n// Description: Glowing film-burn light leaks wash over the image and reveal the incoming one\n// Tags: burn, film, light-leak\n// @param Random seed\nuniform float Seed; // = 2.31\nfloat sigmoid(float x, float a) {\n    float b = pow(x*2.,a)/2.;\n    if (x > .5) {\n        b = 1.-pow(2.-(x*2.),a)/2.;\n    }\n\treturn b;\n}\nfloat rand(float co){\n    return fract(sin((co*24.9898)+Seed)*43758.5453);\n}\nfloat rand(vec2 co){\n    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);\n}\nfloat apow(float a,float b) { return pow(abs(a),b)*sign(b); }\nvec3 pow3(vec3 a,vec3 b) { return vec3(apow(a.r,b.r),apow(a.g,b.g),apow(a.b,b.b)); }\nfloat smooth_mix(float a,float b,float c) { return mix(a,b,sigmoid(c,2.)); }\nfloat random(vec2 co, float shft){\n    co += 10.;\n    return smooth_mix(fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft)*.5),78.233+Seed))) * 43758.5453),fract(sin(dot(co.xy ,vec2(12.9898+(floor(shft+1.)*.5),78.233+Seed))) * 43758.5453),fract(shft));\n}\nfloat smooth_random(vec2 co, float shft) {\n\treturn smooth_mix(smooth_mix(random(floor(co),shft),random(floor(co+vec2(1.,0.)),shft),fract(co.x)),smooth_mix(random(floor(co+vec2(0.,1.)),shft),random(floor(co+vec2(1.,1.)),shft),fract(co.x)),fract(co.y));\n}\nvec4 blendedColor(vec2 p) {\n    return mix(getFromColor(p), getToColor(p), sigmoid(progress,10.));\n}\n#define pi 3.14159265358979323\n#define clamps(x) clamp(x,0.,1.)\n\nvec4 transition(vec2 p) {\n  vec3 f = vec3(0.);\n  for (float i = 0.; i < 13.; i++) {\n    f += sin(((p.x*rand(i)*6.)+(progress*8.))+rand(i+1.43))*sin(((p.y*rand(i+4.4)*6.)+(progress*6.))+rand(i+2.4));\n    f += 1.-clamps(length(p-vec2(smooth_random(vec2(progress*1.3),i+1.),smooth_random(vec2(progress*.5),i+6.25)))*mix(20.,70.,rand(i)));\n  }\n  f += 4.;\n  f /= 11.;\n  f = pow3(f*vec3(1.,0.7,0.6),vec3(1.,2.-sin(progress*pi),1.3));\n  f *= sin(progress*pi);\n  \n  p -= .5;\n  p *= 1.+(smooth_random(vec2(progress*5.),6.3)*sin(progress*pi)*.05);\n  p += .5;\n  \n  vec4 blurred_image = vec4(0.);\n  float bluramount = sin(progress*pi)*.03;\n  #define repeats  50.\n  for (float i = 0.; i < repeats; i++) { \n      vec2 q = vec2(cos(degrees((i/repeats)*360.)),sin(degrees((i/repeats)*360.))) *  (rand(vec2(i,p.x+p.y))+bluramount); \n      vec2 uv2 = p+(q*bluramount);\n      blurred_image += blendedColor(uv2);\n  }\n  blurred_image /= repeats;\n  \n  return blurred_image+vec4(f,0.);\n}\n",
    "parameters": {
      "Seed": {
        "type": "float",
        "default": 2.31
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/FilmBurn.glsl",
      "license": "MIT"
    },
    "description": "Glowing film-burn light leaks wash over the image and reveal the incoming one"
  },
  {
    "id": "gl:GlitchDisplace",
    "name": "Glitch Displace",
    "glsl": "// Author: Matt DesLauriers\n// License: MIT\n// Description: Blocks of the image are displaced in a glitch that flashes into the incoming image\n// Tags: glitch, displace\n\nfloat random(vec2 co)\n{\n    float a = 12.9898;\n    float b = 78.233;\n    float c = 43758.5453;\n    float dt= dot(co.xy ,vec2(a,b));\n    float sn= mod(dt,3.14);\n    return fract(sin(sn) * c);\n}\nfloat voronoi( in vec2 x ) {\n    vec2 p = floor( x );\n    vec2 f = fract( x );\n    float res = 8.0;\n    for( float j=-1.; j<=1.; j++ )\n    for( float i=-1.; i<=1.; i++ ) {\n        vec2  b = vec2( i, j );\n        vec2  r = b - f + random( p + b );\n        float d = dot( r, r );\n        res = min( res, d );\n    }\n    return sqrt( res );\n}\n\nvec2 displace(vec4 tex, vec2 texCoord, float dotDepth, float textureDepth, float strength) {\n    float b = voronoi(.003 * texCoord + 2.0);\n    float g = voronoi(0.2 * texCoord);\n    float r = voronoi(texCoord - 1.0);\n    vec4 dt = tex * 1.0;\n    vec4 dis = dt * dotDepth + 1.0 - tex * textureDepth;\n\n    dis.x = dis.x - 1.0 + textureDepth*dotDepth;\n    dis.y = dis.y - 1.0 + textureDepth*dotDepth;\n    dis.x *= strength;\n    dis.y *= strength;\n    vec2 res_uv = texCoord ;\n    res_uv.x = res_uv.x + dis.x - 0.0;\n    res_uv.y = res_uv.y + dis.y;\n    return res_uv;\n}\n\nfloat ease1(float t) {\n  return t == 0.0 || t == 1.0\n    ? t\n    : t < 0.5\n      ? +0.5 * pow(2.0, (20.0 * t) - 10.0)\n      : -0.5 * pow(2.0, 10.0 - (t * 20.0)) + 1.0;\n}\nfloat ease2(float t) {\n  return t == 1.0 ? t : 1.0 - pow(2.0, -10.0 * t);\n}\n\n\n\nvec4 transition(vec2 uv) {\n  vec2 p = uv.xy / vec2(1.0).xy;\n  vec4 color1 = getFromColor(p);\n  vec4 color2 = getToColor(p);\n  vec2 disp = displace(color1, p, 0.33, 0.7, 1.0-ease1(progress));\n  vec2 disp2 = displace(color2, p, 0.33, 0.5, ease2(progress));\n  vec4 dColor1 = getToColor(disp);\n  vec4 dColor2 = getFromColor(disp2);\n  float val = ease1(progress);\n  vec3 gray = vec3(dot(min(dColor2, dColor1).rgb, vec3(0.299, 0.587, 0.114)));\n  dColor2 = vec4(gray * 2.0, dColor2.a);\n  color1 = mix(color1, dColor2, smoothstep(0.0, 0.5, progress));\n  color2 = mix(color2, dColor1, smoothstep(1.0, 0.5, progress));\n  return mix(color1, color2, val);\n  //gl_FragColor = mix(gl_FragColor, dColor, smoothstep(0.0, 0.5, progress));\n\n   //gl_FragColor = mix(texture2D(from, p), texture2D(to, p), progress);\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/GlitchDisplace.glsl",
      "license": "MIT"
    },
    "description": "Blocks of the image are displaced in a glitch that flashes into the incoming image"
  },
  {
    "id": "gl:GlitchMemories",
    "name": "Glitch Memories",
    "glsl": "// Author: Gunnar Roth\n// based on work from natewave\n// License: MIT\n// Description: A crossfade with glitchy, color-shifted blocks\n// Tags: glitch, chromatic, blend\nvec4 transition(vec2 p) {\n  vec2 block = floor(p.xy / vec2(16));\n  vec2 uv_noise = block / vec2(64);\n  uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64);\n  vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 *(1.0 -progress) : vec2(0.0);\n  vec2 red = p + dist * 0.2;\n  vec2 green = p + dist * .3;\n  vec2 blue = p + dist * .5;\n\n  vec4 center = mix(getFromColor(green), getToColor(green), progress);\n  return vec4(mix(getFromColor(red), getToColor(red), progress).r, center.g, mix(getFromColor(blue), getToColor(blue), progress).b, center.a);\n}\n\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/GlitchMemories.glsl",
      "license": "MIT"
    },
    "description": "A crossfade with glitchy, color-shifted blocks"
  },
  {
    "id": "gl:GridFlip",
    "name": "Grid Flip",
    "glsl": "// License: MIT\n// Author: TimDonselaar\n// Description: The image splits into a grid of tiles that flip one by one to the incoming image\n// Tags: grid, tiles, flip\n// ported by gre from https://gist.github.com/TimDonselaar/9bcd1c4b5934ba60087bdb55c2ea92e5\n\n// @param Number of tiles (columns, rows)\nuniform ivec2 size; // = ivec2(4)\nuniform float pause; // = 0.1\nuniform float dividerWidth; // = 0.05\n// @color Color behind the tiles\nuniform vec4 bgcolor; // = vec4(0.0, 0.0, 0.0, 1.0)\nuniform float randomness; // = 0.1\n \nfloat rand (vec2 co) {\n  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);\n}\n\nfloat getDelta(vec2 p) {\n  vec2 rectanglePos = floor(vec2(size) * p);\n  vec2 rectangleSize = vec2(1.0 / vec2(size).x, 1.0 / vec2(size).y);\n  float top = rectangleSize.y * (rectanglePos.y + 1.0);\n  float bottom = rectangleSize.y * rectanglePos.y;\n  float left = rectangleSize.x * rectanglePos.x;\n  float right = rectangleSize.x * (rectanglePos.x + 1.0);\n  float minX = min(abs(p.x - left), abs(p.x - right));\n  float minY = min(abs(p.y - top), abs(p.y - bottom));\n  return min(minX, minY);\n}\n\nfloat getDividerSize() {\n  vec2 rectangleSize = vec2(1.0 / vec2(size).x, 1.0 / vec2(size).y);\n  return min(rectangleSize.x, rectangleSize.y) * dividerWidth;\n}\n\nvec4 transition(vec2 p) {\n  if(progress < pause) {\n    float currentProg = progress / pause;\n    float a = 1.0;\n    if(getDelta(p) < getDividerSize()) {\n      a = 1.0 - currentProg;\n    }\n    return mix(bgcolor, getFromColor(p), a);\n  }\n  else if(progress < 1.0 - pause){\n    if(getDelta(p) < getDividerSize()) {\n      return bgcolor;\n    } else {\n      float currentProg = (progress - pause) / (1.0 - pause * 2.0);\n      vec2 q = p;\n      vec2 rectanglePos = floor(vec2(size) * q);\n      \n      float r = rand(rectanglePos) - randomness;\n      float cp = smoothstep(0.0, 1.0 - r, currentProg);\n    \n      float rectangleSize = 1.0 / vec2(size).x;\n      float delta = rectanglePos.x * rectangleSize;\n      float offset = rectangleSize / 2.0 + delta;\n      \n      p.x = (p.x - offset)/abs(cp - 0.5)*0.5 + offset;\n      vec4 a = getFromColor(p);\n      vec4 b = getToColor(p);\n      \n      float s = step(abs(vec2(size).x * (q.x - delta) - 0.5), abs(cp - 0.5));\n      return mix(bgcolor, mix(b, a, step(cp, 0.5)), s);\n    }\n  }\n  else {\n    float currentProg = (progress - 1.0 + pause) / pause;\n    float a = 1.0;\n    if(getDelta(p) < getDividerSize()) {\n      a = currentProg;\n    }\n    return mix(bgcolor, getToColor(p), a);\n  }\n}\n",
    "parameters": {
      "size": {
        "type": "ivec2",
        "default": [
          4.0,
          4.0
        ]
      },
      "pause": {
        "type": "float",
        "default": 0.1
      },
      "dividerWidth": {
        "type": "float",
        "default": 0.05
      },
      "bgcolor": {
        "type": "vec4",
        "default": [
          0.0,
          0.0,
          0.0,
          1.0
        ]
      },
      "randomness": {
        "type": "float",
        "default": 0.1
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/GridFlip.glsl",
      "license": "MIT"
    },
    "description": "The image splits into a grid of tiles that flip one by one to the incoming image"
  },
  {
    "id": "gl:InvertedPageCurl",
    "name": "Inverted Page Curl",
    "glsl": "// Author: Hewlett-Packard\n// License: BSD 3 Clause\n// Description: The outgoing image curls away like a page, revealing the incoming one\n// Tags: page, curl, 3d\n// Adapted by Sergey Kosarevsky from:\n// http://rectalogic.github.io/webvfx/examples_2transition-shader-pagecurl_8html-example.html\n\n/*\nCopyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are\nmet:\n\n   * Redistributions of source code must retain the above copyright\n     notice, this list of conditions and the following disclaimer.\n   * Redistributions in binary form must reproduce the above\n     copyright notice, this list of conditions and the following disclaimer\n     in the documentation and/or other materials provided with the\n     distribution.\n   * Neither the name of Hewlett-Packard nor the names of its\n     contributors may be used to endorse or promote products derived from\n     this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS\n\"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT\nLIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\nA PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT\nOWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,\nSPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\nLIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\nDATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY\nTHEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\nOF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\nin vec2 texCoord;\n*/\n\nconst float MIN_AMOUNT = -0.16;\nconst float MAX_AMOUNT = 1.5;\n\nconst float PI = 3.141592653589793;\n\nconst float scale = 512.0;\nconst float sharpness = 3.0;\n\nconst float cylinderRadius = 1.0 / PI / 2.0;\n\n// These depend on the progress uniform and must be computed per-fragment.\n// Global initializers with uniforms are invalid in GLSL ES and fail on Mesa.\nfloat amount;\nfloat cylinderCenter;\nfloat cylinderAngle;\n\nvec3 hitPoint(float hitAngle, float yc, vec3 point, mat3 rrotation)\n{\n        float hitPoint = hitAngle / (2.0 * PI);\n        point.y = hitPoint;\n        return rrotation * point;\n}\n\nvec4 antiAlias(vec4 color1, vec4 color2, float distanc)\n{\n        distanc *= scale;\n        if (distanc < 0.0) return color2;\n        if (distanc > 2.0) return color1;\n        float dd = pow(1.0 - distanc / 2.0, sharpness);\n        return ((color2 - color1) * dd) + color1;\n}\n\nfloat distanceToEdge(vec3 point)\n{\n        float dx = abs(point.x > 0.5 ? 1.0 - point.x : point.x);\n        float dy = abs(point.y > 0.5 ? 1.0 - point.y : point.y);\n        if (point.x < 0.0) dx = -point.x;\n        if (point.x > 1.0) dx = point.x - 1.0;\n        if (point.y < 0.0) dy = -point.y;\n        if (point.y > 1.0) dy = point.y - 1.0;\n        if ((point.x < 0.0 || point.x > 1.0) && (point.y < 0.0 || point.y > 1.0)) return sqrt(dx * dx + dy * dy);\n        return min(dx, dy);\n}\n\nvec4 seeThrough(float yc, vec2 p, mat3 rotation, mat3 rrotation)\n{\n        float hitAngle = PI - (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) - cylinderAngle);\n        vec3 point = hitPoint(hitAngle, yc, rotation * vec3(p, 1.0), rrotation);\n        if (yc <= 0.0 && (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0))\n        {\n            return getToColor(p);\n        }\n\n        if (yc > 0.0) return getFromColor(p);\n\n        vec4 color = getFromColor(point.xy);\n        vec4 tcolor = vec4(0.0);\n\n        return antiAlias(color, tcolor, distanceToEdge(point));\n}\n\nvec4 seeThroughWithShadow(float yc, vec2 p, vec3 point, mat3 rotation, mat3 rrotation)\n{\n        float shadow = distanceToEdge(point) * 30.0;\n        shadow = (1.0 - shadow) / 3.0;\n\n        if (shadow < 0.0) shadow = 0.0; else shadow *= amount;\n\n        vec4 shadowColor = seeThrough(yc, p, rotation, rrotation);\n        shadowColor.r -= shadow;\n        shadowColor.g -= shadow;\n        shadowColor.b -= shadow;\n\n        return shadowColor;\n}\n\nvec4 backside(float yc, vec3 point)\n{\n        vec4 color = getFromColor(point.xy);\n        float gray = (color.r + color.b + color.g) / 15.0;\n        gray += (8.0 / 10.0) * (pow(max(0.0, 1.0 - abs(yc / cylinderRadius)), 2.0 / 10.0) / 2.0 + (5.0 / 10.0));\n        color.rgb = vec3(gray);\n        return color;\n}\n\nvec4 behindSurface(vec2 p, float yc, vec3 point, mat3 rrotation)\n{\n        float safeAmount = amount >= 0.0 ? max(amount, 1e-4) : min(amount, -1e-4);\n        float shado = (1.0 - ((-cylinderRadius - yc) / safeAmount * 7.0)) / 6.0;\n        shado *= 1.0 - abs(point.x - 0.5);\n\n        yc = (-cylinderRadius - cylinderRadius - yc);\n\n        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;\n        point = hitPoint(hitAngle, yc, point, rrotation);\n\n        if (yc < 0.0 && point.x >= 0.0 && point.y >= 0.0 && point.x <= 1.0 && point.y <= 1.0 && (hitAngle < PI || amount > 0.5))\n        {\n                float dx = point.x - 0.5;\n                float dy = point.y - 0.5;\n                shado = 1.0 - (sqrt(dx * dx + dy * dy) / (71.0 / 100.0));\n                float nyc = -yc / cylinderRadius;\n                shado *= nyc * nyc * nyc;\n                shado *= 0.5;\n        }\n        else\n        {\n                shado = 0.0;\n        }\n        vec4 to = getToColor(p);\n        return vec4(to.rgb - shado, to.a);\n}\n\nvec4 transition(vec2 p) {\n  amount = progress * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;\n  cylinderCenter = amount;\n  cylinderAngle = 2.0 * PI * amount;\n\n  const float angle = 100.0 * PI / 180.0;\n        float c = cos(-angle);\n        float s = sin(-angle);\n\n        mat3 rotation = mat3( c, s, 0,\n                                                                -s, c, 0,\n                                                                -0.801, 0.8900, 1\n                                                                );\n        c = cos(angle);\n        s = sin(angle);\n\n        mat3 rrotation = mat3(\tc, s, 0,\n                                                                        -s, c, 0,\n                                                                        0.98500, 0.985, 1\n                                                                );\n\n        vec3 point = rotation * vec3(p, 1.0);\n\n        float yc = point.y - cylinderCenter;\n\n        if (yc < -cylinderRadius)\n        {\n                // Behind surface\n                return behindSurface(p,yc, point, rrotation);\n        }\n\n        if (yc > cylinderRadius)\n        {\n                // Flat surface\n                return getFromColor(p);\n        }\n\n        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;\n\n        float hitAngleMod = mod(hitAngle, 2.0 * PI);\n        if ((hitAngleMod > PI && amount < 0.5) || (hitAngleMod > PI/2.0 && amount < 0.0))\n        {\n                return seeThrough(yc, p, rotation, rrotation);\n        }\n\n        point = hitPoint(hitAngle, yc, point, rrotation);\n\n        if (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0)\n        {\n                return seeThroughWithShadow(yc, p, point, rotation, rrotation);\n        }\n\n        vec4 color = backside(yc, point);\n\n        vec4 otherColor;\n        if (yc < 0.0)\n        {\n                float dx2 = point.x - 0.5;\n                float dy2 = point.y - 0.5;\n                float shado = 1.0 - (sqrt(dx2 * dx2 + dy2 * dy2) / 0.71);\n                float nyc2 = -yc / cylinderRadius;\n                shado *= nyc2 * nyc2 * nyc2;\n                shado *= 0.5;\n                otherColor = vec4(0.0, 0.0, 0.0, shado * getToColor(p).a); // a shadow on the incoming image\n        }\n        else\n        {\n                otherColor = getFromColor(p);\n        }\n\n        color = antiAlias(color, otherColor, cylinderRadius - abs(yc));\n\n        vec4 cl = seeThroughWithShadow(yc, p, point, rotation, rrotation);\n        float dist = distanceToEdge(point);\n\n        return antiAlias(color, cl, dist);\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/InvertedPageCurl.glsl",
      "license": "BSD 3 Clause"
    },
    "description": "The outgoing image curls away like a page, revealing the incoming one"
  },
  {
    "id": "gl:Morph",
    "name": "Morph",
    "glsl": "// Author: paniq\n// License: MIT\n// Description: A crossfade in which each image is displaced by the other's colors, like a morph\n// Tags: morph, distort, blend\n// @param Strength of the displacement\nuniform float strength; // = 0.1\n\nvec4 transition(vec2 p) {\n  vec4 ca = getFromColor(p);\n  vec4 cb = getToColor(p);\n  \n  vec2 oa = (((ca.rg+ca.b)*0.5)*2.0-1.0);\n  vec2 ob = (((cb.rg+cb.b)*0.5)*2.0-1.0);\n  vec2 oc = mix(oa,ob,0.5)*strength;\n  \n  float w0 = progress;\n  float w1 = 1.0-w0;\n  return mix(getFromColor(p+oc*w0), getToColor(p-oc*w1), progress);\n}\n",
    "parameters": {
      "strength": {
        "type": "float",
        "default": 0.1
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Morph.glsl",
      "license": "MIT"
    },
    "description": "A crossfade in which each image is displaced by the other's colors, like a morph"
  },
  {
    "id": "gl:Pixelize",
    "name": "Pixelize",
    "glsl": "// Author: gre\n// License: MIT\n// Description: Both images pixelate, crossfade, then sharpen again\n// Tags: pixelate, blend\n// forked from https://gist.github.com/benraziel/c528607361d90a072e98\n\n// minimum number of squares (when the effect is at its higher level)\n// @param Number of squares at the strongest pixelation\nuniform ivec2 squaresMin; // = ivec2(20)\n// zero disable the stepping\n// @param Number of pixelation steps; 0 for a continuous effect\nuniform int steps; // = 50\n\nvec4 transition(vec2 uv) {\n  float d = min(progress, 1.0 - progress);\n  float dist = steps>0 ? ceil(d * float(steps)) / float(steps) : d;\n  vec2 squareSize = 2.0 * dist / vec2(squaresMin);\n  vec2 p = dist>0.0 ? (floor(uv / squareSize) + 0.5) * squareSize : uv;\n  return mix(getFromColor(p), getToColor(p), progress);\n}\n",
    "parameters": {
      "squaresMin": {
        "type": "ivec2",
        "default": [
          20.0,
          20.0
        ]
      },
      "steps": {
        "type": "int",
        "default": 50
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Pixelize.glsl",
      "license": "MIT"
    },
    "description": "Both images pixelate, crossfade, then sharpen again"
  },
  {
    "id": "gl:PolkaDotsCurtain",
    "name": "Polka Dots Curtain",
    "glsl": "// Author: bobylito\n// License: MIT\n// Description: The incoming image appears through growing polka dots\n// Tags: dots, pattern\nconst float SQRT_2 = 1.414213562373;\n// @param Number of dots across the image\nuniform float dots; // = 20.0\nuniform vec2 center; // = vec2(0, 0)\n\nvec4 transition(vec2 uv) {\n  bool nextImage = distance(fract(uv * dots), vec2(0.5, 0.5)) < ( progress / distance(uv, center));\n  return nextImage ? getToColor(uv) : getFromColor(uv);\n}\n",
    "parameters": {
      "dots": {
        "type": "float",
        "default": 20.0
      },
      "center": {
        "type": "vec2",
        "default": [
          0.0,
          0.0
        ]
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/PolkaDotsCurtain.glsl",
      "license": "MIT"
    },
    "description": "The incoming image appears through growing polka dots"
  },
  {
    "id": "gl:Ripple",
    "name": "Ripple",
    "glsl": "// Author: gre\n// License: MIT\n// Description: Ripples spread from the center while crossfading\n// Tags: ripple, wave, blend\n// @param Frequency of the ripples\nuniform float amplitude; // = 100.0\n// @param Speed of the ripples\nuniform float speed; // = 50.0\n\nvec4 transition (vec2 uv) {\n  vec2 dir = uv - vec2(.5);\n  float dist = length(dir);\n  vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + .5) / 30. * progress;\n  return mix(\n    getFromColor(uv + offset),\n    getToColor(uv),\n    smoothstep(0.2, 1.0, progress)\n  );\n}\n",
    "parameters": {
      "amplitude": {
        "type": "float",
        "default": 100.0
      },
      "speed": {
        "type": "float",
        "default": 50.0
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Ripple.glsl",
      "license": "MIT"
    },
    "description": "Ripples spread from the center while crossfading"
  },
  {
    "id": "gl:SimpleZoom",
    "name": "Simple Zoom",
    "glsl": "// Author: 0gust1\n// License: MIT\n// Description: Zooms into the outgoing image, then fades to the incoming one\n// Tags: zoom, fade\n\n// @range(0.2, 1) Part of the transition spent zooming\nuniform float zoom_quickness; // = 0.8\nvec2 zoom(vec2 uv, float amount) {\n  return 0.5 + ((uv - 0.5) * (1.0-amount));\t\n}\n\nvec4 transition (vec2 uv) {\n  float nQuick = clamp(zoom_quickness,0.2,1.0);\n  return mix(\n    getFromColor(zoom(uv, smoothstep(0.0, nQuick, progress))),\n    getToColor(uv),\n   smoothstep(nQuick-0.2, 1.0, progress)\n  );\n}",
    "parameters": {
      "zoom_quickness": {
        "type": "float",
        "default": 0.8
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/SimpleZoom.glsl",
      "license": "MIT"
    },
    "description": "Zooms into the outgoing image, then fades to the incoming one"
  },
  {
    "id": "gl:SimpleZoomOut",
    "name": "Simple Zoom Out",
    "glsl": "// Author: Tianshuo\n// License: MIT\n// Description: The incoming image zooms out into place while fading in\n// Tags: zoom, fade\n\n\n// @range(0.2, 1) Part of the transition spent zooming\nuniform float zoom_quickness; // = 0.8\n// @param Fade instead of cutting to the incoming image\nuniform bool fade; // = true\nvec2 zoom(vec2 uv, float amount) {\n  return 0.5 + ((uv - 0.5) * (1.0-amount));\t\n}\n\nvec4 transition (vec2 uv) {\n  float nQuick = clamp(zoom_quickness,0.2,1.0);\n  return mix(\n    getFromColor(uv),\n    getToColor(zoom(uv,1.-smoothstep(1.-nQuick, 1., progress))),\n   fade?smoothstep(1.0-nQuick, 1., progress):(progress<1.0-nQuick?0.0:1.0)\n  );\n}\n",
    "parameters": {
      "zoom_quickness": {
        "type": "float",
        "default": 0.8
      },
      "fade": {
        "type": "bool",
        "default": true
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/SimpleZoomOut.glsl",
      "license": "MIT"
    },
    "description": "The incoming image zooms out into place while fading in"
  },
  {
    "id": "gl:StereoViewer",
    "name": "Stereo Viewer",
    "glsl": "// Tunable parameters\n// How much to zoom (out) for the effect ~ 0.5 - 1.0\n// @range(0.5, 1) How much the images zoom out\nuniform float zoom; // = 0.88\n// Corner radius as a fraction of the image height\nuniform float corner_radius;  // = 0.22\n\n// Author: Ted Schundler\n// License: BSD 2 Clause\n// Description: Both images shrink into rounded cards that swap, like a stereo viewer toy\n// Tags: cards, zoom, retro\n// Free for use and modification by anyone with credit\n\n// Copyright (c) 2016, Theodore K Schundler\n// All rights reserved.\n\n// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\n// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\n// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n\n///////////////////////////////////////////////////////////////////////////////\n// Stereo Viewer Toy Transition                                              //\n//                                                                           //\n// Inspired by ViewMaster / Image3D image viewer devices.                    //\n// This effect is similar to what you see when you press the device's lever. //\n// There is a quick zoom in / out to make the transition 'valid' for GLSL.io //\n///////////////////////////////////////////////////////////////////////////////\n\nconst vec4 black = vec4(0.0); // where no image is drawn: transparent\nconst vec2 c00 = vec2(0.0, 0.0); // the four corner points\nconst vec2 c01 = vec2(0.0, 1.0);\nconst vec2 c11 = vec2(1.0, 1.0);\nconst vec2 c10 = vec2(1.0, 0.0);\n\n// Check if a point is within a given corner\nbool in_corner(vec2 p, vec2 corner, vec2 radius) {\n  // determine the direction we want to be filled\n  vec2 axis = (c11 - corner) - corner;\n\n  // warp the point so we are always testing the bottom left point with the\n  // circle centered on the origin\n  p = p - (corner + axis * radius);\n  p *= axis / radius;\n  return (p.x > 0.0 && p.y > -1.0) || (p.y > 0.0 && p.x > -1.0) || dot(p, p) < 1.0;\n}\n\n// Check all four corners\n// return a float for v2 for anti-aliasing?\nbool test_rounded_mask(vec2 p, vec2 corner_size) {\n  return\n      in_corner(p, c00, corner_size) &&\n      in_corner(p, c01, corner_size) &&\n      in_corner(p, c10, corner_size) &&\n      in_corner(p, c11, corner_size);\n}\n\n// Screen blend mode - https://en.wikipedia.org/wiki/Blend_modes\n// This more closely approximates what you see than linear blending\nvec4 screen(vec4 a, vec4 b) {\n  return 1.0 - (1.0 - a) * (1.0 -b);\n}\n\n// Given RGBA, find a value that when screened with itself\n// will yield the original value.\nvec4 unscreen(vec4 c) {\n  return 1.0 - sqrt(1.0 - c);\n}\n\n// Grab a pixel, only if it isn't masked out by the rounded corners\nvec4 sample_with_corners_from(vec2 p, vec2 corner_size) {\n  p = (p - 0.5) / zoom + 0.5;\n  if (!test_rounded_mask(p, corner_size)) {\n    return black;\n  }\n  return unscreen(getFromColor(p));\n}\n\nvec4 sample_with_corners_to(vec2 p, vec2 corner_size) {\n  p = (p - 0.5) / zoom + 0.5;\n  if (!test_rounded_mask(p, corner_size)) {\n    return black;\n  }\n  return unscreen(getToColor(p));\n}\n\n// special sampling used when zooming - extra zoom parameter and don't unscreen\nvec4 simple_sample_with_corners_from(vec2 p, vec2 corner_size, float zoom_amt) {\n  p = (p - 0.5) / (1.0 - zoom_amt + zoom * zoom_amt) + 0.5;\n  if (!test_rounded_mask(p, corner_size)) {\n    return black;\n  }\n  return getFromColor(p);\n}\n\nvec4 simple_sample_with_corners_to(vec2 p, vec2 corner_size, float zoom_amt) {\n  p = (p - 0.5) / (1.0 - zoom_amt + zoom * zoom_amt) + 0.5;\n  if (!test_rounded_mask(p, corner_size)) {\n    return black;\n  }\n  return getToColor(p);\n}\n\n// Basic 2D affine transform matrix helpers\n// These really shouldn't be used in a fragment shader - I should work out the\n// the math for a translate & rotate function as a pair of dot products instead\n\nmat3 rotate2d(float angle, float ratio) {\n  float s = sin(angle);\n  float c = cos(angle);\n  return mat3(\n    c, s ,0.0,\n    -s, c, 0.0,\n    0.0, 0.0, 1.0);\n}\n\nmat3 translate2d(float x, float y) {\n  return mat3(\n    1.0, 0.0, 0,\n    0.0, 1.0, 0,\n    -x, -y, 1.0);\n}\n\nmat3 scale2d(float x, float y) {\n  return mat3(\n    x, 0.0, 0,\n    0.0, y, 0,\n    0, 0, 1.0);\n}\n\n// Split an image and rotate one up and one down along off screen pivot points\nvec4 get_cross_rotated(vec3 p3, float angle, vec2 corner_size, float ratio) {\n  angle = angle * angle; // easing\n  angle /= 2.4; // works out to be a good number of radians\n\n  mat3 center_and_scale = translate2d(-0.5, -0.5) * scale2d(1.0, ratio);\n  mat3 unscale_and_uncenter = scale2d(1.0, 1.0/ratio) * translate2d(0.5,0.5);\n  mat3 slide_left = translate2d(-2.0,0.0);\n  mat3 slide_right = translate2d(2.0,0.0);\n  mat3 rotate = rotate2d(angle, ratio);\n\n  mat3 op_a = center_and_scale * slide_right * rotate * slide_left * unscale_and_uncenter;\n  mat3 op_b = center_and_scale * slide_left * rotate * slide_right * unscale_and_uncenter;\n\n  vec4 a = sample_with_corners_from((op_a * p3).xy, corner_size);\n  vec4 b = sample_with_corners_from((op_b * p3).xy, corner_size);\n\n  return screen(a, b);\n}\n\n// Image stays put, but this time move two masks\nvec4 get_cross_masked(vec3 p3, float angle, vec2 corner_size, float ratio) {\n  angle = 1.0 - angle;\n  angle = angle * angle; // easing\n  angle /= 2.4;\n\n  vec4 img;\n\n  mat3 center_and_scale = translate2d(-0.5, -0.5) * scale2d(1.0, ratio);\n  mat3 unscale_and_uncenter = scale2d(1.0 / zoom, 1.0 / (zoom * ratio)) * translate2d(0.5,0.5);\n  mat3 slide_left = translate2d(-2.0,0.0);\n  mat3 slide_right = translate2d(2.0,0.0);\n  mat3 rotate = rotate2d(angle, ratio);\n\n  mat3 op_a = center_and_scale * slide_right * rotate * slide_left * unscale_and_uncenter;\n  mat3 op_b = center_and_scale * slide_left * rotate * slide_right * unscale_and_uncenter;\n\n  bool mask_a = test_rounded_mask((op_a * p3).xy, corner_size);\n  bool mask_b = test_rounded_mask((op_b * p3).xy, corner_size);\n\n  if (mask_a || mask_b) {\n    img = sample_with_corners_to(p3.xy, corner_size);\n    return screen(mask_a ? img : black, mask_b ? img : black);\n  } else {\n    return black;\n  }\n}\n\nvec4 transition(vec2 uv) {\n  float a;\n  vec2 p=uv.xy/vec2(1.0).xy;\n  vec3 p3 = vec3(p.xy, 1.0); // for 2D matrix transforms\n\n  // corner is warped to represent to size after mapping to 1.0, 1.0\n  vec2 corner_size = vec2(corner_radius / ratio, corner_radius);\n\n  if (progress <= 0.0) {\n    // 0.0: start with the base frame always\n    return getFromColor(p);\n  } else if (progress < 0.1) {\n    // 0.0-0.1: zoom out and add rounded corners\n    a = progress / 0.1;\n    return  simple_sample_with_corners_from(p, corner_size * a, a);\n  } else if (progress < 0.48) {\n    // 0.1-0.48: Split original image apart\n    a = (progress - 0.1)/0.38;\n    return get_cross_rotated(p3, a, corner_size, ratio);\n  } else if (progress < 0.9) {\n    // 0.48-0.52: black\n    // 0.52 - 0.9: unmask new image\n    return get_cross_masked(p3, (progress - 0.52)/0.38, corner_size, ratio);\n  } else if (progress < 1.0) {\n    // zoom out and add rounded corners\n    a = (1.0 - progress) / 0.1;\n    return simple_sample_with_corners_to(p, corner_size * a, a);\n  } else {\n    // 1.0 end with base frame\n    return getToColor(p);\n  }\n}\n",
    "parameters": {
      "zoom": {
        "type": "float",
        "default": 0.88
      },
      "corner_radius": {
        "type": "float",
        "default": 0.22
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/StereoViewer.glsl",
      "license": "BSD 2 Clause"
    },
    "description": "Both images shrink into rounded cards that swap, like a stereo viewer toy"
  },
  {
    "id": "gl:Swirl",
    "name": "Swirl",
    "glsl": "// License: MIT\n// Author: Sergey Kosarevsky\n// Description: Both images swirl around the center while crossfading\n// Tags: swirl, rotate, blend\n// ( http://www.linderdaum.com )\n// ported by gre from https://gist.github.com/corporateshark/cacfedb8cca0f5ce3f7c\n\nvec4 transition(vec2 UV)\n{\n\tfloat Radius = 1.0;\n\n\tfloat T = progress;\n\n\tUV -= vec2( 0.5, 0.5 );\n\n\tfloat Dist = length(UV);\n\n\tif ( Dist < Radius )\n\t{\n\t\tfloat Percent = (Radius - Dist) / Radius;\n\t\tfloat A = ( T <= 0.5 ) ? mix( 0.0, 1.0, T/0.5 ) : mix( 1.0, 0.0, (T-0.5)/0.5 );\n\t\tfloat Theta = Percent * Percent * A * 8.0 * 3.14159;\n\t\tfloat S = sin( Theta );\n\t\tfloat C = cos( Theta );\n\t\tUV = vec2( dot(UV, vec2(C, -S)), dot(UV, vec2(S, C)) );\n\t}\n\tUV += vec2( 0.5, 0.5 );\n\n\tvec4 C0 = getFromColor(UV);\n\tvec4 C1 = getToColor(UV);\n\n\treturn mix( C0, C1, T );\n}\n",
    "parameters": {},
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Swirl.glsl",
      "license": "MIT"
    },
    "description": "Both images swirl around the center while crossfading"
  },
  {
    "id": "gl:WaterDrop",
    "name": "Water Drop",
    "glsl": "// Author: Paweł Płóciennik\n// License: MIT\n// Description: Ripples spread from the center like a drop falling into water, crossfading to the incoming image\n// Tags: ripple, water, blend\n// @param Frequency of the ripples\nuniform float amplitude; // = 30\n// @param Speed of the ripples\nuniform float speed; // = 30\n\nvec4 transition(vec2 p) {\n  vec2 dir = p - vec2(.5);\n  float dist = length(dir);\n\n  if (dist > progress) {\n    return mix(getFromColor( p), getToColor( p), progress);\n  } else {\n    vec2 offset = dir * sin(dist * amplitude - progress * speed);\n    return mix(getFromColor( p + offset), getToColor( p), progress);\n  }\n}\n",
    "parameters": {
      "amplitude": {
        "type": "float",
        "default": 30.0
      },
      "speed": {
        "type": "float",
        "default": 30.0
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/WaterDrop.glsl",
      "license": "MIT"
    },
    "description": "Ripples spread from the center like a drop falling into water, crossfading to the incoming image"
  },
  {
    "id": "gl:Wind",
    "name": "Wind",
    "glsl": "// Author: gre\n// License: MIT\n// Description: A ragged left-to-right wipe, as if the image was blown away by the wind\n// Tags: wipe, horizontal, noise\n\n// @range(0, 1) Width of the ragged edge\nuniform float size; // = 0.2\n// @param Wipe from right to left instead\nuniform bool reversed; // = false\n\nfloat rand (vec2 co) {\n  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);\n}\n\nvec4 transition (vec2 uv) {\n  float x = reversed ? 1. - uv.x : uv.x;\n  float r = rand(vec2(0, uv.y));\n  float m = smoothstep(0.0, -size, x*(1.0-size) + size*r - (progress * (1.0 + size)));\n  return mix(\n    getFromColor(uv),\n    getToColor(uv),\n    m\n  );\n}\n",
    "parameters": {
      "size": {
        "type": "float",
        "default": 0.2
      },
      "reversed": {
        "type": "bool",
        "default": false
      }
    },
    "provenance": {
      "repository": "gl-transitions/gl-transitions",
      "path": "transitions/Wind.glsl",
      "license": "MIT"
    },
    "description": "A ragged left-to-right wipe, as if the image was blown away by the wind"
  },
  {
    "id": "copro:anamorphic-flash",
    "name": "Anamorphic Flash",
    "glsl": "vec4 transition(vec2 uv) { float flash=pow(sin(progress*3.14159265),12.0); vec2 d=vec2(flash*.025,0.); vec4 c=mix(getFromColor(uv+d),getToColor(uv-d),smoothstep(.35,.65,progress)); return vec4(c.rgb+vec3(.5,.65,.8)*flash,c.a); }",
    "parameters": {},
    "provenance": {
      "repository": "original",
      "license": "FSL-1.1-MIT"
    },
    "description": "Original CoPro cinematic transition."
  },
  {
    "id": "copro:shutter-bands",
    "name": "Shutter Bands",
    "glsl": "vec4 transition(vec2 uv) { float row=floor(uv.y*12.0); float phase=fract(row*.618); float p=smoothstep(phase*.3, .7+phase*.3,progress); return mix(getFromColor(uv),getToColor(uv),step(fract(uv.x*3.0),p)); }",
    "parameters": {},
    "provenance": {
      "repository": "original",
      "license": "FSL-1.1-MIT"
    },
    "description": "Original CoPro cinematic transition."
  },
  {
    "id": "copro:focus-pull",
    "name": "Focus Pull",
    "glsl": "vec4 transition(vec2 uv) { float b=sin(progress*3.14159265)*.012; vec4 a=vec4(0.); vec4 c=vec4(0.); for(int i=0;i<9;i++){float x=float(i)-4.;vec2 o=vec2(x*b,0.);a+=getFromColor(uv+o)/9.;c+=getToColor(uv+o)/9.;}return mix(a,c,smoothstep(.25,.75,progress)); }",
    "parameters": {},
    "provenance": {
      "repository": "original",
      "license": "FSL-1.1-MIT"
    },
    "description": "Original CoPro cinematic transition."
  },
  {
    "id": "copro:blueprint-reveal",
    "name": "Blueprint Reveal",
    "glsl": "vec4 transition(vec2 uv) { vec2 cell=floor(uv*vec2(16.,9.));float d=(cell.x+cell.y)/25.;float p=smoothstep(d*.6,d*.6+.4,progress);float edge=sin(p*3.14159265)*.16;return mix(getFromColor(uv),getToColor(uv),p)+vec4(.2,.8,.7,0.)*edge; }",
    "parameters": {},
    "provenance": {
      "repository": "original",
      "license": "FSL-1.1-MIT"
    },
    "description": "Original CoPro cinematic transition."
  }
]);
