// prosed-admin-logic.js
import { db, collection, doc, getDoc, getDocs, setDoc, addDoc,
         updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp }
  from './firebase-config.js';

// ── FIELDS CONFIG ─────────────────────────────────────────────
const FORM_FIELDS = [
  { key: 'rg', label: '🪪 Solicitar RG (+ Órgão Expedidor e UF)' },
];

function renderFieldsGrid(current) {
  const grid = document.getElementById('fields-config-grid');
  if (!grid) return;
  // Se nunca foi configurado (undefined/null), todos ligados por padrão
  // Se foi configurado, respeitar exatamente o que está salvo
  const neverConfigured = (current === undefined || current === null);
  grid.innerHTML = FORM_FIELDS.map(f => {
    const on = neverConfigured ? true : (current[f.key] !== false);
    return `<label style="display:flex;align-items:center;gap:8px;background:var(--white-faint);border:1.5px solid ${on?'rgba(0,201,167,.4)':'var(--border)'};border-radius:9px;padding:10px 12px;cursor:pointer;transition:border .15s">
      <input type="checkbox" data-field="${f.key}" ${on?'checked':''} onchange="toggleFieldStyle(this)" style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer"/>
      <span style="font-size:.8rem;font-weight:500;${!on?'opacity:.45':''}" id="flbl-${f.key}">${f.label}</span>
    </label>`;
  }).join('');
}

function toggleFieldStyle(cb) {
  const lbl = document.getElementById('flbl-' + cb.dataset.field);
  if (lbl) lbl.style.opacity = cb.checked ? '' : '.45';
  cb.closest('label').style.borderColor = cb.checked ? 'rgba(0,201,167,.4)' : '';
}

function getFieldsConfig() {
  const cfg = {};
  document.querySelectorAll('#fields-config-grid input[type=checkbox]').forEach(cb => {
    cfg[cb.dataset.field] = cb.checked;
  });
  // orgaoExpedidor e ufRg seguem automaticamente o RG
  cfg.orgaoExpedidor = cfg.rg;
  cfg.ufRg = cfg.rg;
  // matricula, toxicologico e docUpload sempre desligados (removidos da UI)
  cfg.matricula = false;
  cfg.toxicologico = false;
  cfg.docUpload = false;
  return cfg;
}

// ── STATE ─────────────────────────────────────────────────────
let adminPwd = 'pces2025';
let contests = [], registrations = [], coupons = [];
let newSlots = [], newExames = [], newPacotes = [];
let editalB64 = null, currentCadId = null, currentTab = 'concursos';
let profissionais = [];
let cfg = { asaasEnv: 'sandbox', proxyUrl: 'https://prosed-sistema.vercel.app', apiKey: '' };

// ── CONFIG LOCAL ──────────────────────────────────────────────
function loadLocalCfg() {
  try {
    const c = localStorage.getItem('p_cfg');
    const p = localStorage.getItem('p_pwd');
    if (c) cfg = Object.assign(cfg, JSON.parse(c));
    if (p) adminPwd = p;
  } catch(e) {}
}
function saveLocalCfg() {
  try {
    localStorage.setItem('p_cfg', JSON.stringify(cfg));
    localStorage.setItem('p_pwd', adminPwd);
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

  onSnapshot(collection(db, 'profissionais'), snap => {
    profissionais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === 'profissionais') renderProfissionais();
  });
}

// ── TABS ──────────────────────────────────────────────────────
function switchTab(t) {
  currentTab = t;
  ['concursos','novo','cadastros','prontuarios','profissionais','cupons','config'].forEach(id => {
    const btn = document.getElementById('tab-btn-' + id);
    const tab = document.getElementById('tab-' + id);
    if (btn) btn.classList.toggle('active', id === t);
    if (tab) tab.classList.toggle('active', id === t);
  });
  if (t === 'novo') initForm();
  if (t === 'cadastros') renderCadastros();
  if (t === 'prontuarios') renderProntuarios();
  if (t === 'profissionais') renderProfissionais();
  if (t === 'cupons') renderCoupons();
  if (t === 'config') loadConfigUI();
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

// ── ENDEREÇOS FIXOS POR UNIDADE ───────────────────────────────
const UNIT_ADDRESSES = {
  'Prosed - Unidade Vila Velha': 'Av. Profa. Francelina Carneiro Setúbal, 168 - Divino Espírito Santo, Vila Velha - ES',
  'Prosed - Unidade Vitória':    'R. Neves Armond, 535 - Bento Ferreira, Vitória - ES',
  'Prosed - Unidade Cariacica':  'R. José Barros da Silva, 17 - Campo Grande, Cariacica - ES',
  'Prosed - Unidade Serra':      'R. Humberto de Campos, 25 - Parque Res. Laranjeiras, Serra - ES',
};

// ── SLOTS ─────────────────────────────────────────────────────
function addSlot() {
  const city = document.getElementById('cfg-city').value;
  const date = document.getElementById('cfg-date').value;
  const time = document.getElementById('cfg-time').value;
  const max = parseInt(document.getElementById('cfg-max').value);
  if (!city || !date || date.length < 10 || !time || time.length < 5 || !max || max < 1) { showToast('Preencha todos os campos.', 'err'); return; }
  const address = UNIT_ADDRESSES[city] || '';
  newSlots.push({ id: 's' + Date.now(), city, date, time, max, booked: 0, address });
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
    <span style="font-size:.78rem;color:var(--white-dim);flex:1">${s.max} vagas${s.address ? ' · ' + s.address : ''}</span>
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
      fieldsConfig: getFieldsConfig(),
      pacotes: [...newPacotes],
      exames: [...newExames],
      slots: [...newSlots],
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
  renderFieldsGrid(undefined); // novo concurso: todos marcados por padrão
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
  ['f-concurso', 'cp-contest', 'pront-concurso'].forEach(selId => {
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
function saveConfig() {
  cfg.asaasEnv = document.getElementById('asaas-env').value;
  cfg.proxyUrl = document.getElementById('proxy-url').value;
  cfg.apiKey = document.getElementById('api-key-inp').value;
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

// ── PRONTUÁRIOS ───────────────────────────────────────────────
let prontuarioResults = {}; // { registrationId: { exameId: { valor, ref, avaliacao }, ... } }

function renderProntuarios() {
  const cid = document.getElementById('pront-concurso')?.value || '';
  const busca = document.getElementById('pront-busca')?.value.toLowerCase() || '';
  const data = registrations.filter(r =>
    r.status !== 'cancelado' &&
    (!cid || r.contestId === cid) &&
    (!busca || r.nome?.toLowerCase().includes(busca) || r.cpf?.replace(/\D/g,'').includes(busca.replace(/\D/g,'')))
  );
  document.getElementById('pront-count').textContent = data.length + ' candidato' + (data.length !== 1 ? 's' : '');
  const tbody = document.getElementById('pront-body');
  const empty = document.getElementById('pront-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(r => {
    const pRes = prontuarioResults[r.id] || {};
    const exames = getExamesForReg(r);
    const total = exames.length;
    const done = exames.filter(e => pRes[e.id]?.avaliacao).length;
    const allApto = total > 0 && done === total && exames.every(e => pRes[e.id]?.avaliacao === 'apto');
    const hasInapto = exames.some(e => pRes[e.id]?.avaliacao === 'inapto');
    const statusBadge = done === 0 ? '<span class="tag tag-amber">Pendente</span>'
      : done < total ? `<span class="tag tag-amber">${done}/${total} exames</span>`
      : hasInapto ? '<span class="tag tag-red">Inapto</span>'
      : '<span class="tag tag-teal">Apto</span>';
    return `<tr>
      <td style="font-weight:600">${r.nome}</td>
      <td class="mono" style="font-size:.78rem;color:var(--white-dim)">${r.cpf}</td>
      <td style="font-size:.78rem">${contests.find(c => c.id === r.contestId)?.nome || '–'}</td>
      <td style="font-size:.78rem">${r.slotDate || '–'} ${r.slotTime || ''}</td>
      <td>${statusBadge}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-ghost btn-sm open-pront" data-id="${r.id}">📋 Prontuário</button>
        <button class="btn-ghost btn-sm print-pront" data-id="${r.id}" style="color:var(--teal-light)">🖨️ Imprimir</button>
      </td>
    </tr>`;
  }).join('');
}

function getExamesForReg(r) {
  const contest = contests.find(c => c.id === r.contestId);
  if (!contest) return [];
  if (r.pacoteId === 'avulsos') {
    return (contest.exames || []).filter(e => (r.examesSel || []).includes(e.nome));
  }
  // Para pacotes, retorna todos os exames do concurso
  return contest.exames || [];
}

function openProntuario(regId) {
  const r = registrations.find(x => x.id === regId); if (!r) return;
  const contest = contests.find(c => c.id === r.contestId); if (!contest) return;
  const exames = getExamesForReg(r);
  const pRes = prontuarioResults[regId] || {};

  const examesHTML = exames.length === 0
    ? '<p style="color:var(--white-dim);font-size:.84rem">Nenhum exame cadastrado para este concurso.</p>'
    : `<table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead><tr style="background:var(--white-faint)">
          <th style="padding:8px 10px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em">Exame</th>
          <th style="padding:8px 10px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em">Valor Encontrado</th>
          <th style="padding:8px 10px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em">Ref. Normal</th>
          <th style="padding:8px 10px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em">Avaliação</th>
        </tr></thead>
        <tbody>
          ${exames.map(e => {
            const res = pRes[e.id] || {};
            const av = res.avaliacao || '';
            const avColor = av === 'apto' ? 'var(--teal)' : av === 'inapto' ? 'var(--red)' : 'var(--amber)';
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:10px;font-size:.84rem;font-weight:500">${e.nome}
                ${e.orientacoes ? `<div style="font-size:.7rem;color:var(--amber);margin-top:2px">⚠ ${e.orientacoes}</div>` : ''}
              </td>
              <td style="padding:10px"><input type="text" class="pront-inp" placeholder="ex: 12,5 g/dL"
                data-reg="${regId}" data-exame="${e.id}" data-field="valor"
                value="${escH(res.valor||'')}"
                style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-size:.82rem;width:100%;max-width:140px"/></td>
              <td style="padding:10px"><input type="text" class="pront-inp" placeholder="ex: 12-16 g/dL"
                data-reg="${regId}" data-exame="${e.id}" data-field="ref"
                value="${escH(res.ref||'')}"
                style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-size:.82rem;width:100%;max-width:140px"/></td>
              <td style="padding:10px">
                <select class="pront-sel" data-reg="${regId}" data-exame="${e.id}" data-field="avaliacao"
                  style="background:var(--navy-mid);border:1px solid ${avColor};border-radius:6px;padding:6px 8px;color:${avColor};font-size:.82rem;font-weight:700">
                  <option value="">Pendente</option>
                  <option value="apto" ${av==='apto'?'selected':''}>✓ Apto</option>
                  <option value="inapto" ${av==='inapto'?'selected':''}>✗ Inapto</option>
                  <option value="pendente" ${av==='pendente'?'selected':''}>⏳ Pendente</option>
                </select>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

  const obsVal = pRes._obs || '';
  const medicoVal = pRes._medico || '';
  const crmVal = pRes._crm || '';
  const rqeVal = pRes._rqe || '';

  document.getElementById('modal-pront-body').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.82rem;background:var(--white-faint);border-radius:10px;padding:12px 14px;margin-bottom:16px">
        <div><span style="color:var(--white-dim)">Candidato:</span> <strong>${r.nome}</strong></div>
        <div><span style="color:var(--white-dim)">CPF:</span> ${r.cpf}</div>
        <div><span style="color:var(--white-dim)">Concurso:</span> ${contest.nome}</div>
        <div><span style="color:var(--white-dim)">Data:</span> ${r.slotDate} ${r.slotTime}</div>
        <div><span style="color:var(--white-dim)">Pacote:</span> ${r.pacoteLabel || '–'}</div>
        <div><span style="color:var(--white-dim)">Protocolo:</span> <span class="mono" style="color:var(--blue-light)">${r.id}</span></div>
      </div>
      ${examesHTML}
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="field"><label class="fl">Médico Responsável</label>
          <input type="text" id="pront-medico" placeholder="Nome do médico" value="${escH(medicoVal)}"
            style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--white);font-size:.84rem;width:100%"/></div>
        <div class="field"><label class="fl">CRM</label>
          <input type="text" id="pront-crm" placeholder="CRM/ES 00000" value="${escH(crmVal)}"
            style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--white);font-size:.84rem;width:100%"/></div>
        <div class="field"><label class="fl">RQE</label>
          <input type="text" id="pront-rqe" placeholder="ex: 12345" value="${escH(rqeVal)}"
            style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--white);font-size:.84rem;width:100%"/></div>
      </div>
      <div class="field" style="margin-top:10px"><label class="fl">Observações Clínicas</label>
        <textarea id="pront-obs" placeholder="Observações do médico..." rows="3"
          style="background:var(--white-faint);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--white);font-size:.84rem;width:100%;resize:vertical">${escH(obsVal)}</textarea></div>
    </div>`;

  document.getElementById('btn-save-pront').onclick = () => saveProntuario(regId, exames);
  document.getElementById('btn-print-pront').onclick = () => { saveProntuario(regId, exames, true); };
  document.getElementById('modal-pront').style.display = 'flex';
}

function saveProntuario(regId, exames, andPrint = false) {
  if (!prontuarioResults[regId]) prontuarioResults[regId] = {};
  // Coleta inputs da tabela
  document.querySelectorAll('.pront-inp, .pront-sel').forEach(el => {
    const { reg, exame, field } = el.dataset;
    if (reg === regId) {
      if (!prontuarioResults[reg][exame]) prontuarioResults[reg][exame] = {};
      prontuarioResults[reg][exame][field] = el.value;
      // Atualiza cor do select ao salvar
      if (field === 'avaliacao' && el.tagName === 'SELECT') {
        const col = el.value === 'apto' ? 'var(--teal)' : el.value === 'inapto' ? 'var(--red)' : 'var(--amber)';
        el.style.borderColor = col; el.style.color = col;
      }
    }
  });
  prontuarioResults[regId]._obs = document.getElementById('pront-obs')?.value || '';
  prontuarioResults[regId]._medico = document.getElementById('pront-medico')?.value || '';
  prontuarioResults[regId]._crm = document.getElementById('pront-crm')?.value || '';
  prontuarioResults[regId]._rqe = document.getElementById('pront-rqe')?.value || '';
  showToast('Prontuário salvo!', 'ok');
  renderProntuarios();
  if (andPrint) printProntuario(regId, exames);
  else document.getElementById('modal-pront').style.display = 'none';
}

function printProntuario(regId, examesParam) {
  const r = registrations.find(x => x.id === regId); if (!r) return;
  const contest = contests.find(c => c.id === r.contestId); if (!contest) return;
  const exames = examesParam || getExamesForReg(r);
  const pRes = prontuarioResults[regId] || {};
  const medico = pRes._medico || '___________________________';
  const crm = pRes._crm || '___________';
  const rqe = pRes._rqe || '';
  const obs = pRes._obs || '';

  // Verifica resultado geral
  const total = exames.length;
  const done = exames.filter(e => pRes[e.id]?.avaliacao).length;
  const hasInapto = exames.some(e => pRes[e.id]?.avaliacao === 'inapto');
  const resultadoGeral = done === 0 ? 'PENDENTE'
    : hasInapto ? 'INAPTO'
    : done === total ? 'APTO'
    : 'EM ANÁLISE';
  const resColor = resultadoGeral === 'APTO' ? '#00C9A7' : resultadoGeral === 'INAPTO' ? '#FF4757' : '#FFB800';

  const examesRows = exames.map(e => {
    const res = pRes[e.id] || {};
    const av = res.avaliacao || '';
    const avLabel = av === 'apto' ? '✓ APTO' : av === 'inapto' ? '✗ INAPTO' : '⏳ PENDENTE';
    const avColor = av === 'apto' ? '#00C9A7' : av === 'inapto' ? '#FF4757' : '#888';
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px">${e.nome}${e.orientacoes ? `<br><span style="font-size:10px;color:#B8860B">⚠ ${e.orientacoes}</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center">${res.valor || '___________'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center">${res.ref || '___________'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;font-weight:700;color:${avColor}">${avLabel}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Prontuário – ${r.nome}</title>
  <style>
    @page { margin: 18mm 15mm; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; }
    .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #1a56db; padding-bottom:10px; margin-bottom:16px; }
    .header-left { display:flex; align-items:center; gap:12px; }
    .logo-box { background:#f0f4ff; border-radius:8px; padding:8px 12px; font-size:22px; font-weight:900; color:#1a56db; letter-spacing:-1px; }
    .org { font-size:11px; color:#666; }
    .proto { font-size:11px; text-align:right; color:#666; }
    .proto strong { color:#1a56db; font-size:13px; }
    .section { margin-bottom:14px; }
    .section-title { background:#1a56db; color:#fff; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; padding:4px 10px; border-radius:4px; margin-bottom:8px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; font-size:12px; }
    .info-row { display:flex; gap:6px; padding:3px 0; border-bottom:1px dotted #ddd; }
    .info-key { color:#666; min-width:90px; font-size:11px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#f0f4ff; color:#1a56db; font-size:10px; text-transform:uppercase; letter-spacing:.08em; padding:7px 10px; text-align:left; border-bottom:2px solid #1a56db; }
    .resultado-box { border:3px solid ${resColor}; border-radius:8px; padding:12px 16px; text-align:center; margin:14px 0; }
    .resultado-label { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:#666; }
    .resultado-val { font-size:22px; font-weight:900; color:${resColor}; margin-top:2px; }
    .assinatura { display:flex; justify-content:space-between; margin-top:20px; padding-top:14px; border-top:1px solid #ddd; }
    .assin-box { text-align:center; min-width:200px; }
    .assin-line { border-bottom:1px solid #333; margin-bottom:6px; height:30px; }
    .assin-label { font-size:10px; color:#666; }
    .footer { text-align:center; font-size:9px; color:#999; border-top:1px solid #ddd; padding-top:8px; margin-top:16px; }
    @media print { button { display:none; } }
  </style></head><body>
  <div class="header">
    <div class="header-left">
      <div class="logo-box">PROSED</div>
      <div><div style="font-weight:700;font-size:15px;color:#1a56db">PRONTUÁRIO DE EXAME ADMISSIONAL</div>
        <div class="org">Medicina do Trabalho · ${contest.nome}</div></div>
    </div>
    <div class="proto">Protocolo<br><strong>${r.id}</strong><br>${new Date().toLocaleDateString('pt-BR')}</div>
  </div>

  <div class="section">
    <div class="section-title">Dados do Candidato</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-key">Nome:</span><strong>${r.nome}</strong></div>
      <div class="info-row"><span class="info-key">CPF:</span>${r.cpf}</div>
      <div class="info-row"><span class="info-key">RG:</span>${r.rg || '–'} ${r.orgao ? r.orgao + '/' + (r.uf||'') : ''}</div>
      <div class="info-row"><span class="info-key">Nascimento:</span>${r.nasc || '–'}</div>
      <div class="info-row"><span class="info-key">Celular:</span>${r.cel || '–'}</div>
      <div class="info-row"><span class="info-key">E-mail:</span>${r.email || '–'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Agendamento</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-key">Unidade:</span>${r.slotCity}</div>
      <div class="info-row"><span class="info-key">Data / Hora:</span>${r.slotDate} às ${r.slotTime}</div>
      <div class="info-row"><span class="info-key">Pacote:</span>${r.pacoteLabel || '–'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Resultados dos Exames</div>
    <table>
      <thead><tr>
        <th>Exame</th><th style="text-align:center">Valor Encontrado</th><th style="text-align:center">Ref. Normal</th><th style="text-align:center">Avaliação</th>
      </tr></thead>
      <tbody>${examesRows}</tbody>
    </table>
  </div>

  ${obs ? `<div class="section">
    <div class="section-title">Observações Clínicas</div>
    <div style="font-size:12px;line-height:1.7;padding:8px;background:#f9f9f9;border-radius:4px">${obs}</div>
  </div>` : ''}

  <div class="resultado-box">
    <div class="resultado-label">Resultado da Avaliação Admissional</div>
    <div class="resultado-val">${resultadoGeral}</div>
  </div>

  <div class="assinatura">
    <div class="assin-box">
      <div class="assin-line"></div>
      <div style="font-size:12px;font-weight:600">${medico}</div>
      <div class="assin-label">${crm}${rqe ? ' · RQE ' + rqe : ''}</div>
      <div class="assin-label">Médico do Trabalho</div>
    </div>
    <div class="assin-box">
      <div class="assin-line"></div>
      <div style="font-size:12px;font-weight:600">${r.nome}</div>
      <div class="assin-label">Candidato</div>
    </div>
  </div>

  <div class="footer">PROSED – Medicina do Trabalho · Documento gerado em ${new Date().toLocaleString('pt-BR')} · Protocolo ${r.id}</div>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── PROFISSIONAIS ─────────────────────────────────────────────
function renderProfissionais() {
  // Popula select de concurso no filtro de exames
  const sel = document.getElementById('prof-concurso-fil');
  if (sel) {
    sel.innerHTML = '<option value="">Selecione...</option>' + contests.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  }
  const div = document.getElementById('prof-list');
  if (!profissionais.length) {
    div.innerHTML = '<div class="empty"><div class="empty-icon">🩺</div><div>Nenhum profissional cadastrado</div></div>';
    return;
  }
  div.innerHTML = profissionais.map(p => `
    <div class="contest-card" style="margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;font-size:.92rem;margin-bottom:3px">${p.nome}
            <span class="tag ${p.ativo?'tag-teal':'tag-red'}" style="margin-left:6px">${p.ativo?'Ativo':'Inativo'}</span>
          </div>
          <div style="font-size:.75rem;color:var(--white-dim);line-height:1.7">
            👤 <span class="mono">${p.id}</span> · ${p.especialidade||'–'} · ${p.crm?'CRM '+p.crm+' · ':''}${p.rqe?'RQE '+p.rqe+' · ':''}${(p.exames||[]).length} exame${(p.exames||[]).length!==1?'s':''} atribuídos
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0">
          <button class="btn-ghost btn-sm edit-prof" data-id="${p.id}">✏️ Editar</button>
          <button class="btn-ghost btn-sm toggle-prof" data-id="${p.id}" style="color:${p.ativo?'var(--amber)':'var(--teal)'}">${p.ativo?'⏸ Desativar':'▶ Ativar'}</button>
          <button class="btn-red btn-sm del-prof" data-id="${p.id}">✕</button>
        </div>
      </div>
    </div>`).join('');
}

function loadProfExames() {
  const cid = document.getElementById('prof-concurso-fil').value;
  const grid = document.getElementById('prof-exames-grid');
  if (!cid) { grid.innerHTML = '<div style="font-size:.78rem;color:var(--white-dim)">Selecione um concurso para ver os exames.</div>'; return; }
  const contest = contests.find(c => c.id === cid);
  const exames = contest?.exames || [];
  if (!exames.length) { grid.innerHTML = '<div style="font-size:.78rem;color:var(--white-dim)">Este concurso não tem exames cadastrados.</div>'; return; }
  // Pega exames já marcados (se estiver editando)
  const editId = document.getElementById('prof-editing-id').value;
  const editProf = editId ? profissionais.find(p => p.id === editId) : null;
  const marcados = editProf?.exames || [];
  grid.innerHTML = exames.map(e => {
    const on = marcados.includes(e.id);
    return `<label style="display:flex;align-items:center;gap:8px;background:var(--white-faint);border:1.5px solid ${on?'rgba(0,201,167,.4)':'var(--border)'};border-radius:9px;padding:9px 12px;cursor:pointer;margin-bottom:6px">
      <input type="checkbox" data-exame-id="${e.id}" ${on?'checked':''} style="width:15px;height:15px;accent-color:var(--teal);cursor:pointer"/>
      <span style="font-size:.8rem;font-weight:500">${e.nome}</span>
      ${e.orientacoes?`<span style="font-size:.7rem;color:var(--amber);margin-left:auto">⚠ ${e.orientacoes}</span>`:''}
    </label>`;
  }).join('');
}

async function saveProf() {
  const editId = document.getElementById('prof-editing-id').value;
  const nome   = document.getElementById('prof-nome').value.trim();
  const user   = document.getElementById('prof-user').value.trim().toLowerCase();
  const senha  = document.getElementById('prof-senha').value;
  const crm    = document.getElementById('prof-crm').value.trim();
  const rqe    = document.getElementById('prof-rqe').value.trim(); 
  const esp    = document.getElementById('prof-esp').value.trim();

  if (!nome || !user) { showToast('Informe nome e usuário.', 'err'); return; }
  if (!editId && !senha) { showToast('Informe a senha.', 'err'); return; }
  if (senha && senha.length < 6) { showToast('Senha mínimo 6 caracteres.', 'err'); return; }
  if (!editId && profissionais.find(p => p.id === user)) { showToast('Usuário já existe.', 'err'); return; }

  // Coleta exames marcados
  const examesMarcados = [...document.querySelectorAll('#prof-exames-grid input[type=checkbox]:checked')].map(cb => cb.dataset.exameId);

  const data = { nome, crm, rqe, especialidade: esp, exames: examesMarcados, ativo: true };
  if (senha) data.senha = senha;

  const btn = document.getElementById('btn-save-prof');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';

  try {
    if (editId) {
      await updateDoc(doc(db, 'profissionais', editId), data);
      showToast('Profissional atualizado!', 'ok');
    } else {
      data.criadoEm = new Date().toLocaleString('pt-BR');
      await setDoc(doc(db, 'profissionais', user), data);
      showToast('Profissional cadastrado!', 'ok');
    }
    clearProfForm();
  } catch(e) { showToast('Erro: ' + e.message, 'err'); }
  btn.disabled = false; btn.innerHTML = '💾 Salvar Profissional';
}

function clearProfForm() {
  ['prof-nome','prof-user','prof-senha','prof-crm', 'prof-rqe','prof-esp','prof-editing-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
  document.getElementById('prof-exames-grid').innerHTML = '<div style="font-size:.78rem;color:var(--white-dim)">Selecione um concurso para ver os exames disponíveis.</div>';
  document.getElementById('prof-concurso-fil').value = '';
  document.getElementById('prof-user').disabled = false;
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
const pronTabBtn = document.getElementById('tab-btn-prontuarios');
if (pronTabBtn) pronTabBtn.addEventListener('click', () => switchTab('prontuarios'));
const profissionaisTabBtn = document.getElementById('tab-btn-profissionais');
if (profissionaisTabBtn) profissionaisTabBtn.addEventListener('click', () => switchTab('profissionais'));
document.getElementById('tab-btn-cupons').addEventListener('click', () => switchTab('cupons'));
document.getElementById('tab-btn-config').addEventListener('click', () => switchTab('config'));

const btnSaveProf = document.getElementById('btn-save-prof');
if (btnSaveProf) btnSaveProf.addEventListener('click', saveProf);

// Delegated for profissionais list
document.addEventListener('click', async e => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('edit-prof')) {
    const p = profissionais.find(x => x.id === id); if (!p) return;
    document.getElementById('prof-nome').value = p.nome || '';
    document.getElementById('prof-user').value = p.id;
    document.getElementById('prof-user').disabled = true;
    document.getElementById('prof-senha').value = '';
    document.getElementById('prof-crm').value = p.crm || '';
    document.getElementById('prof-rqe').value = p.rqe || '';
    document.getElementById('prof-esp').value = p.especialidade || '';
    document.getElementById('prof-editing-id').value = p.id;
    // Tenta carregar exames do primeiro concurso que tiver
    if (contests.length) {
      document.getElementById('prof-concurso-fil').value = contests[0].id;
      loadProfExames();
    }
    document.getElementById('tab-btn-profissionais').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (e.target.classList.contains('toggle-prof')) {
    const p = profissionais.find(x => x.id === id); if (!p) return;
    await updateDoc(doc(db, 'profissionais', id), { ativo: !p.ativo });
    showToast('Status atualizado.', 'ok');
  }
  if (e.target.classList.contains('del-prof')) {
    if (!confirm('Excluir este profissional?')) return;
    await deleteDoc(doc(db, 'profissionais', id));
    showToast('Profissional removido.', 'ok');
  }
});

window.loadProfExames = loadProfExames;

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
    renderFieldsGrid(c.fieldsConfig ?? undefined);
    newSlots = JSON.parse(JSON.stringify(c.slots || []));
    newPacotes = JSON.parse(JSON.stringify(c.pacotes || []));
    newExames = JSON.parse(JSON.stringify(c.exames || []));
    renderSlotsList(); renderPacotesTable(); renderExamesTable();
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

// Prontuários delegated events
document.addEventListener('click', e => {
  if (e.target.classList.contains('open-pront')) openProntuario(e.target.dataset.id);
  if (e.target.classList.contains('print-pront')) {
    const r = registrations.find(x => x.id === e.target.dataset.id);
    if (r) printProntuario(e.target.dataset.id, getExamesForReg(r));
  }
});
const prontConc = document.getElementById('pront-concurso');
if (prontConc) prontConc.addEventListener('change', renderProntuarios);
const prontBusca = document.getElementById('pront-busca');
if (prontBusca) prontBusca.addEventListener('input', renderProntuarios);
const btnSavePront = document.getElementById('btn-save-pront');
const btnClosePront = document.getElementById('btn-close-pront');
const btnClosePront2 = document.getElementById('btn-close-pront2');
if (btnClosePront) btnClosePront.addEventListener('click', () => document.getElementById('modal-pront').style.display = 'none');
if (btnClosePront2) btnClosePront2.addEventListener('click', () => document.getElementById('modal-pront').style.display = 'none');
const modalPront = document.getElementById('modal-pront');
if (modalPront) modalPront.addEventListener('click', e => { if (e.target === modalPront) modalPront.style.display = 'none'; });

// Expose inline handler
window.toggleFieldStyle = toggleFieldStyle;
