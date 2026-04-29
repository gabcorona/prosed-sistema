// prosed-form-logic.js — Firebase edition
import { db, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, query, where, orderBy }
  from './firebase-config.js';

// ── LOAD CONTEST ──────────────────────────────────────────────
const CID = new URLSearchParams(window.location.search).get('c');
let contest = null, coupons = [], cfg = {};
// Verificar se campo está habilitado para este concurso
function fieldOn(key) {
  const fc = contest?.fieldsConfig;
  if (!fc) return true; // se não configurado, mostrar tudo
  return fc[key] !== false;
}

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
  buildSteps()[step]?.();
}
function info(icon, title, sub) {
  document.getElementById('steps-nav').style.display = 'none';
  document.getElementById('main').innerHTML = `<div class="not-found fade"><div class="not-found-icon">${icon}</div><h2 style="font-size:1.2rem;font-weight:800;margin-bottom:8px">${title}</h2><p style="color:var(--white-dim);font-size:.85rem">${sub}</p></div>`;
}
function buildSteps() {
  const steps = [rDados];
  if (fieldOn('toxicologico')) steps.push(rToxico);
  steps.push(rPacote, rAgenda);
  if (fieldOn('docUpload')) steps.push(rDocs);
  steps.push(rCheckout);
  return steps;
}

function updateNav() {
  const steps = buildSteps();
  const labels = ['Dados'];
  if (fieldOn('toxicologico')) labels.push('Toxicológico');
  labels.push('Pacote', 'Agenda');
  if (fieldOn('docUpload')) labels.push('Docs');
  labels.push('Checkout');

  const nav = document.getElementById('steps-nav');
  nav.style.display = step >= steps.length ? 'none' : '';

  // Rebuild nav buttons dynamically
  nav.innerHTML = labels.map((lbl, i) => {
    const cls = i === step ? 'step-btn active' : i < step ? 'step-btn done' : 'step-btn';
    return `<button class="${cls}"><span class="step-num">${i + 1}</span>${lbl}</button>`;
  }).join('');
}
function banner() {
  return `<div class="contest-banner fade">
    <div class="contest-banner-name">📋 ${contest.nome}</div>
    <div class="contest-banner-meta">${contest.orgao}${contest.prazo ? ' · Prazo: ' + contest.prazo : ''}</div>
    ${contest.resumo ? `<div class="contest-resumo" style="color:var(--red);font-weight:600">${contest.resumo}</div>` : ''}
  </div>`;
}

// ── STEP 1: DADOS ─────────────────────────────────────────────
function rDados() {
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const orgaos = ['SSP','DETRAN','PC','IFP','SJS','SDS','IIP','CGP','MJ','PF'];
  const isOtherOrgao = fd.orgao && !orgaos.includes(fd.orgao);

  const fRg = fieldOn('rg') ? `
    <div class="field" id="f-rg"><label class="fl">RG <span class="req">*</span></label>
      <input id="rg" type="tel" class="mono" placeholder="0000000" value="${h(fd.rg)}" oninput="this.value=this.value.replace(/\\D/g,'')"/></div>` : '';

  const fOrgao = fieldOn('orgaoExpedidor') ? `
    <div class="field" id="f-orgao"><label class="fl">Órgão Expedidor <span class="req">*</span></label>
      <select id="orgao" onchange="tglOrgaoOutros(this)">
        <option value="">Selecione</option>
        ${orgaos.map(o=>`<option value="${o}" ${fd.orgao===o?'selected':''}>${o}</option>`).join('')}
        <option value="outros" ${isOtherOrgao?'selected':''}>Outros</option>
      </select>
      <input id="orgao-outros" type="text" placeholder="Digite o órgão expedidor" value="${h(isOtherOrgao?fd.orgao:'')}"
        style="display:${isOtherOrgao?'':'none'};margin-top:8px" oninput="this.value=this.value.toUpperCase()"/>
    </div>` : '';

  const fUf = fieldOn('ufRg') ? `
    <div class="field" id="f-uf"><label class="fl">UF do RG <span class="req">*</span></label>
      <select id="uf"><option value="">Selecione</option>${ufs.map(u=>`<option ${fd.uf===u?'selected':''}>${u}</option>`).join('')}</select></div>` : '';

  const fNasc = fieldOn('dataNasc') ? `
    <div class="field" id="f-nasc"><label class="fl">Nascimento <span class="req">*</span></label>
      <input id="nasc" type="tel" class="mono" placeholder="DD/MM/AAAA" maxlength="10" value="${h(fd.nasc)}" oninput="mDate(this)"/></div>` : '';

  const fSexo = fieldOn('sexo') ? `
    <div class="field" id="f-sexo"><label class="fl">Sexo <span class="req">*</span></label>
      <select id="sexo"><option value="">Selecione</option>
        <option ${fd.sexo==='Masculino'?'selected':''}>Masculino</option>
        <option ${fd.sexo==='Feminino'?'selected':''}>Feminino</option>
        <option ${fd.sexo==='Outro'?'selected':''}>Outro</option></select></div>` : '';

  // Monta grupos de 2 colunas só com os campos habilitados
  const rgOrgaoRow = (fRg || fOrgao) ? `<div class="g2">${fRg}${fOrgao}</div>` : '';
  const ufRow      = fUf ? `<div class="g2">${fUf}</div>` : '';

  // Sexo e Nascimento: lado a lado (apenas os que estiverem ativos)
  const sexoNascRow = (fSexo || fNasc) ? `<div class="g2">${fSexo}${fNasc}</div>` : '';

  set('main', banner() + `
  <div class="s-card fade"><div class="s-title"><span class="s-num">1</span> Dados Pessoais</div>
    <div class="field" id="f-nome"><label class="fl">Nome Completo <span class="req">*</span></label>
      <input id="nome" type="text" placeholder="Nome e sobrenome" value="${h(fd.nome)}" oninput="this.value=this.value.toUpperCase()"/></div>
    <div class="field" id="f-cpf"><label class="fl">CPF <span class="req">*</span></label>
      <input id="cpf" type="tel" class="mono" placeholder="000.000.000-00" maxlength="14" value="${h(fd.cpf)}" oninput="mCPF(this)"/></div>
    ${sexoNascRow}
    ${rgOrgaoRow}
    ${ufRow}
    <div class="field" id="f-cel"><label class="fl">Celular <span class="req">*</span></label>
      <input id="cel" type="tel" class="mono" placeholder="(00) 00000-0000" maxlength="16" value="${h(fd.cel)}" oninput="mPhone(this)"/></div>
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
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">3</span> Pacote</div>
    <div class="field" id="f-pacote"><label class="fl">Tipo de Pacote <span class="req">*</span></label>
      ${pkgH}${avH}</div>
    <div id="av-sec" style="display:${fd.pacoteId === 'avulsos' ? '' : 'none'}">
      <label class="fl" style="display:block;margin:14px 0 8px">Selecione os exames</label>
      <div class="exam-check-list">
        ${exs.map(e => `<div class="exam-check ${selExames.includes(e.id) ? 'sel' : ''}" onclick="tEx('${e.id}',this)">
          <div class="exam-check-left"><div class="chk">${selExames.includes(e.id) ? '✓' : ''}</div>
            <div>
              <div style="font-size:.86rem;font-weight:500">${e.nome}</div>
              ${e.orientacoes ? `<div style="font-size:.72rem;color:var(--amber);margin-top:2px">⚠ ${e.orientacoes}</div>` : ''}
            </div>
          </div>
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
function getAddressMap() {
  // Monta um mapa cidade → endereço a partir dos slots
  const map = {};
  (contest.slots || []).forEach(s => {
    if (s.city && s.address) map[s.city] = s.address;
  });
  return map;
}
function rAddressPanel() {
  const addrMap = getAddressMap();
  const cities = Object.keys(addrMap);
  if (!cities.length) return '';
  return `<div style="background:rgba(0,201,167,.06);border:1.5px solid rgba(0,201,167,.25);border-radius:12px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--teal-light);margin-bottom:10px">📍 Endereços das Unidades</div>
    ${cities.map(city => `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);last-child:border:0">
      <div style="font-size:.84rem;font-weight:700;margin-bottom:2px">${city}</div>
      <div style="font-size:.78rem;color:var(--white-dim);margin-bottom:4px">${addrMap[city]}</div>
      <div style="display:flex;gap:8px">
        <a href="https://maps.google.com/?q=${encodeURIComponent(addrMap[city])}" target="_blank"
           style="font-size:.7rem;color:var(--blue-light);text-decoration:none;display:inline-flex;align-items:center;gap:3px">📍 Google Maps</a>
        <a href="https://maps.apple.com/?q=${encodeURIComponent(addrMap[city])}" target="_blank"
           style="font-size:.7rem;color:var(--white-dim);text-decoration:none;display:inline-flex;align-items:center;gap:3px">🍎 Apple Maps</a>
      </div>
    </div>`).join('')}
  </div>`;
}
function rAgenda() {
  const addrPanel = rAddressPanel();
  set('main', `<div class="s-card fade"><div class="s-title"><span class="s-num">4</span> Agendamento</div>
    ${addrPanel}
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
  const exOrientacoes = selExames.map(id => (contest.exames || []).find(x => x.id === id)?.orientacoes || '').filter(Boolean);
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
        ${exOrientacoes.length ? `<tr><td style="vertical-align:top;color:var(--amber)">⚠ Orientações</td><td style="text-align:right;font-size:.74rem;color:var(--amber)">${exOrientacoes.join('<br>')}</td></tr>` : ''}
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
            <div class="pix-qr-wrap" id="pix-qr" style="display:flex;align-items:center;justify-content:center;padding:10px 0"><div style="font-size:4rem">🟦</div></div>
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
    const ep = payMethod === 'credit' ? '/pay/credit' : '/pay/debit';
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
    // Tenta exibir QR Code - se não vier, busca novamente após 2s
    if (pr.encodedImage) {
      set('pix-qr', `<img src="data:image/png;base64,${pr.encodedImage}" style="width:100%;max-width:280px;height:auto;display:block;margin:0 auto"/>`);
    } else {
      set('pix-qr', '<div style="padding:20px;color:var(--white-dim)">⏳ Aguardando QR Code...</div>');
      setTimeout(async () => {
        try {
          const qr = await (await fetch(PROXY() + '/api/proxy?action=/asaas/pay/' + pr.paymentId + '/qrcode')).json();
          if (qr.encodedImage) set('pix-qr', `<img src="data:image/png;base64,${qr.encodedImage}" style="width:100%;max-width:280px;height:auto;display:block;margin:0 auto"/>`);
          if (qr.pixCopiaECola) set('pix-ce', qr.pixCopiaECola);
        } catch(e) {}
      }, 2500);
    }
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
      const r = await fetch(PROXY() + '/api/proxy?action=/asaas/pay/status', {
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
async function pp(path, body) { const r = await fetch(PROXY() + '/api/proxy?action=' + encodeURIComponent(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }

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
  const exOrientacoesArr = selExames.map(id => (contest.exames || []).find(x => x.id === id)?.orientacoes || '').filter(Boolean);
  const exOrientacoes = selExames.map(id => (contest.exames || []).find(x => x.id === id)?.orientacoes || '').filter(Boolean);
  const recId = 'PRSD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  const rec = {
    id: recId, contestId: CID,
    submittedAt: new Date().toLocaleString('pt-BR'),
    nome: fd.nome, cpf: fd.cpf, matricula: fd.matricula,
    rg: fd.rg, orgao: fd.orgao, uf: fd.uf, nasc: fd.nasc,
    sexo: fd.sexo, cel: fd.cel, email: fd.email,
    trat: fd.trat, psico: fd.psico, med: fd.med || '', coleta: fd.coleta,
    pacoteLabel: fd.pacoteLabel, pacoteId: fd.pacoteId,
    examesSel: exNoms, orientacoes: exOrientacoesArr.join(' | '), slotId: selSlotId,
    slotCity: slot?.city || '', slotDate: slot?.date || '', slotTime: slot?.time || '',
    slotAddress: slot?.address || '',
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
      ${rec.slotAddress ? `<div class="ds-row"><span class="ds-key">Endereço</span><span class="ds-val" style="font-size:.78rem">${rec.slotAddress}</span></div>
      <div class="ds-row"><span class="ds-key">Localização</span><span class="ds-val">
        <a href="https://maps.google.com/?q=${encodeURIComponent(rec.slotAddress)}" target="_blank" style="color:var(--blue-light);margin-right:8px">📍 Google Maps</a>
        <a href="https://maps.apple.com/?q=${encodeURIComponent(rec.slotAddress)}" target="_blank" style="color:var(--blue-light)">🍎 Apple Maps</a>
      </span></div>` : ''}
      <div class="ds-row"><span class="ds-key">Data</span><span class="ds-val">${rec.slotDate}</span></div>
      <div class="ds-row"><span class="ds-key">Horário</span><span class="ds-val">${rec.slotTime}</span></div>
      <div class="ds-row"><span class="ds-key">Pacote</span><span class="ds-val">${rec.pacoteLabel}</span></div>
      ${(rec.examesSel||[]).length ? `<div class="ds-row"><span class="ds-key">Exames</span><span class="ds-val" style="font-size:.78rem">${rec.examesSel.join(', ')}</span></div>` : ''}
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
    ${r.slotAddress ? `<div class="pr"><span class="pk">Endereço:</span><span>${r.slotAddress}</span></div>
    <div class="pr"><span class="pk">Localização:</span><span>
      <a href="https://maps.google.com/?q=${encodeURIComponent(r.slotAddress || r.slotCity)}" target="_blank" style="color:#1E6FFF;font-weight:700;text-decoration:none;margin-right:10px">📍 Google Maps</a>
      <a href="https://maps.apple.com/?q=${encodeURIComponent(r.slotAddress || r.slotCity)}" target="_blank" style="color:#1E6FFF;font-weight:700;text-decoration:none">🍎 Apple Maps</a>
    </span></div>` : ''}
    <div class="pr"><span class="pk">Data:</span><span>${r.slotDate}</span></div>
    <div class="pr"><span class="pk">Horário:</span><span>${r.slotTime}</span></div>
    <div class="pr"><span class="pk">Pacote:</span><span>${r.pacoteLabel}</span></div>
    ${(r.examesSel || []).length ? `<div class="pr"><span class="pk">Exames:</span><span>${r.examesSel.join(', ')}</span></div>` : ''}</div>
  ${r.orientacoes ? `<div class="ps"><div class="ps-title">⚠ Orientações Importantes</div><div style="font-size:12px;color:#B8860B;line-height:1.6">${r.orientacoes}</div></div>` : ''}
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
function next() { if (!val(step)) return; save(step); step = Math.min(step + 1, buildSteps().length - 1); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function prev() { save(step); step = Math.max(step - 1, 0); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function save(s) {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const currentFn = buildSteps()[s];
  if (currentFn === rDados) {
    const orgaoSel = g('orgao');
    const orgaoVal = orgaoSel === 'outros' ? g('orgao-outros') : orgaoSel;
    Object.assign(fd, {
      nome: g('nome'), cpf: g('cpf'),
      matricula: fieldOn('matricula') ? g('matricula') : '',
      rg: fieldOn('rg') ? g('rg') : '',
      orgao: fieldOn('orgaoExpedidor') ? orgaoVal : '',
      uf: fieldOn('ufRg') ? g('uf') : '',
      nasc: fieldOn('dataNasc') ? g('nasc') : '',
      sexo: fieldOn('sexo') ? g('sexo') : '',
      cel: g('cel'), email: g('email')
    });
  }
  if (currentFn === rToxico) Object.assign(fd, { trat: g('trat'), psico: g('psico'), med: g('med'), coleta: g('coleta') });
}
function val(s) {
  clrAllE();
  const currentFn = buildSteps()[s];

  // DADOS
  if (currentFn === rDados) {
    let ok = true;
    const nome = document.getElementById('nome')?.value.trim() || '';
    if (!nome || nome.split(' ').filter(Boolean).length < 2) { showE('f-nome', 'Informe nome e sobrenome'); ok = false; }
    const cpf = document.getElementById('cpf')?.value || '';
    if (!vCPF(cpf)) { showE('f-cpf', 'CPF inválido'); ok = false; }
    if (fieldOn('matricula') && !document.getElementById('matricula')?.value.trim()) { showE('f-matricula', 'Campo obrigatório'); ok = false; }
    if (fieldOn('rg') && !document.getElementById('rg')?.value.trim()) { showE('f-rg', 'Campo obrigatório'); ok = false; }
    if (fieldOn('orgaoExpedidor')) {
      const orgaoEl = document.getElementById('orgao');
      if (!orgaoEl?.value) { showE('f-orgao', 'Selecione o órgão'); ok = false; }
      else if (orgaoEl.value === 'outros' && !document.getElementById('orgao-outros')?.value.trim()) { showE('f-orgao', 'Digite o órgão'); ok = false; }
    }
    if (fieldOn('ufRg') && !document.getElementById('uf')?.value) { showE('f-uf', 'Selecione a UF'); ok = false; }
    if (fieldOn('dataNasc') && (document.getElementById('nasc')?.value || '').length < 10) { showE('f-nasc', 'Data inválida'); ok = false; }
    if (fieldOn('sexo') && !document.getElementById('sexo')?.value) { showE('f-sexo', 'Selecione'); ok = false; }
    if ((document.getElementById('cel')?.value || '').replace(/\D/g, '').length < 11) { showE('f-cel', 'Celular inválido'); ok = false; }
    const em = document.getElementById('email')?.value.trim() || '';
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { showE('f-email', 'E-mail inválido'); ok = false; }
    if (!ok) document.querySelector('.field.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  // TOXICOLÓGICO
  if (currentFn === rToxico) {
    let ok = true;
    if (!document.getElementById('trat')?.value) { showE('f-trat', 'Campo obrigatório'); ok = false; }
    if (!document.getElementById('psico')?.value) { showE('f-psico', 'Campo obrigatório'); ok = false; }
    if (document.getElementById('psico')?.value === 'Sim' && !document.getElementById('med')?.value.trim()) { showE('f-med', 'Informe o medicamento'); ok = false; }
    if (!document.getElementById('coleta')?.value) { showE('f-coleta', 'Selecione'); ok = false; }
    return ok;
  }

  // PACOTE
  if (currentFn === rPacote) {
    if (!fd.pacoteId) { showE('f-pacote', 'Selecione um pacote'); return false; }
    if (fd.pacoteId === 'avulsos' && selExames.length === 0) { showToast('Selecione pelo menos 1 exame avulso.', 'err'); return false; }
    return true;
  }

  // AGENDA
  if (currentFn === rAgenda) {
    if (!selSlotId) { showE('f-slot', 'Selecione unidade → data → horário'); return false; }
    return true;
  }

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
