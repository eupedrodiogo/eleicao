/**
 * Peças de interface compartilhadas: tooltip ao passar o mouse, balão de ajuda
 * (o "?" ao lado de termos técnicos), ícones e destaque do menu na rolagem.
 */
(function (root) {
  const Texto = root.Texto;

  // ---- Tooltip -------------------------------------------------------------
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

  function posicionar(el, x, y, folga) {
    const r = el.getBoundingClientRect();
    let left = x + folga;
    let top = y + folga;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - folga;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - folga;
    el.style.left = Math.max(8, left) + "px";
    el.style.top = Math.max(8, top) + "px";
  }

  /** Só com mouse: no toque, o toque já seleciona e o balão atrapalharia. */
  function mostrarTooltip(html, x, y, evento) {
    if (evento && evento.pointerType && evento.pointerType !== "mouse") return;
    const t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    posicionar(t, x, y, 14);
  }

  function esconderTooltip() {
    if (tip) tip.hidden = true;
  }

  // ---- Balão de ajuda ------------------------------------------------------
  let balao = null;
  let balaoAlvo = null;
  let reposicionando = false;
  let botaoJaVisivel = false;

  /** HTML do botão "?" ligado a um termo do glossário. */
  function ajuda(chave) {
    const item = Texto.GLOSSARIO[chave];
    if (!item) return "";
    return '<button type="button" class="ajuda" data-ajuda="' + chave + '" aria-expanded="false" aria-label="O que significa: ' + Texto.esc(item.termo) + '?">?</button>';
  }

  function fecharAjuda() {
    if (balao) balao.hidden = true;
    if (balaoAlvo) balaoAlvo.setAttribute("aria-expanded", "false");
    balaoAlvo = null;
  }

  /** Mantém o balão logo abaixo do botão (ou acima, se faltar espaço); fecha se o botão sair da tela. */
  function posicionarBalao() {
    reposicionando = false;
    if (!balao || !balaoAlvo) return;
    if (!document.contains(balaoAlvo)) {
      fecharAjuda();
      return;
    }
    const r = balaoAlvo.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      // Botão fora da tela: se já tinha aparecido, a pessoa rolou para longe e o balão fecha;
      // se ainda não (a página está rolando até ele), espera escondido.
      if (botaoJaVisivel) fecharAjuda();
      else balao.style.visibility = "hidden";
      return;
    }
    botaoJaVisivel = true;
    balao.style.visibility = "visible";
    const b = balao.getBoundingClientRect();
    const left = Math.min(Math.max(12, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 12);
    let top = r.bottom + 10;
    if (top + b.height > window.innerHeight - 8) top = Math.max(8, r.top - b.height - 10);
    balao.style.left = left + "px";
    balao.style.top = top + "px";
  }

  function agendarPosicao() {
    if (!balaoAlvo || reposicionando) return;
    reposicionando = true;
    requestAnimationFrame(posicionarBalao);
  }

  function abrirAjuda(botao) {
    const item = Texto.GLOSSARIO[botao.dataset.ajuda];
    if (!item) return;
    if (!balao) {
      balao = document.createElement("div");
      balao.className = "popover";
      balao.setAttribute("role", "status");
      document.body.appendChild(balao);
    }
    fecharAjuda();
    balao.innerHTML = "<b>" + Texto.esc(item.termo) + "</b>" + Texto.esc(item.texto);
    balao.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    balaoAlvo = botao;
    botaoJaVisivel = false;
    posicionarBalao();
  }

  /** Fecha o balão se o botão que o abriu saiu da página (a tela foi redesenhada). */
  function verificarAjuda() {
    if (balaoAlvo && !document.contains(balaoAlvo)) fecharAjuda();
  }

  function iniciarAjuda() {
    document.addEventListener("click", function (ev) {
      const botao = ev.target.closest("[data-ajuda]");
      if (botao) {
        ev.preventDefault();
        if (balaoAlvo === botao) fecharAjuda();
        else abrirAjuda(botao);
        return;
      }
      if (!ev.target.closest(".popover")) fecharAjuda();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") fecharAjuda();
    });
    window.addEventListener("scroll", agendarPosicao, { passive: true });
    window.addEventListener("resize", agendarPosicao);
  }

  // ---- Ícones -------------------------------------------------------------
  const ICONES = {
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };
  function icone(nome) {
    return ICONES[nome] || "";
  }

  // ---- Menu: destaca a seção que está na tela ----------------------------------
  function espiarSecoes(menu) {
    const links = Array.prototype.slice.call(menu.querySelectorAll("a[href^='#']"));
    const ids = links.map(function (a) { return a.getAttribute("href").slice(1); });
    let atualId = null;
    let pendente = false;

    function calcular() {
      pendente = false;
      const limite = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topo-altura")) + 40 || 160;
      let escolhido = ids[0];
      ids.forEach(function (id) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= limite) escolhido = id;
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) escolhido = ids[ids.length - 1];
      if (escolhido === atualId) return;
      atualId = escolhido;
      links.forEach(function (a) {
        if (a.getAttribute("href") === "#" + escolhido) {
          a.setAttribute("aria-current", "true");
          // Mantém o item ativo visível no menu rolável do celular, sem mexer na página.
          const alvo = a.offsetLeft - (menu.clientWidth - a.offsetWidth) / 2;
          if (menu.scrollWidth > menu.clientWidth) menu.scrollTo({ left: Math.max(0, alvo), behavior: "smooth" });
        } else a.removeAttribute("aria-current");
      });
    }
    function agendar() {
      if (!pendente) {
        pendente = true;
        requestAnimationFrame(calcular);
      }
    }
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    calcular();
  }

  root.UI = {
    mostrarTooltip: mostrarTooltip,
    esconderTooltip: esconderTooltip,
    ajuda: ajuda,
    iniciarAjuda: iniciarAjuda,
    verificarAjuda: verificarAjuda,
    icone: icone,
    espiarSecoes: espiarSecoes,
  };
})(window);
