const API_PATHS = new Set([
  '/api/pix/health', '/api/pix/getMonetizationStatus', '/api/pix/createPixCheckout',
  '/api/pix/checkPixCheckout', '/api/pix/mercadoPagoWebhook',
]);
export const PIX_CONFIG_KEYS = Object.freeze([
  'FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'MP_COLLECTOR_ID', 'MP_APPLICATION_ID',
  'MP_LIVE_MODE', 'MP_TEST_FIREBASE_PROJECT_ID', 'MP_PRODUCTION_FIREBASE_PROJECT_ID',
  'PAYMENTS_ENABLED', 'ALLOWED_ORIGINS', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'PIX_PILOT_CONFIG',
]);
// Pix responses are finite JSON/text (the QR image is at most 500,000 base64
// characters). Keep the RPC result well below its 32 MiB serialization limit.
const PIX_RESPONSE_BODY_LIMIT = 1024 * 1024;
export function isPixResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'body,headers,status' ||
      !Number.isInteger(value.status) || value.status < 200 || value.status > 599 ||
      !(value.body === null || typeof value.body === 'string' && value.body.length <= PIX_RESPONSE_BODY_LIMIT) ||
      [204, 205, 304].includes(value.status) && value.body !== null ||
      !Array.isArray(value.headers) || value.headers.length > 32) return false;
  let headerSize = 0;
  for (const entry of value.headers) {
    if (!Array.isArray(entry) || entry.length !== 2 ||
        typeof entry[0] !== 'string' || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(entry[0]) ||
        typeof entry[1] !== 'string' || /[\0\r\n]/.test(entry[1]) ||
        entry[0].length > 256 || entry[1].length > 8192) return false;
    headerSize += entry[0].length + entry[1].length;
  }
  return headerSize <= 32768;
}
function failure(status) {
  return new Response(JSON.stringify({ error: { status: status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE',
    message: status === 404 ? 'Endpoint não encontrado.' : 'Não foi possível conferir o pagamento agora. Tente novamente.' } }),
    { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', Vary: 'Origin' } });
}
export default {
  async fetch(request, env = {}) {
    try {
      const path = new URL(request.url).pathname;
      if (path !== '/api' && !path.startsWith('/api/')) {
        return typeof env.ASSETS?.fetch === 'function' ? await env.ASSETS.fetch(request) : failure(404);
      }
      if (!API_PATHS.has(path)) return failure(404);
      if (typeof env.PIX_EXECUTOR?.getByName !== 'function') return failure(503);
      // Only configured scalar values cross this private binding. Request data
      // never becomes configuration, and no environment binding is serialized.
      const privateConfig = {};
      for (const key of PIX_CONFIG_KEYS) if (typeof env[key] === 'string') privateConfig[key] = env[key];
      const result = await env.PIX_EXECUTOR.getByName('pix-api').handle(request, privateConfig);
      try {
        // Reconstruct a local response only after the executor has consumed its
        // finite body. No remote stream is kept alive by the HTTP response.
        return isPixResponse(result) ? new Response(result.body, {
          status: result.status, headers: result.headers,
        }) : failure(503);
      } finally {
        if (typeof result?.[Symbol.dispose] === 'function') result[Symbol.dispose]();
      }
    } catch { return failure(503); }
  },
};
