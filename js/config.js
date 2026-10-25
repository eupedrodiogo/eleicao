/**
 * Configuração do painel. É o único arquivo que precisa mudar de uma eleição
 * para outra.
 *
 * Os códigos das eleições vêm da configuração pública do TSE
 * (https://resultados.tse.jus.br/oficial/comum/config/ele-c.json). Ao abrir,
 * o painel tenta ler esse arquivo e, se conseguir, usa os códigos de lá; os
 * valores abaixo são o plano B.
 *
 *   6257  Eleição Ordinária Federal 2026, 1º turno (04/10/2026)
 *   6258  Eleição Ordinária Federal 2026, 2º turno (25/10/2026)
 *   6259  Eleição Ordinária Estadual 2026, 1º turno
 *   6260  Eleição Ordinária Estadual 2026, 2º turno (descoberto via ele-c.json)
 *    544  Eleição Geral Federal 2022, 1º turno
 *    545  Eleição Geral Federal 2022, 2º turno
 *
 * Parâmetros de URL úteis:
 *   ?proxy=1   lê os arquivos pelo servidor local (server.mjs) em vez do TSE
 *   ?uf=sp     abre já no recorte de São Paulo
 *   ?turno=1   abre na visão do 1º turno
 */
window.PAINEL_CONFIG = {
  base: "https://resultados.tse.jus.br",
  ambiente: "oficial",
  ano: 2026,

  eleicoes: {
    federal1: { codigo: "6257", ciclo: "ele2026", formato: "u", turno: 1, rotulo: "1º turno 2026" },
    federal2: { codigo: "6258", ciclo: "ele2026", formato: "u", turno: 2, rotulo: "2º turno 2026" },
    estadual2: { codigo: "6260", ciclo: "ele2026", formato: "u", turno: 2, rotulo: "Governadores, 2º turno 2026" },
    anterior1: { codigo: "544", ciclo: "ele2022", formato: "r", turno: 1, rotulo: "1º turno 2022" },
    anterior2: { codigo: "545", ciclo: "ele2022", formato: "r", turno: 2, rotulo: "2º turno 2022" },
  },

  // Cor de cada candidato pelo número (cor da legenda, nunca do texto).
  // Quem não estiver aqui recebe as cores reservas, na ordem.
  cores: { 13: "vermelho", 22: "azul" },
  coresReserva: ["azul", "laranja"],

  // Intervalo de atualização da apuração em andamento (ms).
  intervalo: 60000,

  // Caminho do proxy local (server.mjs). Usado quando ?proxy=1 ou quando a
  // leitura direta do TSE falha por CORS/rede.
  proxy: "tse",
};
