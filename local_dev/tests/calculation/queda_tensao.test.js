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
  suite: { id: "calc-queda-tensao", name: "Queda de tensão" },
  tests: [
    {
      name: "Trecho longo força aumento de seção por queda de tensão",
      fn: async (h) => {
        const engine = await h.engine();
        const shortMat = Object.assign({}, base, { tipoCircuito: "tue", potencia: 5500, comprimento: 10 });
        const longMat = Object.assign({}, base, { tipoCircuito: "tue", potencia: 5500, comprimento: 60 });
        const short = engine.dimensionar(shortMat);
        const long = engine.dimensionar(longMat);
        h.input("Carga", "TUE 5.500 W · 220 V");
        h.result("Curto (10 m)", "seção " + short.section + " mm² · queda " + short.dropPct.toFixed(2) + " %");
        h.result("Longo (60 m)", "seção " + long.section + " mm² · queda " + long.dropPct.toFixed(2) + " %");
        h.ok(short.ok && long.ok, "Ambos os trechos dimensionados");
        h.ok(long.section > short.section, "Aumento do comprimento eleva a seção necessária", short.section + " → " + long.section);
        h.equal(long.section, 16, "Seção do trecho longo = 16 mm²");
        h.ok(long.dropPct <= 4, "Queda de tensão respeita o limite de 4 %", "queda = " + long.dropPct.toFixed(2) + " %");
      },
    },
    {
      name: "Dobrar o comprimento dobra a queda de tensão",
      fn: async (h) => {
        const engine = await h.engine();
        const m10 = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 10 }));
        const m20 = engine.dimensionar(Object.assign({}, base, { potencia: 4400, comprimento: 20 }));
        h.input("Carga", "TUG 4.400 W · 220 V");
        h.result("10 m", m10.dropPct.toFixed(3) + " %");
        h.result("20 m", m20.dropPct.toFixed(3) + " %");
        h.ok(m10.ok && m20.ok, "Ambos os trechos dimensionados");
        h.equal(m10.section, m20.section, "Mesma seção para os dois trechos (4 mm²)");
        h.approx(m20.dropPct, m10.dropPct * 2, 0.05, "Queda de 20 m ≈ 2× a queda de 10 m");
        h.ok(m20.dropPct > m10.dropPct, "Queda de tensão aumenta com o comprimento");
      },
    },
    {
      name: "Percentual de queda é a queda em volts sobre a tensão",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar(Object.assign({}, base, { potencia: 5500, comprimento: 60 }));
        const calc = (res.dropVolts / 220) * 100;
        h.result("dropVolts", res.dropVolts + " V");
        h.result("dropPct (motor)", res.dropPct + " %");
        h.result("dropV / V × 100", calc + " %");
        h.ok(res.ok, "Resultado válido");
        h.approx(res.dropPct, calc, 0.001, "dropPct = dropVolts / tensao × 100 (identidade da definição)");
      },
    },
    {
      name: "Limite de queda de tensão mais rígido exige seção maior",
      fn: async (h) => {
        const engine = await h.engine();
        const mat = Object.assign({}, base, { tipoCircuito: "tue", potencia: 5500, comprimento: 60 });
        const looser = engine.dimensionar(Object.assign({}, mat, { quedaTensaoMax: 4 }));
        const stricter = engine.dimensionar(Object.assign({}, mat, { quedaTensaoMax: 2 }));
        h.input("Carga", "TUE 5.500 W · 220 V · 60 m");
        h.result("Limite 4 %", "seção " + looser.section + " mm² · queda " + looser.dropPct.toFixed(3) + " %");
        h.result("Limite 2 %", "seção " + stricter.section + " mm² · queda " + stricter.dropPct.toFixed(3) + " %");
        h.ok(looser.ok && stricter.ok, "Ambos os limites dimensionados");
        h.ok(stricter.section > looser.section, "Limite mais rígido seleciona seção maior", looser.section + " → " + stricter.section);
        h.equal(looser.section, 16, "Com limite 4 % → 16 mm²");
        h.equal(stricter.section, 25, "Com limite 2 % → 25 mm²");
        h.ok(stricter.dropPct <= 2, "Queda respeita o limite de 2 %", "queda = " + stricter.dropPct.toFixed(3) + " %");
      },
    },
  ],
};
