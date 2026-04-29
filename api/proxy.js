/**
 * PROSED · Asaas Proxy — Vercel Serverless (sem Express)
 * Salve como: api/proxy.js
 */

const ASAAS_BASE = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

const API_KEY = process.env.ASAAS_API_KEY || '';

async function asaas(method, path, body) {
  const { default: fetch } = await import('node-fetch');
  const opts = {
    method,
    headers: {
      'access_token': API_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(ASAAS_BASE + path, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function todayISO(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = (req.url || '').split('?')[0];
  const method = req.method;

  try {
    if (method === 'GET' && path.endsWith('/health')) {
      return json(res, 200, { ok: true, env: process.env.ASAAS_ENV || 'sandbox' });
    }

    if (method === 'POST' && path.endsWith('/asaas/customer')) {
      const { name, cpfCnpj, email, mobilePhone } = await readBody(req);
      const cpf = cpfCnpj.replace(/\D/g, '');
      const search = await asaas('GET', `/customers?cpfCnpj=${cpf}`);
      if (search.data?.data?.length > 0) {
        return json(res, 200, { customerId: search.data.data[0].id });
      }
      const create = await asaas('POST', '/customers', {
        name, cpfCnpj: cpf, email,
        mobilePhone: mobilePhone?.replace(/\D/g, ''),
      });
      if (create.status !== 200 || create.data.errors) {
        return json(res, 400, { error: create.data.errors || 'Erro ao criar cliente' });
      }
      return json(res, 200, { customerId: create.data.id });
    }

    if (method === 'POST' && path.endsWith('/asaas/pay/credit')) {
      const { customerId, value, description, installmentCount, card, holderInfo } = await readBody(req);
      const { status, data } = await asaas('POST', '/payments', {
        customer: customerId,
        billingType: 'CREDIT_CARD',
        value, dueDate: todayISO(), description,
        installmentCount: installmentCount || 1,
        creditCard: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ''),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: holderInfo.name, email: holderInfo.email,
          cpfCnpj: holderInfo.cpfCnpj.replace(/\D/g, ''),
          postalCode: holderInfo.postalCode.replace(/\D/g, ''),
          addressNumber: holderInfo.addressNumber,
          phone: holderInfo.phone?.replace(/\D/g, ''),
        },
      });
      if (status !== 200 || data.errors) {
        return json(res, 400, { error: data.errors || 'Erro no pagamento' });
      }
      return json(res, 200, { paymentId: data.id, status: data.status, value: data.value });
    }

    if (method === 'POST' && path.endsWith('/asaas/pay/debit')) {
      const { customerId, value, description, card, holderInfo } = await readBody(req);
      const { status, data } = await asaas('POST', '/payments', {
        customer: customerId,
        billingType: 'DEBIT_CARD',
        value, dueDate: todayISO(), description,
        creditCard: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ''),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: holderInfo.name, email: holderInfo.email,
          cpfCnpj: holderInfo.cpfCnpj.replace(/\D/g, ''),
          postalCode: holderInfo.postalCode.replace(/\D/g, ''),
          addressNumber: holderInfo.addressNumber,
          phone: holderInfo.phone?.replace(/\D/g, ''),
        },
      });
      if (status !== 200 || data.errors) {
        return json(res, 400, { error: data.errors || 'Erro no pagamento de débito' });
      }
      return json(res, 200, { paymentId: data.id, status: data.status, value: data.value });
    }

    if (method === 'POST' && path.endsWith('/asaas/pay/pix')) {
      const { customerId, value, description } = await readBody(req);
      const { status, data } = await asaas('POST', '/payments', {
        customer: customerId, billingType: 'PIX',
        value, dueDate: todayISO(1), description,
      });
      if (status !== 200 || data.errors) {
        return json(res, 400, { error: data.errors || 'Erro ao gerar PIX' });
      }
      const qr = await asaas('GET', `/payments/${data.id}/pixQrCode`);
      return json(res, 200, {
        paymentId: data.id,
        pixCopiaECola: qr.data?.payload || '',
        encodedImage: qr.data?.encodedImage || '',
        expiresAt: qr.data?.expirationDate || '',
      });
    }

    if (method === 'POST' && path.endsWith('/asaas/pay/status')) {
      const { paymentId } = await readBody(req);
      const { data } = await asaas('GET', `/payments/${paymentId}`);
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, { status: data.status, value: data.value, paymentId: data.id });
    }

    if (method === 'GET' && path.includes('/asaas/pay/') && path.endsWith('/status')) {
      const paymentId = path.split('/asaas/pay/')[1].replace('/status', '');
      const { data } = await asaas('GET', `/payments/${paymentId}`);
      return json(res, 200, { status: data.status, value: data.value, paymentId: data.id });
    }

    if (method === 'GET' && path.includes('/asaas/pay/') && path.endsWith('/qrcode')) {
      const paymentId = path.split('/asaas/pay/')[1].replace('/qrcode', '');
      const qr = await asaas('GET', `/payments/${paymentId}/pixQrCode`);
      return json(res, 200, {
        encodedImage: qr.data?.encodedImage || '',
        pixCopiaECola: qr.data?.payload || '',
        expiresAt: qr.data?.expirationDate || '',
      });
    }

    return json(res, 404, { error: 'Rota nao encontrada: ' + path });

  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
