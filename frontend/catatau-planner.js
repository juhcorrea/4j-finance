/* Catatau purchase planning: local calculations and voluntary guidance only. */
var CatatauPlanner = (() => {
  'use strict';
  const MAX_CENTS = 99999999900;
  const monthIndex = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '') ? Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1 : null;
  const monthKey = index => String(Math.floor(index / 12)).padStart(4, '0') + '-' + String(index % 12 + 1).padStart(2, '0');
  const validCents = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function moneyInput(value) {
    let text = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (text.includes(',')) {
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
      text = text.replace(/\./g, '').replace(',', '.');
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return validCents(cents) ? cents : null;
  }
  function dateInput(value, today) {
    let text = String(value || '').trim();
    if (normalize(text) === 'hoje') text = today;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) text = text.split('/').reverse().join('-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number(text.slice(0, 4)) < 1900 || Number(text.slice(0, 4)) > 2200) return null;
    const date = new Date(text + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
  }
  function addMonths(date, offset) {
    if (!dateInput(date) || !Number.isInteger(offset) || offset < 0 || offset > 24) throw Error('invalid-date');
    const [year, month, day] = date.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
    shifted.setUTCDate(Math.min(day, new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()));
    return shifted.toISOString().slice(0, 10);
  }
  function splitCents(total, count) {
    if (!validCents(total) || !Number.isInteger(count) || count < 1 || count > 24 || total < count) throw Error('invalid-installments');
    const base = Math.floor(total / count), remainder = total % count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  }
  function schedules(terms) {
    if (!validCents(terms.cashCents) || terms.cashCents === 0 || !dateInput(terms.purchaseDate)) throw Error('invalid-price');
    const result = [{ key: 'cash', totalCents: terms.cashCents, upfrontCents: terms.cashCents, events: [{ date: terms.purchaseDate, cents: terms.cashCents }] }];
    if (terms.count === undefined || terms.count === 0) return result;
    if (!Number.isInteger(terms.count) || terms.count < 2 || terms.count > 24) throw Error('invalid-installments');
    if (!validCents(terms.totalCents) || !validCents(terms.downCents) || terms.downCents >= terms.totalCents || !dateInput(terms.firstDue) || terms.firstDue < terms.purchaseDate) throw Error('invalid-installments');
    const financed = terms.totalCents - terms.downCents;
    result.push({ key: 'card', totalCents: terms.totalCents, financedCents: financed, upfrontCents: terms.downCents,
      events: [...(terms.downCents ? [{ date: terms.purchaseDate, cents: terms.downCents }] : []), ...splitCents(financed, terms.count).map((cents, index) => ({ date: addMonths(terms.firstDue, index), cents }))] });
    return result;
  }
  function reserveTarget(income, plan) {
    const keys = ['fixed', 'reserve', 'variable'];
    const amounts = Object.fromEntries(keys.map(key => [key, Math.floor(income * plan[key] / 100)]));
    const order = [...keys].sort((a, b) => income * plan[b] % 100 - income * plan[a] % 100);
    for (let rest = income - keys.reduce((sum, key) => sum + amounts[key], 0), index = 0; rest > 0; rest--, index++) amounts[order[index % 3]]++;
    return amounts.reserve;
  }
  function snapshot({ store, fromMonth, months = 12, today, rowsForWindow }) {
    const fail = () => { throw Error('profile-unavailable'); };
    if (!store || store.screen !== 'app' || store.loading || store.error || !store.user?.uid || !store.profile || !store.profiles?.some(profile => profile.id === store.profile)) fail();
    if (!store.demo) {
      const meta = store.meta, email = String(store.user.email || '').toLowerCase();
      const invited = store.user.emailVerified === true && [meta?.sharedView, meta?.sharedEdit].some(list => Array.isArray(list) && list.includes(email));
      if (store.userDoc?.status !== 'approved' || !meta?.ownerUid || !(meta.ownerUid === store.user.uid || invited)) fail();
      if (!store.profileDataScope || store.profileDataScope.uid !== store.user.uid || store.profileDataScope.profile !== store.profile || !store.profileDataScope.ready) fail();
    }
    const from = monthIndex(fromMonth);
    if (from === null || !Number.isInteger(months) || months < 1 || months > 24 || !dateInput(today)) throw Error('invalid-window');
    const planInput = store.meta?.budgetPlan;
    const planKnown = !!planInput && ['fixed', 'reserve', 'variable'].every(key => Number.isInteger(planInput[key]) && planInput[key] >= 0 && planInput[key] <= 100) && planInput.fixed + planInput.reserve + planInput.variable === 100;
    const plan = planKnown ? { fixed: planInput.fixed, reserve: planInput.reserve, variable: planInput.variable } : { fixed: 50, reserve: 20, variable: 30 };
    const toMonth = monthKey(from + months - 1), rows = rowsForWindow(fromMonth, toMonth);
    if (!Array.isArray(rows)) throw Error('invalid-records');
    const output = Array.from({ length: months }, (_, index) => ({ month: monthKey(from + index), incomeCents: 0, incomeKnown: false, expenseCents: 0, unpaidCents: 0, recordedReserveCents: null }));
    for (const row of rows) {
      if (!dateInput(row.date) || !['receita', 'despesa'].includes(row.type) || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0 || !validCents(Math.round(row.value * 100))) throw Error('invalid-records');
      const position = monthIndex(row.date.slice(0, 7)) - from;
      if (position < 0 || position >= months) continue;
      const entry = output[position], cents = Math.round(row.value * 100);
      if (row.type === 'receita') { entry.incomeCents += cents; entry.incomeKnown = true; }
      else { entry.expenseCents += cents; if (!row.paid) entry.unpaidCents += cents; }
      if (!validCents(entry.incomeCents) || !validCents(entry.expenseCents)) throw Error('invalid-records');
    }
    for (const entry of output) if (Object.hasOwn(store.meta?.budgetMonths || {}, entry.month)) {
      const value = store.meta.budgetMonths[entry.month];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !validCents(Math.round(value * 100))) throw Error('invalid-records');
      entry.recordedReserveCents = Math.round(value * 100);
    }
    return { version: 1, currency: 'BRL', scope: JSON.stringify([store.user.uid, store.profile]), today, fromMonth, toMonth, plan, planKnown, months: output };
  }
  function evaluate(finance, terms, assumptions = {}) {
    const variants = schedules(terms);
    if (!finance || !Array.isArray(finance.months) || finance.months.length < 1 || finance.months.length > 24) throw Error('invalid-snapshot');
    const knownMonths = new Set(finance.months.map(month => month.month));
    for (const option of variants) if (option.events.some(event => !knownMonths.has(event.date.slice(0, 7)))) throw Error('outside-window');
    const extraKnown = validCents(assumptions.extraMonthlyCents);
    const reserveKnown = assumptions.reserveMode === 'plan' || (assumptions.reserveMode === 'fixed' && validCents(assumptions.reserveMonthlyCents));
    return variants.map(option => {
      const missing = [], rows = finance.months.map(entry => {
        const supplied = assumptions.incomes?.[entry.month];
        const known = entry.incomeKnown || validCents(supplied);
        const income = entry.incomeKnown ? entry.incomeCents : validCents(supplied) ? supplied : null;
        if (!known) missing.push('Renda de ' + entry.month);
        const reserve = known && reserveKnown ? Math.max(entry.recordedReserveCents ?? 0, assumptions.reserveMode === 'fixed' ? assumptions.reserveMonthlyCents : reserveTarget(income, finance.plan)) : null;
        const purchase = option.events.filter(event => event.date.startsWith(entry.month)).reduce((sum, event) => sum + event.cents, 0);
        const before = known && extraKnown && reserve !== null ? income - entry.expenseCents - assumptions.extraMonthlyCents - reserve : null;
        return { month: entry.month, incomeCents: income, existingCents: entry.expenseCents, extraCents: extraKnown ? assumptions.extraMonthlyCents : null, reserveCents: reserve, purchaseCents: purchase, beforeCents: before, afterCents: before === null ? null : before - purchase };
      });
      if (!extraKnown) missing.push('Gastos mensais ainda não registrados');
      if (!reserveKnown) missing.push('Valor a preservar para reserva');
      const deficits = rows.filter(row => row.afterCents !== null && row.afterCents < 0);
      let cashShortfallCents = 0, limitShortfallCents = 0;
      if (option.upfrontCents > 0) {
        if (!validCents(assumptions.spendableCashCents)) missing.push('Dinheiro livre na data da compra');
        else cashShortfallCents = Math.max(0, option.upfrontCents - assumptions.spendableCashCents);
      }
      if (option.key === 'card') {
        if (!validCents(assumptions.cardLimitCents)) missing.push('Limite disponível do cartão');
        else limitShortfallCents = Math.max(0, option.financedCents - assumptions.cardLimitCents);
      }
      return { ...option, rows, missing, deficits, cashShortfallCents, limitShortfallCents,
        status: deficits.length || cashShortfallCents || limitShortfallCents ? 'over' : missing.length ? 'insufficient' : 'within',
        extraCostCents: option.totalCents - terms.cashCents };
    });
  }
  const core = { moneyInput, dateInput, addMonths, splitCents, schedules, snapshot, evaluate, reserveTarget };
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (typeof document === 'undefined' || typeof Store === 'undefined') return core;

  const currency = cents => Money.format(cents / 100);
  const dateLabel = date => date.split('-').reverse().join('/');
  const monthLabel = value => monthName(value);
  let scope = '', draft = null, notice = '', signature = '', firm = false, revision = 0;
  const preferenceKey = key => '4j-catatau-firm-v1:' + key;
  const answer = text => ({ text, scope: 'Planejamento local · ' + profileName() });
  function currentScope() { return Store.screen === 'app' && Store.user?.uid && Store.profile ? JSON.stringify([Store.user.uid, Store.profile]) : ''; }
  function fingerprint() { return JSON.stringify([revision, Store.loading, Store.error, Store.userDoc?.status, Store.user?.emailVerified, Store.meta.ownerUid]); }
  function preferences() {
    try { firm = !!scope && localStorage.getItem(preferenceKey(scope)) === 'true'; } catch { firm = false; }
  }
  function sync() {
    const next = currentScope();
    if (next !== scope) { scope = next; draft = null; notice = ''; signature = ''; preferences(); }
    const nextSignature = fingerprint();
    if (signature && signature !== nextSignature && draft) { draft = null; notice = 'Os registros ou o acesso deste perfil mudaram. A simulação foi encerrada para não usar dados antigos. Comece novamente em “Planejar uma compra”.'; }
    signature = nextSignature;
    if (!catatauReady()) draft = null;
    const checkbox = document.querySelector('#catatau-firm');
    if (checkbox) { checkbox.checked = firm; checkbox.disabled = !catatauReady(); }
    const note = document.querySelector('#catatau-firm-note');
    if (note) note.textContent = firm ? 'Ativo: vou dizer “Não compre agora” se a compra comprometer o plano informado. Registrar despesas continua liberado.' : 'Opcional e só neste perfil. Não bloqueia banco, cartão ou registro de despesas.';
    controls();
  }
  function clear() { draft = null; notice = ''; controls(); }
  function controls() {
    const root = document.querySelector('#planner-actions');
    if (!root) return;
    root.replaceChildren();
    const choices = !draft ? [['Planejar uma compra', 'Quero planejar uma compra']]
      : draft.step === 'date' ? [['Hoje', 'hoje'], ['Cancelar', 'cancelar']]
      : draft.step === 'count' ? [['Só à vista', 'não'], ['Cancelar', 'cancelar']]
      : ['terms', 'confirm'].includes(draft.step) ? [['Confirmar', 'confirmar'], ['Recomeçar', 'recomeçar'], ['Cancelar', 'cancelar']]
      : draft.step === 'reserve' ? [['Preservar o plano', 'confirmar'], ['Não sei', 'não sei'], ['Cancelar', 'cancelar']]
      : ['income', 'extra', 'cash', 'limit'].includes(draft.step) ? [['Não sei', 'não sei'], ['Cancelar', 'cancelar']]
      : [['Cancelar', 'cancelar']];
    for (const [label, value] of choices) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = !catatauReady(); button.addEventListener('click', () => askCatatau(value)); root.append(button); }
    const input = document.querySelector('#chat-input');
    if (input) { input.placeholder = draft ? 'Responda à etapa acima ou digite cancelar' : 'Ex.: posso planejar uma compra?'; input.setAttribute('inputmode', draft && ['price', 'count', 'total', 'down', 'income', 'extra', 'cash', 'limit'].includes(draft.step) ? 'decimal' : 'text'); }
  }
  function prompt() {
    const prompts = {
      name: 'O que você quer comprar ou qual despesa está planejando? Dê um nome curto. Esta conversa só simula; não cria um lançamento. Para sair, digite cancelar.',
      price: 'Qual é o preço total à vista, já com frete e taxas? Ex.: 1.200,00.',
      date: 'Em que data pretende comprar? Use DD/MM/AAAA ou hoje. Vou olhar pelo menos 12 meses, até o limite de 24.',
      count: 'Há uma opção parcelada no cartão para comparar? Informe o número de parcelas (2 a 24) ou responda não para avaliar só à vista.',
      total: 'Qual é o total final parcelado, somando entrada, parcelas, juros, frete e taxas? Informe o total, não o valor de uma parcela. Se não souber, confirme com a loja antes de continuar.',
      down: 'Qual é o valor da entrada? Digite 0 se não houver. Ela será considerada na data da compra.',
      due: 'Qual é o vencimento da primeira parcela? Use DD/MM/AAAA. Não deduzo fechamento ou vencimento pelo nome do cartão.',
      extra: 'Quanto reservar por mês para gastos que ainda não estão nos registros, como mercado e transporte? Informe um valor extra mensal; 0 significa que você conferiu e já incluiu tudo. Também pode responder não sei.',
      cash: 'Quanto estará livre para usar na data da compra, depois de separar contas, reserva e metas? Informe o valor ou não sei. O saldo mensal do app não é o saldo da sua conta bancária.',
      limit: 'Qual é o limite disponível do cartão para esta compra? Informe o valor ou não sei. Vou comparar com o total financiado, e não apenas com uma parcela; confirme a regra do seu cartão.',
    };
    if (draft.step === 'income') return 'Não há renda registrada em ' + draft.missingIncome.map(monthLabel).join(', ') + '. Qual renda líquida mensal você espera nesses meses? O mesmo valor será usado apenas nesta simulação. Digite 0 se não haverá renda, ou não sei. Não vou repetir o salário automaticamente.';
    if (draft.step === 'reserve') return 'Vou preservar a maior entre a reserva já registrada no mês e a meta de ' + draft.finance.plan.reserve + '% da renda (' + (draft.finance.planKnown ? 'plano deste perfil' : 'plano padrão, que você pode ajustar') + '). Responda confirmar, informe um valor mensal fixo para preservar ou não sei. O acumulado das metas não será somado nem descontado novamente.';
    return prompts[draft.step] || '';
  }
  function advance(step) { draft.step = step; controls(); return answer(prompt()); }
  function termsSummary() {
    const options = schedules(draft.terms), installment = options[1];
    return 'Confira: ' + draft.name + '.\nCompra: ' + dateLabel(draft.terms.purchaseDate) + '.\nÀ vista: ' + currency(draft.terms.cashCents) + '.' + (installment ? '\nCartão: total ' + currency(installment.totalCents) + ', entrada ' + currency(installment.upfrontCents) + ' e ' + draft.terms.count + ' parcelas, primeira em ' + dateLabel(draft.terms.firstDue) + '.\nParcelas: ' + splitCents(installment.financedCents, draft.terms.count).map(currency).join(' + ') + '.' : '') + '\n\nResponda confirmar se os valores e datas estão corretos, ou recomeçar.';
  }
  function prepareFinance() {
    const options = schedules(draft.terms), fromMonth = Money.today().slice(0, 7), last = options.flatMap(option => option.events).map(event => event.date.slice(0, 7)).sort().at(-1);
    const months = Math.max(12, monthIndex(last) - monthIndex(fromMonth) + 1);
    if (months > 24) return false;
    draft.finance = snapshot({ store: Store, fromMonth, months, today: Money.today(), rowsForWindow: allRows });
    draft.missingIncome = draft.finance.months.filter(month => !month.incomeKnown).map(month => month.month);
    draft.assumptions = { incomes: {} };
    return true;
  }
  function assumptionsSummary() {
    const a = draft.assumptions, absent = value => validCents(value) ? currency(value) : 'não informado';
    return 'Antes de calcular, confira as hipóteses de ' + monthLabel(draft.finance.fromMonth) + ' a ' + monthLabel(draft.finance.toMonth) + ':\n' +
      (draft.missingIncome.length ? '• Renda mensal nos meses sem registro: ' + absent(a.incomes[draft.missingIncome[0]]) + '.\n' : '• Renda: somente os valores registrados em cada mês.\n') +
      '• Gastos extras mensais: ' + absent(a.extraMonthlyCents) + '.\n• Reserva: ' + (a.reserveMode === 'plan' ? 'preservar a meta de ' + draft.finance.plan.reserve + '% e a reserva já registrada' : a.reserveMode === 'fixed' ? 'preservar pelo menos ' + currency(a.reserveMonthlyCents) + ' por mês e a reserva já registrada' : 'não informada') +
      '.\n• Dinheiro livre na compra: ' + absent(a.spendableCashCents) + '.' + (draft.terms.count ? '\n• Limite disponível do cartão: ' + absent(a.cardLimitCents) + '.' : '') +
      '\n\nOs registros podem estar incompletos. Confirme também os gastos e as rendas já cadastrados. Digite confirmar para calcular, ou recomeçar. Nada será salvo nas suas finanças.';
  }
  function resultText() {
    const results = evaluate(draft.finance, draft.terms, draft.assumptions), lines = [draft.name + ' · projeção de ' + draft.finance.months.length + ' meses, somente deste perfil.'];
    for (const option of results) {
      const title = option.key === 'cash' ? 'À vista' : 'Parcelado no cartão';
      lines.push('\n' + title + ' — ' + currency(option.totalCents));
      if (option.status === 'over') {
        lines.push(firm ? 'Não compre agora nesta condição. Ela compromete o cenário informado.' : 'Esta condição não cabe no cenário informado. Vale adiar ou ajustar a compra.');
        for (const row of option.deficits.slice(0, 4)) lines.push('• ' + monthLabel(row.month) + ': faltariam ' + currency(-row.afterCents) + ' após despesas, reserva e compra' + (row.beforeCents < 0 ? '; o mês já estava negativo antes dela' : '') + '.');
        if (option.deficits.length > 4) lines.push('• Outros ' + (option.deficits.length - 4) + ' meses também ficariam negativos.');
        if (option.cashShortfallCents) lines.push('• Faltam ' + currency(option.cashShortfallCents) + ' no dinheiro livre informado para a compra/entrada.');
        if (option.limitShortfallCents) lines.push('• O total financiado supera o limite disponível em ' + currency(option.limitShortfallCents) + '.');
        lines.push('Para caber, reduza o custo ou ajuste as despesas/renda nos meses apontados. Adiar só ajuda se o cenário do novo mês permitir. Refaça a simulação depois de conferir.');
      } else if (option.status === 'insufficient') lines.push(firm ? 'Não decida esta compra ainda. O Modo firme aguarda os dados que faltam.' : 'Ainda não dá para dizer se cabe: faltam dados.');
      else {
        const lowest = option.rows.reduce((best, row) => row.afterCents < best.afterCents ? row : best);
        lines.push('Cabe no orçamento informado, preservando a reserva escolhida. A menor sobra mensal projetada é ' + currency(lowest.afterCents) + ' em ' + monthLabel(lowest.month) + '.');
        lines.push('Isso não garante saldo no dia do vencimento nem aprovação do cartão. Confira se seus registros estão completos.');
      }
      if (option.missing.length) lines.push('A confirmar: ' + option.missing.slice(0, 4).join('; ') + (option.missing.length > 4 ? '; e outros ' + (option.missing.length - 4) + ' meses/dados' : '') + '.');
      if (option.key === 'card') lines.push(option.extraCostCents > 0 ? 'O parcelamento custa ' + currency(option.extraCostCents) + ' a mais que à vista.' : option.extraCostCents < 0 ? 'Pelos preços informados, parcelar custa ' + currency(-option.extraCostCents) + ' a menos; confira a oferta.' : 'O total parcelado é igual ao preço à vista informado.');
    }
    lines.push('\nEste é um planejamento local, sem IA externa. O Modo firme é opcional: não bloqueia banco, cartão ou o registro de uma despesa que já aconteceu. Para mudar condições, escolha Planejar uma compra.');
    return lines.join('\n');
  }
  function handle(text) {
    sync();
    const command = normalize(text);
    if (['cancelar', 'sair do planejamento'].includes(command) && draft) { clear(); return answer('Planejamento encerrado. Nenhum lançamento foi criado.'); }
    if (/^(quero planejar uma compra|planejar uma compra|planejar compra|simular compra|recomecar)$/.test(command) || (!draft && /\b(posso comprar|quero comprar|compra cabe)\b/.test(command))) {
      notice = '';
      try { snapshot({ store: Store, fromMonth: Money.today().slice(0, 7), today: Money.today(), months: 1, rowsForWindow: allRows }); }
      catch { return answer('Aguarde os dados deste perfil e confira seu acesso antes de planejar.'); }
      draft = { name: '', terms: {}, step: 'name', assumptions: {} };
      const topics = document.querySelector('.chat-topics'); if (topics) topics.open = false;
      return advance('name');
    }
    if (notice) { const message = notice; notice = ''; return answer(message); }
    if (!draft) return null;
    if (command === 'ajuda') return answer(prompt());
    const unknown = /^(nao sei|nao informado)$/.test(command), cents = moneyInput(text);
    const invalid = message => answer(message + '\n\n' + prompt());
    try {
      switch (draft.step) {
        case 'name':
          if (!text.trim() || text.trim().length > 80) return invalid('Use um nome entre 1 e 80 caracteres.');
          draft.name = text.trim(); return advance('price');
        case 'price':
          if (cents === null || cents <= 0) return invalid('Informe um valor positivo em reais, como 1.200,00.');
          draft.terms.cashCents = cents; return advance('date');
        case 'date': {
          const date = dateInput(text, Money.today());
          if (!date || date < Money.today() || monthIndex(date.slice(0, 7)) - monthIndex(Money.today().slice(0, 7)) > 23) return invalid('Escolha hoje ou uma data nos próximos 24 meses.');
          draft.terms.purchaseDate = date; return advance('count');
        }
        case 'count':
          if (/^(nao|a vista|so a vista)$/.test(command)) { draft.terms.count = 0; draft.step = 'terms'; controls(); return answer(termsSummary()); }
          if (!/^\d{1,2}$/.test(command) || Number(command) < 2 || Number(command) > 24) return invalid('Use um número de 2 a 24, ou não.');
          draft.terms.count = Number(command); return advance('total');
        case 'total':
          if (cents === null || cents < draft.terms.count) return invalid('Informe o custo total final, em reais.');
          draft.terms.totalCents = cents; return advance('down');
        case 'down':
          if (cents === null || draft.terms.totalCents - cents < draft.terms.count) return invalid('A entrada precisa deixar pelo menos um centavo por parcela.');
          draft.terms.downCents = cents; return advance('due');
        case 'due': {
          const date = dateInput(text, Money.today());
          if (!date || date < draft.terms.purchaseDate || monthIndex(addMonths(date, draft.terms.count - 1).slice(0, 7)) - monthIndex(Money.today().slice(0, 7)) > 23) return invalid('O primeiro vencimento deve ser na compra ou depois, e a última parcela deve ficar dentro dos próximos 24 meses.');
          draft.terms.firstDue = date; draft.step = 'terms'; controls(); return answer(termsSummary());
        }
        case 'terms':
          if (command !== 'confirmar') return answer(termsSummary());
          if (!prepareFinance()) { clear(); return answer('A compra ultrapassa o limite de 24 meses. Recomece com um prazo menor.'); }
          return advance(draft.missingIncome.length ? 'income' : 'extra');
        case 'income':
          if (!unknown && cents === null) return invalid('Informe a renda mensal prevista, 0 ou não sei.');
          for (const month of draft.missingIncome) draft.assumptions.incomes[month] = unknown ? null : cents;
          return advance('extra');
        case 'extra':
          if (!unknown && cents === null) return invalid('Informe um valor mensal, 0 ou não sei.');
          draft.assumptions.extraMonthlyCents = unknown ? null : cents; return advance('reserve');
        case 'reserve':
          if (command === 'confirmar') draft.assumptions.reserveMode = 'plan';
          else if (unknown) draft.assumptions.reserveMode = 'unknown';
          else if (cents !== null) { draft.assumptions.reserveMode = 'fixed'; draft.assumptions.reserveMonthlyCents = cents; }
          else return invalid('Responda confirmar, um valor mensal ou não sei.');
          return advance('cash');
        case 'cash':
          if (!unknown && cents === null) return invalid('Informe um valor livre, 0 ou não sei.');
          draft.assumptions.spendableCashCents = unknown ? null : cents;
          if (draft.terms.count) return advance('limit');
          draft.step = 'confirm'; controls(); return answer(assumptionsSummary());
        case 'limit':
          if (!unknown && cents === null) return invalid('Informe o limite disponível, 0 ou não sei.');
          draft.assumptions.cardLimitCents = unknown ? null : cents; draft.step = 'confirm'; controls(); return answer(assumptionsSummary());
        case 'confirm': {
          if (command !== 'confirmar') return answer(assumptionsSummary());
          const text = resultText(); clear(); return answer(text);
        }
      }
    } catch { clear(); return answer('Não foi possível calcular com segurança. Confira os dados e comece novamente. Nenhum lançamento foi criado.'); }
    return null;
  }
  document.querySelector('#catatau-firm')?.addEventListener('change', event => {
    const selected = event.target.checked; sync(); firm = selected; event.target.checked = selected;
    try { if (scope) localStorage.setItem(preferenceKey(scope), String(firm)); } catch { /* preference remains in this session */ }
    const note = document.querySelector('#catatau-firm-note'); if (note) note.textContent = firm ? 'Ativo: vou dizer “Não compre agora” se a compra comprometer o plano informado. Registrar despesas continua liberado.' : 'Opcional e só neste perfil. Não bloqueia banco, cartão ou registro de despesas.';
  });
  window.addEventListener('finance-update', () => { revision++; sync(); });
  window.addEventListener('pagehide', clear);
  return { ...core, sync, clear, handle };
})();