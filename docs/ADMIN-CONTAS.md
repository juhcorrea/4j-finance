# Administração de contas

Publicado em 30/10/2026: edição de nome e e-mail e envio de link de redefinição de senha pelo perfil ADMIN. Interface, Worker independente e regras Firestore conferidos remotamente. Registro técnico e limites da validação ao final.

## Uso no site

Caminho: **Família e ajustes → Administração da plataforma → Gerenciar contas**.

- A lista mostra contas cadastradas, com busca por nome, e-mail e perfil já acessível ao administrador. **Ativo** significa acesso permitido, não presença on-line.
- **Editar cadastro** consulta primeiro a identidade atual no Firebase Authentication. O novo e-mail deve ser digitado duas vezes.
- **Redefinir senha** mostra o destinatário e exige confirmação em **Enviar link**. A própria pessoa escolhe a nova senha pelo e-mail do Firebase. O site não mostra nem recebe a senha atual dessa pessoa.
- Nome, e-mail e recuperação de senha ficam disponíveis apenas para contas de **Membro**. A própria conta ADMIN e outras contas ADMIN ficam protegidas contra essas ações nesta tela.
- Se a autenticação do administrador estiver antiga, a tela pede novamente a senha da **própria conta ADMIN**. O campo é limpo após a tentativa; a senha vai ao SDK do Firebase, nunca à API administrativa da Cloudflare.
- A demonstração não consulta nem altera contas reais.

A troca de e-mail preserva o UID. Os registros, a propriedade dos perfis e o benefício permanente sem anúncios continuam associados à mesma conta. A mudança não transfere o benefício a outro login e não migra convites de compartilhamento enviados ao endereço anterior. O endereço novo fica não verificado e precisa ser confirmado para usar compartilhamentos concedidos a ele.

## Arquitetura e limites de acesso

A interface usa um Worker independente, `4jfinance-admin-accounts`, com dois endpoints:

| Endpoint POST | Corpo aceito | Resultado |
| --- | --- | --- |
| `/api/admin/accounts/lookup` | `{uid}` | Identidade canônica atual em `account` |
| `/api/admin/accounts/update` | `{uid, expectedEmail, email?, displayName?}` | `account`, `authUpdated` e `mirrorPending` |

`account` contém somente `uid`, `email`, `displayName`, `emailVerified` e `changed`. Não são devolvidos tokens, hashes de senha, dados de provedores nem erros brutos do Google. Não existe endpoint para informar uma senha nova, alterar função, suspender conta ou acessar dados financeiros. As ações anteriores de função e status seguem o fluxo já existente, separado desta API.

O Worker público faz as verificações HTTP e encaminha ao Durable Object privado `AdminAccountsExecutor`, binding `ADMIN_ACCOUNTS_EXECUTOR`, instância `accounts`. O objeto usa a modalidade SQLite compatível com Free, mas **não grava dados em storage/SQLite**. O trabalho criptográfico ocorre no objeto, separado do orçamento curto de CPU do Worker público. Uma fila por UID serializa as alterações enviadas por esta API.

Essa arquitetura é separada do executor Pix, do D1 de pagamentos e do pacote público do site. Ela não instala Firebase Functions nem solicita Blaze ou mudança de plano. As cotas dos serviços gratuitos continuam aplicáveis; nenhum plano foi alterado por estes arquivos.

Cada consulta e alteração administrativa exige:

1. Token Firebase assinado, válido, do projeto esperado, com conferência atual da conta e do marco de revogação.
2. Administrador ativo, com e-mail verificado e autenticação de no máximo dez minutos.
3. Leitura atual de `users/{uid}` no Firestore para conferir função/status do ator e do alvo; papéis enviados pelo navegador não são aceitos.
4. Alvo diferente do ator e com função `member`.

O backend lê o Firestore usando o **ID token do administrador**, sujeito às regras. A conta de serviço não recebe permissões Firestore. A edição de identidade não cria exceção de administrador para ler finanças de outra família.

CORS permite exclusivamente `https://4jfinance.com.br` e `https://www.4jfinance.com.br`. São aceitos JSON de até 2 KiB e os campos enumerados acima. URLs arbitrárias, redirecionamentos de autenticação, campos extras e origens desconhecidas são rejeitados. O Durable Object repete as verificações relevantes, inclusive autenticação.

## Credencial e configuração

Referência desativada: [`cloudflare/wrangler.admin-accounts.example.jsonc`](../cloudflare/wrangler.admin-accounts.example.jsonc).

| Tipo | Nome | Finalidade |
| --- | --- | --- |
| Variável | `FIREBASE_PROJECT_ID` | Projeto Auth/Firestore esperado |
| Variável | `FIREBASE_WEB_API_KEY` | Chave pública web do mesmo projeto |
| Variável | `ADMIN_AUTH_SERVICE_ACCOUNT_EMAIL` | Identidade exata da conta de serviço dedicada |
| Variável | `ADMIN_ACCOUNTS_ENABLED` | Habilitação explícita; exemplo começa como `false` |
| Segredo Cloudflare | `FIREBASE_ADMIN_SERVICE_ACCOUNT` | JSON da chave da conta de serviço dedicada |
| Binding privado | `ADMIN_ACCOUNTS_EXECUTOR` | Namespace do executor administrativo |
| Configuração pública da interface | `ADMIN_ACCOUNTS_CONFIG` | `enabled` e `apiBase`, sem credenciais |

O papel IAM customizado da conta de serviço deve conter **somente**:

```text
firebaseauth.users.get
firebaseauth.users.update
```

Não conceder Editor, Owner, acesso Firestore ou permissões financeiras. Não reutilizar refresh token do Firebase CLI, credencial pessoal do operador ou credencial Pix. O JSON privado deve ser instalado apenas no segredo do Worker administrativo; não entra em Git, pacote Pages, arquivo de configuração público, relatório ou log.

O backend fixa projeto, identidade da conta de serviço e destino OAuth. A troca OAuth usa o escopo `identitytoolkit`, JWT RS256 e acesso de curta duração mantido apenas em memória. A consulta/update de Auth utiliza as APIs oficiais [`accounts:lookup`](https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/lookup) e [`accounts:update`](https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/update), com as permissões documentadas. O fluxo de credencial segue a [documentação de conta de serviço do Google](https://developers.google.com/identity/protocols/oauth2/service-account).

## E-mail, revogação e espelho Firestore

Antes da escrita, o backend compara `expectedEmail` com o e-mail atual do Auth e refaz as leituras de autorização e identidade. Depois da atualização, uma nova consulta deve confirmar o valor desejado. Conflitos retornam erro 409 e exigem atualizar a lista.

Antes de trocar o e-mail no Auth, o backend grava o corte `authValidAfter` em `users/{uid}`, usando o ID token do administrador e precondição `updateTime`. Se essa etapa falhar, não altera a identidade no Auth. Um endereço legado com maiúsculas é normalizado para o e-mail **atual** confirmado no Auth; o e-mail novo só entra no espelho depois de ser confirmado.

Em seguida, a atualização Auth envia `emailVerified: false` e `validSince` com o mesmo corte. Depois do readback, o backend sincroniza os campos necessários de nome/e-mail, preservando o corte, em outro PATCH com precondição de versão.

`authValidAfter` é um número inteiro de segundos, compartilhado com `validSince`. As regras exigem valor monotônico e não permitem removê-lo por este fluxo. O acesso financeiro exige que `request.auth.token.auth_time` seja estritamente posterior ao corte; assim, sessões autenticadas antes do marco perdem esse acesso antes da troca de identidade. Contas sem esse campo preservam a compatibilidade anterior. Uma edição apenas de nome mantém o corte existente.

O UID e os documentos de finanças não são alterados. A sincronização do e-mail da própria conta em um login posterior usa somente o e-mail do token assinado e não pode mudar função, status ou corte.

O Google não oferece CAS/ETag para a alteração Auth. A fila evita concorrência entre chamadas deste endpoint; mudanças externas no Firebase Console ainda dependem das pré-condições e da leitura posterior. Não tratar esse fluxo como uma transação distribuída entre Auth e Firestore.

## Recuperação de falha parcial

Se o Auth confirmar a mudança e o espelho de nome/e-mail falhar, a API retorna a identidade canônica com `mirrorPending: true`. Isso **não é uma conclusão completa**: a lista pode estar antiga. O corte de sessões já foi aplicado antes da troca de e-mail e não é revertido.

A tela avisa que o login foi atualizado e oferece salvar novamente. Ao repetir os mesmos valores, o backend reconhece a identidade já alterada e tenta reparar somente o espelho. Não troca novamente o e-mail, não reinicia a verificação e não revoga as sessões repetidamente.

Se o Auth falhar depois do corte, a resposta é um erro seguro com `error.targetReauthRequired: true`. A pessoa poderá precisar entrar novamente mesmo que a alteração não tenha sido concluída. Em timeout, não afirmar que o e-mail mudou nem que permaneceu igual: consultar novamente a identidade canônica. O corte é preservado por segurança.

Se houver timeout ou conflito sem resposta canônica, volte à lista e abra novamente a edição; `lookup` consulta a situação real do Auth. Não substituir automaticamente o e-mail com base apenas no documento antigo do Firestore. Se a sincronização continuar falhando, conferir regras publicadas, função/status atuais e precondição do documento, sem remover as verificações.

## Redefinição de senha

Não existe endpoint de reset no Worker. Após a confirmação visual do administrador, a interface refaz a autorização e a consulta canônica, compara o destinatário e chama `sendPasswordResetEmail` do SDK Firebase.

O texto de sucesso informa que o Firebase aceitou a **solicitação**. Isso não prova entrega na caixa de entrada nem conclusão da troca de senha. A entrega pode demorar ou cair no spam. O envio não altera a senha imediatamente; a pessoa deve abrir o link e concluir o procedimento.

Os testes automatizados substituem esse método por um simulador. Nenhum usuário real foi alterado e nenhum e-mail real de recuperação foi enviado na validação desta implementação.

## Validação e publicação

Em 30/10/2026 passaram 554 testes Node, 16 verificações mock/VM de privacidade, 56 cenários da interface de login/senha e 22 cenários administrativos. Emuladores locais: 34 testes de privacidade e 26 de identidade, com dados sintéticos. O build foi reproduzido sem diferenças.

A suíte inclui 26 testes novos de backend: JWTs sintéticos assinados, OAuth com assinatura verificada, autorização, concorrência, duplicação de e-mail, idempotência, falha parcial, campos proibidos, CORS e limite de corpo. A falha no pré-corte impede qualquer update Auth; a falha Auth posterior propaga o aviso de nova autenticação sem anunciar sucesso. E-mails legados são normalizados. Miniflare executa Worker → Durable Object → validação JWT → assinatura OAuth → update Auth → espelho Firestore com respostas sintéticas.

A conta de serviço dedicada e o papel com somente as duas permissões Auth foram provisionados e conferidos. A chave privada permanece apenas no segredo do Worker. Não houve edição autenticada de conta real nem envio de recuperação real na validação. Os testes locais e o smoke público não comprovam uma edição completa autenticada em produção ou a entrega de e-mail. Não houve teste em Safari/iPhone físico.

Não existe /health administrativo. Rotas desconhecidas retornam 404; lookup sem autenticação retorna 401 quando habilitado; serviço desativado retorna erro genérico 503. Esses sinais isolados não validam uma operação privilegiada completa.

### Registro remoto desta entrega

- Worker administrativo habilitado: versão 2307d217-4a67-4f13-8695-c9ba2fe6014e; bundle SHA-256 c534e10ccfca1e3a61c0f9e99fb4e9e3cccebdf3c879a0d503e7fad62eeb86e5. Readback em 2026-10-30T19:17:51.084Z, acesso anônimo 401 e origem proibida 403.
- Firestore: ruleset 8aa6a8d5-e8c2-4b82-b722-3db3f9d3bebc; SHA-256 60ea94b3c8abd4c15f03347abb1b5afbd06c87daa00f7e1dae1a2da22b9dff65; leitura da versão ativa igual à fonte em 2026-10-30T19:15:40.293Z.
- Pages: [c9b28988-685b-4781-96c0-7ffd1f1c3458](https://c9b28988.4jfinance.pages.dev), publicado em 2026-10-30T19:20:18.811952Z, conferido em 2026-10-30T19:20:27.508Z. HTML SHA-256 8605084fc1aeb85f6d8b19b4926dc603334277d8240c60a42fa42710adea8275. Domínio oficial, alias e deployment correspondem ao pacote público validado.
- O pacote Pages contém somente os 24 arquivos públicos permitidos, o roteador Pix compilado e as rotas. Credencial e fonte do serviço administrativo não entram nesse pacote.
- Pix: health 200, acesso anônimo 401; executor e configuração preservados. Anúncios continuam desativados. Nenhuma operação financeira, plano contratado ou alteração de conta real nesta entrega. Netlify permanece pausado; Git e Cloudflare são operações distintas.

Os relatórios privados de implantação permanecem fora do Git. O SHA do commit é confirmado separadamente após o push, evitando uma referência circular neste registro.
