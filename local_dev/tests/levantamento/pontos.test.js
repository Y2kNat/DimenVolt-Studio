"use strict";

const lev = require("./_helpers.js");

module.exports = {
  category: { code: "02", name: "Levantamento" },
  suite: { id: "lev-pontos", name: "Pontos elétricos" },
  tests: [
    {
      name: "Totais de potência por tipo de ponto",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        const unit = '[data-room="quartos"] [data-unit="0"]';

        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="tug"]');
        await h.fill(page, unit + ' input[data-field="tug.potencia"]', "100");
        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="iluminacao"]');
        await h.fill(page, unit + ' input[data-field="iluminacao.potencia"]', "60");

        h.equal(await lev.readText(page, unit + ' [data-live="tug-power"]'), "100 W", "Total TUG = 100 W");
        h.equal(await lev.readText(page, unit + ' [data-live="iluminacao-power"]'), "60 W", "Total iluminação = 60 W");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-tug"]'), "1 pt · 100 W", "Resumo TUG: 1 ponto · 100 W");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-ill"]'), "1 pt · 60 W", "Resumo iluminação: 1 ponto · 60 W");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-total"]'), "160 W", "Potência total da unidade = 160 W");
      },
    },
    {
      name: "Interruptores não somam potência",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        const unit = '[data-room="quartos"] [data-unit="0"]';

        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="tug"]');
        await h.fill(page, unit + ' input[data-field="tug.potencia"]', "100");
        await h.fill(page, unit + ' input[data-field="interruptores"]', "5");

        h.equal(await lev.readValue(page, unit + ' input[data-field="interruptores"]'), "5", "Interruptores informados");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-total"]'), "100 W", "Interruptores não alteram a potência total");
      },
    },
    {
      name: "Unidade sem pontos totaliza zero",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        h.equal(
          await lev.readText(page, '[data-room="banheiros"] [data-unit="0"] [data-live="unit-total"]'),
          "0 W",
          "Banheiro sem pontos totaliza 0 W"
        );
      },
    },
    {
      name: "Ponto TUE com potência dedicada",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        const unit = '[data-room="cozinha"] [data-unit="0"]';

        await h.click(page, '[data-room="cozinha"] [data-action="toggle"]');
        await h.awaitSelector(page, unit);
        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="tue"]');
        await h.fill(page, unit + ' input[data-field="tue.potencia"]', "1500");

        h.equal(await lev.readText(page, unit + ' [data-live="tue-power"]'), "1.500 W", "Total TUE = 1.500 W");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-tue"]'), "1 pt · 1.500 W", "Resumo TUE: 1 ponto · 1.500 W");
        h.equal(await lev.readText(page, unit + ' [data-live="unit-total"]'), "1.500 W", "Potência total = 1.500 W");
      },
    },
  ],
};
