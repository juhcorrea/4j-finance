# Configuração técnica do Pix automático

Este módulo está preparado localmente e **desativado por padrão**. Não foi publicado nem testado com a conta real do Mercado Pago. O HTML sozinho não consegue confirmar Pix: estas funções devem rodar no servidor Firebase.

## O que foi implementado

- R$ 5,00, uma única vez, para remover anúncios **da conta autenticada**. O benefício não depende do perfil financeiro/família selecionado.
- Cobrança Pix dinâmica vinculada ao UID Firebase, produto e pedido; CPF enviado somente ao Mercado Pago, sem gravação no Firestore ou logs deste código.
- Reutilização de Pix pendente e chave de idempotência. Em resposta perdida, busca autenticada pela referência do pedido antes de criar outra cobrança.
- Webhook com HMAC; conferência posterior do pagamento na API do Mercado Pago. O corpo enviado pelo navegador/webhook nunca comprova pagamento.
- Conferência de R$ 5,00, BRL, Pix, conta recebedora, ambiente, UID, SKU e pedido.
- Benefício em custom claims Firebase Auth (`adFreeLifetime` e IDs de pagamentos), não em campo de perfil editável. Flags e recibos Firestore sozinhos não concedem benefício.
- Reembolso parcial/integral ou chargeback retira o benefício daquele pagamento; outro pagamento aprovado da mesma pessoa o preserva.
- Conta ativa e e-mail confirmado para criar pagamento. Não há aprovação manual de cada compra.

## Preparação da conta

1. Crie uma aplicação em **Mercado Pago Developers > Suas integrações**, para Checkout Transparente via API Payments. Habilite Pix na conta recebedora.
2. Configure as credenciais **diretamente no seu computador/painel**. Nunca cole Access Token ou segredo do webhook no chat, HTML, Git ou armazenamento do navegador.
3. Obtenha o ID numérico da conta recebedora. `MP_COLLECTOR_ID` deve corresponder ao `collector_id` da conta ligada ao token.
4. Use outro projeto Firebase para testes. Nenhum pagamento de teste deve conceder benefício em contas reais.
5. As Functions exigem um projeto com cobrança habilitada para publicação; confira o plano Blaze, custos e alertas antes de ativar.

A chave Pix aleatória recebida na conversa **não foi copiada para os arquivos**. A API usa as credenciais da conta Mercado Pago para criar cada cobrança.

## Configuração local e servidor

Requisitos: Node.js 22 e Firebase CLI. No projeto de publicação, o `firebase.json` deve apontar `functions.source` para esta pasta.

Dentro da pasta `functions`:

```powershell
npm install
npm test
npm run check
```

As versões diretas foram consultadas no registro npm e fixadas: firebase-admin 14.5.0 e firebase-functions 7.4.0. As dependências foram instaladas localmente sem executar scripts de instalação. O package-lock.json foi gerado; use npm ci --ignore-scripts para reproduzir a instalação. A validação local usou Node 24; o runtime configurado de publicação continua Node 22.

No diretório que contém o `firebase.json`, selecione explicitamente o projeto correto:

```powershell
firebase use SEU_PROJETO
firebase functions:secrets:set MP_ACCESS_TOKEN --project SEU_PROJETO
firebase functions:secrets:set MP_WEBHOOK_SECRET --project SEU_PROJETO
```

Digite os valores nas solicitações da CLI. O segredo do webhook vem de **Suas integrações > Webhooks**, e não é o Access Token.

Copie `.env.example` para `.env.SEU_PROJETO` dentro de `functions`, ajustando:

```dotenv
MP_COLLECTOR_ID=ID_NUMERICO_DA_CONTA
MP_LIVE_MODE=false
MP_WEBHOOK_URL=https://southamerica-east1-SEU_PROJETO.cloudfunctions.net/mercadoPagoWebhook
PAYMENTS_ENABLED=false
```

- **Teste:** projeto Firebase separado + credenciais de teste + `MP_LIVE_MODE=false`.
- **Produção:** credenciais reais + `MP_LIVE_MODE=true`, depois de validar a integração.
- Mantenha `PAYMENTS_ENABLED=false` até configurar regras e webhook. A opção controla novas cobranças; consultas/estornos de pagamentos existentes continuam funcionando.
- Nunca hospede esta pasta, arquivos `.env`, código do servidor ou backups junto ao `index.html` público.

## Firestore e privacidade

O arquivo `firestore-billing.rules.fragment` contém os três bloqueios necessários para `billingOrders`, `billingAccounts` e `billingLocks`. Insira-os nas regras completas da aplicação e teste as regras antes de publicar.

**Um bloqueio não sobrepõe uma permissão mais ampla.** Remova qualquer regra genérica que permita ao cliente ler ou escrever estas coleções. A aplicação também precisa de regras próprias de isolamento entre pessoas e famílias: este módulo de pagamento não corrige automaticamente o acesso global de ADMIN do site antigo.

O servidor usa Admin SDK. Não é necessário liberar leitura das coleções de cobrança ao navegador; ele usa funções autenticadas.

## Webhook e publicação

Depois de preparar e revisar a configuração:

```powershell
firebase deploy --only functions --project SEU_PROJETO
```

No painel Mercado Pago, configure o evento **Pagamentos (payment)** para a URL HTTPS `mercadoPagoWebhook` publicada. Registre o segredo correto no Secret Manager. Se alterar um segredo, publique novamente as funções consumidoras.

Para ativar de verdade: finalize testes em projeto separado, publique as regras completas, configure `MP_LIVE_MODE=true` e `PAYMENTS_ENABLED=true` em produção, republique as Functions e só então habilite a opção de pagamentos na configuração do HTML. Não exponha um botão de compra antes disso.

Teste pelo painel e com o fluxo suportado pela sua conta: um simulador que não forneça um ID de pagamento consultável na API pode não completar este webhook. Nunca simule produção alterando manualmente claims ou registros de cobrança.

## Contrato com o HTML

Região: `southamerica-east1`.

| Função callable | Entrada | Resposta principal |
|---|---|---|
| `getMonetizationStatus` | `{}` | `adFreeLifetime`, `price:5`, `currency:'BRL'`, `paymentsEnabled` |
| `createPixCheckout` | `{cpf}` | `orderId`, `paymentId`, `status`, `amount:5`, `currency:'BRL'`, `qrCode`, `qrCodeBase64`, `ticketUrl`, `expiresAt`, `adFreeLifetime` |
| `checkPixCheckout` | `{orderId}` | os mesmos campos do checkout |
| `mercadoPagoWebhook` | HTTP POST assinado | `200` somente após processar; `503` para nova tentativa em falhas |

Se já houver benefício ativo, `createPixCheckout` responde `{status:'approved',adFreeLifetime:true}` e não cria cobrança. O HTML deve tratar esta resposta antes de exigir dados do QR.

Só `adFreeLifetime === true`, retornado pelo servidor, confirma o benefício. Após aprovação, o cliente deve renovar seu token com `getIdToken(true)` e garantir que o script de anúncios não seja carregado novamente. Falha de consulta não pode ser interpretada como sucesso.

## Testes feitos e limites

A suíte usa dados sintéticos e simulações de Auth, Firestore e API Mercado Pago. Valida assinatura, adulteração, valor fixo, vínculo de conta, reutilização, recuperação, aprovação, estorno e repetição de webhook. Não são testes do ambiente real, da aceitação comercial do Mercado Pago ou das regras atualmente publicadas no Firebase.

Antes de vender, teste no ambiente configurado: confirmação automática com a página fechada, atualização ao voltar, segunda sessão/celular, tentativa de usar pedido de outra conta, notificações repetidas, falha transitória, estorno e chamadas sem login. Configure monitoramento e alertas de cobrança. O limite local é 5 pedidos por usuário/dia; App Check e proteção adicional de abuso podem ser ativados após preparar o cliente.

## Referências oficiais

- [Pix via API Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix)
- [Assinatura dos webhooks](https://www.mercadopago.com.br/developers/en/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks)
- [Consulta de pagamentos por referência](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/payment-management)
- [Funções callable](https://firebase.google.com/docs/functions/callable)
- [Secrets e parâmetros](https://firebase.google.com/docs/functions/config-env)
- [Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Plano e preparação das Functions](https://firebase.google.com/docs/functions/get-started)


## Consumo preparado

Cada função mantém minInstances=0 (nenhuma instância reservada), maxInstances=5, memória de 256 MiB e timeout de 120 segundos. O limite é por função e não representa um teto de gastos. Mantivemos a capacidade do webhook para não atrasar confirmações e estornos. Com pagamentos desativados no HTML, o frontend não chama getMonetizationStatus. Quando ativado, o status atual ainda revalida pagamentos anteriores no Mercado Pago; não retiramos essa verificação de estornos nesta etapa.
