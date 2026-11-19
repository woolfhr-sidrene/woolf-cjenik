import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve("docs/data");
const archiveDir = path.join(outputDir, "archive");
const anchorPricesPath = path.resolve("config/sidrene-cijene.csv");
const manualChangesPath = path.resolve("config/rucne-izmjene.csv");
const erpBarcodesPath = path.resolve("config/erp-barkodovi.csv");
const brandsPath = path.resolve("config/brendovi.csv");
// Artikli koji se ne objavljuju u cjeniku (testni i tehnički artikli koji nisu u prodaji).
const excludedPath = path.resolve("config/iskljuceni-iz-cjenika.csv");
const feedFile = process.env.WOOLF_FEED_FILE?.trim();
const feedUrl = process.env.WOOLF_FEED_URL?.trim();
const googleFeedFile = process.env.WOOLF_GOOGLE_FEED_FILE?.trim();
const googleFeedUrl = process.env.WOOLF_GOOGLE_FEED_URL?.trim() ||
  "https://woolf.hr/upload_data/p_googlefeed/catalogproduct-1-fwolr5ou.csv";

if (!feedFile && !feedUrl) {
  throw new Error("Nedostaje WOOLF_FEED_URL GitHub Secret.");
}

function unwrap(value = "") {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function decodeEntities(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function valueOf(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(unwrap(match[1])) : "";
}

function safeProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "woolf.hr" ? url.href : "";
  } catch {
    return "";
  }
}

function numberOf(value) {
  let normalized = String(value ?? "").trim().replace(/\s*(EUR|€)\s*/gi, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(".") > normalized.lastIndexOf(",")
      ? normalized.replaceAll(",", "")
      : normalized.replaceAll(".", "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  normalized = normalized.replace(/[^0-9.-]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function parseSemicolonCsv(text) {
  return parseDelimited(text, ";");
}

function normalizeSize(value = "") {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("/", "-")
    .replace(/\s+/g, "");
  return normalized === "XY" ? "" : normalized;
}

function erpBarcodeKey(code, size) {
  return `${String(code ?? "").trim()}|||${normalizeSize(size)}`;
}

function rowsToObjects(text, delimiter = ",") {
  const rows = parseDelimited(text, delimiter);
  const headers = rows.shift() || [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

async function loadConfiguration() {
  const [anchorText, manualText, erpBarcodeText, brandText] = await Promise.all([
    fs.readFile(anchorPricesPath, "utf8"),
    fs.readFile(manualChangesPath, "utf8"),
    fs.readFile(erpBarcodesPath, "utf8"),
    fs.readFile(brandsPath, "utf8")
  ]);
  const anchorRows = parseSemicolonCsv(anchorText).slice(1);
  const manualRows = parseSemicolonCsv(manualText).slice(1);
  const erpRows = parseSemicolonCsv(erpBarcodeText).slice(1);
  const brandRows = parseSemicolonCsv(brandText).slice(1);
  const anchors = new Map();
  const changes = new Map();
  const erpBarcodes = new Map();
  const brands = new Map();

  for (const [code, price] of anchorRows) {
    const parsedPrice = numberOf(price);
    if (code && parsedPrice !== null) anchors.set(code, parsedPrice);
  }

  for (const [code, anchorPrice, saleName, barcode, unit, unitPrice, anchorDate] of manualRows) {
    if (!code) continue;
    changes.set(code, {
      anchorPrice: anchorPrice ? numberOf(anchorPrice) : null,
      saleName: saleName || "",
      barcode: barcode || "",
      unit: unit || "",
      unitPrice: unitPrice ? numberOf(unitPrice) : null,
      anchorDate: anchorDate || "2026-09-10"
    });
  }

  for (const [code, sizeKey, barcode] of erpRows) {
    if (!code || !barcode) continue;
    erpBarcodes.set(erpBarcodeKey(code, sizeKey), barcode);
  }

  for (const [code, brand] of brandRows) {
    if (!code || !brand) continue;
    brands.set(String(code).trim(), String(brand).trim());
  }

  const excluded = new Set();
  try {
    for (const [code] of parseSemicolonCsv(await fs.readFile(excludedPath, "utf8")).slice(1)) {
      if (code) excluded.add(String(code).trim());
    }
  } catch {
    // Datoteka nije obavezna.
  }

  return { anchors, changes, erpBarcodes, brands, excluded };
}

function cleanName(name) {
  return name.replace(/,?\s*\([^()]*\)\s*$/, "").trim();
}

function variantCodeOf(name, model, id) {
  const match = name.match(/\(([^()]*)\)\s*$/);
  return match?.[1]?.trim() || model || id;
}

function naturalSort(values) {
  return [...values].sort((a, b) =>
    String(a).localeCompare(String(b), "hr", { numeric: true, sensitivity: "base" })
  );
}

async function readRemoteOrFile(file, url, accept) {
  if (file) {
    return {
      body: await fs.readFile(path.resolve(file), "utf8"),
      sourceModified: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, {
      headers: {
        accept,
        "user-agent": "Woolf-Cjenik-Sync/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Feed vraća HTTP ${response.status}.`);
    }

    return {
      body: await response.text(),
      sourceModified: response.headers.get("last-modified")
    };
  } finally {
    clearTimeout(timeout);
  }
}

const [jeftinijeFeed, googleFeed, configuration] = await Promise.all([
  readRemoteOrFile(feedFile, feedUrl, "application/xml,text/xml;q=0.9,*/*;q=0.8"),
  readRemoteOrFile(googleFeedFile, googleFeedUrl, "text/csv,text/plain;q=0.9,*/*;q=0.8"),
  loadConfiguration()
]);
const xml = jeftinijeFeed.body;
const sourceModified = jeftinijeFeed.sourceModified;
const itemBlocks = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((match) => match[1]);
const googleRows = rowsToObjects(googleFeed.body, ",");
const todayParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit"
}).formatToParts(new Date());
const todayValue = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
const today = `${todayValue.year}-${todayValue.month}-${todayValue.day}`;
const newlyListed = new Map();

// Sidra koja je modul "Sidro s weba" (cPanel) upisao u admin u trenutku pojave artikla.
// Ako registar nije dostupan, cjenik radi kao prije (današnja cijena + današnji datum).
const webAnchors = new Map();
try {
  const response = await fetch("https://chat.woolf-shop.si/sidro/registar.json", { signal: AbortSignal.timeout(20000) });
  if (response.ok) {
    const registry = await response.json();
    for (const [code, entry] of Object.entries(registry.items || {})) {
      const anchorPrice = Number(entry.price);
      if (code && Number.isFinite(anchorPrice) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) {
        webAnchors.set(code, { anchorPrice, anchorDate: entry.date });
      }
    }
  }
  console.log(`Registar sidara s weba: ${webAnchors.size} stavki.`);
} catch (error) {
  console.log(`Registar sidara s weba nije dostupan (${error.message}); koristi se dosadašnje pravilo.`);
}

// Bazna cijena novog artikla je redovna cijena na dan kad je ušao u ponudu, nikad akcijska
// (Pravilnik o isticanju bazne cijene, NN 132/2026, čl. 3. st. 1. i 5.). Pozivatelj zato
// predaje redovnu cijenu (ili trenutnu, ako artikl nije na akciji).
function anchorFor(model, variantCode, price, manual) {
  const frozen = manual.anchorPrice ?? configuration.anchors.get(variantCode) ?? configuration.anchors.get(model);
  if (frozen !== undefined && frozen !== null) {
    return { anchorPrice: frozen, anchorDate: manual.anchorDate || "2026-09-10" };
  }
  if (!newlyListed.has(model)) {
    const web = webAnchors.get(variantCode) ?? webAnchors.get(model);
    newlyListed.set(model, web ?? { anchorPrice: price, anchorDate: today });
  }
  return newlyListed.get(model);
}

if (itemBlocks.length < 1_000) {
  throw new Error(`Sigurnosna provjera: feed sadrži samo ${itemBlocks.length} varijanti.`);
}

if (googleRows.length < 5_000) {
  throw new Error(`Sigurnosna provjera: Google feed sadrži samo ${googleRows.length} proizvoda.`);
}

const variants = itemBlocks
  .map((item) => {
    const id = valueOf(item, "ID");
    const rawName = valueOf(item, "name");
    const model = valueOf(item, "productModel") || valueOf(item, "groupId") || id;
    const variantCode = variantCodeOf(rawName, model, id);
    const price = numberOf(valueOf(item, "price"));
    const regularPrice = numberOf(valueOf(item, "regularPrice")) ?? price;
    if (!variantCode || price === null || price < 0) return null;
    if (configuration.excluded.has(model) || configuration.excluded.has(variantCode)) return null;

    const size = valueOf(item, "size");
    const manual = configuration.changes.get(variantCode) || configuration.changes.get(model) || {};
    const erpBarcode = configuration.erpBarcodes.get(erpBarcodeKey(model, size))
      || configuration.erpBarcodes.get(erpBarcodeKey(variantCode, size))
      || "";
    const onSale = regularPrice > price;
    const { anchorPrice, anchorDate } = anchorFor(model, variantCode, onSale ? regularPrice : price, manual);
    const inStock = valueOf(item, "stock").toLowerCase() === "in stock";

    return {
      id,
      model,
      variantCode,
      name: cleanName(rawName),
      brand: valueOf(item, "brand") || configuration.brands.get(model) || configuration.brands.get(variantCode) || "",
      category: valueOf(item, "fileUnder"),
      price,
      regularPrice,
      currency: valueOf(item, "curCode") || "EUR",
      link: safeProductUrl(valueOf(item, "link")),
      size,
      color: valueOf(item, "color"),
      barcode: manual.barcode || erpBarcode || valueOf(item, "EAN") || "Nije dodijeljen",
      availability: inStock ? "Dostupno" : "Nedostupno",
      onSale,
      unit: manual.unit || "kom",
      unitPrice: manual.unitPrice ?? price,
      anchorPrice,
      anchorDate,
      specialSale: onSale ? "DA" : "NE",
      saleName: onSale ? (manual.saleName || "Akcija") : ""
    };
  })
  .filter(Boolean)
  .sort((a, b) =>
    a.name.localeCompare(b.name, "hr", { numeric: true, sensitivity: "base" }) ||
    a.variantCode.localeCompare(b.variantCode, "hr", { numeric: true, sensitivity: "base" })
  );

if (variants.length < 1_000) {
  throw new Error(`Sigurnosna provjera: pronađeno je samo ${variants.length} varijanti.`);
}

const productsByModel = new Map();
for (const variant of variants) {
  if (!productsByModel.has(variant.model)) {
    productsByModel.set(variant.model, {
      model: variant.model,
      name: variant.name,
      brand: variant.brand,
      category: variant.category,
      price: variant.price,
      regularPrice: variant.regularPrice,
      currency: variant.currency,
      link: variant.link,
      unit: variant.unit,
      unitPrice: variant.unitPrice,
      anchorPrice: variant.anchorPrice,
      anchorDate: variant.anchorDate,
      specialSale: variant.specialSale,
      saleName: variant.saleName,
      variants: []
    });
  }
  productsByModel.get(variant.model).variants.push({
    code: variant.variantCode,
    size: variant.size,
    color: variant.color,
    barcode: variant.barcode,
    availability: variant.availability
  });
}

const jeftinijeProducts = productsByModel.size;
let googleOnlyProducts = 0;
let googleOverlapProducts = 0;

for (const row of googleRows) {
  const model = String(row.ID2 || "").trim();
  if (!model || configuration.excluded.has(model)) continue;
  if (productsByModel.has(model)) {
    googleOverlapProducts += 1;
    continue;
  }

  const price = numberOf(row["Sale price"] || row.Price);
  const regularPrice = numberOf(row.Price) ?? price;
  if (price === null || price < 0) continue;

  const manual = configuration.changes.get(model) || {};
  const erpBarcode = configuration.erpBarcodes.get(erpBarcodeKey(model, "")) || "";
  const onSale = regularPrice > price;
  const { anchorPrice, anchorDate } = anchorFor(model, model, onSale ? regularPrice : price, manual);
  productsByModel.set(model, {
    model,
    name: String(row["Item title"] || model).trim(),
    brand: configuration.brands.get(model) || "",
    category: String(row["Item category"] || "").replaceAll(" > ", " - "),
    price,
    regularPrice,
    currency: "EUR",
    link: safeProductUrl(row["Final URL"]),
    unit: manual.unit || "kom",
    unitPrice: manual.unitPrice ?? price,
    anchorPrice,
    anchorDate,
    specialSale: onSale ? "DA" : "NE",
    saleName: onSale ? (manual.saleName || "Akcija") : "",
    variants: [{
      code: model,
      size: "",
      color: "",
      barcode: manual.barcode || erpBarcode || "Nije dodijeljen",
      availability: "Nedostupno"
    }]
  });
  googleOnlyProducts += 1;
}

if (googleOverlapProducts < 1_000 || googleOnlyProducts < 5_000) {
  throw new Error(`Sigurnosna provjera spajanja nije prošla: ${googleOverlapProducts} preklapanja i ${googleOnlyProducts} Google dopuna.`);
}

const products = [...productsByModel.values()]
  .map((product) => {
    const available = product.variants.some((variant) => variant.availability === "Dostupno");
    const assignedBarcodes = [...new Set(product.variants
      .map((variant) => variant.barcode)
      .filter((barcode) => barcode && barcode !== "Nije dodijeljen"))];
    const variantSummary = product.variants.map((variant) => {
      const label = variant.size ? `Veličina ${variant.size}` : variant.code;
      const color = variant.color ? `, ${variant.color}` : "";
      return `${label}${color}: ${variant.availability}`;
    }).join(" | ");
    const barcodeSummary = product.variants
      .filter((variant) => variant.barcode !== "Nije dodijeljen")
      .map((variant) => `${variant.size || variant.code}: ${variant.barcode}`)
      .join(" | ");
    return {
      ...product,
      availability: available ? "Dostupno" : "Nedostupno",
      barcode: assignedBarcodes.join(", ") || "Nije dodijeljen",
      variantSummary,
      barcodeSummary: barcodeSummary || "Nije dodijeljen"
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "hr", { numeric: true, sensitivity: "base" }));

const allVariants = products.flatMap((product) => product.variants);
const availableVariants = allVariants.filter((variant) => variant.availability === "Dostupno").length;
const unavailableVariants = allVariants.length - availableVariants;
const missingBarcodes = allVariants.filter((variant) => variant.barcode === "Nije dodijeljen").length;
const productsWithBrand = products.filter((product) => product.brand).length;
const productsWithoutBrand = products.length - productsWithBrand;

const now = new Date();
const displayDate = new Intl.DateTimeFormat("hr-HR", {
  timeZone: "Europe/Zagreb",
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
}).format(now);
const metadata = {
  generatedAt: now.toISOString(),
  sourceModifiedAt: sourceModified ? new Date(sourceModified).toISOString() : null,
  googleSourceModifiedAt: googleFeed.sourceModified ? new Date(googleFeed.sourceModified).toISOString() : null,
  products: products.length,
  variants: allVariants.length,
  jeftinijeProducts,
  googleOnlyProducts,
  googleOverlapProducts,
  availableVariants,
  unavailableVariants,
  missingBarcodes,
  productsWithBrand,
  productsWithoutBrand,
  currency: "EUR"
};

// ---------------------------------------------------------------------------
// Oblik cjenika prema Pravilniku o načinu objave cjenika proizvoda (NN 132/2026),
// na snazi od 17. 11. 2026.:
// - prvi redak su nazivi stupaca (bez zaglavlja tvrtke iznad tablice; podaci o
//   trgovcu i prodajnom mjestu nalaze se u nazivu datoteke, čl. 6. st. 3.)
// - prvih 11 stupaca točno redom iz čl. 3. st. 2.; naši dodatni stupci idu iza
// - UTF-8, stupci odvojeni znakom ";" (čl. 6. st. 6. i 7.)
// Interni podaci (products.json, config/*) ostaju nepromijenjeni.
// ---------------------------------------------------------------------------
const TRGOVAC = {
  naziv: "Woolf d.o.o.",
  oib: "45374311169",
  adresa: "Ograda 14, Vratišinec",
  adresaUNazivu: "Ograda-14-Vratisinec",
  oblikProdajnogMjesta: "Webshop",
  oznakaProdajnogMjesta: "160",
  brojSkladista: "02"
};
const NEMA_BARKODA = "Nije dodijeljen";

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function moneyCsv(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

// Interni zapis koristi "Nije dodijeljen"; u javnom cjeniku to je prazno polje.
function publicBarcodes(value) {
  return String(value ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code && code !== NEMA_BARKODA);
}

// EAN/GTIN (8, 12, 13 ili 14 znamenki) s ispravnom kontrolnom znamenkom.
function isEan(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const csvHeader = [
  // čl. 3. st. 2. Pravilnika – ovim redom
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
  "Bazna cijena (EUR)",
  // dodatni podaci
  "Datum bazne cijene",
  "Naziv posebnog oblika prodaje",
  "Redovna cijena prije akcije (EUR)",
  "Dostupnost",
  "Varijante i dostupnost",
  "Barkodovi varijanti",
  "Kategorija",
  "Poveznica"
];

const csvRows = products.map((product) => {
  const barcodes = publicBarcodes(product.barcode);
  return [
    product.name,
    product.model,
    product.brand,
    "",
    product.unit,
    moneyCsv(product.price),
    product.specialSale,
    moneyCsv(product.unitPrice),
    barcodes.join(", "),
    barcodes.filter(isEan).join(", "),
    moneyCsv(product.anchorPrice),
    product.anchorDate,
    product.saleName,
    moneyCsv(product.regularPrice),
    product.availability,
    product.variantSummary,
    product.barcodeSummary === NEMA_BARKODA ? "" : product.barcodeSummary,
    product.category,
    product.link
  ];
});

const csv = "﻿" + [csvHeader, ...csvRows]
  .map((row) => row.map(csvCell).join(";"))
  .join("\r\n") + "\r\n";

function xmlCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildPriceXml(sequence) {
  const header = [
    "  <zaglavlje>",
    `    <naziv>${xmlCell(TRGOVAC.naziv)}</naziv>`,
    `    <oib>${TRGOVAC.oib}</oib>`,
    `    <adresaSjedista>${xmlCell(TRGOVAC.adresa)}</adresaSjedista>`,
    `    <oblikProdajnogMjesta>${xmlCell(TRGOVAC.oblikProdajnogMjesta)}</oblikProdajnogMjesta>`,
    `    <oznakaProdajnogMjesta>${TRGOVAC.oznakaProdajnogMjesta}</oznakaProdajnogMjesta>`,
    `    <brojSkladista>${TRGOVAC.brojSkladista}</brojSkladista>`,
    "    <vrstaCjenika>ROBA</vrstaCjenika>",
    `    <brojPohrane>${sequence}</brojPohrane>`,
    `    <datumCjenika>${xmlCell(displayDate)}</datumCjenika>`,
    "  </zaglavlje>"
  ].join("\n");
  const items = products.map((product) => {
    const barcodes = publicBarcodes(product.barcode);
    const variantsXml = product.variants.map((variant) => [
      "      <varijanta>",
      `        <sifra>${xmlCell(variant.code)}</sifra>`,
      `        <velicina>${xmlCell(variant.size)}</velicina>`,
      `        <boja>${xmlCell(variant.color)}</boja>`,
      `        <barkod>${xmlCell(variant.barcode === NEMA_BARKODA ? "" : variant.barcode)}</barkod>`,
      `        <dostupnost>${variant.availability}</dostupnost>`,
      "      </varijanta>"
    ].join("\n")).join("\n");
    return [
      "  <proizvod>",
      `    <naziv>${xmlCell(product.name)}</naziv>`,
      `    <sifra>${xmlCell(product.model)}</sifra>`,
      `    <marka>${xmlCell(product.brand)}</marka>`,
      "    <netoKolicina></netoKolicina>",
      `    <jedinicaMjere>${xmlCell(product.unit)}</jedinicaMjere>`,
      `    <maloprodajnaCijena>${Number(product.price).toFixed(2)}</maloprodajnaCijena>`,
      `    <posebanOblikProdaje>${product.specialSale}</posebanOblikProdaje>`,
      `    <cijenaZaJedinicuMjere>${Number(product.unitPrice).toFixed(2)}</cijenaZaJedinicuMjere>`,
      `    <barkod>${xmlCell(barcodes.join(", "))}</barkod>`,
      `    <eanBarkod>${xmlCell(barcodes.filter(isEan).join(", "))}</eanBarkod>`,
      `    <baznaCijena>${Number(product.anchorPrice).toFixed(2)}</baznaCijena>`,
      `    <datumBazneCijene>${xmlCell(product.anchorDate)}</datumBazneCijene>`,
      `    <nazivPosebnogOblikaProdaje>${xmlCell(product.saleName)}</nazivPosebnogOblikaProdaje>`,
      `    <redovnaCijenaPrijeAkcije>${Number(product.regularPrice).toFixed(2)}</redovnaCijenaPrijeAkcije>`,
      `    <dostupnost>${product.availability}</dostupnost>`,
      `    <kategorija>${xmlCell(product.category)}</kategorija>`,
      `    <poveznica>${xmlCell(product.link)}</poveznica>`,
      "    <varijante>",
      variantsXml,
      "    </varijante>",
      "  </proizvod>"
    ].join("\n");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<cjenik vrsta="ROBA" datumVrijeme="${metadata.generatedAt}" valuta="EUR">\n${header}\n${items.join("\n")}\n</cjenik>\n`;
}

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zagreb",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).formatToParts(now);

const dateValue = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
const archiveDate = `${dateValue.year}-${dateValue.month}-${dateValue.day}`;
const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zagreb",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
}).formatToParts(now);
const timeValue = Object.fromEntries(timeParts.map((part) => [part.type, part.value]));
// Vremenska oznaka objave u nazivu datoteke: GGGGMMDD_SSMM (čl. 6. st. 3. Pravilnika).
const publishStamp = `${dateValue.year}${dateValue.month}${dateValue.day}_${timeValue.hour}${timeValue.minute}`;
const archiveIndexPath = path.join(archiveDir, "index.json");
const retentionDays = 30;
const cutoff = new Date(`${archiveDate}T12:00:00Z`);
// Datum objave zadrži punih 30 dana, čak i kad se isti dan objavi novi cjenik.
cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
const cutoffDate = cutoff.toISOString().slice(0, 10);

let archiveEntries = [];
let lastSequence = 2;
try {
  const existingIndex = JSON.parse(await fs.readFile(archiveIndexPath, "utf8"));
  if (Array.isArray(existingIndex.entries)) archiveEntries = existingIndex.entries;
  const recorded = Number(existingIndex.lastSequence);
  if (Number.isSafeInteger(recorded) && recorded >= 2) lastSequence = recorded;
  for (const entry of archiveEntries) {
    const match = String(entry.csvFilename || "").match(/^webshop-Ograda-14-Vratisinec-160-(\d+)-/) ||
      String(entry.csvFilename || "").match(/^\d{11}_[^_]+_[^_]+_\d+_ROBA_(\d+)_\d{8}_\d{4}\./);
    if (match) lastSequence = Math.max(lastSequence, Number(match[1]));
  }
} catch {
  // Prvo pokretanje nema postojeću arhivu.
}
const sequence = lastSequence + 1;
// OIB _ prodajno mjesto _ adresa _ oznaka prodajnog mjesta _ ROBA _ broj pohrane _ GGGGMMDD_SSMM
const filenameBase = [
  TRGOVAC.oib,
  TRGOVAC.oblikProdajnogMjesta,
  TRGOVAC.adresaUNazivu,
  TRGOVAC.oznakaProdajnogMjesta,
  "ROBA",
  sequence,
  publishStamp
].join("_");
const priceXml = buildPriceXml(sequence);
const archiveCsvFilename = `${filenameBase}.csv`;
const archiveXmlFilename = `${filenameBase}.xml`;

archiveEntries = [
  {
    date: archiveDate,
    csvFilename: archiveCsvFilename,
    xmlFilename: archiveXmlFilename,
    generatedAt: metadata.generatedAt,
    products: metadata.products,
    variants: metadata.variants
  },
  ...archiveEntries
]
  .filter((entry) => entry.date >= cutoffDate)
  .sort((a, b) => b.date.localeCompare(a.date));

const archiveIndex = {
  updatedAt: metadata.generatedAt,
  retentionDays,
  lastSequence: sequence,
  entries: archiveEntries
};

await fs.mkdir(archiveDir, { recursive: true });
const archiveFiles = await fs.readdir(archiveDir);
await Promise.all(
  archiveFiles
    .filter((filename) => {
      const rulebookMatch = filename.match(/^\d{11}_[^_]+_[^_]+_\d+_ROBA_\d+_(\d{4})(\d{2})(\d{2})_\d{4}\.(csv|xml)$/);
      const rulebookDate = rulebookMatch ? `${rulebookMatch[1]}-${rulebookMatch[2]}-${rulebookMatch[3]}` : "";
      const legalMatch = filename.match(/^webshop-Ograda-14-Vratisinec-160-\d+-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}(?:-\d{2})?\.(csv|xml)$/);
      const currentMatch = filename.match(/^cjenik-Woolf-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}\.(csv|xml)$/);
      const oldOutletMatch = filename.match(/^webshop-Istarsko-naselje-3A-WOOLF-ONLINE-001-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}\.(csv|xml)$/);
      const legacyMatch = filename.match(/^cjenik-(\d{4}-\d{2}-\d{2})\.(csv|xml)$/);
      const fileDate = rulebookDate || legalMatch?.[1] || currentMatch?.[1] || oldOutletMatch?.[1] || legacyMatch?.[1];
      return fileDate && fileDate < cutoffDate && filename !== archiveCsvFilename && filename !== archiveXmlFilename;
    })
    .map((filename) => fs.unlink(path.join(archiveDir, filename)))
);
await Promise.all([
  fs.writeFile(path.join(outputDir, "products.json"), JSON.stringify({ metadata, products })),
  fs.writeFile(path.join(outputDir, "cjenik.csv"), csv),
  fs.writeFile(path.join(outputDir, "cjenik.xml"), priceXml),
  fs.writeFile(path.join(outputDir, "status.json"), JSON.stringify(metadata, null, 2)),
  fs.writeFile(path.join(archiveDir, archiveCsvFilename), csv),
  fs.writeFile(path.join(archiveDir, archiveXmlFilename), priceXml),
  fs.writeFile(archiveIndexPath, JSON.stringify(archiveIndex, null, 2))
]);

if (newlyListed.size) {
  const rows = [...newlyListed].map(([code, entry]) =>
    [code, entry.anchorPrice.toFixed(2), "", "", "", "", entry.anchorDate].join(";")
  );
  await fs.appendFile(manualChangesPath, `${rows.join("\n")}\n`);
}

console.log(`Cjenik ${archiveDate} arhiviran: ${metadata.products} proizvoda (${jeftinijeProducts} iz Jeftinije + ${googleOnlyProducts} nedostupnih iz Google dopune) i ${metadata.variants} zapisa varijanti (${availableVariants} dostupno, ${unavailableVariants} nedostupno). Brend je dodijeljen za ${productsWithBrand} proizvoda, ${productsWithoutBrand} je bez brenda. Čuva se posljednjih ${retentionDays} dana.`);
if (missingBarcodes > 0) console.log(`Barkod nije dodijeljen za ${missingBarcodes} varijanti; koristi se šifra artikla kao glavni identifikator.`);
