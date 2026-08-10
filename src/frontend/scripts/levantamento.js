(function () {
  "use strict";

  var STEP_LABELS = [
    "",
    "Etapa 1 · Dados do cliente",
    "Etapa 2 · Ambientes e pontos",
    "Etapa 3 · Dimensionamento",
    "Etapa 4 · Resumo",
    "Etapa 5 · Finalização"
  ];

  var CIRCUIT_DEFS = [
    { key: "iluminacao", label: "Iluminação", badge: "ILUMINAÇÃO" },
    { key: "tug", label: "Tomadas de uso geral", badge: "TUG" },
    { key: "tue", label: "Tomadas de uso específico", badge: "TUE" }
  ];

  var ROOM_DEFS = [
    { id: "quartos", label: "Quartos", unitLabel: "Quarto", required: true },
    { id: "banheiros", label: "Banheiros", unitLabel: "Banheiro", required: true },
    { id: "sala", label: "Sala", unitLabel: "Sala", required: true },
    { id: "cozinha", label: "Cozinha", unitLabel: "Cozinha", required: false },
    { id: "sala_jantar", label: "Sala de jantar", unitLabel: "Sala de jantar", required: false },
    { id: "garagem", label: "Garagem", unitLabel: "Garagem", required: false },
    { id: "area_servico", label: "Área de serviço", unitLabel: "Área de serviço", required: false },
    { id: "lavanderia", label: "Lavanderia", unitLabel: "Lavanderia", required: false },
    { id: "varanda", label: "Varanda", unitLabel: "Varanda", required: false },
    { id: "escritorio", label: "Escritório", unitLabel: "Escritório", required: false },
    { id: "corredor", label: "Corredor", unitLabel: "Corredor", required: false },
    { id: "area_externa", label: "Área externa", unitLabel: "Área externa", required: false },
    { id: "despensa", label: "Despensa", unitLabel: "Despensa", required: false }
  ];

  var engine = window.DimenVoltMotor;

  var engineLoadPromise = engine && typeof engine.load === "function"
    ? engine.load().catch(function () {
        return null;
      })
    : Promise.reject(new Error("Motor de cálculo indisponível."));

  function blankUnit() {
    return {
      tug: [],
      tue: [],
      iluminacao: [],
      interruptores: 0,
      comprimento: 0,
      largura: 0,
      altura: 2.7
    };
  }

  function unitTugCount(unit) {
    return Array.isArray(unit.tug) ? unit.tug.length : 0;
  }

  function unitTueCount(unit) {
    return Array.isArray(unit.tue) ? unit.tue.length : 0;
  }

  function pointPowerSum(list) {
    return (list || []).reduce(function (acc, p) {
      return acc + num(p.potencia);
    }, 0);
  }

  function unitTugPower(unit) {
    return pointPowerSum(unit.tug);
  }

  function unitTuePower(unit) {
    return pointPowerSum(unit.tue);
  }

  function unitIluminacaoCount(unit) {
    return Array.isArray(unit.iluminacao) ? unit.iluminacao.length : 0;
  }

  function unitIluminacaoPower(unit) {
    return pointPowerSum(unit.iluminacao);
  }

  function unitPointPower(unit, type) {
    if (type === "tug") return unitTugPower(unit);
    if (type === "tue") return unitTuePower(unit);
    return unitIluminacaoPower(unit);
  }

  function unitPower(unit) {
    return unitTugPower(unit) + unitTuePower(unit) + unitIluminacaoPower(unit);
  }

  function nextPointId(list) {
    var max = 0;
    (list || []).forEach(function (p) {
      if (num(p.id) > max) max = num(p.id);
    });
    return max + 1;
  }

  function syncPointCount(unit, type, count) {
    count = clampInt(count, 0, 40);
    var list = unit[type];
    if (!Array.isArray(list)) list = unit[type] = [];
    while (list.length < count) list.push({ id: nextPointId(list), potencia: 0 });
    while (list.length > count) list.pop();
  }

  function setPointPower(unit, type, id, potencia) {
    var list = unit[type] || [];
    var found = null;
    list.some(function (p) {
      if (num(p.id) === num(id)) {
        found = p;
        return true;
      }
      return false;
    });
    if (found) found.potencia = num(potencia);
  }

  function createRoomState(def) {
    return {
      id: def.id,
      label: def.label,
      unitLabel: def.unitLabel,
      required: def.required,
      enabled: !!def.required,
      count: def.required ? 1 : 0,
      units: def.required ? [blankUnit()] : []
    };
  }

  function blankCircuit() {
    return { potencia: 0, distancia: 0, result: null, error: null };
  }

  var state = {
    step: 0,
    docType: "survey",
    cliente: {
      nome: ""
    },
    obra: {
      tipo: "Residencial",
      tensao: "127V"
    },
    rooms: ROOM_DEFS.map(createRoomState),
    dimensionamento: {
      dimsEnabled: false,
      prefilledCircuits: false,
      circuits: {
        iluminacao: blankCircuit(),
        tug: blankCircuit(),
        tue: blankCircuit()
      }
    }
  };

  var materialsState = {
    list: null,
    loading: false,
    pending: null,
    error: null
  };

  var els = {
    progress: document.getElementById("lvProgress"),
    progressFill: document.getElementById("lvProgressFill"),
    progressLabel: document.getElementById("lvProgressLabel"),
    ambientesRoot: document.getElementById("ambientesRoot"),
    dimensionamentoRoot: document.getElementById("dimensionamentoRoot"),
    advancedRoot: document.getElementById("advancedRoot"),
    resumoGrid: document.getElementById("resumoGrid"),
    circuitosResumoRoot: document.getElementById("circuitosResumoRoot"),
    finalRoot: document.getElementById("finalRoot"),
    docChoice: document.getElementById("docChoice"),
    materialsPreview: document.getElementById("materialsPreview"),
    materialsHint: document.getElementById("materialsHint"),
    pdfStatus: document.getElementById("pdfStatus"),
    btnPdf: document.getElementById("btnPdf"),
    clienteNome: document.getElementById("clienteNome"),
    clienteHint: document.getElementById("clienteHint"),
    ambientesHint: document.getElementById("ambientesHint"),
    dimensionamentoHint: document.getElementById("dimensionamentoHint")
  };

  function num(value) {
    var n = parseFloat(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function clampInt(value, min, max) {
    var n = Math.round(num(value));
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  function formatPower(w) {
    return formatNumber(w, 0) + " W";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getEnabledRooms() {
    return state.rooms.filter(function (room) {
      return room.enabled && room.units.length > 0;
    });
  }

  function flattenUnits() {
    var list = [];
    getEnabledRooms().forEach(function (room) {
      room.units.forEach(function (unit, index) {
        list.push({
          roomId: room.id,
          roomLabel: room.label,
          unitLabel: room.unitLabel + " " + (index + 1),
          unit: unit
        });
      });
    });
    return list;
  }

  function computeTotals() {
    var units = flattenUnits();
    var totals = {
      ambientes: units.length,
      tug: { pontos: 0, potencia: 0 },
      tue: { pontos: 0, potencia: 0 },
      iluminacao: { pontos: 0, potencia: 0 },
      interruptores: 0,
      potencia: 0,
      area: 0,
      perimetro: 0
    };
    units.forEach(function (item) {
      var u = item.unit;
      var tugP = unitTugPower(u);
      var tueP = unitTuePower(u);
      var iluP = unitIluminacaoPower(u);
      totals.tug.pontos += unitTugCount(u);
      totals.tug.potencia += tugP;
      totals.tue.pontos += unitTueCount(u);
      totals.tue.potencia += tueP;
      totals.iluminacao.pontos += unitIluminacaoCount(u);
      totals.iluminacao.potencia += iluP;
      totals.interruptores += num(u.interruptores);
      totals.potencia += tugP + tueP + iluP;
      var area = num(u.comprimento) * num(u.largura);
      var peri = 2 * (num(u.comprimento) + num(u.largura));
      totals.area += area;
      totals.perimetro += peri;
    });
    return totals;
  }

  function unitArea(unit) {
    return num(unit.comprimento) * num(unit.largura);
  }

  function unitPerimeter(unit) {
    return 2 * (num(unit.comprimento) + num(unit.largura));
  }

  function syncRoomCount(room, count) {
    count = clampInt(count, room.enabled ? 1 : 0, 12);
    room.count = count;
    while (room.units.length < count) room.units.push(blankUnit());
    while (room.units.length > count) room.units.pop();
  }

  function setRoomEnabled(room, enabled) {
    if (room.required) return;
    room.enabled = !!enabled;
    if (room.enabled) {
      if (room.count < 1) room.count = 1;
      syncRoomCount(room, room.count);
    } else {
      room.count = 0;
      room.units = [];
    }
  }

  /* ---------- motor de cálculo ---------- */

  function voltageNumber() {
    return parseInt(state.obra.tensao, 10) || 127;
  }

  function connectionForVoltage(v) {
    return v >= 380 ? "three-phase" : "fase-neutro";
  }

  function loadedConductorsFor(conn) {
    return conn === "three-phase" ? 3 : 2;
  }

  function activeCircuitCount() {
    var count = 0;
    CIRCUIT_DEFS.forEach(function (def) {
      var c = state.dimensionamento.circuits[def.key];
      if (num(c.potencia) > 0 && num(c.distancia) > 0) count++;
    });
    return Math.max(1, count);
  }

  function dimensionCircuit(key) {
    var c = state.dimensionamento.circuits[key];
    c.result = null;
    c.error = null;
    if (!engine || typeof engine.dimensionar !== "function") {
      c.error = "Motor de cálculo indisponível.";
      return null;
    }
    if (engine.isReady && !engine.isReady()) {
      c.error = "Bases de cálculo carregando… aguarde um instante.";
      return null;
    }
    var potencia = num(c.potencia);
    var distancia = num(c.distancia);
    if (potencia <= 0 || distancia <= 0) return null;
    var tensao = voltageNumber();
    var tipoLigacao = connectionForVoltage(tensao);
    var mat = {
      potencia: potencia,
      tensao: tensao,
      comprimento: distancia,
      tipoLigacao: tipoLigacao,
      tipoCircuito: key,
      metodoInstalacao: "B1",
      margem: "minimum",
      material: "copper",
      condicaoAmbiente: "normal",
      circuitosAgrupados: activeCircuitCount(),
      condutoresCarregados: loadedConductorsFor(tipoLigacao),
      quedaTensaoMax: 4,
      fatorPotencia: 0.92
    };
    var res = engine.dimensionar(mat);
    if (!res || !res.ok) {
      c.error = (res && res.error) || "Não foi possível dimensionar este circuito.";
      return null;
    }
    c.result = res;
    return res;
  }

  function recomputeDimensioning() {
    CIRCUIT_DEFS.forEach(function (def) {
      dimensionCircuit(def.key);
    });
  }

  function conductorCountFor(res) {
    var conn = res.params.tipoLigacao;
    var phases = conn === "three-phase" ? 3 : conn === "phase-phase" ? 2 : 1;
    var neutral = res.texts.neutral && res.texts.neutral.indexOf("Não aplicável") === -1 ? 1 : 0;
    return phases + neutral + 1;
  }

  function estimatedMetragem(res, distancia) {
    return conductorCountFor(res) * num(distancia);
  }

  /* ---------- toast ---------- */

  var toastEl = null;
  var toastTimer = null;

  function toast(message, type) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "lv-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", type === "error");
    toastEl.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-show");
    }, 3200);
  }

  function showHint(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove("is-shown");
    void el.offsetWidth;
    el.classList.add("is-shown");
  }

  function hideHint(el) {
    if (el) el.hidden = true;
  }

  /* ---------- navigation ---------- */

  function updateProgress(step) {
    var show = step > 0;
    els.progress.hidden = !show;
    if (!show) return;
    var pct = ((step - 1) / 4) * 100;
    els.progressFill.style.width = pct + "%";
    els.progressLabel.textContent = STEP_LABELS[step] || "";
    document.querySelectorAll(".lv-progress-node").forEach(function (node) {
      var n = parseInt(node.getAttribute("data-node"), 10);
      node.classList.toggle("is-done", n < step);
      node.classList.toggle("is-current", n === step);
    });
  }

  function goToStep(next) {
    var current = document.querySelector(".lv-panel.is-active");
    var target = document.querySelector('.lv-panel[data-step="' + next + '"]');
    if (!target || next === state.step) return;

    function activate() {
      document.querySelectorAll(".lv-panel").forEach(function (panel) {
        panel.classList.remove("is-active", "is-exit");
        panel.hidden = true;
      });
      target.hidden = false;
      target.classList.add("is-active");
      if (next === 1) initSegPills();
      state.step = next;
      updateProgress(next);
      if (next === 2) renderAmbientes();
      if (next === 3) renderDimensionamento();
      if (next === 4) renderResumo();
      if (next === 5) renderFinal();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (current && !current.hidden) {
      current.classList.remove("is-active");
      current.classList.add("is-exit");
      window.setTimeout(function () {
        current.classList.remove("is-exit");
        current.hidden = true;
        activate();
      }, 165);
    } else {
      activate();
    }
  }

  function validateObra() {
    var nome = (els.clienteNome.value || "").trim();
    state.cliente.nome = nome;
    if (!nome) {
      els.clienteNome.classList.add("is-invalid");
      els.clienteNome.focus();
      window.setTimeout(function () {
        els.clienteNome.classList.remove("is-invalid");
      }, 400);
      showHint(els.clienteHint);
      toast("Informe o nome do cliente para continuar.", "error");
      return false;
    }
    hideHint(els.clienteHint);
    return true;
  }

  function validateAmbientes() {
    var ok = getEnabledRooms().length > 0;
    ROOM_DEFS.forEach(function (def) {
      if (!def.required) return;
      var room = state.rooms.find(function (r) { return r.id === def.id; });
      if (!room || !room.enabled || room.units.length < 1) ok = false;
    });
    if (!ok) {
      showHint(els.ambientesHint);
      toast("Inclua ao menos os ambientes obrigatórios: Quartos, Banheiros e Sala.", "error");
      return false;
    }
    hideHint(els.ambientesHint);
    return true;
  }

  function validateDimensionamento() {
    recomputeDimensioning();
    var any = CIRCUIT_DEFS.some(function (def) {
      var c = state.dimensionamento.circuits[def.key];
      return c.result && c.result.ok;
    });
    if (!any) {
      showHint(els.dimensionamentoHint);
      toast("Informe potência e distância de ao menos um circuito para dimensionar.", "error");
      return false;
    }
    hideHint(els.dimensionamentoHint);
    return true;
  }

  function tryNext() {
    if (state.step === 1 && !validateObra()) return;
    if (state.step === 2 && !validateAmbientes()) return;
    if (state.step === 3 && !validateDimensionamento()) return;
    goToStep(state.step + 1);
  }

  function tryBack() {
    if (state.step <= 0) return;
    goToStep(state.step - 1);
  }

  /* ---------- renderers ---------- */

  function renderAmbientes() {
    els.ambientesRoot.innerHTML =
      roomGroupHtml(
        "Ambientes obrigatórios",
        "Sempre incluídos no levantamento",
        state.rooms.filter(function (r) { return r.required; })
      ) +
      roomGroupHtml(
        "Ambientes opcionais",
        "Ative os que fazem parte do projeto",
        state.rooms.filter(function (r) { return !r.required; })
      );
  }

  function roomGroupHtml(title, note, rooms) {
    return (
      '<div class="lv-room-group">' +
        '<div class="lv-room-group-head">' +
          "<strong>" + escapeHtml(title) + "</strong>" +
          "<span>" + escapeHtml(note) + "</span>" +
        "</div>" +
        '<div class="lv-room-group-list">' +
          rooms.map(roomHtml).join("") +
        "</div>" +
      "</div>"
    );
  }

  function roomHtml(room) {
    var unitsHtml = room.units.map(function (unit, index) {
      return unitPointsHtml(room, unit, index);
    }).join("");

    return (
      '<article class="lv-room' + (room.enabled ? "" : " is-disabled") + '" data-room="' + room.id + '">' +
        '<div class="lv-room-head">' +
          '<div class="lv-room-title">' +
            "<strong>" + escapeHtml(room.label) + "</strong>" +
            '<span class="lv-badge' + (room.required ? " is-req" : "") + '">' +
              (room.required ? "Obrigatório" : "Opcional") +
            "</span>" +
          "</div>" +
          (room.required
            ? ""
            : '<button type="button" class="lv-toggle' + (room.enabled ? " is-on" : "") + '" data-action="toggle" aria-pressed="' + room.enabled + '" aria-label="Ativar ' + escapeHtml(room.label) + '"></button>') +
        "</div>" +
        (room.enabled
          ? '<div class="lv-room-body">' +
              '<div class="lv-qty-row">' +
                '<label class="lv-label">Quantidade</label>' +
                '<div class="lv-qty-control">' +
                  '<button type="button" data-action="qty-dec" aria-label="Diminuir">−</button>' +
                  "<span>" + room.count + "</span>" +
                  '<button type="button" data-action="qty-inc" aria-label="Aumentar">+</button>' +
                "</div>" +
              "</div>" +
              '<div class="lv-units">' + unitsHtml + "</div>" +
            "</div>"
          : "") +
      "</article>"
    );
  }

  var POINT_DEFS = {
    tug: { label: "TUG", hint: "Tomadas de uso geral" },
    tue: { label: "TUE", hint: "Tomadas de uso específico" },
    iluminacao: { label: "Iluminação", hint: "Pontos de iluminação" }
  };

  function unitPointsHtml(room, unit, index) {
    return (
      '<div class="lv-unit" data-unit="' + index + '">' +
        '<div class="lv-unit-head">' +
          "<strong>" + escapeHtml(room.unitLabel) + " " + (index + 1) + "</strong>" +
          "<span>Pontos elétricos</span>" +
        "</div>" +
        pointGroupHtml(unit, "tug") +
        pointGroupHtml(unit, "tue") +
        pointGroupHtml(unit, "iluminacao") +
        '<div class="lv-metrics">' +
          fieldHtml("interruptores", "Interruptores", unit.interruptores) +
        "</div>" +
        unitTotalsHtml(unit) +
      "</div>"
    );
  }

  function pointGroupHtml(unit, type) {
    var def = POINT_DEFS[type];
    var list = unit[type] || [];
    var inputs = list.map(function (p) {
      return (
        '<div class="lv-pt-input">' +
          "<label>" + escapeHtml(def.label + " " + p.id) + " · Potência (W)</label>" +
          '<input type="number" inputmode="decimal" min="0" step="any" data-field="' + type + '.potencia" data-idx="' + num(p.id) + '" value="' + escapeHtml(String(num(p.potencia) || 0)) + '" />' +
        "</div>"
      );
    }).join("");
    return (
      '<div class="lv-point-group" data-point="' + type + '">' +
        '<div class="lv-point-head">' +
          '<span class="lv-point-name">' + def.label + "</span>" +
          '<span class="lv-point-hint">' + escapeHtml(def.hint) + "</span>" +
          '<div class="lv-qty-control">' +
            '<button type="button" data-action="pt-dec" data-pt="' + type + '" aria-label="Diminuir ' + def.label + '">−</button>' +
            "<span>" + list.length + "</span>" +
            '<button type="button" data-action="pt-inc" data-pt="' + type + '" aria-label="Aumentar ' + def.label + '">+</button>' +
          "</div>" +
        "</div>" +
        (list.length ? '<div class="lv-pt-inputs">' + inputs + "</div>" : "") +
        '<div class="lv-pt-total">' +
          "<span>Total " + def.label + "</span>" +
          '<strong data-live="' + type + '-power">' + formatPower(unitPointPower(unit, type)) + "</strong>" +
        "</div>" +
      "</div>"
    );
  }

  function unitTotalsHtml(unit) {
    return (
      '<div class="lv-calc-row">' +
        '<div class="lv-calc-pill"><span>TUG</span><strong data-live="unit-tug">' + unitTugCount(unit) + " pt · " + formatPower(unitTugPower(unit)) + "</strong></div>" +
        '<div class="lv-calc-pill"><span>TUE</span><strong data-live="unit-tue">' + unitTueCount(unit) + " pt · " + formatPower(unitTuePower(unit)) + "</strong></div>" +
        '<div class="lv-calc-pill"><span>Iluminação</span><strong data-live="unit-ill">' + unitIluminacaoCount(unit) + " pt · " + formatPower(unitIluminacaoPower(unit)) + "</strong></div>" +
        '<div class="lv-calc-pill lv-calc-pill-total"><span>Potência total</span><strong data-live="unit-total">' + formatPower(unitPower(unit)) + "</strong></div>" +
      "</div>"
    );
  }

  function fieldHtml(key, label, value) {
    return (
      '<div class="lv-metric">' +
        "<label>" + escapeHtml(label) + "</label>" +
        '<input type="number" inputmode="decimal" min="0" step="any" data-field="' + key + '" value="' + escapeHtml(String(value || 0)) + '" />' +
      "</div>"
    );
  }

  function dimensoesHtml() {
    var items = flattenUnits();
    return items.map(function (item, globalIndex) {
      var u = item.unit;
      return (
        '<article class="lv-room" data-dim-index="' + globalIndex + '">' +
          '<div class="lv-room-head">' +
            '<div class="lv-room-title"><strong>' + escapeHtml(item.unitLabel) + "</strong>" +
              '<span class="lv-badge">' + escapeHtml(item.roomLabel) + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="lv-room-body">' +
            '<div class="lv-metrics">' +
              fieldHtml("comprimento", "Comprimento (m)", u.comprimento) +
              fieldHtml("largura", "Largura (m)", u.largura) +
              fieldHtml("altura", "Pé-direito (m)", u.altura) +
            "</div>" +
            '<div class="lv-calc-row">' +
              '<div class="lv-calc-pill"><span>Área</span><strong data-live="area">' + formatNumber(unitArea(u), 2) + " m²</strong></div>" +
              '<div class="lv-calc-pill"><span>Perímetro</span><strong data-live="perimetro">' + formatNumber(unitPerimeter(u), 2) + " m</strong></div>" +
            "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("") || '<p class="lv-session-note">Nenhum ambiente ativo.</p>';
  }

  function circuitKvHtml(res) {
    var statusClass = res.status.class === "safe" ? "is-safe" : "is-warn";
    return (
      "<dt>Corrente (Ib)</dt><dd>" + res.ib.toFixed(2) + " A</dd>" +
      "<dt>Condutor (fase)</dt><dd>" + escapeHtml(res.texts.phase) + "</dd>" +
      "<dt>Neutro</dt><dd>" + escapeHtml(res.texts.neutral) + "</dd>" +
      "<dt>PE</dt><dd>" + escapeHtml(res.texts.pe) + "</dd>" +
      "<dt>Disjuntor</dt><dd>" + res.breaker + " A</dd>" +
      "<dt>Queda de tensão</dt><dd>" + res.dropPct.toFixed(2) + " %</dd>" +
      "<dt>Status</dt><dd class='" + statusClass + "'>" + escapeHtml(res.status.text) + "</dd>"
    );
  }

  function circuitResultHtml(key, c, res) {
    var potencia = num(c.potencia);
    var distancia = num(c.distancia);
    if (c.error) {
      return '<p class="lv-circuit-note is-error">' + escapeHtml(c.error) + "</p>";
    }
    if (res && res.ok) {
      var condutores = conductorCountFor(res);
      var metragem = estimatedMetragem(res, distancia);
      return (
        '<div class="lv-circuit-result">' +
          '<dl class="lv-kv">' + circuitKvHtml(res) + "</dl>" +
          '<p class="lv-circuit-meta">Distância informada: ' + formatNumber(distancia, 1) + " m · Metragem estimada: " + formatNumber(metragem, 1) + " m (" + condutores + " condutores × " + formatNumber(distancia, 1) + " m)</p>" +
        "</div>"
      );
    }
    if (potencia > 0 && distancia <= 0) {
      return '<p class="lv-circuit-note">Informe a distância do circuito para dimensionar.</p>';
    }
    if (distancia > 0 && potencia <= 0) {
      return '<p class="lv-circuit-note">Informe a potência do circuito para dimensionar.</p>';
    }
    return '<p class="lv-circuit-note">Informe a potência (W) e a distância (m) para dimensionar este circuito pelo motor de cálculo.</p>';
  }

  function circuitCardHtml(def) {
    var c = state.dimensionamento.circuits[def.key];
    return (
      '<article class="lv-room lv-circuit" data-circuit="' + def.key + '">' +
        '<div class="lv-room-head">' +
          '<div class="lv-room-title">' +
            "<strong>" + escapeHtml(def.label) + "</strong>" +
            '<span class="lv-badge">' + escapeHtml(def.badge) + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="lv-room-body">' +
          '<div class="lv-metrics">' +
            fieldHtml("potencia", "Potência (W)", c.potencia) +
            fieldHtml("distancia", "Distância (m)", c.distancia) +
          "</div>" +
          '<div data-result="' + def.key + '">' + circuitResultHtml(def.key, c, c.result) + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function advancedOptionsHtml() {
    var on = state.dimensionamento.dimsEnabled;
    return (
      '<div class="lv-advanced">' +
        "<header><span>⚙ Opções avançadas</span><em>opcional</em></header>" +
        '<div class="lv-adv-row">' +
          '<div class="lv-adv-copy">' +
            "<strong>Dimensões dos ambientes</strong>" +
            "<span>Informe comprimento, largura e pé-direito. Área e perímetro são calculados automaticamente. Não é obrigatório para concluir o levantamento.</span>" +
          "</div>" +
          '<button type="button" class="lv-toggle' + (on ? " is-on" : "") + '" data-action="toggle-dims" aria-pressed="' + on + '" aria-label="Ativar dimensões dos ambientes"></button>' +
        "</div>" +
        (on
          ? '<div class="lv-stack" id="dimensoesRoot">' + dimensoesHtml() + "</div>"
          : '<div class="lv-stack" id="dimensoesRoot" hidden></div>') +
      "</div>"
    );
  }

  function renderDimensionamento() {
    engineLoadPromise.then(function () {
      prefillCircuitPowers();
      recomputeDimensioning();
      els.dimensionamentoRoot.innerHTML = CIRCUIT_DEFS.map(circuitCardHtml).join("");
      els.advancedRoot.innerHTML = advancedOptionsHtml();
    }).catch(function (err) {
      els.dimensionamentoRoot.innerHTML =
        '<p class="lv-session-note">' + escapeHtml((err && err.message) || "Motor de cálculo indisponível.") + "</p>";
      els.advancedRoot.innerHTML = "";
    });
  }

  function prefillCircuitPowers() {
    if (state.dimensionamento.prefilledCircuits) return;
    state.dimensionamento.prefilledCircuits = true;
    var t = computeTotals();
    ["iluminacao", "tug", "tue"].forEach(function (key) {
      var c = state.dimensionamento.circuits[key];
      if (num(c.potencia) === 0 && num(t[key].potencia) > 0) {
        c.potencia = num(t[key].potencia);
      }
    });
  }

  function circuitTotalPower() {
    var total = 0;
    CIRCUIT_DEFS.forEach(function (def) {
      total += num(state.dimensionamento.circuits[def.key].potencia);
    });
    return total;
  }

  function renderResumo() {
    var t = computeTotals();
    if (t.ambientes === 0) {
      els.resumoGrid.innerHTML =
        '<p class="lv-session-note">Nenhum ambiente ativo. Volte à etapa de ambientes para incluir ao menos os obrigatórios.</p>';
      els.circuitosResumoRoot.innerHTML = "";
      return;
    }
    els.resumoGrid.innerHTML =
      statHtml("Ambientes", t.ambientes) +
      statHtml("TUG", t.tug.pontos, "pontos") +
      statHtml("TUE", t.tue.pontos, "pontos") +
      statHtml("Iluminação", t.iluminacao.pontos, "pontos") +
      statHtml("Interruptores", t.interruptores, "pontos") +
      statHtml("Potência TUG", formatNumber(t.tug.potencia, 0), "W") +
      statHtml("Potência TUE", formatNumber(t.tue.potencia, 0), "W") +
      statHtml("Potência Iluminação", formatNumber(t.iluminacao.potencia, 0), "W") +
      statHtml("Potência total", formatNumber(t.potencia, 0), "W");

    var blocks = CIRCUIT_DEFS.map(function (def) {
      var c = state.dimensionamento.circuits[def.key];
      var res = c.result;
      var body =
        '<dl class="lv-kv">' +
          "<dt>Potência</dt><dd>" + formatPower(c.potencia) + "</dd>" +
          "<dt>Distância</dt><dd>" + formatNumber(c.distancia, 1) + " m</dd>" +
          (res && res.ok ? circuitKvHtml(res) : "<dt>Status</dt><dd>Não dimensionado</dd>") +
        "</dl>";
      return blockHtml(def.badge + " · " + def.label, body);
    }).join("");

    blocks += blockHtml("Potência total dos circuitos",
      '<dl class="lv-kv">' +
        "<dt>Total</dt><dd>" + formatPower(circuitTotalPower()) + "</dd>" +
      "</dl>");

    els.circuitosResumoRoot.innerHTML = blocks;
  }

  function statHtml(label, value, unit) {
    return (
      '<article class="lv-stat">' +
        "<span>" + escapeHtml(label) + "</span>" +
        "<strong>" + escapeHtml(String(value)) +
          (unit ? "<em>" + escapeHtml(unit) + "</em>" : "") +
        "</strong>" +
      "</article>"
    );
  }

  function renderFinal() {
    var t = computeTotals();
    var units = flattenUnits();

    var rowsPoints = units.map(function (item) {
      var u = item.unit;
      return (
        "<tr>" +
          "<td>" + escapeHtml(item.unitLabel) + "</td>" +
          "<td>" + formatNumber(unitTugCount(u)) + " · " + formatPower(unitTugPower(u)) + "</td>" +
          "<td>" + formatNumber(unitTueCount(u)) + " · " + formatPower(unitTuePower(u)) + "</td>" +
          "<td>" + formatNumber(unitIluminacaoCount(u)) + " · " + formatPower(unitIluminacaoPower(u)) + "</td>" +
          "<td>" + formatNumber(u.interruptores) + "</td>" +
          "<td>" + formatPower(unitPower(u)) + "</td>" +
        "</tr>"
      );
    }).join("");

    var rowsPointsDetail = units.map(function (item) {
      var u = item.unit;
      var rows = "";
      (u.tug || []).forEach(function (p) {
        rows +=
          "<tr>" +
            "<td>" + escapeHtml(item.unitLabel) + "</td>" +
            "<td>TUG</td>" +
            "<td>" + escapeHtml("TUG " + p.id) + "</td>" +
            "<td>" + formatPower(p.potencia) + "</td>" +
          "</tr>";
      });
      (u.tue || []).forEach(function (p) {
        rows +=
          "<tr>" +
            "<td>" + escapeHtml(item.unitLabel) + "</td>" +
            "<td>TUE</td>" +
            "<td>" + escapeHtml("TUE " + p.id) + "</td>" +
            "<td>" + formatPower(p.potencia) + "</td>" +
          "</tr>";
      });
      if (unitIluminacaoCount(u) > 0) {
        (u.iluminacao || []).forEach(function (p) {
          rows +=
            "<tr>" +
              "<td>" + escapeHtml(item.unitLabel) + "</td>" +
              "<td>Iluminação</td>" +
              "<td>" + escapeHtml("Iluminação " + p.id) + "</td>" +
              "<td>" + formatPower(p.potencia) + "</td>" +
            "</tr>";
        });
      }
      if (num(u.interruptores) > 0) {
        rows +=
          "<tr>" +
            "<td>" + escapeHtml(item.unitLabel) + "</td>" +
            "<td>Interruptores</td>" +
            "<td>" + formatNumber(u.interruptores) + " ponto(s)</td>" +
            "<td>—</td>" +
          "</tr>";
      }
      return rows;
    }).join("");

    var rowsDims = units.map(function (item) {
      var u = item.unit;
      return (
        "<tr>" +
          "<td>" + escapeHtml(item.unitLabel) + "</td>" +
          "<td>" + formatNumber(unitArea(u), 2) + " m²</td>" +
          "<td>" + formatNumber(unitPerimeter(u), 2) + " m</td>" +
          "<td>" + formatNumber(u.altura, 2) + " m</td>" +
        "</tr>"
      );
    }).join("");

    var circuitBlocks = CIRCUIT_DEFS.map(function (def) {
      var c = state.dimensionamento.circuits[def.key];
      var res = c.result;
      var body =
        '<dl class="lv-kv">' +
          "<dt>Potência</dt><dd>" + formatPower(c.potencia) + "</dd>" +
          "<dt>Distância</dt><dd>" + formatNumber(c.distancia, 1) + " m</dd>" +
          (res && res.ok
            ? circuitKvHtml(res) +
              "<dt>Metragem estimada</dt><dd>" + formatNumber(estimatedMetragem(res, c.distancia), 1) + " m</dd>"
            : "<dt>Status</dt><dd>Não dimensionado</dd>") +
        "</dl>";
      return blockHtml(def.badge + " · " + def.label, body);
    }).join("");

    els.finalRoot.innerHTML =
      blockHtml("Cliente",
        '<dl class="lv-kv">' +
          "<dt>Nome do cliente</dt><dd>" + escapeHtml(state.cliente.nome) + "</dd>" +
        "</dl>"
      ) +
      blockHtml("Dados da obra",
        '<dl class="lv-kv">' +
          "<dt>Tipo</dt><dd>" + escapeHtml(state.obra.tipo) + "</dd>" +
          "<dt>Tensão</dt><dd>" + escapeHtml(state.obra.tensao) + "</dd>" +
        "</dl>"
      ) +
      blockHtml("Ambientes e pontos",
        '<div class="lv-table-wrap"><table class="lv-table"><thead><tr>' +
          "<th>Ambiente</th><th>TUG</th><th>TUE</th><th>Iluminação</th><th>Interruptores</th><th>Potência</th>" +
        "</tr></thead><tbody>" + rowsPoints + "</tbody></table></div>" +
        (rowsPointsDetail
          ? '<div class="lv-table-wrap lv-table-wrap-detail"><table class="lv-table"><thead><tr>' +
              "<th>Ambiente</th><th>Tipo</th><th>Ponto</th><th>Potência</th>" +
            "</tr></thead><tbody>" + rowsPointsDetail + "</tbody></table></div>"
          : "")
      ) +
      blockHtml("Dimensionamento dos circuitos",
        circuitBlocks ||
        '<p class="lv-session-note">Nenhum circuito foi dimensionado.</p>'
      ) +
      (state.dimensionamento.dimsEnabled
        ? blockHtml("Dimensões dos ambientes",
            '<div class="lv-table-wrap"><table class="lv-table"><thead><tr>' +
              "<th>Ambiente</th><th>Área</th><th>Perímetro</th><th>Pé-direito</th>" +
            "</tr></thead><tbody>" + rowsDims + "</tbody></table></div>"
          )
        : "") +
      blockHtml("Resumo geral",
        '<dl class="lv-kv">' +
          "<dt>Total de ambientes</dt><dd>" + formatNumber(t.ambientes) + "</dd>" +
          "<dt>TUG</dt><dd>" + formatNumber(t.tug.pontos) + " pontos · " + formatPower(t.tug.potencia) + "</dd>" +
          "<dt>TUE</dt><dd>" + formatNumber(t.tue.pontos) + " pontos · " + formatPower(t.tue.potencia) + "</dd>" +
          "<dt>Pontos de iluminação</dt><dd>" + formatNumber(t.iluminacao.pontos) + " pontos · " + formatPower(t.iluminacao.potencia) + "</dd>" +
          "<dt>Interruptores</dt><dd>" + formatNumber(t.interruptores) + "</dd>" +
          "<dt>Potência estimada (ambientes)</dt><dd>" + formatPower(t.potencia) + "</dd>" +
          "<dt>Potência dos circuitos</dt><dd>" + formatPower(circuitTotalPower()) + "</dd>" +
          (state.dimensionamento.dimsEnabled
            ? "<dt>Área total</dt><dd>" + formatNumber(t.area, 2) + " m²</dd>"
            : "") +
        "</dl>"
      );

    syncDocChoice();
  }

  function blockHtml(title, body) {
    return (
      '<section class="lv-final-block">' +
        "<header><span>" + escapeHtml(title) + "</span></header>" +
        '<div class="lv-final-body">' + body + "</div>" +
      "</section>"
    );
  }

  /* ---------- document choice & materials ---------- */

  function syncDocChoice() {
    if (!els.docChoice) return;
    els.docChoice.querySelectorAll(".lv-doc-option").forEach(function (btn) {
      var active = btn.getAttribute("data-doc") === state.docType;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (state.docType === "materials") {
      renderMaterialsPreview();
    } else {
      if (els.materialsPreview) {
        els.materialsPreview.hidden = true;
        els.materialsPreview.innerHTML = "";
      }
      hideHint(els.materialsHint);
    }
  }

  function renderMaterialsPreview() {
    var container = els.materialsPreview;
    if (!container) return;
    container.hidden = false;
    container.innerHTML =
      '<p class="lv-materials-loading">Carregando catálogo de materiais…</p>';
    hideHint(els.materialsHint);
    ensureMaterialsList()
      .then(function (list) {
        container.innerHTML = materialsPreviewHtml(list);
      })
      .catch(function (err) {
        console.error(err);
        container.hidden = true;
        showHint(els.materialsHint);
      });
  }

  function ensureMaterialsList() {
    if (materialsState.list) return Promise.resolve(materialsState.list);
    if (materialsState.error) return Promise.reject(materialsState.error);
    if (materialsState.pending) return materialsState.pending;
    var payload = {
      totals: computeTotals(),
      units: flattenUnits()
    };
    materialsState.pending = Promise.resolve()
      .then(function () {
        if (!window.DimenVoltMaterials) {
          throw new Error("Serviço de materiais indisponível.");
        }
        return window.DimenVoltMaterials.load();
      })
      .then(function () {
        var list = window.DimenVoltMaterials.buildMaterialsList(payload);
        materialsState.list = list;
        return list;
      })
      .catch(function (err) {
        materialsState.error = err;
        throw err;
      });
    return materialsState.pending;
  }

  function materialsPreviewHtml(list) {
    if (!list || !list.categories || list.categories.length === 0) {
      return '<p class="lv-session-note">Nenhum material identificado para este levantamento.</p>';
    }

    var groups = list.categories.map(function (cat) {
      var rows = cat.items.map(function (item) {
        return (
          '<div class="lv-mat-item' + (item.estimated ? " is-estimated" : "") + '">' +
            '<span class="lv-mat-name">' +
              escapeHtml(item.name) +
              (item.estimated ? '<em>estimado</em>' : "") +
            "</span>" +
            '<span class="lv-mat-qty">' +
              formatNumber(item.quantity) + " " + escapeHtml(item.unit) +
            "</span>" +
          "</div>"
        );
      }).join("");
      return (
        '<section class="lv-mat-group">' +
          '<header>' +
            "<span>" + escapeHtml(cat.name) + "</span>" +
            "<b>" + formatNumber(cat.items.length) + "</b>" +
          "</header>" +
          '<div class="lv-mat-list">' + rows + "</div>" +
        "</section>"
      );
    }).join("");

    var note = list.estimatedItems > 0
      ? '<p class="lv-mat-note">Itens marcados como <b>estimado</b> são aproximações calculadas a partir dos dados do levantamento e devem ser conferidos em campo.</p>'
      : "";

    return (
      '<div class="lv-mat-head">' +
        "<strong>Lista de materiais</strong>" +
        "<span>" + formatNumber(list.totalItems) + " itens" +
          (list.estimatedItems > 0 ? " · " + formatNumber(list.estimatedItems) + " estimados" : "") +
        "</span>" +
      "</div>" +
      groups +
      note
    );
  }

  function selectDoc(type) {
    if (type !== "survey" && type !== "materials") return;
    state.docType = type;
    syncDocChoice();
  }

  /* ---------- events ---------- */

  function findRoom(id) {
    return state.rooms.find(function (r) { return r.id === id; });
  }

  els.ambientesRoot.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var article = btn.closest("[data-room]");
    if (!article) return;
    var room = findRoom(article.getAttribute("data-room"));
    if (!room) return;
    var action = btn.getAttribute("data-action");
    if (action === "toggle") {
      setRoomEnabled(room, !room.enabled);
      renderAmbientes();
    } else if (action === "qty-inc") {
      syncRoomCount(room, room.count + 1);
      renderAmbientes();
    } else if (action === "qty-dec") {
      syncRoomCount(room, room.count - 1);
      renderAmbientes();
    } else if (action === "pt-inc" || action === "pt-dec") {
      var unitEl = btn.closest("[data-unit]");
      var index = unitEl ? parseInt(unitEl.getAttribute("data-unit"), 10) : -1;
      var type = btn.getAttribute("data-pt");
      var unit = room.units[index];
      if (!unit || !type || !POINT_DEFS[type]) return;
      var delta = action === "pt-inc" ? 1 : -1;
      syncPointCount(unit, type, unit[type].length + delta);
      renderAmbientes();
    }
  });

  els.ambientesRoot.addEventListener("input", function (e) {
    var input = e.target.closest("input[data-field]");
    if (!input) return;
    var article = input.closest("[data-room]");
    var unitEl = input.closest("[data-unit]");
    if (!article || !unitEl) return;
    var room = findRoom(article.getAttribute("data-room"));
    var index = parseInt(unitEl.getAttribute("data-unit"), 10);
    if (!room || !room.units[index]) return;
    var unit = room.units[index];
    var field = input.getAttribute("data-field");
    if (field === "tug.potencia" || field === "tue.potencia" || field === "iluminacao.potencia") {
      var type = field.split(".")[0];
      setPointPower(unit, type, parseInt(input.getAttribute("data-idx"), 10), input.value);
      refreshUnitTotals(article, unit);
    } else {
      unit[field] = num(input.value);
    }
  });

  function refreshUnitTotals(article, unit) {
    var groupPower = article.querySelector('[data-live="tug-power"]');
    var tuePower = article.querySelector('[data-live="tue-power"]');
    var illPower = article.querySelector('[data-live="iluminacao-power"]');
    var unitTug = article.querySelector('[data-live="unit-tug"]');
    var unitTue = article.querySelector('[data-live="unit-tue"]');
    var unitIll = article.querySelector('[data-live="unit-ill"]');
    var unitTotal = article.querySelector('[data-live="unit-total"]');
    if (groupPower) groupPower.textContent = formatPower(unitTugPower(unit));
    if (tuePower) tuePower.textContent = formatPower(unitTuePower(unit));
    if (illPower) illPower.textContent = formatPower(unitIluminacaoPower(unit));
    if (unitTug) unitTug.textContent = unitTugCount(unit) + " pt · " + formatPower(unitTugPower(unit));
    if (unitTue) unitTue.textContent = unitTueCount(unit) + " pt · " + formatPower(unitTuePower(unit));
    if (unitIll) unitIll.textContent = unitIluminacaoCount(unit) + " pt · " + formatPower(unitIluminacaoPower(unit));
    if (unitTotal) unitTotal.textContent = formatPower(unitPower(unit));
  }

  els.dimensionamentoRoot.addEventListener("input", function (e) {
    var input = e.target.closest("input[data-field]");
    if (!input) return;
    var article = input.closest("[data-circuit]");
    if (!article) return;
    var key = article.getAttribute("data-circuit");
    var c = state.dimensionamento.circuits[key];
    if (!c) return;
    c[input.getAttribute("data-field")] = num(input.value);
    var res = dimensionCircuit(key);
    var box = article.querySelector("[data-result]");
    if (box) box.innerHTML = circuitResultHtml(key, c, res);
  });

  els.advancedRoot.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.getAttribute("data-action") === "toggle-dims") {
      state.dimensionamento.dimsEnabled = !state.dimensionamento.dimsEnabled;
      els.advancedRoot.innerHTML = advancedOptionsHtml();
    }
  });

  els.advancedRoot.addEventListener("input", function (e) {
    var input = e.target.closest("input[data-field]");
    if (!input) return;
    var article = input.closest("[data-dim-index]");
    if (!article) return;
    var index = parseInt(article.getAttribute("data-dim-index"), 10);
    var items = flattenUnits();
    var item = items[index];
    if (!item) return;
    item.unit[input.getAttribute("data-field")] = num(input.value);
    var areaEl = article.querySelector('[data-live="area"]');
    var periEl = article.querySelector('[data-live="perimetro"]');
    if (areaEl) areaEl.textContent = formatNumber(unitArea(item.unit), 2) + " m²";
    if (periEl) periEl.textContent = formatNumber(unitPerimeter(item.unit), 2) + " m";
  });

  document.querySelectorAll(".lv-seg").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var btn = e.target.closest(".lv-seg-btn");
      if (!btn) return;
      group.querySelectorAll(".lv-seg-btn").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      var key = group.getAttribute("data-group");
      state.obra[key] = btn.getAttribute("data-value");
      positionSegPill(group);
    });
  });

  els.docChoice.addEventListener("click", function (e) {
    var btn = e.target.closest(".lv-doc-option");
    if (!btn) return;
    selectDoc(btn.getAttribute("data-doc"));
  });

  function positionSegPill(group) {
    var pill = group.querySelector(".lv-seg-pill");
    var btn = group.querySelector(".lv-seg-btn.is-active");
    if (!pill || !btn || btn.offsetWidth === 0) return;
    pill.style.width = btn.offsetWidth + "px";
    pill.style.height = btn.offsetHeight + "px";
    pill.style.transform = "translate(" + btn.offsetLeft + "px, " + btn.offsetTop + "px)";
  }

  function positionSegPills() {
    document.querySelectorAll(".lv-seg").forEach(positionSegPill);
  }

  function initSegPills() {
    document.querySelectorAll(".lv-seg").forEach(function (group) {
      var pill = group.querySelector(".lv-seg-pill");
      if (!pill) return;
      pill.style.transition = "none";
      positionSegPill(group);
      void pill.offsetWidth;
      pill.style.transition = "";
      pill.classList.add("is-shown");
    });
  }

  window.addEventListener("resize", positionSegPills);

  document.getElementById("btnStart").addEventListener("click", function () {
    goToStep(1);
  });

  document.querySelectorAll("[data-nav]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dir = btn.getAttribute("data-nav");
      if (dir === "next") tryNext();
      if (dir === "back") tryBack();
    });
  });

  els.clienteNome.addEventListener("input", function () {
    state.cliente.nome = els.clienteNome.value;
    hideHint(els.clienteHint);
    els.clienteNome.classList.remove("is-invalid");
  });

  document.getElementById("formObra").addEventListener("submit", function (e) {
    e.preventDefault();
    tryNext();
  });

  document.addEventListener("mouseup", function (e) {
    var btn = e.target.closest("button");
    if (btn && document.activeElement === btn) btn.blur();
  });

  /* ---------- PDF ---------- */

  function buildPdfPayload() {
    var totals = computeTotals();
    var units = flattenUnits();
    var payload = {
      generatedAt: new Date().toISOString(),
      cliente: {
        nome: state.cliente.nome || "Cliente sem identificação"
      },
      obra: {
        tipo: state.obra.tipo,
        tensao: state.obra.tensao
      },
      units: units.map(function (item) {
        var u = item.unit;
        return {
          label: item.unitLabel,
          tug: (u.tug || []).map(function (p) {
            return { id: num(p.id), potencia: num(p.potencia) };
          }),
          tue: (u.tue || []).map(function (p) {
            return { id: num(p.id), potencia: num(p.potencia) };
          }),
          iluminacao: (u.iluminacao || []).map(function (p) {
            return { id: num(p.id), potencia: num(p.potencia) };
          }),
          interruptores: num(u.interruptores),
          potencia: unitPower(u),
          comprimento: num(u.comprimento),
          largura: num(u.largura),
          altura: num(u.altura)
        };
      }),
      totals: {
        ambientes: totals.ambientes,
        tug: { pontos: totals.tug.pontos, potencia: totals.tug.potencia },
        tue: { pontos: totals.tue.pontos, potencia: totals.tue.potencia },
        iluminacao: { pontos: totals.iluminacao.pontos, potencia: totals.iluminacao.potencia },
        interruptores: totals.interruptores,
        pontos: totals.tug.pontos + totals.tue.pontos + totals.iluminacao.pontos + totals.interruptores,
        potencia: totals.potencia,
        area: totals.area,
        perimetro: totals.perimetro
      },
      dimensoesAtivadas: state.dimensionamento.dimsEnabled,
      circuits: CIRCUIT_DEFS.map(function (def) {
        var c = state.dimensionamento.circuits[def.key];
        var p = {
          key: def.key,
          label: def.label,
          badge: def.badge,
          potencia: num(c.potencia),
          distancia: num(c.distancia)
        };
        if (c.result && c.result.ok) {
          var condutores = conductorCountFor(c.result);
          p.resultado = {
            corrente: c.result.ib,
            disjuntor: c.result.breaker,
            secao: c.result.section,
            quedaTensao: c.result.dropPct,
            status: c.result.status.text,
            condutores: condutores,
            metragem: Math.round(condutores * num(c.distancia) * 10) / 10
          };
        }
        return p;
      })
    };

    if (state.docType === "materials" && materialsState.list) {
      payload.includeMaterials = true;
      payload.materials = materialsState.list.items.map(function (item) {
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          unit: item.unit,
          category: item.category,
          categoryName: item.categoryName,
          quantity: item.quantity,
          estimated: item.estimated
        };
      });
    }

    return payload;
  }

  function generatePdf() {
    if (!window.DimenVoltReport) {
      return Promise.reject(new Error("Infraestrutura de PDF indisponível."));
    }

    var includeMaterials = state.docType === "materials";

    return Promise.resolve()
      .then(function () {
        if (!includeMaterials) return;
        return ensureMaterialsList();
      })
      .then(function () {
        var payload = buildPdfPayload();
        var safeName = (state.cliente.nome || "levantamento")
          .replace(/[^\w\-]+/g, "_")
          .slice(0, 40);
        var suffix = includeMaterials ? "-Materiais" : "";
        return window.DimenVoltReport.download(
          "/api/report/levantamento",
          payload,
          "DimenVolt-Studio-Levantamento" + suffix + "-" + safeName + ".pdf"
        );
      });
  }

  els.btnPdf.addEventListener("click", function () {
    els.btnPdf.disabled = true;
    els.btnPdf.classList.add("is-loading");
    els.btnPdf.classList.remove("is-ok");
    var btnPdfLabel = els.btnPdf.querySelector("b");
    btnPdfLabel.textContent = "↓ PDF";
    els.pdfStatus.classList.remove("is-ok", "is-error");
    els.pdfStatus.textContent =
      state.docType === "materials"
        ? "Gerando relatório com materiais…"
        : "Gerando relatório…";
    generatePdf()
      .then(function () {
        els.pdfStatus.classList.add("is-ok");
        els.pdfStatus.textContent = "PDF gerado com sucesso.";
        els.btnPdf.classList.add("is-ok");
        btnPdfLabel.textContent = "✓ PDF";
      })
      .catch(function (err) {
        console.error(err);
        els.pdfStatus.classList.add("is-error");
        els.pdfStatus.textContent =
          (err && err.message) || "Falha ao gerar o PDF.";
      })
      .finally(function () {
        els.btnPdf.disabled = false;
        els.btnPdf.classList.remove("is-loading");
      });
  });

  updateProgress(0);
})();
