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

const SEM_PRODUTO_TEXTO = {
  alcalinidade: 'Selecione, acima, um produto cadastrado para calcular a dose exata.',
  ph: 'Selecione, acima, um produto cadastrado para calcular a dose exata.',
  dureza: 'Não existe produto para baixar a dureza cálcica — corrigir por diluição: renovar parte da água da piscina.',
  cianurico: 'Não existe produto para baixar o ácido cianúrico — a correção é por diluição: renovar parte da água da piscina, ou aguardar a degradação natural.',
  sal: 'Não existe produto para baixar o sal — diluir com reposição de água doce (retrolavagem do filtro ou troca parcial).',
  cloro: 'Não existe produto para baixar o cloro livre — aguardar a degradação natural (sol e circulação) ou diluir com reposição de água.',
};

/* ── formatação ──────────────────────────────────────────────────────────── */

function nf(n, casas) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
function numFmt(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
function pctFmt(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
function dose3Fmt(n) { return nf(n, 3); }
function moeda(n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dataHoraFmt(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatHoras(h) {
  if (h < 1) return Math.round(h * 60) + ' min';
  return (Number.isInteger(h) ? h : nf(h, 1)) + ' h';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    <text x="176" y="53" font-size="9" text-anchor="middle" transform="rotate(-90 176 53)" style="fill:rgba(233,233,237,.7)">profundidade</text>
  </svg>`;
}
function svgProfMinMax() {
  return `<svg viewBox="0 0 180 110" class="diagrama" role="img" aria-label="Corte lateral com fundo inclinado: profundidade mínima na ponta rasa, máxima na ponta funda">
    <polygon points="30,20 150,20 150,80 30,50" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></polygon>
    <line x1="20" y1="20" x2="160" y2="20" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"></line>
    <line x1="12" y1="20" x2="12" y2="50" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="9" y1="50" x2="15" y2="50" stroke="currentColor" stroke-width="1.2"></line>
    <text x="4" y="38" font-size="9" text-anchor="middle" transform="rotate(-90 4 38)" style="fill:rgba(233,233,237,.7)">mín</text>
    <line x1="168" y1="20" x2="168" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="20" x2="171" y2="20" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="165" y1="80" x2="171" y2="80" stroke="currentColor" stroke-width="1.2"></line>
    <text x="176" y="53" font-size="9" text-anchor="middle" transform="rotate(-90 176 53)" style="fill:rgba(233,233,237,.7)">máx</text>
  </svg>`;
}
function svgShapeRetangular() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina retangular: comprimento é o lado maior, largura o lado menor">
    <rect x="40" y="25" width="100" height="60" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></rect>
    <line x1="40" y1="15" x2="140" y2="15" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="40" y1="12" x2="40" y2="18" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="140" y1="12" x2="140" y2="18" stroke="currentColor" stroke-width="1.2"></line>
    <text x="90" y="10" font-size="10" text-anchor="middle" style="fill:rgba(233,233,237,.7)">comprimento</text>
    <line x1="28" y1="25" x2="28" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="25" y1="25" x2="31" y2="25" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="25" y1="85" x2="31" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <text x="14" y="58" font-size="10" text-anchor="middle" transform="rotate(-90 14 58)" style="fill:rgba(233,233,237,.7)">largura</text>
  </svg>`;
}
function svgShapeCircular() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina circular: diâmetro é a medida de uma ponta a outra passando pelo centro">
    <circle cx="85" cy="55" r="38" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></circle>
    <line x1="47" y1="55" x2="123" y2="55" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="47" y1="52" x2="47" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="123" y1="52" x2="123" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="63" y="48" width="44" height="14" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="58" font-size="10" text-anchor="middle" style="fill:rgba(233,233,237,.7)">diâmetro</text>
  </svg>`;
}
function svgShapeOval() {
  return `<svg viewBox="0 0 170 120" class="diagrama-forma" role="img" aria-label="Piscina oval: comprimento é a medida mais longa, largura a mais curta, ambas passando pelo centro">
    <ellipse cx="85" cy="55" rx="50" ry="30" stroke="currentColor" stroke-width="2" style="fill:var(--color-accent-900)"></ellipse>
    <line x1="35" y1="55" x2="135" y2="55" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="35" y1="52" x2="35" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="135" y1="52" x2="135" y2="58" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="60" y="48" width="50" height="13" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="57" font-size="9" text-anchor="middle" style="fill:rgba(233,233,237,.7)">comprimento</text>
    <line x1="85" y1="25" x2="85" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="82" y1="25" x2="88" y2="25" stroke="currentColor" stroke-width="1.2"></line>
    <line x1="82" y1="85" x2="88" y2="85" stroke="currentColor" stroke-width="1.2"></line>
    <rect x="66" y="72" width="38" height="13" style="fill:var(--color-accent-900)"></rect>
    <text x="85" y="81" font-size="9" text-anchor="middle" style="fill:rgba(233,233,237,.7)">largura</text>
  </svg>`;
}

/* ── estado ──────────────────────────────────────────────────────────────── */

function estadoInicial() {
  return {
    session: null, booting: true, ocupado: false,
    authMode: 'entrar', authEmail: '', authSenha: '', authErro: '',

    clientes: [], piscinas: [], produtos: [], historico: [], consumos: [],
    carregandoDados: false, erroCarregar: '',

    tab: 'clientes', screen: null, clienteAtualId: null,
    formCliente: null, formPiscina: null,

    medirPoolId: null, leituras: {}, escolhas: {}, resultado: null,
    histPoolId: 'todas', histData: '', histAbertos: {},
    custoPoolId: 'todas',
    salPoolId: null, salAtual: '', salMeta: '', salProdutoId: '', salResultado: null,
    catAtiva: null, produtoFormAberto: false, novoProduto: null,
    toast: '',
  };
}
let state = estadoInicial();

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
    prof: '', profMin: '', profMax: '', litrosManuais: '',
    formas: [{ tipo: 'retangular', comprimento: '', largura: '', diametro: '' }],
  };
  if (!pool) return vazio;
  return {
    id: pool.id, nome: pool.nome, sistema: pool.sistemaDesinfeccao || 'manual',
    salMin: pool.faixaSal && pool.faixaSal.min != null ? String(pool.faixaSal.min) : '',
    salMax: pool.faixaSal && pool.faixaSal.max != null ? String(pool.faixaSal.max) : '',
    unidade: pool.unidade || 'm',
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

function historyStepView(p) {
  const titulo = p.nome + ': ' + (p.status === 'adequado' ? 'adequado' : p.rotuloStatus);
  let detalhe;
  if (p.status === 'adequado') {
    detalhe = 'Leitura ' + numFmt(p.valor) + (p.unidade ? ' ' + p.unidade : '');
  } else if (p.instrucaoOperacional) {
    detalhe = p.instrucaoOperacional;
  } else if (p.instrucaoGeradorSalino) {
    detalhe = p.instrucaoGeradorSalino;
  } else if (p.dose) {
    detalhe = dose3Fmt(p.dose.valor) + ' ' + p.dose.unidade + ' de ' + p.produto;
  } else {
    detalhe = SEM_PRODUTO_TEXTO[p.parametroId] || 'sem produto selecionado';
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
  ['clientes', 'Clientes', 'ph-users'],
  ['medir', 'Medir', 'ph-drop'],
  ['sal', 'Sal', 'ph-cube'],
  ['historico', 'Histórico', 'ph-clock-counter-clockwise'],
  ['custos', 'Custos', 'ph-chart-bar'],
];

function renderNav() {
  const ativoId = !state.screen ? state.tab : null;
  document.getElementById('nav-top').innerHTML = `
    <div class="nav-top-inner">
      <div class="brand"><i class="ph ph-drop brand-icon"></i><span class="brand-label">Banheza Pool</span></div>
      ${NAV_ITEMS.map(([id, label, icon]) => `
        <button type="button" class="nav-top-link${ativoId === id ? ' ativo' : ''}" data-action="nav-go" data-tab="${id}"><i class="ph ${icon}"></i>${esc(label)}</button>
      `).join('')}
      <button type="button" class="account-btn" data-action="sair"><i class="ph ph-sign-out"></i>Sair</button>
    </div>`;
  document.getElementById('nav-bottom').innerHTML = NAV_ITEMS.map(([id, label, icon]) => `
    <button type="button" class="nav-bottom-link${ativoId === id ? ' ativo' : ''}" data-action="nav-go" data-tab="${id}"><i class="ph ${icon}"></i><span>${esc(label)}</span></button>
  `).join('');
}

/* ── tela: autenticação ──────────────────────────────────────────────────── */

function renderAuthScreen() {
  const modo = state.authMode;
  return `
    <section class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><i class="ph ph-drop brand-icon"></i><span class="brand-label">Banheza Pool</span></div>
        <div class="auth-tabs">
          <button type="button" class="auth-tab${modo === 'entrar' ? ' ativa' : ''}" data-action="auth-set-modo" data-modo="entrar">Entrar</button>
          <button type="button" class="auth-tab${modo === 'criar' ? ' ativa' : ''}" data-action="auth-set-modo" data-modo="criar">Criar conta</button>
        </div>
        <div class="auth-form">
          <div class="field"><label>E-mail</label><input class="input" type="text" data-action="auth-set-email" value="${esc(state.authEmail)}" placeholder="voce@exemplo.com" /></div>
          <div class="field"><label>Senha</label><input class="input" type="password" data-action="auth-set-senha" value="${esc(state.authSenha)}" placeholder="${modo === 'criar' ? 'mínimo 6 caracteres' : ''}" /></div>
          ${state.authErro ? `<p class="auth-error">${esc(state.authErro)}</p>` : ''}
          <button type="button" class="btn btn-primary btn-block" data-action="auth-submeter" style="min-height:46px" ${state.ocupado ? 'disabled' : ''}>
            ${state.ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
        <p class="auth-note">${modo === 'entrar' ? 'Ainda não tem conta? Toque em "Criar conta" acima.' : 'Seus clientes, piscinas e histórico ficam só na sua conta — ninguém mais vê.'}</p>
      </div>
    </section>`;
}

/* ── tela: clientes ──────────────────────────────────────────────────────── */

function renderClientCard(c) {
  const piscinas = piscinasDoCliente(c.id);
  const contato = [c.telefone, c.email].filter(Boolean).join(' · ') || 'sem contato cadastrado';
  return `
    <button type="button" class="card client-card" data-action="abrir-cliente" data-id="${c.id}">
      <div>
        <div class="client-card-name">${esc(c.nome)}</div>
        <div class="client-card-meta">${esc(contato)}</div>
        ${c.endereco ? `<div class="client-card-meta">${esc(c.endereco)}</div>` : ''}
      </div>
      <div class="client-card-bottom">
        <span class="client-card-count">${piscinas.length} piscina${piscinas.length === 1 ? '' : 's'}</span>
        <span class="btn btn-ghost" style="pointer-events:none">Abrir</span>
      </div>
    </button>`;
}

function renderScreenClientes() {
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
  const clientes = state.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return `
    <div class="screen-header">
      <div><div class="kicker">${esc(hoje)}</div><h2>Clientes</h2></div>
      <div class="screen-header-actions">
        <button type="button" class="btn btn-secondary btn-icon" data-action="ir-produtos" title="Produtos"><i class="ph ph-flask"></i></button>
        <button type="button" class="btn btn-secondary btn-icon" data-action="ir-cadastro-cliente" title="Novo cliente"><i class="ph ph-plus"></i></button>
      </div>
    </div>
    <div class="client-grid">
      ${clientes.map(renderClientCard).join('')}
      <button type="button" class="add-pool-card" data-action="ir-cadastro-cliente">
        <span class="txt">Cadastrar um novo cliente</span>
        <i class="ph ph-plus"></i>
      </button>
    </div>`;
}

function renderScreenCadastroCliente() {
  const f = state.formCliente || (state.formCliente = formClienteVazio(null));
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-clientes"><i class="ph ph-arrow-left"></i></button>
      <h4>${f.id ? 'Editar cliente' : 'Novo cliente'}</h4>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:14px;max-width:520px">
      <div class="field"><label>Nome</label><input class="input" type="text" placeholder="Ex: Maria Souza" data-action="set-cliente-nome" value="${esc(f.nome)}" /></div>
      <div class="field"><label>Telefone</label><input class="input" type="text" placeholder="Ex: (11) 91234-5678" data-action="set-cliente-telefone" value="${esc(f.telefone)}" /></div>
      <div class="field"><label>E-mail</label><input class="input" type="text" placeholder="Ex: maria@exemplo.com" data-action="set-cliente-email" value="${esc(f.email)}" /></div>
      <div class="field"><label>Endereço</label><input class="input" type="text" placeholder="Ex: Rua das Flores, 123" data-action="set-cliente-endereco" value="${esc(f.endereco)}" /></div>
      <div class="field"><label>Observações</label><textarea class="input" data-action="set-cliente-observacoes" placeholder="Detalhes úteis sobre o cliente ou o acesso à piscina">${esc(f.observacoes)}</textarea></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${f.id ? `<button type="button" class="btn btn-ghost" data-action="excluir-cliente" data-id="${f.id}">Excluir cliente</button>` : ''}
        <button type="button" class="btn btn-secondary" data-action="voltar-clientes">Cancelar</button>
        <button type="button" class="btn btn-primary" data-action="salvar-cliente" style="padding-inline:20px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Salvando…' : 'Salvar cliente'}</button>
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
      <button type="button" class="btn btn-secondary" data-action="ir-editar-cliente" data-id="${cliente.id}">Editar cliente</button>
      <button type="button" class="btn btn-primary btn-icon" data-action="ir-cadastro-piscina" title="Nova piscina"><i class="ph ph-plus"></i></button>
    </div>
    <div class="pool-grid">
      ${piscinas.map(renderPoolCard).join('')}
      <button type="button" class="add-pool-card" data-action="ir-cadastro-piscina">
        <span class="txt">Cadastrar piscina e calcular a litragem</span>
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
    const cor = leitura == null ? 'rgba(233,233,237,.35)' : dentro ? 'var(--color-text)' : 'var(--warn-400)';
    return `<div class="pool-chip"><div class="pool-chip-label">${esc(par.nome.split(' ')[0])}</div><div class="pool-chip-value" style="color:${cor}">${leitura == null ? '—' : numFmt(leitura)}</div></div>`;
  }).join('');
  const desc = [
    p.formato === 'irregular' ? 'irregular' : esc(p.formato),
    p.sistemaDesinfeccao === 'salino' ? 'gerador salino' : p.sistemaDesinfeccao === 'ozonio' ? 'gerador de ozônio' : 'cloração manual',
  ];
  const tagLabel = !ult ? 'Sem medição' : fora > 0 ? 'Ação' : 'Estável';
  const tagStyle = !ult ? 'background:var(--color-neutral-800);color:var(--color-neutral-100)'
    : fora > 0 ? 'border:1px solid var(--warn-400);color:var(--warn-400)'
    : 'background:var(--color-accent-800);color:var(--color-accent-100)';
  const meta = !ult ? 'nenhuma leitura registrada' : dataHoraFmt(ult.data) + (fora > 0 ? ' · ' + fora + ' correção(ões)' : '');
  return `
    <div class="card pool-card">
      <div class="pool-card-top">
        <div><div class="pool-card-name">${esc(p.nome)}</div><div class="pool-card-sub">${nf(p.litros, 0)} L · ${desc.join(' · ')}</div></div>
        <span class="tag" style="${tagStyle}">${esc(tagLabel)}</span>
      </div>
      <div class="pool-chip-row">${chips}</div>
      <div class="pool-card-bottom">
        <span class="pool-card-meta">${esc(meta)}</span>
        <div class="pool-card-actions">
          <button type="button" class="btn btn-ghost" data-action="editar-piscina" data-id="${p.id}" style="font-size:12.5px">Editar</button>
          <button type="button" class="btn btn-primary" data-action="medir-piscina" data-id="${p.id}" style="min-height:38px">Medir</button>
        </div>
      </div>
    </div>`;
}

function renderShapeBlock(fo, i, f) {
  const diag = fo.tipo === 'circular' ? svgShapeCircular() : fo.tipo === 'oval' ? svgShapeOval() : svgShapeRetangular();
  const removivel = f.formato === 'composta' && f.formas.length > 1;
  const campos = fo.tipo === 'circular'
    ? `<div class="field"><label>Diâmetro</label><input class="input" type="number" data-action="set-forma-campo" data-idx="${i}" data-campo="diametro" value="${esc(fo.diametro)}" /></div>`
    : `<div class="field"><label>Comprimento</label><input class="input" type="number" data-action="set-forma-campo" data-idx="${i}" data-campo="comprimento" value="${esc(fo.comprimento)}" /></div>
       <div class="field"><label>Largura</label><input class="input" type="number" data-action="set-forma-campo" data-idx="${i}" data-campo="largura" value="${esc(fo.largura)}" /></div>`;
  return `
    <div class="shape-block">
      <div class="shape-diagrama">${diag}</div>
      ${campos}
      ${removivel ? `<button type="button" class="btn btn-ghost" data-action="remover-forma" data-idx="${i}" style="min-height:40px">Remover</button>` : ''}
    </div>`;
}

const SISTEMAS = [
  ['manual', 'Cloração manual'],
  ['salino', 'Gerador salino (eletrólise)'],
  ['ozonio', 'Gerador de ozônio (complementar ao cloro)'],
];
const FORMATOS = [
  ['retangular', 'Retangular'],
  ['circular', 'Circular'],
  ['oval', 'Oval'],
  ['composta', 'Composta (soma de formas)'],
  ['irregular', 'Irregular — litragem informada à mão'],
];

function renderScreenCadastroPiscina() {
  const cliente = clientePorId(state.clienteAtualId);
  if (!cliente) { state.screen = null; return renderScreenClientes(); }
  const f = state.formPiscina || (state.formPiscina = formVazio(null));
  const calc = litragemPreview(f);
  const litragemTexto = calc.ok ? nf(calc.litros, 0) + ' L  ·  ' + nf(calc.litros / 1000, 2) + ' m³' : 'informe as medidas';
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-cliente-detalhe"><i class="ph ph-arrow-left"></i></button>
      <h4>${f.id ? 'Editar piscina' : 'Nova piscina'} — ${esc(cliente.nome)}</h4>
    </div>
    <div class="cadastro-grid">
      <div class="card">
        <div class="field"><label>Nome da piscina</label><input class="input" type="text" placeholder="Ex: Piscina principal" data-action="set-nome" value="${esc(f.nome)}" /></div>
        <div class="field"><label>Sistema de desinfecção</label>
          <div style="display:flex;flex-direction:column;gap:7px">
            ${SISTEMAS.map(([id, label]) => `<label class="radio"><input type="radio" name="sistema" data-action="set-sistema" data-tipo="${id}" ${f.sistema === id ? 'checked' : ''} /><span class="dot"></span>${esc(label)}</label>`).join('')}
          </div>
        </div>
        ${f.sistema === 'salino' ? `
        <div style="display:flex;gap:10px">
          <div class="field" style="flex:1"><label>Sal mín. do gerador (ppm)</label><input class="input" type="number" placeholder="2700" data-action="set-sal-min" value="${esc(f.salMin)}" /></div>
          <div class="field" style="flex:1"><label>Sal máx. do gerador (ppm)</label><input class="input" type="number" placeholder="3400" data-action="set-sal-max" value="${esc(f.salMax)}" /></div>
        </div>` : ''}
        <div class="field"><label>Unidade de medida</label>
          <span class="seg">
            <label class="seg-opt"><input type="radio" name="un" data-action="set-unidade" data-tipo="m" ${f.unidade === 'm' ? 'checked' : ''} />Metros</label>
            <label class="seg-opt"><input type="radio" name="un" data-action="set-unidade" data-tipo="cm" ${f.unidade === 'cm' ? 'checked' : ''} />Centímetros</label>
          </span>
        </div>
      </div>
      <div class="card">
        <div>
          <div class="diagrama-label">Profundidade</div>
          ${f.modoProf === 'unica' ? svgProfUnica() : svgProfMinMax()}
          <div style="display:flex;flex-direction:column;gap:7px">
            <label class="radio"><input type="radio" name="prof" data-action="set-modo-prof" data-tipo="unica" ${f.modoProf === 'unica' ? 'checked' : ''} /><span class="dot"></span>Profundidade única</label>
            <label class="radio"><input type="radio" name="prof" data-action="set-modo-prof" data-tipo="minmax" ${f.modoProf === 'minmax' ? 'checked' : ''} /><span class="dot"></span>Mínima e máxima (fundo inclinado)</label>
          </div>
          ${f.modoProf === 'unica'
            ? `<input class="input" type="number" placeholder="Profundidade" data-action="set-prof" value="${esc(f.prof)}" style="margin-top:9px" />`
            : `<div style="display:flex;gap:9px;margin-top:9px"><input class="input" type="number" placeholder="Mínima" data-action="set-prof-min" value="${esc(f.profMin)}" /><input class="input" type="number" placeholder="Máxima" data-action="set-prof-max" value="${esc(f.profMax)}" /></div>`}
        </div>
        <div class="field"><label>Formato</label>
          <select class="input" data-action="set-formato">
            ${FORMATOS.map(([id, label]) => `<option value="${id}" ${f.formato === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
        </div>
        ${f.formato === 'irregular' ? `
        <div>
          <p style="margin:0 0 9px;font-size:11.5px;line-height:1.5;color:rgba(233,233,237,.55)">Meça o nível, adicione um volume conhecido de água, meça de novo e calcule o total pela variação de nível. Informe o resultado aqui.</p>
          <div class="field"><label>Litragem estimada (L)</label><input class="input" type="number" data-action="set-litros-manuais" value="${esc(f.litrosManuais)}" /></div>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${f.formas.map((fo, i) => renderShapeBlock(fo, i, f)).join('')}
          ${f.formato === 'composta' ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="retangular" style="min-height:40px">+ Retângulo</button>
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="circular" style="min-height:40px">+ Círculo</button>
            <button type="button" class="btn btn-secondary" data-action="add-forma" data-tipo="oval" style="min-height:40px">+ Oval</button>
          </div>` : ''}
        </div>`}
      </div>
    </div>
    <div class="result-bar">
      <div class="result-bar-info"><div class="result-bar-label">Litragem calculada</div><div class="result-bar-value">${esc(litragemTexto)}</div></div>
      ${f.id ? `<button type="button" class="btn btn-ghost" data-action="excluir-piscina" data-id="${f.id}">Excluir piscina</button>` : ''}
      <button type="button" class="btn btn-secondary" data-action="voltar-cliente-detalhe" style="min-height:46px">Cancelar</button>
      <button type="button" class="btn btn-primary" data-action="salvar-piscina" style="min-height:46px;padding-inline:20px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Salvando…' : 'Salvar piscina'}</button>
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
          <div><div class="reading-name">${esc(par.nome)}</div><div class="reading-range">faixa ${numFmt(faixa.min)}–${numFmt(faixa.max)}${par.unidade ? ' ' + esc(par.unidade) : ''}</div></div>
          <input class="input reading-input" type="number" placeholder="—" data-action="set-leitura" data-param="${par.id}" value="${raw == null ? '' : esc(raw)}" style="color:${cor}" />
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
          <span class="choice-label">${dir === 'subir' ? 'Subir ' : 'Descer '}${esc(par.nome)}</span>
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
      <div class="screen-header"><div><div class="kicker">Diagnóstico cruzado</div><h2>Nova medição</h2></div></div>
      <p class="empty-note">Cadastre um cliente e uma piscina primeiro, na aba Clientes.</p>`;
  }
  if (!state.medirPoolId || !pools.some((p) => p.id === state.medirPoolId)) state.medirPoolId = pools[0].id;
  const pool = piscinaPorId(state.medirPoolId);
  const produtos = state.produtos;
  const sistemaDesinfeccao = ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
  const parametrosAtivos = PARAMETROS.filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao);
  const preenchidos = Object.keys(state.leituras).filter((k) => parametrosAtivos.some((p) => p.id === k) && state.leituras[k] !== '' && state.leituras[k] != null).length;
  return `
    <div class="screen-header">
      <div><div class="kicker">Diagnóstico cruzado</div><h2>Nova medição</h2></div>
      <span style="font-size:11.5px;color:rgba(233,233,237,.45)">${preenchidos} de ${parametrosAtivos.length} preenchidos</span>
    </div>
    <div class="pool-select-row">
      <span class="pill-label">Piscina</span>
      <select class="input" data-action="set-medir-pool">
        ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
      </select>
    </div>
    <div class="reading-grid">${renderReadingCards(pool, parametrosAtivos)}</div>
    <div class="choices-block">
      <div class="choices-title">Produtos para as correções</div>
      ${renderChoiceRows(pool, parametrosAtivos, produtos)}
    </div>
    <p class="notice" style="margin-top:16px">As doses são regras gerais de referência e devem ser revisadas por um técnico/químico responsável antes do uso em ambiente coletivo. A fórmula de pH é uma aproximação de ordem de grandeza.</p>
    <div style="margin-top:16px;display:flex;gap:10px">
      <button type="button" class="btn btn-primary" data-action="rodar-diagnostico" style="min-height:48px;flex:1;font-size:15px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Calculando…' : 'Calcular correções'}</button>
    </div>`;
}

/* ── tela: resultado do diagnóstico ──────────────────────────────────────── */

function renderResultStep(p, i) {
  const tags = [];
  if (p.tempoEsperaHoras) tags.push('aguardar ' + formatHoras(p.tempoEsperaHoras));
  const alerta = [p.limitesSeguranca].concat(p.avisos || []).filter(Boolean).join(' ');
  let doseTxt, produtoTxt;
  if (p.instrucaoOperacional) {
    doseTxt = '—'; produtoTxt = p.instrucaoOperacional;
  } else if (p.instrucaoGeradorSalino) {
    doseTxt = '—'; produtoTxt = p.instrucaoGeradorSalino;
  } else if (p.dose) {
    doseTxt = dose3Fmt(p.dose.valor) + ' ' + p.dose.unidade;
    produtoTxt = p.produto + (p.dose.densidadeAusente ? ' — densidade não cadastrada, valor em kg' : '');
  } else {
    doseTxt = 'sem dose';
    produtoTxt = SEM_PRODUTO_TEXTO[p.parametroId] || 'Selecione, acima, um produto cadastrado para calcular a dose.';
  }
  const transicao = p.meta != null
    ? numFmt(p.valor) + ' → ' + numFmt(p.meta) + (p.unidade ? ' ' + p.unidade : '')
    : numFmt(p.valor) + (p.unidade ? ' ' + p.unidade : '') + ' (' + p.rotuloStatus + ')';
  return `
    <div class="step-card">
      <div class="step-num">${i + 1}</div>
      <div class="step-body">
        <div class="step-head">
          <span class="step-name">${esc(p.nome)}</span>
          <span class="step-transition">${esc(transicao)}</span>
        </div>
        <div class="step-dose">${esc(doseTxt)}</div>
        <div class="step-product">${esc(produtoTxt)}</div>
        <p class="step-motive">${esc(p.motivo || '')}</p>
        ${tags.length ? `<div class="step-tags">${tags.map((t) => `<span class="tag tag-neutral">${esc(t)}</span>`).join('')}</div>` : ''}
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
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(233,233,237,.45)">${esc(cliente ? cliente.nome + ' · ' : '')}${esc(pool ? pool.nome : '')}</div>
        <div style="font-weight:500;font-size:19px;line-height:1.2">Correções</div>
      </div>
      <button type="button" class="btn btn-ghost" data-action="baixar-pdf-resultado" style="font-size:12.5px"><i class="ph ph-file-pdf" style="font-size:16px"></i>PDF</button>
    </div>
    ${interdicaoPasso ? `
    <div class="interdict-banner">
      <i class="ph ph-warning"></i>
      <div><div class="interdict-title">Interditar o uso até corrigir</div><div class="interdict-text">${esc(interdicaoPasso.limitesSeguranca || '')}</div></div>
    </div>` : ''}
    <div class="steps-list">
      ${fora.map((p, i) => renderResultStep(p, i)).join('')}
      ${adequados.length ? `<div class="divider-label"><span>${adequados.length} parâmetro(s) dentro da faixa: ${esc(adequados.map((p) => p.nome).join(', '))}</span><span class="rule"></span></div>` : ''}
      ${passos.length === 0 ? `<p class="empty-note">Nenhuma leitura informada — volte e preencha ao menos um parâmetro.</p>` : ''}
    </div>
    ${semItens ? '' : r.checklistAberto ? `
    <div class="checklist-card">
      <div style="font-weight:500;font-size:17px">Produtos aplicados</div>
      <p class="checklist-sub">Confirme a quantidade realmente usada — isso alimenta o relatório de gastos.</p>
      ${itensChecklist.map((c, i) => `
        <div class="checklist-row">
          <label class="radio"><input type="checkbox" data-action="toggle-checklist-item" data-idx="${i}" ${c.on ? 'checked' : ''} /><span class="dot"></span></label>
          <span class="checklist-label">${esc(c.passo.produto)} (${esc(c.passo.nome)})</span>
          <input class="input" type="number" data-action="set-checklist-qtd" data-idx="${i}" value="${esc(c.qtd)}" />
          <span class="checklist-unit">${esc(c.passo.dose.unidade)}</span>
        </div>`).join('')}
      <button type="button" class="btn btn-primary btn-block" data-action="registrar-consumos" style="min-height:46px;margin-top:14px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Registrando…' : 'Registrar produtos aplicados'}</button>
    </div>` : `
    <div style="margin-top:16px;display:flex;gap:10px">
      <button type="button" class="btn btn-primary" data-action="abrir-checklist" style="min-height:48px;flex:1;font-size:15px">Confirmar aplicação</button>
    </div>`}`;
}

/* ── tela: calculadora de sal ────────────────────────────────────────────── */

function renderScreenSal() {
  const pools = state.piscinas;
  if (!pools.length) {
    return `
      <div class="screen-header"><div><div class="kicker">Gerador salino</div><h2>Calculadora de Sal</h2></div></div>
      <p class="empty-note">Cadastre um cliente e uma piscina primeiro, na aba Clientes.</p>`;
  }
  if (!state.salPoolId || !pools.some((p) => p.id === state.salPoolId)) state.salPoolId = pools[0].id;
  const pool = piscinaPorId(state.salPoolId);
  const faixa = faixaSalDe(pool);
  if (!state.salMeta) state.salMeta = String(Math.round((faixa.min + faixa.max) / 2));
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
        <div class="sal-hero-kicker">Adicionar</div>
        <div class="sal-hero-value">${dose ? dose3Fmt(dose.valor) + ' ' + dose.unidade : '—'}</div>
        <div class="sal-hero-product">${produto ? esc(produto.nomeComercial) + ' · ' + pctFmt(produto.concentracao) : ''}</div>
        <div class="sal-hero-detail">Sal medido ${numFmt(r.atual)} ppm → meta ${numFmt(r.meta)} ppm (variação de ${numFmt(r.meta - r.atual)} ppm em ${nf(pool.litros, 0)} L)${dose && dose.densidadeAusente ? ' — densidade não cadastrada, valor em kg' : ''}</div>
        <div class="sal-hero-actions">
          <span class="tag tag-neutral">aguardar 24 h</span>
          <button type="button" class="btn btn-primary" data-action="registrar-sal" style="min-height:42px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Registrando…' : 'Registrar nos custos'}</button>
        </div>
      </div>
      <p style="margin:10px 0 0;font-size:11.5px;line-height:1.5;color:rgba(233,233,237,.5)">Circular e escovar por várias horas; aguardar cerca de 24 h antes de remedir — o sal grosso demora a dissolver completamente.</p>`;
  }
  return `
    <div class="screen-header"><div><div class="kicker">Gerador salino</div><h2>Calculadora de Sal</h2></div></div>
    <p class="screen-subtitle">Atalho para o dia a dia: informe o sal medido agora e o sal ideal desejado — a reposição sai direto, sem passar pelo diagnóstico completo.</p>
    <div class="card" style="display:flex;flex-direction:column;gap:13px;margin-top:16px">
      <div class="field"><label>Piscina</label>
        <select class="input" data-action="set-sal-pool">
          ${pools.map((p) => `<option value="${p.id}" ${p.id === pool.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
        </select>
      </div>
      ${avisoSistema ? `<p class="notice-flat">Esta piscina está cadastrada com ${pool.sistemaDesinfeccao === 'ozonio' ? 'gerador de ozônio' : 'cloração manual'} — a calculadora parte do princípio de que existe um gerador salino instalado.</p>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px">
        <div class="field"><label>Sal medido agora (ppm)</label><input class="input" type="number" data-action="set-sal-atual" value="${esc(state.salAtual)}" style="font-size:17px" /></div>
        <div class="field"><label>Sal ideal desejado (ppm)</label><input class="input" type="number" data-action="set-sal-meta" value="${esc(state.salMeta)}" style="font-size:17px" /></div>
        <div class="field"><label>Produto de sal</label>
          <select class="input" data-action="set-sal-produto">
            ${opcoesSal.map((o) => `<option value="${o.id}" ${state.salProdutoId === o.id ? 'selected' : ''}>${esc(o.nomeComercial)} (${pctFmt(o.concentracao)})</option>`).join('')}
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-primary" data-action="calcular-sal" style="min-height:46px;align-self:flex-start;padding-inline:18px">Calcular reposição</button>
    </div>
    ${heroHtml}`;
}

/* ── tela: histórico ─────────────────────────────────────────────────────── */

function renderHistoryItem(h) {
  const pool = piscinaPorId(h.piscinaId);
  const cliente = pool ? clientePorId(pool.clienteId) : null;
  const fora = h.passos.filter((p) => p.status !== 'adequado').length;
  const resumo = h.passos.map((p) => p.nome + ' ' + numFmt(p.valor)).join(' · ');
  const aberto = !!state.histAbertos[h.id];
  return `
    <div class="history-item">
      <div class="history-top">
        <div><div class="history-date">${dataHoraFmt(h.data)}</div><div class="history-pool">${esc(cliente ? cliente.nome + ' — ' : '')}${esc(pool ? pool.nome : '—')}</div></div>
        <div class="history-tags">
          <span class="tag" style="${fora > 0 ? 'border:1px solid var(--warn-400);color:var(--warn-400)' : 'background:var(--color-accent-800);color:var(--color-accent-100)'}">${fora > 0 ? fora + ' fora da faixa' : 'tudo adequado'}</span>
          <button type="button" class="btn btn-ghost" data-action="baixar-pdf-historico" data-id="${h.id}" style="font-size:12.5px"><i class="ph ph-file-pdf" style="font-size:16px"></i>PDF</button>
        </div>
      </div>
      <p class="history-summary">${esc(resumo)}</p>
      <button type="button" class="btn btn-ghost" data-action="alternar-historico" data-id="${h.id}" style="font-size:12.5px;margin-top:8px">${aberto ? 'Ocultar passos' : 'Ver os passos'}</button>
      ${aberto ? `<div class="history-steps">${h.passos.map((p) => {
        const v = historyStepView(p);
        return `<div class="history-step" style="box-shadow:inset 2px 0 0 ${v.marca}"><div class="history-step-title">${esc(v.titulo)}</div><div class="history-step-detail">${esc(v.detalhe)}</div></div>`;
      }).join('')}</div>` : ''}
    </div>`;
}

function renderScreenHistorico() {
  const pools = state.piscinas;
  let registros = state.histPoolId === 'todas' ? state.historico.slice() : state.historico.filter((h) => h.piscinaId === state.histPoolId);
  if (state.histData) registros = registros.filter((h) => h.data.slice(0, 10) === state.histData);
  registros.sort((a, b) => new Date(b.data) - new Date(a.data));
  return `
    <div class="screen-header"><div><div class="kicker">Relatórios salvos</div><h2>Histórico</h2></div></div>
    <div class="filter-row">
      <div class="field" style="flex:1;min-width:180px"><label>Piscina</label>
        <select class="input" data-action="set-hist-pool">
          <option value="todas" ${state.histPoolId === 'todas' ? 'selected' : ''}>Todas as piscinas</option>
          ${pools.map((p) => `<option value="${p.id}" ${state.histPoolId === p.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:0 1 170px"><label>Filtrar por data</label><input class="input" type="date" data-action="set-hist-data" value="${esc(state.histData)}" /></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:11px">
      ${registros.map(renderHistoryItem).join('')}
      ${!registros.length ? `<p class="empty-note">Nenhum relatório encontrado para essa busca.</p>` : ''}
    </div>`;
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
      detalhe: dose3Fmt(g.qtd) + ' ' + g.unidade + (preco ? ' · ' + moeda(preco) + '/' + g.unidade : ' · sem preço cadastrado'),
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
  const meses = chaves.map((k) => {
    const [y, m] = k.split('-');
    return {
      rotulo: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      total: moeda(porMes[k]),
      altura: Math.max(6, Math.round((porMes[k] / maxMes) * 100)),
    };
  });
  const totalGeral = chaves.reduce((a, k) => a + porMes[k], 0);
  return `
    <div class="screen-header"><div><div class="kicker">Consumo registrado</div><h2>Gastos com produtos</h2></div></div>
    <p class="screen-subtitle">Vem das quantidades confirmadas no checklist de cada diagnóstico. Produtos sem preço cadastrado aparecem só com a quantidade usada.</p>
    <div class="field" style="max-width:320px;margin:16px 0"><label>Filtrar por piscina</label>
      <select class="input" data-action="set-custo-pool">
        <option value="todas" ${state.custoPoolId === 'todas' ? 'selected' : ''}>Todas as piscinas</option>
        ${pools.map((p) => `<option value="${p.id}" ${state.custoPoolId === p.id ? 'selected' : ''}>${esc(labelPiscina(p))}</option>`).join('')}
      </select>
    </div>
    <div class="divider-label"><span>Total por produto</span><span class="rule"></span></div>
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:24px">
      ${porProduto.map((p) => `<div class="cost-row"><div><div class="cost-name">${esc(p.nome)}</div><div class="cost-detail">${esc(p.detalhe)}</div></div><div class="cost-total">${esc(p.total)}</div></div>`).join('')}
      ${!porProduto.length ? `<p style="margin:0;font-size:13px;color:rgba(233,233,237,.6)">Nenhum consumo registrado ainda. Registre pelo checklist após um diagnóstico.</p>` : ''}
    </div>
    ${meses.length ? `
    <div class="divider-label"><span>Total por mês</span><span class="rule"></span></div>
    <div class="bar-chart">
      <div class="bar-chart-row">
        ${meses.map((m) => `<div class="bar-chart-col"><span class="bar-chart-total">${esc(m.total)}</span><div class="bar-chart-bar" style="height:${m.altura}%"></div><span class="bar-chart-label">${esc(m.rotulo)}</span></div>`).join('')}
      </div>
    </div>
    <div class="cost-total-row"><span class="lbl">Total geral (produtos com preço cadastrado)</span><span class="val">${moeda(totalGeral)}</span></div>` : ''}`;
}

/* ── tela: produtos ──────────────────────────────────────────────────────── */

function renderScreenProdutos() {
  const produtos = state.produtos;
  const categorias = categoriasDisponiveis(produtos);
  if (!state.catAtiva || !categorias.includes(state.catAtiva)) state.catAtiva = categorias[0] || null;
  const produtosVisiveis = produtos.filter((p) => p.tipo === state.catAtiva);
  const np = state.novoProduto || (state.novoProduto = novoProdutoVazio());
  const template = TEMPLATES_PRODUTO.find((t) => t.tipo === np.tipo);
  return `
    <div class="back-row">
      <button type="button" class="btn btn-secondary btn-icon" data-action="voltar-clientes"><i class="ph ph-arrow-left"></i></button>
      <h4>Produtos químicos</h4>
      <button type="button" class="btn btn-primary" data-action="toggle-form-produto">${state.produtoFormAberto ? 'Fechar' : 'Novo produto'}</button>
    </div>
    ${state.produtoFormAberto ? `
    <div class="product-form-grid">
      <div class="field"><label>Tipo de produto</label>
        <select class="input" data-action="set-np-tipo">
          ${TEMPLATES_PRODUTO.map((t) => `<option value="${esc(t.tipo)}" ${np.tipo === t.tipo ? 'selected' : ''}>${esc(t.tipo)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Nome comercial</label><input class="input" type="text" placeholder="Ex: Barrilha Leve Montreal" data-action="set-np-nome" value="${esc(np.nome)}" /></div>
      <div class="field"><label>Fabricante / marca</label><input class="input" type="text" placeholder="Ex: Montreal" data-action="set-np-marca" value="${esc(np.marca)}" /></div>
      <div class="field"><label>Princípio ativo</label><input class="input" type="text" data-action="set-np-principio" value="${esc(np.principio)}" /></div>
      <div class="field"><label>Concentração / pureza (%)</label><input class="input" type="number" data-action="set-np-concentracao" value="${esc(np.concentracao)}" /></div>
      <div class="field"><label>Preço por ${np.estado === 'liquido' ? 'L' : 'kg'} (R$) — opcional</label><input class="input" type="number" placeholder="12,50" data-action="set-np-preco" value="${esc(np.preco)}" /></div>
      <div class="field"><label>Estado físico</label>
        <span class="seg">
          <label class="seg-opt"><input type="radio" name="estado" data-action="set-np-estado" data-tipo="solido" ${np.estado === 'solido' ? 'checked' : ''} />Sólido</label>
          <label class="seg-opt"><input type="radio" name="estado" data-action="set-np-estado" data-tipo="liquido" ${np.estado === 'liquido' ? 'checked' : ''} />Líquido</label>
        </span>
      </div>
      ${np.estado === 'liquido' ? `<div class="field"><label>Densidade (kg/L)</label><input class="input" type="number" data-action="set-np-densidade" value="${esc(np.densidade)}" /></div>` : ''}
      ${template && template.aviso ? `<p class="notice-flat span-all">${esc(template.aviso)}</p>` : ''}
      <div class="span-all" style="display:flex;gap:9px">
        <button type="button" class="btn btn-primary" data-action="salvar-produto" style="min-height:46px" ${state.ocupado ? 'disabled' : ''}>${state.ocupado ? 'Salvando…' : 'Salvar produto'}</button>
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
          <div class="product-card-detail">${[esc(p.marca), esc(p.principioAtivo), p.estadoFisico === 'liquido' ? 'líquido' : 'sólido', p.preco ? moeda(p.preco) + '/' + (p.estadoFisico === 'liquido' ? 'L' : 'kg') : null].filter(Boolean).join(' · ')}</div>
          <div class="product-card-source">${esc(p.fonte || '')}</div>
          <div class="product-card-actions"><button type="button" class="btn btn-ghost" data-action="excluir-produto" data-id="${p.id}" style="font-size:12px">Excluir</button></div>
        </div>`).join('')}
      ${!produtosVisiveis.length ? `<p class="empty-note">Nenhum produto cadastrado nesta categoria ainda.</p>` : ''}
    </div>`;
}

/* ── ações ───────────────────────────────────────────────────────────────── */

const actions = {
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
    if (!f.nome.trim()) { toast('Dê um nome ao cliente.'); return; }
    await DB.salvarCliente({
      id: f.id, nome: f.nome.trim(), telefone: f.telefone.trim(), email: f.email.trim(),
      endereco: f.endereco.trim(), observacoes: f.observacoes.trim(),
    });
    state.clientes = await DB.listarClientes();
    state.screen = null; state.tab = 'clientes'; state.formCliente = null;
    toast(f.id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  },
  'excluir-cliente': async (el) => {
    if (!confirm('Excluir este cliente também exclui todas as piscinas, histórico e consumos associados a ele. Essa ação não pode ser desfeita. Continuar?')) return;
    await DB.excluirCliente(el.dataset.id);
    const [clientes, piscinas, historico, consumos] = await Promise.all([
      DB.listarClientes(), DB.listarPiscinas(), DB.listarTodoHistorico(), DB.listarConsumos(),
    ]);
    state.clientes = clientes; state.piscinas = piscinas; state.historico = historico; state.consumos = consumos;
    state.screen = null; state.tab = 'clientes'; state.formCliente = null;
    toast('Cliente excluído.');
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
    if (!f.nome.trim()) { toast('Dê um nome à piscina.'); return; }
    const calc = litragemPreview(f);
    if (!calc.ok) { toast('Confira as medidas — a litragem não pôde ser calculada.'); return; }
    const registro = {
      id: f.id, clienteId: state.clienteAtualId, nome: f.nome.trim(), sistemaDesinfeccao: f.sistema,
      faixaSal: f.sistema === 'salino' && (f.salMin || f.salMax) ? { min: Number(f.salMin) || undefined, max: Number(f.salMax) || undefined } : null,
      formato: f.formato, unidade: f.unidade, modoProf: f.modoProf,
      prof: f.formato !== 'irregular' ? f.prof : null, profMin: f.formato !== 'irregular' ? f.profMin : null, profMax: f.formato !== 'irregular' ? f.profMax : null,
      formas: f.formato !== 'irregular' ? f.formas : [],
      litros: calc.litros, aproximado: !!calc.aproximado,
      litrosManuais: f.formato === 'irregular' ? f.litrosManuais : null,
    };
    await DB.salvarPiscina(registro);
    state.piscinas = await DB.listarPiscinas();
    state.screen = 'cliente-detalhe'; state.formPiscina = null;
    toast(f.id ? 'Piscina atualizada.' : `Piscina cadastrada com ${Math.round(calc.litros).toLocaleString('pt-BR')} L.`);
  },
  'excluir-piscina': async (el) => {
    if (!confirm('Excluir esta piscina também exclui o histórico e os consumos associados a ela. Essa ação não pode ser desfeita. Continuar?')) return;
    const id = el.dataset.id;
    await DB.excluirPiscina(id);
    const [piscinas, historico, consumos] = await Promise.all([DB.listarPiscinas(), DB.listarTodoHistorico(), DB.listarConsumos()]);
    state.piscinas = piscinas; state.historico = historico; state.consumos = consumos;
    if (state.medirPoolId === id) state.medirPoolId = null;
    if (state.salPoolId === id) state.salPoolId = null;
    if (state.histPoolId === id) state.histPoolId = 'todas';
    if (state.custoPoolId === id) state.custoPoolId = 'todas';
    state.screen = 'cliente-detalhe'; state.formPiscina = null;
    toast('Piscina excluída.');
  },

  // medir / resultado
  'set-medir-pool': (el) => { state.medirPoolId = el.value; state.leituras = {}; },
  'set-leitura': (el) => { state.leituras[el.dataset.param] = el.value; },
  'set-escolha': (el) => { state.escolhas[el.dataset.dir] = el.value; },
  'rodar-diagnostico': async () => {
    const pool = piscinaPorId(state.medirPoolId);
    if (!pool) { toast('Cadastre uma piscina primeiro.'); return; }
    const sistemaDesinfeccao = ['salino', 'ozonio'].includes(pool.sistemaDesinfeccao) ? pool.sistemaDesinfeccao : 'manual';
    const parametrosAtivos = PARAMETROS.filter((p) => !p.apenasSistema || p.apenasSistema === sistemaDesinfeccao);
    const leituras = {};
    parametrosAtivos.forEach((p) => {
      const raw = state.leituras[p.id];
      if (raw !== '' && raw != null && Number.isFinite(Number(raw))) leituras[p.id] = Number(raw);
    });
    if (Object.keys(leituras).length === 0) { toast('Informe ao menos uma leitura.'); return; }

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

    state.resultado = { poolId: pool.id, registro, passos, checklist, checklistAberto: false };
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
    if (itens.length === 0) { toast('Marque ao menos um produto com quantidade maior que zero.'); return; }
    await DB.registrarConsumos(itens);
    state.consumos = await DB.listarConsumos();
    state.screen = null; state.tab = 'custos'; state.resultado = null;
    toast(itens.length + ' produto(s) registrado(s) no relatório de custos.');
  },

  // histórico
  'set-hist-pool': (el) => { state.histPoolId = el.value; },
  'set-hist-data': (el) => { state.histData = el.value; },
  'alternar-historico': (el) => { state.histAbertos[el.dataset.id] = !state.histAbertos[el.dataset.id]; },

  // custos
  'set-custo-pool': (el) => { state.custoPoolId = el.value; },

  // sal
  'set-sal-pool': (el) => {
    state.salPoolId = el.value;
    const fx = faixaSalDe(piscinaPorId(el.value));
    state.salMeta = String(Math.round((fx.min + fx.max) / 2));
    state.salResultado = null;
  },
  'set-sal-atual': (el) => { state.salAtual = el.value; state.salResultado = null; },
  'set-sal-meta': (el) => { state.salMeta = el.value; state.salResultado = null; },
  'set-sal-produto': (el) => { state.salProdutoId = el.value; state.salResultado = null; },
  'calcular-sal': () => {
    const pool = piscinaPorId(state.salPoolId);
    const atual = Number(state.salAtual);
    const faixa = faixaSalDe(pool);
    const meta = Number(state.salMeta) || Math.round((faixa.min + faixa.max) / 2);
    const produtos = state.produtos;
    const produto = produtos.find((p) => p.id === state.salProdutoId) || produtosDe(produtos, ['Sal para Piscina'])[0] || null;
    if (!pool || !produto || !Number.isFinite(atual)) { toast('Informe o sal medido e escolha a piscina.'); return; }
    if (meta <= atual) { toast('A meta já foi atingida — não é necessário adicionar sal.'); return; }
    const kg = calcularDose({ variacao: meta - atual, volumeLitros: pool.litros, concentracaoPercentual: produto.concentracao });
    if (kg == null) { toast('Não foi possível calcular — confira a concentração cadastrada do produto.'); return; }
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
    toast('Reposição de sal registrada no relatório de custos.');
  },

  // produtos
  'pick-categoria': (el) => { state.catAtiva = el.dataset.tipo; },
  'toggle-form-produto': () => {
    state.produtoFormAberto = !state.produtoFormAberto;
    if (state.produtoFormAberto) state.novoProduto = novoProdutoVazio();
  },
  'set-np-tipo': (el) => {
    const t = TEMPLATES_PRODUTO.find((x) => x.tipo === el.value);
    state.novoProduto.tipo = el.value;
    state.novoProduto.principio = t ? t.principioAtivo : '';
    state.novoProduto.estado = t && t.estadoFisico === 'liquido' ? 'liquido' : 'solido';
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
    if (!np.nome.trim() || !(Number(np.concentracao) > 0)) { toast('Informe o nome comercial e a concentração declarada.'); return; }
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
    toast('Produto cadastrado.');
  },
  'excluir-produto': async (el) => {
    if (!confirm('Excluir este produto?')) return;
    await DB.excluirProduto(el.dataset.id);
    state.produtos = await DB.listarProdutos();
    toast('Produto excluído.');
  },

  // autenticação
  'auth-set-modo': (el) => { state.authMode = el.dataset.modo; state.authErro = ''; },
  'auth-set-email': (el) => { state.authEmail = el.value; },
  'auth-set-senha': (el) => { state.authSenha = el.value; },
  'auth-submeter': async () => {
    state.authErro = '';
    if (!state.authEmail.trim() || !state.authSenha) { state.authErro = 'Preencha e-mail e senha.'; return; }
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
  return renderScreenClientes();
}

function garantirShellApp() {
  if (document.getElementById('main')) return;
  document.getElementById('root').innerHTML = `
    <div class="nav-top" id="nav-top"></div>
    <div class="mobile-header">
      <i class="ph ph-drop brand-icon"></i>
      <span class="brand-label" style="flex:1">Banheza Pool</span>
      <button type="button" class="account-btn" data-action="sair"><i class="ph ph-sign-out"></i>Sair</button>
    </div>
    <main class="main" id="main"></main>
    <nav class="nav-bottom" id="nav-bottom"></nav>
    <div class="toast" id="toast" hidden></div>`;
}

function renderAll() {
  const root = document.getElementById('root');
  if (state.booting || (!state.session)) {
    root.innerHTML = state.booting ? '<div class="auth-screen"><p class="auth-note">Carregando…</p></div>' : renderAuthScreen();
    return;
  }
  if (state.carregandoDados) {
    root.innerHTML = '<div class="auth-screen"><p class="auth-note">Carregando seus dados…</p></div>';
    return;
  }
  if (state.erroCarregar) {
    root.innerHTML = `<div class="auth-screen"><div class="auth-card"><p class="auth-error">${esc(state.erroCarregar)}</p><button type="button" class="btn btn-primary btn-block" data-action="tentar-de-novo">Tentar de novo</button></div></div>`;
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
  } catch (e) {
    state.erroCarregar = e.message || 'Não foi possível carregar seus dados.';
  }
  state.carregandoDados = false;
  renderAll();
}

function renderNaoConfigurado() {
  document.getElementById('root').innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><i class="ph ph-drop brand-icon"></i><span class="brand-label">Banheza Pool</span></div>
        <div class="auth-form">
          <p class="auth-error">Este app ainda não está configurado. Abra <code>js/supabase-config.js</code> e preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> com os dados do seu projeto Supabase (Project Settings → API), depois rode <code>supabase/schema.sql</code> no SQL Editor.</p>
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
