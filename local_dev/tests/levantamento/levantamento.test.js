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

        await h.click(page, '[data-room="quartos"] [data-unit="0"] button[data-action="pt-inc"][data-pt="tue"]');
        await h.fill(page, '[data-room="quartos"] [data-unit="0"] input[data-field="tue.potencia"]', "1500");

        await h.click(page, '[data-room="sala"] [data-unit="0"] button[data-pt="iluminacao"][data-action="pt-inc"]');
        await h.fill(page, '[data-room="sala"] [data-unit="0"] input[data-field="iluminacao.potencia"]', "60");

        await lev.clickNav(page, "next");
        await h.awaitSelector(page, "#step-dimensionamento .lv-circuit-type-card");
        h.step("Etapa 3 — dimensionamento");

        // Preencher distâncias por cômodo × tipo
        const distancias = {
          "0": { tug: 15 },
          "2": { iluminacao: 12 }
        };
        for (const idx of Object.keys(distancias)) {
          const d = distancias[idx];
          if (!d) continue;
          for (const tipo of Object.keys(d)) {
            await h.fill(page, '[data-dim-index="' + idx + '"][data-circuit-type="' + tipo + '"] input[data-field="' + tipo + '.distancia"]', String(d[tipo]));
          }
        }

        // Aguardar resultados
        await page.waitForFunction(
          () => {
            const box = document.querySelector('[data-dim-index="0"] [data-result="0-tug"]');
            return !!(box && /mm²/.test(box.textContent));
          },
          { timeout: 15000 }
        );
        h.ok(true, "Circuito TUG do quarto dimensionado pelo motor (resultado com seção)");

        await page.waitForFunction(
          () => {
            const box = document.querySelector('[data-dim-index="2"] [data-result="2-iluminacao"]');
            return !!(box && /mm²/.test(box.textContent));
          },
          { timeout: 15000 }
        );
        h.ok(true, "Circuito Iluminação da sala dimensionado pelo motor (resultado com seção)");

        await lev.clickNav(page, "next");
        await h.awaitSelector(page, "#step-resumo");
        h.step("Etapa 4 — resumo");

        const resumoText = await page.$eval("#resumoGrid", (el) => (el.textContent || "").trim().length);
        const circuitsResumo = await lev.count(page, "#circuitosResumoRoot .lv-final-block");
        h.ok(resumoText > 0, "Resumo de totais renderizado");
        h.ok(circuitsResumo >= 2, "Resumo dos circuitos dimensionados renderizado", circuitsResumo + " blocos");

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

        // Verificar que pelo menos uma unidade tem circuitos dimensionados
        const hasCircuitos = payload.units.some((u) => Array.isArray(u.circuitos) && u.circuitos.length > 0);
        h.ok(hasCircuitos, "Ao menos uma unidade tem circuitos no payload");

        // Verificar totais
        h.equal(payload.totals.tug.pontos, 1, "Total de pontos TUG = 1");
        h.equal(payload.totals.tue.pontos, 1, "Total de pontos TUE = 1");
        h.equal(payload.totals.iluminacao.pontos, 1, "Total de pontos Iluminação = 1");

        h.input("Payload (resumo)", {
          cliente: payload.cliente.nome,
          obra: payload.obra,
          units: payload.units.length,
          circuitos: payload.units.map((u) => u.circuitos).flat().map((c) => ({ tipo: c.tipo, potencia: c.potencia, distancia: c.distancia })),
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