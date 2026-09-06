// Camada de dados do Banheza Pool — substitui o antigo storage.js (localStorage) por
// chamadas assíncronas ao Supabase (Postgres + Auth). Mantém nomes de campo em JS (camelCase)
// no que entra/sai daqui, convertendo de/para as colunas do banco (snake_case) internamente —
// o resto do app (app.js) não precisa saber como as tabelas são organizadas.

// Antes de tentar criar o cliente: se as chaves em supabase-config.js ainda forem os
// placeholders (ou não parecerem uma URL/chave válidas), não chama createClient — ele lança
// uma exceção síncrona com uma URL inválida, o que travaria o carregamento de todo o app.js
// (que vem depois deste script) e deixaria a tela em branco sem nenhuma pista do motivo.
const DB_CONFIGURADO = (() => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    if (SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI')) return false;
    new URL(SUPABASE_URL);
    return true;
  } catch (e) {
    return false;
  }
})();

const supabaseClient = DB_CONFIGURADO ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function traduzErroAuth(error) {
  const msg = (error && error.message) || '';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com este e-mail.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).';
  if (/Unable to validate email address/i.test(msg)) return 'E-mail inválido.';
  if (/Failed to fetch/i.test(msg)) return 'Não foi possível conectar ao servidor — confira sua internet e as chaves em js/supabase-config.js.';
  return msg || 'Não foi possível completar a operação.';
}

function checar({ error }) {
  if (error) throw new Error(error.message || 'Não foi possível completar a operação.');
}

/* ── conversão linha do banco <-> objeto do app ─────────────────────────────── */

function rowToCliente(r) {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone || '', email: r.email || '',
    endereco: r.endereco || '', observacoes: r.observacoes || '', createdAt: r.created_at,
  };
}
function clienteToRow(c) {
  const row = {
    nome: c.nome, telefone: c.telefone || null, email: c.email || null,
    endereco: c.endereco || null, observacoes: c.observacoes || null,
  };
  if (c.id) row.id = c.id;
  return row;
}

function rowToPiscina(r) {
  return {
    id: r.id, clienteId: r.cliente_id, nome: r.nome,
    sistemaDesinfeccao: r.sistema_desinfeccao,
    faixaSal: (r.sal_min != null || r.sal_max != null) ? { min: r.sal_min, max: r.sal_max } : null,
    formato: r.formato, unidade: r.unidade, modoProf: r.modo_prof,
    prof: r.prof, profMin: r.prof_min, profMax: r.prof_max,
    formas: r.formas || [], litros: Number(r.litros), aproximado: !!r.aproximado,
    litrosManuais: r.litros_manuais, createdAt: r.created_at,
  };
}
function piscinaToRow(p) {
  const row = {
    cliente_id: p.clienteId, nome: p.nome, sistema_desinfeccao: p.sistemaDesinfeccao,
    sal_min: p.faixaSal && p.faixaSal.min != null ? p.faixaSal.min : null,
    sal_max: p.faixaSal && p.faixaSal.max != null ? p.faixaSal.max : null,
    formato: p.formato, unidade: p.unidade, modo_prof: p.modoProf,
    prof: p.prof || null, prof_min: p.profMin || null, prof_max: p.profMax || null,
    formas: p.formas || [], litros: p.litros, aproximado: !!p.aproximado,
    litros_manuais: p.litrosManuais || null,
  };
  if (p.id) row.id = p.id;
  return row;
}

function rowToProduto(r) {
  return {
    id: r.id, tipo: r.tipo, nomeComercial: r.nome_comercial, marca: r.marca || '',
    principioAtivo: r.principio_ativo || '', concentracao: Number(r.concentracao),
    estadoFisico: r.estado_fisico, densidade: r.densidade, preco: r.preco, fonte: r.fonte || '',
  };
}
function produtoToRow(p) {
  const row = {
    tipo: p.tipo, nome_comercial: p.nomeComercial, marca: p.marca || null,
    principio_ativo: p.principioAtivo || null, concentracao: p.concentracao,
    estado_fisico: p.estadoFisico, densidade: p.densidade || null, preco: p.preco || null,
    fonte: p.fonte || null,
  };
  if (p.id) row.id = p.id;
  return row;
}

function rowToHistorico(r) {
  return { id: r.id, piscinaId: r.piscina_id, data: r.data, leituras: r.leituras || {}, passos: r.passos || [] };
}

function rowToConsumo(r) {
  return {
    id: r.id, piscinaId: r.piscina_id, produtoId: r.produto_id, produtoNome: r.produto_nome,
    quantidade: Number(r.quantidade), unidade: r.unidade, diagnosticoId: r.diagnostico_id, data: r.data,
  };
}
function consumoToRow(c) {
  return {
    piscina_id: c.piscinaId, produto_id: c.produtoId || null, produto_nome: c.produtoNome,
    quantidade: c.quantidade, unidade: c.unidade, diagnostico_id: c.diagnosticoId || null,
  };
}

/* ── API pública ─────────────────────────────────────────────────────────────── */

const DB = {
  configurado: DB_CONFIGURADO,

  // ---- autenticação ----
  async signUp(email, senha) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password: senha });
    if (error) throw new Error(traduzErroAuth(error));
    return data;
  },
  async signIn(email, senha) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduzErroAuth(error));
    return data;
  },
  async signOut() {
    await supabaseClient.auth.signOut();
  },
  async getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session || null;
  },
  onAuthStateChange(cb) {
    return supabaseClient.auth.onAuthStateChange(cb);
  },

  // ---- clientes ----
  async listarClientes() {
    const r = await supabaseClient.from('clientes').select('*').order('nome');
    checar(r);
    return r.data.map(rowToCliente);
  },
  async salvarCliente(cliente) {
    const r = await supabaseClient.from('clientes').upsert(clienteToRow(cliente)).select().single();
    checar(r);
    return rowToCliente(r.data);
  },
  async excluirCliente(id) {
    checar(await supabaseClient.from('clientes').delete().eq('id', id));
  },

  // ---- piscinas ----
  async listarPiscinas() {
    const r = await supabaseClient.from('piscinas').select('*').order('nome');
    checar(r);
    return r.data.map(rowToPiscina);
  },
  async salvarPiscina(piscina) {
    const r = await supabaseClient.from('piscinas').upsert(piscinaToRow(piscina)).select().single();
    checar(r);
    return rowToPiscina(r.data);
  },
  async excluirPiscina(id) {
    checar(await supabaseClient.from('piscinas').delete().eq('id', id));
  },

  // ---- produtos ----
  // Semeia o catálogo padrão (mesmos produtos/concentrações de referência do
  // products-data.js) na primeira vez que o catálogo do usuário está vazio — mesma ideia do
  // antigo Storage.garantirProdutosPadrao(), só que por conta em vez de por navegador.
  async garantirProdutosPadrao() {
    const atuais = await this.listarProdutos();
    if (atuais.length > 0) return;
    const linhas = DEFAULT_PRODUTOS.map((p) => produtoToRow({
      tipo: p.tipo, nomeComercial: p.nomeComercial, marca: p.marca, principioAtivo: p.principioAtivo,
      concentracao: p.concentracao, estadoFisico: p.estadoFisico, densidade: p.densidade,
      preco: p.preco, fonte: p.fonte,
    }));
    checar(await supabaseClient.from('produtos').insert(linhas));
  },
  async listarProdutos() {
    const r = await supabaseClient.from('produtos').select('*').order('tipo');
    checar(r);
    return r.data.map(rowToProduto);
  },
  async salvarProduto(produto) {
    const r = await supabaseClient.from('produtos').upsert(produtoToRow(produto)).select().single();
    checar(r);
    return rowToProduto(r.data);
  },
  async excluirProduto(id) {
    checar(await supabaseClient.from('produtos').delete().eq('id', id));
  },

  // ---- histórico ----
  async listarTodoHistorico() {
    const r = await supabaseClient.from('historico').select('*').order('data', { ascending: false });
    checar(r);
    return r.data.map(rowToHistorico);
  },
  async registrarDiagnostico(piscinaId, leituras, passos) {
    const r = await supabaseClient.from('historico').insert({ piscina_id: piscinaId, leituras, passos }).select().single();
    checar(r);
    return rowToHistorico(r.data);
  },

  // ---- consumos ----
  async listarConsumos() {
    const r = await supabaseClient.from('consumos').select('*').order('data', { ascending: false });
    checar(r);
    return r.data.map(rowToConsumo);
  },
  async registrarConsumos(itens) {
    const r = await supabaseClient.from('consumos').insert(itens.map(consumoToRow)).select();
    checar(r);
    return r.data.map(rowToConsumo);
  },
};
