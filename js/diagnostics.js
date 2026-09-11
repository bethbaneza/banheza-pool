// Módulos 3, 4, 5, 6, 7, 8, 9 e 10 — pH, Alcalinidade Total, Cloro Livre, Dureza Cálcica,
// Ácido Cianúrico, Sal, Temperatura e o Motor de Diagnóstico Cruzado.
// Implementado como tabela de decisão (array PARAMETROS abaixo), conforme exigido pela
// especificação: cada linha é auditável e nova linha = novo parâmetro, sem if/else espalhado.

function classificar(valor, min, max) {
  if (valor < min) return 'baixo';
  if (valor > max) return 'alto';
  return 'adequado';
}

// ppm (partes por milhão) equivale a mg por litro. A especificação original (seções 3, 4 e 5)
// definia "quantidade = variação × volume ÷ concentração" sem converter miligramas para
// quilogramas — isso fazia a dose sair ~1.000.000× maior que o real (confirmado comparando
// com a dosagem declarada real de bicarbonato de sódio: 17g/1.000L para 10ppm de alcalinidade
// dá ~10g pela fórmula corrigida, contra ~1.010g pela fórmula antiga).
//
// massa necessária (mg) = variação (ppm = mg/L) × volume (L)
// massa necessária (kg) = massa (mg) ÷ 1.000.000
// quantidade de produto (kg) = massa necessária (kg) ÷ concentração/pureza do produto
//
// O pH não é tecnicamente uma concentração em mg/L — não existe fórmula química exata a
// partir só da concentração do produto (fabricantes usam tabelas de dosagem próprias, como
// a HTH: ver especificação, seção 2). Aplicamos a mesma conversão por consistência de ordem
// de grandeza, mas o resultado para pH continua sendo uma aproximação a confirmar com um
// técnico/químico responsável, mais ainda do que os outros parâmetros.
function calcularDose({ variacao, volumeLitros, concentracaoPercentual }) {
  const concentracaoFracao = concentracaoPercentual / 100;
  if (!(concentracaoFracao > 0)) return null;
  const massaNecessariaKg = (Math.abs(variacao) * volumeLitros) / 1000000;
  return massaNecessariaKg / concentracaoFracao;
}

// Converte a quantidade calculada (tratada como massa, em kg) para litros quando o produto é líquido.
// Se o produto é líquido mas não tem densidade cadastrada, não dá para converter — o resultado
// continua em kg, mas marcado com densidadeAusente para a interface avisar (em vez de mostrar
// "kg" como se fosse a unidade certa de um produto que na prática é vendido em litros).
function quantidadeEmUnidadeDoProduto(quantidadeKg, produto) {
  if (produto && produto.estadoFisico === 'liquido') {
    if (produto.densidade > 0) {
      return { valor: quantidadeKg / produto.densidade, unidade: 'L' };
    }
    return { valor: quantidadeKg, unidade: 'kg', densidadeAusente: true };
  }
  return { valor: quantidadeKg, unidade: 'kg' };
}

// Resolve o texto de limites de segurança de um parâmetro para o status atual (baixo/alto).
// Aceita tanto uma string única (vale para os dois lados) quanto um objeto {baixo, alto}
// (quando o risco é diferente conforme a direção, como em Cloro) — retorna null se não há
// nada cadastrado para aquele status (ex: Cianúrico só tem risco relevante quando "alto").
function limiteSegurancaPara(parametro, status) {
  const l = parametro.limitesSeguranca;
  if (!l) return null;
  return typeof l === 'string' ? l : l[status] || null;
}

// Faixas de referência gerais da indústria para os módulos 7-10 (ver especificação) — não são
// uma pesquisa de FISPQ por marca como o Módulo 2; precisam ser confirmadas por um
// técnico/químico responsável antes do uso real, especialmente Sal (varia por fabricante de
// gerador) e pH (que já carrega o mesmo aviso desde a versão anterior).
// Os campos de texto abaixo (nome, causas, limitesSeguranca, instrucaoRemedicao,
// instrucaoOperacional, instrucaoGeradorSalino, avisoOzonio, rotulosStatus) guardam CHAVES de
// tradução (ver js/i18n.js), não o texto final em português — quem exibe (app.js/pdf.js) chama
// t(chave) na hora de renderizar, já no idioma escolhido pela pessoa. Isso mantém esta tabela
// de decisão só com dados/lógica, sem amarrar o motor de diagnóstico a um idioma fixo.
const PARAMETROS = [
  {
    id: 'alcalinidade',
    nome: 'param.alcalinidade.nome',
    unidade: 'ppm',
    faixa: { min: 80, max: 120 },
    metaPadrao: 100,
    causas: {
      alto: 'causa.alcalinidade.alto',
      baixo: 'causa.alcalinidade.baixo',
    },
    limitesSeguranca: 'limite.alcalinidade',
    tempoEsperaHoras: 5,
    instrucaoRemedicao: 'remedir.alcalinidade',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'ph',
    nome: 'param.ph.nome',
    unidade: '',
    faixa: { min: 7.2, max: 7.6 },
    metaPadrao: 7.4,
    causas: {
      alto: 'causa.ph.alto',
      baixo: 'causa.ph.baixo',
    },
    limitesSeguranca: 'limite.ph',
    tempoEsperaHoras: 0.75,
    instrucaoRemedicao: 'remedir.ph',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'dureza',
    nome: 'param.dureza.nome',
    unidade: 'ppm',
    faixa: { min: 200, max: 400 },
    metaPadrao: 300,
    causas: {
      alto: 'causa.dureza.alto',
      baixo: 'causa.dureza.baixo',
    },
    limitesSeguranca: {
      baixo: 'limite.dureza.baixo',
      alto: 'limite.dureza.alto',
    },
    tempoEsperaHoras: 4,
    instrucaoRemedicao: 'remedir.dureza',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'cianurico',
    nome: 'param.cianurico.nome',
    unidade: 'ppm',
    faixa: { min: 30, max: 50 },
    metaPadrao: 40,
    causas: {
      alto: 'causa.cianurico.alto',
      baixo: 'causa.cianurico.baixo',
    },
    limitesSeguranca: {
      alto: 'limite.cianurico.alto',
    },
    tempoEsperaHoras: 6,
    instrucaoRemedicao: 'remedir.cianurico',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'sal',
    nome: 'param.sal.nome',
    unidade: 'ppm',
    faixa: { min: 2700, max: 3400 },
    metaPadrao: 3000,
    apenasSistema: 'salino',
    causas: {
      alto: 'causa.sal.alto',
      baixo: 'causa.sal.baixo',
    },
    limitesSeguranca: {
      baixo: 'limite.sal.baixo',
      alto: 'limite.sal.alto',
    },
    tempoEsperaHoras: 24,
    instrucaoRemedicao: 'remedir.sal',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'cloro',
    nome: 'param.cloro.nome',
    unidade: 'ppm',
    faixa: { min: 0.5, max: 3 },
    metaPadrao: 1.5,
    causas: {
      alto: 'causa.cloro.alto',
      baixo: 'causa.cloro.baixo',
    },
    limitesSeguranca: {
      baixo: 'limite.cloro.baixo',
      alto: 'limite.cloro.alto',
    },
    tempoEsperaHoras: 0.75,
    instrucaoRemedicao: 'remedir.cloro',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
    instrucaoGeradorSalino: {
      subir: 'geradorSalino.cloro.subir',
      descer: 'geradorSalino.cloro.descer',
    },
    avisoOzonio: 'avisoOzonio.cloro',
  },
  {
    id: 'temperatura',
    nome: 'param.temperatura.nome',
    unidade: '°C',
    faixa: { min: 26, max: 30 },
    metaPadrao: 28,
    semProduto: true,
    rotulosStatus: { baixo: 'rotulo.temperatura.baixo', alto: 'rotulo.temperatura.alto' },
    causas: {
      alto: 'causa.temperatura.alto',
      baixo: 'causa.temperatura.baixo',
    },
    limitesSeguranca: {
      alto: 'limite.temperatura.alto',
    },
    instrucaoOperacional: {
      alto: 'operacional.temperatura.alto',
      baixo: 'operacional.temperatura.baixo',
    },
  },
];

// leituras = { alcalinidade, ph, dureza, cianurico, sal, cloro, temperatura } (todas opcionais)
// produtosPorParametro = { <parametroId>: { subir: produto|null, descer: produto|null }, ... }
// opcoes = {
//   metasCustom: { <parametroId>: number },       // sobrescreve a meta padrão de um parâmetro
//   faixasCustom: { <parametroId>: {min,max} },    // sobrescreve a faixa-alvo (ex: Sal do fabricante do gerador)
//   sistemaDesinfeccao: 'manual' | 'salino' | 'ozonio', // padrão 'manual'
// }
// Retorna os passos na ordem fixa de prioridade da especificação (Módulo 6): Alcalinidade ->
// pH -> Dureza -> Cianúrico -> Sal (só se salino) -> Cloro -> Temperatura.
function diagnosticar(leituras, volumeLitros, produtosPorParametro, opcoes = {}) {
  const { metasCustom = {}, faixasCustom = {}, sistemaDesinfeccao = 'manual' } = opcoes;
  const passos = [];
  let cianuricoAlto = false; // setado ao processar 'cianurico', usado depois ao chegar em 'cloro'

  // Água quente favorece reações químicas e crescimento de microrganismos, aumentando a
  // demanda de cloro (mesmo raciocínio do CDC sobre depleção mais rápida de cloro em spas
  // aquecidos) — por isso empurra a meta de Cloro pro topo da faixa, igual ao Cianúrico alto,
  // logo abaixo. Calculado aqui fora do loop porque 'temperatura' vem DEPOIS de 'cloro' na
  // ordem fixa de prioridade (Módulo 6) — o loop ainda não teria processado essa leitura a
  // tempo se dependesse da mesma técnica usada pro cianuricoAlto (setar uma flag ao "passar"
  // pelo parâmetro antes de chegar em cloro).
  const paramTemperatura = PARAMETROS.find((p) => p.id === 'temperatura');
  const faixaTemperatura = faixasCustom.temperatura || paramTemperatura.faixa;
  const temperaturaAlta = typeof leituras.temperatura === 'number' && leituras.temperatura > faixaTemperatura.max;

  for (const parametro of PARAMETROS) {
    if (parametro.apenasSistema && parametro.apenasSistema !== sistemaDesinfeccao) continue;

    const valor = leituras[parametro.id];
    if (typeof valor !== 'number' || Number.isNaN(valor)) continue;

    const faixa = faixasCustom[parametro.id] || parametro.faixa;
    const status = classificar(valor, faixa.min, faixa.max);
    const rotuloStatus = (parametro.rotulosStatus && parametro.rotulosStatus[status]) || ('rotulo.status.' + status);

    if (parametro.id === 'cianurico') cianuricoAlto = status === 'alto';

    // Avisos que não mudam a classificação, só dão contexto extra (ver Módulo 6/11 e a
    // interação Cianúrico -> Cloro do Módulo 5): podem se acumular independentemente do
    // status do próprio Cloro, por isso viram uma lista em vez de um campo único.
    const avisos = [];
    if (parametro.id === 'cloro' && sistemaDesinfeccao === 'ozonio') avisos.push(parametro.avisoOzonio);
    if (parametro.id === 'cloro' && cianuricoAlto) {
      avisos.push('avisoCianuricoAlto.cloro');
    }
    if (parametro.id === 'cloro' && temperaturaAlta) {
      avisos.push('avisoTemperaturaAlta.cloro');
    }

    if (status === 'adequado') {
      passos.push({ parametroId: parametro.id, nome: parametro.nome, status, rotuloStatus, valor, ...(avisos.length && { avisos }) });
      continue;
    }

    if (parametro.semProduto) {
      passos.push({
        parametroId: parametro.id,
        nome: parametro.nome,
        status,
        rotuloStatus,
        valor,
        motivo: parametro.causas[status],
        limitesSeguranca: limiteSegurancaPara(parametro, status),
        instrucaoOperacional: parametro.instrucaoOperacional[status],
        semProduto: true,
        ...(avisos.length && { avisos }),
      });
      continue;
    }

    // Cianúrico alto ou temperatura alta empurram a meta de cloro para o topo da faixa (ver
    // Módulo 5, "Interação com outros parâmetros", e o comentário sobre temperaturaAlta acima),
    // a menos que quem chamou já tenha passado uma meta explícita. As duas causas juntas ainda
    // resultam só no topo da faixa (não "somam" além do limite seguro).
    const metaAjustadaCloro = parametro.id === 'cloro' && (cianuricoAlto || temperaturaAlta) && metasCustom[parametro.id] == null;
    const meta = metaAjustadaCloro ? parametro.faixa.max : metasCustom[parametro.id] ?? parametro.metaPadrao;
    const variacao = meta - valor;
    const direcao = variacao > 0 ? 'subir' : 'descer';

    // Piscina com gerador salino: não faz sentido sugerir clorante manual — orienta a
    // conferir o Sal e ajustar a produção do próprio gerador (Módulo 11 da especificação).
    if (parametro.id === 'cloro' && sistemaDesinfeccao === 'salino') {
      passos.push({
        parametroId: parametro.id,
        nome: parametro.nome,
        status,
        rotuloStatus,
        valor,
        meta,
        direcao,
        motivo: parametro.causas[status],
        limitesSeguranca: limiteSegurancaPara(parametro, status),
        instrucaoGeradorSalino: parametro.instrucaoGeradorSalino[direcao],
        semProduto: true,
        tempoEsperaHoras: parametro.tempoEsperaHoras,
        instrucaoRemedicao: parametro.instrucaoRemedicao,
        ...(avisos.length && { avisos }),
      });
      continue;
    }

    const produtos = produtosPorParametro[parametro.id] || {};
    const produto = produtos[direcao] || null;

    let dose = null;
    if (produto && produto.concentracao > 0) {
      const doseKg = parametro.calcularDose(variacao, volumeLitros, produto.concentracao);
      dose = doseKg === null ? null : quantidadeEmUnidadeDoProduto(doseKg, produto);
    }

    passos.push({
      parametroId: parametro.id,
      nome: parametro.nome,
      status,
      rotuloStatus,
      valor,
      meta,
      direcao,
      motivo: parametro.causas[status],
      limitesSeguranca: limiteSegurancaPara(parametro, status),
      produto: produto ? produto.nomeComercial : null,
      produtoId: produto ? produto.id : null,
      dose,
      tempoEsperaHoras: parametro.tempoEsperaHoras,
      instrucaoRemedicao: parametro.instrucaoRemedicao,
      ...(avisos.length && { avisos }),
    });
  }
  return passos;
}

if (typeof module !== 'undefined') {
  module.exports = { PARAMETROS, classificar, calcularDose, quantidadeEmUnidadeDoProduto, diagnosticar };
}
