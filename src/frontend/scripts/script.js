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

  class SpiralAnimation {
    constructor(canvas, textElement, onComplete) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.textElement = textElement;
      this.onComplete = onComplete;
      this.particles = [];
      this.camera = new Camera();
      this.animationId = null;
      this.startTime = null;
      this.isFinished = false;
      this.fadeOutStart = null;
      this.holdStart = null;
      this.textOpacity = 0;
      this.animDuration = 4000;
      this.fadeOutDuration = 400;
      this.holdDuration = 150;
      this.textFadeDelay = 1000;
      this.textFadeDuration = 600;
      this.spiralLoops = 5;
      this.spiralRadius = 4.5;
      this.spiralHeight = 14.0;
      this.particleCount = 2000;
      this.baseSize = 2.0;
      this.sizeVar = 0.8;
      this.initParticles();
      this.resize();
      window.addEventListener('resize', this.resize.bind(this));
    }

    initParticles() {
      for (var i = 0; i < this.particleCount; i++) {
        var t = i / (this.particleCount - 1);
        var angle = t * Math.PI * 2 * this.spiralLoops;
        var radiusVar = 0.3 * Math.sin(t * 30) + 0.2;
        var radius = this.spiralRadius * (0.7 + t * 0.3) + (Math.random() - 0.5) * radiusVar;
        var x = Math.cos(angle) * radius;
        var y = Math.sin(angle) * radius;
        var z = -t * this.spiralHeight + (Math.random() - 0.5) * 0.8;
        var size = this.baseSize + (Math.random() - 0.5) * this.sizeVar;
        this.particles.push(new Particle(x, y, z, Math.max(0.6, size)));
      }
      this.camera.z = 2.5;
      this.initialZ = this.camera.z;
      this.finalZ = -this.spiralHeight - 2.0;
    }

    resize() {
      var dpr = window.devicePixelRatio || 1;
      var dw = window.innerWidth;
      var dh = window.innerHeight;
      this.canvas.width = dw * dpr;
      this.canvas.height = dh * dpr;
      this.canvas.style.width = dw + 'px';
      this.canvas.style.height = dh + 'px';
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.dw = dw;
      this.dh = dh;
    }

    start() {
      if (this.animationId) return;
      this.startTime = performance.now();
      this.holdStart = null;
      this.fadeOutStart = null;
      this.isFinished = false;
      this.textOpacity = 0;
      this.textElement.style.opacity = '0';
      this.particles.forEach(function(p) { p.reset(); });
      this.camera.z = this.initialZ;
      this.animate(performance.now());
    }

    animate(timestamp) {
      if (this.isFinished) return;
      var elapsed = timestamp - this.startTime;
      var self = this;

      if (elapsed < this.animDuration) {
        this.update(elapsed / this.animDuration);
      } else if (!this.holdStart) {
        this.holdStart = timestamp;
        this.update(1.0);
      } else if (elapsed < this.animDuration + this.holdDuration + this.fadeOutDuration) {
        if (!this.fadeOutStart) this.fadeOutStart = timestamp;
        var fe = timestamp - this.fadeOutStart;
        var fp = Math.min(1.0, fe / this.fadeOutDuration);
        var ef = this.easeInOutQuad(fp);
        var co = 1.0 - ef;
        this.ctx.clearRect(0, 0, this.dw, this.dh);
        if (co > 0.01) {
          this.ctx.globalAlpha = co;
          this.render(1.0);
          this.ctx.globalAlpha = 1.0;
        }
        this.textElement.style.opacity = Math.max(0, this.textOpacity - ef);
      } else {
        this.finish();
        return;
      }

      if (elapsed < this.animDuration + this.holdDuration) {
        this.updateText(elapsed);
      }

      this.animationId = requestAnimationFrame(function(t) { self.animate(t); });
    }

    update(progress) {
      var ep = this.easeInOutCubic(progress);
      this.camera.z = this.initialZ + (this.finalZ - this.initialZ) * ep;
      var ef = 1.0 + progress * 0.5;
      this.particles.forEach(function(p) {
        p.x = p.baseX * ef;
        p.y = p.baseY * ef;
      });
      this.ctx.clearRect(0, 0, this.dw, this.dh);
      this.ctx.globalAlpha = 1.0;
      this.render(progress);
    }

    render(progress) {
      var ctx = this.ctx;
      var cam = this.camera;
      var w = this.dw;
      var h = this.dh;
      var projected = [];

      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        var proj = cam.project(p.x, p.y, p.z, w, h);
        if (proj) {
          projected.push({
            x: proj.x,
            y: proj.y,
            z: proj.z,
            size: p.size * proj.scale * 0.9,
            origSize: p.size
          });
        }
      }

      projected.sort(function(a, b) { return b.z - a.z; });

      for (var j = 0; j < projected.length; j++) {
        var pt = projected[j];
        var df = Math.min(1.0, Math.max(0.2, 1.0 - (pt.z / 18.0)));
        var br = 0.7 + (pt.origSize / (this.baseSize + this.sizeVar)) * 0.3;
        var alpha = df * br * 0.9;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.4, pt.size * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    updateText(elapsed) {
      if (elapsed >= this.textFadeDelay) {
        var fp = Math.min(1.0, (elapsed - this.textFadeDelay) / this.textFadeDuration);
        var ef = this.easeInOutQuad(fp);
        var bp = 3200;
        var bph = (elapsed - this.textFadeDelay) / bp;
        var br = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(bph * Math.PI * 2));
        this.textOpacity = ef * br;
        this.textElement.style.opacity = this.textOpacity;
      }
    }

    finish() {
      this.isFinished = true;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this.ctx.clearRect(0, 0, this.dw, this.dh);
      this.textElement.style.opacity = '0';

      var overlay = document.getElementById('loading-overlay');
      var mainWrapper = document.getElementById('main-wrapper');

      overlay.style.filter = 'blur(30px)';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';

      mainWrapper.classList.add('blur-in');

      setTimeout(function() {
        mainWrapper.classList.remove('blur-in');
      }, 100);

      setTimeout(function() {
        overlay.style.display = 'none';
        document.body.classList.add('loaded');
        if (this.onComplete) this.onComplete();
      }.bind(this), 1000);
    }

    easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
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

  var canvas = document.getElementById('loading-canvas');
  var textElement = document.getElementById('loading-text');

  async function initApp() {
    await engine.load();
    resetState();
    if (canvas && textElement) {
      var animation = new SpiralAnimation(canvas, textElement, function() {});
      animation.start();
    } else {
      document.getElementById('loading-overlay').style.display = 'none';
      document.body.classList.add('loaded');
    }
  }

  initApp();

})();
