# ObraFácil Orçamentos — MVP (PWA offline)

🌐 **Produção:** https://obrafacil01.vercel.app (deploy automático a cada push na `main`)

## Login (PRD — e-mail + senha, backend Supabase)
Tela de login conforme PRD: e-mail + senha, mostrar/ocultar senha, validação, erro genérico, "Esqueci minha senha" com link por e-mail, freio local anti-automação. Sem sessão válida não há acesso às telas.

**Sessão:** depois de entrar, o usuário continua logado no aparelho até tocar em **Sair** (Meus dados → Conta). Sem internet, o app abre com o último usuário que entrou naquele celular.

**Cadastro simples (sem confirmação):** "Criar conta" pede e-mail + senha e já entra no app. Exige no Supabase: Authentication → Sign In/Up → Email → **"Confirm email" desligado**. O único e-mail que o app manda é o de **recuperar senha**. Para fechar o cadastro público: desligue "Allow new users to sign up" e esconda o botão `#login-signup` no `index.html`.

**Senha:** "Esqueci minha senha" manda link por e-mail (vale só o último; link vencido reabre o pedido). Logado, dá para trocar em Meus dados → Conta → **Alterar senha**.

**Cada usuário vê só os próprios dados:** no celular os dados ficam em `obrafacil_v1_<id do usuário>` e na nuvem a tabela tem RLS (`auth.uid() = user_id`). Trocar de conta troca tudo.

### Ativar o backend (5 min, uma vez)
1. Crie o projeto em supabase.com → copie **URL** e **anon public key** (Settings → API).
2. Em Authentication → Sign In/Up: ative o provedor **Email**. deixe "Confirm email" **desligado** (cadastro entra na hora).
3. Em Authentication → URL Configuration: coloque `https://obrafacil-orcamentos.vercel.app` como **Site URL** e também nas **Redirect URLs** (links de confirmação e de recuperação de senha voltam para lá).
4. Configure as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` no projeto da Vercel (lidas por `api/config.js`), ou cole URL e chave em `auth-config.js`.
5. **Nuvem dos dados:** Supabase → SQL Editor → cole e rode `supabase/obrafacil_data.sql` (uma vez). Sem isso o app funciona, mas os dados ficam só no celular (Meus dados mostra "Nuvem: indisponível").
6. Suba (`vercel --prod --yes`) e teste.

### Dados na nuvem
Orçamentos, clientes, serviços e dados do PDF ficam no celular **e** numa cópia na tabela `obrafacil_data` (1 linha por usuário, cada um só vê a sua — RLS). Trocar de celular = entrar com o mesmo e-mail. Sem internet, as alterações ficam pendentes e sobem quando a conexão volta. Em conflito entre dois aparelhos vale a alteração mais recente.

## Redeploy
`vercel --prod --yes` na pasta do projeto (logado como igorrossi20).

App: `index.html` + `styles.css` + `app.js` + `manifest.webmanifest` + `sw.js` (funciona offline; login e cópia na nuvem via Supabase).

## Rodar
- Duplo-clique em `index.html`, ou `npx serve .` e abra no celular.
- Para instalar: Chrome/Safari → "Adicionar à tela inicial".

## Roteiro de teste (meta: 3 min)
1. 👷 Cadastre nome + WhatsApp (+ logo opcional).
2. 🧰 Cadastre 2–3 serviços com preço.
3. ＋ Novo orçamento → escolha cliente (ou ＋ cadastre sem sair da tela) + nome da obra.
4. Adicione itens pelo catálogo, ajuste qtd/preço, aplique desconto.
5. Revise → Salvar e ver PDF → Gerar PDF (imprimir/salvar).
6. Compartilhar → WhatsApp / e-mail / copiar mensagem.
7. Feche e reabra: dados continuam. Duplique um orçamento e gere de novo.

## Regras garantidas
- Total = Σ(qtd × unit) − desconto (travado em ≥ 0). Ex.: 30×35+20×28+2×180 = R$ 1.970,00.
- Nº sequencial único, catálogo não altera orçamentos antigos, compartilhar nunca auto-aprova.

## Instalar no celular
Início → **Instalar app**. No Android/Chrome abre o convite de instalação; no iPhone (e quando o navegador não oferece o convite) mostra o passo a passo (Compartilhar → Adicionar à Tela de Início). Depois de instalado, o cartão vira atalho para Meus Dados. A tela de métricas do Piloto foi retirada do app.

## Fase 4 — backlog priorizado (só após o piloto)
1. ✅ Rodada de atrito por inspeção (meta 3 min, uso com luva/poeira): steppers −/+ de quantidade, dados de exemplo marcados com botão "Apagar exemplos", botão "Marcar como enviado" pós-compartilhar (manual, RN-08 preservada). Validar com pedreiros reais no piloto.
2. ✅ Mensagem de WhatsApp profissional e editável (Meus dados → Mensagem do WhatsApp). Blocos prontos {cabecalho} {saudacao} {intro} {itens} {totais} {condicoes} {assinatura} — linhas vazias (desconto zero, sem prazo, sem obs.) somem sozinhas. Campos avulsos: {cliente} {obra} {numero} {total} {subtotal} {desconto} {validade} {profissional}.
3. ✅ Lembrete de retorno: faixa "Retomar contato" em Meus Orçamentos (enviados a ≤7 dias do vencimento ou vencidos) + botão Cobrar no WhatsApp — sem agenda.
4. NÃO fazer agora (§9): IA por voz, calculadora de materiais, financeiro, assinatura eletrônica, agenda/equipe, estoque, fornecedores, nota fiscal.
