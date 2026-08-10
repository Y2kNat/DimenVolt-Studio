"use strict";

async function openLev(h) {
  const page = await h.open("src/frontend/pages/levantamento.html");
  await h.waitForEngine(page);
  await h.click(page, "#btnStart");
  await h.awaitSelector(page, "#clienteNome");
  return page;
}

async function clickNav(page, dir) {
  await page.$$eval('[data-nav="' + dir + '"]', (btns) => {
    const target = btns.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest("[hidden]");
    });
    if (target) target.click();
  });
}

async function gotoStep2(h, page) {
  await h.fill(page, "#clienteNome", "Cliente Teste Auto");
  await h.seg(page, ".lv-seg", "tensao", "220V");
  await clickNav(page, "next");
  await h.awaitSelector(page, "#step-ambientes");
}

async function gotoStep3(h, page, opts) {
  await gotoStep2(h, page);
  if (opts && opts.room) {
    const unit = '[data-room="' + opts.room + '"] [data-unit="0"]';
    if (opts.tug) {
      await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="tug"]');
      await h.fill(page, unit + ' input[data-field="tug.potencia"]', String(opts.tug));
    }
    if (opts.ill) {
      await h.click(page, unit + ' button[data-action="pt-inc"][data-pt="iluminacao"]');
      await h.fill(page, unit + ' input[data-field="iluminacao.potencia"]', String(opts.ill));
    }
  }
  await clickNav(page, "next");
  await h.awaitSelector(page, "#step-dimensionamento .lv-circuit");
}

async function readValue(page, selector) {
  return page.$eval(selector, (el) => el.value);
}

async function readText(page, selector) {
  return page.$eval(selector, (el) => String(el.textContent || "").trim());
}

async function count(page, selector) {
  return page.$$eval(selector, (els) => els.length);
}

module.exports = { openLev, clickNav, gotoStep2, gotoStep3, readValue, readText, count };
