/**
 * Mapa dos estados: contorno real do Brasil (SVG) ou "quadrados" (um bloco por
 * estado, todos do mesmo tamanho, mais fáceis de tocar).
 *
 * O mapa não decide cores nem textos: recebe de quem o chama, para cada UF,
 * {fundo, texto, valor} e devolve o clique. Assim o mesmo desenho serve para
 * todas as visões (quem lidera, mudança, abstenção…).
 */
(function (root) {
  const MAPA = root.MAPA_BR;
  const TSE = root.TSE;
  const UI = root.UI;
  const Texto = root.Texto;
  const NS = "http://www.w3.org/2000/svg";

  // Posição de cada estado na grade de quadrados (linha, coluna).
  const GRADE = {
    rr: [0, 2], ap: [0, 3],
    am: [1, 1], pa: [1, 2], ma: [1, 3], ce: [1, 4], rn: [1, 5],
    ac: [2, 0], ro: [2, 1], to: [2, 2], pi: [2, 3], pe: [2, 4], pb: [2, 5],
    mt: [3, 1], go: [3, 2], ba: [3, 3], se: [3, 4], al: [3, 5],
    ms: [4, 1], df: [4, 2], mg: [4, 3], es: [4, 4],
    pr: [5, 1], sp: [5, 2], rj: [5, 3],
    sc: [6, 1], rs: [7, 1], zz: [7, 5],
  };

  // Rótulo dentro do estado só se sobrar espaço: área mínima, em pixels², para a sigla caber.
  const AREA_MINIMA_ROTULO = 1100;
  const TAMANHO_ROTULO = 13; // px na tela, qualquer que seja a escala do mapa

  function sigla(uf) {
    return uf === "zz" ? "Ext." : uf.toUpperCase();
  }

  function el(nome, attrs, pai) {
    const n = document.createElementNS(NS, nome);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }

  function aplicarCores(no, info) {
    if (info && info.fundo) {
      no.style.setProperty("--fundo", info.fundo);
      no.style.setProperty("--texto", info.texto || "var(--ink)");
    } else no.classList.add("sem-dado");
  }

  /**
   * opts: {
   *   visao: "geo" | "grade",
   *   estilo(uf) -> {fundo, texto, valor} | null,
   *   selecionado: "sp" | "br",
   *   aoEscolher(uf), dica(uf) -> html
   * }
   */
  function desenhar(container, opts) {
    container.innerHTML = "";
    if (opts.visao === "grade") grade(container, opts);
    else geo(container, opts);
  }

  function ligarTooltip(no, uf, opts) {
    if (!opts.dica) return;
    no.addEventListener("pointermove", function (ev) {
      UI.mostrarTooltip(opts.dica(uf), ev.clientX, ev.clientY, ev);
    });
    no.addEventListener("pointerleave", UI.esconderTooltip);
  }

  function aria(uf, info, opts) {
    const nome = TSE.NOMES[uf];
    const extra = info && info.aria ? ": " + info.aria : info && info.valor ? ": " + info.valor : ": sem dados ainda";
    return nome + extra;
  }

  // ---- Mapa geográfico ----------------------------------------------------------
  function geo(container, opts) {
    const caixa = document.createElement("div");
    caixa.className = "mapa-geo";
    container.appendChild(caixa);
    const escala = (caixa.clientWidth || 520) / MAPA.largura;

    const svg = el("svg", {
      class: "mapa-svg", viewBox: "0 0 " + MAPA.largura + " " + MAPA.altura, role: "group",
      "aria-label": "Mapa do Brasil dividido por estado. Use Tab para percorrer os estados.",
    }, caixa);

    const defs = el("defs", {}, svg);
    const padrao = el("pattern", { id: "padrao-sem-dado", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 8, height: 8, style: "fill: var(--surface-2)" }, padrao);
    el("rect", { width: 4, height: 8, style: "fill: var(--surface-3)" }, padrao);

    const ufs = Object.keys(MAPA.ufs);
    const semRotulo = [];
    for (const uf of ufs) {
      const info = opts.estilo(uf);
      const g = el("g", {
        class: "uf", "data-uf": uf, tabindex: 0, role: "button",
        "aria-label": aria(uf, info, opts), "aria-pressed": String(opts.selecionado === uf),
      }, svg);
      el("path", { d: MAPA.ufs[uf].d, "fill-rule": "evenodd", style: "fill:" + (info && info.fundo ? info.fundo : "url(#padrao-sem-dado)") }, g);
      ligarTooltip(g, uf, opts);
    }

    // Rótulos (sigla) por cima de todos os estados, em tamanho fixo na tela.
    const rotulos = el("g", { "aria-hidden": "true" }, svg);
    for (const uf of ufs) {
      const u = MAPA.ufs[uf];
      if (u.area * escala * escala < AREA_MINIMA_ROTULO) {
        semRotulo.push(uf);
        continue;
      }
      const info = opts.estilo(uf);
      const t = el("text", {
        class: "uf-rotulo", x: u.x, y: u.y, "font-size": (TAMANHO_ROTULO / escala).toFixed(2),
        style: "fill:" + (info && info.texto ? info.texto : "var(--ink-3)"),
      }, rotulos);
      t.textContent = sigla(uf);
    }

    if (opts.selecionado && MAPA.ufs[opts.selecionado]) {
      el("path", { class: "uf-sel", d: MAPA.ufs[opts.selecionado].d, "fill-rule": "evenodd" }, svg);
    }

    svg.addEventListener("click", function (ev) {
      const g = ev.target.closest(".uf");
      if (g) opts.aoEscolher(g.dataset.uf);
    });
    svg.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const g = ev.target.closest(".uf");
      if (g) {
        ev.preventDefault();
        opts.aoEscolher(g.dataset.uf);
      }
    });

    // Botões para quem ficou sem rótulo: estados pequenos e o Exterior.
    const lista = document.createElement("div");
    lista.className = "chips-uf";
    lista.setAttribute("role", "group");
    lista.setAttribute("aria-label", "Estados pequenos e Exterior");
    semRotulo.sort(function (a, b) { return TSE.NOMES[a].localeCompare(TSE.NOMES[b], "pt-BR"); });
    semRotulo.concat(["zz"]).forEach(function (uf) {
      const info = opts.estilo(uf);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip-uf";
      b.dataset.uf = uf;
      b.setAttribute("aria-pressed", String(opts.selecionado === uf));
      aplicarCores(b, info);
      if (!info || !info.fundo) b.classList.add("sem-dado");
      // O nome acessível começa pelo texto visível e acrescenta a descrição completa.
      b.innerHTML = Texto.esc(uf === "zz" ? "Exterior" : sigla(uf)) + (info && info.valor ? " <small>" + Texto.esc(info.valor) + "</small>" : "") +
        '<span class="so-leitor">, ' + Texto.esc(aria(uf, info, opts)) + "</span>";
      b.addEventListener("click", function () { opts.aoEscolher(uf); });
      ligarTooltip(b, uf, opts);
      lista.appendChild(b);
    });
    container.appendChild(lista);
  }

  // ---- Quadrados -------------------------------------------------------------------------
  function grade(container, opts) {
    const caixa = document.createElement("div");
    caixa.className = "mapa-grade";
    caixa.setAttribute("role", "group");
    caixa.setAttribute("aria-label", "Estados do Brasil em quadrados");
    const celulas = [];
    for (let i = 0; i < 8 * 7; i++) celulas.push(null);
    for (const uf in GRADE) celulas[GRADE[uf][0] * 7 + GRADE[uf][1]] = uf;
    celulas.forEach(function (uf) {
      if (!uf) {
        const vazio = document.createElement("div");
        vazio.className = "tile vazio";
        caixa.appendChild(vazio);
        return;
      }
      const info = opts.estilo(uf);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.dataset.uf = uf;
      b.setAttribute("aria-pressed", String(opts.selecionado === uf));
      aplicarCores(b, info);
      b.innerHTML = "<b>" + Texto.esc(sigla(uf)) + "</b><span>" + Texto.esc(info && info.valor ? info.valor : "—") + "</span>" +
        '<span class="so-leitor">, ' + Texto.esc(aria(uf, info, opts)) + "</span>";
      b.addEventListener("click", function () { opts.aoEscolher(uf); });
      ligarTooltip(b, uf, opts);
      caixa.appendChild(b);
    });
    container.appendChild(caixa);
  }

  root.Mapa = { desenhar: desenhar, sigla: sigla };
})(window);
