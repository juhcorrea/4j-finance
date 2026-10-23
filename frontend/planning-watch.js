/* A local reading of the authorized profile; no bank monitoring or financial writes. */
var PlanningWatch = (() => {
  'use strict';
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  function analyze(finance, budget, rows) {
    const month = finance?.months?.[0];
    if (!month || finance.months.length !== 1 || budget?.month !== month.month || !Array.isArray(rows) ||
        !['incomeCents', 'expenseCents', 'unpaidCents'].every(key => integer(month[key])) ||
        budget.income !== month.incomeCents || !Array.isArray(budget.groups)) throw Error('invalid-watch-data');
    const groups = Object.fromEntries(budget.groups.map(group => [group.key, group]));
    if (!['fixed', 'variable', 'reserve'].every(key => groups[key] && integer(groups[key].actual) && integer(groups[key].limit)) ||
        groups.fixed.actual + groups.variable.actual !== month.expenseCents) throw Error('invalid-watch-data');
    const expenses = rows.filter(row => row.type === 'despesa' && row.date.startsWith(month.month));
    const pending = expenses.filter(row => !row.paid);
    const overdue = pending.filter(row => row.date < finance.today);
    const end = new Date(finance.today + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + 7);
    const endDate = end.toISOString().slice(0, 10);
    const soon = pending.filter(row => row.date >= finance.today && row.date <= endDate);
    const cents = list => list.reduce((sum, row) => sum + Math.round(row.value * 100), 0);
    const recorded = month.recordedReserveCents;
    const reserveKnown = recorded !== null && integer(recorded);
    const protectedCents = month.incomeKnown && finance.planKnown ? Math.max(recorded || 0, groups.reserve.limit) : reserveKnown ? recorded : null;
    const findings = [];
    const add = (kind, values = {}, attention = false) => findings.push({ kind, ...values, attention });
    if (overdue.length) add('overdue', { count: overdue.length, cents: cents(overdue) }, true);
    if (!month.incomeKnown) add('income-missing', { cents: month.expenseCents }, expenses.length > 0);
    else if (month.expenseCents > month.incomeCents) add('expense-gap', { cents: month.expenseCents - month.incomeCents }, true);
    else if (protectedCents !== null && month.expenseCents + protectedCents > month.incomeCents) {
      add('reserve-gap', { cents: month.expenseCents + protectedCents - month.incomeCents }, true);
    }
    if (soon.length) add('due-soon', { count: soon.length, cents: cents(soon), through: endDate }, true);
    if (month.incomeKnown && month.incomeCents > 0 && finance.planKnown) {
      const variable = groups.variable;
      if (variable.actual > variable.limit) add('variable-over', { cents: variable.actual - variable.limit, limit: variable.limit }, true);
      else if (variable.limit > 0 && variable.actual >= variable.limit * 0.8) {
        add('variable-near', { cents: variable.limit - variable.actual, limit: variable.limit, percent: Math.floor(variable.actual * 100 / variable.limit) }, true);
      }
      const fixed = groups.fixed;
      if (fixed.actual > fixed.limit) add('fixed-over', { cents: fixed.actual - fixed.limit, limit: fixed.limit }, true);
    }
    if (!expenses.length) add('expense-missing');
    if (month.incomeKnown && !reserveKnown) add('reserve-missing');
    if (!finance.planKnown) add('plan-missing');
    if (!findings.length) add('within');
    return { month: month.month, today: finance.today, incomeKnown: month.incomeKnown, incomeCents: month.incomeCents,
      expenseCents: month.expenseCents, protectedCents, reserveKnown, planKnown: finance.planKnown,
      pendingCents: month.unpaidCents, suggested: budget.suggested, findings, primary: findings.find(item => item.attention) || null };
  }
  const core = { analyze };
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (typeof document === 'undefined' || typeof Store === 'undefined') return core;
  const money = cents => Money.format(cents / 100);
  function collect() {
    try {
      let rows;
      const finance = CatatauPlanner.snapshot({ store: Store, fromMonth: state.month, months: 1, today: Money.today(),
        rowsForWindow: (from, to) => (rows = allRows(from, to)) });
      return analyze(finance, Budget.analyze(rows, Store.meta, state.month), rows);
    } catch { return null; }
  }
  function words(item, firm) {
    const value = item.cents === undefined ? '' : money(item.cents);
    switch (item.kind) {
      case 'overdue': return { title: 'Primeiro, os vencimentos', text: `${firm ? 'Ronda dos boletos, sô! ' : ''}${item.count} ${item.count === 1 ? 'despesa está marcada como pendente após o vencimento' : 'despesas estão marcadas como pendentes após o vencimento'} neste mês: ${value}. Confira se já pagou antes de acertar o registro.`, action: 'Conferir pendências', href: '#relatorios' };
      case 'income-missing': return { title: 'Falta uma peça: a renda', text: `${item.cents ? 'Há ' + value + ' em despesas, mas nenhuma receita registrada neste mês. ' : ''}${firm ? 'Sem essa pista, o xerife não dá sinal verde. ' : ''}Inclua as receitas do mês para comparar. Ausência de registro não significa renda zero.`, action: 'Conferir lançamentos', href: '#lancamentos' };
      case 'expense-gap': return { title: 'As despesas passaram da renda', text: `${firm ? 'Opa, sô: vamos cuidar disso primeiro. ' : ''}As despesas pagas e previstas superam a renda registrada em ${value}, antes da reserva. Revise os valores e escolha o que pode ajustar.`, action: 'Revisar despesas', href: '#relatorios' };
      case 'reserve-gap': return { title: 'A reserva ficou apertada', text: `${firm ? 'Segura esse carrinho, sô! ' : ''}Faltam ${value} para cobrir as despesas e preservar a maior entre a meta de reserva e o valor já separado. Confira o plano antes de assumir outra compra.`, action: 'Rever meu plano', href: '#metas' };
      case 'due-soon': return { title: 'No radar dos próximos 7 dias', text: `${item.count} ${item.count === 1 ? 'despesa pendente deste mês vence' : 'despesas pendentes deste mês vencem'} de hoje até ${Money.date(item.through)}: ${value}. Confira o dinheiro disponível nas datas.`, action: 'Ver vencimentos', href: '#relatorios' };
      case 'variable-over': return { title: 'Variáveis acima do combinado', text: `${firm ? 'Uai, esse grupo passou da porteira! ' : ''}Os gastos variáveis superam o limite de ${money(item.limit)} em ${value}. Veja os maiores itens e decida quais próximos gastos podem esperar.`, action: 'Conferir categorias', href: '#relatorios' };
      case 'variable-near': return { title: 'O limite das variáveis está perto', text: `${item.percent}% do limite planejado já está comprometido com despesas pagas e previstas. Restam ${value} nesse limite, sem garantir dinheiro livre no banco.`, action: 'Conferir meu orçamento', href: '#metas' };
      case 'fixed-over': return { title: 'Fixas acima do planejado', text: `Os compromissos fixos superam o limite de ${money(item.limit)} em ${value}. Confira os maiores itens e o que pode renegociar; também vale ajustar os percentuais à sua realidade.`, action: 'Rever meu plano', href: '#metas' };
      case 'expense-missing': return { title: 'Vamos completar o mapa', text: 'Ainda não há despesas registradas neste mês. Inclua contas, parcelas e gastos do dia a dia para a ronda fazer sentido.', action: 'Conferir lançamentos', href: '#lancamentos' };
      case 'reserve-missing': return { title: 'Quanto já foi separado?', text: 'A reserva deste mês ainda não foi informada. Conte em Metas quanto você já separou; pode ser zero. Não use o acumulado de outros meses.', action: 'Informar a reserva', href: '#metas' };
      case 'plan-missing': return { title: 'Um combinado do seu tamanho', text: 'Você ainda não definiu os percentuais do perfil. Em Metas, confira a sugestão inicial e ajuste o plano à sua realidade.', action: 'Definir meu plano', href: '#metas' };
      default: return { title: firm ? 'Ô trem bão: seguimos de olho!' : 'Nenhum ponto de atenção nesta leitura', text: 'Não encontrei atraso, vencimento próximo ou pressão nos limites acompanhados. Continue incluindo os gastos: registros incompletos podem mudar esta leitura.', action: 'Conferir registros', href: '#relatorios' };
    }
  }
  function finding(item, firm) {
    const view = words(item, firm);
    return `<article class="watch-finding ${item.attention ? 'watch-attention' : ''}" data-watch-kind="${item.kind}"><h3>${esc(view.title)}</h3><p>${esc(view.text)}</p><a href="${view.href}">${esc(view.action)} <span aria-hidden="true">→</span></a></article>`;
  }
  function pageContent(model) {
    if (!model) return '<div class="watch-waiting"><h2>Ronda do mês</h2><p>Aguarde os dados do perfil e a confirmação do acesso para acompanhar o mês.</p></div>';
    const firm = CatatauPlanner.isFirm();
    const urgent = model.findings.filter(item => item.attention), others = model.findings.filter(item => !item.attention);
    const ordered = [...urgent, ...others], visible = ordered.slice(0, 2), remaining = ordered.slice(2);
    return `<header class="watch-heading"><div><span class="eyebrow">${firm ? 'XERIFE CATATAU DE PLANTÃO' : 'UM OLHAR PARA OS SEUS REGISTROS'}</span><h2>Ronda do mês</h2><p>${esc(monthName(model.month))} · somente este perfil</p></div><div class="watch-heading-tools">${monthPicker()}<span class="watch-state">${urgent.length ? urgent.length + (urgent.length === 1 ? ' ponto de atenção' : ' pontos de atenção') : 'Passo a passo'}</span></div></header>
      <p class="watch-intro">${firm ? 'Uai, sô… uma coisa de cada vez. Eu aponto o que merece cuidado e você decide o próximo passo.' : 'Comece pelo que mais precisa de cuidado. Ao atualizar seus registros, esta leitura acompanha você.'}</p>
      <dl class="watch-numbers"><div><dt>Receitas registradas</dt><dd>${model.incomeKnown ? money(model.incomeCents) : 'A informar'}</dd></div><div><dt>Despesas pagas + previstas</dt><dd>${money(model.expenseCents)}</dd></div><div><dt>Reserva a preservar</dt><dd>${model.protectedCents === null ? 'A definir' : money(model.protectedCents)}</dd></div></dl>
      <div class="watch-findings">${visible.map(item => finding(item, firm)).join('')}</div>
      ${remaining.length ? `<details class="watch-complete"><summary>Ver ${remaining.length === 1 ? 'outro ponto' : 'outros ' + remaining.length + ' pontos'} da ronda</summary><div class="watch-findings">${remaining.map(item => finding(item, firm)).join('')}</div></details>` : ''}
      <p class="watch-source">Leitura das contas pagas e previstas do mês selecionado, atualizada ao mudar seus registros no 4J. ${model.protectedCents !== null ? 'A reserva a preservar considera o maior valor entre a meta definida e o total separado informado. ' : ''}${model.suggested ? 'Algumas categorias estão na divisão sugerida; confira-as em Metas. ' : ''}Registros podem estar incompletos. O Catatau não consulta seu banco nem envia alertas com o site fechado.</p>`;
  }
  function homeContent(model) {
    if (!model?.primary || !CatatauPlanner.isFirm()) return '';
    const view = words(model.primary, true);
    return `<aside class="watch-home" aria-label="Ronda do Catatau"><img src="assets/catatau-sheriff.webp" alt="" width="72" height="84"><div><span class="eyebrow">RONDA DO CATATAU · ${esc(monthName(model.month, true))}</span><h2>${esc(view.title)}</h2><p>${esc(view.text)}</p><a href="#planejar">Ver minha ronda <span aria-hidden="true">→</span></a></div></aside>`;
  }
  function page() { return `<section class="planning-watch" data-planning-watch="page">${pageContent(collect())}</section>`; }
  function home() { return `<div data-planning-watch="home">${homeContent(collect())}</div>`; }
  function sync() {
    const hosts = [...document.querySelectorAll('[data-planning-watch]')];
    if (!hosts.length) return;
    const model = collect();
    for (const host of hosts) {
      const next = host.dataset.planningWatch === 'home' ? homeContent(model) : pageContent(model);
      if (host.innerHTML !== next) host.innerHTML = next;
    }
  }
  window.addEventListener('finance-update', sync);
  window.addEventListener('catatau-firm-change', sync);
  window.addEventListener('pagehide', () => { for (const host of document.querySelectorAll('[data-planning-watch]')) host.replaceChildren(); });
  window.addEventListener('pageshow', sync);
  return { ...core, collect, page, home, sync };
})();
