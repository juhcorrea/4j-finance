# Configuração técnica do Pix automático

## Estado atual — 15/10/2026

A aplicação do Mercado Pago foi criada para **Checkout Transparente via Orders API**. O código local usa `/v1/orders`; o backend Firebase ainda não foi publicado. A usuária decidiu manter o Firebase no plano gratuito, sem ativar cobrança ou Blaze por enquanto. Não há segredos de produção configurados neste trabalho. Pix real e anúncios permanecem desativados.

O HTML sozinho não confirma pagamentos. A integração completa depende das Functions, das regras privadas do Firestore e do webhook. O teste direto da API descrito abaixo não comprova essas etapas.

## Comportamento e proteção de dados

- R$ 5,00, uma única vez, remove anúncios da **conta autenticada**, independentemente da família ou do perfil financeiro selecionado.
- O servidor reserva um pedido privado com UID, SKU, valor, moeda, projeto, recebedor, aplicação e ambiente. O navegador não escolhe esses dados.
- CPF foi removido. O e-mail confirmado do Firebase Auth é enviado como `payer.email` e mantido no `requestPayload` privado para repetir exatamente o mesmo corpo em tentativas com a mesma chave de idempotência. Não registrar esse corpo em logs nem expô-lo ao cliente.
- A criação usa `POST /v1/orders`, valores em strings (`"5.00"`), `type: online`, `processing_mode: automatic`, meio `pix/bank_transfer` e expiração de 24 horas. A referência externa identifica o pedido local; não há `metadata` de usuário no payload.
- Antes de confirmar, o servidor consulta a order autenticadamente e valida seu vínculo com o pedido local, recebedor, país, Pix, valores e projeto. Confere a aplicação quando a API a retorna. `currency`/`currency_id`, quando presentes, precisam ser BRL. Orders não garante `live_mode` nem moeda no GET; o ambiente é conferido também pela identidade do token em `/users/me`, incluindo país/site e a tag `test_user`.
- Só `processed/accredited` na order **e** na transação, com R$ 5 efetivamente pagos e sem reembolso, concede o benefício. As claims usadas são `adFreeLifetime` e `adFreeOrderIds`; campos editáveis de perfil ou recibos não concedem acesso.
- Reembolso parcial/integral ou chargeback remove o benefício daquele pagamento após validar o mesmo vínculo completo. Outro pagamento válido da mesma pessoa preserva o benefício. Falha de consulta ou vínculo divergente não autoriza alterar a conta de outra pessoa.
- Uma order `processing` pode não ter pagamento ou QR ainda. O frontend recebe `in_process` e aguarda. **Vencimento local, resposta perdida ou estado incerto não autorizam uma segunda cobrança.** Repete-se a criação reservada com o mesmo corpo/chave, ou consulta-se o ID já conhecido. Só um estado terminal confirmado da order permite substituí-la.
- `pendingOrderId` permite retomar o pedido ao voltar ou abrir outra sessão. A assinatura do webhook autentica o ID do recurso; status, usuário e valor do corpo não comprovam pagamento.

## Configuração dos ambientes

Requisitos locais: Node.js 22 e Firebase CLI; `firebase.json` aponta `functions.source` para `functions`. Na pasta `functions`, use `npm ci --ignore-scripts`, `npm test` e `npm run check`.

Copie `.env.example` para um arquivo local de ambiente em `functions`. Use IDs da conta e da aplicação correspondentes às credenciais escolhidas, sem copiá-los de outro ambiente:

```dotenv
MP_COLLECTOR_ID=ID_NUMERICO_DO_RECEBEDOR_DESTE_AMBIENTE
MP_APPLICATION_ID=ID_NUMERICO_DA_APLICACAO_DESTE_AMBIENTE
MP_LIVE_MODE=false
MP_TEST_FIREBASE_PROJECT_ID=demo-4j-pix
MP_PRODUCTION_FIREBASE_PROJECT_ID=financas-familia-9480b
PAYMENTS_ENABLED=false
```

- `demo-4j-pix` é o identificador reservado ao emulador. Use Auth e Firestore emulados com dados sintéticos; não a conta Firebase real. O backend exige que o projeto em execução corresponda ao ambiente configurado. Para testes publicados, use outro projeto real exclusivo e ajuste explicitamente o identificador de teste.
- Teste e produção têm **aplicações, contas recebedoras e credenciais correspondentes distintas**. `MP_APPLICATION_ID` e `MP_COLLECTOR_ID` são obrigatórios. O prefixo `APP_USR` também ocorre em credenciais de teste e não identifica produção.
- Em teste, o backend envia `payer.first_name: APRO`. O usuário sintético do Auth deve ter e-mail confirmado no domínio `@testuser.com` e conta ativa no Firestore emulado.
- `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` são segredos separados. Em ambiente publicado, configure-os pelo Firebase Secret Manager usando a solicitação interativa da CLI e `--project` explícito. Emuladores podem usar `.secret.local`, excluído do Git. Nunca colocar valores no chat, argumentos de terminal, HTML ou navegador.
- `MP_WEBHOOK_URL` não é parâmetro do backend nem vai no POST Orders. Configure a URL diretamente no painel Mercado Pago.
- `PAYMENTS_ENABLED=false` impede novas compras; consultas de pedidos existentes e tratamento de reembolsos continuam disponíveis. Não habilitar pagamentos no HTML antes de concluir a integração.

## Teste isolado do Mercado Pago, sem Firebase

Na raiz do pacote, execute:

```powershell
.\scripts\testar-pix.ps1
```

O helper pede o Access Token **de teste** em entrada oculta, envia-o ao processo Node por stdin e não grava a credencial. Confere se a conta é brasileira e contém a tag `test_user` antes de criar uma order sintética de R$ 5 com `APRO`. Consulta a confirmação automática e salva um relatório sem token em `work/pix-sandbox/resultado.json`.

Em 15/10/2026, o teste direto no sandbox do Mercado Pago foi aprovado: order e pagamento de R$ 5 retornaram `processed/accredited`, com país `BRA`. O relatório local sanitizado confirmou o resultado, sem armazenar o token informado em entrada privada. Esse teste não movimentou dinheiro real, não acessou o Firebase, não concedeu benefício e não verificou webhook. Mantenha o relatório fora do Git. A aprovação automática usa `APRO`, sem pagamento bancário do QR de teste.

## Firestore, webhook e futura publicação

As coleções `billingOrders`, `billingAccounts` e `billingLocks` devem ser inacessíveis ao cliente. Incorpore `firestore-billing.rules.fragment` às regras completas e teste-as. Um bloqueio não sobrepõe uma permissão ampla: remova liberações genéricas que atinjam essas coleções. Este módulo não substitui as regras de isolamento entre pessoas e famílias.

A publicação das Functions e a ativação do Pix real ficam suspensas enquanto for mantida a decisão de não ativar cobrança. Não executar deploy nem ativar Blaze com base apenas neste documento. Se a usuária autorizar essa mudança no futuro, concluir os testes necessários, publicar no projeto explícito e configurar em **Mercado Pago Developers > Suas integrações > Webhooks**:

- Evento **Order (Mercado Pago)**, com tópico `order`.
- URL HTTPS da função: `https://southamerica-east1-SEU_PROJETO.cloudfunctions.net/mercadoPagoWebhook`.
- Segredo de assinatura da aplicação correspondente em `MP_WEBHOOK_SECRET`; não é o Access Token.

O handler usa `x-signature`, `x-request-id` e `data.id` da query, normalizado em minúsculas no manifesto HMAC-SHA256. Reconsulta a order antes de processar. Uma notificação simulada sem uma order válida e vinculada não valida o fluxo completo. Nunca simular produção escrevendo claims ou registros manualmente.

A ativação produtiva exige validar testes, publicar as regras completas, configurar os segredos reais e os IDs de produção, alterar `MP_LIVE_MODE=true`, publicar as Functions e configurar/verificar o webhook. Só depois habilitar `PAYMENTS_ENABLED` e a opção de pagamentos do HTML. GitHub e publicação do site na Cloudflare são operações separadas; Netlify continua pausado.

## Contrato com o HTML

Região: `southamerica-east1`. `orderId` é o UUID interno; o `ORD...` do Mercado Pago permanece no vínculo privado. `paymentId` é o `PAY...` e pode estar vazio enquanto a order é processada.

| Função | Entrada | Resposta principal |
|---|---|---|
| `getMonetizationStatus` | `{}` | `adFreeLifetime`, `pendingOrderId`, `price:5`, `currency:'BRL'`, `paymentsEnabled` |
| `createPixCheckout` | `{}` | `orderId`, `paymentId`, `status`, `amount:5`, `currency:'BRL'`, `qrCode`, `qrCodeBase64`, `ticketUrl`, `expiresAt`, `adFreeLifetime` |
| `checkPixCheckout` | `{orderId}` | os mesmos campos do checkout |
| `mercadoPagoWebhook` | POST assinado, tópico `order` | `200` ao processar/ignorar recurso fora do produto; falhas transitórias recebem `503` |

Se o benefício já estiver ativo, a criação responde `{status:'approved',adFreeLifetime:true}` sem cobrar. O HTML deve tratar essa resposta antes de exigir QR. Os estados públicos incluem `pending`, `in_process`, `approved`, `cancelled`, `rejected`, `refunded` e `charged_back`. QR vazio em `in_process` não é erro nem aprovação.

Só `adFreeLifetime === true` retornado pelo servidor confirma o benefício. Após a confirmação, renovar o token com `getIdToken(true)` e impedir novo carregamento de anúncios. Falhas de consulta não significam sucesso.

## Validação e consumo

A suíte local usa dados sintéticos e simulações de Auth, Firestore e Mercado Pago. As verificações cobrem os vínculos e estados do contrato, mas não comprovam o ambiente publicado, as regras reais ou a integração completa com o provedor. Consulte o resultado atual dos comandos, sem inferir sucesso pela documentação.

Antes da ativação, validar retomada em outra sessão, aprovação com a página fechada, pedido de outra conta, notificações repetidas, falha transitória, criação com resposta perdida, order sem QR, vencimento sem segunda cobrança, estorno e acesso sem login. Preparar monitoramento, alertas e proteção contra abuso.

Cada função usa `minInstances=0`, `maxInstances=5`, memória de 256 MiB e timeout de 120 segundos. Esses limites não são teto de gastos. Custos dependem do uso e precisam ser conferidos antes de autorizar a cobrança.

## Referências oficiais

- [Pix via Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [Consulta da order e campos do recebedor](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/get-order/get.md)
- [Teste automático Pix com APRO](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix)
- [Notificações e assinatura de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications)
- [Reembolsos e cancelamentos](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/refunds-cancellations)
- [Secrets e parâmetros Firebase](https://firebase.google.com/docs/functions/config-env)
- [Emuladores Firebase](https://firebase.google.com/docs/emulator-suite)
- [Preparação das Functions](https://firebase.google.com/docs/functions/get-started)
