# Cadastro automático do 4J Finance

O HTML passa a criar cada cadastro novo como **Membro ativo**, usando os valores internos `role: 'member'` e `status: 'approved'` para manter compatibilidade. Ele não promove administradores, não reativa contas existentes e não altera as regras do projeto Firebase.

## Ajuste pontual, somente se as regras atuais recusarem o cadastro

As regras publicadas não foram fornecidas. Portanto, este trecho **não é um arquivo completo de regras e não deve substituir as regras atuais**. Quem configura o Firebase deve comparar com o bloco existente `match /users/{uid}` e incorporar a permissão abaixo, preservando as proteções de ADMIN, perfis e compartilhamentos.

```text
// Dentro do match /users/{uid} existente:
// A leitura do próprio cadastro deve funcionar mesmo antes de ele existir,
// pois a criação usa uma transação que primeiro verifica esse documento.
allow get: if request.auth != null && request.auth.uid == uid;

allow create: if request.auth != null
  && request.auth.uid == uid
  && request.resource.data.keys().hasAll(['name', 'email', 'role', 'status', 'createdAt'])
  && request.resource.data.keys().hasOnly(['name', 'email', 'role', 'status', 'createdAt'])
  && request.resource.data.name is string
  && request.resource.data.name.size() > 0
  && request.resource.data.name.size() <= 80
  && request.resource.data.email == request.auth.token.email.lower()
  && request.resource.data.role == 'member'
  && request.resource.data.status == 'approved'
  && request.resource.data.createdAt == request.time;
```

Não acrescentar permissão geral de escrita para usuários autenticados. A criação acima não concede `update`, `delete` ou listagem de outros usuários. Alterações próprias de cadastro devem continuar impedindo mudanças de `role` e `status`; a gravação do perfil padrão deve limitar-se a `defaultProfileId`. Excluir o próprio documento `users/{uid}` também não deve ser permitido, pois recriá-lo anularia uma suspensão. Regras de ADMIN continuam responsáveis por ativar/suspender contas e conceder/remover ADMIN.

Permissões de regras correspondentes são combinadas por **OU**: um bloqueio mais restrito não corrige outra regra ampla já existente. Conferir se não há outro `allow write` que permita alterar papéis, apagar cadastros ou acessar qualquer perfil. O cadastro aberto mantém a separação de perfis somente quando as regras também a aplicam.

## Conferência antes de publicar as regras

- Pessoa autenticada pode ler o próprio documento e criá-lo como Membro ativo.
- Pessoa sem login não pode criar cadastros.
- Membro não pode criar o cadastro de outra pessoa, listar outros usuários, criar ADMIN ou mudar o próprio papel/status.
- Uma conta inativa não recupera acesso por novo login ou tentativa de concluir cadastro.
- Membro só lê/edita perfis próprios ou explicitamente compartilhados conforme o nível permitido.
- ADMIN existente mantém as operações autorizadas e o perfil padrão continua sendo salvo na própria conta.

Se o login já foi criado, mas o documento do Firestore falhou, o site mostra **Tentar novamente** após o ajuste. Não é preciso cadastrar novamente o e-mail. Contas antigas que estavam pendentes permanecem inativas; a administração pode ativá-las uma vez na tela de usuários.

Referências oficiais: [condições das regras Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions) e [restrições por campo](https://firebase.google.com/docs/firestore/security/rules-fields).
