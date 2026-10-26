/**
 * Camada de dados do painel: lê os arquivos do TSE, guarda o que já terminou
 * (1º turno de 2026 e eleições de 2022) no navegador e consulta o 2º turno e
 * os governadores a cada minuto.
 *
 * Quem desenha a tela só chama Dados.iniciar(aoMudar) e lê Dados.estado.
 * `aoMudar` é chamado toda vez que chega algo novo.
 */
(function (root) {
  const CFG = root.PAINEL_CONFIG;
  const TSE = root.TSE;
  const HISTORICO = root.HISTORICO;
  const params = new URLSearchParams(location.search);
  const ABRANGENCIAS = ["br"].concat(TSE.UFS, ["zz"]);

  const estado = {
    eleicoes: JSON.parse(JSON.stringify(CFG.eleicoes)),
    dados: { federal1: {}, federal2: {}, anterior1: {}, anterior2: {}, estadual2: {} },
    governadoresPresentes: null,
    viaProxy: params.get("proxy") === "1",
    carregando: false,
    tentou: false,
    ultimaLeitura: null,
    proximaLeitura: null,
    falhas: 0,
    falhaTotal: false,
    usandoCache: false,
  };

  let aoMudar = function () {};
  let timer = null;

  // ---- Leitura dos arquivos -------------------------------------------------
  function urlProxy(url) {
    return CFG.proxy.replace(/\/$/, "") + url.slice(CFG.base.length);
  }

  /**
   * Busca um JSON do TSE. Tenta direto (o TSE libera CORS) e, se a rede ou o
   * CORS falhar, tenta o proxy local. Devolve {json} ou {ausente: true}.
   */
  async function lerJSON(url) {
    const tentativas = estado.viaProxy ? [urlProxy(url)] : [url, urlProxy(url)];
    let erro = null;
    for (const alvo of tentativas) {
      try {
        const resp = await fetch(alvo, { cache: "no-store" });
        if (resp.ok) {
          const json = await resp.json();
          if (alvo !== url) estado.viaProxy = true;
          return { json: json };
        }
        const doTse = alvo === url || resp.headers.get("x-painel-proxy") === "1";
        if (doTse && (resp.status === 404 || resp.status === 403)) return { ausente: true };
        erro = new Error("HTTP " + resp.status);
      } catch (e) {
        erro = e;
      }
    }
    throw erro || new Error("falha de rede");
  }

  async function emLotes(itens, paralelos, fn) {
    const saida = new Array(itens.length);
    let i = 0;
    async function trabalhador() {
      while (i < itens.length) {
        const k = i++;
        try {
          saida[k] = { ok: true, valor: await fn(itens[k]) };
        } catch (e) {
          saida[k] = { ok: false, erro: e };
        }
      }
    }
    await Promise.all(Array.from({ length: paralelos }, trabalhador));
    return saida;
  }

  // ---- Cache no navegador ---------------------------------------------------------
  function chaveCache(chave, cargo) {
    const e = estado.eleicoes[chave];
    return "painel:v1:" + e.ciclo + ":" + e.codigo + ":c" + (cargo || 1);
  }
  function lerCache(chave, cargo) {
    try {
      const bruto = localStorage.getItem(chaveCache(chave, cargo));
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }
  function gravarCache(chave, cargo) {
    try {
      localStorage.setItem(chaveCache(chave, cargo), JSON.stringify({ salvo: Date.now(), dados: estado.dados[chave] }));
    } catch (e) {
      /* sem armazenamento: o painel segue só com a memória */
    }
  }

  async function carregarEleicao(chave, cargo, abrangencias) {
    const eleicao = estado.eleicoes[chave];
    const lista = abrangencias || ABRANGENCIAS;
    const res = await emLotes(lista, 8, async function (uf) {
      const r = await lerJSON(TSE.urlResultado(CFG, eleicao, uf, cargo || 1));
      if (r.ausente) return null;
      const normal = TSE.normalizar(r.json);
      if (normal) normal.uf = uf;
      return normal;
    });
    const resumo = { lidos: 0, ausentes: [], falhas: 0 };
    res.forEach(function (r, i) {
      const uf = lista[i];
      if (!r.ok) resumo.falhas++;
      else if (r.valor) {
        estado.dados[chave][uf] = r.valor;
        resumo.lidos++;
      } else resumo.ausentes.push(uf);
    });
    return resumo;
  }

  /** Eleições já encerradas: usa o cache se estiver completo, senão lê do TSE. */
  async function carregarFinal(chave) {
    const cache = lerCache(chave);
    if (cache && cache.dados && cache.dados.br && cache.dados.br.finalizada && Object.keys(cache.dados).length >= 28) {
      estado.dados[chave] = cache.dados;
      return;
    }
    const r = await carregarEleicao(chave);
    const br = estado.dados[chave].br;
    if (r.falhas === 0 && br && br.finalizada) gravarCache(chave);
  }

  async function descobrirCodigos() {
    try {
      const r = await lerJSON(TSE.urlConfig(CFG));
      if (!r.json) return;
      const cod = TSE.descobrirCodigos(r.json, CFG.ano);
      for (const k of ["federal1", "federal2", "estadual2"]) {
        if (cod[k]) estado.eleicoes[k].codigo = cod[k];
      }
    } catch (e) {
      /* fica com os códigos de config.js */
    }
  }

  // ---- Atualização do 2º turno -----------------------------------------------------------
  function apuracaoEncerrada() {
    const d = estado.dados.federal2;
    if (!d.br || !d.br.finalizada) return false;
    return TSE.UFS.every(function (uf) { return d[uf] && d[uf].finalizada; });
  }

  function agendar() {
    clearTimeout(timer);
    const espera = apuracaoEncerrada() ? 10 * 60000 : CFG.intervalo;
    estado.proximaLeitura = Date.now() + espera;
    timer = setTimeout(function () {
      if (document.hidden) agendar();
      else atualizar();
    }, espera);
  }

  async function atualizar() {
    if (estado.carregando) return;
    estado.carregando = true;
    estado.tentou = true;
    aoMudar();
    try {
      const r = await carregarEleicao("federal2");
      estado.falhas = r.falhas;
      estado.falhaTotal = r.lidos === 0 && r.falhas > 0;
      if (r.lidos > 0) {
        estado.ultimaLeitura = new Date();
        estado.usandoCache = false;
        gravarCache("federal2");
        registrarEvolucao();
      }
      // Governadores: na primeira vez procura em todas as UFs; depois só nas que têm arquivo.
      const ufsGov = estado.governadoresPresentes || TSE.UFS;
      const g = await carregarEleicao("estadual2", 3, ufsGov);
      if (!estado.governadoresPresentes && g.falhas === 0) {
        estado.governadoresPresentes = TSE.UFS.filter(function (uf) { return estado.dados.estadual2[uf]; });
      }
    } finally {
      estado.carregando = false;
      aoMudar();
      agendar();
    }
  }

  // ---- Evolução guardada neste navegador -----------------------------------------------------
  function chaveEvolucao() {
    return "painel:evolucao:" + estado.eleicoes.federal2.codigo;
  }
  function lerEvolucao() {
    try {
      return JSON.parse(localStorage.getItem(chaveEvolucao()) || "[]");
    } catch (e) {
      return [];
    }
  }
  function registrarEvolucao() {
    const br = estado.dados.federal2.br;
    if (!br || !br.pctSecoes) return;
    const pontos = lerEvolucao();
    const ultimo = pontos[pontos.length - 1];
    if (ultimo && ultimo.dg === br.dg && ultimo.hg === br.hg) return;
    const v = {};
    for (const c of br.candidatos) v[c.numero] = c.pct;
    pontos.push({ dg: br.dg, hg: br.hg, pst: br.pctSecoes, v: v });
    while (pontos.length > 500) pontos.shift();
    try {
      localStorage.setItem(chaveEvolucao(), JSON.stringify(pontos));
    } catch (e) {
      /* sem armazenamento */
    }
  }

  // ---- Consultas usadas pela tela ------------------------------------------------------------------
  function primeiroTurnoReserva() {
    const p = HISTORICO.PRIMEIRO_TURNO_2026;
    return {
      reserva: true, uf: "br", turno: "1", finalizada: true, pctSecoes: 100,
      candidatos: p.candidatos.map(function (c) {
        return Object.assign({ sq: "", eleito: false, segundoTurno: true, situacao: "2º turno" }, c);
      }),
      validos: null, brancos: null, nulos: null, comparecimento: null, abstencao: null, eleitorado: null,
      pctComparecimento: null, pctAbstencao: null, pctBrancos: null, pctNulos: null, pctValidos: null,
      dg: "05/10/2026", hg: "12:51:47",
    };
  }

  /**
   * Resultado de uma eleição numa abrangência. No Brasil, usa o retrato salvo
   * no painel se o arquivo ainda não foi lido (2022 e 1º turno de 2026).
   */
  function resultado(chave, uf) {
    const d = estado.dados[chave][uf];
    if (d) return d;
    if (uf !== "br") return null;
    if (chave === "anterior2") return HISTORICO.comoResultado(2022, 2);
    if (chave === "anterior1") return HISTORICO.comoResultado(2022, 1);
    if (chave === "federal1") return primeiroTurnoReserva();
    return null;
  }

  /** Os dois finalistas, em ordem estável (mais votados no 1º turno primeiro). */
  function finalistas() {
    const br2 = estado.dados.federal2.br;
    const br1 = resultado("federal1", "br");
    let par = br2 ? TSE.finalistas(br2) : [];
    if (par.length < 2 && br1) par = TSE.finalistas(br1);
    const numeros = par.map(function (c) { return c.numero; });
    if (br1) {
      numeros.sort(function (a, b) {
        const ca = TSE.candidato(br1, a);
        const cb = TSE.candidato(br1, b);
        return (cb ? cb.votos : 0) - (ca ? ca.votos : 0);
      });
    }
    return numeros.map(function (n) {
      const c2 = br2 && TSE.candidato(br2, n);
      const c1 = br1 && TSE.candidato(br1, n);
      const base = c2 || c1;
      return { numero: n, nome: base.nome, partido: base.partido || (c1 && c1.partido) || "", sq: (c2 && c2.sq) || (c1 && c1.sq) || "" };
    });
  }

  /** "ok" quando há dados do 2º turno, "carregando" enquanto tenta, senão "erro". */
  function situacao() {
    if (estado.dados.federal2.br) return "ok";
    if (estado.carregando || !estado.tentou) return "carregando";
    return "erro";
  }

  async function iniciar(callback) {
    aoMudar = callback || aoMudar;
    // Mostra logo o que já estava salvo neste navegador.
    const cache2 = lerCache("federal2");
    if (cache2 && cache2.dados) {
      estado.dados.federal2 = cache2.dados;
      estado.usandoCache = true;
    }
    for (const chave of ["federal1", "anterior1", "anterior2"]) {
      const c = lerCache(chave);
      if (c && c.dados) estado.dados[chave] = c.dados;
    }
    aoMudar();
    await descobrirCodigos();
    await Promise.all([
      carregarFinal("federal1").then(aoMudar, aoMudar),
      carregarFinal("anterior2").then(aoMudar, aoMudar),
      carregarFinal("anterior1").then(aoMudar, aoMudar),
      atualizar(),
    ]);
    aoMudar();
  }

  root.Dados = {
    estado: estado,
    iniciar: iniciar,
    atualizar: atualizar,
    resultado: resultado,
    finalistas: finalistas,
    situacao: situacao,
    evolucao: lerEvolucao,
    apuracaoEncerrada: apuracaoEncerrada,
    ABRANGENCIAS: ABRANGENCIAS,
  };
})(window);
