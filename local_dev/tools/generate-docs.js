const fs = require("fs");
const path = require("path");
const { generateTechnicalDocumentPdf } = require("../../src/reports/pdfGenerator");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "public", "documents");
const OUT_FILE = path.join(OUT_DIR, "DimenVolt-Documentos-Tecnicos.pdf");

const DATA_FILES = [
  "ampacity",
  "circuit_breakers",
  "grouping_factors",
  "temperature_correction",
  "voltage_drop",
  "neutral_conductor",
  "protective_conductor_PE",
  "minimum_sections",
  "nbr5410_settings",
  "load_database",
  "materials",
  "motor",
];

function loadData() {
  const data = {};
  for (const name of DATA_FILES) {
    data[name] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
  }
  return data;
}

async function main() {
  const data = loadData();
  const pdf = await generateTechnicalDocumentPdf(data);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, pdf);
  console.log(`PDF gerado: ${path.relative(ROOT, OUT_FILE)} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
