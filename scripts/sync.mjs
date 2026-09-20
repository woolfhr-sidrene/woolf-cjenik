import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve("docs/data");
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

function cleanName(name) {
  return name.replace(/,?\s*\([^()]*\)\s*$/, "").trim();
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

const { xml, sourceModified } = await readFeed();
const itemBlocks = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((match) => match[1]);

if (itemBlocks.length < 1_000) {
  throw new Error(`Sigurnosna provjera: feed sadrži samo ${itemBlocks.length} varijanti.`);
}

const productsByKey = new Map();

for (const item of itemBlocks) {
  const link = safeProductUrl(valueOf(item, "link"));
  const model = valueOf(item, "productModel") || valueOf(item, "groupId");
  const key = link || model;
  const price = numberOf(valueOf(item, "price"));
  const regularPrice = numberOf(valueOf(item, "regularPrice"));

  if (!key || price === null || price < 0) continue;

  if (!productsByKey.has(key)) {
    productsByKey.set(key, {
      id: valueOf(item, "groupId") || model,
      model,
      name: cleanName(valueOf(item, "name")),
      brand: valueOf(item, "brand"),
      category: valueOf(item, "fileUnder"),
      price,
      regularPrice: regularPrice ?? price,
      currency: valueOf(item, "curCode") || "EUR",
      link,
      sizes: new Set(),
      colors: new Set(),
      eans: new Set(),
      totalVariants: 0,
      inStockVariants: 0
    });
  }

  const product = productsByKey.get(key);
  const size = valueOf(item, "size");
  const color = valueOf(item, "color");
  const ean = valueOf(item, "EAN");

  product.totalVariants += 1;
  if (valueOf(item, "stock").toLowerCase() === "in stock") {
    product.inStockVariants += 1;
    if (size) product.sizes.add(size);
  }
  if (color) product.colors.add(color);
  if (ean) product.eans.add(ean);
}

const products = [...productsByKey.values()]
  .filter((product) => product.inStockVariants > 0)
  .map((product) => ({
    ...product,
    sizes: naturalSort(product.sizes),
    colors: naturalSort(product.colors),
    eans: naturalSort(product.eans),
    onSale: product.regularPrice > product.price
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "hr", { numeric: true, sensitivity: "base" }));

if (products.length < 500) {
  throw new Error(`Sigurnosna provjera: pronađeno je samo ${products.length} dostupnih proizvoda.`);
}

const now = new Date();
const metadata = {
  generatedAt: now.toISOString(),
  sourceModifiedAt: sourceModified ? new Date(sourceModified).toISOString() : null,
  products: products.length,
  variants: itemBlocks.length,
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
  "Šifra",
  "Naziv proizvoda",
  "Brend",
  "Kategorija",
  "Aktualna cijena (EUR)",
  "Redovna cijena (EUR)",
  "Dostupne veličine",
  "Boja",
  "Dostupnost",
  "Poveznica"
];

const csvRows = products.map((product) => [
  product.model,
  product.name,
  product.brand,
  product.category,
  moneyCsv(product.price),
  moneyCsv(product.regularPrice),
  product.sizes.join(", "),
  product.colors.join(", "),
  "Dostupno",
  product.link
]);

const csv = "\uFEFF" + [csvHeader, ...csvRows]
  .map((row) => row.map(csvCell).join(";"))
  .join("\r\n");

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, "products.json"), JSON.stringify({ metadata, products })),
  fs.writeFile(path.join(outputDir, "cjenik.csv"), csv),
  fs.writeFile(path.join(outputDir, "status.json"), JSON.stringify(metadata, null, 2))
]);

console.log(`Cjenik izrađen: ${products.length} proizvoda iz ${itemBlocks.length} varijanti.`);
