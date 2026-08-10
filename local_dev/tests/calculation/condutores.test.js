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
  suite: { id: "calc-condutores", name: "Condutores (fase, neutro e PE)" },
  tests: [
    {
      name: "Ligação fase-neutro: fase, neutro e PE com a mesma seção",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 10 }));
        h.result("Fase", res.texts.phase);
        h.result("Neutro", res.texts.neutral);
        h.result("PE", res.texts.pe);
        h.ok(res.ok, "Resultado válido");
        h.equal(res.texts.phase, "1 x 4 mm² Cobre", "Fase: 1 condutor de 4 mm²");
        h.equal(res.texts.neutral, "4 mm² Cobre", "Neutro acompanha a seção da fase (≤ 16 mm²)");
        h.equal(res.texts.pe, "4 mm² Cobre", "PE = seção da fase (≤ 16 mm², NBR 5410)");
        h.equal(res.texts.connLabel, "Fase-Neutro (FN)", "Ligação rotulada Fase-Neutro");
        h.equal(res.texts.circuitTypeLabel, "TUG", "Tipo de circuito rotulado TUG");
      },
    },
    {
      name: "Ligação fase-fase: dois condutores de fase e neutro não aplicável",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(
          Object.assign({}, base, { tipoLigacao: "phase-phase", potencia: 5500, comprimento: 10 })
        );
        h.result("Fase", res.texts.phase);
        h.result("Neutro", res.texts.neutral);
        h.result("PE", res.texts.pe);
        h.ok(res.ok, "Resultado válido");
        h.equal(res.texts.phase, "2 x 6 mm² Cobre", "Fase-fase: 2 condutores de fase");
        h.equal(res.texts.neutral, "Não aplicável (ligação fase-fase)", "Neutro não aplicável em FF");
        h.equal(res.texts.connLabel, "Fase-Fase (FF)", "Ligação rotulada Fase-Fase");
      },
    },
    {
      name: "Ligação trifásica: três condutores de fase",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(
          Object.assign({}, base, { tensao: 380, tipoLigacao: "three-phase", potencia: 9000, comprimento: 10 })
        );
        h.ok(res.ok, "Resultado válido");
        h.equal(res.texts.phase, "3 x 4 mm² Cobre", "Trifásico: 3 condutores de fase");
        h.equal(res.texts.connLabel, "Trifásico (3F)", "Ligação rotulada Trifásico");
      },
    },
    {
      name: "PE de seções acima de 16 mm² segue a regra da metade",
      fn: async (h) => {
        const engine = await h.engine();
        const small = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 10 }));
        const large = engine.dimensionar(
          Object.assign({}, base, { tipoCircuito: "tue", quedaTensaoMax: 2, potencia: 5500, comprimento: 60 })
        );
        h.result("PE seção 4 mm²", small.texts.pe);
        h.result("PE seção 25 mm²", large.texts.pe);
        h.ok(small.ok && large.ok, "Ambos os resultados válidos");
        h.equal(small.texts.pe, "4 mm² Cobre", "Seção ≤ 16 mm² → PE igual à fase");
        h.equal(large.section, 25, "Fase de 25 mm² selecionada");
        h.equal(large.texts.pe, "16 mm² Cobre", "Seção > 16 mm² → PE = metade, mínimo 16 mm²");
      },
    },
    {
      name: "Material alumínio reflete no texto dos condutores",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { material: "aluminum", potencia: 5500, comprimento: 10 }));
        h.result("Fase", res.texts.phase);
        h.ok(res.ok, "Resultado válido");
        h.match(res.texts.phase, /Alumínio/, "Texto de condutores indica alumínio");
        h.match(res.texts.neutral, /Alumínio/, "Texto do neutro indica alumínio");
        h.ok(res.section >= 10, "Seção de alumínio adequada para 25 A", "seção = " + res.section);
      },
    },
  ],
};
