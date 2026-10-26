/**
 * Gera js/mapa-dados.js (contornos simplificados das 27 UFs) a partir de um
 * GeoJSON com os estados do Brasil (malha do IBGE).
 *
 *   node scripts/gerar-mapa.mjs <brazil-states.geojson> [js/mapa-dados.js]
 *
 * Fonte usada: https://github.com/codeforamerica/click_that_hood
 * (public/data/brazil-states.geojson, dados do IBGE). Cada feature precisa ter
 * a propriedade `sigla` (AC, AL, ...).
 *
 * O script projeta (equiretangular com correção de latitude), simplifica cada
 * contorno (Douglas-Peucker), descarta ilhas minúsculas e calcula, para cada
 * estado, o ponto mais "interno" para o rótulo. A saída é um arquivo JS
 * pequeno, sem dependências, que o painel desenha em SVG.
 */
import fs from "node:fs";
import path from "node:path";

const [, , entrada, saida = "js/mapa-dados.js"] = process.argv;
if (!entrada) {
  console.error("uso: node scripts/gerar-mapa.mjs <brazil-states.geojson> [saida.js]");
  process.exit(1);
}

const LARGURA_MAPA = 600; // unidades do viewBox ocupadas pelo país
const TOLERANCIA = 0.55; // simplificação, em unidades do viewBox (~4 km)
const AREA_MINIMA = 14; // ilhas menores que isso (unidades²) são descartadas
const MARGEM = 6;

const geo = JSON.parse(fs.readFileSync(entrada, "utf8"));

// ---- Projeção -----------------------------------------------------------------
let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
function poligonos(feature) {
  const g = feature.geometry;
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}
for (const f of geo.features) {
  for (const poly of poligonos(f)) {
    for (const [lon, lat] of poly[0]) {
      lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    }
  }
}
const cosLat = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
const escala = LARGURA_MAPA / ((lonMax - lonMin) * cosLat);
const projetar = ([lon, lat]) => [(lon - lonMin) * cosLat * escala + MARGEM, (latMax - lat) * escala + MARGEM];

// ---- Geometria ----------------------------------------------------------------
function areaAnel(anel) {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) a += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  return Math.abs(a / 2);
}

function distSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker iterativo (mantém o primeiro e o último ponto). */
function simplificar(pontos, tol) {
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [ini, fim] = pilha.pop();
    let maior = 0, idx = -1;
    for (let i = ini + 1; i < fim; i++) {
      const d = distSegmento(pontos[i], pontos[ini], pontos[fim]);
      if (d > maior) { maior = d; idx = i; }
    }
    if (maior > tol && idx > 0) {
      manter[idx] = 1;
      pilha.push([ini, idx], [idx, fim]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}

function dentro(p, anel) {
  let in_ = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) in_ = !in_;
  }
  return in_;
}

function distBorda(p, aneis) {
  let m = Infinity;
  for (const anel of aneis) for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) m = Math.min(m, distSegmento(p, anel[j], anel[i]));
  return m;
}

/** Ponto interno mais afastado da borda (busca em grade, como o polylabel). */
function pontoInterno(aneis) {
  const xs = aneis[0].map((p) => p[0]), ys = aneis[0].map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let melhor = { p: [(x0 + x1) / 2, (y0 + y1) / 2], d: -1 };
  let passo = Math.max((x1 - x0), (y1 - y0)) / 24;
  let [cx0, cx1, cy0, cy1] = [x0, x1, y0, y1];
  for (let rodada = 0; rodada < 4; rodada++) {
    for (let x = cx0; x <= cx1; x += passo) {
      for (let y = cy0; y <= cy1; y += passo) {
        const p = [x, y];
        if (!dentro(p, aneis[0]) || aneis.slice(1).some((h) => dentro(p, h))) continue;
        const d = distBorda(p, aneis);
        if (d > melhor.d) melhor = { p, d };
      }
    }
    const r = passo * 2;
    [cx0, cx1, cy0, cy1] = [melhor.p[0] - r, melhor.p[0] + r, melhor.p[1] - r, melhor.p[1] + r];
    passo /= 4;
  }
  return melhor.p;
}

const arred = (v) => Math.round(v * 10) / 10;

function caminho(aneis) {
  return aneis
    .map((anel) => "M" + anel.map(([x, y]) => arred(x) + " " + arred(y)).join("L") + "Z")
    .join("");
}

// ---- Montagem -------------------------------------------------------------------
const ufs = {};
let totalPontos = 0;
let larguraMax = 0, alturaMax = 0;
for (const f of geo.features) {
  const sigla = String(f.properties.sigla).toLowerCase();
  const polis = poligonos(f)
    .map((poly) => poly.map((anel) => anel.map(projetar)))
    .map((aneis) => ({ aneis, area: areaAnel(aneis[0]) }))
    .sort((a, b) => b.area - a.area);
  const principal = polis[0];
  const mantidos = polis.filter((p, i) => i === 0 || p.area >= AREA_MINIMA);
  const aneisFinais = [];
  for (const p of mantidos) {
    for (let i = 0; i < p.aneis.length; i++) {
      let anel = simplificar(p.aneis[i], i === 0 ? TOLERANCIA : TOLERANCIA * 1.5);
      if (anel.length < 4) {
        if (i === 0 && p === principal) anel = p.aneis[i].slice(0, Math.max(4, anel.length));
        else continue;
      }
      aneisFinais.push(anel);
      totalPontos += anel.length;
      for (const [x, y] of anel) { larguraMax = Math.max(larguraMax, x); alturaMax = Math.max(alturaMax, y); }
    }
  }
  const simplesPrincipal = [simplificar(principal.aneis[0], TOLERANCIA), ...principal.aneis.slice(1).map((a) => simplificar(a, TOLERANCIA * 1.5))].filter((a) => a.length >= 4);
  const [x, y] = pontoInterno(simplesPrincipal);
  const areaTotal = mantidos.reduce((s, p) => s + p.area, 0);
  ufs[sigla] = { nome: f.properties.name, d: caminho(aneisFinais), x: arred(x), y: arred(y), area: Math.round(areaTotal) };
}

const ordem = Object.keys(ufs).sort();
const dados = {
  largura: Math.ceil(larguraMax + MARGEM),
  altura: Math.ceil(alturaMax + MARGEM),
  ufs: Object.fromEntries(ordem.map((k) => [k, ufs[k]])),
};

const cabecalho = `/**
 * Contornos simplificados das 27 UFs, usados no mapa do painel.
 * GERADO por scripts/gerar-mapa.mjs a partir da malha de estados do IBGE
 * (via github.com/codeforamerica/click_that_hood). Não edite à mão.
 *
 * largura/altura: viewBox do SVG. Em cada UF: d = caminho SVG, x/y = melhor
 * ponto para o rótulo, area = área relativa (para decidir quem recebe rótulo).
 */
`;
const corpo = `(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MAPA_BR = api;
})(typeof self !== "undefined" ? self : this, function () {
  return ${JSON.stringify(dados)};
});
`;
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, cabecalho + corpo);
console.log(`${ordem.length} UFs, ${totalPontos} pontos, viewBox ${dados.largura}x${dados.altura}, ${(fs.statSync(saida).size / 1024).toFixed(1)} KB -> ${saida}`);
