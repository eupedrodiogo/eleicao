# Painel Eleições 2026

Painel para acompanhar a apuração das Eleições 2026 (presidente e governadores) com os
**dados públicos do TSE em tempo real**, com indicadores que comparam o 1º e o 2º turno
e as eleições presidenciais de 2010 a 2022.

É um site estático (HTML, CSS e JavaScript puro, sem build e sem dependências). O navegador
lê direto os mesmos arquivos JSON usados pelo site e pelo app *Resultados* do TSE e atualiza
sozinho a cada minuto enquanto a apuração está em andamento.

## Como usar

```bash
node server.mjs          # http://localhost:8080
```

Também dá para publicar a pasta como está, em qualquer hospedagem estática (GitHub Pages,
Netlify, S3…), ou abrir com `python3 -m http.server`. O `server.mjs` é opcional: além de
servir os arquivos, ele tem um proxy em `/tse/` com cache de 15 s, usado automaticamente se
a leitura direta do TSE falhar (rede/CORS) ou quando a página é aberta com `?proxy=1`.

Parâmetros de URL: `?uf=sp` abre num estado, `?turno=1` abre no 1º turno.

## O que o painel mostra

| Seção | Indicadores |
| --- | --- |
| **Placar** | % dos votos válidos e votos de cada finalista, diferença em votos e em p.p., situação (À frente / Eleito), foto oficial, % de seções apuradas. No 1º turno, todos os candidatos. |
| **Indicadores** | Seções apuradas, comparecimento, abstenção, votos válidos, brancos, nulos e eleitorado, cada um com a variação em p.p. contra o 1º turno de 2026 e contra o mesmo turno de 2022. |
| **1º × 2º turno** | Gráfico de pontos com o desempenho de cada finalista no 1º turno, no 2º turno e (pelo número do partido) no 2º turno de 2022; tabela com ganho de votos, votos dos demais candidatos do 1º turno, brancos, nulos e abstenção. |
| **Projeção e votos em jogo** | Projeção simples do resultado final, votos válidos ainda a apurar, eleitores em seções não apuradas e o % dos votos restantes de que o 2º colocado precisa para virar. É estimativa, não resultado. |
| **Mapa por estado** | Mapa em grade das 27 UFs + Exterior, com seis visões: margem no 2º turno, margem no 1º turno, mudança de margem do 1º para o 2º turno, mudança de margem contra 2022, abstenção e andamento da apuração. Clique no estado para abrir o recorte. |
| **Resultados por estado** | Tabela ordenável com seções apuradas, % de cada finalista no 1º e no 2º turno, margens, margem de 2022, abstenção e eleitorado. |
| **Por região** | Soma dos votos das UFs de cada região (2º turno e 1º turno). |
| **Evolução da apuração** | Curva do % de cada finalista conforme as seções são apuradas (guardada no navegador enquanto a página fica aberta). |
| **Histórico 2010–2026** | 2º turno de cada eleição, abstenção e brancos + nulos por turno, e tabela completa. |
| **Governadores · 2º turno** | Os estados com 2º turno para governador, com o andamento de cada disputa. |

Todo recorte (Brasil, cada UF, Exterior) muda o placar, os indicadores e a comparação.
Tema claro e escuro seguem o sistema e podem ser trocados no botão *Tema*.

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
- Se o TSE não responder, o painel mostra um aviso e mantém a última leitura salva; nada
  é inventado.

Convenções: percentuais de candidatos são sobre os votos válidos; brancos e nulos, sobre o
comparecimento; comparecimento e abstenção, sobre o eleitorado das seções já apuradas
(como o TSE divulga). Somas por região e projeções são cálculos do painel.

## Estrutura

```
index.html          página
css/style.css       estilos (tokens de cor para tema claro/escuro)
js/config.js        códigos das eleições, cores, intervalo de atualização
js/tse.js           URLs, leitura e normalização dos JSON do TSE, somas e projeção
js/historico.js     resultados nacionais de 2010–2022
js/graficos.js      gráficos SVG (linhas, barras 100%, pontos) e tooltip
js/app.js           carregamento, atualização periódica e desenho do painel
server.mjs          servidor local opcional com proxy /tse/
tests/              testes (node --test) com arquivos sintéticos no formato do TSE
```

## Testes

```bash
npm test
```

Os testes cobrem a leitura dos dois formatos de arquivo do TSE (2026 e 2022), os
percentuais calculados, somas por região, projeção, descoberta de códigos no `ele-c.json`
e os totais históricos embutidos.
