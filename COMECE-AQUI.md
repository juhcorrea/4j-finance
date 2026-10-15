# 4J Finance: publicação, anúncios e Pix automático

## Estado confirmado em 15/10/2026

O site está publicado no **Cloudflare Pages**, no projeto **4jfinance**, com os endereços oficiais [4jfinance.com.br](https://4jfinance.com.br) e [www.4jfinance.com.br](https://www.4jfinance.com.br) ativos com HTTPS. O endereço [4jfinance.pages.dev](https://4jfinance.pages.dev) continua disponível. Os domínios oficiais estão autorizados no Firebase Authentication.

O domínio já foi registrado e configurado. Os servidores DNS são `jacqueline.ns.cloudflare.com` e `john.ns.cloudflare.com`. Não é necessário comprar o domínio novamente, refazer a troca de DNS ou criar outro projeto Pages.

A propriedade de **4jfinance.com.br** foi verificada no AdSense e a revisão foi solicitada em **15/10/2026, às 14h05, horário de Brasília**. A mensagem de consentimento de regulamentações europeias aparece como publicada no painel do AdSense. Isso confirma a configuração no painel, mas não comprova que a mensagem esteja integrada e funcionando no site.

**Anúncios e Pix permanecem desativados.** A aprovação do AdSense ainda não foi confirmada. A integração real da CMP precisa ser validada; o carregador tem uma dependência circular entre aguardar o consentimento e carregar os componentes que o disponibilizam. Essa dependência deve ser resolvida e testada antes de ativar publicidade. O Pix foi adiado a pedido da responsável pelo site; nenhuma cobrança real foi realizada.

O Firebase continua responsável pelo login e pelo banco. As regras de privacidade do Firestore foram publicadas e conferidas. Passaram 38 verificações de acesso no projeto real, usando somente contas e documentos sintéticos, removidos ao terminar. A publicação estática não substitui essas regras.

## Código e próximas alterações

O repositório [juhcorrea/4j-finance](https://github.com/juhcorrea/4j-finance) será a fonte versionada deste projeto, com este pacote na raiz. Toda alteração futura do site deve incluir a atualização correspondente no GitHub, com revisão dos arquivos e validação antes do envio. Esta orientação não confirma que o envio atual já terminou e não cria uma integração automática com a Cloudflare.

A estrutura prevista é:

- `public/`: arquivos que podem ser hospedados no Cloudflare Pages.
- `source/`: base local e versionada usada para reconstruir o HTML, sem depender de arquivos em Downloads ou de caminhos pessoais da máquina.
- `marketing/`: materiais públicos de divulgação aprovados para acompanhar o projeto.
- `functions/`: código das funções de pagamento, publicado separadamente quando a integração for autorizada e validada.
- `privacy/`: regras de acesso e documentação de validação, sem dados reais de usuários.
- `build.cjs`: construção do aplicativo a partir da base em `source/` e dos módulos do projeto.

Pastas `work/` e `audit/`, backups privados, credenciais, tokens, arquivos de autenticação, logs, dados financeiros reais e outros segredos **nunca devem entrar no GitHub nem na hospedagem pública**. O código das funções pode ser versionado, mas os valores secretos devem existir apenas na configuração protegida do servidor.

Para uma atualização, revise as alterações, reconstrua os arquivos públicos, execute as verificações relevantes, atualize o GitHub e publique somente `public/` no projeto Pages existente. Confirme depois o resultado no domínio oficial. O envio ao GitHub, por si só, não publica uma nova versão na Cloudflare; nenhuma automação de publicação está confirmada neste guia. Veja `PUBLICAR-NO-CLOUDFLARE.md`.

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

## O Pix automático — etapa adiada

A opção planejada é **R$5 uma única vez por conta**, com retirada permanente de todos os anúncios AdSense do 4J Finance para essa mesma conta após confirmação do Mercado Pago. Não há renovação mensal. Outros logins não herdam a compra.

O caminho de compra será: entrar na conta → escolher retirar anúncios → gerar cobrança de R$5 → pagar o Pix → Mercado Pago confirmar → conta receber o benefício. O navegador exibirá o QR Code e o Pix Copia e Cola; o usuário normalmente abrirá seu aplicativo bancário para pagar. Funções do Firebase consultarão o Mercado Pago e registrarão o benefício.

A chave Pix comum não substitui as credenciais da API. A chave de recebimento não foi incluída nos arquivos. O botão de consultar pagamento apenas consulta o provedor. Um clique, comprovante enviado pelo usuário ou alteração no navegador nunca são suficientes para liberar o benefício.

Quando a etapa de pagamento for retomada:

1. Acesse Mercado Pago Developers → Suas integrações com a conta que receberá os valores e configure a aplicação do 4J Finance para pagamentos online.
2. Configure as credenciais privadas e a assinatura de Webhooks **no servidor**, conforme `functions/CONFIGURAR.md`. Não cole tokens no HTML, em mensagens, no Git ou em arquivos públicos.
3. Use um projeto Firebase separado para testes. Configure as regras de privacidade e os bloqueios das coleções de cobrança antes de testar.
4. Publique as funções no projeto de teste. Cadastre no Mercado Pago a URL retornada para `mercadoPagoWebhook`, com eventos de pagamento. A URL exata depende da publicação das funções.
5. Teste pagamento pendente, aprovado, tentativa repetida, acesso por outra conta e reembolso. Confirme que um pagamento só libera o login comprador.
6. Depois de validar todo o fluxo e autorizar os custos necessários, configure a produção e habilite o checkout. As instruções finais ficam em `functions/CONFIGURAR.md`.

As funções Firebase requerem o plano Blaze e podem gerar custos conforme o uso; a publicação do HTML não habilita pagamentos nem autoriza uma mudança de plano. Taxas do provedor e custos de infraestrutura são separados do preço de R$5. Confira as condições antes de habilitar vendas.

Fontes: [Pix no Checkout Transparente](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix?scope=prod), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks), [requisitos das funções Firebase](https://firebase.google.com/docs/functions/get-started).

## Privacidade publicada

As regras reais foram consultadas, salvas em backup privado e substituídas em 15/10/2026. A versão publicada foi conferida contra `privacy/firestore.rules`, já testada no emulador. A regra antiga que permitia acesso global a contas aprovadas foi removida. A interface consulta somente perfis próprios ou compartilhados. O isolamento passou em 38 verificações no projeto real com dados sintéticos, sem consultar lançamentos financeiros reais.

Cadastros novos entram como Membro ativo. Suspensões de contas existentes não são automaticamente anuladas. Compartilhamentos por e-mail exigem confirmação do endereço. Ser administrador da plataforma não concede acesso automático às finanças de outras famílias.

O proprietário do projeto Firebase/Google Cloud continua tendo poderes técnicos de administração conforme IAM. Isso é diferente de ser ADMIN dentro do site. Esta solução não implementa criptografia ponta a ponta que impeça o operador do serviço de ler o banco.

As regras são publicadas separadamente da hospedagem e devem continuar sendo atualizadas de forma coordenada com o aplicativo. Antes de mudanças de acesso, use dados de teste e verifique os limites entre contas e famílias.

Fonte: [regras de acesso e privilégios de servidor](https://firebase.google.com/docs/firestore/solutions/role-based-access).

## Entrega e validação

- `public/index.html`: aplicativo atualizado; o arquivo original em Downloads foi preservado.
- `public/sobre.html`, `public/guia.html`, `public/privacidade.html` e `public/contato.html`: páginas públicas com navegação e atendimento.
- `functions/`: código das funções, com configuração separada em `CONFIGURAR.md`.
- `privacy/firestore.rules`: regras completas testadas e publicadas.
- `privacy/VERIFICACAO.txt`: evidências e limites dos testes de privacidade.

A preparação registrou 136 verificações locais e 38 verificações de acesso no projeto real, todas com dados de teste. Esses resultados históricos não substituem testes depois de novas alterações. As contas e os documentos sintéticos foram removidos. O pagamento Mercado Pago e a integração de consentimento real ainda requerem configuração e teste de ponta a ponta.

A página de privacidade inclui o contato autorizado. Revise-a na ativação: identidade do responsável, retenção e direitos dos usuários precisam corresponder à operação real.

## Acesso pelo site antigo

Use [4jfinance.com.br](https://4jfinance.com.br) com o mesmo e-mail. O banco Firebase continua sendo o mesmo. O HTML antigo do Netlify faz uma consulta global de perfis para ADMIN, incompatível com as regras atuais; por isso pode mostrar a lista vazia. Essa falha de consulta não significa exclusão de registros. A interface publicada no Cloudflare consulta apenas perfis próprios ou compartilhados explicitamente.

**O Netlify não foi atualizado, desbloqueado nem teve a publicação automática reativada.** A sincronização do GitHub deve preservar essa condição; ela não autoriza reativar o site antigo.
