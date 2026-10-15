# Publicar o 4J Finance no Cloudflare Pages

A hospedagem atual usa Cloudflare Pages para os arquivos públicos e Firebase para autenticação e dados. A futura integração Mercado Pago usará Firebase Functions e continua adiada. A fonte Montserrat, as cores e o Catatau são preservados nas atualizações do site.

## Estado confirmado em 15/10/2026

Projeto Pages: **4jfinance**.

- Endereço oficial: [4jfinance.com.br](https://4jfinance.com.br).
- Endereço com www: [www.4jfinance.com.br](https://www.4jfinance.com.br).
- Endereço do Pages: [4jfinance.pages.dev](https://4jfinance.pages.dev).
- Domínio registrado e DNS configurado com `jacqueline.ns.cloudflare.com` e `john.ns.cloudflare.com`.
- Domínio raiz e www ativos no Pages, com HTTPS validado.
- Os dois domínios oficiais estão autorizados no Firebase Authentication, preservando os domínios anteriores.
- Regras completas do Firestore publicadas e conferidas; 38 verificações de acesso passaram com contas e dados sintéticos, removidos ao concluir.
- Propriedade do domínio oficial verificada no AdSense; revisão solicitada em **15/10/2026, às 14h05, horário de Brasília**.
- Mensagem de regulamentações europeias publicada no painel do AdSense; a integração real da CMP no site ainda não foi validada.

**Pix e anúncios continuam desativados.** A aprovação do AdSense ainda não foi confirmada. Há uma dependência circular no carregador entre aguardar o consentimento e carregar seus componentes; ela precisa ser resolvida e testada antes da ativação. O Pix foi adiado e seu guia permanece em `functions/CONFIGURAR.md`.

O registro do domínio, a conexão com o Pages, a troca de DNS e a autorização no Firebase já foram concluídos. Não repita essas operações para atualizar o conteúdo do site. Redirecionamentos entre os endereços só devem ser descritos como ativos depois de verificados; a ativação de ambos não comprova um redirecionamento automático.

## GitHub e estrutura do projeto

O repositório [juhcorrea/4j-finance](https://github.com/juhcorrea/4j-finance) será a fonte versionada, com o pacote na raiz:

- `public/` contém os únicos arquivos destinados à hospedagem estática.
- `source/` contém a base usada para reconstruir o aplicativo sem caminhos particulares da máquina.
- `marketing/` reúne os materiais públicos de divulgação.
- `functions/` e `privacy/` contêm código e regras com publicação separada.

A cada alteração do site, atualize também o GitHub com os arquivos correspondentes e as verificações relevantes. O envio atual deve ser confirmado por commit e resultado do push; este documento não afirma que ele já terminou.

Não versione nem publique `work/`, `audit/`, backups privados, credenciais, tokens, arquivos de autenticação, logs ou dados reais dos usuários. Segredos das funções pertencem à configuração protegida do servidor, nunca ao HTML ou ao repositório.

O projeto Pages usa publicação direta. **Enviar ao GitHub não publica automaticamente na Cloudflare.** Nenhuma integração automática foi confirmada. Uma eventual automação exige configuração própria e validação; não a presuma a partir da existência do repositório.

## Atualizar os arquivos

1. Revise as alterações na fonte e nos módulos; execute `build.cjs` para reconstruir o aplicativo a partir da base versionada em `source/`.
2. Confira os arquivos públicos gerados e execute as verificações apropriadas à alteração. Preserve o modo de demonstração sem conexão ao Firebase e o isolamento das contas.
3. Revise o conjunto que irá para o GitHub e confirme a ausência de segredos, backups, registros pessoais e arquivos temporários. Registre a alteração e envie para o repositório; confira o resultado do envio.
4. Abra Workers & Pages na Cloudflare e selecione o projeto existente **4jfinance**. Use o fluxo de publicação direta existente para uma nova versão de produção.
5. Envie somente o conteúdo de `public/`, ou um ZIP de publicação conferido que contenha esses arquivos com `index.html` na raiz. Nunca envie o ZIP completo do código, `source/`, `marketing/`, `functions/`, `privacy/`, `work/` ou `audit/` para a hospedagem estática.
6. Confirme o projeto **4jfinance** como destino. Não crie outro projeto para cada atualização e não altere os registros DNS apenas para trocar o HTML.
7. Depois da publicação, verifique o endereço oficial por HTTPS e as rotas `/sobre`, `/guia`, `/privacidade`, `/contato` e `/ads.txt`. Confira login, cadastro e links conforme a alteração, usando contas de teste quando necessário.
8. Compare o que foi publicado com a versão enviada ao GitHub e registre o resultado sem incluir dados pessoais ou segredos. O arquivo `public/_headers` aplica os cabeçalhos previstos no Pages.

Se usar um ZIP já existente, confira se ele corresponde à versão atual. Um ZIP antigo não é atualizado automaticamente quando os arquivos do projeto mudam.

## Próximas etapas do AdSense

A metatag e o `ads.txt` já estão publicados e a revisão já foi solicitada para o domínio oficial. Aguarde a decisão no painel do AdSense; verificar a propriedade e publicar uma mensagem de consentimento não garantem aprovação dos anúncios.

Antes de ativar publicidade, resolva a dependência circular do carregador, integre a CMP e teste consentimento, recusa, revogação, sessão e benefício sem anúncios. As preferências locais de cookies não equivalem a uma CMP certificada. A mensagem publicada no painel só deve ser considerada funcionando após teste no site.

As três flags de anúncios continuam falsas. O carregador está preparado apenas para o guia público; o painel financeiro privado não recebeu anúncios automáticos. Consulte `ADSENSE-PREPARACAO.txt` e `COMECE-AQUI.md` antes da ativação.

## O que continua separado

Os dados não migraram para Cloudflare: o aplicativo continua usando o projeto Firebase configurado. A pasta `functions/` deste pacote não é um conjunto de Pages Functions. Publicar HTML na Cloudflare não publica regras do Firestore, não instala funções de pagamento e não ativa a confirmação de Pix.

Domínio, banco, funções e taxas do Mercado Pago têm condições próprias. Na arquitetura preparada, publicar as Firebase Functions requer o plano Blaze, que pode gerar custos conforme o uso. A mudança de plano e a ativação de pagamentos ainda dependem da retomada e autorização dessa etapa.

O plano futuro sem anúncios permanece **R$5 uma única vez por conta**, com benefício permanente após confirmação do servidor para o login comprador. Enquanto o fluxo de cobrança não estiver configurado e validado, mantenha o Pix desligado.

**O site antigo do Netlify não foi alterado e sua publicação automática não foi reativada.** Mantenha essa condição ao sincronizar o GitHub. O endereço oficial atual é servido pelo Cloudflare Pages.

## Fontes oficiais

- [Upload direto no Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Limites do Pages](https://developers.cloudflare.com/pages/platform/limits/)
- [Domínios próprios](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Firebase Functions e plano Blaze](https://firebase.google.com/docs/functions/get-started)
- [Conectar o site ao AdSense](https://support.google.com/adsense/answer/12169212?hl=pt-BR)
