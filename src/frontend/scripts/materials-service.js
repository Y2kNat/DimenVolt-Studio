(function () {
  "use strict";

  var CATALOG_PATH = "/data/materials.json";

  var catalog = null;
  var catalogPromise = null;

  var ESTIMATE = {
    conduitPerimeterFactor: 0.5,
    conduitPointFactor: 0.8,
    tugPerimeterFactor: 0.5,
    tugPointFactor: 1.5,
    lightingPerimeterFactor: 0.35,
    lightingPointFactor: 1.5
  };

  function num(value) {
    var n = parseFloat(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function int(value) {
    return Math.round(num(value));
  }

  function roundToInt(value) {
    return Math.round(value);
  }

  function findById(cat, id) {
    var found = null;
    cat.categories.some(function (group) {
      group.materials.some(function (material) {
        if (material.id === id) {
          found = material;
          return true;
        }
        return false;
      });
      return !!found;
    });
    return found;
  }

  function load() {
    if (catalog) return Promise.resolve(catalog);
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch(CATALOG_PATH)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        catalog = data;
        return data;
      });
    return catalogPromise;
  }

  function activeMaterials() {
    if (!catalog) return [];
    var list = [];
    catalog.categories.forEach(function (group) {
      group.materials.forEach(function (material) {
        if (material.active !== false) list.push(material);
      });
    });
    return list;
  }

  function groupByCategory(items) {
    var order = [];
    var map = {};
    if (catalog) {
      catalog.categories.forEach(function (group) {
        order.push(group.id);
        map[group.id] = [];
      });
    }
    items.forEach(function (item) {
      if (!(item.category in map)) {
        order.push(item.category);
        map[item.category] = [];
      }
      map[item.category].push(item);
    });
    return order
      .filter(function (id) {
        return map[id].length > 0;
      })
      .map(function (id) {
        var name = id;
        if (catalog) {
          catalog.categories.some(function (group) {
            if (group.id === id) {
              name = group.name;
              return true;
            }
            return false;
          });
        }
        return { id: id, name: name, items: map[id] };
      });
  }

  function perimeterOf(unit) {
    return 2 * (num(unit.comprimento) + num(unit.largura));
  }

  function buildMaterialsList(survey) {
    var totals = survey.totals || {};
    var units = survey.units || [];
    var out = [];

    function push(id, quantity, estimated) {
      var material = catalog ? findById(catalog, id) : null;
      if (!material) return;
      var entry = {
        id: material.id,
        name: material.name,
        description: material.description || "",
        unit: material.unit,
        category: material.category,
        categoryName: (function () {
          var name = material.category;
          if (catalog) {
            catalog.categories.some(function (group) {
              if (group.id === material.category) {
                name = group.name;
                return true;
              }
              return false;
            });
          }
          return name;
        })(),
        quantity: Math.max(0, quantity),
        estimated: !!estimated
      };
      out.push(entry);
    }

    var tug = totals.tug || {};
    var tue = totals.tue || {};
    var ilu = totals.iluminacao;
    var tugPontos = int(tug.pontos != null ? tug.pontos : totals.tomadas);
    var tuePontos = int(tue.pontos != null ? tue.pontos : 0);
    var interruptores = int(totals.interruptores);
    var ilumPontos = int(ilu != null && typeof ilu === "object" ? ilu.pontos : ilu);

    push("tomada-tug-10a", tugPontos, false);
    push("tomada-tue-20a", tuePontos, false);
    push("interruptor-simples", interruptores, false);
    push("ponto-iluminacao-bocal", ilumPontos, false);
    push("caixa-4x2", tugPontos + tuePontos + interruptores, false);
    push("caixa-octogonal-4x4", ilumPontos, false);

    var conduitLength = 0;
    var tugCableLength = 0;
    var tueCableLength = 0;
    var lightingCableLength = 0;
    units.forEach(function (item) {
      var unit = item.unit || {};
      var peri = perimeterOf(unit);
      var tugCount = Array.isArray(unit.tug) ? unit.tug.length : int(unit.tomadas);
      var tueCount = Array.isArray(unit.tue) ? unit.tue.length : 0;
      var illumCount = Array.isArray(unit.iluminacao) ? unit.iluminacao.length : int(unit.iluminacao);
      var points = tugCount + tueCount + int(unit.interruptores) + illumCount;
      conduitLength += peri * ESTIMATE.conduitPerimeterFactor + points * ESTIMATE.conduitPointFactor;
      tugCableLength += peri * ESTIMATE.tugPerimeterFactor + tugCount * ESTIMATE.tugPointFactor;
      tueCableLength += peri * ESTIMATE.tugPerimeterFactor + tueCount * ESTIMATE.tugPointFactor;
      lightingCableLength += peri * ESTIMATE.lightingPerimeterFactor +
        (illumCount + int(unit.interruptores)) * ESTIMATE.lightingPointFactor;
    });

    push("eletroduto-corrugado-20mm", roundToInt(conduitLength), true);
    push("cabo-flexivel-2.5mm", roundToInt(tugCableLength), true);
    push("cabo-flexivel-4mm", roundToInt(tueCableLength), true);
    push("cabo-flexivel-1.5mm", roundToInt(lightingCableLength), true);

    return {
      items: out,
      categories: groupByCategory(out),
      totalItems: out.length,
      estimatedItems: out.filter(function (item) {
        return item.estimated;
      }).length
    };
  }

  window.DimenVoltMaterials = {
    load: load,
    findById: function (id) {
      return catalog ? findById(catalog, id) : null;
    },
    activeMaterials: activeMaterials,
    groupByCategory: groupByCategory,
    buildMaterialsList: buildMaterialsList
  };
})();
