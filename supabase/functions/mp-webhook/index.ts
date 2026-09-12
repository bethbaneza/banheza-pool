// Banheza Pool — webhook do Mercado Pago.
//
// Recebe a notificação de assinatura/pagamento do Mercado Pago (o corpo dela só traz um id,
// não os dados em si — por isso a function busca os detalhes de volta na API do Mercado Pago
// usando o Access Token antes de confiar em qualquer coisa) e atualiza perfis.plano de acordo
// com o valor cobrado (R$19,90 -> básico, R$49,90 -> ilimitado) e o status da assinatura
// (authorized -> plano pago; paused/cancelled -> volta pro grátis).
//
// DEPLOY (ver instruções completas na conversa com o Claude Code):
//   supabase functions deploy mp-webhook --no-verify-jwt
// --no-verify-jwt é obrigatório: o Mercado Pago não manda um JWT do Supabase, só o corpo da
// notificação — com a verificação padrão ligada, toda chamada seria rejeitada com 401 antes
// de chegar aqui.
//
// SEGREDOS (Supabase Dashboard -> Edge Functions -> Secrets):
//   MP_ACCESS_TOKEN — access token de produção do Mercado Pago (aplicação "Banheza Pool").
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente de toda
// Edge Function — não precisa cadastrar.
//
// Depois de publicada, configure a URL da function (algo como
// https://<seu-projeto>.supabase.co/functions/v1/mp-webhook) como webhook na aplicação
// "Banheza Pool" do Mercado Pago, nos eventos de assinatura (preapproval) e pagamento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Preço -> plano (ver PLANOS em js/app.js). Tolerância de 1 centavo pra evitar problema de
// ponto flutuante vindo da API (19.9 podendo chegar como 19.90000000000001, por exemplo).
function planoPorValor(valor: number): 'basico' | 'ilimitado' | null {
  if (valor == null) return null;
  if (Math.abs(valor - 19.9) < 0.01) return 'basico';
  if (Math.abs(valor - 49.9) < 0.01) return 'ilimitado';
  return null;
}

async function buscarNaApiDoMercadoPago(caminho: string) {
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status} em ${caminho}`);
  return r.json();
}

// Procura o usuário do Banheza Pool pelo e-mail de quem pagou. auth.admin.listUsers() não
// filtra por e-mail em todas as versões da API, então busca uma página grande e filtra aqui —
// suficiente pra uma base de clientes pequena/média; se crescer muito, paginar de verdade.
async function encontrarUsuarioPorEmail(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function aplicarStatusDaAssinatura(preapproval: any) {
  const { id: preapprovalId, payer_email: payerEmail, status, auto_recurring } = preapproval;
  if (!payerEmail) {
    console.log(`Preapproval ${preapprovalId} sem payer_email — ignorando.`);
    return;
  }
  const usuario = await encontrarUsuarioPorEmail(payerEmail);
  if (!usuario) {
    console.log(`Nenhum usuário do Banheza Pool com o e-mail ${payerEmail} (preapproval ${preapprovalId}).`);
    return;
  }

  const ativo = status === 'authorized';
  const plano = ativo ? (planoPorValor(auto_recurring?.transaction_amount) || 'gratis') : 'gratis';
  const statusAssinatura = status === 'authorized' ? 'ativa' : status === 'paused' ? 'atrasada' : 'cancelada';

  const { error } = await supabase
    .from('perfis')
    .update({ plano, status_assinatura: statusAssinatura, mp_preapproval_id: preapprovalId, updated_at: new Date().toISOString() })
    .eq('id', usuario.id);
  if (error) throw error;
  console.log(`perfis.plano = '${plano}' pra ${usuario.id} (${payerEmail}), status Mercado Pago: ${status}.`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return new Response('corpo invalido', { status: 400 });
  }

  // O Mercado Pago manda formatos ligeiramente diferentes dependendo da origem da notificação
  // (campo `type` ou `topic`; id em `data.id` ou direto em `id`) — cobre as variações comuns.
  const tipo = corpo.type || corpo.topic;
  const id = corpo.data?.id || corpo.id;

  try {
    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      const preapproval = await buscarNaApiDoMercadoPago(`/preapproval/${id}`);
      await aplicarStatusDaAssinatura(preapproval);
    } else if (tipo === 'subscription_authorized_payment') {
      const pagamento = await buscarNaApiDoMercadoPago(`/authorized_payments/${id}`);
      if (pagamento.status === 'processed' && pagamento.preapproval_id) {
        const preapproval = await buscarNaApiDoMercadoPago(`/preapproval/${pagamento.preapproval_id}`);
        await aplicarStatusDaAssinatura(preapproval);
      }
    } else {
      console.log('Notificação ignorada (tipo não tratado):', tipo, corpo);
    }
  } catch (e) {
    // Responde 200 mesmo com erro interno pra evitar reenvio em loop pelo Mercado Pago — o
    // erro já fica registrado no log da function (Dashboard -> Edge Functions -> Logs) pra
    // investigar depois.
    console.error('Erro processando webhook do Mercado Pago:', e);
  }

  return new Response('ok', { status: 200 });
});
