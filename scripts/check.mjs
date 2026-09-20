import fs from "node:fs/promises";

const index = await fs.readFile("docs/index.html", "utf8");
const payload = JSON.parse(await fs.readFile("docs/data/products.json", "utf8"));
const csv = await fs.readFile("docs/data/cjenik.csv", "utf8");
const xml = await fs.readFile("docs/data/cjenik.xml", "utf8");
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

const requiredCsvHeaders = [
  "Naziv proizvoda",
  "Šifra",
  "Marka",
  "Jedinica mjere",
  "Cijena za jedinicu mjere (EUR)",
  "Maloprodajna cijena (EUR)",
  "Poseban oblik prodaje",
  "Naziv posebnog oblika prodaje",
  "Sidrena cijena (EUR)",
  "Barkod",
  "Dostupnost"
];

if (!requiredCsvHeaders.every((header) => csv.split("\n", 1)[0].includes(`"${header}"`))) {
  throw new Error("CSV nema sva obvezna polja.");
}

if (!xml.startsWith("<?xml") || !xml.includes("<cjenik") || !xml.includes("<proizvod>")) {
  throw new Error("XML datoteka nije ispravna.");
}

const requiredXmlTags = [
  "naziv", "sifra", "marka", "jedinicaMjere", "cijenaZaJedinicuMjere",
  "maloprodajnaCijena", "posebanOblikProdaje", "nazivPosebnogOblikaProdaje",
  "sidrenaCijena", "barkod", "dostupnost"
];

if (!requiredXmlTags.every((tag) => xml.includes(`<${tag}>`))) {
  throw new Error("XML nema sva obvezna polja.");
}

const correctedProduct = payload.products.find((product) => product.model === "6500944_21");
if (!correctedProduct || correctedProduct.anchorPrice !== 599 || correctedProduct.price !== 649) {
  throw new Error("Ručna sidrena cijena za 6500944_21 nije ispravno primijenjena.");
}

if (!Array.isArray(archive.entries) || archive.entries.length < 1) {
  throw new Error("Arhiva cjenika nije ispravna.");
}

if (archive.retentionDays !== 30 || archive.entries.length > 30) {
  throw new Error("Arhiva nije ograničena na posljednjih 30 dana.");
}

await Promise.all([
  fs.access(`docs/data/archive/${archive.entries[0].csvFilename || archive.entries[0].filename}`),
  fs.access(`docs/data/archive/${archive.entries[0].xmlFilename}`)
]);

if (!archive.entries[0].csvFilename.startsWith("webshop-Istarsko-naselje-3A-WOOLF-ONLINE-001-")) {
  throw new Error("Naziv arhivske datoteke nema obvezne podatke prodajnog mjesta.");
}

console.log(`Provjera uspješna: ${payload.products.length} proizvoda i ${archive.entries.length} arhiviranih cjenika.`);
