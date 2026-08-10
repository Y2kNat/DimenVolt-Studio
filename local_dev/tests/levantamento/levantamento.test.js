"use strict";

const path = require("path");
const http = require("http");
const harness = require("../_harness.js");
const lev = require("./_helpers.js");

function postPdf(base, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      base + "/api/report/levantamento",
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  category: { code: "02", name: "Levantamento" },
  suite: { id: "lev-fluxo", name: "Fluxo completo" },
  tests: [
    {
      name: "Fluxo completo do levantamento com geração de PDF",
      fn: async (h) => {
        const page = await lev.openLev(h);
        h.step("Página aberta e motor de cálculo pronto.");

        await h.click(page, '[data-nav="next"]');
        await h.awaitSelector(page, "#clienteHint");
        h.ok(true, "Avançar sem nome bloqueia e exibe o aviso de cliente");

        const invalid = await page.$eval("#clienteNome", (el) => el.classList.contains("is-invalid"));
        h.ok(invalid, "Campo de cliente marcado como inválido");

        await h.fill(page, "#clienteNome", "Cliente Teste Auto");
        await h.seg(page, ".lv-seg", "tensao", "220V");
        await lev.clickNav(page, "next");
        await h.awaitSelector(page, "#step-ambientes");
        h.step("Etapa 2 — ambientes");

        const requiredRooms = ["quartos", "banheiros", "sala"];
        for (const room of requiredRooms) {
          const enabled = await page.$eval(
            '.lv-room[data-room="' + room + '"]',
            (el) => !el.classList.contains("is-disabled")
          );
          h.ok(enabled, "Ambiente obrigatório ativo: " + room);
        }

        await h.click(page, '[data-room="cozinha"] [data-action="toggle"]');
        await h.awaitSelector(page, '[data-room="cozinha"] .lv-room-body');
        h.ok(true, "Ambiente opcional (cozinha) ativado");

        await h.click(page, '[data-room="quartos"] [data-unit="0"] button[data-action="pt-inc"][data-pt="tug"]');
        await h.fill(page, '[data-room="quartos"] [data-unit="0"] input[data-field="tug.potencia"]', "100");
        const tugPower = await lev.readText(page, '[data-room="quartos"] [data-unit="0"] [data-live="tug-power"]');
        h.equal(tugPower, "100 W", "Potência do ponto TUG aplicada");

        await h.click(page, '[data-room="sala"] [data-unit="0"] button[data-pt="iluminacao"][data-action="pt-inc"]');
        await h.fill(page, '[data-room="sala"] [data-unit="0"] input[data-field="iluminacao.potencia"]', "60");

        await lev.clickNav(page, "next");
        await h.awaitSelector(page, '#step-dimensionamento [data-circuit="iluminacao"]');
        h.step("Etapa 3 — dimensionamento");

        const circuits = { iluminacao: [60, 12], tug: [200, 15], tue: [1500, 20] };
        for (const key of Object.keys(circuits)) {
          const [p, d] = circuits[key];
          await h.fill(page, '[data-circuit="' + key + '"] input[data-field="potencia"]', String(p));
          await h.fill(page, '[data-circuit="' + key + '"] input[data-field="distancia"]', String(d));
          await page.waitForFunction(
            (k) => {
              const box = document.querySelector('[data-circuit="' + k + '"] [data-result]');
              return !!(box && /mm²/.test(box.textContent));
            },
            { timeout: 15000 },
            key
          );
          h.ok(true, "Circuito " + key + " dimensionado pelo motor (resultado com seção)");
        }

        const shownTug = await page.$eval('[data-circuit="tug"] [data-result]', (el) => el.textContent);
        const eng = await h.engine();
        const expectedTug = eng.dimensionar({
          potencia: 200,
          tensao: 220,
          comprimento: 15,
          tipoLigacao: "fase-neutro",
          tipoCircuito: "tug",
          metodoInstalacao: "B1",
          margem: "minimum",
          material: "copper",
          condicaoAmbiente: "normal",
          circuitosAgrupados: 3,
          condutoresCarregados: 2,
          quedaTensaoMax: 4,
          fatorPotencia: 0.92
        });
        h.ok(expectedTug && expectedTug.ok, "Motor dimensiona o circuito TUG de referência");
        h.match(
          shownTug,
          new RegExp(expectedTug.ib.toFixed(2) + " A"),
          "Ib exibido no circuito TUG coincide com o motor (" + expectedTug.ib.toFixed(2) + " A)"
        );

        await lev.clickNav(page, "next");
        await h.awaitSelector(page, "#step-resumo");
        h.step("Etapa 4 — resumo");

        const resumoText = await page.$eval("#resumoGrid", (el) => (el.textContent || "").trim().length);
        const circuitsResumo = await lev.count(page, "#circuitosResumoRoot .lv-final-block");
        h.ok(resumoText > 0, "Resumo de totais renderizado");
        h.ok(circuitsResumo >= 3, "Resumo dos circuitos dimensionados renderizado", circuitsResumo + " blocos");

        await lev.clickNav(page, "next");
        await h.awaitSelector(page, "#step-final");
        await h.awaitSelector(page, "#docChoice");
        h.step("Etapa 5 — finalização");

        const surveyActive = await page.$eval(
          '.lv-doc-option[data-doc="survey"]',
          (el) => el.classList.contains("is-active")
        );
        h.ok(surveyActive, "Opção 'Levantamento' selecionada por padrão");

        let payload = null;
        const reqDone = new Promise((resolve) => {
          page.on("request", (r) => {
            if (r.url().includes("/api/report/levantamento") && r.postData() && !payload) {
              payload = JSON.parse(r.postData());
              resolve();
            }
          });
        });
        const respDone = new Promise((resolve) => {
          page.on("response", (r) => {
            if (r.url().includes("/api/report/levantamento")) resolve(r);
          });
        });

        await h.click(page, "#btnPdf");
        const resp = await respDone;
        await reqDone;

        const ctype = resp.headers()["content-type"] || "";
        h.equal(resp.status(), 200, "Servidor responde 200 para o PDF");
        h.match(ctype, /application\/pdf/, "Content-Type é application/pdf");

        h.ok(payload !== null, "Payload do relatório capturado");
        h.equal(payload.cliente.nome, "Cliente Teste Auto", "Cliente no payload");
        h.equal(payload.obra.tensao, "220V", "Tensão no payload");
        h.equal(payload.circuits.length, 3, "Três circuitos no payload");
        h.equal(payload.totals.tug.pontos, 1, "Total de pontos TUG = 1");
        h.input("Payload (resumo)", {
          cliente: payload.cliente.nome,
          obra: payload.obra,
          units: payload.units.length,
          circuits: payload.circuits.map((c) => ({ key: c.key, potencia: c.potencia, distancia: c.distancia })),
          totals: payload.totals,
        });

        const buf = await postPdf(h.serverBase, payload);
        h.ok(buf.length > 5000, "PDF não está vazio", buf.length + " bytes");
        h.equal(buf.slice(0, 5).toString("latin1"), "%PDF-", "Resposta começa com a assinatura %PDF-");
        const info = { pages: harness.pdfInfo(buf).pages };
        h.ok(info.pages >= 1, "PDF com ao menos 1 página", info.pages + " página(s)");

        const pdfFile = path.join(h.dirs.pdf, "levantamento-fluxo.pdf");
        require("fs").writeFileSync(pdfFile, buf);
        h.attachFile(pdfFile, "PDF gerado pelo fluxo de UI");

        await h.awaitText(page, "#pdfStatus", "sucesso");
        h.ok(true, "Status 'PDF gerado com sucesso' exibido");

        const isOk = await page.$eval("#btnPdf", (el) => el.classList.contains("is-ok"));
        h.ok(isOk, "Botão de PDF marcado como concluído (is-ok)");
      },
    },
  ],
};
