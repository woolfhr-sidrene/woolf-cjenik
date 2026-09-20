import fs from "node:fs/promises";

const index = await fs.readFile("docs/index.html", "utf8");
const payload = JSON.parse(await fs.readFile("docs/data/products.json", "utf8"));
const csv = await fs.readFile("docs/data/cjenik.csv", "utf8");
const archive = JSON.parse(await fs.readFile("docs/data/archive/index.json", "utf8"));

if (!index.includes("Arhiva cjenika") || !index.includes("data/archive/index.json")) {
  throw new Error("docs/index.html nije ispravno povezan s podacima.");
}

if (!Array.isArray(payload.products) || payload.products.length < 500) {
  throw new Error("Premalo proizvoda u products.json.");
}

if (!payload.products.every((product) => product.name && product.model && Number.isFinite(product.price))) {
  throw new Error("Jedan ili više proizvoda nema obavezne podatke.");
}

if (!csv.startsWith("\uFEFF") || csv.split("\n").length < 500) {
  throw new Error("CSV datoteka nije ispravna.");
}

if (!Array.isArray(archive.entries) || archive.entries.length < 1) {
  throw new Error("Arhiva cjenika nije ispravna.");
}

await fs.access(`docs/data/archive/${archive.entries[0].filename}`);

console.log(`Provjera uspješna: ${payload.products.length} proizvoda i ${archive.entries.length} arhiviranih cjenika.`);
