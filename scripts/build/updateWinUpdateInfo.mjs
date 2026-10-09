import { buildBlockMap } from "app-builder-lib/out/targets/blockmap/blockmap.js";
import { readFileSync, writeFileSync } from "fs";
import { dump, load } from "js-yaml";
import { join } from "path";

const distDir = join(process.cwd(), "dist");
const latestPath = join(distDir, "latest.yml");

const info = load(readFileSync(latestPath, "utf8"));
const installerPath = join(distDir, info.path);

const { sha512, size } = await buildBlockMap(installerPath, "gzip", `${installerPath}.blockmap`);

const file = info.files.find(f => f.url === info.path);
if (!file) throw new Error(`${info.path} not found in latest.yml files`);

file.sha512 = sha512;
file.size = size;
info.sha512 = sha512;

writeFileSync(latestPath, dump(info, { lineWidth: -1 }));
console.log(`Updated latest.yml and blockmap for ${info.path}`);
