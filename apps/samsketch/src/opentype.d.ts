declare module "opentype.js" {
  export class Path {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
  }
  export class Glyph {
    constructor(options: {
      name: string;
      unicode?: number;
      advanceWidth: number;
      path: Path;
    });
  }
  export class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
    });
    toArrayBuffer(): ArrayBuffer;
  }
}
