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
  "Sidrena cijena – cijena na dan 10. 09. 2026. (EUR)",
  "Barkod",
  "Dostupnost"
];

if (!requiredCsvHeaders.every((header) => csv.includes(`"${header}"`))) {
  throw new Error("CSV nema sva obvezna polja.");
}

if (!csv.includes('"Naziv";"Woolf d.o.o."') ||
    !csv.includes('"Adresa sjedišta";"Ograda 14, Vratišinec"') ||
    !csv.includes('"OIB";"45374311169"') ||
    !csv.includes('"Datum cjenika";')) {
  throw new Error("CSV zaglavlje nema ispravne podatke tvrtke i datum cjenika.");
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

if (!archive.entries[0].csvFilename.startsWith("cjenik-Woolf-")) {
  throw new Error("Naziv arhivske datoteke nije ispravan.");
}

console.log(`Provjera uspješna: ${payload.products.length} proizvoda i ${archive.entries.length} arhiviranih cjenika.`);
