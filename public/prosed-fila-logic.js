// prosed-fila-logic.js
import { db, collection, doc, getDocs, updateDoc, onSnapshot, query, orderBy }
  from './firebase-config.js';

let profissionais = [], registrations = [], contests = [];
let currentUser = null;

function doLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pwd  = document.getElementById('login-pwd').value;
  const prof = profissionais.find(p => p.id === user && p.senha === pwd && p.ativo);
  if (prof) {
    currentUser = prof;
    document.getElementById('login-overlay').style.display = 'none';
    init();
  } else {
    document.getElementById('login-err').textContent = '⚠ Usuário ou senha incorretos.';
    document.getElementById('login-pwd').value = '';
  }
}

async function init() {
  document.getElementById('nav-data').textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  const contSnap = await getDocs(collection(db, 'contests'));
  contests = contSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const hoje = new Date().toLocaleDateString('pt-BR');
  onSnapshot(query(collection(db, 'registrations'), orderBy('submittedAt', 'desc')), snap => {
    registrations = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'cancelado' && r.slotDate === hoje);
    renderFila();
  });

  document.getElementById('fil-unidade').addEventListener('change', renderFila);
}

function renderFila() {
  const unidade = document.getElementById('fil-unidade').value;
  let data = registrations.filter(r => !unidade || r.slotCity === unidade);

  const liberados     = data.filter(r => r.statusRecepcao === 'liberado');
  const emAtendimento = data.filter(r => r.statusRecepcao === 'em-atendimento');
  const concluidos    = data.filter(r => r.statusRecepcao === 'concluido');

  document.getElementById('cnt-liberado').textContent    = liberados.length;
  document.getElementById('cnt-atendimento').textContent = emAtendimento.length;
  document.getElementById('cnt-concluido').textContent   = concluidos.length;

  // Em atendimento
  const secAtend = document.getElementById('sec-atendimento');
  secAtend.style.display = emAtendimento.length ? '' : 'none';
  document.getElementById('list-atendimento').innerHTML = emAtendimento.map((r, i) =>
    cardHTML(r, i + 1, 'em-atendimento')
  ).join('');

  // Aguardando
  const listLib = document.getElementById('list-liberado');
  if (!liberados.length) {
    listLib.innerHTML = '<div class="empty"><div class="empty-icon">🪑</div><div>Nenhum candidato aguardando</div></div>';
  } else {
    listLib.innerHTML = liberados.map((r, i) => cardHTML(r, i + 1, 'liberado')).join('');
  }
}

function cardHTML(r, pos, status) {
  const contest = contests.find(c => c.id === r.contestId);
  const isAtend = status === 'em-atendimento';

  return `<div class="fila-card ${status} fade">
    <div class="fila-num ${status}">${pos}</div>
    <div style="flex:1;min-width:180px">
      <div style="font-weight:700;font-size:.95rem">${r.nome}</div>
      <div style="font-size:.74rem;color:var(--white-dim);margin-top:3px;line-height:1.7">
        ${r.slotTime || '–'} · ${r.slotCity?.replace('Prosed - Unidade ','') || '–'}<br>
        ${contest?.nome || '–'} · ${r.pacoteLabel || '–'}
      </div>
      ${r.liberadoEm ? `<div style="font-size:.7rem;color:var(--teal-light);margin-top:2px">✓ Liberado às ${r.liberadoEm.split(' ')[1] || r.liberadoEm}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
      ${!isAtend ? `<button class="btn-teal btn-sm" onclick="chamar('${r.id}')">📢 Chamar</button>` : ''}
      ${isAtend ? `<button class="btn-amber btn-sm" onclick="concluir('${r.id}')">✅ Concluir</button>` : ''}
      ${isAtend ? `<button class="btn-ghost btn-sm" onclick="devolver('${r.id}')">↩ Devolver</button>` : ''}
    </div>
  </div>`;
}

window.chamar = async function(regId) {
  try {
    await updateDoc(doc(db, 'registrations', regId), {
      statusRecepcao: 'em-atendimento',
      chamadoEm: new Date().toLocaleString('pt-BR'),
      chamadoPor: currentUser?.nome || ''
    });
    showToast('Candidato chamado! ⚕', 'ok');
  } catch(e) { showToast('Erro: ' + e.message, 'err'); }
};

window.concluir = async function(regId) {
  try {
    await updateDoc(doc(db, 'registrations', regId), {
      statusRecepcao: 'concluido',
      concluidoEm: new Date().toLocaleString('pt-BR'),
      concluidoPor: currentUser?.nome || ''
    });
    showToast('Atendimento concluído! ✅', 'ok');
  } catch(e) { showToast('Erro: ' + e.message, 'err'); }
};

window.devolver = async function(regId) {
  try {
    await updateDoc(doc(db, 'registrations', regId), { statusRecepcao: 'liberado' });
    showToast('Candidato devolvido para a fila.', 'ok');
  } catch(e) { showToast('Erro: ' + e.message, 'err'); }
};

function showToast(msg, type='ok') {
  const t = document.getElementById('toast'); t.className = 'toast toast-' + type;
  document.getElementById('toast-icon').textContent = type === 'ok' ? '✓' : '✕';
  document.getElementById('toast-msg').textContent = msg;
  t.style.display = 'flex'; setTimeout(() => t.style.display = 'none', 4000);
}

document.getElementById('btn-login').addEventListener('click', async () => {
  if (!profissionais.length) {
    const snap = await getDocs(collection(db, 'profissionais'));
    profissionais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  doLogin();
});
document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });
document.getElementById('btn-logout').addEventListener('click', () => location.reload());
