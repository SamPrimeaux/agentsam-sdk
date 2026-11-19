import sourceGlyphData from "./source-glyphs.json";

export type Point = [number, number];
export type GlyphContour = { points: Point[]; hole?: boolean };
export type GlyphSource = "wordmark-trace" | "constructed" | "utility";
export type TypefaceGlyph = {
  character: string;
  name: string;
  unicode: number;
  advanceWidth: number;
  leftSideBearing: number;
  contours: GlyphContour[];
  source: GlyphSource;
};
export type TypefaceDocument = {
  schemaVersion: 1;
  familyName: string;
  styleName: string;
  version: string;
  unitsPerEm: 1000;
  metrics: { capHeight: number; xHeight: number; ascender: number; descender: number; baseline: number; stemWidth: number };
  tracking: number;
  glyphs: Record<string, TypefaceGlyph>;
};

const point = (x: number, y: number): Point => [Math.round(x), Math.round(y)];
const contour = (points: Point[], hole = false): GlyphContour => ({ points, ...(hole ? { hole: true } : {}) });
const rect = (x: number, y: number, w: number, h: number, cut = 10): GlyphContour => {
  const c = Math.max(0, Math.min(cut, w / 2, h / 2));
  return contour([
    point(x + c, y), point(x + w - c, y), point(x + w, y + c), point(x + w, y + h - c),
    point(x + w - c, y + h), point(x + c, y + h), point(x, y + h - c), point(x, y + c),
  ]);
};
const poly = (points: number[][], hole = false): GlyphContour => contour(points.map(([x, y]) => point(x, y)), hole);
const segment = (x1: number, y1: number, x2: number, y2: number, width = 108): GlyphContour => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = (-dy / length) * width / 2;
  const ny = (dx / length) * width / 2;
  return poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]);
};
const octagon = (x: number, y: number, w: number, h: number, cut = 90): Point[] => [
  point(x + cut, y), point(x + w - cut, y), point(x + w, y + cut),
  point(x + w, y + h - cut), point(x + w - cut, y + h), point(x + cut, y + h),
  point(x, y + h - cut), point(x, y + cut),
];
const ring = (x: number, y: number, w: number, h: number, cut = 92, inset = 112): GlyphContour[] => [
  contour(octagon(x, y, w, h, cut)),
  contour(octagon(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(30, cut - inset / 2)), true),
];
const openC = (x: number, y: number, w: number, h: number, t = 112): GlyphContour => poly([
  [x + w, y + h - 92], [x + w - 82, y + h - 12], [x + 190, y + h], [x + 74, y + h - 90],
  [x, y + h - 205], [x, y + 205], [x + 74, y + 90], [x + 190, y],
  [x + w - 82, y + 12], [x + w, y + 92], [x + w - 128, y + 210],
  [x + w - 205, y + 122], [x + 220, y + 122], [x + t, y + 210],
  [x + t, y + h - 210], [x + 220, y + h - 122], [x + w - 205, y + h - 122],
  [x + w - 128, y + h - 210],
]);
const makeGlyph = (character: string, width: number, contours: GlyphContour[], source: GlyphSource = "constructed", advanceWidth = width + 140): TypefaceGlyph => ({
  character,
  name: character === " " ? "space" : character,
  unicode: character.codePointAt(0) ?? 0,
  advanceWidth,
  leftSideBearing: 0,
  contours,
  source,
});

const uppercase: Record<string, { width: number; contours: GlyphContour[] }> = {
  B: { width: 620, contours: [
    poly([[0,0],[0,700],[390,700],[505,654],[590,570],[590,462],[530,365],[610,285],[610,145],[520,48],[390,0]]),
    poly([[112,418],[112,588],[340,588],[440,548],[440,474],[350,418]], true),
    poly([[112,112],[112,292],[350,292],[460,248],[460,166],[350,112]], true),
  ]},
  C: { width: 620, contours: [openC(0,0,620,700)] },
  D: { width: 650, contours: [
    poly([[0,0],[0,700],[390,700],[510,650],[610,545],[650,350],[610,155],[510,50],[390,0]]),
    poly([[118,126],[118,574],[350,574],[452,520],[520,350],[452,180],[350,126]], true),
  ]},
  F: { width: 620, contours: [rect(0,0,112,700,10),rect(0,588,620,112,10),rect(0,302,470,108,10)] },
  G: { width: 650, contours: [openC(0,0,650,700),rect(318,284,332,112,8),rect(538,165,112,230,8)] },
  H: { width: 650, contours: [rect(0,0,112,700,10),rect(538,0,112,700,10),rect(0,294,650,112,8)] },
  J: { width: 620, contours: [
    rect(0,588,620,112,10),
    poly([[508,588],[620,588],[620,168],[566,62],[462,0],[240,0],[126,58],[62,160],[170,232],[260,122],[408,122],[508,212]]),
  ]},
  K: { width: 650, contours: [rect(0,0,112,700,10),segment(104,350,650,700,112),segment(104,350,650,0,112)] },
  O: { width: 650, contours: ring(0,0,650,700,100,112) },
  P: { width: 620, contours: [
    rect(0,0,112,700,10),
    poly([[112,700],[420,700],[535,650],[610,550],[610,425],[535,325],[420,275],[112,275]]),
    poly([[225,410],[225,586],[392,586],[470,550],[490,492],[470,448],[392,410]], true),
  ]},
  Q: { width: 650, contours: [...ring(0,0,650,700,100,112),segment(390,190,690,-50,112)] },
  S: { width: 620, contours: [poly([[590,600],[500,700],[185,700],[72,640],[0,535],[0,430],[85,330],[220,280],[430,230],[480,190],[480,145],[420,112],[100,112],[0,202],[0,100],[95,0],[435,0],[555,70],[620,175],[620,285],[540,390],[390,440],[185,495],[140,540],[185,588],[500,588]])] },
  T: { width: 650, contours: [rect(0,588,650,112,10),rect(269,0,112,700,10)] },
  U: { width: 650, contours: [poly([[0,700],[112,700],[112,224],[184,112],[466,112],[538,224],[538,700],[650,700],[650,188],[554,48],[454,0],[196,0],[96,48],[0,188]])] },
  V: { width: 650, contours: [poly([[0,700],[132,700],[325,170],[518,700],[650,700],[400,0],[250,0]])] },
  W: { width: 820, contours: [poly([[0,700],[112,700],[205,190],[330,510],[490,510],[615,190],[708,700],[820,700],[690,0],[540,0],[410,300],[280,0],[130,0]])] },
  X: { width: 650, contours: [segment(0,700,650,0,112),segment(0,0,650,700,112)] },
  Y: { width: 650, contours: [segment(0,700,325,380,112),segment(650,700,325,380,112),rect(269,0,112,380,8)] },
  Z: { width: 650, contours: [poly([[0,588],[650,588],[650,700],[0,700],[0,612],[510,112],[0,112],[0,0],[650,0],[650,88],[140,588]])] },
};

const lowercase: Record<string, { width: number; contours: GlyphContour[] }> = {
  a: { width: 550, contours: [...ring(0,0,500,500,82,100),rect(438,0,112,500,8)] },
  b: { width: 550, contours: [rect(0,0,112,720,8),...ring(50,0,500,500,82,100)] },
  c: { width: 530, contours: [openC(0,0,530,500,100)] },
  d: { width: 550, contours: [...ring(0,0,500,500,82,100),rect(438,0,112,720,8)] },
  e: { width: 540, contours: [...ring(0,0,520,500,82,100),rect(0,195,520,105,8)] },
  f: { width: 390, contours: [rect(150,0,108,650,8),poly([[150,650],[205,720],[365,720],[390,620],[265,620],[258,500],[360,500],[360,400],[258,400],[258,0],[150,0]]),rect(40,420,310,90,8)] },
  g: { width: 560, contours: [...ring(0,0,500,500,82,100),rect(438,-170,112,670,8)] },
  h: { width: 550, contours: [rect(0,0,112,720,8),segment(112,250,310,500,100),segment(310,500,500,500,100),rect(438,0,112,500,8)] },
  i: { width: 230, contours: [rect(60,0,108,500,8),rect(60,610,108,100,8)] },
  j: { width: 300, contours: [rect(140,-170,108,670,8),rect(140,610,108,100,8)] },
  k: { width: 540, contours: [rect(0,0,112,720,8),segment(100,245,520,500,100),segment(100,245,520,0,100)] },
  l: { width: 230, contours: [rect(60,0,108,720,8)] },
  m: { width: 820, contours: [rect(0,0,108,500,8),segment(108,245,270,500,96),segment(270,500,410,500,96),rect(362,0,108,500,8),segment(470,245,630,500,96),segment(630,500,760,500,96),rect(712,0,108,500,8)] },
  n: { width: 560, contours: [rect(0,0,108,500,8),segment(108,245,300,500,100),segment(300,500,500,500,100),rect(452,0,108,500,8)] },
  o: { width: 550, contours: ring(0,0,550,500,82,100) },
  p: { width: 550, contours: [rect(0,-170,108,670,8),...ring(50,0,500,500,82,100)] },
  q: { width: 550, contours: [...ring(0,0,500,500,82,100),rect(438,-170,112,670,8)] },
  r: { width: 400, contours: [rect(0,0,108,500,8),segment(108,250,265,500,100),segment(265,500,390,500,100)] },
  s: { width: 500, contours: [poly([[470,430],[390,500],[140,500],[45,440],[0,350],[75,260],[200,220],[360,180],[380,145],[330,105],[80,105],[0,175],[0,80],[80,0],[360,0],[455,55],[500,150],[500,235],[430,320],[300,350],[150,390],[125,420],[160,435],[390,435]])] },
  t: { width: 420, contours: [rect(155,0,108,620,8),rect(30,390,360,90,8),poly([[155,620],[205,700],[370,700],[395,610],[263,610],[263,0],[155,0]])] },
  u: { width: 560, contours: [poly([[0,500],[108,500],[108,205],[175,100],[385,100],[452,205],[452,500],[560,500],[560,180],[470,45],[390,0],[170,0],[90,45],[0,180]])] },
  v: { width: 540, contours: [poly([[0,500],[115,500],[270,120],[425,500],[540,500],[335,0],[205,0]])] },
  w: { width: 720, contours: [poly([[0,500],[100,500],[175,140],[280,390],[440,390],[545,140],[620,500],[720,500],[610,0],[465,0],[360,250],[255,0],[110,0]])] },
  x: { width: 540, contours: [segment(0,500,540,0,100),segment(0,0,540,500,100)] },
  y: { width: 540, contours: [segment(0,500,270,245,100),segment(540,500,270,245,100),segment(270,245,160,-170,100)] },
  z: { width: 520, contours: [poly([[0,410],[520,410],[520,500],[0,500],[0,430],[390,90],[0,90],[0,0],[520,0],[520,70],[130,410]])] },
};

const digits: Record<string, { width: number; contours: GlyphContour[] }> = {
  "0": { width: 650, contours: ring(0,0,650,700,100,112) },
  "1": { width: 360, contours: [rect(120,0,112,700,8),poly([[20,570],[150,700],[250,700],[250,0],[138,0],[138,560],[80,500]])] },
  "2": { width: 650, contours: [poly([[0,530],[70,650],[190,700],[465,700],[580,650],[650,535],[650,440],[580,340],[150,112],[650,112],[650,0],[0,0],[0,110],[470,390],[525,465],[525,530],[475,588],[180,588],[112,530],[112,475],[0,475]])] },
  "3": { width: 650, contours: [poly([[0,580],[85,700],[440,700],[555,645],[630,545],[630,445],[550,350],[630,260],[630,150],[545,50],[430,0],[80,0],[0,115],[112,115],[170,100],[445,100],[520,160],[520,240],[440,290],[220,290],[220,400],[445,400],[520,455],[520,535],[445,600],[170,600],[112,580]])] },
  "4": { width: 650, contours: [rect(420,0,112,700,8),poly([[0,210],[380,700],[520,700],[520,320],[650,320],[650,210],[520,210],[520,0],[420,0],[420,210]])] },
  "5": { width: 650, contours: [poly([[0,700],[650,700],[650,588],[112,588],[112,420],[430,420],[545,365],[630,260],[630,145],[545,45],[430,0],[80,0],[0,115],[112,115],[170,100],[445,100],[520,160],[520,245],[445,308],[112,308],[0,260]])] },
  "6": { width: 650, contours: [poly([[600,590],[520,700],[180,700],[65,630],[0,520],[0,170],[80,55],[190,0],[455,0],[565,60],[650,175],[650,275],[560,385],[455,430],[180,430],[112,375],[112,520],[175,590],[455,590],[500,560]])] },
  "7": { width: 650, contours: [poly([[0,588],[650,588],[650,700],[0,700],[0,620],[390,0],[255,0]])] },
  "8": { width: 650, contours: [...ring(0,350,650,350,82,112),...ring(0,0,650,350,82,112)] },
  "9": { width: 650, contours: [poly([[50,110],[130,0],[470,0],[585,70],[650,180],[650,530],[570,645],[460,700],[195,700],[85,645],[0,530],[0,430],[90,315],[195,270],[470,270],[538,325],[538,180],[475,110],[195,110],[145,140]])] },
};

const punctuation: Record<string, { width: number; contours: GlyphContour[] }> = {
  ".": { width: 180, contours: [rect(35,0,110,110,12)] },
  ",": { width: 190, contours: [poly([[40,0],[145,0],[95,-135],[0,-135]])] },
  ":": { width: 180, contours: [rect(35,0,110,110,12),rect(35,340,110,110,12)] },
  ";": { width: 190, contours: [rect(35,340,110,110,12),poly([[40,0],[145,0],[95,-135],[0,-135]])] },
  "!": { width: 220, contours: [rect(55,170,110,530,8),rect(55,0,110,110,12)] },
  "?": { width: 520, contours: [poly([[0,530],[70,650],[190,700],[390,700],[500,640],[520,535],[470,440],[330,330],[315,205],[205,205],[205,350],[330,465],[395,535],[385,585],[320,610],[190,610],[112,550],[112,490],[0,490]]),rect(205,0,110,110,12)] },
  "-": { width: 360, contours: [rect(0,280,360,100,8)] },
  "_": { width: 520, contours: [rect(0,-90,520,90,8)] },
  "+": { width: 520, contours: [rect(205,0,110,520,8),rect(0,205,520,110,8)] },
  "=": { width: 520, contours: [rect(0,325,520,90,8),rect(0,145,520,90,8)] },
  "/": { width: 420, contours: [segment(0,-20,420,720,92)] },
  "\\": { width: 420, contours: [segment(0,720,420,-20,92)] },
  "(": { width: 280, contours: [poly([[260,700],[150,610],[75,480],[40,350],[75,220],[150,90],[260,0],[175,0],[65,100],[0,250],[0,450],[65,600],[175,700]])] },
  ")": { width: 280, contours: [poly([[20,700],[130,600],[205,450],[240,350],[205,250],[130,100],[20,0],[105,0],[215,90],[280,220],[280,480],[215,610],[105,700]])] },
  "'": { width: 170, contours: [poly([[30,700],[140,700],[105,535],[20,535]])] },
  '"': { width: 300, contours: [poly([[20,700],[120,700],[95,540],[10,540]]),poly([[165,700],[265,700],[240,540],[155,540]])] },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createInitialTypeface(): TypefaceDocument {
  const glyphs: Record<string, TypefaceGlyph> = {};
  const traced = sourceGlyphData.glyphs as unknown as Record<string, { advanceWidth: number; contours: GlyphContour[] }>;
  for (const [character, data] of Object.entries(traced)) {
    glyphs[character] = makeGlyph(character, Math.max(...data.contours.flatMap((item) => item.points.map(([x]) => x))), clone(data.contours), "wordmark-trace", data.advanceWidth);
  }
  for (const [character, data] of Object.entries(uppercase)) {
    if (!glyphs[character]) glyphs[character] = makeGlyph(character, data.width, clone(data.contours));
  }
  for (const [character, data] of Object.entries(lowercase)) {
    glyphs[character] = makeGlyph(character, data.width, clone(data.contours));
  }
  for (const [character, data] of Object.entries(digits)) {
    glyphs[character] = makeGlyph(character, data.width, clone(data.contours));
  }
  for (const [character, data] of Object.entries(punctuation)) {
    glyphs[character] = makeGlyph(character, data.width, clone(data.contours));
  }
  glyphs[" "] = makeGlyph(" ", 300, [], "utility", 300);
  return {
    schemaVersion: 1,
    familyName: "InnerAnimal",
    styleName: "Display Regular",
    version: "0.1.0",
    unitsPerEm: 1000,
    metrics: { capHeight: 700, xHeight: 500, ascender: 720, descender: -170, baseline: 0, stemWidth: 108 },
    tracking: 110,
    glyphs,
  };
}

export function cloneTypeface(document: TypefaceDocument): TypefaceDocument {
  return clone(document);
}

export function validateTypeface(value: unknown): value is TypefaceDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<TypefaceDocument>;
  if (doc.schemaVersion !== 1 || doc.unitsPerEm !== 1000 || !doc.glyphs || typeof doc.glyphs !== "object") return false;
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].every((character) => {
    const glyph = doc.glyphs?.[character];
    return !!glyph && glyph.character === character && Array.isArray(glyph.contours) && Number.isFinite(glyph.advanceWidth);
  });
}
