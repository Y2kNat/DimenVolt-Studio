(function() {
  'use strict';

  var DB = window.DimenVoltDB = window.DimenVoltDB || {};

  var dbFiles = {
    ampacity: '/data/ampacity.json',
    circuitBreakers: '/data/circuit_breakers.json',
    groupingFactors: '/data/grouping_factors.json',
    loadDatabase: '/data/load_database.json',
    minimumSections: '/data/minimum_sections.json',
    motor: '/data/motor.json',
    settings: '/data/nbr5410_settings.json',
    neutralConductor: '/data/neutral_conductor.json',
    protectiveConductorPE: '/data/protective_conductor_PE.json',
    temperatureCorrection: '/data/temperature_correction.json',
    voltageDrop: '/data/voltage_drop.json'
  };

  var dbReady = false;
  var dbReadyPromise = null;

  async function loadAllDatabases() {
    var keys = Object.keys(dbFiles);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        var resp = await fetch(dbFiles[key]);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        DB[key] = await resp.json();
      } catch (err) {
        console.warn('Falha ao carregar ' + key + ': ' + err.message);
        DB[key] = null;
      }
    }
    dbReady = true;
  }

  function load() {
    if (dbReady) return Promise.resolve();
    if (dbReadyPromise) return dbReadyPromise;
    dbReadyPromise = loadAllDatabases();
    return dbReadyPromise;
  }

  function isReady() {
    return dbReady;
  }

  function num(value, fallback) {
    if (value === null || value === undefined || value === '') {
      return fallback === undefined ? null : fallback;
    }
    var n = parseFloat(value);
    return isNaN(n) ? (fallback === undefined ? null : fallback) : n;
  }

  function getAmpacity(material, insulation, method, section) {
    if (!DB.ampacity) return 0;
    try {
      return DB.ampacity[material][insulation][method][String(section)].current_capacity_A;
    } catch (e) {
      return 0;
    }
  }

  function getTemperatureFactor(temperature, insulation) {
    if (!DB.temperatureCorrection) return 1;
    var table = DB.temperatureCorrection[insulation] || DB.temperatureCorrection['PVC'];
    if (!table) return 1;
    var temps = Object.keys(table).map(Number).sort(function(a, b) { return a - b; });
    for (var i = 0; i < temps.length; i++) {
      if (temperature <= temps[i]) return table[String(temps[i])].factor;
    }
    return table[String(temps[temps.length - 1])].factor;
  }

  function getGroupingFactor(numCircuits) {
    if (!DB.groupingFactors || !DB.groupingFactors.factors) return 1;
    var n = Math.min(Math.max(1, numCircuits), 20);
    var entry = DB.groupingFactors.factors[String(n)];
    return entry ? entry.factor : 1;
  }

  function getLoadedConductorsFactor(n) {
    if (!DB.groupingFactors || !DB.groupingFactors.loaded_conductors) return 1;
    var entry = DB.groupingFactors.loaded_conductors[String(n)];
    return entry ? entry.factor_multiplier : 1;
  }

  function getBreakerList() {
    if (!DB.circuitBreakers || !DB.circuitBreakers.standard_breakers) return [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100];
    return DB.circuitBreakers.standard_breakers.map(function(b) { return b.rated_current_A; });
  }

  function getStandardSections() {
    if (!DB.settings || !DB.settings.standard_cable_sections_mm2) {
      return [1.5, 2.5, 4, 6, 10, 16, 25, 35];
    }
    return DB.settings.standard_cable_sections_mm2;
  }

  function getMinCableSize(circuitType) {
    if (!DB.minimumSections) {
      if (circuitType === 'tue') return 4;
      if (circuitType === 'tug') return 2.5;
      return 1.5;
    }
    if (circuitType === 'tue') return DB.minimumSections.specific_purpose_outlets.phase_conductor_mm2;
    if (circuitType === 'tug') return DB.minimumSections.general_purpose_outlets.phase_conductor_mm2;
    return DB.minimumSections.lighting.phase_conductor_mm2;
  }

  function getPESection(phaseSection) {
    if (!DB.protectiveConductorPE || !DB.protectiveConductorPE.sizing_table) {
      if (phaseSection <= 16) return phaseSection;
      if (phaseSection <= 35) return 16;
      return Math.floor(phaseSection / 2);
    }
    var table = DB.protectiveConductorPE.sizing_table.common_values;
    for (var i = 0; i < table.length; i++) {
      if (table[i].phase_mm2 === phaseSection) return table[i].PE_mm2;
    }
    if (phaseSection <= 16) return phaseSection;
    if (phaseSection <= 35) return 16;
    return Math.floor(phaseSection / 2);
  }

  function getNeutralSection(phaseSection, connectionType) {
    if (connectionType === 'phase-phase') return null;
    if (!DB.neutralConductor || !DB.neutralConductor.common_values) {
      if (connectionType === 'phase-neutral') return phaseSection;
      if (phaseSection > 25) return Math.max(25, Math.floor(phaseSection / 2));
      return phaseSection;
    }
    if (connectionType === 'phase-neutral') return phaseSection;
    var table = DB.neutralConductor.common_values;
    for (var i = 0; i < table.length; i++) {
      if (table[i].phase_mm2 === phaseSection && table[i].application === 'Trifásico balanceado') {
        return table[i].neutral_mm2;
      }
    }
    if (phaseSection > 25) return Math.max(25, Math.floor(phaseSection / 2));
    return phaseSection;
  }

  function getVoltageDropData(material, section) {
    if (!DB.voltageDrop) return { R: 0, X: 0 };
    try {
      var data = DB.voltageDrop[material][String(section)];
      return { R: data.resistance_ohm_per_km, X: data.reactance_ohm_per_km };
    } catch (e) {
      return { R: 0, X: 0 };
    }
  }

  function getDefaultPowerFactor() {
    if (DB.settings && DB.settings.default_power_factor) return DB.settings.default_power_factor;
    return 0.92;
  }

  function getAmbientTemperature(condition) {
    if (condition === 'hot') return 40;
    if (condition === 'veryHot') return 50;
    return 30;
  }

  function calculateVoltageDrop(current, length, material, section, voltage, connectionType, pf) {
    var vdData = getVoltageDropData(material, section);
    var R = (vdData.R * length) / 1000;
    var X = (vdData.X * length) / 1000;
    var sinPhi = Math.sin(Math.acos(pf));
    if (connectionType === 'three-phase') {
      return Math.sqrt(3) * current * (R * pf + X * sinPhi);
    }
    return 2 * current * (R * pf + X * sinPhi);
  }

  function calculateDesignCurrent(power, voltage, connectionType, pf) {
    if (connectionType === 'three-phase') {
      return power / (Math.sqrt(3) * voltage * pf);
    }
    return power / (voltage * pf);
  }

  function selectBreaker(ib, iz) {
    var breakers = getBreakerList();
    for (var i = 0; i < breakers.length; i++) {
      if (breakers[i] >= ib && breakers[i] <= iz) return breakers[i];
    }
    for (var j = breakers.length - 1; j >= 0; j--) {
      if (breakers[j] <= iz) return breakers[j];
    }
    return breakers[0] || 6;
  }

  function getNextStandardSection(currentSection, material) {
    var sections = getStandardSections();
    var idx = sections.indexOf(currentSection);
    if (idx === -1) return currentSection;
    for (var i = idx + 1; i < sections.length; i++) {
      if (getAmpacity(material, 'PVC', 'B1', sections[i]) > 0) return sections[i];
    }
    return currentSection;
  }

  function getSafetyMarginSection(baseSection, material, marginLevel) {
    if (marginLevel === 'minimum') return baseSection;
    if (marginLevel === 'recommended') {
      var next = getNextStandardSection(baseSection, material);
      return next !== baseSection ? next : baseSection;
    }
    if (marginLevel === 'high') {
      var first = getNextStandardSection(baseSection, material);
      if (first === baseSection) return baseSection;
      var second = getNextStandardSection(first, material);
      return second !== first ? second : first;
    }
    return baseSection;
  }

  function evaluateThermalMargin(ib, iz) {
    if (iz <= 0) return { ratio: 1, marginPercent: 0, level: 'error', message: 'Capacidade do cabo inválida' };
    var ratio = ib / iz;
    var marginPercent = ((iz - ib) / iz) * 100;
    if (ratio <= 0.80) {
      return { ratio: ratio, marginPercent: marginPercent, level: 'safe', message: 'Boa margem de segurança entre corrente de projeto e capacidade do cabo.' };
    } else if (ratio <= 0.90) {
      return { ratio: ratio, marginPercent: marginPercent, level: 'attention', message: 'Condutor operando próximo da capacidade máxima. Considere aumentar a seção.' };
    } else if (ratio <= 1.00) {
      return { ratio: ratio, marginPercent: marginPercent, level: 'warning', message: 'Cabo atende à NBR 5410, porém trabalha próximo ao limite térmico.' };
    } else {
      return { ratio: ratio, marginPercent: marginPercent, level: 'error', message: 'Cabo não suporta a corrente de projeto.' };
    }
  }

  function evaluateVoltageDropMargin(vdPercent, maxDrop) {
    if (maxDrop - vdPercent <= 0.2) {
      return { withinLimit: true, lowMargin: true };
    }
    return { withinLimit: true, lowMargin: false };
  }

  function generateReason(mat, selectedSection, ib, iz, vdPercent, maxDrop, minSize, rejectedSection, connectionType, breaker, alternativeSection, marginLevel, thermalEval) {
    var parts = [];
    var matLabel = mat === 'copper' ? 'Cobre' : 'Alumínio';
    parts.push(selectedSection + ' mm² ' + matLabel + ' selecionado conforme NBR 5410');
    parts.push('Ib (' + ib.toFixed(1) + 'A) ≤ In (' + breaker + 'A) ≤ Iz (' + iz.toFixed(1) + 'A)');
    if (vdPercent <= maxDrop) {
      if (maxDrop - vdPercent <= 0.2) {
        parts.push('Queda de tensão ' + vdPercent.toFixed(2) + '% dentro do limite máximo (' + maxDrop + '%), porém com margem muito reduzida');
      } else {
        parts.push('Queda de tensão ' + vdPercent.toFixed(2) + '% ≤ ' + maxDrop + '%');
      }
    }
    if (minSize > 0 && selectedSection >= minSize) {
      parts.push('Seção ≥ mínima exigida (' + minSize + ' mm²)');
    }
    if (rejectedSection && rejectedSection < selectedSection) {
      parts.push(rejectedSection + ' mm² rejeitada por não atender todos os critérios simultaneamente');
    }
    if (marginLevel === 'recommended' || marginLevel === 'high') {
      parts.push('Margem de segurança aplicada: seção aumentada conforme preferência do usuário');
    }
    if (thermalEval) {
      parts.push('Margem térmica: ' + thermalEval.marginPercent.toFixed(1) + '% (' + thermalEval.message + ')');
    }
    if (alternativeSection && alternativeSection > selectedSection) {
      parts.push('Recomenda-se avaliar ' + alternativeSection + ' mm² para maior margem de segurança e flexibilidade futura');
    }
    return parts.join('; ') + '.';
  }

  function getMotorData(cv) {
    if (!DB.motor || !DB.motor.standard_motors) return null;
    var list = DB.motor.standard_motors;
    for (var i = 0; i < list.length; i++) {
      if (list[i].cv === cv) return list[i];
    }
    return null;
  }

  function normalizeParams(mat) {
    var hasCargas = Array.isArray(mat && mat.cargas) && mat.cargas.length > 0;
    var motorCv = num(mat && mat.motorCv);

    var r = {
      potencia: num(mat && mat.potencia),
      tensao: num(mat && mat.tensao),
      comprimento: num(mat && mat.comprimento),
      fatorPotencia: num(mat && mat.fatorPotencia),
      tipoLigacao: (mat && mat.tipoLigacao) || 'fase-neutro',
      tipoCircuito: (mat && mat.tipoCircuito) || 'tug',
      metodoInstalacao: (mat && mat.metodoInstalacao) || 'B1',
      material: (mat && mat.material) || 'copper',
      condicaoAmbiente: (mat && mat.condicaoAmbiente) || 'normal',
      circuitosAgrupados: Math.max(1, num(mat && mat.circuitosAgrupados, 1)),
      condutoresCarregados: Math.max(2, num(mat && mat.condutoresCarregados, 2)),
      margem: (mat && mat.margem) || 'recommended',
      quedaTensaoMax: num(mat && mat.quedaTensaoMax, 4),
      motorCv: motorCv,
      simultaneidade: num(mat && mat.simultaneidade, 1)
    };

    if (!r.comprimento || r.comprimento <= 0) {
      return { ok: false, error: 'Comprimento do cabo inválido' };
    }
    if (r.quedaTensaoMax <= 0) {
      return { ok: false, error: 'Queda de tensão máxima inválida' };
    }
    if (motorCv != null) {
      if (!r.tensao || r.tensao <= 0) {
        return { ok: false, error: 'Tensão inválida para o motor' };
      }
      if (r.tipoLigacao !== 'three-phase') {
        return { ok: false, error: 'Motor exige ligação trifásica' };
      }
    } else if (hasCargas) {
      for (var i = 0; i < mat.cargas.length; i++) {
        var c = mat.cargas[i];
        var cPot = num(c && c.potencia);
        var cV = num(c && c.tensao);
        if (!cPot || cPot <= 0 || !cV || cV <= 0) {
          return { ok: false, error: 'Carga ' + (i + 1) + ' com potência ou tensão inválida' };
        }
      }
    } else {
      if (!r.potencia || r.potencia <= 0) {
        return { ok: false, error: 'Potência inválida' };
      }
      if (!r.tensao || r.tensao <= 0) {
        return { ok: false, error: 'Tensão inválida' };
      }
    }

    return { ok: true, params: r };
  }

  function computeCore(r, Ib, refVoltage, refConnection, refPf) {
    var insulation = 'PVC';
    var Ta = getAmbientTemperature(r.condicaoAmbiente);
    var ft = getTemperatureFactor(Ta, insulation);
    var fg = getGroupingFactor(r.circuitosAgrupados);
    var fc = getLoadedConductorsFactor(r.condutoresCarregados);
    var ftotal = ft * fg * fc;
    var minSize = getMinCableSize(r.tipoCircuito);
    var mat = r.material;
    var sections = getStandardSections();

    var selSizeByAmpacity = null;
    var baseAmpByAmpacity = 0;
    var correctedAmpByAmpacity = 0;

    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (s < minSize) continue;
      var ba = getAmpacity(mat, insulation, r.metodoInstalacao, s);
      if (ba === 0) continue;
      var correctedAmp = ba * ftotal;
      if (correctedAmp >= Ib) {
        selSizeByAmpacity = s;
        baseAmpByAmpacity = ba;
        correctedAmpByAmpacity = correctedAmp;
        break;
      }
    }

    if (!selSizeByAmpacity) {
      selSizeByAmpacity = sections[sections.length - 1];
      baseAmpByAmpacity = getAmpacity(mat, insulation, r.metodoInstalacao, selSizeByAmpacity);
      correctedAmpByAmpacity = baseAmpByAmpacity * ftotal;
    }

    var finalSection = selSizeByAmpacity;
    var finalBaseAmp = baseAmpByAmpacity;
    var finalCorrectedAmp = correctedAmpByAmpacity;
    var rejectedSection = null;

    var startIdx = sections.indexOf(selSizeByAmpacity);
    for (var k = startIdx; k < sections.length; k++) {
      var testSection = sections[k];
      var testBaseAmp = getAmpacity(mat, insulation, r.metodoInstalacao, testSection);
      if (testBaseAmp === 0) continue;
      var testCorrectedAmp = testBaseAmp * ftotal;
      var vd = calculateVoltageDrop(Ib, r.comprimento, mat, testSection, refVoltage, refConnection, refPf);
      var dropPct = (vd / refVoltage) * 100;
      if (testCorrectedAmp >= Ib && dropPct <= r.quedaTensaoMax) {
        finalSection = testSection;
        finalBaseAmp = testBaseAmp;
        finalCorrectedAmp = testCorrectedAmp;
        break;
      }
      if (testSection < sections[sections.length - 1] && (testCorrectedAmp < Ib || dropPct > r.quedaTensaoMax)) {
        rejectedSection = testSection;
      }
    }

    if (finalSection === selSizeByAmpacity) {
      var vdFirst = calculateVoltageDrop(Ib, r.comprimento, mat, finalSection, refVoltage, refConnection, refPf);
      var dropFirst = (vdFirst / refVoltage) * 100;
      if (dropFirst > r.quedaTensaoMax || finalCorrectedAmp < Ib) {
        for (var m = sections.indexOf(finalSection) + 1; m < sections.length; m++) {
          var nextSection = sections[m];
          var nextBaseAmp = getAmpacity(mat, insulation, r.metodoInstalacao, nextSection);
          if (nextBaseAmp === 0) continue;
          var nextCorrectedAmp = nextBaseAmp * ftotal;
          var vdNext = calculateVoltageDrop(Ib, r.comprimento, mat, nextSection, refVoltage, refConnection, refPf);
          var dropNext = (vdNext / refVoltage) * 100;
          if (nextCorrectedAmp >= Ib && dropNext <= r.quedaTensaoMax) {
            rejectedSection = finalSection;
            finalSection = nextSection;
            finalBaseAmp = nextBaseAmp;
            finalCorrectedAmp = nextCorrectedAmp;
            break;
          }
        }
      }
    }

    var safetySection = getSafetyMarginSection(finalSection, mat, r.margem);
    if (safetySection > finalSection) {
      var safetyBaseAmp = getAmpacity(mat, insulation, r.metodoInstalacao, safetySection);
      var safetyCorrectedAmp = safetyBaseAmp * ftotal;
      var safetyVd = calculateVoltageDrop(Ib, r.comprimento, mat, safetySection, refVoltage, refConnection, refPf);
      var safetyDropPct = (safetyVd / refVoltage) * 100;
      if (safetyCorrectedAmp >= Ib && safetyDropPct <= r.quedaTensaoMax) {
        if (r.margem !== 'minimum') {
          rejectedSection = finalSection;
          finalSection = safetySection;
          finalBaseAmp = safetyBaseAmp;
          finalCorrectedAmp = safetyCorrectedAmp;
        }
      }
    }

    var vDrop = calculateVoltageDrop(Ib, r.comprimento, mat, finalSection, refVoltage, refConnection, refPf);
    var dropPct = (vDrop / refVoltage) * 100;
    var breaker = selectBreaker(Ib, finalCorrectedAmp);

    var thermalEval = evaluateThermalMargin(Ib, finalCorrectedAmp);
    var vdMargin = evaluateVoltageDropMargin(dropPct, r.quedaTensaoMax);

    var minSizeOk = finalSection >= minSize;
    var ibInIzOk = Ib <= breaker && breaker <= finalCorrectedAmp;
    var vdOk = dropPct <= r.quedaTensaoMax;

    var alternativeSection = null;
    var statusText = 'Seguro';
    var statusColor = '#2e7d32';
    var statusClass = 'safe';

    if (!ibInIzOk || !vdOk || !minSizeOk || thermalEval.level === 'error') {
      statusText = 'Alerta - O dimensionamento precisa ser revisado.';
      statusColor = '#c62828';
      statusClass = 'warning';
    } else if (thermalEval.level === 'warning') {
      statusText = 'Atenção - Margem de segurança reduzida';
      statusColor = '#e65100';
      statusClass = 'warning';
      alternativeSection = getNextStandardSection(finalSection, mat);
      if (alternativeSection === finalSection) alternativeSection = null;
    } else if (thermalEval.level === 'attention') {
      statusText = 'Atenção';
      statusColor = '#e65100';
      statusClass = 'warning';
      alternativeSection = getNextStandardSection(finalSection, mat);
      if (alternativeSection === finalSection) alternativeSection = null;
    } else if (vdMargin.lowMargin) {
      statusText = 'Atenção - Queda de tensão próxima ao limite';
      statusColor = '#e65100';
      statusClass = 'warning';
    } else {
      statusText = 'Seguro';
    }

    var circuitTypeLabel = '';
    if (r.tipoCircuito === 'tue') circuitTypeLabel = 'TUE';
    else if (r.tipoCircuito === 'tug') circuitTypeLabel = 'TUG';
    else circuitTypeLabel = 'Iluminação';

    var connLabel = '';
    if (refConnection === 'phase-neutral') connLabel = 'Fase-Neutro (FN)';
    else if (refConnection === 'phase-phase') connLabel = 'Fase-Fase (FF)';
    else connLabel = 'Trifásico (3F)';

    var matLabel = mat === 'copper' ? 'Cobre' : 'Alumínio';

    var phaseConductorsText = '';
    if (refConnection === 'phase-phase') {
      phaseConductorsText = '2 x ' + finalSection + ' mm² ' + matLabel;
    } else if (refConnection === 'three-phase') {
      phaseConductorsText = '3 x ' + finalSection + ' mm² ' + matLabel;
    } else {
      phaseConductorsText = '1 x ' + finalSection + ' mm² ' + matLabel;
    }

    var neutralSection = getNeutralSection(finalSection, refConnection);
    var neutralText = '';
    if (neutralSection === null) {
      neutralText = 'Não aplicável (ligação fase-fase)';
    } else {
      neutralText = neutralSection + ' mm² ' + matLabel;
    }

    var peSection = getPESection(finalSection);
    var peText = peSection + ' mm² ' + matLabel;

    var reasonText = generateReason(mat, finalSection, Ib, finalCorrectedAmp, dropPct, r.quedaTensaoMax, minSize, rejectedSection, refConnection, breaker, alternativeSection, r.margem, thermalEval);

    return {
      ok: true,
      ib: Ib,
      breaker: breaker,
      section: finalSection,
      baseAmpacity: finalBaseAmp,
      correctedAmpacity: finalCorrectedAmp,
      dropVolts: vDrop,
      dropPct: dropPct,
      minSize: minSize,
      ft: ft,
      fg: fg,
      fc: fc,
      ftotal: ftotal,
      rejectedSection: rejectedSection,
      alternativeSection: alternativeSection,
      thermalEval: thermalEval,
      vdMargin: vdMargin,
      status: { text: statusText, color: statusColor, class: statusClass },
      texts: {
        phase: phaseConductorsText,
        neutral: neutralText,
        pe: peText,
        circuitTypeLabel: circuitTypeLabel,
        connLabel: connLabel
      },
      reason: reasonText,
      params: r
    };
  }

  function dimensionar(mat) {
    if (!mat || typeof mat !== 'object') {
      return { ok: false, error: 'Parâmetros inválidos' };
    }

    var norm = normalizeParams(mat);
    if (!norm.ok) return norm;

    var r = norm.params;
    var refPf = r.fatorPotencia || getDefaultPowerFactor();
    var Ib = null;
    var refVoltage = r.tensao;
    var refConnection = r.tipoLigacao;
    var motorData = null;

    if (r.motorCv != null) {
      motorData = getMotorData(r.motorCv);
      if (!motorData) {
        return { ok: false, error: 'Motor de ' + r.motorCv + ' CV não encontrado na base de dados' };
      }
      var curKey = 'current_A_' + r.tensao + 'V';
      var cur = motorData[curKey];
      if (cur == null) {
        return { ok: false, error: 'Sem dados de corrente para motor ' + r.motorCv + ' CV em ' + r.tensao + 'V' };
      }
      Ib = cur;
      refPf = motorData.power_factor;
      refConnection = 'three-phase';
    }

    if (Array.isArray(mat.cargas) && mat.cargas.length) {
      var totalCurrent = 0;
      var minV = Infinity;
      var worstConn = 'fase-neutro';
      for (var i = 0; i < mat.cargas.length; i++) {
        var c = mat.cargas[i];
        var cPot = num(c && c.potencia);
        var cV = num(c && c.tensao);
        var cPf = num(c && c.fatorPotencia, refPf);
        var cConn = (c && c.tipoLigacao) || 'fase-neutro';
        var cIb = cConn === 'three-phase' ? cPot / (Math.sqrt(3) * cV * cPf) : cPot / (cV * cPf);
        totalCurrent += cIb;
        if (cV < minV) minV = cV;
        if (cConn === 'three-phase') worstConn = 'three-phase';
        else if (cConn === 'phase-phase' && worstConn === 'fase-neutro') worstConn = 'phase-phase';
      }
      Ib = totalCurrent * (r.simultaneidade || 1);
      refVoltage = r.tensao && r.tensao > 0 ? r.tensao : minV;
      refConnection = worstConn;
    }

    if (Ib == null) {
      Ib = calculateDesignCurrent(r.potencia, r.tensao, r.tipoLigacao, refPf);
    }

    if (Ib <= 0) {
      return { ok: false, error: 'Corrente de projeto inválida' };
    }

    var result = computeCore(r, Ib, refVoltage, refConnection, refPf);

    if (motorData) {
      result.motor = {
        cv: motorData.cv,
        kw: motorData.kw,
        poles: motorData.poles,
        powerFactor: motorData.power_factor,
        efficiency: motorData.efficiency,
        nameplateCurrent: motorData['current_A_' + r.tensao + 'V']
      };
    }

    return result;
  }

  window.DimenVoltMotor = {
    dimensionar: dimensionar,
    load: load,
    isReady: isReady,
    getDB: function() { return DB; },
    getMotorData: getMotorData,
    getStandardSections: getStandardSections
  };

})();
