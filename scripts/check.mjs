import fs from "node:fs/promises";

const index = await fs.readFile("docs/index.html", "utf8");
const payload = JSON.parse(await fs.readFile("docs/data/products.json", "utf8"));
const csv = await fs.readFile("docs/data/cjenik.csv", "utf8");
const xml = await fs.readFile("docs/data/cjenik.xml", "utf8");
const archive = JSON.parse(await fs.readFile("docs/data/archive/index.json", "utf8"));

if (!index.includes("Arhiva cjenika") || !index.includes("data/archive/index.json")) {
  throw new Error("docs/index.html nije ispravno povezan s podacima.");
}

if (!Array.isArray(payload.products) || payload.products.length < 10_000) {
  throw new Error("Premalo proizvoda u products.json.");
}

if (!payload.products.every((product) => product.name && product.model && Array.isArray(product.variants) && product.variants.length && Number.isFinite(product.price))) {
  throw new Error("Jedan ili više proizvoda nema obavezne podatke.");
}

const allVariants = payload.products.flatMap((product) => product.variants);
if (payload.products.length !== payload.metadata.products || allVariants.length !== payload.metadata.variants || payload.metadata.products < 10_000) {
  throw new Error("Broj proizvoda ili varijanti nije ispravan.");
}

if (payload.metadata.jeftinijeProducts < 1_000 || payload.metadata.googleOnlyProducts < 5_000 || payload.metadata.googleOverlapProducts < 1_000) {
  throw new Error("Google dopuna nije ispravno spojena s Jeftinije feedom.");
}

const googleOnlySample = payload.products.find((product) =>
  product.variants.length === 1 && product.variants[0].code === product.model && product.availability === "Nedostupno"
);
if (!googleOnlySample) {
  throw new Error("Nije pronađen nijedan nedostupan proizvod iz Google dopune.");
}

if (!allVariants.some((product) => product.availability === "Dostupno") ||
    !allVariants.some((product) => product.availability === "Nedostupno")) {
  throw new Error("Cjenik mora sadržavati oznake Dostupno i Nedostupno.");
}

if (payload.products.some((product) =>
  (product.specialSale === "DA" && !(product.regularPrice > product.price)) ||
  (product.specialSale === "NE" && product.regularPrice > product.price)
)) {
  throw new Error("Oznaka akcije nije usklađena s redovnom i trenutačnom cijenom.");
}

if (!payload.products.every((product) => product.barcode)) {
  throw new Error("Polje barkoda ne smije biti prazno; koristi Nije dodijeljen kada EAN ne postoji.");
}

if (!csv.startsWith("\uFEFF") || csv.split("\n").length < 10_000) {
  throw new Error("CSV datoteka nije ispravna.");
}

const requiredCsvHeaders = [
  "Naziv proizvoda",
  "Šifra",
  "Marka",
  "Jedinica mjere",
  "Cijena za jedinicu mjere (EUR)",
  "Redovna cijena prije akcije (EUR)",
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
    !csv.includes('"Oblik prodajnog objekta";"Webshop"') ||
    !csv.includes('"Oznaka prodajnog prostora";"160"') ||
    !csv.includes('"Broj skladišta";"02"') ||
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

if (!archive.entries[0].csvFilename.startsWith("webshop-Ograda-14-Vratisinec-160-02-")) {
  throw new Error("Naziv arhivske datoteke nije ispravan.");
}

console.log(`Provjera uspješna: ${payload.metadata.products} proizvoda, ${payload.metadata.variants} varijanti i ${archive.entries.length} arhiviranih cjenika.`);
