/**
 * PROSED · Asaas Proxy — Vercel Edition
 * Salve este arquivo como: api/proxy.js no repositório GitHub
 */

const express = require('express');
const cors    = require('cors');

const app = express();

const ASAAS_BASE = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

const API_KEY = process.env.ASAAS_API_KEY || '';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// ── Helper Asaas ───────────────────────────────────────────────
async function asaas(method, path, body) {
  const { default: fetch } = await import('node-fetch');
  const opts = {
    method,
    headers: {
      'access_token': API_KEY,
      'Content-Type':  'application/json',
      'accept':        'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(ASAAS_BASE + path, opts);
  const data = await res.json();
  return { status: res.status, data };
}

// ── Health check ───────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({ ok: true, env: process.env.ASAAS_ENV || 'sandbox' });
});

// ── 1. Criar / buscar cliente ──────────────────────────────────
app.post('/asaas/customer', async (req, res) => {
  try {
    const { name, cpfCnpj, email, mobilePhone } = req.body;
    const cpf = cpfCnpj.replace(/\D/g, '');

    const search = await asaas('GET', `/customers?cpfCnpj=${cpf}`);
    if (search.data?.data?.length > 0) {
      return res.json({ customerId: search.data.data[0].id });
    }

    const create = await asaas('POST', '/customers', {
      name,
      cpfCnpj: cpf,
      email,
      mobilePhone: mobilePhone?.replace(/\D/g, ''),
    });

    if (create.status !== 200 || create.data.errors) {
      return res.status(400).json({ error: create.data.errors || 'Erro ao criar cliente' });
    }

    res.json({ customerId: create.data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 2. Pagamento com cartão de crédito ─────────────────────────
app.post('/asaas/pay/credit', async (req, res) => {
  try {
    const { customerId, value, description, installmentCount, card, holderInfo } = req.body;

    const { status, data } = await asaas('POST', '/payments', {
      customer:         customerId,
      billingType:      'CREDIT_CARD',
      value,
      dueDate:          todayISO(),
      description,
      installmentCount: installmentCount || 1,
      creditCard: {
        holderName:  card.holderName,
        number:      card.number.replace(/\s/g, ''),
        expiryMonth: card.expiryMonth,
        expiryYear:  card.expiryYear,
        ccv:         card.ccv,
      },
      creditCardHolderInfo: {
        name:          holderInfo.name,
        email:         holderInfo.email,
        cpfCnpj:       holderInfo.cpfCnpj.replace(/\D/g, ''),
        postalCode:    holderInfo.postalCode.replace(/\D/g, ''),
        addressNumber: holderInfo.addressNumber,
        phone:         holderInfo.phone?.replace(/\D/g, ''),
      },
    });

    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro no pagamento' });
    }
    res.json({ paymentId: data.id, status: data.status, value: data.value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 3. Pagamento com cartão de débito ──────────────────────────
app.post('/asaas/pay/debit', async (req, res) => {
  try {
    const { customerId, value, description, card, holderInfo } = req.body;

    const { status, data } = await asaas('POST', '/payments', {
      customer:    customerId,
      billingType: 'DEBIT_CARD',
      value,
      dueDate:     todayISO(),
      description,
      creditCard: {
        holderName:  card.holderName,
        number:      card.number.replace(/\s/g, ''),
        expiryMonth: card.expiryMonth,
        expiryYear:  card.expiryYear,
        ccv:         card.ccv,
      },
      creditCardHolderInfo: {
        name:          holderInfo.name,
        email:         holderInfo.email,
        cpfCnpj:       holderInfo.cpfCnpj.replace(/\D/g, ''),
        postalCode:    holderInfo.postalCode.replace(/\D/g, ''),
        addressNumber: holderInfo.addressNumber,
        phone:         holderInfo.phone?.replace(/\D/g, ''),
      },
    });

    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro no pagamento de débito' });
    }
    res.json({ paymentId: data.id, status: data.status, value: data.value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 4. Gerar cobrança PIX ──────────────────────────────────────
app.post('/asaas/pay/pix', async (req, res) => {
  try {
    const { customerId, value, description } = req.body;

    const { status, data } = await asaas('POST', '/payments', {
      customer:    customerId,
      billingType: 'PIX',
      value,
      dueDate:     todayISO(1),
      description,
    });

    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro ao gerar PIX' });
    }

    const qr = await asaas('GET', `/payments/${data.id}/pixQrCode`);

    res.json({
      paymentId:     data.id,
      pixCopiaECola: qr.data?.payload        || '',
      encodedImage:  qr.data?.encodedImage   || '',
      expiresAt:     qr.data?.expirationDate || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 5. Verificar status de pagamento ──────────────────────────
app.get('/asaas/pay/:paymentId/status', async (req, res) => {
  try {
    const { data } = await asaas('GET', `/payments/${req.params.paymentId}`);
    res.json({ status: data.status, value: data.value, paymentId: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helper data ────────────────────────────────────────────────
function todayISO(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// ── Exporta para o Vercel ──────────────────────────────────────
module.exports = app;
