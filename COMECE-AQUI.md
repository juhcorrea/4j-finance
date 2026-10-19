# 4J Finance: publicação, anúncios e Pix automático

Estado consolidado em 19/10/2026: backend de produção publicado em https://97912b74.4jfinance.pages.dev e revalidado em 19/10, com Pix e anúncios desativados. O teste 1ca101c3 aceitou a simulação do webhook com HTTP 200; assinatura verificada, notificação espontânea e pagamento real ainda pendentes. Os registros históricos abaixo descrevem etapas anteriores.

## Estado confirmado em 15/10/2026

O site está publicado no **Cloudflare Pages**, no projeto **4jfinance**, com os endereços oficiais [4jfinance.com.br](https://4jfinance.com.br) e [www.4jfinance.com.br](https://www.4jfinance.com.br) ativos com HTTPS. O endereço [4jfinance.pages.dev](https://4jfinance.pages.dev) continua disponível. Os domínios oficiais estão autorizados no Firebase Authentication.

O domínio já foi registrado e configurado. Os servidores DNS são `jacqueline.ns.cloudflare.com` e `john.ns.cloudflare.com`. Não é necessário comprar o domínio novamente, refazer a troca de DNS ou criar outro projeto Pages.

A propriedade de **4jfinance.com.br** foi verificada no AdSense e a revisão foi solicitada em **15/10/2026, às 14h05, horário de Brasília**. A mensagem de consentimento de regulamentações europeias aparece como publicada no painel do AdSense. Isso confirma a configuração no painel, mas não comprova que a mensagem esteja integrada e funcionando no site.

**Anúncios e Pix de produção permanecem desativados.** A aprovação do AdSense ainda não foi confirmada. A integração real da CMP precisa ser validada; o carregador tem uma dependência circular entre aguardar o consentimento e carregar os componentes que o disponibilizam. Essa dependência deve ser resolvida e testada antes de ativar publicidade. A preparação do Pix foi retomada com API Orders do Mercado Pago e alternativa gratuita Cloudflare Pages Functions/Workers Free + D1. A responsável recusou o Blaze; Firebase Auth e Firestore permanecem no Spark. O sandbox direto Orders aprovou o pedido de R$ 5,00 sem dinheiro real nem Firebase. O ambiente Cloudflare de teste foi publicado e recebeu a configuração protegida. A conta sintética está pronta, e o teste remoto completo da API foi aprovado: Auth, status, Pix simulado, consultas e benefício. A entrega real do webhook continua sem comprovação. O servidor de pagamento de produção não foi publicado e não houve cobrança real.

O Firebase continua responsável pelo login e pelo banco. As regras de privacidade do Firestore foram publicadas e conferidas. Passaram 38 verificações de acesso no projeto real, usando somente contas e documentos sintéticos, removidos ao terminar. A publicação estática não substitui essas regras.

O domínio oficial consta ativo na Cloudflare, com certificado Google válido. A usuária confirmou que o site abre pela rede 4G. A falha de acesso observada ficou restrita à rede corporativa: nela, a resolução DNS apontou para um servidor da empresa, que apresentou certificado de outro domínio.

## Código e próximas alterações

O repositório [juhcorrea/4j-finance](https://github.com/juhcorrea/4j-finance) será a fonte versionada deste projeto, com este pacote na raiz. Toda alteração futura do site deve incluir a atualização correspondente no GitHub, com revisão dos arquivos e validação antes do envio. Esta orientação não confirma que o envio atual já terminou e não cria uma integração automática com a Cloudflare.

A estrutura prevista é:

- `public/`: arquivos que podem ser hospedados no Cloudflare Pages.
- `source/`: base local e versionada usada para reconstruir o HTML, sem depender de arquivos em Downloads ou de caminhos pessoais da máquina.
- `marketing/`: materiais públicos de divulgação aprovados para acompanhar o projeto.
- `cloudflare/`: backend Pix Orders para Workers Free + D1, com autenticação, schema e testes.
- `functions/`: implementação Firebase Functions anterior, preservada como legado e não ativa.
- `privacy/`: regras de acesso e documentação de validação, sem dados reais de usuários.
- `build.cjs`: construção do aplicativo a partir da base em `source/` e dos módulos do projeto.

Pastas `work/` e `audit/`, backups privados, credenciais, tokens, arquivos de autenticação, logs e dados financeiros reais não entram no GitHub. Nunca envie essas pastas inteiras à hospedagem. A única saída Cloudflare autorizada para empacotamento é a pasta específica produzida pelo script, limitada aos arquivos permitidos e ao Worker compilado. Segredos existem somente na configuração protegida do servidor.

Para uma atualização, revise as alterações, reconstrua os arquivos públicos, execute as verificações relevantes e atualize o GitHub. A publicação estática usa somente `public/`; o ambiente com API usa o pacote específico gerado pelo empacotador Cloudflare. Publicar código e ativar Pix são operações separadas, dentro do escopo autorizado. Confirme o destino e o resultado antes de registrar uma publicação. O envio ao GitHub, por si só, não publica uma nova versão na Cloudflare; nenhuma automação de publicação está confirmada neste guia. Veja `PUBLICAR-NO-CLOUDFLARE.md`.

## AdSense e consentimento

A metatag de verificação e o arquivo `public/ads.txt` estão publicados no domínio oficial. As páginas Sobre, Guia, Privacidade e Contato incluem navegação pública, a identidade visual do 4J Finance e conteúdo de uso com exemplos fictícios. Essas páginas e o pedido de revisão não garantem a aprovação do Google. Os registros financeiros dos usuários não devem ser expostos ao robô de anúncios.

A mensagem de regulamentações europeias já foi publicada no painel do AdSense. Antes da ativação, falta:

1. Confirmar a aprovação do site no AdSense.
2. Resolver a dependência circular do carregador e integrar a CMP real sem exigir previamente um sinal que só pode existir depois que a própria CMP carregar.
3. Verificar a mensagem e os sinais de consentimento no site, incluindo consentir, recusar, gerenciar opções, revogar e o comportamento em diferentes regiões.
4. Confirmar que a sessão e o benefício da conta são consultados antes de qualquer publicidade; em caso de falha, a exibição deve permanecer bloqueada.
5. Somente após as verificações, habilitar as configurações necessárias, publicar e testar no computador e no celular.

**O script de anúncios automáticos não foi colocado dentro do painel financeiro privado.** O carregador `public/public-ads.js` está preparado somente para o guia público e continua desativado. Para usuários autenticados, ele consulta o benefício no servidor e bloqueia anúncios se a consulta falhar ou se a conta tiver o benefício sem anúncios. As três flags de ativação continuam falsas.

As preferências locais de cookies oferecem aceite, recusa, personalização e revogação. Essa interface própria não é uma CMP certificada pelo Google. A publicação da mensagem no painel também não substitui o teste de integração. Consulte `ADSENSE-PREPARACAO.txt` antes de ativar publicidade. A política de privacidade deve continuar refletindo o uso real de Firebase, Mercado Pago e Google Ads, sem prometer práticas ainda não implementadas.

Fontes: [conectar o site ao AdSense](https://support.google.com/adsense/answer/12169212?hl=pt-BR), [preparar conteúdo e navegação](https://support.google.com/adsense/answer/7299563?hl=pt-BR).

## Pix automático — preparação implementada, ativação em produção pendente

A opção implementada é **R$ 5,00 uma única vez por conta**, com retirada permanente de todos os anúncios AdSense do 4J Finance para o **UID comprador** após confirmação válida do Mercado Pago. Não há mensalidade nem renovação. Outros logins, inclusive da mesma família, não herdam a compra.

O caminho preparado é: entrar na conta → escolher retirar anúncios → confirmar o preço → gerar o Pix → pagar no aplicativo bancário → Mercado Pago confirmar → conta receber o benefício automaticamente. O checkout **não solicita CPF**; a integração Orders utiliza o e-mail da conta autenticada no servidor. O navegador envia um pedido vazio de criação e não define valor, favorecido ou beneficiário.

O servidor reserva um pedido antes de solicitar a cobrança e mantém a chave de idempotência da tentativa. Pedidos existentes são reutilizados e podem ser retomados após fechar a janela ou recarregar a página. Quando o provedor ainda está gerando o QR, a interface aguarda e consulta o mesmo pedido; não cria outra cobrança para obter o código. Falha de consulta não libera um novo pagamento, e um pedido encerrado exige ação explícita antes de preparar outro Pix.

A chave Pix comum não substitui as credenciais da API. A chave de recebimento não foi incluída nos arquivos. Um clique, comprovante enviado pelo usuário ou alteração no navegador nunca são suficientes para liberar o benefício. As credenciais privadas e a assinatura do webhook pertencem à configuração protegida do servidor, conforme `cloudflare/CONFIGURAR.md`. O backend Firebase Functions anterior permanece guardado em `functions/`, sem ativação.

A preparação foi validada com testes sintéticos de lógica e de interface, incluindo criação, processamento sem QR, retomada, confirmação, bloqueio de novas cobranças, troca de conta e respostas tardias. A fixture `qa/pix-checkout.test.cjs` cobre larguras de celular e computador sem Firebase ou Mercado Pago reais. Isso não comprova recebimento financeiro, entrega do webhook real ou funcionamento em um iPhone físico.

Em uma validação separada, o teste direto da API Orders no sandbox do Mercado Pago passou: o pedido de R$ 5,00 foi confirmado como aprovado, com status processed/accredited. Não houve movimentação de dinheiro real, o Firebase não foi acessado e o webhook não foi verificado. Esse resultado valida a chamada direta ao provedor em teste; a integração completa ainda precisa ser concluída.

**Escolha atual:** a consulta anterior de faturamento retornou `billingEnabled:false`. A responsável recusou a adesão ao Blaze e solicitou uma alternativa gratuita. A implementação passou para Cloudflare Pages Functions/Workers Free + D1, mantendo Firebase no Spark. Nenhum plano pago foi ativado. O transporte Cloudflare é configurável na mesma origem, usa o token Firebase da sessão e consulta o benefício no servidor/D1, sem concedê-lo por custom claims antigas ou resposta incerta.

Historicamente, o ambiente exclusivo de teste [4jfinance-pix-test.pages.dev](https://4jfinance-pix-test.pages.dev) foi publicado no deployment inicial `7ac93e50`. A verificação inicial encontrou `/api/pix/health` com HTTP 200 e `backendReady:false`, e GET em `/api/pix/mercadoPagoWebhook` com HTTP 405, pois o webhook aceita POST. Isso prova a presença das rotas, não o processamento de um webhook. O projeto Firebase de teste é `fjfinance-pix-test`; o banco D1 separado foi criado e recebeu o schema em nove comandos. Não foram acessados dados financeiros de produção.

A configuração protegida do ambiente de teste foi concluída em 2026-10-15T19:13:32.529Z, após corrigir o wrapper para Windows PowerShell 5.1. O helper enviou os valores por memória, sem gravar credenciais em arquivos locais; o relatório contém somente o resultado seguro. A correção passou em três testes, cobrindo sete execuções sintéticas, sem acesso ao helper real nesses testes.

Deployment anterior de teste, verificado antes da conclusão do fluxo remoto: https://429f9a18.4jfinance-pix-test.pages.dev, com alias https://4jfinance-pix-test.pages.dev. GET /api/pix/health retornou HTTP 200 com backendReady:true. Uma chamada à API sem autenticação retornou HTTP 401 com erro seguro. PAYMENTS_ENABLED está true exclusivamente no sandbox; Pix de produção e anúncios continuam desligados. O servidor Pix de produção ainda não foi publicado.

Naquela etapa, o provedor de autenticação de teste estava ativo (GET HTTP 200), mas a conta sintética ainda estava em correção e o teste completo não havia sido executado. Esse estado foi superado pelo resultado remoto abaixo.

O teste remoto da API Cloudflare passou em 2026-10-15T19:25:58.017Z (remote-qa ok:true), no deployment https://a1999d42.4jfinance-pix-test.pages.dev, com alias https://4jfinance-pix-test.pages.dev. O fluxo validou autenticação, consulta de status, criação de Pix simulado de R$ 5, duas consultas do mesmo UUID de pedido e resultado final adFreeLifetime:true. Não houve cobrança financeira real.

A conta sintética do Firebase de teste está pronta, com Auth e Firestore no Spark; billingEnabled:false foi confirmado. PAYMENTS_ENABLED=true permanece exclusivo do sandbox. Pix de produção e anúncios continuam desligados; o servidor Pix de produção não foi publicado.

A entrega real do webhook ainda não está comprovada: realWebhookDeliveryVerified:false. O histórico de notificações do Mercado Pago está sendo consultado. O resultado aprovado acima veio do fluxo autenticado da API e das consultas do pedido; não deve ser apresentado como prova de entrega do webhook.

A compatibilidade de redirecionamentos Google/Mercado Pago foi corrigida com tratamento manual e reproduzida no runtime Workerd. Os recortes de 42 testes de autenticação e 25 de cobrança foram aprovados; a suíte consolidada final ainda será executada e não recebe total neste registro.

Para concluir a integração, ainda é necessário:

1. Preservar a conta sintética e a configuração protegida do ambiente de teste para as verificações restantes. Auth, status, criação, consultas do pedido e benefício já passaram no teste remoto; segredos permanecem fora de mensagens, Git e arquivos públicos.
2. Configurar no Mercado Pago Developers a URL HTTPS do ambiente de teste, terminada em `/api/pix/mercadoPagoWebhook`, com evento **Order (Mercado Pago)**. Confirmar assinatura, consulta autenticada da order e vínculo privado antes de conceder o benefício.
3. Concluir a suíte consolidada e as verificações adicionais de concorrência, retomada, outra conta, reembolso, indisponibilidade e interface em dispositivo real. O teste remoto da API aprovado não comprova esses cenários adicionais nem entrega real do webhook.
4. Medir CPU no runtime remoto e consumo D1. Verificar que falhas de serviço ou de cota mantêm a API e os anúncios bloqueados. Preservar o plano gratuito, sem upgrade automático.
5. O servidor de produção já está publicado com PAYMENTS_ENABLED=false. Concluir a validação de consumo e do pagamento real antes de habilitar o checkout para o público; Pix real e anúncios continuam desligados. Validar também em um iPhone físico.

Para preparar o pacote de teste, execute `node scripts/build-cloudflare.cjs --test`. A saída fica em `work/cloudflare-test/`; a configuração gerada fica em `work/cloudflare-test-deploy/wrangler.json`. O Wrangler deve usar `--cwd work/cloudflare-test-deploy`, sem `--config` personalizado para Pages. O pacote inclui apenas a lista permitida, `_worker.js` e `_routes.json`; nunca publique `work/` inteiro. A configuração requer `nodejs_compat`. Consulte `PUBLICAR-NO-CLOUDFLARE.md`.

As cotas documentadas do plano Free são 100 mil requisições/dia e 10 ms de CPU por invocação no Worker; D1 permite 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. Atingir a cota produz falha, não adesão automática a plano pago. A gratuidade da infraestrutura dentro dessas cotas não elimina eventuais tarifas do Mercado Pago.

Fontes: [Pix com a API Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix), [modelo de integração Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-model), [webhook e evento Order](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications), [teste de Pix em Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix), [cotas Workers Free](https://developers.cloudflare.com/workers/platform/pricing/), [cotas e falhas D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Privacidade publicada

As regras reais foram consultadas, salvas em backup privado e substituídas em 15/10/2026. A versão publicada foi conferida contra `privacy/firestore.rules`, já testada no emulador. A regra antiga que permitia acesso global a contas aprovadas foi removida. A interface consulta somente perfis próprios ou compartilhados. O isolamento passou em 38 verificações no projeto real com dados sintéticos, sem consultar lançamentos financeiros reais.

Cadastros novos entram como Membro ativo. Suspensões de contas existentes não são automaticamente anuladas. Compartilhamentos por e-mail exigem confirmação do endereço. Ser administrador da plataforma não concede acesso automático às finanças de outras famílias.

O proprietário do projeto Firebase/Google Cloud continua tendo poderes técnicos de administração conforme IAM. Isso é diferente de ser ADMIN dentro do site. Esta solução não implementa criptografia ponta a ponta que impeça o operador do serviço de ler o banco.

As regras são publicadas separadamente da hospedagem e devem continuar sendo atualizadas de forma coordenada com o aplicativo. Antes de mudanças de acesso, use dados de teste e verifique os limites entre contas e famílias.

Fonte: [regras de acesso e privilégios de servidor](https://firebase.google.com/docs/firestore/solutions/role-based-access).

## Entrega e validação

- `public/index.html`: aplicativo atualizado; o arquivo original em Downloads foi preservado.
- `public/sobre.html`, `public/guia.html`, `public/privacidade.html` e `public/contato.html`: páginas públicas com navegação e atendimento.
- `cloudflare/`: backend gratuito preparado; configuração em `cloudflare/CONFIGURAR.md`.
- `functions/`: implementação Firebase legada, preservada e não ativa.
- `privacy/firestore.rules`: regras completas testadas e publicadas.
- `privacy/VERIFICACAO.txt`: evidências e limites dos testes de privacidade.

A preparação registrou 136 verificações locais e 38 verificações de acesso no projeto real, todas com dados de teste. Esses resultados históricos não substituem testes depois de novas alterações. As contas e os documentos sintéticos foram removidos. O pagamento Mercado Pago e a integração de consentimento real ainda requerem configuração e teste de ponta a ponta.

A página de privacidade inclui o contato autorizado. Revise-a na ativação: identidade do responsável, retenção e direitos dos usuários precisam corresponder à operação real.

## Acesso pelo site antigo

Use [4jfinance.com.br](https://4jfinance.com.br) com o mesmo e-mail. O banco Firebase continua sendo o mesmo. O HTML antigo do Netlify faz uma consulta global de perfis para ADMIN, incompatível com as regras atuais; por isso pode mostrar a lista vazia. Essa falha de consulta não significa exclusão de registros. A interface publicada no Cloudflare consulta apenas perfis próprios ou compartilhados explicitamente.

**O Netlify não foi atualizado, desbloqueado nem teve a publicação automática reativada.** A sincronização do GitHub deve preservar essa condição; ela não autoriza reativar o site antigo.

Atualização de teste em 2026-10-15T19:47:56.461Z: a correção que reconcilia o Pix pendente na consulta de status foi publicada em https://c685b5c9.4jfinance-pix-test.pages.dev, com o alias de teste preservado. Health HTTP 200 confirmou backendReady:true; a consulta autenticada da conta sintética já paga retornou adFreeLifetime:true e pendingOrderId:null. Nenhuma nova cobrança foi criada. O relatório completo anterior, do deployment a1999d42, foi preservado. Este smoke não comprova entrega real de webhook; PAYMENTS_ENABLED continua true somente no sandbox.

Em 2026-10-15T20:21:17.850Z, a simulação enviada pelo painel Mercado Pago foi aceita com HTTP 200 no teste corrigido https://1ca101c3.4jfinance-pix-test.pages.dev. A captura confirmou que o simulador assina o ID com as letras originais; o SDK oficial preserva esse formato, enquanto a documentação Orders também descreve minúsculas. O backend agora exige HMAC válido em uma dessas duas formas, sempre incluindo ID, request-id e timestamp, e reconsulta o pedido no provedor. Os diagnósticos temporários foram removidos. A aceitação desta simulação não comprova uma notificação espontânea após pagamento; essa etapa permanece pendente.
