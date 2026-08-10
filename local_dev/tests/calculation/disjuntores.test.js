"use strict";

const fs = require("fs");
const path = require("path");

const base = {
  tensao: 220,
  tipoLigacao: "phase-neutral",
  tipoCircuito: "tug",
  metodoInstalacao: "B1",
  margem: "recommended",
  material: "copper",
  condicaoAmbiente: "normal",
  circuitosAgrupados: 1,
  condutoresCarregados: 2,
  quedaTensaoMax: 4,
  fatorPotencia: 1,
};

module.exports = {
  category: { code: "01", name: "Cálculo" },
  suite: { id: "calc-disjuntores", name: "Disjuntores" },
  tests: [
    {
      name: "Coordenação do disjuntor: In ≥ Ib e In ≤ Iz",
      fn: async (h) => {
        const engine = await h.engine();
        const breakersPath = path.join(h.root, "data", "circuit_breakers.json");
        const standard = JSON.parse(fs.readFileSync(breakersPath, "utf8")).standard_breakers.map(
          (b) => b.rated_current_A
        );
        const loads = [
          { potencia: 1000, comprimento: 15 },
          { potencia: 4400, comprimento: 10 },
          { potencia: 5500, comprimento: 10 },
          { potencia: 6600, comprimento: 5 },
          { potencia: 15000, comprimento: 10 },
        ];
        for (const l of loads) {
          const res = engine.dimensionar(Object.assign({}, base, l));
          h.ok(res.ok, "Carga " + l.potencia + " W dimensionada");
          h.ok(res.breaker >= res.ib, "In ≥ Ib", "In " + res.breaker + " vs Ib " + res.ib.toFixed(2) + " (" + l.potencia + " W)");
          h.ok(res.breaker <= res.correctedAmpacity, "In ≤ Iz", "In " + res.breaker + " vs Iz " + res.correctedAmpacity.toFixed(2));
          h.ok(standard.indexOf(res.breaker) !== -1, "In é um valor padronizado", "In = " + res.breaker + " A em " + standard.join("/"));
        }
        h.input("Valores padronizados", standard.join(" A, ") + " A");
        h.result("Cargas testadas", "1.000 / 4.400 / 5.500 / 6.600 / 15.000 W");
      },
    },
    {
      name: "Disjuntor 32 A para corrente de 30 A",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { tipoCircuito: "tue", potencia: 6600, comprimento: 5 }));
        h.result("Ib", res.ib + " A");
        h.result("Disjuntor", res.breaker + " A");
        h.result("Iz", res.correctedAmpacity + " A");
        h.approx(res.ib, 30, 0.05, "Ib = 30 A");
        h.equal(res.breaker, 32, "Próximo padrão ≥ 30 A → 32 A");
      },
    },
    {
      name: "Disjuntor mínimo de 6 A para cargas pequenas",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { potencia: 1000, comprimento: 15 }));
        h.result("Ib", res.ib + " A");
        h.result("Disjuntor", res.breaker + " A");
        h.equal(res.breaker, 6, "Carga de 1.000 W (Ib 4,55 A) recebe o disjuntor mínimo de 6 A");
      },
    },
    {
      name: "Carga pesada de 15.000 W exige disjuntor de 80 A",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { potencia: 15000, comprimento: 10 }));
        h.result("Ib", res.ib + " A");
        h.result("Disjuntor", res.breaker + " A");
        h.result("Seção", res.section + " mm²");
        h.approx(res.ib, 68.18, 0.1, "Ib = 15.000 / 220 ≈ 68,18 A");
        h.equal(res.breaker, 80, "Próximo padrão ≥ 68,18 A → 80 A");
        h.ok(res.breaker <= res.correctedAmpacity, "80 A ≤ Iz");
      },
    },
  ],
};
