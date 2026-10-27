<p align="center">
  <img src="https://i.postimg.cc/445mwL81/Captura-de-tela-2026-08-07-235925.png" alt="DimenVolt Studio — prévia da plataforma" width="100%">
</p>

<h1 align="center">DimenVolt Studio</h1>

<p align="center">
  <strong>Plataforma web para levantamento de instalações, dimensionamento de condutores e quadros de distribuição conforme a NBR 5410, com emissão de documentos técnicos em PDF.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white" alt="Deploy Vercel">
  <img src="https://img.shields.io/badge/Norma-NBR%205410-1b1b1b" alt="NBR 5410">
  <img src="https://img.shields.io/badge/Licen%C3%A7a-Propriet%C3%A1ria%20%E2%80%94%20All%20Rights%20Reserved-red" alt="Licença proprietária — All Rights Reserved">
</p>

---

## Sumário

- [Sobre](#sobre)
- [Funcionalidades](#funcionalidades)
- [Módulos](#módulos)
- [Produção × Desenvolvimento local](#produção--desenvolvimento-local)
- [Fluxo do sistema](#fluxo-do-sistema)
- [API de PDF](#api-de-pdf)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Dados técnicos](#dados-técnicos)
- [Instalação e execução](#instalação-e-execução)
- [Deploy](#deploy)
- [Testes](#testes)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Sobre

O **DimenVolt Studio** é uma plataforma de engenharia elétrica que cobre o fluxo completo de um projeto de instalação de baixa tensão: levantamento dos ambientes e pontos elétricos, dimensionamento de cabos e disjuntores, montagem do quadro de distribuição e emissão de documentos técnicos.

O frontend é 100 % estático e **todo o cálculo roda no navegador**. Em produção, a geração server-side de PDF é feita pelas serverless functions da Vercel em `api/report/*`. O `local_dev/server.js` (Express) existe **apenas** como servidor de desenvolvimento local e não é executado em produção. Quando nenhuma API está disponível, a plataforma reconstrói o relatório no cliente e abre a impressão do navegador (salvar como PDF).

---

## Funcionalidades

- **Levantamento elétrico** por ambientes, com contagem separada de tomadas de uso geral (TUG) e de uso específico (TUE), pontos de iluminação (cada um com potência individual), interruptores e dimensões (área, perímetro e pé-direito).
- **Dimensionamento conforme NBR 5410** no navegador: corrente de projeto (Ib), capacidade de condução (Iz), seleção de seção, queda de tensão e margem térmica.
- **Seleção automática de disjuntor** (curva C) com coordenação Ib ≤ In ≤ Iz.
- **Fatores de correção** por temperatura ambiente, agrupamento de circuitos e número de condutores carregados.
- **Condutor neutro e PE** dimensionados a partir da seção de fase.
- **Quadro de distribuição**: circuitos, disjuntores, fases (L1/L2/L3) e balanceamento automático entre fases.
- **Lista de materiais estimada** a partir dos dados do levantamento, com itens estimados sinalizados.
- **Relatórios PDF técnicos** com numeração própria (RT-DIM, RT-LVT, RT-QDR) e modo duplo de geração (serverless na Vercel ou fallback no navegador).
- **Tabelas de referência NBR 5410** integradas (capacidade de corrente e disjuntores).

---

## Módulos

Cada módulo é uma página independente em `src/frontend/pages/`, alimentada pelos scripts em `src/frontend/scripts/`.

| Módulo | Rota | Descrição |
| ------ | ---- | --------- |
| Landing | `/` | Apresentação da plataforma e acesso às ferramentas |
| Calculadora NBR 5410 | `/calculadora` | Dimensionamento de condutores e disjuntores (Ib, Iz, seção, queda de tensão, margem térmica), com relatório RT-DIM |
| Levantamento Elétrico | `/levantamento` | Cadastro de ambientes, pontos TUG/TUE/iluminação, interruptores e dimensões, com relatório RT-LVT e lista de materiais opcional |
| Quadro de Distribuição | `/quadro` | Circuitos, disjuntores, fases (L1/L2/L3) e balanceamento, com relatório RT-QDR |

---

## Produção × Desenvolvimento local

O projeto separa de forma estrita o que é **produção** (publicado na Vercel) do que é **infraestrutura de desenvolvimento local** (não vai para produção).

| Produção | Desenvolvimento local |
| -------- | --------------------- |
| `api/` | `local_dev/` |
| `src/` | — |
| `data/` | — |
| `public/` | — |

- **`api/`** — serverless functions da Vercel (`/api/report/pdf`, `/api/report/levantamento`, `/api/report/quadro`). Obrigatórias em produção.
- **`src/`** — código-fonte da aplicação (frontend em `src/frontend/` e serviços compartilhados de PDF em `src/reports/`).
- **`data/`** — bases de dados/JSON de configuração consumidos pela aplicação.
- **`public/`** — assets estáticos servidos na raiz (favicons e documento técnico em `public/documents/`).
- **`local_dev/`** — **apenas desenvolvimento e testes**: `local_dev/server.js` (servidor Express local), `local_dev/tests/` (suíte automatizada) e `local_dev/test-results/` (artefatos gerados, ignorados pelo git).

A produção não importa nada de `local_dev/`. A dependência existe apenas no sentido `local_dev → produção`: o servidor local e os testes usam os serviços compartilhados de `src/reports/`, mas as serverless functions de `api/` não dependem do servidor local.

---

## Fluxo do sistema

Todos os cálculos são executados no navegador (JavaScript puro), lendo bases de dados JSON por `fetch`. A geração de PDF usa um único serviço compartilhado (`pdfGenerator.js`), montado por handlers HTTP idênticos (`report-endpoint.js`) tanto no servidor local quanto nas serverless functions da Vercel — não há lógica de PDF duplicada.

```text
Desenvolvimento local                     Produção (Vercel)
─────────────────────                    ─────────────────────
browser ──> local_dev/server.js ──>      browser ──> Vercel CDN
              Express                                │
              │  · páginas estáticas                 │  · frontend estático (pages/)
              │  · POST /api/report/*                │  · api/report/* (serverless)
              │                                     │
              └──────────► pdfGenerator.js ◄─────────┘
          serviço único e compartilhado (validação, HTML, Puppeteer)
```

O `local_dev/server.js` roda somente em desenvolvimento: serve as páginas e expõe as mesmas rotas de API de PDF usadas pelas functions da Vercel em produção. Nenhum servidor manual é necessário para executar a aplicação na Vercel.

### Dimensionamento elétrico

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Calculadora
    participant C as Motor de Cálculo
    participant D as Dados NBR 5410 (JSON)
    participant S as API de PDF
    participant P as Gerador de PDF (Puppeteer)

    U->>UI: Preenche tensão, potência, comprimento e parâmetros
    UI->>C: Submete o formulário
    C->>D: Carrega /data/*.json via fetch
    D-->>C: Ampacidade, fatores, disjuntores, quedas de tensão
    C->>C: Calcula Ib e Iz com correções (temp., agrupamento, condutores)
    C->>C: Seleciona seção mínima e disjuntor (curva C)
    C->>C: Verifica queda de tensão e margem térmica
    C-->>UI: Retorna resultados (cabo, disjuntor, Ib, Iz, queda, status)
    U->>UI: Solicita relatório PDF
    UI->>S: POST /api/report/pdf
    S->>P: Valida e monta o HTML
    P-->>S: PDF gerado
    alt API indisponível
        UI->>UI: Reconstrói o relatório no cliente
        UI-->>U: Abre impressão do navegador
    else
        S-->>UI: Retorna application/pdf
        UI-->>U: Baixa o relatório
    end
```

### Levantamento elétrico

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Levantamento
    participant E as Estado da sessão
    participant M as Catálogo de materiais (JSON)
    participant S as API de PDF
    participant P as Gerador de PDF (Puppeteer)

    U->>UI: Inicia o levantamento
    U->>UI: Informa nome, tipo e tensão da obra
    U->>UI: Ativa ambientes e informa pontos (TUG, TUE, iluminação, interruptores)
    UI->>E: Armazena unidades por ambiente
    UI->>E: Calcula totais (pontos e potência)
    UI->>U: Exibe resumo
    U->>UI: Informa dimensões (comprimento, largura, altura)
    UI->>UI: Calcula área e perímetro por ambiente
    UI->>U: Exibe revisão final
    opt Lista de materiais selecionada
        U->>UI: Escolhe o tipo de documento "Materiais"
        UI->>M: Carrega /data/materials.json
        M-->>UI: Catálogo de materiais
        UI->>M: Monta lista (itens estimados sinalizados)
        UI->>U: Exibe prévia da lista
    end
    U->>UI: Gera relatório PDF
    UI->>S: POST /api/report/levantamento
    S->>P: Valida e monta o HTML
    P-->>S: PDF gerado
    alt API indisponível
        UI->>UI: Reconstrói o relatório no cliente
        UI-->>U: Abre impressão do navegador
    else
        S-->>UI: Retorna application/pdf
        UI-->>U: Baixa o relatório
    end
```

### Quadro de distribuição

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Quadro
    participant C as Cálculo (quadro.js)
    participant S as API de PDF
    participant P as Gerador de PDF (Puppeteer)

    U->>UI: Inicia o quadro
    U->>UI: Informa identificação, tensão e sistema (mono/bi/trifásico)
    U->>UI: Adiciona circuito (ID, descrição, tipo, potência)
    UI->>C: Lê formulário e adiciona circuito
    C->>C: Estima a corrente quando não informada (potência ÷ tensão)
    U->>UI: Define disjuntor e fase (L1/L2/L3)
    U->>UI: Conclui os circuitos
    UI->>C: Calcula totais (potência, corrente, disjuntores, fases)
    UI->>C: Calcula balanceamento (proporção entre fases 1,5:1)
    C-->>UI: Resumo e status de balanceamento
    U->>UI: Gera PDF
    UI->>S: POST /api/report/quadro
    S->>P: Valida e monta o HTML
    P-->>S: PDF gerado
    alt API indisponível
        UI->>UI: Reconstrói o relatório no cliente
        UI-->>U: Abre impressão do navegador
    else
        S-->>UI: Retorna application/pdf
        UI-->>U: Baixa o relatório
    end
```

---

## API de PDF

Em produção, os relatórios são gerados pelas serverless functions da Vercel em `api/report/*`. Todas aceitam `POST` com um payload JSON (a mesma estrutura que o cliente envia) e respondem `application/pdf` com o arquivo em anexo; payloads inválidos respondem `400` com `{ "error": "..." }`.

| Endpoint | Função | Serviço compartilhado |
| -------- | ------ | --------------------- |
| `POST /api/report/pdf` | Relatório de dimensionamento da calculadora (RT-DIM) | `generateReportPdf` |
| `POST /api/report/levantamento` | Relatório do levantamento elétrico (RT-LVT), com lista de materiais quando aplicável | `generateLevantamentoPdf` |
| `POST /api/report/quadro` | Relatório do quadro de distribuição (RT-QDR) | `generateQuadroPdf` |

Em desenvolvimento, o `local_dev/server.js` expõe exatamente as mesmas três rotas — o contrato é idêntico localmente e em produção.

### Arquitetura de PDF (serviço compartilhado)

- **`pdfGenerator.js`** — valida os payloads, monta o HTML dos relatórios e gera o PDF via Puppeteer. É o único lugar onde os relatórios são construídos.
- **`report-endpoint.js`** — adapta os geradores ao contrato HTTP (`createPdfEndpoint`): cabeçalhos `Content-Type`/`Content-Disposition`, status 200 com o PDF e 400 para erros de validação. Usado tanto pelo `local_dev/server.js` quanto pelas functions da Vercel.
- **`pdf-report.js`** — cliente que envia o payload para `/api/report/*`; quando a API não responde, reconstrói o relatório no navegador e abre a impressão (mesmos templates e validações).

O navegador é iniciado de forma adaptativa em `pdfGenerator.js`: na Vercel (runtime serverless) usa `@sparticuz/chromium` + `puppeteer-core`; localmente usa o `puppeteer`, que aponta por padrão para `PUPPETEER_EXECUTABLE_PATH` quando definido. A escolha é feita em runtime pela presença do ambiente Vercel/Lambda.

---

## Estrutura do projeto

```
├── api/                              # Serverless functions da Vercel (produção)
│   └── report/
│       ├── pdf.js                    # POST /api/report/pdf
│       ├── levantamento.js           # POST /api/report/levantamento
│       └── quadro.js                 # POST /api/report/quadro
├── data/                             # Bases de dados NBR 5410 (JSON)
│   ├── ampacity.json                 # Capacidade de condução de corrente
│   ├── circuit_breakers.json         # Disjuntores normalizados
│   ├── grouping_factors.json         # Fatores de agrupamento e condutores carregados
│   ├── load_database.json            # Base de cargas de referência
│   ├── materials.json                # Catálogo de materiais do levantamento
│   ├── minimum_sections.json         # Seções mínimas por tipo de circuito
│   ├── motor.json                    # Motores trifásicos (potências, correntes, fator de potência)
│   ├── nbr5410_settings.json         # Configurações (seções padrão, fator de potência)
│   ├── neutral_conductor.json        # Dimensionamento do neutro
│   ├── protective_conductor_PE.json  # Dimensionamento do PE
│   ├── temperature_correction.json   # Fatores de correção de temperatura
│   └── voltage_drop.json             # Resistência e reatância para queda de tensão
├── public/                           # Assets estáticos servidos na raiz
│   ├── favicon.svg
│   ├── favicon.ico
│   └── documents/
│       └── DimenVolt-Documentos-Tecnicos.pdf   # Gerado por npm run docs:pdf
├── src/
│   ├── frontend/
│   │   ├── pages/                    # index (landing), calculadora, levantamento, quadro
│   │   ├── scripts/
│   │   │   ├── script.js             # UI da calculadora (usa o motor)
│   │   │   ├── motor_calculo.js      # Motor NBR 5410 (Ib, Iz, seção, queda de tensão)
│   │   │   ├── levantamento.js       # Fluxo do levantamento
│   │   │   ├── quadro.js             # Fluxo do quadro de distribuição
│   │   │   ├── materials-service.js  # Serviço de materiais (estimativa)
│   │   │   └── landing.js            # Interações da landing page
│   │   └── styles/
│   │       ├── tokens.css            # Design system (cores, tipografia, motion)
│   │       ├── landing.css           # Estilos da landing
│   │       ├── style.css             # Estilos da calculadora
│   │       ├── levantamento.css      # Estilos do levantamento
│   │       └── quadro.css            # Estilos do quadro
│   └── reports/                      # Serviços compartilhados de PDF (produção)
│       ├── pdfGenerator.js           # Validação, HTML e PDF (serviço único)
│       ├── report-endpoint.js        # Handler HTTP compartilhado (server local e Vercel)
│       └── pdf-report.js             # Cliente: POST para a API + fallback de impressão
├── local_dev/                        # SOMENTE desenvolvimento local (não vai para produção)
│   ├── server.js                     # Servidor Express local (npm start)
│   ├── tools/
│   │   └── generate-docs.js          # Script npm run docs:pdf (gera public/documents/…)
│   ├── tests/                        # Suíte automatizada (npm test)
│   │   ├── _harness.js               # Helpers: motor in-process, PDF/PNG, contexto de teste
│   │   ├── _report.js                # Renderização do relatório de testes
│   │   ├── service_test.js           # Runner: sobe o server local e executa as suítes
│   │   ├── motor_calculo.test.js     # Suíte do motor de cálculo (calc-golden)
│   │   ├── report_endpoints.test.js  # Suíte do contrato das rotas /api/report/*
│   │   ├── calculation/              # Testes da calculadora (condutores, queda de tensão…)
│   │   └── levantamento/             # Testes do levantamento (UI + PDF)
│   └── test-results/                 # Artefatos gerados (ignorado pelo git; ver TESTING)
│       ├── reports/test-report.pdf   # Relatório final da suíte
│       ├── pdf/                      # PDFs gerados durante os testes
│       ├── previews/                 # Previews em PNG dos relatórios
│       └── logs/                     # Logs do servidor de teste
├── .agents/                          # Configuração de assistente de desenvolvimento
├── .gitignore
├── package.json
├── package-lock.json
├── vercel.json                       # Rewrites para rotas limpas (páginas estáticas)
└── README.md
```

(`node_modules/` é gerado pelo `npm install` e está no `.gitignore`.)

---

## Dados técnicos

As bases técnicas são arquivos JSON em `data/`, consumidos diretamente pelo navegador e também pelo gerador de PDF.

| Arquivo | Conteúdo |
| ------- | -------- |
| `ampacity.json` | Capacidades de condução de corrente por material, isolamento, método de instalação e seção |
| `circuit_breakers.json` | Valores normalizados de disjuntores |
| `grouping_factors.json` | Fatores de agrupamento e de condutores carregados |
| `load_database.json` | Base de cargas de referência |
| `materials.json` | Catálogo de materiais usado na lista do levantamento |
| `minimum_sections.json` | Seções mínimas por tipo de circuito (iluminação, TUG, TUE) |
| `motor.json` | Motores trifásicos de indução: potências, correntes nominais, fator de potência e rendimento |
| `nbr5410_settings.json` | Seções padrão e fator de potência padrão |
| `neutral_conductor.json` | Dimensionamento do condutor neutro |
| `protective_conductor_PE.json` | Dimensionamento do condutor de proteção (PE) |
| `temperature_correction.json` | Fatores de correção por temperatura |
| `voltage_drop.json` | Resistência (R) e reatância (X) por seção |

---

## Instalação e execução

Pré-requisitos: **Node.js 18 ou superior**.

```bash
npm install
npm start        # ou npm run dev
```

O `npm start` executa `local_dev/server.js`: sobe o servidor local de desenvolvimento (Express) em `http://localhost:3000`, servindo as páginas e as mesmas rotas de API de PDF usadas em produção.

O `.npmrc` do projeto configura `puppeteer_skip_download=true`: o Puppeteer **não** baixa o Chrome durante a instalação, o que mantém o `npm install` funcional em Termux/Android (sem build oficial do Chromium) e evita um download desnecessário na Vercel (que usa `@sparticuz/chromium`). Para gerar PDF localmente, aponte `PUPPETEER_EXECUTABLE_PATH` para um Chromium disponível no ambiente.

| Rota | Página |
| ---- | ------ |
| `/` | Landing page |
| `/calculadora` | Calculadora de dimensionamento |
| `/levantamento` | Levantamento elétrico da instalação |
| `/quadro` | Quadro de distribuição |

### Documentação técnica

`npm run docs:pdf` executa `local_dev/tools/generate-docs.js` e gera `public/documents/DimenVolt-Documentos-Tecnicos.pdf` com as tabelas de referência NBR 5410.

---

## Deploy

Em produção o projeto roda inteiramente na Vercel: as páginas em `src/frontend/pages/` são publicadas como estáticas e as rotas de PDF (`/api/report/pdf`, `/api/report/levantamento`, `/api/report/quadro`) são resolvidas pelas serverless functions de `api/report/*`, que usam apenas os serviços compartilhados de `src/reports/`. **Nenhum servidor Express é executado em produção — o `local_dev/` inteiro é dispensável no runtime da Vercel.**

```bash
vercel --prod
```

O `vercel.json` mapeia as rotas limpas (`/`, `/landing`, `/calculadora`, `/levantamento`, `/quadro`) para os arquivos em `src/frontend/pages/`, e os dados em `data/` são servidos como estáticos. Se alguma chamada de API falhar (rede, limite de execução etc.), o fallback client-side reconstrói o relatório no navegador e abre a impressão (salvar como PDF), preservando os mesmos templates e validações.

---

## Testes

A suíte automatizada fica em `local_dev/tests/` e é executada pelo runner `local_dev/tests/service_test.js`, que sobe o `local_dev/server.js` em uma porta livre e roda as suítes contra o navegador real (Puppeteer):

```bash
npm test
```

(equivalente a `node local_dev/tests/service_test.js`)

| Suíte | Arquivos | O que cobre |
| ----- | -------- | ----------- |
| Cálculo | `motor_calculo.test.js`, `calculation/*.test.js` | Motor NBR 5410: condutores, dimensionamento, disjuntores, proteções e queda de tensão |
| Levantamento | `levantamento/*.test.js` | Fluxo de UI do levantamento e geração do PDF (RT-LVT) |
| Endpoints de PDF | `report_endpoints.test.js` | Contrato das rotas `/api/report/*`: payload válido → 200 + `application/pdf`, inválido → 400 + `{ error }` |

Os resultados são gravados em `local_dev/test-results/` (regenerado a cada execução e ignorado pelo git):

- `reports/test-report.pdf` — relatório final da execução (cópia também em `local_dev/test-results/test-report.pdf`);
- `pdf/` — PDFs gerados durante os testes (ex.: `levantamento-fluxo.pdf`);
- `previews/` — capturas de tela (PNG) dos relatórios;
- `logs/` — logs do servidor de teste.

Os helpers comuns (motor in-process, inspeção de PDF/PNG, contexto por teste) ficam em `local_dev/tests/_harness.js`; o relatório de testes é montado por `local_dev/tests/_report.js`. A suíte e o servidor local são código-fonte versionado; apenas `local_dev/test-results/` (saída gerada) é ignorado.

---

## Roadmap

- Salvar e reabrir projetos (localStorage ou conta na nuvem).
- Cálculo de demanda e dimensionamento de alimentadores conforme fatores de demanda da NBR 5410.
- Exportação de plantas e esquemas em formatos CAD.
- Suporte a iluminação conforme NBR ISO/CIE e correção de fator de potência.

---

## Licença

Este projeto é **proprietário** e está licenciado sob **All Rights Reserved** (todos os direitos reservados). Os termos completos estão no arquivo [`LICENSE`](./LICENSE) na raiz do repositório — este aviso no README não substitui a licença completa.

### O que é permitido

- Visualizar e estudar o código-fonte para fins pessoais, educacionais ou de avaliação.
- Clonar o repositório e executar o Software localmente em ambiente de desenvolvimento, para uso pessoal ou de avaliação.
- Referenciar o projeto em portfólios, artigos ou materiais acadêmicos, com a devida atribuição ao titular.

### O que NÃO é permitido (sem autorização prévia e por escrito)

- Copiar, reproduzir, distribuir, publicar ou disponibilizar o Software (ou parte dele) a terceiros.
- Modificar, adaptar, traduzir, descompilar, fazer engenharia reversa ou criar obras derivadas.
- Mesclar o Software (ou parte dele) com outros projetos ou bases de código.
- Sublicenciar, vender, alugar, arrendar ou explorar comercialmente o Software.
- Hospedar o Software (ou parte dele) em servidores, plataformas ou serviços acessíveis ao público.
- Remover, alterar ou ocultar avisos de copyright, créditos, marcas ou outros avisos de propriedade.
- Usar o Software para fins ilegais, fraudulentos ou que violem direitos de terceiros.

### Marca e identidade visual

"DimenVolt", "DimenVolt Studio" e quaisquer logotipos, ícones e elementos visuais associados são marcas do titular. Esta licença não concede direito sobre essas marcas.

### Garantia e responsabilidade

O Software é fornecido "no estado em que se encontra" ("AS IS"), sem garantia de qualquer tipo. O titular não se responsabiliza por danos diretos ou indiretos decorrentes do uso do Software.

### Contato para licenciamento

Para solicitar autorização de uso, cópia, modificação ou redistribuição, entre em contato com o titular: **Isac Ornelas / DimenVolt Studio** (ornelasisac13@gmail.com).

> A versão vigente dos termos é sempre a do arquivo [`LICENSE`](./LICENSE) no repositório.


<p align="center">
  <sub>Desenvolvido com ⚡ por <strong>Isac Ornelas</strong> · DimenVolt Studio</sub>
</p>
