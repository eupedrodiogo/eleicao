import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSE = require("../js/tse.js");
const HISTORICO = require("../js/historico.js");

const fixture = (nome) => JSON.parse(fs.readFileSync(new URL("./fixtures/" + nome, import.meta.url), "utf8"));
const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test("num lê o formato do TSE", () => {
  assert.equal(TSE.num("47,03"), 47.03);
  assert.equal(TSE.num("56104503"), 56104503);
  assert.equal(TSE.num("1.234,5"), 1234.5);
  assert.equal(TSE.num("12.5"), 12.5);
  assert.equal(TSE.num(""), null);
  assert.equal(TSE.num(null), null);
  assert.equal(TSE.num("abc"), null);
});

test("urlResultado monta os caminhos de 2026 (-u) e 2022 (-r)", () => {
  const cfg = { base: "https://resultados.tse.jus.br", ambiente: "oficial" };
  assert.equal(
    TSE.urlResultado(cfg, { codigo: "6258", ciclo: "ele2026", formato: "u" }, "BR", 1),
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json",
  );
  assert.equal(
    TSE.urlResultado(cfg, { codigo: "6260", ciclo: "ele2026", formato: "u" }, "sp", 3),
    "https://resultados.tse.jus.br/oficial/ele2026/6260/dados/sp/sp-c0003-e006260-u.json",
  );
  assert.equal(
    TSE.urlResultado(cfg, { codigo: "545", ciclo: "ele2022", formato: "r" }, "sp", 1),
    "https://resultados.tse.jus.br/oficial/ele2022/545/dados-simplificados/sp/sp-c0001-e000545-r.json",
  );
  assert.equal(TSE.urlFoto(cfg, { codigo: "6258", ciclo: "ele2026" }, "br", "123"), "https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/123.jpeg");
  assert.equal(TSE.urlFoto(cfg, { codigo: "6258", ciclo: "ele2026" }, "br", "x/../1"), "");
});

test("normalizar lê o arquivo unificado de 2026", () => {
  const r = TSE.normalizar(fixture("br-c0001-e006258-u.json"));
  assert.equal(r.eleicao, "6258");
  assert.equal(r.uf, "br");
  assert.equal(r.turno, "2");
  assert.equal(r.pctSecoes, 25);
  assert.equal(r.secoesTotalizadas, 118000);
  assert.equal(r.secoesTotal, 472000);
  assert.equal(r.eleitorado, 158000000);
  assert.equal(r.comparecimento, 31600000);
  assert.equal(r.pctAbstencao, 20);
  assert.equal(r.brancos, 500000);
  assert.equal(r.nulos, 1100000);
  assert.equal(r.pctNulos, 3.48);
  assert.equal(r.validos, 30000000);
  assert.equal(r.finalizada, false);
  assert.equal(r.eleitoradoApurado, 39500000);
  // Ordenado por votos, com sigla do partido.
  assert.deepEqual(r.candidatos.map((c) => c.numero), ["22", "13"]);
  assert.equal(r.candidatos[0].partido, "PL");
  assert.equal(r.candidatos[0].pct, 51);
  assert.equal(r.candidatos[0].segundoTurno, true);
  assert.equal(r.candidatos[0].eleito, false);
  assert.equal(TSE.candidato(r, 13).votos, 14700000);
});

test("normalizar lê o formato simplificado de 2022", () => {
  const r = TSE.normalizar(fixture("sp-c0001-e000545-r.json"));
  assert.equal(r.uf, "sp");
  assert.equal(r.pctSecoes, 100);
  assert.equal(r.finalizada, true);
  assert.equal(r.eleitorado, 34667793);
  assert.equal(r.pctComparecimento, 80.13);
  assert.equal(r.nulos, 1032838);
  const lula = TSE.candidato(r, "13");
  assert.equal(lula.partido, "PT");
  assert.equal(lula.eleito, true);
  assert.equal(lula.pct, 45.93);
});

test("normalizar calcula percentuais ausentes", () => {
  const r = TSE.normalizar({
    ele: "1", cdabr: "AC", t: "2",
    s: { ts: "10", st: "5" },
    e: { te: "1000", c: "300", a: "100" },
    v: { vb: "6", tvn: "4" },
    carg: [{ agr: [{ par: [{ sg: "XX", cand: [{ n: "10", nm: "A", vap: "200" }, { n: "20", nm: "B", vap: "90" }] }] }] }],
  });
  assert.equal(r.pctSecoes, 50);
  assert.equal(r.pctComparecimento, 75);
  assert.equal(r.pctAbstencao, 25);
  assert.equal(r.validos, 290);
  perto(r.pctBrancos, 2);
  perto(r.candidatos[0].pct, 68.97);
  assert.equal(TSE.normalizar(null), null);
});

test("somar recalcula percentuais pelos votos, não pela média", () => {
  const a = TSE.normalizar({ s: { ts: "10", st: "10" }, e: { te: "100", c: "80", a: "20" }, v: { vv: "70", vb: "5", tvn: "5" },
    carg: [{ agr: [{ par: [{ cand: [{ n: "13", vap: "60" }, { n: "22", vap: "10" }] }] }] }] });
  const b = TSE.normalizar({ s: { ts: "30", st: "0" }, e: { te: "900", c: "0", a: "0" }, v: { vv: "0", vb: "0", tvn: "0" },
    carg: [{ agr: [{ par: [{ cand: [{ n: "13", vap: "0" }, { n: "22", vap: "0" }] }] }] }] });
  const c = TSE.normalizar({ s: { ts: "10", st: "10" }, e: { te: "100", c: "90", a: "10" }, v: { vv: "30", vb: "30", tvn: "30" },
    carg: [{ agr: [{ par: [{ cand: [{ n: "13", vap: "0" }, { n: "22", vap: "30" }] }] }] }] });
  const s = TSE.somar([a, b, c, null]);
  assert.equal(s.validos, 100);
  assert.equal(TSE.candidato(s, "13").pct, 60);
  assert.equal(TSE.candidato(s, "22").pct, 40);
  assert.equal(s.pctSecoes, 40);
  assert.equal(s.pctAbstencao, 15);
  assert.equal(TSE.somar([]), null);
});

test("finalistas e margem", () => {
  const r = TSE.normalizar({ s: { ts: "1", st: "1", pst: "100,00" }, v: { vv: "100" },
    carg: [{ agr: [{ par: [{ cand: [
      { n: "30", vap: "50", st: "Não eleito" },
      { n: "13", vap: "30", st: "2º turno" },
      { n: "22", vap: "20", st: "2º turno" },
    ] }] }] }] });
  assert.deepEqual(TSE.finalistas(r).map((c) => c.numero), ["13", "22"]);
  assert.equal(TSE.margem(r, "13", "22"), 10);
  assert.equal(TSE.margem(r, "22", "13"), -10);
  assert.equal(TSE.margem(r, "13", "99"), null);
  const semMarca = TSE.normalizar({ v: { vv: "10" }, carg: [{ agr: [{ par: [{ cand: [{ n: "1", vap: "1" }, { n: "2", vap: "5" }, { n: "3", vap: "4" }] }] }] }] });
  assert.deepEqual(TSE.finalistas(semMarca).map((c) => c.numero), ["2", "3"]);
});

test("projetar estende cada UF para 100% das seções", () => {
  const uf = (st, ts, a, b, te) => TSE.normalizar({ s: { ts: String(ts), st: String(st) }, e: { te: String(te), c: "0", a: "0" }, v: { vv: String(a + b) },
    carg: [{ agr: [{ par: [{ cand: [{ n: "13", vap: String(a) }, { n: "22", vap: String(b) }] }] }] }] });
  const p = TSE.projetar({ x: uf(50, 100, 60, 40, 1000), y: uf(10, 100, 10, 30, 1000) }, ["13", "22"]);
  // x: 120 x 80; y: 100 x 300 → 220 x 380
  assert.equal(p.validos, 600);
  assert.equal(p.candidatos[0].votos, 220);
  assert.equal(p.candidatos[1].votos, 380);
  perto(p.candidatos[1].pct, 63.33);
  assert.equal(p.restantes, 460);
  // UF sem apuração entra pela proporção do eleitorado.
  const q = TSE.projetar({ x: uf(50, 100, 60, 40, 1000), z: uf(0, 100, 0, 0, 1000) }, ["13", "22"]);
  assert.equal(q.validos, 400);
  assert.equal(q.candidatos[0].votos, 240);
  assert.equal(TSE.projetar({}, ["13", "22"]), null);
});

test("descobrirCodigos lê o ele-c.json", () => {
  const cod = TSE.descobrirCodigos(fixture("ele-c.json"), 2026);
  assert.deepEqual(cod, { federal1: "6257", federal2: "6258", estadual1: "6259", estadual2: "6261" });
  const de2022 = TSE.descobrirCodigos(fixture("ele-c.json"), 2022);
  assert.equal(de2022.federal1, "544");
  assert.equal(de2022.federal2, "545");
});

test("dataHora usa o horário de Brasília", () => {
  const d = TSE.dataHora("25/10/2026", "20:01:52");
  assert.equal(d.toISOString(), "2026-10-25T23:01:52.000Z");
  assert.equal(TSE.dataHora("", ""), null);
});

test("histórico embutido confere com os totais oficiais", () => {
  const t1 = HISTORICO.comoResultado(2022, 1);
  assert.equal(t1.validos, 118229719);
  perto(t1.candidatos[0].pct, 48.43);
  perto(t1.pctComparecimento, 79.05);
  const t2 = HISTORICO.comoResultado(2022, 2);
  assert.equal(t2.validos, 118552353);
  perto(t2.candidatos[0].pct, 50.9);
  assert.equal(t2.candidatos[0].eleito, true);
  perto(HISTORICO.comoResultado(2018, 2).candidatos[0].pct, 55.13);
  perto(HISTORICO.comoResultado(2014, 2).candidatos[0].pct, 51.64);
  perto(HISTORICO.comoResultado(2010, 2).candidatos[0].pct, 56.05);
  assert.equal(HISTORICO.comoResultado(2014, 1).validos, 104023802);
  assert.equal(HISTORICO.comoResultado(2010, 1).validos, 101590153);
  assert.equal(HISTORICO.comoResultado(1999, 1), null);
});
