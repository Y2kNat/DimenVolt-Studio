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

        // TUG circuit should show the power from the room's points
        const tugPower = await page.$eval(
          '[data-circuit-type="tug"] .lv-room-subcard[data-dim-index="0"] .lv-badge',
          (el) => el.textContent
        );
        h.ok(tugPower.includes("120"), "Circuito TUG recebe a potência agrupada do ambiente: " + tugPower);
      },
    },
    {
      name: "Todas as potências necessárias somadas em seus circuitos",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep3(h, page, { room: "quartos", tug: 100, ill: 60 });

        const tugBadge = await page.$eval('[data-circuit-type="tug"] .lv-room-subcard[data-dim-index="0"] .lv-badge', (el) => el.textContent);
        const illBadge = await page.$eval('[data-circuit-type="iluminacao"] .lv-room-subcard[data-dim-index="0"] .lv-badge', (el) => el.textContent);
        h.ok(tugBadge.includes("100"), "Circuito TUG com 100 W: " + tugBadge);
        h.ok(illBadge.includes("60"), "Circuito de iluminação com 60 W: " + illBadge);
      },
    },
    {
      name: "Motor de cálculo retorna seção por circuito",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep3(h, page, { room: "quartos", tug: 200, ill: 60 });

        // Fill distance for TUG circuit
        await h.fill(page, '[data-dim-index="0"][data-circuit-type="tug"] input[data-field="tug.distancia"]', "20");
        await page.waitForFunction(
          () => {
            const box = document.querySelector('[data-dim-index="0"][data-circuit-type="tug"] [data-result="0-tug"]');
            return !!(box && /mm²/.test(box.textContent));
          },
          { timeout: 15000 }
        );
        h.ok(true, "Circuito TUG dimensionado (seção em mm² exibida)");

        // Fill distance for Iluminação circuit
        await h.fill(page, '[data-dim-index="0"][data-circuit-type="iluminacao"] input[data-field="iluminacao.distancia"]', "20");
        await page.waitForFunction(
          () => {
            const box = document.querySelector('[data-dim-index="0"][data-circuit-type="iluminacao"] [data-result="0-iluminacao"]');
            return !!(box && /mm²/.test(box.textContent));
          },
          { timeout: 15000 }
        );
        h.ok(true, "Circuito Iluminação dimensionado (seção em mm² exibida)");
      },
    },
  ],
};