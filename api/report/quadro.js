"use strict";

const { createPdfEndpoint } = require("../../src/reports/report-endpoint");
const { generateQuadroPdf } = require("../../src/reports/pdfGenerator");

module.exports = createPdfEndpoint(generateQuadroPdf, "DimenVolt-Quadro");
module.exports.config = { maxDuration: 60 };
