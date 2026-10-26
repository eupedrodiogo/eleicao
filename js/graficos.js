/**
 * Gráficos em SVG e HTML puros, sem dependências.
 *
 * - linhas:     evolução no tempo, com rótulo direto no fim de cada linha
 * - barras100:  barras de 100% (como os votos se dividem), com traço em 50%
 *
 * Os dois têm leitura por tooltip (mouse), rótulos diretos e uma descrição
 * para leitores de tela.
 */
(function (root) {
  const NS = "http://www.w3.org/2000/svg";
  const UI = root.UI;
  const Texto = root.Texto;

  function el(nome, attrs, pai) {
    const n = document.createElementNS(NS, nome);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }

  function texto(pai, x, y, conteudo, attrs) {
    const t = el("text", Object.assign({ x: x, y: y }, attrs || {}), pai);
    t.textContent = conteudo;
    return t;
  }

  function escala(d0, d1, r0, r1) {
    return function (v) {
      if (d1 === d0) return (r0 + r1) / 2;
      return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    };
  }

  /**
   * Gráfico de linhas com um único eixo Y.
   * opts: {
   *   titulo, series: [{nome, cor, rotuloFinal, pontos: [{x, y, oco}]}],
   *   x: {min, max, ticks, fmt}, y: {min, max, ticks, fmt},
   *   referencia: {y, rotulo}, altura, margemDireita, dica(x) -> título do tooltip
   * }
   */
  function linhas(container, opts) {
    container.innerHTML = "";
    const largura = Math.max(260, container.clientWidth || 600);
    const altura = opts.altura || 260;
    const m = { t: 14, r: opts.margemDireita == null ? 96 : opts.margemDireita, b: 32, l: 44 };
    const svg = el("svg", {
      viewBox: "0 0 " + largura + " " + altura, width: largura, height: altura, class: "grafico", role: "img",
      "aria-label": opts.titulo || "Gráfico de linhas",
    }, container);
    svg.style.width = "100%";
    svg.style.height = "auto";

    const sx = escala(opts.x.min, opts.x.max, m.l, largura - m.r);
    const sy = escala(opts.y.min, opts.y.max, altura - m.b, m.t);

    const grade = el("g", { class: "grade" }, svg);
    for (const t of opts.y.ticks) {
      el("line", { x1: m.l, x2: largura - m.r, y1: sy(t), y2: sy(t) }, grade);
      texto(grade, m.l - 8, sy(t) + 4, opts.y.fmt(t), { class: "eixo", "text-anchor": "end" });
    }
    for (const t of opts.x.ticks) {
      texto(grade, sx(t), altura - m.b + 20, opts.x.fmt(t), { class: "eixo", "text-anchor": "middle" });
    }
    el("line", { x1: m.l, x2: largura - m.r, y1: altura - m.b, y2: altura - m.b, class: "base" }, svg);

    if (opts.referencia) {
      const ry = sy(opts.referencia.y);
      el("line", { x1: m.l, x2: largura - m.r, y1: ry, y2: ry, class: "referencia" }, svg);
      if (opts.referencia.rotulo) texto(svg, largura - m.r + 6, ry + 4, opts.referencia.rotulo, { class: "eixo" });
    }

    const camada = el("g", {}, svg);
    const rotulos = [];
    for (const s of opts.series) {
      const pts = s.pontos.filter(function (p) { return p.y != null; });
      if (!pts.length) continue;
      const d = pts.map(function (p, i) { return (i ? "L" : "M") + sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1); }).join("");
      el("path", { d: d, class: "linha", style: "stroke:" + s.cor }, camada);
      pts.forEach(function (p, i) {
        const ultimo = i === pts.length - 1;
        if (pts.length > 8 && !ultimo) return;
        el("circle", {
          cx: sx(p.x), cy: sy(p.y), r: ultimo ? 5 : 4, class: "ponto" + (p.oco ? " oco" : ""),
          style: (p.oco ? "stroke:" : "fill:") + s.cor,
        }, camada);
      });
      const fim = pts[pts.length - 1];
      rotulos.push({ y: sy(fim.y), x: sx(fim.x), texto: s.rotuloFinal || s.nome });
    }
    // Rótulos diretos no fim de cada linha, afastados para não se sobrepor.
    rotulos.sort(function (a, b) { return a.y - b.y; });
    for (let i = 1; i < rotulos.length; i++) {
      if (rotulos[i].y - rotulos[i - 1].y < 16) rotulos[i].y = rotulos[i - 1].y + 16;
    }
    for (const r of rotulos) texto(svg, r.x + 10, r.y + 4, r.texto, { class: "rotulo-direto" });

    // Interação: linha-guia e tooltip no ponto mais próximo.
    const xs = Array.from(new Set([].concat.apply([], opts.series.map(function (s) {
      return s.pontos.filter(function (p) { return p.y != null; }).map(function (p) { return p.x; });
    })))).sort(function (a, b) { return a - b; });
    const guia = el("line", { y1: m.t, y2: altura - m.b, class: "guia", visibility: "hidden" }, svg);
    const alvo = el("rect", { x: m.l, y: m.t, width: Math.max(0, largura - m.l - m.r), height: altura - m.t - m.b, class: "alvo" }, svg);
    function mover(ev) {
      if (!xs.length) return;
      const caixa = svg.getBoundingClientRect();
      const px = ((ev.clientX - caixa.left) / caixa.width) * largura;
      let melhor = xs[0];
      for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(melhor) - px)) melhor = x;
      guia.setAttribute("x1", sx(melhor));
      guia.setAttribute("x2", sx(melhor));
      guia.setAttribute("visibility", "visible");
      const itens = opts.series.map(function (s) {
        const p = s.pontos.find(function (q) { return q.x === melhor && q.y != null; });
        if (!p) return "";
        return '<div class="tip-linha"><span class="chave" style="--c:' + s.cor + '"></span>' + Texto.esc(s.nome) + "<b>" + opts.y.fmt(p.y, true) + "</b></div>";
      }).join("");
      const titulo = opts.dica ? opts.dica(melhor) : opts.x.fmt(melhor);
      UI.mostrarTooltip('<div class="tip-titulo">' + titulo + "</div>" + itens, ev.clientX, ev.clientY, ev);
    }
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerleave", function () {
      guia.setAttribute("visibility", "hidden");
      UI.esconderTooltip();
    });

    // Tabela só para leitores de tela
    const linhasTab = xs.map(function (x) {
      return "<tr><th scope='row'>" + (opts.dica ? opts.dica(x) : opts.x.fmt(x)) + "</th>" + opts.series.map(function (s) {
        const p = s.pontos.find(function (q) { return q.x === x && q.y != null; });
        return "<td>" + (p ? opts.y.fmt(p.y, true) : "—") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    const tabela = document.createElement("table");
    tabela.innerHTML = "<caption>" + Texto.esc(opts.titulo || "Dados do gráfico") + "</caption><thead><tr><th scope='col'>" + Texto.esc(opts.x.rotulo || "Ponto") + "</th>" +
      opts.series.map(function (s) { return "<th scope='col'>" + Texto.esc(s.nome) + "</th>"; }).join("") + "</tr></thead><tbody>" + linhasTab + "</tbody>";
    const sr = document.createElement("div");
    sr.className = "so-leitor";
    sr.appendChild(tabela);
    container.appendChild(sr);
    return svg;
  }

  /**
   * Barras de 100% empilhadas, uma linha por categoria.
   * linhas: [{rotulo (html), fim (html), dica (título do tooltip), aria,
   *           partes: [{nome, valor, cor, sobre, texto, textoLongo}]}]
   * opts.meio: desenha o traço de 50%.
   */
  function barras100(container, linhasDados, opts) {
    opts = opts || {};
    container.innerHTML = "";
    const lista = document.createElement("div");
    lista.className = "barras100";
    for (const linha of linhasDados) {
      const item = document.createElement("div");
      item.className = "barra-linha" + (linha.fim ? "" : " sem-fim");
      const rotulo = document.createElement("div");
      rotulo.className = "barra-rotulo";
      rotulo.innerHTML = linha.rotulo;
      const trilho = document.createElement("div");
      trilho.className = "barra-trilho";
      trilho.setAttribute("role", "img");
      trilho.setAttribute("aria-label", linha.aria || linha.partes.map(function (p) { return p.nome + " " + (p.textoLongo || p.texto || ""); }).join(", "));
      const total = linha.partes.reduce(function (s, p) { return s + (p.valor || 0); }, 0) || 1;
      for (const p of linha.partes) {
        if (!p.valor) continue;
        const seg = document.createElement("div");
        seg.className = "barra-seg";
        seg.style.width = ((p.valor / total) * 100).toFixed(3) + "%";
        seg.style.setProperty("--c", p.cor);
        seg.style.setProperty("--on", p.sobre || "#fff");
        if (p.texto && p.valor / total > 0.1) {
          seg.innerHTML = (p.nomeNoSegmento ? '<span class="seg-nome">' + Texto.esc(p.nomeNoSegmento) + "</span>" : "") + "<span>" + Texto.esc(p.texto) + "</span>";
        }
        seg.addEventListener("pointermove", function (ev) {
          UI.mostrarTooltip('<div class="tip-titulo">' + (linha.dica || "") + '</div><div class="tip-linha"><span class="chave" style="--c:' + p.cor + '"></span>' +
            Texto.esc(p.nome) + "<b>" + (p.textoLongo || p.texto || "") + "</b></div>", ev.clientX, ev.clientY, ev);
        });
        seg.addEventListener("pointerleave", UI.esconderTooltip);
        trilho.appendChild(seg);
      }
      const segs = trilho.querySelectorAll(".barra-seg");
      if (segs.length) {
        segs[0].classList.add("inicio");
        segs[segs.length - 1].classList.add("fim");
      }
      if (opts.meio) {
        const meio = document.createElement("div");
        meio.className = "barra-meio";
        trilho.appendChild(meio);
      }
      item.appendChild(rotulo);
      item.appendChild(trilho);
      if (linha.fim) {
        const fim = document.createElement("div");
        fim.className = "barra-fim";
        fim.innerHTML = linha.fim;
        item.appendChild(fim);
      }
      lista.appendChild(item);
    }
    container.appendChild(lista);
  }

  root.Graficos = { linhas: linhas, barras100: barras100 };
})(window);
