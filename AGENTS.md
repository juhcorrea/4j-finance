# Instrucoes do projeto 4J Finance

- A responsavel pediu em 15/10/2026 que o GitHub seja atualizado ao concluir cada alteracao do site. Validar, revisar, criar commit e fazer push para juhcorrea/4j-finance, salvo se ela pedir explicitamente para nao enviar naquela tarefa.
- Registrar decisoes relevantes na documentacao e nas notas de memoria autorizadas, sem copiar senhas, tokens, comprovantes, dados de familiares ou registros financeiros.
- Este repositorio tem public/ como pasta publicavel. O build usa source/base.html com privacy/ e frontend/. Os arquivos historicos de work/ e snapshots/ nao sao a fonte atual.
- Preservar Montserrat, cores, Catatau e usabilidade no iPhone.
- A demonstracao ?demo=1 nao deve conectar ao Firebase. ADMIN da familia nao pode acessar outras familias; garantir isso nas regras Firestore e nos testes.
- Nao ativar anuncios ou Pix durante a sincronizacao. Aprovacao AdSense, integracao CMP e testes de pagamento continuam sendo etapas separadas.
- Nao publicar credenciais, ambientes locais, auditorias privadas, dados reais, arquivos de conta de servico nem dependencias instaladas.
- Antes do push: node scripts/check.cjs e node scripts/verify-build.cjs. Para mudancas de interface, executar testes visuais pertinentes. Nao repetir testes contra o banco real por rotina.
- Preservar historico Git; nao usar force push. Se houver alteracoes remotas, reconciliar antes de enviar. Nao sobrescrever trabalho de outra pessoa.
- Manter Netlify pausado; usar [skip netlify] na mensagem de commit. A hospedagem atual e Cloudflare Pages e somente public/ pode ser enviada.
- Publicacao Cloudflare e sincronizacao Git sao operacoes distintas; informar o resultado real de ambas sem alegar automatismo inexistente.
