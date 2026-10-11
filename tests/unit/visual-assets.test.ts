import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATMOSPHERE } from "@/data/visual-assets";

/** Reads width/height from a WebP (VP8/VP8L/VP8X) or JPEG header. */
function dimensions(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) === "RIFF") {
    let i = 12;
    while (i < b.length) {
      const tag = b.toString("ascii", i, i + 4);
      const size = b.readUInt32LE(i + 4);
      if (tag === "VP8X") return { width: 1 + b.readUIntLE(i + 12, 3), height: 1 + b.readUIntLE(i + 15, 3) };
      if (tag === "VP8 ") return { width: b.readUInt16LE(i + 14) & 0x3fff, height: b.readUInt16LE(i + 16) & 0x3fff };
      if (tag === "VP8L") {
        const v = b.readUInt32LE(i + 9);
        return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
      }
      i += 8 + size + (size & 1);
    }
  }
  let i = 2; // JPEG: find a SOF marker
  while (i < b.length) {
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error(`unknown image format: ${file}`);
}

describe("atmosphere image manifest", () => {
  for (const a of Object.values(ATMOSPHERE)) {
    it(`${a.key}: files exist and match the declared size`, () => {
      const main = join("public", a.src);
      expect(existsSync(main)).toBe(true);
      expect(dimensions(main)).toEqual({ width: a.width, height: a.height });
      if (a.small) {
        const small = join("public", a.small);
        expect(existsSync(small)).toBe(true);
        expect(dimensions(small).width).toBe(800);
      }
      expect(a.licence.length).toBeGreaterThan(0);
      expect(a.source.length).toBeGreaterThan(0);
    });
  }

  it("photos stay decorative: never imported by event components", () => {
    for (const f of ["EventCard.tsx", "EventDetail.tsx", "SourcePanel.tsx"]) {
      const src = readFileSync(join("src/components/events", f), "utf8");
      expect(src).not.toMatch(/Atmosphere|visual-assets|HeroBackdrop/);
    }
  });
});
