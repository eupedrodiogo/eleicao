/**
 * Resultados nacionais consolidados das eleições presidenciais anteriores
 * (fonte: TSE, totalização final). Ficam embutidos porque não mudam e para o
 * painel ter comparação histórica mesmo se o TSE estiver fora do ar.
 *
 * eleitorado = te, comparecimento = c, brancos = vb, nulos = vn.
 * Votos válidos = soma dos candidatos. Percentuais são calculados na tela.
 *
 * O 1º turno de 2026 também tem um retrato final (os dois mais votados),
 * usado só se o arquivo oficial da eleição 6257 não puder ser lido.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HISTORICO = api;
})(typeof self !== "undefined" ? self : this, function () {
  function c(nome, partido, numero, votos) {
    return { nome: nome, partido: partido, numero: String(numero), votos: votos };
  }

  const ELEICOES = [
    {
      ano: 2010,
      turnos: {
        1: {
          te: 135804433, c: 111193747, vb: 3479340, vn: 6124254,
          candidatos: [
            c("Dilma Rousseff", "PT", 13, 47651434),
            c("José Serra", "PSDB", 45, 33132283),
            c("Marina Silva", "PV", 43, 19636359),
            c("Plínio de Arruda Sampaio", "PSOL", 50, 886816),
            c("Eymael", "PSDC", 27, 89350),
            c("Zé Maria", "PSTU", 16, 84609),
            c("Levy Fidelix", "PRTB", 28, 57960),
            c("Ivan Pinheiro", "PCB", 21, 39136),
            c("Rui Costa Pimenta", "PCO", 29, 12206),
          ],
        },
        2: {
          te: 135804433, c: 106606214, vb: 2452597, vn: 4689428,
          candidatos: [c("Dilma Rousseff", "PT", 13, 55752529), c("José Serra", "PSDB", 45, 43711388)],
        },
      },
    },
    {
      ano: 2014,
      turnos: {
        1: {
          te: 142822046, c: 115122883, vb: 4420488, vn: 6678592,
          candidatos: [
            c("Dilma Rousseff", "PT", 13, 43267668),
            c("Aécio Neves", "PSDB", 45, 34897211),
            c("Marina Silva", "PSB", 40, 22176619),
            c("Luciana Genro", "PSOL", 50, 1612186),
            c("Pastor Everaldo", "PSC", 20, 780513),
            c("Eduardo Jorge", "PV", 43, 630099),
            c("Levy Fidelix", "PRTB", 28, 446878),
            c("Zé Maria", "PSTU", 16, 91209),
            c("Eymael", "PSDC", 27, 61250),
            c("Mauro Iasi", "PCB", 21, 47845),
            c("Rui Costa Pimenta", "PCO", 29, 12324),
          ],
        },
        2: {
          te: 142822046, c: 112683879, vb: 1921819, vn: 5219787,
          candidatos: [c("Dilma Rousseff", "PT", 13, 54501118), c("Aécio Neves", "PSDB", 45, 51041155)],
        },
      },
    },
    {
      ano: 2018,
      turnos: {
        1: {
          te: 147306275, c: 117364654, vb: 3106937, vn: 7206205,
          candidatos: [
            c("Jair Bolsonaro", "PSL", 17, 49277010),
            c("Fernando Haddad", "PT", 13, 31342051),
            c("Ciro Gomes", "PDT", 12, 13344371),
            c("Geraldo Alckmin", "PSDB", 45, 5096350),
            c("João Amoêdo", "NOVO", 30, 2679745),
            c("Cabo Daciolo", "PATRIOTA", 51, 1348323),
            c("Henrique Meirelles", "MDB", 15, 1288950),
            c("Marina Silva", "REDE", 18, 1069578),
            c("Alvaro Dias", "PODE", 19, 859601),
            c("Guilherme Boulos", "PSOL", 50, 617122),
            c("Vera Lúcia", "PSTU", 16, 55762),
            c("Eymael", "DC", 27, 41710),
            c("João Goulart Filho", "PPL", 54, 30176),
          ],
        },
        2: {
          te: 147306275, c: 115933451, vb: 2486593, vn: 8608105,
          candidatos: [c("Jair Bolsonaro", "PSL", 17, 57797847), c("Fernando Haddad", "PT", 13, 47040906)],
        },
      },
    },
    {
      ano: 2022,
      turnos: {
        1: {
          te: 156454011, c: 123682372, vb: 1964779, vn: 3487874,
          candidatos: [
            c("Lula", "PT", 13, 57259504),
            c("Jair Bolsonaro", "PL", 22, 51072345),
            c("Simone Tebet", "MDB", 15, 4915423),
            c("Ciro Gomes", "PDT", 12, 3599287),
            c("Soraya Thronicke", "UNIÃO", 44, 600955),
            c("Felipe d'Avila", "NOVO", 30, 559708),
            c("Padre Kelmon", "PTB", 14, 81129),
            c("Léo Péricles", "UP", 80, 53519),
            c("Sofia Manzano", "PCB", 21, 45620),
            c("Vera Lúcia", "PSTU", 16, 25625),
            c("Constituinte Eymael", "DC", 27, 16604),
          ],
        },
        2: {
          te: 156454011, c: 124252796, vb: 1769678, vn: 3930765,
          candidatos: [c("Lula", "PT", 13, 60345999), c("Jair Bolsonaro", "PL", 22, 58206354)],
        },
      },
    },
  ];

  // Retrato final do 1º turno de 2026 (eleição 6257, arquivo oficial do
  // Brasil de 05/10/2026 12:51:47). Só os dois mais votados.
  const PRIMEIRO_TURNO_2026 = {
    ano: 2026,
    turno: 1,
    soDoisPrimeiros: true,
    candidatos: [
      { nome: "FLAVIO BOLSONARO", partido: "PL", numero: "22", votos: 56104503, pct: 47.03 },
      { nome: "LULA", partido: "PT", numero: "13", votos: 53879538, pct: 45.16 },
    ],
  };

  /** Converte um turno embutido no formato normalizado de TSE.normalizar. */
  function comoResultado(ano, turno) {
    const eleicao = ELEICOES.find(function (e) { return e.ano === ano; });
    const t = eleicao && eleicao.turnos[turno];
    if (!t) return null;
    const validos = t.candidatos.reduce(function (s, x) { return s + x.votos; }, 0);
    const abstencao = t.te - t.c;
    const candidatos = t.candidatos
      .map(function (x, i) {
        return {
          numero: x.numero,
          sq: "",
          nome: x.nome,
          partido: x.partido,
          votos: x.votos,
          pct: (x.votos / validos) * 100,
          situacao: "",
          eleito: turno === 2 && i === 0,
          segundoTurno: false,
        };
      })
      .sort(function (a, b) { return b.votos - a.votos; });
    if (turno === 2) candidatos.forEach(function (x, i) { x.eleito = i === 0; });
    return {
      eleicao: "hist-" + ano + "-" + turno,
      uf: "br",
      turno: String(turno),
      dg: "",
      hg: "",
      finalizada: true,
      secoesTotalizadas: null,
      secoesTotal: null,
      pctSecoes: 100,
      eleitorado: t.te,
      eleitoradoApurado: t.te,
      comparecimento: t.c,
      abstencao: abstencao,
      pctComparecimento: (t.c / t.te) * 100,
      pctAbstencao: (abstencao / t.te) * 100,
      validos: validos,
      brancos: t.vb,
      nulos: t.vn,
      pctValidos: (validos / t.c) * 100,
      pctBrancos: (t.vb / t.c) * 100,
      pctNulos: (t.vn / t.c) * 100,
      candidatos: candidatos,
    };
  }

  return {
    ELEICOES: ELEICOES,
    PRIMEIRO_TURNO_2026: PRIMEIRO_TURNO_2026,
    comoResultado: comoResultado,
    anos: ELEICOES.map(function (e) { return e.ano; }),
  };
});
