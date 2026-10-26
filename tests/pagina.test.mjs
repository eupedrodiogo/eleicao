import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

const html = ler("index.html");
const css = ler("css/style.css");
const scripts = fs.readdirSync(path.join(raiz, "js")).filter((f) => f.endsWith(".js"));

test("index.html só referencia arquivos que existem", () => {
  const referencias = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|svg|woff2))"/g)].map((m) => m[1]);
  assert.ok(referencias.length >= 10);
  for (const ref of referencias) assert.ok(fs.existsSync(path.join(raiz, ref)), "não existe: " + ref);
});

test("a fonte referenciada no CSS existe", () => {
  const fontes = [...css.matchAll(/url\("\.\.\/([^"]+\.woff2)"\)/g)].map((m) => m[1]);
  assert.ok(fontes.length >= 1);
  for (const f of fontes) assert.ok(fs.existsSync(path.join(raiz, f)), "não existe: " + f);
});

test("todo script de js/ é carregado pela página", () => {
  const carregados = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(carregados.includes(s), s + " não está no index.html");
});

test("os scripts são carregados depois daquilo de que dependem", () => {
  const ordem = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map((m) => m[1]);
  const depende = {
    "ui.js": ["texto.js"],
    "dados.js": ["config.js", "tse.js", "historico.js"],
    "graficos.js": ["ui.js", "texto.js"],
    "mapa.js": ["mapa-dados.js", "tse.js", "ui.js", "texto.js"],
    "app.js": ["config.js", "tse.js", "historico.js", "texto.js", "mapa-dados.js", "ui.js", "dados.js", "graficos.js", "mapa.js"],
  };
  for (const [arquivo, deps] of Object.entries(depende)) {
    for (const dep of deps) assert.ok(ordem.indexOf(dep) >= 0 && ordem.indexOf(dep) < ordem.indexOf(arquivo), dep + " deve vir antes de " + arquivo);
  }
});

test("todo id usado pelo app.js existe no HTML (ou é criado pelo próprio código)", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const app = ler("js/app.js");
  const usados = new Set([...app.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
  // Criados dentro do JS: o aviso para leitores de tela e o contêiner das barras da comparação.
  const criadosPeloCodigo = new Set(["anuncio", "comp-barras"]);
  assert.ok(usados.size > 20);
  for (const id of usados) assert.ok(ids.has(id) || criadosPeloCodigo.has(id), "id sem elemento: #" + id);
});

test("todo termo de ajuda usado existe no glossário", () => {
  const Texto = require("../js/texto.js");
  const app = ler("js/app.js");
  const chaves = [...app.matchAll(/UI\.ajuda\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(chaves.length >= 8);
  for (const c of chaves) assert.ok(Texto.GLOSSARIO[c], "glossário sem: " + c);
  for (const c of ["urnas", "comparecimento", "abstencao", "brancosNulos", "votosValidos", "diferenca", "ponto", "projecao", "eleitorado", "oscilacao"]) {
    assert.ok(Texto.GLOSSARIO[c], c);
  }
});

test("toda variável CSS usada pelo JavaScript está definida no CSS (ou no próprio elemento)", () => {
  const definidas = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // Definidas elemento a elemento, por style inline ou setProperty.
  const locais = new Set(["--c", "--cor", "--sobre", "--fundo", "--texto", "--on"]);
  for (const arquivo of scripts) {
    const codigo = ler("js/" + arquivo);
    for (const m of codigo.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (m[1].endsWith("-")) continue; // prefixo de nome montado em tempo de execução (--on-<cor>, --seq-<n>): conferido abaixo
      assert.ok(definidas.has(m[1]) || locais.has(m[1]), arquivo + " usa " + m[1] + " sem definição");
    }
  }
  // Cores dos candidatos: preenchimento e texto por cima, em claro e em escuro.
  for (const cor of ["vermelho", "azul", "laranja", "violeta", "outros"]) {
    assert.ok(definidas.has("--" + cor) && definidas.has("--on-" + cor), cor);
  }
  for (const k of [1, 2, 3, 4, 5]) assert.ok(definidas.has("--seq-" + k) && definidas.has("--on-seq-" + k));
});

test("as cores definidas em config.js existem como variáveis CSS", () => {
  const config = ler("js/config.js");
  const nomes = new Set([...config.matchAll(/"(vermelho|azul|laranja|violeta)"/g)].map((m) => m[1]));
  assert.ok(nomes.size >= 3);
  for (const n of nomes) assert.ok(css.includes("--" + n + ":"), n);
});

test("o mapa tem as 27 UFs, com contorno e ponto de rótulo dentro do quadro", () => {
  const MAPA = require("../js/mapa-dados.js");
  const TSE = require("../js/tse.js");
  assert.deepEqual(Object.keys(MAPA.ufs).sort(), TSE.UFS.slice().sort());
  assert.ok(MAPA.largura > 400 && MAPA.altura > 400);
  for (const [uf, u] of Object.entries(MAPA.ufs)) {
    assert.match(u.d, /^M[\d. ]+L/, uf + " sem caminho");
    assert.ok(u.x > 0 && u.x < MAPA.largura && u.y > 0 && u.y < MAPA.altura, uf + " rótulo fora do quadro");
    assert.ok(u.area > 50, uf + " área");
    assert.ok(u.nome);
  }
  // O tamanho cresce com a área: o Amazonas é o maior e o DF o menor.
  const porArea = Object.entries(MAPA.ufs).sort((a, b) => b[1].area - a[1].area).map((x) => x[0]);
  assert.equal(porArea[0], "am");
  assert.equal(porArea[porArea.length - 1], "df");
});

test("as perguntas frequentes têm pergunta e resposta", () => {
  const Texto = require("../js/texto.js");
  assert.ok(Texto.PERGUNTAS.length >= 8);
  for (const q of Texto.PERGUNTAS) {
    assert.ok(q.p.endsWith("?"), q.p);
    assert.ok(q.r.length >= 1 && q.r.every((t) => t.length > 20), q.p);
  }
});

test("a página não depende de nenhum recurso externo além do TSE", () => {
  const externos = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  // Só links de navegação (TSE e repositório); nada de scripts, estilos ou fontes de terceiros.
  for (const url of externos) assert.match(url, /^https:\/\/(resultados\.tse\.jus\.br|github\.com)\//, url);
  assert.ok(!/<link[^>]+href="https?:/.test(html), "não carrega CSS/fontes externos");
  assert.ok(!/<script[^>]+src="https?:/.test(html), "não carrega JS externo");
});
