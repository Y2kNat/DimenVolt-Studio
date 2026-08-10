"use strict";

const lev = require("./_helpers.js");

module.exports = {
  category: { code: "02", name: "Levantamento" },
  suite: { id: "lev-ambientes", name: "Ambientes" },
  tests: [
    {
      name: "Ambientes obrigatórios sempre ativos e opcionais desativados",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);

        for (const room of ["quartos", "banheiros", "sala"]) {
          const state = await page.$eval(
            '.lv-room[data-room="' + room + '"]',
            (el) => ({ disabled: el.classList.contains("is-disabled"), hasBody: !!el.querySelector(".lv-room-body") })
          );
          h.ok(!state.disabled && state.hasBody, "Ambiente obrigatório ativo com corpo renderizado: " + room);
        }

        const optionalState = await page.$eval(
          '.lv-room[data-room="cozinha"]',
          (el) => ({ disabled: el.classList.contains("is-disabled"), hasBody: !!el.querySelector(".lv-room-body") })
        );
        h.ok(optionalState.disabled && !optionalState.hasBody, "Ambiente opcional inicia desativado");

        const totalRooms = await lev.count(page, ".lv-room");
        h.equal(totalRooms, 13, "Lista completa de ambientes (3 obrigatórios + 10 opcionais)");
      },
    },
    {
      name: "Ativar e desativar um ambiente opcional",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);

        await h.click(page, '[data-room="cozinha"] [data-action="toggle"]');
        await h.awaitSelector(page, '[data-room="cozinha"] .lv-room-body');
        h.ok(true, "Cozinha ativada mostra o corpo com configurações");

        const pressed = await page.$eval(
          '[data-room="cozinha"] [data-action="toggle"]',
          (el) => el.getAttribute("aria-pressed")
        );
        h.equal(pressed, "true", "Toggle marcado como pressionado");

        await h.click(page, '[data-room="cozinha"] [data-action="toggle"]');
        await page.waitForFunction(() => {
          const el = document.querySelector('[data-room="cozinha"] .lv-room-body');
          return !el;
        }, { timeout: 10000 });
        h.ok(true, "Cozinha desativada remove o corpo de configurações");

        const disabled = await page.$eval('[data-room="cozinha"]', (el) =>
          el.classList.contains("is-disabled")
        );
        h.ok(disabled, "Cozinha volta ao estado desativado");
      },
    },
    {
      name: "Quantidade de unidades do ambiente",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        const qtySpan = '[data-room="quartos"] .lv-qty-row .lv-qty-control span';
        const readQty = () => lev.readText(page, qtySpan);

        h.equal(await readQty(), "1", "Quarto inicia com 1 unidade");

        await h.click(page, '[data-room="quartos"] button[data-action="qty-inc"]');
        await h.click(page, '[data-room="quartos"] button[data-action="qty-inc"]');
        h.equal(await readQty(), "3", "qty-inc duas vezes → 3 unidades");
        h.equal(await lev.count(page, '[data-room="quartos"] .lv-unit'), 3, "Três unidades renderizadas");

        await h.click(page, '[data-room="quartos"] button[data-action="qty-dec"]');
        h.equal(await readQty(), "2", "qty-dec → 2 unidades");

        await h.click(page, '[data-room="quartos"] button[data-action="qty-dec"]');
        await h.click(page, '[data-room="quartos"] button[data-action="qty-dec"]');
        h.equal(await readQty(), "1", "qty-dec não reduz abaixo de 1 unidade (obrigatório)");
      },
    },
    {
      name: "Adicionar e remover pontos por tipo",
      fn: async (h) => {
        const page = await lev.openLev(h);
        await lev.gotoStep2(h, page);
        const unit = '[data-room="quartos"] [data-unit="0"]';
        const tugInputs = unit + ' input[data-field="tug.potencia"]';

        h.equal(await lev.count(page, tugInputs), 0, "Sem pontos TUG inicialmente");

        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="tug"]');
        h.equal(await lev.count(page, tugInputs), 1, "pt-inc cria um ponto TUG");
        h.equal(await lev.count(page, unit + ' input[data-field="iluminacao.potencia"]'), 0, "Sem pontos de iluminação ainda");

        await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="iluminacao"]');
        h.equal(await lev.count(page, unit + ' input[data-field="iluminacao.potencia"]'), 1, "pt-inc cria um ponto de iluminação");

        await h.click(page, unit + ' button[data-action="pt-dec"][data-pt="tug"]');
        h.equal(await lev.count(page, tugInputs), 0, "pt-dec remove o ponto TUG");
      },
    },
  ],
};
