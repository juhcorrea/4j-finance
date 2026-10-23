# 4J Finance

Atualização mais recente — 23/10/2026: login do computador reunido num cartão central, com apresentação amarelinha e formulário branco. A dupla abraçada também aparece no PC. A composição móvel e a escolha de tema foram preservadas. Publicação [acac405d](https://acac405d.4jfinance.pages.dev), 2026-10-23T17:20:53.564072Z, conferida em 2026-10-23T17:21:01.385Z. HTML e três WebP verificados no domínio oficial, alias e versão canônica; executor Pix e configurações preservados.

Atualização mais recente — 23/10/2026: na entrada do celular, os dois Catataus agora ficam abraçados e acenam juntos numa única ilustração transparente. Desktop e seleção de tema preservados. Publicação [ac9dfd92](https://ac9dfd92.4jfinance.pages.dev) em 2026-10-23T17:08:16.725507Z, conferida em 2026-10-23T17:08:25.278Z; HTML e três imagens validados no domínio oficial, alias e versão canônica. Componentes Pix e configurações preservados. [Origem e prompt da ilustração](docs/CATATAU-BOAS-VINDAS.md).

Atualização mais recente — 23/10/2026: Catatau tradicional e xerife juntos na entrada do celular e do computador, mantendo a composição desktop aprovada. Botão de lua/sol para escolher tema claro ou noturno, com preferência local persistida. Publicação [6a10c17b](https://6a10c17b.4jfinance.pages.dev) em 2026-10-23T14:50:11.852756Z; conferência aprovada em 2026-10-23T14:51:34.755Z. HTML e os dois WebP confirmados no domínio oficial, alias e versão canônica; executor e configurações preservados. Sem operações financeiras ou alteração de plano.

Atualização publicada em 23/10/2026: voz mineira leve do Catatau no modo firme, botão flutuante restaurado no celular e login móvel com o xerife. Deployment [b0e94af8](https://b0e94af8.4jfinance.pages.dev), publicado às 14:29:18 UTC e conferido às 14:29:28 UTC no domínio oficial, alias e versão canônica. HTML e imagem correspondem ao pacote validado. Health HTTP 200/backendReady:true e acesso anônimo HTTP 401; executor, configurações e planos preservados. Sem operações financeiras. [Detalhes do Catatau](docs/CATATAU-MODO-FIRME.md).

Atualizacao visual publicada em 23/10/2026: Catatau xerife no modo firme. Deployment [2e16fdf1](https://2e16fdf1.4jfinance.pages.dev), conferido no dominio oficial e no alias as 14:09:40 UTC. HTML e imagem correspondem ao pacote validado; Pix pronto (HTTP 200), acesso sem login recusado (HTTP 401), executor e configuracoes preservados. Nenhuma operacao financeira ou alteracao de plano.


Catatau ganha visual de mini xerife ao ativar o modo firme: chapeu de cowboy, botinhas com espora e coldre, seguindo a preferencia de cada perfil. [Detalhes do visual](docs/CATATAU-MODO-FIRME.md).

Pix público de R$ 5 publicado e conferido em 20/10/2026. A compra é única por login habilitado, com e-mail verificado e cadastro aprovado; quem já pagou conserva o benefício permanente e não precisa pagar novamente. O piloto privado foi encerrado, sem prazo de expiração aplicado às compras públicas. Anúncios continuam OFF, Firebase Spark e Cloudflare Free preservados, sem upgrade. Tarifas de recebimento do Mercado Pago são separadas da hospedagem.

Liberacao publica do Pix em 20/10: [906fac2d](https://906fac2d.4jfinance.pages.dev), publicada às 17:35:03 UTC e conferida às 17:36:08 UTC no domínio oficial, alias e versão canônica. O pedido real anterior e seu benefício permanecem ativos. Validação: 496 testes, 16 verificações de privacidade e 26 cenários locais de interface aprovados. Detalhes em [operação do Pix](docs/PIX-PILOTO.md).

## Histórico do piloto validado — 20/10/2026

Pagamento real do piloto confirmado em 20/10/2026: a verificação somente leitura às 17:12 UTC confirmou no D1 de produção um único pedido de R$ 5 aprovado e o benefício permanente ativo. A usuária também confirmou a tela no iPhone, no domínio oficial. Essas evidências não identificam o webhook como canal exclusivo da confirmação. O piloto segue restrito a uma conta e uma reserva, até 21/10 às 12:16 de Brasília; Pix público e anúncios continuam OFF.

Estado em 20/10/2026 após a validação final de TESTE: OAuth da Cloudflare concluído. A tela Workers & Pages enviada pela usuária mostra cota de 100 mil requisições/dia e botão Upgrade, evidência visual compatível com Workers Free; a API de assinaturas retornou HTTP 403 e não confirmou o plano. Nenhum upgrade ou cadastro de cartão foi feito. O teste aprovado usa Pages em https://8a4c3ca2.4jfinance-pix-test.pages.dev e executor privado 4jfinance-pix-executor-test, versão eb819c59-e3d1-403c-933a-23e3c55a0535. Hash remoto, namespace SQLite preservado, binding e ausência de rotas públicas do executor foram conferidos.

Na medição final de TESTE iniciada em 20/10 às 15:13:50.753 UTC, o webhook natural autenticado concedeu o benefício automaticamente, sem consulta de fallback. As seis chamadas de aplicação e dois webhooks naturais tiveram pares correlacionados com HTTP 200 e outcome:ok. A consulta inicial entrou na cobertura: roteador 0–4 ms de CPU para orçamento de 10 ms; Durable Object 5–14 ms para o padrão de 30.000 ms. O resultado geral de TESTE foi aprovado. O executor agora devolve um descritor finito da resposta e o Pages reconstrói a Response local; isso eliminou os outcome:canceled observados na rodada anterior. Firebase permaneceu com billing desativado antes e depois; as capturas foram encerradas e removidas. A amostra não garante cold start do deployment nem substitui o piloto real.

Produção publicada em 20/10/2026 no deployment canônico 9d41bbad-1426-4603-8801-34542dedb10a, com executor privado 4jfinance-pix-executor versão 158f7f69-5185-451d-b086-db0a48b28bfa. O piloto tem configuração publicada para um único UID administrativo escolhido em segredo, no máximo uma reserva de R$ 5 e expiração em 21/10/2026 às 15:16:08.594 UTC (12:16:08.594 de Brasília). PAYMENTS_ENABLED=false e anúncios OFF permanecem; a etapa de publicação ocorreu antes do pagamento real confirmado acima. O HTML 3e7b43dd… foi conferido no domínio oficial e no alias, com health HTTP 200/backendReady:true e status sem autenticação HTTP 401 quando enviado Origin permitido. O readback final concluiu com sucesso às 15:27:31.471 UTC: domínio oficial e alias com HTML conferido, health HTTP 200/backendReady:true, status sem autenticação HTTP 401 com e sem Origin, webhook sem assinatura HTTP 401 e GET do webhook HTTP 405. O deployment canônico, as configurações protegidas e o executor foram conferidos, sem redeploy. Nenhum UID, e-mail, credencial ou dado de conta é registrado aqui. Netlify continua pausado, sem upgrade de plano. Os registros datados anteriores são históricos.

A nova conferência somente leitura de produção às 15:21:41.993 UTC, após a publicação, confirmou billing do Firebase desativado e conta selecionada habilitada, com e-mail verificado e cadastro aprovado. Firebase permanece no Spark, sem upgrade ou cadastro de cartão; Cloudflare Free tem a evidência visual descrita acima, sem confirmação pela API de assinaturas. A leitura pública do script AdSense retornou HTTP 200 e confirmou a estrutura presente, com flags OFF; a tela Receber código não comprova aprovação do AdSense. A validação final da cópia Git passou com 491 testes e 16 verificações de privacidade, instalação frozen aprovada e HTML reproduzível com SHA-256 3e7b43dd93d7e54e4d2253d0a7707dfdc5f17aa30b47497467250dbf086b8883. Os 26 cenários de interface anteriores continuam registrados no escopo em que foram executados.

Organizacao financeira pessoal e familiar, com receitas, despesas recorrentes, parcelas, metas, relatorios e o Catatau. Identidade visual em Montserrat, com as cores originais da marca.

**Site:** https://4jfinance.com.br/ · **Hospedagem:** Cloudflare Pages · **Login e dados:** Firebase.

## Histórico de 15 a 19/10/2026

- Dominio oficial e www com HTTPS ativos; dominio autorizado no Firebase Authentication.
- Cadastro aberto e compartilhamento opcional. Administrar uma familia nao concede acesso financeiro a outras familias.
- Paginas publicas e preferencias de cookies publicadas.
- AdSense: propriedade verificada e revisao solicitada em 15/10 as 14h05 (America/Sao_Paulo); aprovacao ainda pendente.
- Mensagem Google CMP publicada no painel. Integracao e exibicao real no site ainda precisam ser concluidas e testadas; veja ADSENSE-PREPARACAO.txt.
- **Anuncios e Pix de producao desativados.** A preparacao do Pix foi retomada e implementada com a API Orders do Mercado Pago: R$ 5 em pagamento unico, com beneficio permanente por UID comprador, sem mensalidade nem repasse a outros logins da familia.
- O checkout nao pede CPF. Reserva e reutiliza o pedido, retoma o mesmo Pix e aguarda o QR quando o processamento e assincrono. A liberacao depende da confirmacao no servidor.
- A responsavel recusou a adesao ao Blaze e pediu uma alternativa gratuita. O Firebase permanece no Spark; a consulta anterior retornou billingEnabled:false. A implementacao atual usa Cloudflare Pages Functions/Workers Free + D1; nao houve upgrade de plano.
- O codigo em cloudflare/ esta preparado, e a interface possui transporte Cloudflare configuravel na mesma origem. functions/ preserva a implementacao Firebase anterior, sem ativacao. O beneficio vem do servidor/D1; esta alternativa nao grava custom claims.
- Um teste direto da API Orders no sandbox aprovou o pedido de R$ 5, sem dinheiro real, sem Firebase e sem validar webhook. Os testes sinteticos de interface e servidor passaram nos recortes documentados em TESTES.txt. O teste remoto completo da API Cloudflare passou em 2026-10-15T19:25:58.017Z: Auth, status, Pix simulado R$ 5, duas consultas ao mesmo pedido e adFreeLifetime:true. O webhook natural de teste e a concessao automatica sem fallback foram comprovados em 19/10, conforme o resumo atual.
- Ambiente de teste registrado em 19/10: https://6543501e.4jfinance-pix-test.pages.dev, alias https://4jfinance-pix-test.pages.dev. A correção de reconciliação de Pix pendente foi publicada e o smoke de status da conta já paga passou. O QA completo anterior foi aprovado no deployment a1999d42 (remote-qa ok:true). PAYMENTS_ENABLED=true somente no sandbox.
- Configuracao protegida concluida em 2026-10-15T19:13:32.529Z, apos corrigir o wrapper Windows PowerShell 5.1; valores enviados por memoria, sem credenciais em arquivos locais. Naquela etapa, o provedor Auth estava ativo (consulta GET HTTP 200), mas a conta sintetica ainda precisava de correcao. A conta de teste agora esta pronta em Auth/Firestore Spark, com billingEnabled:false confirmado.
- Historico: o deployment inicial 7ac93e50 retornava backendReady:false e webhook GET HTTP 405. O health atual nao comprova pagamento, webhook ou beneficio de ponta a ponta.
- O ambiente usa o projeto Firebase de teste fjfinance-pix-test e D1 separado, criado com schema aplicado em nove comandos. Dados financeiros de producao nao foram acessados. O servidor Pix de producao foi publicado com PAYMENTS_ENABLED=false; nenhuma cobranca real foi criada. AdSense e CMP continuam pendentes.
- O Netlify anterior permanece pausado. Atualizar este repositorio nao publica o site automaticamente no Cloudflare.

O domínio oficial consta ativo na Cloudflare, com certificado Google válido. A usuária confirmou que o site abre pela rede 4G. A falha de acesso observada ficou restrita à rede corporativa: nela, a resolução DNS apontou para um servidor da empresa, que apresentou certificado de outro domínio.

## Validacao remota do sandbox — 15/10/2026

O teste remoto da API Cloudflare passou em 2026-10-15T19:25:58.017Z (remote-qa ok:true), no deployment https://a1999d42.4jfinance-pix-test.pages.dev, com alias https://4jfinance-pix-test.pages.dev. O fluxo validou autenticação, consulta de status, criação de Pix simulado de R$ 5, duas consultas do mesmo UUID de pedido e resultado final adFreeLifetime:true. Não houve cobrança financeira real.

A conta sintética do Firebase de teste está pronta, com Auth e Firestore no Spark; billingEnabled:false foi confirmado. PAYMENTS_ENABLED=true permanece exclusivo do sandbox. Pix de produção e anúncios continuam desligados; o servidor Pix de produção não foi publicado.

A entrega real do webhook ainda não está comprovada: realWebhookDeliveryVerified:false. O histórico de notificações do Mercado Pago está sendo consultado. O resultado aprovado acima veio do fluxo autenticado da API e das consultas do pedido; não deve ser apresentado como prova de entrega do webhook.

A compatibilidade de redirecionamentos Google/Mercado Pago foi corrigida com tratamento manual e reproduzida no runtime Workerd. Os recortes de 42 testes de autenticação e 25 de cobrança foram aprovados; a suíte consolidada final ainda será executada e não recebe total neste registro.

## Estrutura atual

| Caminho | Conteudo |
| --- | --- |
| public/ | Unicos arquivos destinados a hospedagem estatica |
| source/base.html | Fonte de entrada anterior as transformacoes; nunca hospedar diretamente |
| frontend/ | Modulos de interface e testes de consentimento/monetizacao |
| privacy/ | Transformacoes, regras Firestore e testes de isolamento |
| cloudflare/ | Pix Orders: roteador Pages, executor privado Durable Object SQLite, D1, autenticacao e testes; Pix público de R$ 5 publicado; benefício por login e pagamento anterior preservados |
| functions/ | Implementacao Firebase Functions legada, preservada e nao ativa |
| qa/ | Testes de navegador com dados sinteticos |
| scripts/ | Validacao, reproducao do build e sincronizacao do workspace |
| marketing/ | Portfolio, seis videos, posts, stories, carrossel, legendas e ativos finais |
| branding/ | Logotipo PNG preparado para a mensagem AdSense |
| 4j-finance-portfolio-compartilhar.html | Portfolio em arquivo unico, com imagens, fonte e videos incorporados |

index.html e outputs/index.html sao copias de compatibilidade do HTML atual. Os arquivos anteriores em work/ e snapshots/ sao historicos, nao sao a fonte atual. Nunca envie work/ inteiro: o empacotador Cloudflare cria uma saida especifica com lista de arquivos permitidos, _worker.js e _routes.json. O historico de commits conserva as versoes anteriores.

## Validar e reconstruir

Requer Node.js 22 ou superior. Os testes de logica usam apenas os modulos nativos do Node:

~~~sh
node scripts/check.cjs
node scripts/verify-build.cjs
node build.cjs
~~~

O build usa source/base.html e os modulos locais, sem depender da pasta Downloads. verify-build compara o resultado em uma pasta temporaria com public/index.html, sem alterar a entrega publicada.

Na fonte atual 4j-finance-monetizacao/, node scripts/build-cloudflare.cjs --test gera o pacote Pages work/cloudflare-test/, o executor compilado work/cloudflare-test-executor/index.mjs e dois controles separados com wrangler.json. Publicar primeiro o executor com --no-bundle e conferir hash, namespace SQLite e configuração remota; depois usar --cwd work/cloudflare-test-deploy para Pages. Produção usa os caminhos cloudflare-production em operação separada. Segredos continuam no Pages e seguem pela lista permitida do RPC somente em memória, nunca em headers ou arquivos. Preparar os pacotes não publica nada. Veja PUBLICAR-NO-CLOUDFLARE.md.

No Free, o roteador Pages tem orçamento de 10 ms de CPU por invocação; o Durable Object SQLite usa o padrão separado de 30.000 ms. Durable Objects têm cotas de 100 mil requisições e 13 mil GB-s de duração por dia; D1 mantém 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. Não aumentar limites, cadastrar cartão ou fazer upgrade. A medição final de TESTE aprovou ambas as camadas com outcome:ok após a correção do retorno RPC; a configuração restrita foi publicada em produção, com pagamento real e benefício confirmados em 20/10. Fontes: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) e [D1](https://developers.cloudflare.com/d1/platform/pricing/).

Para os testes visuais, instale as dependencias com pnpm install --frozen-lockfile, execute pnpm exec playwright install chromium e pnpm test:ui. A fixture independente do Pix esta em qa/pix-checkout.test.cjs e pode ser executada com node qa/pix-checkout.test.cjs; usa somente login e respostas de pagamento sinteticos, sem Firebase ou Mercado Pago reais. Opcionalmente, PLAYWRIGHT_EXECUTABLE_PATH seleciona outro Chromium instalado. Os testes de regras usam o emulador e dependencias de privacy/; nao executar testes contra dados reais sem escopo explicito.

## Manter atualizado

Ao concluir uma alteracao do 4J Finance: validar, revisar o diff, criar um commit e enviar ao GitHub. Essa e a preferencia permanente definida pela responsavel pelo projeto. Consulte AGENTS.md e docs/SINCRONIZACAO.md.

A workflow de verificacao executa testes de logica e reproducao do build; nao faz deploy, nao acessa contas Firebase e nao gera pagamentos. Configuracoes feitas nos paineis externos sao registradas na documentacao. Segredos, tokens, auditorias privadas e dados financeiros ficam fora do Git.

Veja COMECE-AQUI.md, PUBLICAR-NO-CLOUDFLARE.md e ADSENSE-PREPARACAO.txt para operacao e pendencias.

Atualização de teste em 2026-10-15T19:47:56.461Z: a correção que reconcilia o Pix pendente na consulta de status foi publicada em https://c685b5c9.4jfinance-pix-test.pages.dev, com o alias de teste preservado. Health HTTP 200 confirmou backendReady:true; a consulta autenticada da conta sintética já paga retornou adFreeLifetime:true e pendingOrderId:null. Nenhuma nova cobrança foi criada. O relatório completo anterior, do deployment a1999d42, foi preservado. Este smoke não comprova entrega real de webhook; PAYMENTS_ENABLED continua true somente no sandbox.

## Catatau e divulgacao

O Catatau agora inclui planejamento local de compras, comparacao entre a vista e parcelas e Modo firme opcional. Veja docs/CATATAU-PLANEJAMENTO.md. O portfolio compartilhavel explica o uso gratuito sustentado por anuncios e a retirada opcional por pagamento unico, ainda em configuracao. Os geradores publicos selecionados ficam em marketing/work; seus resultados privados de QA nao entram no Git.


A validação de Firebase no fluxo Cloudflare de teste está concluída (Auth e conta sintética). A antiga implementação Firebase Functions continua sem publicação e não faz parte desse QA. Os segredos de produção foram configurados e a conta Mercado Pago de produção foi validada em 2026-10-15T20:05:58.256Z; essa preparação não publicou o backend nem ativou pagamentos.

Em 2026-10-15T20:21:17.850Z, a simulação enviada pelo painel Mercado Pago foi aceita com HTTP 200 no teste corrigido https://1ca101c3.4jfinance-pix-test.pages.dev. A captura confirmou que o simulador assina o ID com as letras originais; o SDK oficial preserva esse formato, enquanto a documentação Orders também descreve minúsculas. O backend agora exige HMAC válido em uma dessas duas formas, sempre incluindo ID, request-id e timestamp, e reconsulta o pedido no provedor. Os diagnósticos temporários foram removidos. A aceitação desta simulação não comprova uma notificação espontânea após pagamento; essa etapa permanece pendente.
