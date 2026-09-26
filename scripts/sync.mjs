import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve("docs/data");
const archiveDir = path.join(outputDir, "archive");
const anchorPricesPath = path.resolve("config/sidrene-cijene.csv");
const manualChangesPath = path.resolve("config/rucne-izmjene.csv");
const erpBarcodesPath = path.resolve("config/erp-barkodovi.csv");
const brandsPath = path.resolve("config/brendovi.csv");
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

  return { anchors, changes, erpBarcodes, brands };
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

function anchorFor(model, variantCode, price, manual) {
  const frozen = manual.anchorPrice ?? configuration.anchors.get(variantCode) ?? configuration.anchors.get(model);
  if (frozen !== undefined && frozen !== null) {
    return { anchorPrice: frozen, anchorDate: manual.anchorDate || "2026-09-10" };
  }
  if (!newlyListed.has(model)) newlyListed.set(model, { anchorPrice: price, anchorDate: today });
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

    const size = valueOf(item, "size");
    const manual = configuration.changes.get(variantCode) || configuration.changes.get(model) || {};
    const erpBarcode = configuration.erpBarcodes.get(erpBarcodeKey(model, size))
      || configuration.erpBarcodes.get(erpBarcodeKey(variantCode, size))
      || "";
    const onSale = regularPrice > price;
    const { anchorPrice, anchorDate } = anchorFor(model, variantCode, price, manual);
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
  if (!model) continue;
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
  const { anchorPrice, anchorDate } = anchorFor(model, model, price, manual);
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

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function moneyCsv(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

const csvHeader = [
  "Naziv proizvoda",
  "Šifra",
  "Marka",
  "Jedinica mjere",
  "Cijena za jedinicu mjere (EUR)",
  "Redovna cijena prije akcije (EUR)",
  "Maloprodajna cijena (EUR)",
  "Poseban oblik prodaje",
  "Naziv posebnog oblika prodaje",
  "Sidrena cijena (EUR)",
  "Barkod",
  "Dostupnost",
  "Varijante i dostupnost",
  "Barkodovi varijanti",
  "Kategorija",
  "Poveznica",
  "Datum sidrene cijene"
];

const csvRows = products.map((product) => [
  product.name,
  product.model,
  product.brand,
  product.unit,
  moneyCsv(product.unitPrice),
  moneyCsv(product.regularPrice),
  moneyCsv(product.price),
  product.specialSale,
  product.saleName,
  moneyCsv(product.anchorPrice),
  product.barcode,
  product.availability,
  product.variantSummary,
  product.barcodeSummary,
  product.category,
  product.link,
  product.anchorDate
]);

const csvInfo = [
  ["Naziv", "Woolf d.o.o."],
  ["Adresa sjedišta", "Ograda 14, Vratišinec"],
  ["OIB", "45374311169"],
  ["Oblik prodajnog objekta", "Webshop"],
  ["Oznaka prodajnog prostora", "160"],
  ["Broj skladišta", "02"],
  ["Datum cjenika", displayDate]
];

const csv = "\uFEFF" + [...csvInfo, [], csvHeader, ...csvRows]
  .map((row) => row.map(csvCell).join(";"))
  .join("\r\n");

function xmlCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const priceXml = `<?xml version="1.0" encoding="UTF-8"?>\n<cjenik datumVrijeme="${metadata.generatedAt}" valuta="EUR">\n  <zaglavlje>\n    <naziv>Woolf d.o.o.</naziv>\n    <adresaSjedista>Ograda 14, Vratišinec</adresaSjedista>\n    <oib>45374311169</oib>\n    <oblikProdajnogObjekta>Webshop</oblikProdajnogObjekta>\n    <oznakaProdajnogProstora>160</oznakaProdajnogProstora>\n    <brojSkladista>02</brojSkladista>\n    <datumCjenika>${xmlCell(displayDate)}</datumCjenika>\n  </zaglavlje>\n${products.map((product) => `  <proizvod>\n    <naziv>${xmlCell(product.name)}</naziv>\n    <sifra>${xmlCell(product.model)}</sifra>\n    <marka>${xmlCell(product.brand)}</marka>\n    <jedinicaMjere>${xmlCell(product.unit)}</jedinicaMjere>\n    <cijenaZaJedinicuMjere>${Number(product.unitPrice).toFixed(2)}</cijenaZaJedinicuMjere>\n    <maloprodajnaCijena>${Number(product.price).toFixed(2)}</maloprodajnaCijena>\n    <posebanOblikProdaje>${product.specialSale}</posebanOblikProdaje>\n    <nazivPosebnogOblikaProdaje>${xmlCell(product.saleName)}</nazivPosebnogOblikaProdaje>\n    <sidrenaCijena>${Number(product.anchorPrice).toFixed(2)}</sidrenaCijena>\n    <datumSidreneCijene>${xmlCell(product.anchorDate)}</datumSidreneCijene>\n    <barkod>${xmlCell(product.barcode)}</barkod>\n    <dostupnost>${product.availability}</dostupnost>\n    <kategorija>${xmlCell(product.category)}</kategorija>\n    <poveznica>${xmlCell(product.link)}</poveznica>\n    <varijante>\n${product.variants.map((variant) => `      <varijanta>\n        <sifra>${xmlCell(variant.code)}</sifra>\n        <velicina>${xmlCell(variant.size)}</velicina>\n        <boja>${xmlCell(variant.color)}</boja>\n        <barkod>${xmlCell(variant.barcode)}</barkod>\n        <dostupnost>${variant.availability}</dostupnost>\n      </varijanta>`).join("\n")}\n    </varijante>\n  </proizvod>`).join("\n")}\n</cjenik>\n`;

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
  hourCycle: "h23"
}).formatToParts(now);
const timeValue = Object.fromEntries(timeParts.map((part) => [part.type, part.value]));
const archiveStamp = `${archiveDate}-${timeValue.hour}-${timeValue.minute}`;
const filenameBase = `webshop-Ograda-14-Vratisinec-160-02-${archiveStamp}`;
const archiveCsvFilename = `${filenameBase}.csv`;
const archiveXmlFilename = `${filenameBase}.xml`;
const archiveIndexPath = path.join(archiveDir, "index.json");
const retentionDays = 30;
const cutoff = new Date(`${archiveDate}T12:00:00Z`);
cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
const cutoffDate = cutoff.toISOString().slice(0, 10);

let archiveEntries = [];
try {
  const existingIndex = JSON.parse(await fs.readFile(archiveIndexPath, "utf8"));
  if (Array.isArray(existingIndex.entries)) archiveEntries = existingIndex.entries;
} catch {
  // Prvo pokretanje nema postojeću arhivu.
}

archiveEntries = [
  {
    date: archiveDate,
    csvFilename: archiveCsvFilename,
    xmlFilename: archiveXmlFilename,
    generatedAt: metadata.generatedAt,
    products: metadata.products,
    variants: metadata.variants
  },
  ...archiveEntries.filter((entry) => entry.date !== archiveDate)
]
  .filter((entry) => entry.date >= cutoffDate)
  .sort((a, b) => b.date.localeCompare(a.date));

const archiveIndex = {
  updatedAt: metadata.generatedAt,
  retentionDays,
  entries: archiveEntries
};

await fs.mkdir(archiveDir, { recursive: true });
const archiveFiles = await fs.readdir(archiveDir);
await Promise.all(
  archiveFiles
    .filter((filename) => {
      const legalMatch = filename.match(/^webshop-Ograda-14-Vratisinec-160-02-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}\.(csv|xml)$/);
      const currentMatch = filename.match(/^cjenik-Woolf-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}\.(csv|xml)$/);
      const oldOutletMatch = filename.match(/^webshop-Istarsko-naselje-3A-WOOLF-ONLINE-001-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}\.(csv|xml)$/);
      const legacyMatch = filename.match(/^cjenik-(\d{4}-\d{2}-\d{2})\.(csv|xml)$/);
      const fileDate = legalMatch?.[1] || currentMatch?.[1] || oldOutletMatch?.[1] || legacyMatch?.[1];
      return fileDate && (fileDate < cutoffDate || fileDate === archiveDate) && filename !== archiveCsvFilename && filename !== archiveXmlFilename;
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
