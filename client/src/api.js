// Throws an Error carrying the server's own message when the API answers 4xx/5xx
const json = async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return body;
};
const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(json);
const get = (url) => fetch(url).then(json);

export const api = {
  meshState: () => get('/api/mesh/state'),
  accounts: () => get('/api/accounts'),
  transactions: (vpa) => get(`/api/transactions?vpa=${encodeURIComponent(vpa)}`),
  pay: (body) => post('/api/pay', body),            // online: straight to the bank
  send: (body) => post('/api/demo/send', body),     // offline: into the mesh
  gossip: () => post('/api/mesh/gossip'),
  flush: () => post('/api/mesh/flush'),
  reset: () => post('/api/mesh/reset'),
  unlock: () => post('/api/demo/unlock'),
};
