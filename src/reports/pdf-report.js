(function () {
  function text(id) {
    var el = document.getElementById(id);
    return el ? String(el.textContent || "").trim() : "";
  }

  function value(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function parseNumber(raw) {
    if (!raw) return NaN;
    var cleaned = String(raw).replace(/[^\d.,-]/g, "").replace(",", ".");
    return parseFloat(cleaned);
  }

  function extractSectionMm2(cableText) {
    var match = String(cableText).match(/(\d+(?:[.,]\d+)?)\s*mm/i);
    if (!match) return NaN;
    return parseFloat(match[1].replace(",", "."));
  }

  function collectPayload() {
    var cable = text("res-cable");
    var breakerText = text("res-breaker");
    var currentText = text("res-current");
    var ampacityText = text("res-ampacity");
    var dropVText = text("res-drop-v");
    var dropPctText = text("res-drop-pct");
    var factors = text("res-factors");
    var status = text("res-status");
    var reason = text("report-reason-text");
    var alternativeEl = document.getElementById("report-alternative");
    var alternative =
      alternativeEl && alternativeEl.style.display !== "none"
        ? text("report-alternative-text")
        : "";

    return {
      generatedAt: new Date().toISOString(),
      inputs: {
        voltage: parseNumber(value("voltage")),
        power: parseNumber(value("power")),
        length: parseNumber(value("length")),
        connectionType: value("connectionType"),
        circuitType: value("circuitType"),
        installMethod: value("installMethod"),
        material: value("material"),
        ambientCondition: value("ambientCondition"),
        groupedCircuits: parseNumber(value("groupedCircuits")),
        loadedConductors: parseNumber(value("loadedConductors")),
        maxDrop: parseNumber(value("maxDrop")),
        powerFactor: parseNumber(value("powerFactorSelect")),
      },
      results: {
        currentIb: parseNumber(currentText),
        ampacityIz: parseNumber(ampacityText),
        breakerA: parseNumber(breakerText),
        dropV: parseNumber(dropVText),
        dropPct: parseNumber(dropPctText),
        cable: cable,
        factors: factors,
        status: status,
        sectionMm2: extractSectionMm2(cable),
        reason: reason && reason !== "--" ? reason : "",
        neutral: text("report-neutral"),
        pe: text("report-pe"),
        thermalMargin: text("report-thermal-margin"),
        alternative: alternative,
      },
    };
  }

  function setButtonState(btn, loading) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.classList.toggle("is-loading", !!loading);
    var label = btn.querySelector(".pdf-btn-label");
    if (label) {
      label.textContent = loading ? "Gerando PDF..." : "Gerar Relatório PDF";
    }
  }

  function downloadFromEndpoint(endpoint, payload, filename) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (errBody) {
            throw new Error(
              (errBody && errBody.error) || "Não foi possível gerar o relatório PDF."
            );
          });
      }
      return response.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(function (serverErr) {
      return clientSideFallback(endpoint, payload, serverErr);
    });
  }

  function clientSideFallback(endpoint, payload, serverErr) {
    if (!window.DimenVoltPdf) {
      throw serverErr;
    }
    var Pdf = window.DimenVoltPdf;
    var html;
    if (endpoint.indexOf("/api/report/pdf") !== -1) {
      html = Pdf.buildReportHtml(Pdf.validateReportPayload(payload));
    } else if (endpoint.indexOf("/api/report/levantamento") !== -1) {
      html = Pdf.buildLevantamentoHtml(Pdf.validateLevantamentoPayload(payload));
    } else if (endpoint.indexOf("/api/report/quadro") !== -1) {
      html = Pdf.buildQuadroHtml(Pdf.validateQuadroPayload(payload));
    } else {
      throw serverErr;
    }
    return printHtml(html);
  }

  function printHtml(html) {
    return new Promise(function (resolve, reject) {
      var iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0.01;pointer-events:none;";
      document.body.appendChild(iframe);
      var win = iframe.contentWindow;
      var doc = win.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(function () {
        try {
          win.focus();
          win.print();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          setTimeout(function () {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 500);
        }
      }, 250);
    });
  }

  window.DimenVoltReport = {
    download: downloadFromEndpoint,
  };

  async function downloadPdf() {
    var btn = document.getElementById("btn-generate-pdf");
    var resultContainer = document.getElementById("result-container");
    if (!resultContainer || resultContainer.style.display === "none") {
      alert("Calcule o dimensionamento antes de gerar o relatório.");
      return;
    }

    var payload = collectPayload();
    if (
      !Number.isFinite(payload.results.currentIb) ||
      !Number.isFinite(payload.results.ampacityIz) ||
      !payload.results.cable ||
      payload.results.cable === "--"
    ) {
      alert("Resultados incompletos. Calcule novamente antes de gerar o PDF.");
      return;
    }

    setButtonState(btn, true);

    try {
      var filename =
        "DimenVolt-Relatorio-" + new Date().toISOString().slice(0, 10) + ".pdf";
      await downloadFromEndpoint("/api/report/pdf", payload, filename);
    } catch (err) {
      console.error(err);
      alert(err.message || "Falha ao gerar o PDF.");
    } finally {
      setButtonState(btn, false);
    }
  }

  function init() {
    var btn = document.getElementById("btn-generate-pdf");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      downloadPdf();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
