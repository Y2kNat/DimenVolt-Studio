"use strict";

const ERROR_MSG_RE = /inválid|obrigat|fora da faixa|muito longo/i;

function isClientError(message) {
  return ERROR_MSG_RE.test(message);
}

function createPdfEndpoint(generate, filename) {
  return async function pdfEndpoint(req, res) {
    try {
      const pdfBuffer = await generate(req.body || {});
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}-${stamp}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.status(200).end(Buffer.from(pdfBuffer));
    } catch (err) {
      const message = err && err.message ? err.message : "Falha ao gerar PDF";
      const status = isClientError(message) ? 400 : 500;
      console.error("[pdf]", message);
      res.status(status).json({ error: message });
    }
  };
}

module.exports = { createPdfEndpoint };
