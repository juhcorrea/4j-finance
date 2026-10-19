# Pix no plano gratuito da Cloudflare

Estado consolidado em 19/10/2026, apos a prova final do sandbox: webhook natural autenticado e concessao automatica sem fallback, posteriormente confirmada por SELECT. A assinatura usada antes pertencia a outra aplicacao; configurar o segredo da propria aplicacao da conta vendedora de teste resolveu a autenticacao sem alterar o Worker. Ambiente de teste: https://6543501e.4jfinance-pix-test.pages.dev. A producao permanece em https://ddcb1f1f.4jfinance.pages.dev, com Pix e anuncios OFF; AdSense Preparando. O pacote de teste contem Worker e pagina de apoio, nao o frontend completo; a correcao local de consultas ainda nao foi publicada. Registros abaixo de datas/horarios anteriores sao historicos; a prova do sandbox nao equivale a pagamento real em producao.

## Estado em 15/10/2026

A usuária decidiu manter o Firebase sem cobrança. A alternativa usa **Cloudflare Pages Functions + D1 no plano Free** e Firebase no plano Spark. Não ativar Blaze, Workers Paid ou outro upgrade.

O ambiente exclusivo de teste está publicado em [4jfinance-pix-test.pages.dev](https://4jfinance-pix-test.pages.dev), deployment com prefixo **1ca101c3**, com banco D1 vinculado. O Firebase **fjfinance-pix-test** permanece no plano Spark, com billing desativado, Auth Email/password, Firestore e conta sintética preparados. O erro anterior de configuração Auth 404 foi resolvido.

A configuração dos segredos de teste foi concluída em **2026-10-15T19:13:32.529Z**. **PAYMENTS_ENABLED está true somente no TESTE**, com credenciais e recebedor de teste. **Pix e anúncios da produção continuam OFF.**

O QA remoto de **2026-10-15T19:25:58.017Z** terminou com **ok: true**: autenticou a conta sintética, criou um Pix fictício de R$ 5, consultou duas vezes o mesmo pedido e confirmou **adFreeLifetime: true**. Esse teste percorreu Cloudflare, Firebase, D1 e Orders API; não houve cobrança real. O relatório sanitizado está em work/pix-cloudflare/remote-qa.json.

**A simulação de webhook foi recebida e validada com HTTP 200.** A assinatura com o identificador original foi confirmada. A notificação espontânea após um pagamento ainda não foi verificada; criação, consultas e benefício aprovado isoladamente não comprovam esse envio automático. A medição de CPU e os demais critérios de produção abaixo continuam pendentes.

O runtime workerd rejeitou redirect: error nas chamadas externas. A integração usa redirect: manual e bloqueia respostas 3xx, sem seguir redirecionamentos ou encaminhar credenciais a outro destino.

A gratuidade aqui é da infraestrutura dentro das cotas. As tarifas de recebimento do Mercado Pago são separadas e precisam ser conferidas na própria conta antes de receber dinheiro real: [custos dos checkouts](https://www.mercadopago.com.br/ferramentas-para-vender/check-out).

## O que muda

- O navegador envia seu Firebase ID token em `Authorization: Bearer ...` ao endpoint HTTPS da própria aplicação.
- `auth.cjs` verifica assinatura RS256, emissor, projeto, UID e validade. Consulta a conta atual no Firebase Auth para barrar usuário desativado ou sessão revogada. Para criar Pix, exige e-mail atualmente verificado e status `approved`.
- A única leitura Firestore é `users/{uid}` do usuário autenticado, com máscara para o campo `status`, usando o token dele e respeitando as Security Rules. Não há consulta de contas, lançamentos ou famílias, nem acesso administrativo ao banco. As regras devem impedir que o próprio usuário se aprove.
- D1 mantém somente pedidos privados, identidade do comprador, vínculo com o Mercado Pago, controle de concorrência e direito de remover anúncios. O e-mail usado na criação fica no corpo privado para repetir a mesma requisição com idempotência. Não copiar cadastros financeiros para D1.
- O benefício passa a vir da API de cobrança e do D1. Esta alternativa não grava custom claims no Firebase; não precisa de Admin SDK, arquivo de conta de serviço ou chave privada Google.
- `payment-core.js` continua validando produto, R$ 5/BRL, recebedor, aplicação quando retornada, referência externa e estados de order/pagamento. Reembolso ou chargeback fecha o benefício correspondente. Estado incerto ou expiração local não autoriza segunda cobrança.

## Configuração por ambiente

Use ambientes separados de teste e produção, cada um com seu banco D1 e suas credenciais do Mercado Pago. No teste atual, Pages e D1 usam o nome 4jfinance-pix-test e o Firebase usa fjfinance-pix-test. Não substituir esse Firebase pelo projeto de produção.

| Configuração | Finalidade |
|---|---|
| `BILLING_DB` | Binding do banco D1 privado do ambiente |
| `FIREBASE_PROJECT_ID` | Projeto que emitiu os tokens aceitos neste ambiente |
| `FIREBASE_WEB_API_KEY` | Web API Key do mesmo projeto, restrita às APIs Firebase necessárias |
| `MP_COLLECTOR_ID` | ID numérico do recebedor correspondente às credenciais |
| `MP_APPLICATION_ID` | ID numérico da aplicação Orders correspondente |
| `MP_LIVE_MODE` | String `false` no teste; `true` somente em produção autorizada |
| `MP_TEST_FIREBASE_PROJECT_ID` | ID do projeto Spark real exclusivo de teste |
| `MP_PRODUCTION_FIREBASE_PROJECT_ID` | ID do projeto de produção, diferente do teste |
| `PAYMENTS_ENABLED` | String `true` somente no teste atual; produção permanece `false` |
| `ALLOWED_ORIGINS` | Array JSON das origens HTTPS exatas autorizadas |
| `MP_ACCESS_TOKEN` | Secret da Cloudflare; nunca no HTML ou Git |
| `MP_WEBHOOK_SECRET` | Secret de assinatura da aplicação correspondente |

A Web API Key identifica o projeto; não substitui autenticação ou regras. Conferir restrições em Google Cloud > APIs e serviços > Credenciais. Uma chave limitada a referenciadores de navegador pode recusar chamadas feitas pelo Worker; testar uma configuração específica para o backend, restrita à Identity Toolkit API, sem enfraquecer a chave do site. Não registrar chaves, tokens ou corpos de conta em logs. [Orientação oficial sobre API keys](https://firebase.google.com/docs/projects/api-keys).

O verificador usa as [chaves públicas Google em JWKS](https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com), limita o cache a uma hora e as atualizações por chave desconhecida a uma por minuto por instância. A factory deve permanecer reutilizada entre requisições. O estado da conta é consultado novamente em cada autenticação: `localId` deve corresponder ao `sub`, a conta deve estar habilitada e `auth_time` deve ser igual ou posterior a `validSince`. Falha ou resposta incompleta fecha o acesso. [Validação de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [consulta REST da conta](https://firebase.google.com/docs/reference/rest/auth/#section-get-account-info).

Tokens sem assinatura do emulador Firebase são rejeitados. `demo-4j-pix` serve a testes emulados, não à consulta Google remota. A suíte local usa chaves RSA sintéticas e respostas simuladas, sem usuários reais.

## Pages, D1 e webhook

O build Cloudflare de teste gera somente os arquivos permitidos em **work/cloudflare-test/**. O controle do Wrangler fica separado em **work/cloudflare-test-deploy/wrangler.json** e nunca integra a pasta publicada. Esse staging é exclusivo do teste: não publicar o diretório work inteiro, configurações locais ou credenciais. A fonte pública do site permanece em public/.

No staging gerado, a entrada em modo avançado é `_worker.js`; ela recebe `env`, incluindo `BILLING_DB`. Um `_worker.js` ignora o roteamento da pasta `functions/` do Pages, evitando confundir o backend Firebase anterior com funções Cloudflare. Configure `_routes.json` para executar apenas as rotas de API; os arquivos estáticos não devem consumir invocações. O fallback de conteúdo estático deve usar `env.ASSETS.fetch(request)`. [Modo avançado](https://developers.cloudflare.com/pages/functions/advanced-mode/), [rotas](https://developers.cloudflare.com/pages/functions/routing/).

No painel Workers & Pages > projeto > Settings > Bindings, adicionar o banco D1 do ambiente com nome `BILLING_DB`; aplicar `cloudflare/schema.sql` ao banco correto. Vincular teste e produção separadamente. Configurar **Fail closed** para as funções: cota esgotada não pode devolver conteúdo estático como se a API tivesse autorizado o pagamento. [Bindings D1](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases), [comportamento ao esgotar a cota](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed).

No Mercado Pago Developers, configurar a URL HTTPS do webhook final da API Cloudflare e o evento **Order (Mercado Pago)**. `MP_WEBHOOK_URL` não vai no POST Orders. Assinatura válida é seguida de consulta autenticada da order e conferência do vínculo privado antes de conceder ou revogar o benefício. Nunca confirmar somente pelo corpo da notificação.

Reservas, locks e vínculos precisam permanecer seguros com interrupções em qualquer chamada. SQL condicional e constraints impedem gravação por requisição cujo lock expirou; reenvio ao Mercado Pago mantém corpo e chave originais. Uma sequência de chamadas D1 não deve ser tratada como uma transação que abrange requisições HTTP. Conferir as regressões de concorrência antes da publicação.

## Scripts locais de preparação e QA

A preparação abaixo já foi concluída no teste atual. Repetir apenas a etapa necessária; nenhum desses scripts publica o site ou ativa Pix em produção:

1. No Firebase **fjfinance-pix-test**, Email/password está ativado e salvo. Não usar initializeAuth da Identity Platform nem aceitar upgrade.
2. Para retomar o provisionamento, definir FIREBASE_TOOLS_LIB para a pasta lib da instalação local já autenticada do Firebase CLI e executar `node scripts/provision-pix-test.cjs`. O script só aceita o projeto de teste fixo, verifica billing desativado antes/depois e reaproveita Webapp e conta sintética existentes. Prepara Firestore e regras restritas. A credencial temporária fica apenas em work/pix-cloudflare/test-account.json, ignorado pelo Git; não exibir nem copiar para a publicação.
3. Para configurar ou substituir os segredos de TESTE, executar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configurar-pix-cloudflare.ps1` em terminal local. Digitar os dois segredos nos prompts ocultos; não passá-los em argumentos, arquivos ou mensagens. O helper valida o recebedor com tag test_user antes de qualquer gravação Cloudflare e altera somente as variáveis do projeto de teste. O relatório work/pix-cloudflare/secrets-setup.json não contém segredos.
4. Após alterar fontes, executar `node scripts/build-cloudflare.cjs --test` para atualizar o staging e o controle do Wrangler separados. Uma nova publicação é uma operação distinta; revisar o pacote e o projeto de destino antes de executá-la.
5. Para o QA remoto autorizado, executar `node scripts/testar-pix-cloudflare.cjs`. Ele usa somente a conta sintética e o destino de teste fixo, retoma o mesmo pedido e não cria outra cobrança se o benefício já estiver ativo. O resultado aprovado atual não demonstra entrega do webhook. Conferir essa entrega e medir CPU antes de avançar para produção.

O provisionamento não envia e-mail real: usa conta sintética de domínio testuser.com. Remover a conta e sua credencial temporária ao encerrar o QA. Não guardar OAuth bearer token, segredo Mercado Pago ou dados financeiros no repositório. A ativação do provedor segue a [documentação Firebase](https://firebase.google.com/docs/auth/web/password-auth).

## Limites gratuitos e validação

| Recurso | Cota documentada do plano Free |
|---|---|
| Workers/Pages Functions | 100 mil requisições por dia, compartilhadas pela conta |
| CPU do Worker | 10 ms por invocação HTTP |
| D1: linhas lidas | 5 milhões por dia |
| D1: linhas escritas | 100 mil por dia |
| D1: armazenamento | 500 MB por banco; 5 GB totais por conta |
| D1: quantidade de bancos | 10 por conta |

As cotas diárias reiniciam à meia-noite UTC. Esgotar a cota gratuita de D1 produz erro; não é autorização para upgrade. Índices também podem consumir escritas e consultas sem índice podem ler mais linhas do que devolvem. Consultas Auth e Firestore continuam sujeitas às cotas próprias do Firebase. [Preços Pages](https://developers.cloudflare.com/pages/functions/pricing/), [preços D1](https://developers.cloudflare.com/d1/platform/pricing/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/), [limites Auth](https://firebase.google.com/docs/auth/limits).

Esperar `fetch()` ou D1 não consome CPU do Worker, mas criptografia e tratamento das respostas precisam ser medidos. Não confundir duração do teste Node com CPU da Cloudflare. A aprovação da alternativa Free exige medir inicialização e chamadas com cache de chave, criação/consulta Pix e webhook no runtime remoto. Não presumir que 10 ms bastam. [Limites de CPU](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).

Validação local da autenticação, na raiz do pacote:

```powershell
node --test cloudflare/test/auth.test.cjs
```

Antes de habilitar Pix em produção, provar no ambiente de teste: token de outro projeto, conta desativada, revogação, e-mail não verificado, usuário sem aprovação, pedido de outro UID, perda de resposta de criação, chamadas concorrentes, retomada em outra sessão, webhook repetido, estorno e indisponibilidade por cota. Nenhum erro pode virar aprovação ou nova cobrança incerta. Testar o fluxo completo sem dados financeiros reais e medir consumo. A publicação do site e a ativação de pagamentos são etapas distintas da sincronização GitHub; Netlify permanece pausado.

Atualização de teste em 2026-10-15T19:47:56.461Z: a correção que reconcilia o Pix pendente na consulta de status foi publicada em https://c685b5c9.4jfinance-pix-test.pages.dev, com o alias de teste preservado. Health HTTP 200 confirmou backendReady:true; a consulta autenticada da conta sintética já paga retornou adFreeLifetime:true e pendingOrderId:null. Nenhuma nova cobrança foi criada. O relatório completo anterior, do deployment a1999d42, foi preservado. Este smoke não comprova entrega real de webhook; PAYMENTS_ENABLED continua true somente no sandbox.


A validação de Firebase no fluxo Cloudflare de teste está concluída (Auth e conta sintética). A antiga implementação Firebase Functions continua sem publicação e não faz parte desse QA. Os segredos de produção foram configurados e a conta Mercado Pago de produção foi validada em 2026-10-15T20:05:58.256Z; essa preparação não publicou o backend nem ativou pagamentos.

Em 2026-10-15T20:21:17.850Z, a simulação enviada pelo painel Mercado Pago foi aceita com HTTP 200 no teste corrigido https://1ca101c3.4jfinance-pix-test.pages.dev. A captura confirmou que o simulador assina o ID com as letras originais; o SDK oficial preserva esse formato, enquanto a documentação Orders também descreve minúsculas. O backend agora exige HMAC válido em uma dessas duas formas, sempre incluindo ID, request-id e timestamp, e reconsulta o pedido no provedor. Os diagnósticos temporários foram removidos. A aceitação desta simulação não comprova uma notificação espontânea após pagamento; essa etapa permanece pendente.

Referências da compatibilidade de assinatura: [SDK oficial](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts) e [documentação Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications). Para atualizar somente a assinatura secreta do teste, execute interativamente scripts/configurar-webhook-pix-teste.ps1. O helper não recebe Access Token, não publica e preserva D1, demais segredos e ambiente de produção.


Medicao remota em 19/10/2026: uma nova conta sintetica isolada criou somente um Pix ficticio de R$ 5. Status, criacao, duas consultas do mesmo pedido e beneficio passaram com HTTP 200; Firebase manteve billing:false. CPU observada: status inicial 11 ms, criacao 16 ms, consultas 9/7 ms e status final 6 ms, todas outcome:ok. Ha picos acima dos 10 ms nominais do Free; a Cloudflare tolera excessos ocasionais, mas estes resultados nao garantem disponibilidade sob carga. Nao foi autorizado nem ativado upgrade. Quatro chamadas espontaneas ao webhook retornaram 401 durante o teste; o painel Mercado Pago mostrou order.processed de 19/10 11:14:56 UTC. A entrega autenticada espontanea continua pendente; nao trocar chaves ou relaxar verificacao sem diagnostico. Relatorios privados sanitizados em work/pix-cloudflare/cpu-checkout-smoke-2026-10-19.json e cpu-status-smoke-2026-10-19.json.

Diagnostico complementar de 19/10/2026, 11:42 UTC: foi criado um unico Pix ficticio novo no sandbox. Firebase permaneceu billing:false antes e depois; criacao, consulta do pedido e status retornaram HTTP 200, com beneficio concedido pela consulta autenticada. Quatro eventos naturais desse mesmo pedido foram correlacionados e retornaram 401. Os campos de autenticacao tinham formato valido e o identificador na query era igual ao do corpo, mas a assinatura nao conferiu nos formatos HMAC com ID original, ID em minusculas ou sem ID. As notificacoes chegaram ao endpoint esperado como eventos de pedido; o bloqueio observado e a autenticacao, nao a URL ou o tipo de evento. Isso nao demonstra, isoladamente, segredo incorreto. Aguardar uma simulacao atual no painel para distinguir a configuracao do emissor; depois remover o diagnostico temporario, restrito ao teste. Entrega espontanea autenticada continua pendente. Producao permanece em https://ddcb1f1f.4jfinance.pages.dev, com Pix e anuncios OFF. Nenhum identificador de pedido, usuario, header, assinatura ou credencial foi incorporado a este registro.

Comparacao atual confirmada em 19/10/2026: a simulacao enviada as 11:46:41 UTC retornou HTTP 200 no mesmo deployment de teste e com o mesmo segredo usados no diagnostico. Nessa simulacao, HMAC com ID original conferiu; as variantes com ID em minusculas e sem ID nao conferiram. Os formatos de autenticacao estavam validos, query e corpo concordavam, timestamp tinha 10 digitos e request-id nao continha letras maiusculas. Em contraste, os quatro eventos naturais correlacionados de 11:42:11 a 11:42:17 UTC retornaram 401 e nao conferiram em nenhuma das tres variantes. Essa divergencia nao identifica a causa nem permite atribui-la ao provedor ou a diferencas de segredo do sandbox. Nao solicitar credenciais novamente nem reduzir a verificacao da assinatura. A publicacao de teste sem o diagnostico temporario foi autorizada e aguarda confirmacao; a producao permanece inalterada e OFF.

Limpeza confirmada em 19/10/2026 as 11:47:55 UTC: publicado https://bf47b7a7.4jfinance-pix-test.pages.dev com o Worker original, sem diagnostico temporario. Alias de teste, health HTTP 200 e pacote conferidos; fonte restaurada e capturas de log encerradas. A simulacao atual passou, mas a assinatura dos eventos naturais permanece sem validacao; nao apresentar consulta aprovada como prova de webhook autenticado. Producao https://ddcb1f1f.4jfinance.pages.dev preservada, com Pix publico e anuncios OFF.

## Webhook natural de teste confirmado — 19/10/2026

19/10/2026, confirmacao final do sandbox: a assinatura anterior pertencia a outra aplicacao. A configuracao protegida passou a usar a assinatura da propria aplicacao da conta vendedora de teste, sem alterar o Access Token, o algoritmo de validacao ou a producao. Publicado o Worker limpo em 6543501e.4jfinance-pix-test.pages.dev; o pacote de teste inclui somente Worker e pagina de apoio, nao o frontend completo. Houve um unico create ficticio, inicialmente pending e adFreeLifetime:false. Um webhook natural correlacionado recebeu HTTP 200 as 15:00:05.552 UTC. Depois, SELECT do mesmo pedido confirmou approved, paid:true e adFreeLifetime:true, com checkedAt 15:00:09.924 UTC e updatedAt 15:00:09.964 UTC. Essa concessao automatica ocorreu sem getStatus, check, simulacao ou escrita direta no D1 durante a prova; nao foi atribuida isoladamente ao primeiro HTTP 200 capturado. A observacao final, iniciada as 15:03:42 UTC, foi somente leitura e nao criou contas ou pedidos. Firebase manteve billing:false antes e depois; captura removida, processo encerrado e relatorios privados preservados fora do Git. Produção ddcb1f1f inalterada, Pix e anuncios publicos OFF. O frontend corrigido de consultas permanece somente preparado localmente. O recebimento real em producao, as cotas de CPU e a validacao real da CMP continuam etapas separadas.

Na configuracao de teste, obtenha a assinatura secreta em Webhooks da propria aplicacao vinculada a conta vendedora de teste. A assinatura da aplicacao principal usada pelo simulador nao substitui a assinatura dessa aplicacao de teste. Preserve validacao HMAC completa, consulta autenticada ao provedor e vinculo privado do pedido; nao copie segredos para documentacao ou Git.
