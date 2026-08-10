"use strict";

function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDuration(ms) {
  if (ms < 1000) return Math.round(ms) + " ms";
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + " s";
  const m = Math.floor(s / 60);
  return m + "m " + (s - m * 60).toFixed(0) + "s";
}

function statusBadge(status) {
  const map = {
    pass: ['<span class="badge badge-pass">PASSOU</span>', "passed"],
    fail: ['<span class="badge badge-fail">FALHOU</span>', "failed"],
    error: ['<span class="badge badge-error">ERRO</span>', "errored"],
    skip: ['<span class="badge badge-skip">PULADO</span>', "skipped"],
  };
  const m = map[status] || map.error;
  return m;
}

function kvTable(rows) {
  if (!rows.length) return '<p class="muted">—</p>';
  return (
    "<table class=\"kv\">" +
    rows
      .map((r) => "<tr><th>" + esc(r.label) + "</th><td>" + esc(r.value) + "</td></tr>")
      .join("") +
    "</table>"
  );
}

function validationsList(validations) {
  if (!validations.length) return '<p class="muted">Nenhuma validação registrada.</p>';
  return (
    "<ul class=\"vals\">" +
    validations
      .map((v) => {
        const icon = v.ok ? "✓" : "✕";
        const cls = v.ok ? "val-ok" : "val-fail";
        const detail = v.detail ? "<small>" + esc(v.detail) + "</small>" : "";
        return (
          '<li class="' + cls + '"><b>' + icon + " " + esc(v.label) + "</b>" + detail + "</li>"
        );
      })
      .join("") +
    "</ul>"
  );
}

function filesList(files, baseDir) {
  if (!files.length) return '<p class="muted">Nenhum arquivo anexado.</p>';
  return (
    "<ul class=\"files\">" +
    files
      .map((f) => {
        const rel = baseDir ? relativePath(baseDir, f.file) : f.file;
        let size = "";
        try {
          size = require("fs").statSync(f.file).size;
          size = " · " + fmtBytes(size);
        } catch (e) {
          size = "";
        }
        return "<li><span class=\"file-label\">" + esc(f.label) + "</span> <code>" + esc(rel) + "</code><small>" + size + "</small></li>";
      })
      .join("") +
    "</ul>"
  );
}

function relativePath(baseDir, file) {
  const base = baseDir.replace(/[\\/]/g, "/").replace(/\/+$/, "");
  const f = String(file).replace(/\\/g, "/");
  if (f.indexOf(base + "/") === 0) return f.slice(base.length + 1);
  return f;
}

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function testBlock(t, baseDir) {
  const badge = statusBadge(t.status);
  const errorBox = t.error
    ? [
        '<div class="errbox">',
        "<h4>Detalhes do erro</h4>",
        "<p><b>" + esc(t.error.message || "Falha") + "</b></p>",
        t.error.expected !== undefined && t.error.expected !== null
          ? "<p><b>Esperado:</b> <code>" + esc(t.error.expected) + "</code></p>"
          : "",
        t.error.obtained !== undefined && t.error.obtained !== null
          ? "<p><b>Obtido:</b> <code>" + esc(t.error.obtained) + "</code></p>"
          : "",
        '<details><summary>Stack trace / possíveis causas</summary><pre class="stack">' +
          esc(t.error.stack || t.error.message) +
          "</pre></details>",
        "</div>",
      ].join("")
    : "";

  const conclusion =
    t.status === "pass"
      ? '<p class="concl concl-ok">Concluído com sucesso — todas as validações passaram.</p>'
      : '<p class="concl concl-fail">Concluído com falhas — ' +
        esc(t.validations.filter((v) => !v.ok).length) +
        " validação(ões) não passou(aram).</p>";

  const warnings = t.warnings.length
    ? '<div class="warnbox"><b>Avisos</b><ul>' + t.warnings.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul></div>"
    : "";

  return (
    '<article class="test ' + (t.status === "pass" ? "t-pass" : "t-fail") + '">' +
    '<header class="test-head">' +
    "<div class=\"test-title\"><h4>" + esc(t.name) + "</h4><span class=\"test-meta\">" +
    badge[1] +
    " · " +
    esc(t.suite.name) +
    " · " +
    fmtDuration(t.durationMs) +
    "</span></div>" +
    badge[0] +
    "</header>" +
    '<div class="test-cols">' +
    "<section><h5>Entrada · Dados utilizados</h5>" + kvTable(t.inputs) + "</section>" +
    "<section><h5>Resultado</h5>" + kvTable(t.results) + "</section>" +
    "</div>" +
    '<section class="exec"><h5>Execução</h5>' +
    (t.logs.length
      ? "<ol class=\"log\">" + t.logs.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ol>"
      : '<p class="muted">Sem passos registrados.</p>') +
    "</section>" +
    '<section><h5>Validações</h5>' + validationsList(t.validations) + "</section>" +
    (t.files.length
      ? '<section class="files-sec"><h5>Arquivos gerados (evidência)</h5>' +
        filesList(t.files, baseDir) +
        "</section>"
      : "") +
    warnings +
    errorBox +
    conclusion +
    "</article>"
  );
}

function buildReportHtml(meta) {
  const total = meta.totals.total;
  const passed = meta.totals.passed;
  const failed = meta.totals.failed;
  const errored = meta.totals.errored;
  const skipped = meta.totals.skipped;

  const summaryBars =
    '<div class="summary-grid">' +
    '<div class="sum-cell"><span>TOTAL</span><strong>' + total + "</strong></div>" +
    '<div class="sum-cell ok"><span>PASSED</span><strong>' + passed + "</strong></div>" +
    '<div class="sum-cell bad"><span>FAILED</span><strong>' + failed + "</strong></div>" +
    '<div class="sum-cell bad"><span>ERROS</span><strong>' + errored + "</strong></div>" +
    '<div class="sum-cell"><span>PULADOS</span><strong>' + skipped + "</strong></div>" +
    '<div class="sum-cell"><span>DURAÇÃO</span><strong>' + fmtDuration(meta.durationMs) + "</strong></div>" +
    "</div>";

  const sections = meta.categories
    .map((cat) => {
      const all = [];
      cat.suites.forEach((s) => s.tests.forEach((t) => all.push(t)));
      const catPass = all.filter((t) => t.status === "pass").length;
      const catFail = all.filter((t) => t.status !== "pass").length;
      return (
        '<section class="cat">' +
        '<h3 id="sec-' + esc(cat.code) + '">' + esc(cat.code) + " · " + esc(cat.name) +
        ' <span class="cat-meta">' + catPass + " ok · " + catFail + " com falha</span></h3>" +
        '<div class="cat-body">' +
        cat.suites
          .map((s) => {
            const suiteTests = s.tests
              .map((t) => testBlock(t, meta.baseDir))
              .join("");
            return (
              '<section class="suite"><h4 class="suite-title">' +
              esc(s.name) +
              '</h4><div class="suite-body">' +
              suiteTests +
              "</div></section>"
            );
          })
          .join("") +
        "</div></section>"
      );
    })
    .join("");

  const indexList =
    '<ul class="index">' +
    meta.categories
      .map((c) => "<li><a href=\"#sec-" + esc(c.code) + "\">" + esc(c.code) + " — " + esc(c.name) + "</a></li>")
      .join("") +
    '<li><a href="#sec-errors">06 — Erros e falhas</a></li>' +
    '<li><a href="#sec-perf">07 — Desempenho</a></li>' +
    "</ul>";

  const errorsSection =
    '<section class="cat" id="sec-errors">' +
    "<h3>06 · Erros e falhas</h3>" +
    '<div class="cat-body">' +
    (meta.errors.length
      ? meta.errors.map((t) => testBlock(t, meta.baseDir)).join("")
      : '<p class="ok-note">Nenhuma falha registrada na execução.</p>') +
    "</div></section>";

  const perfSection =
    '<section class="cat" id="sec-perf">' +
    "<h3>07 · Desempenho</h3>" +
    '<div class="cat-body">' +
    '<table class="perf"><thead><tr><th>Ordem</th><th>Teste</th><th>Suíte</th><th>Duração</th><th>Status</th></tr></thead><tbody>' +
    meta.performance
      .map(
        (p, i) =>
          "<tr><td>" + (i + 1) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.suite) + "</td><td>" +
          fmtDuration(p.durationMs) + "</td><td>" + statusBadge(p.status)[1] + "</td></tr>"
      )
      .join("") +
    "</tbody></table>" +
    '<p class="muted">Tempo total da execução: <b>' + fmtDuration(meta.durationMs) + "</b>.</p>" +
    "</div></section>";

  return (
    '<!DOCTYPE html>' +
    '<html lang="pt-BR"><head><meta charset="utf-8"/>' +
    "<title>DimenVolt Studio — Relatório de testes</title>" +
    "<style>" +
    "@page { size: A4; margin: 16mm 14mm; }" +
    "* { box-sizing: border-box; }" +
    "html, body { margin: 0; padding: 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #2b2b28; font-size: 10.5pt; line-height: 1.45; }" +
    "body { background: #ffffff; }" +
    ".cover { text-align: center; padding: 60px 0 40px; border-bottom: 3px solid #e9a318; margin-bottom: 18px; }" +
    ".cover h1 { font-size: 26pt; margin: 0 0 4px; letter-spacing: -0.5px; }" +
    ".cover .sub { color: #6b6b60; font-size: 12pt; margin: 0; }" +
    ".cover .meta { margin-top: 14px; color: #8f8f84; font-size: 9pt; }" +
    ".summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 14px 0 20px; }" +
    ".sum-cell { border: 1px solid #e6e4dd; border-radius: 8px; padding: 10px 8px; text-align: center; }" +
    ".sum-cell span { display: block; font-size: 7.5pt; letter-spacing: 0.12em; color: #8f8f84; text-transform: uppercase; }" +
    ".sum-cell strong { font-size: 15pt; color: #2b2b28; }" +
    ".sum-cell.ok strong { color: #1b7f3b; }" +
    ".sum-cell.bad strong { color: #c62828; }" +
    "h2 { border-bottom: 2px solid #e9a318; padding-bottom: 4px; font-size: 14pt; }" +
    "h3 { font-size: 13pt; margin: 26px 0 10px; padding: 6px 10px; background: #f7f5ee; border-left: 4px solid #e9a318; }" +
    "h3 .cat-meta { font-size: 9pt; font-weight: normal; color: #8f8f84; margin-left: 8px; }" +
    "h4 { font-size: 11.5pt; margin: 0; }" +
    "h5 { font-size: 9.5pt; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b60; }" +
    ".suite-title { margin: 18px 0 8px; color: #55554c; }" +
    ".suite-body { padding-left: 12px; border-left: 2px solid #e6e4dd; }" +
    ".test { border: 1px solid #e6e4dd; border-radius: 8px; margin: 12px 0; padding: 12px 14px; page-break-inside: avoid; }" +
    ".test.t-pass { border-left: 4px solid #1b7f3b; }" +
    ".test.t-fail { border-left: 4px solid #c62828; }" +
    ".test-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }" +
    ".test-title h4 { margin: 0; }" +
    ".test-meta { color: #8f8f84; font-size: 8.5pt; }" +
    ".badge { display: inline-block; border-radius: 4px; padding: 2px 8px; font-size: 8pt; font-weight: bold; white-space: nowrap; }" +
    ".badge-pass { background: #e7f4ea; color: #1b7f3b; }" +
    ".badge-fail { background: #fdeaea; color: #c62828; }" +
    ".badge-error { background: #fdeaea; color: #c62828; }" +
    ".badge-skip { background: #eef0f3; color: #5a6270; }" +
    ".test-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 8px 0; }" +
    ".exec { margin: 10px 0; }" +
    "table.kv { width: 100%; border-collapse: collapse; font-size: 9pt; }" +
    "table.kv th { text-align: left; color: #6b6b60; width: 34%; padding: 3px 6px 3px 0; border-bottom: 1px dotted #e6e4dd; vertical-align: top; }" +
    "table.kv td { padding: 3px 0 3px 6px; border-bottom: 1px dotted #e6e4dd; word-break: break-word; }" +
    "ol.log { margin: 0; padding-left: 18px; font-size: 9pt; }" +
    "ol.log li { margin: 2px 0; }" +
    "ul.vals { list-style: none; margin: 0; padding: 0; }" +
    "ul.vals li { margin: 3px 0; font-size: 9.5pt; }" +
    ".val-ok b { color: #1b7f3b; }" +
    ".val-fail b { color: #c62828; }" +
    ".val-ok small, .val-fail small { display: block; color: #8f8f84; font-size: 8.5pt; }" +
    ".errbox { background: #fdf3f3; border: 1px solid #f1c6c6; border-radius: 6px; padding: 10px; margin: 10px 0; font-size: 9pt; }" +
    ".errbox code { background: #fff; padding: 1px 4px; border-radius: 3px; }" +
    ".stack { background: #f4f3ee; border-radius: 5px; padding: 8px; overflow-x: auto; font-size: 8pt; white-space: pre-wrap; }" +
    ".warnbox { background: #fff8e8; border: 1px solid #eed9a0; border-radius: 6px; padding: 8px; margin: 8px 0; font-size: 9pt; }" +
    ".concl { font-weight: bold; font-size: 9.5pt; margin: 8px 0 0; }" +
    ".concl-ok { color: #1b7f3b; }" +
    ".concl-fail { color: #c62828; }" +
    "ul.files { list-style: none; padding: 0; margin: 0; font-size: 9pt; }" +
    "ul.files li { margin: 3px 0; }" +
    "ul.files code { background: #f4f3ee; padding: 1px 5px; border-radius: 3px; font-size: 8.5pt; }" +
    "ul.files small { color: #8f8f84; }" +
    ".file-label { color: #6b6b60; }" +
    ".muted { color: #9b9b8f; font-size: 9pt; }" +
    ".ok-note { color: #1b7f3b; font-weight: bold; }" +
    ".index { margin: 6px 0 0; padding-left: 20px; }" +
    ".index li { margin: 2px 0; }" +
    ".index a { color: #1f5f8b; text-decoration: none; }" +
    "table.perf { width: 100%; border-collapse: collapse; font-size: 9pt; }" +
    "table.perf th, table.perf td { border-bottom: 1px solid #e6e4dd; padding: 4px 6px; text-align: left; }" +
    "table.perf th { color: #6b6b60; }" +
    "details { margin-top: 6px; }" +
    "details summary { cursor: pointer; color: #1f5f8b; }" +
    "</style></head><body>" +
    '<div class="cover">' +
    "<h1>DimenVolt · Studio</h1>" +
    '<p class="sub">Relatório da suíte de testes automatizados</p>' +
    '<p class="meta">Gerado em ' + esc(meta.generatedAt) + " · Node " + esc(meta.nodeVersion) +
    " · Servidor real: " + esc(meta.serverBase) + "</p>" +
    "</div>" +
    "<h2>Resumo executivo</h2>" +
    summaryBars +
    "<h2>Índice</h2>" +
    indexList +
    sections +
    errorsSection +
    perfSection +
    "</body></html>"
  );
}

module.exports = { buildReportHtml, fmtDuration };
