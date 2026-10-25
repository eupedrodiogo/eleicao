/**
 * Acesso e leitura dos arquivos públicos de resultado do TSE.
 *
 * Ciclo 2026: arquivo de resultado unificado (EA20), sufixo -u.json
 *   {base}/{ambiente}/ele2026/{eleicao}/dados/{uf}/{uf}-c{cargo 4}-e{eleicao 6}-u.json
 * Ciclo 2022 e anteriores: "dados-simplificados", sufixo -r.json
 *   {base}/{ambiente}/ele2022/{eleicao}/dados-simplificados/{uf}/{uf}-c{cargo 4}-e{eleicao 6}-r.json
 *
 * As duas leituras são normalizadas para o mesmo formato (ver `normalizar`),
 * então o restante do painel não precisa saber de que ciclo veio o dado.
 * Funciona no navegador (window.TSE) e no Node (module.exports), para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TSE = api;
})(typeof self !== "undefined" ? self : this, function () {
  const UFS = [
    "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa",
    "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to",
  ];

  const NOMES = {
    br: "Brasil", zz: "Exterior", ac: "Acre", al: "Alagoas", am: "Amazonas", ap: "Amapá",
    ba: "Bahia", ce: "Ceará", df: "Distrito Federal", es: "Espírito Santo", go: "Goiás",
    ma: "Maranhão", mg: "Minas Gerais", ms: "Mato Grosso do Sul", mt: "Mato Grosso",
    pa: "Pará", pb: "Paraíba", pe: "Pernambuco", pi: "Piauí", pr: "Paraná",
    rj: "Rio de Janeiro", rn: "Rio Grande do Norte", ro: "Rondônia", rr: "Roraima",
    rs: "Rio Grande do Sul", sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo",
    to: "Tocantins",
  };

  const REGIOES = [
    { id: "norte", nome: "Norte", ufs: ["ac", "ap", "am", "pa", "ro", "rr", "to"] },
    { id: "nordeste", nome: "Nordeste", ufs: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"] },
    { id: "centro-oeste", nome: "Centro-Oeste", ufs: ["df", "go", "ms", "mt"] },
    { id: "sudeste", nome: "Sudeste", ufs: ["es", "mg", "rj", "sp"] },
    { id: "sul", nome: "Sul", ufs: ["pr", "rs", "sc"] },
  ];

  // Sigla pelo número, para arquivos que não trazem a sigla (2022) ou não a
  // trazem num campo próprio. Para presidente e governador o número do
  // candidato é o número do partido.
  const SIGLAS = {
    10: "REPUBLICANOS", 11: "PP", 12: "PDT", 13: "PT", 14: "PTB", 15: "MDB", 16: "PSTU",
    17: "PSL", 18: "REDE", 19: "PODE", 20: "PSC", 21: "PCB", 22: "PL", 23: "CIDADANIA",
    25: "PRD", 27: "DC", 28: "PRTB", 29: "PCO", 30: "NOVO", 33: "MOBILIZA", 35: "PMB",
    36: "AGIR", 40: "PSB", 43: "PV", 44: "UNIÃO", 45: "PSDB", 50: "PSOL", 55: "PSD",
    65: "PCdoB", 70: "AVANTE", 77: "SOLIDARIEDADE", 80: "UP", 90: "PROS",
  };

  /** "47,03" -> 47.03; "56104503" -> 56104503; vazio ou inválido -> null. */
  function num(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let texto = String(value).trim();
    // Formato do TSE: vírgula decimal ("47,03"). Sem vírgula, lê como está.
    if (texto.indexOf(",") >= 0) texto = texto.replace(/\./g, "").replace(",", ".");
    if (texto === "") return null;
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }

  function pct(parte, total) {
    if (parte == null || !total) return null;
    return (parte / total) * 100;
  }

  function primeiro() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] != null) return arguments[i];
    }
    return null;
  }

  /** URL do arquivo de resultado de uma eleição/cargo/abrangência. */
  function urlResultado(config, eleicao, uf, cargo) {
    const abr = String(uf).toLowerCase();
    const c = String(cargo || 1).padStart(4, "0");
    const e = String(eleicao.codigo).padStart(6, "0");
    const prefixo = (config.base || "") + "/" + (config.ambiente || "oficial") + "/" + eleicao.ciclo + "/" + eleicao.codigo;
    if (eleicao.formato === "r") {
      return prefixo + "/dados-simplificados/" + abr + "/" + abr + "-c" + c + "-e" + e + "-r.json";
    }
    return prefixo + "/dados/" + abr + "/" + abr + "-c" + c + "-e" + e + "-u.json";
  }

  function urlFoto(config, eleicao, uf, sqcand) {
    if (!/^\d+$/.test(String(sqcand || ""))) return "";
    return (config.base || "") + "/" + (config.ambiente || "oficial") + "/" + eleicao.ciclo + "/" +
      eleicao.codigo + "/fotos/" + String(uf).toLowerCase() + "/" + sqcand + ".jpeg";
  }

  function urlConfig(config) {
    return (config.base || "") + "/" + (config.ambiente || "oficial") + "/comum/config/ele-c.json";
  }

  function situacao(cand) {
    const st = String(cand.st || "");
    const eleito = /^eleito/i.test(st) || String(cand.e || "").toLowerCase() === "s";
    const segundoTurno = /2.?\s*turno/i.test(st);
    return { texto: st, eleito: eleito, segundoTurno: segundoTurno };
  }

  function candidatoNormalizado(cand, sigla) {
    const numero = String(cand.n || "");
    const s = situacao(cand);
    return {
      numero: numero,
      sq: String(cand.sqcand || ""),
      nome: cand.nmu || cand.nm || "Candidato " + numero,
      partido: sigla || SIGLAS[Number(numero.slice(0, 2))] || "",
      votos: num(cand.vap) || 0,
      pct: num(cand.pvap),
      situacao: s.texto,
      eleito: s.eleito,
      segundoTurno: s.segundoTurno,
    };
  }

  function candidatosU(json) {
    const lista = [];
    const cargos = (json && json.carg) || [];
    for (const cargo of cargos.slice(0, 1)) {
      for (const agr of cargo.agr || []) {
        for (const par of agr.par || []) {
          for (const cand of par.cand || []) lista.push(candidatoNormalizado(cand, par.sg));
        }
      }
      // Alguns arquivos trazem os candidatos direto no cargo.
      for (const cand of cargo.cand || []) lista.push(candidatoNormalizado(cand, cand.sg));
    }
    return lista;
  }

  /**
   * Converte um JSON do TSE (formato -u de 2026 ou -r de 2022) num objeto
   * com nomes legíveis e números já convertidos. Percentuais oficiais são
   * preservados; quando o arquivo não traz um percentual, ele é calculado.
   */
  function normalizar(json) {
    if (!json || typeof json !== "object") return null;
    const unificado = json.carg != null || (json.s != null && typeof json.s === "object");
    let r;
    if (unificado) {
      const s = json.s || {};
      const e = json.e || {};
      const v = json.v || {};
      r = {
        secoesTotalizadas: num(s.st),
        secoesTotal: num(s.ts),
        pctSecoes: num(s.pst),
        eleitorado: num(e.te),
        comparecimento: num(e.c),
        abstencao: num(e.a),
        pctComparecimento: num(e.pc),
        pctAbstencao: num(e.pa),
        validos: num(v.vv),
        brancos: num(v.vb),
        nulos: primeiro(num(v.tvn), num(v.vn)),
        pctValidos: num(v.pvv),
        pctBrancos: num(v.pvb),
        pctNulos: primeiro(num(v.ptvn), num(v.pvn)),
        candidatos: candidatosU(json),
      };
    } else {
      r = {
        secoesTotalizadas: num(json.st),
        secoesTotal: num(json.s),
        pctSecoes: num(json.pst),
        eleitorado: num(json.e),
        comparecimento: num(json.c),
        abstencao: num(json.a),
        pctComparecimento: num(json.pc),
        pctAbstencao: num(json.pa),
        validos: num(json.vv),
        brancos: num(json.vb),
        nulos: primeiro(num(json.tvn), num(json.vn)),
        pctValidos: num(json.pvv),
        pctBrancos: num(json.pvb),
        pctNulos: primeiro(num(json.ptvn), num(json.pvn)),
        candidatos: (json.cand || []).map(function (c) { return candidatoNormalizado(c, ""); }),
      };
    }

    // Percentuais ausentes: comparecimento e abstenção sobre o eleitorado
    // das seções já apuradas (comparecimento + abstenção); brancos e nulos
    // sobre o comparecimento, como o TSE publica.
    const apurado = r.comparecimento != null && r.abstencao != null ? r.comparecimento + r.abstencao : null;
    if (r.pctComparecimento == null) r.pctComparecimento = pct(r.comparecimento, apurado);
    if (r.pctAbstencao == null) r.pctAbstencao = pct(r.abstencao, apurado);
    if (r.pctBrancos == null) r.pctBrancos = pct(r.brancos, r.comparecimento);
    if (r.pctNulos == null) r.pctNulos = pct(r.nulos, r.comparecimento);
    if (r.validos == null && r.candidatos.length) {
      r.validos = r.candidatos.reduce(function (soma, c) { return soma + c.votos; }, 0);
    }
    if (r.pctValidos == null) r.pctValidos = pct(r.validos, r.comparecimento);
    if (r.pctSecoes == null) r.pctSecoes = pct(r.secoesTotalizadas, r.secoesTotal);
    for (const c of r.candidatos) {
      if (c.pct == null) c.pct = r.validos ? (c.votos / r.validos) * 100 : null;
    }
    r.candidatos.sort(function (a, b) { return b.votos - a.votos || a.numero.localeCompare(b.numero); });

    r.eleicao = String(json.ele || "");
    r.uf = String(json.cdabr || json.abr || "").toLowerCase();
    r.turno = String(json.t || "");
    r.dg = json.dg || "";
    r.hg = json.hg || "";
    r.finalizada = String(json.and || "").toLowerCase() === "f" || (r.pctSecoes != null && r.pctSecoes >= 100);
    r.eleitoradoApurado = apurado;
    return r;
  }

  /** Encontra um candidato pelo número no resultado normalizado. */
  function candidato(resultado, numero) {
    if (!resultado) return null;
    return resultado.candidatos.find(function (c) { return c.numero === String(numero); }) || null;
  }

  /**
   * Soma vários resultados normalizados (ex.: UFs de uma região). Percentuais
   * são recalculados a partir dos votos, nunca pela média dos percentuais.
   */
  function somar(resultados) {
    const lista = resultados.filter(Boolean);
    if (!lista.length) return null;
    const campos = ["secoesTotalizadas", "secoesTotal", "eleitorado", "comparecimento", "abstencao", "validos", "brancos", "nulos"];
    const total = {};
    for (const campo of campos) {
      total[campo] = lista.reduce(function (s, r) { return s + (r[campo] || 0); }, 0);
    }
    const porNumero = new Map();
    for (const r of lista) {
      for (const c of r.candidatos) {
        const atual = porNumero.get(c.numero) || Object.assign({}, c, { votos: 0, eleito: false });
        atual.votos += c.votos;
        porNumero.set(c.numero, atual);
      }
    }
    const apurado = total.comparecimento + total.abstencao;
    const candidatos = Array.from(porNumero.values()).map(function (c) {
      return Object.assign(c, { pct: total.validos ? (c.votos / total.validos) * 100 : null });
    });
    candidatos.sort(function (a, b) { return b.votos - a.votos; });
    return Object.assign(total, {
      pctSecoes: pct(total.secoesTotalizadas, total.secoesTotal),
      pctComparecimento: pct(total.comparecimento, apurado),
      pctAbstencao: pct(total.abstencao, apurado),
      pctBrancos: pct(total.brancos, total.comparecimento),
      pctNulos: pct(total.nulos, total.comparecimento),
      pctValidos: pct(total.validos, total.comparecimento),
      eleitoradoApurado: apurado,
      candidatos: candidatos,
      finalizada: lista.every(function (r) { return r.finalizada; }),
      dg: "",
      hg: "",
    });
  }

  /**
   * Os dois candidatos da disputa: quem está marcado para o 2º turno, senão
   * os dois mais votados.
   */
  function finalistas(resultado) {
    if (!resultado) return [];
    const marcados = resultado.candidatos.filter(function (c) { return c.segundoTurno; });
    if (marcados.length === 2) return marcados;
    return resultado.candidatos.slice(0, 2);
  }

  /**
   * Margem, em pontos percentuais dos votos válidos, do candidato `a` sobre o
   * `b` (positivo = `a` à frente). null se não há votos apurados.
   */
  function margem(resultado, numeroA, numeroB) {
    const a = candidato(resultado, numeroA);
    const b = candidato(resultado, numeroB);
    if (!a || !b || !resultado.validos) return null;
    if (!resultado.pctSecoes) return null;
    return a.pct - b.pct;
  }

  /**
   * Projeção simples do resultado final: em cada UF (e no Exterior), os votos
   * já apurados são extrapolados para 100% das seções mantendo a proporção
   * atual da UF. UFs sem nenhuma seção apurada usam a proporção nacional e
   * o tamanho relativo do eleitorado. Não é resultado oficial.
   */
  function projetar(porUf, numeros) {
    const ufs = Object.keys(porUf).filter(function (uf) { return uf !== "br" && porUf[uf]; });
    if (!ufs.length) return null;
    const total = {};
    for (const n of numeros) total[n] = 0;
    let validosProjetados = 0;
    let validosApurados = 0;
    let eleitoradoSemApuracao = 0;
    let eleitoradoComApuracao = 0;
    let validosComApuracao = 0;
    for (const uf of ufs) {
      const r = porUf[uf];
      validosApurados += r.validos || 0;
      if (!r.secoesTotalizadas || !r.secoesTotal || !r.validos) {
        eleitoradoSemApuracao += r.eleitorado || 0;
        continue;
      }
      const fator = r.secoesTotal / r.secoesTotalizadas;
      eleitoradoComApuracao += r.eleitorado || 0;
      validosComApuracao += r.validos * fator;
      validosProjetados += r.validos * fator;
      for (const n of numeros) {
        const c = candidato(r, n);
        total[n] += c ? c.votos * fator : 0;
      }
    }
    if (!validosProjetados) return null;
    if (eleitoradoSemApuracao && eleitoradoComApuracao) {
      const extra = validosComApuracao * (eleitoradoSemApuracao / eleitoradoComApuracao);
      const somaParcial = numeros.reduce(function (s, n) { return s + total[n]; }, 0);
      for (const n of numeros) total[n] += somaParcial ? extra * (total[n] / somaParcial) : 0;
      validosProjetados += extra;
    }
    const candidatos = numeros.map(function (n) {
      return { numero: n, votos: Math.round(total[n]), pct: (total[n] / validosProjetados) * 100 };
    });
    return {
      candidatos: candidatos,
      validos: Math.round(validosProjetados),
      restantes: Math.max(0, Math.round(validosProjetados - validosApurados)),
    };
  }

  /**
   * Lê o ele-c.json (configuração de eleições do TSE) e devolve as eleições
   * encontradas: [{codigo, nome, turno, codigoSegundoTurno, data}]. O
   * percurso é defensivo: procura qualquer objeto com "cd" e "nm".
   */
  function lerConfiguracao(json) {
    const achadas = [];
    function visitar(no, data) {
      if (Array.isArray(no)) {
        for (const item of no) visitar(item, data);
        return;
      }
      if (!no || typeof no !== "object") return;
      const dataAqui = no.dt || data;
      if (no.cd != null && typeof no.nm === "string") {
        achadas.push({
          codigo: String(no.cd),
          nome: no.nm,
          turno: String(no.t || ""),
          codigoSegundoTurno: no.cdt2 != null && no.cdt2 !== "" ? String(no.cdt2) : "",
          data: dataAqui || "",
        });
      }
      for (const chave of Object.keys(no)) {
        if (no[chave] && typeof no[chave] === "object") visitar(no[chave], dataAqui);
      }
    }
    visitar(json, "");
    return achadas;
  }

  /**
   * A partir da configuração, acha os códigos das eleições gerais do ano:
   * {federal1, federal2, estadual1, estadual2}. Campos ausentes ficam vazios.
   */
  function descobrirCodigos(json, ano) {
    const lista = lerConfiguracao(json).filter(function (e) {
      return !ano || e.nome.indexOf(String(ano)) >= 0 || e.data.indexOf(String(ano)) >= 0;
    });
    function achar(tipo, turno) {
      return lista.find(function (e) {
        const nome = e.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const turnoOk = e.turno === turno || nome.indexOf(turno + "o turno") >= 0 || nome.indexOf(turno + "º turno") >= 0;
        return nome.indexOf(tipo) >= 0 && turnoOk;
      });
    }
    const f1 = achar("federal", "1");
    const e1 = achar("estadual", "1");
    const f2 = achar("federal", "2");
    const e2 = achar("estadual", "2");
    return {
      federal1: f1 ? f1.codigo : "",
      federal2: f2 ? f2.codigo : f1 && f1.codigoSegundoTurno ? f1.codigoSegundoTurno : "",
      estadual1: e1 ? e1.codigo : "",
      estadual2: e2 ? e2.codigo : e1 && e1.codigoSegundoTurno ? e1.codigoSegundoTurno : "",
    };
  }

  /** Data e hora oficiais "25/10/2026" + "20:01:52" -> Date (horário de Brasília). */
  function dataHora(dg, hg) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dg || ""));
    if (!m) return null;
    const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(hg || "")) || [null, "00", "00", "00"];
    return new Date(m[3] + "-" + m[2] + "-" + m[1] + "T" + h[1] + ":" + h[2] + ":" + h[3] + "-03:00");
  }

  return {
    UFS: UFS,
    NOMES: NOMES,
    REGIOES: REGIOES,
    SIGLAS: SIGLAS,
    num: num,
    urlResultado: urlResultado,
    urlFoto: urlFoto,
    urlConfig: urlConfig,
    normalizar: normalizar,
    candidato: candidato,
    somar: somar,
    finalistas: finalistas,
    margem: margem,
    projetar: projetar,
    lerConfiguracao: lerConfiguracao,
    descobrirCodigos: descobrirCodigos,
    dataHora: dataHora,
  };
});
