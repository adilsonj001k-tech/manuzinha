import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.ZORYCASH_API_KEY;
const zoryCashUrl = 'https://api.zorycash.com.br/api/v1';
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.use(express.json());
app.use(express.static(currentDirectory));

function requireApiKey(res) {
  if (apiKey) return true;
  res.status(500).json({ error: { message: 'ZORYCASH_API_KEY não configurada.' } });
  return false;
}

app.post('/api/pix/charge', async (req, res) => {
  if (!requireApiKey(res)) return;

  const { amount_cents: amountCents, external_ref: externalRef, description } = req.body;
  if (!Number.isInteger(amountCents) || amountCents < 500) {
    return res.status(400).json({ error: { message: 'amount_cents deve ser um inteiro de no mínimo 500.' } });
  }

  try {
    const response = await fetch(`${zoryCashUrl}/pix/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ amount_cents: amountCents, external_ref: externalRef, description })
    });
    const data = await response.json();

    if (!response.ok) return res.status(response.status).json(data);

    const pix = data.pix || {};
    return res.json({
      ...data,
      pix: {
        copy_paste: pix.copy_paste || data.pix_copia_e_cola || '',
        qr_code_image: pix.qr_code_image || data.qr_code_url || ''
      }
    });
  } catch (error) {
    return res.status(502).json({ error: { message: 'Não foi possível acessar a ZoryCash.' } });
  }
});

app.post('/webhooks/zorycash', async (req, res) => {
  res.sendStatus(200);

  const event = req.body;
  if (event.type !== 'payment.approved') return;

  const transactionId = event.data?.id;
  const externalRef = event.data?.external_ref;
  if (!transactionId || !externalRef || !apiKey) return;

  try {
    const response = await fetch(`${zoryCashUrl}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { 'x-api-key': apiKey }
    });
    const transaction = await response.json();

    if (response.ok && transaction.status === 'paid') {
      console.log(`Pagamento confirmado: ${externalRef}`);
      // TODO: liberar o conteúdo associado a externalRef no seu banco de dados.
    }
  } catch (error) {
    console.error('Erro ao validar webhook ZoryCash:', error.message);
  }
});

app.listen(port, () => {
  console.log(`Site disponível em http://localhost:${port}`);
});