"use strict";

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
  suite: { id: "calc-dimensionamento", name: "Dimensionamento" },
  tests: [
    {
      name: "Circuito TUG 4.400 W em 220 V monofásico (10 m)",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, { potencia: 4400, comprimento: 10 });
        const res = engine.dimensionar(mat);
        h.input("Matriz de entrada", mat);
        h.result("Corrente de projeto (Ib)", res.ib);
        h.result("Seção selecionada", res.section + " mm²");
        h.result("Capacidade corrigida (Iz)", res.correctedAmpacity + " A");
        h.result("Disjuntor", res.breaker + " A");
        h.result("Queda de tensão", res.dropPct + " %");
        h.ok(res.ok, "O motor retorna resultado válido");
        h.approx(res.ib, 20, 0.05, "Ib = P / V = 4.400 / 220 = 20 A");
        h.equal(res.minSize, 2.5, "Seção mínima NBR 5410 para TUG é 2,5 mm²");
        h.ok(res.section >= 2.5, "Seção final respeita o mínimo normativo", "seção = " + res.section);
        h.equal(res.section, 4, "Margem padrão (recommended) eleva 2,5 mm² → 4 mm² (Iz 28 A)");
        h.equal(res.breaker, 20, "Disjuntor padrão imediatamente ≥ Ib (20 A) e ≤ Iz (28 A)");
        h.ok(res.breaker <= res.correctedAmpacity, "Coordenação In ≥ Ib e In ≤ Iz");
        h.approx(res.dropPct, 0.84, 0.05, "Queda de tensão esperada ≈ 0,84 % (10 m)");
        h.ok(res.dropPct <= 4, "Queda de tensão dentro do limite de 4 %");
        h.equal(res.status.class, "safe", "Status térmico 'safe' (margem confortável)");
        h.equal(res.thermalEval.level, "safe", "Nível de margem térmica seguro");
      },
    },
    {
      name: "Circuito TUE 5.500 W em 220 V com trecho longo (60 m)",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, {
          tipoCircuito: "tue",
          potencia: 5500,
          comprimento: 60,
        });
        const res = engine.dimensionar(mat);
        h.input("Matriz de entrada", mat);
        h.result("Ib", res.ib + " A");
        h.result("Seção selecionada", res.section + " mm²");
        h.result("Queda de tensão", res.dropPct + " %");
        h.approx(res.ib, 25, 0.05, "Ib = 5.500 / 220 = 25 A");
        h.equal(res.section, 16, "Trecho de 60 m exige seção 16 mm² (ampacidade + queda de tensão)");
        h.approx(res.dropPct, 1.57, 0.1, "Queda de tensão ≈ 1,57 % dentro de 4 %");
        h.ok(res.dropPct <= 4, "Queda de tensão dentro do limite de 4 %");
        h.equal(res.breaker, 25, "Disjuntor 25 A (≥ Ib 25 A, ≤ Iz 68 A)");
        h.ok(res.breaker <= res.correctedAmpacity, "Coordenação preservada");
      },
    },
    {
      name: "Circuito TUE (Forno) 6.600 W em 220 V (5 m)",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, { tipoCircuito: "tue", potencia: 6600, comprimento: 5 });
        const res = engine.dimensionar(mat);
        h.input("Matriz de entrada", mat);
        h.result("Ib", res.ib + " A");
        h.result("Seção selecionada", res.section + " mm²");
        h.result("Disjuntor", res.breaker + " A");
        h.approx(res.ib, 30, 0.05, "Ib = 6.600 / 220 = 30 A");
        h.equal(res.section, 10, "Seção 10 mm² (Iz 50 A ≥ Ib 30 A, margem padrão)");
        h.equal(res.breaker, 32, "Disjuntor padrão ≥ 30 A → 32 A");
        h.ok(res.breaker <= res.correctedAmpacity, "32 A ≤ Iz 50 A");
      },
    },
    {
      name: "Circuito trifásico 9.000 W em 380 V",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, {
          tensao: 380,
          tipoLigacao: "three-phase",
          potencia: 9000,
          comprimento: 10,
        });
        const res = engine.dimensionar(mat);
        h.input("Matriz de entrada", mat);
        h.result("Ib", res.ib + " A");
        h.result("Seção selecionada", res.section + " mm²");
        h.result("Condutor (fase)", res.texts.phase);
        h.approx(res.ib, 13.67, 0.1, "Ib = 9.000 / (380 × √3) ≈ 13,67 A");
        h.equal(res.section, 4, "Seção 4 mm² com margem padrão");
        h.equal(res.breaker, 16, "Disjuntor padrão ≥ 13,67 A → 16 A");
        h.equal(res.texts.phase, "3 x 4 mm² Cobre", "Texto de condutores: 3 fases de 4 mm²");
        h.equal(res.texts.connLabel, "Trifásico (3F)", "Ligação identificada como trifásica");
      },
    },
    {
      name: "Preferência de margem altera a seção selecionada",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, { potencia: 4400, comprimento: 10 });
        const minimum = engine.dimensionar(Object.assign({}, mat, { margem: "minimum" }));
        const recommended = engine.dimensionar(Object.assign({}, mat, { margem: "recommended" }));
        const high = engine.dimensionar(Object.assign({}, mat, { margem: "high" }));
        h.input("Carga", "4.400 W · 220 V · 10 m");
        h.result("mínima", minimum.section + " mm² (Iz " + minimum.correctedAmpacity + " A)");
        h.result("recomendada", recommended.section + " mm² (Iz " + recommended.correctedAmpacity + " A)");
        h.result("alta", high.section + " mm² (Iz " + high.correctedAmpacity + " A)");
        h.ok(minimum.ok && recommended.ok && high.ok, "Todos os modos de margem retornam resultado");
        h.equal(minimum.section, 2.5, "Margem mínima → 2,5 mm² (Ib 20 ≤ Iz 21 A)");
        h.equal(recommended.section, 4, "Margem recomendada → 4 mm²");
        h.equal(high.section, 6, "Margem alta → 6 mm²");
        h.ok(minimum.section < recommended.section && recommended.section < high.section, "Seção cresce com a margem solicitada");
      },
    },
  ],
};
