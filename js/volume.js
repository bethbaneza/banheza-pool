// Módulo 1 — Cadastro de Piscina (Cálculo de Litragem)
// Funções puras: não tocam no DOM nem no localStorage, para poderem ser testadas isoladamente.

function toMetros(valor, unidade) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  return unidade === 'cm' ? n / 100 : n;
}

function profundidadeMediaMetros({ modo, unidade, unica, minima, maxima }) {
  if (modo === 'unica') {
    return toMetros(unica, unidade);
  }
  const min = toMetros(minima, unidade);
  const max = toMetros(maxima, unidade);
  if (min === null || max === null) return null;
  return (min + max) / 2;
}

// Cada "forma" retorna a área em m². profundidade é aplicada depois, uma única vez,
// para o caso de piscina composta (soma de áreas × profundidade média).
function areaForma(forma) {
  const { tipo, unidade } = forma;
  if (tipo === 'retangular') {
    const c = toMetros(forma.comprimento, unidade);
    const l = toMetros(forma.largura, unidade);
    if (c === null || l === null) return null;
    return c * l;
  }
  if (tipo === 'circular') {
    const d = toMetros(forma.diametro, unidade);
    if (d === null) return null;
    const r = d / 2;
    return Math.PI * r * r;
  }
  if (tipo === 'oval') {
    const c = toMetros(forma.comprimento, unidade);
    const l = toMetros(forma.largura, unidade);
    if (c === null || l === null) return null;
    return Math.PI * (c / 2) * (l / 2);
  }
  return null;
}

// piscina = { formas: [forma, ...], profundidade: {...} }
// Cobre Retangular/Circular/Oval (1 forma) e Composta/Irregular por composição (N formas).
function calcularLitragem(piscina) {
  const profMedia = profundidadeMediaMetros(piscina.profundidade);
  if (profMedia === null || profMedia <= 0) {
    return { ok: false, erro: 'Profundidade inválida.' };
  }
  if (!Array.isArray(piscina.formas) || piscina.formas.length === 0) {
    return { ok: false, erro: 'Informe ao menos uma forma.' };
  }
  let areaTotal = 0;
  for (const forma of piscina.formas) {
    const area = areaForma(forma);
    if (area === null || area <= 0) {
      return { ok: false, erro: `Medidas inválidas na forma "${forma.tipo}".` };
    }
    areaTotal += area;
  }
  const volumeM3 = areaTotal * profMedia;
  const litros = volumeM3 * 1000;
  return { ok: true, litros, aproximado: piscina.formas.length > 1 };
}

if (typeof module !== 'undefined') {
  module.exports = { toMetros, profundidadeMediaMetros, areaForma, calcularLitragem };
}
