# Publicar o 4J Finance no Cloudflare Pages

Estado consolidado em 19/10/2026: backend de producao e preparacao do consentimento publicados em https://ddcb1f1f.4jfinance.pages.dev e verificados no dominio oficial. Pix e anuncios continuam desativados; AdSense permanece Preparando. O simulador do webhook passou com HTTP 200, mas a notificacao espontanea do novo teste retornou 401 e segue em investigacao. Registros abaixo de datas/horarios anteriores sao historicos.

O site usa Cloudflare Pages para os arquivos públicos e Firebase Spark para autenticação e dados financeiros. Após recusar Blaze e pedir uma alternativa gratuita, a responsável escolheu **Pages Functions/Workers Free + D1** para o Pix com API Orders do Mercado Pago. O backend Firebase Functions anterior está preservado em `functions/`, sem ativação. Montserrat, cores, Catatau e uso no iPhone devem ser preservados.

## Estado confirmado em 15/10/2026

Produção com arquivos estáticos e API Pix desativada: projeto Pages **4jfinance**, com [4jfinance.com.br](https://4jfinance.com.br), [www.4jfinance.com.br](https://www.4jfinance.com.br) e [4jfinance.pages.dev](https://4jfinance.pages.dev). Domínio e www estão ativos com HTTPS. DNS usa `jacqueline.ns.cloudflare.com` e `john.ns.cloudflare.com`; os domínios oficiais estão autorizados no Firebase Authentication. Não refazer domínio, DNS ou projeto Pages para atualizar conteúdo.

As regras completas do Firestore foram publicadas e conferidas. O registro histórico inclui 38 verificações de acesso com contas e documentos sintéticos, removidos ao terminar. Esses testes não foram repetidos por esta atualização documental.

A propriedade foi verificada no AdSense e a revisão solicitada em 15/10/2026 às 14h05, horário de Brasília. A aprovação ainda não foi confirmada. A mensagem de regulamentações europeias está publicada no painel, mas a integração real da CMP no site e a dependência circular do carregador ainda precisam ser resolvidas e testadas.

**Pix real e anúncios continuam desativados. O servidor Pix de produção já está publicado e preparado, com PAYMENTS_ENABLED=false.** O preço preparado é R$ 5 uma única vez por UID comprador, com benefício permanente após confirmação do servidor, sem CPF no checkout e sem transferência automática para outros logins da família.

## Ambiente de teste já publicado — estado atual

O teste remoto da API Cloudflare passou em 2026-10-15T19:25:58.017Z (remote-qa ok:true), no deployment https://a1999d42.4jfinance-pix-test.pages.dev, com alias https://4jfinance-pix-test.pages.dev. O fluxo validou autenticação, consulta de status, criação de Pix simulado de R$ 5, duas consultas do mesmo UUID de pedido e resultado final adFreeLifetime:true. Não houve cobrança financeira real.

A conta sintética do Firebase de teste está pronta, com Auth e Firestore no Spark; billingEnabled:false foi confirmado. PAYMENTS_ENABLED=true permanece exclusivo do sandbox. Pix de produção e anúncios continuam desligados; o servidor Pix de produção não foi publicado.

A entrega real do webhook ainda não está comprovada: realWebhookDeliveryVerified:false. O histórico de notificações do Mercado Pago está sendo consultado. O resultado aprovado acima veio do fluxo autenticado da API e das consultas do pedido; não deve ser apresentado como prova de entrega do webhook.

A compatibilidade de redirecionamentos Google/Mercado Pago foi corrigida com tratamento manual e reproduzida no runtime Workerd. Os recortes de 42 testes de autenticação e 25 de cobrança foram aprovados; a suíte consolidada final ainda será executada e não recebe total neste registro.

### Histórico da configuração e do deployment anterior

A configuração protegida do ambiente de teste foi concluída em 2026-10-15T19:13:32.529Z, após corrigir o wrapper para Windows PowerShell 5.1. O helper enviou os valores por memória, sem gravar credenciais em arquivos locais; o relatório contém somente o resultado seguro. A correção passou em três testes, cobrindo sete execuções sintéticas, sem acesso ao helper real nesses testes.

Deployment anterior de teste, verificado antes da conclusão do fluxo remoto: https://429f9a18.4jfinance-pix-test.pages.dev, com alias https://4jfinance-pix-test.pages.dev. GET /api/pix/health retornou HTTP 200 com backendReady:true. Uma chamada à API sem autenticação retornou HTTP 401 com erro seguro. PAYMENTS_ENABLED está true exclusivamente no sandbox; Pix de produção e anúncios continuam desligados. O servidor Pix de produção ainda não foi publicado.

Naquela etapa, o provedor de autenticação de teste estava ativo (GET HTTP 200), mas a conta sintética ainda estava em correção e o teste completo não havia sido executado. Esse estado foi superado pelo teste remoto aprovado descrito no estado atual acima.

### Histórico da publicação inicial

- Projeto/URL: [4jfinance-pix-test.pages.dev](https://4jfinance-pix-test.pages.dev).
- Deployment registrado: `7ac93e50`.
- `GET /api/pix/health`: HTTP 200, `backendReady:false`.
- `GET /api/pix/mercadoPagoWebhook`: HTTP 405; o endpoint aceita POST. Esse resultado não valida entrega ou assinatura do webhook.
- Firebase exclusivo de teste: `fjfinance-pix-test`, separado da produção.
- Banco D1 de teste criado; schema aplicado em nove comandos. Dados financeiros de produção não foram acessados.

O teste direto da API Orders no sandbox aprovou R$ 5 em `processed/accredited`, sem dinheiro real, sem Firebase e sem webhook. O fluxo remoto da API Cloudflare foi posteriormente aprovado conforme o estado atual acima; a entrega real do webhook ainda não foi comprovada. A publicação inicial só comprovou o pacote e as rotas verificadas. Não houve upgrade do Firebase ou da Cloudflare.

## Acesso ao domínio na rede corporativa

O domínio oficial consta ativo na Cloudflare, com certificado Google válido. A usuária confirmou que o site abre pela rede 4G. A falha de acesso observada ficou restrita à rede corporativa: nela, a resolução DNS apontou para um servidor da empresa, que apresentou certificado de outro domínio.

## GitHub e arquivos de publicação

O repositório [juhcorrea/4j-finance](https://github.com/juhcorrea/4j-finance) recebe código, documentação e materiais públicos após validação, revisão, commit e push com conferência do SHA remoto. GitHub não publica automaticamente na Cloudflare. Netlify permanece pausado, inclusive ao sincronizar o repositório.

- `public/`: arquivos destinados à hospedagem estática.
- `source/`, `frontend/` e `build.cjs`: fontes usadas para reconstruir o aplicativo.
- `cloudflare/`: backend Orders, autenticação, schema D1 e configurações sem segredos.
- `functions/`: backend Firebase legado, não ativo; não é uma pasta Pages Functions publicável.
- `privacy/`: regras e testes de isolamento, com publicação separada.
- `scripts/build-cloudflare.cjs`: pacote Cloudflare com lista explícita de arquivos permitidos, Worker compilado e rotas.

Nunca versionar credenciais, tokens, arquivos de autenticação, logs privados, dados reais, dependências instaladas ou `work/` inteiro. Nunca enviar a raiz do workspace, `source/`, `marketing/`, `functions/`, `privacy/`, `audit/` ou um ZIP completo do código para hospedagem estática. Os valores secretos pertencem somente à configuração protegida do servidor.

## Preparar o pacote de teste

Execute na raiz do pacote, com Node.js e as dependências do projeto instaladas:

~~~sh
node scripts/build-cloudflare.cjs --test
~~~

O script gera dois diretórios com funções distintas:

| Caminho | Conteúdo |
| --- | --- |
| `work/cloudflare-test/` | Página de teste, `_worker.js` compilado e `_routes.json`, somente os arquivos permitidos |
| `work/cloudflare-test-deploy/wrangler.json` | Configuração do Wrangler, com `pages_build_output_dir` apontando para `../cloudflare-test` |

O diretório de configuração não é o conteúdo público. Nunca publicar `work/` inteiro. O empacotador recusa arquivos extras na saída; não contorne essa verificação. A configuração usa `nodejs_compat`, necessária ao bundle atual. `_routes.json` executa o Worker somente em `/api/pix/*`, preservando o serviço estático fora da API.

Preparar o pacote não faz deploy. Quando a publicação de teste estiver dentro do escopo autorizado, use o Wrangler a partir da configuração gerada:

~~~sh
npx wrangler --cwd work/cloudflare-test-deploy pages deploy
~~~

Use `--cwd`: este fluxo de Pages não aceita `--config` com caminho personalizado. Se a conta não for selecionada automaticamente, configure `CLOUDFLARE_ACCOUNT_ID` no ambiente local antes do comando. Não copie o valor da conta, tokens ou segredos para este guia. Confira que o destino é **4jfinance-pix-test**, sem alterar o projeto de produção.

## Concluir a validação do Pix

O provedor Firebase Auth, o binding D1, a conta sintética e os parâmetros protegidos do ambiente de teste estão configurados; o fluxo remoto da API passou. Conclua a verificação da entrega real do webhook e os cenários restantes conforme `cloudflare/CONFIGURAR.md`. Os ambientes precisam de projetos, D1 e credenciais próprios. Nunca usar dados financeiros de produção para esse teste. Não repetir a configuração de segredos apenas porque a entrega real do webhook ainda está pendente.

O navegador usa transporte configurável `provider: 'cloudflare'` e API da mesma origem `/api/pix`, com token Firebase da sessão. UID, preço e e-mail não são definidos pelo navegador. O servidor determina R$ 5/BRL e o comprador, reserva e reutiliza o pedido, confirma a order e mantém o benefício no D1. Esta alternativa não escreve custom claims no Firebase.

Configure no Mercado Pago Developers a URL HTTPS de teste terminada em `/api/pix/mercadoPagoWebhook` e selecione **Order (Mercado Pago)**. Um GET com 405 não valida o webhook: é necessário provar assinatura, consulta autenticada da order, vínculo privado e atualização do benefício. Segredos de acesso e assinatura nunca entram no HTML, Git, logs ou mensagens.

Autenticação, status, criação do Pix simulado, duas consultas ao mesmo pedido e benefício final passaram na API remota. Complete a validação de interface/QR, retomada, concorrência, outra conta, reembolso e falhas. Meça CPU no runtime remoto e consumo D1; a duração do teste Node não mede CPU do Worker. Verifique o comportamento **Fail closed**: cota ou serviço indisponível não pode liberar pagamento ou mostrar anúncios por engano. Testes sintéticos aprovados e sandbox direto não substituem o fluxo completo nem Safari em iPhone físico.

## Atualizar produção

A publicação de produção e a ativação do Pix exigem validação e escopo próprios; não são consequência automática de build, push ou teste.

Para conteúdo estático, reconstrua com `node build.cjs`, execute as verificações relevantes e revise `public/`. A publicação direta do projeto **4jfinance** recebe somente esses arquivos públicos, com `index.html` na raiz.

Prepare o pacote com `node scripts/build-static.cjs` e publique pelo controle isolado: `npx wrangler pages deploy --cwd work/cloudflare-static-deploy --project-name 4jfinance --branch main`. O empacotador seleciona somente 13 arquivos públicos, excluindo caches. Não execute a publicação estática a partir da raiz que contém `functions/`: o Wrangler tentaria compilar as funções Firebase legadas como rotas Pages. O controle isolado evita essa interpretação.

Para a futura versão com API, `node scripts/build-cloudflare.cjs` prepara `work/cloudflare-production/` a partir da lista permitida de `public/`, acrescenta `_worker.js` e `_routes.json` e gera `work/cloudflare-production-deploy/wrangler.json`. Revise bindings, origem e modo antes de qualquer deploy. Este guia não autoriza publicar esse servidor ou ligar pagamentos; isso ainda não foi feito.

Após uma publicação autorizada, confira o domínio por HTTPS, as rotas públicas, login, cadastro e as rotas de API aplicáveis, usando dados de teste. Compare a versão publicada com a versão enviada ao GitHub. Não presumir que um ZIP anterior acompanhe os arquivos reconstruídos. Não alterar DNS apenas para trocar o conteúdo.

## Cotas gratuitas

| Recurso | Cota documentada Free |
| --- | --- |
| Workers/Pages Functions | 100 mil requisições por dia |
| CPU do Worker | 10 ms por invocação |
| D1: linhas lidas | 5 milhões por dia |
| D1: linhas escritas | 100 mil por dia |
| D1: armazenamento total | 5 GB |

Ao atingir as cotas gratuitas, as operações falham; isso não ativa um upgrade automático. Manter a API fechada em falhas e não aderir a Blaze ou Workers Paid. A gratuidade dentro dessas cotas é separada de tarifas de recebimento do Mercado Pago. Fontes: [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/), [D1 Free e comportamento ao esgotar cotas](https://developers.cloudflare.com/d1/platform/pricing/).

## AdSense e limites da publicação

Metatag e `ads.txt` já estão publicados. Antes de ligar publicidade, confirmar a aprovação do AdSense, resolver o carregador, integrar CMP real e testar consentimento, recusa, revogação, sessão e benefício sem anúncios. As preferências locais não equivalem a CMP certificada. As três flags de anúncios continuam falsas; o painel financeiro privado não recebeu anúncios automáticos. Consulte `ADSENSE-PREPARACAO.txt`.

O banco financeiro permanece no Firebase. D1 guarda somente dados privados necessários ao pagamento e ao benefício. Publicar HTML ou Worker não substitui as regras do Firestore, não configura Auth ou webhook e não habilita Pix por si só. O Netlify antigo não foi alterado nem reativado.

## Fontes oficiais

- [Upload direto no Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Modo avançado com Worker](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Rotas e Fail closed](https://developers.cloudflare.com/pages/functions/routing/)
- [Pix com API Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [Webhook e evento Order](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications)
- [Conectar o site ao AdSense](https://support.google.com/adsense/answer/12169212?hl=pt-BR)

Atualização de teste em 2026-10-15T19:47:56.461Z: a correção que reconcilia o Pix pendente na consulta de status foi publicada em https://c685b5c9.4jfinance-pix-test.pages.dev, com o alias de teste preservado. Health HTTP 200 confirmou backendReady:true; a consulta autenticada da conta sintética já paga retornou adFreeLifetime:true e pendingOrderId:null. Nenhuma nova cobrança foi criada. O relatório completo anterior, do deployment a1999d42, foi preservado. Este smoke não comprova entrega real de webhook; PAYMENTS_ENABLED continua true somente no sandbox.

Em 2026-10-15T20:21:17.850Z, a simulação enviada pelo painel Mercado Pago foi aceita com HTTP 200 no teste corrigido https://1ca101c3.4jfinance-pix-test.pages.dev. A captura confirmou que o simulador assina o ID com as letras originais; o SDK oficial preserva esse formato, enquanto a documentação Orders também descreve minúsculas. O backend agora exige HMAC válido em uma dessas duas formas, sempre incluindo ID, request-id e timestamp, e reconsulta o pedido no provedor. Os diagnósticos temporários foram removidos. A aceitação desta simulação não comprova uma notificação espontânea após pagamento; essa etapa permanece pendente.
