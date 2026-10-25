/**
 * Painel de acompanhamento das Eleições 2026.
 *
 * Fluxo: lê a configuração do TSE (códigos das eleições) → carrega os
 * resultados finais do 1º turno de 2026 e de 2022 (uma vez, com cache) →
 * consulta o 2º turno e os governadores a cada minuto → redesenha.
 */
(function () {
  const CFG = window.PAINEL_CONFIG;
  const params = new URLSearchParams(location.search);
  const ABRANGENCIAS = ["br"].concat(TSE.UFS, ["zz"]);

  // Mapa em grade: [linha, coluna] de cada UF (aproximação da geografia).
  const GRADE = {
    rr: [0, 2], ap: [0, 3],
    am: [1, 1], pa: [1, 2], ma: [1, 3], ce: [1, 4], rn: [1, 5],
    ac: [2, 0], ro: [2, 1], to: [2, 2], pi: [2, 3], pe: [2, 4], pb: [2, 5],
    mt: [3, 1], go: [3, 2], ba: [3, 3], se: [3, 4], al: [3, 5],
    ms: [4, 1], df: [4, 2], mg: [4, 3], es: [4, 4],
    pr: [5, 1], sp: [5, 2], rj: [5, 3],
    sc: [6, 1], rs: [7, 1], zz: [7, 5],
  };

  const estado = {
    eleicoes: JSON.parse(JSON.stringify(CFG.eleicoes)),
    turno: params.get("turno") === "1" ? 1 : 2,
    recorte: ABRANGENCIAS.indexOf(String(params.get("uf") || "").toLowerCase()) >= 0 ? params.get("uf").toLowerCase() : "br",
    dados: { federal1: {}, federal2: {}, anterior1: {}, anterior2: {}, estadual2: {} },
    governadoresPresentes: null,
    viaProxy: params.get("proxy") === "1",
    modoMapa: "margem2",
    ordem: { coluna: "uf", desc: false },
    carregando: false,
    ultimaLeitura: null,
    proximaLeitura: null,
    falhas: 0,
    falhaTotal: false,
    usandoCache: false,
    timer: null,
  };

  // ---- Formatação ----------------------------------------------------------
  const formatadores = {};
  function fmtN(v, casas) {
    if (v == null || !Number.isFinite(v)) return "—";
    const k = casas == null ? 2 : casas;
    if (!formatadores[k]) {
      formatadores[k] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: k, maximumFractionDigits: k });
    }
    return formatadores[k].format(v);
  }
  const inteiro = (v) => (v == null ? "—" : fmtN(Math.round(v), 0));
  const pctTxt = (v, casas) => (v == null ? "—" : fmtN(v, casas == null ? 2 : casas) + "%");
  function sinal(v, casas) {
    if (v == null || !Number.isFinite(v)) return "—";
    const s = v > 0.0049 ? "+" : v < -0.0049 ? "−" : "";
    return s + fmtN(Math.abs(v), casas == null ? 1 : casas);
  }
  const pp = (v) => (v == null ? "—" : sinal(v, 1) + " p.p.");
  function milhoes(v) {
    if (v == null) return "—";
    if (Math.abs(v) >= 1e6) return fmtN(v / 1e6, 1) + " mi";
    if (Math.abs(v) >= 1e3) return fmtN(v / 1e3, 0) + " mil";
    return inteiro(v);
  }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function nomeCurto(nome) {
    const n = String(nome || "").trim();
    if (n.length <= 18) return titulo(n);
    const partes = n.split(/\s+/);
    return titulo(partes[0] + " " + partes[partes.length - 1]);
  }
  function titulo(t) {
    return String(t).toLowerCase().replace(/(^|\s|-)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Dos|Das|E)\b/g, (m) => m.toLowerCase());
  }
  const $ = (id) => document.getElementById(id);

  // ---- Leitura dos arquivos -----------------------------------------------
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
    const res = await emLotes(lista, 8, async (uf) => {
      const r = await lerJSON(TSE.urlResultado(CFG, eleicao, uf, cargo || 1));
      if (r.ausente) return null;
      const normal = TSE.normalizar(r.json);
      if (normal) normal.uf = uf;
      return normal;
    });
    const resumo = { lidos: 0, ausentes: [], falhas: 0 };
    res.forEach((r, i) => {
      const uf = lista[i];
      if (!r.ok) resumo.falhas++;
      else if (r.valor) {
        estado.dados[chave][uf] = r.valor;
        resumo.lidos++;
      } else resumo.ausentes.push(uf);
    });
    return resumo;
  }

  /** Eleições já encerradas: lê do cache se estiver completo, senão do TSE. */
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

  async function atualizarAoVivo() {
    if (estado.carregando) return;
    estado.carregando = true;
    definirStatus();
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
      // Governadores: na primeira vez, procura em todas as UFs; depois, só
      // nas que têm arquivo de 2º turno.
      const ufsGov = estado.governadoresPresentes || TSE.UFS;
      const g = await carregarEleicao("estadual2", 3, ufsGov);
      if (!estado.governadoresPresentes && g.falhas === 0) {
        estado.governadoresPresentes = TSE.UFS.filter((uf) => estado.dados.estadual2[uf]);
      }
    } finally {
      estado.carregando = false;
      renderizar();
      agendar();
    }
  }

  function apuracaoEncerrada() {
    const d = estado.dados.federal2;
    if (!d.br || !d.br.finalizada) return false;
    return TSE.UFS.every((uf) => d[uf] && d[uf].finalizada);
  }

  function agendar() {
    clearTimeout(estado.timer);
    const espera = apuracaoEncerrada() ? 10 * 60000 : CFG.intervalo;
    estado.proximaLeitura = Date.now() + espera;
    estado.timer = setTimeout(() => {
      if (document.hidden) agendar();
      else atualizarAoVivo();
    }, espera);
  }

  // ---- Seleção de dados -----------------------------------------------------
  function resultado(chave, uf) {
    const d = estado.dados[chave][uf || estado.recorte];
    if (d) return d;
    if ((uf || estado.recorte) !== "br") return null;
    if (chave === "anterior2") return HISTORICO.comoResultado(2022, 2);
    if (chave === "anterior1") return HISTORICO.comoResultado(2022, 1);
    if (chave === "federal1") return primeiroTurnoReserva();
    return null;
  }

  function primeiroTurnoReserva() {
    const p = HISTORICO.PRIMEIRO_TURNO_2026;
    return {
      reserva: true, uf: "br", turno: "1", finalizada: true, pctSecoes: 100,
      candidatos: p.candidatos.map((c) => Object.assign({ sq: "", eleito: false, segundoTurno: true, situacao: "2º turno" }, c)),
      validos: null, brancos: null, nulos: null, comparecimento: null, abstencao: null, eleitorado: null,
      pctComparecimento: null, pctAbstencao: null, pctBrancos: null, pctNulos: null, pctValidos: null,
      dg: "05/10/2026", hg: "12:51:47",
    };
  }

  /** Os dois finalistas, em ordem estável (votos no 1º turno no Brasil). */
  function finalistas() {
    const br2 = estado.dados.federal2.br;
    const br1 = resultado("federal1", "br");
    let par = br2 ? TSE.finalistas(br2) : [];
    if (par.length < 2 && br1) par = TSE.finalistas(br1);
    const numeros = par.map((c) => c.numero);
    if (br1) {
      numeros.sort((a, b) => {
        const ca = TSE.candidato(br1, a);
        const cb = TSE.candidato(br1, b);
        return (cb ? cb.votos : 0) - (ca ? ca.votos : 0);
      });
    }
    return numeros.map((n) => {
      const c2 = br2 && TSE.candidato(br2, n);
      const c1 = br1 && TSE.candidato(br1, n);
      const base = c2 || c1;
      return { numero: n, nome: base.nome, partido: base.partido || (c1 && c1.partido) || "", sq: (c2 && c2.sq) || (c1 && c1.sq) || "" };
    });
  }

  /** Cores para um conjunto de números: as fixas da configuração e, para os demais, as reservas livres. */
  function coresPara(numeros) {
    const usadas = new Set();
    const saida = {};
    for (const n of numeros) {
      if (CFG.cores[n]) {
        saida[n] = CFG.cores[n];
        usadas.add(CFG.cores[n]);
      }
    }
    const livres = CFG.coresReserva.concat(["vermelho", "azul", "laranja", "violeta"]).filter((c) => !usadas.has(c));
    for (const n of numeros) {
      if (!saida[n]) {
        saida[n] = livres.shift() || "violeta";
        usadas.add(saida[n]);
      }
    }
    for (const n of numeros) saida[n] = "var(--" + saida[n] + ")";
    return saida;
  }

  // ---- Status e topo ---------------------------------------------------------
  function definirStatus() {
    const pill = $("status");
    const br = estado.dados.federal2.br;
    let classe = "pill-espera";
    let texto = "Conectando…";
    if (estado.carregando && !br) texto = "Lendo TSE…";
    else if (!br) {
      classe = "pill-erro";
      texto = "Sem dados do 2º turno";
    } else if (br.finalizada) {
      classe = "pill-ok";
      texto = "Apuração encerrada";
    } else if (!br.pctSecoes) {
      texto = "Aguardando apuração";
    } else {
      classe = "pill-vivo";
      texto = "Ao vivo · " + pctTxt(br.pctSecoes) + " apurado";
    }
    pill.className = "pill " + classe;
    pill.textContent = texto;
    atualizarRelogio();
  }

  function atualizarRelogio() {
    const br = estado.dados.federal2.br;
    const partes = [];
    if (br && br.dg) partes.push("TSE " + br.dg.slice(0, 5) + " " + br.hg);
    if (estado.carregando) partes.push("atualizando…");
    else if (estado.proximaLeitura) {
      const s = Math.max(0, Math.round((estado.proximaLeitura - Date.now()) / 1000));
      partes.push("próxima em " + (s >= 60 ? Math.round(s / 60) + " min" : s + " s"));
    }
    $("atualizado").textContent = partes.join(" · ");
    $("conexao").textContent = estado.viaProxy ? "Lendo via proxy local" : "Lendo direto do TSE";
  }

  function renderAviso() {
    const aviso = $("aviso");
    const msgs = [];
    if (estado.falhaTotal) {
      msgs.push("Não foi possível ler os arquivos do TSE agora (rede ou bloqueio de CORS)." +
        (estado.usandoCache ? " Mostrando a última leitura salva neste navegador." : "") +
        (estado.viaProxy ? "" : " Se persistir, rode `node server.mjs` e abra http://localhost:8080 para ler pelo proxy local."));
    } else if (estado.falhas > 0) {
      msgs.push(estado.falhas + " arquivo(s) do 2º turno falharam nesta leitura; os demais estão atualizados.");
    }
    aviso.hidden = msgs.length === 0;
    aviso.textContent = msgs.join(" ");
  }

  // ---- Placar --------------------------------------------------------------
  function fotoHtml(c, cor) {
    const ini = esc(String(c.nome || "?").trim().charAt(0));
    const url = c.sq ? TSE.urlFoto(CFG, estado.eleicoes.federal2, "br", c.sq) : "";
    const vazio = '<div class="foto foto-vazia" style="--cor:' + cor + '" aria-hidden="true">' + ini + "</div>";
    if (!url) return vazio;
    return '<img class="foto" style="--cor:' + cor + '" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=this.dataset.vazio" data-vazio="' + esc(vazio) + '">';
  }

  function renderPlacar() {
    const corpo = $("placar-corpo");
    const nomeRecorte = TSE.NOMES[estado.recorte];
    $("placar-titulo").textContent = (estado.turno === 2 ? "2º turno" : "1º turno") + " · " + nomeRecorte;
    if (estado.turno === 2) renderPlacarSegundo(corpo);
    else renderPlacarPrimeiro(corpo);
  }

  function horaTse(r) {
    if (!r || !r.dg) return "";
    return "Arquivo do TSE de " + r.dg + " às " + r.hg + " (Brasília)";
  }

  function progressoHtml(r) {
    const p = r.pctSecoes || 0;
    return '<div class="progresso"><div class="progresso-trilho" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.toFixed(2) + '" aria-label="Seções apuradas">' +
      '<div class="progresso-barra" style="width:' + Math.min(100, p) + '%"></div></div>' +
      '<div class="progresso-texto"><span><b>' + pctTxt(r.pctSecoes) + "</b> das seções apuradas</span><span>" +
      (r.secoesTotal ? inteiro(r.secoesTotalizadas) + " de " + inteiro(r.secoesTotal) + " seções" : "") + "</span></div></div>";
  }

  function renderPlacarSegundo(corpo) {
    const r = resultado("federal2");
    const par = finalistas();
    $("placar-hora").textContent = horaTse(r);
    if (!r || par.length < 2) {
      let msg = "O arquivo do 2º turno ainda não está disponível para este recorte.";
      if (estado.falhaTotal) msg = "Não foi possível ler o arquivo do 2º turno no TSE. Uma nova tentativa é feita a cada minuto.";
      else if (estado.carregando || !estado.ultimaLeitura) msg = "Carregando o arquivo do 2º turno…";
      corpo.innerHTML = '<p class="mudo">' + msg + "</p>";
      return;
    }
    const cores = coresPara(par.map((c) => c.numero));
    const comecou = r.pctSecoes > 0;
    const cands = par.map((f) => Object.assign({}, f, TSE.candidato(r, f.numero) || { votos: 0, pct: null }));
    const lider = comecou ? (cands[0].votos >= cands[1].votos ? 0 : 1) : -1;
    const blocos = cands.map((c, i) => {
      let selo = "";
      if (c.eleito) selo = '<span class="selo selo-eleito">Eleito</span>';
      else if (i === lider && cands[0].votos !== cands[1].votos) selo = '<span class="selo">À frente</span>';
      return '<div class="candidato' + (i === 1 ? " direita" : "") + '">' + fotoHtml(c, cores[c.numero]) +
        "<div><div class=\"cand-nome\">" + esc(titulo(c.nome)) + '</div><div class="cand-partido">' + esc(c.partido) + " · " + esc(c.numero) + "</div>" +
        '<div class="cand-pct">' + (comecou ? pctTxt(c.pct) : "—") + '</div><div class="cand-votos">' + (comecou ? inteiro(c.votos) + " votos" : "aguardando") + "</div>" + selo + "</div></div>";
    });
    const a = cands[0];
    const b = cands[1];
    const dif = comecou ? Math.abs(a.votos - b.votos) : null;
    const difPct = comecou ? Math.abs((a.pct || 0) - (b.pct || 0)) : null;
    corpo.innerHTML =
      '<div class="duelo">' + blocos.join("") + "</div>" +
      '<div class="divisao" aria-hidden="true">' +
      (comecou ? '<div style="width:' + a.pct + "%;background:" + cores[a.numero] + '"></div><div style="width:' + b.pct + "%;background:" + cores[b.numero] + '"></div>' : "") +
      '<div class="marco50"></div></div>' +
      '<div class="placar-rodape"><span>Diferença: <b>' + (comecou ? inteiro(dif) + " votos" : "—") + "</b>" + (comecou ? " (" + fmtN(difPct, 2) + " p.p.)" : "") + "</span>" +
      "<span>Votos válidos: <b>" + inteiro(r.validos) + "</b></span>" +
      "<span>Marca central = 50% dos válidos</span></div>" +
      progressoHtml(r);
  }

  function renderPlacarPrimeiro(corpo) {
    const r = resultado("federal1");
    $("placar-hora").textContent = r && r.reserva ? "Retrato final salvo no painel (TSE indisponível)" : horaTse(r);
    if (!r) {
      corpo.innerHTML = '<p class="mudo">Carregando o arquivo do 1º turno…</p>';
      return;
    }
    const par = finalistas().map((c) => c.numero);
    const cores = coresPara(par);
    const max = Math.max.apply(null, r.candidatos.map((c) => c.pct || 0).concat([1]));
    const linhas = r.candidatos.map((c) => {
      const cor = cores[c.numero] || "var(--cinza-serie)";
      const st = c.segundoTurno || par.indexOf(c.numero) >= 0 ? " · <b>2º turno</b>" : c.eleito ? " · <b>Eleito</b>" : "";
      return '<div class="linha"><div class="nome" title="' + esc(c.nome) + '"><b>' + esc(titulo(c.nome)) + '</b> <span class="mudo pequeno">' + esc(c.partido) + st + "</span></div>" +
        '<div class="trilho"><div style="width:' + ((c.pct || 0) / max) * 100 + "%;background:" + cor + '"></div></div>' +
        '<div class="valor"><b>' + pctTxt(c.pct) + '</b><br><span class="mudo pequeno">' + inteiro(c.votos) + "</span></div></div>";
    });
    corpo.innerHTML = '<div class="lista-cand">' + linhas.join("") + "</div>" +
      (r.reserva ? '<p class="nota">Só os dois mais votados estão no retrato salvo. Os demais aparecem quando o arquivo oficial puder ser lido.</p>' : progressoHtml(r));
  }

  // ---- Indicadores -----------------------------------------------------------
  function renderKpis() {
    const r = resultado(estado.turno === 2 ? "federal2" : "federal1");
    const comparar = estado.turno === 2
      ? [{ r: resultado("federal1"), nome: "1º turno" }, { r: resultado("anterior2"), nome: "2º turno 2022" }]
      : [{ r: resultado("anterior1"), nome: "1º turno 2022" }];
    function deltas(campo) {
      return comparar.filter((c) => c.r && c.r[campo] != null && r && r[campo] != null)
        .map((c) => "<span>" + pp(r[campo] - c.r[campo]) + " vs " + c.nome + "</span>").join("<br>");
    }
    const comecou = r && r.pctSecoes > 0;
    const tiles = [
      { rotulo: "Seções apuradas", valor: r ? pctTxt(r.pctSecoes) : "—", detalhe: r && r.secoesTotal ? inteiro(r.secoesTotalizadas) + " de " + inteiro(r.secoesTotal) : "", delta: "" },
      { rotulo: "Comparecimento", valor: comecou ? pctTxt(r.pctComparecimento) : "—", detalhe: comecou ? inteiro(r.comparecimento) + " eleitores" : "", delta: comecou ? deltas("pctComparecimento") : "" },
      { rotulo: "Abstenção", valor: comecou ? pctTxt(r.pctAbstencao) : "—", detalhe: comecou ? inteiro(r.abstencao) + " eleitores" : "", delta: comecou ? deltas("pctAbstencao") : "" },
      { rotulo: "Votos válidos", valor: comecou ? pctTxt(r.pctValidos) : "—", detalhe: comecou ? inteiro(r.validos) + " votos" : "", delta: comecou ? deltas("pctValidos") : "" },
      { rotulo: "Brancos", valor: comecou ? pctTxt(r.pctBrancos) : "—", detalhe: comecou ? inteiro(r.brancos) + " votos" : "", delta: comecou ? deltas("pctBrancos") : "" },
      { rotulo: "Nulos", valor: comecou ? pctTxt(r.pctNulos) : "—", detalhe: comecou ? inteiro(r.nulos) + " votos" : "", delta: comecou ? deltas("pctNulos") : "" },
      { rotulo: "Eleitorado", valor: r && r.eleitorado ? milhoes(r.eleitorado) : "—", detalhe: r && r.eleitorado ? inteiro(r.eleitorado) + " eleitores aptos" : "", delta: crescimentoEleitorado(r) },
    ];
    $("indicadores").innerHTML = tiles.map((t) =>
      '<div class="cartao kpi"><div class="kpi-rotulo">' + t.rotulo + '</div><div class="kpi-valor">' + t.valor + '</div><div class="kpi-detalhe">' + t.detalhe + "</div>" +
      (t.delta ? '<div class="kpi-delta">' + t.delta + "</div>" : "") + "</div>").join("");
  }

  function crescimentoEleitorado(r) {
    const antes = resultado(estado.turno === 2 ? "anterior2" : "anterior1");
    if (!r || !r.eleitorado || !antes || !antes.eleitorado) return "";
    return "<span>" + sinal(((r.eleitorado - antes.eleitorado) / antes.eleitorado) * 100, 1) + "% vs 2022</span>";
  }

  // ---- 1º × 2º turno ---------------------------------------------------------
  function renderComparacao() {
    const r2 = resultado("federal2");
    const r1 = resultado("federal1");
    const r22 = resultado("anterior2");
    const par = finalistas();
    const cores = coresPara(par.map((c) => c.numero));
    if (par.length < 2) {
      $("comp-grafico").innerHTML = '<p class="mudo">Aguardando os dados.</p>';
      return;
    }
    const comecou = r2 && r2.pctSecoes > 0;
    $("comp-nota").textContent = TSE.NOMES[estado.recorte] + (r2 ? " · 2º turno com " + pctTxt(r2.pctSecoes) + " das seções" : "");

    const linhas = par.map((f) => {
      const c1 = r1 && TSE.candidato(r1, f.numero);
      const c2 = comecou && TSE.candidato(r2, f.numero);
      const c22 = r22 && TSE.candidato(r22, f.numero);
      return {
        rotulo: nomeCurto(f.nome) + " (" + f.numero + ")",
        cor: cores[f.numero],
        marcas: [
          { forma: "oco", valor: c1 ? c1.pct : null, nome: "1º turno 2026" },
          { forma: "cheio", valor: c2 ? c2.pct : null, nome: "2º turno 2026" + (r2 && !r2.finalizada ? " (parcial)" : "") },
          { forma: "losango", valor: c22 ? c22.pct : null, nome: "2º turno 2022 · " + (c22 ? titulo(c22.nome) : "") },
        ],
      };
    });
    const valores = [].concat.apply([], linhas.map((l) => l.marcas.map((m) => m.valor).filter((v) => v != null)));
    const max = Math.min(100, Math.max(60, Math.ceil((Math.max.apply(null, valores.concat([0])) + 5) / 10) * 10));
    const min = Math.max(0, Math.min(30, Math.floor((Math.min.apply(null, valores.concat([50])) - 5) / 10) * 10));
    const ticks = [];
    for (let t = min; t <= max; t += 10) ticks.push(t);
    Graficos.pontos($("comp-grafico"), linhas, {
      min: min, max: max, ticks: ticks, referencia: 50, margemEsquerda: 140,
      fmt: (v, longo) => (longo ? pctTxt(v) : fmtN(v, 0) + "%"),
      titulo: "Percentual de votos válidos de cada finalista no 1º e no 2º turno de 2026 e no 2º turno de 2022",
    });
    $("comp-legenda").innerHTML =
      '<span class="item"><span class="forma">○</span>1º turno 2026</span>' +
      '<span class="item"><span class="forma">●</span>2º turno 2026</span>' +
      '<span class="item"><span class="forma">◆</span>2º turno 2022 (mesmo número)</span>' +
      '<span class="item mudo">linha vertical = 50%</span>';

    // Tabela de votos: quanto cada finalista ganhou do 1º para o 2º turno.
    const linhasTab = [];
    const celula = (votos, p) => "<td>" + (votos != null ? inteiro(votos) : "—") + (p != null ? "<small>" + pctTxt(p) + "</small>" : "") + "</td>";
    let ganhoTotal = 0;
    for (const f of par) {
      const c1 = r1 && TSE.candidato(r1, f.numero);
      const c2 = comecou ? TSE.candidato(r2, f.numero) : null;
      const ganho = c1 && c2 ? c2.votos - c1.votos : null;
      if (ganho != null) ganhoTotal += ganho;
      linhasTab.push("<tr><td><span class=\"chave\" style=\"background:" + cores[f.numero] + '"></span>' + esc(nomeCurto(f.nome)) + "</td>" +
        celula(c1 && c1.votos, c1 && c1.pct) + celula(c2 && c2.votos, c2 && c2.pct) +
        "<td>" + (ganho != null ? sinal(ganho, 0) : "—") + (c1 && c2 ? "<small>" + pp(c2.pct - c1.pct) + "</small>" : "") + "</td></tr>");
    }
    if (r1 && !r1.reserva) {
      const outros = r1.candidatos.filter((c) => !par.some((f) => f.numero === c.numero));
      const votosOutros = outros.reduce((s, c) => s + c.votos, 0);
      const pctOutros = r1.validos ? (votosOutros / r1.validos) * 100 : null;
      linhasTab.push('<tr><td><span class="chave" style="background:var(--cinza-serie)"></span>Demais candidatos</td>' + celula(votosOutros, pctOutros) +
        "<td>—</td><td>" + sinal(-votosOutros, 0) + "</td></tr>");
      const extras = [
        ["Brancos", "brancos", "pctBrancos"],
        ["Nulos", "nulos", "pctNulos"],
        ["Abstenção", "abstencao", "pctAbstencao"],
      ];
      for (const [nome, campo, campoPct] of extras) {
        const v1 = r1[campo];
        const v2 = comecou ? r2[campo] : null;
        linhasTab.push("<tr><td>" + nome + "</td>" + celula(v1, r1[campoPct]) + celula(v2, comecou ? r2[campoPct] : null) +
          "<td>" + (v2 != null && v1 != null ? sinal(v2 - v1, 0) : "—") + (comecou ? "<small>" + pp(r2[campoPct] - r1[campoPct]) + "</small>" : "") + "</td></tr>");
      }
    }
    let nota = "";
    if (comecou && r2.pctSecoes < 99.5) {
      nota = '<p class="nota">Com a apuração em andamento, as diferenças em votos absolutos ainda vão crescer; compare os percentuais. A tabela fica comparável em votos com 100% das seções.</p>';
    } else if (comecou && r1 && !r1.reserva) {
      const outros = r1.candidatos.filter((c) => !par.some((f) => f.numero === c.numero)).reduce((s, c) => s + c.votos, 0);
      nota = '<p class="nota">Os finalistas somaram ' + inteiro(ganhoTotal) + " votos a mais que no 1º turno, contra " + inteiro(outros) +
        " votos válidos dados aos demais candidatos no 1º turno. A diferença vem também de mudanças em abstenção, brancos e nulos.</p>";
    }
    $("comp-tabela").innerHTML = "<table><thead><tr><th></th><th>1º turno</th><th>2º turno</th><th>Diferença</th></tr></thead><tbody>" +
      linhasTab.join("") + "</tbody></table>" + nota;
  }

  // ---- Projeção ----------------------------------------------------------------
  function renderProjecao() {
    const alvo = $("projecao");
    const br = estado.dados.federal2.br;
    const par = finalistas();
    if (!br || par.length < 2) {
      alvo.innerHTML = '<p class="mudo">Aguardando o arquivo do 2º turno.</p>';
      return;
    }
    if (!br.pctSecoes) {
      alvo.innerHTML = '<p class="mudo">A projeção aparece quando o TSE publicar as primeiras seções apuradas.</p>';
      return;
    }
    const cores = coresPara(par.map((c) => c.numero));
    const numeros = par.map((c) => c.numero);
    const porUf = {};
    for (const uf of TSE.UFS.concat(["zz"])) porUf[uf] = estado.dados.federal2[uf];
    const proj = TSE.projetar(porUf, numeros);
    const a = TSE.candidato(br, numeros[0]);
    const b = TSE.candidato(br, numeros[1]);
    const lider = a.votos >= b.votos ? a : b;
    const atras = lider === a ? b : a;
    const restantesEleitores = br.eleitorado && br.eleitoradoApurado != null ? br.eleitorado - br.eleitoradoApurado : null;
    const itens = [];
    if (proj && !br.finalizada) {
      for (const c of proj.candidatos) {
        const f = par.find((x) => x.numero === c.numero);
        itens.push({ rotulo: '<span class="chave" style="background:' + cores[c.numero] + '"></span>Projeção ' + esc(nomeCurto(f.nome)), valor: pctTxt(c.pct, 1), detalhe: "≈ " + milhoes(c.votos) + " votos" });
      }
      const margemProj = Math.abs(proj.candidatos[0].votos - proj.candidatos[1].votos);
      itens.push({ rotulo: "Margem projetada", valor: milhoes(margemProj), detalhe: "votos ao fim da apuração" });
    }
    if (!br.finalizada) {
      const restantesValidos = proj ? proj.restantes : null;
      itens.push({ rotulo: "Votos válidos a apurar", valor: milhoes(restantesValidos), detalhe: "estimativa pela proporção de cada UF" });
      if (restantesEleitores != null) itens.push({ rotulo: "Eleitores em seções não apuradas", valor: milhoes(restantesEleitores), detalhe: inteiro(restantesEleitores) });
      if (restantesValidos) {
        const margemAtual = lider.votos - atras.votos;
        const precisa = 50 + (margemAtual / restantesValidos) * 50;
        itens.push({
          rotulo: "Para virar, " + esc(nomeCurto(atras.nome)) + " precisa de",
          valor: precisa > 100 ? "> 100%" : pctTxt(precisa, 1),
          detalhe: precisa > 100 ? "dos válidos restantes (virada improvável pela estimativa)" : "dos válidos restantes (hoje tem " + pctTxt(atras.pct, 1) + ")",
        });
      }
    } else {
      itens.push({ rotulo: "Apuração encerrada", valor: pctTxt(lider.pct), detalhe: esc(titulo(lider.nome)) + " · resultado oficial do TSE" });
    }
    alvo.innerHTML = '<div class="proj-grade">' + itens.map((i) =>
      '<div class="proj-item"><div class="kpi-rotulo">' + i.rotulo + '</div><div class="kpi-valor">' + i.valor + '</div><div class="kpi-detalhe">' + i.detalhe + "</div></div>").join("") + "</div>" +
      '<p class="nota">Como é feita: em cada estado e no Exterior, os votos já apurados são estendidos para 100% das seções mantendo a proporção atual daquele estado. ' +
      "A estimativa erra quando as seções que faltam votam diferente das já apuradas (por exemplo, capitais e interior chegam em ritmos diferentes). Vale sempre o resultado do TSE.</p>";
  }

  // ---- Mapa ----------------------------------------------------------------------
  const MODOS = {
    margem2: { tipo: "div", cortes: [2, 10, 20], explica: "Diferença, em pontos percentuais dos votos válidos, entre os dois finalistas no 2º turno. O número no quadrado é o do candidato à frente." },
    margem1: { tipo: "div", cortes: [2, 10, 20], explica: "Diferença entre os dois finalistas no 1º turno, em pontos percentuais dos votos válidos (os outros candidatos também somam nos válidos)." },
    virada: { tipo: "div", cortes: [1, 3, 6], explica: "Quanto a margem mudou do 1º para o 2º turno. A cor e o número indicam a favor de quem a margem andou." },
    vs2022: { tipo: "div", cortes: [1, 3, 6], explica: "Quanto a margem do 2º turno de 2026 mudou em relação ao 2º turno de 2022, comparando candidatos pelo número do partido. A cor e o número indicam a favor de quem." },
    abstencao: { tipo: "seq", explica: "Percentual de abstenção no 2º turno, sobre o eleitorado das seções já apuradas." },
    apuracao: { tipo: "seq", explica: "Percentual das seções eleitorais já totalizadas pelo TSE no 2º turno." },
  };

  function valorMapa(uf, numeros) {
    const [a, b] = numeros;
    const r2 = estado.dados.federal2[uf];
    const r1 = estado.dados.federal1[uf];
    const r22 = estado.dados.anterior2[uf];
    switch (estado.modoMapa) {
      case "margem2": return TSE.margem(r2, a, b);
      case "margem1": return TSE.margem(r1, a, b);
      case "virada": {
        const m2 = TSE.margem(r2, a, b);
        const m1 = TSE.margem(r1, a, b);
        return m2 != null && m1 != null ? m2 - m1 : null;
      }
      case "vs2022": {
        const m2 = TSE.margem(r2, a, b);
        const m22 = TSE.margem(r22, a, b);
        return m2 != null && m22 != null ? m2 - m22 : null;
      }
      case "abstencao": return r2 && r2.pctSecoes ? r2.pctAbstencao : null;
      case "apuracao": return r2 ? r2.pctSecoes : null;
    }
    return null;
  }

  function corMapa(v, numeros, cores, faixa) {
    const modo = MODOS[estado.modoMapa];
    if (v == null) return null;
    if (modo.tipo === "div") {
      const abs = Math.abs(v);
      if (abs < modo.cortes[0]) return { fundo: "var(--neutro)", escuro: false };
      const n = v > 0 ? numeros[0] : numeros[1];
      const forca = abs < modo.cortes[1] ? 30 : abs < modo.cortes[2] ? 62 : 100;
      return { fundo: forca === 100 ? cores[n] : "color-mix(in oklab, " + cores[n] + " " + forca + "%, var(--superficie))", escuro: forca === 100 };
    }
    const [min, max] = faixa;
    const t = max > min ? (v - min) / (max - min) : 1;
    const forca = [18, 40, 65, 100][Math.min(3, Math.floor(t * 4))];
    return { fundo: forca === 100 ? "var(--azul)" : "color-mix(in oklab, var(--azul) " + forca + "%, var(--superficie))", escuro: forca === 100 };
  }

  function renderMapa() {
    const par = finalistas();
    const mapa = $("mapa");
    if (par.length < 2) {
      mapa.innerHTML = "";
      return;
    }
    const numeros = par.map((c) => c.numero);
    const cores = coresPara(numeros);
    const modo = MODOS[estado.modoMapa];
    const valores = {};
    for (const uf of TSE.UFS.concat(["zz"])) valores[uf] = valorMapa(uf, numeros);
    const lista = TSE.UFS.map((uf) => valores[uf]).filter((v) => v != null);
    const faixa = [Math.min.apply(null, lista), Math.max.apply(null, lista)];

    const celulas = [];
    for (let l = 0; l < 8; l++) for (let c = 0; c < 7; c++) celulas.push(null);
    for (const uf in GRADE) celulas[GRADE[uf][0] * 7 + GRADE[uf][1]] = uf;
    mapa.innerHTML = celulas.map((uf) => {
      if (!uf) return '<div class="tile vazio"></div>';
      const v = valores[uf];
      const cor = corMapa(v, numeros, cores, faixa);
      let texto = "—";
      if (v != null) {
        if (modo.tipo === "div") {
          const n = Math.abs(v) < MODOS[estado.modoMapa].cortes[0] ? "" : (v > 0 ? numeros[0] : numeros[1]) + " ";
          texto = n + (modo.cortes[0] === 1 ? "+" : "") + fmtN(Math.abs(v), 1);
        } else texto = fmtN(v, 1) + "%";
      }
      const classes = "tile" + (cor ? (cor.escuro ? " escuro" : "") : " sem-dado") + (estado.recorte === uf ? " selecionado" : "");
      const estilo = cor ? ' style="background:' + cor.fundo + '"' : "";
      return '<button type="button" class="' + classes + '" data-uf="' + uf + '"' + estilo + ' aria-label="' + esc(TSE.NOMES[uf]) + ": " + esc(texto) + '"><span class="sigla">' + uf.toUpperCase() + '</span><span class="val">' + texto + "</span></button>";
    }).join("");

    mapa.querySelectorAll(".tile[data-uf]").forEach((t) => {
      t.addEventListener("click", () => mudarRecorte(t.dataset.uf));
      t.addEventListener("pointermove", (ev) => Graficos.mostrarTooltip(dicaUf(t.dataset.uf, numeros, cores), ev.clientX, ev.clientY));
      t.addEventListener("pointerleave", Graficos.esconderTooltip);
    });

    // Legenda
    const leg = [];
    if (modo.tipo === "div") {
      const c = modo.cortes;
      const faixas = [["≥ " + c[2], 100], [c[1] + " a " + c[2], 62], [c[0] + " a " + c[1], 30]];
      for (const [i, n] of numeros.entries()) {
        const f = par[i];
        for (const [rot, forca] of i === 0 ? faixas : faixas.slice().reverse()) {
          const fundo = forca === 100 ? cores[n] : "color-mix(in oklab, " + cores[n] + " " + forca + "%, var(--superficie))";
          leg.push('<span class="item"><span class="amostra" style="background:' + fundo + '"></span>' + esc(nomeCurto(f.nome)) + " (" + n + ") à frente por " + rot + " p.p.</span>");
        }
        if (i === 0) leg.push('<span class="item"><span class="amostra" style="background:var(--neutro)"></span>Menos de ' + c[0] + " p.p. (equilíbrio)</span>");
      }
    } else if (lista.length) {
      const passos = [18, 40, 65, 100];
      passos.forEach((forca, i) => {
        const de = faixa[0] + ((faixa[1] - faixa[0]) * i) / 4;
        const ate = faixa[0] + ((faixa[1] - faixa[0]) * (i + 1)) / 4;
        const fundo = forca === 100 ? "var(--azul)" : "color-mix(in oklab, var(--azul) " + forca + "%, var(--superficie))";
        leg.push('<span class="item"><span class="amostra" style="background:' + fundo + '"></span>' + fmtN(de, 1) + "% a " + fmtN(ate, 1) + "%</span>");
      });
    }
    leg.push('<span class="item"><span class="amostra" style="background:repeating-linear-gradient(45deg, var(--superficie-2) 0 4px, var(--superficie) 4px 8px)"></span>Sem dado</span>');
    $("mapa-legenda").innerHTML = leg.join("");
    $("mapa-explica").textContent = modo.explica + " Clique num estado para ver o detalhe. ZZ = Exterior.";
  }

  function dicaUf(uf, numeros, cores) {
    const r2 = estado.dados.federal2[uf];
    const r1 = estado.dados.federal1[uf];
    const r22 = estado.dados.anterior2[uf];
    const linhas = numeros.map((n) => {
      const c2 = r2 && r2.pctSecoes ? TSE.candidato(r2, n) : null;
      const c1 = r1 ? TSE.candidato(r1, n) : null;
      const c22 = r22 ? TSE.candidato(r22, n) : null;
      const nome = (c2 || c1 || { nome: n }).nome;
      return '<div class="tip-linha"><span class="chave" style="background:' + cores[n] + '"></span>' + esc(nomeCurto(nome)) + "<b>" + (c2 ? pctTxt(c2.pct) : "—") + "</b></div>" +
        '<div class="tip-linha tip-mudo pequeno">1º turno ' + (c1 ? pctTxt(c1.pct) : "—") + " · 2022 " + (c22 ? pctTxt(c22.pct) : "—") + "</div>";
    });
    return '<div class="tip-titulo">' + esc(TSE.NOMES[uf]) + "</div>" + linhas.join("") +
      '<div class="tip-linha tip-mudo pequeno">Seções apuradas<b>' + (r2 ? pctTxt(r2.pctSecoes) : "—") + "</b></div>" +
      '<div class="tip-linha tip-mudo pequeno">Abstenção<b>' + (r2 && r2.pctSecoes ? pctTxt(r2.pctAbstencao) : "—") + "</b></div>";
  }

  // ---- Tabela por UF ---------------------------------------------------------------
  function renderTabelaUfs() {
    const par = finalistas();
    if (par.length < 2) {
      $("tabela-ufs").innerHTML = "";
      return;
    }
    const [a, b] = par.map((c) => c.numero);
    const cores = coresPara([a, b]);
    const nA = esc(nomeCurto(par[0].nome));
    const nB = esc(nomeCurto(par[1].nome));
    const colunas = [
      { id: "uf", rotulo: "Estado" },
      { id: "secoes", rotulo: "Seções" },
      { id: "a2", rotulo: nA + " 2º t." },
      { id: "b2", rotulo: nB + " 2º t." },
      { id: "m2", rotulo: "Margem 2º t." },
      { id: "a1", rotulo: nA + " 1º t." },
      { id: "b1", rotulo: nB + " 1º t." },
      { id: "virada", rotulo: "Δ margem 1º→2º" },
      { id: "m22", rotulo: "Margem 2022" },
      { id: "abst", rotulo: "Abstenção" },
      { id: "eleitorado", rotulo: "Eleitorado" },
    ];
    function linha(uf) {
      const r2 = estado.dados.federal2[uf];
      const r1 = resultado("federal1", uf);
      const r22 = resultado("anterior2", uf);
      const comecou = r2 && r2.pctSecoes > 0;
      const c = (r, n) => (r ? TSE.candidato(r, n) : null);
      const m2 = TSE.margem(r2, a, b);
      const m1 = TSE.margem(r1, a, b);
      return {
        uf: uf,
        nome: TSE.NOMES[uf],
        secoes: r2 ? r2.pctSecoes : null,
        a2: comecou && c(r2, a) ? c(r2, a).pct : null,
        b2: comecou && c(r2, b) ? c(r2, b).pct : null,
        m2: m2,
        a1: c(r1, a) ? c(r1, a).pct : null,
        b1: c(r1, b) ? c(r1, b).pct : null,
        virada: m2 != null && m1 != null ? m2 - m1 : null,
        m22: TSE.margem(r22, a, b),
        abst: comecou ? r2.pctAbstencao : null,
        eleitorado: r2 ? r2.eleitorado : r1 ? r1.eleitorado : null,
      };
    }
    const dados = TSE.UFS.concat(["zz"]).map(linha);
    const { coluna, desc } = estado.ordem;
    dados.sort((x, y) => {
      if (coluna === "uf") return x.nome.localeCompare(y.nome, "pt-BR") * (desc ? -1 : 1);
      const vx = x[coluna];
      const vy = y[coluna];
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1;
      if (vy == null) return -1;
      return (vx - vy) * (desc ? -1 : 1);
    });
    const total = linha("br");
    const fmtMargem = (v) => {
      if (v == null) return "—";
      const n = v > 0 ? a : b;
      return Math.abs(v) < 0.005 ? "0,0" : '<span class="chave" style="background:' + cores[n] + '"></span>' + n + " +" + fmtN(Math.abs(v), 1);
    };
    const celulas = (d) => [
      "<td>" + esc(d.nome) + "</td>",
      "<td>" + pctTxt(d.secoes, 1) + "</td>",
      "<td>" + pctTxt(d.a2) + "</td>",
      "<td>" + pctTxt(d.b2) + "</td>",
      "<td>" + fmtMargem(d.m2) + "</td>",
      "<td>" + pctTxt(d.a1) + "</td>",
      "<td>" + pctTxt(d.b1) + "</td>",
      "<td>" + fmtMargem(d.virada) + "</td>",
      "<td>" + fmtMargem(d.m22) + "</td>",
      "<td>" + pctTxt(d.abst, 1) + "</td>",
      "<td>" + milhoes(d.eleitorado) + "</td>",
    ].join("");
    const cab = colunas.map((col) => {
      const ativo = col.id === coluna;
      return '<th class="ordenavel" data-col="' + col.id + '"' + (ativo ? ' aria-sort="' + (desc ? "descending" : "ascending") + '"' : "") + ">" + col.rotulo + "</th>";
    }).join("");
    $("tabela-ufs").innerHTML = "<table><thead><tr>" + cab + "</tr></thead><tbody>" +
      '<tr class="destaque clicavel' + (estado.recorte === "br" ? " selecionado" : "") + '" data-uf="br">' + celulas(total) + "</tr>" +
      dados.map((d) => '<tr class="clicavel' + (estado.recorte === d.uf ? " selecionado" : "") + '" data-uf="' + d.uf + '">' + celulas(d) + "</tr>").join("") +
      "</tbody></table>";
    $("tabela-ufs").querySelectorAll("th[data-col]").forEach((th) => th.addEventListener("click", () => {
      const col = th.dataset.col;
      estado.ordem = { coluna: col, desc: estado.ordem.coluna === col ? !estado.ordem.desc : col !== "uf" };
      renderTabelaUfs();
    }));
    $("tabela-ufs").querySelectorAll("tr[data-uf]").forEach((tr) => tr.addEventListener("click", () => mudarRecorte(tr.dataset.uf)));
  }

  // ---- Regiões ------------------------------------------------------------------------
  function renderRegioes() {
    const par = finalistas();
    if (par.length < 2) return;
    const numeros = par.map((c) => c.numero);
    const cores = coresPara(numeros);
    const linhas = [];
    for (const reg of TSE.REGIOES) {
      const s2 = TSE.somar(reg.ufs.map((uf) => estado.dados.federal2[uf]));
      const s1 = TSE.somar(reg.ufs.map((uf) => estado.dados.federal1[uf]));
      const parte = (s, n) => {
        const c = s && TSE.candidato(s, n);
        const f = par.find((x) => x.numero === n);
        return { nome: nomeCurto(f.nome), valor: c ? c.pct : 0, cor: cores[n], texto: c ? fmtN(c.pct, 1) + "%" : "", textoLongo: c ? pctTxt(c.pct) + " · " + inteiro(c.votos) + " votos" : "" };
      };
      if (s2 && s2.pctSecoes > 0) {
        linhas.push({ rotulo: "<b>" + reg.nome + "</b><small>2º turno · " + pctTxt(s2.pctSecoes, 0) + " seções</small>", dica: reg.nome + " · 2º turno", partes: numeros.map((n) => parte(s2, n)) });
      } else {
        linhas.push({ rotulo: "<b>" + reg.nome + "</b><small>2º turno · aguardando</small>", partes: [] });
      }
      if (s1) {
        const outros = s1.candidatos.filter((c) => numeros.indexOf(c.numero) < 0).reduce((s, c) => s + (c.pct || 0), 0);
        linhas.push({
          rotulo: "<small>1º turno</small>",
          dica: reg.nome + " · 1º turno",
          partes: [parte(s1, numeros[0]), { nome: "Demais candidatos", valor: outros, cor: "var(--cinza-serie)", claro: true, texto: fmtN(outros, 1) + "%", textoLongo: pctTxt(outros) }, parte(s1, numeros[1])],
        });
      }
    }
    Graficos.barras100($("regioes"), linhas, { meio: true });
    $("regioes-legenda").innerHTML = par.map((f) => '<span class="item"><span class="amostra" style="background:' + cores[f.numero] + '"></span>' + esc(nomeCurto(f.nome)) + " (" + f.numero + ")</span>").join("") +
      '<span class="item"><span class="amostra" style="background:var(--cinza-serie)"></span>Demais candidatos (1º turno)</span><span class="item mudo">traço = 50%</span>';
  }

  // ---- Evolução da apuração --------------------------------------------------------
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

  function renderEvolucao() {
    const alvo = $("evolucao");
    const par = finalistas();
    const pontos = lerEvolucao().sort((x, y) => x.pst - y.pst);
    $("evo-nota").textContent = pontos.length ? pontos.length + " leitura(s) do TSE guardadas neste navegador" : "";
    if (pontos.length < 2 || par.length < 2) {
      alvo.innerHTML = '<p class="mudo">O gráfico mostra o percentual de cada finalista conforme as seções são apuradas (Brasil). Ele começa a partir da 2ª atualização do TSE vista por este navegador; deixe a página aberta.</p>';
      return;
    }
    const cores = coresPara(par.map((c) => c.numero));
    const ys = [].concat.apply([], pontos.map((p) => par.map((f) => p.v[f.numero]).filter((v) => v != null)));
    const yMin = Math.floor(Math.min.apply(null, ys.concat([50])) - 1);
    const yMax = Math.ceil(Math.max.apply(null, ys.concat([50])) + 1);
    const passo = yMax - yMin > 20 ? 5 : yMax - yMin > 8 ? 2 : 1;
    const ticks = [];
    for (let t = Math.ceil(yMin / passo) * passo; t <= yMax; t += passo) ticks.push(t);
    const porPst = {};
    for (const p of pontos) porPst[p.pst] = p;
    Graficos.linhas(alvo, {
      titulo: "Evolução do percentual de votos válidos de cada finalista conforme as seções são apuradas",
      series: par.map((f) => ({
        nome: nomeCurto(f.nome),
        rotuloFinal: nomeCurto(f.nome) + " " + fmtN(pontos[pontos.length - 1].v[f.numero], 1) + "%",
        cor: cores[f.numero],
        pontos: pontos.map((p) => ({ x: p.pst, y: p.v[f.numero] })),
      })),
      x: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: (v) => fmtN(v, 0) + "%" },
      y: { min: yMin, max: yMax, ticks: ticks, fmt: (v, longo) => (longo ? pctTxt(v) : fmtN(v, 0) + "%") },
      referencia: { y: 50, rotulo: "50%" },
      margemDireita: 130,
      dica: (x) => fmtN(x, 2) + "% das seções · " + porPst[x].hg,
    });
  }

  // ---- Histórico -------------------------------------------------------------------------
  function serieHistorica() {
    const anos = HISTORICO.anos.map((ano) => ({ ano: ano, t1: HISTORICO.comoResultado(ano, 1), t2: HISTORICO.comoResultado(ano, 2), parcial2: false }));
    const br1 = resultado("federal1", "br");
    const br2 = estado.dados.federal2.br;
    anos.push({ ano: 2026, t1: br1, t2: br2 && br2.pctSecoes > 0 ? br2 : null, parcial2: br2 ? !br2.finalizada : false });
    return anos;
  }

  function renderHistorico() {
    const serie = serieHistorica();
    // 2º turno: barra 100% por ano, PT sempre à esquerda quando disputou.
    const linhas = serie.filter((s) => s.t2).map((s) => {
      const cands = s.t2.candidatos.slice(0, 2);
      cands.sort((x, y) => (x.numero === "13" ? -1 : y.numero === "13" ? 1 : y.votos - x.votos));
      const cores = coresPara(cands.map((c) => c.numero));
      return {
        rotulo: "<b>" + s.ano + "</b>" + (s.parcial2 ? "<small>parcial · " + pctTxt(s.t2.pctSecoes, 0) + "</small>" : ""),
        dica: s.ano + " · 2º turno" + (s.parcial2 ? " (parcial)" : ""),
        partes: cands.map((c) => ({
          nome: titulo(c.nome) + " (" + c.partido + ")",
          valor: c.pct,
          cor: cores[c.numero],
          texto: nomeCurto(c.nome) + " " + fmtN(c.pct, 1) + "%",
          textoLongo: pctTxt(c.pct) + " · " + inteiro(c.votos) + " votos",
        })),
      };
    });
    Graficos.barras100($("hist-segundo"), linhas, { meio: true });

    const xs = serie.map((s) => s.ano);
    const eixoX = { min: 2010, max: 2026, ticks: xs, fmt: (v) => String(v) };
    function serieDe(campo, turno, nome, cor) {
      return {
        nome: nome,
        cor: cor,
        pontos: serie.map((s) => {
          const r = turno === 1 ? s.t1 : s.t2;
          return { x: s.ano, y: r && r[campo] != null ? r[campo] : null, oco: turno === 2 && s.parcial2 && s.ano === 2026 };
        }),
      };
    }
    function faixaY(series, passo) {
      const vs = [].concat.apply([], series.map((s) => s.pontos.map((p) => p.y).filter((v) => v != null)));
      const min = Math.max(0, Math.floor((Math.min.apply(null, vs) - 1) / passo) * passo);
      const max = Math.ceil((Math.max.apply(null, vs) + 1) / passo) * passo;
      const ticks = [];
      for (let t = min; t <= max + 1e-9; t += passo) ticks.push(t);
      return { min: min, max: max, ticks: ticks, fmt: (v, longo) => (longo ? pctTxt(v) : fmtN(v, 0) + "%") };
    }
    const abst = [serieDe("pctAbstencao", 1, "1º turno", "var(--aqua)"), serieDe("pctAbstencao", 2, "2º turno", "var(--violeta)")];
    Graficos.linhas($("hist-abstencao"), { titulo: "Abstenção por eleição", series: abst, x: eixoX, y: faixaY(abst, 2), altura: 220, margemDireita: 70 });
    const inval = serie.map((s) => {
      const soma = (r) => (r && r.pctBrancos != null && r.pctNulos != null ? r.pctBrancos + r.pctNulos : null);
      return { ano: s.ano, t1: soma(s.t1), t2: soma(s.t2) };
    });
    const invSeries = [1, 2].map((t) => ({
      nome: t + "º turno",
      cor: t === 1 ? "var(--aqua)" : "var(--violeta)",
      pontos: inval.map((s) => ({ x: s.ano, y: t === 1 ? s.t1 : s.t2, oco: t === 2 && s.ano === 2026 && serie[serie.length - 1].parcial2 })),
    }));
    Graficos.linhas($("hist-invalidos"), { titulo: "Brancos e nulos por eleição", series: invSeries, x: eixoX, y: faixaY(invSeries, 2), altura: 220, margemDireita: 70 });
    $("hist-legenda").innerHTML = '<span class="item"><span class="amostra" style="background:var(--aqua)"></span>1º turno</span><span class="item"><span class="amostra" style="background:var(--violeta)"></span>2º turno</span><span class="item mudo">ponto vazado = 2026 ainda em apuração</span>';

    // Tabela completa
    const linhasTab = [];
    for (const s of serie) {
      for (const t of [1, 2]) {
        const r = t === 1 ? s.t1 : s.t2;
        if (!r) continue;
        const [p1, p2] = r.candidatos;
        const margemVotos = p1 && p2 ? p1.votos - p2.votos : null;
        const parcial = t === 2 && s.parcial2;
        linhasTab.push("<tr><td>" + s.ano + "</td><td>" + t + "º" + (parcial ? " (parcial)" : "") + "</td><td>" + (p1 ? esc(titulo(p1.nome)) + " (" + esc(p1.partido) + ")" : "—") + "</td><td>" + (p1 ? pctTxt(p1.pct) : "—") +
          "</td><td>" + (p2 ? esc(titulo(p2.nome)) + " (" + esc(p2.partido) + ")" : "—") + "</td><td>" + (p2 ? pctTxt(p2.pct) : "—") + "</td><td>" + inteiro(margemVotos) +
          "</td><td>" + milhoes(r.eleitorado) + "</td><td>" + pctTxt(r.pctComparecimento) + "</td><td>" + pctTxt(r.pctAbstencao) + "</td><td>" + pctTxt(r.pctBrancos) + "</td><td>" + pctTxt(r.pctNulos) + "</td></tr>");
      }
    }
    $("hist-tabela").innerHTML = "<table><thead><tr><th>Ano</th><th>Turno</th><th>1º colocado</th><th>%</th><th>2º colocado</th><th>%</th><th>Diferença (votos)</th><th>Eleitorado</th><th>Comparec.</th><th>Abstenção</th><th>Brancos</th><th>Nulos</th></tr></thead><tbody>" +
      linhasTab.join("") + "</tbody></table>";
  }

  // ---- Governadores ------------------------------------------------------------------------
  function renderGovernadores() {
    const alvo = $("governadores");
    const ufs = TSE.UFS.filter((uf) => estado.dados.estadual2[uf]).sort((x, y) => TSE.NOMES[x].localeCompare(TSE.NOMES[y], "pt-BR"));
    if (!ufs.length) {
      alvo.innerHTML = '<p class="mudo">' + (estado.governadoresPresentes ? "Nenhum arquivo de 2º turno para governador encontrado (eleição " + esc(estado.eleicoes.estadual2.codigo) + ")." : "Procurando os estados com 2º turno para governador…") + "</p>";
      $("gov-nota").textContent = "";
      return;
    }
    $("gov-nota").textContent = ufs.length + " estado(s) com 2º turno";
    alvo.innerHTML = ufs.map((uf) => {
      const r = estado.dados.estadual2[uf];
      const cands = r.candidatos.slice(0, 2);
      const cores = coresPara(cands.map((c) => c.numero).sort());
      const comecou = r.pctSecoes > 0;
      const linhas = cands.map((c) =>
        '<div class="gov-cand"><span><span class="chave" style="background:' + cores[c.numero] + '"></span><b>' + esc(nomeCurto(c.nome)) + "</b> " + esc(c.partido) + (c.eleito ? ' <span class="selo selo-eleito">Eleito</span>' : "") +
        "</span><span class=\"num\"><b>" + (comecou ? pctTxt(c.pct) : "—") + '</b></span><div class="trilho"><div style="width:' + (comecou ? c.pct : 0) + "%;background:" + cores[c.numero] + '"></div></div></div>').join("");
      return '<div class="gov"><div class="gov-topo"><b>' + esc(TSE.NOMES[uf]) + '</b><span class="mudo pequeno">' + pctTxt(r.pctSecoes, 1) + " apurado</span></div>" + linhas + "</div>";
    }).join("");
  }

  // ---- Controles -------------------------------------------------------------------------------
  function montarControles() {
    const sel = $("recorte");
    const ufs = TSE.UFS.slice().sort((x, y) => TSE.NOMES[x].localeCompare(TSE.NOMES[y], "pt-BR"));
    sel.innerHTML = ['<option value="br">Brasil</option>']
      .concat(ufs.map((uf) => '<option value="' + uf + '">' + TSE.NOMES[uf] + " (" + uf.toUpperCase() + ")</option>"))
      .concat(['<option value="zz">Exterior</option>']).join("");
    sel.value = estado.recorte;
    sel.addEventListener("change", () => mudarRecorte(sel.value));

    document.querySelectorAll("[data-turno]").forEach((b) => b.addEventListener("click", () => {
      estado.turno = Number(b.dataset.turno);
      atualizarUrl();
      renderizar();
    }));
    $("modo-mapa").addEventListener("change", (ev) => {
      estado.modoMapa = ev.target.value;
      renderMapa();
    });
    $("atualizar").addEventListener("click", () => atualizarAoVivo());
    $("tema").addEventListener("click", alternarTema);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && estado.proximaLeitura && Date.now() >= estado.proximaLeitura) atualizarAoVivo();
    });
    let espera = null;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(renderGraficos, 150);
    });
    setInterval(atualizarRelogio, 1000);
  }

  function mudarRecorte(uf) {
    estado.recorte = uf;
    $("recorte").value = uf;
    atualizarUrl();
    renderizar();
    if (window.scrollY > 300) $("placar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function atualizarUrl() {
    const p = new URLSearchParams(location.search);
    if (estado.recorte === "br") p.delete("uf");
    else p.set("uf", estado.recorte);
    if (estado.turno === 1) p.set("turno", "1");
    else p.delete("turno");
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
  }

  function alternarTema() {
    const raiz = document.documentElement;
    const atual = raiz.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    raiz.dataset.theme = atual === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("painel:tema", raiz.dataset.theme);
    } catch (e) {
      /* preferência só nesta visita */
    }
  }

  function aplicarTemaSalvo() {
    try {
      const t = localStorage.getItem("painel:tema");
      if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    } catch (e) {
      /* tema do sistema */
    }
  }

  // ---- Desenho ------------------------------------------------------------------------------------
  function renderGraficos() {
    renderComparacao();
    renderEvolucao();
    renderHistorico();
  }

  function renderizar() {
    document.querySelectorAll("[data-turno]").forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.turno) === estado.turno)));
    definirStatus();
    renderAviso();
    const partes = [renderPlacar, renderKpis, renderProjecao, renderMapa, renderTabelaUfs, renderRegioes, renderGraficos, renderGovernadores];
    for (const parte of partes) {
      try {
        parte();
      } catch (e) {
        console.error("Falha ao desenhar", parte.name, e);
      }
    }
  }

  async function iniciar() {
    aplicarTemaSalvo();
    montarControles();
    // Última leitura do 2º turno, para a tela não abrir vazia.
    const cache2 = lerCache("federal2");
    if (cache2 && cache2.dados) {
      estado.dados.federal2 = cache2.dados;
      estado.usandoCache = true;
    }
    for (const chave of ["federal1", "anterior1", "anterior2"]) {
      const c = lerCache(chave);
      if (c && c.dados) estado.dados[chave] = c.dados;
    }
    renderizar();
    await descobrirCodigos();
    await Promise.all([
      carregarFinal("federal1").catch(() => null),
      carregarFinal("anterior2").catch(() => null),
      carregarFinal("anterior1").catch(() => null),
      atualizarAoVivo(),
    ]);
    renderizar();
  }

  iniciar();
})();
