# Publicar o 4J Finance no Cloudflare Pages

## Publicação conferida — Pix público de R$ 5

Em 20/10/2026 foi autorizada a liberação pública para contas habilitadas, com e-mail verificado e cadastro aprovado. As verificações locais da liberação passaram: 496 testes, 16 verificações de privacidade, 26 cenários de interface, 12 self-tests do helper e preflight por leitura. Publicado em 2026-10-20T17:35:03.726306Z: Pages 906fac2d-3f35-4f0e-9bdf-49a3a834b42e e executor privado versão 75976ab1-bb58-47ee-a67e-a416e24979e3. Readback aprovado às 17:36:08.770 UTC; HTML SHA-256 f8dbc483f10c83810539bf25a7904950643f694ba738d4a142c6c7ba6a13c821 conferido no domínio oficial, alias e canonical. D1, namespace SQLite e segredos preservados; piloto removido, compras públicas ativas e anúncios OFF. Firebase billing desativado confirmado às 17:36:02.039 UTC, sem alteração de plano. O ambiente de TESTE foi preservado.

A sequência executada publicou primeiro o executor validado com teto de compras habilitado, aceitando Pages ainda desligado. Depois, configurou PAYMENTS_ENABLED=true, retirou PIX_PILOT_CONFIG do Pages e publicou o pacote com pilotEnabled=false/publicPayments=true. O PATCH isolado não altera o deployment já servido. Os testes locais cobriram compra única e isolamento; a leitura restrita pós-publicação confirmou o único pedido real anterior aprovado e o benefício ativo, sem gerar cobrança adicional. Não publicar apenas o pacote estático, pois a API Pix deve permanecer no deployment.

## Histórico de produção antes da liberação pública

Pagamento real do piloto confirmado em 20/10/2026: a verificação somente leitura às 17:12 UTC confirmou no D1 de produção um único pedido de R$ 5 aprovado e o benefício permanente ativo. A usuária também confirmou a tela no iPhone, no domínio oficial. Essas evidências não identificam o webhook como canal exclusivo da confirmação. O piloto segue restrito a uma conta e uma reserva, até 21/10 às 12:16 de Brasília; Pix público e anúncios continuam OFF.

Estado em 20/10/2026 após a validação final de TESTE: OAuth da Cloudflare concluído. A tela Workers & Pages enviada pela usuária mostra cota de 100 mil requisições/dia e botão Upgrade, evidência visual compatível com Workers Free; a API de assinaturas retornou HTTP 403 e não confirmou o plano. Nenhum upgrade ou cadastro de cartão foi feito. O teste aprovado usa Pages em https://8a4c3ca2.4jfinance-pix-test.pages.dev e executor privado 4jfinance-pix-executor-test, versão eb819c59-e3d1-403c-933a-23e3c55a0535. Hash remoto, namespace SQLite preservado, binding e ausência de rotas públicas do executor foram conferidos.

Na medição final de TESTE iniciada em 20/10 às 15:13:50.753 UTC, o webhook natural autenticado concedeu o benefício automaticamente, sem consulta de fallback. As seis chamadas de aplicação e dois webhooks naturais tiveram pares correlacionados com HTTP 200 e outcome:ok. A consulta inicial entrou na cobertura: roteador 0–4 ms de CPU para orçamento de 10 ms; Durable Object 5–14 ms para o padrão de 30.000 ms. O resultado geral de TESTE foi aprovado. O executor agora devolve um descritor finito da resposta e o Pages reconstrói a Response local; isso eliminou os outcome:canceled observados na rodada anterior. Firebase permaneceu com billing desativado antes e depois; as capturas foram encerradas e removidas. A amostra não garante cold start do deployment nem substitui o piloto real.

Produção publicada em 20/10/2026 no deployment canônico 9d41bbad-1426-4603-8801-34542dedb10a, com executor privado 4jfinance-pix-executor versão 158f7f69-5185-451d-b086-db0a48b28bfa. O piloto tem configuração publicada para um único UID administrativo escolhido em segredo, no máximo uma reserva de R$ 5 e expiração em 21/10/2026 às 15:16:08.594 UTC (12:16:08.594 de Brasília). PAYMENTS_ENABLED=false e anúncios OFF permanecem; a etapa de publicação ocorreu antes do pagamento real confirmado acima. O HTML 3e7b43dd… foi conferido no domínio oficial e no alias, com health HTTP 200/backendReady:true e status sem autenticação HTTP 401 quando enviado Origin permitido. O readback final concluiu com sucesso às 15:27:31.471 UTC: domínio oficial e alias com HTML conferido, health HTTP 200/backendReady:true, status sem autenticação HTTP 401 com e sem Origin, webhook sem assinatura HTTP 401 e GET do webhook HTTP 405. O deployment canônico, as configurações protegidas e o executor foram conferidos, sem redeploy. Nenhum UID, e-mail, credencial ou dado de conta é registrado aqui. Netlify continua pausado, sem upgrade de plano. Os registros datados anteriores são históricos.

A nova conferência somente leitura de produção às 15:21:41.993 UTC, após a publicação, confirmou billing do Firebase desativado e conta selecionada habilitada, com e-mail verificado e cadastro aprovado. Firebase permanece no Spark, sem upgrade ou cadastro de cartão; Cloudflare Free tem a evidência visual descrita acima, sem confirmação pela API de assinaturas. A leitura pública do script AdSense retornou HTTP 200 e confirmou a estrutura presente, com flags OFF; a tela Receber código não comprova aprovação do AdSense. A validação final da cópia Git passou com 491 testes e 16 verificações de privacidade, instalação frozen aprovada e HTML reproduzível com SHA-256 3e7b43dd93d7e54e4d2253d0a7707dfdc5f17aa30b47497467250dbf086b8883. Os 26 cenários de interface anteriores continuam registrados no escopo em que foram executados.

Marco histórico do sandbox em 19/10: webhook natural autenticado e concessão automática sem fallback, posteriormente confirmada por SELECT. Configurar o segredo da própria aplicação vendedora de teste resolveu a assinatura antes associada a outra aplicação. Essa prova não equivale a pagamento real nem valida o orçamento de CPU da nova arquitetura. Os registros datados abaixo preservam o histórico e não substituem a nova validação.

O site usa Cloudflare Pages para os arquivos públicos e Firebase Spark para autenticação e dados financeiros. O Pix preparado usa **Pages/Workers Free + Durable Object SQLite + D1**, mantendo a API Orders do Mercado Pago. O executor privado recebe as chamadas do roteador pelo binding `PIX_EXECUTOR`; o D1 continua guardando pedidos e benefícios, sem migração dos dados. O backend Firebase Functions anterior está preservado em `functions/`, sem ativação. Manter Netlify pausado, Montserrat, cores, Catatau e uso no iPhone.

## Estado confirmado em 15/10/2026

Produção com arquivos estáticos e API Pix desativada: projeto Pages **4jfinance**, com [4jfinance.com.br](https://4jfinance.com.br), [www.4jfinance.com.br](https://www.4jfinance.com.br) e [4jfinance.pages.dev](https://4jfinance.pages.dev). Domínio e www estão ativos com HTTPS. DNS usa `jacqueline.ns.cloudflare.com` e `john.ns.cloudflare.com`; os domínios oficiais estão autorizados no Firebase Authentication. Não refazer domínio, DNS ou projeto Pages para atualizar conteúdo.

As regras completas do Firestore foram publicadas e conferidas. O registro histórico inclui 38 verificações de acesso com contas e documentos sintéticos, removidos ao terminar. Esses testes não foram repetidos por esta atualização documental.

A propriedade foi verificada no AdSense e a revisão solicitada em 15/10/2026 às 14h05, horário de Brasília. A aprovação ainda não foi confirmada. A mensagem de regulamentações europeias está publicada no painel, mas a integração real da CMP no site e a dependência circular do carregador ainda precisam ser resolvidas e testadas.

**Pix real e anúncios continuam desativados. O servidor Pix de produção já está publicado e preparado, com PAYMENTS_ENABLED=false.** O preço preparado é R$ 5 uma única vez por UID comprador, com benefício permanente após confirmação do servidor, sem CPF no checkout e sem transferência automática para outros logins da família.

## Histórico do teste da API em 15/10/2026

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
- `scripts/build-cloudflare.cjs`: pacotes separados do Pages e do executor privado, ambos compilados e com listas explícitas de arquivos permitidos.

Nunca versionar credenciais, tokens, arquivos de autenticação, logs privados, dados reais, dependências instaladas ou `work/` inteiro. Nunca enviar a raiz do workspace, `source/`, `marketing/`, `functions/`, `privacy/`, `audit/` ou um ZIP completo do código para hospedagem estática. Os valores secretos pertencem somente à configuração protegida do servidor.

## Preparar o pacote de teste

Execute na fonte atual `4j-finance-monetizacao/`, com Node.js e as dependências do projeto instaladas:

~~~sh
node scripts/build-cloudflare.cjs --test
~~~

O script gera dois pacotes e dois diretórios de controle:

| Caminho | Conteúdo |
| --- | --- |
| `work/cloudflare-test/` | Página de teste, `_worker.js` do roteador compilado e `_routes.json` |
| `work/cloudflare-test-deploy/wrangler.json` | Configuração do Wrangler, com `pages_build_output_dir` apontando para `../cloudflare-test` |
| `work/cloudflare-test-executor/index.mjs` | Único arquivo do pacote compilado do executor privado |
| `work/cloudflare-test-executor-deploy/wrangler.json` | Configuração do Worker externo, D1 existente e namespace SQLite |

Os diretórios de controle não são conteúdo público. Nunca publicar `work/` inteiro. O empacotador recusa arquivos extras, fontes brutas, mapas de código e links simbólicos nas saídas. A configuração usa `nodejs_compat`. `_routes.json` executa o roteador somente em `/api/pix/*`, preservando o serviço estático fora da API.

O Worker externo de teste chama-se `4jfinance-pix-executor-test`; a classe é `PixExecutor`. Ele usa `workers_dev=false`, `preview_urls=false`, `routes=[]` e responde 404 no acesso direto ao `fetch`. A migração `v1` declara `new_sqlite_classes: ["PixExecutor"]`; não executar migrações nem copiar dados D1 para essa mudança. Pages e executor continuam ligados aos mesmos D1 e Firebase do respectivo ambiente. O binding Pages `PIX_EXECUTOR` aponta para a classe nesse Worker externo e só pode ser resolvido depois da criação do executor e do namespace SQLite. [Durable Objects com Pages](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects).

Segredos continuam configurados remotamente no Pages: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e, quando configurado, `PIX_PILOT_CONFIG` seguem somente na lista permitida de valores escalares por RPC, na memória de cada chamada, junto com a requisição. A volta usa um descritor finito de resposta, validado antes de reconstruir uma Response local no Pages. Não exportar segredos para `.env`, `.dev.vars`, arquivos de controle, headers de transporte, URLs ou vars públicas do executor; a configuração privada não é persistida no objeto. As vars públicas fixas do executor precisam corresponder ao ambiente recebido; seu D1 não pode ser escolhido pela requisição. `PIX_CPU_DIAGNOSTICS=true` é fixo e exclusivo do executor TESTE; produção não inclui a flag. Autenticação, assinatura, lease, idempotência e concessão do benefício mantêm suas verificações. [Transporte RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/#readablestream-writablestream-request-and-response).

Preparar o pacote não faz deploy. A permissão de Pages/D1 não substitui a permissão de publicação de Workers. A autorização OAuth foi concluída; isso não confirma o plano nem substitui o deploy e sua validação. Antes de executar os comandos, conferir por leitura o plano Workers da conta e o billing do Firebase, registrando data e resultado seguro. Exigir Workers Free e Firebase Spark, sem upgrade ou cadastro de cartão para esta arquitetura. O plano Free do domínio não comprova Workers Free. Se a leitura estiver indisponível, registrar a pendência; não deduzir o plano a partir do sucesso de um build ou de uma chamada.

Depois de autorizar o acesso necessário, revisar os dois hashes e concluir os testes, a publicação de teste deve criar primeiro o executor e conferir sua configuração remota; somente depois publicar o roteador Pages. Usar `--no-bundle` no executor conserva o arquivo já compilado e revisado:

~~~sh
npx wrangler deploy --no-bundle --config work/cloudflare-test-executor-deploy/wrangler.json
npx wrangler --cwd work/cloudflare-test-deploy pages deploy
~~~

Use `--cwd` no comando Pages: esse fluxo não aceita `--config` com caminho personalizado. Fixar `CLOUDFLARE_ACCOUNT_ID` na conta revisada em ambos os comandos, sem depender da seleção automática do Wrangler. Não copiar conta, tokens ou segredos para este guia. Conferir destinos, versão e hash do executor, namespace SQLite, binding `PIX_EXECUTOR`, vars e ausência de rotas públicas antes de enviar Pages; depois conferir o deployment Pages e o funcionamento do binding. Repetir a leitura dos planos após a operação e registrar somente resultados seguros. Os comandos acima são referência operacional, não comprovam deploy.

## Concluir a validação do Pix

O transporte pelo executor foi aprovado no TESTE em 20/10 às 15:13 UTC: webhook natural autenticado, benefício sem fallback e medição dual com status inicial, CPU dentro dos limites e outcome:ok. O retorno finito do RPC resolveu os canceled da rodada anterior. Preservar esse conjunto de evidências ao conferir a versão autorizada para produção; ele não comprova pagamento real nem publicação de produção. Os ambientes mantêm projetos, D1 e credenciais próprios. Nunca usar dados financeiros de produção para esse teste nem repetir a configuração de segredos sem evidência de divergência.

O navegador usa transporte configurável `provider: 'cloudflare'` e API da mesma origem `/api/pix`, com token Firebase da sessão. UID, preço e e-mail não são definidos pelo navegador. O servidor determina R$ 5/BRL e o comprador, reserva e reutiliza o pedido, confirma a order e mantém o benefício no D1. Esta alternativa não escreve custom claims no Firebase.

Configure no Mercado Pago Developers a URL HTTPS de teste terminada em `/api/pix/mercadoPagoWebhook` e selecione **Order (Mercado Pago)**. Um GET com 405 não valida o webhook: é necessário provar assinatura, consulta autenticada da order, vínculo privado e atualização do benefício. Segredos de acesso e assinatura nunca entram no HTML, Git, logs ou mensagens.

Autenticação, status, criação do Pix simulado, duas consultas ao mesmo pedido e benefício final passaram na API remota. Complete a validação de interface/QR, retomada, concorrência, outra conta, reembolso e falhas. Meça CPU no runtime remoto e consumo D1; a duração do teste Node não mede CPU do Worker. Verifique o comportamento **Fail closed**: cota ou serviço indisponível não pode liberar pagamento ou mostrar anúncios por engano. Testes sintéticos aprovados e sandbox direto não substituem o fluxo completo nem Safari em iPhone físico.

## Atualizar produção

A publicação de produção e a ativação do Pix exigem validação e escopo próprios; não são consequência automática de build, push ou teste.

Para conteúdo estático, reconstrua com `node build.cjs`, execute as verificações relevantes e revise `public/`. A publicação direta do projeto **4jfinance** recebe somente esses arquivos públicos, com `index.html` na raiz.

Prepare o pacote com `node scripts/build-static.cjs` e publique pelo controle isolado: `npx wrangler pages deploy --cwd work/cloudflare-static-deploy --project-name 4jfinance --branch main`. O empacotador seleciona somente 13 arquivos públicos, excluindo caches. Não execute a publicação estática a partir da raiz que contém `functions/`: o Wrangler tentaria compilar as funções Firebase legadas como rotas Pages. O controle isolado evita essa interpretação.

`node scripts/build-cloudflare.cjs` prepara `work/cloudflare-production/` a partir da lista permitida de `public/`, acrescenta o roteador `_worker.js` e `_routes.json` e gera `work/cloudflare-production-deploy/wrangler.json`. Também prepara `work/cloudflare-production-executor/index.mjs` e `work/cloudflare-production-executor-deploy/wrangler.json`. O executor chama-se `4jfinance-pix-executor`, separado do teste e sem diagnóstico. Exigir a mesma revisão de hash, `--no-bundle`, namespace SQLite, bindings, rotas privadas e flags antes de publicar qualquer parte. A implantação do executor privado não ativa o Pages nem o Pix por si só. A operação pública autorizada e o histórico do piloto estão em `docs/PIX-PILOTO.md`; a liberação pública e seu readback foram concluídos em 20/10/2026.

Após uma publicação autorizada, confira o domínio por HTTPS, as rotas públicas, login, cadastro e as rotas de API aplicáveis, usando dados de teste. Compare a versão publicada com a versão enviada ao GitHub. Não presumir que um ZIP anterior acompanhe os arquivos reconstruídos. Não alterar DNS apenas para trocar o conteúdo.

## Cotas gratuitas

| Recurso | Cota documentada Free |
| --- | --- |
| Workers/Pages Functions | 100 mil requisições por dia |
| CPU do roteador Pages/Worker | 10 ms por invocação |
| Durable Object SQLite: requisições | 100 mil por dia |
| Durable Object SQLite: duração | 13 mil GB-s por dia |
| CPU do Durable Object | 30.000 ms (30 segundos) por invocação, limite padrão |
| D1: linhas lidas | 5 milhões por dia |
| D1: linhas escritas | 100 mil por dia |
| D1: armazenamento total | 5 GB |

Limites oficiais conferidos em 20/10/2026. Medir ambas as camadas no runtime remoto: roteador até 10 ms e executor até 30.000 ms de CPU, incluindo a consulta inicial de status antes do checkout. São orçamentos separados; não aumentar `limits.cpu_ms`. Duração em GB-s considera tempo ativo, inclusive espera de I/O; não é a mesma métrica que CPU. Não desconsiderar a primeira chamada nem inferir CPU a partir do tempo dos testes Node. As medições anteriores do Worker único não aprovam este design.

Ao atingir as cotas Free, as operações correspondentes falham; não há upgrade automático. Confirmar os planos por leitura, manter a API fechada em falhas e não aderir a Blaze ou Workers Paid nem cadastrar cartão. A gratuidade dentro dessas cotas é separada de tarifas de recebimento do Mercado Pago. A tabela pública de Checkout informa 0,99% para Pix com recebimento imediato; a tarifa efetiva da conta não foi verificada ([fonte oficial](https://www.mercadopago.com.br/ferramentas-para-vender/check-out), consultada em 20/10/2026). Fontes: [limites Workers Free](https://developers.cloudflare.com/workers/platform/limits/), [limites Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/), [cotas e duração de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/).

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
