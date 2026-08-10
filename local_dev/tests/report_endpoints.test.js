"use strict";

const http = require("http");
const harness = require("./_harness.js");

function postJson(base, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      base + endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            contentType: res.headers["content-type"] || "",
            disposition: res.headers["content-disposition"] || "",
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const reportPayload = {
  generatedAt: new Date().toISOString(),
  inputs: {
    voltage: 220,
    power: 4500,
    length: 35,
    connectionType: "phase-neutral",
    circuitType: "tug",
    installMethod: "B1",
    material: "copper",
    ambientCondition: "normal",
    groupedCircuits: 1,
    loadedConductors: 2,
    maxDrop: 4,
    powerFactor: 1,
  },
  results: {
    currentIb: 20.45,
    ampacityIz: 36,
    breakerA: 25,
    dropV: 7.7,
    dropPct: 2,
    cable: "1 x 6 mm² Cobre",
    factors: "ft = 1,00 · fg = 1,00",
    status: "Seguro",
    sectionMm2: 6,
    reason: "Conforme NBR 5410.",
    neutral: "6 mm² Cobre",
    pe: "6 mm² Cobre",
    thermalMargin: "—",
  },
};

const levantamentoPayload = {
  generatedAt: new Date().toISOString(),
  cliente: { nome: "Cliente Teste Auto" },
  obra: { tipo: "Residencial", tensao: "220V" },
  units: [
    {
      label: "Quarto",
      tug: [{ id: 1, potencia: 100 }],
      tue: [],
      iluminacao: [{ id: 2, potencia: 60 }],
      interruptores: 2,
      potencia: 160,
      comprimento: 3,
      largura: 3,
      altura: 2.7,
    },
  ],
  totals: {
    ambientes: 1,
    tug: { pontos: 1, potencia: 100 },
    tue: { pontos: 0, potencia: 0 },
    iluminacao: { pontos: 1, potencia: 60 },
    interruptores: 2,
    pontos: 4,
    potencia: 160,
    area: 9,
    perimetro: 12,
  },
  dimensoesAtivadas: true,
  circuits: [
    { key: "iluminacao", label: "Iluminação", badge: "ILUMINAÇÃO", potencia: 60, distancia: 12 },
    { key: "tug", label: "Tomadas de uso geral", badge: "TUG", potencia: 100, distancia: 15 },
    { key: "tue", label: "Tomadas de uso específico", badge: "TUE", potencia: 0, distancia: 0 },
  ],
};

const quadroPayload = {
  generatedAt: new Date().toISOString(),
  quadro: { identificacao: "Q1", tensao: "220V", sistema: "Monofásico" },
  circuits: [
    {
      id: "01",
      descricao: "Iluminação",
      tipo: "Iluminação",
      potencia: 600,
      corrente: 2.73,
      correnteInformada: 0,
      estimated: true,
      disjuntor: 6,
      fase: "L1",
    },
  ],
  totals: { circuitos: 1, potencia: 600, corrente: 2.73, disjuntores: 1, fases: ["L1"] },
  balance: { status: "balanced", phases: [{ fase: "L1", potencia: 600, circuitos: 1 }] },
};

const cases = [
  { name: "Relatório (calculadora)", endpoint: "/api/report/pdf", payload: reportPayload, file: "DimenVolt-Relatorio" },
  { name: "Levantamento", endpoint: "/api/report/levantamento", payload: levantamentoPayload, file: "DimenVolt-Levantamento" },
  { name: "Quadro", endpoint: "/api/report/quadro", payload: quadroPayload, file: "DimenVolt-Quadro" },
];

module.exports = {
  category: { code: "03", name: "Endpoints de PDF" },
  suite: { id: "report-endpoints", name: "Contrato das rotas de API" },
  tests: cases.flatMap((c) => [
    {
      name: c.name + " — payload válido gera PDF (200)",
      fn: async (h) => {
        const res = await postJson(h.serverBase, c.endpoint, c.payload);
        h.equal(res.status, 200, "Status 200");
        h.match(res.contentType, /^application\/pdf/, "Content-Type application/pdf");
        h.match(res.disposition, new RegExp(c.file + "-\\d{4}-\\d{2}-\\d{2}\\.pdf"), "Content-Disposition com o nome do arquivo");
        const info = harness.pdfInfo(res.body);
        h.ok(info.isPdf, "Corpo inicia com %PDF-");
        h.ok(info.size > 1000, "PDF não vazio");
        h.ok(info.pages >= 1, "PDF com pelo menos 1 página");
      },
    },
    {
      name: c.name + " — payload inválido responde 400 JSON",
      fn: async (h) => {
        const res = await postJson(h.serverBase, c.endpoint, {});
        h.equal(res.status, 400, "Status 400");
        h.match(res.contentType, /^application\/json/, "Content-Type application/json");
        const parsed = JSON.parse(res.body.toString("utf8"));
        h.ok(parsed && typeof parsed.error === "string", "Resposta contém campo error");
      },
    },
  ]),
};
