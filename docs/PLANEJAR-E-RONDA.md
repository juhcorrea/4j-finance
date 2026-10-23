# Planejar e a ronda do Catatau

A aba Planejar reúne a avaliação de uma compra e a leitura do mês. Foi solicitada em 23/10/2026 para tornar o recurso acessível sem precisar conversar com o Catatau. A responsável também pediu supervisão útil para quem tem dificuldade de controlar os gastos.

## Como usar

No computador, Planejar aparece no menu lateral. No celular, fica na barra inferior; Acertos, Metas e Meu ano continuam disponíveis em Mais.

A Ronda do mês usa os registros do perfil selecionado. Mostra os pontos que pedem atenção e oferece atalhos para conferir lançamentos, relatórios ou reserva. A linguagem distingue orçamento registrado de saldo bancário e aponta quando faltam informações. Não considera que a ausência de registros comprova ausência de gastos.

O formulário de compra coleta valores, datas e condições antes de pedir as hipóteses da projeção. A pessoa confere os dados antes de avaliar. Renda futura não registrada, gastos extras, dinheiro livre e limite do cartão não são preenchidos como se fossem conhecidos. A avaliação usa o mesmo cálculo da conversa com o Catatau.

O Modo firme é voluntário e acompanha somente o perfil atual. Além da aparência de xerife e da orientação mais direta, mostra avisos acionáveis no Início. A ronda é atualizada quando o app recebe mudanças dos registros enquanto está aberto. Uma compra que compromete o cenário recebe motivos e uma sugestão de pausa e revisão, sem constranger a pessoa.

## Limites e proteção dos dados

O recurso não acompanha o banco em tempo real, não bloqueia cartões ou Pix, não impede registrar uma despesa já realizada e não envia notificações fora do site. Não cria lançamentos nem modifica saldos. Não faz chamadas a IA ou contrata serviços adicionais.

Rascunhos e resultados da simulação ficam apenas na memória da página. Trocar de perfil, perder o acesso ou sair da conta limpa o contexto; mudanças nos dados invalidam a análise antiga. A preferência de modo firme continua separada por login e perfil. Nenhum dado de compra é gravado no armazenamento local para este recurso.

## Verificação

Testes da análise local: `frontend/catatau-planner.test.cjs`. Verificação da conversa existente: `qa/catatau-planner.test.cjs`. Verificação da aba, ronda, navegação móvel e isolamento: `qa/planning-page.test.cjs`, com dados fictícios e serviços externos bloqueados. O resultado da execução e a publicação ficam registrados em `TESTES.txt` e `PUBLICACAO.json`.

Publicado em `4122d058-b23c-4a84-bb5d-3219aa9d10de` e conferido em 2026-10-23T17:50:23.815Z. Testes: 520 verificações Node, 16 de privacidade em mock/VM, 6 combinações da nova interface, 4 da conversa existente e 56 do login. Configurações Pix e plano preservados.
