"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const ROOT = path.join(__dirname, "..", "..");
const RESULTS_DIR = path.join(ROOT, "local_dev", "test-results");
const REPORTS_DIR = path.join(RESULTS_DIR, "reports");
const PDF_DIR = path.join(RESULTS_DIR, "pdf");
const PREVIEWS_DIR = path.join(RESULTS_DIR, "previews");
const LOGS_DIR = path.join(RESULTS_DIR, "logs");
const TEST_LOG = path.join(LOGS_DIR, "test.log");
const REPORT_PDF = path.join(REPORTS_DIR, "test-report.pdf");
const REPORT_COPY = path.join(RESULTS_DIR, "test-report.pdf");

const CHROME_FALLBACK =
  "C:/Users/Y2k_N/.cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe";

const harness = require("./_harness.js");
const report = require("./_report.js");

function ensureDirs() {
  [REPORTS_DIR, PDF_DIR, PREVIEWS_DIR, LOGS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

function cleanResults() {
  [REPORTS_DIR, PDF_DIR, PREVIEWS_DIR].forEach((d) => {
    if (fs.existsSync(d)) {
      fs.readdirSync(d).forEach((f) => {
        fs.unlinkSync(path.join(d, f));
      });
    }
  });
  const oldLog = path.join(LOGS_DIR, "test.log");
  if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
  if (fs.existsSync(REPORT_COPY)) fs.unlinkSync(REPORT_COPY);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(base, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(base + "/calculadora", (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(4000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        return reject(new Error("Servidor não respondeu dentro do tempo limite."));
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

async function launchBrowser() {
  const opts = {
    headless: true,
    timeout: 60000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  try {
    return await puppeteer.launch(opts);
  } catch (e) {
    if (!fs.existsSync(CHROME_FALLBACK)) throw e;
    return await puppeteer.launch(Object.assign({}, opts, { executablePath: CHROME_FALLBACK }));
  }
}

function collectTestFiles(dir) {
  const out = [];
  const walk = (d) => {
    fs.readdirSync(d, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.js")) out.push(full);
    });
  };
  walk(dir);
  return out.sort();
}

async function printHtmlToPdfDirect(browser, html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const footerTemplate = [
    '<div style="width:100%; box-sizing:border-box; padding:0 16mm; font-family:\'Segoe UI\',Helvetica,Arial,sans-serif; font-size:7pt; color:#8f8f84;">',
    '<div style="border-top:1px solid #e6e4dd; padding-top:5px; display:flex; justify-content:space-between; align-items:center;">',
    "<span>DimenVolt · Studio — Relatório de testes</span>",
    "<span style=\"letter-spacing:0.1em;\">SUÍTE DE TESTES</span>",
    '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>',
    "</div></div>",
  ].join("");
  const buf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate,
  });
  await page.close();
  return buf;
}

function categoryLabel(code) {
  const labels = {
    "01": "Cálculo",
    "02": "Levantamento",
    "03": "Quadro",
    "04": "PDF",
    "05": "Integração",
  };
  return labels[code] || "Outros";
}

function pad(text, width) {
  const s = String(text);
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function printTerminalSummary(meta) {
  const width = 60;
  const line = "=".repeat(width);
  const thin = "-".repeat(width);
  console.log("\n" + line);
  console.log("  DimenVolt Studio · Relatório de testes");
  console.log("  " + meta.generatedAt + " · Node " + meta.nodeVersion);
  console.log(line);
  meta.categories.forEach((cat) => {
    const all = [];
    cat.suites.forEach((s) => s.tests.forEach((t) => all.push(t)));
    const passed = all.filter((t) => t.status === "pass").length;
    const failed = all.length - passed;
    console.log("[ " + cat.code + " · " + cat.name + " ]  " + passed + " passaram · " + failed + " com falha");
    all.forEach((t) => {
      const mark = t.status === "pass" ? "✓" : "✕";
      console.log("   " + mark + " " + t.name + "  (" + report.fmtDuration(t.durationMs) + ")");
    });
    if (all.length) console.log("");
  });
  console.log(thin);
  console.log("TOTAL:    " + meta.totals.total);
  console.log("PASSED:   " + meta.totals.passed);
  console.log("FAILED:   " + meta.totals.failed);
  console.log("SKIPPED:  " + meta.totals.skipped);
  console.log("DURATION: " + report.fmtDuration(meta.durationMs));
  console.log("REPORT:   local_dev/test-results/reports/test-report.pdf");
  console.log(line + "\n");
}

async function main() {
  const startedAt = Date.now();
  ensureDirs();
  cleanResults();

  const port = await findFreePort();
  const serverBase = "http://127.0.0.1:" + port;

  const serverLog = fs.createWriteStream(path.join(LOGS_DIR, "server.log"), { flags: "a" });
  const server = spawn(process.execPath, [path.join("local_dev", "server.js")], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);

  console.log("[service] subindo servidor real em " + serverBase + " ...");
  await waitForServer(serverBase, 30000);

  const browser = await launchBrowser();
  console.log("[service] navegador pronto.");

  const pdfGen = require(path.join(ROOT, "src", "reports", "pdfGenerator.js"));
  const shared = {
    root: ROOT,
    serverBase,
    browser,
    pdf: pdfGen,
    dirs: { reports: REPORTS_DIR, pdf: PDF_DIR, previews: PREVIEWS_DIR, logs: LOGS_DIR, results: RESULTS_DIR },
  };

  const logLine = (rec, statusText) => {
    const line =
      "[" + new Date().toISOString() + "] [" + rec.category.code + "] [" + rec.suite.id + "] [" +
      rec.name + "] [" + statusText + "] " + rec.durationMs + "ms";
    fs.appendFileSync(TEST_LOG, line + "\n");
  };

  const all = [];
  try {
    const files = collectTestFiles(path.join(ROOT, "local_dev", "tests"));
    const modules = [];
    for (const file of files) {
      try {
        const mod = require(file);
        if (!mod || !mod.category || !mod.suite || !Array.isArray(mod.tests)) {
          throw new Error("Contrato inválido (category/suite/tests).");
        }
        modules.push({ file, mod });
      } catch (e) {
        modules.push({
          file,
          mod: {
            category: { code: "99", name: "Carregamento" },
            suite: { id: "load", name: "Carregamento de módulo" },
            tests: [
              {
                name: "Falha ao carregar " + path.basename(file),
                fn: async () => {
                  throw e;
                },
              },
            ],
          },
        });
      }
    }

    modules.forEach(({ file, mod }) => {
      mod.tests.forEach((t) => {
        all.push({
          name: t.name,
          file,
          category: { code: mod.category.code, name: mod.category.name },
          suite: { id: mod.suite.id, name: mod.suite.name },
          fn: t.fn,
          status: "pending",
          durationMs: 0,
          inputs: [],
          results: [],
          logs: [],
          validations: [],
          files: [],
          warnings: [],
          error: null,
        });
      });
    });

    console.log("[service] " + all.length + " testes encontrados.");

    for (const rec of all) {
      const t0 = Date.now();
      try {
        const h = harness.createTestContext(shared, rec);
        await rec.fn(h);
        rec.status = rec.validations.some((v) => !v.ok) ? "fail" : "pass";
      } catch (e) {
        rec.status = rec.validations.some((v) => !v.ok) ? "fail" : "error";
        rec.error = {
          message: (e && e.message) || String(e),
          stack: (e && e.stack) || String(e),
          expected: e && e.expected,
          obtained: e && e.obtained,
        };
      }
      rec.durationMs = Date.now() - t0;
      logLine(rec, rec.status);
      const mark = rec.status === "pass" ? "✓" : "✕";
      console.log("[service] " + mark + " [" + rec.category.code + "] " + rec.name + " (" + report.fmtDuration(rec.durationMs) + ")");
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    const passed = all.filter((r) => r.status === "pass").length;
    const failed = all.filter((r) => r.status === "fail").length;
    const errored = all.filter((r) => r.status === "error").length;
    const skipped = all.filter((r) => r.status === "skip").length;

    const catMap = new Map();
    all.forEach((r) => {
      if (!catMap.has(r.category.code)) {
        catMap.set(r.category.code, { code: r.category.code, name: r.category.name, suites: new Map() });
      }
      const cat = catMap.get(r.category.code);
      if (!cat.suites.has(r.suite.id)) {
        cat.suites.set(r.suite.id, { id: r.suite.id, name: r.suite.name, tests: [] });
      }
      cat.suites.get(r.suite.id).tests.push(r);
    });
    const categories = Array.from(catMap.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((cat) => ({
        code: cat.code,
        name: cat.name,
        suites: Array.from(cat.suites.values()),
      }));

    const meta = {
      generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      nodeVersion: process.version,
      serverBase,
      baseDir: RESULTS_DIR,
      durationMs,
      totals: { total: all.length, passed, failed, errored, skipped },
      categories,
      errors: all.filter((r) => r.status === "fail" || r.status === "error"),
      performance: all
        .slice()
        .sort((a, b) => b.durationMs - a.durationMs)
        .map((r) => ({ name: r.name, suite: r.suite.name, durationMs: r.durationMs, status: r.status })),
    };

    try {
      const html = report.buildReportHtml(meta);
      const buf = await printHtmlToPdfDirect(browser, html);
      fs.writeFileSync(REPORT_PDF, buf);
      fs.copyFileSync(REPORT_PDF, REPORT_COPY);
      console.log("[service] relatório gerado em local_dev/test-results/reports/test-report.pdf (" + buf.length + " bytes)");
    } catch (e) {
      console.error("[service] falha ao gerar relatório PDF:", e.message);
    }

    printTerminalSummary(meta);

    await browser.close().catch(() => {});
    server.kill();
    serverLog.end();
  }
}

main().catch((err) => {
  console.error("[service] erro fatal:", err);
  process.exit(1);
});
