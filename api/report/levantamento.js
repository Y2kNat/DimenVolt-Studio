"use strict";

const { createPdfEndpoint } = require("../../src/reports/report-endpoint");
const { generateLevantamentoPdf } = require("../../src/reports/pdfGenerator");

module.exports = createPdfEndpoint(generateLevantamentoPdf, "DimenVolt-Levantamento");
module.exports.config = { maxDuration: 60 };
