/**
 * Textos do painel: formatação de números em pt-BR, nomes de candidatos e as
 * frases em linguagem simples (manchete, resumos, glossário).
 *
 * Tudo aqui é função pura, sem acesso à página, para poder ser testado.
 * As frases só afirmam o que está nos dados: o painel nunca declara um
 * vencedor por conta própria, só quando o arquivo do TSE marca "eleito".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Texto = api;
})(typeof self !== "undefined" ? self : this, function () {
  // ---- Números -------------------------------------------------------------
  const formatadores = {};
  function nf(casas) {
    if (!formatadores[casas]) {
      formatadores[casas] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    return formatadores[casas];
  }
  const valido = (v) => v != null && typeof v === "number" && Number.isFinite(v);

  /** 1234.5 -> "1.234,50" (2 casas por padrão); sem valor -> "—". */
  function fmtN(v, casas) {
    if (!valido(v)) return "—";
    return nf(casas == null ? 2 : casas).format(v);
  }
  function inteiro(v) {
    return valido(v) ? nf(0).format(Math.round(v)) : "—";
  }
  function pct(v, casas) {
    return valido(v) ? fmtN(v, casas == null ? 1 : casas) + "%" : "—";
  }
  /** "+0,6", "−1,2" (sinal de menos de verdade) ou "0,0" quando arredonda para zero. */
  function sinal(v, casas) {
    if (!valido(v)) return "—";
    const k = casas == null ? 1 : casas;
    const arredondado = Number(v.toFixed(k));
    if (arredondado === 0) return fmtN(0, k);
    return (arredondado > 0 ? "+" : "−") + fmtN(Math.abs(arredondado), k);
  }
  /** Singular até 1,99 ("1,5 ponto"), plural a partir de 2. */
  function plural(n, um, varios) {
    return Math.abs(n) < 2 ? um : varios;
  }
  /** 0,6 -> "0,6 ponto"; 2,3 -> "2,3 pontos". */
  function pontos(v, casas) {
    if (!valido(v)) return "—";
    const k = casas == null ? 1 : casas;
    return fmtN(Math.abs(v), k) + " " + plural(Number(Math.abs(v).toFixed(k)), "ponto", "pontos");
  }
  function votos(n) {
    if (!valido(n)) return "—";
    return inteiro(n) + " " + (Math.round(n) === 1 ? "voto" : "votos");
  }
  /** 37366614 -> "37,4 milhões"; 850000 -> "850 mil". */
  function milhoes(v) {
    if (!valido(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e6) {
      const m = abs / 1e6;
      const arred = Math.round(m * 10) / 10;
      return fmtN(m, m >= 100 ? 0 : 1) + (arred === 1 ? " milhão" : " milhões");
    }
    if (abs >= 1e3) return fmtN(abs / 1e3, 0) + " mil";
    return inteiro(abs);
  }

  // ---- Nomes ---------------------------------------------------------------
  // Os arquivos do TSE trazem o nome de urna em maiúsculas e sem acento.
  const PALAVRAS = {
    FLAVIO: "Flávio", JOSE: "José", JOAO: "João", SERGIO: "Sérgio", MARCIO: "Márcio", ANDRE: "André",
    FABIO: "Fábio", ROGERIO: "Rogério", TARCISIO: "Tarcísio", ANTONIO: "Antônio", JUNIOR: "Júnior",
    GONCALVES: "Gonçalves", LUCIA: "Lúcia", AECIO: "Aécio", ALVARO: "Álvaro", CESAR: "César",
    AMOEDO: "Amoêdo", PERICLES: "Péricles", LEO: "Léo", MOURAO: "Mourão", INACIO: "Inácio",
    JANAINA: "Janaína", HELOISA: "Heloísa", HELIO: "Hélio", VALERIO: "Valério", MAURICIO: "Maurício",
    CELIO: "Célio", CLAUDIO: "Cláudio", AMERICO: "Américo", ZE: "Zé", LUCIO: "Lúcio", MARCIA: "Márcia",
    CARMEM: "Carmem", GILBERTO: "Gilberto", RENATA: "Renata", BARBARA: "Bárbara", ERICA: "Érica",
  };
  const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
  // Com estes, o primeiro nome sozinho não identifica ("Padre Kelmon").
  const TITULOS = new Set([
    "padre", "pastor", "pastora", "doutor", "doutora", "dr", "dra", "cabo", "sargento", "coronel",
    "general", "capitão", "delegado", "delegada", "professor", "professora", "juiz", "juíza",
    "major", "tenente", "bispo", "irmão", "irmã", "soldado", "constituinte",
  ]);

  const semAcento = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "");

  /** "FLAVIO BOLSONARO" -> "Flávio Bolsonaro". */
  function nomeExibicao(nome) {
    const texto = String(nome == null ? "" : nome).trim();
    if (!texto) return "";
    return texto
      .split(/\s+/)
      .map(function (palavra, i) {
        const baixa = palavra.toLowerCase();
        if (i > 0 && PARTICULAS.has(baixa)) return baixa;
        // Nomes compostos ("Ana-Lucia") recebem acento parte por parte.
        return palavra
          .split("-")
          .map(function (parte) {
            const chave = semAcento(parte).toUpperCase();
            if (PALAVRAS[chave]) return PALAVRAS[chave];
            return parte.toLowerCase().replace(/(^|['’])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
          })
          .join("-");
      })
      .join(" ");
  }

  /** Nome para espaços apertados: até 18 letras inteiro; senão primeiro + último. */
  function nomeCurto(nome) {
    const exibicao = nomeExibicao(nome);
    if (exibicao.length <= 18) return exibicao;
    const partes = exibicao.split(" ").filter(function (p) { return !PARTICULAS.has(p); });
    return partes.length > 1 ? partes[0] + " " + partes[partes.length - 1] : exibicao;
  }

  /** "Flávio Bolsonaro" -> "Flávio"; "Padre Kelmon" continua inteiro. */
  function primeiroNome(nome) {
    const exibicao = nomeExibicao(nome);
    const partes = exibicao.split(" ");
    if (partes.length === 1 || TITULOS.has(partes[0].toLowerCase())) return exibicao;
    return partes[0];
  }

  /** Como chamar os dois finalistas no texto corrido; usa o nome inteiro se o primeiro coincidir. */
  function apelidos(nomeA, nomeB) {
    const a = primeiroNome(nomeA);
    const b = primeiroNome(nomeB);
    if (semAcento(a).toLowerCase() === semAcento(b).toLowerCase()) return [nomeExibicao(nomeA), nomeExibicao(nomeB)];
    return [a, b];
  }

  function esc(texto) {
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- Tempo ---------------------------------------------------------------
  /** Milissegundos desde um instante -> "agora há pouco", "há 3 min", "há 2 h". */
  function haQuanto(ms) {
    if (!valido(ms) || ms < 0) return "";
    const seg = Math.round(ms / 1000);
    if (seg < 45) return "agora há pouco";
    const min = Math.round(seg / 60);
    if (min < 60) return "há " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "há " + h + " h";
    const d = Math.round(h / 24);
    return "há " + d + (d === 1 ? " dia" : " dias");
  }

  // ---- Manchete -----------------------------------------------------------
  function achar(r, numero) {
    if (!r || !r.candidatos) return null;
    return r.candidatos.find(function (c) { return c.numero === String(numero); }) || null;
  }

  /**
   * Manchete e frase de abertura do resumo, em linguagem simples.
   *
   * ctx = {
   *   turno: 1 | 2,
   *   status: "ok" | "carregando" | "erro",
   *   resultado: resultado normalizado do Brasil nesse turno (ou null),
   *   finalistas: [{numero, nome}, {numero, nome}],
   *   dataSegundoTurno: "25 de outubro"
   * }
   * Devolve {tipo, titulo, texto, aviso, lider}. `lider` é o número de quem
   * tem mais votos, ou null se não há apuração ou há empate.
   */
  function manchete(ctx) {
    const r = ctx.resultado;
    const fin = ctx.finalistas || [];
    if (!r) {
      if (ctx.status === "erro") {
        return {
          tipo: "erro",
          titulo: "Não conseguimos carregar os dados do TSE agora",
          texto: "Pode ser uma falha de conexão ou uma instabilidade no site do TSE. A página tenta de novo sozinha a cada minuto, e você também pode tentar agora.",
          aviso: null,
          lider: null,
        };
      }
      return { tipo: "carregando", titulo: "Buscando os resultados no TSE…", texto: "Em instantes os números aparecem aqui.", aviso: null, lider: null };
    }
    return ctx.turno === 1 ? mancheteTurno1(ctx, r, fin) : mancheteTurno2(ctx, r, fin);
  }

  function mancheteTurno2(ctx, r, fin) {
    const A = fin[0] && achar(r, fin[0].numero);
    const B = fin[1] && achar(r, fin[1].numero);
    const comecou = A && B && r.pctSecoes > 0 && A.votos + B.votos > 0;
    if (!comecou) {
      return {
        tipo: "espera",
        titulo: "A apuração do 2º turno ainda não começou",
        texto: "Os resultados aparecem aqui assim que o TSE divulgar as primeiras urnas. A página se atualiza sozinha, a cada minuto.",
        aviso: null,
        lider: null,
      };
    }
    const lider = A.votos >= B.votos ? A : B;
    const outro = lider === A ? B : A;
    const [nomeLider, nomeOutro] = apelidos(lider.nome, outro.nome);
    const dif = Math.abs(A.votos - B.votos);
    const difPts = Math.abs((A.pct || 0) - (B.pct || 0));
    const empate = A.votos === B.votos;
    const urnas = pct(r.pctSecoes, 1);
    const placar = empate
      ? nomeLider + " e " + nomeOutro + " têm " + pct(lider.pct, 2) + " dos votos válidos cada um."
      : nomeLider + " tem " + pct(lider.pct, 2) + " dos votos válidos e " + nomeOutro + " tem " + pct(outro.pct, 2) + ". A diferença é de " + votos(dif) + ".";

    if (r.finalizada) {
      if (lider.eleito && !empate) {
        return {
          tipo: "final",
          titulo: nomeExibicao(lider.nome) + " é eleito presidente da República",
          texto: "Com " + urnas + " das urnas apuradas, " + nomeLider + " teve " + pct(lider.pct, 2) + " dos votos válidos, contra " + pct(outro.pct, 2) + " de " + nomeOutro + ". A diferença foi de " + votos(dif) + ".",
          aviso: null,
          lider: lider.numero,
        };
      }
      return {
        tipo: "final-sem-proclamacao",
        titulo: empate ? "Apuração encerrada com os dois candidatos empatados" : "Apuração encerrada: " + nomeExibicao(lider.nome) + " tem mais votos",
        texto: "Com " + urnas + " das urnas apuradas, " + placar + " A proclamação oficial do resultado é feita pelo TSE.",
        aviso: null,
        lider: empate ? null : lider.numero,
      };
    }

    let titulo;
    if (empate) titulo = "Empate na apuração do 2º turno";
    else if (difPts < 2) titulo = "Disputa apertada: " + nomeExibicao(lider.nome) + " tem pequena vantagem";
    else titulo = nomeExibicao(lider.nome) + " lidera a apuração do 2º turno";

    const faltam = Math.max(0, 100 - (r.pctSecoes || 0));
    const aviso = r.pctSecoes < 95
      ? "Ainda faltam " + pct(faltam, 1) + " das urnas, então o resultado pode mudar."
      : "Reta final: restam poucas urnas, mas o resultado ainda pode mudar.";
    return {
      tipo: empate || difPts < 2 ? "apertado" : "andamento",
      titulo: titulo,
      texto: "Com " + urnas + " das urnas apuradas, " + placar,
      aviso: aviso,
      lider: empate ? null : lider.numero,
    };
  }

  function mancheteTurno1(ctx, r, fin) {
    const A = fin[0] && achar(r, fin[0].numero);
    const B = fin[1] && achar(r, fin[1].numero);
    if (!A || !B) {
      return { tipo: "carregando", titulo: "Buscando os resultados do 1º turno…", texto: "Em instantes os números aparecem aqui.", aviso: null, lider: null };
    }
    const [nomeA, nomeB] = apelidos(A.nome, B.nome);
    const vencedor = r.candidatos.find(function (c) { return c.eleito; });
    const data = ctx.dataSegundoTurno ? " em " + ctx.dataSegundoTurno : "";
    if (vencedor) {
      return {
        tipo: "primeiro-eleito",
        titulo: nomeExibicao(vencedor.nome) + " é eleito presidente já no 1º turno",
        texto: nomeExibicao(vencedor.nome) + " passou de 50% dos votos válidos, com " + pct(vencedor.pct, 2) + ".",
        aviso: null,
        lider: vencedor.numero,
      };
    }
    const lider = A.votos >= B.votos ? A : B;
    return {
      tipo: "primeiro-turno",
      titulo: nomeExibicao(A.nome) + " e " + nomeExibicao(B.nome) + " vão para o 2º turno",
      texto: "No 1º turno, " + nomeA + " teve " + pct(A.pct, 2) + " dos votos válidos e " + nomeB + " teve " + pct(B.pct, 2) + ". Como nenhum candidato passou de 50%, os dois se enfrentam" + data + ".",
      aviso: r.finalizada ? null : "A apuração do 1º turno ainda não terminou.",
      lider: lider.numero,
    };
  }

  // ---- Frases de comparação -----------------------------------------------
  /**
   * Quem ganhou terreno entre o 1º e o 2º turno, olhando só os votos dos dois
   * finalistas. `osc` vem de TSE.oscilacao(r1, r2, numeroA, numeroB).
   * Devolve {ganhador: "a"|"b"|null, pontos, destaque, detalhe}.
   */
  function fraseOscilacao(nomeA, nomeB, osc, parcial) {
    if (!osc) return null;
    const [a, b] = apelidos(nomeA, nomeB);
    const mudanca = osc.mudancaA;
    const quase = Math.abs(mudanca) < 0.05;
    const ganhador = quase ? null : mudanca > 0 ? "a" : "b";
    const nomeGanhador = ganhador === "a" ? a : b;
    const destaque = quase
      ? "Praticamente não mudou"
      : nomeGanhador + " ganhou " + pontos(mudanca) + (parcial ? " até agora" : "");
    const detalhe =
      "Entre os votos dados só a " + a + " e " + b + " no 1º turno, " + a + " tinha " + pct(osc.antes.a, 1) + " e " + b + " tinha " + pct(osc.antes.b, 1) +
      ". " + (parcial ? "Nas urnas já apuradas do 2º turno" : "No 2º turno") + ", " + a + " tem " + pct(osc.depois.a, 1) + " e " + b + " tem " + pct(osc.depois.b, 1) + ".";
    return { ganhador: ganhador, pontos: Math.abs(mudanca), destaque: destaque, detalhe: detalhe };
  }

  /** Soma dos demais candidatos no 1º turno e o que acontece com esses votos no 2º. */
  function fraseOutros(pctOutros) {
    if (!valido(pctOutros)) return "";
    return "No 1º turno, os outros candidatos somaram " + pct(pctOutros, 1) + " dos votos válidos. No 2º turno, esses eleitores escolhem um dos dois finalistas, votam em branco ou nulo, ou deixam de votar.";
  }

  // ---- Frases do histórico -------------------------------------------------
  /**
   * serie: [{ano, margem, parcial}] com a diferença, em pontos, entre os dois
   * finalistas no 2º turno de cada eleição (margem sempre positiva).
   */
  function fraseMargemHistorica(serie) {
    const fechados = serie.filter(function (s) { return !s.parcial && valido(s.margem); });
    if (!fechados.length) return "";
    const menor = fechados.reduce(function (m, s) { return s.margem < m.margem ? s : m; });
    let texto = "O 2º turno mais apertado desde " + fechados[0].ano + " foi o de " + menor.ano + ": só " + pontos(menor.margem) + " de diferença entre os dois finalistas.";
    const parcial = serie.find(function (s) { return s.parcial && valido(s.margem); });
    if (parcial) texto += " Em " + parcial.ano + ", com a apuração em andamento, a diferença está em " + pontos(parcial.margem) + ".";
    return texto;
  }

  /**
   * serie: [{ano, v, parcial}], em %. rotulo: "A abstenção" etc.
   */
  function fraseSerie(rotulo, turno, serie) {
    const pontosValidos = serie.filter(function (s) { return valido(s.v); });
    if (pontosValidos.length < 2) return "";
    const ultimo = pontosValidos[pontosValidos.length - 1];
    const anterior = pontosValidos[pontosValidos.length - 2];
    const maior = pontosValidos.reduce(function (m, s) { return s.v > m.v ? s : m; });
    const parcial = ultimo.parcial ? " (parcial)" : "";
    let texto = rotulo + " no " + turno + "º turno foi de " + pct(ultimo.v, 1) + " em " + ultimo.ano + parcial + ", contra " + pct(anterior.v, 1) + " em " + anterior.ano + ".";
    if (maior.ano !== ultimo.ano) texto += " O maior nível desde " + pontosValidos[0].ano + " foi o de " + maior.ano + " (" + pct(maior.v, 1) + ").";
    else texto += " É o maior nível desde " + pontosValidos[0].ano + ".";
    return texto;
  }

  // ---- Glossário -------------------------------------------------------------
  const GLOSSARIO = {
    votosValidos: {
      termo: "Votos válidos",
      texto: "São os votos dados a candidatos. Brancos e nulos não entram na conta. O percentual de cada candidato é calculado só em cima dos votos válidos, e vence quem tiver mais da metade deles.",
    },
    urnas: {
      termo: "Urnas apuradas",
      texto: "Cada seção eleitoral tem uma urna eletrônica. Quando a votação acaba, ela envia o resultado ao TSE. “Urnas apuradas” é a parte dessas urnas que já teve o resultado somado.",
    },
    comparecimento: {
      termo: "Comparecimento",
      texto: "Quantos eleitores foram votar, em relação ao total de eleitores das urnas que já foram apuradas.",
    },
    abstencao: {
      termo: "Abstenção",
      texto: "Eleitores que poderiam votar, mas não foram. O percentual é calculado sobre o eleitorado das urnas já apuradas.",
    },
    brancosNulos: {
      termo: "Brancos e nulos",
      texto: "Voto em branco é quando o eleitor não escolhe ninguém. Voto nulo é quando digita um número que não existe ou anula o voto. Nenhum dos dois conta para candidato algum. Os percentuais são sobre quem compareceu.",
    },
    ponto: {
      termo: "Ponto percentual",
      texto: "É a diferença entre dois percentuais. Se um candidato vai de 48% para 50%, ele ganhou 2 pontos percentuais.",
    },
    diferenca: {
      termo: "Diferença",
      texto: "Quantos votos separam os dois candidatos. Em pontos, é a diferença entre os percentuais de cada um.",
    },
    projecao: {
      termo: "Projeção",
      texto: "É uma estimativa deste painel, não do TSE: se os votos que faltam seguirem a mesma proporção já vista em cada estado, o resultado final seria este. Ela erra quando as urnas restantes votam diferente das primeiras.",
    },
    eleitorado: {
      termo: "Eleitorado",
      texto: "Total de pessoas aptas a votar.",
    },
    oscilacao: {
      termo: "Quem ganhou terreno",
      texto: "No 1º turno há vários candidatos e no 2º só dois, então os percentuais sobem para todos. Para comparar de forma justa, olhamos só os votos dos dois finalistas em cada turno.",
    },
  };

  // ---- Perguntas frequentes --------------------------------------------------
  const PERGUNTAS = [
    {
      p: "Como funciona o 2º turno?",
      r: [
        "Quando nenhum candidato a presidente passa de 50% dos votos válidos no 1º turno, os dois mais votados disputam o 2º turno.",
        "No 2º turno vence quem tiver mais votos válidos. Como são só dois candidatos, isso significa mais da metade deles.",
      ],
    },
    { p: "O que são votos válidos?", r: [GLOSSARIO.votosValidos.texto] },
    {
      p: "O que significa “urnas apuradas”?",
      r: [GLOSSARIO.urnas.texto, "O resultado de cada urna chega ao TSE em um boletim, e é a soma desses boletins que forma o resultado."],
    },
    {
      p: "Por que o placar muda durante a noite?",
      r: [
        "Cada urna que chega ao TSE entra na soma. Estados e cidades têm perfis de voto diferentes e as urnas chegam em ritmos diferentes, então o placar parcial pode mudar bastante até a última urna.",
        "Por isso, quanto mais urnas apuradas, mais confiável é o resultado parcial.",
      ],
    },
    { p: "O que são abstenção, voto em branco e voto nulo?", r: [GLOSSARIO.abstencao.texto, GLOSSARIO.brancosNulos.texto] },
    { p: "O que é “ponto percentual”?", r: [GLOSSARIO.ponto.texto] },
    {
      p: "Por que não dá para comparar o 1º e o 2º turno direto?",
      r: [
        GLOSSARIO.oscilacao.texto,
        "Exemplo: um candidato com 47% no 1º turno e 50% no 2º não ganhou necessariamente 3 pontos de apoio, porque parte do aumento vem dos votos dos candidatos que ficaram de fora.",
      ],
    },
    {
      p: "O que mostra a projeção? Posso confiar nela?",
      r: [GLOSSARIO.projecao.texto, "Use como uma pista, nunca como resultado. Quem declara o vencedor é o TSE."],
    },
    {
      p: "De onde vêm os números? Este painel é oficial?",
      r: [
        "Os números vêm dos arquivos públicos de divulgação de resultados do TSE, os mesmos usados pelo site e pelo aplicativo Resultados. Este painel é independente: não tem vínculo com o TSE nem com campanhas.",
        "O resultado oficial é sempre o divulgado pelo TSE.",
      ],
    },
    {
      p: "Com que frequência os dados são atualizados?",
      r: ["Enquanto a apuração está em andamento, a página consulta o TSE a cada minuto e se atualiza sozinha. O horário do último arquivo do TSE aparece no resumo."],
    },
  ];

  return {
    fmtN: fmtN,
    inteiro: inteiro,
    pct: pct,
    sinal: sinal,
    plural: plural,
    pontos: pontos,
    votos: votos,
    milhoes: milhoes,
    nomeExibicao: nomeExibicao,
    nomeCurto: nomeCurto,
    primeiroNome: primeiroNome,
    apelidos: apelidos,
    esc: esc,
    haQuanto: haQuanto,
    manchete: manchete,
    fraseOscilacao: fraseOscilacao,
    fraseOutros: fraseOutros,
    fraseMargemHistorica: fraseMargemHistorica,
    fraseSerie: fraseSerie,
    GLOSSARIO: GLOSSARIO,
    PERGUNTAS: PERGUNTAS,
  };
});
