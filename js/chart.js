// Gráficos (SVG), sem dependências externas.
// - renderGraficoBarras: usado no relatório de custos, gasto por mês (manipula o DOM direto).
// - pontosEvolucao/resumoEvolucao/svgGraficoLinha: usados na aba Evolução do Histórico, pra
//   mostrar como um parâmetro (pH, cloro, etc.) mudou ao longo do tempo numa piscina. Ao
//   contrário do gráfico de barras, essas devolvem string (svgGraficoLinha) ou dado puro
//   (pontosEvolucao/resumoEvolucao) — seguem o mesmo padrão do resto do app.js (monta HTML/SVG
//   como texto, o "cálculo" fica separado da montagem visual).

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

/* ── evolução (linha do tempo de um parâmetro numa piscina) ─────────────────── */

// registros = historico de UMA piscina (já filtrado pelo período escolhido), ordenado por
// data. faixa = {min, max} efetiva do parâmetro (a de PARAMETROS, ou a customizada da piscina
// no caso do Sal — ver faixaSalDe() em app.js). Devolve só os pontos onde o parâmetro foi
// realmente medido — nem toda visita mede todos os parâmetros.
function pontosEvolucao(registros, parametroId, faixa) {
  return registros
    .filter((r) => r.leituras[parametroId] != null)
    .map((r) => {
      const y = Number(r.leituras[parametroId]);
      return { x: new Date(r.data).getTime(), y, data: r.data, dentro: classificar(y, faixa.min, faixa.max) === 'adequado' };
    });
}

// Tendência: só faz sentido opinar quando há pelo menos uma leitura fora da faixa no período
// (senão é sempre "estável", não tem o que "melhorar"). Compara a proporção de leituras fora
// da faixa na primeira metade do período contra a segunda metade — caiu, "melhorando"; ficou
// igual ou piorou (inclusive uma única leitura fora, sem segunda metade pra comparar — dado
// insuficiente pra dizer que já melhorou), "recorrente".
function resumoEvolucao(pontos) {
  if (!pontos.length) return null;
  const total = pontos.length;
  const fora = pontos.filter((p) => !p.dentro).length;
  let tendencia = 'estavel';
  if (fora > 0) {
    const meio = Math.ceil(total / 2);
    const primeira = pontos.slice(0, meio);
    const segunda = pontos.slice(meio);
    const propFora = (lista) => lista.filter((p) => !p.dentro).length / lista.length;
    const forPrimeira = propFora(primeira);
    const forSegunda = segunda.length ? propFora(segunda) : forPrimeira;
    tendencia = forSegunda < forPrimeira ? 'melhorando' : 'recorrente';
  }
  return { total, dentro: total - fora, fora, tendencia };
}

// pontos = [{x: timestamp_ms, y: valor, dentro: bool}, ...] ordenados por x (pontosEvolucao).
// faixa = {min, max} — desenhada como uma faixa sombreada de fundo, pra ver de relance quando
// a leitura estava dentro ou fora. formatarValor(n) formata o rótulo do eixo Y (numFmt, etc).
function svgGraficoLinha(pontos, faixa, formatarValor) {
  const larguraTotal = 320, alturaTotal = 130;
  const margem = { topo: 10, baixo: 8, esquerda: 34, direita: 8 };
  const larguraGrafico = larguraTotal - margem.esquerda - margem.direita;
  const alturaGrafico = alturaTotal - margem.topo - margem.baixo;

  const valores = pontos.map((p) => p.y).concat([faixa.min, faixa.max]);
  const yMin = Math.min(...valores), yMax = Math.max(...valores);
  const folga = (yMax - yMin) * 0.12 || 1;
  const escalaMin = yMin - folga, escalaMax = yMax + folga;

  const xs = pontos.map((p) => p.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const largeuraX = xMax - xMin || 1;

  const escalaY = (v) => margem.topo + alturaGrafico - ((v - escalaMin) / (escalaMax - escalaMin)) * alturaGrafico;
  const escalaX = (x) => margem.esquerda + ((x - xMin) / largeuraX) * larguraGrafico;

  const faixaTopo = escalaY(faixa.max), faixaBaixo = escalaY(faixa.min);
  const pontosStr = pontos.map((p) => `${escalaX(p.x)},${escalaY(p.y)}`).join(' ');
  const circulos = pontos.map((p) => {
    const cor = p.dentro ? 'var(--color-accent)' : 'var(--warn-400)';
    return `<circle cx="${escalaX(p.x)}" cy="${escalaY(p.y)}" r="${pontos.length > 1 ? 3 : 4}" fill="${cor}"></circle>`;
  }).join('');

  const rotuloTopo = formatarValor(escalaMax);
  const rotuloBaixo = formatarValor(escalaMin);
  const linhaUnica = pontos.length === 1
    ? `<line x1="${margem.esquerda}" y1="${escalaY(pontos[0].y)}" x2="${larguraTotal - margem.direita}" y2="${escalaY(pontos[0].y)}" stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="3,3"></line>`
    : '';

  return `<svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" class="evol-svg" role="img" aria-label="Evolução: ${pontos.map((p) => formatarValor(p.y)).join(', ')}">
    <rect x="${margem.esquerda}" y="${faixaTopo}" width="${larguraGrafico}" height="${Math.max(0, faixaBaixo - faixaTopo)}" fill="color-mix(in srgb, var(--color-accent) 18%, transparent)"></rect>
    <text x="2" y="${margem.topo + 8}" font-size="9" fill="rgba(var(--color-text-rgb),.45)">${rotuloTopo}</text>
    <text x="2" y="${alturaTotal - margem.baixo}" font-size="9" fill="rgba(var(--color-text-rgb),.45)">${rotuloBaixo}</text>
    ${linhaUnica}
    ${pontos.length > 1 ? `<polyline points="${pontosStr}" fill="none" stroke="var(--color-accent)" stroke-width="2"></polyline>` : ''}
    ${circulos}
  </svg>`;
}
