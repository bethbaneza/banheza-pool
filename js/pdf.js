// Geração do relatório de diagnóstico em PDF, usando jsPDF (carregado via CDN no index.html).

function formatarNumero(n, casas = 3) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function textoPasso(passo) {
  const avisos = (passo.avisos || []).map((a) => `Atenção: ${a}`);
  const limite = passo.limitesSeguranca ? [`Limite de segurança: ${passo.limitesSeguranca}`] : [];

  if (passo.status === 'adequado') {
    return [`${passo.nome}: adequado — leitura ${passo.valor}`, ...avisos];
  }
  if (passo.instrucaoOperacional) {
    return [
      `${passo.nome}: ${passo.rotuloStatus} — leitura ${passo.valor}`,
      `Motivo provável: ${passo.motivo}`,
      `O que fazer: ${passo.instrucaoOperacional}`,
      ...limite,
    ];
  }
  if (passo.instrucaoGeradorSalino) {
    return [
      `${passo.nome}: ${passo.rotuloStatus} (${passo.direcao === 'subir' ? 'subir' : 'descer'}) — leitura ${passo.valor}, meta ${passo.meta}`,
      `Motivo provável: ${passo.motivo}`,
      `O que fazer: ${passo.instrucaoGeradorSalino}`,
      `Aguardar: ${passo.tempoEsperaHoras}h de circulação. ${passo.instrucaoRemedicao}`,
      ...limite,
      ...avisos,
    ];
  }
  const doseTxt = passo.dose
    ? `${formatarNumero(passo.dose.valor)} ${passo.dose.unidade} de ${passo.produto}` +
      (passo.dose.densidadeAusente ? ' [ATENÇÃO: produto líquido sem densidade cadastrada — valor em kg, não em litros]' : '')
    : 'nenhum produto selecionado para calcular a dose';
  return [
    `${passo.nome}: ${passo.rotuloStatus} (${passo.direcao === 'subir' ? 'subir' : 'descer'}) — leitura ${passo.valor}, meta ${passo.meta}`,
    `Motivo provável: ${passo.motivo}`,
    `Dose calculada: ${doseTxt}`,
    `Aguardar: ${passo.tempoEsperaHoras}h de circulação. ${passo.instrucaoRemedicao}`,
    ...limite,
    ...avisos,
  ];
}

// piscina = registro salvo (Storage.listarPiscinas()); registro = { data, leituras, passos }
function gerarPdfDiagnostico(piscina, registro) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão com a internet e tente novamente.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt' });
  const margemEsquerda = 48;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = 56;

  function novaLinha(altura = 16) {
    y += altura;
    if (y > alturaPagina - 56) {
      doc.addPage();
      y = 56;
    }
  }

  function escrever(texto, { tamanho = 11, negrito = false } = {}) {
    doc.setFontSize(tamanho);
    doc.setFont(undefined, negrito ? 'bold' : 'normal');
    const linhas = doc.splitTextToSize(texto, larguraUtil);
    linhas.forEach((linha) => {
      doc.text(linha, margemEsquerda, y);
      novaLinha(tamanho + 6);
    });
  }

  escrever('Relatório de Diagnóstico — Calculadora e Assistente de Piscinas', { tamanho: 15, negrito: true });
  novaLinha(4);
  escrever(`Piscina: ${piscina.nome} (${Math.round(piscina.litros).toLocaleString('pt-BR')} L)`, { negrito: true });
  escrever(`Data: ${new Date(registro.data).toLocaleString('pt-BR')}`);
  novaLinha(8);

  const l = registro.leituras;
  escrever('Leituras informadas', { tamanho: 12, negrito: true });
  // Nem todo diagnóstico preenche os mesmos parâmetros (o diagnóstico cruzado aceita qualquer
  // subconjunto) — lista só os que têm leitura, em vez de assumir Alcalinidade/pH/Cloro fixos.
  const leiturasTexto = [
    l.alcalinidade != null && `Alcalinidade Total: ${l.alcalinidade} ppm`,
    l.ph != null && `pH: ${l.ph}`,
    l.cloro != null && `Cloro Livre: ${l.cloro} ppm`,
    l.dureza != null && `Dureza Cálcica: ${l.dureza} ppm`,
    l.cianurico != null && `Ácido Cianúrico: ${l.cianurico} ppm`,
    l.sal != null && `Sal: ${l.sal} ppm`,
    l.temperatura != null && `Temperatura: ${l.temperatura}°C`,
  ].filter(Boolean);
  escrever(leiturasTexto.length ? leiturasTexto.join('   |   ') : 'Nenhuma leitura informada.');
  novaLinha(8);

  escrever('Diagnóstico', { tamanho: 12, negrito: true });
  registro.passos.forEach((passo, i) => {
    novaLinha(4);
    const linhas = textoPasso(passo);
    escrever(`${i + 1}. ${linhas[0]}`, { negrito: true });
    linhas.slice(1).forEach((linha) => escrever(linha));
  });

  novaLinha(12);
  escrever(
    'Aviso: as fórmulas de dosagem são regras gerais de referência. A aplicação final deve sempre seguir a ' +
      'concentração real do produto cadastrado, e devem ser revisadas por um técnico/químico responsável antes ' +
      'do uso em ambiente coletivo.',
    { tamanho: 9 }
  );

  const dataArquivo = new Date(registro.data).toISOString().slice(0, 10);
  const nomeArquivo = `diagnostico-${piscina.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dataArquivo}.pdf`;
  doc.save(nomeArquivo);
}
