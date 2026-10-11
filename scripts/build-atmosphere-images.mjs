#!/usr/bin/env node
/**
 * Re-encodes the owner-supplied concert photographs into the sizes the app serves.
 * Run once after replacing a source image:
 *   node scripts/build-atmosphere-images.mjs <dir-with-sources>
 * Sources: festival-sunset.webp, gold-stage.webp, panorama-band.webp (any size).
 * Output:  public/images/atmosphere/<name>-{800,1600}.webp
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-atmosphere-images.mjs <source-dir>");
const out = "public/images/atmosphere";
mkdirSync(out, { recursive: true });

for (const name of ["festival-sunset", "gold-stage", "panorama-band"]) {
  for (const width of [800, 1600]) {
    const info = await sharp(join(dir, `${name}.webp`))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width === 800 ? 70 : 74, effort: 6 })
      .toFile(join(out, `${name}-${width}.webp`));
    console.log(`${name}-${width}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
  }
}
