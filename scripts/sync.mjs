import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve("docs/data");
const archiveDir = path.join(outputDir, "archive");
const anchorPricesPath = path.resolve("config/sidrene-cijene.csv");
const manualChangesPath = path.resolve("config/rucne-izmjene.csv");
const feedFile = process.env.WOOLF_FEED_FILE?.trim();
const feedUrl = process.env.WOOLF_FEED_URL?.trim();

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
  const number = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseSemicolonCsv(text) {
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
    } else if (character === ";" && !quoted) {
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

async function loadConfiguration() {
  const anchorRows = parseSemicolonCsv(await fs.readFile(anchorPricesPath, "utf8")).slice(1);
  const manualRows = parseSemicolonCsv(await fs.readFile(manualChangesPath, "utf8")).slice(1);
  const anchors = new Map();
  const changes = new Map();

  for (const [code, price] of anchorRows) {
    const parsedPrice = numberOf(price);
    if (code && parsedPrice !== null) anchors.set(code, parsedPrice);
  }

  for (const [code, anchorPrice, saleName, barcode, unit, unitPrice] of manualRows) {
    if (!code) continue;
    changes.set(code, {
      anchorPrice: anchorPrice ? numberOf(anchorPrice) : null,
      saleName: saleName || "",
      barcode: barcode || "",
      unit: unit || "",
      unitPrice: unitPrice ? numberOf(unitPrice) : null
    });
  }

  return { anchors, changes };
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

async function readFeed() {
  if (feedFile) {
    return {
      xml: await fs.readFile(path.resolve(feedFile), "utf8"),
      sourceModified: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(feedUrl, {
      headers: {
        accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Woolf-Cjenik-Sync/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Feed vraća HTTP ${response.status}.`);
    }

    return {
      xml: await response.text(),
      sourceModified: response.headers.get("last-modified")
    };
  } finally {
    clearTimeout(timeout);
  }
}

const [{ xml, sourceModified }, configuration] = await Promise.all([
  readFeed(),
  loadConfiguration()
]);
const itemBlocks = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((match) => match[1]);

if (itemBlocks.length < 1_000) {
  throw new Error(`Sigurnosna provjera: feed sadrži samo ${itemBlocks.length} varijanti.`);
}

const products = itemBlocks
  .map((item) => {
    const id = valueOf(item, "ID");
    const rawName = valueOf(item, "name");
    const model = valueOf(item, "productModel") || valueOf(item, "groupId") || id;
    const variantCode = variantCodeOf(rawName, model, id);
    const price = numberOf(valueOf(item, "price"));
    const regularPrice = numberOf(valueOf(item, "regularPrice")) ?? price;
    if (!variantCode || price === null || price < 0) return null;

    const manual = configuration.changes.get(variantCode) || configuration.changes.get(model) || {};
    const onSale = regularPrice > price;
    const anchorPrice = manual.anchorPrice ?? configuration.anchors.get(variantCode) ?? configuration.anchors.get(model) ?? price;
    const inStock = valueOf(item, "stock").toLowerCase() === "in stock";

    return {
      id,
      model,
      variantCode,
      name: cleanName(rawName),
      brand: valueOf(item, "brand"),
      category: valueOf(item, "fileUnder"),
      price,
      regularPrice,
      currency: valueOf(item, "curCode") || "EUR",
      link: safeProductUrl(valueOf(item, "link")),
      size: valueOf(item, "size"),
      color: valueOf(item, "color"),
      barcode: manual.barcode || valueOf(item, "EAN"),
      availability: inStock ? "Dostupno" : "Nedostupno",
      onSale,
      unit: manual.unit || "kom",
      unitPrice: manual.unitPrice ?? price,
      anchorPrice,
      specialSale: onSale ? "DA" : "NE",
      saleName: onSale ? (manual.saleName || "Akcija") : ""
    };
  })
  .filter(Boolean)
  .sort((a, b) =>
    a.name.localeCompare(b.name, "hr", { numeric: true, sensitivity: "base" }) ||
    a.variantCode.localeCompare(b.variantCode, "hr", { numeric: true, sensitivity: "base" })
  );

if (products.length < 1_000) {
  throw new Error(`Sigurnosna provjera: pronađeno je samo ${products.length} varijanti.`);
}

const uniqueModels = new Set(products.map((product) => product.model));
const availableVariants = products.filter((product) => product.availability === "Dostupno").length;
const unavailableVariants = products.length - availableVariants;
const missingBarcodes = products.filter((product) => !product.barcode).length;

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
  products: uniqueModels.size,
  variants: products.length,
  availableVariants,
  unavailableVariants,
  missingBarcodes,
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
  "Maloprodajna cijena (EUR)",
  "Poseban oblik prodaje",
  "Naziv posebnog oblika prodaje",
  "Sidrena cijena – cijena na dan 10. 09. 2026. (EUR)",
  "Barkod",
  "Dostupnost",
  "Veličina",
  "Boja",
  "Kategorija",
  "Poveznica"
];

const csvRows = products.map((product) => [
  product.name,
  product.variantCode,
  product.brand,
  product.unit,
  moneyCsv(product.unitPrice),
  moneyCsv(product.price),
  product.specialSale,
  product.saleName,
  moneyCsv(product.anchorPrice),
  product.barcode,
  product.availability,
  product.size,
  product.color,
  product.category,
  product.link
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

const priceXml = `<?xml version="1.0" encoding="UTF-8"?>\n<cjenik datumVrijeme="${metadata.generatedAt}" valuta="EUR">\n  <zaglavlje>\n    <naziv>Woolf d.o.o.</naziv>\n    <adresaSjedista>Ograda 14, Vratišinec</adresaSjedista>\n    <oib>45374311169</oib>\n    <oblikProdajnogObjekta>Webshop</oblikProdajnogObjekta>\n    <oznakaProdajnogProstora>160</oznakaProdajnogProstora>\n    <brojSkladista>02</brojSkladista>\n    <datumCjenika>${xmlCell(displayDate)}</datumCjenika>\n  </zaglavlje>\n${products.map((product) => `  <proizvod>\n    <naziv>${xmlCell(product.name)}</naziv>\n    <sifra>${xmlCell(product.variantCode)}</sifra>\n    <marka>${xmlCell(product.brand)}</marka>\n    <jedinicaMjere>${xmlCell(product.unit)}</jedinicaMjere>\n    <cijenaZaJedinicuMjere>${Number(product.unitPrice).toFixed(2)}</cijenaZaJedinicuMjere>\n    <maloprodajnaCijena>${Number(product.price).toFixed(2)}</maloprodajnaCijena>\n    <posebanOblikProdaje>${product.specialSale}</posebanOblikProdaje>\n    <nazivPosebnogOblikaProdaje>${xmlCell(product.saleName)}</nazivPosebnogOblikaProdaje>\n    <sidrenaCijena>${Number(product.anchorPrice).toFixed(2)}</sidrenaCijena>\n    <barkod>${xmlCell(product.barcode)}</barkod>\n    <dostupnost>${product.availability}</dostupnost>\n    <velicina>${xmlCell(product.size)}</velicina>\n    <boja>${xmlCell(product.color)}</boja>\n    <kategorija>${xmlCell(product.category)}</kategorija>\n    <poveznica>${xmlCell(product.link)}</poveznica>\n  </proizvod>`).join("\n")}\n</cjenik>\n`;

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

console.log(`Cjenik ${archiveDate} arhiviran: ${metadata.products} proizvoda i ${metadata.variants} varijanti (${availableVariants} dostupno, ${unavailableVariants} nedostupno). Čuva se posljednjih ${retentionDays} dana.`);
if (missingBarcodes > 0) {
  console.warn(`Upozorenje: izvorni feed nema barkod za ${missingBarcodes} varijanti; polje je ostavljeno prazno i može se dopuniti kroz config/rucne-izmjene.csv.`);
}
