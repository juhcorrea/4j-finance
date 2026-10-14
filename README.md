# 4J Finance

Backup privado dos arquivos originais locais, organizado em 14/10/2026.

**A versão final foi indicada expressamente pela usuária: `C:/Users/juliana.correa/Downloads/index.html`.** Esse arquivo foi copiado byte a byte para `index.html` na raiz e para `outputs/index.html`, sem reconstrução nem alterações. Os dois têm o mesmo SHA-256 registrado em `source-manifest.json`.

Este backup não altera o site já publicado no Netlify, as regras ativas do Firebase nem os dados das contas.

## Arquivo final

- `index.html`: versão final confirmada, preservada como arquivo estático.
- `outputs/index.html`: cópia idêntica da versão final, mantendo a estrutura da prévia local.
- `source-manifest.json`: origem, destino, tamanho e SHA-256 de cada arquivo original copiado; a seção `authoritativeFinal` identifica a decisão da usuária.

O HTML final inclui recursos visuais em dados incorporados. A conferência de referências não encontrou arquivos locais auxiliares ausentes. O navegador ainda utiliza serviços e bibliotecas externos, incluindo Google Fonts, Firebase e cdnjs; os dados e a autenticação dependem dos serviços configurados no aplicativo. A configuração pública do SDK web Firebase existente foi preservada.

## Fontes e versões históricas

Os arquivos abaixo são mantidos para recuperar o trabalho anterior. **Eles não são os fontes comprovados da versão final confirmada acima.**

- `work/oct08/`: fontes editáveis históricos, montador, módulos, testes e documentação técnica.
- `snapshots/previous-local-output/index.html`: antigo HTML de entrega da pasta de trabalho, antes da indicação do arquivo final.
- `snapshots/downloads/index.html`: versão anterior encontrada em `Downloads/4J Finance/index.html`; é um arquivo diferente do final `Downloads/index.html`.
- `work/privacy/`: fontes e testes de privacidade e grupos familiares, preservados como rascunhos. Sua presença não comprova integração, validação ou publicação.
- `work/4j-finance/dist/assets/`: imagens originais da marca, do ícone e do Catatau.

O antigo HTML de entrega foi salvo em 09/10/2026 às 03:30 (São Paulo), enquanto o script editável principal e os rascunhos de privacidade foram alterados depois. A versão histórica da subpasta Downloads/4J Finance também é diferente. Nenhuma dessas versões históricas substitui a decisão da usuária sobre o HTML final.

## Desenvolvimento e prévia

O montador histórico usa somente módulos padrão do Node.js:

```sh
node work/oct08/build.cjs
```

**Esse comando substitui `outputs/index.html` por uma versão histórica reconstruída, diferente do final confirmado. Não é necessário executá-lo para utilizar o HTML final.** Para estudar os fontes antigos, use outra cópia de trabalho. Os scripts de integração e atualização são utilitários históricos, não uma sequência automática obrigatória de build.

Para visualizar a cópia final em `outputs` localmente:

```sh
node work/serve-final.cjs
```

A prévia usa http://127.0.0.1:4174/?demo=1. Os testes `*-test.cjs` em `work/oct08` se referem aos fontes históricos. Os testes de regras de `work/privacy` exigem suas dependências declaradas e o emulador Firestore; binários e caches não foram incluídos.

## Escopo da cópia

Não foram incluídos credenciais de conta de serviço, tokens, senhas, sessões de navegador, exportações financeiras, conversas, capturas de tela ou binários de ferramentas. A auditoria do arquivo final não encontrou padrões de credenciais privadas nem blocos de exportação financeira; seus scripts incorporados passaram por conferência de sintaxe sem execução.

O repositório é uma cópia de segurança. Este trabalho não configurou publicação automática no Netlify nem reconstruiu o site. Uma publicação futura deve usar o arquivo final confirmado e ser validada separadamente.
