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
  suite: { id: "calc-protecoes", name: "Proteções e fatores de correção" },
  tests: [
    {
      name: "Rejeita cargas e comprimentos inválidos",
      fn: async (h) => {
        const engine = await h.engine();
        const zero = engine.dimensionar(Object.assign({}, base, { potencia: 0, comprimento: 10 }));
        const negative = engine.dimensionar(Object.assign({}, base, { potencia: -100, comprimento: 10 }));
        const noLength = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 0 }));
        h.result("Potência 0", zero.error || "ok");
        h.result("Potência negativa", negative.error || "ok");
        h.result("Comprimento 0", noLength.error || "ok");
        h.ok(zero.ok === false, "Potência 0 → resultado não aceito");
        h.equal(zero.error, "Potência inválida", "Mensagem de potência inválida");
        h.ok(negative.ok === false, "Potência negativa → resultado não aceito");
        h.equal(negative.error, "Potência inválida", "Mensagem de potência inválida");
        h.ok(noLength.ok === false, "Comprimento 0 → resultado não aceito");
        h.equal(noLength.error, "Comprimento do cabo inválido", "Mensagem de comprimento inválido");
      },
    },
    {
      name: "Temperatura de 50 °C aplica fator 0,71 e eleva a seção",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = { potencia: 5500, comprimento: 10 };
        const normal = engine.dimensionar(Object.assign({}, base, mat));
        const hot = engine.dimensionar(Object.assign({}, base, mat, { condicaoAmbiente: "veryHot" }));
        h.input("Carga", "TUG 5.500 W · 220 V · 10 m");
        h.result("Ambiente normal", "seção " + normal.section + " mm² · ft " + normal.ft);
        h.result("Ambiente 50 °C", "seção " + hot.section + " mm² · ft " + hot.ft);
        h.ok(normal.ok && hot.ok, "Ambos os ambientes dimensionados");
        h.approx(hot.ft, 0.71, 0.01, "Fator de temperatura PVC 50 °C = 0,71");
        h.approx(hot.ftotal, 0.71, 0.01, "Fator total reflete a temperatura");
        h.ok(hot.section > normal.section, "Temperatura elevada exige seção maior", normal.section + " → " + hot.section);
        h.equal(hot.section, 10, "Seção 10 mm² a 50 °C (6 mm² × 0,71 = 25,56 A ≥ Ib 25 A + margem)");
        h.equal(normal.section, 6, "Seção 6 mm² em ambiente normal");
      },
    },
    {
      name: "Quatro circuitos agrupados aplicam fator 0,65",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = { potencia: 4400, comprimento: 10 };
        const solo = engine.dimensionar(Object.assign({}, base, mat));
        const grouped = engine.dimensionar(Object.assign({}, base, mat, { circuitosAgrupados: 4 }));
        h.input("Carga", "TUG 4.400 W · 220 V · 10 m");
        h.result("Sem agrupamento", "seção " + solo.section + " mm² · fg " + solo.fg);
        h.result("4 circuitos", "seção " + grouped.section + " mm² · fg " + grouped.fg);
        h.ok(solo.ok && grouped.ok, "Ambos os cenários dimensionados");
        h.approx(grouped.fg, 0.65, 0.01, "Fator de agrupamento de 4 circuitos = 0,65");
        h.approx(grouped.ftotal, 0.65, 0.01, "Fator total reflete o agrupamento");
        h.ok(grouped.section > solo.section, "Agrupamento exige seção maior", solo.section + " → " + grouped.section);
        h.equal(solo.section, 4, "Sem agrupamento → 4 mm²");
        h.equal(grouped.section, 10, "4 circuitos agrupados → 10 mm²");
      },
    },
    {
      name: "Quatro condutores carregados aplicam fator de 0,95",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(
          Object.assign({}, base, { potencia: 4400, comprimento: 10, condutoresCarregados: 4 })
        );
        h.result("fc", res.fc);
        h.result("ftotal", res.ftotal);
        h.result("Seção", res.section + " mm²");
        h.ok(res.ok, "Resultado válido");
        h.approx(res.fc, 0.95, 0.01, "Fator de 4 condutores carregados = 0,95");
        h.approx(res.ftotal, 0.95, 0.01, "Fator total reflete os condutores");
        h.equal(res.section, 6, "Seção 6 mm² com o fator aplicado");
      },
    },
    {
      name: "Status e classes de segurança do dimensionamento",
      fn: async (h) => {
        const engine = await h.engine();
        const safe = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 10 }));
        const tight = engine.dimensionar(
          Object.assign({}, base, { margem: "minimum", potencia: 4400, comprimento: 10 })
        );
        h.result("Caso confortável", safe.status.text + " · " + safe.status.class);
        h.result("Caso no limite térmico", tight.status.text + " · " + tight.status.class);
        h.ok(safe.status.class === "safe" && safe.status.text === "Seguro", "Margem confortável → status Seguro/safe");
        h.ok(tight.status.class === "warning", "Margem mínima (Ib próximo a Iz) → status de alerta");
        h.equal(tight.status.text, "Atenção - Margem de segurança reduzida", "Texto de alerta para margem reduzida");
        h.ok(safe.status.color && tight.status.color, "Status possui cor definida para exibição");
        h.ok(safe.reason && safe.reason.length > 20, "Justificativa técnica (reason) gerada");
      },
    },
  ],
};
