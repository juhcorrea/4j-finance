# 4J Finance

Organizacao financeira pessoal e familiar, com receitas, despesas recorrentes, parcelas, metas, relatorios e o Catatau. Identidade visual em Montserrat, com as cores originais da marca.

**Site:** https://4jfinance.com.br/ · **Hospedagem:** Cloudflare Pages · **Login e dados:** Firebase.

## Estado em 15/10/2026

- Dominio oficial e www com HTTPS ativos; dominio autorizado no Firebase Authentication.
- Cadastro aberto e compartilhamento opcional. Administrar uma familia nao concede acesso financeiro a outras familias.
- Paginas publicas e preferencias de cookies publicadas.
- AdSense: propriedade verificada e revisao solicitada em 15/10 as 14h05 (America/Sao_Paulo); aprovacao ainda pendente.
- Mensagem Google CMP publicada no painel. Integracao e exibicao real no site ainda precisam ser concluidas e testadas; veja ADSENSE-PREPARACAO.txt.
- **Anuncios e Pix desativados.** O plano futuro e R$ 5 em pagamento unico, com beneficio permanente para a conta compradora.
- O Netlify anterior permanece pausado. Atualizar este repositorio nao publica o site automaticamente no Cloudflare.

## Estrutura atual

| Caminho | Conteudo |
| --- | --- |
| public/ | Unicos arquivos destinados a hospedagem estatica |
| source/base.html | Fonte de entrada anterior as transformacoes; nunca hospedar diretamente |
| frontend/ | Modulos de interface e testes de consentimento/monetizacao |
| privacy/ | Transformacoes, regras Firestore e testes de isolamento |
| functions/ | Integracao Pix preparada, desativada e sem credenciais |
| qa/ | Testes de navegador com dados sinteticos |
| scripts/ | Validacao, reproducao do build e sincronizacao do workspace |
| marketing/ | Portfolio, seis videos, posts, stories, carrossel, legendas e ativos finais |
| branding/ | Logotipo PNG preparado para a mensagem AdSense |
| 4j-finance-portfolio-compartilhar.html | Portfolio em arquivo unico, com imagens, fonte e videos incorporados |

index.html e outputs/index.html sao copias de compatibilidade do HTML atual. Os arquivos anteriores em work/ e snapshots/ foram preservados para consulta historica; nao sao a fonte atual nem devem ser publicados. O historico de commits conserva as versoes anteriores.

## Validar e reconstruir

Requer Node.js 22 ou superior. Os testes de logica usam apenas os modulos nativos do Node:

~~~sh
node scripts/check.cjs
node scripts/verify-build.cjs
node build.cjs
~~~

O build usa source/base.html e os modulos locais, sem depender da pasta Downloads. verify-build compara o resultado em uma pasta temporaria com public/index.html, sem alterar a entrega publicada.

Para os testes visuais, instale as dependencias com pnpm install --frozen-lockfile, execute pnpm exec playwright install chromium e pnpm test:ui. Opcionalmente, PLAYWRIGHT_EXECUTABLE_PATH seleciona outro Chromium instalado. Os testes de regras usam o emulador e dependencias de privacy/; nao executar testes contra dados reais sem escopo explicito.

## Manter atualizado

Ao concluir uma alteracao do 4J Finance: validar, revisar o diff, criar um commit e enviar ao GitHub. Essa e a preferencia permanente definida pela responsavel pelo projeto. Consulte AGENTS.md e docs/SINCRONIZACAO.md.

A workflow de verificacao executa testes de logica e reproducao do build; nao faz deploy, nao acessa contas Firebase e nao gera pagamentos. Configuracoes feitas nos paineis externos sao registradas na documentacao. Segredos, tokens, auditorias privadas e dados financeiros ficam fora do Git.

Veja COMECE-AQUI.md, PUBLICAR-NO-CLOUDFLARE.md e ADSENSE-PREPARACAO.txt para operacao e pendencias.
