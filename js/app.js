// Banheza Pool — liga a interface (tema Nocturne) aos módulos puros (volume, produtos,
// diagnóstico) e ao Supabase (js/db.js: autenticação + dados). Mesmo padrão de
// renderização do calculadora-piscinas: cada mudança de estado reconstrói o HTML da tela
// atual a partir do zero, eventos por delegação via `data-action` em `document` — só que
// agora as ações que mexem em dados são assíncronas (`await DB.*`).

const TIPOS_POR_DIRECAO = {
  alcalinidade: { subir: ['Elevador de alcalinidade'], descer: ['Redutor de pH', 'Redutor de pH (líquido)'] },
  ph: { subir: ['Elevador de pH'], descer: ['Redutor de pH', 'Redutor de pH (líquido)'] },
  dureza: { subir: ['Aumentador de Dureza Cálcica'], descer: [] },
  cianurico: { subir: ['Estabilizante (Ácido Cianúrico)'], descer: [] },
  sal: { subir: ['Sal para Piscina'], descer: [] },
  cloro: { subir: ['Clorante granulado', 'Clorante em pastilha', 'Clorante líquido'], descer: [] },
};

// Valores são chaves de tradução (js/i18n.js), não o texto final — ver nota em diagnostics.js.
const SEM_PRODUTO_TEXTO = {
  alcalinidade: 'semProduto.alcalinidade',
  ph: 'semProduto.ph',
  dureza: 'semProduto.dureza',
  cianurico: 'semProduto.cianurico',
  sal: 'semProduto.sal',
  cloro: 'semProduto.cloro',
};

/* ── formatação ──────────────────────────────────────────────────────────── */
// Separador decimal e agrupamento seguem o idioma da interface (vírgula em PT/ES, ponto em
// EN) — só a moeda continua sempre em Reais (moeda(), abaixo): é um app para o mercado
// brasileiro, o preço real cadastrado pelo piscineiro é em R$ independente do idioma da tela.

function numLocale() { return idioma === 'pt' ? 'pt-BR' : idioma === 'es' ? 'es-ES' : 'en-US'; }
function nf(n, casas) { return Number(n).toLocaleString(numLocale(), { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
function numFmt(n) { return Number(n).toLocaleString(numLocale(), { maximumFractionDigits: 2 }); }
function pctFmt(n) { return Number(n).toLocaleString(numLocale(), { maximumFractionDigits: 1 }) + '%'; }
function dose3Fmt(n) { return nf(n, 3); }
function moeda(n) { return Number(n).toLocaleString(numLocale(), { style: 'currency', currency: 'BRL' }); }
function dataHoraFmt(iso) {
  return new Date(iso).toLocaleString(numLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// dataStr = 'YYYY-MM-DD' (sem hora) — usado pra próxima visita agendada
function dataFmt(dataStr) {
  return new Date(dataStr + 'T00:00:00').toLocaleDateString(numLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatHoras(h) {
  if (h < 1) return Math.round(h * 60) + ' min';
  return (Number.isInteger(h) ? h : nf(h, 1)) + ' h';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Lockup da marca (símbolo "B" + BANHEZA/POOL) — ver .brand-symbol/.brand-lockup em
// style.css para o dimensionamento por contexto (nav-top, mobile-header, auth-brand).
function renderBrandLockup() {
  return `
    <img class="brand-symbol" src="assets/brand/symbol-b.png" alt="" />
    <span class="brand-lockup"><span class="brand-wordmark">BANHEZA</span><span class="brand-product">POOL</span></span>`;
}
function produtosDe(produtos, tipos) { return produtos.filter((p) => tipos.indexOf(p.tipo) >= 0); }
function produtoPorId(produtos, id) { return id ? produtos.find((p) => p.id === id) || null : null; }
function pos(x, span) { return Math.max(0, Math.min(100, ((x - span.min) / (span.max - span.min)) * 100)); }

function faixaSalDe(pool) {
  const padrao = PARAMETROS.find((p) => p.id === 'sal').faixa;
  if (!pool || !pool.faixaSal) return padrao;
  const min = Number(pool.faixaSal.min), max = Number(pool.faixaSal.max);
  return { min: min > 0 ? min : padrao.min, max: max > 0 ? max : padrao.max };
}

function categoriasDisponiveis(produtos) {
  const tiposConhecidos = TEMPLATES_PRODUTO.map((t) => t.tipo);
  const extras = produtos.map((p) => p.tipo).filter((t) => !tiposConhecidos.includes(t));
  return tiposConhecidos.concat([...new Set(extras)]);
}

function clientePorId(id) { return state.clientes.find((c) => c.id === id) || null; }
function piscinaPorId(id) { return state.piscinas.find((p) => p.id === id) || null; }
function piscinasDoCliente(clienteId) { return state.piscinas.filter((p) => p.clienteId === clienteId); }
function labelPiscina(p) {
  const cliente = clientePorId(p.clienteId);
  return (cliente ? cliente.nome + ' — ' : '') + p.nome + ' (' + nf(p.litros, 0) + ' L)';
}

/* ── diagramas esquemáticos (SVG inline, portados do redesign Nocturne) ─────── */

function svgProfUnica() {
  return `<svg viewBox="0 0 180 110" class="diagrama" role="img" aria-label="Corte lateral com fundo reto: profundidade única, da superfície até o fundo">
    <rect x="30" y="20" width="120" height="60" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></rect>
    <line x1="20" y1="20" x2="160" y2="20" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"></line>
    <line x1="168" y1="20" x2="168" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="20" x2="171" y2="20" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="80" x2="171" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <text x="176" y="53" font-size="9" text-anchor="middle" transform="rotate(-90 176 53)" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('piscinaForm.profundidade').toLowerCase())}</text>
  </svg>`;
}
function svgProfMinMax() {
  return `<svg viewBox="0 0 180 110" class="diagrama" role="img" aria-label="Corte lateral com fundo inclinado: profundidade mínima na ponta rasa, máxima na ponta funda">
    <polygon points="30,20 150,20 150,80 30,50" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></polygon>
    <line x1="20" y1="20" x2="160" y2="20" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"></line>
    <line x1="12" y1="20" x2="12" y2="50" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="9" y1="50" x2="15" y2="50" stroke="currentColor" stroke-width="1.2"></line>
    <text x="4" y="38" font-size="9" text-anchor="middle" transform="rotate(-90 4 38)" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('piscinaForm.minAbrev'))}</text>
    <line x1="168" y1="20" x2="168" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="20" x2="171" y2="20" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="80" x2="171" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <text x="176" y="53" font-size="9" text-anchor="middle" transform="rotate(-90 176 53)" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('piscinaForm.maxAbrev'))}</text>
  </svg>`;
}
function svgShapeRetangular() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina retangular: comprimento é o lado maior, largura o lado menor">
    <rect x="40" y="25" width="100" height="60" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></rect>
    <line x1="40" y1="15" x2="140" y2="15" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="40" y1="12" x2="40" y2="18" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="140" y1="12" x2="140" y2="18" stroke="currentColor" stroke-width="1.2"></line>
    <text x="90" y="10" font-size="10" text-anchor="middle" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('shape.comprimento').toLowerCase())}</text>
    <line x1="28" y1="25" x2="28" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="25" y1="25" x2="31" y2="25" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="25" y1="85" x2="31" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <text x="14" y="58" font-size="10" text-anchor="middle" transform="rotate(-90 14 58)" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('shape.largura').toLowerCase())}</text>
  </svg>`;
}
function svgShapeCircular() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina circular: diâmetro é a medida de uma ponta a outra passando pelo centro">
    <circle cx="85" cy="55" r="38" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></circle>
    <line x1="47" y1="55" x2="123" y2="55" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="47" y1="52" x2="47" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="123" y1="52" x2="123" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="63" y="48" width="44" height="14" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="58" font-size="10" text-anchor="middle" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('shape.diametro').toLowerCase())}</text>
  </svg>`;
}
function svgShapeOval() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina oval: comprimento é a medida mais longa, largura a mais curta, ambas passando pelo centro">
    <ellipse cx="85" cy="55" rx="50" ry="30" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></ellipse>
    <line x1="35" y1="55" x2="135" y2="55" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="35" y1="52" x2="35" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="135" y1="52" x2="135" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="60" y="48" width="50" height="13" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="57" font-size="9" text-anchor="middle" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('shape.comprimento').toLowerCase())}</text>
    <line x1="85" y1="25" x2="85" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="82" y1="25" x2="88" y2="25" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="82" y1="85" x2="88" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="66" y="72" width="38" height="13" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="81" font-size="9" text-anchor="middle" style="fill:rgba(var(--color-text-rgb),.7)">${esc(t('shape.largura').toLowerCase())}</text>
  </svg>`;
}

/* ── estado ──────────────────────────────────────────────────────────────── */

function estadoInicial() {
  return {
    session: null, booting: true, ocupado: false,
    authMode: 'entrar', authEmail: '', authSenha: '', authErro: '',

    clientes: [], piscinas: [], produtos: [], historico: [], consumos: [],
    carregandoDados: false, erroCarregar: '',

    tab: 'painel', screen: null, clienteAtualId: null,
    formCliente: null, formPiscina: null,

    medirPoolId: null, leituras: {}, escolhas: {}, resultado: null,
    histPoolId: 'todas', histData: '', histAbertos: {}, histSubTab: 'visitas',
    evolPoolId: null, evolPeriodo: '90',
    relPoolId: null, relMes: '',
    custoPoolId: 'todas',
    salPoolId: null, salAtual: '', salMeta: '', salProdutoId: '', salResultado: null,
    catAtiva: null, produtoFormAberto: false, novoProduto: null,
    toast: '',
  };
}
let state = estadoInicial();

/* ── tema (claro/escuro) ─────────────────────────────────────────────────── */
// Assim como o idioma (js/i18n.js), o tema é preferência do dispositivo, não do `state` —
// não deve ser apagado quando a pessoa desloga (aoDeslogar() recria o `state` do zero).

function temaInicial() {
  const atual = document.documentElement.getAttribute('data-theme');
  if (atual === 'light' || atual === 'dark') return atual;
  try {
    const salvo = localStorage.getItem('bp_tema');
    if (salvo === 'light' || salvo === 'dark') return salvo;
  } catch (e) { /* localStorage indisponível — segue com o padrão */ }
  return 'dark';
}
let tema = temaInicial();

function definirTema(novo) {
  tema = novo;
  document.documentElement.setAttribute('data-theme', novo);
  try { localStorage.setItem('bp_tema', novo); } catch (e) { /* ignora */ }
}

function formClienteVazio(cliente) {
  if (!cliente) return { id: null, nome: '', telefone: '', email: '', endereco: '', observacoes: '' };
  return {
    id: cliente.id, nome: cliente.nome, telefone: cliente.telefone || '',
    email: cliente.email || '', endereco: cliente.endereco || '', observacoes: cliente.observacoes || '',
  };
}

function formVazio(pool) {
  const vazio = {
    id: null, nome: '', sistema: 'manual', salMin: '', salMax: '',
    unidade: 'm', formato: 'retangular', modoProf: 'unica',
    prof: '', profMin: '', profMax: '', litrosManuais: '', proximaVisita: '',
    formas: [{ tipo: 'retangular', comprimento: '', largura: '', diametro: '' }],
  };
  if (!pool) return vazio;
  return {
    id: pool.id, nome: pool.nome, sistema: pool.sistemaDesinfeccao || 'manual',
    salMin: pool.faixaSal && pool.faixaSal.min != null ? String(pool.faixaSal.min) : '',
    salMax: pool.faixaSal && pool.faixaSal.max != null ? String(pool.faixaSal.max) : '',
    unidade: pool.unidade || 'm',
    proximaVisita: pool.proximaVisita || '',
    formato: pool.formato,
    modoProf: pool.modoProf || 'unica',
    prof: pool.modoProf === 'unica' ? String(pool.prof ?? '') : '',
    profMin: pool.modoProf === 'minmax' ? String(pool.profMin ?? '') : '',
    profMax: pool.modoProf === 'minmax' ? String(pool.profMax ?? '') : '',
    litrosManuais: pool.formato === 'irregular' ? String(pool.litros ?? '') : '',
    formas: (pool.formas && pool.formas.length ? pool.formas : [{ tipo: pool.formato === 'composta' ? 'retangular' : pool.formato, comprimento: '', largura: '', diametro: '' }])
      .map((f) => ({
        tipo: f.tipo,
        comprimento: f.comprimento != null ? String(f.comprimento) : '',
        largura: f.largura != null ? String(f.largura) : '',
        diametro: f.diametro != null ? String(f.diametro) : '',
      })),
  };
}

function litragemPreview(f) {
  if (f.formato === 'irregular') {
    const n = Number(f.litrosManuais);
    return n > 0 ? { ok: true, litros: n, aproximado: true } : { ok: false };
  }
  const formas = f.formas.map((fo) => Object.assign({}, fo, { unidade: f.unidade }));
  const profundidade = { modo: f.modoProf, unidade: f.unidade, unica: f.prof, minima: f.profMin, maxima: f.profMax };
  return calcularLitragem({ formas, profundidade });
}

function novoProdutoVazio() {
  const t = TEMPLATES_PRODUTO[0];
  return { tipo: t.tipo, nome: '', marca: '', principio: t.principioAtivo, concentracao: '', preco: '', estado: t.estadoFisico === 'liquido' ? 'liquido' : 'solido', densidade: '' };
}

function ultimoDiagnosticoDe(poolId) {
  const todos = state.historico.filter((h) => h.piscinaId === poolId);
  if (!todos.length) return null;
  return todos.reduce((a, b) => (new Date(a.data) > new Date(b.data) ? a : b));
}

// Nenhuma cadência "oficial" de manutenção veio especificada — 30 dias é uma referência
// razoável (mensal) pro Painel sinalizar "medição atrasada"; fácil de ajustar aqui se o
// piscineiro tiver uma rotina diferente (semanal, quinzenal etc.) no futuro.
const DIAS_PARA_MEDICAO_ATRASADA = 30;

function diasDesde(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// diferença em dias entre hoje e uma data 'YYYY-MM-DD' (negativo = já passou)
function diasParaData(dataStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataStr + 'T00:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

// Resume o estado de uma piscina pro Painel em 4 níveis, no mesmo vocabulário da seção de
// Alertas do plano: 'critico' (cloro fora da faixa — risco sanitário imediato, ação
// prioritária), 'atencao' (outro parâmetro fora da faixa), 'pendente' (medição atrasada, visita
// agendada vencida, ou nunca medida — falta dado/visita, não é uma emergência de água) e
// 'normal'. Uma piscina com cloro fora da faixa E atrasada entra em 'critico' (o mais grave
// decide); fora-da-faixa (não-cloro) tem prioridade sobre atrasada pelo mesmo motivo.
function statusPiscina(pool) {
  const ult = ultimoDiagnosticoDe(pool.id);
  const diasVisita = pool.proximaVisita ? diasParaData(pool.proximaVisita) : null;
  const visitaVencida = diasVisita != null && diasVisita < 0;
  if (!ult) return { nivel: 'pendente', semMedicao: true, ult: null, dias: null, atrasada: true, foraCount: 0, diasVisita, visitaVencida };
  const dias = diasDesde(ult.data);
  const atrasada = dias > DIAS_PARA_MEDICAO_ATRASADA || visitaVencida;
  const fora = ult.passos.filter((p) => p.status !== 'adequado');
  const cloroFora = fora.some((p) => p.parametroId === 'cloro');
  let nivel = 'normal';
  if (cloroFora) nivel = 'critico';
  else if (fora.length > 0) nivel = 'atencao';
  else if (atrasada) nivel = 'pendente';
  return { nivel, semMedicao: false, ult, dias, atrasada, foraCount: fora.length, diasVisita, visitaVencida };
}

function historyStepView(p) {
  const titulo = t(p.nome) + ': ' + (p.status === 'adequado' ? t('historico.adequado') : t(p.rotuloStatus));
  let detalhe;
  if (p.status === 'adequado') {
    detalhe = t('historico.leitura', { valor: numFmt(p.valor), unidade: p.unidade ? ' ' + p.unidade : '' });
  } else if (p.instrucaoOperacional) {
    detalhe = t(p.instrucaoOperacional);
  } else if (p.instrucaoGeradorSalino) {
    detalhe = t(p.instrucaoGeradorSalino);
  } else if (p.dose) {
    detalhe = t('pdf.doseTexto', { valor: dose3Fmt(p.dose.valor), unidade: p.dose.unidade, produto: p.produto });
  } else {
    detalhe = t(SEM_PRODUTO_TEXTO[p.parametroId] || 'historico.semProdutoSelecionado');
  }
  return { titulo, detalhe, marca: p.status === 'adequado' ? 'var(--color-accent-700)' : 'var(--warn-400)' };
}

/* ── toast ───────────────────────────────────────────────────────────────── */

let toastTimer = null;
function toast(msg) {
  state.toast = msg;
  syncToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; syncToast(); }, 3600);
}
function syncToast() {
  const el = document.getElementById('toast');
  if (!el) return;
  if (state.toast) { el.textContent = state.toast; el.hidden = false; } else { el.hidden = true; }
}

/* ── navegação ───────────────────────────────────────────────────────────── */

const NAV_ITEMS = [
  ['painel', 'nav.painel', 'ph-gauge'],
  ['clientes', 'nav.cadastros', 'ph-users'],
  ['medir', 'nav.medir', 'ph-drop'],
  ['sal', 'nav.sal', 'ph-cube'],
  ['historico', 'nav.historico', 'ph-clock-counter-clockwise'],
  ['custos', 'nav.custos', 'ph-chart-bar'],
];

// Botão de lembretes do navegador é opcional e só dentro do app (sem push/servidor) — some da
// barra quando o navegador não suporta Notification ou quando a pessoa já negou a permissão
// (nesse caso pedir de novo não mostraria diálogo nenhum, só ficaria um botão morto).
function podeOferecerNotificacoes() {
  return typeof Notification !== 'undefined' && Notification.permission !== 'denied';
}

function renderPrefsButtons() {
  const notifBtn = podeOferecerNotificacoes()
    ? `<button type="button" class="btn btn-secondary btn-icon" data-action="pedir-notificacoes" title="${esc(t(Notification.permission === 'granted' ? 'nav.notif.ativado' : 'nav.notif.ativar'))}" style="width:36px;height:36px">
        <i class="ph ${Notification.permission === 'granted' ? 'ph-bell-ringing' : 'ph-bell'}"></i>
      </button>`
    : '';
  return `
    ${notifBtn}
    <button type="button" class="btn btn-secondary btn-icon" data-action="alternar-tema" title="${esc(t(tema === 'dark' ? 'nav.tema.paraClaro' : 'nav.tema.paraEscuro'))}" style="width:36px;height:36px">
      <i class="ph ${tema === 'dark' ? 'ph-sun' : 'ph-moon'}"></i>
    </button>
    <button type="button" class="btn btn-secondary" data-action="ciclar-idioma" title="${esc(t('nav.idioma.trocar'))}" style="min-height:36px;padding-inline:9px;font-size:11.5px;font-weight:600">${idioma.toUpperCase()}</button>`;
}

function renderNav() {
  const ativoId = !state.screen ? state.tab : null;
  document.getElementById('nav-top').innerHTML = `
    <div class="nav-top-inner">
      <div class="brand">${renderBrandLockup()}</div>
      ${NAV_ITEMS.map(([id, label, icon]) => `
        <button type="button" class="nav-top-link${ativoId === id ? ' ativo' : ''}" data-action="nav-go" data-tab="${id}"><i class="ph ${icon}"></i>${esc(t(label))}</button>
      `).join('')}
      <div style="display:flex;gap:6px;margin-left:4px">${renderPrefsButtons()}</div>
      <button type="button" class="account-btn" data-action="sair"><i class="ph ph-sign-out"></i>${esc(t('nav.sair'))}</button>
    </div>`;
  document.getElementById('nav-bottom').innerHTML = NAV_ITEMS.map(([id, label, icon]) => `
    <button type="button" class="nav-bottom-link${ativoId === id ? ' ativo' : ''}" data-action="nav-go" data-tab="${id}"><i class="ph ${icon}"></i><span>${esc(t(label))}</span></button>
  `).join('');
  const mobileHeader = document.getElementById('mobile-header');
  if (mobileHeader) {
    mobileHeader.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;gap:8px">${renderBrandLockup()}</div>
      ${renderPrefsButtons()}
      <button type="button" class="account-btn" data-action="sair" style="margin-left:6px"><i class="ph ph-sign-out"></i>${esc(t('nav.sair'))}</button>`;
  }
}

/* ── tela: autenticação ──────────────────────────────────────────────────── */

function renderAuthScreen() {
  const modo = state.authMode;
  return `
    <section class="auth-screen">
      <div style="position:absolute;top:14px;right:14px;display:flex;gap:6px">${renderPrefsButtons()}</div>
      <div class="auth-card">
        <div class="auth-brand">${renderBrandLockup()}</div>
        <div class="auth-tabs">
          <button type="button" class="auth-tab${modo === 'entrar' ? ' ativa' : ''}" data-action="auth-set-modo" data-modo="entrar">${esc(t('auth.entrar'))}</button>
          <button type="button" class="auth-tab${modo === 'criar' ? ' ativa' : ''}" data-action="auth-set-modo" data-modo="criar">${esc(t('auth.criarConta'))}</button>
        </div>
        <div class="auth-form">
          <div class="field"><label>${esc(t('auth.email'))}</label><input class="input" type="text" data-action="auth-set-email" value="${esc(state.authEmail)}" placeholder="${esc(t('auth.emailPlaceholder'))}" /></div>
          <div class="field"><label>${esc(t('auth.senha'))}</label><input class="input" type="password" data-action="auth-set-senha" value="${esc(state.authSenha)}" placeholder="${modo === 'criar' ? esc(t('auth.senhaPlaceholderCriar')) : ''}" /></div>
          ${state.authErro ? `<p class="auth-error">${esc(state.authErro)}</p>` : ''}
          <button type="button" class="btn btn-primary btn-block" data-action="auth-submeter" style="min-height:46px" ${state.ocupado ? 'disabled' : ''}>
            ${state.ocupado ? esc(t('common.aguarde')) : modo === 'entrar' ? esc(t('auth.entrar')) : esc(t('auth.criarConta'))}
          </button>
        </div>
        <p class="auth-note">${modo === 'entrar' ? esc(t('auth.notaEntrar')) : esc(t('auth.notaCriar'))}</p>
      </div>
    </section>`;
}

/* ── tela: painel ────────────────────────────────────────────────────────── */

function renderPainelPoolRow(pool, status) {
  const cliente = clientePorId(pool.clienteId);
  const label = cliente ? cliente.nome + ' — ' + pool.nome : pool.nome;
  const tagLabel = status.semMedicao ? t('painel.nuncaMedida') : t('painel.' + status.nivel);
  // "Crítico" usa selo cheio em vermelho (warn-400, status-danger da marca) — mais chamativo
  // e semanticamente mais grave; "Atenção" contorno âmbar (color-warm, status-warn); "Pendente"
  // (ou "nunca medida") um contorno neutro — três níveis de urgência distinguíveis de relance.
  const tagStyle = status.nivel === 'critico'
    ? 'background:var(--warn-400);color:var(--color-bg)'
    : status.nivel === 'atencao'
    ? 'border:1px solid var(--color-warm);color:var(--color-warm)'
    : 'border:1px solid rgba(var(--color-text-rgb),.35);color:rgba(var(--color-text-rgb),.65)';
  const detalhes = [];
  if (!status.semMedicao) {
    if (status.foraCount > 0) detalhes.push(t('historico.foraDaFaixa', { n: status.foraCount }));
    if (status.visitaVencida) detalhes.push(t('painel.visitaAtrasada', { dias: Math.abs(status.diasVisita) }));
    else detalhes.push(status.atrasada ? t('painel.medicaoAtrasada', { dias: status.dias }) : (status.dias === 0 ? t('painel.hoje') : t('painel.haDias', { dias: status.dias })));
  } else if (status.visitaVencida) {
    detalhes.push(t('painel.visitaAtrasada', { dias: Math.abs(status.diasVisita) }));
  }
  if (!status.visitaVencida && status.diasVisita != null) detalhes.push(t('painel.proximaVisitaEm', { data: dataFmt(pool.proximaVisita) }));
  return `
    <div class="card painel-row">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-weight:500;font-size:14.5px">${esc(label)}</div>
          ${detalhes.length ? `<div style="font-size:11.5px;color:rgba(var(--color-text-rgb),.55);margin-top:3px">${esc(detalhes.join(' · '))}</div>` : ''}
        </div>
        <span class="tag" style="${tagStyle};flex:none">${esc(tagLabel)}</span>
      </div>
      <div class="pool-card-actions" style="margin-top:10px">
        <button type="button" class="btn btn-ghost" data-action="abrir-cliente" data-id="${pool.clienteId}" style="font-size:12.5px">${esc(t('clientes.abrir'))}</button>
        <button type="button" class="btn btn-primary" data-action="medir-piscina" data-id="${pool.id}" style="min-height:38px">${esc(t('poolCard.medir'))}</button>
      </div>
    </div>`;
}

// Janela de antecedência pro lembrete de "visita agendada chegando" (dias) — nenhuma cadência
// oficial veio especificada; 3 dias dá tempo de reorganizar a agenda sem virar aviso o tempo todo.
const DIAS_LEMBRETE_VISITA_PROXIMA = 3;

// Alertas informativos: lembretes/recomendações gerais, não ligados a uma piscina específica
// (diferente de Crítico/Atenção/Pendente, que são sempre sobre o estado de uma piscina) — item
// "Informativo: lembrete ou recomendação" da seção de Alertas do plano.
function alertasInformativos() {
  const alertas = [];
  const semPreco = state.produtos.filter((p) => !p.preco).length;
  if (semPreco > 0) {
    alertas.push({ texto: t('painel.produtosSemPreco', { n: semPreco }), acao: 'ir-produtos' });
  }
  const proximas = state.piscinas.filter((p) => {
    if (!p.proximaVisita) return false;
    const d = diasParaData(p.proximaVisita);
    return d >= 0 && d <= DIAS_LEMBRETE_VISITA_PROXIMA;
  }).length;
  if (proximas > 0) {
    alertas.push({ texto: t('painel.lembreteVisitasProximas', { n: proximas }), acao: 'nav-go', tab: 'clientes' });
  }
  return alertas;
}

const PRIORIDADE_NIVEL = { critico: 0, atencao: 1, pendente: 2 };

function renderScreenPainel() {
  const piscinasComStatus = state.piscinas.map((pool) => ({ pool, status: statusPiscina(pool) }));
  const counts = { normal: 0, atencao: 0, pendente: 0, critico: 0 };
  piscinasComStatus.forEach(({ status }) => { counts[status.nivel]++; });
  const precisamAtencao = piscinasComStatus
    .filter(({ status }) => status.nivel !== 'normal')
    .sort((a, b) => {
      if (a.status.nivel !== b.status.nivel) return PRIORIDADE_NIVEL[a.status.nivel] - PRIORIDADE_NIVEL[b.status.nivel];
      return (b.status.dias ?? 0) - (a.status.dias ?? 0);
    });
  const ultimasMedicoes = state.historico.slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  const informativos = alertasInformativos();

  if (!state.clientes.length) {
    return `
      <div class="screen-header"><div><div class="kicker">${esc(t('painel.kicker'))}</div><h2>${esc(t('painel.titulo'))}</h2></div></div>
      <p class="empty-note">${esc(t('painel.semClientes'))}</p>`;
  }

  return `
    <div class="screen-header"><div><div class="kicker">${esc(t('painel.kicker'))}</div><h2>${esc(t('painel.titulo'))}</h2></div></div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">
      <div class="card stat-tile"><div class="stat-tile-value">${counts.normal}</div><div class="stat-tile-label">${esc(t('painel.normal'))}</div></div>
      <div class="card stat-tile" style="box-shadow:inset 3px 0 0 rgba(var(--color-text-rgb),.35), var(--shadow-sm)"><div class="stat-tile-value">${counts.pendente}</div><div class="stat-tile-label">${esc(t('painel.pendente'))}</div></div>
      <div class="card stat-tile" style="box-shadow:inset 3px 0 0 var(--color-warm), var(--shadow-sm)"><div class="stat-tile-value">${counts.atencao}</div><div class="stat-tile-label">${esc(t('painel.atencao'))}</div></div>
      <div class="card stat-tile" style="box-shadow:inset 3px 0 0 var(--warn-400), var(--shadow-sm)"><div class="stat-tile-value">${counts.critico}</div><div class="stat-tile-label">${esc(t('painel.critico'))}</div></div>
    </div>

    ${informativos.length ? `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
      ${informativos.map((a) => `
        <button type="button" class="notice-flat" style="text-align:left;border:none;font-family:inherit;cursor:pointer;width:100%" data-action="${a.acao}"${a.tab ? ` data-tab="${a.tab}"` : ''}>
          <i class="ph ph-info" style="margin-right:6px"></i>${esc(a.texto)}
        </button>`).join('')}
    </div>` : ''}

    <div class="divider-label"><span>${esc(t('painel.precisaAtencao'))}</span><span class="rule"></span></div>
    <div style="display:flex;flex-direction:column;gap:11px;margin-bottom:22px">
      ${precisamAtencao.length ? precisamAtencao.map(({ pool, status }) => renderPainelPoolRow(pool, status)).join('') : `<p class="empty-note">${esc(t('painel.tudoEmDia'))}</p>`}
    </div>

    <div class="divider-label"><span>${esc(t('painel.ultimasMedicoes'))}</span><span class="rule"></span></div>
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:22px">
      ${ultimasMedicoes.length ? ultimasMedicoes.map((h) => {
        const pool = piscinaPorId(h.piscinaId);
        const cliente = pool ? clientePorId(pool.clienteId) : null;
        const fora = h.passos.filter((p) => p.status !== 'adequado').length;
        return `
          <div class="cost-row">
            <div>
              <div class="cost-name">${esc(cliente ? cliente.nome + ' — ' : '')}${esc(pool ? pool.nome : '—')}</div>
              <div class="cost-detail">${dataHoraFmt(h.data)} · ${fora > 0 ? esc(t('historico.foraDaFaixa', { n: fora })) : esc(t('historico.tudoAdequado'))}</div>
            </div>
            <button type="button" class="btn btn-ghost" data-action="ver-medicao-painel" data-id="${h.id}" data-poolid="${h.piscinaId}" style="font-size:12.5px">${esc(t('painel.ver'))}</button>
          </div>`;
      }).join('') : `<p class="empty-note">${esc(t('painel.nenhumaMedicaoAinda'))}</p>`}
    </div>

    <div class="divider-label"><span>${esc(t('painel.acoesRapidas'))}</span><span class="rule"></span></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button type="button" class="btn btn-primary" data-action="nav-go" data-tab="medir" style="min-height:44px"><i class="ph ph-drop"></i>${esc(t('painel.novaMedicao'))}</button>
      <button type="button" class="btn btn-secondary" data-action="nav-go" data-tab="historico" style="min-height:44px"><i class="ph ph-clock-counter-clockwise"></i>${esc(t('painel.verHistorico'))}</button>
      <button type="button" class="btn btn-secondary" data-action="nav-go" data-tab="custos" style="min-height:44px"><i class="ph ph-chart-bar"></i>${esc(t('painel.verCustos'))}</button>
    </div>`;
}

/* ── tela: clientes ──────────────────────────────────────────────────────── */

function renderClientCard(c) {
  const piscinas = piscinasDoCliente(c.id);
  const contato = [c.telefone, c.email].filter(Boolean).join(' · ') || t('clientes.semContato');
  return `
    <button type="button" class="card client-card" data-action="abrir-cliente" data-id="${c.id}">
      <div>
        <div class="client-card-name">${esc(c.nome)}</div>
        <div class="client-card-meta">${esc(contato)}</div>
        ${c.endereco ? `<div class="client-card-meta">${esc(c.endereco)}</div>` : ''}
      </div>
      <div class="client-card-bottom">
        <span class="client-card-count">${piscinas.length} ${esc(t(piscinas.length === 1 ? 'clientes.piscinaSingular' : 'clientes.piscinaPlural'))}</span>
        <span class="btn btn-ghost" style="pointer-events:none">${esc(t('clientes.abrir'))}</span>
      </div>
    </button>`;
}

function renderScreenClientes() {
  const locale = numLocale();
  const hoje = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  const clientes = state.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, locale));
  return `
    <div class="screen-header">
      <div><div class="kicker">${esc(hoje)}</div><h2>${esc(t('clientes.titulo'))}</h2></div>
      <div class="screen-header-actions">
        <button type="button" class="btn btn-warm" data-action="ir-produtos" style="gap:6px"><i class="ph ph-flask"></i>${esc(t('clientes.produtos'))}</button>
        <button type="button" class="btn btn-warm" data-action="ir-cadastro-cliente" style="gap:6px"><i class="ph ph-plus"></i>${esc(t('clientes.novoCliente'))}</button>
      </div>
    </div>
    <div class="client-grid">
      ${clientes.map(renderClientCard).join('')}
      <button type="button" class="add-pool-card" data-action="ir-cadastro-cliente">
        <span class="txt">${esc(t('clientes.cadastrarNovo'))}</span>
        <i class="ph ph-plus"></i>
      </button>
    </div>`;
}

function renderScreenCadastroCliente() {
  const f = state.formCliente || (state.formCliente = formClienteVazio(null));
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-clientes"><i class="ph ph-arrow-left"></i></button>
      <h4>${f.id ? esc(t('clienteForm.editar')) : esc(t('clienteForm.novo'))}</h4>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:14px;max-width:520px">
      <div class="field"><label>${esc(t('clienteForm.nome'))}</label><input class="input" type="text" placeholder="${esc(t('clienteForm.nomePlaceholder'))}" data-action="set-cliente-nome" value="${esc(f.nome)}" /></div>
      <div class="field"><label>${esc(t('clienteForm.telefone'))}</label><input class="input" type="text" placeholder="${esc(t('clienteForm.telefonePlaceholder'))}" data-action="set-cliente-telefone" value="${esc(f.telefone)}" /></div>
      <div class="field"><label>${esc(t('clienteForm.email'))}</label><input class="input" type="text" placeholder="${esc(t('clienteForm.emailPlaceholder'))}" data-action="set-cliente-email" value="${esc(f.email)}" /></div>
      <div class="field"><label>${esc(t('clienteForm.endereco'))}</label><input class="input" type="text" placeholder="${esc(t('clienteForm.enderecoPlaceholder'))}" data-action="set-cliente-endereco" value="${esc(f.endereco)}" /></div>
      <div class="field"><label>${esc(t('clienteForm.observacoes'))}</label><textarea class="input" data-action="set-cliente-observacoes" placeholder="${esc(t('clienteForm.observacoesPlaceholder'))}">${esc(f.observacoes)}</textarea></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${f.id ? `<button type="button" class="btn btn-ghost" data-action="excluir-cliente" data-id="${f.id}">${esc(t('clienteForm.excluir'))}</button>` : ''}
        <button type="button" class="btn btn-secondary" data-action="voltar-clientes">${esc(t('common.cancelar'))}</button>
        <button type="button" class="btn btn-primary" data-action="salvar-cliente" style="padding-inline:20px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('common.salvando')) : esc(t('clienteForm.salvar'))}</button>
      </div>
    </div>`;
}

function renderScreenClienteDetalhe() {
  const cliente = clientePorId(state.clienteAtualId);
  if (!cliente) { state.screen = null; return renderScreenClientes(); }
  const piscinas = piscinasDoCliente(cliente.id);
  const contato = [cliente.telefone, cliente.email, cliente.endereco].filter(Boolean).join(' · ');
  return `
    <div class="client-detail-header">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-clientes"><i class="ph ph-arrow-left"></i></button>
      <div class="info">
        <h2 style="font-size:24px">${esc(cliente.nome)}</h2>
        ${contato ? `<div class="contato">${esc(contato)}</div>` : ''}
        ${cliente.observacoes ? `<div class="contato">${esc(cliente.observacoes)}</div>` : ''}
      </div>
      <button type="button" class="btn btn-secondary" data-action="ir-editar-cliente" data-id="${cliente.id}">${esc(t('clienteDetalhe.editar'))}</button>
      <button type="button" class="btn btn-primary btn-icon" data-action="ir-cadastro-piscina" title="${esc(t('clienteDetalhe.novaPiscinaTitulo'))}"><i class="ph ph-plus"></i></button>
    </div>
    <div class="pool-grid">
      ${piscinas.map(renderPoolCard).join('')}
      <button type="button" class="add-pool-card" data-action="ir-cadastro-piscina">
        <span class="txt">${esc(t('clienteDetalhe.cadastrarPiscina'))}</span>
        <i class="ph ph-plus"></i>
      </button>
    </div>`;
}

/* ── tela: cadastro de piscina ───────────────────────────────────────────── */

function renderPoolCard(p) {
  const ult = ultimoDiagnosticoDe(p.id);
  const fora = ult ? ult.passos.filter((x) => x.status !== 'adequado').length : null;
  const chipIds = ['alcalinidade', 'ph', 'cloro'].concat(p.sistemaDesinfeccao === 'salino' ? ['sal'] : []).slice(0, 3);
  const chips = chipIds.map((k) => {
    const par = PARAMETROS.find((x) => x.id === k);
    const leitura = ult ? ult.leituras[k] : null;
    const dentro = leitura != null && classificar(Number(leitura), par.faixa.min, par.faixa.max) === 'adequado';
    const cor = leitura == null ? 'rgba(var(--color-text-rgb),.35)' : dentro ? 'var(--color-text)' : 'var(--warn-400)';
    return `<div class="pool-chip"><div class="pool-chip-label">${esc(t('param.' + par.id + '.nomeCurto'))}</div><div class="pool-chip-value" style="color:${cor}">${leitura == null ? '—' : numFmt(leitura)}</div></div>`;
  }).join('');
  const desc = [
    p.formato === 'irregular' ? t('poolCard.irregular') : t('formato.' + p.formato),
    p.sistemaDesinfeccao === 'salino' ? t('sistema.salino.curto') : p.sistemaDesinfeccao === 'ozonio' ? t('sistema.ozonio.curto') : t('sistema.manual.curto'),
  ];
  const tagLabel = !ult ? t('poolCard.semMedicao') : fora > 0 ? t('poolCard.acao') : t('poolCard.estavel');
  const tagStyle = !ult ? 'background:var(--color-neutral-800);color:var(--color-neutral-100)'
    : fora > 0 ? 'border:1px solid var(--warn-400);color:var(--warn-400)'
    : 'background:var(--color-accent-800);color:var(--color-accent-100)';
  const meta = !ult ? t('poolCard.nenhumaLeitura') : dataHoraFmt(ult.data) + (fora > 0 ? ' · ' + fora + ' ' + t('poolCard.correcoes') : '');
  const visitaTxt = p.proximaVisita
    ? (diasParaData(p.proximaVisita) < 0 ? t('poolCard.visitaAtrasadaDesde', { data: dataFmt(p.proximaVisita) }) : t('poolCard.proximaVisita', { data: dataFmt(p.proximaVisita) }))
    : '';
  return `
    <div class="card pool-card">
      <div class="pool-card-top">
        <div><div class="pool-card-name">${esc(p.nome)}</div><div class="pool-card-sub">${nf(p.litros, 0)} L · ${esc(desc.join(' · '))}</div></div>
        <span class="tag" style="${tagStyle}">${esc(tagLabel)}</span>
      </div>
      <div class="pool-chip-row">${chips}</div>
      <div class="pool-card-bottom">
        <span class="pool-card-meta">${esc(meta)}${visitaTxt ? ' · ' + esc(visitaTxt) : ''}</span>
        <div class="pool-card-actions">
          <button type="button" class="btn btn-ghost" data-action="editar-piscina" data-id="${p.id}" style="font-size:12.5px">${esc(t('poolCard.editar'))}</button>
          <button type="button" class="btn btn-primary" data-action="medir-piscina" data-id="${p.id}" style="min-height:38px">${esc(t('poolCard.medir'))}</button>
        </div>
      </div>
    </div>`;
}

function renderShapeBlock(fo, i, f) {
  const diag = fo.tipo === 'circular' ? svgShapeCircular() : fo.tipo === 'oval' ? svgShapeOval() : svgShapeRetangular();
  const removivel = f.formato === 'composta' && f.formas.length > 1;
  const campos = fo.tipo === 'circular'
    ? `<div class="field"><label>${esc(t('shape.diametro'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-forma-campo" data-idx="${i}" data-campo="diametro" value="${esc(fo.diametro)}" /></div>`
    : `<div class="field"><label>${esc(t('shape.comprimento'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-forma-campo" data-idx="${i}" data-campo="comprimento" value="${esc(fo.comprimento)}" /></div>
       <div class="field"><label>${esc(t('shape.largura'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-forma-campo" data-idx="${i}" data-campo="largura" value="${esc(fo.largura)}" /></div>`;
  return `
    <div class="shape-block">
      <div class="shape-diagrama">${diag}</div>
      ${campos}
      ${removivel ? `<button type="button" class="btn btn-ghost" data-action="remover-forma" data-idx="${i}" style="min-height:40px">${esc(t('shape.remover'))}</button>` : ''}
    </div>`;
}

const SISTEMAS = [
  ['manual', 'sistema.manual'],
  ['salino', 'sistema.salino'],
  ['ozonio', 'sistema.ozonio'],
];
const FORMATOS = [
  ['retangular', 'formato.retangular'],
  ['circular', 'formato.circular'],
  ['oval', 'formato.oval'],
  ['composta', 'formato.composta'],
  ['irregular', 'formato.irregular'],
];

function renderScreenCadastroPiscina() {
  const cliente = clientePorId(state.clienteAtualId);
  if (!cliente) { state.screen = null; return renderScreenClientes(); }
  const f = state.formPiscina || (state.formPiscina = formVazio(null));
  const calc = litragemPreview(f);
  const litragemTexto = calc.ok ? nf(calc.litros, 0) + ' L  ·  ' + nf(calc.litros / 1000, 2) + ' m³' : t('piscinaForm.informeMedidas');
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-cliente-detalhe"><i class="ph ph-arrow-left"></i></button>
      <h4>${f.id ? esc(t('piscinaForm.editar')) : esc(t('piscinaForm.nova'))} — ${esc(cliente.nome)}</h4>
    </div>
    <div class="cadastro-grid">
      <div class="card">
        <div class="field"><label>${esc(t('piscinaForm.nome'))}</label><input class="input" type="text" placeholder="${esc(t('piscinaForm.nomePlaceholder'))}" data-action="set-nome" value="${esc(f.nome)}" /></div>
        <div class="field"><label>${esc(t('piscinaForm.sistemaDesinfeccao'))}</label>
          <div style="display:flex;flex-direction:column;gap:7px">
            ${SISTEMAS.map(([id, label]) => `<label class="radio"><input type="radio" name="sistema" data-action="set-sistema" data-tipo="${id}" ${f.sistema === id ? 'checked' : ''} /><span class="dot"></span>${esc(t(label))}</label>`).join('')}
          </div>
        </div>
        ${f.sistema === 'salino' ? `
        <div style="display:flex;gap:10px">
          <div class="field" style="flex:1"><label>${esc(t('piscinaForm.salMin'))}</label><input class="input" type="text" inputmode="decimal" placeholder="2700" data-action="set-sal-min" value="${esc(f.salMin)}" /></div>
          <div class="field" style="flex:1"><label>${esc(t('piscinaForm.salMax'))}</label><input class="input" type="text" inputmode="decimal" placeholder="3400" data-action="set-sal-max" value="${esc(f.salMax)}" /></div>
        </div>` : ''}
        <div class="field"><label>${esc(t('piscinaForm.unidadeMedida'))}</label>
          <span class="seg">
            <label class="seg-opt"><input type="radio" name="un" data-action="set-unidade" data-tipo="m" ${f.unidade === 'm' ? 'checked' : ''} />${esc(t('piscinaForm.metros'))}</label>
            <label class="seg-opt"><input type="radio" name="un" data-action="set-unidade" data-tipo="cm" ${f.unidade === 'cm' ? 'checked' : ''} />${esc(t('piscinaForm.centimetros'))}</label>
          </span>
        </div>
        <div class="field"><label>${esc(t('piscinaForm.proximaVisita'))}</label><input class="input" type="date" data-action="set-proxima-visita" value="${esc(f.proximaVisita)}" /></div>
      </div>
      <div class="card">
        <div>
          <div class="diagrama-label">${esc(t('piscinaForm.profundidade'))}</div>
          ${f.modoProf === 'unica' ? svgProfUnica() : svgProfMinMax()}
          <div style="display:flex;flex-direction:column;gap:7px">
            <label class="radio"><input type="radio" name="prof" data-action="set-modo-prof" data-tipo="unica" ${f.modoProf === 'unica' ? 'checked' : ''} /><span class="dot"></span>${esc(t('piscinaForm.profUnica'))}</label>
            <label class="radio"><input type="radio" name="prof" data-action="set-modo-prof" data-tipo="minmax" ${f.modoProf === 'minmax' ? 'checked' : ''} /><span class="dot"></span>${esc(t('piscinaForm.profMinMax'))}</label>
          </div>
          ${f.modoProf === 'unica'
            ? `<input class="input" type="text" inputmode="decimal" placeholder="${esc(t('piscinaForm.profPlaceholder'))}" data-action="set-prof" value="${esc(f.prof)}" style="margin-top:9px" />`
            : `<div style="display:flex;gap:9px;margin-top:9px"><input class="input" type="text" inputmode="decimal" placeholder="${esc(t('piscinaForm.profMinPlaceholder'))}" data-action="set-prof-min" value="${esc(f.profMin)}" /><input class="input" type="text" inputmode="decimal" placeholder="${esc(t('piscinaForm.profMaxPlaceholder'))}" data-action="set-prof-max" value="${esc(f.profMax)}" /></div>`}
        </div>
        <div class="field"><label>${esc(t('piscinaForm.formato'))}</label>
          <select class="input" data-action="set-formato">
            ${FORMATOS.map(([id, label]) => `<option value="${id}" ${f.formato === id ? 'selected' : ''}>${esc(t(label))}</option>`).join('')}
          </select>
        </div>
        ${f.formato === 'irregular' ? `
        <div>
          <p style="margin:0 0 9px;font-size:11.5px;line-height:1.5;color:rgba(var(--color-text-rgb),.55)">${esc(t('piscinaForm.irregularAjuda'))}</p>
          <div class="field"><label>${esc(t('piscinaForm.litragemEstimada'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-litros-manuais" value="${esc(f.litrosManuais)}" /></div>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${f.formas.map((fo, i) => renderShapeBlock(fo, i, f)).join('')}
          ${f.formato === 'composta' ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="retangular" style="min-height:40px">${esc(t('piscinaForm.addRetangulo'))}</button>
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="circular" style="min-height:40px">${esc(t('piscinaForm.addCirculo'))}</button>
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="oval" style="min-height:40px">${esc(t('piscinaForm.addOval'))}</button>
          </div>` : ''}
        </div>`}
      </div>
    </div>
    <div class="result-bar">
      <div class="result-bar-info"><div class="result-bar-label">${esc(t('piscinaForm.litragemCalculada'))}</div><div class="result-bar-value">${esc(litragemTexto)}</div></div>
      ${f.id ? `<button type="button" class="btn btn-ghost" data-action="excluir-piscina" data-id="${f.id}">${esc(t('piscinaForm.excluir'))}</button>` : ''}
      <button type="button" class="btn btn-secondary" data-action="voltar-cliente-detalhe" style="min-height:46px">${esc(t('common.cancelar'))}</button>
      <button type="button" class="btn btn-primary" data-action="salvar-piscina" style="min-height:46px;padding-inline:20px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('common.salvando')) : esc(t('piscinaForm.salvar'))}</button>
    </div>`;
}

/* ── tela: medir ─────────────────────────────────────────────────────────── */

function renderReadingCards(pool, parametrosAtivos) {
  return parametrosAtivos.map((par) => {
    const faixa = par.id === 'sal' ? faixaSalDe(pool) : par.faixa;
    const raw = state.leituras[par.id];
    const v = Number(raw);
    const tem = raw !== '' && raw != null && Number.isFinite(v);
    const status = tem ? classificar(v, faixa.min, faixa.max) : null;
    const span = { min: faixa.min - (faixa.max - faixa.min) * 1.6, max: faixa.max + (faixa.max - faixa.min) * 1.6 };
    const cor = !tem ? 'var(--color-text)' : status === 'adequado' ? 'var(--color-text)' : 'var(--warn-400)';
    const left = pos(faixa.min, span), right = pos(faixa.max, span);
    const marcaLeft = pos(tem ? v : faixa.min, span);
    return `
      <div class="reading-card">
        <div class="reading-top">
          <div><div class="reading-name">${esc(t(par.nome))}</div><div class="reading-range">${esc(t('medir.faixa', { min: numFmt(faixa.min), max: numFmt(faixa.max), unidade: par.unidade ? ' ' + par.unidade : '' }))}</div></div>
          <input class="input reading-input" type="text" inputmode="decimal" placeholder="—" data-action="set-leitura" data-param="${par.id}" value="${raw == null ? '' : esc(raw)}" style="color:${cor}" />
        </div>
        <div class="reading-track">
          <div class="reading-fill" style="left:${left}%;width:${right - left}%"></div>
          <div class="reading-dot" style="left:calc(${marcaLeft}% - 6px);background:${cor};display:${tem ? 'block' : 'none'}"></div>
        </div>
      </div>`;
  }).join('');
}

function renderChoiceRows(pool, parametrosAtivos, produtos) {
  const rows = [];
  parametrosAtivos.forEach((par) => {
    const mapa = TIPOS_POR_DIRECAO[par.id];
    if (!mapa) return;
    if (par.id === 'cloro' && pool && pool.sistemaDesinfeccao === 'salino') return;
    ['subir', 'descer'].forEach((dir) => {
      const tipos = mapa[dir];
      if (!tipos || !tipos.length) return;
      const opts = produtosDe(produtos, tipos);
      if (!opts.length) return;
      const chave = par.id + ':' + dir;
      if (!state.escolhas[chave] || !opts.some((o) => o.id === state.escolhas[chave])) state.escolhas[chave] = opts[0].id;
      rows.push(`
        <div class="choice-row">
          <span class="choice-label">${esc((dir === 'subir' ? t('medir.subir') : t('medir.descer')) + t(par.nome))}</span>
          <select class="input" data-action="set-escolha" data-dir="${chave}">
            ${opts.map((o) => `<option value="${o.id}" ${state.escolhas[chave] === o.id ? 'selected' : ''}>${esc(o.nomeComercial)} (${pctFmt(o.concentracao)})</option>`).join('')}
          </select>
        </div>`);
    });
  });
  return rows.join('');
}

function renderScreenMedir() {
  const pools = state.piscinas;
  if (!pools.length) {
    return `
      <div class="screen-header"><div><div class="kicker">${esc(t('medir.kicker'))}</div><h2>${esc(t('medir.titulo'))}</h2></div></div>
      <p class="empty-note">${esc(t('medir.semPiscina'))}</p>`;
  }
  if (!state.medirPoolId || !pools.some((p) => p.id === state.medirPoolId)) state.medirPoolId = pools[0].id;
  const pool = piscinaPorId(state.medirPoolId);
  const produtos = state.produtos;
  const sistemaDesinfeccao = ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
  const parametrosAtivos = PARAMETROS.filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao);
  const preenchidos = Object.keys(state.leituras).filter((k) => parametrosAtivos.some((p) => p.id === k) && state.leituras[k] !== '' && state.leituras[k] != null).length;
  return `
    <div class="screen-header">
      <div><div class="kicker">${esc(t('medir.kicker'))}</div><h2>${esc(t('medir.titulo'))}</h2></div>
      <span style="font-size:11.5px;color:rgba(var(--color-text-rgb),.45)">${esc(t('medir.preenchidos', { n: preenchidos, m: parametrosAtivos.length }))}</span>
    </div>
    <div class="pool-select-row">
      <span class="pill-label">${esc(t('medir.piscina'))}</span>
      <select class="input" data-action="set-medir-pool">
        ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
      </select>
    </div>
    <div class="reading-grid">${renderReadingCards(pool, parametrosAtivos)}</div>
    <div class="choices-block">
      <div class="choices-title">${esc(t('medir.produtosParaCorrecoes'))}</div>
      ${renderChoiceRows(pool, parametrosAtivos, produtos)}
    </div>
    <p class="notice" style="margin-top:16px">${esc(t('medir.aviso'))}</p>
    <div style="margin-top:16px;display:flex;gap:10px">
      <button type="button" class="btn btn-primary" data-action="rodar-diagnostico" style="min-height:48px;flex:1;font-size:15px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('medir.calculando')) : esc(t('medir.calcularCorrecoes'))}</button>
    </div>`;
}

/* ── tela: resultado do diagnóstico ──────────────────────────────────────── */

function renderResultStep(p, i) {
  const tags = [];
  if (p.tempoEsperaHoras) tags.push(t('resultado.aguardar', { tempo: formatHoras(p.tempoEsperaHoras) }));
  const alerta = [p.limitesSeguranca].concat(p.avisos || []).filter(Boolean).map((k) => t(k)).join(' ');
  let doseTxt, produtoTxt;
  if (p.instrucaoOperacional) {
    doseTxt = '—'; produtoTxt = t(p.instrucaoOperacional);
  } else if (p.instrucaoGeradorSalino) {
    doseTxt = '—'; produtoTxt = t(p.instrucaoGeradorSalino);
  } else if (p.dose) {
    doseTxt = dose3Fmt(p.dose.valor) + ' ' + p.dose.unidade;
    produtoTxt = p.produto + (p.dose.densidadeAusente ? t('resultado.densidadeAusente') : '');
  } else {
    doseTxt = t('resultado.semDose');
    produtoTxt = t(SEM_PRODUTO_TEXTO[p.parametroId] || 'resultado.selecioneProduto');
  }
  const transicao = p.meta != null
    ? numFmt(p.valor) + ' → ' + numFmt(p.meta) + (p.unidade ? ' ' + p.unidade : '')
    : numFmt(p.valor) + (p.unidade ? ' ' + p.unidade : '') + ' (' + t(p.rotuloStatus) + ')';
  return `
    <div class="step-card">
      <div class="step-num">${i + 1}</div>
      <div class="step-body">
        <div class="step-head">
          <span class="step-name">${esc(t(p.nome))}</span>
          <span class="step-transition">${esc(transicao)}</span>
        </div>
        <div class="step-dose">${esc(doseTxt)}</div>
        <div class="step-product">${esc(produtoTxt)}</div>
        <p class="step-motive">${esc(p.motivo ? t(p.motivo) : '')}</p>
        ${tags.length ? `<div class="step-tags">${tags.map((tag) => `<span class="tag tag-neutral">${esc(tag)}</span>`).join('')}</div>` : ''}
        ${alerta ? `<div class="step-alert">${esc(alerta)}</div>` : ''}
      </div>
    </div>`;
}

function renderScreenResultado() {
  const r = state.resultado;
  if (!r) { state.screen = null; return renderScreenClientes(); }
  const pool = piscinaPorId(r.poolId);
  const cliente = pool ? clientePorId(pool.clienteId) : null;
  const passos = r.passos;
  const fora = passos.filter((p) => p.status !== 'adequado');
  const adequados = passos.filter((p) => p.status === 'adequado');
  const interdicaoPasso = fora.find((p) => p.parametroId === 'cloro');
  const itensChecklist = r.checklist;
  const semItens = itensChecklist.length === 0;
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-medir"><i class="ph ph-arrow-left"></i></button>
      <div style="flex:1">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(var(--color-text-rgb),.45)">${esc(cliente ? cliente.nome + ' · ' : '')}${esc(pool ? pool.nome : '')}</div>
        <div style="font-weight:500;font-size:19px;line-height:1.2">${esc(t('resultado.titulo'))}</div>
      </div>
      <button type="button" class="btn btn-ghost" data-action="baixar-pdf-resultado" style="font-size:12.5px"><i class="ph ph-file-pdf" style="font-size:16px"></i>${esc(t('common.pdf'))}</button>
    </div>
    ${interdicaoPasso ? `
    <div class="interdict-banner">
      <i class="ph ph-warning"></i>
      <div><div class="interdict-title">${esc(t('resultado.interditar'))}</div><div class="interdict-text">${esc(interdicaoPasso.limitesSeguranca ? t(interdicaoPasso.limitesSeguranca) : '')}</div></div>
    </div>` : ''}
    <div class="steps-list">
      ${fora.map((p, i) => renderResultStep(p, i)).join('')}
      ${adequados.length ? `<div class="divider-label"><span>${esc(t('resultado.dentroDaFaixa', { n: adequados.length, lista: adequados.map((p) => t(p.nome)).join(', ') }))}</span><span class="rule"></span></div>` : ''}
      ${(r.naoInformados || []).length ? `<div class="divider-label"><span>${esc(t('resultado.naoInformado', { lista: r.naoInformados.map((k) => t(k)).join(', ') }))}</span><span class="rule"></span></div>` : ''}
      ${passos.length === 0 ? `<p class="empty-note">${esc(t('resultado.nenhumaLeitura'))}</p>` : ''}
    </div>
    ${semItens ? '' : r.checklistAberto ? `
    <div class="checklist-card">
      <div style="font-weight:500;font-size:17px">${esc(t('resultado.produtosAplicados'))}</div>
      <p class="checklist-sub">${esc(t('resultado.confirmeQuantidade'))}</p>
      ${itensChecklist.map((c, i) => `
        <div class="checklist-row">
          <label class="radio"><input type="checkbox" data-action="toggle-checklist-item" data-idx="${i}" ${c.on ? 'checked' : ''} /><span class="dot"></span></label>
          <span class="checklist-label">${esc(c.passo.produto)} (${esc(t(c.passo.nome))})</span>
          <input class="input" type="text" inputmode="decimal" data-action="set-checklist-qtd" data-idx="${i}" value="${esc(c.qtd)}" />
          <span class="checklist-unit">${esc(c.passo.dose.unidade)}</span>
        </div>`).join('')}
      <button type="button" class="btn btn-primary btn-block" data-action="registrar-consumos" style="min-height:46px;margin-top:14px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('resultado.registrando')) : esc(t('resultado.registrarAplicados'))}</button>
    </div>` : `
    <div style="margin-top:16px;display:flex;gap:10px">
      <button type="button" class="btn btn-primary" data-action="abrir-checklist" style="min-height:48px;flex:1;font-size:15px">${esc(t('resultado.confirmarAplicacao'))}</button>
    </div>`}`;
}

/* ── tela: calculadora de sal ────────────────────────────────────────────── */

function renderScreenSal() {
  const pools = state.piscinas;
  if (!pools.length) {
    return `
      <div class="screen-header"><div><div class="kicker">${esc(t('sal.kicker'))}</div><h2>${esc(t('sal.titulo'))}</h2></div></div>
      <p class="empty-note">${esc(t('medir.semPiscina'))}</p>`;
  }
  if (!state.salPoolId || !pools.some((p) => p.id === state.salPoolId)) state.salPoolId = pools[0].id;
  const pool = piscinaPorId(state.salPoolId);
  const faixa = faixaSalDe(pool);
  const produtos = state.produtos;
  const opcoesSal = produtosDe(produtos, ['Sal para Piscina']);
  if ((!state.salProdutoId || !opcoesSal.some((o) => o.id === state.salProdutoId)) && opcoesSal.length) state.salProdutoId = opcoesSal[0].id;
  const avisoSistema = pool.sistemaDesinfeccao !== 'salino';
  const r = state.salResultado;
  let heroHtml = '';
  if (r) {
    const produto = produtos.find((p) => p.id === r.produtoId);
    const dose = produto ? quantidadeEmUnidadeDoProduto(r.kg, produto) : null;
    heroHtml = `
      <div class="sal-hero">
        <div class="sal-hero-kicker">${esc(t('sal.adicionar'))}</div>
        <div class="sal-hero-value">${dose ? dose3Fmt(dose.valor) + ' ' + dose.unidade : '—'}</div>
        <div class="sal-hero-product">${produto ? esc(produto.nomeComercial) + ' · ' + pctFmt(produto.concentracao) : ''}</div>
        <div class="sal-hero-detail">${esc(t('sal.detalhe', { atual: numFmt(r.atual), meta: numFmt(r.meta), variacao: numFmt(r.meta - r.atual), litros: nf(pool.litros, 0) }))}${dose && dose.densidadeAusente ? esc(t('resultado.densidadeAusente')) : ''}</div>
        <div class="sal-hero-actions">
          <span class="tag tag-neutral">${esc(t('sal.aguardar24h'))}</span>
          <button type="button" class="btn btn-primary" data-action="registrar-sal" style="min-height:42px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('sal.registrando')) : esc(t('sal.registrarCustos'))}</button>
        </div>
      </div>
      <p style="margin:10px 0 0;font-size:11.5px;line-height:1.5;color:rgba(var(--color-text-rgb),.5)">${esc(t('sal.ajudaDissolucao'))}</p>`;
  }
  return `
    <div class="screen-header"><div><div class="kicker">${esc(t('sal.kicker'))}</div><h2>${esc(t('sal.titulo'))}</h2></div></div>
    <p class="screen-subtitle">${esc(t('sal.subtitulo'))}</p>
    <div class="card" style="display:flex;flex-direction:column;gap:13px;margin-top:16px">
      <div class="field"><label>${esc(t('medir.piscina'))}</label>
        <select class="input" data-action="set-sal-pool">
          ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
        </select>
      </div>
      ${avisoSistema ? `<p class="notice-flat">${esc(t('sal.avisoSistema', { sistema: pool.sistemaDesinfeccao === 'ozonio' ? t('sistema.ozonio.curto') : t('sistema.manual.curto') }))}</p>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px">
        <div class="field"><label>${esc(t('sal.medidoAgora'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-sal-atual" value="${esc(state.salAtual)}" style="font-size:17px" /></div>
        <div class="field"><label>${esc(t('sal.idealDesejado'))}</label><input class="input" type="text" inputmode="decimal" placeholder="${esc(t('sal.metaPlaceholder', { min: numFmt(faixa.min), max: numFmt(faixa.max) }))}" data-action="set-sal-meta" value="${esc(state.salMeta)}" style="font-size:17px" /></div>
        <div class="field"><label>${esc(t('sal.produtoDeSal'))}</label>
          <select class="input" data-action="set-sal-produto">
            ${opcoesSal.map((o) => `<option value="${o.id}" ${state.salProdutoId === o.id ? 'selected' : ''}>${esc(o.nomeComercial)} (${pctFmt(o.concentracao)})</option>`).join('')}
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-primary" data-action="calcular-sal" style="min-height:46px;align-self:flex-start;padding-inline:18px">${esc(t('sal.calcularReposicao'))}</button>
    </div>
    ${heroHtml}`;
}

/* ── tela: histórico ─────────────────────────────────────────────────────── */

function renderHistoryItem(h) {
  const pool = piscinaPorId(h.piscinaId);
  const cliente = pool ? clientePorId(pool.clienteId) : null;
  const fora = h.passos.filter((p) => p.status !== 'adequado').length;
  const resumo = h.passos.map((p) => t(p.nome) + ' ' + numFmt(p.valor)).join(' · ');
  const aberto = !!state.histAbertos[h.id];
  const sistemaDesinfeccao = pool && ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
  const naoInformados = PARAMETROS
    .filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao)
    .filter((p) => h.leituras[p.id] == null)
    .map((p) => t(p.nome));
  return `
    <div class="history-item">
      <div class="history-top">
        <div><div class="history-date">${dataHoraFmt(h.data)}</div><div class="history-pool">${esc(cliente ? cliente.nome + ' — ' : '')}${esc(pool ? pool.nome : '—')}</div></div>
        <div class="history-tags">
          <span class="tag" style="${fora > 0 ? 'border:1px solid var(--warn-400);color:var(--warn-400)' : 'background:var(--color-accent-800);color:var(--color-accent-100)'}">${fora > 0 ? esc(t('historico.foraDaFaixa', { n: fora })) : esc(t('historico.tudoAdequado'))}</span>
          <button type="button" class="btn btn-ghost" data-action="baixar-pdf-historico" data-id="${h.id}" style="font-size:12.5px"><i class="ph ph-file-pdf" style="font-size:16px"></i>${esc(t('common.pdf'))}</button>
        </div>
      </div>
      <p class="history-summary">${esc(resumo)}${naoInformados.length ? ' · ' + esc(t('resultado.naoInformado', { lista: naoInformados.join(', ') })) : ''}</p>
      <button type="button" class="btn btn-ghost" data-action="alternar-historico" data-id="${h.id}" style="font-size:12.5px;margin-top:8px">${aberto ? esc(t('historico.ocultarPassos')) : esc(t('historico.verPassos'))}</button>
      ${aberto ? `<div class="history-steps">${h.passos.map((p) => {
        const v = historyStepView(p);
        return `<div class="history-step" style="box-shadow:inset 2px 0 0 ${v.marca}"><div class="history-step-title">${esc(v.titulo)}</div><div class="history-step-detail">${esc(v.detalhe)}</div></div>`;
      }).join('')}</div>` : ''}
    </div>`;
}

function renderHistoricoVisitas() {
  const pools = state.piscinas;
  let registros = state.histPoolId === 'todas' ? state.historico.slice() : state.historico.filter((h) => h.piscinaId === state.histPoolId);
  if (state.histData) registros = registros.filter((h) => h.data.slice(0, 10) === state.histData);
  registros.sort((a, b) => new Date(b.data) - new Date(a.data));
  return `
    <div class="filter-row">
      <div class="field" style="flex:1;min-width:180px"><label>${esc(t('historico.piscina'))}</label>
        <select class="input" data-action="set-hist-pool">
          <option value="todas" ${state.histPoolId === 'todas' ? 'selected' : ''}>${esc(t('common.todasAsPiscinas'))}</option>
          ${pools.map((p) => `<option value="${p.id}" ${state.histPoolId === p.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:0 1 170px"><label>${esc(t('historico.filtrarData'))}</label><input class="input" type="date" data-action="set-hist-data" value="${esc(state.histData)}" /></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:11px">
      ${registros.map(renderHistoryItem).join('')}
      ${!registros.length ? `<p class="empty-note">${esc(t('historico.nenhumRelatorio'))}</p>` : ''}
    </div>`;
}

const PERIODOS_EVOLUCAO = ['30', '90', '180', '365', 'todos'];
const ROTULO_TENDENCIA = { estavel: 'evolucao.estavel', melhorando: 'evolucao.melhorando', recorrente: 'evolucao.recorrente' };
const COR_TENDENCIA = { estavel: 'var(--color-accent)', melhorando: 'var(--color-accent)', recorrente: 'var(--warn-400)' };

// Compartilhado entre a aba Evolução (janela rolante de dias) e a pré-visualização do
// Relatório mensal (um mês fechado) — mesmo cartão, muda só o conjunto de registros de entrada.
function renderCardEvolucaoParametro(parametro, faixa, pontos, resumo) {
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
        <div style="font-weight:500;font-size:15px">${esc(t(parametro.nome))}</div>
        <span style="font-size:11.5px;color:${COR_TENDENCIA[resumo.tendencia]}">${esc(t(ROTULO_TENDENCIA[resumo.tendencia]))}</span>
      </div>
      <div style="font-size:11.5px;color:rgba(var(--color-text-rgb),.55);margin-top:2px">${esc(t('evolucao.dentroDeTotal', { dentro: resumo.dentro, total: resumo.total }))} · ${esc(t('medir.faixa', { min: numFmt(faixa.min), max: numFmt(faixa.max), unidade: parametro.unidade ? ' ' + parametro.unidade : '' }))}</div>
      <div style="margin-top:10px">${svgGraficoLinha(pontos, faixa, (v) => numFmt(v))}</div>
    </div>`;
}

function parametrosComDadosDe(pool, registros) {
  const sistemaDesinfeccao = ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
  return PARAMETROS
    .filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao)
    .map((p) => {
      const faixa = p.id === 'sal' ? faixaSalDe(pool) : p.faixa;
      const pontos = pontosEvolucao(registros, p.id, faixa);
      return { parametro: p, faixa, pontos, resumo: resumoEvolucao(pontos) };
    })
    .filter((x) => x.pontos.length > 0);
}

function renderHistoricoEvolucao() {
  const pools = state.piscinas;
  if (!pools.length) return `<p class="empty-note">${esc(t('medir.semPiscina'))}</p>`;
  if (!state.evolPoolId || !pools.some((p) => p.id === state.evolPoolId)) state.evolPoolId = pools[0].id;
  const pool = piscinaPorId(state.evolPoolId);

  let registros = state.historico.filter((h) => h.piscinaId === pool.id);
  if (state.evolPeriodo !== 'todos') {
    const corte = Date.now() - Number(state.evolPeriodo) * 86400000;
    registros = registros.filter((h) => new Date(h.data).getTime() >= corte);
  }
  registros = registros.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
  const parametrosComDados = parametrosComDadosDe(pool, registros);

  return `
    <div class="filter-row">
      <div class="field" style="flex:1;min-width:180px"><label>${esc(t('medir.piscina'))}</label>
        <select class="input" data-action="set-evol-pool">
          ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:0 1 170px"><label>${esc(t('evolucao.periodo'))}</label>
        <select class="input" data-action="set-evol-periodo">
          ${PERIODOS_EVOLUCAO.map((p) => `<option value="${p}" ${state.evolPeriodo === p ? 'selected' : ''}>${esc(t('evolucao.periodo.' + p))}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:14px">
      ${parametrosComDados.map(({ parametro, faixa, pontos, resumo }) => renderCardEvolucaoParametro(parametro, faixa, pontos, resumo)).join('')}
      ${!parametrosComDados.length ? `<p class="empty-note">${esc(t('evolucao.semDados'))}</p>` : ''}
    </div>`;
}

function mesesDisponiveisDe(poolId) {
  const chaves = [...new Set(state.historico.filter((h) => h.piscinaId === poolId).map((h) => h.data.slice(0, 7)))];
  return chaves.sort().reverse();
}

function rotuloMes(mesChave) {
  const [ano, mes] = mesChave.split('-').map(Number);
  const texto = new Date(ano, mes - 1, 1).toLocaleDateString(numLocale(), { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function registrosDoMes(poolId, mesChave) {
  return state.historico
    .filter((h) => h.piscinaId === poolId && h.data.slice(0, 7) === mesChave)
    .sort((a, b) => new Date(a.data) - new Date(b.data));
}

function ocorrenciasDe(registros) {
  const lista = [];
  registros.forEach((r) => {
    (r.passos || []).filter((p) => p.status !== 'adequado').forEach((p) => lista.push({ data: r.data, passo: p }));
  });
  return lista;
}

function renderHistoricoRelatorios() {
  const pools = state.piscinas;
  if (!pools.length) return `<p class="empty-note">${esc(t('medir.semPiscina'))}</p>`;
  if (!state.relPoolId || !pools.some((p) => p.id === state.relPoolId)) state.relPoolId = pools[0].id;
  const pool = piscinaPorId(state.relPoolId);
  const cliente = clientePorId(pool.clienteId);
  const meses = mesesDisponiveisDe(pool.id);

  const seletorPiscina = `
    <div class="field" style="flex:1;min-width:180px"><label>${esc(t('medir.piscina'))}</label>
      <select class="input" data-action="set-rel-pool">
        ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
      </select>
    </div>`;

  if (!meses.length) {
    return `<div class="filter-row">${seletorPiscina}</div><p class="empty-note" style="margin-top:14px">${esc(t('relatorio.semMeses'))}</p>`;
  }
  if (!state.relMes || !meses.includes(state.relMes)) state.relMes = meses[0];

  const registros = registrosDoMes(pool.id, state.relMes);
  const parametrosComDados = parametrosComDadosDe(pool, registros);
  const ocorrencias = ocorrenciasDe(registros);

  return `
    <div class="filter-row">
      ${seletorPiscina}
      <div class="field" style="flex:0 1 200px"><label>${esc(t('relatorio.mes'))}</label>
        <select class="input" data-action="set-rel-mes">
          ${meses.map((m) => `<option value="${m}" ${state.relMes === m ? 'selected' : ''}>${esc(rotuloMes(m))}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div style="font-weight:500;font-size:15px">${esc(cliente ? cliente.nome + ' — ' : '')}${esc(pool.nome)}</div>
      <div style="font-size:11.5px;color:rgba(var(--color-text-rgb),.55);margin-top:2px">${esc(rotuloMes(state.relMes))}</div>
      <div style="margin-top:10px;font-size:13px">${esc(t('relatorio.medicoesRegistradas', { n: registros.length }))}</div>
      <button type="button" class="btn btn-primary" data-action="baixar-relatorio-mensal" data-poolid="${pool.id}" data-mes="${state.relMes}" style="margin-top:12px;min-height:44px">
        <i class="ph ph-file-pdf"></i> ${esc(t('relatorio.baixar'))}
      </button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:14px">
      ${parametrosComDados.map(({ parametro, faixa, pontos, resumo }) => renderCardEvolucaoParametro(parametro, faixa, pontos, resumo)).join('')}
    </div>
    ${ocorrencias.length ? `
    <div class="divider-label" style="margin-top:18px"><span>${esc(t('relatorio.ocorrencias'))}</span><span class="rule"></span></div>
    <div style="display:flex;flex-direction:column;gap:1px">
      ${ocorrencias.map((o) => `<div class="cost-row"><div class="cost-name">${esc(t(o.passo.nome))}</div><div class="cost-detail">${dataHoraFmt(o.data)} · ${esc(t(o.passo.rotuloStatus))} (${numFmt(o.passo.valor)})</div></div>`).join('')}
    </div>` : ''}`;
}

function renderScreenHistorico() {
  const sub = state.histSubTab || 'visitas';
  return `
    <div class="screen-header"><div><div class="kicker">${esc(t('historico.kicker'))}</div><h2>${esc(t('historico.titulo'))}</h2></div></div>
    <div class="auth-tabs" style="max-width:420px;margin-bottom:16px">
      <button type="button" class="auth-tab${sub === 'visitas' ? ' ativa' : ''}" data-action="set-hist-subtab" data-sub="visitas">${esc(t('historico.abaVisitas'))}</button>
      <button type="button" class="auth-tab${sub === 'evolucao' ? ' ativa' : ''}" data-action="set-hist-subtab" data-sub="evolucao">${esc(t('historico.abaEvolucao'))}</button>
      <button type="button" class="auth-tab${sub === 'relatorios' ? ' ativa' : ''}" data-action="set-hist-subtab" data-sub="relatorios">${esc(t('historico.abaRelatorios'))}</button>
    </div>
    ${sub === 'evolucao' ? renderHistoricoEvolucao() : sub === 'relatorios' ? renderHistoricoRelatorios() : renderHistoricoVisitas()}`;
}

/* ── tela: custos ────────────────────────────────────────────────────────── */

function renderScreenCustos() {
  const pools = state.piscinas;
  const produtos = state.produtos;
  const consumos = state.consumos.filter((c) => state.custoPoolId === 'todas' || c.piscinaId === state.custoPoolId);
  const agrupado = {};
  consumos.forEach((c) => {
    const k = c.produtoId || c.produtoNome;
    if (!agrupado[k]) agrupado[k] = { nome: c.produtoNome, qtd: 0, unidade: c.unidade, produto: produtos.find((p) => p.id === c.produtoId) };
    agrupado[k].qtd += c.quantidade;
  });
  const porProduto = Object.values(agrupado).map((g) => {
    const preco = g.produto && g.produto.preco;
    return {
      nome: g.nome,
      detalhe: dose3Fmt(g.qtd) + ' ' + g.unidade + (preco ? ' · ' + moeda(preco) + '/' + g.unidade : ' · ' + t('custos.semPrecoCadastrado')),
      total: preco ? moeda(preco * g.qtd) : '—',
    };
  });
  const porMes = {};
  consumos.forEach((c) => {
    const produto = produtos.find((p) => p.id === c.produtoId);
    if (!produto || !produto.preco) return;
    const k = c.data.slice(0, 7);
    porMes[k] = (porMes[k] || 0) + produto.preco * c.quantidade;
  });
  const chaves = Object.keys(porMes).sort();
  const maxMes = Math.max(1, ...chaves.map((k) => porMes[k]));
  const localeMes = numLocale();
  const meses = chaves.map((k) => {
    const [y, m] = k.split('-');
    return {
      rotulo: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(localeMes, { month: 'short' }).replace('.', ''),
      total: moeda(porMes[k]),
      altura: Math.max(6, Math.round((porMes[k] / maxMes) * 100)),
    };
  });
  const totalGeral = chaves.reduce((a, k) => a + porMes[k], 0);

  // Custo médio por visita: total gasto (só produtos com preço cadastrado) dividido pelo
  // número de medições registradas pra essa mesma piscina/filtro — "visita" aqui é sinônimo
  // de medição, que é o que o app já registra a cada diagnóstico salvo.
  const numVisitas = state.historico.filter((h) => state.custoPoolId === 'todas' || h.piscinaId === state.custoPoolId).length;
  const custoMedioPorVisita = numVisitas > 0 ? moeda(totalGeral / numVisitas) : '—';

  // Tendência mês a mês: compara o último mês com dado contra o mês anterior a ele.
  let tendenciaTexto = null;
  if (chaves.length >= 2) {
    const ultimo = porMes[chaves[chaves.length - 1]];
    const penultimo = porMes[chaves[chaves.length - 2]];
    if (penultimo > 0) {
      const variacaoPct = Math.round(((ultimo - penultimo) / penultimo) * 100);
      tendenciaTexto = variacaoPct > 2 ? t('custos.aumentou', { pct: variacaoPct })
        : variacaoPct < -2 ? t('custos.diminuiu', { pct: Math.abs(variacaoPct) })
        : t('custos.estavelMes');
    }
  }

  return `
    <div class="screen-header"><div><div class="kicker">${esc(t('custos.kicker'))}</div><h2>${esc(t('custos.titulo'))}</h2></div></div>
    <p class="screen-subtitle">${esc(t('custos.subtitulo'))}</p>
    <div class="field" style="max-width:320px;margin:16px 0"><label>${esc(t('custos.filtrarPiscina'))}</label>
      <select class="input" data-action="set-custo-pool">
        <option value="todas" ${state.custoPoolId === 'todas' ? 'selected' : ''}>${esc(t('common.todasAsPiscinas'))}</option>
        ${pools.map((p) => `<option value="${p.id}" ${state.custoPoolId === p.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px">
      <div class="card stat-tile"><div class="stat-tile-value" style="font-size:20px">${custoMedioPorVisita}</div><div class="stat-tile-label">${esc(t('custos.custoMedioPorVisita'))}</div></div>
      <div class="card stat-tile"><div class="stat-tile-value" style="font-size:20px">${tendenciaTexto ? esc(tendenciaTexto) : '—'}</div><div class="stat-tile-label">${esc(t('custos.tendenciaMensal'))}</div></div>
    </div>
    <div class="divider-label"><span>${esc(t('custos.totalPorProduto'))}</span><span class="rule"></span></div>
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:24px">
      ${porProduto.map((p) => `<div class="cost-row"><div><div class="cost-name">${esc(p.nome)}</div><div class="cost-detail">${esc(p.detalhe)}</div></div><div class="cost-total">${esc(p.total)}</div></div>`).join('')}
      ${!porProduto.length ? `<p style="margin:0;font-size:13px;color:rgba(var(--color-text-rgb),.6)">${esc(t('custos.nenhumConsumo'))}</p>` : ''}
    </div>
    ${meses.length ? `
    <div class="divider-label"><span>${esc(t('custos.totalPorMes'))}</span><span class="rule"></span></div>
    <div class="bar-chart">
      <div class="bar-chart-row">
        ${meses.map((m) => `<div class="bar-chart-col"><span class="bar-chart-total">${esc(m.total)}</span><div class="bar-chart-bar" style="height:${m.altura}%"></div><span class="bar-chart-label">${esc(m.rotulo)}</span></div>`).join('')}
      </div>
    </div>
    <div class="cost-total-row"><span class="lbl">${esc(t('custos.totalGeral'))}</span><span class="val">${moeda(totalGeral)}</span></div>` : ''}`;
}

/* ── tela: produtos ──────────────────────────────────────────────────────── */

function renderScreenProdutos() {
  const produtos = state.produtos;
  const categorias = categoriasDisponiveis(produtos);
  if (!state.catAtiva || !categorias.includes(state.catAtiva)) state.catAtiva = categorias[0] || null;
  const produtosVisiveis = produtos.filter((p) => p.tipo === state.catAtiva);
  const np = state.novoProduto || (state.novoProduto = novoProdutoVazio());
  const template = TEMPLATES_PRODUTO.find((tp) => tp.tipo === np.tipo);
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-clientes"><i class="ph ph-arrow-left"></i></button>
      <h4>${esc(t('produtos.titulo'))}</h4>
      <button type="button" class="btn btn-primary" data-action="toggle-form-produto">${state.produtoFormAberto ? esc(t('produtos.fechar')) : esc(t('produtos.novoProduto'))}</button>
    </div>
    ${state.produtoFormAberto ? `
    <div class="product-form-grid">
      <div class="field"><label>${esc(t('produtos.tipoProduto'))}</label>
        <select class="input" data-action="set-np-tipo">
          ${TEMPLATES_PRODUTO.map((tp) => `<option value="${esc(tp.tipo)}" ${np.tipo === tp.tipo ? 'selected' : ''}>${esc(tp.tipo)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>${esc(t('produtos.nomeComercial'))}</label><input class="input" type="text" placeholder="${esc(t('produtos.nomeComercialPlaceholder'))}" data-action="set-np-nome" value="${esc(np.nome)}" /></div>
      <div class="field"><label>${esc(t('produtos.fabricanteMarca'))}</label><input class="input" type="text" placeholder="${esc(t('produtos.fabricanteMarcaPlaceholder'))}" data-action="set-np-marca" value="${esc(np.marca)}" /></div>
      <div class="field"><label>${esc(t('produtos.principioAtivo'))}</label><input class="input" type="text" data-action="set-np-principio" value="${esc(np.principio)}" /></div>
      <div class="field"><label>${esc(t('produtos.concentracao'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-np-concentracao" value="${esc(np.concentracao)}" /></div>
      <div class="field"><label>${esc(t('produtos.precoPor', { unidade: np.estado === 'liquido' ? 'L' : 'kg' }))}</label><input class="input" type="text" inputmode="decimal" placeholder="${esc(t('produtos.precoPlaceholder'))}" data-action="set-np-preco" value="${esc(np.preco)}" /></div>
      <div class="field"><label>${esc(t('produtos.estadoFisico'))}</label>
        <span class="seg">
          <label class="seg-opt"><input type="radio" name="estado" data-action="set-np-estado" data-tipo="solido" ${np.estado === 'solido' ? 'checked' : ''} />${esc(t('produtos.solido'))}</label>
          <label class="seg-opt"><input type="radio" name="estado" data-action="set-np-estado" data-tipo="liquido" ${np.estado === 'liquido' ? 'checked' : ''} />${esc(t('produtos.liquido'))}</label>
        </span>
      </div>
      ${np.estado === 'liquido' ? `<div class="field"><label>${esc(t('produtos.densidade'))}</label><input class="input" type="text" inputmode="decimal" data-action="set-np-densidade" value="${esc(np.densidade)}" /></div>` : ''}
      ${template && template.aviso ? `<p class="notice-flat span-all">${esc(template.aviso)}</p>` : ''}
      <div class="span-all" style="display:flex;gap:9px">
        <button type="button" class="btn btn-primary" data-action="salvar-produto" style="min-height:46px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? esc(t('common.salvando')) : esc(t('produtos.salvar'))}</button>
      </div>
    </div>` : ''}
    <div class="category-row">
      ${categorias.map((tipo) => {
        const contagem = produtos.filter((p) => p.tipo === tipo).length;
        return `<button type="button" class="category-pill${state.catAtiva === tipo ? ' ativa' : ''}" data-action="pick-categoria" data-tipo="${esc(tipo)}">${esc(tipo)}<span class="tag tag-neutral">${contagem}</span></button>`;
      }).join('')}
    </div>
    <div class="product-grid">
      ${produtosVisiveis.map((p) => `
        <div class="product-card">
          <div class="product-card-top"><div class="product-card-name">${esc(p.nomeComercial)}</div><span class="tag tag-accent">${pctFmt(p.concentracao)}</span></div>
          <div class="product-card-detail">${[esc(p.marca), esc(p.principioAtivo), p.estadoFisico === 'liquido' ? esc(t('produtos.liquido').toLowerCase()) : esc(t('produtos.solido').toLowerCase()), p.preco ? moeda(p.preco) + '/' + (p.estadoFisico === 'liquido' ? 'L' : 'kg') : null].filter(Boolean).join(' · ')}</div>
          <div class="product-card-source">${esc(p.fonte || '')}</div>
          <div class="product-card-actions"><button type="button" class="btn btn-ghost" data-action="excluir-produto" data-id="${p.id}" style="font-size:12px">${esc(t('produtos.excluir'))}</button></div>
        </div>`).join('')}
      ${!produtosVisiveis.length ? `<p class="empty-note">${esc(t('produtos.nenhumNaCategoria'))}</p>` : ''}
    </div>`;
}

/* ── ações ───────────────────────────────────────────────────────────────── */

const actions = {
  // preferências (tema/idioma) — não fazem parte do `state`, sobrevivem ao logout
  'alternar-tema': () => { definirTema(tema === 'dark' ? 'light' : 'dark'); },
  'ciclar-idioma': () => {
    const i = IDIOMAS_SUPORTADOS.indexOf(idioma);
    definirIdioma(IDIOMAS_SUPORTADOS[(i + 1) % IDIOMAS_SUPORTADOS.length]);
  },
  'pedir-notificacoes': () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(t('notif.tituloAtivado'), { body: t('notif.corpoAtivado') });
      return;
    }
    return Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification(t('notif.tituloAtivado'), { body: t('notif.corpoAtivado') });
    });
  },

  // navegação
  'nav-go': (el) => { state.tab = el.dataset.tab; state.screen = null; },
  'voltar-clientes': () => { state.screen = null; state.tab = 'clientes'; },
  'voltar-cliente-detalhe': () => { state.screen = 'cliente-detalhe'; },
  'voltar-medir': () => { state.screen = null; state.tab = 'medir'; state.resultado = null; },
  'ir-produtos': () => { state.screen = 'produtos'; },

  // clientes
  'ir-cadastro-cliente': () => { state.screen = 'cadastro-cliente'; state.formCliente = formClienteVazio(null); },
  'ir-editar-cliente': (el) => { state.screen = 'cadastro-cliente'; state.formCliente = formClienteVazio(clientePorId(el.dataset.id)); },
  'abrir-cliente': (el) => { state.screen = 'cliente-detalhe'; state.clienteAtualId = el.dataset.id; },
  'set-cliente-nome': (el) => { state.formCliente.nome = el.value; },
  'set-cliente-telefone': (el) => { state.formCliente.telefone = el.value; },
  'set-cliente-email': (el) => { state.formCliente.email = el.value; },
  'set-cliente-endereco': (el) => { state.formCliente.endereco = el.value; },
  'set-cliente-observacoes': (el) => { state.formCliente.observacoes = el.value; },
  'salvar-cliente': async () => {
    const f = state.formCliente;
    if (!f.nome.trim()) { toast(t('clienteForm.deNomeAoCliente')); return; }
    await DB.salvarCliente({
      id: f.id, nome: f.nome.trim(), telefone: f.telefone.trim(), email: f.email.trim(),
      endereco: f.endereco.trim(), observacoes: f.observacoes.trim(),
    });
    state.clientes = await DB.listarClientes();
    state.screen = null; state.tab = 'clientes'; state.formCliente = null;
    toast(f.id ? t('clienteForm.atualizado') : t('clienteForm.cadastrado'));
  },
  'excluir-cliente': async (el) => {
    if (!confirm(t('clienteForm.confirmarExcluir'))) return;
    await DB.excluirCliente(el.dataset.id);
    const [clientes, piscinas, historico, consumos] = await Promise.all([
      DB.listarClientes(), DB.listarPiscinas(), DB.listarTodoHistorico(), DB.listarConsumos(),
    ]);
    state.clientes = clientes; state.piscinas = piscinas; state.historico = historico; state.consumos = consumos;
    state.screen = null; state.tab = 'clientes'; state.formCliente = null;
    toast(t('clienteForm.excluido'));
  },

  // piscinas
  'ir-cadastro-piscina': () => { state.screen = 'cadastro-piscina'; state.formPiscina = formVazio(null); },
  'editar-piscina': (el) => {
    const pool = piscinaPorId(el.dataset.id);
    state.screen = 'cadastro-piscina'; state.clienteAtualId = pool.clienteId; state.formPiscina = formVazio(pool);
  },
  'medir-piscina': (el) => { state.tab = 'medir'; state.screen = null; state.medirPoolId = el.dataset.id; state.leituras = {}; },
  'set-nome': (el) => { state.formPiscina.nome = el.value; },
  'set-sistema': (el) => { state.formPiscina.sistema = el.dataset.tipo; },
  'set-sal-min': (el) => { state.formPiscina.salMin = el.value; },
  'set-sal-max': (el) => { state.formPiscina.salMax = el.value; },
  'set-unidade': (el) => { state.formPiscina.unidade = el.dataset.tipo; },
  'set-proxima-visita': (el) => { state.formPiscina.proximaVisita = el.value; },
  'set-modo-prof': (el) => { state.formPiscina.modoProf = el.dataset.tipo; },
  'set-prof': (el) => { state.formPiscina.prof = el.value; },
  'set-prof-min': (el) => { state.formPiscina.profMin = el.value; },
  'set-prof-max': (el) => { state.formPiscina.profMax = el.value; },
  'set-litros-manuais': (el) => { state.formPiscina.litrosManuais = el.value; },
  'set-formato': (el) => {
    const formato = el.value;
    const f = state.formPiscina;
    f.formato = formato;
    if (formato === 'irregular') {
      // nada a fazer — usa litrosManuais
    } else if (formato === 'composta') {
      if (!f.formas.length) f.formas = [{ tipo: 'retangular', comprimento: '', largura: '', diametro: '' }];
    } else {
      const atual = f.formas[0] || {};
      f.formas = [{ tipo: formato, comprimento: atual.comprimento || '', largura: atual.largura || '', diametro: atual.diametro || '' }];
    }
  },
  'set-forma-campo': (el) => {
    const i = Number(el.dataset.idx), campo = el.dataset.campo;
    state.formPiscina.formas[i] = Object.assign({}, state.formPiscina.formas[i], { [campo]: el.value });
  },
  'add-forma': (el) => { state.formPiscina.formas.push({ tipo: el.dataset.tipo, comprimento: '', largura: '', diametro: '' }); },
  'remover-forma': (el) => { state.formPiscina.formas.splice(Number(el.dataset.idx), 1); },
  'salvar-piscina': async () => {
    const f = state.formPiscina;
    if (!f.nome.trim()) { toast(t('piscinaForm.deNomeAPiscina')); return; }
    const calc = litragemPreview(f);
    if (!calc.ok) { toast(t('piscinaForm.confiraMedidas')); return; }
    const registro = {
      id: f.id, clienteId: state.clienteAtualId, nome: f.nome.trim(), sistemaDesinfeccao: f.sistema,
      faixaSal: f.sistema === 'salino' && (f.salMin || f.salMax) ? { min: Number(f.salMin) || undefined, max: Number(f.salMax) || undefined } : null,
      formato: f.formato, unidade: f.unidade, modoProf: f.modoProf,
      prof: f.formato !== 'irregular' ? f.prof : null, profMin: f.formato !== 'irregular' ? f.profMin : null, profMax: f.formato !== 'irregular' ? f.profMax : null,
      formas: f.formato !== 'irregular' ? f.formas : [],
      litros: calc.litros, aproximado: !!calc.aproximado,
      litrosManuais: f.formato === 'irregular' ? f.litrosManuais : null,
      proximaVisita: f.proximaVisita || null,
    };
    await DB.salvarPiscina(registro);
    state.piscinas = await DB.listarPiscinas();
    state.screen = 'cliente-detalhe'; state.formPiscina = null;
    toast(f.id ? t('piscinaForm.atualizada') : t('piscinaForm.cadastradaCom', { litros: Math.round(calc.litros).toLocaleString(numLocale()) }));
  },
  'excluir-piscina': async (el) => {
    if (!confirm(t('piscinaForm.confirmarExcluir'))) return;
    const id = el.dataset.id;
    await DB.excluirPiscina(id);
    const [piscinas, historico, consumos] = await Promise.all([DB.listarPiscinas(), DB.listarTodoHistorico(), DB.listarConsumos()]);
    state.piscinas = piscinas; state.historico = historico; state.consumos = consumos;
    if (state.medirPoolId === id) state.medirPoolId = null;
    if (state.salPoolId === id) state.salPoolId = null;
    if (state.histPoolId === id) state.histPoolId = 'todas';
    if (state.custoPoolId === id) state.custoPoolId = 'todas';
    state.screen = 'cliente-detalhe'; state.formPiscina = null;
    toast(t('piscinaForm.excluida'));
  },

  // medir / resultado
  'set-medir-pool': (el) => { state.medirPoolId = el.value; state.leituras = {}; },
  'set-leitura': (el) => { state.leituras[el.dataset.param] = el.value; },
  'set-escolha': (el) => { state.escolhas[el.dataset.dir] = el.value; },
  'rodar-diagnostico': async () => {
    const pool = piscinaPorId(state.medirPoolId);
    if (!pool) { toast(t('medir.cadastrePiscina')); return; }
    const sistemaDesinfeccao = ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
    const parametrosAtivos = PARAMETROS.filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao);
    const leituras = {};
    parametrosAtivos.forEach((p) => {
      const raw = state.leituras[p.id];
      if (raw !== '' && raw != null && Number.isFinite(Number(raw))) leituras[p.id] = Number(raw);
    });
    if (Object.keys(leituras).length === 0) { toast(t('medir.informeLeitura')); return; }

    const produtos = state.produtos;
    const produtosPorParametro = {};
    Object.keys(TIPOS_POR_DIRECAO).forEach((paramId) => {
      produtosPorParametro[paramId] = {
        subir: produtoPorId(produtos, state.escolhas[paramId + ':subir']),
        descer: produtoPorId(produtos, state.escolhas[paramId + ':descer']),
      };
    });

    const faixasCustom = {};
    if (pool.faixaSal) {
      const padrao = PARAMETROS.find((p) => p.id === 'sal').faixa;
      faixasCustom.sal = { min: pool.faixaSal.min ?? padrao.min, max: pool.faixaSal.max ?? padrao.max };
    }

    const passos = diagnosticar(leituras, pool.litros, produtosPorParametro, { sistemaDesinfeccao, faixasCustom });
    const registro = await DB.registrarDiagnostico(pool.id, leituras, passos);
    state.historico = await DB.listarTodoHistorico();
    const checklist = passos
      .filter((p) => p.status !== 'adequado' && p.produtoId && p.dose)
      .map((p) => ({ on: true, qtd: p.dose.valor.toFixed(3), passo: p }));
    // Parâmetros sem leitura não entram no cálculo (diagnosticar() já os ignora), mas
    // continuam aparecendo no resultado como "não informado" em vez de somem sem explicação.
    const naoInformados = parametrosAtivos.filter((p) => leituras[p.id] == null).map((p) => p.nome);

    state.resultado = { poolId: pool.id, registro, passos, checklist, checklistAberto: false, naoInformados };
    state.screen = 'resultado';
  },
  'baixar-pdf-resultado': () => {
    const r = state.resultado;
    const pool = piscinaPorId(r.poolId);
    gerarPdfDiagnostico(pool, r.registro);
  },
  'baixar-pdf-historico': (el) => {
    const registro = state.historico.find((h) => h.id === el.dataset.id);
    const pool = registro ? piscinaPorId(registro.piscinaId) : null;
    if (pool && registro) gerarPdfDiagnostico(pool, registro);
  },
  'abrir-checklist': () => { state.resultado.checklistAberto = true; },
  'toggle-checklist-item': (el) => { state.resultado.checklist[Number(el.dataset.idx)].on = el.checked; },
  'set-checklist-qtd': (el) => { state.resultado.checklist[Number(el.dataset.idx)].qtd = el.value; },
  'registrar-consumos': async () => {
    const r = state.resultado;
    const pool = piscinaPorId(r.poolId);
    const itens = r.checklist.filter((c) => c.on && Number(c.qtd) > 0).map((c) => ({
      piscinaId: pool.id, diagnosticoId: r.registro.id, produtoId: c.passo.produtoId,
      produtoNome: c.passo.produto, quantidade: Number(c.qtd), unidade: c.passo.dose.unidade,
    }));
    if (itens.length === 0) { toast(t('resultado.marqueProduto')); return; }
    await DB.registrarConsumos(itens);
    state.consumos = await DB.listarConsumos();
    state.screen = null; state.tab = 'custos'; state.resultado = null;
    toast(t('resultado.produtosRegistrados', { n: itens.length }));
  },

  // histórico
  'set-hist-pool': (el) => { state.histPoolId = el.value; },
  'set-hist-data': (el) => { state.histData = el.value; },
  'alternar-historico': (el) => { state.histAbertos[el.dataset.id] = !state.histAbertos[el.dataset.id]; },
  'set-hist-subtab': (el) => { state.histSubTab = el.dataset.sub; },
  'set-evol-pool': (el) => { state.evolPoolId = el.value; },
  'set-evol-periodo': (el) => { state.evolPeriodo = el.value; },
  'set-rel-pool': (el) => { state.relPoolId = el.value; state.relMes = ''; },
  'set-rel-mes': (el) => { state.relMes = el.value; },
  'baixar-relatorio-mensal': (el) => {
    const pool = piscinaPorId(el.dataset.poolid);
    const cliente = clientePorId(pool.clienteId);
    const registros = registrosDoMes(pool.id, el.dataset.mes);
    gerarRelatorioMensal(cliente, pool, el.dataset.mes, registros);
  },

  // painel
  'ver-medicao-painel': (el) => {
    state.tab = 'historico'; state.screen = null; state.histSubTab = 'visitas';
    state.histPoolId = el.dataset.poolid;
    state.histAbertos[el.dataset.id] = true;
  },

  // custos
  'set-custo-pool': (el) => { state.custoPoolId = el.value; },

  // sal
  'set-sal-pool': (el) => {
    state.salPoolId = el.value;
    state.salResultado = null;
  },
  'set-sal-atual': (el) => { state.salAtual = el.value; state.salResultado = null; },
  'set-sal-meta': (el) => { state.salMeta = el.value; state.salResultado = null; },
  'set-sal-produto': (el) => { state.salProdutoId = el.value; state.salResultado = null; },
  'calcular-sal': () => {
    const pool = piscinaPorId(state.salPoolId);
    // Number('') === 0, que passaria como "válido" no isFinite — checa a string vazia à parte,
    // senão deixar os campos em branco calculava com 0 em vez de pedir pra informar o valor.
    const atualStr = state.salAtual.trim();
    const metaStr = state.salMeta.trim();
    const atual = Number(atualStr);
    const meta = Number(metaStr);
    const produtos = state.produtos;
    const produto = produtos.find((p) => p.id === state.salProdutoId) || produtosDe(produtos, ['Sal para Piscina'])[0] || null;
    if (!pool || !produto || atualStr === '' || !Number.isFinite(atual)) { toast(t('sal.informeMedidoEPiscina')); return; }
    if (metaStr === '' || !Number.isFinite(meta)) { toast(t('sal.informeIdeal')); return; }
    if (meta <= atual) { toast(t('sal.metaJaAtingida')); return; }
    const kg = calcularDose({ variacao: meta - atual, volumeLitros: pool.litros, concentracaoPercentual: produto.concentracao });
    if (kg == null) { toast(t('sal.naoFoiPossivelCalcular')); return; }
    state.salResultado = { kg, atual, meta, produtoId: produto.id };
  },
  'registrar-sal': async () => {
    const r = state.salResultado;
    if (!r) return;
    const pool = piscinaPorId(state.salPoolId);
    const produto = state.produtos.find((p) => p.id === r.produtoId);
    const dose = quantidadeEmUnidadeDoProduto(r.kg, produto);
    await DB.registrarConsumos([{
      piscinaId: pool.id, diagnosticoId: null, produtoId: produto.id,
      produtoNome: produto.nomeComercial, quantidade: dose.valor, unidade: dose.unidade,
    }]);
    state.consumos = await DB.listarConsumos();
    state.salResultado = null;
    toast(t('sal.repoRegistrada'));
  },

  // produtos
  'pick-categoria': (el) => { state.catAtiva = el.dataset.tipo; },
  'toggle-form-produto': () => {
    state.produtoFormAberto = !state.produtoFormAberto;
    if (state.produtoFormAberto) state.novoProduto = novoProdutoVazio();
  },
  'set-np-tipo': (el) => {
    const tpl = TEMPLATES_PRODUTO.find((x) => x.tipo === el.value);
    state.novoProduto.tipo = el.value;
    state.novoProduto.principio = tpl ? tpl.principioAtivo : '';
    state.novoProduto.estado = tpl && tpl.estadoFisico === 'liquido' ? 'liquido' : 'solido';
  },
  'set-np-nome': (el) => { state.novoProduto.nome = el.value; },
  'set-np-marca': (el) => { state.novoProduto.marca = el.value; },
  'set-np-principio': (el) => { state.novoProduto.principio = el.value; },
  'set-np-concentracao': (el) => { state.novoProduto.concentracao = el.value; },
  'set-np-preco': (el) => { state.novoProduto.preco = el.value; },
  'set-np-estado': (el) => { state.novoProduto.estado = el.dataset.tipo; },
  'set-np-densidade': (el) => { state.novoProduto.densidade = el.value; },
  'salvar-produto': async () => {
    const np = state.novoProduto;
    if (!np.nome.trim() || !(Number(np.concentracao) > 0)) { toast(t('produtos.informeNomeEConcentracao')); return; }
    await DB.salvarProduto({
      tipo: np.tipo, nomeComercial: np.nome.trim(), marca: np.marca.trim(),
      principioAtivo: np.principio, concentracao: Number(np.concentracao),
      estadoFisico: np.estado, densidade: np.estado === 'liquido' ? (Number(np.densidade) || null) : null,
      preco: np.preco ? Number(np.preco) : null,
      fonte: 'Cadastrado manualmente — confirmar no rótulo/FISPQ',
    });
    state.produtos = await DB.listarProdutos();
    state.catAtiva = np.tipo;
    state.produtoFormAberto = false;
    toast(t('produtos.cadastrado'));
  },
  'excluir-produto': async (el) => {
    if (!confirm(t('produtos.confirmarExcluir'))) return;
    await DB.excluirProduto(el.dataset.id);
    state.produtos = await DB.listarProdutos();
    toast(t('produtos.excluido'));
  },

  // autenticação
  'auth-set-modo': (el) => { state.authMode = el.dataset.modo; state.authErro = ''; },
  'auth-set-email': (el) => { state.authEmail = el.value; },
  'auth-set-senha': (el) => { state.authSenha = el.value; },
  'auth-submeter': async () => {
    state.authErro = '';
    if (!state.authEmail.trim() || !state.authSenha) { state.authErro = t('auth.preencherEmailSenha'); return; }
    try {
      if (state.authMode === 'entrar') await DB.signIn(state.authEmail.trim(), state.authSenha);
      else await DB.signUp(state.authEmail.trim(), state.authSenha);
      // onAuthStateChange cuida de carregar os dados e trocar de tela.
    } catch (e) {
      state.authErro = e.message;
    }
  },
  'sair': async () => {
    await DB.signOut();
    aoDeslogar();
  },
};

/* ── renderização / eventos ──────────────────────────────────────────────── */

function renderScreenHtml() {
  if (state.screen === 'cadastro-cliente') return renderScreenCadastroCliente();
  if (state.screen === 'cliente-detalhe') return renderScreenClienteDetalhe();
  if (state.screen === 'cadastro-piscina') return renderScreenCadastroPiscina();
  if (state.screen === 'resultado') return renderScreenResultado();
  if (state.screen === 'produtos') return renderScreenProdutos();
  if (state.tab === 'medir') return renderScreenMedir();
  if (state.tab === 'sal') return renderScreenSal();
  if (state.tab === 'historico') return renderScreenHistorico();
  if (state.tab === 'custos') return renderScreenCustos();
  if (state.tab === 'clientes') return renderScreenClientes();
  return renderScreenPainel();
}

function garantirShellApp() {
  if (document.getElementById('main')) return;
  document.getElementById('root').innerHTML = `
    <div class="nav-top" id="nav-top"></div>
    <div class="mobile-header" id="mobile-header"></div>
    <main class="main" id="main"></main>
    <nav class="nav-bottom" id="nav-bottom"></nav>
    <div class="toast" id="toast" hidden></div>`;
}

function renderAll() {
  const root = document.getElementById('root');
  if (state.booting || (!state.session)) {
    root.innerHTML = state.booting ? `<div class="auth-screen"><p class="auth-note">${esc(t('common.carregando'))}</p></div>` : renderAuthScreen();
    return;
  }
  if (state.carregandoDados) {
    root.innerHTML = `<div class="auth-screen"><p class="auth-note">${esc(t('auth.carregandoDados'))}</p></div>`;
    return;
  }
  if (state.erroCarregar) {
    root.innerHTML = `<div class="auth-screen"><div class="auth-card"><p class="auth-error">${esc(state.erroCarregar)}</p><button type="button" class="btn btn-primary btn-block" data-action="tentar-de-novo">${esc(t('common.tentarDeNovo'))}</button></div></div>`;
    return;
  }
  garantirShellApp();
  renderNav();
  document.getElementById('main').innerHTML = renderScreenHtml();
  syncToast();
}

function rerender() {
  // O container que importa é #root — ele engloba tanto a tela de login/criar conta (que
  // renderiza direto nele, sem #main ainda existir) quanto o app depois de logado (dentro de
  // #main). Restringir essa checagem a #main deixava a tela de login sem preservação de
  // foco: cada letra digitada na senha recriava o campo do zero e o cursor saía dele.
  const root = document.getElementById('root');
  const active = document.activeElement;
  let restore = null;
  if (root && active instanceof HTMLElement && active.dataset && active.dataset.action && root.contains(active)) {
    restore = {
      action: active.dataset.action,
      idx: active.dataset.idx || '', id: active.dataset.id || '', dir: active.dataset.dir || '',
      param: active.dataset.param || '', tipo: active.dataset.tipo || '', poolid: active.dataset.poolid || '',
      start: 'selectionStart' in active ? active.selectionStart : null,
      end: 'selectionEnd' in active ? active.selectionEnd : null,
    };
  }
  renderAll();
  if (restore) {
    const root2 = document.getElementById('root');
    if (!root2) return;
    const nodes = Array.from(root2.querySelectorAll(`[data-action="${restore.action}"]`));
    const match = nodes.find((n) =>
      (n.dataset.idx || '') === restore.idx &&
      (n.dataset.id || '') === restore.id &&
      (n.dataset.dir || '') === restore.dir &&
      (n.dataset.param || '') === restore.param &&
      (n.dataset.tipo || '') === restore.tipo &&
      (n.dataset.poolid || '') === restore.poolid
    ) || nodes[0];
    if (match) {
      match.focus({ preventScroll: true });
      if (restore.start != null && typeof match.setSelectionRange === 'function') {
        try { match.setSelectionRange(restore.start, restore.end); } catch (e) { /* alguns inputs numéricos não suportam seleção */ }
      }
    }
  }
}

async function dispatch(name, el) {
  const fn = actions[name];
  if (!fn) return;
  if (state.ocupado) return; // evita cliques duplicados enquanto uma chamada está em andamento
  const resultado = fn(el);
  if (resultado && typeof resultado.then === 'function') {
    state.ocupado = true;
    rerender();
    try {
      await resultado;
    } catch (e) {
      console.error(e);
      toast(e.message || 'Ocorreu um erro. Tente novamente.');
    }
    state.ocupado = false;
  }
  rerender();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
  e.preventDefault();
  dispatch(el.dataset.action, el);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.dataset.action) return;
  if ((el.tagName === 'INPUT' && ['text', 'number', 'date', 'password'].includes(el.type)) || el.tagName === 'TEXTAREA') {
    // Campos numéricos usam type="text" + inputmode="decimal" (não type="number") de propósito:
    // isso mantém o teclado numérico no celular, mas devolve o controle total do cursor, que o
    // navegador não permite em inputs type="number" — sem isso, cada re-renderização (a cada
    // tecla, para o preview da litragem/faixas atualizar ao vivo) empurrava o cursor pro início
    // do campo, invertendo a ordem dos dígitos digitados. Quem digita vírgula como separador
    // decimal (hábito daqui) precisa continuar calculando certo — normaliza para ponto aqui,
    // antes de qualquer ação ler o valor do campo.
    if (el.getAttribute('inputmode') === 'decimal' && el.value.indexOf(',') >= 0) {
      const pos = el.selectionStart;
      el.value = el.value.replace(',', '.');
      try { el.setSelectionRange(pos, pos); } catch (err) { /* ignora se o navegador não permitir */ }
    }
    dispatch(el.dataset.action, el);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.dataset.action) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') dispatch(el.dataset.action, el);
});
actions['tentar-de-novo'] = async () => { await carregarDadosIniciais(); };

/* ── ciclo de vida: sessão e carga inicial de dados ─────────────────────────── */

function aoDeslogar() {
  state = estadoInicial();
  state.booting = false;
  document.getElementById('root').innerHTML = '';
  renderAll();
}

async function carregarDadosIniciais() {
  state.carregandoDados = true; state.erroCarregar = '';
  renderAll();
  try {
    await DB.garantirProdutosPadrao();
    const [clientes, piscinas, produtos, historico, consumos] = await Promise.all([
      DB.listarClientes(), DB.listarPiscinas(), DB.listarProdutos(), DB.listarTodoHistorico(), DB.listarConsumos(),
    ]);
    state.clientes = clientes; state.piscinas = piscinas; state.produtos = produtos;
    state.historico = historico; state.consumos = consumos;
    talvezNotificarPendencias();
  } catch (e) {
    state.erroCarregar = e.message || t('auth.erroCarregarDados');
  }
  state.carregandoDados = false;
  renderAll();
}

// Lembrete opcional do navegador (só funciona com o app aberto e a permissão já concedida pela
// pessoa no sino da barra superior — nunca pede permissão sozinho). No máximo um por dia, pra
// não repetir o aviso a cada vez que o app é reaberto na mesma piscina crítica/vencida.
function talvezNotificarPendencias() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem('bp_notif_ultima_data') === hoje) return;
  } catch (e) { /* localStorage indisponível — segue sem controlar frequência */ }
  const criticas = state.piscinas.filter((p) => statusPiscina(p).nivel === 'critico').length;
  const visitasVencidas = state.piscinas.filter((p) => statusPiscina(p).visitaVencida).length;
  if (criticas === 0 && visitasVencidas === 0) return;
  try { localStorage.setItem('bp_notif_ultima_data', hoje); } catch (e) { /* segue sem salvar */ }
  new Notification(t('notif.tituloResumo'), { body: t('notif.corpoResumo', { criticas, visitas: visitasVencidas }) });
}

function renderNaoConfigurado() {
  document.getElementById('root').innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand">${renderBrandLockup()}</div>
        <div class="auth-form">
          <p class="auth-error">${t('auth.naoConfigurado')}</p>
        </div>
      </div>
    </div>`;
}

let jaCarregou = false;
if (DB.configurado) {
  DB.onAuthStateChange((_event, session) => {
    state.session = session;
    state.booting = false;
    if (session && !jaCarregou) {
      jaCarregou = true;
      carregarDadosIniciais();
    } else if (!session) {
      jaCarregou = false;
      renderAll();
    } else {
      renderAll();
    }
  });

  (async function iniciar() {
    const session = await DB.getSession();
    state.session = session;
    state.booting = false;
    if (!session) renderAll();
    // se houver sessão, o listener onAuthStateChange acima dispara e carrega os dados.
  })();
} else {
  renderNaoConfigurado();
}
