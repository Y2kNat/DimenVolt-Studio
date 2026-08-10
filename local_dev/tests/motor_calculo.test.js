"use strict";

const approx = (h, actual, expected, label, tol) => {
  h.approx(actual, expected, tol === undefined ? 0.01 : tol, label);
};

const okStructural = (h, res, name) => {
  h.ok(res && res.ok === true, name + ": ok=true", res && res.error);
  h.ok(typeof res.section === "number" && res.section > 0, name + ": seção válida");
  h.ok(res.ib > 0, name + ": Ib válido");
  h.ok(res.breaker <= res.correctedAmpacity + 1e-9, name + ": disjuntor ≤ Iz");
  if (res.breaker < res.ib) {
    h.ok(res.status.class === "warning", name + ": breaker<Ib exige Alerta");
  }
  h.ok(res.dropPct <= res.params.quedaTensaoMax + 1e-9, name + ": queda dentro do limite");
  h.ok(res.section >= res.minSize, name + ": seção ≥ mínimo");
  h.ok(typeof res.reason === "string" && res.reason.indexOf("NBR 5410") !== -1, name + ": razão cita NBR 5410");
  h.ok(res.texts.phase.length > 0, name + ": texto de fase presente");
  h.ok(res.texts.neutral.length > 0, name + ": texto de neutro presente");
  h.ok(res.texts.pe.length > 0, name + ": texto de PE presente");
  h.ok(res.status && res.status.text, name + ": status presente");
};

module.exports = {
  category: { code: "01", name: "Cálculo" },
  suite: { id: "calc-golden", name: "Paridade golden" },
  tests: [
    {
      name: "Base de dados do motor carregada",
      fn: async (h) => {
        const engine = await h.engine();
        h.ok(engine.isReady(), "Motor pronto após load");
        const db = engine.getDB();
        h.ok(db && db.motor && Array.isArray(db.motor.standard_motors), "motor.json carregado");
        h.ok(db.motor.standard_motors.length > 10, "Mais de 10 motores na tabela", db.motor.standard_motors.length);
        const m7 = engine.getMotorData(7.5);
        h.ok(m7 && m7.current_A_380V === 10.9, "getMotorData(7.5) corrente 380V = 10.9 A");
      },
    },
    {
      name: "Paridade: TUG 4500W 220V FN 35m (golden)",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar({
          potencia: 4500,
          tensao: 220,
          comprimento: 35,
          tipoLigacao: "phase-neutral",
          tipoCircuito: "tug",
          metodoInstalacao: "B1",
          margem: "recommended",
          material: "copper",
          condicaoAmbiente: "normal",
          circuitosAgrupados: 1,
          condutoresCarregados: 2,
          quedaTensaoMax: 4,
          fatorPotencia: 1.0
        });
        okStructural(h, res, "Golden TUG");
        approx(h, res.section, 6, "Seção", 0.001);
        approx(h, res.breaker, 25, "Disjuntor", 0.001);
        approx(h, res.ib, 20.45454545, "Ib", 0.01);
        approx(h, res.correctedAmpacity, 36, "Iz", 0.01);
        approx(h, res.dropPct, 2.00454545, "Queda de tensão %", 0.01);
        approx(h, res.ftotal, 1, "ftotal", 0.001);
        h.ok(res.status.class === "safe", "Status seguro");
        h.ok(res.texts.phase.indexOf("6 mm² Cobre") !== -1, "Fase cita 6 mm² Cobre");
        h.ok(res.texts.phase.indexOf("1 x ") === 0, "Monofásico 1x");
      },
    },
    {
      name: "Motor 7.5 CV 380V trifásico 20m",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar({
          motorCv: 7.5,
          tensao: 380,
          comprimento: 20,
          tipoLigacao: "three-phase",
          tipoCircuito: "tue",
          metodoInstalacao: "B1",
          margem: "recommended",
          material: "copper",
          condicaoAmbiente: "normal",
          circuitosAgrupados: 1,
          condutoresCarregados: 3,
          quedaTensaoMax: 7
        });
        okStructural(h, res, "Motor 7.5 CV");
        approx(h, res.ib, 10.9, "Ib (corrente de placa)", 0.001);
        h.ok(res.motor && res.motor.cv === 7.5, "Resultado expõe dados do motor");
        h.ok(res.motor.nameplateCurrent === 10.9, "Corrente de placa no resultado");
        approx(h, res.motor.powerFactor, 0.79, "FP do motor", 0.001);
        approx(h, res.section, 6, "Seção", 0.001);
        approx(h, res.breaker, 16, "Disjuntor", 0.001);
        h.ok(res.texts.phase.indexOf("3 x 6 mm² Cobre") !== -1, "Fase trifásica 3x6");
        h.ok(res.texts.connLabel.indexOf("Trifásico") !== -1, "Rótulo trifásico");
      },
    },
    {
      name: "Trifásico 11kW 380V FP 0.85 (sem tabela de motor)",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar({
          potencia: 11000,
          tensao: 380,
          comprimento: 30,
          tipoLigacao: "three-phase",
          tipoCircuito: "tue",
          metodoInstalacao: "B1",
          margem: "minimum",
          material: "copper",
          condicaoAmbiente: "normal",
          circuitosAgrupados: 1,
          condutoresCarregados: 3,
          quedaTensaoMax: 7,
          fatorPotencia: 0.85
        });
        okStructural(h, res, "Trifásico 11kW");
        approx(h, res.ib, 11000 / (Math.sqrt(3) * 380 * 0.85), "Ib", 0.01);
        h.ok(res.texts.connLabel.indexOf("Trifásico") !== -1, "Rótulo trifásico");
      },
    },
    {
      name: "Alimentador com múltiplas cargas (multi-tensão)",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar({
          comprimento: 25,
          tipoCircuito: "tue",
          metodoInstalacao: "B1",
          margem: "recommended",
          material: "copper",
          condicaoAmbiente: "normal",
          circuitosAgrupados: 1,
          condutoresCarregados: 3,
          quedaTensaoMax: 7,
          cargas: [
            { potencia: 3000, tensao: 220, tipoLigacao: "phase-neutral", fatorPotencia: 1 },
            { potencia: 7500, tensao: 380, tipoLigacao: "three-phase", fatorPotencia: 0.85 }
          ]
        });
        okStructural(h, res, "Alimentador múltiplas cargas");
        approx(h, res.ib, 3000 / 220 + 7500 / (Math.sqrt(3) * 380 * 0.85), "Ib agregado", 0.01);
        approx(h, res.section, 6, "Seção", 0.001);
        approx(h, res.breaker, 32, "Disjuntor", 0.001);
        h.ok(res.texts.connLabel.indexOf("Trifásico") !== -1, "Rótulo trifásico (carga 3F presente)");
        h.ok(res.dropPct > 0, "Queda de tensão positiva");
      },
    },
    {
      name: "Alta temperatura 50°C + agrupamento reduz seção disponível",
      fn: async (h) => {
        const engine = await h.engine();
        const res = engine.dimensionar({
          potencia: 4500,
          tensao: 220,
          comprimento: 35,
          tipoLigacao: "phase-neutral",
          tipoCircuito: "tug",
          metodoInstalacao: "B1",
          margem: "minimum",
          material: "copper",
          condicaoAmbiente: "veryHot",
          circuitosAgrupados: 4,
          condutoresCarregados: 2,
          quedaTensaoMax: 4,
          fatorPotencia: 1.0
        });
        okStructural(h, res, "Temperatura + agrupamento");
        approx(h, res.ft, 0.71, "Fator temperatura 50°C", 0.001);
        approx(h, res.fg, 0.65, "Fator agrupamento 4 circuitos", 0.001);
        approx(h, res.ftotal, 0.71 * 0.65, "ftotal", 0.001);
        h.ok(res.section >= 10, "Seção cresce com correções severas");
        h.ok(res.status.class === "warning", "Status alerta (breaker < Ib)");
      },
    },
    {
      name: "Casos de erro esperados validados",
      fn: async (h) => {
        const engine = await h.engine();
        const cases = [
          [{ potencia: "abc", tensao: 220, comprimento: 10 }, "Potência"],
          [{ potencia: 1000, tensao: 220, comprimento: -5 }, "Comprimento"],
          [{ motorCv: 999, tensao: 380, comprimento: 10, tipoLigacao: "three-phase" }, "não encontrado"],
          [{ motorCv: 7.5, tensao: 127, comprimento: 10, tipoLigacao: "three-phase" }, "127V"],
          [{ motorCv: 7.5, tensao: 380, comprimento: 10, tipoLigacao: "phase-neutral" }, "trifásica"]
        ];
        for (const [mat, contains] of cases) {
          const res = engine.dimensionar(mat);
          h.ok(res && res.ok === false, "Caso rejeitado: " + contains);
          h.ok(res.error && String(res.error).indexOf(contains) !== -1, "Mensagem contém '" + contains + "'", res && res.error);
        }
      },
    },
  ],
};
