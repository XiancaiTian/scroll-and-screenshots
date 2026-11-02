import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require("sharp"); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  sharp = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"));
}
const source = await readFile(join(root, "assets/scrollshot-icon.svg"));
const icons = join(root, "extension/icons");
await mkdir(icons, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(source).resize(size, size).png().toFile(join(icons, `icon${size}.png`));
}
await sharp(source).resize(512, 512).png().toFile(join(root, "assets/scrollshot-icon-512.png"));
console.log("已导出 16、32、48、128 像素插件图标与 512 像素预览。");
