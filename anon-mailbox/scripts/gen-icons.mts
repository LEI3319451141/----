import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("public/icon.svg");

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
  console.log(`Generated icon-${size}.png`);
}

// Apple touch icon (180x180, 无透明背景)
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: "#007aff" })
  .png()
  .toFile("public/apple-touch-icon.png");
console.log("Generated apple-touch-icon.png");

// favicon
await sharp(svg, { density: 384 })
  .resize(32, 32)
  .png()
  .toFile("public/favicon.png");
console.log("Generated favicon.png");
