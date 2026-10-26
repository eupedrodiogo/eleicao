import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Texto = require("../js/texto.js");
const TSE = require("../js/tse.js");

/** Resultado normalizado mínimo para os testes de frase. */
function resultado({ pctSecoes = 62.4, a = 37366614, b = 36626682, finalizada = false, eleitoA = false, eleitoB = false } = {}) {
  const validos = a + b;
  return {
    pctSecoes, finalizada, validos,
    candidatos: [
      { numero: "22", nome: "FLAVIO BOLSONARO", partido: "PL", votos: a, pct: (a / validos) * 100, eleito: eleitoA, segundoTurno: true },
      { numero: "13", nome: "LULA", partido: "PT", votos: b, pct: (b / validos) * 100, eleito: eleitoB, segundoTurno: true },
    ].sort((x, y) => y.votos - x.votos),
  };
}
const fin = [{ numero: "22", nome: "FLAVIO BOLSONARO" }, { numero: "13", nome: "LULA" }];

test("números em pt-BR", () => {
  assert.equal(Texto.fmtN(1234.5), "1.234,50");
  assert.equal(Texto.fmtN(null), "—");
  assert.equal(Texto.inteiro(739932.4), "739.932");
  assert.equal(Texto.pct(50.5, 2), "50,50%");
  assert.equal(Texto.pct(undefined), "—");
  assert.equal(Texto.sinal(0.62), "+0,6");
  assert.equal(Texto.sinal(-1.24), "−1,2");
  assert.equal(Texto.sinal(0.02), "0,0");
  assert.equal(Texto.sinal(NaN), "—");
});

test("plural de pontos e votos", () => {
  assert.equal(Texto.pontos(0.6), "0,6 ponto");
  assert.equal(Texto.pontos(1.5), "1,5 ponto");
  assert.equal(Texto.pontos(2), "2,0 pontos");
  assert.equal(Texto.pontos(-3.26), "3,3 pontos");
  assert.equal(Texto.votos(1), "1 voto");
  assert.equal(Texto.votos(739932), "739.932 votos");
});

test("milhões e mil", () => {
  assert.equal(Texto.milhoes(37366614), "37,4 milhões");
  assert.equal(Texto.milhoes(1000000), "1,0 milhão");
  assert.equal(Texto.milhoes(158000000), "158 milhões");
  assert.equal(Texto.milhoes(850000), "850 mil");
  assert.equal(Texto.milhoes(640), "640");
});

test("nomes dos candidatos ganham acento e caixa certa", () => {
  assert.equal(Texto.nomeExibicao("FLAVIO BOLSONARO"), "Flávio Bolsonaro");
  assert.equal(Texto.nomeExibicao("LULA"), "Lula");
  assert.equal(Texto.nomeExibicao("RATINHO JUNIOR"), "Ratinho Júnior");
  assert.equal(Texto.nomeExibicao("MARIA DA SILVA"), "Maria da Silva");
  assert.equal(Texto.nomeExibicao("ANA-LUCIA D'AVILA"), "Ana-Lúcia D'Avila");
  assert.equal(Texto.nomeExibicao(""), "");
  assert.equal(Texto.nomeExibicao(null), "");
  assert.equal(Texto.nomeCurto("JOSE ANTONIO DE OLIVEIRA SANTOS"), "José Santos");
  assert.equal(Texto.nomeCurto("LULA"), "Lula");
  assert.equal(Texto.primeiroNome("FLAVIO BOLSONARO"), "Flávio");
  assert.equal(Texto.primeiroNome("PADRE KELMON"), "Padre Kelmon");
});

test("apelidos usam o nome inteiro quando o primeiro nome é igual", () => {
  assert.deepEqual(Texto.apelidos("FLAVIO BOLSONARO", "LULA"), ["Flávio", "Lula"]);
  assert.deepEqual(Texto.apelidos("JOSE SILVA", "JOSÉ SOUZA"), ["José Silva", "José Souza"]);
});

test("esc protege o HTML", () => {
  assert.equal(Texto.esc(`<b>"a" & 'b'</b>`), "&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;");
});

test("haQuanto", () => {
  assert.equal(Texto.haQuanto(10_000), "agora há pouco");
  assert.equal(Texto.haQuanto(3 * 60_000), "há 3 min");
  assert.equal(Texto.haQuanto(2 * 3600_000), "há 2 h");
  assert.equal(Texto.haQuanto(24 * 3600_000), "há 1 dia");
  assert.equal(Texto.haQuanto(-5), "");
});

test("manchete: carregando e erro", () => {
  assert.equal(Texto.manchete({ turno: 2, status: "carregando", resultado: null, finalistas: [] }).tipo, "carregando");
  const erro = Texto.manchete({ turno: 2, status: "erro", resultado: null, finalistas: [] });
  assert.equal(erro.tipo, "erro");
  assert.match(erro.titulo, /Não conseguimos carregar/);
});

test("manchete: apuração ainda não começou", () => {
  const m = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ pctSecoes: 0, a: 0, b: 0 }), finalistas: fin });
  assert.equal(m.tipo, "espera");
  assert.equal(m.lider, null);
  assert.match(m.titulo, /ainda não começou/);
});

test("manchete: apuração em andamento", () => {
  // 52,05% x 47,95%: vantagem de 4 pontos, "lidera"
  const m = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ a: 38_000_000, b: 35_000_000 }), finalistas: fin });
  assert.equal(m.tipo, "andamento");
  assert.equal(m.lider, "22");
  assert.equal(m.titulo, "Flávio Bolsonaro lidera a apuração do 2º turno");
  assert.equal(
    m.texto,
    "Com 62,4% das urnas apuradas, Flávio tem 52,05% dos votos válidos e Lula tem 47,95%. A diferença é de 3.000.000 votos.",
  );
  assert.equal(m.aviso, "Ainda faltam 37,6% das urnas, então o resultado pode mudar.");
});

test("manchete: 1 ponto de diferença já é disputa apertada", () => {
  const m = Texto.manchete({ turno: 2, status: "ok", resultado: resultado(), finalistas: fin });
  assert.equal(m.tipo, "apertado");
  assert.equal(m.lider, "22");
  assert.equal(m.titulo, "Disputa apertada: Flávio Bolsonaro tem pequena vantagem");
  assert.equal(
    m.texto,
    "Com 62,4% das urnas apuradas, Flávio tem 50,50% dos votos válidos e Lula tem 49,50%. A diferença é de 739.932 votos.",
  );
});

test("manchete: disputa apertada e empate", () => {
  const apertado = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ a: 5010, b: 4990 }), finalistas: fin });
  assert.equal(apertado.tipo, "apertado");
  assert.equal(apertado.titulo, "Disputa apertada: Flávio Bolsonaro tem pequena vantagem");
  const empate = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ a: 5000, b: 5000 }), finalistas: fin });
  assert.equal(empate.titulo, "Empate na apuração do 2º turno");
  assert.equal(empate.lider, null);
  assert.match(empate.texto, /50,00% dos votos válidos cada um/);
});

test("manchete: líder muda de lado conforme os votos", () => {
  const m = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ a: 30_000_000, b: 40_000_000 }), finalistas: fin });
  assert.equal(m.lider, "13");
  assert.equal(m.titulo, "Lula lidera a apuração do 2º turno");
});

test("manchete: reta final avisa que ainda pode mudar", () => {
  const m = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ pctSecoes: 97.2 }), finalistas: fin });
  assert.match(m.aviso, /Reta final/);
});

test("manchete: só declara eleito quando o TSE marca", () => {
  const eleito = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ pctSecoes: 100, finalizada: true, eleitoA: true }), finalistas: fin });
  assert.equal(eleito.tipo, "final");
  assert.equal(eleito.titulo, "Flávio Bolsonaro é eleito presidente da República");
  assert.equal(eleito.aviso, null);

  const semMarca = Texto.manchete({ turno: 2, status: "ok", resultado: resultado({ pctSecoes: 100, finalizada: true }), finalistas: fin });
  assert.equal(semMarca.tipo, "final-sem-proclamacao");
  assert.equal(semMarca.titulo, "Apuração encerrada: Flávio Bolsonaro tem mais votos");
  assert.match(semMarca.texto, /proclamação oficial do resultado é feita pelo TSE/);
});

test("manchete do 1º turno", () => {
  const r = resultado({ pctSecoes: 100, finalizada: true });
  r.candidatos.push({ numero: "12", nome: "CIRO GOMES", votos: 1, pct: 3, eleito: false, segundoTurno: false });
  const m = Texto.manchete({ turno: 1, status: "ok", resultado: r, finalistas: fin, dataSegundoTurno: "25 de outubro" });
  assert.equal(m.tipo, "primeiro-turno");
  assert.equal(m.titulo, "Flávio Bolsonaro e Lula vão para o 2º turno");
  assert.match(m.texto, /Como nenhum candidato passou de 50%, os dois se enfrentam em 25 de outubro\.$/);

  const eleitoLogo = resultado({ pctSecoes: 100, finalizada: true, eleitoB: true });
  const m2 = Texto.manchete({ turno: 1, status: "ok", resultado: eleitoLogo, finalistas: fin });
  assert.equal(m2.tipo, "primeiro-eleito");
  assert.equal(m2.titulo, "Lula é eleito presidente já no 1º turno");
});

test("fraseOscilacao: compara só os votos dos dois finalistas", () => {
  const r1 = resultado({ pctSecoes: 100, finalizada: true, a: 56104503, b: 53879538 });
  const r2 = resultado({ a: 37366614, b: 36626682 });
  const osc = TSE.oscilacao(r1, r2, "22", "13");
  const f = Texto.fraseOscilacao("FLAVIO BOLSONARO", "LULA", osc, true);
  // 1º turno entre os dois: 51,0% x 49,0%; agora 50,5% x 49,5%: Lula ganhou ~0,5.
  assert.equal(f.ganhador, "b");
  assert.equal(f.destaque, "Lula ganhou 0,5 ponto até agora");
  assert.match(f.detalhe, /Flávio tinha 51,0% e Lula tinha 49,0%/);
  assert.match(f.detalhe, /Nas urnas já apuradas do 2º turno, Flávio tem 50,5% e Lula tem 49,5%/);

  const igual = Texto.fraseOscilacao("A", "B", { antes: { a: 50, b: 50 }, depois: { a: 50.01, b: 49.99 }, mudancaA: 0.01 }, false);
  assert.equal(igual.ganhador, null);
  assert.equal(igual.destaque, "Praticamente não mudou");
  assert.equal(Texto.fraseOscilacao("A", "B", null, false), null);
});

test("fraseOutros", () => {
  assert.match(Texto.fraseOutros(7.8), /os outros candidatos somaram 7,8% dos votos válidos/);
  assert.equal(Texto.fraseOutros(null), "");
});

test("frases do histórico", () => {
  const serie = [
    { ano: 2010, margem: 12.1 }, { ano: 2014, margem: 3.3 }, { ano: 2018, margem: 10.3 },
    { ano: 2022, margem: 1.8 }, { ano: 2026, margem: 1.0, parcial: true },
  ];
  assert.equal(
    Texto.fraseMargemHistorica(serie),
    "O 2º turno mais apertado desde 2010 foi o de 2022: só 1,8 ponto de diferença entre os dois finalistas. Em 2026, com a apuração em andamento, a diferença está em 1,0 ponto.",
  );
  assert.equal(Texto.fraseMargemHistorica([]), "");

  const abst = [
    { ano: 2010, v: 21.3 }, { ano: 2014, v: 21.1 }, { ano: 2018, v: 21.3 }, { ano: 2022, v: 20.6 }, { ano: 2026, v: 21.0, parcial: true },
  ];
  assert.equal(
    Texto.fraseSerie("A abstenção", 2, abst),
    "A abstenção no 2º turno foi de 21,0% em 2026 (parcial), contra 20,6% em 2022. O maior nível desde 2010 foi o de 2010 (21,3%).",
  );
  assert.equal(Texto.fraseSerie("A abstenção", 2, [{ ano: 2022, v: 20 }]), "");
});

test("glossário tem texto para os termos usados no painel", () => {
  for (const chave of ["votosValidos", "urnas", "comparecimento", "abstencao", "brancosNulos", "ponto", "projecao", "oscilacao"]) {
    assert.ok(Texto.GLOSSARIO[chave].termo && Texto.GLOSSARIO[chave].texto.length > 30, chave);
  }
});
