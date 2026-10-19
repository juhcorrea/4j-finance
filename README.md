# 4J Finance

Estado consolidado em 19/10/2026, apos a prova final do sandbox: webhook natural autenticado e concessao automatica sem fallback, posteriormente confirmada por SELECT. A assinatura usada antes pertencia a outra aplicacao; configurar o segredo da propria aplicacao da conta vendedora de teste resolveu a autenticacao sem alterar o Worker. Ambiente de teste: https://6543501e.4jfinance-pix-test.pages.dev. A producao permanece em https://ddcb1f1f.4jfinance.pages.dev, com Pix e anuncios OFF; AdSense Preparando. O pacote de teste contem Worker e pagina de apoio, nao o frontend completo; a correcao local de consultas ainda nao foi publicada. Registros abaixo de datas/horarios anteriores sao historicos; a prova do sandbox nao equivale a pagamento real em producao.

Organizacao financeira pessoal e familiar, com receitas, despesas recorrentes, parcelas, metas, relatorios e o Catatau. Identidade visual em Montserrat, com as cores originais da marca.

**Site:** https://4jfinance.com.br/ · **Hospedagem:** Cloudflare Pages · **Login e dados:** Firebase.

## Estado em 15/10/2026

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
- Ambiente exclusivo de teste atual: https://6543501e.4jfinance-pix-test.pages.dev, alias https://4jfinance-pix-test.pages.dev. A correção de reconciliação de Pix pendente foi publicada e o smoke de status da conta já paga passou. O QA completo anterior foi aprovado no deployment a1999d42 (remote-qa ok:true). PAYMENTS_ENABLED=true somente no sandbox.
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
| cloudflare/ | Backend Pix Orders para Workers Free + D1, autenticacao e testes; ativacao em producao pendente |
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

Para preparar o ambiente Cloudflare de teste, execute node scripts/build-cloudflare.cjs --test. O script gera work/cloudflare-test/ com a saida permitida e work/cloudflare-test-deploy/wrangler.json com a configuracao de deploy. Use --cwd work/cloudflare-test-deploy no Wrangler; Pages nao aceita --config personalizado neste fluxo. Preparar o pacote nao publica nada. Veja PUBLICAR-NO-CLOUDFLARE.md.

O plano Free tem cotas: Workers, 100 mil requisicoes/dia e 10 ms de CPU/invocacao; D1, 5 milhoes de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. Ao esgotar cotas, a operacao falha; nao ha upgrade automatico autorizado. Uma amostra de webhook teve cpuTime=14; o orçamento de CPU ainda precisa ser validado com medidas adicionais. Fontes: [Workers](https://developers.cloudflare.com/workers/platform/pricing/) e [D1](https://developers.cloudflare.com/d1/platform/pricing/).

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
