import { mkdir, readFile, writeFile } from "node:fs/promises";
import { LANDINGS } from "./landings.mjs";

const template = await readFile("index.html", "utf8");

function requiredReplace(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing template marker: ${label}`);
  return source.replace(from, to);
}

for (const landing of LANDINGS) {
  let html = template;
  html = requiredReplace(
    html,
    "<title>Mobile Car Interior Cleaning in Comox Valley & Campbell River | Island Drift Detailing</title>",
    `<title>${landing.seo.title}</title>`,
    "title"
  );
  html = requiredReplace(
    html,
    '<p class="eyebrow">Comox Valley & Campbell River · Owner-operated mobile detailing</p>',
    `<p class="eyebrow">${landing.hero.eyebrow}</p>`,
    "hero eyebrow"
  );
  html = requiredReplace(
    html,
    '<h1>Mobile car detailing at <span>your home or office</span></h1>',
    `<h1>${landing.hero.title}</h1>`,
    "hero title"
  );
  html = requiredReplace(
    html,
    "Local new-client offer: save 10% on your first clean in our North Island service area.",
    landing.hero.note,
    "hero note"
  );

  await mkdir(landing.slug, { recursive: true });
  await writeFile(`${landing.slug}/index.html`, html, "utf8");
}

console.log(`Generated ${LANDINGS.length} modular landing pages.`);
