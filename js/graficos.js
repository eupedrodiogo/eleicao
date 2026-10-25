/**
 * Gráficos em SVG puro, sem dependências. Cada função recebe um elemento
 * contêiner e desenha nele; a largura acompanha o contêiner.
 */
(function (root) {
  const NS = "http://www.w3.org/2000/svg";

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

  // ---- Tooltip compartilhado ------------------------------------------------
  let tip = null;
  function tooltip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tooltip";
      tip.setAttribute("role", "status");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function mostrarTooltip(html, clientX, clientY) {
    const t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    const margem = 12;
    const r = t.getBoundingClientRect();
    let x = clientX + margem;
    let y = clientY + margem;
    if (x + r.width > window.innerWidth - 8) x = clientX - r.width - margem;
    if (y + r.height > window.innerHeight - 8) y = clientY - r.height - margem;
    t.style.left = Math.max(8, x) + "px";
    t.style.top = Math.max(8, y) + "px";
  }

  function esconderTooltip() {
    if (tip) tip.hidden = true;
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
   *   series: [{nome, cor, pontos: [{x, y}]}],
   *   x: {min, max, ticks, fmt}, y: {min, max, ticks, fmt},
   *   referencia: {y, rotulo}, altura, rotuloX, dica(x) -> título do tooltip
   * }
   */
  function linhas(container, opts) {
    container.innerHTML = "";
    const largura = Math.max(280, container.clientWidth || 600);
    const altura = opts.altura || 260;
    const m = { t: 16, r: opts.margemDireita || 96, b: 34, l: 48 };
    const svg = el("svg", {
      viewBox: "0 0 " + largura + " " + altura,
      width: "100%",
      height: altura,
      class: "grafico",
      role: "img",
      "aria-label": opts.titulo || "Gráfico de linhas",
    }, container);

    const sx = escala(opts.x.min, opts.x.max, m.l, largura - m.r);
    const sy = escala(opts.y.min, opts.y.max, altura - m.b, m.t);

    const grade = el("g", { class: "grade" }, svg);
    for (const t of opts.y.ticks) {
      el("line", { x1: m.l, x2: largura - m.r, y1: sy(t), y2: sy(t) }, grade);
      texto(grade, m.l - 8, sy(t) + 4, opts.y.fmt(t), { class: "eixo", "text-anchor": "end" });
    }
    for (const t of opts.x.ticks) {
      texto(grade, sx(t), altura - m.b + 18, opts.x.fmt(t), { class: "eixo", "text-anchor": "middle" });
    }
    el("line", { x1: m.l, x2: largura - m.r, y1: altura - m.b, y2: altura - m.b, class: "base" }, svg);

    if (opts.referencia) {
      const ry = sy(opts.referencia.y);
      el("line", { x1: m.l, x2: largura - m.r, y1: ry, y2: ry, class: "referencia" }, svg);
      if (opts.referencia.rotulo) {
        texto(svg, largura - m.r + 6, ry + 4, opts.referencia.rotulo, { class: "eixo" });
      }
    }

    const camada = el("g", {}, svg);
    const rotulos = [];
    for (const s of opts.series) {
      const pts = s.pontos.filter(function (p) { return p.y != null; });
      if (!pts.length) continue;
      const d = pts.map(function (p, i) { return (i ? "L" : "M") + sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1); }).join("");
      el("path", { d: d, class: "linha", style: "stroke:" + s.cor }, camada);
      for (const p of pts) {
        el("circle", {
          cx: sx(p.x), cy: sy(p.y), r: pts.length > 30 ? 0 : 4,
          class: "ponto" + (p.oco ? " oco" : ""),
          style: (p.oco ? "stroke:" : "fill:") + s.cor,
        }, camada);
      }
      const ultimo = pts[pts.length - 1];
      rotulos.push({ y: sy(ultimo.y), x: sx(ultimo.x), texto: s.rotuloFinal || s.nome, cor: s.cor });
    }
    // Rótulos diretos no fim de cada linha, afastados para não colidir.
    rotulos.sort(function (a, b) { return a.y - b.y; });
    for (let i = 1; i < rotulos.length; i++) {
      if (rotulos[i].y - rotulos[i - 1].y < 14) rotulos[i].y = rotulos[i - 1].y + 14;
    }
    for (const r of rotulos) {
      texto(svg, r.x + 8, r.y + 4, r.texto, { class: "rotulo-direto" });
    }

    // Camada de interação: linha-guia e tooltip no x mais próximo.
    const xs = Array.from(new Set([].concat.apply([], opts.series.map(function (s) {
      return s.pontos.filter(function (p) { return p.y != null; }).map(function (p) { return p.x; });
    })))).sort(function (a, b) { return a - b; });
    const guia = el("line", { y1: m.t, y2: altura - m.b, class: "guia", visibility: "hidden" }, svg);
    const alvo = el("rect", {
      x: m.l, y: m.t, width: largura - m.l - m.r, height: altura - m.t - m.b, class: "alvo",
    }, svg);
    function mover(ev) {
      if (!xs.length) return;
      const caixa = svg.getBoundingClientRect();
      const px = ((ev.clientX - caixa.left) / caixa.width) * largura;
      let melhor = xs[0];
      for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(melhor) - px)) melhor = x;
      guia.setAttribute("x1", sx(melhor));
      guia.setAttribute("x2", sx(melhor));
      guia.setAttribute("visibility", "visible");
      const linhasTip = opts.series.map(function (s) {
        const p = s.pontos.find(function (q) { return q.x === melhor && q.y != null; });
        if (!p) return "";
        return '<div class="tip-linha"><span class="chave" style="background:' + s.cor + '"></span>' +
          s.nome + '<b>' + opts.y.fmt(p.y, true) + "</b></div>";
      }).join("");
      const titulo = opts.dica ? opts.dica(melhor) : opts.x.fmt(melhor);
      mostrarTooltip('<div class="tip-titulo">' + titulo + "</div>" + linhasTip, ev.clientX, ev.clientY);
    }
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerleave", function () {
      guia.setAttribute("visibility", "hidden");
      esconderTooltip();
    });
    return svg;
  }

  /**
   * Barras horizontais 100% empilhadas (uma linha por categoria).
   * linhas: [{rotulo, partes: [{nome, valor, cor, texto}], dica}]
   */
  function barras100(container, linhasDados, opts) {
    opts = opts || {};
    container.innerHTML = "";
    const lista = document.createElement("div");
    lista.className = "barras100";
    for (const linha of linhasDados) {
      const item = document.createElement("div");
      item.className = "barra-linha";
      const rotulo = document.createElement("div");
      rotulo.className = "barra-rotulo";
      rotulo.innerHTML = linha.rotulo;
      const trilho = document.createElement("div");
      trilho.className = "barra-trilho";
      const total = linha.partes.reduce(function (s, p) { return s + (p.valor || 0); }, 0) || 1;
      for (const p of linha.partes) {
        if (!p.valor) continue;
        const seg = document.createElement("div");
        seg.className = "barra-seg";
        seg.style.width = ((p.valor / total) * 100).toFixed(3) + "%";
        seg.style.background = p.cor;
        if (p.claro) seg.classList.add("claro");
        if (p.texto && p.valor / total > 0.12) seg.textContent = p.texto;
        seg.addEventListener("pointermove", function (ev) {
          mostrarTooltip('<div class="tip-titulo">' + (linha.dica || linha.rotulo) + '</div><div class="tip-linha">' +
            '<span class="chave" style="background:' + p.cor + '"></span>' + p.nome + "<b>" + (p.textoLongo || p.texto || "") + "</b></div>",
          ev.clientX, ev.clientY);
        });
        seg.addEventListener("pointerleave", esconderTooltip);
        trilho.appendChild(seg);
      }
      if (opts.meio) {
        const meio = document.createElement("div");
        meio.className = "barra-meio";
        trilho.appendChild(meio);
      }
      item.appendChild(rotulo);
      item.appendChild(trilho);
      lista.appendChild(item);
    }
    container.appendChild(lista);
  }

  /**
   * Gráfico de pontos (dot plot) com eixo X em %: uma linha por candidato,
   * marcadores de formas diferentes para cada eleição.
   * linhas: [{rotulo, cor, marcas: [{forma, valor, nome}]}]
   */
  function pontos(container, linhasDados, opts) {
    container.innerHTML = "";
    const largura = Math.max(280, container.clientWidth || 600);
    const alturaLinha = 46;
    const m = { t: 10, r: 24, b: 30, l: opts.margemEsquerda || 150 };
    const altura = m.t + m.b + alturaLinha * linhasDados.length;
    const svg = el("svg", {
      viewBox: "0 0 " + largura + " " + altura, width: "100%", height: altura,
      class: "grafico", role: "img", "aria-label": opts.titulo || "Comparação",
    }, container);
    const sx = escala(opts.min, opts.max, m.l, largura - m.r);
    const grade = el("g", { class: "grade" }, svg);
    for (const t of opts.ticks) {
      el("line", { x1: sx(t), x2: sx(t), y1: m.t, y2: altura - m.b }, grade);
      texto(grade, sx(t), altura - m.b + 18, opts.fmt(t), { class: "eixo", "text-anchor": "middle" });
    }
    if (opts.referencia != null) {
      el("line", { x1: sx(opts.referencia), x2: sx(opts.referencia), y1: m.t, y2: altura - m.b, class: "referencia" }, svg);
    }
    linhasDados.forEach(function (linha, i) {
      const y = m.t + alturaLinha * i + alturaLinha / 2;
      texto(svg, m.l - 12, y + 4, linha.rotulo, { class: "rotulo-linha", "text-anchor": "end" });
      const valores = linha.marcas.filter(function (k) { return k.valor != null; });
      if (valores.length > 1) {
        const xsV = valores.map(function (k) { return sx(k.valor); });
        el("line", { x1: Math.min.apply(null, xsV), x2: Math.max.apply(null, xsV), y1: y, y2: y, class: "haste", style: "stroke:" + linha.cor }, svg);
      }
      for (const k of valores) {
        const x = sx(k.valor);
        if (k.forma === "losango") {
          el("path", { d: "M" + x + "," + (y - 7) + "l7,7l-7,7l-7,-7z", class: "marca", style: "fill:" + linha.cor }, svg);
        } else if (k.forma === "oco") {
          el("circle", { cx: x, cy: y, r: 6, class: "marca oco", style: "stroke:" + linha.cor }, svg);
        } else {
          el("circle", { cx: x, cy: y, r: 7, class: "marca", style: "fill:" + linha.cor }, svg);
        }
        const alvo = el("circle", { cx: x, cy: y, r: 14, class: "alvo" }, svg);
        alvo.addEventListener("pointermove", function (ev) {
          mostrarTooltip('<div class="tip-titulo">' + linha.rotulo + '</div><div class="tip-linha">' + k.nome + "<b>" + opts.fmt(k.valor, true) + "</b></div>", ev.clientX, ev.clientY);
        });
        alvo.addEventListener("pointerleave", esconderTooltip);
      }
    });
    return svg;
  }

  root.Graficos = {
    linhas: linhas,
    barras100: barras100,
    pontos: pontos,
    mostrarTooltip: mostrarTooltip,
    esconderTooltip: esconderTooltip,
  };
})(window);
