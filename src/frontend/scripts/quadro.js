(function () {
  "use strict";

  var STEP_LABELS = [
    "",
    "Etapa 1 · Dados do quadro",
    "Etapa 2 · Circuitos",
    "Etapa 3 · Revisão e PDF"
  ];

  var TIPOS = [
    "Iluminação",
    "TUG",
    "TUE",
    "Chuveiro",
    "Ar-condicionado",
    "Forno",
    "Outro"
  ];

  var FASES = ["L1", "L2", "L3", "N/A"];

  var SISTEMA_FASES = {
    "Monofásico": ["L1"],
    "Bifásico": ["L1", "L2"],
    "Trifásico": ["L1", "L2", "L3"]
  };

  function tensaoVolts(tensao) {
    return parseInt(String(tensao).replace("V", ""), 10) || 127;
  }

  function blankCircuit() {
    return {
      id: "",
      descricao: "",
      tipo: "Iluminação",
      potencia: 0,
      corrente: 0,
      disjuntor: 0,
      fase: "L1"
    };
  }

  var state = {
    step: 0,
    quadro: {
      identificacao: "",
      tensao: "127V",
      sistema: "Monofásico"
    },
    circuits: [],
    editingIndex: -1
  };

  var els = {
    progress: document.getElementById("qdProgress"),
    progressFill: document.getElementById("qdProgressFill"),
    progressLabel: document.getElementById("qdProgressLabel"),
    identificacao: document.getElementById("qdIdentificacao"),
    identificacaoHint: document.getElementById("qdIdentificacaoHint"),
    circuitsRoot: document.getElementById("circuitsRoot"),
    circuitosHint: document.getElementById("circuitosHint"),
    formCircuito: document.getElementById("formCircuito"),
    circId: document.getElementById("circId"),
    circDescricao: document.getElementById("circDescricao"),
    circTipo: document.getElementById("circTipo"),
    circPotencia: document.getElementById("circPotencia"),
    circCorrente: document.getElementById("circCorrente"),
    circCorrenteSub: document.getElementById("circCorrenteSub"),
    circDisjuntor: document.getElementById("circDisjuntor"),
    btnAddCircuit: document.getElementById("btnAddCircuit"),
    btnCancelEdit: document.getElementById("btnCancelEdit"),
    qdVisualRoot: document.getElementById("qdVisualRoot"),
    qdSummaryRoot: document.getElementById("qdSummaryRoot"),
    qdBalanceRoot: document.getElementById("qdBalanceRoot"),
    qdTableRoot: document.getElementById("qdTableRoot"),
    pdfStatus: document.getElementById("pdfStatus"),
    btnPdf: document.getElementById("btnPdf")
  };

  function num(value) {
    var n = parseFloat(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  function formatCurrent(value) {
    return formatNumber(value, 1) + " A";
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

  /* ---------- toast ---------- */

  var toastEl = null;
  var toastTimer = null;

  function toast(message, type) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "qd-toast";
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
    var pct = ((step - 1) / 2) * 100;
    els.progressFill.style.width = pct + "%";
    els.progressLabel.textContent = STEP_LABELS[step] || "";
    document.querySelectorAll(".qd-progress-node").forEach(function (node) {
      var n = parseInt(node.getAttribute("data-node"), 10);
      node.classList.toggle("is-done", n < step);
      node.classList.toggle("is-current", n === step);
    });
  }

  function goToStep(next) {
    var current = document.querySelector(".qd-panel.is-active");
    var target = document.querySelector('.qd-panel[data-step="' + next + '"]');
    if (!target || next === state.step) return;

    function activate() {
      document.querySelectorAll(".qd-panel").forEach(function (panel) {
        panel.classList.remove("is-active", "is-exit");
        panel.hidden = true;
      });
      target.hidden = false;
      target.classList.add("is-active");
      if (next === 1) initSegPills();
      if (next === 2) {
        renderCircuits();
        initSegPills();
      }
      if (next === 3) renderRevisao();
      state.step = next;
      updateProgress(next);
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

  function validateDados() {
    var id = (els.identificacao.value || "").trim();
    state.quadro.identificacao = id;
    if (!id) {
      els.identificacao.classList.add("is-invalid");
      els.identificacao.focus();
      window.setTimeout(function () {
        els.identificacao.classList.remove("is-invalid");
      }, 400);
      showHint(els.identificacaoHint);
      toast("Informe a identificação do quadro para continuar.", "error");
      return false;
    }
    hideHint(els.identificacaoHint);
    return true;
  }

  function tryNext() {
    if (state.step === 1 && !validateDados()) return;
    if (state.step === 2 && state.circuits.length < 1) {
      showHint(els.circuitosHint);
      toast("Adicione ao menos um circuito para continuar.", "error");
      return;
    }
    hideHint(els.circuitosHint);
    goToStep(state.step + 1);
  }

  function tryBack() {
    if (state.step <= 0) return;
    goToStep(state.step - 1);
  }

  /* ---------- circuit helpers ---------- */

  function circuitCurrent(circuit) {
    if (num(circuit.corrente) > 0) return num(circuit.corrente);
    return num(circuit.potencia) / tensaoVolts(state.quadro.tensao);
  }

  function estimated(circuit) {
    return num(circuit.corrente) <= 0;
  }

  function computeTotals() {
    var potencia = 0;
    var corrente = 0;
    var disjuntores = 0;
    var fasesSet = [];
    state.circuits.forEach(function (c) {
      potencia += num(c.potencia);
      corrente += circuitCurrent(c);
      if (num(c.disjuntor) > 0) disjuntores++;
      if (c.fase && c.fase !== "N/A" && fasesSet.indexOf(c.fase) === -1) {
        fasesSet.push(c.fase);
      }
    });
    fasesSet.sort(function (a, b) {
      return FASES.indexOf(a) - FASES.indexOf(b);
    });
    return {
      circuitos: state.circuits.length,
      potencia: potencia,
      corrente: corrente,
      disjuntores: disjuntores,
      fases: fasesSet
    };
  }

  function computeBalance() {
    var systemFases = SISTEMA_FASES[state.quadro.sistema] || ["L1"];
    var powerByPhase = {};
    var countByPhase = {};
    systemFases.forEach(function (f) {
      powerByPhase[f] = 0;
      countByPhase[f] = 0;
    });
    state.circuits.forEach(function (c) {
      var fase = c.fase;
      if (fase !== "N/A" && powerByPhase[fase] !== undefined) {
        powerByPhase[fase] += num(c.potencia);
        countByPhase[fase]++;
      }
    });

    var phases = systemFases.map(function (f) {
      return { fase: f, potencia: powerByPhase[f], circuitos: countByPhase[f] };
    });

    var used = phases.filter(function (p) { return p.circuitos > 0; });
    var balanced = systemFases.length === 1;

    if (used.length === systemFases.length) {
      var powers = used.map(function (p) { return p.potencia; });
      var maxP = Math.max.apply(null, powers);
      var minP = Math.min.apply(null, powers);
      balanced = maxP <= minP * 1.5;
    } else {
      balanced = false;
    }

    return { status: balanced ? "balanced" : "unbalanced", phases: phases };
  }

  /* ---------- circuit form ---------- */

  function readCircuitForm() {
    return {
      id: (els.circId.value || "").trim(),
      descricao: (els.circDescricao.value || "").trim(),
      tipo: els.circTipo.value || "Iluminação",
      potencia: num(els.circPotencia.value),
      corrente: num(els.circCorrente.value),
      disjuntor: num(els.circDisjuntor.value),
      fase: currentFase()
    };
  }

  function currentFase() {
    var active = document.querySelector('.qd-seg[data-group="fase"] .qd-seg-btn.is-active');
    return active ? active.getAttribute("data-value") : "L1";
  }

  function validateCircuit(circuit) {
    if (!circuit.id) {
      toast("Informe a identificação do circuito (ex.: C1).", "error");
      els.circId.classList.add("is-invalid");
      els.circId.focus();
      window.setTimeout(function () { els.circId.classList.remove("is-invalid"); }, 400);
      return false;
    }
    if (!circuit.descricao) {
      toast("Informe a descrição do circuito (ex.: Iluminação).", "error");
      els.circDescricao.classList.add("is-invalid");
      els.circDescricao.focus();
      window.setTimeout(function () { els.circDescricao.classList.remove("is-invalid"); }, 400);
      return false;
    }
    if (circuit.potencia <= 0) {
      toast("Informe a potência do circuito em watts.", "error");
      els.circPotencia.classList.add("is-invalid");
      els.circPotencia.focus();
      window.setTimeout(function () { els.circPotencia.classList.remove("is-invalid"); }, 400);
      return false;
    }
    return true;
  }

  function addCircuit() {
    var circuit = readCircuitForm();
    if (!validateCircuit(circuit)) return;
    if (state.editingIndex >= 0) {
      state.circuits[state.editingIndex] = circuit;
      state.editingIndex = -1;
      toast("Circuito atualizado.");
      resetCircuitForm();
    } else {
      state.circuits.push(circuit);
      toast("Circuito adicionado.");
    }
    renderCircuits();
  }

  function resetCircuitForm() {
    els.formCircuito.reset();
    els.circId.value = "";
    els.circDescricao.value = "";
    els.circTipo.value = "Iluminação";
    els.circPotencia.value = "";
    els.circCorrente.value = "";
    els.circDisjuntor.value = "";
    setSeg("fase", "L1");
    els.btnAddCircuit.textContent = "+ Adicionar circuito";
    els.btnCancelEdit.hidden = true;
    els.circCorrenteSub.textContent = "Vazio = estimativa automática";
    els.circCorrenteSub.classList.remove("is-est");
    els.circId.focus();
  }

  function editCircuit(index) {
    var circuit = state.circuits[index];
    if (!circuit) return;
    state.editingIndex = index;
    els.circId.value = circuit.id;
    els.circDescricao.value = circuit.descricao;
    els.circTipo.value = circuit.tipo;
    els.circPotencia.value = circuit.potencia ? String(circuit.potencia) : "";
    els.circCorrente.value = circuit.corrente ? String(circuit.corrente) : "";
    els.circDisjuntor.value = circuit.disjuntor ? String(circuit.disjuntor) : "";
    setSeg("fase", circuit.fase || "L1");
    els.btnAddCircuit.textContent = "Salvar alterações";
    els.btnCancelEdit.hidden = false;
    if (num(circuit.corrente) <= 0) {
      els.circCorrenteSub.textContent = "Estimativa: " + formatCurrent(circuitCurrent(circuit));
      els.circCorrenteSub.classList.add("is-est");
    } else {
      els.circCorrenteSub.textContent = "Valor informado";
      els.circCorrenteSub.classList.remove("is-est");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    state.editingIndex = -1;
    resetCircuitForm();
    toast("Edição cancelada.");
  }

  function removeCircuit(index) {
    state.circuits.splice(index, 1);
    if (state.editingIndex === index) {
      state.editingIndex = -1;
      resetCircuitForm();
    } else if (state.editingIndex > index) {
      state.editingIndex--;
    }
    renderCircuits();
    toast("Circuito removido.");
  }

  /* ---------- renderers ---------- */

  function renderCircuits() {
    if (!state.circuits.length) {
      els.circuitsRoot.innerHTML =
        '<p class="qd-empty">Nenhum circuito adicionado ainda. Use o formulário acima.</p>';
      return;
    }
    els.circuitsRoot.innerHTML =
      '<div class="qd-circuit-list-head"><strong>Circuitos</strong><span>' +
      formatNumber(state.circuits.length) + "</span></div>" +
      '<div class="qd-circuit-list">' +
      state.circuits.map(function (c, i) {
        var isEditing = i === state.editingIndex;
        return (
          '<article class="qd-circuit' + (isEditing ? " is-editing" : "") + '" data-index="' + i + '">' +
            '<div class="qd-circuit-head">' +
              "<strong>" + escapeHtml(c.id || "C?") + "</strong>" +
              "<span>" + escapeHtml(c.tipo) + "</span>" +
            "</div>" +
            "<p>" + (escapeHtml(c.descricao) || "—") + "</p>" +
            '<dl class="qd-circuit-meta">' +
              "<div><dt>Potência</dt><dd>" + formatPower(c.potencia) + "</dd></div>" +
              "<div><dt>Corrente</dt><dd>" + formatCurrent(circuitCurrent(c)) +
                (estimated(c) ? ' <em>est.</em>' : "") + "</dd></div>" +
              "<div><dt>Disjuntor</dt><dd>" + (num(c.disjuntor) > 0 ? formatNumber(c.disjuntor) + " A" : "—") + "</dd></div>" +
              "<div><dt>Fase</dt><dd>" + escapeHtml(c.fase || "N/A") + "</dd></div>" +
            "</dl>" +
            '<div class="qd-circuit-actions-row">' +
              '<button type="button" class="qd-btn-sm" data-action="edit">Editar</button>' +
              '<button type="button" class="qd-btn-sm is-danger" data-action="remove">Remover</button>' +
            "</div>" +
          "</article>"
        );
      }).join("") +
      "</div>";
  }

  function renderRevisao() {
    renderVisual();
    renderSummary();
    renderBalance();
    renderTable();
  }

  function renderVisual() {
    var t = computeTotals();
    var rows = state.circuits.map(function (c, i) {
      return (
        "<tr>" +
          "<td class='qd-vis-pos'>" + String(i + 1).padStart(2, "0") + "</td>" +
          "<td><strong>" + escapeHtml(c.id || "C?") + "</strong><span>" + escapeHtml(c.descricao || c.tipo) + "</span></td>" +
          "<td>" + (num(c.disjuntor) > 0 ? formatNumber(c.disjuntor) + " A" : "—") + "</td>" +
          "<td>" + escapeHtml(c.fase || "N/A") + "</td>" +
        "</tr>"
      );
    }).join("");

    els.qdVisualRoot.innerHTML =
      '<section class="qd-visual">' +
        '<div class="qd-visual-head">' +
          "<span>" + escapeHtml(state.quadro.identificacao || "Quadro") + "</span>" +
          "<b>" + escapeHtml(state.quadro.sistema) + " · " + escapeHtml(state.quadro.tensao) + "</b>" +
        "</div>" +
        '<div class="qd-visual-grid">' +
          "<span>Disj.</span><span>Fase</span>" +
        "</div>" +
        '<div class="qd-visual-body"><table class="qd-visual-table"><tbody>' + rows + "</tbody></table></div>" +
        '<div class="qd-visual-foot"><span>' + formatNumber(t.circuitos) + " circuito(s)</span><span>" + formatPower(t.potencia) + "</span></div>" +
      "</section>";
  }

  function renderSummary() {
    var t = computeTotals();
    els.qdSummaryRoot.innerHTML =
      statHtml("Circuitos", formatNumber(t.circuitos)) +
      statHtml("Potência instalada", formatNumber(t.potencia, 0), "W") +
      statHtml("Corrente estimada", formatNumber(t.corrente, 1), "A") +
      statHtml("Disjuntores", formatNumber(t.disjuntores)) +
      statHtml("Fases utilizadas", t.fases.length ? t.fases.join(" · ") : "—");
  }

  function statHtml(label, value, unit) {
    return (
      '<article class="qd-stat">' +
        "<span>" + escapeHtml(label) + "</span>" +
        "<strong>" + escapeHtml(String(value)) +
          (unit ? "<em>" + escapeHtml(unit) + "</em>" : "") +
        "</strong>" +
      "</article>"
    );
  }

  function renderBalance() {
    var b = computeBalance();
    var maxP = Math.max.apply(null, b.phases.map(function (p) { return p.potencia; }).concat([0]));
    var bars = b.phases.map(function (p) {
      var pct = maxP > 0 ? Math.round((p.potencia / maxP) * 100) : 0;
      return (
        '<div class="qd-bal-row">' +
          '<span class="qd-bal-fase">' + escapeHtml(p.fase) + "</span>" +
          '<span class="qd-bal-track" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
          '<span class="qd-bal-meta">' +
            formatNumber(p.circuitos) + " circuito(s) · " + formatPower(p.potencia) +
          "</span>" +
        "</div>"
      );
    }).join("");

    var note =
      b.status === "balanced"
        ? '<div class="qd-bal-note is-ok"><b>✓</b> Distribuição de cargas equilibrada</div>'
        : '<div class="qd-bal-note is-warn"><b>⚠</b> Distribuição de cargas desequilibrada</div>';

    els.qdBalanceRoot.innerHTML =
      '<section class="qd-balance">' +
        '<header><span>Balanceamento</span><small>por fase</small></header>' +
        '<div class="qd-bal-list">' + bars + "</div>" +
        note +
      "</section>";
  }

  function renderTable() {
    var rows = state.circuits.map(function (c, i) {
      return (
        "<tr data-index='" + i + "'>" +
          "<td>" + escapeHtml(c.id || "C?") + "</td>" +
          "<td>" + escapeHtml(c.descricao || "—") + "</td>" +
          "<td>" + escapeHtml(c.tipo) + "</td>" +
          "<td>" + formatPower(c.potencia) + "</td>" +
          "<td>" + formatCurrent(circuitCurrent(c)) + "</td>" +
          "<td>" + (num(c.disjuntor) > 0 ? formatNumber(c.disjuntor) + " A" : "—") + "</td>" +
          "<td>" + escapeHtml(c.fase || "N/A") + "</td>" +
          "<td class='qd-table-actions'>" +
            '<button type="button" class="qd-btn-sm" data-action="edit">Editar</button>' +
            '<button type="button" class="qd-btn-sm is-danger" data-action="remove">Remover</button>' +
          "</td>" +
        "</tr>"
      );
    }).join("");

    els.qdTableRoot.innerHTML =
      '<section class="qd-table-block">' +
        '<header><span>Lista de circuitos</span></header>' +
        '<div class="qd-table-wrap"><table class="qd-table">' +
          "<thead><tr>" +
            "<th>Circuito</th><th>Descrição</th><th>Tipo</th><th>Potência</th>" +
            "<th>Corrente</th><th>Disjuntor</th><th>Fase</th><th></th>" +
          "</tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table></div>" +
      "</section>";
  }

  /* ---------- segmented controls ---------- */

  function setSeg(group, value) {
    var seg = document.querySelector('.qd-seg[data-group="' + group + '"]');
    if (!seg) return;
    var btn = seg.querySelector('.qd-seg-btn[data-value="' + value + '"]');
    if (!btn) return;
    seg.querySelectorAll(".qd-seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    positionSegPill(seg);
  }

  function positionSegPill(group) {
    var pill = group.querySelector(".qd-seg-pill");
    var btn = group.querySelector(".qd-seg-btn.is-active");
    if (!pill || !btn || btn.offsetWidth === 0) return;
    pill.style.width = btn.offsetWidth + "px";
    pill.style.height = btn.offsetHeight + "px";
    pill.style.transform = "translate(" + btn.offsetLeft + "px, " + btn.offsetTop + "px)";
  }

  function initSegPills() {
    document.querySelectorAll(".qd-seg").forEach(function (group) {
      var pill = group.querySelector(".qd-seg-pill");
      if (!pill) return;
      pill.style.transition = "none";
      positionSegPill(group);
      void pill.offsetWidth;
      pill.style.transition = "";
      pill.classList.add("is-shown");
    });
  }

  window.addEventListener("resize", function () {
    document.querySelectorAll(".qd-seg").forEach(positionSegPill);
  });

  /* ---------- events ---------- */

  els.circuitsRoot.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var article = btn.closest("[data-index]");
    if (!article) return;
    var index = parseInt(article.getAttribute("data-index"), 10);
    var action = btn.getAttribute("data-action");
    if (action === "edit") editCircuit(index);
    if (action === "remove") removeCircuit(index);
  });

  els.qdTableRoot.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var tr = btn.closest("tr");
    if (!tr) return;
    var index = parseInt(tr.getAttribute("data-index"), 10);
    var action = btn.getAttribute("data-action");
    if (action === "edit") {
      editCircuit(index);
      goToStep(2);
    }
    if (action === "remove") removeCircuit(index);
  });

  document.querySelectorAll(".qd-seg").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var btn = e.target.closest(".qd-seg-btn");
      if (!btn) return;
      group.querySelectorAll(".qd-seg-btn").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      positionSegPill(group);
    });
  });

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

  els.identificacao.addEventListener("input", function () {
    state.quadro.identificacao = els.identificacao.value;
    hideHint(els.identificacaoHint);
    els.identificacao.classList.remove("is-invalid");
  });

  document.getElementById("formDados").addEventListener("submit", function (e) {
    e.preventDefault();
    tryNext();
  });

  document.getElementById("formCircuito").addEventListener("submit", function (e) {
    e.preventDefault();
  });

  document.addEventListener("mouseup", function (e) {
    var btn = e.target.closest("button");
    if (btn && document.activeElement === btn) btn.blur();
  });

  els.circPotencia.addEventListener("input", function () {
    var potencia = num(els.circPotencia.value);
    var corrente = num(els.circCorrente.value);
    if (potencia > 0 && corrente <= 0) {
      var est = potencia / tensaoVolts(state.quadro.tensao);
      els.circCorrenteSub.textContent = "Estimativa: " + formatCurrent(est);
      els.circCorrenteSub.classList.add("is-est");
    } else if (corrente > 0) {
      els.circCorrenteSub.textContent = "Valor informado";
      els.circCorrenteSub.classList.remove("is-est");
    } else {
      els.circCorrenteSub.textContent = "Vazio = estimativa automática";
      els.circCorrenteSub.classList.remove("is-est");
    }
  });

  els.circCorrente.addEventListener("input", function () {
    if (num(els.circCorrente.value) > 0) {
      els.circCorrenteSub.textContent = "Valor informado";
      els.circCorrenteSub.classList.remove("is-est");
    } else if (num(els.circPotencia.value) > 0) {
      var est = num(els.circPotencia.value) / tensaoVolts(state.quadro.tensao);
      els.circCorrenteSub.textContent = "Estimativa: " + formatCurrent(est);
      els.circCorrenteSub.classList.add("is-est");
    } else {
      els.circCorrenteSub.textContent = "Vazio = estimativa automática";
      els.circCorrenteSub.classList.remove("is-est");
    }
  });

  els.btnAddCircuit.addEventListener("click", addCircuit);
  els.btnCancelEdit.addEventListener("click", cancelEdit);

  /* ---------- PDF ---------- */

  function buildPdfPayload() {
    var totals = computeTotals();
    var balance = computeBalance();
    return {
      generatedAt: new Date().toISOString(),
      quadro: {
        identificacao: state.quadro.identificacao || "Quadro",
        tensao: state.quadro.tensao,
        sistema: state.quadro.sistema
      },
      circuits: state.circuits.map(function (c) {
        return {
          id: c.id,
          descricao: c.descricao,
          tipo: c.tipo,
          potencia: num(c.potencia),
          corrente: circuitCurrent(c),
          correnteInformada: num(c.corrente),
          estimated: estimated(c),
          disjuntor: num(c.disjuntor),
          fase: c.fase || "N/A"
        };
      }),
      totals: totals,
      balance: balance
    };
  }

  function generatePdf() {
    if (!window.DimenVoltReport) {
      return Promise.reject(new Error("Infraestrutura de PDF indisponível."));
    }
    var payload = buildPdfPayload();
    var safeName = (state.quadro.identificacao || "quadro")
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 40);
    return window.DimenVoltReport.download(
      "/api/report/quadro",
      payload,
      "DimenVolt-Studio-Quadro-" + safeName + ".pdf"
    );
  }

  els.btnPdf.addEventListener("click", function () {
    els.btnPdf.disabled = true;
    els.btnPdf.classList.add("is-loading");
    els.btnPdf.classList.remove("is-ok");
    var btnPdfLabel = els.btnPdf.querySelector("b");
    btnPdfLabel.textContent = "↓ PDF";
    els.pdfStatus.classList.remove("is-ok", "is-error");
    els.pdfStatus.textContent = "Gerando documento…";
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
