// Módulo 2 — modelos de produtos e concentrações de referência.
// Baseado na especificação (especificacao-modulos-calculadora-piscinas.md), seção 2.
// As concentrações aqui são só sugestões de preenchimento: o usuário sempre confirma/ajusta
// conforme o rótulo do produto que tem em mãos (etapa obrigatória, nunca pular).

const TEMPLATES_PRODUTO = [
  {
    tipo: 'Elevador de pH',
    principioAtivo: 'Carbonato de sódio (barrilha leve)',
    marcas: ['HTH', 'Genco', 'Hidroall', 'Maresias'],
  },
  {
    tipo: 'Redutor de pH',
    principioAtivo: 'Bissulfato de sódio (barrilha ácida)',
    marcas: ['HTH', 'Genco', 'Hidroazul'],
    aviso:
      'Dosagem de mercado genérica (confirme sempre no rótulo do fabricante): 40–60 g por 10.000 L para cada 0,2 de redução de pH.',
  },
  {
    tipo: 'Redutor de pH (líquido)',
    principioAtivo: 'Ácido clorídrico',
    marcas: ['Genco', 'Hidroall', 'HTH', 'Ácido muriático avulso'],
    estadoFisico: 'liquido',
    aviso:
      'O "Redutor de pH e Alcalinidade Extra Forte" da HTH tem composição proprietária (não divulgada) e dosagem própria: 13 ml/m³ reduz ~10 ppm de alcalinidade; 13 ml/m³ para pH entre 7,4–8,0, 25 ml/m³ acima de 8,0. Cadastre usando a dosagem do rótulo, não a fórmula genérica do app.',
  },
  {
    tipo: 'Elevador de alcalinidade',
    principioAtivo: 'Bicarbonato de sódio',
    marcas: ['HTH', 'Genco', 'Suall'],
    aviso:
      'Dosagem declarada pelo fabricante: 17 g por 1.000 L eleva ~10 ppm de alcalinidade. A fórmula genérica do app (que divide pela concentração %) pode não bater com esse número — revise com um técnico/químico responsável antes de aplicar.',
  },
  {
    tipo: 'Clorante granulado',
    principioAtivo: 'Hipoclorito de cálcio / Dicloro',
    marcas: ['HTH', 'Genco', 'Montreal', 'Suall'],
    aviso:
      'A linha "Prime" da Suall precisa ter o princípio ativo reclassificado (é dicloroisocianurato de sódio, não hipoclorito de cálcio) — confirme na FISPQ antes de usar como padrão.',
  },
  {
    tipo: 'Clorante em pastilha',
    principioAtivo: 'Tricloro',
    marcas: ['HTH', 'Genco', 'Genclor'],
  },
  {
    tipo: 'Clorante líquido',
    principioAtivo: 'Hipoclorito de sódio',
    marcas: ['Genclor', 'Clor In', 'CSM', 'E-Química'],
    estadoFisico: 'liquido',
    aviso:
      'Cloro líquido tem alta variação de marca para marca (2% a 12% de teor de cloro ativo) — este é o produto onde a confirmação por rótulo/lote é mais crítica de todos.',
  },
  {
    tipo: 'Aumentador de Dureza Cálcica',
    principioAtivo: 'Cloreto de cálcio',
    marcas: ['Genérico'],
    aviso: 'Cloreto de cálcio de mercado costuma vir entre 77% e 95% de pureza — confirme a % exata no rótulo do produto (referência geral, não uma pesquisa de FISPQ por marca).',
  },
  {
    tipo: 'Estabilizante (Ácido Cianúrico)',
    principioAtivo: 'Ácido cianúrico',
    marcas: ['Genérico'],
    aviso: 'Ácido cianúrico puro costuma ter pureza próxima de 99% — confirme no rótulo (referência geral, não uma pesquisa de FISPQ por marca).',
  },
  {
    tipo: 'Sal para Piscina',
    principioAtivo: 'Cloreto de sódio',
    marcas: ['Genérico'],
    aviso: 'Sal grosso/granulado para piscina costuma ter pureza próxima de 99% — confirme no rótulo. Nunca use sal de cozinha iodado ou com antiumectantes não recomendados para o gerador salino.',
  },
];

// Concentrações confirmadas pelo fabricante (FISPQ) — ver seção 2 da especificação.
// Produtos com dosagem proprietária/declarada (em vez de concentração simples) não entram
// aqui — ficam só como aviso no modelo acima, para não sugerir um número que não bate com
// o que o fabricante realmente declara.
const CONCENTRACOES_REFERENCIA = [
  { tipo: 'Elevador de pH', marca: 'Montreal', concentracao: 99.8, fonte: 'FISPQ Montreal' },
  { tipo: 'Elevador de pH', marca: 'Maresias', concentracao: 96.5, fonte: 'FISPQ Maresias (faixa 93–100%)' },
  { tipo: 'Clorante granulado', marca: 'HTH', concentracao: 65, fonte: 'FISPQ HTH / Arch Química' },
  { tipo: 'Clorante granulado', marca: 'HidroAll', concentracao: 65, fonte: 'Ficha técnica HidroAll' },
  { tipo: 'Clorante granulado', marca: 'Hidroazul', concentracao: 70, fonte: 'Ficha técnica Hidroazul' },
  { tipo: 'Clorante em pastilha', marca: 'Genco', concentracao: 85, fonte: 'Ficha técnica Genco (tabletes 3x1)' },
  { tipo: 'Clorante em pastilha', marca: 'Genclor', concentracao: 85, fonte: 'Ficha técnica Genco (tabletes 3x1)' },
  { tipo: 'Clorante em pastilha', marca: 'HTH', concentracao: 90, fonte: 'Ficha técnica HTH (Pace Tricloro)' },
  { tipo: 'Clorante líquido', marca: 'CSM', concentracao: 11, fonte: 'Ficha técnica CSM' },
  { tipo: 'Clorante líquido', marca: 'E-Química', concentracao: 12, fonte: 'Ficha técnica E-Química' },
  {
    tipo: 'Redutor de pH (líquido)',
    marca: 'Ácido muriático avulso',
    concentracao: 31.5,
    fonte: 'Padrão comercial 30–33% (Usiquímica, Labmix e outros) — confirme o rótulo específico',
  },
  {
    tipo: 'Elevador de alcalinidade',
    marca: 'HTH',
    concentracao: 99,
    fonte: 'Fichas técnicas HTH, Genco e Suall (pureza próxima de 100%; ver aviso de dosagem declarada)',
  },
  {
    tipo: 'Elevador de alcalinidade',
    marca: 'Genco',
    concentracao: 99,
    fonte: 'Fichas técnicas HTH, Genco e Suall (pureza próxima de 100%; ver aviso de dosagem declarada)',
  },
  {
    tipo: 'Elevador de alcalinidade',
    marca: 'Suall',
    concentracao: 99,
    fonte: 'Fichas técnicas HTH, Genco e Suall (pureza próxima de 100%; ver aviso de dosagem declarada)',
  },
];

// Módulos novos (Dureza, Cianúrico, Sal) não têm pesquisa de FISPQ por marca — ver seção 2 da
// especificação — mas precisam de um produto genérico pré-cadastrado para que a Calculadora de
// Sal e o Diagnóstico Cruzado funquem prontos para uso assim que o app abre pela primeira vez,
// em vez de exigir cadastro manual antes de qualquer cálculo nesses módulos.
const GENERICOS_SEM_FISPQ = [
  {
    tipo: 'Aumentador de Dureza Cálcica', nomeComercial: 'Cloreto de Cálcio Granulado',
    concentracao: 90, preco: 16.0,
    fonte: 'Referência geral de mercado (77–95% de pureza) — confirmar no rótulo',
  },
  {
    tipo: 'Estabilizante (Ácido Cianúrico)', nomeComercial: 'Ácido Cianúrico Estabilizante',
    concentracao: 99, preco: 34.0,
    fonte: 'Referência geral (pureza próxima de 99%) — confirmar no rótulo',
  },
  {
    tipo: 'Sal para Piscina', nomeComercial: 'Sal para Piscina Salina',
    concentracao: 99, preco: 2.6,
    fonte: 'Referência geral (pureza próxima de 99%) — confirmar no rótulo. Nunca use sal de cozinha iodado ou com antiumectantes não recomendados para o gerador.',
  },
];

function buscarReferencia(tipo, marca) {
  return CONCENTRACOES_REFERENCIA.find(
    (r) => r.tipo === tipo && r.marca.toLowerCase() === String(marca || '').toLowerCase()
  ) || null;
}

// Nome comercial de exibição para cada produto pré-cadastrado (ver DEFAULT_PRODUTOS abaixo).
const NOMES_COMERCIAIS = {
  'Elevador de pH|Montreal': 'Barrilha Leve Montreal',
  'Elevador de pH|Maresias': 'Barrilha Leve Maresias',
  'Clorante granulado|HTH': 'Cloro Granulado HTH',
  'Clorante granulado|HidroAll': 'Cloro Granulado HidroAll',
  'Clorante granulado|Hidroazul': 'Cloro Granulado Premium Hidroazul',
  'Clorante em pastilha|Genco': 'Tablete Tricloro Genco 3x1',
  'Clorante em pastilha|Genclor': 'Tablete Tricloro Genclor 3x1',
  'Clorante em pastilha|HTH': 'HTH Pace Tricloro',
  'Clorante líquido|CSM': 'Hipoclorito de Sódio CSM',
  'Clorante líquido|E-Química': 'Hipoclorito de Sódio E-Química',
  'Redutor de pH (líquido)|Ácido muriático avulso': 'Ácido Muriático Avulso',
  'Elevador de alcalinidade|HTH': 'Elevador de Alcalinidade HTH',
  'Elevador de alcalinidade|Genco': 'Elevador de Alcalinidade Genco',
  'Elevador de alcalinidade|Suall': 'Elevador de Alcalinidade Suall',
};

// Densidade de referência dos produtos líquidos padrão — sem isso, a dose calculada de um
// líquido não pode ser convertida de kg para litros, e a interface fica presa mostrando o aviso
// de "densidade não cadastrada" mesmo para os produtos pré-cadastrados pelo próprio app.
const DENSIDADE_PADRAO = {
  'Redutor de pH (líquido)': 1.15,
  'Clorante líquido': 1.2,
};

// Lista de produtos já prontos para uso, com as concentrações confirmadas na pesquisa de
// FISPQ (mesmos dados de CONCENTRACOES_REFERENCIA). Fica salva permanentemente assim que o
// app roda pela primeira vez em um navegador — ver Storage.garantirProdutosPadrao().
const DEFAULT_PRODUTOS = CONCENTRACOES_REFERENCIA.map((ref) => {
  const template = TEMPLATES_PRODUTO.find((t) => t.tipo === ref.tipo);
  return {
    id: `padrao-${ref.tipo}-${ref.marca}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    tipo: ref.tipo,
    nomeComercial: NOMES_COMERCIAIS[`${ref.tipo}|${ref.marca}`] || `${ref.marca} — ${ref.tipo}`,
    marca: ref.marca,
    principioAtivo: template ? template.principioAtivo : '',
    concentracao: ref.concentracao,
    estadoFisico: template && template.estadoFisico === 'liquido' ? 'liquido' : 'solido',
    densidade: DENSIDADE_PADRAO[ref.tipo] || null,
    fonte: ref.fonte,
  };
}).concat(GENERICOS_SEM_FISPQ.map((g) => {
  const template = TEMPLATES_PRODUTO.find((t) => t.tipo === g.tipo);
  return {
    id: `padrao-${g.tipo}-generico`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    tipo: g.tipo,
    nomeComercial: g.nomeComercial,
    marca: 'Genérico',
    principioAtivo: template ? template.principioAtivo : '',
    concentracao: g.concentracao,
    estadoFisico: template && template.estadoFisico === 'liquido' ? 'liquido' : 'solido',
    densidade: null,
    preco: g.preco,
    fonte: g.fonte,
  };
}));

if (typeof module !== 'undefined') {
  module.exports = { TEMPLATES_PRODUTO, CONCENTRACOES_REFERENCIA, GENERICOS_SEM_FISPQ, DEFAULT_PRODUTOS, buscarReferencia };
}
