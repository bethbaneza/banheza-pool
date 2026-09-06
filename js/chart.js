// Gráfico de barras simples (SVG), usado no relatório de custos para mostrar o gasto por mês.
// Sem dependências externas — segue as especificações de marca (barra fina, topo arredondado,
// grade discreta, tooltip por barra) descritas no guia de visualização de dados.

const GRAFICO = {
  corBarra: '#0a6ea8',
  corBarraHover: '#084d75',
  corGrade: '#e1e0d9',
  corEixo: '#898781',
  corTexto: '#1f2d33',
  larguraMaxBarra: 24,
};

function escalaAgradavel(valorMaximo) {
  if (!(valorMaximo > 0)) return { max: 10, passo: 2.5, divisoes: 4 };
  const passoBruto = valorMaximo / 4;
  const potencia = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const candidatos = [1, 2, 5, 10].map((c) => c * potencia);
  const passo = candidatos.find((c) => c >= passoBruto) || candidatos[candidatos.length - 1];
  const divisoes = Math.ceil(valorMaximo / passo);
  return { max: divisoes * passo, passo, divisoes };
}

function caminhoBarraArredondada(x, y, largura, altura, raio) {
  const r = Math.min(raio, largura / 2, Math.max(altura, 0));
  if (altura <= 0) return '';
  if (r <= 0) return `M${x},${y} h${largura} v${altura} h${-largura} Z`;
  return [
    `M${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + largura - r},${y}`,
    `Q${x + largura},${y} ${x + largura},${y + r}`,
    `L${x + largura},${y + altura}`,
    `L${x},${y + altura}`,
    'Z',
  ].join(' ');
}

// pontos = [{ rotulo: 'setembro de 2026', valor: 62.0 }, ...] já ordenados cronologicamente.
// formatarValor(valor) -> texto exibido no eixo/rótulos/tooltip (ex: formatarMoeda).
function renderGraficoBarras(container, pontos, formatarValor) {
  container.innerHTML = '';
  if (pontos.length === 0) return;

  const larguraTotal = 640;
  const alturaTotal = 260;
  const margem = { topo: 16, baixo: 42, esquerda: 16, direita: 16 };
  const larguraGrafico = larguraTotal - margem.esquerda - margem.direita;
  const alturaGrafico = alturaTotal - margem.topo - margem.baixo;

  const valorMaximo = Math.max(...pontos.map((p) => p.valor));
  const { max: escalaMax, passo, divisoes } = escalaAgradavel(valorMaximo);

  const wrapper = document.createElement('div');
  wrapper.className = 'grafico-wrapper';

  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${larguraTotal} ${alturaTotal}`);
  svg.setAttribute('class', 'grafico-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Gráfico de barras: ' + pontos.map((p) => `${p.rotulo}: ${formatarValor(p.valor)}`).join(', '));

  function escalaY(valor) {
    return margem.topo + alturaGrafico - (valor / escalaMax) * alturaGrafico;
  }

  // Grade horizontal (hairline, recessiva) + rótulos do eixo Y
  for (let i = 0; i <= divisoes; i++) {
    const valor = i * passo;
    const y = escalaY(valor);
    const linha = document.createElementNS(svgns, 'line');
    linha.setAttribute('x1', margem.esquerda);
    linha.setAttribute('x2', larguraTotal - margem.direita);
    linha.setAttribute('y1', y);
    linha.setAttribute('y2', y);
    linha.setAttribute('stroke', GRAFICO.corGrade);
    linha.setAttribute('stroke-width', '1');
    svg.appendChild(linha);

    const rotuloY = document.createElementNS(svgns, 'text');
    rotuloY.setAttribute('x', margem.esquerda);
    rotuloY.setAttribute('y', y - 4);
    rotuloY.setAttribute('font-size', '10');
    rotuloY.setAttribute('fill', GRAFICO.corEixo);
    rotuloY.textContent = formatarValor(valor);
    svg.appendChild(rotuloY);
  }

  const larguraFaixa = larguraGrafico / pontos.length;
  const larguraBarra = Math.max(4, Math.min(GRAFICO.larguraMaxBarra, larguraFaixa - 8));

  const tooltip = document.createElement('div');
  tooltip.className = 'grafico-tooltip oculto';
  wrapper.appendChild(tooltip);

  pontos.forEach((ponto, i) => {
    const centroFaixa = margem.esquerda + larguraFaixa * i + larguraFaixa / 2;
    const x = centroFaixa - larguraBarra / 2;
    const yTopo = escalaY(ponto.valor);
    const altura = margem.topo + alturaGrafico - yTopo;

    const grupo = document.createElementNS(svgns, 'g');
    grupo.setAttribute('tabindex', '0');
    grupo.setAttribute('class', 'grafico-barra-grupo');

    // Área de toque maior que a barra (hit target), invisível.
    const areaToque = document.createElementNS(svgns, 'rect');
    areaToque.setAttribute('x', centroFaixa - larguraFaixa / 2);
    areaToque.setAttribute('y', margem.topo);
    areaToque.setAttribute('width', larguraFaixa);
    areaToque.setAttribute('height', alturaGrafico);
    areaToque.setAttribute('fill', 'transparent');
    grupo.appendChild(areaToque);

    const barra = document.createElementNS(svgns, 'path');
    barra.setAttribute('d', caminhoBarraArredondada(x, yTopo, larguraBarra, altura, 4));
    barra.setAttribute('fill', GRAFICO.corBarra);
    barra.setAttribute('class', 'grafico-barra');
    grupo.appendChild(barra);

    const rotuloX = document.createElementNS(svgns, 'text');
    rotuloX.setAttribute('x', centroFaixa);
    rotuloX.setAttribute('y', alturaTotal - margem.baixo + 16);
    rotuloX.setAttribute('font-size', '10');
    rotuloX.setAttribute('fill', GRAFICO.corEixo);
    rotuloX.setAttribute('text-anchor', 'middle');
    rotuloX.textContent = ponto.rotulo;
    svg.appendChild(rotuloX);

    function mostrarTooltip() {
      barra.setAttribute('fill', GRAFICO.corBarraHover);
      tooltip.classList.remove('oculto');
      tooltip.innerHTML = `<strong>${formatarValor(ponto.valor)}</strong><span>${ponto.rotulo}</span>`;
      const percentualX = (centroFaixa / larguraTotal) * 100;
      tooltip.style.left = `${percentualX}%`;
      tooltip.style.top = `${(yTopo / alturaTotal) * 100}%`;
    }
    function esconderTooltip() {
      barra.setAttribute('fill', GRAFICO.corBarra);
      tooltip.classList.add('oculto');
    }
    grupo.addEventListener('pointerenter', mostrarTooltip);
    grupo.addEventListener('pointerleave', esconderTooltip);
    grupo.addEventListener('focus', mostrarTooltip);
    grupo.addEventListener('blur', esconderTooltip);

    svg.appendChild(grupo);
  });

  wrapper.appendChild(svg);
  container.appendChild(wrapper);
}
