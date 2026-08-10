"use strict";

const { createPdfEndpoint } = require("../../src/reports/report-endpoint");
const { generateReportPdf } = require("../../src/reports/pdfGenerator");

module.exports = createPdfEndpoint(generateReportPdf, "DimenVolt-Relatorio");
module.exports.config = { maxDuration: 60 };
