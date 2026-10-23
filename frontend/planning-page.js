/* Purchase planning stays in memory and uses the same guarded calculator as chat. */
var PlanningPage = (() => {
  'use strict';
  const names = ['name', 'cash', 'purchaseDate', 'compare', 'count', 'total', 'down', 'firstDue', 'income', 'extra', 'reserveMode', 'reserve', 'cashAvailable', 'cardLimit', 'confirm'];
  const assumptionNames = ['income', 'extra', 'reserveMode', 'reserve', 'cashAvailable', 'cardLimit', 'confirm'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const cash = value => Money.format(value / 100);
  const month = value => monthName(value);
  const index = value => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
  let scope = '', token = '', step = 'terms', values = {}, errors = {}, notice = '', plan = null, results = null, version = 0;

  function reset() {
    scope = ''; token = ''; step = 'terms'; values = {}; errors = {}; notice = ''; plan = null; results = null; version++;
  }
  function context() {
    const nextToken = CatatauPlanner.contextToken();
    const nextScope = nextToken ? JSON.stringify([Store.user.uid, Store.profile]) : '';
    if (nextScope !== scope || !nextToken) {
      reset(); scope = nextScope; token = nextToken;
      if (nextToken) values.purchaseDate = Money.today();
      return;
    }
    if (token !== nextToken) {
      const hadDraft = !!(plan || results || ['name', 'cash', 'compare', 'count', 'total', 'down', 'firstDue'].some(name => values[name]) || (values.purchaseDate && values.purchaseDate !== Money.today()));
      token = nextToken; step = 'terms'; plan = null; results = null; errors = {};
      for (const name of assumptionNames) delete values[name];
      notice = hadDraft ? 'Os registros deste perfil mudaram. Mantive os dados da compra; confira as hipóteses novamente para calcular com o orçamento atualizado.' : '';
      version++;
    }
  }
  function errorMarkup(name) { return errors[name] ? `<small class="planning-field-error" id="planning-${name}-error">${escape(errors[name])}</small>` : ''; }
  function input(name, title, options = {}) {
    const { type = 'text', hint = '', required = false, placeholder = '', min, max, maxLength = 24 } = options;
    return `<label class="planning-field" for="planning-${name}"><span>${escape(title)}</span><input id="planning-${name}" name="${name}" type="${type}" value="${escape(values[name] || '')}" ${required ? 'required' : ''} ${type === 'text' && name !== 'name' ? 'inputmode="decimal"' : ''} ${min !== undefined ? `min="${escape(min)}"` : ''} ${max !== undefined ? `max="${escape(max)}"` : ''} maxlength="${maxLength}" placeholder="${escape(placeholder)}" autocomplete="off" ${errors[name] ? 'aria-invalid="true"' : ''} aria-describedby="planning-${name}-hint${errors[name] ? ` planning-${name}-error` : ''}"><small id="planning-${name}-hint">${escape(hint)}</small>${errorMarkup(name)}</label>`;
  }
  function alertMarkup() { return Object.keys(errors).length ? '<p class="planning-form-error" role="alert">Confira os campos sinalizados para continuar.</p>' : ''; }
  function termsForm() {
    return `<form id="planning-terms-form" class="planning-card" novalidate><div class="planning-step"><span>1 de 2</span><h2>O que está nos seus planos?</h2></div><p class="planning-copy">Pode ser uma compra ou uma despesa que você está considerando. Vamos olhar o custo inteiro, antes de decidir.</p>${alertMarkup()}<div class="planning-fields">${input('name', 'Nome da compra', { required: true, maxLength: 80, placeholder: 'Ex.: uma geladeira' })}${input('cash', 'Preço total à vista (R$)', { required: true, placeholder: '0,00', hint: 'Inclua frete e taxas.' })}${input('purchaseDate', 'Quando pretende comprar?', { required: true, type: 'date', min: Money.today(), hint: 'Hoje ou uma data nos próximos 24 meses.' })}</div><label class="planning-check"><input name="compare" type="checkbox" ${values.compare ? 'checked' : ''} aria-controls="planning-installments" aria-expanded="${!!values.compare}"><span>Comparar com parcelamento no cartão</span></label><fieldset id="planning-installments" class="planning-fields planning-installments" ${values.compare ? '' : 'hidden'}><legend>Condições do parcelamento</legend>${input('count', 'Quantidade de parcelas', { type: 'number', min: 2, max: 24, hint: 'De 2 a 24 parcelas.' })}${input('total', 'Total final parcelado (R$)', { hint: 'Entrada + todas as parcelas, juros, frete e taxas.' })}${input('down', 'Entrada (R$)', { hint: 'Digite 0 se não houver entrada.' })}${input('firstDue', 'Primeiro vencimento', { type: 'date', hint: 'Informe a data real da primeira parcela.' })}</fieldset><div class="planning-form-actions"><button class="button primary" type="submit">Conferir meu cenário <span aria-hidden="true">→</span></button></div><p class="planning-footnote">Esta simulação não cria uma despesa nem realiza uma compra.</p></form>`;
  }
  function assumptionsForm() {
    const missing = plan.finance.months.filter(item => !item.incomeKnown).map(item => item.month);
    return `<form id="planning-assumptions-form" class="planning-card" novalidate><div class="planning-step"><span>2 de 2</span><h2>Vamos conferir as pistas, sô?</h2></div><p class="planning-copy"><strong>${escape(plan.name)}</strong> · ${cash(plan.terms.cashCents)} à vista${plan.terms.count ? ` · comparação com ${plan.terms.count} parcelas, total ${cash(plan.terms.totalCents)}` : ''}. Projeção de ${escape(month(plan.finance.fromMonth))} a ${escape(month(plan.finance.toMonth))}.</p><p class="planning-copy">Os registros do perfil entram na conta. Complete só o que você sabe: <strong>campo vazio significa “não sei”</strong>. Digite 0 apenas quando tiver certeza de que não haverá esse valor.</p>${alertMarkup()}${missing.length ? `<div class="planning-missing"><details><summary>Falta renda registrada em ${missing.length} ${missing.length === 1 ? 'mês' : 'meses'}</summary><p>${escape(missing.map(month).join(', '))}.</p></details>${input('income', 'Renda líquida prevista por mês sem registro (R$)', { hint: 'O valor que você informar será aplicado a cada mês listado acima, só nesta simulação. Não repetimos seu salário automaticamente.' })}</div>` : '<p class="planning-copy">Há renda registrada em todos os meses da projeção. Usaremos o valor de cada mês.</p>'}<div class="planning-fields">${input('extra', 'Outros gastos mensais previstos (R$)', { hint: 'Mercado, transporte e outras despesas que ainda não estão nos lançamentos. 0 confirma que já incluiu tudo.' })}<label class="planning-field" for="planning-reserveMode"><span>Quanto preservar para a reserva?</span><select id="planning-reserveMode" name="reserveMode" aria-describedby="planning-reserveMode-hint"><option value="" ${!values.reserveMode ? 'selected' : ''}>Ainda não sei</option><option value="plan" ${values.reserveMode === 'plan' ? 'selected' : ''}>Meta de ${plan.finance.plan.reserve}% da renda</option><option value="fixed" ${values.reserveMode === 'fixed' ? 'selected' : ''}>Informar um valor mensal</option><option value="unknown" ${values.reserveMode === 'unknown' ? 'selected' : ''}>Não sei informar agora</option></select><small id="planning-reserveMode-hint">${plan.finance.planKnown ? 'Meta do plano deste perfil.' : 'A meta de 50/20/30 é o padrão; só será usada se você escolher essa opção.'} Preservamos o maior valor entre a escolha e a reserva registrada no mês.</small></label><div id="planning-fixed-reserve" ${values.reserveMode === 'fixed' ? '' : 'hidden'}>${input('reserve', 'Reserva mensal a preservar (R$)', { hint: 'Não é o total já acumulado nas metas.' })}</div>${input('cashAvailable', 'Dinheiro livre no dia da compra (R$)', { hint: 'Depois de separar contas, reserva e metas. O saldo projetado do app não é o saldo do banco.' })}${plan.terms.count ? input('cardLimit', 'Limite disponível do cartão (R$)', { hint: 'Conferimos o total financiado, e não só uma parcela.' }) : ''}</div><label class="planning-check planning-confirm"><input name="confirm" type="checkbox" ${values.confirm ? 'checked' : ''} ${errors.confirm ? 'aria-invalid="true" aria-describedby="planning-confirm-error"' : ''}><span>Conferi os valores e datas da compra, os registros do perfil e as hipóteses acima. Entendi quais dados ainda faltam.</span></label>${errorMarkup('confirm')}<div class="planning-form-actions"><button class="button secondary" type="button" data-planning-action="back">Voltar à compra</button><button class="button primary" type="submit">Ver a análise do Catatau</button></div><p class="planning-footnote">Nada deste formulário é salvo nos lançamentos. As hipóteses valem somente para esta simulação.</p></form>`;
  }
  function resultMarkup() {
    const overall = results.some(item => item.status === 'over') ? 'over' : results.some(item => item.status === 'insufficient') ? 'insufficient' : 'within';
    const labels = { over: 'Melhor ajustar antes', insufficient: 'Ainda faltam pistas', within: 'Cabe no cenário informado' };
    return `<section id="planning-result" class="planning-card" data-status="${overall}" aria-labelledby="planning-result-title"><span class="eyebrow">ANÁLISE DESTA SIMULAÇÃO</span><h2 id="planning-result-title" tabindex="-1">${escape(plan.name)}</h2><div class="planning-results">${results.map(item => `<article class="planning-option" data-status="${item.status}"><span>${item.key === 'cash' ? 'À vista' : 'Parcelado no cartão'}</span><strong>${cash(item.totalCents)}</strong><b class="planning-status">${labels[item.status]}</b>${item.key === 'card' ? `<small>${plan.terms.count} parcelas · entrada ${cash(item.upfrontCents)}</small>` : ''}</article>`).join('')}</div><div id="planning-result-copy" class="planning-result-copy">${escape(CatatauPlanner.describeResult(plan))}</div>${overall === 'over' ? '<p class="planning-pause">Dê uma pausa antes de decidir. Você pode ajustar o valor ou refazer a análise quando o orçamento mudar. O Catatau cuida do plano com você, sem bronca.</p>' : ''}<details class="planning-projection"><summary>Ver a conta mês a mês</summary>${results.map(item => `<h3>${item.key === 'cash' ? 'À vista' : 'Parcelado'}</h3><div class="planning-table-wrap" tabindex="0" aria-label="Projeção mensal ${item.key === 'cash' ? 'à vista' : 'parcelada'}"><table><caption>Valores projetados em reais. “Falta informar” não significa zero.</caption><thead><tr><th scope="col">Mês</th><th scope="col">Renda</th><th scope="col">Despesas já registradas</th><th scope="col">Outros gastos</th><th scope="col">Reserva</th><th scope="col">Compra</th><th scope="col">Sobra</th></tr></thead><tbody>${item.rows.map(row => `<tr><th scope="row">${escape(month(row.month))}</th>${['incomeCents', 'existingCents', 'extraCents', 'reserveCents', 'purchaseCents', 'afterCents'].map(key => `<td>${row[key] === null ? 'Falta informar' : cash(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</details><div class="planning-form-actions"><button class="button secondary" type="button" data-planning-action="back">Ajustar esta compra</button><button class="button primary" type="button" data-planning-action="new">Planejar outra compra</button></div></section>`;
  }
  function page() {
    context();
    const ready = !!token, firm = ready && CatatauPlanner.isFirm();
    return `<div id="planning-page" class="planning-page" data-planning-version="${version}"><header class="planning-heading"><div><span class="eyebrow">UM PASSO ANTES DE COMPRAR</span><h1>Planejar com o Catatau</h1><p>Seu orçamento merece companhia. Vamos cuidar do mês e pensar nas próximas compras juntos.</p>${ready ? '<button type="button" class="text-button planning-start" data-planning-action="start">Ir para a compra <span aria-hidden="true">↓</span></button>' : ''}</div><img data-catatau src="${escape(CatatauPlanner.image())}" width="128" height="128" alt="Catatau, seu companheiro de planos"></header>${ready ? `<section class="planning-mode" aria-label="Modo de orientação"><div><h2>Um xerife do seu lado</h2><p id="planning-mode-note">${firm ? 'Ronda ligada: avisos no Início e orientação firme antes de assumir uma compra.' : 'Ative para ver avisos do Catatau no Início quando os registros pedirem atenção.'}</p><small>Preferência só deste perfil e deste navegador. Não bloqueia banco, cartão nem o registro de uma despesa.</small></div><label class="planning-firm-label"><input id="planning-firm" type="checkbox" ${firm ? 'checked' : ''} aria-describedby="planning-mode-note"><span>Modo firme</span></label></section>${typeof PlanningWatch !== 'undefined' ? PlanningWatch.page() : ''}<p id="planning-notice" class="planning-notice" role="status" ${notice ? '' : 'hidden'}>${escape(notice)}</p>${step === 'terms' ? termsForm() : step === 'assumptions' ? assumptionsForm() : resultMarkup()}` : '<section class="planning-card"><h2>Vamos esperar este perfil carregar</h2><p>Selecione um perfil ao qual você tenha acesso. As informações de outra conta não entram nesta análise.</p></section>'}</div>`;
  }
  function repaint(focus) {
    const root = document.querySelector('#planning-page');
    if (!root) return;
    root.outerHTML = page();
    if (typeof PlanningWatch !== 'undefined') PlanningWatch.sync();
    if (focus) document.querySelector(focus)?.focus({ preventScroll: false });
  }
  function sync() {
    context();
    const root = document.querySelector('#planning-page');
    if (!root) return;
    if (root.dataset.planningVersion !== String(version)) { repaint(); return; }
    const firm = CatatauPlanner.isFirm(), checkbox = root.querySelector('#planning-firm');
    if (checkbox) { checkbox.checked = firm; checkbox.disabled = !token; }
    const note = root.querySelector('#planning-mode-note');
    if (note) note.textContent = firm ? 'Ronda ligada: avisos no Início e orientação firme antes de assumir uma compra.' : 'Ative para ver avisos do Catatau no Início quando os registros pedirem atenção.';
    const copy = root.querySelector('#planning-result-copy');
    if (copy && plan && results) copy.textContent = CatatauPlanner.describeResult(plan);
  }
  function remember(form) {
    if (!token || !form) return;
    for (const field of form.elements) if (names.includes(field.name)) values[field.name] = field.type === 'checkbox' ? field.checked : field.value.slice(0, field.name === 'name' ? 80 : 24);
  }
  function fail() { version++; repaint(errors.confirm ? '[name="confirm"]' : '#planning-' + Object.keys(errors)[0]); }
  function readMoney(name, required = false) {
    const value = String(values[name] || '').trim();
    if (!value && !required) return null;
    const cents = CatatauPlanner.moneyInput(value);
    if (cents === null) errors[name] = required ? 'Informe um valor em reais, como 150,00.' : 'Use um valor em reais ou deixe vazio se não souber.';
    return cents;
  }
  function submitTerms() {
    errors = {};
    const name = String(values.name || '').trim(), terms = { cashCents: readMoney('cash', true), purchaseDate: CatatauPlanner.dateInput(values.purchaseDate), count: 0 };
    if (!name || name.length > 80) errors.name = 'Dê um nome de até 80 caracteres para esta compra.';
    if (terms.cashCents === 0) errors.cash = 'O preço precisa ser maior que zero.';
    if (!terms.purchaseDate || terms.purchaseDate < Money.today() || index(terms.purchaseDate) - index(Money.today()) > 23) errors.purchaseDate = 'Escolha hoje ou uma data nos próximos 24 meses.';
    if (values.compare) {
      terms.count = Number(values.count); terms.totalCents = readMoney('total', true); terms.downCents = readMoney('down', true); terms.firstDue = CatatauPlanner.dateInput(values.firstDue);
      if (!/^\d{1,2}$/.test(values.count || '') || terms.count < 2 || terms.count > 24) errors.count = 'Informe de 2 a 24 parcelas.';
      if (terms.totalCents !== null && terms.downCents !== null && terms.totalCents - terms.downCents < terms.count) errors.down = 'A entrada deve deixar pelo menos um centavo por parcela.';
      if (!terms.firstDue || terms.firstDue < terms.purchaseDate) errors.firstDue = 'O vencimento deve ser na data da compra ou depois dela.';
    }
    if (Object.keys(errors).length) { fail(); return; }
    try {
      const schedules = CatatauPlanner.schedules(terms), last = schedules.flatMap(item => item.events).map(item => item.date).sort().at(-1), months = Math.max(12, index(last) - index(Money.today()) + 1);
      if (months > 24) { errors.firstDue = 'A última parcela precisa ficar dentro dos próximos 24 meses.'; fail(); return; }
      const finance = CatatauPlanner.snapshot({ store: Store, fromMonth: Money.today().slice(0, 7), months, today: Money.today(), rowsForWindow: allRows });
      plan = { name, terms, finance, assumptions: {} }; results = null; step = 'assumptions'; notice = ''; values.confirm = false; version++; repaint('#planning-assumptions-form input, #planning-assumptions-form select');
    } catch { errors.cash = 'Não foi possível calcular com estes dados. Confira os valores e o acesso ao perfil.'; fail(); }
  }
  function submitAssumptions() {
    errors = {};
    if (!plan) { step = 'terms'; version++; repaint(); return; }
    const missing = plan.finance.months.filter(item => !item.incomeKnown), income = missing.length ? readMoney('income') : null;
    const assumptions = { incomes: {}, extraMonthlyCents: readMoney('extra'), spendableCashCents: readMoney('cashAvailable'), reserveMode: ['plan', 'fixed'].includes(values.reserveMode) ? values.reserveMode : 'unknown' };
    for (const item of missing) assumptions.incomes[item.month] = income;
    if (assumptions.reserveMode === 'fixed') assumptions.reserveMonthlyCents = readMoney('reserve');
    if (plan.terms.count) assumptions.cardLimitCents = readMoney('cardLimit');
    if (!values.confirm) errors.confirm = 'Confira as informações e marque a confirmação para calcular.';
    if (Object.keys(errors).length) { fail(); return; }
    try { plan.assumptions = assumptions; results = CatatauPlanner.evaluate(plan.finance, plan.terms, assumptions); step = 'result'; version++; repaint('#planning-result-title'); }
    catch { notice = 'Não foi possível concluir a análise. Confira os dados da compra e tente novamente.'; step = 'terms'; plan = null; results = null; version++; repaint('#planning-name'); }
  }
  document.addEventListener('input', event => {
    const form = event.target.closest('#planning-terms-form, #planning-assumptions-form');
    if (!form) return;
    const oldToken = token; context(); if (!token || token !== oldToken) { sync(); return; }
    remember(form);
    if (event.target.name !== 'confirm') { values.confirm = false; const checkbox = form.querySelector('[name="confirm"]'); if (checkbox) checkbox.checked = false; }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'planning-firm') { CatatauPlanner.setFirm(event.target.checked); sync(); return; }
    const form = event.target.closest('#planning-terms-form, #planning-assumptions-form');
    if (!form) return;
    const oldToken = token; context(); if (!token || token !== oldToken) { sync(); return; }
    remember(form);
    if (event.target.name === 'compare') { document.querySelector('#planning-installments').hidden = !values.compare; event.target.setAttribute('aria-expanded', String(!!values.compare)); }
    if (event.target.name === 'reserveMode') document.querySelector('#planning-fixed-reserve').hidden = values.reserveMode !== 'fixed';
    if (event.target.name !== 'confirm') { values.confirm = false; const checkbox = form.querySelector('[name="confirm"]'); if (checkbox) checkbox.checked = false; }
  });
  document.addEventListener('submit', event => {
    if (!['planning-terms-form', 'planning-assumptions-form'].includes(event.target.id)) return;
    event.preventDefault();
    const oldToken = token; context(); if (!token || token !== oldToken) { sync(); return; }
    remember(event.target);
    if (event.target.id === 'planning-terms-form') submitTerms(); else submitAssumptions();
  });
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-planning-action]')?.dataset.planningAction;
    if (!action) return;
    context(); if (!token) { sync(); return; }
    if (action === 'start') { document.querySelector('#planning-terms-form input, #planning-assumptions-form input, #planning-result-title')?.focus({ preventScroll: false }); return; }
    if (action === 'new') { reset(); context(); }
    else if (action === 'back') { step = 'terms'; plan = null; results = null; errors = {}; values.confirm = false; }
    version++; repaint('#planning-name');
  });
  window.addEventListener('finance-update', sync);
  window.addEventListener('catatau-firm-change', sync);
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', sync);
  return { page, sync, reset };
})();
