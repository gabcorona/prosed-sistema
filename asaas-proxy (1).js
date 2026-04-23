/**
 * PROSED · Asaas Proxy Server
 * ─────────────────────────────────────────────────────────────
 * Instalar dependências:
 *   npm install express cors node-fetch dotenv
 *
 * Criar arquivo .env na mesma pasta com:
 *   ASAAS_API_KEY=$aact_YourKeyHere
 *   ASAAS_ENV=sandbox        (ou "production")
 *   PORT=3001
 *
 * Rodar:
 *   node asaas-proxy.js
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

const ASAAS_BASE = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

const API_KEY = process.env.ASAAS_API_KEY || '';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  // Em produção, substitua pelo seu domínio real:
  // origin: 'https://prosed.seudominio.com.br'
  origin: '*'
}));
app.use(express.json({ limit: '2mb' }));

// ── Helpers ────────────────────────────────────────────────────
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
app.get('/health', (_, res) => res.json({ ok: true, env: process.env.ASAAS_ENV || 'sandbox' }));

// ── 1. Criar / buscar cliente ──────────────────────────────────
/**
 * POST /asaas/customer
 * body: { name, cpfCnpj, email, mobilePhone }
 * Tenta buscar por CPF; se não existir, cria novo.
 */
app.post('/asaas/customer', async (req, res) => {
  try {
    const { name, cpfCnpj, email, mobilePhone } = req.body;
    const cpf = cpfCnpj.replace(/\D/g, '');

    // Busca cliente existente
    const search = await asaas('GET', `/customers?cpfCnpj=${cpf}`);
    if (search.data?.data?.length > 0) {
      return res.json({ customerId: search.data.data[0].id });
    }

    // Cria novo cliente
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
/**
 * POST /asaas/pay/credit
 * body: {
 *   customerId, value, description,
 *   installmentCount,          // 1 = à vista
 *   card: { holderName, number, expiryMonth, expiryYear, ccv },
 *   holderInfo: { name, cpfCnpj, postalCode, addressNumber, phone }
 * }
 */
app.post('/asaas/pay/credit', async (req, res) => {
  try {
    const { customerId, value, description, installmentCount, card, holderInfo } = req.body;

    const payload = {
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
    };

    const { status, data } = await asaas('POST', '/payments', payload);
    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro no pagamento' });
    }
    res.json({ paymentId: data.id, status: data.status, value: data.value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 3. Pagamento com cartão de débito ──────────────────────────
/**
 * POST /asaas/pay/debit
 * body: { customerId, value, description, card, holderInfo }
 */
app.post('/asaas/pay/debit', async (req, res) => {
  try {
    const { customerId, value, description, card, holderInfo } = req.body;

    const payload = {
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
    };

    const { status, data } = await asaas('POST', '/payments', payload);
    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro no pagamento de débito' });
    }
    res.json({ paymentId: data.id, status: data.status, value: data.value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 4. Gerar cobrança PIX ──────────────────────────────────────
/**
 * POST /asaas/pay/pix
 * body: { customerId, value, description }
 * Retorna: { paymentId, pixCopiaECola, expiresAt, encodedImage }
 */
app.post('/asaas/pay/pix', async (req, res) => {
  try {
    const { customerId, value, description } = req.body;

    // Cria cobrança PIX
    const { status, data } = await asaas('POST', '/payments', {
      customer:    customerId,
      billingType: 'PIX',
      value,
      dueDate:     todayISO(1), // vence amanhã
      description,
    });

    if (status !== 200 || data.errors) {
      return res.status(400).json({ error: data.errors || 'Erro ao gerar PIX' });
    }

    // Busca QR code
    const qr = await asaas('GET', `/payments/${data.id}/pixQrCode`);

    res.json({
      paymentId:     data.id,
      pixCopiaECola: qr.data?.payload   || '',
      encodedImage:  qr.data?.encodedImage || '',
      expiresAt:     qr.data?.expirationDate || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 5. Verificar status de pagamento ──────────────────────────
/**
 * GET /asaas/pay/:paymentId/status
 */
app.get('/asaas/pay/:paymentId/status', async (req, res) => {
  try {
    const { status, data } = await asaas('GET', `/payments/${req.params.paymentId}`);
    res.json({ status: data.status, value: data.value, paymentId: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helpers ────────────────────────────────────────────────────
function todayISO(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ PROSED Asaas Proxy rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.ASAAS_ENV || 'sandbox'}`);
  console.log(`   API Key configurada: ${API_KEY ? 'SIM' : 'NÃO ⚠️'}`);
});
