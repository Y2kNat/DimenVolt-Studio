"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const SRC_DIR = path.join(ROOT, "src");
const ENGINE_FILE = path.join(SRC_DIR, "frontend", "scripts", "motor_calculo.js");

class AssertionError extends Error {
  constructor(label, detail, expected, obtained) {
    super(label || "Falha de validação");
    this.name = "AssertionError";
    this.label = label;
    this.detail = detail;
    this.expected = expected;
    this.obtained = obtained;
  }
}

function fmt(value) {
  if (value === undefined || value === null) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
}

/* ------------------------------------------------------------------ */
/* Motor de cálculo (in-process, via vm sandbox + stub de fetch)       */
/* ------------------------------------------------------------------ */

let enginePromise = null;

function getEngine() {
  if (!enginePromise) enginePromise = loadEngine();
  return enginePromise;
}

async function loadEngine() {
  const code = fs.readFileSync(ENGINE_FILE, "utf8");
  const sandbox = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Error,
    Infinity,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const engine = sandbox.window && sandbox.window.DimenVoltMotor;
  if (!engine) {
    throw new Error("Motor de cálculo não foi inicializado no sandbox.");
  }
  sandbox.fetch = function (url) {
    const base = String(url).replace(/\?.*$/, "").split("/").pop();
    const file = path.join(DATA_DIR, base);
    if (!fs.existsSync(file)) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  };
  if (typeof engine.load === "function") {
    await engine.load();
  }
  return engine;
}

/* ------------------------------------------------------------------ */
/* Inspeção de PDF (bytes)                                             */
/* ------------------------------------------------------------------ */

function pdfPageCount(buf) {
  const s = buf.toString("latin1");
  const m = s.match(/\/Type\s*\/Page\b(?!s)/g) || [];
  return m.length;
}

function pdfText(buf) {
  const s = buf.toString("latin1");
  const out = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(s))) {
    const pre = s.slice(Math.max(0, m.index - 120), m.index);
    if (!/FlateDecode/.test(pre)) continue;
    let inflated;
    try {
      inflated = zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch (e) {
      continue;
    }
    if (!/BT|TJ|Tj|Do\b/.test(inflated)) continue;
    const strings = [];
    const strRe = /\((?:\\.|[^\\()])*\)/g;
    let sm;
    while ((sm = strRe.exec(inflated))) {
      let t = sm[0].slice(1, -1);
      t = t.replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      t = t.replace(/\\([\\()])/g, "$1");
      strings.push(t);
    }
    if (strings.length) out.push(strings.join(" "));
  }
  return out.join("\n");
}

function pdfInfo(buf) {
  return {
    isPdf: buf.slice(0, 5).toString("latin1") === "%PDF-",
    size: buf.length,
    pages: pdfPageCount(buf),
  };
}

/* ------------------------------------------------------------------ */
/* Detecção de PNG em branco (variância dos pixels)                    */
/* ------------------------------------------------------------------ */

function pngIsBlank(buf, tolerance) {
  tolerance = tolerance === undefined ? 12 : tolerance;
  if (!buf || buf.length < 8 || buf.toString("latin1", 0, 8) !== "\x89PNG\r\n\x1a\n") {
    throw new Error("O arquivo não é um PNG válido.");
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (!width || !idat.length) throw new Error("PNG sem IHDR/IDAT.");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = 1 + width * bpp;
  const vals = [];
  let sum = 0;
  for (let r = 0; r < height; r++) {
    const row = r * stride + 1;
    if (row + width * bpp > raw.length) break;
    for (let c = 0; c < width; c += 7) {
      for (let ch = 0; ch < 3; ch++) {
        const v = raw[row + c * bpp + ch];
        vals.push(v);
        sum += v;
      }
    }
  }
  if (!vals.length) throw new Error("PNG sem dados de pixel.");
  const mean = sum / vals.length;
  let dev = 0;
  for (const v of vals) dev += Math.abs(v - mean);
  return dev / vals.length < tolerance;
}

/* ------------------------------------------------------------------ */
/* Previews (páginas renderizadas a partir do HTML real dos relatórios)*/
/* ------------------------------------------------------------------ */

async function renderPreviews(browser, html, outDir, prefix) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await page.emulateMediaType("print");
  await page.setContent(html, { waitUntil: "networkidle0" });
  const height = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
  );
  const files = [];
  let y = 0;
  let index = 1;
  while (y < height && index <= 60) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((res) => setTimeout(res, 90));
    const file = path.join(outDir, prefix + "-p" + String(index).padStart(2, "0") + ".png");
    await page.screenshot({ path: file, clip: { x: 0, y, width: 794, height: 1123 } });
    files.push(file);
    y += 1123;
    index += 1;
  }
  await page.close();
  return files;
}

/* ------------------------------------------------------------------ */
/* Contexto por teste                                                  */
/* ------------------------------------------------------------------ */

function createTestContext(shared, record) {
  const h = {};
  h.shared = shared;
  h.record = record;
  h.root = ROOT;
  h.engine = getEngine;
  h.pdf = shared.pdf;
  h.serverBase = shared.serverBase;
  h.browser = shared.browser;
  h.dirs = shared.dirs;

  h.input = (label, value) => record.inputs.push({ label: String(label), value: fmt(value) });
  h.result = (label, value) => record.results.push({ label: String(label), value: fmt(value) });
  h.step = (msg) => record.logs.push(String(msg));
  h.warn = (msg) => record.warnings.push(String(msg));
  h.attachFile = (file, label) =>
    record.files.push({ file: String(file), label: label || path.basename(String(file)) });

  const fail = (label, detail, expected, obtained) => {
    record.validations.push({
      ok: false,
      label: String(label || "Validação"),
      detail: detail || "",
      expected: fmt(expected),
      obtained: fmt(obtained),
    });
    throw new AssertionError(label, detail, expected, obtained);
  };
  const pass = (label, detail) =>
    record.validations.push({ ok: true, label: String(label || "Validação"), detail: detail || "" });

  h.pass = pass;
  h.ok = (cond, label, detail) => {
    if (cond) pass(label, detail);
    else fail(label, detail, true, !!cond);
  };
  h.equal = (actual, expected, label) => {
    if (Object.is(actual, expected)) pass(label, "");
    else fail(label, "", expected, actual);
  };
  h.approx = (actual, expected, tol, label) => {
    if (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) <= tol) {
      pass(label, "");
    } else {
      fail(label, "tolerância " + tol, expected, actual);
    }
  };
  h.match = (actual, re, label) => {
    if (re.test(String(actual))) pass(label, "");
    else fail(label, "padrão " + String(re), String(re), String(actual));
  };
  h.throws = (fn, label) => {
    let threw = null;
    try {
      fn();
    } catch (e) {
      threw = e;
    }
    if (threw) pass(label, threw.message);
    else fail(label, "esperado que lançasse erro", "throw", "sem erro");
  };
  h.throwsAsync = async (fn, label) => {
    try {
      await fn();
    } catch (e) {
      pass(label, e.message);
      return;
    }
    fail(label, "esperado que lançasse erro", "throw", "sem erro");
  };

  h.open = (rel) => openPage(h, rel);
  h.fill = (page, selector, value) => fill(page, selector, value);
  h.click = (page, selector) => click(page, selector);
  h.select = (page, selector, value) => page.select(selector, value);
  h.seg = (page, baseSelector, group, value) => clickSeg(page, baseSelector, group, value);
  h.waitForEngine = (page) => waitForEngine(page);
  h.awaitSelector = (page, selector) =>
    page.waitForSelector(selector, { visible: true, timeout: 30000 });
  h.awaitText = (page, selector, expected) =>
    page.waitForFunction(
      (sel, exp) => {
        const el = document.querySelector(sel);
        return !!(el && String(el.textContent || "").includes(exp));
      },
      { timeout: 30000 },
      selector,
      expected
    );

  return h;
}

async function openPage(h, rel) {
  const page = await h.browser.newPage();
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  await page.goto(h.serverBase + "/" + rel, { waitUntil: "networkidle0", timeout: 60000 });
  return page;
}

async function waitForEngine(page) {
  await page.waitForFunction(
    () => {
      const m = window.DimenVoltMotor;
      return !!(m && typeof m.isReady === "function" && m.isReady());
    },
    { timeout: 60000 }
  );
}

async function fill(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, String(value));
}

async function click(page, selector) {
  await page.click(selector, { clickCount: 1 });
}

async function clickSeg(page, baseSelector, group, value) {
  await page.click(
    baseSelector + '[data-group="' + group + '"] button[data-value="' + value + '"]'
  );
}

module.exports = {
  ROOT,
  DATA_DIR,
  SRC_DIR,
  getEngine,
  renderPreviews,
  pdfPageCount,
  pdfText,
  pdfInfo,
  pngIsBlank,
  createTestContext,
  AssertionError,
};
