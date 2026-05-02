// prosed-recepcao-logic.js
import { db, collection, doc, getDocs, updateDoc, onSnapshot, query, orderBy, where }
  from './firebase-config.js';

// ── AUTH ──────────────────────────────────────────────────────
let profissionais = [], registrations = [], contests = [];
let currentUser = null, currentReg = null;
let pagamentoSel = 'pix';

function doLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pwd  = document.getElementById('login-pwd').value;
  if (!user || !pwd) { showErr('Preencha usuário e senha.'); return; }
  // Verifica recepcionistas (profissionais com especialidade = 'Recepção' ou cargo especial)
  // OU verifica credenciais fixas de recepção
  const prof = profissionais.find(p => p.id === user && p.senha === pwd && p.ativo);
  if (prof) {
    currentUser = prof;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('nav-user').textContent = prof.nome;
    init();
  } else {
    showErr('Usuário ou senha incorretos.');
    document.getElementById('login-pwd').value = '';
  }
}

function showErr(msg) {
  document.getElementById('login-err').textContent = '⚠ ' + msg;
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  // Carrega profissionais e contests primeiro
  const [profSnap, contSnap] = await Promise.all([
    getDocs(collection(db, 'profissionais')),
    getDocs(collection(db, 'contests'))
  ]);
  profissionais = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  contests = contSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Listener em tempo real nas registrations
  onSnapshot(query(collection(db, 'registrations'), orderBy('submittedAt', 'desc')), snap => {
    registrations = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'cancelado');
    renderLista();
  });

  // Filtros
  document.getElementById('fil-unidade').addEventListener('change', renderLista);
  document.getElementById('fil-busca').addEventListener('input', renderLista);
  document.getElementById('fil-data').addEventListener('change', renderLista);
}

// ── RENDER LISTA ──────────────────────────────────────────────
function renderLista() {
  const unidade = document.getElementById('fil-unidade').value;
  const busca   = document.getElementById('fil-busca').value.toLowerCase();
  const dataFil = document.getElementById('fil-data').value; // formato YYYY-MM-DD
  // Converte para DD/MM/AAAA para comparar com slotDate
  const dataFmt = dataFil ? dataFil.split('-').reverse().join('/') : '';

  let data = registrations.filter(r =>
    (!unidade || r.slotCity === unidade) &&
    (!dataFmt || r.slotDate === dataFmt) &&
    (!busca || r.nome?.toLowerCase().includes(busca) || r.cpf?.replace(/\D/g,'').includes(busca.replace(/\D/g,'')))
  );

  // Ordena: em-atendimento > pendente > liberado > concluido
  const ordem = { 'em-atendimento': 0, 'aguardando': 1, 'liberado': 2, 'concluido': 3 };
  data.sort((a, b) => (ordem[a.statusRecepcao||'aguardando'] || 1) - (ordem[b.statusRecepcao||'aguardando'] || 1));

  const pendentes  = data.filter(r => !r.statusRecepcao || r.statusRecepcao === 'aguardando').length;
  const liberados  = data.filter(r => r.statusRecepcao === 'liberado' || r.statusRecepcao === 'em-atendimento').length;
  document.getElementById('count-total').textContent    = data.length + ' candidato' + (data.length !== 1 ? 's' : '');
  document.getElementById('count-pendente').textContent = pendentes + ' pendente' + (pendentes !== 1 ? 's' : '');
  document.getElementById('count-liberado').textContent = liberados + ' liberado' + (liberados !== 1 ? 's' : '');

  const div = document.getElementById('cand-list');
  if (!data.length) {
    div.innerHTML = '<div class="empty fade"><div class="empty-icon">📋</div><div>Nenhum candidato encontrado</div></div>';
    return;
  }

  div.innerHTML = data.map(r => {
    const status = r.statusRecepcao || 'aguardando';
    const saldo  = r.saldoDevedor || 0;
    const contest = contests.find(c => c.id === r.contestId);

    const statusTag = status === 'liberado'
      ? '<span class="tag tag-teal">✓ Liberado</span>'
      : status === 'em-atendimento'
      ? '<span class="tag tag-amber">⚕ Em Atendimento</span>'
      : status === 'concluido'
      ? '<span class="tag" style="background:rgba(46,213,115,.15);color:#2ED573;border:1px solid rgba(46,213,115,.25)">✅ Concluído</span>'
      : '<span class="tag tag-amber">⏳ Aguardando</span>';

    const saldoInfo = saldo > 0
      ? `<span style="font-size:.76rem;color:var(--amber);font-weight:600">⚠ Saldo: R$ ${brl(saldo)}</span>`
      : `<span style="font-size:.76rem;color:var(--teal-light)">✓ Quitado</span>`;

    return `<div class="cand-card ${status}" onclick="abrirAtendimento('${r.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:4px">${r.nome}</div>
          <div style="font-size:.75rem;color:var(--white-dim);line-height:1.8">
            <span class="mono">${r.cpf}</span> · ${r.slotTime || '–'} · ${r.slotCity?.replace('Prosed - Unidade ','') || '–'}
            <br>${contest?.nome || '–'} · ${r.pacoteLabel || '–'}
          </div>
          <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${statusTag}
            ${saldoInfo}
          </div>
        </div>
        <div style="font-size:1.8rem;opacity:.6">${status === 'liberado' || status === 'em-atendimento' ? '✅' : '⏳'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── ATENDIMENTO MODAL ────────────────────────────────────────
window.abrirAtendimento = function(regId) {
  currentReg = registrations.find(r => r.id === regId);
  if (!currentReg) return;
  const r = currentReg;
  const saldo = r.saldoDevedor || 0;
  const status = r.statusRecepcao || 'aguardando';
  const contest = contests.find(c => c.id === r.contestId);

  const infoRows = [
    ['Nome', `<strong>${r.nome}</strong>`],
    ['CPF', `<span class="mono">${r.cpf}</span>`],
    ['Protocolo', `<span class="mono" style="color:var(--blue-light)">${r.id}</span>`],
    ['Concurso', contest?.nome || '–'],
    ['Pacote', r.pacoteLabel || '–'],
    ['Horário', `${r.slotDate} às ${r.slotTime}`],
    ['Unidade', r.slotCity || '–'],
    ['Total do Pedido', `R$ ${brl((r.total||0) + (r.saldoDevedor||0))}`],
    ['Valor Pago', `<span style="color:var(--teal-light)">R$ ${brl(r.total||0)}</span>`],
  ].map(([k,v]) => `<div class="info-row"><span class="info-key">${k}</span><span>${v}</span></div>`).join('');

  const saldoSection = saldo > 0 ? `
    <div class="saldo-badge">
      <div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--amber)">⚠ Saldo a Pagar</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--amber)">R$ ${brl(saldo)}</div>
      </div>
      <div style="font-size:.78rem;color:var(--white-dim);text-align:right">Cobrar antes<br>do atendimento</div>
    </div>
    <div style="margin-bottom:14px">
      <label class="fl" style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--white-dim);margin-bottom:10px;display:block">Forma de Pagamento Recebida</label>
      <div style="display:flex;gap:8px">
        <div class="pay-opt ${pagamentoSel==='pix'?'sel':''}" onclick="selPgto('pix',this)"><span style="font-size:1.2rem">📱</span><span style="font-size:.72rem;font-weight:600">PIX</span></div>
        <div class="pay-opt ${pagamentoSel==='credit'?'sel':''}" onclick="selPgto('credit',this)"><span style="font-size:1.2rem">💳</span><span style="font-size:.72rem;font-weight:600">Crédito</span></div>
        <div class="pay-opt ${pagamentoSel==='debit'?'sel':''}" onclick="selPgto('debit',this)"><span style="font-size:1.2rem">🏧</span><span style="font-size:.72rem;font-weight:600">Débito</span></div>
        <div class="pay-opt ${pagamentoSel==='cash'?'sel':''}" onclick="selPgto('cash',this)"><span style="font-size:1.2rem">💵</span><span style="font-size:.72rem;font-weight:600">Dinheiro</span></div>
      </div>
    </div>
    <button class="btn-teal" style="width:100%;justify-content:center;margin-bottom:10px" onclick="liberarCandidato('${r.id}',true)">
      ✅ Confirmar Pagamento e Liberar
    </button>` : `
    <div style="background:rgba(0,201,167,.08);border:1px solid rgba(0,201,167,.25);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:.84rem;color:var(--teal-light);text-align:center">
      ✓ Pagamento quitado — sem saldo devedor
    </div>
    ${status === 'aguardando' ? `<button class="btn-teal" style="width:100%;justify-content:center;margin-bottom:10px" onclick="liberarCandidato('${r.id}',false)">
      ✅ Liberar para Atendimento
    </button>` : ''}`;

  document.getElementById('modal-atend-body').innerHTML = `
    <div style="margin-bottom:16px;padding:12px 14px;background:var(--white-faint);border-radius:10px">
      ${infoRows}
    </div>
    ${saldoSection}
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
      <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--white-dim);margin-bottom:10px">Prontuários</div>
      <button class="btn-ghost" style="width:100%;justify-content:center" onclick="imprimirProntuarios('${r.id}')">
        🖨️ Imprimir Prontuários
      </button>
    </div>`;

  document.getElementById('modal-atend').style.display = 'flex';
};

window.selPgto = function(m, el) {
  pagamentoSel = m;
  document.querySelectorAll('.pay-opt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
};

window.liberarCandidato = async function(regId, cobrou) {
  const r = registrations.find(x => x.id === regId); if (!r) return;
  const update = {
    statusRecepcao: 'liberado',
    liberadoEm: new Date().toLocaleString('pt-BR'),
    liberadoPor: currentUser?.nome || '',
  };
  if (cobrou) {
    update.saldoDevedor = 0;
    update.pgtoRestaForme = pagamentoSel;
    update.pgtoRestaEm = new Date().toLocaleString('pt-BR');
  }
  try {
    await updateDoc(doc(db, 'registrations', regId), update);
    showToast('Candidato liberado! ✅', 'ok');
    document.getElementById('modal-atend').style.display = 'none';
  } catch(e) {
    showToast('Erro: ' + e.message, 'err');
  }
};

window.imprimirProntuarios = function(regId) {
  const r = registrations.find(x => x.id === regId); if (!r) return;
  const contest = contests.find(c => c.id === r.contestId); if (!contest) return;
  const exames = contest.exames || [];

  const rows = exames.map(e => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px">${e.nome}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center">___________</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center">___________</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;font-weight:700">
      <span style="border:1px solid #ccc;padding:2px 8px;border-radius:4px">APTO</span>
      &nbsp;
      <span style="border:1px solid #ccc;padding:2px 8px;border-radius:4px">INAPTO</span>
    </td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Prontuário – ${r.nome}</title>
  <style>
    @page{margin:18mm 15mm}
    body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1a56db;padding-bottom:10px;margin-bottom:16px}
    .logo-box{background:#f0f4ff;border-radius:8px;padding:8px 12px;font-size:22px;font-weight:900;color:#1a56db;letter-spacing:-1px}
    .section{margin-bottom:14px}
    .section-title{background:#1a56db;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:4px 10px;border-radius:4px;margin-bottom:8px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px}
    .info-row{display:flex;gap:6px;padding:3px 0;border-bottom:1px dotted #ddd}
    .info-key{color:#666;min-width:90px;font-size:11px}
    table{width:100%;border-collapse:collapse}
    th{background:#f0f4ff;color:#1a56db;font-size:10px;text-transform:uppercase;letter-spacing:.08em;padding:7px 10px;text-align:left;border-bottom:2px solid #1a56db}
    .assinatura{display:flex;justify-content:space-between;margin-top:20px;padding-top:14px;border-top:1px solid #ddd}
    .assin-box{text-align:center;min-width:200px}
    .assin-line{border-bottom:1px solid #333;margin-bottom:6px;height:30px}
    .assin-label{font-size:10px;color:#666}
    .footer{text-align:center;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:8px;margin-top:16px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="logo-box">PROSED</div>
      <div><div style="font-weight:700;font-size:15px;color:#1a56db">PRONTUÁRIO DE EXAME ADMISSIONAL</div>
        <div style="font-size:11px;color:#666">Medicina do Trabalho · ${contest.nome}</div></div>
    </div>
    <div style="font-size:11px;text-align:right;color:#666">Protocolo<br><strong style="color:#1a56db">${r.id}</strong><br>${new Date().toLocaleDateString('pt-BR')}</div>
  </div>
  <div class="section">
    <div class="section-title">Dados do Candidato</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-key">Nome:</span><strong>${r.nome}</strong></div>
      <div class="info-row"><span class="info-key">CPF:</span>${r.cpf}</div>
      <div class="info-row"><span class="info-key">RG:</span>${r.rg||'–'}</div>
      <div class="info-row"><span class="info-key">Nascimento:</span>${r.nasc||'–'}</div>
      <div class="info-row"><span class="info-key">Celular:</span>${r.cel||'–'}</div>
      <div class="info-row"><span class="info-key">E-mail:</span>${r.email||'–'}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Resultados dos Exames</div>
    <table>
      <thead><tr>
        <th>Exame</th><th style="text-align:center">Valor Encontrado</th><th style="text-align:center">Ref. Normal</th><th style="text-align:center">Avaliação</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="margin-top:16px;padding:12px;border:2px dashed #1a56db;border-radius:8px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#1a56db;margin-bottom:6px">Observações Clínicas</div>
    <div style="height:50px"></div>
  </div>
  <div style="border:3px solid #ccc;border-radius:8px;padding:12px 16px;text-align:center;margin:14px 0">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#666">Resultado da Avaliação Admissional</div>
    <div style="display:flex;justify-content:center;gap:30px;margin-top:8px">
      <span style="font-size:18px;font-weight:900;border:2px solid #00C9A7;padding:4px 20px;border-radius:6px;color:#00C9A7">APTO</span>
      <span style="font-size:18px;font-weight:900;border:2px solid #FF4757;padding:4px 20px;border-radius:6px;color:#FF4757">INAPTO</span>
    </div>
  </div>
  <div class="assinatura">
    <div class="assin-box"><div class="assin-line"></div><div style="font-size:12px;font-weight:600">___________________________</div><div class="assin-label">CRM ___________</div><div class="assin-label">Médico do Trabalho</div></div>
    <div class="assin-box"><div class="assin-line"></div><div style="font-size:12px;font-weight:600">${r.nome}</div><div class="assin-label">Candidato</div></div>
  </div>
  <div class="footer">PROSED – Medicina do Trabalho · Gerado em ${new Date().toLocaleString('pt-BR')} · Protocolo ${r.id}</div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  document.getElementById('modal-atend').style.display = 'none';
};

// ── HELPERS ──────────────────────────────────────────────────
function brl(n) { return (+n||0).toFixed(2).replace('.',','); }
function showToast(msg, type='ok') {
  const t = document.getElementById('toast'); t.className = 'toast toast-' + type;
  document.getElementById('toast-icon').textContent = type === 'ok' ? '✓' : '✕';
  document.getElementById('toast-msg').textContent = msg;
  t.style.display = 'flex'; setTimeout(() => t.style.display = 'none', 4000);
}

// ── EVENTS ──────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  // Carrega profissionais antes do login
  if (!profissionais.length) {
    const snap = await getDocs(collection(db, 'profissionais'));
    profissionais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  doLogin();
});
document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });
document.getElementById('btn-logout').addEventListener('click', () => location.reload());
