# Banheza Pool

Web app responsivo (PWA) para quem presta manutenção de piscinas: diagnóstico cruzado
(pH, alcalinidade, cloro, dureza, estabilizante, sal, temperatura), cálculo de litragem e
dosagem, calculadora de sal, cadastro de produtos químicos, relatório de custos, histórico
de diagnósticos, cadastro de clientes e piscinas, e login com conta própria.

Derivado do projeto [`calculadora-piscinas`](../calculadora-piscinas) — mesma interface
(tema Nocturne) e os mesmos módulos de cálculo, agora com clientes/piscinas guardados numa
conta na nuvem (Supabase) em vez de só no navegador, e organizados por cliente
(Cliente → Piscinas).

> ⚠️ As fórmulas de dosagem são regras gerais de referência e devem ser revisadas por um
> técnico/químico responsável antes de qualquer uso em ambiente coletivo.

## Como configurar (primeira vez)

Não há build nem framework — é HTML/CSS/JS puro servido como está. Só precisa de uma conta
gratuita no [Supabase](https://supabase.com) para login e banco de dados.

1. **Crie um projeto no Supabase** (supabase.com → New project).
2. **Rode o schema do banco**: abra o SQL Editor do seu projeto, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e execute. Isso cria as tabelas
   (`clientes`, `piscinas`, `produtos`, `historico`, `consumos`) já com Row Level Security
   habilitada — cada conta só enxerga os próprios dados.
3. **Preencha as chaves**: em Project Settings → API, copie a **Project URL** e a
   **chave publicável** (`anon`/`publishable` — nunca a chave secreta/`service_role`) e
   cole em [`js/supabase-config.js`](js/supabase-config.js):
   ```js
   const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   const SUPABASE_ANON_KEY = 'sb_publishable_...'; // ou a anon key clássica (eyJ...)
   ```
   Essas duas chaves são seguras para ficar no código do navegador — a proteção real dos
   dados vem das regras de acesso do passo 2, não de esconder esta chave.
4. Abra `index.html` (direto no navegador, ou servindo a pasta com qualquer servidor
   estático — ex: `python3 -m http.server 8080`). Crie sua conta pela própria tela de
   login ("Criar conta") e comece a cadastrar clientes.

Se você abrir o app antes de preencher o passo 3, ele mostra um aviso explicando o que
falta, em vez de travar com a tela em branco.

## Estrutura

```
index.html            shell da interface (tema Nocturne, navegação, telas)
manifest.json          metadados do PWA (nome, ícones, cor do tema)
service-worker.js      cache do "app shell" para abrir offline (dados exigem conexão)
icons/                 ícones do PWA (192/512, normal e "maskable")
css/style.css          tokens e componentes do design system + estilos das telas
supabase/schema.sql    tabelas + Row Level Security — rodar uma vez no SQL Editor
js/supabase-config.js  suas chaves do Supabase (preencher — ver acima)
js/db.js               camada de dados: autenticação + CRUD via Supabase
js/volume.js            Módulo 1 — cálculo de litragem (funções puras, sem mudanças)
js/products-data.js     modelos de produtos e concentrações de referência
js/diagnostics.js       classificação, dose e motor de diagnóstico (funções puras, sem mudanças)
js/pdf.js               geração do relatório de diagnóstico em PDF (jsPDF via CDN)
js/app.js              liga a interface aos módulos acima — estado + renderização das telas
                        (login, Clientes, Cadastro de piscina, Medir, Resultado, Sal,
                        Histórico, Custos, Produtos)
tests.html             testes das funções puras de volume.js e diagnostics.js
```

## Modelo de dados

Cada piscina pertence a um cliente (`piscinas.cliente_id → clientes.id`). Cada linha de
`clientes`, `piscinas`, `produtos`, `historico` e `consumos` carrega um `user_id`
(preenchido automaticamente pelo Postgres a partir de quem está logado) e só é visível para
o dono — configurado via Row Level Security em `supabase/schema.sql`, não por lógica no
front-end. Excluir um cliente exclui em cascata suas piscinas, histórico e consumos.

## Testes

`volume.js` e `diagnostics.js` não mudaram em relação ao `calculadora-piscinas` — mesma
suíte de testes em [`tests.html`](tests.html) (funções puras, sem tocar em DOM nem em
rede).

## PWA

O app pode ser "instalado" (Adicionar à tela inicial / Instalar app) em celulares e
desktops compatíveis, abrindo em tela cheia como um app nativo. O service worker cacheia só
os arquivos estáticos (HTML/CSS/JS) para o app abrir mesmo offline — os dados (clientes,
piscinas, histórico) exigem conexão, já que vivem no Supabase.
