// prosed-form-logic.js — Firebase edition
import { db, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, query, where, orderBy }
  from './firebase-config.js';

// ── LOAD CONTEST ──────────────────────────────────────────────
const CID = new URLSearchParams(window.location.search).get('c');
let contest = null, coupons = [], cfg = {};

async function loadData() {
  try {
    const cf = localStorage.getItem('p_cfg');
    if (cf) cfg = JSON.parse(cf);
  } catch(e) {}

  if (!CID) { render(); return; }

  try {
    const snap = await getDoc(doc(db, 'contests', CID));
    if (snap.exists()) contest = { id: snap.id, ...snap.data() };

    const cpSnap = await getDocs(collection(db, 'coupons'));
    coupons = cpSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}

  render();
}

const PROXY = () => cfg.proxyUrl || 'https://prosed-sistema.vercel.app';

// ── STATE ─────────────────────────────────────────────────────
let step = 0, fd = {}, selFile = null;
let selSlotId = null, selCity = null, selDate = null;
let selExames = [], appliedCoupon = null;
let payMethod = 'credit', installments = 1;
let lastReg = null, pixPollTimer = null;
window._pixPaymentId = null;

// ── RENDER ────────────────────────────────────────────────────
function render() {
  updateNav();
  if (!CID) { info('⚕', 'Acesse o link do seu concurso', 'O link específico é fornecido pela PROSED.'); return; }
  if (!contest) { info('🔍', 'Concurso não encontrado', 'O link pode ser inválido ou foi removido.'); return; }
  if (contest.status === 'closed') { info('⏸', 'Período encerrado', 'O agendamento foi encerrado.'); return; }
  if (contest.status === 'draft') { info('🔒', 'Em breve', 'Este concurso ainda não está disponível.'); return; }
  [rDados, rToxico, rPacote, rAgenda, rCheckout][step]?.();
}
function info(icon, title, sub) {
  document.getElementById('steps-nav').style.display = 'none';
  document.getElementById('main').innerHTML = `<div class="not-found fade"><div class="not-found-icon">${icon}</div><h2 style="font-size:1.2rem;font-weight:800;margin-bottom:8px">${title}</h2><p style="color:var(--white-dim);font-size:.85rem">${sub}</p></div>`;
}
function updateNav() {
  document.getElementById('steps-nav').style.display = step >= 6 ? 'none' : '';
  document.querySelectorAll('.step-btn').forEach((b, i) => {
    b.classList.remove('active', 'done');
    if (i === step) b.classList.add('active');
    else if (i < step) b.classList.add('done');
  });
}
function banner() {
  return `<div class="contest-banner fade">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">
      <img src="data:image/png;base64,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" style="height:52px;width:auto;flex-shrink:0" alt="PROSED"/>
      <div>
        <div class="contest-banner-name">${contest.nome}</div>
        <div class="contest-banner-meta">${contest.orgao}${contest.prazo ? ' · Prazo: ' + contest.prazo : ''}</div>
      </div>
    </div>
    ${contest.resumo ? `<div class="contest-resumo">${contest.resumo}</div>` : ''}
  </div>`;
}

// ── STEP 1: DADOS ─────────────────────────────────────────────
function rDados() {
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  set('main', banner() + `
  <div class="s-card fade"><div class="s-title"><span class="s-num">1</span> Dados Pessoais</div>
    <div class="field" id="f-nome"><label class="fl">Nome Completo <span class="req">*</span></label>
      <input id="nome" type="text" placeholder="Nome e sobrenome" value="${h(fd.nome)}" oninput="this.value=this.value.toUpperCase()"/></div>
    <div class="field" id="f-cpf"><label class="fl">CPF <span class="req">*</span></label>
        <input id="cpf" type="tel" class="mono" placeholder="000.000.000-00" maxlength="14" value="${h(fd.cpf)}" oninput="mCPF(this)"/></div>
    </div>
    <div class="g2">
      <div class="field" id="f-rg"><label class="fl">RG <span class="req">*</span></label>
        <input id="rg" type="tel" class="mono" placeholder="0000000" oninput="this.value=this.value.replace(/\D/g,'')" value="${h(fd.rg)}" oninput="this.value=this.value.replace(/\\D/g,'')"/></div>
      <div class="field" id="f-orgao"><label class="fl">Órgão Expedidor <span class="req">*</span></label>
        <select id="orgao" onchange="tglOrgaoOutros(this)">
          <option value="">Selecione</option>
          ${['SSP','DETRAN','PC','IFP','SJS','SDS','IIP','CGP','MJ','PF'].map(o=>`<option value="${o}" ${fd.orgao===o?'selected':''}>${o}</option>`).join('')}
          <option value="outros" ${fd.orgao&&!['SSP','DETRAN','PC','IFP','SJS','SDS','IIP','CGP','MJ','PF'].includes(fd.orgao)?'selected':''}>Outros</option>
        </select>
        <input id="orgao-outros" type="text" placeholder="Digite o órgão expedidor" value="${h(!['SSP','DETRAN','PC','IFP','SJS','SDS','IIP','CGP','MJ','PF','','outros'].includes(fd.orgao)?fd.orgao:'')}" style="display:${fd.orgao&&!['SSP','DETRAN','PC','IFP','SJS','SDS','IIP','CGP','MJ','PF',''].includes(fd.orgao)?'':'none'};margin-top:8px" oninput="this.value=this.value.toUpperCase()"/>
      </div>
    </div>
    <div class="g2">
      <div class="field" id="f-uf"><label class="fl">UF do RG <span class="req">*</span></label>
        <select id="uf"><option value="">Selecione</option>${ufs.map(u => `<option ${fd.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="field" id="f-nasc"><label class="fl">Nascimento <span class="req">*</span></label>
        <input id="nasc" type="tel" class="mono" placeholder="DD/MM/AAAA" maxlength="10" value="${h(fd.nasc)}" oninput="mDate(this)"/></div>
    </div>
    <div class="g2">
      <div class="field" id="f-sexo"><label class="fl">Sexo <span class="req">*</span></label>
        <select id="sexo"><option value="">Selecione</option>
          <option ${fd.sexo === 'Masculino' ? 'selected' : ''}>Masculino</option>
          <option ${fd.sexo === 'Feminino' ? 'selected' : ''}>Feminino</option>
          <option ${fd.sexo === 'Outro' ? 'selected' : ''}>Outro</option></select></div>
      <div class="field" id="f-cel"><label class="fl">Celular <span class="req">*</span></label>
        <input id="cel" type="tel" class="mono" placeholder="(00) 00000-0000" maxlength="16" value="${h(fd.cel)}" oninput="mPhone(this)"/></div>
    </div>
    <div class="field" id="f-email"><label class="fl">E-mail <span class="req">*</span></label>
      <input id="email" type="email" placeholder="seu@email.com" value="${h(fd.email)}"/></div>
  </div>
  <div class="btn-row"><div></div><button class="btn-primary" onclick="next()">Próximo →</button></div>`);
}

// ── STEP 2: TÓXICO ────────────────────────────────────────────
function rToxico() {
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">2</span> Questionário Toxicológico</div>
    <div class="field" id="f-trat"><label class="fl">Tratamento Químico Capilar <span class="req">*</span></label>
      <div class="radio-group">
        <div class="rbtn ${fd.trat === 'Sim' ? 'sel' : ''}" onclick="sR('trat','Sim',this)"><div class="rdot"><div class="rdot-inner"></div></div>Sim</div>
        <div class="rbtn ${fd.trat === 'Não' ? 'sel' : ''}" onclick="sR('trat','Não',this)"><div class="rdot"><div class="rdot-inner"></div></div>Não</div>
      </div><input type="hidden" id="trat" value="${h(fd.trat)}"/></div>
    <div class="field" id="f-psico"><label class="fl">Uso de Medicamento Psicoativo <span class="req">*</span></label>
      <div class="radio-group">
        <div class="rbtn ${fd.psico === 'Sim' ? 'sel' : ''}" onclick="sR('psico','Sim',this);tMed()"><div class="rdot"><div class="rdot-inner"></div></div>Sim</div>
        <div class="rbtn ${fd.psico === 'Não' ? 'sel' : ''}" onclick="sR('psico','Não',this);tMed()"><div class="rdot"><div class="rdot-inner"></div></div>Não</div>
      </div><input type="hidden" id="psico" value="${h(fd.psico)}"/></div>
    <div class="field" id="f-med" style="display:${fd.psico === 'Sim' ? '' : 'none'}">
      <label class="fl">Qual medicamento? <span class="req">*</span></label>
      <input id="med" type="text" placeholder="Nome do medicamento" value="${h(fd.med)}"/></div>
    <div class="field" id="f-coleta"><label class="fl">Local da Coleta <span class="req">*</span></label>
      <select id="coleta"><option value="">Selecione</option>
        <option ${fd.coleta === 'Cabelo' ? 'selected' : ''}>Cabelo</option>
        <option ${fd.coleta === 'Pelo corporal' ? 'selected' : ''}>Pelo corporal</option></select></div>
  </div>
  <div class="btn-row"><button class="btn-ghost" onclick="prev()">← Voltar</button><button class="btn-primary" onclick="next()">Próximo →</button></div>`);
}

// ── STEP 3: PACOTE ────────────────────────────────────────────
function rPacote() {
  const pacs = contest.pacotes || [], exs = contest.exames || [];
  const pkgH = pacs.map(p => `<div class="pkg-card ${fd.pacoteId === p.id ? 'sel' : ''}" onclick="sPac('${p.id}','${h(p.nome)}',${parseFloat(p.preco) || 0},this)">
    <div><div class="pkg-name">${p.nome}</div><div class="pkg-desc">${p.desc || ''}</div></div>
    <div class="pkg-price">R$&nbsp;${brl(parseFloat(p.preco) || 0)}</div></div>`).join('');
  const avH = exs.length ? `<div class="pkg-card ${fd.pacoteId === 'avulsos' ? 'sel' : ''}" onclick="sPac('avulsos','Exames Complementares Avulsos',0,this)">
    <div><div class="pkg-name">Exames Complementares Avulsos</div><div class="pkg-desc">Selecione individualmente os exames desejados</div></div>
    <div class="pkg-price" style="color:var(--amber)">Variável</div></div>` : '';
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">3</span> Grupo de Indicação e Pacote</div>
    <div class="field" id="f-grupo"><label class="fl">Grupo de Indicação <span class="req">*</span></label>
      <select id="grupo"><option value="">Selecione</option>
        <option value="geral" ${fd.grupo === 'geral' ? 'selected' : ''}>Grupo Geral de Exames</option>
        <option value="furlani" ${fd.grupo === 'furlani' ? 'selected' : ''}>Grupo Furlani + Grupo Geral</option></select></div>
    <div class="field" id="f-pacote"><label class="fl">Tipo de Pacote <span class="req">*</span></label>
      ${pkgH}${avH}</div>
    <div id="av-sec" style="display:${fd.pacoteId === 'avulsos' ? '' : 'none'}">
      <label class="fl" style="display:block;margin:14px 0 8px">Selecione os exames</label>
      <div class="exam-check-list">
        ${exs.map(e => `<div class="exam-check ${selExames.includes(e.id) ? 'sel' : ''}" onclick="tEx('${e.id}',this)">
          <div class="exam-check-left"><div class="chk">${selExames.includes(e.id) ? '✓' : ''}</div><span>${e.nome}</span></div>
          <span class="exam-price">${e.preco ? 'R$ ' + brl(parseFloat(e.preco)) : '—'}</span></div>`).join('')}
      </div>
      <div style="font-size:.78rem;color:var(--teal-light);margin-top:10px">Subtotal: <strong id="av-sub">R$ 0,00</strong></div>
    </div>
  </div>
  <div class="btn-row"><button class="btn-ghost" onclick="prev()">← Voltar</button><button class="btn-primary" onclick="next()">Próximo →</button></div>`);
  uAvSub();
}
function sPac(id, nome, preco, el) {
  fd.pacoteId = id; fd.pacoteLabel = nome; fd.pacotePreco = preco;
  document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('sel')); el.classList.add('sel');
  const s = document.getElementById('av-sec'); if (s) s.style.display = id === 'avulsos' ? '' : 'none';
  clrE('f-pacote');
}
function tEx(id, el) {
  const i = selExames.indexOf(id); if (i >= 0) selExames.splice(i, 1); else selExames.push(id);
  el.classList.toggle('sel', selExames.includes(id)); el.querySelector('.chk').textContent = selExames.includes(id) ? '✓' : '';
  uAvSub();
}
function uAvSub() {
  const total = selExames.reduce((a, id) => { const e = (contest.exames || []).find(x => x.id === id); return a + (e ? parseFloat(e.preco) || 0 : 0); }, 0);
  const el = document.getElementById('av-sub'); if (el) el.textContent = 'R$ ' + brl(total);
  if (fd.pacoteId === 'avulsos') fd.pacotePreco = total;
}

// ── STEP 4: AGENDA ────────────────────────────────────────────
function rAgenda() {
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">4</span> Agendamento</div>
    <div class="sched-steps">
      <div class="sched-step" id="sc-city"><div class="sched-step-title"><span class="ss-num">A</span> Escolha a unidade</div><div class="city-grid" id="city-grid"></div></div>
      <div class="sched-step ${selCity ? '' : 'locked'}" id="sc-date"><div class="sched-step-title"><span class="ss-num">B</span> Escolha a data</div><div class="date-grid" id="date-grid"></div></div>
      <div class="sched-step ${selDate ? '' : 'locked'}" id="sc-time"><div class="sched-step-title"><span class="ss-num">C</span> Escolha o horário</div><div class="time-grid" id="time-grid"></div></div>
    </div>
    <div class="field" id="f-slot" style="margin-top:4px"></div>
  </div>
  <div class="btn-row"><button class="btn-ghost" onclick="prev()">← Voltar</button><button class="btn-primary" onclick="next()">Próximo →</button></div>`);
  rCities();
  if (selCity) rDates(selCity);
  if (selDate) rTimes(selCity, selDate);
}
function getCities() { return [...new Set((contest.slots || []).map(s => s.city))]; }
function getDates(city) { return [...new Set((contest.slots || []).filter(s => s.city === city).map(s => s.date))]; }
function getSlots(city, date) { return (contest.slots || []).filter(s => s.city === city && s.date === date); }
function rCities() {
  set('city-grid', getCities().map(city => {
    const avail = (contest.slots || []).filter(s => s.city === city).reduce((a, s) => a + (s.max - s.booked), 0);
    return `<div class="city-card ${selCity === city ? 'sel' : ''}" onclick="pCity('${city}',this)">
      <div class="city-name">📍 ${city}</div><div class="city-meta">${avail > 0 ? avail + ' vaga' + (avail !== 1 ? 's' : '') : '⛔ Esgotado'}</div></div>`;
  }).join(''));
}
function pCity(city, el) {
  selCity = city; selDate = null; selSlotId = null;
  document.querySelectorAll('.city-card').forEach(c => c.classList.remove('sel')); el.classList.add('sel');
  clrE('f-slot'); rDates(city);
  document.getElementById('sc-date').classList.remove('locked');
  document.getElementById('sc-time').classList.add('locked');
  set('time-grid', '');
}
function rDates(city) {
  set('date-grid', getDates(city).map(date => {
    const avail = getSlots(city, date).reduce((a, s) => a + (s.max - s.booked), 0);
    const full = avail <= 0; const parts = date.split('/');
    const col = full ? 'var(--red)' : avail < 10 ? 'var(--amber)' : 'var(--teal)';
    return `<div class="date-card ${full ? 'full' : ''} ${selDate === date ? 'sel' : ''}" onclick="pDate('${city}','${date}',this)">
      <div class="date-day">${parts[0]}</div>
      <div class="date-month">${mabb(parts[1])} ${(parts[2] || '').slice(2)}</div>
      <div class="date-vagas" style="color:${col}">● ${full ? 'Esgotado' : avail + ' vagas'}</div></div>`;
  }).join(''));
}
function pDate(city, date, el) {
  selDate = date; selSlotId = null;
  document.querySelectorAll('.date-card').forEach(c => c.classList.remove('sel')); el.classList.add('sel');
  rTimes(city, date); document.getElementById('sc-time').classList.remove('locked');
}
function rTimes(city, date) {
  set('time-grid', getSlots(city, date).map(s => {
    const avail = s.max - s.booked; const full = avail <= 0;
    const col = full ? 'var(--red)' : avail < 5 ? 'var(--amber)' : 'var(--teal)';
    return `<div class="time-card ${full ? 'full' : ''} ${selSlotId === s.id ? 'sel' : ''}" onclick="pTime('${s.id}',this)">
      🕐 ${s.time}<span class="time-vagas" style="color:${col}">${full ? 'Esgotado' : avail + ' vagas'}</span></div>`;
  }).join(''));
}
function pTime(id, el) { selSlotId = id; document.querySelectorAll('.time-card').forEach(c => c.classList.remove('sel')); el.classList.add('sel'); clrE('f-slot'); }
function mabb(m) { return ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][+m] || m; }

// ── STEP 5: DOCS ──────────────────────────────────────────────
function rDocs() {
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">5</span> Comprovante de Inscrição</div>
    <div class="field" id="f-file">
      <div class="upload-zone ${selFile ? 'has-file' : ''}" onclick="document.getElementById('fi').click()">
        <div style="font-size:1.6rem;margin-bottom:6px">${selFile ? '✅' : '📎'}</div>
        <div style="font-weight:600;font-size:.88rem">${selFile ? selFile.name : 'Toque para selecionar'}</div>
        <div style="font-size:.74rem;color:var(--white-dim);margin-top:4px">${selFile ? (selFile.size / 1024 / 1024).toFixed(2) + ' MB' : 'PDF, JPG ou PNG · Máx. 10MB'}</div>
      </div>
      <input type="file" id="fi" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="hFile(this)"/>
    </div>
  </div>
  <div class="s-card fade"><div class="s-title"><span class="s-num">6</span> Observações (opcional)</div>
    <textarea id="obs" placeholder="Informações adicionais...">${h(fd.obs)}</textarea></div>
  <div class="btn-row"><button class="btn-ghost" onclick="prev()">← Voltar</button><button class="btn-primary" onclick="next()">Ir para Checkout →</button></div>`);
}
function hFile(inp) {
  const file = inp.files[0]; if (!file) return;
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) { showE('f-file', 'Formato inválido.'); return; }
  if (file.size > 10 * 1024 * 1024) { showE('f-file', 'Arquivo maior que 10MB.'); return; }
  selFile = file; render();
}

// ── STEP 6: CHECKOUT ──────────────────────────────────────────
function calcT() {
  let base = fd.pacotePreco || 0;
  if (fd.pacoteId === 'avulsos') base = selExames.reduce((a, id) => { const e = (contest.exames || []).find(x => x.id === id); return a + (e ? parseFloat(e.preco) || 0 : 0); }, 0);
  let disc = 0;
  if (appliedCoupon) disc = appliedCoupon.type === 'percent' ? base * (appliedCoupon.value / 100) : Math.min(appliedCoupon.value, base);
  return { base, disc, total: Math.max(0, base - disc) };
}

function rCheckout() {
  const { base, disc, total } = calcT();
  const slot = (contest.slots || []).find(s => s.id === selSlotId);
  const exNoms = selExames.map(id => (contest.exames || []).find(x => x.id === id)?.nome || id);
  const maxP = contest.maxParcelas || 1;
  const instOpts = maxP > 1 && total > 0 ? `<div class="field" style="margin-top:14px"><label class="fl">Parcelamento</label>
    <div class="installment-opts" id="inst-opts">
      ${Array.from({ length: maxP }, (_, i) => i + 1).map(n => `<div class="inst-opt ${installments === n ? 'sel' : ''}" onclick="sInst(${n},this)">${n}x R$ ${brl(total / n)}${n === 1 ? ' à vista' : ''}</div>`).join('')}
    </div></div>` : '';

  set('main', `<div class="checkout-section fade">
    <div style="font-size:1.2rem;font-weight:800;margin-bottom:4px">🛒 Checkout</div>
    <div style="font-size:.82rem;color:var(--white-dim);margin-bottom:22px">Revise e realize o pagamento.</div>
    <div class="s-card">
      <div class="s-title">Resumo do Pedido</div>
      <table class="order-table">
        <tr><td>Candidato</td><td style="text-align:right;font-weight:600">${h(fd.nome)}</td></tr>
        <tr><td>Concurso</td><td style="text-align:right">${contest.nome}</td></tr>
        <tr><td>Unidade</td><td style="text-align:right">${slot?.city || '–'}</td></tr>
        <tr><td>Data · Hora</td><td style="text-align:right">${slot?.date || '–'} · ${slot?.time || '–'}</td></tr>
        <tr><td>Pacote</td><td style="text-align:right">${fd.pacoteLabel || '–'}</td></tr>
        ${exNoms.length ? `<tr><td style="vertical-align:top">Exames</td><td style="text-align:right;font-size:.78rem">${exNoms.join('<br>')}</td></tr>` : ''}
        <tr><td>Subtotal</td><td style="text-align:right">R$ ${brl(base)}</td></tr>
        ${disc > 0 ? `<tr class="order-discount"><td>Desconto (${appliedCoupon.code})</td><td style="text-align:right">– R$ ${brl(disc)}</td></tr>` : ''}
        <tr class="order-total"><td>Total</td><td style="text-align:right">R$ ${brl(total)}</td></tr>
      </table>
      <div class="coupon-row">
        <input type="text" id="cup-inp" placeholder="CUPOM DE DESCONTO" value="${appliedCoupon ? appliedCoupon.code : ''}" oninput="this.value=this.value.toUpperCase()"/>
        <button class="btn-teal btn-sm" onclick="apCup()" style="white-space:nowrap">${appliedCoupon ? '✓ Aplicado' : 'Aplicar'}</button>
        ${appliedCoupon ? `<button class="btn-ghost btn-sm" onclick="rmCup()" style="color:var(--red);border-color:rgba(255,71,87,.3)">✕</button>` : ''}
      </div>
      ${appliedCoupon ? `<div style="font-size:.76rem;color:var(--green);margin-top:6px">✓ ${appliedCoupon.code}: ${appliedCoupon.type === 'percent' ? appliedCoupon.value + '%' : 'R$ ' + brl(appliedCoupon.value)} de desconto</div>` : ''}
    </div>
    ${total > 0 ? `<div class="s-card">
      <div class="s-title">Forma de Pagamento</div>
      <div class="pay-methods">
        <div class="pay-method ${payMethod === 'credit' ? 'sel' : ''}" onclick="sPay('credit',this)"><div class="pay-icon">💳</div><div class="pay-name">Crédito</div></div>
        <div class="pay-method ${payMethod === 'debit' ? 'sel' : ''}" onclick="sPay('debit',this)"><div class="pay-icon">🏧</div><div class="pay-name">Débito</div></div>
        <div class="pay-method ${payMethod === 'pix' ? 'sel' : ''}" onclick="sPay('pix',this)"><div class="pay-icon">📱</div><div class="pay-name">PIX</div></div>
      </div>
      <div id="card-sec" style="display:${payMethod !== 'pix' ? '' : 'none'}">
        <div class="field"><label class="fl">Número do Cartão <span class="req">*</span></label>
          <input id="card-num" type="tel" class="mono" placeholder="0000 0000 0000 0000" maxlength="19" oninput="mCard(this)"/></div>
        <div class="card-grid">
          <div class="field"><label class="fl">Nome no Cartão <span class="req">*</span></label>
            <input id="card-name" type="text" placeholder="NOME SOBRENOME" oninput="this.value=this.value.toUpperCase()"/></div>
          <div class="field"><label class="fl">Validade <span class="req">*</span></label>
            <input id="card-exp" type="tel" class="mono" placeholder="MM/AA" maxlength="5" oninput="mExp(this)"/></div>
          <div class="field"><label class="fl">CVV <span class="req">*</span></label>
            <input id="card-cvv" type="tel" class="mono" placeholder="000" maxlength="4"/></div>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--white-dim);margin-bottom:10px">Endereço de cobrança</div>
          <div class="cep-row">
            <div class="field" style="margin-bottom:10px"><label class="fl">CEP <span class="req">*</span></label>
              <input id="card-cep" type="tel" class="mono" placeholder="00000-000" maxlength="9" oninput="mCEP(this)"/></div>
            <div class="field" style="margin-bottom:10px"><label class="fl">Número <span class="req">*</span></label>
              <input id="card-numend" type="text" placeholder="123"/></div>
          </div>
        </div>
        ${payMethod === 'credit' ? instOpts : ''}
      </div>
      <div id="pix-sec" style="display:${payMethod === 'pix' ? '' : 'none'}">
        <div id="pix-pend">
          <div style="font-size:.84rem;color:var(--white-dim);margin-bottom:14px;line-height:1.6">Clique em <strong>"Gerar PIX"</strong> para criar a cobrança.</div>
          <button class="btn-teal" id="btn-pix" onclick="gPIX()">📱 Gerar QR Code PIX</button>
        </div>
        <div id="pix-gen" style="display:none">
          <div class="pix-box">
            <div style="font-size:.84rem;color:var(--white-dim)">Escaneie o QR Code ou copie a chave PIX</div>
            <div class="pix-qr-wrap" id="pix-qr"><div style="font-size:4rem">🟦</div></div>
            <div style="font-size:.75rem;color:var(--white-dim);margin-bottom:4px">Valor: <strong style="color:var(--teal-light)">R$ ${brl(total)}</strong></div>
            <div class="pix-copiae" id="pix-ce"></div>
            <div style="margin-top:10px"><button class="btn-ghost btn-sm" onclick="cpPix()">📋 Copiar chave PIX</button></div>
            <div class="pix-poll"><div class="poll-dot"></div><span>Aguardando confirmação do pagamento...</span></div>
          </div>
        </div>
      </div>
    </div>` : `<div class="s-card" style="text-align:center;padding:20px"><div style="font-size:1.5rem;margin-bottom:8px">🎉</div><div style="font-weight:700;font-size:1rem">Total: R$ 0,00 — Desconto total!</div></div>`}
    <div class="btn-row" id="co-btns">
      <button class="btn-ghost" onclick="prev()">← Voltar</button>
      ${total > 0 && payMethod !== 'pix' ? `<button class="btn-primary" id="pay-btn" onclick="subCard()"><span id="pay-txt">${payMethod === 'credit' ? '💳 Pagar com Crédito' : '🏧 Pagar com Débito'}</span></button>` : ''}
      ${total === 0 ? `<button class="btn-primary" onclick="finZero()">✅ Confirmar Cadastro</button>` : ''}
    </div>
  </div>`);
}

function sPay(m, el) {
  payMethod = m; installments = 1;
  document.querySelectorAll('.pay-method').forEach(c => c.classList.remove('sel')); el.classList.add('sel');
  document.getElementById('card-sec').style.display = m !== 'pix' ? '' : 'none';
  document.getElementById('pix-sec').style.display = m === 'pix' ? '' : 'none';
  const btn = document.getElementById('pay-btn');
  if (btn) { btn.style.display = m !== 'pix' ? '' : 'none'; if (m !== 'pix') document.getElementById('pay-txt').textContent = m === 'credit' ? '💳 Pagar com Crédito' : '🏧 Pagar com Débito'; }
}
function sInst(n, el) { installments = n; document.querySelectorAll('.inst-opt').forEach(c => c.classList.remove('sel')); el.classList.add('sel'); }

// ── ASAAS CARTÃO ──────────────────────────────────────────────
async function subCard() {
  const num = v('card-num'), name = v('card-name'), exp = v('card-exp'), cvv = v('card-cvv'), cep = v('card-cep'), nend = v('card-numend');
  if (!num || !name || !exp || !cvv || !cep || !nend) { showToast('Preencha todos os dados do cartão.', 'err'); return; }
  const [eM, eY] = exp.split('/');
  const btn = document.getElementById('pay-btn'); if (btn) btn.disabled = true;
  set('pay-txt', '<span class="spin"></span> Processando…');
  try {
    const cr = await pp('/asaas/customer', { name: fd.nome, cpfCnpj: fd.cpf, email: fd.email, mobilePhone: fd.cel });
    if (cr.error) throw new Error(cr.error);
    const { total } = calcT();
    const ep = payMethod === 'credit' ? '/asaas/pay/credit' : '/asaas/pay/debit';
    const pr = await pp(ep, {
      customerId: cr.customerId, value: total,
      description: `PROSED – ${contest.nome} – ${fd.nome}`,
      installmentCount: installments,
      card: { holderName: name, number: num.replace(/\s/g, ''), expiryMonth: eM, expiryYear: '20' + eY, ccv: cvv },
      holderInfo: { name: fd.nome, email: fd.email, cpfCnpj: fd.cpf, postalCode: cep.replace(/\D/g, ''), addressNumber: nend, phone: fd.cel }
    });
    if (pr.error) throw new Error(Array.isArray(pr.error) ? pr.error.map(e => e.description).join(', ') : pr.error);
    await finalize(pr.paymentId, 'paid');
  } catch(e) {
    showToast('Erro no pagamento: ' + e.message, 'err');
    if (btn) btn.disabled = false;
    set('pay-txt', payMethod === 'credit' ? '💳 Pagar com Crédito' : '🏧 Pagar com Débito');
  }
}

// ── ASAAS PIX ─────────────────────────────────────────────────
async function gPIX() {
  const btn = document.getElementById('btn-pix'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Gerando…'; }
  try {
    const cr = await pp('/asaas/customer', { name: fd.nome, cpfCnpj: fd.cpf, email: fd.email, mobilePhone: fd.cel });
    if (cr.error) throw new Error(cr.error);
    const { total } = calcT();
    const pr = await pp('/asaas/pay/pix', { customerId: cr.customerId, value: total, description: `PROSED – ${contest.nome} – ${fd.nome}` });
    if (pr.error) throw new Error(pr.error);
    set('pix-pend', '<div style="color:var(--teal-light);font-weight:600">✓ PIX gerado!</div>');
    document.getElementById('pix-gen').style.display = '';
    if (pr.encodedImage) set('pix-qr', `<img src="data:image/png;base64,${pr.encodedImage}" style="width:100%;height:100%"/>`);
    set('pix-ce', pr.pixCopiaECola || '');
    startPoll(pr.paymentId);
  } catch(e) {
    showToast('Erro ao gerar PIX: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.innerHTML = '📱 Gerar QR Code PIX'; }
  }
}
function startPoll(pid) {
  if (pixPollTimer) clearInterval(pixPollTimer);
  pixPollTimer = setInterval(async () => {
    try {
      const r = await fetch(PROXY() + '/asaas/pay/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: pid })
      });
      const d = await r.json();
      if (['RECEIVED','CONFIRMED','RECEIVED_IN_CASH','PAYMENT_APPROVED','APPROVED'].includes(d.status)) { clearInterval(pixPollTimer); await finalize(pid, 'paid'); }
    } catch(e) {}
  }, 4000);
}
function cpPix() { const t = document.getElementById('pix-ce')?.textContent || ''; navigator.clipboard.writeText(t).then(() => showToast('Chave PIX copiada!', 'ok')); }
async function pp(path, body) { const r = await fetch(PROXY() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }

// ── FINALIZE ──────────────────────────────────────────────────
async function finZero() { await finalize('', 'paid'); }
async function finalize(asaasId, payStatus) {
  if (pixPollTimer) clearInterval(pixPollTimer);

  // Update slot booked count in Firestore
  const slots = [...(contest.slots || [])];
  const slot = slots.find(s => s.id === selSlotId);
  if (slot) {
    slot.booked++;
    await updateDoc(doc(db, 'contests', CID), { slots });
    contest.slots = slots;
  }

  // Update coupon uses
  if (appliedCoupon) {
    await updateDoc(doc(db, 'coupons', appliedCoupon.id), { uses: (appliedCoupon.uses || 0) + 1 });
  }

  const { total, disc } = calcT();
  const exNoms = selExames.map(id => (contest.exames || []).find(x => x.id === id)?.nome || id);
  const recId = 'PRSD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  const rec = {
    id: recId, contestId: CID,
    submittedAt: new Date().toLocaleString('pt-BR'),
    nome: fd.nome, cpf: fd.cpf, matricula: fd.matricula,
    rg: fd.rg, orgao: fd.orgao, uf: fd.uf, nasc: fd.nasc,
    sexo: fd.sexo, cel: fd.cel, email: fd.email,
    trat: fd.trat, psico: fd.psico, med: fd.med || '', coleta: fd.coleta,
    grupo: fd.grupo === 'furlani' ? 'Grupo Furlani + Geral' : 'Grupo Geral',
    pacoteLabel: fd.pacoteLabel, pacoteId: fd.pacoteId,
    examesSel: exNoms, slotId: selSlotId,
    slotCity: slot?.city || '', slotDate: slot?.date || '', slotTime: slot?.time || '',
    obs: fd.obs || '', fileName: selFile?.name || '',
    total, discount: disc, cupom: appliedCoupon?.code || '',
    payMethod, installments, asaasPaymentId: asaasId, payStatus, status: 'ativo',
  };

  // Save to Firestore
  await setDoc(doc(db, 'registrations', recId), rec);
  lastReg = rec;
  rSuccess(rec);
}

// ── SUCCESS ───────────────────────────────────────────────────
function rSuccess(rec) {
  step = 6; updateNav();
  set('main', `<div class="success-wrap fade">
    <div class="success-icon">✅</div>
    <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px">Agendamento Confirmado!</h2>
    <p style="color:var(--white-dim);font-size:.88rem;margin-bottom:20px">Seu cadastro foi realizado com sucesso.</p>
    <div class="proto-box"><div class="proto-label">Número de Protocolo</div>
      <div class="proto-val mono">${rec.id}</div></div>
    <div class="detail-summary">
      <div class="ds-row"><span class="ds-key">Concurso</span><span class="ds-val">${contest.nome}</span></div>
      <div class="ds-row"><span class="ds-key">Unidade</span><span class="ds-val">${rec.slotCity}</span></div>
      <div class="ds-row"><span class="ds-key">Data</span><span class="ds-val">${rec.slotDate}</span></div>
      <div class="ds-row"><span class="ds-key">Horário</span><span class="ds-val">${rec.slotTime}</span></div>
      <div class="ds-row"><span class="ds-key">Pacote</span><span class="ds-val">${rec.pacoteLabel}</span></div>
      <div class="ds-row"><span class="ds-key">Total Pago</span><span class="ds-val" style="color:var(--teal-light)">R$ ${brl(rec.total)}</span></div>
      ${rec.installments > 1 ? `<div class="ds-row"><span class="ds-key">Parcelamento</span><span class="ds-val">${rec.installments}x R$ ${brl(rec.total / rec.installments)}</span></div>` : ''}
    </div>
    <div class="success-actions">
      <button class="btn-teal" onclick="prtComp()">🖨️ Imprimir Comprovante</button>
    </div>
    <p style="font-size:.76rem;color:var(--white-dim)">Protocolo: <span class="mono" style="color:var(--blue-light)">${rec.id}</span></p>
  </div>`);
}

// ── PRINT ─────────────────────────────────────────────────────
function bldPrint(r) {
  return `<div class="ph"><div class="ph-logo">⚕</div>
    <div><div class="ph-org">PROSED · Medicina do Trabalho</div><div class="ph-title">Comprovante de Agendamento · ${contest.nome}</div></div></div>
  <div class="pp"><div><div class="pp-lbl">Protocolo</div><div class="pp-val">${r.id}</div></div>
    <div style="text-align:right;font-size:11px;color:#666">Emitido: ${new Date().toLocaleString('pt-BR')}</div></div>
  <div class="ps"><div class="ps-title">Dados Pessoais</div>
    <div class="pr"><span class="pk">Nome:</span><span>${r.nome}</span></div>
    <div class="pr"><span class="pk">CPF:</span><span>${r.cpf}</span></div>
    <div class="pr"><span class="pk">Nº Inscrição:</span><span>${r.matricula}</span></div>
    <div class="pr"><span class="pk">E-mail:</span><span>${r.email}</span></div>
    <div class="pr"><span class="pk">Celular:</span><span>${r.cel}</span></div></div>
  <div class="ps"><div class="ps-title">Agendamento</div>
    <div class="pr"><span class="pk">Concurso:</span><span>${contest.nome}</span></div>
    <div class="pr"><span class="pk">Unidade:</span><span>${r.slotCity}</span></div>
    <div class="pr"><span class="pk">Data:</span><span>${r.slotDate}</span></div>
    <div class="pr"><span class="pk">Horário:</span><span>${r.slotTime}</span></div>
    <div class="pr"><span class="pk">Pacote:</span><span>${r.pacoteLabel}</span></div>
    ${(r.examesSel || []).length ? `<div class="pr"><span class="pk">Exames:</span><span>${r.examesSel.join(', ')}</span></div>` : ''}</div>
  <div class="ps"><div class="ps-title">Pagamento</div>
    <div class="pr"><span class="pk">Total Pago:</span><span style="font-weight:800;color:#1E6FFF">R$ ${brl(r.total || 0)}</span></div>
    ${r.installments > 1 ? `<div class="pr"><span class="pk">Parcelamento:</span><span>${r.installments}x R$ ${brl((r.total || 0) / r.installments)}</span></div>` : ''}
    <div class="pr"><span class="pk">Forma:</span><span>${r.payMethod === 'pix' ? 'PIX' : r.payMethod === 'credit' ? 'Cartão de Crédito' : 'Cartão de Débito'}</span></div>
    <div class="pr"><span class="pk">Status:</span><span style="color:#00C9A7;font-weight:700">✓ CONFIRMADO</span></div></div>
  <div class="pf">PROSED – Medicina do Trabalho · Documento gerado automaticamente</div>`;
}
function prtComp() {
  if (!lastReg) return;
  document.getElementById('print-area').innerHTML = bldPrint(lastReg);
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

// ── NAVIGATION ────────────────────────────────────────────────
function next() { if (!val(step)) return; save(step); step = Math.min(step + 1, 4); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function prev() { save(step); step = Math.max(step - 1, 0); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function save(s) {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (s === 0) {
    const orgaoSel = g('orgao');
    const orgaoVal = orgaoSel === 'outros' ? g('orgao-outros') : orgaoSel;
    Object.assign(fd, { nome: g('nome'), cpf: g('cpf'), matricula: '', rg: g('rg'), orgao: orgaoVal, uf: g('uf'), nasc: g('nasc'), sexo: g('sexo'), cel: g('cel'), email: g('email') });
  }
  if (s === 1) Object.assign(fd, { trat: g('trat'), psico: g('psico'), med: g('med'), coleta: g('coleta') });
  if (s === 2) Object.assign(fd, { grupo: g('grupo') });
  // docs step removed
}
function val(s) {
  clrAllE();
  if (s === 0) {
    let ok = true;
    const nome = document.getElementById('nome')?.value.trim() || '';
    if (!nome || nome.split(' ').filter(Boolean).length < 2) { showE('f-nome', 'Informe nome e sobrenome'); ok = false; }
    const cpf = document.getElementById('cpf')?.value || '';
    if (!vCPF(cpf)) { showE('f-cpf', 'CPF inválido'); ok = false; }
    // matricula removed
    if (!document.getElementById('rg')?.value.trim()) { showE('f-rg', 'Campo obrigatório'); ok = false; }
    const orgaoEl = document.getElementById('orgao');
    if (!orgaoEl?.value) { showE('f-orgao', 'Selecione o órgão'); ok = false; }
    else if (orgaoEl.value === 'outros' && !document.getElementById('orgao-outros')?.value.trim()) { showE('f-orgao', 'Digite o órgão'); ok = false; }
    if (!document.getElementById('uf')?.value) { showE('f-uf', 'Selecione a UF'); ok = false; }
    if ((document.getElementById('nasc')?.value || '').length < 10) { showE('f-nasc', 'Data inválida'); ok = false; }
    if (!document.getElementById('sexo')?.value) { showE('f-sexo', 'Selecione'); ok = false; }
    if ((document.getElementById('cel')?.value || '').replace(/\D/g, '').length < 11) { showE('f-cel', 'Celular inválido'); ok = false; }
    const em = document.getElementById('email')?.value.trim() || '';
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { showE('f-email', 'E-mail inválido'); ok = false; }
    if (!ok) document.querySelector('.field.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }
  if (s === 1) {
    let ok = true;
    if (!document.getElementById('trat')?.value) { showE('f-trat', 'Campo obrigatório'); ok = false; }
    if (!document.getElementById('psico')?.value) { showE('f-psico', 'Campo obrigatório'); ok = false; }
    if (document.getElementById('psico')?.value === 'Sim' && !document.getElementById('med')?.value.trim()) { showE('f-med', 'Informe o medicamento'); ok = false; }
    if (!document.getElementById('coleta')?.value) { showE('f-coleta', 'Selecione'); ok = false; }
    return ok;
  }
  if (s === 2) {
    if (!fd.pacoteId) { showE('f-pacote', 'Selecione um pacote'); return false; }
    if (fd.pacoteId === 'avulsos' && selExames.length === 0) { showToast('Selecione pelo menos 1 exame avulso.', 'err'); return false; }
    if (!document.getElementById('grupo')?.value) { showE('f-grupo', 'Selecione o grupo'); return false; }
    return true;
  }
  if (s === 3) { if (!selSlotId) { showE('f-slot', 'Selecione unidade → data → horário'); return false; } return true; }
  return true;
}

// ── COUPON ────────────────────────────────────────────────────
function apCup() {
  const code = document.getElementById('cup-inp')?.value.trim().toUpperCase() || '';
  if (!code) { showToast('Digite um código.', 'err'); return; }
  const cp = coupons.find(c => c.code === code && c.active);
  if (!cp) { showToast('Cupom inválido.', 'err'); return; }
  if (cp.maxUses > 0 && cp.uses >= cp.maxUses) { showToast('Cupom esgotado.', 'err'); return; }
  if (cp.validity) { const [d, m, y] = cp.validity.split('/'); if (new Date() > new Date(y, m - 1, d)) { showToast('Cupom vencido.', 'err'); return; } }
  if (cp.contestId && cp.contestId !== CID) { showToast('Cupom não válido para este concurso.', 'err'); return; }
  appliedCoupon = cp; showToast('Cupom aplicado!', 'ok'); rCheckout();
}
function rmCup() { appliedCoupon = null; rCheckout(); }

// ── HELPERS ───────────────────────────────────────────────────
function vCPF(cpf) { const n = cpf.replace(/\D/g, ''); if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false; let s = 0; for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i); let r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== parseInt(n[9])) return false; s = 0; for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i); r = (s * 10) % 11; if (r >= 10) r = 0; return r === parseInt(n[10]); }
function mCPF(el) { let v = el.value.replace(/\D/g, '').slice(0, 11); if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4'); else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3'); else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2'); el.value = v; }
function mPhone(el) { let v = el.value.replace(/\D/g, '').slice(0, 11); if (v.length > 6) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3'); else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2'); else if (v.length) v = '(' + v; el.value = v; }
function mDate(el) { let v = el.value.replace(/\D/g, '').slice(0, 8); if (v.length > 4) v = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3'); else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,2})/, '$1/$2'); el.value = v; }
function mCard(el) { let v = el.value.replace(/\D/g, '').slice(0, 16); v = v.replace(/(\d{4})(?=\d)/g, '$1 '); el.value = v; }
function mExp(el) { let v = el.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); el.value = v; }
function mCEP(el) { let v = el.value.replace(/\D/g, '').slice(0, 8); if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5); el.value = v; }
function sR(id, val, el) { document.getElementById(id).value = val; el.closest('.radio-group').querySelectorAll('.rbtn').forEach(b => b.classList.remove('sel')); el.classList.add('sel'); clrE('f-' + id); }
function tMed() { const vv = document.getElementById('psico')?.value; const f = document.getElementById('f-med'); if (f) f.style.display = vv === 'Sim' ? '' : 'none'; if (vv !== 'Sim') { const m = document.getElementById('med'); if (m) m.value = ''; } }
function showE(id, msg) { const el = document.getElementById(id); if (!el) return; el.classList.add('err'); let em = el.querySelector('.err-msg'); if (!em) { em = document.createElement('span'); em.className = 'err-msg'; el.appendChild(em); } em.innerHTML = '⚠ ' + msg; }
function clrE(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove('err'); el.querySelector('.err-msg')?.remove(); }
function clrAllE() { document.querySelectorAll('.field.err').forEach(el => { el.classList.remove('err'); el.querySelector('.err-msg')?.remove(); }); }
function brl(n) { return (+n || 0).toFixed(2).replace('.', ','); }
function h(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function v(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function set(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function showToast(msg, type = 'ok') { const t = document.getElementById('toast'); t.className = 'toast toast-' + type; document.getElementById('toast-icon').textContent = type === 'ok' ? '✓' : '✕'; document.getElementById('toast-msg').textContent = msg; t.style.display = 'flex'; setTimeout(() => t.style.display = 'none', 4200); }

// Expose to global for inline onclick
window.next = next; window.prev = prev; window.sPac = sPac; window.tEx = tEx; window.uAvSub = uAvSub;
window.pCity = pCity; window.pDate = pDate; window.pTime = pTime; window.rTimes = rTimes;
window.hFile = hFile; window.apCup = apCup; window.rmCup = rmCup;
window.sPay = sPay; window.sInst = sInst; window.subCard = subCard; window.gPIX = gPIX; window.cpPix = cpPix; window.finZero = finZero;
window.prtComp = prtComp;
window.mCPF = mCPF; window.mPhone = mPhone; window.mDate = mDate; window.mCard = mCard; window.mExp = mExp; window.mCEP = mCEP;
window.sR = sR; window.tMed = tMed;
function tglOrgaoOutros(sel) {
  const outros = document.getElementById('orgao-outros');
  if (outros) outros.style.display = sel.value === 'outros' ? '' : 'none';
}
window.tglOrgaoOutros = tglOrgaoOutros;
window.finalize = finalize; window.getPixPaymentId = () => window._pixPaymentId;

// ── INIT ──────────────────────────────────────────────────────
loadData();
