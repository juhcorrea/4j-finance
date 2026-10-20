import { DurableObject } from 'cloudflare:workers';
import { createWorker } from './worker.mjs';
import { PIX_CONFIG_KEYS, isPixResponse } from './router.mjs';

const FIXED_KEYS = Object.freeze([
  'FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'MP_COLLECTOR_ID', 'MP_APPLICATION_ID',
  'MP_LIVE_MODE', 'MP_TEST_FIREBASE_PROJECT_ID', 'MP_PRODUCTION_FIREBASE_PROJECT_ID',
  'ALLOWED_ORIGINS',
]);
const PRIVATE_KEYS = new Set(PIX_CONFIG_KEYS);
function unavailable() {
  return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Não foi possível conferir o pagamento agora. Tente novamente.' } }),
    { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', Vary: 'Origin' } });
}
export class PixExecutor extends DurableObject {
  #worker = createWorker();
  #requestEnvironment(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        Object.keys(config).some(key => !PRIVATE_KEYS.has(key) || typeof config[key] !== 'string') ||
        !this.env.BILLING_DB || typeof this.env.BILLING_DB.prepare !== 'function') throw Error('configuration');
    // A Pages binding cannot select another merchant, Firebase project, mode,
    // origin set or database. D1 always comes from this executor's own binding.
    for (const key of FIXED_KEYS) {
      if (typeof this.env[key] !== 'string' || this.env[key] !== config[key]) throw Error('configuration');
    }
    // The executor caps public purchases. Pages may restrict that flag during
    // deployment or rollback. A private pilot still requires public=false;
    // status and existing-order reconciliation remain available in either mode.
    if (!['true', 'false'].includes(this.env.MP_LIVE_MODE) ||
        !['true', 'false'].includes(this.env.PAYMENTS_ENABLED) ||
        !['true', 'false'].includes(config.PAYMENTS_ENABLED) ||
        (config.PAYMENTS_ENABLED === 'true' && this.env.PAYMENTS_ENABLED !== 'true')) throw Error('configuration');
    return { ...config, BILLING_DB: this.env.BILLING_DB };
  }
  async #diagnostic(request, response) {
    if (this.env.PIX_CPU_DIAGNOSTICS !== 'true' || this.env.MP_LIVE_MODE !== 'false' ||
        this.env.FIREBASE_PROJECT_ID !== this.env.MP_TEST_FIREBASE_PROJECT_ID ||
        this.env.FIREBASE_PROJECT_ID === this.env.MP_PRODUCTION_FIREBASE_PROJECT_ID) return;
    try {
      const path = new URL(request.url).pathname;
      const operation = path.startsWith('/api/pix/') ? path.slice('/api/pix/'.length) : '';
      if (!['getMonetizationStatus', 'createPixCheckout', 'checkPixCheckout', 'mercadoPagoWebhook'].includes(operation)) return;
      const webhook = operation === 'mercadoPagoWebhook';
      const marker = request.headers.get('x-pix-qa');
      const qaMarker = !webhook && /^[a-f0-9]{40}$/.test(marker || '') ? marker : null;
      let webhookRequestIdHash = null;
      const requestId = request.headers.get('x-request-id');
      if (webhook && /^[\w-]{1,200}$/.test(requestId || '')) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestId));
        webhookRequestIdHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      }
      console.log(JSON.stringify({ event: 'pix-cpu-diagnostic', testOnly: true, operation,
        httpStatus: response.status, qaMarker, webhookRequestIdHash }));
    } catch { /* Diagnostic failure cannot affect payment handling. */ }
  }
  async handle(request, privateConfig) {
    let response;
    try {
      if (!(request instanceof Request)) throw Error('request');
      // Config and credentials stay in this invocation. The worker retains only
      // its existing public signing-key cache, never actors or financial state.
      response = await this.#worker.fetch(request, this.#requestEnvironment(privateConfig));
    } catch { response = unavailable(); }
    let result;
    try {
      result = { status: response.status, headers: Array.from(response.headers),
        body: response.body === null ? null : await response.text() };
      if (!isPixResponse(result)) throw Error('response');
    } catch {
      response = unavailable();
      result = { status: response.status, headers: Array.from(response.headers), body: await response.text() };
    }
    await this.#diagnostic(request, response);
    // Returning a Response would export its stream and keep this RPC session
    // coupled to the caller's HTTP lifetime. This descriptor contains no stubs.
    return result;
  }
  fetch() { return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
}
export default { fetch() { return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }); } };
