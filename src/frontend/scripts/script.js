(function() {
  'use strict';

  var engine = window.DimenVoltMotor;

  var advancedToggle = document.getElementById('advanced-toggle');
  var advancedSection = document.getElementById('advanced-section');

  if (advancedToggle && advancedSection) {
    advancedToggle.addEventListener('click', function() {
      var isOpen = advancedSection.classList.contains('visible');
      if (isOpen) {
        advancedSection.classList.remove('visible');
        advancedToggle.classList.remove('open');
      } else {
        advancedSection.classList.add('visible');
        advancedToggle.classList.add('open');
      }
    });
  }

  var powerFactorSelect = document.getElementById('powerFactorSelect');

  function getUserPowerFactor() {
    if (powerFactorSelect) {
      var val = parseFloat(powerFactorSelect.value);
      if (!isNaN(val) && val > 0 && val <= 1) return val;
    }
    return 0.92;
  }

  class Particle {
    constructor(baseX, baseY, baseZ, size) {
      this.baseX = baseX;
      this.baseY = baseY;
      this.baseZ = baseZ;
      this.x = baseX;
      this.y = baseY;
      this.z = baseZ;
      this.size = size;
    }
    reset() {
      this.x = this.baseX;
      this.y = this.baseY;
      this.z = this.baseZ;
    }
  }

  class Camera {
    constructor() {
      this.z = 0;
      this.fov = 60;
      this.focalLength = 1.0 / Math.tan((this.fov * 0.5) * Math.PI / 180.0);
      this.near = 0.1;
    }
    project(px, py, pz, sw, sh) {
      var dz = pz - this.z;
      if (dz < this.near) return null;
      var scale = this.focalLength / dz;
      return {
        x: (px - 0) * scale * (sw / 2) + sw / 2,
        y: -py * scale * (sh / 2) + sh / 2,
        z: dz,
        scale: scale
      };
    }
  }

  var form = document.getElementById('calc-form');
  var resultContainer = document.getElementById('result-container');
  var calcReport = document.getElementById('calculation-report');
  var reportAlternative = document.getElementById('report-alternative');
  var navLinks = document.querySelectorAll('.nav-links a');
  var menuToggle = document.getElementById('menu-toggle');
  var navLinksContainer = document.getElementById('nav-links');
  var voltageInput = document.getElementById('voltage');
  var powerInput = document.getElementById('power');
  var lengthInput = document.getElementById('length');
  var connectionTypeSelect = document.getElementById('connectionType');
  var circuitTypeSelect = document.getElementById('circuitType');
  var installMethodSelect = document.getElementById('installMethod');
  var safetyMarginSelect = document.getElementById('safetyMargin');
  var materialSelect = document.getElementById('material');
  var ambientConditionSelect = document.getElementById('ambientCondition');
  var groupedCircuitsInput = document.getElementById('groupedCircuits');
  var loadedConductorsSelect = document.getElementById('loadedConductors');
  var maxDropInput = document.getElementById('maxDrop');
  var powerErrorEl = document.getElementById('power-error');
  var lengthErrorEl = document.getElementById('length-error');

  var allInputs = [voltageInput, powerInput, lengthInput, connectionTypeSelect, circuitTypeSelect, installMethodSelect, safetyMarginSelect, materialSelect, ambientConditionSelect, groupedCircuitsInput, loadedConductorsSelect, maxDropInput];
  if (powerFactorSelect) allInputs.push(powerFactorSelect);

  function clearFieldErrors() {
    if (powerErrorEl) powerErrorEl.classList.remove('visible');
    if (lengthErrorEl) lengthErrorEl.classList.remove('visible');
    if (powerInput) powerInput.classList.remove('error');
    if (lengthInput) lengthInput.classList.remove('error');
  }

  function showFieldError(inputEl, errorEl, message) {
    if (inputEl) inputEl.classList.add('error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function hideResults() {
    resultContainer.style.display = 'none';
    calcReport.style.display = 'none';
    reportAlternative.style.display = 'none';
    document.getElementById('res-current').textContent = '0';
    document.getElementById('res-cable').textContent = '--';
    document.getElementById('res-breaker').textContent = '--';
    document.getElementById('res-ampacity').textContent = '0';
    document.getElementById('res-drop-v').textContent = '0';
    document.getElementById('res-drop-pct').textContent = '0';
    document.getElementById('res-factors').textContent = '--';
    document.getElementById('res-status').textContent = '--';
    document.getElementById('safety-message').innerHTML = '';
  }

  function performCalculation(e) {
    if (e) e.preventDefault();
    if (!engine.isReady()) {
      alert('Bases de dados ainda estão carregando. Aguarde.');
      return;
    }

    clearFieldErrors();

    var powerValue = powerInput.value.trim();
    var lengthValue = lengthInput.value.trim();
    var hasError = false;

    if (!powerValue || isNaN(parseFloat(powerValue)) || parseFloat(powerValue) <= 0) {
      showFieldError(powerInput, powerErrorEl, 'Informe a potência do equipamento.');
      hasError = true;
    }

    if (!lengthValue || isNaN(parseFloat(lengthValue)) || parseFloat(lengthValue) <= 0) {
      showFieldError(lengthInput, lengthErrorEl, 'Informe o comprimento do cabo.');
      hasError = true;
    }

    if (hasError) {
      hideResults();
      return;
    }

    var mat = {
      potencia: parseFloat(powerValue),
      tensao: parseFloat(voltageInput.value),
      comprimento: parseFloat(lengthValue),
      tipoLigacao: connectionTypeSelect.value,
      tipoCircuito: circuitTypeSelect.value,
      metodoInstalacao: installMethodSelect.value,
      margem: safetyMarginSelect.value,
      material: materialSelect.value,
      condicaoAmbiente: ambientConditionSelect.value,
      circuitosAgrupados: parseInt(groupedCircuitsInput.value) || 1,
      condutoresCarregados: parseInt(loadedConductorsSelect.value) || 2,
      quedaTensaoMax: parseFloat(maxDropInput.value),
      fatorPotencia: getUserPowerFactor()
    };

    var result = engine.dimensionar(mat);
    if (!result.ok) {
      hideResults();
      return;
    }

    renderResult(result);
  }

  function renderResult(result) {
    var Ib = result.ib;
    var finalSection = result.section;
    var finalCorrectedAmp = result.correctedAmpacity;
    var vDrop = result.dropVolts;
    var dropPct = result.dropPct;
    var ft = result.ft;
    var fg = result.fg;
    var fc = result.fc;
    var ftotal = result.ftotal;
    var thermalEval = result.thermalEval;
    var alternativeSection = result.alternativeSection;
    var breaker = result.breaker;
    var statusText = result.status.text;
    var statusColor = result.status.color;
    var statusClass = result.status.class;
    var phaseConductorsText = result.texts.phase;
    var neutralText = result.texts.neutral;
    var peText = result.texts.pe;
    var circuitTypeLabel = result.texts.circuitTypeLabel;
    var connLabel = result.texts.connLabel;
    var reasonText = result.reason;

    document.getElementById('res-current').textContent = Ib.toFixed(2) + ' A';
    document.getElementById('res-cable').textContent = phaseConductorsText + ' [' + circuitTypeLabel + '|' + connLabel.split(' ')[0] + ']';
    document.getElementById('res-breaker').textContent = breaker + ' A (Curva C)';
    document.getElementById('res-ampacity').textContent = finalCorrectedAmp.toFixed(2) + ' A';
    document.getElementById('res-drop-v').textContent = vDrop.toFixed(2) + ' V';
    document.getElementById('res-drop-pct').textContent = dropPct.toFixed(2) + ' %';
    document.getElementById('res-factors').textContent = 'Temp: ' + ft.toFixed(2) + ' | Agrup: ' + fg.toFixed(2) + ' | Cond: ' + fc.toFixed(2) + ' (Total: ' + ftotal.toFixed(2) + ')';

    var st = document.getElementById('res-status');
    st.textContent = statusText;
    st.style.color = statusColor;

    var msg = document.getElementById('safety-message');
    if (statusClass === 'safe') {
      msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + thermalEval.message;
      msg.className = 'safety-message safe';
    } else {
      msg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + thermalEval.message;
      msg.className = 'safety-message warning';
    }

    document.getElementById('report-connection-type').textContent = connLabel;
    document.getElementById('report-phase-conductors').textContent = phaseConductorsText;
    document.getElementById('report-neutral').textContent = neutralText;
    document.getElementById('report-pe').textContent = peText;
    document.getElementById('report-ib').textContent = Ib.toFixed(2) + ' A';
    document.getElementById('report-breaker').textContent = breaker + ' A (Curva C)';
    document.getElementById('report-iz').textContent = finalCorrectedAmp.toFixed(2) + ' A';
    document.getElementById('report-vd').textContent = dropPct.toFixed(2) + '% (' + vDrop.toFixed(2) + ' V)';
    document.getElementById('report-thermal-margin').textContent = thermalEval.marginPercent.toFixed(1) + '%';
    document.getElementById('report-status-text').textContent = statusText;
    document.getElementById('report-status-text').style.color = statusColor;
    document.getElementById('report-reason-text').textContent = reasonText;

    if (alternativeSection && (thermalEval.level === 'warning' || thermalEval.level === 'attention')) {
      reportAlternative.style.display = 'block';
      document.getElementById('report-alternative-text').textContent = 'Recomendação técnica: Considere utilizar ' + alternativeSection + ' mm² para obter maior margem de segurança térmica e flexibilidade para expansões futuras. O cabo atual de ' + finalSection + ' mm² atende aos critérios mínimos da NBR 5410, mas opera com margem reduzida (Ib = ' + Ib.toFixed(1) + 'A, Iz = ' + finalCorrectedAmp.toFixed(1) + 'A, margem = ' + thermalEval.marginPercent.toFixed(1) + '%).';
    } else {
      reportAlternative.style.display = 'none';
    }

    calcReport.style.display = 'block';
    resultContainer.style.display = 'block';
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  menuToggle.addEventListener('click', function() {
    navLinksContainer.classList.toggle('active');
  });

  navLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      navLinksContainer.classList.remove('active');
      navLinks.forEach(function(l) { l.classList.remove('active'); });
      link.classList.add('active');
    });
  });

  window.addEventListener('scroll', function() {
    var sy = window.pageYOffset;
    document.querySelectorAll('section[id]').forEach(function(sec) {
      var top = sec.offsetTop - 100;
      var h = sec.offsetHeight;
      var id = sec.getAttribute('id');
      if (sy > top && sy <= top + h) {
        navLinks.forEach(function(l) {
          l.classList.remove('active');
          if (l.getAttribute('href') === '#' + id) l.classList.add('active');
        });
      }
    });
  });

  allInputs.forEach(function(inp) {
    inp.addEventListener('input', function() {
      hideResults();
      clearFieldErrors();
    });
    inp.addEventListener('change', function() {
      hideResults();
      clearFieldErrors();
    });
  });

  if (powerInput) {
    powerInput.addEventListener('input', function() {
      if (powerInput.value.trim() && parseFloat(powerInput.value) > 0) {
        powerInput.classList.remove('error');
        if (powerErrorEl) powerErrorEl.classList.remove('visible');
      }
    });
  }

  if (lengthInput) {
    lengthInput.addEventListener('input', function() {
      if (lengthInput.value.trim() && parseFloat(lengthInput.value) > 0) {
        lengthInput.classList.remove('error');
        if (lengthErrorEl) lengthErrorEl.classList.remove('visible');
      }
    });
  }

  form.addEventListener('submit', performCalculation);

  function resetState() {
    voltageInput.value = 220;
    powerInput.value = '';
    lengthInput.value = '';
    connectionTypeSelect.value = 'phase-neutral';
    circuitTypeSelect.value = 'tug';
    installMethodSelect.value = 'B1';
    safetyMarginSelect.value = 'recommended';
    materialSelect.value = 'copper';
    ambientConditionSelect.value = 'normal';
    groupedCircuitsInput.value = 1;
    loadedConductorsSelect.value = 2;
    maxDropInput.value = 4;
    if (powerFactorSelect) powerFactorSelect.value = '1.00';
    hideResults();
    clearFieldErrors();
  }

  /* Boot: o overlay preto de 0,5s é controlado só por CSS (#boot-black);
     aqui apenas carregamos a base de dados por trás da cortina.
     IMPORTANTE: body.loaded libera o formulário no CSS
     (body:not(.loaded) .workbench-grid = opacity 0) — nunca depender
     de um passo acima falhar. */
  async function initApp() {
    try {
      await engine.load();
      resetState();
    } catch (err) {
      console.warn('Boot com dados incompletos: ', err);
    } finally {
      document.body.classList.add('loaded');
    }
  }

  initApp();

})();
