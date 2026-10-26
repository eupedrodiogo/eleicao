/**
 * Servidor local opcional, sem dependências.
 *
 *   node server.mjs            → http://localhost:8080
 *   PORT=3000 node server.mjs
 *
 * Serve os arquivos do painel e repassa /tse/* para
 * https://resultados.tse.jus.br/* com um cache curto em memória. O navegador
 * normalmente lê o TSE direto (o TSE libera CORS); o proxy é o plano B
 * quando a leitura direta falha, e reduz pedidos ao TSE quando muitas
 * pessoas abrem o painel pelo mesmo servidor.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT || 8080);
const TSE = "https://resultados.tse.jus.br";
const CACHE_MS = Number(process.env.CACHE_MS || 15000);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const cache = new Map();

async function proxy(req, res, caminho) {
  // Só arquivos de resultado, configuração e fotos do ambiente oficial.
  if (!/^\/(oficial|simulado)\/[\w./-]+\.(json|jpe?g)$/.test(caminho) || caminho.includes("..")) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("caminho inválido");
    return;
  }
  const agora = Date.now();
  const guardado = cache.get(caminho);
  if (guardado && agora - guardado.em < CACHE_MS) {
    responder(res, guardado);
    return;
  }
  try {
    const resp = await fetch(TSE + caminho, { headers: { accept: "application/json, image/*" } });
    const corpo = Buffer.from(await resp.arrayBuffer());
    const item = { em: agora, status: resp.status, tipo: resp.headers.get("content-type") || "application/octet-stream", corpo };
    if (resp.ok || resp.status === 404 || resp.status === 403) cache.set(caminho, item);
    responder(res, item);
  } catch (erro) {
    if (guardado) {
      responder(res, guardado);
      return;
    }
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end("TSE indisponível: " + erro.message);
  }
}

function responder(res, item) {
  res.writeHead(item.status, {
    "content-type": item.tipo,
    "cache-control": "no-store",
    "x-painel-proxy": "1",
  });
  res.end(item.corpo);
}

async function estatico(res, caminho) {
  const relativo = caminho === "/" ? "/index.html" : caminho;
  const arquivo = path.normalize(path.join(RAIZ, relativo));
  if (!arquivo.startsWith(RAIZ + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const corpo = await fs.readFile(arquivo);
    res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
    res.end(corpo);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("não encontrado");
  }
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const caminho = decodeURIComponent(url.pathname);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  if (caminho.startsWith("/tse/")) proxy(req, res, caminho.slice(4));
  else estatico(res, caminho);
});

servidor.listen(PORTA, () => {
  console.log("Painel em http://localhost:" + PORTA + "  (proxy do TSE em /tse/)");
});
