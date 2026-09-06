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
const PARAMETROS = [
  {
    id: 'alcalinidade',
    nome: 'Alcalinidade Total',
    unidade: 'ppm',
    faixa: { min: 80, max: 120 },
    metaPadrao: 100,
    causas: {
      alto: 'Uso excessivo de elevadores de alcalinidade/pH, ou água de reposição com alcalinidade naturalmente alta.',
      baixo: 'Uso excessivo de produtos ácidos, água de reposição com alcalinidade naturalmente baixa, ou diluição por chuva.',
    },
    limitesSeguranca:
      'Corrigir em etapas menores quando a variação necessária for grande, remedindo entre uma aplicação e outra. Aplicar com circulação ligada.',
    tempoEsperaHoras: 5,
    instrucaoRemedicao: 'Circular por pelo menos 4–6 horas antes de remedir (o bicarbonato de sódio dissolve mais lentamente).',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'ph',
    nome: 'pH',
    unidade: '',
    faixa: { min: 7.2, max: 7.6 },
    metaPadrao: 7.4,
    causas: {
      alto: 'Uso recente de produtos alcalinizantes, alcalinidade total muito alta, evaporação, ou alta taxa de banhistas.',
      baixo: 'Uso recente de produtos ácidos ou cloro muito ácido, chuva recente, ou alcalinidade total muito baixa.',
    },
    limitesSeguranca:
      'Nunca misturar produtos ácidos e alcalinizantes diretamente entre si. Aplicar com circulação ligada e piscina sem banhistas. Aguardar diluição completa antes de nova medição.',
    tempoEsperaHoras: 0.75,
    instrucaoRemedicao: 'Circular por 30–60 minutos após aplicação antes de medir novamente.',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'dureza',
    nome: 'Dureza Cálcica',
    unidade: 'ppm',
    faixa: { min: 200, max: 400 },
    metaPadrao: 300,
    causas: {
      alto: 'Evaporação concentrando minerais, água de reposição naturalmente dura, ou uso frequente de produtos à base de cálcio.',
      baixo: 'Água de reposição naturalmente mole, diluição por chuva, ou esvaziamento parcial recente.',
    },
    limitesSeguranca: {
      baixo: 'Dureza muito baixa: água "agressiva", corrosiva para superfícies, tubulações e equipamentos metálicos.',
      alto: 'Dureza muito alta: favorece incrustação (calcário) em paredes, filtros e aquecedores, e deixa a água turva.',
    },
    tempoEsperaHoras: 4,
    instrucaoRemedicao: 'Circular por algumas horas antes de remedir; o efeito na água leva tempo para se homogeneizar.',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'cianurico',
    nome: 'Ácido Cianúrico (Estabilizante)',
    unidade: 'ppm',
    faixa: { min: 30, max: 50 },
    metaPadrao: 40,
    causas: {
      alto: 'Uso frequente de clorante estabilizado (tricloro/dicloro), ou pouca renovação de água há muito tempo.',
      baixo: 'Piscina nova, diluição por chuva/reposição de água, ou uso de cloro sem estabilizante.',
    },
    limitesSeguranca: {
      alto: 'CYA muito alto "trava" parte do cloro livre (efeito conhecido como chlorine lock), reduzindo a desinfecção real mesmo com cloro livre medido como adequado.',
    },
    tempoEsperaHoras: 6,
    instrucaoRemedicao: 'Circular por várias horas — o ácido cianúrico dissolve mais lentamente que a maioria dos produtos.',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'sal',
    nome: 'Sal',
    unidade: 'ppm',
    faixa: { min: 2700, max: 3400 },
    metaPadrao: 3000,
    apenasSistema: 'salino',
    causas: {
      alto: 'Adição de sal além do necessário, ou evaporação sem reposição de água correspondente.',
      baixo: 'Reposição de água doce, retrolavagem do filtro, ou diluição por chuva.',
    },
    limitesSeguranca: {
      baixo: 'Sal muito baixo: pode reduzir ou interromper a geração de cloro pelo gerador salino, e em casos extremos danificar a célula por falta de condutividade adequada.',
      alto: 'Sal muito alto: acelera a corrosão de peças metálicas e equipamentos, e fica perceptível ao paladar.',
    },
    tempoEsperaHoras: 24,
    instrucaoRemedicao: 'Circular e escovar por várias horas; aguardar cerca de 24h antes de remedir (o sal grosso demora a dissolver completamente).',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
  },
  {
    id: 'cloro',
    nome: 'Cloro Livre',
    unidade: 'ppm',
    faixa: { min: 0.5, max: 3 },
    metaPadrao: 1.5,
    causas: {
      alto: 'Dosagem recente excessiva, ou baixa circulação de banhistas consumindo o produto.',
      baixo: 'Consumo por carga de banhistas, calor/radiação UV, estabilizante insuficiente, ou pH fora da faixa.',
    },
    limitesSeguranca: {
      baixo: 'Cloro muito baixo: interditar o uso até corrigir (risco sanitário).',
      alto: 'Cloro muito alto: interditar o uso até baixar a níveis seguros (risco de irritação).',
    },
    tempoEsperaHoras: 0.75,
    instrucaoRemedicao: 'Circular por 30–60 minutos após aplicação antes de liberar o uso da piscina.',
    calcularDose: (variacao, volumeLitros, concentracaoPercentual) =>
      calcularDose({ variacao, volumeLitros, concentracaoPercentual }),
    instrucaoGeradorSalino: {
      subir: 'Piscina com gerador salino: confirme o nível de Sal e aumente a produção (%) do gerador conforme o manual do equipamento, em vez de dosar clorante manual.',
      descer: 'Piscina com gerador salino: reduza a produção (%) do gerador conforme o manual do equipamento.',
    },
    avisoOzonio:
      'Piscina com gerador de ozônio: o ozônio faz parte da desinfecção, então a meta de cloro livre real pode ser bem menor que a faixa padrão (0,5–3 ppm). Não há um valor de referência único — confirme com um técnico responsável a faixa reduzida recomendada para o seu sistema antes de dosar.',
  },
  {
    id: 'temperatura',
    nome: 'Temperatura',
    unidade: '°C',
    faixa: { min: 26, max: 30 },
    metaPadrao: 28,
    semProduto: true,
    rotulosStatus: { baixo: 'fria', alto: 'quente' },
    causas: {
      alto: 'Aquecimento excessivo, exposição solar direta prolongada, ou clima muito quente.',
      baixo: 'Clima frio, ausência de aquecimento, ou perda de calor noturna.',
    },
    limitesSeguranca: {
      alto: 'Água muito quente acelera a degradação do cloro e favorece a proliferação de algas e bactérias — atenção redobrada ao cloro livre em dias muito quentes.',
    },
    instrucaoOperacional: {
      alto: 'Considere usar sombreamento ou reduzir/desligar o aquecimento. Atenção: temperatura alta acelera o consumo de cloro.',
      baixo: 'Considere ligar o aquecedor ou usar uma capa térmica.',
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

  for (const parametro of PARAMETROS) {
    if (parametro.apenasSistema && parametro.apenasSistema !== sistemaDesinfeccao) continue;

    const valor = leituras[parametro.id];
    if (typeof valor !== 'number' || Number.isNaN(valor)) continue;

    const faixa = faixasCustom[parametro.id] || parametro.faixa;
    const status = classificar(valor, faixa.min, faixa.max);
    const rotuloStatus = (parametro.rotulosStatus && parametro.rotulosStatus[status]) || status;

    if (parametro.id === 'cianurico') cianuricoAlto = status === 'alto';

    // Avisos que não mudam a classificação, só dão contexto extra (ver Módulo 6/11 e a
    // interação Cianúrico -> Cloro do Módulo 5): podem se acumular independentemente do
    // status do próprio Cloro, por isso viram uma lista em vez de um campo único.
    const avisos = [];
    if (parametro.id === 'cloro' && sistemaDesinfeccao === 'ozonio') avisos.push(parametro.avisoOzonio);
    if (parametro.id === 'cloro' && cianuricoAlto) {
      avisos.push(
        'Ácido Cianúrico está alto nesta leitura — isso "trava" parte do cloro livre (chlorine lock). Para compensar, considere manter o Cloro Livre na parte de cima da faixa (perto de 3 ppm) em vez do meio; confirme com um técnico responsável se isso é suficiente para o seu caso.'
      );
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

    // Cianúrico alto empurra a meta de cloro para o topo da faixa (ver Módulo 5, "Interação
    // com outros parâmetros"), a menos que quem chamou já tenha passado uma meta explícita.
    const metaAjustadaPorCya = parametro.id === 'cloro' && cianuricoAlto && metasCustom[parametro.id] == null;
    const meta = metaAjustadaPorCya ? parametro.faixa.max : metasCustom[parametro.id] ?? parametro.metaPadrao;
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
