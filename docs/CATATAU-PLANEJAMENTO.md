# Catatau: planejamento de compras

O Catatau usa uma conversa guiada e cálculos no próprio navegador. Não há chamada a IA externa, nova leitura de outros perfis ou custo de API de IA.

O botão Planejar uma compra coleta nome, preço à vista, data e, quando houver cartão, total parcelado, entrada, quantidade de parcelas e primeiro vencimento. Os valores e as hipóteses são confirmados antes do cálculo. A análise cobre pelo menos 12 meses, com limite explícito de 24 meses.

## Dados e limites

- Usa somente os registros já carregados do perfil atual autorizado, com janela de datas explícita.
- Receitas futuras ausentes não são repetidas automaticamente: a conversa pede uma estimativa ou aceita não sei.
- Compara preços em centavos e distribui eventuais centavos restantes nas parcelas; vencimentos no fim do mês são ajustados ao calendário.
- Pede gastos ainda não registrados, reserva mensal a preservar, dinheiro livre na data da compra e limite disponível do cartão.
- O saldo do orçamento não é tratado como saldo bancário. Não deduz juros, vencimentos ou limite a partir do nome do cartão.
- Preserva a maior entre a reserva mensal registrada e a meta escolhida. Não soma de novo o acumulado das metas.
- Resultado incompleto não vira aprovação. O cálculo mostra falta de dinheiro, limite ou meses negativos e o custo adicional do parcelamento.

## Modo firme

É opcional e salvo apenas como preferência por UID e perfil. Pode dizer Não compre agora e explicar por que a condição compromete o cenário informado. Não bloqueia banco, cartão, Pix nem o cadastro de uma despesa já realizada.

## Isolamento e privacidade

A simulação não cria lançamentos, não modifica o orçamento e não envia dados a um provedor de IA. Mudanças de perfil, conta, registros, autorização ou erro de carregamento invalidam a simulação. Os listeners do perfil ignoram callbacks antigos e só liberam os dados quando metadados, receitas e despesas daquele mesmo escopo estão prontos.

## Verificação

A lógica possui testes em frontend/catatau-planner.test.cjs. A interface possui QA reproduzível em qa/catatau-planner.test.cjs, com dados fictícios, sem acesso ao Firebase real. O build injeta o módulo antes da inicialização da aplicação. A comparação financeira é orientação baseada nos dados informados, não garante saldo no vencimento ou aprovação do cartão.
