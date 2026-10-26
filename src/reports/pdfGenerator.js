const puppeteer =
  typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("puppeteer")
    : null;

function isServerlessRuntime() {
  return (
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.AWS_EXECUTION_ENV === "AWS_Lambda_nodejs18.x" ||
    process.env.AWS_EXECUTION_ENV === "AWS_Lambda_nodejs20.x" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

function resolveServerlessChromium() {
  if (typeof require !== "function" || typeof module === "undefined" || !module.exports) {
    return null;
  }
  if (!isServerlessRuntime()) return null;
  try {
    return require("@sparticuz/chromium");
  } catch (err) {
    return null;
  }
}

async function launchBrowser() {
  const chromium = resolveServerlessChromium();
  if (chromium) {
    const puppeteerCore = require("puppeteer-core");
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return puppeteer.launch({
    headless: true,
    timeout: 60000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

const CONNECTION_LABELS = {
  "phase-neutral": "Fase-Neutro (FN)",
  "phase-phase": "Fase-Fase (FF)",
  "three-phase": "Trifásico (3F)",
};

const CIRCUIT_LABELS = {
  lighting: "Iluminação",
  tug: "Tomadas de Uso Geral (TUG)",
  tue: "Tomadas de Uso Específico (TUE)",
};

const METHOD_LABELS = {
  B1: "B1 — Eletroduto embutido",
  B2: "B2 — Eletroduto aparente",
  C: "C — Cabo ao ar livre",
  D: "D — Eletroduto enterrado",
};

const MATERIAL_LABELS = {
  copper: "Cobre",
  aluminum: "Alumínio",
};

const AMBIENT_LABELS = {
  normal: "Ambiente normal (30°C)",
  hot: "Ambiente quente (40°C)",
  veryHot: "Ambiente muito quente (50°C)",
};

function asNumber(value, field, min, max) {
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new Error(`Campo inválido: ${field}`);
  }
  if (min != null && n < min) throw new Error(`Campo fora da faixa: ${field}`);
  if (max != null && n > max) throw new Error(`Campo fora da faixa: ${field}`);
  return n;
}

function asString(value, field, maxLen) {
  if (value == null) throw new Error(`Campo obrigatório: ${field}`);
  const s = String(value).trim();
  if (!s) throw new Error(`Campo obrigatório: ${field}`);
  if (s.length > maxLen) throw new Error(`Campo muito longo: ${field}`);
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function asEnum(value, field, allowed) {
  const s = String(value || "").trim();
  if (!allowed.includes(s)) throw new Error(`Valor inválido: ${field}`);
  return s;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(date) {
  return date.toLocaleDateString("pt-BR");
}

function fmt(value, digits) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits || 0,
    maximumFractionDigits: digits || 0,
  });
}

// Número em vírgula decimal, sem zeros à direita forçados (10 → "10"; 1,5 → "1,5").
function fmtNum(value, maxDigits) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", {
    maximumFractionDigits: maxDigits == null ? 2 : maxDigits,
  });
}

function fmtPower(w) {
  return fmt(w, 0) + " W";
}

function buildAnalysis(data) {
  const parts = [];
  const ib = data.results.currentIb;
  const iz = data.results.ampacityIz;
  const breaker = data.results.breakerA;
  const dropPct = data.results.dropPct;
  const maxDrop = data.inputs.maxDrop;
  const coordinated = ib <= breaker && breaker <= iz;
  const ampacityOk = iz >= ib;
  const dropOk = dropPct <= maxDrop;

  if (ampacityOk) {
    parts.push(
      `O condutor selecionado possui capacidade Iz (${fmt(iz, 2)} A) superior à corrente de projeto Ib (${fmt(ib, 2)} A).`
    );
  } else {
    parts.push(
      `Atenção: a capacidade Iz (${fmt(iz, 2)} A) não atende integralmente a corrente de projeto Ib (${fmt(ib, 2)} A).`
    );
  }

  if (coordinated) {
    parts.push(
      `O disjuntor de ${fmt(breaker)} A (Curva C) está coordenado com o cabo, respeitando Ib ≤ In ≤ Iz.`
    );
  } else {
    parts.push(
      `A coordenação Ib ≤ In ≤ Iz deve ser revisada (Ib = ${fmt(ib, 2)} A, In = ${fmt(breaker)} A, Iz = ${fmt(iz, 2)} A).`
    );
  }

  if (dropOk) {
    parts.push(
      `A queda de tensão calculada (${fmt(dropPct, 2)}%) está dentro do limite definido (${fmtNum(maxDrop, 1)}%).`
    );
  } else {
    parts.push(
      `A queda de tensão (${fmt(dropPct, 2)}%) ultrapassa o limite máximo de ${fmtNum(maxDrop, 1)}%.`
    );
  }

  parts.push(`Status de segurança informado: ${data.results.status}.`);

  if (data.results.reason) {
    parts.push(data.results.reason);
  }

  return parts.join(" ");
}

function validateReportPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Payload inválido");
  }

  const inputs = body.inputs || {};
  const results = body.results || {};

  const voltage = asNumber(inputs.voltage, "voltage", 1, 1000);
  const power = asNumber(inputs.power, "power", 1, 5000000);
  const length = asNumber(inputs.length, "length", 0.1, 10000);
  const connectionType = asEnum(inputs.connectionType, "connectionType", [
    "phase-neutral",
    "phase-phase",
    "three-phase",
  ]);
  const circuitType = asEnum(inputs.circuitType, "circuitType", ["lighting", "tug", "tue"]);
  const installMethod = asEnum(inputs.installMethod, "installMethod", ["B1", "B2", "C", "D"]);
  const material = asEnum(inputs.material, "material", ["copper", "aluminum"]);
  const ambientCondition = asEnum(inputs.ambientCondition, "ambientCondition", [
    "normal",
    "hot",
    "veryHot",
  ]);
  const groupedCircuits = asNumber(inputs.groupedCircuits, "groupedCircuits", 1, 20);
  const loadedConductors = asNumber(inputs.loadedConductors, "loadedConductors", 2, 4);
  const maxDrop = asNumber(inputs.maxDrop, "maxDrop", 0.5, 15);
  const powerFactor = asNumber(inputs.powerFactor, "powerFactor", 0.5, 1);

  const currentIb = asNumber(results.currentIb, "currentIb", 0.01, 10000);
  const ampacityIz = asNumber(results.ampacityIz, "ampacityIz", 0.01, 10000);
  const breakerA = asNumber(results.breakerA, "breakerA", 1, 1000);
  const dropV = asNumber(results.dropV, "dropV", 0, 10000);
  const dropPct = asNumber(results.dropPct, "dropPct", 0, 100);
  const cable = asString(results.cable, "cable", 180);
  const factors = asString(results.factors, "factors", 240);
  const status = asString(results.status, "status", 180);
  const sectionMm2 = asNumber(results.sectionMm2, "sectionMm2", 0.5, 500);

  const reason = results.reason
    ? asString(results.reason, "reason", 2000)
    : "";
  const neutral = results.neutral
    ? asString(results.neutral, "neutral", 180)
    : "—";
  const pe = results.pe ? asString(results.pe, "pe", 180) : "—";
  const thermalMargin = results.thermalMargin
    ? asString(results.thermalMargin, "thermalMargin", 40)
    : "—";
  const alternative = results.alternative
    ? asString(results.alternative, "alternative", 800)
    : "";

  const generatedAt = body.generatedAt
    ? new Date(body.generatedAt)
    : new Date();

  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("Data inválida");
  }

  return {
    generatedAt,
    inputs: {
      voltage,
      power,
      length,
      connectionType,
      circuitType,
      installMethod,
      material,
      ambientCondition,
      groupedCircuits,
      loadedConductors,
      maxDrop,
      powerFactor,
    },
    results: {
      currentIb,
      ampacityIz,
      breakerA,
      dropV,
      dropPct,
      cable,
      factors,
      status,
      sectionMm2,
      reason,
      neutral,
      pe,
      thermalMargin,
      alternative,
    },
  };
}

function validateLevantamentoPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Payload inválido");
  }

  const clienteRaw = body.cliente || {};
  const cliente = {
    nome: asString(clienteRaw.nome, "cliente.nome", 120),
  };

  const obraRaw = body.obra || {};
  const obra = {
    tipo: asEnum(obraRaw.tipo, "tipo", ["Residencial", "Comercial", "Industrial"]),
    tensao: asEnum(obraRaw.tensao, "tensao", ["127V", "220V", "380V"]),
  };

  const totalsRaw = body.totals || {};
  const tugRaw = totalsRaw.tug || {};
  const tueRaw = totalsRaw.tue || {};
  const tugPontos = asNumber(
    tugRaw.pontos != null ? tugRaw.pontos : totalsRaw.tomadas ?? 0,
    "tug.pontos", 0, 100000
  );
  const tugPotencia = asNumber(tugRaw.potencia ?? 0, "tug.potencia", 0, 100000000);
  const tuePontos = asNumber(tueRaw.pontos ?? 0, "tue.pontos", 0, 100000);
  const tuePotencia = asNumber(tueRaw.potencia ?? 0, "tue.potencia", 0, 100000000);
  const iluRaw = totalsRaw.iluminacao;
  const iluminacao =
    iluRaw != null && typeof iluRaw === "object"
      ? {
          pontos: asNumber(iluRaw.pontos ?? 0, "iluminacao.pontos", 0, 100000),
          potencia: asNumber(iluRaw.potencia ?? 0, "iluminacao.potencia", 0, 100000000),
        }
      : {
          pontos: asNumber(iluRaw ?? 0, "iluminacao", 0, 100000),
          potencia: 0,
        };
  const interruptores = asNumber(totalsRaw.interruptores, "interruptores", 0, 100000);
  const totals = {
    ambientes: asNumber(totalsRaw.ambientes, "ambientes", 0, 1000),
    tug: { pontos: tugPontos, potencia: tugPotencia },
    tue: { pontos: tuePontos, potencia: tuePotencia },
    tomadas: tugPontos + tuePontos,
    iluminacao,
    interruptores,
    pontos: asNumber(totalsRaw.pontos ?? (tugPontos + tuePontos + iluminacao.pontos + interruptores), "pontos", 0, 300000),
    potencia: asNumber(totalsRaw.potencia ?? (tugPotencia + tuePotencia + iluminacao.potencia), "potencia", 0, 100000000),
    area: asNumber(totalsRaw.area, "area", 0, 1000000),
    perimetro: asNumber(totalsRaw.perimetro, "perimetro", 0, 1000000),
  };

  if (!Array.isArray(body.units)) {
    throw new Error("Campo inválido: units");
  }
  if (body.units.length > 500) {
    throw new Error("Campo fora da faixa: units");
  }

  function normalizePoints(arr, field, unitIndex) {
    if (arr == null) return [];
    if (!Array.isArray(arr)) {
      throw new Error(`Campo inválido: units[${unitIndex}].${field}`);
    }
    if (arr.length > 200) {
      throw new Error(`Campo fora da faixa: units[${unitIndex}].${field}`);
    }
    return arr.map(function (p, j) {
      if (!p || typeof p !== "object") {
        throw new Error(`Campo inválido: units[${unitIndex}].${field}[${j}]`);
      }
      return {
        id: asNumber(p.id ?? (j + 1), `units[${unitIndex}].${field}[${j}].id`, 1, 100000),
        potencia: asNumber(p.potencia ?? 0, `units[${unitIndex}].${field}[${j}].potencia`, 0, 100000000),
      };
    });
  }

  const units = body.units.map(function (u, i) {
    if (!u || typeof u !== "object") {
      throw new Error(`Campo inválido: units[${i}]`);
    }
    const tug = normalizePoints(u.tug, "tug", i);
    const tue = normalizePoints(u.tue, "tue", i);
    let iluminacao;
    if (Array.isArray(u.iluminacao)) {
      iluminacao = normalizePoints(u.iluminacao, "iluminacao", i);
    } else {
      const count = Math.max(0, Math.round(asNumber(u.iluminacao ?? 0, `units[${i}].iluminacao`, 0, 100000)));
      iluminacao = [];
      for (let k = 1; k <= count; k++) iluminacao.push({ id: k, potencia: 0 });
    }
    const tugPot = tug.reduce((a, p) => a + p.potencia, 0);
    const tuePot = tue.reduce((a, p) => a + p.potencia, 0);
    const iluPot = iluminacao.reduce((a, p) => a + p.potencia, 0);
    return {
      label: asString(u.label, `units[${i}].label`, 80),
      tug,
      tue,
      iluminacao,
      tomadas: asNumber(u.tomadas ?? (tug.length + tue.length), `units[${i}].tomadas`, 0, 100000),
      interruptores: asNumber(u.interruptores ?? 0, `units[${i}].interruptores`, 0, 100000),
      potencia: asNumber(u.potencia ?? (tugPot + tuePot + iluPot), `units[${i}].potencia`, 0, 100000000),
      comprimento: asNumber(u.comprimento ?? 0, `units[${i}].comprimento`, 0, 10000),
      largura: asNumber(u.largura ?? 0, `units[${i}].largura`, 0, 10000),
      altura: asNumber(u.altura ?? 0, `units[${i}].altura`, 0, 100),
    };
  });

  const generatedAt = body.generatedAt
    ? new Date(body.generatedAt)
    : new Date();

  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("Data inválida");
  }

  const dimensoesAtivadas = !!body.dimensoesAtivadas;

  if (!Array.isArray(body.circuits)) {
    throw new Error("Campo inválido: circuits");
  }
  if (body.circuits.length > 50) {
    throw new Error("Campo fora da faixa: circuits");
  }

  const circuits = body.circuits.map(function (c, i) {
    if (!c || typeof c !== "object") {
      throw new Error(`Campo inválido: circuits[${i}]`);
    }
    const base = {
      key: asEnum(c.key, `circuits[${i}].key`, ["iluminacao", "tug", "tue"]),
      label: asString(c.label ?? c.key, `circuits[${i}].label`, 80),
      badge: asString(c.badge ?? String(c.key).toUpperCase(), `circuits[${i}].badge`, 40),
      potencia: asNumber(c.potencia ?? 0, `circuits[${i}].potencia`, 0, 1000000),
      distancia: asNumber(c.distancia ?? 0, `circuits[${i}].distancia`, 0, 10000),
    };
    if (c.resultado && typeof c.resultado === "object") {
      base.resultado = {
        corrente: asNumber(c.resultado.corrente, `circuits[${i}].resultado.corrente`, 0, 100000),
        disjuntor: asNumber(c.resultado.disjuntor, `circuits[${i}].resultado.disjuntor`, 0, 10000),
        secao: asNumber(c.resultado.secao, `circuits[${i}].resultado.secao`, 0.5, 1000),
        quedaTensao: asNumber(c.resultado.quedaTensao ?? 0, `circuits[${i}].resultado.quedaTensao`, 0, 100),
        status: asString(c.resultado.status ?? "Seguro", `circuits[${i}].resultado.status`, 200),
        condutores: asNumber(c.resultado.condutores ?? 1, `circuits[${i}].resultado.condutores`, 1, 50),
        metragem: asNumber(c.resultado.metragem ?? 0, `circuits[${i}].resultado.metragem`, 0, 1000000),
      };
    }
    return base;
  });

  let materials = [];
  const includeMaterials = !!body.includeMaterials;
  if (includeMaterials) {
    if (!Array.isArray(body.materials)) {
      throw new Error("Campo inválido: materials");
    }
    if (body.materials.length > 500) {
      throw new Error("Campo fora da faixa: materials");
    }
    materials = body.materials.map(function (m, i) {
      if (!m || typeof m !== "object") {
        throw new Error(`Campo inválido: materials[${i}]`);
      }
      const name = asString(m.name, `materials[${i}].name`, 120);
      const quantity = asNumber(m.quantity ?? 0, `materials[${i}].quantity`, 0, 1000000);
      const unit = asString(m.unit ?? "un", `materials[${i}].unit`, 20);
      const categoryName = asString(m.categoryName ?? m.category ?? "Outros", `materials[${i}].categoryName`, 80);
      const description = m.description
        ? asString(m.description, `materials[${i}].description`, 200)
        : "";
      const estimated = !!m.estimated;
      return {
        id: m.id ? asString(m.id, `materials[${i}].id`, 80) : "",
        name,
        description,
        unit,
        categoryName,
        quantity,
        estimated,
      };
    });
  }

  return { generatedAt, cliente, obra, units, totals, dimensoesAtivadas, circuits, includeMaterials, materials };
}

const QUADRO_TIPOS = [
  "Iluminação",
  "TUG",
  "TUE",
  "Chuveiro",
  "Ar-condicionado",
  "Forno",
  "Outro",
];

const QUADRO_FASES = ["L1", "L2", "L3", "N/A"];

function validateQuadroPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Payload inválido");
  }

  const quadroRaw = body.quadro || {};
  const quadro = {
    identificacao: asString(quadroRaw.identificacao, "identificacao", 40),
    tensao: asEnum(quadroRaw.tensao, "tensao", ["127V", "220V", "380V"]),
    sistema: asEnum(quadroRaw.sistema, "sistema", ["Monofásico", "Bifásico", "Trifásico"]),
  };

  if (!Array.isArray(body.circuits)) {
    throw new Error("Campo inválido: circuits");
  }
  if (body.circuits.length > 200) {
    throw new Error("Campo fora da faixa: circuits");
  }

  const circuits = body.circuits.map(function (c, i) {
    if (!c || typeof c !== "object") {
      throw new Error(`Campo inválido: circuits[${i}]`);
    }
    return {
      id: asString(c.id, `circuits[${i}].id`, 20),
      descricao: asString(c.descricao, `circuits[${i}].descricao`, 80),
      tipo: asEnum(c.tipo, `circuits[${i}].tipo`, QUADRO_TIPOS),
      potencia: asNumber(c.potencia ?? 0, `circuits[${i}].potencia`, 0, 100000000),
      corrente: asNumber(c.corrente ?? 0, `circuits[${i}].corrente`, 0, 1000000),
      correnteInformada: asNumber(c.correnteInformada ?? 0, `circuits[${i}].correnteInformada`, 0, 1000000),
      estimated: !!c.estimated,
      disjuntor: asNumber(c.disjuntor ?? 0, `circuits[${i}].disjuntor`, 0, 10000),
      fase: asEnum(c.fase || "N/A", `circuits[${i}].fase`, QUADRO_FASES),
    };
  });

  const totalsRaw = body.totals || {};
  const fases = Array.isArray(totalsRaw.fases)
    ? totalsRaw.fases
        .filter((f) => QUADRO_FASES.includes(f))
        .slice(0, 3)
    : [];
  const totals = {
    circuitos: asNumber(totalsRaw.circuitos, "circuitos", 0, 200),
    potencia: asNumber(totalsRaw.potencia, "potencia", 0, 100000000),
    corrente: asNumber(totalsRaw.corrente, "corrente", 0, 1000000),
    disjuntores: asNumber(totalsRaw.disjuntores, "disjuntores", 0, 200),
    fases,
  };

  const balanceRaw = body.balance || {};
  const balancePhases = Array.isArray(balanceRaw.phases)
    ? balanceRaw.phases
        .filter((p) => p && typeof p === "object" && QUADRO_FASES.includes(p.fase))
        .map((p) => ({
          fase: p.fase,
          potencia: asNumber(p.potencia ?? 0, "balance.fase", 0, 100000000),
          circuitos: asNumber(p.circuitos ?? 0, "balance.circuitos", 0, 200),
        }))
    : [];
  const balance = {
    status: asEnum(balanceRaw.status || "unbalanced", "balance.status", ["balanced", "unbalanced"]),
    phases: balancePhases,
  };

  const generatedAt = body.generatedAt
    ? new Date(body.generatedAt)
    : new Date();

  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("Data inválida");
  }

  return { generatedAt, quadro, circuits, totals, balance };
}

function row(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function buildSharedStyles() {
  return `<style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: #1b1b1b;
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      background: #fff;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 14px;
      border-bottom: 2px solid #1b1b1b;
      margin-bottom: 6px;
    }
    .brand { display: flex; align-items: flex-start; gap: 10px; }
    .brand-mark {
      width: 26px;
      height: 26px;
      flex: 0 0 auto;
      border: 1.4px solid #1b1b1b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2.5px;
    }
    .brand-mark i { display: block; width: 2px; background: #1b1b1b; }
    .brand-mark i:nth-child(1) { height: 7px; }
    .brand-mark i:nth-child(2) { height: 13px; }
    .brand-mark i:nth-child(3) { height: 9px; }
    .brand h1 { margin: 0; font-size: 14pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    .brand p { margin: 3px 0 0; font-size: 6.5pt; letter-spacing: 0.05em; color: #8a8a82; }
    .doc-meta { text-align: right; font-size: 7.5pt; color: #707068; line-height: 1.55; }
    .doc-meta strong { display: block; font-size: 10pt; color: #1b1b1b; letter-spacing: 0.02em; margin-bottom: 3px; }
    .doc-no {
      display: inline-block;
      font-family: "Consolas", "Cascadia Mono", ui-monospace, monospace;
      font-size: 7pt;
      letter-spacing: 0.04em;
      padding: 2px 7px;
      border: 1px solid #e0ded6;
      background: #fafaf7;
      margin-bottom: 3px;
    }

    .title-block { margin: 26px 0 30px; }
    .kicker {
      margin: 0 0 7px;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #a0802a;
    }
    .title-block h2 { margin: 0; font-size: 20pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
    .title-sub { margin: 8px 0 0; font-size: 9pt; color: #707068; max-width: 62ch; }

    section { margin: 0 0 24px; page-break-inside: avoid; }
    .sec-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 12px;
    }
    .sec-num {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      background: #1b1b1b;
      color: #fff;
      font-family: "Consolas", ui-monospace, monospace;
      font-size: 8pt;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .sec-head h3 {
      margin: 0;
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .sec-head .rule { flex: 1; height: 1px; background: #e4e2db; }

    table { width: 100%; border-collapse: collapse; font-size: 8.7pt; page-break-inside: avoid; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    table caption {
      caption-side: top;
      text-align: left;
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      font-weight: 600;
      color: #6b6b63;
      padding: 0 0 6px;
      letter-spacing: 0.02em;
    }
    table caption b { color: #1b1b1b; font-weight: 700; }
    table caption .source { margin: 2px 0 0; font-size: 6.8pt; color: #8a8a82; letter-spacing: 0.02em; font-weight: 400; }
    .source {
      margin: 6px 0 0;
      font-size: 7pt;
      color: #8a8a82;
      letter-spacing: 0.02em;
    }
    .source b { color: #6b6b63; font-weight: 600; }
    thead th {
      padding: 7px 9px;
      border-bottom: 1.5px solid #1b1b1b;
      color: #1b1b1b;
      font-size: 7.4pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: left;
      white-space: nowrap;
    }
    tbody th, tbody td {
      padding: 7.5px 9px;
      border-bottom: 1px solid #ecebe5;
      vertical-align: top;
      text-align: left;
    }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: none; }
    tbody th { width: 38%; color: #707068; font-weight: 600; background: #fafaf7; }
    tbody td { color: #1b1b1b; font-weight: 700; }
    thead th.num { text-align: right; }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    table + table { margin-top: 12px; }

    table.metrics tbody th {
      width: 42%;
      color: #707068;
      font-weight: 600;
      background: none;
    }
    table.metrics tbody td {
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .analysis {
      padding: 12px 16px;
      border-left: 3px solid #1b1b1b;
      background: #f7f6f2;
      font-size: 9pt;
      color: #33332f;
      line-height: 1.65;
    }
    .analysis .tag {
      display: block;
      margin-bottom: 5px;
      font-size: 6.8pt;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: #a0802a;
    }
    .analysis p { margin: 0; }
    .note { margin: 10px 0 0; font-size: 8.5pt; color: #707068; line-height: 1.6; }
    .legal {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #e4e2db;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 7.2pt;
      color: #8a8a82;
    }

    /* Callouts — cor com significado */
    .callout {
      margin: 14px 0 0;
      padding: 11px 14px;
      border: 1px solid #e4e2db;
      border-left: 3px solid #1b1b1b;
      background: #fafaf7;
      font-size: 8.8pt;
      color: #33332f;
      line-height: 1.6;
      page-break-inside: avoid;
    }
    .callout .callout-tag {
      display: block;
      margin-bottom: 4px;
      font-size: 6.8pt;
      font-weight: 700;
      letter-spacing: 0.07em;
    }
    .callout-criterio { border-left-color: #a0802a; background: #faf7ee; }
    .callout-criterio .callout-tag { color: #a0802a; }
    .callout-norma { border-left-color: #1b1b1b; }
    .callout-norma .callout-tag { color: #1b1b1b; }
    .callout-aviso { border-left-color: #8c2f2f; background: #faf3f2; }
    .callout-aviso .callout-tag { color: #8c2f2f; }
    .callout a-validar, .callout .a-validar { color: #8a8a82; }
    .callout .a-validar { white-space: nowrap; }

    /* Blocos de fórmula — memória de cálculo */
    .calc { margin: 14px 0 0; page-break-inside: avoid; }
    .calc-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 8px 12px;
      border: 1px solid #e4e2db;
      border-bottom: none;
      background: #fff;
    }
    .calc-row:last-child { border-bottom: 1px solid #e4e2db; }
    .calc-row .f {
      font-family: "Consolas", "Cascadia Mono", ui-monospace, monospace;
      font-size: 8.6pt;
      color: #1b1b1b;
      width: 38%;
      white-space: nowrap;
    }
    .calc-row .n {
      font-family: "Consolas", "Cascadia Mono", ui-monospace, monospace;
      font-size: 8.6pt;
      color: #44443f;
    }
    .calc-row .n b { color: #1b1b1b; }
    .calc-head {
      font-size: 7pt;
      font-weight: 700;
      color: #8a8a82;
      letter-spacing: 0.05em;
      margin: 12px 0 0;
    }

    /* Controle documental */
    .doc-control {
      margin: 12px 0 0;
      border: 1px solid #e4e2db;
      page-break-inside: avoid;
    }
    .doc-control .dc-row {
      display: flex;
      gap: 0;
      border-bottom: 1px solid #ecebe5;
    }
    .doc-control .dc-row:last-child { border-bottom: none; }
    .doc-control .dc-row > div {
      flex: 1;
      padding: 7px 10px;
      min-width: 0;
    }
    .doc-control .dc-row > div + div { border-left: 1px solid #ecebe5; }
    .doc-control span {
      display: block;
      font-size: 6.6pt;
      font-weight: 700;
      color: #8a8a82;
      letter-spacing: 0.05em;
      margin-bottom: 3px;
    }
    .doc-control b { font-size: 8.8pt; color: #1b1b1b; font-weight: 700; }
    .doc-control b.blank { color: #b0aea4; font-weight: 400; }

    /* Levantamento elétrico */
    .cover {
      min-height: 252mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
    }
    .cover-main { margin-top: 48mm; }
    .cover-kicker {
      margin: 0 0 8px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #a0802a;
    }
    .cover-title {
      margin: 0;
      font-size: 28pt;
      font-weight: 700;
      letter-spacing: -0.025em;
      line-height: 1.05;
    }
    .cover-sub { margin: 10px 0 0; font-size: 10pt; color: #707068; max-width: 56ch; }
    .cover-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 32px;
      border-top: 2px solid #1b1b1b;
      padding-top: 16px;
      margin-bottom: 10mm;
    }
    .cover-meta-item { padding: 0 0 13px; border-bottom: 1px solid #e4e2db; }
    .cover-meta-item span {
      display: block;
      font-size: 6.8pt;
      letter-spacing: 0.05em;
      color: #8a8a82;
      margin-bottom: 4px;
    }
    .cover-meta-item strong {
      font-size: 10.5pt;
      font-weight: 700;
      color: #1b1b1b;
      letter-spacing: -0.01em;
    }
    .obs {
      padding: 13px 16px;
      border: 1px solid #e4e2db;
      border-left: 3px solid #1b1b1b;
      background: #fafaf7;
      font-size: 8.8pt;
      color: #44443f;
      line-height: 1.65;
    }
    .obs .obs-tag {
      display: block;
      margin-bottom: 5px;
      font-size: 6.8pt;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: #a0802a;
      }
    .obs p { margin: 0; }

    .circ-block {
      margin: 0 0 14px;
      border: 1px solid #e4e2db;
      border-radius: 4px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .circ-block:last-child { margin-bottom: 0; }
    .circ-block-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 12px;
      background: #1b1b1b;
      color: #fff;
    }
    .circ-block-head h4 {
      margin: 0;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .circ-block-head span { font-size: 8pt; color: rgba(255, 255, 255, 0.72); }
    .circ-block table { border-collapse: collapse; }
    .circ-block table.metrics tbody th { width: 42%; }

    /* Lista de materiais */
    .mat-cat { margin: 18px 0 0; }
    .mat-cat-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding: 9px 0 6px;
      border-bottom: 1.5px solid #1b1b1b;
      margin-bottom: 2px;
    }
    .mat-cat-head h4 {
      margin: 0;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #1b1b1b;
    }
    .mat-cat-head span {
      font-family: "Consolas", ui-monospace, monospace;
      font-size: 7pt;
      color: #8a8a82;
    }
    table.materials tbody th { width: auto; background: none; color: #1b1b1b; font-weight: 600; padding: 6px 9px; }
    table.materials tbody td { padding: 6px 9px; }
    table.materials tbody tr:last-child th,
    table.materials tbody tr:last-child td { border-bottom: 1px solid #ecebe5; }
    .mat-est {
      color: #a0802a;
      font-family: "Consolas", ui-monospace, monospace;
      font-size: 6.5pt;
      letter-spacing: 0.04em;
      margin-left: 6px;
    }
    .mat-total {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1.5px solid #1b1b1b;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 8.5pt;
      font-weight: 700;
      color: #1b1b1b;
    }
    .mat-total span { color: #8a8a82; font-weight: 600; }

    /* Quadro de distribuição */
    .est {
      color: #a0802a;
      font-family: "Consolas", ui-monospace, monospace;
      font-size: 6.5pt;
      letter-spacing: 0.04em;
      margin-left: 5px;
      white-space: nowrap;
    }
    table.balance tbody th { width: auto; background: none; color: #1b1b1b; font-weight: 600; }
    .bal-cell { min-width: 130px; }
    .bal-track {
      display: block;
      height: 7px;
      background: #ecebe5;
      margin-top: 5px;
    }
    .bal-fill {
      display: block;
      height: 7px;
      background: #1b1b1b;
    }
    .bal-fill.p1 { background: #1b1b1b; }
    .bal-fill.p2 { background: #6b6b63; }
    .bal-fill.p3 { background: #a3a39a; }
    .bal-note { margin: 12px 0 0; font-size: 8.8pt; line-height: 1.65; }
    .bal-ok { color: #2c6e49; font-weight: 700; }
    .bal-warn { color: #a0802a; font-weight: 700; }
  </style>`;
}

function buildReportHtml(data) {
  const analysis = buildAnalysis(data);
  const dateLabel = formatDateTime(data.generatedAt);
  const docCode = "RD-REL-01";
  const docRev = "Rev. A";
  const i = data.inputs;
  const r = data.results;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DimenVolt — Relatório de Dimensionamento</title>
  ${buildSharedStyles()}
</head>
<body>
  <header class="doc-header">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
      <div>
        <h1>DimenVolt</h1>
        <p>Studio · Engenharia elétrica</p>
      </div>
    </div>
    <div class="doc-meta">
      <strong>Memorial de Dimensionamento</strong>
      <span class="doc-no">${docCode} · ${docRev}</span><br />
      ${escapeHtml(dateLabel)}
    </div>
  </header>

  <div class="title-block">
    <p class="kicker">Dimensionamento de circuitos · NBR 5410:2004</p>
    <h2>Relatório técnico de dimensionamento elétrico</h2>
    <p class="title-sub">Documento gerado pela plataforma DimenVolt · Studio.</p>
  </div>

  <div class="callout callout-aviso">
    <span class="callout-tag">Limitações de uso</span>
    <p>Documento gerado automaticamente a partir dos parâmetros informados na plataforma. Não constitui projeto executivo nem ART. Os valores devem ser conferidos e assumidos por profissional habilitado (CREA) antes da execução da instalação.</p>
  </div>

  <div class="doc-control">
    <div class="dc-row">
      <div><span>Código do documento</span><b>${docCode}</b></div>
      <div><span>Revisão</span><b>${docRev}</b></div>
      <div><span>Data de emissão</span><b>${escapeHtml(formatShortDate(data.generatedAt))}</b></div>
    </div>
    <div class="dc-row">
      <div><span>Elaboração</span><b>Isac Ornelas · DimenVolt Studio</b></div>
      <div><span>Responsável técnico</span><b class="blank">________</b></div>
      <div><span>CREA</span><b class="blank">________</b></div>
    </div>
  </div>

  <section>
    <div class="sec-head">
      <span class="sec-num">01</span>
      <h3>Resultado do dimensionamento</h3>
      <span class="rule"></span>
    </div>
    <table class="metrics">
      <caption><b>Tabela 1</b> — Resultados do dimensionamento</caption>
      <tbody>
        ${row("Cabo recomendado", r.cable)}
        ${row("Disjuntor recomendado", `${fmt(r.breakerA)} A · Curva C`)}
        ${row("Corrente de projeto (Ib)", `${fmt(r.currentIb, 2)} A`)}
        ${row("Capacidade do cabo (Iz)", `${fmt(r.ampacityIz, 2)} A`)}
        ${row("Seção do condutor", `${fmtNum(r.sectionMm2, 2)} mm²`)}
        ${row("Status de segurança", r.status)}
      </tbody>
    </table>
    <table>
      <caption><b>Tabela 2</b> — Verificação complementar</caption>
      <thead><tr><th>Parâmetro</th><th>Valor</th></tr></thead>
      <tbody>
        ${row("Queda de tensão", `${fmt(r.dropV, 2)} V · ${fmt(r.dropPct, 2)}%`)}
        ${row("Fatores de correção", r.factors)}
        ${row("Condutor neutro", r.neutral)}
        ${row("Condutor PE", r.pe)}
        ${row("Margem térmica", r.thermalMargin)}
      </tbody>
    </table>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">02</span>
      <h3>Dados de entrada</h3>
      <span class="rule"></span>
    </div>
    <table>
      <thead><tr><th>Parâmetro</th><th>Valor</th></tr></thead>
      <tbody>
        ${row("Tensão", `${i.voltage} V`)}
        ${row("Potência", `${i.power} W`)}
        ${row("Comprimento do cabo", `${i.length} m`)}
        ${row("Tipo de ligação", CONNECTION_LABELS[i.connectionType])}
        ${row("Tipo de circuito", CIRCUIT_LABELS[i.circuitType])}
        ${row("Método de instalação", METHOD_LABELS[i.installMethod])}
        ${row("Material do condutor", MATERIAL_LABELS[i.material])}
        ${row("Temperatura ambiente", AMBIENT_LABELS[i.ambientCondition])}
        ${row("Circuitos agrupados", String(i.groupedCircuits))}
        ${row("Condutores carregados", String(i.loadedConductors))}
        ${row("Limite de queda de tensão", `${fmtNum(i.maxDrop, 1)}%`)}
        ${row("Fator de potência", fmt(i.powerFactor, 2))}
      </tbody>
    </table>
    <p class="source">Valores de entrada conforme informado na calculadora DimenVolt. Limites de queda de tensão por tipo de circuito: <b>critério adotado pela plataforma</b> — a NBR 5410:2004 (item 6.2.7) estabelece limites por origem da instalação.</p>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">03</span>
      <h3>Memória de cálculo</h3>
      <span class="rule"></span>
    </div>
    <p class="calc-head">Corrente de projeto</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Ib = P / (V · cos φ)</span><span class="n">= ${fmt(i.power)} / (${fmt(i.voltage)} · ${fmt(i.powerFactor, 2)}) = <b>${fmt(r.currentIb, 2)} A</b></span></div>
    </div>
    <p class="calc-head">Capacidade requerida do condutor</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Iz' = Ib / (Ktemp · Kagr · Kcond)</span><span class="n">= ${fmt(r.currentIb, 2)} / (fatores = ${escapeHtml(r.factors)}) = <b>${fmt(r.ampacityIz, 2)} A</b></span></div>
      <div class="calc-row"><span class="f">Seção comercial</span><span class="n"><b>${fmtNum(r.sectionMm2, 2)} mm²</b> — capacidade ${fmt(r.ampacityIz, 2)} A (NBR 5410:2004 · Tab. 36, cobre/PVC/${escapeHtml(i.installMethod)}, premissas ao lado)</span></div>
    </div>
    <p class="calc-head">Coordenação com a proteção</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Ib ≤ In ≤ Iz</span><span class="n"><b>${fmt(r.currentIb, 2)} ≤ ${fmt(r.breakerA)} ≤ ${fmt(r.ampacityIz, 2)} A</b> — disjuntor ${fmt(r.breakerA)} A, curva C</span></div>
    </div>
    <p class="calc-head">Queda de tensão</p>
    <div class="calc">
      <div class="calc-row"><span class="f">ΔV% = (ΔV / Vnom) · 100</span><span class="n">${fmt(r.dropV, 2)} V / ${fmt(i.voltage)} V · 100 = <b>${fmt(r.dropPct, 2)}%</b> ≤ limite ${fmtNum(i.maxDrop, 1)}%</span></div>
    </div>
    <div class="callout callout-criterio">
      <span class="callout-tag">Critério adotado · limite de queda</span>
      <p>Limite de ${fmtNum(i.maxDrop, 1)}% é o padrão da plataforma para circuitos do tipo ${escapeHtml(CIRCUIT_LABELS[i.circuitType])}. A NBR 5410:2004 — item 6.2.7 estabelece limites por origem da instalação e 4% nos circuitos terminais; confirme a aplicação para a sua condição de alimentação.</p>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">04</span>
      <h3>Análise do dimensionamento</h3>
      <span class="rule"></span>
    </div>
    <div class="analysis">
      <span class="tag">Verificação técnica</span>
      <p>${escapeHtml(analysis)}</p>
    </div>
    ${
      r.alternative
        ? `<p class="note"><strong>Recomendação complementar:</strong> ${escapeHtml(r.alternative)}</p>`
        : ""
    }
  </section>

  <div class="legal">
    <span>DimenVolt · Studio — Documento gerado eletronicamente</span>
    <span>${docCode} · ${docRev} — Responsável técnico: ________ · CREA ________</span>
  </div>
</body>
</html>`;
}

function buildMaterialsSectionHtml(data, sectionNum) {
  if (!data.includeMaterials || !data.materials.length) return "";
  const secNum = sectionNum || "05";

  const order = [
    "Condutores",
    "Proteção",
    "Eletrodutos e acessórios",
    "Caixas e acessórios",
    "Tomadas",
    "Interruptores",
    "Iluminação",
    "Quadros e componentes",
    "Acessórios",
  ];
  const cats = data.materials.reduce(function (acc, m) {
    if (!acc[m.categoryName]) acc[m.categoryName] = [];
    acc[m.categoryName].push(m);
    return acc;
  }, {});

  const groupNames = Object.keys(cats).sort(function (a, b) {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const groupsHtml = groupNames
    .map(function (name) {
      const items = cats[name];
      const rows = items
        .map(function (m) {
          const tag = m.estimated ? '<span class="mat-est">estimado</span>' : "";
          return (
            `<tr><th>${escapeHtml(m.name)}${tag}</th>` +
            `<td class="num">${fmt(m.quantity)}</td>` +
            `<td class="num">${escapeHtml(m.unit)}</td></tr>`
          );
        })
        .join("");
      return (
        `<div class="mat-cat">` +
        `<div class="mat-cat-head"><h4>${escapeHtml(name)}</h4></div>` +
        `<table class="materials"><thead><tr><th>Material</th><th class="num">Qtd.</th><th class="num">Unid.</th></tr></thead>` +
        `<tbody>${rows}</tbody></table>` +
        `</div>`
      );
    })
    .join("");

  return `
  <section>
    <div class="sec-head">
      <span class="sec-num">${secNum}</span>
      <h3>Lista de materiais</h3>
      <span class="rule"></span>
    </div>
    <p class="source">Quantidades compiladas dos pontos e circuitos do levantamento. Itens marcados como <b>estimado</b> são aproximações calculadas e devem ser conferidos em campo.</p>
    ${groupsHtml}
  </section>`;
}

function buildLevantamentoHtml(data) {
  const dateLabel = formatDateTime(data.generatedAt);
  const shortDate = formatShortDate(data.generatedAt);
  const docCode = "RD-LEV-01";
  const docRev = "Rev. A";
  const cliente = data.cliente;
  const obra = data.obra;
  const units = data.units;
  const t = data.totals;
  const circuits = data.circuits || [];
  const circByKey = {};
  circuits.forEach(function (c) {
    circByKey[c.key] = c;
  });
  const circPot = function (key) {
    const c = circByKey[key];
    return c ? Number(c.potencia || 0) : 0;
  };
  const potenciaCircuitos = circPot("iluminacao") + circPot("tug") + circPot("tue");
  const dimensioned = circuits.filter(function (c) {
    return c.resultado;
  });
  const showDims = !!data.dimensoesAtivadas && units.length > 0;
  const showMaterials = data.includeMaterials && data.materials.length > 0;

  const secNos = { id: "01", resumo: "02", ambientes: "03", circuitos: "04" };
  let secCounter = 5;
  if (showDims) secNos.dims = String(secCounter++).padStart(2, "0");
  if (showMaterials) secNos.materials = String(secCounter++).padStart(2, "0");
  secNos.obs = String(secCounter++).padStart(2, "0");

  const unitTug = function (u) {
    return Array.isArray(u.tug) ? u.tug : [];
  };
  const unitTue = function (u) {
    return Array.isArray(u.tue) ? u.tue : [];
  };
  const unitTugCount = function (u) {
    return unitTug(u).length;
  };
  const unitTueCount = function (u) {
    return unitTue(u).length;
  };
  const unitTugPower = function (u) {
    return unitTug(u).reduce((a, p) => a + Number(p.potencia || 0), 0);
  };
  const unitTuePower = function (u) {
    return unitTue(u).reduce((a, p) => a + Number(p.potencia || 0), 0);
  };
  const unitIllum = function (u) {
    return Array.isArray(u.iluminacao) ? u.iluminacao : [];
  };
  const unitIllumCount = function (u) {
    return unitIllum(u).length;
  };
  const unitIllumPower = function (u) {
    return unitIllum(u).reduce((a, p) => a + Number(p.potencia || 0), 0);
  };

  const rowsPoints = units
    .map(
      (u) =>
        `<tr><td>${escapeHtml(u.label)}</td>` +
        `<td class="num">${fmt(unitTugCount(u))} pt · ${fmtPower(unitTugPower(u))}</td>` +
        `<td class="num">${fmt(unitTueCount(u))} pt · ${fmtPower(unitTuePower(u))}</td>` +
        `<td class="num">${fmt(unitIllumCount(u))} pt · ${fmtPower(unitIllumPower(u))}</td>` +
        `<td class="num">${fmt(u.interruptores)}</td>` +
        `<td class="num">${fmtPower(u.potencia)}</td></tr>`
    )
    .join("");

  const rowsPointsDetail = units
    .map((u) => {
      const name = escapeHtml(u.label);
      let rows = "";
      unitTug(u).forEach(function (p) {
        rows +=
          `<tr><td>${name}</td><td>TUG</td><td>${escapeHtml("TUG " + p.id)}</td>` +
          `<td class="num">${fmtPower(p.potencia)}</td></tr>`;
      });
      unitTue(u).forEach(function (p) {
        rows +=
          `<tr><td>${name}</td><td>TUE</td><td>${escapeHtml("TUE " + p.id)}</td>` +
          `<td class="num">${fmtPower(p.potencia)}</td></tr>`;
      });
      unitIllum(u).forEach(function (p) {
        rows +=
          `<tr><td>${name}</td><td>Iluminação</td><td>${escapeHtml("Iluminação " + p.id)}</td>` +
          `<td class="num">${fmtPower(p.potencia)}</td></tr>`;
      });
      if (Number(u.interruptores || 0) > 0) {
        rows +=
          `<tr><td>${name}</td><td>Interruptores</td><td>${fmt(u.interruptores)} ponto(s)</td>` +
          `<td class="num">—</td></tr>`;
      }
      return rows;
    })
    .join("");

  const rowsDims = units
    .map((u) => {
      const area = u.comprimento * u.largura;
      const peri = 2 * (u.comprimento + u.largura);
      return (
        `<tr><td>${escapeHtml(u.label)}</td>` +
        `<td class="num">${fmt(u.comprimento, 2)} m</td>` +
        `<td class="num">${fmt(u.largura, 2)} m</td>` +
        `<td class="num">${fmt(u.altura, 2)} m</td>` +
        `<td class="num">${fmt(area, 2)} m²</td>` +
        `<td class="num">${fmt(peri, 2)} m</td></tr>`
      );
    })
    .join("");

  const circuitsHtml = dimensioned.length
    ? dimensioned
        .map(function (c) {
          const r = c.resultado;
          const cond = fmt(r.condutores, 0);
          const distText = fmt(c.distancia, 1);
          return (
            `<div class="circ-block">` +
            `<div class="circ-block-head"><h4>CIRCUITO — ${escapeHtml(c.badge)}</h4><span>${escapeHtml(c.label)}</span></div>` +
            `<table class="metrics"><tbody>` +
            row("Potência", fmtPower(c.potencia)) +
            row("Distância informada", distText + " m") +
            row("Corrente de projeto (Ib)", fmt(r.corrente, 2) + " A") +
            row("Condutor (fase)", fmt(r.secao, 2) + " mm²") +
            row("Disjuntor", fmt(r.disjuntor, 0) + " A") +
            row("Queda de tensão", fmt(r.quedaTensao, 2) + " %") +
            row("Status", r.status) +
            row("Metragem estimada", fmt(r.metragem, 1) + " m (" + cond + " condutores × " + distText + " m)") +
            `</tbody></table></div>`
          );
        })
        .join("")
    : `<p class="note">Nenhum circuito foi dimensionado neste levantamento.</p>`;

  const obsText =
    "Este documento consolida o levantamento elétrico informado pelo usuário na plataforma DimenVolt · Studio. " +
    "Pontos, potências e distâncias refletem a sessão em que foram registrados. O dimensionamento dos circuitos " +
    " (corrente de projeto, seção do condutor, disjuntor e queda de tensão) foi calculado pela plataforma com os " +
    "parâmetros da NBR 5410:2004 — os limites aplicados são critérios adotados da plataforma e estão descritos no " +
    "memorial de dimensionamento. A metragem estimada considera o número de condutores por circuito " +
    "(fases, neutro e proteção) multiplicado pela distância informada. Todos os dados devem ser conferidos por " +
    "profissional habilitado antes da execução.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DimenVolt — Levantamento Elétrico</title>
  ${buildSharedStyles()}
</head>
<body>
  <section class="cover">
    <header class="doc-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
        <div>
          <h1>DimenVolt</h1>
          <p>Studio · Engenharia elétrica</p>
        </div>
      </div>
      <div class="doc-meta">
        <strong>Levantamento Elétrico</strong>
        <span class="doc-no">${docCode} · ${docRev}</span><br />
        ${escapeHtml(shortDate)}
      </div>
    </header>

    <div class="cover-main">
      <p class="cover-kicker">DimenVolt Studio · Documento técnico</p>
      <h2 class="cover-title">Levantamento elétrico da instalação</h2>
      <p class="cover-sub">Ambientes, pontos, potências e distâncias levantados e dimensionados pelo motor de cálculo.</p>
    </div>

    <div class="cover-meta">
      <div class="cover-meta-item"><span>Cliente</span><strong>${escapeHtml(cliente.nome)}</strong></div>
      <div class="cover-meta-item"><span>Tipo de instalação</span><strong>${escapeHtml(obra.tipo)}</strong></div>
      <div class="cover-meta-item"><span>Tensão</span><strong>${escapeHtml(obra.tensao)}</strong></div>
      <div class="cover-meta-item"><span>Data de geração</span><strong>${escapeHtml(dateLabel)}</strong></div>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">${secNos.id}</span>
      <h3>Identificação</h3>
      <span class="rule"></span>
    </div>
    <table class="metrics">
      <caption><b>Tabela 1</b> — Identificação do levantamento</caption>
      <tbody>
        ${row("Cliente", cliente.nome)}
        ${row("Tipo de instalação", obra.tipo)}
        ${row("Tensão", obra.tensao)}
        ${row("Quantidade de ambientes", fmt(t.ambientes))}
        ${row("Código do documento", `${docCode} · ${docRev} · ${escapeHtml(shortDate)}`)}
        ${row("Responsável técnico", "________")}
        ${row("CREA", "________")}
      </tbody>
    </table>
    <div class="callout callout-aviso">
      <span class="callout-tag">Limitações de uso</span>
      <p>Documento gerado automaticamente a partir dos pontos, potências e distâncias informados na plataforma. Não constitui projeto executivo nem ART. Os dados devem ser conferidos em campo e assumidos por profissional habilitado (CREA) antes da execução.</p>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">${secNos.resumo}</span>
      <h3>Resumo dos pontos</h3>
      <span class="rule"></span>
    </div>
    <table class="metrics">
      <tbody>
        ${row("Total de ambientes", fmt(t.ambientes))}
        ${row("Pontos TUG", fmt(t.tug.pontos))}
        ${row("Potência TUG", fmtPower(t.tug.potencia))}
        ${row("Pontos TUE", fmt(t.tue.pontos))}
        ${row("Potência TUE", fmtPower(t.tue.potencia))}
        ${row("Pontos de iluminação", fmt(t.iluminacao.pontos))}
        ${row("Potência de iluminação", fmtPower(t.iluminacao.potencia))}
        ${row("Interruptores", fmt(t.interruptores))}
        ${row("Potência estimada (ambientes)", fmtPower(t.potencia))}
        ${row("Iluminação — potência do circuito", fmtPower(circPot("iluminacao")))}
        ${row("TUG — potência do circuito", fmtPower(circPot("tug")))}
        ${row("TUE — potência do circuito", fmtPower(circPot("tue")))}
        ${row("Potência total dos circuitos", fmtPower(potenciaCircuitos))}
      </tbody>
    </table>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">${secNos.ambientes}</span>
      <h3>Levantamento dos ambientes</h3>
      <span class="rule"></span>
    </div>
    <table>
      <caption><b>Tabela 2</b> — Síntese de pontos e potências por ambiente</caption>
      <thead>
        <tr>
          <th>Ambiente</th>
          <th class="num">TUG</th>
          <th class="num">TUE</th>
          <th class="num">Iluminação</th>
          <th class="num">Interruptores</th>
          <th class="num">Potência</th>
        </tr>
      </thead>
      <tbody>${rowsPoints}</tbody>
    </table>
    ${
      rowsPointsDetail
        ? `<p class="note"><strong>Detalhe dos pontos por ambiente:</strong> cada TUG, TUE e ponto de iluminação é listado com sua potência individual.</p>
    <table>
      <caption><b>Tabela 3</b> — Pontos de utilização por ambiente</caption>
      <thead>
        <tr>
          <th>Ambiente</th>
          <th>Tipo</th>
          <th>Ponto</th>
          <th class="num">Potência</th>
        </tr>
      </thead>
      <tbody>${rowsPointsDetail}</tbody>
    </table>`
        : ""
    }
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">${secNos.circuitos}</span>
      <h3>Dimensionamento dos circuitos</h3>
      <span class="rule"></span>
    </div>
    ${circuitsHtml}
  </section>

  ${
    showDims
      ? `<section>
    <div class="sec-head">
      <span class="sec-num">${secNos.dims}</span>
      <h3>Dimensões dos ambientes</h3>
      <span class="rule"></span>
    </div>
    <table>
      <caption><b>Tabela 4</b> — Dimensões dos ambientes</caption>
      <thead>
        <tr>
          <th>Ambiente</th>
          <th class="num">Comprimento</th>
          <th class="num">Largura</th>
          <th class="num">Pé-direito</th>
          <th class="num">Área</th>
          <th class="num">Perímetro</th>
        </tr>
      </thead>
      <tbody>${rowsDims}</tbody>
    </table>
  </section>`
      : ""
  }

  ${buildMaterialsSectionHtml(data, secNos.materials)}

  <section>
    <div class="sec-head">
      <span class="sec-num">${secNos.obs}</span>
      <h3>Observações</h3>
      <span class="rule"></span>
    </div>
    <div class="obs">
      <span class="obs-tag">Nota técnica</span>
      <p>${escapeHtml(obsText)}</p>
    </div>
  </section>

  <div class="legal">
    <span>DimenVolt · Studio — Documento gerado eletronicamente</span>
    <span>${docCode} · ${docRev} — Responsável técnico: ________ · CREA ________</span>
  </div>
</body>
</html>`;
}

function buildQuadroHtml(data) {
  const dateLabel = formatDateTime(data.generatedAt);
  const shortDate = formatShortDate(data.generatedAt);
  const docCode = "RD-QUA-01";
  const docRev = "Rev. A";
  const quadro = data.quadro;
  const circuits = data.circuits;
  const t = data.totals;
  const balance = data.balance;

  const rowsCircuits = circuits
    .map(function (c) {
      const est = c.estimated ? '<span class="est">est.</span>' : "";
      const disjuntor = c.disjuntor > 0 ? `${fmt(c.disjuntor)} A` : "—";
      return (
        `<tr><td>${escapeHtml(c.id)}</td>` +
        `<td>${escapeHtml(c.descricao)}</td>` +
        `<td>${escapeHtml(c.tipo)}</td>` +
        `<td class="num">${fmtPower(c.potencia)}</td>` +
        `<td class="num">${fmt(c.corrente, 2)} A${est}</td>` +
        `<td class="num">${disjuntor}</td>` +
        `<td class="num">${escapeHtml(c.fase)}</td></tr>`
      );
    })
    .join("");

  const maxPhasePower = Math.max(
    0,
    ...balance.phases.map(function (p) {
      return p.potencia;
    })
  );
  const rowsBalance = balance.phases
    .map(function (p) {
      const pct = maxPhasePower > 0 ? Math.max(0, Math.round((p.potencia / maxPhasePower) * 100)) : 0;
      const barClass = p.fase === "L1" ? "p1" : p.fase === "L2" ? "p2" : "p3";
      return (
        `<tr><td>${escapeHtml(p.fase)}</td>` +
        `<td class="num">${fmt(p.circuitos)}</td>` +
        `<td class="num">${fmtPower(p.potencia)}</td>` +
        `<td class="bal-cell"><span class="bal-track"><span class="bal-fill ${barClass}" style="width:${pct}%"></span></span></td></tr>`
      );
    })
    .join("");

  const balanceStatus =
    balance.status === "balanced"
      ? '<span class="bal-ok">Balanceado</span>'
      : '<span class="bal-warn">Desbalanceado</span>';
  const balanceNote =
    balance.status === "balanced"
      ? "As potências alocadas entre as fases do quadro estão equilibradas, respeitando a proporção de até 1,5:1 entre a fase mais carregada e a menos carregada."
      : "A distribuição das potências entre as fases indica desbalanceamento. Recomenda-se redistribuir circuitos entre as fases para reduzir a corrente no condutor neutro e melhorar a eficiência da instalação.";

  const obsText =
    "Este documento consolida os circuitos e cargas do quadro de distribuição informados pelo usuário na " +
    "plataforma DimenVolt · Studio. A distribuição de circuitos entre fases e as prescrições de proteção " +
    "seguem os parâmetros da NBR 5410:2004; os limites de desequilíbrio adotados são critérios da plataforma. " +
    "Valores devem ser conferidos por profissional habilitado antes da execução.";

  const fasesLabel =
    t.fases.length > 0 ? t.fases.join(" · ") : "—";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DimenVolt — Quadro de distribuição</title>
  ${buildSharedStyles()}
</head>
<body>
  <section class="cover">
    <header class="doc-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
        <div>
          <h1>DimenVolt</h1>
          <p>Studio · Engenharia elétrica</p>
        </div>
      </div>
      <div class="doc-meta">
        <strong>Quadro de distribuição</strong>
        <span class="doc-no">${docCode} · ${docRev}</span><br />
        ${escapeHtml(shortDate)}
      </div>
    </header>

    <div class="cover-main">
      <p class="cover-kicker">DimenVolt Studio · Documento técnico</p>
      <h2 class="cover-title">Quadro de distribuição elétrica</h2>
      <p class="cover-sub">Identificação, lista de circuitos, resumo de cargas e balanceamento de fases do quadro de distribuição.</p>
    </div>

    <div class="cover-meta">
      <div class="cover-meta-item"><span>Identificação do quadro</span><strong>${escapeHtml(quadro.identificacao)}</strong></div>
      <div class="cover-meta-item"><span>Sistema</span><strong>${escapeHtml(quadro.sistema)}</strong></div>
      <div class="cover-meta-item"><span>Tensão</span><strong>${escapeHtml(quadro.tensao)}</strong></div>
      <div class="cover-meta-item"><span>Data de geração</span><strong>${escapeHtml(dateLabel)}</strong></div>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">01</span>
      <h3>Identificação do quadro</h3>
      <span class="rule"></span>
    </div>
    <table class="metrics">
      <caption><b>Tabela 1</b> — Identificação do quadro</caption>
      <tbody>
        ${row("Identificação", quadro.identificacao)}
        ${row("Sistema de distribuição", quadro.sistema)}
        ${row("Tensão nominal", quadro.tensao)}
        ${row("Total de circuitos", fmt(t.circuitos))}
        ${row("Código do documento", `${docCode} · ${docRev} · ${escapeHtml(shortDate)}`)}
        ${row("Responsável técnico", "________")}
        ${row("CREA", "________")}
      </tbody>
    </table>
    <div class="callout callout-aviso">
      <span class="callout-tag">Limitações de uso</span>
      <p>Documento gerado automaticamente a partir dos circuitos informados na plataforma. Não constitui projeto executivo nem ART. Os valores devem ser conferidos em campo e assumidos por profissional habilitado (CREA) antes da execução.</p>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">02</span>
      <h3>Lista de circuitos</h3>
      <span class="rule"></span>
    </div>
    <table>
      <caption><b>Tabela 2</b> — Circuitos do quadro ${escapeHtml(quadro.identificacao)}</caption>
      <thead>
        <tr>
          <th>Circuito</th>
          <th>Descrição</th>
          <th>Tipo</th>
          <th class="num">Potência</th>
          <th class="num">Corrente</th>
          <th class="num">Disjuntor</th>
          <th class="num">Fase</th>
        </tr>
      </thead>
      <tbody>${rowsCircuits}</tbody>
    </table>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">03</span>
      <h3>Resumo de cargas</h3>
      <span class="rule"></span>
    </div>
    <table class="metrics">
      <caption><b>Tabela 3</b> — Resumo de cargas do quadro</caption>
      <tbody>
        ${row("Total de circuitos", fmt(t.circuitos))}
        ${row("Potência instalada", fmtPower(t.potencia))}
        ${row("Corrente estimada", fmt(t.corrente, 2) + " A")}
        ${row("Disjuntores informados", fmt(t.disjuntores))}
        ${row("Fases utilizadas", fasesLabel)}
      </tbody>
    </table>
    <p class="source">Correntes marcadas como <b>est.</b> foram estimadas a partir da potência e da tensão nominal do quadro, quando a corrente não foi informada.</p>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">04</span>
      <h3>Balanceamento de fases</h3>
      <span class="rule"></span>
    </div>
    <table class="balance">
      <caption><b>Tabela 4</b> — Distribuição de potência por fase</caption>
      <thead>
        <tr>
          <th>Fase</th>
          <th class="num">Circuitos</th>
          <th class="num">Potência</th>
          <th>Distribuição</th>
        </tr>
      </thead>
      <tbody>${rowsBalance}</tbody>
    </table>
    <div class="callout ${balance.status === "balanced" ? "callout-norma" : "callout-aviso"}">
      <span class="callout-tag">Balanceamento de fases</span>
      <p>Situação: ${balanceStatus}. ${escapeHtml(balanceNote)}</p>
    </div>
  </section>

  <section>
    <div class="sec-head">
      <span class="sec-num">05</span>
      <h3>Observações</h3>
      <span class="rule"></span>
    </div>
    <div class="obs">
      <span class="obs-tag">Nota técnica</span>
      <p>${escapeHtml(obsText)}</p>
    </div>
  </section>

  <div class="legal">
    <span>DimenVolt · Studio — Documento gerado eletronicamente</span>
    <span>${docCode} · ${docRev} — Responsável técnico: ________ · CREA ________</span>
  </div>
</body>
</html>`;
}

async function printHtmlToPdf(html, footerText) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const footerTemplate = `
      <div style="width:100%; box-sizing:border-box; padding:0 16mm; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:7pt; color:#8f8f84;">
        <div style="border-top:1px solid #e6e4dd; padding-top:5px; display:flex; justify-content:space-between; align-items:center;">
          <span>${footerText.left}</span>
          <span style="letter-spacing:0.1em;">${footerText.tag}</span>
          <span>P&aacute;gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      </div>`;
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: footerTemplate,
    });
  } finally {
    await browser.close();
  }
}

async function generateReportPdf(payload) {
  const data = validateReportPayload(payload);
  const html = buildReportHtml(data);
  return printHtmlToPdf(html, {
    left: "DimenVolt · Studio — Memorial de dimensionamento elétrico",
    tag: "RD-REL-01 · Rev. A",
  });
}

async function generateLevantamentoPdf(payload) {
  const data = validateLevantamentoPayload(payload);
  const html = buildLevantamentoHtml(data);
  return printHtmlToPdf(html, {
    left: "DimenVolt · Studio — Levantamento elétrico",
    tag: "RD-LEV-01 · Rev. A",
  });
}

async function generateQuadroPdf(payload) {
  const data = validateQuadroPayload(payload);
  const html = buildQuadroHtml(data);
  return printHtmlToPdf(html, {
    left: "DimenVolt · Studio — Quadro de distribuição elétrica",
    tag: "RD-QUA-01 · Rev. A",
  });
}

function buildTechnicalDocumentHtml(data) {
  const shortDate = formatShortDate(new Date());
  const docCode = "RT-TEC-01";
  const docRev = "Rev. 01";
  const ampacity = data.ampacity;
  const breakers = data.circuit_breakers;
  const grouping = data.grouping_factors;
  const temperature = data.temperature_correction;
  const vdrop = data.voltage_drop;
  const neutral = data.neutral_conductor;
  const pe = data.protective_conductor_PE;
  const minSec = data.minimum_sections;
  const nbr = data.nbr5410_settings;
  const loads = data.load_database;
  const materials = data.materials;
  const motors = data.motor;

  const sectionsNum = Object.keys(ampacity.copper.PVC.B1).sort(
    (a, b) => Number(a) - Number(b)
  );

  const secHead = (num, title) => `
    <div class="sec-head">
      <span class="sec-num">${num}</span>
      <h3>${title}</h3>
      <span class="rule"></span>
    </div>`;

  const ampRows = sectionsNum
    .map((s) => {
      const v = ampacity.copper.PVC.B1[s].current_capacity_A;
      return `<tr><td class="num">${fmtNum(s)}</td><td class="num">${fmtNum(v)}</td></tr>`;
    })
    .join("");

  const methodRows = Object.entries(nbr.installation_methods)
    .map(([m, d]) => `<tr><td><strong>${m}</strong></td><td>${escapeHtml(d)}</td></tr>`)
    .join("");

  const temps = [];
  for (let t = 10; t <= 90; t += 5) temps.push(t);
  const tempRows = temps
    .map((t) => {
      const pvc = temperature.PVC[String(t)];
      const epr = temperature.EPR[String(t)];
      return `<tr><td class="num">${fmtNum(t)}</td><td class="num">${pvc ? fmtNum(pvc.factor, 2) : "—"}</td><td class="num">${epr ? fmtNum(epr.factor, 2) : "—"}</td></tr>`;
    })
    .join("");

  const groupRows = Object.entries(grouping.factors)
    .map(
      ([n, f]) =>
        `<tr><td class="num">${fmtNum(n)}</td><td class="num">${fmtNum(f.factor, 2)}</td><td>${escapeHtml(f.description)}</td></tr>`
    )
    .join("");

  const breakerInList = breakers.standard_breakers.map((b) => b.rated_current_A);
  // 6–125 A: disjuntor DIN (MCB, IEC 60898) · 160 A em diante: caixa moldada (MCCB, IEC 60947-2)
  const breakerInMcb =
    breakerInList.filter((n) => n < 160).map((n) => fmtNum(n)).join(" · ") + " A";
  const breakerInMccb =
    breakerInList.filter((n) => n >= 160).map((n) => fmtNum(n)).join(" · ") + " A";

  const curveRows = ["B", "C", "D"]
    .map((c) => {
      const info = breakers.standard_breakers[0].curves[c];
      return `<tr><td><strong>${c}</strong></td><td>${info.magnetic_trip_range}</td><td>${escapeHtml(info.application)}</td></tr>`;
    })
    .join("");

  const formulaRows = Object.entries(vdrop.formulas)
    .map(([k, f]) => {
      const label = { single_phase: "Monofásico (FN)", two_phase: "Bifásico (FF)", three_phase: "Trifásico (3F)" }[k] || k;
      return `<tr><td>${label}</td><td>${f.voltage_drop_V}</td></tr>`;
    })
    .join("");

  const dropLimitRows = [
    ["Vindos de carga industrial", nbr.maximum_voltage_drop_percent.industrial_loads],
    ["Subalimentadores", nbr.maximum_voltage_drop_percent.subfeeders],
    ["Alimentador principal", nbr.maximum_voltage_drop_percent.main_feeder],
  ]
    .map(([l, v]) => `<tr><td>${l}</td><td class="num">${v}%</td></tr>`)
    .join("");

  const neutralRows = neutral.common_values
    .map(
      (c) =>
        `<tr><td class="num">${c.phase_mm2}</td><td class="num">${c.neutral_mm2}</td><td>${escapeHtml(c.application)}</td></tr>`
    )
    .join("");

  const peRuleRows = pe.sizing_table.rules
    .map(
      (r) =>
        `<tr><td>${r.phase_conductor_S_mm2}</td><td class="num">${r.PE_conductor_mm2}</td><td>${escapeHtml(r.description)}</td></tr>`
    )
    .join("");

  const peCommonRows = pe.sizing_table.common_values
    .map((c) => `<tr><td class="num">${c.phase_mm2}</td><td class="num">${c.PE_mm2}</td></tr>`)
    .join("");

  const kRows = Object.entries(pe.calculation_method.adiabatic_equation.k_factors)
    .map(([k, v]) => {
      const label = {
        copper_PVC: "Cobre · PVC",
        copper_EPR_XLPE: "Cobre · EPR/XLPE",
        aluminum_PVC: "Alumínio · PVC",
        aluminum_EPR_XLPE: "Alumínio · EPR/XLPE",
        steel_PVC: "Aço · PVC",
      }[k] || k;
      return `<tr><td>${label}</td><td class="num">${v}</td></tr>`;
    })
    .join("");

  const minRows = [
    ["Iluminação", minSec.lighting.phase_conductor_mm2],
    ["Tomadas de uso geral (TUG)", minSec.general_purpose_outlets.phase_conductor_mm2],
    ["Tomadas de uso específico (TUE)", minSec.specific_purpose_outlets.phase_conductor_mm2],
    ["Circuitos individuais — até 30 A", minSec.individual_branch_circuits.up_to_30A.phase_conductor_mm2],
    ["Circuitos individuais — 30 a 50 A", minSec.individual_branch_circuits["30A_to_50A"].phase_conductor_mm2],
    ["Circuitos individuais — 50 a 100 A", minSec.individual_branch_circuits["50A_to_100A"].phase_conductor_mm2],
  ]
    .map(([l, v]) => `<tr><td>${l}</td><td class="num">${fmtNum(v, 2)} mm²</td></tr>`)
    .join("");

  const nbrRows = [
    ["Tensão fase-neutro", nbr.standard_voltages.phase_to_neutral.join(" / ") + " V"],
    ["Tensão fase-fase", nbr.standard_voltages.phase_to_phase.join(" / ") + " V"],
    ["Trifásico", nbr.standard_voltages.three_phase.join(" / ") + " V"],
    ["Frequência", nbr.frequency_Hz + " Hz"],
    ["Fator de potência padrão", fmtNum(nbr.default_power_factor, 2)],
    ["Cobre — resistividade", fmtNum(nbr.conductor_materials.copper.resistivity_ohm_mm2_per_m, 4) + " Ω·mm²/m"],
    ["Alumínio — resistividade", fmtNum(nbr.conductor_materials.aluminum.resistivity_ohm_mm2_per_m, 4) + " Ω·mm²/m"],
    [
      "PVC — serviço / curto-circuito",
      nbr.insulation_types.PVC.max_temperature_C + " °C / " + nbr.insulation_types.PVC.short_circuit_max_temperature_C + " °C",
    ],
    [
      "EPR/XLPE — serviço / curto-circuito",
      nbr.insulation_types.EPR.max_temperature_C + " °C / " + nbr.insulation_types.EPR.short_circuit_max_temperature_C + " °C",
    ],
    [
      "Temperatura de referência",
      nbr.ambient_temperature_reference_C + " °C ambiente / " + nbr.ground_temperature_reference_C + " °C solo",
    ],
    ["Dispositivos de proteção", nbr.protection_device_types.join(" · ")],
    ["Sistemas de aterramento", nbr.grounding_systems.join(" · ")],
  ]
    .map(([l, v]) => `<tr><th>${l}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");

  const loadLabels = { residential: "Residencial", commercial: "Comercial", industrial: "Industrial" };
  const loadRows = ["residential", "commercial", "industrial"]
    .map((cat) =>
      Object.entries(loads[cat])
        .map(
          ([, it]) =>
            `<tr><td>${loadLabels[cat]}</td><td>${escapeHtml(it.description)}</td><td class="num">${it.typical_power_range_W.min}–${it.typical_power_range_W.max} W</td><td>${it.typical_voltage_V.join("/")} V</td><td class="num">${it.phases}</td></tr>`
        )
        .join("")
    )
    .join("");

  const matRows = materials.categories
    .map(
      (c) =>
        `<tr><td style="width:30%"><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.materials.map((m) => m.name).join(" · "))}</td></tr>`
    )
    .join("");

  const motorRows = motors.standard_motors
    .map(
      (m) =>
        `<tr><td class="num">${fmtNum(m.cv, 1)}</td><td class="num">${fmtNum(m.kw, 2)}</td><td class="num">${fmtNum(m.current_A_220V, 1)}</td><td class="num">${fmtNum(m.current_A_380V, 1)}</td><td class="num">${fmtNum(m.current_A_440V, 1)}</td><td class="num">${fmtNum(m.power_factor, 2)}</td><td class="num">${fmtNum(m.efficiency, 2)}</td></tr>`
    )
    .join("");

  const vdSections = Object.keys(vdrop.copper).sort((a, b) => Number(a) - Number(b));
  const impRows = vdSections
    .map((s) => {
      const cu = vdrop.copper[s];
      const al = vdrop.aluminum ? vdrop.aluminum[s] : null;
      return (
        `<tr><td class="num">${fmtNum(s)}</td>` +
        `<td class="num">${cu ? fmtNum(cu.resistance_ohm_per_km, 2) : "—"}</td>` +
        `<td class="num">${cu ? fmtNum(cu.reactance_ohm_per_km, 2) : "—"}</td>` +
        `<td class="num">${al ? fmtNum(al.resistance_ohm_per_km, 2) : "—"}</td>` +
        `<td class="num">${al ? fmtNum(al.reactance_ohm_per_km, 2) : "—"}</td></tr>`
      );
    })
    .join("");

  const flowSteps = [
    ["01", "Levantamento", "Ambientes e pontos"],
    ["02", "Potências", "Cargas por ponto"],
    ["03", "Circuitos", "Divisão e agrupamento"],
    ["04", "Corrente", "Ib por circuito"],
    ["05", "Fatores", "Ktemp · Kagr"],
    ["06", "Condutor", "Seção pela Tab. 36"],
    ["07", "Proteção", "In (Ib ≤ In ≤ Iz)"],
    ["08", "Queda", "ΔV% vs. limite"],
    ["09", "Validação", "Status de segurança"],
    ["10", "Relatórios", "Memorial · materiais"],
  ];
  const flowHtml = flowSteps
    .map(
      (s) =>
        `<div class="flow-box"><b class="step">ETAPA ${s[0]}</b><span class="lbl">${s[1]}</span><span class="sub">${s[2]}</span></div>`
    )
    .join("");

  const tocItems = [
    ["01", "Sumário e controle documental"],
    ["02", "Visão geral"],
    ["03", "Condutores — capacidade de condução"],
    ["04", "Disjuntores — seleção"],
    ["05", "Fatores de correção"],
    ["06", "Queda de tensão"],
    ["07", "Condutor neutro"],
    ["08", "Condutor de proteção (PE)"],
    ["09", "Seções mínimas"],
    ["10", "Configurações normativas — NBR 5410:2004"],
    ["11", "Motores trifásicos — referência IEC/NEMA"],
    ["12", "Cargas típicas"],
    ["13", "Catálogo de materiais"],
    ["14", "Fluxo técnico"],
    ["15", "Exemplo calculado — chuveiro 7.500 W / 220 V"],
  ];
  const tocHtml = tocItems
    .map((s) => `<div><span class="n">${s[0]}</span><span class="t">${s[1]}</span></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DimenVolt — Documentos Técnicos</title>
  ${buildSharedStyles()}
  <style>
    .tech-doc section { page-break-inside: auto; }
    .tech-doc table { page-break-inside: auto; }
    .tech-doc tbody { page-break-inside: auto; }
    .toc { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; margin: 2px 0 4px; }
    .toc div { display: flex; gap: 10px; align-items: baseline; border-bottom: 1px solid #ecebe5; padding: 5px 0; }
    .toc .n { font-family: "Consolas", ui-monospace, monospace; font-weight: 700; font-size: 7.5pt; color: #a0802a; min-width: 18px; }
    .toc .t { font-size: 8.8pt; color: #1b1b1b; }
    .flow-diagram { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 0 0; }
    .flow-box { border: 1px solid #e4e2db; border-top: 3px solid #1b1b1b; padding: 8px 8px 9px; background: #fff; }
    .flow-box b.step { display: block; font-family: "Consolas", ui-monospace, monospace; font-size: 6.5pt; font-weight: 700; color: #a0802a; margin-bottom: 4px; letter-spacing: 0.05em; }
    .flow-box span.lbl { display: block; font-size: 7.6pt; font-weight: 700; color: #1b1b1b; line-height: 1.35; letter-spacing: 0.02em; }
    .flow-box span.sub { display: block; margin-top: 3px; font-size: 6.8pt; font-weight: 400; color: #8a8a82; line-height: 1.35; }
  </style>
</head>
<body class="tech-doc">
  <div class="cover">
    <div class="cover-main">
      <p class="cover-kicker">DimenVolt · Studio — Documentação técnica</p>
      <h1 class="cover-title">Fundamentos de dimensionamento elétrico</h1>
      <p class="cover-sub">Bases de cálculo, tabelas e critérios técnicos empregados na plataforma, conforme a ABNT NBR 5410:2004, para dimensionamento de condutores, proteções e infraestrutura de instalações elétricas de baixa tensão.</p>
    </div>
    <div class="cover-meta">
      <div class="cover-meta-item"><span>Código · revisão</span><strong>${docCode} · ${docRev}</strong></div>
      <div class="cover-meta-item"><span>Edição</span><strong>${escapeHtml(shortDate)}</strong></div>
      <div class="cover-meta-item"><span>Referência normativa</span><strong>ABNT NBR 5410:2004</strong></div>
      <div class="cover-meta-item"><span>Elaboração</span><strong>Isac Ornelas · DimenVolt Studio</strong></div>
      <div class="cover-meta-item"><span>Responsável técnico</span><strong>________</strong></div>
      <div class="cover-meta-item"><span>CREA</span><strong>________</strong></div>
    </div>
  </div>

  <header class="doc-header">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
      <div>
        <h1>DimenVolt</h1>
        <p>Studio · Engenharia elétrica</p>
      </div>
    </div>
    <div class="doc-meta">
      <strong>Documentos Técnicos</strong>
      <span class="doc-no">${docCode} · ${docRev}</span><br />
      ${escapeHtml(shortDate)}
    </div>
  </header>

  <section>
    ${secHead("01", "Sumário e controle documental")}
    <div class="toc">${tocHtml}</div>
    <table>
      <caption><b>Tabela A</b> — Histórico de revisões</caption>
      <thead><tr><th style="width:46px">Rev.</th><th style="width:92px">Data</th><th>Descrição</th><th style="width:110px">Elaboração</th></tr></thead>
      <tbody>
        <tr><td>00</td><td>—</td><td>Emissão inicial</td><td>Isac Ornelas</td></tr>
        <tr><td>01</td><td>${escapeHtml(shortDate)}</td><td>Padrão editorial: rastreabilidade normativa (NBR 5410:2004 · tabela/item), vírgula decimal, critérios da plataforma identificados, controle documental, exemplo calculado e fluxo técnico em caixas</td><td>Isac Ornelas</td></tr>
      </tbody>
    </table>
    <div class="callout callout-aviso">
      <span class="callout-tag">Limitações de uso</span>
      <p>Documento de referência das bases de cálculo da plataforma DimenVolt · Studio. Não substitui o projeto elétrico, não constitui ART e não dispensa a verificação e a responsabilidade de profissional habilitado (CREA) encarregado da instalação. Numerações de tabela marcadas como <em>a validar</em> devem ser conferidas no texto oficial da ABNT antes de uso em documento assinado.</p>
    </div>
  </section>

  <section>
    ${secHead("02", "Visão geral")}
    <div class="analysis">
      <span class="tag">Escopo</span>
      <p>A plataforma realiza o levantamento de instalações elétricas e o dimensionamento de condutores e dispositivos de proteção para circuitos de baixa tensão, empregando critérios da NBR 5410:2004. As tabelas desta documentação reproduzem os dados utilizados pelos módulos de cálculo; quando um valor é critério interno da plataforma — e não prescrição da norma — a diferença está marcada na própria tabela.</p>
    </div>
  </section>

  <section>
    ${secHead("03", "Condutores — capacidade de condução")}
    <table>
      <caption><b>Tabela 1</b> — Métodos de instalação <span class="source">NBR 5410:2004 · Tab. 33 — sistemas A1 a G</span></caption>
      <thead><tr><th>Método</th><th>Descrição</th></tr></thead>
      <tbody>${methodRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 2</b> — Capacidade de condução de corrente (A) <span class="source">NBR 5410:2004 · Tab. 36 — condutores de cobre, isolação PVC, método B1</span></caption>
      <thead><tr><th>Seção (mm²)</th><th class="num">3 condutores carregados</th></tr></thead>
      <tbody>${ampRows}</tbody>
    </table>
    <div class="callout callout-norma">
      <span class="callout-tag">Premissas da Tabela 2</span>
      <p>Valores referidos a 30 °C, 3 condutores carregados e isolação PVC. Para EPR/XLPE a plataforma aplica as mesmas capacidades do PVC — equivalência interna da plataforma, a conferir nas colunas próprias da Tab. 36. Idem para alumínio, a partir de 10 mm².</p>
    </div>
  </section>

  <section>
    ${secHead("04", "Disjuntores — seleção")}
    <table>
      <caption><b>Tabela 3</b> — Curvas de atuação magnética</caption>
      <thead><tr><th>Curva</th><th>Atuação magnética</th><th>Aplicação</th></tr></thead>
      <tbody>${curveRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 4</b> — Correntes nominais padronizadas (In) <span class="source">Séries IEC 60898 (MCB) e IEC 60947-2 (MCCB) — a validar</span></caption>
      <thead><tr><th>Tipo de disjuntor</th><th class="num">Correntes nominais (A)</th></tr></thead>
      <tbody>
        <tr><td>MCB — disjuntor DIN (IEC 60898)</td><td class="num">${breakerInMcb}</td></tr>
        <tr><td>MCCB — caixa moldada (IEC 60947-2)</td><td class="num">${breakerInMccb}</td></tr>
      </tbody>
    </table>
    <div class="callout callout-criterio">
      <span class="callout-tag">Critério de seleção</span>
      <p>Sobrecarga: Ib ≤ In ≤ Iz — NBR 5410:2004, item 6.2.6 (numeração a validar). Curto-circuito: atuação magnética Ia deve atuar com Icc presumida no ponto. Ib — corrente de projeto; In — corrente nominal do dispositivo; Iz — capacidade de condução do condutor.</p>
    </div>
  </section>

  <section>
    ${secHead("05", "Fatores de correção")}
    <table>
      <caption><b>Tabela 5</b> — Fatores de correção por temperatura ambiente <span class="source">NBR 5410:2004 · Tab. 40</span></caption>
      <thead><tr><th class="num">Temperatura (°C)</th><th class="num">PVC</th><th class="num">EPR / XLPE</th></tr></thead>
      <tbody>${tempRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 6</b> — Fatores de correção por agrupamento de circuitos <span class="source">NBR 5410:2004 · Tab. 42</span></caption>
      <thead><tr><th class="num">Circuitos agrupados</th><th class="num">Fator</th><th>Referência</th></tr></thead>
      <tbody>${groupRows}</tbody>
    </table>
    <div class="callout callout-criterio">
      <span class="callout-tag">Critério adotado · condutores carregados</span>
      <p>2 ou 3 condutores carregados aplicam fator 1,00 (valores de tabela); com 4 condutores carregados, a plataforma aplica 0,95 à capacidade de 3 carregados — simplificação interna, a validar no item correspondente da norma.</p>
    </div>
  </section>

  <section>
    ${secHead("06", "Queda de tensão")}
    <table>
      <caption><b>Tabela 7</b> — Impedâncias por seção (Ω/km)</caption>
      <thead><tr><th class="num">Seção (mm²)</th><th class="num">R — cobre</th><th class="num">X — cobre</th><th class="num">R — alumínio</th><th class="num">X — alumínio</th></tr></thead>
      <tbody>${impRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 8</b> — Fórmulas de queda de tensão</caption>
      <thead><tr><th>Ligação</th><th>Queda de tensão (V)</th></tr></thead>
      <tbody>${formulaRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 9</b> — Limites de queda por tipo de circuito <span class="source">Critério adotado pela plataforma</span></caption>
      <thead><tr><th>Circuito</th><th class="num">Queda máxima</th></tr></thead>
      <tbody>
        <tr><td>Iluminação</td><td class="num">4%</td></tr>
        <tr><td>Tomadas de uso geral (TUG)</td><td class="num">5%</td></tr>
        <tr><td>Tomadas de uso específico (TUE)</td><td class="num">7%</td></tr>
      </tbody>
    </table>
    <table>
      <caption><b>Tabela 10</b> — Limites de queda por origem da instalação <span class="source">Estrutura da NBR 5410:2004 · item 6.2.7 — verificar no texto oficial</span></caption>
      <thead><tr><th>Origem / destino</th><th class="num">Queda máxima</th></tr></thead>
      <tbody>${dropLimitRows}</tbody>
    </table>
    <div class="callout callout-criterio">
      <span class="callout-tag">Critério adotado · limites de queda</span>
      <p>A plataforma aplica 4% (iluminação) · 5% (TUG) · 7% (TUE) como margem conservativa de projeto por tipo de circuito. A NBR 5410:2004, item 6.2.7, define limites por origem da instalação e não por classe de carga — conforme a condição de alimentação do quadro, ajuste o limite no memorial.</p>
    </div>
    <div class="callout callout-norma">
      <span class="callout-tag">Premissas de cálculo</span>
      <p>Impedâncias da Tabela 7 e fator de potência padrão 0,92 integram o módulo de queda de tensão da plataforma. Temperaturas máximas de condutor: PVC 70 °C · EPR/XLPE 90 °C.</p>
    </div>
  </section>

  <section>
    ${secHead("07", "Condutor neutro")}
    <div class="analysis">
      <span class="tag">Critério geral — NBR 5410:2004 · Seção 6.2.5</span>
      <p>${escapeHtml(neutral.general_rule.description)}. Em circuitos trifásicos balanceados com seção S &gt; 25 mm², o neutro pode ser reduzido a S/2, com mínimo de 25 mm²; quando a corrente no neutro é elevada por desequilíbrio superior a 10% da corrente do circuito, o neutro tem a mesma seção do condutor fase. <em>O limiar de 10% é critério adotado pela plataforma — fonte normativa a validar.</em></p>
    </div>
    <table>
      <caption><b>Tabela 11</b> — Seção do neutro em função da fase <span class="source">NBR 5410:2004 · Seção 6.2.5</span></caption>
      <thead><tr><th class="num">Fase (mm²)</th><th class="num">Neutro (mm²)</th><th>Aplicação</th></tr></thead>
      <tbody>${neutralRows}</tbody>
    </table>
  </section>

  <section>
    ${secHead("08", "Condutor de proteção (PE)")}
    <table>
      <caption><b>Tabela 12</b> — Seção do PE em função do condutor fase <span class="source">NBR 5410:2004 · item 6.4.3 (numeração a validar)</span></caption>
      <thead><tr><th>Seção do condutor fase</th><th class="num">PE (mm²)</th><th>Critério</th></tr></thead>
      <tbody>${peRuleRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 13</b> — Seções usuais fase × PE</caption>
      <thead><tr><th class="num">Fase (mm²)</th><th class="num">PE (mm²)</th></tr></thead>
      <tbody>${peCommonRows}</tbody>
    </table>
    <table>
      <caption><b>Tabela 14</b> — Fatores k do método adiabático <span class="source">NBR 5410:2004 · Tab. 53 (a validar)</span></caption>
      <thead><tr><th>Material · isolação</th><th class="num">Fator k</th></tr></thead>
      <tbody>${kRows}</tbody>
    </table>
    <div class="callout callout-norma">
      <span class="callout-tag">Método adiabático</span>
      <p>S = √(I² · t) / k, com I corrente de curto-circuito presumida, t tempo de atuação da proteção e k fator do material (Tabela 14). Seções mínimas de PE: 2,5 mm² com proteção mecânica; 4 mm² sem proteção mecânica; equipotencialização principal 6 mm² e suplementar 2,5 mm².</p>
    </div>
  </section>

  <section>
    ${secHead("09", "Seções mínimas")}
    <table>
      <caption><b>Tabela 15</b> — Seções mínimas por tipo de circuito <span class="source">NBR 5410:2004 · Tab. 47</span></caption>
      <thead><tr><th>Tipo de circuito</th><th class="num">Seção mínima</th></tr></thead>
      <tbody>${minRows}</tbody>
    </table>
    <div class="callout callout-norma">
      <span class="callout-tag">Condutores enterrados e expostos</span>
      <p>Condutores subterrâneos: mínimo 2,5 mm² em cobre (Tab. 47). Condutores sem proteção mecânica: mínimo 4 mm² — prescrição da própria norma.</p>
    </div>
  </section>

  <section>
    ${secHead("10", "Configurações normativas — NBR 5410:2004")}
    <table>
      <caption><b>Tabela 16</b> — Parâmetros normativos aplicados pela plataforma</caption>
      <thead><tr><th>Parâmetro</th><th>Valor</th></tr></thead>
      <tbody>${nbrRows}</tbody>
    </table>
  </section>

  <section>
    ${secHead("11", "Motores trifásicos — referência IEC/NEMA")}
    <table>
      <caption><b>Tabela 17</b> — Correntes nominais de plena carga (4 polos · 60 Hz) <span class="source">Referência IEC 60034 / NEMA MG-1 — não normatizado pela NBR 5410</span></caption>
      <thead><tr><th class="num">cv</th><th class="num">kW</th><th class="num">220 V (A)</th><th class="num">380 V (A)</th><th class="num">440 V (A)</th><th class="num">FP</th><th class="num">Rend.</th></tr></thead>
      <tbody>${motorRows}</tbody>
    </table>
    <div class="callout callout-norma">
      <span class="callout-tag">Âmbito da Tabela 17</span>
      <p>Motores de indução trifásicos, 4 polos, 60 Hz — correntes típicas de plena carga conforme IEC 60034 e NEMA MG-1. Os critérios de circuitos de alimentação de motor (fatores de partida, proteção e queda) seguem a NBR 5410:2004 — seção de motores, numeração a validar.</p>
    </div>
  </section>

  <section>
    ${secHead("12", "Cargas típicas")}
    <table>
      <caption><b>Tabela 18</b> — Potências típicas por setor</caption>
      <thead><tr><th>Setor</th><th>Carga</th><th class="num">Potência típica</th><th>Tensão</th><th class="num">Fases</th></tr></thead>
      <tbody>${loadRows}</tbody>
    </table>
    <div class="callout callout-criterio">
      <span class="callout-tag">Uso da Tabela 18</span>
      <p>As potências típicas servem de valor de partida quando o usuário não informa a carga do ponto; na plataforma, cada item pode ser ajustado individualmente. Para circuitos de motores, use correntes da Tabela 17 e aplique os fatores de partida da NBR 5410:2004.</p>
    </div>
  </section>

  <section>
    ${secHead("13", "Catálogo de materiais")}
    <table>
      <caption><b>Tabela 19</b> — Componentes do catálogo de referência, por categoria</caption>
      <thead><tr><th>Categoria</th><th>Itens do catálogo</th></tr></thead>
      <tbody>${matRows}</tbody>
    </table>
  </section>

  <section>
    ${secHead("14", "Fluxo técnico")}
    <div class="flow-diagram">${flowHtml}</div>
  </section>

  <section>
    ${secHead("15", "Exemplo calculado de ponta a ponta")}
    <div class="analysis">
      <span class="tag">Caso de referência</span>
      <p>Chuveiro elétrico de 7.500 W em 220 V, monofásico fase-neutro, cos φ = 1,00, circuito de 25 m, método B1 (eletroduto embutido), cobre com isolação PVC, ambiente 30 °C, 1 circuito agrupado.</p>
    </div>
    <p class="calc-head">1 · Corrente de projeto (Ib)</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Ib = P / (V · cos φ)</span><span class="n">= 7.500 / (220 · 1,00) = <b>34,09 A</b></span></div>
    </div>
    <p class="calc-head">2 · Capacidade requerida (Iz')</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Iz' = Ib / (Ktemp · Kagr)</span><span class="n">= 34,09 / (1,00 [Tabela 5 · 30 °C] · 1,00 [Tabela 6 · 1 circuito]) = <b>34,09 A</b></span></div>
      <div class="calc-row"><span class="f">Seção comercial</span><span class="n"><b>10 mm²</b> — Iz = 50 A (Tabela 2 · cobre/PVC/B1) ≥ 34,09 A</span></div>
    </div>
    <p class="calc-head">3 · Proteção (In)</p>
    <div class="calc">
      <div class="calc-row"><span class="f">Ib ≤ In ≤ Iz</span><span class="n">34,09 ≤ <b>40 A</b> ≤ 50 A — disjuntor DIN 40 A, curva C (Tabela 4)</span></div>
    </div>
    <p class="calc-head">4 · Queda de tensão (ΔV)</p>
    <div class="calc">
      <div class="calc-row"><span class="f">ΔV = 2 · I · (R·cos φ + X·sen φ) · L / 1000</span><span class="n">= 2 · 34,09 · (1,83 · 1 + 0,08 · 0) · 25 / 1000 = <b>3,12 V</b></span></div>
      <div class="calc-row"><span class="f">ΔV% = ΔV / Vnom · 100</span><span class="n">= 3,12 / 220 · 100 = <b>1,42%</b> ≤ 7% (Tabela 9 · TUE)</span></div>
    </div>
    <div class="callout callout-criterio">
      <span class="callout-tag">Parecer do exemplo</span>
      <p>Condutor 10 mm² com proteção de 40 A atende capacidade, coordenação e queda de tensão. Em projeto real, some a queda de todos os trechos até o ponto (alimentador + circuito terminal) e verifique página a página a coordenação com DPS e aterramento conforme NBR 5410:2004.</p>
    </div>
  </section>

  <div class="legal">
    <span>DimenVolt · Studio — Documento técnico de referência</span>
    <span>${docCode} · ${docRev} — Responsável técnico: ________ · CREA ________</span>
  </div>
</body>
</html>`;
}

async function generateTechnicalDocumentPdf(data) {
  const html = buildTechnicalDocumentHtml(data);
  return printHtmlToPdf(html, {
    left: "DimenVolt · Studio — Documentos técnicos",
    tag: "RT-TEC-01 · Rev. 01",
  });
}


const DimenVoltPdf = {
  generateReportPdf,
  generateLevantamentoPdf,
  generateQuadroPdf,
  generateTechnicalDocumentPdf,
  validateReportPayload,
  validateLevantamentoPayload,
  validateQuadroPayload,
  buildAnalysis,
  buildReportHtml,
  buildLevantamentoHtml,
  buildQuadroHtml,
  buildMaterialsSectionHtml,
  buildTechnicalDocumentHtml,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = DimenVoltPdf;
}
if (typeof window !== "undefined") {
  window.DimenVoltPdf = DimenVoltPdf;
}
