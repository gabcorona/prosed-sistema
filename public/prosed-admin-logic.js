// prosed-admin-logic.js
import { db, collection, doc, getDoc, getDocs, setDoc, addDoc,
         updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp }
  from './firebase-config.js';

// ── STATE ─────────────────────────────────────────────────────
let adminPwd = 'pces2025';
let contests = [], registrations = [], coupons = [];
let newSlots = [], newExames = [], newPacotes = [];
let editalB64 = null, currentCadId = null, currentTab = 'concursos';
let cfg = { asaasEnv: 'sandbox', proxyUrl: 'https://prosed-sistema.vercel.app', apiKey: '' };
// Campos configuráveis do formulário (true = visível/obrigatório)
let fieldsConfig = {
  matricula: true,   // Nº de Inscrição/Matrícula
  rg: true,          // RG
  orgaoExpedidor: true, // Órgão Expedidor + UF
  dataNasc: true,    // Data de Nascimento
  sexo: true,        // Sexo
  toxicologico: true, // Passo 2: Toxicológico
  obsAdicionais: true, // Observações adicionais
};

// ── CONFIG LOCAL ──────────────────────────────────────────────
function loadLocalCfg() {
  try {
    const c = localStorage.getItem('p_cfg');
    const p = localStorage.getItem('p_pwd');
    const fc = localStorage.getItem('p_fields');
    if (c) cfg = Object.assign(cfg, JSON.parse(c));
    if (p) adminPwd = p;
    if (fc) fieldsConfig = Object.assign(fieldsConfig, JSON.parse(fc));
  } catch(e) {}
}
function saveLocalCfg() {
  try {
    localStorage.setItem('p_cfg', JSON.stringify(cfg));
    localStorage.setItem('p_pwd', adminPwd);
    localStorage.setItem('p_fields', JSON.stringify(fieldsConfig));
  } catch(e) {}
}

// ── LOGIN ─────────────────────────────────────────────────────
function doLogin() {
  const pwd = document.getElementById('login-pwd').value;
  if (pwd === adminPwd) {
    document.getElementById('login-overlay').style.display = 'none';
    init();
  } else {
    document.getElementById('login-err').textContent = '⚠ Senha incorreta.';
    document.getElementById('login-pwd').value = '';
    document.getElementById('login-pwd').focus();
  }
}

// ── FIREBASE INIT ─────────────────────────────────────────────
function init() {
  loadLocalCfg();
  loadConfigUI();

  onSnapshot(query(collection(db, 'contests'), orderBy('createdAt', 'desc')), snap => {
    contests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === 'concursos') renderContests();
    populateContestSels();
  });

  onSnapshot(query(collection(db, 'registrations'), orderBy('submittedAt', 'desc')), snap => {
    registrations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === 'cadastros') renderCadastros();
  });

  onSnapshot(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')), snap => {
    coupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === 'cupons') renderCoupons();
  });
}

// ── TABS ──────────────────────────────────────────────────────
function switchTab(t) {
  currentTab = t;
  ['concursos','novo','cadastros','cupons','config'].forEach(id => {
    document.getElementById('tab-btn-' + id).classList.toggle('active', id === t);
    document.getElementById('tab-' + id).classList.toggle('active', id === t);
  });
  if (t === 'novo') initForm();
  if (t === 'cadastros') renderCadastros();
  if (t === 'cupons') renderCoupons();
  if (t === 'config') { loadConfigUI(); renderFieldsConfig(); }
}

// ── MASKS ─────────────────────────────────────────────────────
function maskDate(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 4) v = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,2})/, '$1/$2');
  el.value = v;
}
function maskTime(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 4);
  if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
  el.value = v;
}

// ── EDITAL ────────────────────────────────────────────────────
function handleEdital(inp) {
  const file = inp.files[0]; if (!file) return;
  if (file.size > 20 * 1024 * 1024) { showToast('Máx. 20MB.', 'err'); return; }
  document.getElementById('edital-zone').classList.add('has-file');
  document.getElementById('edital-icon').textContent = '✅';
  document.getElementById('edital-label').textContent = file.name;
  document.getElementById('edital-sub').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
  document.getElementById('btn-analisar').disabled = false;
  document.getElementById('ai-status').textContent = 'Pronto para analisar.';
  const reader = new FileReader();
  reader.onload = e => { editalB64 = e.target.result.split(',')[1]; };
  reader.readAsDataURL(file);
}

async function analisarEdital() {
  if (!cfg.apiKey) { showToast('Configure a API Key do Claude em Configurações.', 'err'); return; }
  if (!editalB64) { showToast('Carregue um PDF primeiro.', 'err'); return; }
  const btn = document.getElementById('btn-analisar');
  btn.innerHTML = '<span class="spin"></span> Analisando…'; btn.disabled = true;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000,
        system: 'Analise o edital e extraia APENAS informações sobre exames admissionais/médicos. Responda SOMENTE em JSON válido:\n{"resumo":"2-3 frases","exames":["exame 1","exame 2"],"datas":"datas e prazos","observacoes":"observações"}',
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: editalB64 } },
          { type: 'text', text: 'Analise este edital.' }
        ]}]
      })
    });
    const data = await res.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    document.getElementById('ai-datas').textContent = parsed.datas || 'Não identificado';
    document.getElementById('ai-obs').textContent = parsed.observacoes || 'Nenhuma';
    document.getElementById('nc-resumo').value = parsed.resumo || '';
    document.getElementById('ai-result').style.display = 'block';
    if (parsed.exames?.length) { newExames = parsed.exames.map(n => ({ id: uid(), nome: n, preco: '', orientacoes: '' })); renderExamesTable(); }
    showToast('Edital analisado!', 'ok');
  } catch(e) { showToast('Erro: ' + e.message, 'err'); }
  btn.innerHTML = '✨ Analisar com IA'; btn.disabled = false;
}

// ── PRICE TABLE ───────────────────────────────────────────────
function addPacote(n = '', d = '', p = '') { newPacotes.push({ id: uid(), nome: n, desc: d, preco: p }); renderPacotesTable(); }
function removePacote(id) { newPacotes = newPacotes.filter(x => x.id !== id); renderPacotesTable(); }
function renderPacotesTable() {
  const b = document.getElementById('pacotes-body');
  if (!newPacotes.length) { b.innerHTML = `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--white-dim);font-size:.82rem">Nenhum pacote.</td></tr>`; return; }
  b.innerHTML = newPacotes.map(p => `<tr>
    <td><input class="name-inp" value="${escH(p.nome)}" placeholder="Nome do pacote" data-id="${p.id}" data-field="nome"/></td>
    <td><input class="desc-inp" value="${escH(p.desc)}" placeholder="Descrição..." data-id="${p.id}" data-field="desc"/></td>
    <td style="text-align:right"><input class="price-inp" value="${escH(p.preco)}" placeholder="0,00" data-id="${p.id}" data-field="preco"/></td>
    <td><button class="btn-red btn-sm rm-pac" data-id="${p.id}">✕</button></td>
  </tr>`).join('');
}

function addExame(n = '', p = '', o = '') { newExames.push({ id: uid(), nome: n, preco: p, orientacoes: o }); renderExamesTable(); }
function removeExame(id) { newExames = newExames.filter(x => x.id !== id); renderExamesTable(); }
function renderExamesTable() {
  const b = document.getElementById('exames-body');
  if (!newExames.length) { b.innerHTML = `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--white-dim);font-size:.82rem">Nenhum exame.</td></tr>`; return; }
  b.innerHTML = newExames.map(e => `<tr>
    <td><input class="name-inp" value="${escH(e.nome)}" placeholder="Nome do exame" data-id="${e.id}" data-field="nome"/></td>
    <td><input class="desc-inp" value="${escH(e.orientacoes||'')}" placeholder="Ex: Jejum de 8h, trazer exames anteriores..." data-id="${e.id}" data-field="orientacoes" style="color:var(--amber)"/></td>
    <td style="text-align:right"><input class="price-inp" value="${escH(e.preco)}" placeholder="0,00" data-id="${e.id}" data-field="preco"/></td>
    <td><button class="btn-red btn-sm rm-exa" data-id="${e.id}">✕</button></td>
  </tr>`).join('');
}

function cloneTable() {
  const id = document.getElementById('clone-source').value;
  if (!id) { showToast('Selecione um concurso.', 'err'); return; }
  const src = contests.find(c => c.id === id); if (!src) return;
  newPacotes = (src.pacotes || []).map(p => ({ ...p, id: uid() }));
  newExames = (src.exames || []).map(e => ({ ...e, id: uid() }));
  renderPacotesTable(); renderExamesTable();
  showToast('Tabela copiada!', 'ok');
}

// ── SLOTS ─────────────────────────────────────────────────────
function addSlot() {
  const city = document.getElementById('cfg-city').value;
  const date = document.getElementById('cfg-date').value;
  const time = document.getElementById('cfg-time').value;
  const max = parseInt(document.getElementById('cfg-max').value);
  if (!city || !date || date.length < 10 || !time || time.length < 5 || !max || max < 1) { showToast('Preencha todos os campos.', 'err'); return; }
  newSlots.push({ id: 's' + Date.now(), city, date, time, max, booked: 0 });
  renderSlotsList();
  ['cfg-city', 'cfg-date', 'cfg-time', 'cfg-max'].forEach(id => document.getElementById(id).value = '');
}
function removeSlot(id) { newSlots = newSlots.filter(s => s.id !== id); renderSlotsList(); }
function renderSlotsList() {
  const div = document.getElementById('slots-list');
  if (!newSlots.length) { div.innerHTML = '<div style="font-size:.82rem;color:var(--white-dim);padding:8px 0">Nenhum horário adicionado.</div>'; return; }
  div.innerHTML = newSlots.map(s => `<div class="slot-row">
    <span class="sbadge sb-city">📍 ${s.city}</span>
    <span class="sbadge sb-date">📅 ${s.date}</span>
    <span class="sbadge sb-time">🕐 ${s.time}</span>
    <span style="font-size:.78rem;color:var(--white-dim);flex:1">${s.max} vagas</span>
    <button class="btn-red btn-sm rm-slot" data-id="${s.id}">✕</button>
  </div>`).join('');
}

// ── SAVE CONTEST ──────────────────────────────────────────────
async function saveContest(status) {
  const nome = document.getElementById('nc-nome').value.trim();
  const orgao = document.getElementById('nc-orgao').value.trim();
  if (!nome || !orgao) { showToast('Informe nome e órgão.', 'err'); return; }
  if (!newSlots.length) { showToast('Adicione pelo menos 1 horário.', 'err'); return; }
  const btn = document.getElementById('btn-save-active'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Salvando…';
  try {
    const editingId = document.getElementById('editing-id').value;
    const formUrl = window.location.href.replace('prosed-admin.html', 'prosed-formulario.html');
    const imageUrl = document.getElementById('nc-imageUrl').value.trim();
    const data = {
      nome, orgao,
      prazo: document.getElementById('nc-prazo').value,
      status,
      maxParcelas: parseInt(document.getElementById('nc-parcelas').value) || 1,
      resumo: document.getElementById('nc-resumo').value,
      imageUrl: imageUrl || '',
      pacotes: [...newPacotes],
      exames: [...newExames],
      slots: [...newSlots],
      fieldsConfig: { ...fieldsConfig },
      createdAt: serverTimestamp(),
    };
    let id = editingId;
    if (editingId) {
      await updateDoc(doc(db, 'contests', editingId), data);
    } else {
      const ref = await addDoc(collection(db, 'contests'), data);
      id = ref.id;
    }
    await updateDoc(doc(db, 'contests', id), { url: formUrl + '?c=' + id });
    showToast(status === 'active' ? 'Concurso publicado! 🚀' : 'Rascunho salvo!', 'ok');
    clearForm(); switchTab('concursos');
  } catch(e) { showToast('Erro ao salvar: ' + e.message, 'err'); }
  btn.disabled = false; btn.innerHTML = '🚀 Publicar';
}

function clearForm() {
  ['nc-nome', 'nc-orgao', 'nc-prazo', 'nc-resumo', 'nc-imageUrl', 'editing-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('nc-imageUrl-preview').style.display = 'none';
  document.getElementById('nc-status').value = 'draft';
  document.getElementById('nc-parcelas').value = '1';
  newSlots = []; newExames = []; newPacotes = [];
  renderSlotsList(); renderExamesTable(); renderPacotesTable();
  document.getElementById('ai-result').style.display = 'none';
  editalB64 = null;
  const zone = document.getElementById('edital-zone');
  zone.classList.remove('has-file');
  document.getElementById('edital-icon').textContent = '📄';
  document.getElementById('edital-label').textContent = 'Clique para selecionar o PDF do edital';
  document.getElementById('edital-sub').textContent = 'PDF · Máx. 20MB';
  document.getElementById('btn-analisar').disabled = true;
  document.getElementById('ai-status').textContent = 'Carregue um PDF para habilitar';
}

function initForm() {
  const sel = document.getElementById('clone-source');
  sel.innerHTML = '<option value="">Selecione...</option>' + contests.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  if (!newPacotes.length && !document.getElementById('editing-id').value) {
    newPacotes = [
      { id: uid(), nome: 'Pacote Completo PCES', desc: 'Todos os exames admissionais obrigatórios', preco: '350' },
      { id: uid(), nome: 'Somente Toxicológico', desc: 'Apenas o exame toxicológico', preco: '150' }
    ];
    renderPacotesTable();
  }
  if (!newExames.length) renderExamesTable();
  if (!newSlots.length) renderSlotsList();
}

// ── CONTESTS LIST ─────────────────────────────────────────────
function renderContests() {
  const div = document.getElementById('contest-list');
  document.getElementById('contest-count').textContent = contests.length + ' concurso' + (contests.length !== 1 ? 's' : '');
  if (!contests.length) { div.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div>Nenhum concurso</div></div>'; return; }
  const sM = { active: 'status-active', draft: 'status-draft', closed: 'status-closed' };
  const sL = { active: 'Ativo', draft: 'Rascunho', closed: 'Encerrado' };
  div.innerHTML = contests.map(c => {
    const total = registrations.filter(r => r.contestId === c.id && r.status !== 'cancelado').length;
    const avail = (c.slots || []).reduce((a, s) => a + (s.max - s.booked), 0);
    return `<div class="contest-card">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="font-weight:700;font-size:1rem">${c.nome}</span>
            <span class="status-badge ${sM[c.status] || 'status-draft'}">${sL[c.status] || c.status}</span>
          </div>
          <div style="font-size:.78rem;color:var(--white-dim);line-height:1.7">
            ${c.orgao} · <strong>${total}</strong> cadastro${total !== 1 ? 's' : ''} · <strong>${avail}</strong> vagas${c.prazo ? ' · Prazo: ' + c.prazo : ''}
          </div>
          <div class="link-box">
            <span class="link-url" id="url-${c.id}">${c.url || 'Gerando URL...'}</span>
            <button class="btn-ghost btn-sm copy-url" data-id="${c.id}">📋</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
          <button class="btn-ghost btn-sm edit-contest" data-id="${c.id}">✏️ Editar</button>
          <button class="btn-amber btn-sm toggle-status" data-id="${c.id}">${c.status === 'active' ? '⏸' : '▶'}</button>
          <button class="btn-red btn-sm del-contest" data-id="${c.id}">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function populateContestSels() {
  ['f-concurso', 'cp-contest'].forEach(selId => {
    const sel = document.getElementById(selId); if (!sel) return;
    const prefix = selId === 'cp-contest' ? '<option value="">Todos os concursos</option>' : '<option value="">Todos</option>';
    sel.innerHTML = prefix + contests.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  });
}

// ── CADASTROS ─────────────────────────────────────────────────
function renderCadastros() {
  const cid = document.getElementById('f-concurso')?.value || '';
  const busca = document.getElementById('f-busca')?.value.toLowerCase() || '';
  const data = registrations.filter(r =>
    (!cid || r.contestId === cid) &&
    (!busca || r.nome?.toLowerCase().includes(busca) || r.cpf?.replace(/\D/g, '').includes(busca.replace(/\D/g, '')))
  );
  document.getElementById('cad-count').textContent = data.length + ' cadastro' + (data.length !== 1 ? 's' : '');
  const tbody = document.getElementById('cad-body'), empty = document.getElementById('cad-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  const pL = { pending: 'Aguardando', paid: 'Pago', failed: 'Falhou', cancelled: 'Cancelado' };
  const pT = { pending: 'tag-amber', paid: 'tag-teal', failed: 'tag-red', cancelled: 'tag-red' };
  tbody.innerHTML = data.map(r => `<tr>
    <td style="font-weight:600">${r.nome}${r.status === 'cancelado' ? ' <span class="tag tag-red" style="margin-left:4px">Cancelado</span>' : ''}</td>
    <td class="mono" style="font-size:.78rem;color:var(--white-dim)">${r.cpf}</td>
    <td style="font-size:.78rem">${contests.find(c => c.id === r.contestId)?.nome || '–'}</td>
    <td style="font-size:.78rem">${r.slotCity || '–'}<br>${r.slotDate || ''} ${r.slotTime || ''}</td>
    <td style="font-size:.78rem">${r.pacoteLabel || '–'}</td>
    <td class="mono" style="color:var(--teal-light)">R$ ${(r.total || 0).toFixed(2)}</td>
    <td><span class="tag ${pT[r.payStatus] || 'tag-amber'}">${pL[r.payStatus] || 'Aguardando'}</span></td>
    <td><button class="btn-ghost btn-sm open-cad" data-id="${r.id}">Ver</button></td>
  </tr>`).join('');
}

function openCad(id) {
  const r = registrations.find(x => x.id === id); if (!r) return;
  currentCadId = id;
  const rows = [
    ['Protocolo', r.id], ['Concurso', contests.find(c => c.id === r.contestId)?.nome || '–'],
    ['Nome', r.nome], ['CPF', r.cpf], ['Matrícula', r.matricula || '–'],
    ['E-mail', r.email], ['Celular', r.cel],
    ['Unidade', r.slotCity], ['Data', r.slotDate], ['Horário', r.slotTime],
    ['Pacote', r.pacoteLabel], ['Exames Avulsos', (r.examesSel || []).join(', ') || '–'],
    ['Total', 'R$ ' + (r.total || 0).toFixed(2)], ['Cupom', r.cupom || '–'],
    ['Forma Pgto', r.payMethod || '–'], ['Status Pgto', r.payStatus || 'pending'],
    ['ID Asaas', r.asaasPaymentId || '–'], ['Envio', r.submittedAt]
  ];
  document.getElementById('modal-cad-body').innerHTML = rows.map(([k, v]) => `
    <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px">
      <span style="color:var(--white-dim);font-size:.72rem;font-weight:600;text-transform:uppercase;min-width:110px">${k}</span>
      <span style="color:var(--white);font-size:.84rem;text-align:right;word-break:break-word">${v}</span>
    </div>`).join('');
  document.getElementById('btn-cancel-cad').disabled = r.status === 'cancelado';
  document.getElementById('modal-cad').style.display = 'flex';
}

async function cancelCad() {
  const r = registrations.find(x => x.id === currentCadId);
  if (!r || r.status === 'cancelado') return;
  if (!confirm(`Cancelar cadastro de ${r.nome}?`)) return;
  const c = contests.find(x => x.id === r.contestId);
  if (c) {
    const slots = [...(c.slots || [])];
    const s = slots.find(x => x.id === r.slotId);
    if (s && s.booked > 0) { s.booked--; await updateDoc(doc(db, 'contests', c.id), { slots }); }
  }
  await updateDoc(doc(db, 'registrations', currentCadId), { status: 'cancelado', payStatus: 'cancelled' });
  document.getElementById('modal-cad').style.display = 'none';
  showToast('Cadastro cancelado.', 'ok');
}

function exportCSV() {
  const cid = document.getElementById('f-concurso')?.value || '';
  const busca = document.getElementById('f-busca')?.value.toLowerCase() || '';
  const data = registrations.filter(r =>
    (!cid || r.contestId === cid) &&
    (!busca || r.nome?.toLowerCase().includes(busca) || r.cpf?.replace(/\D/g, '').includes(busca.replace(/\D/g, '')))
  );
  if (!data.length) { showToast('Nenhum dado.', 'err'); return; }
  const h = ['ID', 'Concurso', 'Nome', 'CPF', 'Matrícula', 'E-mail', 'Celular', 'Unidade', 'Data', 'Hora', 'Pacote', 'Exames', 'Total', 'Cupom', 'Pgto', 'Status', 'Asaas ID', 'Envio'];
  const cols = ['id', 'contestId', 'nome', 'cpf', 'matricula', 'email', 'cel', 'slotCity', 'slotDate', 'slotTime', 'pacoteLabel', 'examesStr', 'total', 'cupom', 'payMethod', 'payStatus', 'asaasPaymentId', 'submittedAt'];
  const rows = [h, ...data.map(r => { r.examesStr = (r.examesSel || []).join('; '); return cols.map(c => '"' + (r[c] || '').toString().replace(/"/g, '""') + '"'); })];
  const blob = new Blob(['\uFEFF' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'prosed_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  showToast('CSV exportado!', 'ok');
}

// ── COUPONS ───────────────────────────────────────────────────
async function addCoupon() {
  const code = document.getElementById('cp-code').value.trim().toUpperCase();
  const type = document.getElementById('cp-type').value;
  const value = parseFloat(document.getElementById('cp-value').value);
  if (!code || !value || value <= 0) { showToast('Preencha código e valor.', 'err'); return; }
  if (coupons.find(c => c.code === code)) { showToast('Código já existe.', 'err'); return; }
  await addDoc(collection(db, 'coupons'), {
    code, type, value,
    maxUses: parseInt(document.getElementById('cp-max').value) || 0,
    uses: 0,
    validity: document.getElementById('cp-val').value,
    contestId: document.getElementById('cp-contest').value,
    active: true,
    createdAt: serverTimestamp()
  });
  ['cp-code', 'cp-value', 'cp-max', 'cp-val'].forEach(id => document.getElementById(id).value = '');
  showToast('Cupom criado!', 'ok');
}

function renderCoupons() {
  const div = document.getElementById('cupons-list');
  if (!coupons.length) { div.innerHTML = '<div class="empty"><div class="empty-icon">🎟️</div><div>Nenhum cupom</div></div>'; return; }
  div.innerHTML = coupons.map(c => `<div class="coupon-row">
    <span class="coupon-code">${c.code}</span>
    <span class="tag tag-amber">${c.type === 'percent' ? c.value + '%' : 'R$ ' + c.value.toFixed(2)}</span>
    <span style="font-size:.76rem;color:var(--white-dim);flex:1">Usos: ${c.uses}/${c.maxUses || '∞'} · ${c.validity || 'sem validade'} · ${c.contestId ? (contests.find(x => x.id === c.contestId)?.nome || c.contestId) : 'Todos'}</span>
    <button class="btn-red btn-sm del-coupon" data-id="${c.id}">✕</button>
  </div>`).join('');
}

// ── CONFIG ────────────────────────────────────────────────────
function loadConfigUI() {
  document.getElementById('asaas-env').value = cfg.asaasEnv || 'sandbox';
  document.getElementById('proxy-url').value = cfg.proxyUrl || '';
  document.getElementById('api-key-inp').value = cfg.apiKey || '';
}
function renderFieldsConfig() {
  const div = document.getElementById('fields-config-list');
  if (!div) return;
  const labels = {
    matricula: 'Nº de Inscrição / Matrícula',
    rg: 'RG',
    orgaoExpedidor: 'Órgão Expedidor + UF',
    dataNasc: 'Data de Nascimento',
    sexo: 'Sexo',
    toxicologico: 'Passo 2: Toxicológico',
    obsAdicionais: 'Observações Adicionais',
  };
  div.innerHTML = Object.entries(labels).map(([key, label]) => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--white-faint);border:1px solid var(--border);border-radius:8px;cursor:pointer;user-select:none;margin-bottom:8px">
      <input type="checkbox" id="fc-${key}" ${fieldsConfig[key] !== false ? 'checked' : ''}
        onchange="fieldsConfig['${key}'] = this.checked"
        style="width:16px;height:16px;accent-color:var(--blue);cursor:pointer"/>
      <span style="font-size:.86rem;font-weight:500">${label}</span>
    </label>`).join('');
}

function saveConfig() {
  cfg.asaasEnv = document.getElementById('asaas-env').value;
  cfg.proxyUrl = document.getElementById('proxy-url').value;
  cfg.apiKey = document.getElementById('api-key-inp').value;
  // Salvar fieldsConfig dos checkboxes
  const labels = ['matricula','rg','orgaoExpedidor','dataNasc','sexo','toxicologico','obsAdicionais'];
  labels.forEach(k => { const el = document.getElementById('fc-' + k); if (el) fieldsConfig[k] = el.checked; });
  saveLocalCfg();
  showToast('Configurações salvas!', 'ok');
}
function changePassword() {
  const old = document.getElementById('pwd-old').value;
  const nw = document.getElementById('pwd-new').value;
  const msg = document.getElementById('pwd-msg');
  if (old !== adminPwd) { msg.style.color = 'var(--red)'; msg.textContent = '⚠ Senha atual incorreta.'; return; }
  if (nw.length < 6) { msg.style.color = 'var(--red)'; msg.textContent = '⚠ Mínimo 6 caracteres.'; return; }
  adminPwd = nw; saveLocalCfg();
  document.getElementById('pwd-old').value = ''; document.getElementById('pwd-new').value = '';
  msg.style.color = 'var(--teal-light)'; msg.textContent = '✓ Senha alterada!';
  setTimeout(() => msg.textContent = '', 3000);
}

// ── HELPERS ───────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
function escH(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast'); t.className = 'toast toast-' + type;
  document.getElementById('toast-icon').textContent = type === 'ok' ? '✓' : '✕';
  document.getElementById('toast-msg').textContent = msg;
  t.style.display = 'flex'; setTimeout(() => t.style.display = 'none', 4200);
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-pwd').focus();
document.getElementById('btn-logout').addEventListener('click', () => location.reload());

document.getElementById('tab-btn-concursos').addEventListener('click', () => switchTab('concursos'));
document.getElementById('tab-btn-novo').addEventListener('click', () => switchTab('novo'));
document.getElementById('tab-btn-cadastros').addEventListener('click', () => switchTab('cadastros'));
document.getElementById('tab-btn-cupons').addEventListener('click', () => switchTab('cupons'));
document.getElementById('tab-btn-config').addEventListener('click', () => switchTab('config'));

document.getElementById('btn-novo-contest').addEventListener('click', () => switchTab('novo'));
document.getElementById('btn-analisar').addEventListener('click', analisarEdital);
document.getElementById('edital-zone').addEventListener('click', () => document.getElementById('edital-inp').click());
document.getElementById('edital-inp').addEventListener('change', e => handleEdital(e.target));
document.getElementById('btn-add-pacote').addEventListener('click', () => addPacote());
document.getElementById('btn-add-exame').addEventListener('click', () => addExame());
document.getElementById('btn-clone').addEventListener('click', cloneTable);
document.getElementById('btn-add-slot').addEventListener('click', addSlot);
document.getElementById('btn-clear-form').addEventListener('click', clearForm);
document.getElementById('btn-save-draft').addEventListener('click', () => saveContest('draft'));
document.getElementById('btn-save-active').addEventListener('click', () => saveContest('active'));
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
document.getElementById('btn-add-coupon').addEventListener('click', addCoupon);
document.getElementById('btn-save-config').addEventListener('click', saveConfig);
document.getElementById('btn-change-pwd').addEventListener('click', changePassword);
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('modal-cad').style.display = 'none');
document.getElementById('btn-close-modal2').addEventListener('click', () => document.getElementById('modal-cad').style.display = 'none');
document.getElementById('btn-cancel-cad').addEventListener('click', cancelCad);
document.getElementById('btn-close-toast').addEventListener('click', () => document.getElementById('toast').style.display = 'none');
document.getElementById('modal-cad').addEventListener('click', e => { if (e.target === document.getElementById('modal-cad')) document.getElementById('modal-cad').style.display = 'none'; });

document.getElementById('f-concurso').addEventListener('change', renderCadastros);
document.getElementById('f-busca').addEventListener('input', renderCadastros);

document.getElementById('cfg-date').addEventListener('input', e => maskDate(e.target));
document.getElementById('cfg-time').addEventListener('input', e => maskTime(e.target));
document.getElementById('nc-prazo').addEventListener('input', e => maskDate(e.target));
document.getElementById('cp-val').addEventListener('input', e => maskDate(e.target));
document.getElementById('cp-code').addEventListener('input', e => e.target.value = e.target.value.toUpperCase());

// Preview da imagem ao digitar URL
document.getElementById('nc-imageUrl').addEventListener('input', e => {
  const url = e.target.value.trim();
  const prev = document.getElementById('nc-imageUrl-preview');
  const img = document.getElementById('nc-imageUrl-img');
  if (url) {
    img.src = url;
    img.onload = () => prev.style.display = 'block';
    img.onerror = () => prev.style.display = 'none';
  } else {
    prev.style.display = 'none';
  }
});

// Delegated events for dynamic elements
document.getElementById('pacotes-body').addEventListener('input', e => {
  const el = e.target; const id = el.dataset.id; const field = el.dataset.field;
  if (id && field) { const item = newPacotes.find(x => x.id === id); if (item) item[field] = el.value; }
});
document.getElementById('pacotes-body').addEventListener('click', e => {
  if (e.target.classList.contains('rm-pac')) removePacote(e.target.dataset.id);
});
document.getElementById('exames-body').addEventListener('input', e => {
  const el = e.target; const id = el.dataset.id; const field = el.dataset.field;
  if (id && field) { const item = newExames.find(x => x.id === id); if (item) item[field] = el.value; }
});
document.getElementById('exames-body').addEventListener('click', e => {
  if (e.target.classList.contains('rm-exa')) removeExame(e.target.dataset.id);
});
document.getElementById('slots-list').addEventListener('click', e => {
  if (e.target.classList.contains('rm-slot')) removeSlot(e.target.dataset.id);
});
document.getElementById('contest-list').addEventListener('click', async e => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('copy-url')) {
    const c = contests.find(x => x.id === id); if (!c || !c.url) return;
    navigator.clipboard.writeText(c.url).then(() => showToast('URL copiada!', 'ok'));
  }
  if (e.target.classList.contains('edit-contest')) {
    const c = contests.find(x => x.id === id); if (!c) return;
    clearForm();
    document.getElementById('nc-nome').value = c.nome;
    document.getElementById('nc-orgao').value = c.orgao;
    document.getElementById('nc-prazo').value = c.prazo || '';
    document.getElementById('nc-status').value = c.status;
    document.getElementById('nc-parcelas').value = c.maxParcelas || 1;
    document.getElementById('nc-resumo').value = c.resumo || '';
    document.getElementById('nc-imageUrl').value = c.imageUrl || '';
    const prev = document.getElementById('nc-imageUrl-preview');
    const img = document.getElementById('nc-imageUrl-img');
    if (c.imageUrl) { img.src = c.imageUrl; prev.style.display = 'block'; } else { prev.style.display = 'none'; }
    document.getElementById('editing-id').value = c.id;
    newSlots = JSON.parse(JSON.stringify(c.slots || []));
    newPacotes = JSON.parse(JSON.stringify(c.pacotes || []));
    newExames = JSON.parse(JSON.stringify(c.exames || []));
    if (c.fieldsConfig) fieldsConfig = Object.assign({ ...fieldsConfig }, c.fieldsConfig);
    renderSlotsList(); renderPacotesTable(); renderExamesTable();
    renderFieldsConfig();
    switchTab('novo');
  }
  if (e.target.classList.contains('toggle-status')) {
    const c = contests.find(x => x.id === id); if (!c) return;
    await updateDoc(doc(db, 'contests', id), { status: c.status === 'active' ? 'draft' : 'active' });
    showToast('Status atualizado.', 'ok');
  }
  if (e.target.classList.contains('del-contest')) {
    if (!confirm('Excluir este concurso?')) return;
    await deleteDoc(doc(db, 'contests', id));
    showToast('Excluído.', 'ok');
  }
});
document.getElementById('cad-body').addEventListener('click', e => {
  if (e.target.classList.contains('open-cad')) openCad(e.target.dataset.id);
});
document.getElementById('cupons-list').addEventListener('click', async e => {
  if (e.target.classList.contains('del-coupon')) {
    await deleteDoc(doc(db, 'coupons', e.target.dataset.id));
    showToast('Cupom removido.', 'ok');
  }
});
