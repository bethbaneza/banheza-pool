// Geração do relatório de diagnóstico em PDF, usando jsPDF (carregado via CDN no index.html).
// Os campos de texto do "passo" (nome, motivo, limitesSeguranca, instrucaoOperacional,
// instrucaoGeradorSalino, rotuloStatus, avisos) são chaves de tradução (ver diagnostics.js e
// js/i18n.js) — por isso passam por t() aqui, no idioma que estiver ativo no momento do download.

function formatarNumero(n, casas = 3) {
  return Number(n).toLocaleString(numLocale(), { maximumFractionDigits: casas });
}

function textoPasso(passo) {
  const avisos = (passo.avisos || []).map((a) => t('pdf.atencao', { aviso: t(a) }));
  const limite = passo.limitesSeguranca ? [t('pdf.limiteSeguranca', { limite: t(passo.limitesSeguranca) })] : [];

  if (passo.status === 'adequado') {
    return [`${t(passo.nome)}: ${t('pdf.adequadoLeitura', { valor: passo.valor })}`, ...avisos];
  }
  if (passo.instrucaoOperacional) {
    return [
      `${t(passo.nome)}: ${t(passo.rotuloStatus)} — ${t('pdf.leitura', { valor: passo.valor })}`,
      t('pdf.motivoProvavel', { motivo: t(passo.motivo) }),
      t('pdf.oQueFazer', { instrucao: t(passo.instrucaoOperacional) }),
      ...limite,
    ];
  }
  if (passo.instrucaoGeradorSalino) {
    return [
      `${t(passo.nome)}: ${t(passo.rotuloStatus)} (${t(passo.direcao === 'subir' ? 'direcao.subir' : 'direcao.descer')}) — ${t('pdf.leitura', { valor: passo.valor })}, ${t('pdf.meta', { meta: passo.meta })}`,
      t('pdf.motivoProvavel', { motivo: t(passo.motivo) }),
      t('pdf.oQueFazer', { instrucao: t(passo.instrucaoGeradorSalino) }),
      t('pdf.aguardar', { tempo: passo.tempoEsperaHoras + 'h', instrucao: t(passo.instrucaoRemedicao) }),
      ...limite,
      ...avisos,
    ];
  }
  const doseTxt = passo.dose
    ? t('pdf.doseTexto', { valor: formatarNumero(passo.dose.valor), unidade: passo.dose.unidade, produto: passo.produto }) +
      (passo.dose.densidadeAusente ? t('pdf.densidadeAusente') : '')
    : t('pdf.nenhumProduto');
  return [
    `${t(passo.nome)}: ${t(passo.rotuloStatus)} (${t(passo.direcao === 'subir' ? 'direcao.subir' : 'direcao.descer')}) — ${t('pdf.leitura', { valor: passo.valor })}, ${t('pdf.meta', { meta: passo.meta })}`,
    t('pdf.motivoProvavel', { motivo: t(passo.motivo) }),
    t('pdf.doseCalculada', { dose: doseTxt }),
    t('pdf.aguardar', { tempo: passo.tempoEsperaHoras + 'h', instrucao: t(passo.instrucaoRemedicao) }),
    ...limite,
    ...avisos,
  ];
}

// piscina = registro salvo (Storage.listarPiscinas()); registro = { data, leituras, passos }
function gerarPdfDiagnostico(piscina, registro) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert(t('pdf.erroCarregar'));
    return;
  }
  const localePdf = numLocale();
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

  escrever(t('pdf.tituloRelatorio'), { tamanho: 15, negrito: true });
  novaLinha(4);
  escrever(`${t('pdf.piscina')}: ${piscina.nome} (${Math.round(piscina.litros).toLocaleString(localePdf)} L)`, { negrito: true });
  escrever(`${t('pdf.data')}: ${new Date(registro.data).toLocaleString(localePdf)}`);
  novaLinha(8);

  const l = registro.leituras;
  escrever(t('pdf.leiturasInformadas'), { tamanho: 12, negrito: true });
  // Nem todo diagnóstico preenche os mesmos parâmetros (o diagnóstico cruzado aceita qualquer
  // subconjunto) — lista todos os parâmetros aplicáveis a esta piscina (PARAMETROS, de
  // diagnostics.js), marcando explicitamente como "Não informado" quem não tem leitura, em vez
  // de simplesmente omitir a linha (o que parecia um esquecimento no relatório final).
  const sistemaDesinfeccao = ['salino', 'ozonio'].includes(piscina.sistemaDesinfeccao) ? piscina.sistemaDesinfeccao : 'manual';
  const leiturasTexto = PARAMETROS
    .filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao)
    .map((p) => {
      const v = l[p.id];
      return v != null ? `${t(p.nome)}: ${v}${p.unidade ? ' ' + p.unidade : ''}` : `${t(p.nome)}: ${t('pdf.naoInformado')}`;
    });
  escrever(leiturasTexto.join('   |   '));
  novaLinha(8);

  escrever(t('pdf.diagnostico'), { tamanho: 12, negrito: true });
  registro.passos.forEach((passo, i) => {
    novaLinha(4);
    const linhas = textoPasso(passo);
    escrever(`${i + 1}. ${linhas[0]}`, { negrito: true });
    linhas.slice(1).forEach((linha) => escrever(linha));
  });

  novaLinha(12);
  escrever(t('pdf.aviso'), { tamanho: 9 });

  const dataArquivo = new Date(registro.data).toISOString().slice(0, 10);
  const nomeArquivo = `diagnostico-${piscina.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dataArquivo}.pdf`;
  doc.save(nomeArquivo);
}

// Relatório técnico mensal — gerado só a partir dos registros já salvos (nenhum número
// redigitado pelo usuário). cliente pode ser null; mesChave = 'YYYY-MM'; registros = histórico
// da piscina naquele mês, ordenado por data crescente (ver registrosDoMes() em app.js).
function gerarRelatorioMensal(cliente, piscina, mesChave, registros) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert(t('pdf.erroCarregar'));
    return;
  }
  const localePdf = numLocale();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt' });
  const margemEsquerda = 48;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = 56;

  function novaLinha(altura = 16) {
    y += altura;
    if (y > alturaPagina - 56) { doc.addPage(); y = 56; }
  }
  function escrever(texto, { tamanho = 11, negrito = false } = {}) {
    doc.setFontSize(tamanho);
    doc.setFont(undefined, negrito ? 'bold' : 'normal');
    const linhas = doc.splitTextToSize(texto, larguraUtil);
    linhas.forEach((linha) => { doc.text(linha, margemEsquerda, y); novaLinha(tamanho + 6); });
  }

  const rotuloDoMes = rotuloMes(mesChave);
  const parametrosComDados = parametrosComDadosDe(piscina, registros);
  const ocorrencias = ocorrenciasDe(registros);

  escrever(t('relatorio.titulo'), { tamanho: 15, negrito: true });
  novaLinha(4);
  escrever(`${t('pdf.cliente')}: ${cliente ? cliente.nome : '—'}`, { negrito: true });
  escrever(`${t('pdf.piscina')}: ${piscina.nome} (${Math.round(piscina.litros).toLocaleString(localePdf)} L)`);
  escrever(`${t('evolucao.periodo')}: ${rotuloDoMes}`);
  novaLinha(8);

  escrever(t('relatorio.atividade'), { tamanho: 12, negrito: true });
  escrever(t('relatorio.medicoesRegistradas', { n: registros.length }));
  novaLinha(8);

  escrever(t('relatorio.parametrosMonitorados'), { tamanho: 12, negrito: true });
  escrever(parametrosComDados.length ? parametrosComDados.map((x) => t(x.parametro.nome)).join(', ') : t('relatorio.semParametros'));
  novaLinha(8);

  escrever(t('relatorio.faixas'), { tamanho: 12, negrito: true });
  if (parametrosComDados.length) {
    parametrosComDados.forEach((x) => {
      const pct = Math.round((x.resumo.dentro / x.resumo.total) * 100);
      escrever(`${t(x.parametro.nome)}: ${t('relatorio.dentroDeTotalPct', { dentro: x.resumo.dentro, total: x.resumo.total, pct })}`);
    });
  } else {
    escrever(t('relatorio.semParametros'));
  }
  novaLinha(8);

  escrever(t('historico.abaEvolucao'), { tamanho: 12, negrito: true });
  if (parametrosComDados.length) {
    parametrosComDados.forEach((x) => {
      const stats = estatisticasPontos(x.pontos);
      escrever(t('relatorio.evolucaoLinha', {
        parametro: t(x.parametro.nome),
        min: formatarNumero(stats.min, 2), max: formatarNumero(stats.max, 2), media: formatarNumero(stats.media, 2),
        unidade: x.parametro.unidade ? ' ' + x.parametro.unidade : '',
        tendencia: t(ROTULO_TENDENCIA[x.resumo.tendencia]),
      }));
    });
  } else {
    escrever(t('relatorio.semParametros'));
  }
  novaLinha(8);

  escrever(t('relatorio.ocorrencias'), { tamanho: 12, negrito: true });
  if (ocorrencias.length) {
    ocorrencias.forEach((o) => {
      escrever(`${new Date(o.data).toLocaleDateString(localePdf)} — ${t(o.passo.nome)}: ${t(o.passo.rotuloStatus)} (${numFmt(o.passo.valor)})`);
    });
  } else {
    escrever(t('relatorio.semOcorrencias'));
  }
  novaLinha(8);

  escrever(t('relatorio.resumoTecnico'), { tamanho: 12, negrito: true });
  const parametrosComOcorrencia = [...new Set(ocorrencias.map((o) => t(o.passo.nome)))];
  escrever(ocorrencias.length
    ? t('relatorio.resumoComOcorrencias', { n: registros.length, mes: rotuloDoMes, lista: parametrosComOcorrencia.join(', ') })
    : t('relatorio.resumoSemOcorrencias', { n: registros.length, mes: rotuloDoMes }));

  novaLinha(12);
  escrever(t('pdf.aviso'), { tamanho: 9 });

  const nomeArquivo = `relatorio-mensal-${piscina.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${mesChave}.pdf`;
  doc.save(nomeArquivo);
}
