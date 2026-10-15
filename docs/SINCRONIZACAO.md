# Sincronizacao com GitHub

Repositorio: https://github.com/juhcorrea/4j-finance

Preferencia registrada em 15/10/2026: ao concluir alteracoes do site feitas com o assistente, atualizar tambem o GitHub. Isso faz parte da entrega de cada tarefa; nao e um monitor de arquivos em segundo plano.

No workspace da responsavel, o pacote 4j-finance-monetizacao/ e a fonte de trabalho atual. O kit final esta em 4j-finance-marketing-2026-10/. A copia Git usada para sincronizar fica em work/github-sync/4j-finance/. O script abaixo copia apenas os arquivos permitidos e gera sync-manifest.json com hashes relativos, sem caminhos pessoais:

~~~sh
node work/github-sync/4j-finance/scripts/sync-workspace.cjs .
~~~

Depois, na copia Git:

~~~sh
node scripts/check.cjs
node scripts/verify-build.cjs
git diff --stat
git status --short
git add --all
git commit -m "Descrever o ajuste do 4J Finance [skip netlify]"
git push origin main
~~~

Antes de sincronizar, verificar se a copia Git tem alteracoes de outra tarefa ou commits remotos; nao sobrescreve-los. O script nunca faz push sozinho. Validar exclusoes e arquivos novos, especialmente se foi adicionada uma integracao externa. Arquivos removidos da origem sao sinalizados para reconciliacao manual, sem apagar silenciosamente a copia versionada.

Para uma tarefa iniciada diretamente neste repositorio, editar os arquivos daqui e usar o mesmo fluxo de verificacao/commit/push, sem chamar o importador do workspace. Registrar onde a alteracao foi feita para evitar duas fontes divergentes.

Nao enviar .env, tokens, contas de servico, auditorias, dados reais ou node_modules. .env.example contem apenas nomes e exemplos de configuracao. Configuracao publica Firebase e identificador AdSense do site nao sao credenciais administrativas.

A hospedagem usa upload direto no Cloudflare Pages. GitHub armazena o historico e roda verificacoes, mas nao foi configurada publicacao automatica nem copiada a credencial do Wrangler. O Netlify antigo continua pausado; netlify.toml ignora novos builds pelo Git e as mensagens de commit incluem [skip netlify].
