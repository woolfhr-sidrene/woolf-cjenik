import fs from "node:fs/promises";

const index = await fs.readFile("docs/index.html", "utf8");
const payload = JSON.parse(await fs.readFile("docs/data/products.json", "utf8"));
const csv = await fs.readFile("docs/data/cjenik.csv", "utf8");
const xml = await fs.readFile("docs/data/cjenik.xml", "utf8");
const archive = JSON.parse(await fs.readFile("docs/data/archive/index.json", "utf8"));
const erpBarcodesCsv = await fs.readFile("config/erp-barkodovi.csv", "utf8");
const brandsCsv = await fs.readFile("config/brendovi.csv", "utf8");

if (!index.includes("Arhiva cjenika") || !index.includes("data/archive/index.json")) {
  throw new Error("docs/index.html nije ispravno povezan s podacima.");
}


const erpBarcodeLines = erpBarcodesCsv.trim().split(/\r?\n/);
if (erpBarcodeLines.length < 5_000 || !erpBarcodesCsv.includes('"Šifra";"Veličina ključ";"Barkod"')) {
  throw new Error("ERP barkod konfiguracija nije ispravna ili je premala.");
}

const brandLines = brandsCsv.trim().split(/\r?\n/);
if (brandLines.length < 12_000 || !brandsCsv.includes('"Šifra";"Brend"')) {
  throw new Error("Konfiguracija brendova nije ispravna ili je premala.");
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

if (payload.metadata.productsWithBrand < 12_000 || payload.metadata.productsWithoutBrand > 500) {
  throw new Error(`Brendovi nisu dovoljno popunjeni: ${payload.metadata.productsWithBrand} s brendom, ${payload.metadata.productsWithoutBrand} bez brenda.`);
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

// Pravilnik o načinu objave cjenika proizvoda (NN 132/2026), čl. 3. st. 2.:
// prvi redak datoteke su nazivi stupaca, a prvih 11 stupaca ide točno ovim redom.
const requiredCsvHeaders = [
  "Naziv proizvoda",
  "Šifra",
  "Marka",
  "Neto količina",
  "Jedinica mjere",
  "Maloprodajna cijena (EUR)",
  "Poseban oblik prodaje",
  "Cijena za jedinicu mjere (EUR)",
  "Barkod",
  "EAN barkod",
  "Bazna cijena (EUR)"
];
const extraCsvHeaders = [
  "Datum bazne cijene",
  "Naziv posebnog oblika prodaje",
  "Redovna cijena prije akcije (EUR)",
  "Dostupnost",
  "Varijante i dostupnost",
  "Barkodovi varijanti",
  "Kategorija",
  "Poveznica"
];
const firstLine = csv.slice(1, csv.indexOf("\r\n"));
const expectedHeader = [...requiredCsvHeaders, ...extraCsvHeaders].map((header) => `"${header}"`).join(";");
if (firstLine !== expectedHeader) {
  throw new Error("Prvi redak CSV-a nisu propisani nazivi stupaca propisanim redom.");
}
const csvLines = csv.slice(1).split("\r\n").filter(Boolean);
if (csvLines.length - 1 !== payload.products.length) {
  throw new Error(`CSV ima ${csvLines.length - 1} redaka, a proizvoda je ${payload.products.length}.`);
}
const columnCount = expectedHeader.split(";").length;
const badRow = csvLines.findIndex((line) => line.split('";"').length !== columnCount);
if (badRow >= 0) {
  throw new Error(`Redak ${badRow + 1} CSV-a nema ${columnCount} stupaca.`);
}
if (csv.includes('"Nije dodijeljen"') || csv.includes("Sidrena cijena")) {
  throw new Error("Javni CSV ne smije sadržavati stari naziv stupca ni tekst 'Nije dodijeljen'.");
}

if (!xml.startsWith("<?xml") || !xml.includes("<cjenik") || !xml.includes("<proizvod>")) {
  throw new Error("XML datoteka nije ispravna.");
}

const requiredXmlTags = [
  "naziv", "sifra", "marka", "netoKolicina", "jedinicaMjere", "maloprodajnaCijena",
  "posebanOblikProdaje", "cijenaZaJedinicuMjere", "barkod", "eanBarkod", "baznaCijena",
  "datumBazneCijene", "nazivPosebnogOblikaProdaje", "dostupnost", "oib", "brojPohrane"
];

if (!requiredXmlTags.every((tag) => xml.includes(`<${tag}>`))) {
  throw new Error("XML nema sva obvezna polja.");
}

for (const code of ["6500944_21", "6500944B", "6500944BC", "6500944_A"]) {
  const product = payload.products.find((item) => item.model === code);
  if (!product || product.anchorPrice !== 899 || product.anchorDate !== "2026-09-10") {
    throw new Error(`Potvrđena sidrena cijena za ${code} mora biti 899 EUR na 10. 9. 2026.`);
  }
}

if (!payload.products.every((product) => /^\d{4}-\d{2}-\d{2}$/.test(product.anchorDate))) {
  throw new Error("Nedostaje datum sidrene cijene za jedan ili više artikala.");
}

const excludedCodes = (await fs.readFile("config/iskljuceni-iz-cjenika.csv", "utf8").catch(() => ""))
  .split(/\r?\n/).slice(1).map((line) => line.split(";")[0].trim()).filter(Boolean);
const leaked = payload.products.filter((product) => excludedCodes.includes(product.model)).map((product) => product.model);
if (leaked.length) {
  throw new Error(`U cjeniku su isključeni artikli: ${leaked.join(", ")}`);
}

if (!Array.isArray(archive.entries) || archive.entries.length < 1) {
  throw new Error("Arhiva cjenika nije ispravna.");
}

if (archive.retentionDays !== 30) {
  throw new Error("Arhiva mora čuvati cjenike najmanje 30 dana.");
}

await Promise.all([
  fs.access(`docs/data/archive/${archive.entries[0].csvFilename || archive.entries[0].filename}`),
  fs.access(`docs/data/archive/${archive.entries[0].xmlFilename}`)
]);

// Naziv datoteke: OIB_prodajno mjesto_adresa_oznaka_ROBA_broj pohrane_GGGGMMDD_SSMM (čl. 6. st. 3.)
const filenamePattern = /^45374311169_Webshop_Ograda-14-Vratisinec_160_ROBA_\d+_\d{8}_\d{4}\.(csv|xml)$/;
if (!filenamePattern.test(archive.entries[0].csvFilename) || !filenamePattern.test(archive.entries[0].xmlFilename)) {
  throw new Error("Naziv arhivske datoteke nije prema Pravilniku.");
}

// Cjenik usluga (čl. 3. st. 3.): ako je izrađen, mora biti potpun i ispravno imenovan. Ako popis
// usluga nije bio dostupan ni s cPanela ni iz prethodne objave, cjenik robe se ipak objavljuje.
const latest = archive.entries[0];
let servicesSummary = "cjenik usluga nije izrađen";
if (payload.metadata.usluge > 0) {
  const servicesCsv = await fs.readFile("docs/data/cjenik-usluge.csv", "utf8");
  const servicesXml = await fs.readFile("docs/data/cjenik-usluge.xml", "utf8");
  const servicesJson = JSON.parse(await fs.readFile("docs/data/usluge.json", "utf8"));
  const servicesHeader = ["Naziv usluge", "Maloprodajna cijena (EUR)", "Poseban oblik prodaje", "Bazna cijena (EUR)", "Datum bazne cijene", "Napomena"]
    .map((header) => `"${header}"`).join(";");
  if (!servicesCsv.startsWith("﻿") || servicesCsv.slice(1, servicesCsv.indexOf("\r\n")) !== servicesHeader) {
    throw new Error("Prvi redak cjenika usluga nisu propisani nazivi stupaca propisanim redom.");
  }
  const serviceLines = servicesCsv.slice(1).split("\r\n").filter(Boolean).slice(1);
  if (serviceLines.length !== payload.metadata.usluge || servicesJson.usluge.length !== payload.metadata.usluge) {
    throw new Error(`Cjenik usluga ima ${serviceLines.length} redaka, a usluga je ${payload.metadata.usluge}.`);
  }
  for (const [index, line] of serviceLines.entries()) {
    const cells = line.slice(1, -1).split('";"');
    if (cells.length !== 6 || !cells[0] || !/^\d+,\d{2}$/.test(cells[1]) || !/^(DA|NE)$/.test(cells[2]) ||
        !/^\d+,\d{2}$/.test(cells[3]) || !/^\d{4}-\d{2}-\d{2}$/.test(cells[4])) {
      throw new Error(`Redak ${index + 2} cjenika usluga nije ispravan.`);
    }
  }
  if (servicesJson.hash !== payload.metadata.uslugeHash) {
    throw new Error("Oznaka popisa usluga u statusu ne odgovara objavljenom popisu.");
  }
  if (!servicesXml.startsWith("<?xml") || !servicesXml.includes('<cjenik vrsta="USLUGE"') ||
      !servicesXml.includes("<vrstaCjenika>USLUGE</vrstaCjenika>") ||
      (servicesXml.match(/<usluga>/g) || []).length !== payload.metadata.usluge ||
      !["naziv", "maloprodajnaCijena", "posebanOblikProdaje", "baznaCijena", "brojPohrane", "oib"].every((tag) => servicesXml.includes(`<${tag}>`))) {
    throw new Error("XML cjenika usluga nije ispravan.");
  }
  const servicesPattern = /^45374311169_Webshop_Ograda-14-Vratisinec_160_USLUGE_\d+_\d{8}_\d{4}\.(csv|xml)$/;
  if (!servicesPattern.test(latest.uslugeCsvFilename || "") || !servicesPattern.test(latest.uslugeXmlFilename || "")) {
    throw new Error("Naziv datoteke cjenika usluga nije prema Pravilniku.");
  }
  if (latest.uslugeCsvFilename.replace("_USLUGE_", "_ROBA_") !== latest.csvFilename) {
    throw new Error("Cjenik usluga i cjenik robe nemaju isti broj pohrane i vrijeme objave.");
  }
  await Promise.all([
    fs.access(`docs/data/archive/${latest.uslugeCsvFilename}`),
    fs.access(`docs/data/archive/${latest.uslugeXmlFilename}`)
  ]);
  servicesSummary = `${payload.metadata.usluge} usluga (izvor: ${payload.metadata.uslugeIzvor})`;
} else {
  console.log("Upozorenje: cjenik usluga nije izrađen jer popis usluga nije dostupan.");
}

console.log(`Provjera uspješna: ${payload.metadata.products} proizvoda, ${payload.metadata.variants} varijanti, ${servicesSummary} i ${archive.entries.length} arhiviranih cjenika.`);
