import { mkdir, readFile, writeFile } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
await mkdir("used-car-reset", { recursive: true });
await writeFile("used-car-reset/index.html", html, "utf8");
