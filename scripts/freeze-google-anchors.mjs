import fs from "node:fs/promises";
import path from "node:path";

const jeftinijeXmlPath = process.argv[2];
const googleCsvPath = process.argv[3];
if (!jeftinijeXmlPath || !googleCsvPath) {
  throw new Error("Upotreba: node scripts/freeze-google-anchors.mjs PUTANJA_DO_JEFTINIJE_XML PUTANJA_DO_GOOGLE_CSV");
}

function unwrap(value = "") {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeEntities(value = "") {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function valueOf(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(unwrap(match[1])) : "";
}

function parseDelimited(text, delimiter) {
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

function numberOf(value) {
  let normalized = String(value ?? "").trim().replace(/\s*(EUR|€)\s*/gi, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(".") > normalized.lastIndexOf(",")
      ? normalized.replaceAll(",", "")
      : normalized.replaceAll(".", "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const number = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const anchorsPath = path.resolve("config/sidrene-cijene.csv");
const [jeftinijeText, googleText] = await Promise.all([
  fs.readFile(path.resolve(jeftinijeXmlPath), "utf8"),
  fs.readFile(path.resolve(googleCsvPath), "utf8")
]);

const anchors = new Map();
for (const match of jeftinijeText.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
  const item = match[1];
  const model = valueOf(item, "productModel") || valueOf(item, "groupId") || valueOf(item, "ID");
  const price = numberOf(valueOf(item, "price"));
  if (model && price !== null && !anchors.has(model)) anchors.set(model, price);
}
const jeftinijeCount = anchors.size;

const googleRows = parseDelimited(googleText, ",");
const headers = googleRows.shift() || [];
const codeIndex = headers.indexOf("ID2");
const priceIndex = headers.indexOf("Price");
if (codeIndex < 0 || priceIndex < 0) throw new Error("Google CSV nema očekivana polja ID2 i Price.");

let added = 0;
for (const row of googleRows) {
  const code = String(row[codeIndex] || "").trim();
  const price = numberOf(row[priceIndex]);
  if (!code || price === null || anchors.has(code)) continue;
  anchors.set(code, price);
  added += 1;
}

const sorted = [...anchors.entries()].sort((a, b) =>
  a[0].localeCompare(b[0], "hr", { numeric: true, sensitivity: "base" })
);
const output = "\uFEFF" + [
  ["Šifra", "Sidrena cijena (EUR)"],
  ...sorted.map(([code, price]) => [code, price.toFixed(2).replace(".", ",")])
].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";

await fs.writeFile(anchorsPath, output);
console.log(`Sidrene cijene zaključane: ${anchors.size} šifri (${jeftinijeCount} iz Jeftinije feeda + ${added} Google-only početnih cijena).`);
