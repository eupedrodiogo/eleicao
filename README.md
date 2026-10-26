# Painel Eleições 2026

Painel para acompanhar a apuração das Eleições 2026 (presidente e governadores) com os
**dados públicos do TSE em tempo real**, feito para ser entendido por qualquer pessoa: ele
responde primeiro "quem está na frente?", explica cada número em linguagem simples e deixa o
detalhe (estados, comparação entre turnos, histórico) para quem quiser se aprofundar.

É um site estático (HTML, CSS e JavaScript puro, sem build e sem dependências). O navegador
lê direto os mesmos arquivos JSON usados pelo site e pelo app *Resultados* do TSE e atualiza
sozinho a cada minuto enquanto a apuração está em andamento.

## Como usar

**Online:** https://eupedrodiogo.github.io/eleicao/ (GitHub Pages; o site é publicado pela
automação `.github/workflows/pages.yml` a cada alteração, depois de passar nos testes).

**No seu computador** (precisa do [Node.js](https://nodejs.org) 18 ou mais novo):

```bash
git clone https://github.com/eupedrodiogo/eleicao.git
cd eleicao
git checkout claude/zen-gauss-x082qz
node server.mjs          # http://localhost:8080
```

O `server.mjs` é opcional: além de servir os arquivos, ele tem um proxy em `/tse/` com cache
de 15 s, usado automaticamente se a leitura direta do TSE falhar (rede/CORS) ou quando a
página é aberta com `?proxy=1`. Também dá para abrir a pasta com qualquer servidor estático.

Parâmetros de URL: `?uf=sp` abre no estado, `?turno=1` abre no 1º turno.

## O que a página mostra

| Seção | Para que serve |
| --- | --- |
| **Resumo** | Manchete escrita automaticamente a partir dos dados ("Flávio lidera a apuração…", "Disputa apertada…", "… é eleito"), os dois candidatos com foto, percentual e votos, barra com a marca de 50%, quanto da apuração já foi feito e um aviso de que o resultado ainda pode mudar. Troca para o 1º turno com um clique e tem o atalho **Ver meu estado**. |
| **Indicadores** | Eleitorado, comparecimento, abstenção e brancos+nulos, cada um com a variação contra o 1º turno e contra 2022 e um "?" que explica o termo. |
| **Por estado** | Mapa real do Brasil colorido por 6 visões (quem lidera, quem ficou na frente no 1º turno, quem ganhou terreno desde o 1º turno e desde 2022, abstenção, urnas apuradas), versão em quadrados para tocar com facilidade, painel com os números do estado escolhido, soma por região do país e tabela ordenável com busca. |
| **1º × 2º turno** | Como os votos se dividiram nos dois turnos e em 2022, quem ganhou terreno (comparando só os votos dos dois finalistas, que é a conta justa) e o destino dos votos dos candidatos eliminados. |
| **O que falta** | Quanto falta contar, estimativa do resultado final, o que seria preciso para virar o jogo e a evolução do placar durante a noite. |
| **Histórico** | 2º turno de 2010 a 2026, abstenção e brancos+nulos ao longo do tempo, com uma frase de leitura de cada gráfico. |
| **Governadores** | Os estados com 2º turno para governador. |
| **Entenda** | Perguntas frequentes em linguagem simples (o que são votos válidos, urnas apuradas, ponto percentual, por que o placar muda…). |

### Princípios de design

- **Responder primeiro, detalhar depois:** manchete → números → estados → comparações → histórico.
- **Linguagem simples:** termos técnicos têm um "?" com a explicação; as frases são geradas só
  com o que está nos dados e o painel nunca declara um vencedor: só mostra "eleito" quando o
  próprio arquivo do TSE marca.
- **Cores com significado único:** vermelho e azul identificam os candidatos e nada mais; o
  resto da interface é neutro. Cada cor foi validada para daltonismo e dá contraste de texto
  de pelo menos 4,5:1, em tema claro e escuro.
- **Acessível:** passa na auditoria automática do axe-core (WCAG 2.1 A/AA) em claro, escuro e
  celular, inclusive com o mapa, as tabelas e as perguntas abertas; mapa, tabela, ordenação,
  balões de ajuda e troca de turno funcionam só com o teclado; os gráficos têm descrição para
  leitores de tela e os números também aparecem em tabelas; respeita "reduzir movimento".
- **Funciona no celular:** o mapa mantém rótulos legíveis em qualquer largura e os estados
  pequenos viram botões.

## De onde vêm os dados

Arquivos públicos de divulgação do TSE (`https://resultados.tse.jus.br`):

| Eleição | Código | Arquivo |
| --- | --- | --- |
| Federal 2026, 1º turno (04/10) | 6257 | `oficial/ele2026/6257/dados/{uf}/{uf}-c0001-e006257-u.json` |
| Federal 2026, 2º turno (25/10) | 6258 | `oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json` |
| Estadual 2026, 2º turno (governador) | via `ele-c.json` | `oficial/ele2026/{código}/dados/{uf}/{uf}-c0003-e{código}-u.json` |
| Federal 2022, 1º e 2º turno | 544, 545 | `oficial/ele2022/545/dados-simplificados/{uf}/{uf}-c0001-e000545-r.json` |

- Ao abrir, o painel lê `oficial/comum/config/ele-c.json` para descobrir os códigos das
  eleições de 2026; os valores de `js/config.js` são o plano B.
- O 1º turno de 2026 e as eleições de 2022, que já terminaram, são guardados no
  `localStorage` depois da primeira leitura completa.
- Os totais nacionais de 2010 a 2022 (totalização final do TSE) estão em `js/historico.js`,
  para o histórico funcionar mesmo sem o TSE. Também há um retrato final do 1º turno de
  2026 (dois mais votados) para o caso de o arquivo oficial não poder ser lido.
- Se o TSE não responder, o painel avisa e mantém a última leitura salva; nada é inventado.
- A tela só é redesenhada quando chegam dados novos, para não atrapalhar quem navega pelo teclado.

Convenções: percentuais de candidatos são sobre os votos válidos; brancos e nulos, sobre o
comparecimento; comparecimento e abstenção, sobre o eleitorado das urnas já apuradas (como o
TSE divulga). Somas por região, comparações entre turnos e projeções são cálculos do painel.

## Estrutura

```
index.html            página (seções e contêineres)
css/style.css         tokens de cor (claro/escuro), tipografia e componentes
assets/               fonte Inter (licença OFL) e ícone
js/config.js          códigos das eleições, cores, datas, intervalo de atualização
js/tse.js             URLs, leitura e normalização dos JSON do TSE, somas, projeção e comparações
js/historico.js       resultados nacionais de 2010–2022
js/texto.js           números em pt-BR, nomes, manchete, frases-resumo, glossário e perguntas
js/dados.js           leitura dos arquivos, cache no navegador e atualização a cada minuto
js/ui.js              tooltip, balões de ajuda ("?"), ícones e menu que acompanha a rolagem
js/graficos.js        gráfico de linhas e barras de 100% (SVG/HTML, sem biblioteca)
js/mapa-dados.js      contorno das 27 UFs (gerado, ver abaixo)
js/mapa.js            mapa dos estados (contorno real ou quadrados)
js/app.js             desenho da página
scripts/gerar-mapa.mjs  gera js/mapa-dados.js a partir da malha do IBGE
server.mjs            servidor local opcional com proxy /tse/
tests/                testes (node --test)
```

### Regenerar o mapa

O contorno vem da malha de estados do IBGE
(`public/data/brazil-states.geojson` do repositório
[click_that_hood](https://github.com/codeforamerica/click_that_hood)), simplificado para
caber em ~40 KB:

```bash
node scripts/gerar-mapa.mjs caminho/para/brazil-states.geojson js/mapa-dados.js
```

## Testes

```bash
npm test
```

Cobrem a leitura dos dois formatos de arquivo do TSE (2026 e 2022), os percentuais, somas,
projeção, a comparação justa entre turnos, os textos gerados (manchete, frases e plurais),
o histórico embutido, o mapa e a **consistência da página** (todo `id` usado pelo JavaScript
existe no HTML, os arquivos referenciados existem, as variáveis de cor estão definidas e a
página não carrega nada de terceiros).

## Créditos

- Dados: [TSE](https://resultados.tse.jus.br/oficial/app/index.html) e IBGE (malha dos estados).
- Fonte: [Inter](https://rsms.me/inter/) (SIL Open Font License 1.1, em `assets/fonts/OFL-Inter.txt`),
  empacotada pelo [Fontsource](https://fontsource.org/).
