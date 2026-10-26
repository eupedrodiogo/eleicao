/**
 * Painel Eleições 2026: desenho da página.
 *
 * Os dados vêm de Dados (js/dados.js); os textos, de Texto (js/texto.js).
 * Aqui só decidimos o que mostrar e como: resumo, indicadores, mapa por estado,
 * comparação entre turnos, o que falta, histórico, governadores e perguntas.
 */
(function () {
  const CFG = window.PAINEL_CONFIG;
  const { TSE, Texto, UI, Graficos, Mapa, Dados, HISTORICO } = window;
  const { esc, fmtN, inteiro, pct, sinal, pontos, votos, milhoes, nomeExibicao, nomeCurto, apelidos } = Texto;
  const estado = Dados.estado;
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const UFS_VALIDAS = Dados.ABRANGENCIAS;
  const ui = {
    turno: params.get("turno") === "1" ? 1 : 2,
    uf: UFS_VALIDAS.indexOf(String(params.get("uf") || "").toLowerCase()) >= 0 ? params.get("uf").toLowerCase() : "br",
    visaoMapa: lerPreferencia("painel:visao-mapa", ["geo", "grade"], "geo"),
    modoMapa: "lider2",
    histIndicador: "abstencao",
    ordem: { coluna: "nome", desc: false },
    filtro: "",
    ultimoAnuncio: "",
    irParaUf: params.has("uf"),
  };

  function lerPreferencia(chave, validos, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return validos.indexOf(v) >= 0 ? v : padrao;
    } catch (e) {
      return padrao;
    }
  }
  function gravarPreferencia(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (e) {
      /* preferência só nesta visita */
    }
  }

  // ---- Cores dos candidatos --------------------------------------------------
  /** Papel de cor de cada número: {13: "vermelho", 22: "azul"}. Desconhecidos recebem as cores reservas. */
  function papeis(numeros) {
    const usadas = new Set();
    const saida = {};
    numeros.forEach(function (n) {
      if (CFG.cores[n]) {
        saida[n] = CFG.cores[n];
        usadas.add(CFG.cores[n]);
      }
    });
    const livres = CFG.coresReserva.concat(["azul", "laranja", "violeta", "vermelho"]);
    numeros.forEach(function (n) {
      if (saida[n]) return;
      let cor;
      do cor = livres.shift(); while (cor && usadas.has(cor));
      saida[n] = cor || "violeta";
      usadas.add(saida[n]);
    });
    return saida;
  }
  const fundo = (papel) => "var(--" + papel + ")";
  const sobre = (papel) => "var(--on-" + papel + ")";

  function achar(r, numero) {
    return r ? TSE.candidato(r, numero) : null;
  }

  // ---- Utilidades de tela ------------------------------------------------------------
  function fotoHtml(c, chaveEleicao) {
    const inicial = esc(String(nomeExibicao(c.nome)).charAt(0));
    const vazio = '<div class="foto foto-vazia" aria-hidden="true">' + inicial + "</div>";
    const url = c.sq ? TSE.urlFoto(CFG, estado.eleicoes[chaveEleicao], "br", c.sq) : "";
    if (!url) return vazio;
    return '<img class="foto" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-vazio="' + esc(vazio) + '">';
  }

  /** Barra de duas partes com traço em 50%. `classe` troca o tamanho (barra-fina) e tira o rótulo. */
  function barraDupla(a, b, classe) {
    return '<div class="' + (classe || "barra-duelo") + '" aria-hidden="true">' +
      '<div class="seg a" style="width:' + a.pct + "%;background:" + a.cor + '"></div>' +
      '<div class="seg b" style="width:' + b.pct + "%;background:" + b.cor + '"></div>' +
      '<div class="marco">' + (classe ? "" : "<span>50%</span>") + "</div></div>";
  }

  function garantirVisivel(el) {
    const r = el.getBoundingClientRect();
    const topo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topo-altura")) || 120;
    const visivel = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, topo);
    if (visivel < Math.min(r.height, window.innerHeight * 0.5) * 0.7) {
      el.scrollIntoView({ behavior: reduzMovimento ? "auto" : "smooth", block: "start" });
    }
  }

  /** Avisa leitores de tela só quando o texto da manchete muda (não a cada atualização). */
  function anunciar(texto) {
    if (texto === ui.ultimoAnuncio) return;
    ui.ultimoAnuncio = texto;
    $("anuncio").textContent = texto;
  }

  /** <option>s com os estados em ordem alfabética; o primeiro tem valor vazio. */
  function opcoesUf(primeiro) {
    const ufs = TSE.UFS.slice().sort(function (x, y) { return TSE.NOMES[x].localeCompare(TSE.NOMES[y], "pt-BR"); });
    return '<option value="">' + esc(primeiro) + "</option>" +
      ufs.map(function (uf) { return '<option value="' + uf + '">' + esc(TSE.NOMES[uf]) + "</option>"; }).join("") + '<option value="zz">Exterior</option>';
  }

  /** Troca o espaço dentro do nome dos candidatos por espaço fixo, para a manchete não quebrar no meio do nome. */
  function juntarNomes(texto, nomes) {
    let t = texto;
    nomes.forEach(function (n) {
      const exibicao = nomeExibicao(n);
      if (exibicao.indexOf(" ") > 0) t = t.split(exibicao).join(exibicao.replace(/ /g, "\u00a0"));
    });
    return t;
  }

  function horaTse(r) {
    return r && r.dg ? TSE.dataHora(r.dg, r.hg) : null;
  }

  // ---- Topo: situação e botão de atualizar ---------------------------------------------------
  function renderStatus() {
    const r = estado.dados.federal2.br;
    const sit = Dados.situacao();
    let classe = "espera";
    let curto = "Conectando…";
    let longo = "";
    if (!r) {
      if (sit === "erro") {
        classe = "erro";
        curto = "Sem conexão com o TSE";
      }
    } else if (r.finalizada) {
      classe = "ok";
      curto = "Apuração encerrada";
    } else if (!r.pctSecoes) {
      curto = "Aguardando apuração";
    } else {
      classe = "vivo";
      curto = "Ao vivo";
      longo = " · " + pct(r.pctSecoes, 1) + " apurado";
    }
    const status = $("status");
    status.className = "status " + classe;
    status.innerHTML = "<span>" + esc(curto) + '<span class="status-txt-longo">' + esc(longo) + "</span></span>";
    $("atualizar").classList.toggle("girando", !!estado.carregando);
  }

  function renderAviso() {
    const aviso = $("aviso");
    let html = "";
    let erro = false;
    if (estado.falhaTotal) {
      erro = true;
      html = "Não foi possível ler os arquivos do TSE agora (rede ou bloqueio do navegador)." +
        (estado.usandoCache ? " Mostrando a última leitura salva neste navegador." : "") +
        " A página tenta de novo sozinha a cada minuto." +
        (estado.viaProxy ? "" : " Se persistir, rode <code>node server.mjs</code> e abra http://localhost:8080 para ler pelo servidor local.");
    } else if (estado.falhas > 0) {
      html = estado.falhas + " arquivo(s) do 2º turno falharam nesta leitura; o restante está atualizado.";
    }
    aviso.hidden = !html;
    aviso.className = "aviso" + (erro ? " erro" : "");
    aviso.innerHTML = html ? UI.icone("alerta") + "<span>" + html + "</span>" : "";
  }

  // ---- Resumo ------------------------------------------------------------------------------------
  function resultadoDoTurno() {
    return ui.turno === 2 ? estado.dados.federal2.br : Dados.resultado("federal1", "br");
  }

  function seloEstado() {
    if (ui.turno === 1) return { classe: "ok", texto: "Apuração encerrada" };
    const r = estado.dados.federal2.br;
    if (!r) return { classe: "espera", texto: Dados.situacao() === "erro" ? "Sem conexão" : "Carregando" };
    if (r.finalizada) return { classe: "ok", texto: "Apuração encerrada" };
    if (!r.pctSecoes) return { classe: "espera", texto: "Aguardando apuração" };
    return { classe: "vivo", texto: "Ao vivo" };
  }

  function cartaoCandidato(f, c, papel, ehLider, comecou, chave) {
    const eleito = !!(c && c.eleito);
    const selo = eleito ? '<span class="selo">' + UI.icone("check") + "Eleito</span>" : ehLider ? '<span class="selo">À frente</span>' : "";
    return '<div class="cand' + (ehLider || eleito ? " lider" : "") + '" style="--cor:' + fundo(papel) + ";--sobre:" + sobre(papel) + '">' +
      '<div class="cand-topo">' + fotoHtml(f, chave) + '<div class="cand-id"><p class="cand-nome">' + esc(nomeExibicao(f.nome)) +
      '</p><p class="cand-partido">' + esc(f.partido) + " · " + esc(f.numero) + "</p></div></div>" +
      "<div>" + (comecou
        ? '<p class="cand-pct">' + fmtN(c.pct, 2) + '<span class="un">%</span></p><p class="cand-votos">' + votos(c.votos) + "</p>"
        : '<p class="cand-pct mudo">—</p><p class="cand-votos">aguardando as primeiras urnas</p>') + "</div>" + selo + "</div>";
  }

  function blocoDuelo(r, par, P) {
    const comecou = r && r.pctSecoes > 0;
    const a = achar(r, par[0].numero);
    const b = achar(r, par[1].numero);
    const completo = comecou && a && b;
    const ladoA = completo && a.votos > b.votos;
    const ladoB = completo && b.votos > a.votos;
    let html = '<div class="duelo">' +
      cartaoCandidato(par[0], a, P[par[0].numero], ladoA, completo, "federal2") +
      cartaoCandidato(par[1], b, P[par[1].numero], ladoB, completo, "federal2") + "</div>";
    if (completo) {
      html += '<div class="barra-duelo" role="img" aria-label="' + esc(nomeCurto(par[0].nome)) + " " + pct(a.pct, 2) + ", " + esc(nomeCurto(par[1].nome)) + " " + pct(b.pct, 2) + '">' +
        '<div class="seg a" style="width:' + a.pct + "%;background:" + fundo(P[par[0].numero]) + '"></div>' +
        '<div class="seg b" style="width:' + b.pct + "%;background:" + fundo(P[par[1].numero]) + '"></div>' +
        '<div class="marco"><span>50%</span></div></div>';
      const dif = Math.abs(a.votos - b.votos);
      const difPts = Math.abs(a.pct - b.pct);
      html += '<dl class="resumo-numeros">' +
        "<div><dt>Diferença entre os dois " + UI.ajuda("diferenca") + "</dt><dd>" + votos(dif) + "<small>" + pontos(difPts, difPts < 1 ? 2 : 1) + " de diferença</small></dd></div>" +
        "<div><dt>Votos válidos apurados " + UI.ajuda("votosValidos") + "</dt><dd>" + inteiro(r.validos) + "<small>só votos em candidatos</small></dd></div>" +
        "<div><dt>Para vencer</dt><dd>Mais de 50%<small>dos votos válidos</small></dd></div></dl>";
    }
    return html;
  }

  function blocoLista(r, par, P) {
    const maximo = Math.max.apply(null, r.candidatos.map(function (c) { return c.pct || 0; }).concat([1]));
    const linhas = r.candidatos.map(function (c) {
      const fin = par.some(function (f) { return f.numero === c.numero; });
      const papel = fin ? P[c.numero] : null;
      const cor = papel ? fundo(papel) : "var(--outros)";
      const marca = c.eleito ? '<span class="badge-2t">Eleito</span>' : fin ? '<span class="badge-2t">2º turno</span>' : "";
      return '<div class="linha-cand" style="--cor:' + cor + '">' + fotoHtml(c, "federal1") +
        '<div class="quem"><b>' + esc(nomeExibicao(c.nome)) + marca + "</b><small>" + esc(c.partido) + " · " + esc(c.numero) + "</small></div>" +
        '<div class="valor"><b>' + pct(c.pct, 2) + "</b><small>" + (c.votos ? inteiro(c.votos) + " votos" : "") + "</small></div>" +
        '<div class="trilho"><i style="width:' + ((c.pct || 0) / maximo) * 100 + "%;background:" + cor + '"></i></div></div>';
    });
    return '<div class="lista-cand">' + linhas.join("") + "</div>" +
      (r.reserva ? '<p class="nota">Aqui aparecem só os dois candidatos que foram ao 2º turno; a lista completa volta quando o arquivo do TSE puder ser lido.</p>' : "");
  }

  function renderHero() {
    const alvo = $("hero");
    const par = Dados.finalistas();
    const r = resultadoDoTurno();
    const sit = Dados.situacao();
    const m = Texto.manchete({
      turno: ui.turno,
      status: !r ? (sit === "erro" ? "erro" : "carregando") : "ok",
      resultado: r,
      finalistas: par,
      dataSegundoTurno: CFG.datas.turno2,
    });
    const P = par.length === 2 ? papeis(par.map(function (c) { return c.numero; })) : {};
    const selo = seloEstado();

    let html = '<div class="hero-topo"><div class="hero-meta"><span class="selo-estado ' + selo.classe + '">' + esc(selo.texto) + "</span>" +
      "<span>" + ui.turno + "º turno · " + esc(CFG.datas["turno" + ui.turno]) + " de 2026</span></div>" +
      '<div class="segmentado" role="group" aria-label="Escolher o turno">' +
      '<button type="button" data-turno="1" aria-pressed="' + (ui.turno === 1) + '">1º turno</button>' +
      '<button type="button" data-turno="2" aria-pressed="' + (ui.turno === 2) + '">2º turno</button></div></div>';

    html += '<h2 class="manchete" id="resumo-titulo">' + juntarNomes(esc(m.titulo), par.map(function (c) { return c.nome; })) + '</h2><p class="lead">' + esc(m.texto) + "</p>";
    if (m.aviso) html += '<p class="aviso-hero">' + UI.icone("info") + "<span>" + esc(m.aviso) + "</span></p>";

    if (r && par.length === 2) {
      html += ui.turno === 2 ? blocoDuelo(r, par, P) : blocoLista(r, par, P);

      if (r.pctSecoes != null && (ui.turno === 2 || r.secoesTotal)) {
        html += '<div class="progresso"><div class="progresso-topo"><span><b>' + pct(r.pctSecoes, 1) + "</b> das urnas apuradas " + UI.ajuda("urnas") + "</span>" +
          "<span>" + (r.secoesTotal ? inteiro(r.secoesTotalizadas) + " de " + inteiro(r.secoesTotal) + " urnas" : "") + "</span></div>" +
          '<div class="trilho" role="progressbar" aria-label="Urnas apuradas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(r.pctSecoes) + '"><i style="width:' + Math.min(100, r.pctSecoes) + '%"></i></div></div>';
      }
      const data = horaTse(r);
      html += '<div class="hero-rodape"><span data-hora="' + (data ? data.getTime() : "") + '" data-rotulo="' + (r.reserva ? "Retrato salvo do 1º turno" : "Atualizado pelo TSE") + '"></span>' +
        '<div class="hero-acoes"><select data-uf-rapido aria-label="Ver o resultado do meu estado">' + opcoesUf("Ver meu estado…") + "</select>" +
        '<a href="#entenda">Como ler estes números</a></div></div>';
    } else if (m.tipo === "erro") {
      html += '<div class="vazio-msg" style="margin-top:20px"><b>Sem dados por enquanto</b><span>Assim que a conexão voltar, os números aparecem aqui.</span>' +
        '<button type="button" class="botao" data-acao="atualizar">Tentar de novo</button></div>';
    } else {
      html += '<div class="duelo"><div class="esq" style="height:170px;border-radius:16px"></div><div class="esq" style="height:170px;border-radius:16px"></div></div>';
    }

    alvo.innerHTML = html;
    atualizarRelogio();
    if (m.tipo !== "carregando") anunciar(m.titulo + ". " + m.texto);
    let titulo = "Eleições 2026: apuração ao vivo para presidente";
    if (r && par.length === 2 && ui.turno === 2 && r.pctSecoes > 0) {
      const a = achar(r, par[0].numero);
      const b = achar(r, par[1].numero);
      if (a && b) titulo = nomeCurto(par[0].nome) + " " + fmtN(a.pct, 1) + "% × " + fmtN(b.pct, 1) + "% " + nomeCurto(par[1].nome) + " · Eleições 2026";
    }
    document.title = titulo;
  }

  function atualizarRelogio() {
    document.querySelectorAll("[data-hora]").forEach(function (no) {
      const t = Number(no.dataset.hora);
      if (!t) {
        no.textContent = "";
        return;
      }
      const d = new Date(t);
      const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
      const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      let txt = no.dataset.rotulo + " em " + dia + " às " + hora + " (Brasília)";
      const r = estado.dados.federal2.br;
      if (ui.turno === 2) {
        const atras = Texto.haQuanto(Date.now() - t);
        if (atras) txt += " · " + atras;
        if (r && !r.finalizada && estado.proximaLeitura && !estado.carregando) {
          const s = Math.max(0, Math.round((estado.proximaLeitura - Date.now()) / 1000));
          txt += " · próxima consulta em " + s + " s";
        }
      }
      no.textContent = txt;
    });
  }

  // ---- Indicadores ----------------------------------------------------------------------------------
  /** ref = {de: "do 1º turno", a: "ao 1º turno"}: "acima do 1º turno", "igual ao 1º turno". */
  function deltaHtml(atual, anterior, ref) {
    if (atual == null || anterior == null) return "";
    const d = atual - anterior;
    if (Math.abs(d) < 0.05) return '<li class="delta"><i class="seta igual"></i><span>igual ' + ref.a + "</span></li>";
    return '<li class="delta"><i class="seta ' + (d > 0 ? "cima" : "baixo") + '"></i><span><b>' + pontos(d) + "</b> " + (d > 0 ? "acima" : "abaixo") + " " + ref.de + "</span></li>";
  }

  function renderKpis() {
    const r = resultadoDoTurno();
    const alvo = $("kpis");
    if (!r) return;
    const comecou = r.pctSecoes > 0 && !r.reserva;
    const comparacoes = ui.turno === 2
      ? [{ r: Dados.resultado("federal1", "br"), ref: { de: "do 1º turno", a: "ao 1º turno" } }, { r: Dados.resultado("anterior2", "br"), ref: { de: "de 2022", a: "a 2022" } }]
      : [{ r: Dados.resultado("anterior1", "br"), ref: { de: "do 1º turno de 2022", a: "ao 1º turno de 2022" } }];
    const invalidos = function (x) { return x.pctBrancos != null && x.pctNulos != null ? x.pctBrancos + x.pctNulos : null; };
    const deltas = function (campo, calculo) {
      if (!comecou) return "";
      const valor = calculo ? calculo(r) : r[campo];
      return comparacoes.map(function (c) {
        if (!c.r || c.r.reserva) return "";
        return deltaHtml(valor, calculo ? calculo(c.r) : c.r[campo], c.ref);
      }).join("");
    };
    const espera = "Aguardando as primeiras urnas";
    const antes = comparacoes[comparacoes.length - 1].r;
    let crescimento = "";
    if (r.eleitorado && antes && antes.eleitorado) {
      const v = ((r.eleitorado - antes.eleitorado) / antes.eleitorado) * 100;
      crescimento = Math.abs(v) < 0.05
        ? '<li class="delta"><i class="seta igual"></i><span>igual a 2022</span></li>'
        : '<li class="delta"><i class="seta ' + (v > 0 ? "cima" : "baixo") + '"></i><span><b>' + pct(Math.abs(v), 1) + "</b> " + (v > 0 ? "a mais" : "a menos") + " que em 2022</span></li>";
    }
    const cartoes = [
      {
        rotulo: "Eleitorado", ajuda: "eleitorado", valor: r.eleitorado ? milhoes(r.eleitorado) : "—", barra: null,
        desc: r.eleitorado ? inteiro(r.eleitorado) + " pessoas aptas a votar" : "", deltas: crescimento,
      },
      {
        rotulo: "Comparecimento", ajuda: "comparecimento", valor: comecou ? pct(r.pctComparecimento, 1) : "—", barra: comecou ? r.pctComparecimento : null,
        desc: comecou ? milhoes(r.comparecimento) + " de eleitores foram votar" : espera, deltas: deltas("pctComparecimento"),
      },
      {
        rotulo: "Abstenção", ajuda: "abstencao", valor: comecou ? pct(r.pctAbstencao, 1) : "—", barra: comecou ? r.pctAbstencao : null,
        desc: comecou ? milhoes(r.abstencao) + " de eleitores não foram votar" : espera, deltas: deltas("pctAbstencao"),
      },
      {
        rotulo: "Brancos e nulos", ajuda: "brancosNulos", valor: comecou && invalidos(r) != null ? pct(invalidos(r), 1) : "—", barra: null,
        desc: comecou ? pct(r.pctBrancos, 1) + " em branco e " + pct(r.pctNulos, 1) + " nulos" : espera, deltas: deltas(null, invalidos),
      },
    ];
    alvo.innerHTML = cartoes.map(function (k) {
      return '<article class="cartao kpi"><div class="kpi-cab"><h3>' + k.rotulo + "</h3>" + UI.ajuda(k.ajuda) + "</div>" +
        '<p class="kpi-valor">' + k.valor + "</p>" +
        (k.barra != null ? '<div class="kpi-barra" aria-hidden="true"><i style="width:' + Math.min(100, k.barra) + '%"></i></div>' : "") +
        '<p class="kpi-desc">' + esc(k.desc) + "</p>" +
        (k.deltas ? '<ul class="deltas">' + k.deltas + "</ul>" : "") + "</article>";
    }).join("");
    const parcial = ui.turno === 2 && comecou && !r.finalizada;
    $("kpis-nota").textContent = parcial ? "Enquanto a apuração não termina, as comparações usam só as urnas já apuradas e podem mudar." : "";
  }

  // ---- Mapa -------------------------------------------------------------------------------------------------
  const MODOS = {
    lider2: { tipo: "div", cortes: [2, 10, 20], verbo: "à frente por", explica: "A cor mostra quem tem mais votos em cada estado, e o tom indica a vantagem: quanto mais escuro, maior a diferença." },
    lider1: { tipo: "div", cortes: [2, 10, 20], verbo: "à frente por", explica: "Mesma leitura, mas com o resultado do 1º turno (contando os votos de todos os candidatos)." },
    osc1: { tipo: "div", cortes: [0.5, 2, 4], verbo: "ganhou", explica: "Compara só os votos dos dois finalistas no 1º turno com os do 2º. A cor mostra quem ganhou terreno em cada estado; quanto mais escuro, maior o ganho." },
    osc22: { tipo: "div", cortes: [0.5, 2, 5], verbo: "ganhou", explica: "Compara com o 2º turno de 2022 usando o número dos partidos (PT e PL). A cor mostra quem ganhou terreno desde então." },
    abst: { tipo: "seq", explica: "Quanto mais escuro, maior a abstenção entre as urnas já apuradas." },
    urnas: { tipo: "seq", dominio: [0, 100], explica: "Quanto mais escuro, mais urnas do estado já foram apuradas." },
  };

  function valorUf(uf, numeros) {
    const [a, b] = numeros;
    const r2 = estado.dados.federal2[uf];
    const r1 = estado.dados.federal1[uf];
    const r22 = estado.dados.anterior2[uf];
    const comecou = r2 && r2.pctSecoes > 0;
    switch (ui.modoMapa) {
      case "lider2": return comecou ? TSE.margem(r2, a, b) : null;
      case "lider1": return r1 ? TSE.margem(r1, a, b) : null;
      case "osc1": { const o = comecou && r1 ? TSE.oscilacao(r1, r2, a, b) : null; return o ? o.mudancaA : null; }
      case "osc22": { const o = comecou && r22 ? TSE.oscilacao(r22, r2, a, b) : null; return o ? o.mudancaA : null; }
      case "abst": return comecou ? r2.pctAbstencao : null;
      case "urnas": return r2 ? r2.pctSecoes : null;
    }
    return null;
  }

  function tomDiv(v, modo, numeros, P) {
    const abs = Math.abs(v);
    if (abs < modo.cortes[0]) return { fundo: "var(--surface-3)", texto: "var(--ink-2)", neutro: true, nivel: 0 };
    const papel = P[v > 0 ? numeros[0] : numeros[1]];
    const nivel = abs < modo.cortes[1] ? 1 : abs < modo.cortes[2] ? 2 : 3;
    const mistura = ["", "var(--mix-1)", "var(--mix-2)", ""][nivel];
    return {
      fundo: nivel === 3 ? fundo(papel) : "color-mix(in oklab, " + fundo(papel) + " " + mistura + ", var(--surface))",
      texto: nivel === 3 ? sobre(papel) : "var(--ink)",
      nivel: nivel,
    };
  }

  function calcularMapa() {
    const par = Dados.finalistas();
    if (par.length < 2) return null;
    const numeros = par.map(function (c) { return c.numero; });
    const P = papeis(numeros);
    const nomes = apelidos(par[0].nome, par[1].nome);
    const modo = MODOS[ui.modoMapa];
    const ufs = UFS_VALIDAS.filter(function (u) { return u !== "br"; });
    const valores = {};
    ufs.forEach(function (uf) { valores[uf] = valorUf(uf, numeros); });

    let dominio = modo.dominio;
    if (modo.tipo === "seq" && !dominio) {
      const lista = ufs.map(function (uf) { return valores[uf]; }).filter(function (v) { return v != null; });
      dominio = lista.length ? [Math.min.apply(null, lista), Math.max.apply(null, lista)] : [0, 1];
    }

    const estilos = {};
    ufs.forEach(function (uf) {
      const v = valores[uf];
      if (v == null) {
        estilos[uf] = null;
        return;
      }
      if (modo.tipo === "div") {
        const t = tomDiv(v, modo, numeros, P);
        estilos[uf] = {
          fundo: t.fundo, texto: t.texto,
          valor: t.neutro ? "=" : fmtN(Math.abs(v), 1),
          aria: t.neutro ? "situação equilibrada" : nomes[v > 0 ? 0 : 1] + " " + modo.verbo + " " + pontos(v, 1),
        };
      } else {
        const [min, max] = dominio;
        const k = max > min ? Math.min(4, Math.max(0, Math.floor(((v - min) / (max - min)) * 5))) : 4;
        estilos[uf] = { fundo: "var(--seq-" + (k + 1) + ")", texto: "var(--on-seq-" + (k + 1) + ")", valor: fmtN(v, 1) + "%", aria: pct(v, 1) };
      }
    });
    return { par: par, numeros: numeros, P: P, nomes: nomes, modo: modo, dominio: dominio, estilos: estilos };
  }

  function legendaMapa(m) {
    const itens = [];
    if (m.modo.tipo === "div") {
      const c = m.modo.cortes;
      const fmt = (x) => fmtN(x, x % 1 ? 1 : 0);
      const rotulos = [fmt(c[0]) + " a " + fmt(c[1]) + " pts", fmt(c[1]) + " a " + fmt(c[2]) + " pts", "mais de " + fmt(c[2]) + " pts"];
      m.par.forEach(function (f, i) {
        const papel = m.P[f.numero];
        const amostras = ["var(--mix-1)", "var(--mix-2)", ""].map(function (mist, k) {
          const cor = !mist ? fundo(papel) : "color-mix(in oklab, " + fundo(papel) + " " + mist + ", var(--surface))";
          return '<span class="item"><i class="amostra" style="background:' + cor + '"></i>' + rotulos[k] + "</span>";
        }).join("");
        itens.push('<li class="grupo"><b>' + esc(m.nomes[i]) + (m.modo.verbo === "ganhou" ? " ganhou" : " na frente por") + "</b>" + amostras + "</li>");
      });
      itens.push('<li><i class="amostra" style="background:var(--surface-3)"></i>Praticamente igual (menos de ' + fmt(c[0]) + (c[0] >= 2 ? " pontos" : " ponto") + ")</li>");
    } else {
      const [min, max] = m.dominio;
      for (let i = 0; i < 5; i++) {
        const de = min + ((max - min) * i) / 5;
        const ate = min + ((max - min) * (i + 1)) / 5;
        itens.push('<li><i class="amostra" style="background:var(--seq-' + (i + 1) + ')"></i>' + fmtN(de, 0) + "% a " + fmtN(ate, 0) + "%</li>");
      }
    }
    itens.push('<li><i class="amostra" style="background:repeating-linear-gradient(45deg, var(--surface-2) 0 3px, var(--surface-3) 3px 6px)"></i>Sem dados ainda</li>');
    return itens.join("");
  }

  function dicaUf(uf, m) {
    const r2 = estado.dados.federal2[uf];
    const r1 = Dados.resultado("federal1", uf);
    const r22 = estado.dados.anterior2[uf];
    const comecou = r2 && r2.pctSecoes > 0;
    const linhas = m.par.map(function (f) {
      const c2 = comecou ? achar(r2, f.numero) : null;
      return '<div class="tip-linha"><span class="chave" style="--c:' + fundo(m.P[f.numero]) + '"></span>' + esc(nomeCurto(f.nome)) + "<b>" + (c2 ? pct(c2.pct, 2) : "—") + "</b></div>";
    }).join("");
    const lado = function (r) {
      return m.par.map(function (f) { const c = achar(r, f.numero); return c ? fmtN(c.pct, 1) + "%" : "—"; }).join(" × ");
    };
    return '<div class="tip-titulo">' + esc(TSE.NOMES[uf]) + "</div>" + linhas +
      '<div class="tip-linha tip-mudo"><span>1º turno</span><b>' + lado(r1) + "</b></div>" +
      '<div class="tip-linha tip-mudo"><span>2º turno de 2022</span><b>' + lado(r22) + "</b></div>" +
      '<div class="tip-linha tip-mudo"><span>Urnas apuradas</span><b>' + (r2 ? pct(r2.pctSecoes, 1) : "—") + "</b></div>" +
      '<div class="tip-linha tip-mudo" style="margin-top:4px">Clique para ver os detalhes</div>';
  }

  function renderMapa() {
    const alvo = $("mapa-area");
    const m = calcularMapa();
    document.querySelectorAll("[data-visao]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.visao === ui.visaoMapa)); });
    if (!m) {
      alvo.innerHTML = '<div class="esq" style="height:420px;border-radius:16px"></div>';
      $("mapa-legenda").innerHTML = "";
      $("mapa-explica").textContent = "";
      return;
    }
    Mapa.desenhar(alvo, {
      visao: ui.visaoMapa,
      estilo: function (uf) { return m.estilos[uf]; },
      selecionado: ui.uf,
      aoEscolher: function (uf) { escolherUf(uf === ui.uf && uf !== "br" ? "br" : uf, true); },
      dica: function (uf) { return dicaUf(uf, m); },
    });
    $("mapa-legenda").innerHTML = legendaMapa(m);
    $("mapa-explica").innerHTML = esc(m.modo.explica) + (m.modo.tipo === "div" ? " Os números nos botões e nos quadrados são a diferença em pontos percentuais " + UI.ajuda("ponto") + "." : "") +
      " Clique de novo no estado escolhido para voltar ao Brasil.";
  }

  // ---- Painel do estado ------------------------------------------------------------------------------------------
  function nomesDuelo(a, b, P, par, nomeA, nomeB, valorA, valorB) {
    return '<div class="duelo-mini-nomes">' +
      '<div><span class="nm"><i class="chave" style="--c:' + fundo(P[par[0].numero]) + '"></i>' + esc(nomeA) + '</span><span class="pc">' + valorA + "</span></div>" +
      '<div><span class="nm">' + esc(nomeB) + '<i class="chave" style="--c:' + fundo(P[par[1].numero]) + '"></i></span><span class="pc">' + valorB + "</span></div></div>";
  }

  function blocoSegundoTurno(par, P, r2) {
    if (!r2 || !(r2.pctSecoes > 0)) {
      return '<div class="vazio-msg"><b>A apuração aqui ainda não começou</b><span>Os números aparecem assim que o TSE divulgar as primeiras urnas deste local.</span></div>';
    }
    const a = achar(r2, par[0].numero);
    const b = achar(r2, par[1].numero);
    if (!a || !b) return "";
    const dif = Math.abs(a.votos - b.votos);
    const difPts = Math.abs(a.pct - b.pct);
    const [nomeA, nomeB] = apelidos(par[0].nome, par[1].nome);
    let frase;
    if (a.votos === b.votos) frase = "Os dois candidatos estão empatados.";
    else {
      const lider = a.votos > b.votos ? nomeA : nomeB;
      frase = "<b>" + esc(lider) + "</b> " + (r2.finalizada ? "ficou na frente" : "está na frente") + " por " + votos(dif) + " (" + pontos(difPts, difPts < 1 ? 2 : 1) + ").";
    }
    return nomesDuelo(a, b, P, par, nomeCurto(par[0].nome), nomeCurto(par[1].nome), pct(a.pct, 2), pct(b.pct, 2)) +
      barraDupla({ pct: a.pct, cor: fundo(P[par[0].numero]) }, { pct: b.pct, cor: fundo(P[par[1].numero]) }, "barra-fina") +
      '<p class="frase">' + frase + "</p>";
  }

  function blocoPrimeiroTurno(par, P, r1) {
    const a = achar(r1, par[0].numero);
    const b = achar(r1, par[1].numero);
    if (!a || !b) return "";
    const outros = Math.max(0, 100 - a.pct - b.pct);
    return nomesDuelo(a, b, P, par, nomeCurto(par[0].nome), nomeCurto(par[1].nome), pct(a.pct, 2), pct(b.pct, 2)) +
      '<div class="barra-fina" aria-hidden="true"><div class="seg a" style="width:' + a.pct + "%;background:" + fundo(P[par[0].numero]) + '"></div>' +
      '<div class="seg" style="width:' + outros + '%;background:var(--outros)"></div>' +
      '<div class="seg b" style="width:' + b.pct + "%;background:" + fundo(P[par[1].numero]) + '"></div></div>' +
      '<p class="frase">Os outros candidatos somaram <b>' + pct(outros, 1) + "</b> dos votos válidos.</p>";
  }

  function blocoDe2022(par, P, r22) {
    const a = achar(r22, par[0].numero);
    const b = achar(r22, par[1].numero);
    if (!a || !b) return "";
    return nomesDuelo(a, b, P, par, nomeCurto(a.nome), nomeCurto(b.nome), pct(a.pct, 2), pct(b.pct, 2)) +
      barraDupla({ pct: a.pct, cor: fundo(P[par[0].numero]) }, { pct: b.pct, cor: fundo(P[par[1].numero]) }, "barra-fina");
  }

  function renderPainelUf() {
    const uf = ui.uf;
    const par = Dados.finalistas();
    $("painel-titulo").textContent = TSE.NOMES[uf];
    $("uf-select").value = uf;
    const corpo = $("painel-uf-corpo");
    if (par.length < 2) {
      corpo.innerHTML = '<div class="esq" style="height:240px"></div>';
      return;
    }
    const P = papeis(par.map(function (c) { return c.numero; }));
    const r2 = estado.dados.federal2[uf];
    const r1 = Dados.resultado("federal1", uf);
    const r22 = Dados.resultado("anterior2", uf);
    const comecou = r2 && r2.pctSecoes > 0;

    const sub = [];
    if (comecou) sub.push(pct(r2.pctSecoes, 1) + " das urnas apuradas");
    const eleitorado = r2 && r2.eleitorado ? r2.eleitorado : r1 && r1.eleitorado ? r1.eleitorado : null;
    if (eleitorado) sub.push(milhoes(eleitorado) + " de eleitores");
    $("painel-sub").textContent = sub.join(" · ");

    let html = '<div class="bloco"><h4>2º turno ' + (comecou && !r2.finalizada ? "<small>resultado parcial</small>" : "") + "</h4>" + blocoSegundoTurno(par, P, r2) + "</div>";

    if (comecou && r1 && !r1.reserva) {
      const osc = TSE.oscilacao(r1, r2, par[0].numero, par[1].numero);
      const f = osc ? Texto.fraseOscilacao(par[0].nome, par[1].nome, osc, !r2.finalizada) : null;
      if (f) html += '<div class="bloco"><h4>Mudança desde o 1º turno ' + UI.ajuda("oscilacao") + '</h4><p class="frase" style="margin-top:0"><b>' + esc(f.destaque) + ".</b> " + esc(f.detalhe) + "</p></div>";
    }
    if (r1) html += '<div class="bloco"><h4>1º turno <small>' + esc(CFG.datas.turno1) + "</small></h4>" + blocoPrimeiroTurno(par, P, r1) + "</div>";
    if (r22) html += '<div class="bloco"><h4>2º turno de 2022</h4>' + blocoDe2022(par, P, r22) + "</div>";

    const base = comecou ? r2 : r1;
    if (base && base.pctComparecimento != null) {
      const inv = base.pctBrancos != null && base.pctNulos != null ? base.pctBrancos + base.pctNulos : null;
      html += '<div class="bloco"><h4>Participação ' + (comecou ? "no 2º turno" : "no 1º turno") + '</h4><dl class="lista-dl">' +
        "<div><dt>Comparecimento " + UI.ajuda("comparecimento") + "</dt><dd>" + pct(base.pctComparecimento, 1) + "<small>" + milhoes(base.comparecimento) + "</small></dd></div>" +
        "<div><dt>Abstenção " + UI.ajuda("abstencao") + "</dt><dd>" + pct(base.pctAbstencao, 1) + "<small>" + milhoes(base.abstencao) + "</small></dd></div>" +
        "<div><dt>Brancos e nulos " + UI.ajuda("brancosNulos") + "</dt><dd>" + pct(inv, 1) + "</dd></div></dl></div>";
    }
    corpo.innerHTML = html;
  }

  function escolherUf(uf, rolar) {
    ui.uf = uf;
    atualizarUrl();
    renderMapa();
    renderPainelUf();
    renderTabela();
    if (rolar) garantirVisivel($("painel-uf"));
  }

  // ---- Por região --------------------------------------------------------------------------------------------
  function renderRegioes() {
    const alvo = $("regioes");
    const par = Dados.finalistas();
    if (par.length < 2) {
      alvo.innerHTML = '<div class="esq" style="height:180px"></div>';
      return;
    }
    const P = papeis(par.map(function (c) { return c.numero; }));
    const linhas = TSE.REGIOES.map(function (reg) {
      const soma = TSE.somar(reg.ufs.map(function (uf) { return estado.dados.federal2[uf]; }));
      if (!soma || !(soma.pctSecoes > 0)) {
        return { rotulo: "<b>" + esc(reg.nome) + "</b>aguardando apuração", partes: [], aria: reg.nome + ": aguardando apuração" };
      }
      const partes = par.map(function (f) {
        const c = achar(soma, f.numero);
        if (!c) return null;
        return {
          nome: nomeExibicao(f.nome), valor: c.pct, cor: fundo(P[f.numero]), sobre: sobre(P[f.numero]), texto: fmtN(c.pct, 1) + "%",
          textoLongo: pct(c.pct, 2) + " · " + inteiro(c.votos) + " votos", nomeNoSegmento: nomeCurto(f.nome),
        };
      }).filter(Boolean);
      const dif = partes.length === 2 ? Math.abs(partes[0].valor - partes[1].valor) : null;
      return {
        rotulo: "<b>" + esc(reg.nome) + "</b>" + pct(soma.pctSecoes, 0) + " das urnas",
        fim: dif == null ? "" : "<b>" + fmtN(dif, 1) + " pts</b>de diferença",
        dica: reg.nome + " · 2º turno",
        partes: partes,
      };
    });
    Graficos.barras100(alvo, linhas, { meio: true });
  }

  // ---- Tabela de estados -------------------------------------------------------------------------------------------
  const semAcento = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function renderTabela() {
    const alvo = $("tabela-ufs");
    const par = Dados.finalistas();
    if (par.length < 2) {
      alvo.innerHTML = "";
      return;
    }
    const [a, b] = par.map(function (c) { return c.numero; });
    const P = papeis([a, b]);
    const nomes = apelidos(par[0].nome, par[1].nome);

    function linha(uf) {
      const r2 = estado.dados.federal2[uf];
      const r1 = Dados.resultado("federal1", uf);
      const comecou = r2 && r2.pctSecoes > 0;
      const ca = comecou ? achar(r2, a) : null;
      const cb = comecou ? achar(r2, b) : null;
      const margem = comecou ? TSE.margem(r2, a, b) : null;
      const osc = comecou && r1 && !r1.reserva ? TSE.oscilacao(r1, r2, a, b) : null;
      return {
        uf: uf, nome: TSE.NOMES[uf], urnas: r2 ? r2.pctSecoes : null, margem: margem, difAbs: margem == null ? null : Math.abs(margem),
        a: ca ? ca.pct : null, b: cb ? cb.pct : null, osc: osc ? osc.mudancaA : null, abst: comecou ? r2.pctAbstencao : null,
      };
    }

    const colunas = [
      { id: "nome", rotulo: "Estado" },
      { id: "urnas", rotulo: "Urnas apuradas" },
      { id: "margem", rotulo: "Na frente" },
      { id: "difAbs", rotulo: "Diferença (pontos)" },
      { id: "a", rotulo: nomes[0] },
      { id: "b", rotulo: nomes[1] },
      { id: "osc", rotulo: "Ganhou terreno desde o 1º turno" },
      { id: "abst", rotulo: "Abstenção" },
    ];

    const filtro = semAcento(ui.filtro.trim());
    const dados = TSE.UFS.concat(["zz"]).map(linha).filter(function (d) {
      return !filtro || semAcento(d.nome).indexOf(filtro) >= 0 || d.uf.indexOf(filtro) === 0;
    });
    const { coluna, desc } = ui.ordem;
    dados.sort(function (x, y) {
      if (coluna === "nome") return x.nome.localeCompare(y.nome, "pt-BR") * (desc ? -1 : 1);
      const vx = x[coluna];
      const vy = y[coluna];
      if (vx == null && vy == null) return x.nome.localeCompare(y.nome, "pt-BR");
      if (vx == null) return 1;
      if (vy == null) return -1;
      return (vx - vy) * (desc ? -1 : 1) || x.nome.localeCompare(y.nome, "pt-BR");
    });

    const quem = function (v) {
      const k = v > 0 ? 0 : 1;
      return '<i class="chave" style="--c:' + fundo(P[par[k].numero]) + '"></i>' + esc(nomes[k]);
    };
    const celulaLider = (margem) => margem == null ? "—" : Math.abs(margem) < 0.05 ? "Empate" : '<span class="cel-lider">' + quem(margem) + "</span>";
    const celulaOsc = (v) => v == null ? "—" : Math.abs(v) < 0.05 ? "igual" : '<span class="cel-lider">' + quem(v) + " " + fmtN(Math.abs(v), 1) + "</span>";
    const celulas = function (d) {
      return "<td><b>" + esc(d.nome) + "</b></td>" +
        '<td><div class="cel-urnas"><span>' + pct(d.urnas, 1) + '</span><div class="trilho" aria-hidden="true"><i style="width:' + (d.urnas || 0) + '%"></i></div></div></td>' +
        "<td>" + celulaLider(d.margem) + "</td><td>" + (d.difAbs == null ? "—" : fmtN(d.difAbs, 1)) + "</td>" +
        "<td>" + pct(d.a, 1) + "</td><td>" + pct(d.b, 1) + "</td><td>" + celulaOsc(d.osc) + "</td><td>" + pct(d.abst, 1) + "</td>";
    };

    const cab = colunas.map(function (c) {
      const ativo = c.id === coluna;
      return '<th scope="col" class="ord"' + (ativo ? ' aria-sort="' + (desc ? "descending" : "ascending") + '"' : "") + '><button type="button" class="ord-btn" data-col="' + c.id + '">' + esc(c.rotulo) + "</button></th>";
    }).join("");

    const total = filtro ? "" : '<tr class="total' + (ui.uf === "br" ? " sel" : "") + '" tabindex="0" data-uf="br">' + celulas(linha("br")) + "</tr>";
    const corpo = dados.length
      ? dados.map(function (d) { return '<tr class="' + (ui.uf === d.uf ? "sel" : "") + '" tabindex="0" data-uf="' + d.uf + '">' + celulas(d) + "</tr>"; }).join("")
      : '<tr class="vazio-linha"><td colspan="8">Nenhum estado encontrado para “' + esc(ui.filtro) + "”.</td></tr>";
    alvo.innerHTML = '<caption class="so-leitor">Resultado do 2º turno por estado</caption><thead><tr>' + cab + "</tr></thead><tbody>" + total + corpo + "</tbody>";
  }

  // ---- 1º × 2º turno -------------------------------------------------------------------------------------------------------------
  function renderComparar() {
    const alvo = $("comparar-corpo");
    const par = Dados.finalistas();
    const r1 = Dados.resultado("federal1", "br");
    const r2 = estado.dados.federal2.br;
    const r22 = Dados.resultado("anterior2", "br");
    if (par.length < 2 || !r1) {
      alvo.innerHTML = '<div class="cartao"><div class="esq" style="height:200px"></div></div>';
      return;
    }
    const numeros = par.map(function (c) { return c.numero; });
    const P = papeis(numeros);
    const comecou = r2 && r2.pctSecoes > 0;
    const parcial = comecou && !r2.finalizada;

    const parte = function (r, f) {
      const c = achar(r, f.numero);
      if (!c) return null;
      return {
        nome: nomeExibicao(c.nome), valor: c.pct, cor: fundo(P[f.numero]), sobre: sobre(P[f.numero]), texto: fmtN(c.pct, 1) + "%",
        textoLongo: pct(c.pct, 2) + (c.votos ? " · " + inteiro(c.votos) + " votos" : ""), nomeNoSegmento: nomeCurto(c.nome),
      };
    };
    const a1 = achar(r1, numeros[0]);
    const b1 = achar(r1, numeros[1]);
    const outros1 = a1 && b1 ? Math.max(0, 100 - a1.pct - b1.pct) : null;

    const linhas = [{
      rotulo: "<b>1º turno</b>" + esc(CFG.datas.turno1),
      dica: "1º turno de 2026",
      partes: [parte(r1, par[0]), outros1 ? { nome: "Outros candidatos", valor: outros1, cor: "var(--outros)", sobre: "var(--on-outros)", texto: fmtN(outros1, 1) + "%", textoLongo: pct(outros1, 2) } : null, parte(r1, par[1])].filter(Boolean),
    }];
    if (comecou) {
      linhas.push({
        rotulo: "<b>2º turno</b>" + esc(CFG.datas.turno2) + (parcial ? "<br>parcial · " + pct(r2.pctSecoes, 0) + " das urnas" : ""),
        dica: "2º turno de 2026" + (parcial ? " (parcial)" : ""),
        partes: [parte(r2, par[0]), parte(r2, par[1])].filter(Boolean),
      });
    }
    if (r22) {
      linhas.push({
        rotulo: "<b>2º turno de 2022</b>30 de outubro",
        dica: "2º turno de 2022",
        partes: [parte(r22, par[0]), parte(r22, par[1])].filter(Boolean),
      });
    }

    const osc = comecou ? TSE.oscilacao(r1, r2, numeros[0], numeros[1]) : null;
    const f = osc ? Texto.fraseOscilacao(par[0].nome, par[1].nome, osc, parcial) : null;

    let html = '<div class="cartao"><div class="cartao-cab"><div><h3>Como os votos se dividiram</h3>' +
      '<p class="cartao-sub">Cada barra é 100% dos votos válidos. O trecho cinza reúne os candidatos que não chegaram ao 2º turno. O traço no meio marca 50%.</p></div></div>' +
      '<div id="comp-barras"></div>' +
      '<ul class="legenda"><li><i class="amostra" style="background:' + fundo(P[numeros[0]]) + '"></i>' + esc(nomeExibicao(par[0].nome)) + "</li>" +
      '<li><i class="amostra" style="background:' + fundo(P[numeros[1]]) + '"></i>' + esc(nomeExibicao(par[1].nome)) + "</li>" +
      '<li><i class="amostra" style="background:var(--outros)"></i>Outros candidatos do 1º turno</li></ul>' +
      '<p class="nota">As cores seguem os partidos: ' + esc(par[0].partido) + " em " + P[numeros[0]] + " e " + esc(par[1].partido) + " em " + P[numeros[1]] + ". Por isso a barra de 2022 mostra " +
      esc(achar(r22, numeros[0]) ? nomeExibicao(achar(r22, numeros[0]).nome) : "o candidato do " + par[0].partido) + ", que era do " + esc(par[0].partido) + ".</p></div>";

    html += '<div class="insights"><article class="cartao insight"><div class="insight-rotulo">Quem ganhou terreno? ' + UI.ajuda("oscilacao") + "</div>" +
      (f
        ? '<p class="insight-destaque">' + esc(f.destaque) + "</p><p>" + esc(f.detalhe) + "</p>"
        : '<p class="insight-destaque">Aguardando o 2º turno</p><p>Quando a apuração começar, aqui aparece quem ganhou apoio em relação ao 1º turno.</p>') + "</article>";
    if (outros1 != null) {
      html += '<article class="cartao insight"><div class="insight-rotulo">E os outros candidatos do 1º turno?</div><p class="insight-destaque">' + pct(outros1, 1) + " dos votos válidos</p><p>" + esc(Texto.fraseOutros(outros1)) + "</p></article>";
    }
    html += "</div>";

    // Tabela completa
    const cel = (v, p) => "<td>" + (v != null ? inteiro(v) : "—") + (p != null ? "<small>" + pct(p, 2) + "</small>" : "") + "</td>";
    const linhasTab = par.map(function (fp) {
      const c1 = achar(r1, fp.numero);
      const c2 = comecou ? achar(r2, fp.numero) : null;
      const dif = c1 && c2 ? c2.votos - c1.votos : null;
      return '<tr><td><span class="cel-lider"><i class="chave" style="--c:' + fundo(P[fp.numero]) + '"></i>' + esc(nomeExibicao(fp.nome)) + "</span></td>" +
        cel(c1 && c1.votos, c1 && c1.pct) + cel(c2 && c2.votos, c2 && c2.pct) + "<td>" + (dif != null ? sinal(dif, 0) : "—") + "</td></tr>";
    });
    if (outros1 != null && !r1.reserva) {
      const votosOutros = r1.candidatos.filter(function (c) { return numeros.indexOf(c.numero) < 0; }).reduce(function (s, c) { return s + c.votos; }, 0);
      linhasTab.push('<tr><td><span class="cel-lider"><i class="chave" style="--c:var(--outros)"></i>Outros candidatos</span></td>' + cel(votosOutros, outros1) + "<td>—</td><td>" + sinal(-votosOutros, 0) + "</td></tr>");
    }
    if (!r1.reserva) {
      [["Brancos", "brancos", "pctBrancos"], ["Nulos", "nulos", "pctNulos"], ["Abstenção", "abstencao", "pctAbstencao"]].forEach(function (c) {
        const v1 = r1[c[1]];
        const v2 = comecou ? r2[c[1]] : null;
        linhasTab.push("<tr><td>" + c[0] + "</td>" + cel(v1, r1[c[2]]) + cel(v2, comecou ? r2[c[2]] : null) + "<td>" + (v1 != null && v2 != null ? sinal(v2 - v1, 0) : "—") + "</td></tr>");
      });
    }
    html += '<details class="detalhes"><summary>Ver todos os números em tabela</summary><div class="tabela-wrap"><table class="tabela"><thead><tr><th scope="col">Votos</th><th scope="col">1º turno</th><th scope="col">2º turno' +
      (parcial ? " (parcial)" : "") + '</th><th scope="col">Diferença em votos</th></tr></thead><tbody>' + linhasTab.join("") + "</tbody></table></div>" +
      (parcial ? '<p class="nota">Com a apuração em andamento, as diferenças em votos ainda vão crescer. Compare os percentuais.</p>' : "") + "</details>";

    alvo.innerHTML = html;
    Graficos.barras100($("comp-barras"), linhas, { meio: true });
  }

  // ---- O que falta ------------------------------------------------------------------------------------------------------------------------------
  function renderProjecao() {
    const alvo = $("projecao-corpo");
    const br = estado.dados.federal2.br;
    const par = Dados.finalistas();
    if (!br || par.length < 2) {
      alvo.innerHTML = '<div class="esq" style="height:200px"></div>';
      return;
    }
    if (!br.pctSecoes) {
      alvo.innerHTML = '<div class="vazio-msg"><b>A apuração ainda não começou</b><span>Quando o TSE divulgar as primeiras urnas, aqui aparece quanto falta contar e uma estimativa do resultado final.</span></div>';
      return;
    }
    const numeros = par.map(function (c) { return c.numero; });
    const P = papeis(numeros);
    const nomes = apelidos(par[0].nome, par[1].nome);
    const a = achar(br, numeros[0]);
    const b = achar(br, numeros[1]);
    if (br.finalizada) {
      const lider = a.votos >= b.votos ? a : b;
      alvo.innerHTML = '<div class="proj-item"><h4>Apuração encerrada</h4><p class="proj-valor">100% das urnas</p><p>Todas as urnas foram apuradas. ' +
        (lider.eleito ? esc(nomeExibicao(lider.nome)) + " foi eleito, segundo o TSE." : "A proclamação oficial do resultado é feita pelo TSE.") + "</p></div>";
      return;
    }
    const porUf = {};
    TSE.UFS.concat(["zz"]).forEach(function (uf) { porUf[uf] = estado.dados.federal2[uf]; });
    const proj = TSE.projetar(porUf, numeros);
    const falta = Math.max(0, 100 - br.pctSecoes);
    const itens = ['<div class="proj-item"><h4>Quanto falta contar ' + UI.ajuda("urnas") + '</h4><p class="proj-valor">' + pct(falta, 1) + " das urnas</p><p>" +
      (proj ? "Isso equivale a cerca de " + milhoes(proj.restantes) + " de votos válidos ainda não somados." : "") +
      '</p><div class="trilho" style="margin-top:12px" aria-hidden="true"><i style="width:' + (100 - falta) + '%"></i></div></div>'];

    if (proj) {
      const pa = proj.candidatos[0];
      const pb = proj.candidatos[1];
      itens.push('<div class="proj-item"><h4>Resultado final estimado ' + UI.ajuda("projecao") + '</h4><div class="proj-versus"><div><small>' + esc(nomes[0]) + "</small>" + pct(pa.pct, 1) +
        "</div><div><small>" + esc(nomes[1]) + "</small>" + pct(pb.pct, 1) + "</div></div>" +
        barraDupla({ pct: pa.pct, cor: fundo(P[numeros[0]]) }, { pct: pb.pct, cor: fundo(P[numeros[1]]) }, "barra-fina") +
        "<p>Estimativa deste painel, não do TSE: se os votos que faltam seguirem o padrão de cada estado, o resultado final ficaria perto disso.</p></div>");

      if (proj.restantes > 0 && a.votos !== b.votos) {
        const lider = a.votos > b.votos ? a : b;
        const atras = lider === a ? b : a;
        const precisa = 50 + ((lider.votos - atras.votos) / proj.restantes) * 50;
        const nomeAtras = nomes[atras === a ? 0 : 1];
        itens.push('<div class="proj-item"><h4>O que seria preciso para virar</h4><p class="proj-valor">' + (precisa > 100 ? "mais de 100%" : pct(precisa, 1)) + "</p><p>" +
          (precisa > 100
            ? "Pelas estimativas deste painel, não sobram votos suficientes para " + esc(nomeAtras) + " virar o jogo."
            : esc(nomeAtras) + " precisaria dessa fatia dos votos que ainda não foram contados. Até agora, tem " + pct(atras.pct, 1) + " dos votos válidos.") + "</p></div>");
      }
    }
    alvo.innerHTML = '<div class="proj-grade">' + itens.join("") + "</div>";
  }

  function renderEvolucao() {
    const alvo = $("evolucao");
    const par = Dados.finalistas();
    const pontosEv = Dados.evolucao().sort(function (x, y) { return x.pst - y.pst; });
    $("evo-nota").textContent = pontosEv.length ? pontosEv.length + (pontosEv.length === 1 ? " leitura" : " leituras") + " neste navegador" : "";
    if (pontosEv.length < 2 || par.length < 2) {
      alvo.innerHTML = '<div class="vazio-msg"><b>O gráfico se forma durante a apuração</b><span>Ele mostra como o percentual de cada candidato muda conforme as urnas chegam. Deixe esta página aberta e ele vai se desenhando a cada atualização do TSE.</span></div>';
      return;
    }
    const numeros = par.map(function (c) { return c.numero; });
    const P = papeis(numeros);
    const ys = [].concat.apply([], pontosEv.map(function (p) { return numeros.map(function (n) { return p.v[n]; }).filter(function (v) { return v != null; }); }));
    const yMin = Math.floor(Math.min.apply(null, ys.concat([50])) - 1);
    const yMax = Math.ceil(Math.max.apply(null, ys.concat([50])) + 1);
    const passo = yMax - yMin > 20 ? 5 : yMax - yMin > 8 ? 2 : 1;
    const ticks = [];
    for (let t = Math.ceil(yMin / passo) * passo; t <= yMax; t += passo) ticks.push(t);
    const porPst = {};
    pontosEv.forEach(function (p) { porPst[p.pst] = p; });
    const nomes = apelidos(par[0].nome, par[1].nome);
    Graficos.linhas(alvo, {
      titulo: "Evolução do percentual de votos válidos de cada finalista conforme as urnas são apuradas",
      series: par.map(function (f, i) {
        return {
          nome: nomes[i],
          rotuloFinal: nomes[i] + " " + fmtN(pontosEv[pontosEv.length - 1].v[f.numero], 1) + "%",
          cor: fundo(P[f.numero]),
          pontos: pontosEv.map(function (p) { return { x: p.pst, y: p.v[f.numero] }; }),
        };
      }),
      x: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], rotulo: "Urnas apuradas", fmt: function (v) { return fmtN(v, 0) + "%"; } },
      y: { min: yMin, max: yMax, ticks: ticks, fmt: function (v, longo) { return longo ? pct(v, 2) : fmtN(v, 0) + "%"; } },
      referencia: { y: 50, rotulo: "50%" },
      margemDireita: 128,
      altura: 250,
      dica: function (x) { return fmtN(x, 1) + "% das urnas · " + porPst[x].hg.slice(0, 5); },
    });
  }

  // ---- Histórico ------------------------------------------------------------------------------------------------------------------------------------------
  function serieHistorica() {
    const anos = HISTORICO.anos.map(function (ano) {
      return { ano: ano, t1: HISTORICO.comoResultado(ano, 1), t2: HISTORICO.comoResultado(ano, 2), parcial: false };
    });
    const br1 = Dados.resultado("federal1", "br");
    const br2 = estado.dados.federal2.br;
    anos.push({
      ano: 2026,
      t1: br1 && !br1.reserva ? br1 : null,
      t2: br2 && br2.pctSecoes > 0 ? br2 : null,
      parcial: !!(br2 && br2.pctSecoes > 0 && !br2.finalizada),
    });
    return anos;
  }

  function renderHistorico() {
    const serie = serieHistorica();

    // 2º turno de cada eleição: o adversário do PT (azul) à esquerda, o PT (vermelho) à direita.
    const margens = [];
    const partidosAdversario = {};
    const linhas = serie.filter(function (s) { return s.t2; }).map(function (s) {
      const dois = s.t2.candidatos.slice(0, 2);
      const papel = papeis(dois.map(function (c) { return c.numero; }));
      dois.sort(function (x, y) { return (papel[x.numero] === "azul" ? 0 : 1) - (papel[y.numero] === "azul" ? 0 : 1); });
      const dif = Math.abs(dois[0].pct - dois[1].pct);
      margens.push({ ano: s.ano, margem: dif, parcial: s.parcial });
      const adversario = dois.find(function (c) { return papel[c.numero] !== "vermelho"; }) || dois[0];
      (partidosAdversario[adversario.partido] = partidosAdversario[adversario.partido] || []).push(s.ano);
      return {
        rotulo: "<b>" + s.ano + "</b>" + (s.parcial ? "parcial · " + pct(s.t2.pctSecoes, 0) + " das urnas" : ""),
        fim: "<b>" + fmtN(dif, 1) + " pts</b>de diferença",
        dica: s.ano + " · 2º turno" + (s.parcial ? " (parcial)" : ""),
        partes: dois.map(function (c) {
          return {
            nome: nomeExibicao(c.nome) + " (" + c.partido + ")", valor: c.pct, cor: fundo(papel[c.numero]), sobre: sobre(papel[c.numero]),
            texto: fmtN(c.pct, 1) + "%", textoLongo: pct(c.pct, 2) + " · " + inteiro(c.votos) + " votos", nomeNoSegmento: nomeCurto(c.nome),
          };
        }),
      };
    });
    Graficos.barras100($("hist-segundo"), linhas, { meio: true });
    const adversarios = Object.keys(partidosAdversario).map(function (p) {
      const anos = partidosAdversario[p];
      return p + " em " + (anos.length > 1 ? anos.slice(0, -1).join(", ") + " e " + anos[anos.length - 1] : anos[0]);
    }).join("; ");
    $("hist-legenda-cores").innerHTML = '<li><i class="amostra" style="background:var(--vermelho)"></i>Candidato do PT</li>' +
      '<li><i class="amostra" style="background:var(--azul)"></i>Adversário do PT (' + esc(adversarios) + ")</li>";
    const leitura1 = Texto.fraseMargemHistorica(margens);
    $("hist-leitura-1").hidden = !leitura1;
    $("hist-leitura-1").textContent = leitura1;

    // Participação ao longo do tempo
    const abst = ui.histIndicador === "abstencao";
    $("hist-sub").textContent = abst
      ? "Percentual de eleitores que não foram votar em cada eleição."
      : "Votos em branco somados aos nulos, em percentual de quem compareceu.";
    document.querySelectorAll("[data-hist]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.hist === ui.histIndicador)); });
    const valorDe = function (r) {
      if (!r) return null;
      if (abst) return r.pctAbstencao;
      return r.pctBrancos != null && r.pctNulos != null ? r.pctBrancos + r.pctNulos : null;
    };
    const mk = function (turno, nome, cor) {
      return {
        nome: nome, cor: cor, rotuloFinal: nome,
        pontos: serie.map(function (s) {
          const r = turno === 1 ? s.t1 : s.t2;
          return { x: s.ano, y: valorDe(r), oco: turno === 2 && s.parcial };
        }),
      };
    };
    const series = [mk(1, "1º turno", "var(--turno-1)"), mk(2, "2º turno", "var(--turno-2)")];
    const todos = [].concat.apply([], series.map(function (s) { return s.pontos.map(function (p) { return p.y; }).filter(function (v) { return v != null; }); }));
    const yMin = Math.max(0, Math.floor((Math.min.apply(null, todos) - 1) / 2) * 2);
    const yMax = Math.ceil((Math.max.apply(null, todos) + 1) / 2) * 2;
    const ticks = [];
    for (let t = yMin; t <= yMax; t += 2) ticks.push(t);
    Graficos.linhas($("hist-linhas"), {
      titulo: abst ? "Abstenção em cada eleição presidencial desde 2010" : "Brancos e nulos em cada eleição presidencial desde 2010",
      series: series,
      x: { min: 2010, max: 2026, ticks: serie.map(function (s) { return s.ano; }), rotulo: "Ano", fmt: function (v) { return String(v); } },
      y: { min: yMin, max: yMax, ticks: ticks, fmt: function (v, longo) { return longo ? pct(v, 2) : fmtN(v, 0) + "%"; } },
      altura: 260,
      margemDireita: 84,
      dica: function (x) { return String(x); },
    });
    $("hist-legenda").innerHTML = '<li><i class="amostra" style="background:var(--turno-1)"></i>1º turno</li><li><i class="amostra" style="background:var(--turno-2)"></i>2º turno</li>' +
      (serie[serie.length - 1].parcial ? '<li class="mudo">ponto vazado = 2026 em apuração</li>' : "");
    const leitura2 = Texto.fraseSerie(abst ? "A abstenção" : "Os brancos e nulos", 2, series[1].pontos.map(function (p) { return { ano: p.x, v: p.y, parcial: p.oco }; }));
    $("hist-leitura-2").hidden = !leitura2;
    $("hist-leitura-2").textContent = leitura2;

    // Tabela completa
    const corpoTab = [];
    serie.forEach(function (s) {
      [1, 2].forEach(function (t) {
        const r = t === 1 ? s.t1 : s.t2;
        if (!r) return;
        const [p1, p2] = r.candidatos;
        const parcial = t === 2 && s.parcial;
        corpoTab.push("<tr><td>" + s.ano + "</td><td>" + t + "º" + (parcial ? " (parcial)" : "") + "</td><td>" + (p1 ? esc(nomeExibicao(p1.nome)) + " (" + esc(p1.partido) + ")" : "—") + "</td><td>" + (p1 ? pct(p1.pct, 2) : "—") +
          "</td><td>" + (p2 ? esc(nomeExibicao(p2.nome)) + " (" + esc(p2.partido) + ")" : "—") + "</td><td>" + (p2 ? pct(p2.pct, 2) : "—") +
          "</td><td>" + (r.eleitorado ? milhoes(r.eleitorado) : "—") + "</td><td>" + pct(r.pctComparecimento, 1) + "</td><td>" + pct(r.pctAbstencao, 1) + "</td><td>" + pct(r.pctBrancos, 1) + "</td><td>" + pct(r.pctNulos, 1) + "</td></tr>");
      });
    });
    $("hist-tabela").innerHTML = '<table class="tabela"><thead><tr><th scope="col">Ano</th><th scope="col">Turno</th><th scope="col">1º colocado</th><th scope="col">%</th><th scope="col">2º colocado</th><th scope="col">%</th><th scope="col">Eleitorado</th><th scope="col">Comparec.</th><th scope="col">Abstenção</th><th scope="col">Brancos</th><th scope="col">Nulos</th></tr></thead><tbody>' + corpoTab.join("") + "</tbody></table>";
  }

  // ---- Governadores -----------------------------------------------------------------------------------------------------------------------------------------------------
  function renderGovernadores() {
    const alvo = $("governadores-corpo");
    const ufs = TSE.UFS.filter(function (uf) { return estado.dados.estadual2[uf]; }).sort(function (x, y) { return TSE.NOMES[x].localeCompare(TSE.NOMES[y], "pt-BR"); });
    if (!ufs.length) {
      alvo.innerHTML = '<div class="vazio-msg"><b>' + (estado.governadoresPresentes ? "Nenhum estado com 2º turno para governador" : "Procurando os estados com 2º turno…") + "</b>" +
        (estado.governadoresPresentes ? "<span>Se algum estado tiver disputa, ela aparece aqui automaticamente.</span>" : "") + "</div>";
      return;
    }
    $("gov-desc").textContent = ufs.length === 1 ? "Um estado tem 2º turno para governador." : ufs.length + " estados têm 2º turno para governador.";
    alvo.innerHTML = '<div class="gov-grade">' + ufs.map(function (uf) {
      const r = estado.dados.estadual2[uf];
      const cands = r.candidatos.slice(0, 2);
      const comecou = r.pctSecoes > 0;
      const lider = comecou && cands.length === 2 && cands[0].votos !== cands[1].votos ? cands[0] : null;
      const itens = cands.map(function (c) {
        return '<div class="gov-cand' + (lider === c ? " lidera" : "") + '"><div class="gov-cand-linha"><span><b style="font-weight:650">' + esc(nomeCurto(c.nome)) + "</b> <small>" + esc(c.partido) + "</small>" +
          (c.eleito ? '<span class="selo-eleito">Eleito</span>' : "") + "</span><b>" + (comecou ? pct(c.pct, 1) : "—") + '</b></div><div class="trilho" aria-hidden="true"><i style="width:' + (comecou ? c.pct : 0) + '%"></i></div></div>';
      }).join("");
      return '<article class="gov"><div class="gov-topo"><b>' + esc(TSE.NOMES[uf]) + "</b><small>" + (comecou ? pct(r.pctSecoes, 0) + " apurado" : "aguardando") + "</small></div>" + itens + "</article>";
    }).join("") + "</div>";
  }

  // ---- Perguntas frequentes ------------------------------------------------------------------------------------------------------------------------------------------------
  function renderFaq() {
    $("faq").innerHTML = Texto.PERGUNTAS.map(function (q) {
      return "<details><summary>" + esc(q.p) + '</summary><div class="resposta">' + q.r.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div></details>";
    }).join("");
  }

  // ---- Controles ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function atualizarUrl() {
    const p = new URLSearchParams(location.search);
    if (ui.uf === "br") p.delete("uf");
    else p.set("uf", ui.uf);
    if (ui.turno === 1) p.set("turno", "1");
    else p.delete("turno");
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  function alternarTema() {
    const raiz = document.documentElement;
    const atual = raiz.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    raiz.dataset.theme = atual === "dark" ? "light" : "dark";
    gravarPreferencia("painel:tema", raiz.dataset.theme);
  }

  function montarControles() {
    // Seletor de estado do painel
    const ufsOrdenadas = TSE.UFS.slice().sort(function (x, y) { return TSE.NOMES[x].localeCompare(TSE.NOMES[y], "pt-BR"); });
    $("uf-select").innerHTML = ['<option value="br">Brasil (todos os estados)</option>']
      .concat(ufsOrdenadas.map(function (uf) { return '<option value="' + uf + '">' + esc(TSE.NOMES[uf]) + " (" + uf.toUpperCase() + ")</option>"; }))
      .concat(['<option value="zz">Exterior</option>']).join("");
    $("uf-select").value = ui.uf;
    $("uf-select").addEventListener("change", function (ev) { escolherUf(ev.target.value, false); });

    $("modo-mapa").addEventListener("change", function (ev) {
      ui.modoMapa = ev.target.value;
      renderMapa();
    });
    document.querySelectorAll("[data-visao]").forEach(function (b) {
      b.addEventListener("click", function () {
        ui.visaoMapa = b.dataset.visao;
        gravarPreferencia("painel:visao-mapa", ui.visaoMapa);
        renderMapa();
      });
    });
    document.querySelectorAll("[data-hist]").forEach(function (b) {
      b.addEventListener("click", function () {
        ui.histIndicador = b.dataset.hist;
        renderHistorico();
      });
    });

    // Atalho "Ver meu estado" no resumo
    $("hero").addEventListener("change", function (ev) {
      const sel = ev.target.closest("[data-uf-rapido]");
      if (!sel || !sel.value) return;
      const uf = sel.value;
      sel.value = "";
      escolherUf(uf, true);
      $("estados").scrollIntoView({ behavior: reduzMovimento ? "auto" : "smooth", block: "start" });
    });

    // Resumo: troca de turno e "tentar de novo" (o conteúdo é redesenhado, então delegamos).
    $("hero").addEventListener("click", function (ev) {
      const t = ev.target.closest("[data-turno]");
      if (t) {
        ui.turno = Number(t.dataset.turno);
        atualizarUrl();
        renderHero();
        renderKpis();
        const novo = $("hero").querySelector('[data-turno="' + ui.turno + '"]');
        if (novo) novo.focus();
        return;
      }
      if (ev.target.closest("[data-acao='atualizar']")) Dados.atualizar();
    });

    // Tabela: ordenar e abrir estado
    const tabela = $("tabela-ufs");
    tabela.addEventListener("click", function (ev) {
      const coluna = ev.target.closest("button[data-col]");
      if (coluna) {
        const id = coluna.dataset.col;
        ui.ordem = { coluna: id, desc: ui.ordem.coluna === id ? !ui.ordem.desc : id !== "nome" };
        renderTabela();
        const foco = tabela.querySelector('button[data-col="' + id + '"]');
        if (foco) foco.focus();
        return;
      }
      const linha = ev.target.closest("tr[data-uf]");
      if (linha) escolherUf(linha.dataset.uf, true);
    });
    tabela.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const linha = ev.target.closest("tr[data-uf]");
      if (linha && ev.target === linha) {
        ev.preventDefault();
        escolherUf(linha.dataset.uf, true);
      }
    });
    $("filtro-uf").addEventListener("input", function (ev) {
      ui.filtro = ev.target.value;
      renderTabela();
    });

    $("atualizar").addEventListener("click", function () { Dados.atualizar(); });
    $("tema").addEventListener("click", alternarTema);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && estado.proximaLeitura && Date.now() >= estado.proximaLeitura) Dados.atualizar();
    });

    // Foto que não carrega vira a inicial do nome (o evento "error" não sobe na árvore: captura).
    document.addEventListener("error", function (ev) {
      const img = ev.target;
      if (img && img.tagName === "IMG" && img.classList.contains("foto") && img.dataset.vazio) img.outerHTML = img.dataset.vazio;
    }, true);

    let espera = null;
    let larguraAnterior = window.innerWidth;
    window.addEventListener("resize", function () {
      clearTimeout(espera);
      espera = setTimeout(function () {
        if (window.innerWidth === larguraAnterior) return; // barra do navegador no celular: só a altura muda
        larguraAnterior = window.innerWidth;
        renderMapa();
        renderRegioes();
        renderComparar();
        renderEvolucao();
        renderHistorico();
      }, 160);
    });
    setInterval(atualizarRelogio, 1000);
  }

  // ---- Desenho geral ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  /** Resumo dos dados carregados: muda quando chega algo novo do TSE. */
  function versaoDados() {
    let v = "";
    ["federal1", "federal2", "anterior1", "anterior2", "estadual2"].forEach(function (chave) {
      const d = estado.dados[chave];
      for (const uf in d) v += uf + (d[uf].hg || "") + (d[uf].pctSecoes || 0) + ";";
    });
    return v + "|" + estado.falhas + estado.falhaTotal + estado.usandoCache + Dados.situacao() + (estado.governadoresPresentes ? "g" : "");
  }
  let versaoDesenhada = null;

  function renderizar() {
    // Situação e aviso são baratos e mudam a cada consulta; o resto só se os dados mudaram,
    // para não tirar o foco de quem navega pelo teclado nem fechar balões a cada minuto.
    renderStatus();
    renderAviso();
    const versao = versaoDados();
    if (versao === versaoDesenhada) return;
    versaoDesenhada = versao;
    const partes = [renderHero, renderKpis, renderMapa, renderPainelUf, renderRegioes, renderTabela, renderComparar, renderProjecao, renderEvolucao, renderHistorico, renderGovernadores];
    for (const parte of partes) {
      try {
        parte();
      } catch (e) {
        console.error("Falha ao desenhar", parte.name, e);
      }
    }
    UI.verificarAjuda();
    if (ui.irParaUf && estado.dados.federal2.br) {
      ui.irParaUf = false;
      setTimeout(function () { $("estados").scrollIntoView({ behavior: "auto", block: "start" }); }, 50);
    }
  }

  function iniciar() {
    const anuncio = document.createElement("div");
    anuncio.id = "anuncio";
    anuncio.className = "so-leitor";
    anuncio.setAttribute("role", "status");
    anuncio.setAttribute("aria-live", "polite");
    document.body.appendChild(anuncio);

    UI.iniciarAjuda();
    UI.espiarSecoes($("menu"));
    montarControles();
    renderFaq();
    Dados.iniciar(renderizar);
  }

  iniciar();
})();
