"use strict";

/**
 * Local development server ONLY.
 *
 * This server is not used in production. It exists to provide a convenient
 * local runtime for development and for the automated test suite: page
 * routing, static assets and local equivalents of the production PDF API
 * routes, all backed by the shared production services in `src/reports/`.
 *
 * Production runs on Vercel via the serverless functions in `api/report/*`
 * (see api/report/pdf.js, api/report/levantamento.js, api/report/quadro.js)
 * and does not depend on anything in `local_dev/`.
 */

const path = require("path");
const express = require("express");
const { createPdfEndpoint } = require("../src/reports/report-endpoint");
const {
  generateReportPdf,
  generateLevantamentoPdf,
  generateQuadroPdf,
} = require("../src/reports/pdfGenerator");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "256kb" }));

app.post("/api/report/pdf", createPdfEndpoint(generateReportPdf, "DimenVolt-Relatorio"));
app.post("/api/report/levantamento", createPdfEndpoint(generateLevantamentoPdf, "DimenVolt-Levantamento"));
app.post("/api/report/quadro", createPdfEndpoint(generateQuadroPdf, "DimenVolt-Quadro"));

const PROJECT_ROOT = path.join(__dirname, "..");
const PAGES_DIR = path.join(PROJECT_ROOT, "src", "frontend", "pages");

function sendHtml(res, file) {
  res.sendFile(path.join(PAGES_DIR, file));
}

app.get("/", (_req, res) => sendHtml(res, "index.html"));
app.get("/landing", (_req, res) => sendHtml(res, "index.html"));
app.get("/landing.html", (_req, res) => sendHtml(res, "index.html"));
app.get("/calculadora", (_req, res) => sendHtml(res, "calculadora.html"));
app.get("/calculadora/", (_req, res) => sendHtml(res, "calculadora.html"));
app.get("/levantamento", (_req, res) => sendHtml(res, "levantamento.html"));
app.get("/levantamento/", (_req, res) => sendHtml(res, "levantamento.html"));
app.get("/quadro", (_req, res) => sendHtml(res, "quadro.html"));
app.get("/quadro/", (_req, res) => sendHtml(res, "quadro.html"));

app.use(express.static(path.join(PROJECT_ROOT, "public")));
app.use(express.static(PROJECT_ROOT));

app.use((req, res) => {
  res.status(404).send("Arquivo não encontrado");
});

app.listen(PORT, () => {
  console.log(`DimenVolt Studio em http://localhost:${PORT}`);
});
