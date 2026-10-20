# Operação do piloto privado de Pix — R$ 5

Pagamento real do piloto confirmado em 20/10/2026: a verificação somente leitura às 17:12 UTC confirmou no D1 de produção um único pedido de R$ 5 aprovado e o benefício permanente ativo. A usuária também confirmou a tela no iPhone, no domínio oficial. Essas evidências não identificam o webhook como canal exclusivo da confirmação. O piloto segue restrito a uma conta e uma reserva, até 21/10 às 12:16 de Brasília; Pix público e anúncios continuam OFF.

Estado em 20/10/2026 após a validação final de TESTE: OAuth da Cloudflare concluído. A tela Workers & Pages enviada pela usuária mostra cota de 100 mil requisições/dia e botão Upgrade, evidência visual compatível com Workers Free; a API de assinaturas retornou HTTP 403 e não confirmou o plano. Nenhum upgrade ou cadastro de cartão foi feito. O teste aprovado usa Pages em https://8a4c3ca2.4jfinance-pix-test.pages.dev e executor privado 4jfinance-pix-executor-test, versão eb819c59-e3d1-403c-933a-23e3c55a0535. Hash remoto, namespace SQLite preservado, binding e ausência de rotas públicas do executor foram conferidos.

Na medição final de TESTE iniciada em 20/10 às 15:13:50.753 UTC, o webhook natural autenticado concedeu o benefício automaticamente, sem consulta de fallback. As seis chamadas de aplicação e dois webhooks naturais tiveram pares correlacionados com HTTP 200 e outcome:ok. A consulta inicial entrou na cobertura: roteador 0–4 ms de CPU para orçamento de 10 ms; Durable Object 5–14 ms para o padrão de 30.000 ms. O resultado geral de TESTE foi aprovado. O executor agora devolve um descritor finito da resposta e o Pages reconstrói a Response local; isso eliminou os outcome:canceled observados na rodada anterior. Firebase permaneceu com billing desativado antes e depois; as capturas foram encerradas e removidas. A amostra não garante cold start do deployment nem substitui o piloto real.

Produção publicada em 20/10/2026 no deployment canônico 9d41bbad-1426-4603-8801-34542dedb10a, com executor privado 4jfinance-pix-executor versão 158f7f69-5185-451d-b086-db0a48b28bfa. O piloto tem configuração publicada para um único UID administrativo escolhido em segredo, no máximo uma reserva de R$ 5 e expiração em 21/10/2026 às 15:16:08.594 UTC (12:16:08.594 de Brasília). PAYMENTS_ENABLED=false e anúncios OFF permanecem; a etapa de publicação ocorreu antes do pagamento real confirmado acima. O HTML 3e7b43dd… foi conferido no domínio oficial e no alias, com health HTTP 200/backendReady:true e status sem autenticação HTTP 401 quando enviado Origin permitido. O readback final concluiu com sucesso às 15:27:31.471 UTC: domínio oficial e alias com HTML conferido, health HTTP 200/backendReady:true, status sem autenticação HTTP 401 com e sem Origin, webhook sem assinatura HTTP 401 e GET do webhook HTTP 405. O deployment canônico, as configurações protegidas e o executor foram conferidos, sem redeploy. Nenhum UID, e-mail, credencial ou dado de conta é registrado aqui. Netlify continua pausado, sem upgrade de plano. Os registros datados anteriores são históricos.

A nova conferência somente leitura de produção às 15:21:41.993 UTC, após a publicação, confirmou billing do Firebase desativado e conta selecionada habilitada, com e-mail verificado e cadastro aprovado. Firebase permanece no Spark, sem upgrade ou cadastro de cartão; Cloudflare Free tem a evidência visual descrita acima, sem confirmação pela API de assinaturas. A leitura pública do script AdSense retornou HTTP 200 e confirmou a estrutura presente, com flags OFF; a tela Receber código não comprova aprovação do AdSense. A validação final da cópia Git passou com 491 testes e 16 verificações de privacidade, instalação frozen aprovada e HTML reproduzível com SHA-256 3e7b43dd93d7e54e4d2253d0a7707dfdc5f17aa30b47497467250dbf086b8883. Os 26 cenários de interface anteriores continuam registrados no escopo em que foram executados.

## Limites da autorização

- Um único login selecionado de forma privada, com e-mail verificado e cadastro aprovado. A seleção é pelo UID autenticado no servidor; o navegador não escolhe a conta autorizada.
- No máximo uma reserva de pedido de R$ 5 para essa conta no banco do ambiente. Retomar o mesmo pedido não cria outra reserva. Uma reserva anterior, mesmo sem pagamento concluído, impede reservar outro pedido durante o piloto.
- Ao configurar o piloto, definir a expiração para 24 horas após a configuração, em UTC. A passagem do prazo bloqueia novas criações; não deve haver renovação automática.
- `PAYMENTS_ENABLED` permanece `false`: o pagamento continua indisponível ao público. Somente a conta autorizada, dentro do prazo e após as verificações do servidor, pode receber permissão de criação.
- Anúncios permanecem OFF. O AdSense continua em análise; preparar ou pagar o piloto não antecipa a aprovação dos anúncios.

Manter Firebase Spark e Cloudflare Workers Free, sem Blaze, Workers Paid, outro upgrade ou cadastro de cartão para viabilizar esta arquitetura. Conferir por leitura o plano Workers da conta e o billing do Firebase antes e depois de qualquer operação remota autorizada; registrar data e resultado, sem credenciais. O plano Free do domínio não comprova o plano Workers. Se a leitura não estiver disponível, registrar a verificação como pendente, sem presumir gratuidade ou alterar a assinatura. Manter Netlify pausado. A publicação na Cloudflare é uma operação distinta do backup Git. O apoio de R$ 5 está sujeito às tarifas de recebimento do Mercado Pago aplicáveis à conta; os planos gratuitos de infraestrutura não eliminam essa tarifa do provedor.

## Configuração privada

Usar o segredo `PIX_PILOT_CONFIG` no projeto Cloudflare de produção. Seu objeto JSON contém somente `uids`, uma lista com exatamente um UID, e `expiresAt`, um instante UTC no formato `AAAA-MM-DDTHH:mm:ss.sssZ`. O horário deve ser calculado no momento da configuração, com validade de 24 horas.

Não inserir UID, e-mail, senha, token ou o conteúdo desse segredo em código, HTML, configuração pública, Git, documentação, logs ou mensagens. Localizar apenas a conta já indicada pela responsável, sem listar outros usuários. Conferir privadamente que ela corresponde ao login escolhido.

Antes de aplicar a configuração, conferir no ambiente correto:

1. `PAYMENTS_ENABLED=false`, credenciais de produção, `MP_LIVE_MODE=true` e banco D1 de produção.
2. Assinatura de webhook pertencente à mesma aplicação que recebe o pagamento. Não reutilizar o segredo da aplicação de teste ou de outra aplicação.
3. Endpoint de produção `https://4jfinance.com.br/api/pix/mercadoPagoWebhook`, com o evento `Order (Mercado Pago)`.
4. Configuração válida e prazo calculado, sem ampliar a lista de logins. Um segredo malformado fecha o acesso; não é o procedimento de desligamento.

No Cloudflare Pages, os segredos configurados no projeto são incorporados às novas implantações. Configurar o segredo não altera uma implantação já ativa, nem substitui a publicação do código compatível. Validar o pacote de produção e sua leitura após publicação como uma etapa separada. Publicar apenas o pacote permitido gerado por `scripts/build-cloudflare.cjs`, nunca fontes de servidor em bruto, diretório `work/`, arquivos de controle ou segredos.

## Executor privado e pacotes

O design preparado separa a API em um roteador no Pages e uma classe `PixExecutor` em um Worker privado com namespace Durable Object SQLite. O binding `PIX_EXECUTOR` liga os dois; o Pages não hospeda a classe. O roteador encaminha a requisição por RPC; o executor lê a resposta completa e devolve somente um descritor finito de status, headers e corpo, validado nas duas pontas. Pages reconstrói a Response local, sem manter um stream remoto. O deploy e a medição final de teste foram aprovados com CPU dentro dos limites e outcome:ok. A configuração restrita do piloto foi publicada em produção; pagamento real e benefício foram confirmados na verificação de 20/10. [Bindings do Pages](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects), [Request e Response por RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/#readablestream-writablestream-request-and-response).

Executar o builder na fonte atual, `4j-finance-monetizacao/`. `node scripts/build-cloudflare.cjs --test` gera o pacote Pages em `work/cloudflare-test/`, o executor compilado em `work/cloudflare-test-executor/index.mjs` e os controles `work/cloudflare-test-deploy/wrangler.json` e `work/cloudflare-test-executor-deploy/wrangler.json`. Sem `--test`, os caminhos usam `cloudflare-production`. O teste prepara somente uma página de apoio à API, não o frontend completo.

Com a autorização OAuth concluída, após conferir o plano e concluir a validação necessária, publicar primeiro o executor com `wrangler deploy --no-bundle --config work/cloudflare-test-executor-deploy/wrangler.json`, usando o bundle e o hash revisados. Conferir remotamente sua versão, classe e namespace antes de publicar Pages com `wrangler --cwd work/cloudflare-test-deploy pages deploy`. Para produção, usar os controles `cloudflare-production` em uma operação separada e autorizada. Não recompilar no deploy, enviar fontes em bruto ou publicar os diretórios de controle como arquivos do site. O procedimento completo está em `PUBLICAR-NO-CLOUDFLARE.md`.

O Worker privado usa `workers_dev=false`, `preview_urls=false` e `routes=[]`; seu `fetch` direto responde 404. Teste e produção têm nomes e namespaces separados. A migração `v1` declara `new_sqlite_classes: ["PixExecutor"]`, sem migrar ou copiar os dados do D1. O binding Pages `PIX_EXECUTOR` aponta para a classe `PixExecutor` no Worker do ambiente. O executor continua usando o D1 do ambiente, o mesmo Firebase, as verificações de autenticação e os vínculos de pagamento e benefício já existentes. O lease no D1 e a idempotência permanecem obrigatórios; o Durable Object não os substitui.

Os segredos `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e, quando configurado, `PIX_PILOT_CONFIG` permanecem no Pages. Somente a lista permitida de valores escalares segue por RPC na memória da chamada. Não colocar esses valores em arquivos, URLs, headers de transporte ou variáveis públicas do executor. O executor exige correspondência das identidades e flags públicas com sua própria configuração e usa seu próprio binding D1; dados da requisição não podem trocar o ambiente ou o recebedor. A configuração privada não é persistida no objeto.

`PIX_CPU_DIAGNOSTICS=true` existe somente na configuração fixa do executor de teste. O diagnóstico registra operação, status e correlação técnica limitada, sem tokens, assinaturas, corpo do pedido ou identificadores de conta. Produção omite essa flag. Verificar separadamente o hash de cada bundle, a versão do executor, o namespace SQLite, o binding Pages, a ausência de rotas públicas do executor e as flags de produção.

## Limites do plano gratuito

A validação precisa medir as duas camadas separadamente: **10 ms de CPU por chamada do roteador Pages no Workers Free** e **30.000 ms (30 segundos) de CPU por chamada do Durable Object, limite padrão**, sem aumento de `limits.cpu_ms`. Esse limite do Durable Object não amplia o limite do roteador. A primeira consulta de status também conta. Medir só o roteador, só o executor ou a duração dos testes Node não comprova o orçamento do fluxo. Limites oficiais conferidos em 20/10/2026: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/).

No Workers Free, Durable Objects SQLite têm cotas de 100 mil requisições e 13 mil GB-s de duração por dia. A duração considera tempo ativo, inclusive espera de I/O, e não equivale à CPU. As cotas de Pages/Workers, D1 e Firebase também continuam aplicáveis. Se uma cota Free esgotar, a operação correspondente falha; não contratar nem automatizar upgrade. Preservar confirmação e recuperação seguras após indisponibilidade. [Cotas e duração de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Comportamento esperado no site

`frontend/monetization-build.json` prepara a integração com `pilotEnabled=true`, enquanto o build mantém `publicPayments=false` e `adsEnabled=false`. Essas flags públicas não concedem autorização de compra.

O site consulta o status com a sessão do usuário antes de permitir a criação do Pix. Essa consulta inicial também deve integrar a medição de CPU, inclusive sua primeira execução; não pode ser descartada como aquecimento. A ação de criar Pix só aparece disponível após uma resposta válida que permita criar para aquela conta. Outra conta, sessão não confirmada, prazo vencido ou falha de consulta não deve ganhar permissão. Pedidos pendentes e benefícios já reconhecidos continuam acessíveis para recuperação. O modo de demonstração permanece local, sem gerar cobrança real.

Ao realizar o teste autorizado, usar somente o pedido reservado para essa conta. Conferir o valor de R$ 5 e o recebedor antes de pagar. Não gerar uma segunda cobrança para investigar atraso, erro de rede ou mensagem incerta. Não apagar a reserva, o vínculo com o provedor ou o benefício para repetir o teste.

## Confirmação e recuperação

O benefício é definido pelo servidor, após conferir o pedido no Mercado Pago e seu vínculo privado com o comprador, produto, valor e ambiente. A tela, o retorno de criação e o corpo de uma notificação isolada não autorizam a remoção dos anúncios.

As rotas `getMonetizationStatus`, `checkPixCheckout` e `mercadoPagoWebhook` devem permanecer operacionais mesmo quando novas criações estão desativadas. O webhook continua exigindo assinatura válida; consultas do usuário continuam exigindo sua autenticação e vínculo com o pedido.

Se a confirmação demorar ou o site for fechado:

1. Entrar novamente com o mesmo login e recuperar o pedido existente. A consulta autenticada pode conferir o pagamento no provedor e atualizar o benefício.
2. Usar a ação de conferir confirmação para o mesmo pedido. Não interpretar expiração local ou perda de conexão como prova de que o pagamento não ocorreu.
3. Se persistir um erro, conferir somente o pedido já existente e o estado seguro do servidor, sem registrar credenciais ou dados pessoais nos relatórios. Não flexibilizar assinatura, autenticação ou regras de vínculo para obter HTTP 200.

O limite de uma reserva não é liberado por expiração do piloto, recarga da página ou nova configuração do segredo. Qualquer repetição com outro pedido exige uma decisão operacional separada; não faz parte deste piloto.

## Desligamento

A expiração já incluída na implantação é verificada pelo código: ao chegar o prazo, novas criações são bloqueadas automaticamente, sem nova publicação. Manter `PAYMENTS_ENABLED=false`.

Para encerrar antes do prazo, remover `PIX_PILOT_CONFIG` ou definir seu `expiresAt` para um instante válido já passado no projeto Cloudflare Pages e, em seguida, republicar o pacote validado para produção. A alteração ou remoção do segredo no projeto só entra nas novas implantações; um PATCH isolado não modifica a configuração do deployment que já está atendendo o site. Conferir a implantação ativa e o bloqueio efetivo antes de considerar o desligamento antecipado concluído. Um rollback controlado também precisa apontar para uma versão conferida que mantenha a recuperação de pedidos.

Não desligar a integração do frontend, remover credenciais de confirmação, desvincular o D1 ou desabilitar o webhook como forma de encerrar o piloto. Isso prejudicaria a consulta de quem já possui pedido ou benefício. O encerramento impede novas criações, preservando confirmação e recuperação do pedido existente.

Após o desligamento, conferir com o mesmo login que a criação está indisponível e que a consulta do pedido ou benefício continua funcionando. Confirmar também que outra conta continua sem permissão de criar. Registrar apenas o resultado, horário, versão publicada e verificações realizadas, sem identificadores privados.

## Evidências antes de ampliar o acesso

Antes de ampliar o acesso, ainda precisam de registros próprios o isolamento remoto entre a conta permitida e outra conta e o desligamento com recuperação preservada. O pagamento real e o benefício já foram confirmados por leitura restrita do D1 e pela tela enviada pela usuária. O readback de produção foi concluído; a API de assinaturas permanece sem permissão de leitura, e a evidência visual de Free está descrita neste guia. O deploy de teste, a correção RPC, a medição dual aprovada, a prova natural do benefício, a suíte final e o build reproduzível da cópia Git estão confirmados. A configuração do piloto foi publicada em produção; isso não comprova pagamento real ou encerramento do piloto. Não tratar este guia, um build local ou a aprovação do sandbox anterior como prova dessas etapas em produção.

Ampliar o acesso para o público, aumentar o limite de pedidos, trocar de plano ou ativar anúncios são decisões separadas. Nenhuma delas é autorizada pela configuração deste piloto.
