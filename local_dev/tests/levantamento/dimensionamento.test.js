"use strict";

const lev = require("./_helpers.js");

module.exports = {
  category: { code: "02", name: "Levantamento" },
  suite: { id: "lev-dimensionamento", name: "Dimensionamento" },
  tests: [
    {
      name: "Circuitos pré-populados com potências agrupadas",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep3(h, page, { room: "quartos", tug: 120, ill: 60 });

        const power = await page.$eval(
          '[data-circuit="tug"] input[data-field="potencia"]',
          (el) => el.value
        );
        h.equal(power, "120", "Circuito TUG recebe a potência agrupada do ambiente");
      },
    },
    {
      name: "Todas as potências necessárias somadas em seus circuitos",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep3(h, page, { room: "quartos", tug: 100, ill: 60 });

        const tug = await page.$eval('[data-circuit="tug"] input[data-field="potencia"]', (el) => el.value);
        const ill = await page.$eval('[data-circuit="iluminacao"] input[data-field="potencia"]', (el) => el.value);
        h.equal(tug, "100", "Circuito TUG com 100 W");
        h.equal(ill, "60", "Circuito de iluminação com 60 W");
      },
    },
    {
      name: "Motor de cálculo retorna seção por circuito",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep3(h, page, { room: "quartos", tug: 200, ill: 60 });

        for (const key of ["iluminacao", "tug", "tue"]) {
          await h.fill(page, '[data-circuit="' + key + '"] input[data-field="potencia"]', "600");
          await h.fill(page, '[data-circuit="' + key + '"] input[data-field="distancia"]', "20");
          await page.waitForFunction(
            (k) => {
              const box = document.querySelector('[data-circuit="' + k + '"] [data-result]');
              return !!(box && /mm²/.test(box.textContent));
            },
            { timeout: 15000 },
            key
          );
          h.ok(true, "Circuito " + key + " dimensionado (seção em mm² exibida)");
        }
      },
    },
  ],
};
