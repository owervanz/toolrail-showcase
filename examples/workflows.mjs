// Node.js 22+, npm install @modelcontextprotocol/sdk@1.30.0
// Reports use existing free MCP tools. No wallet, retries or server-side storage.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dateOK = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
const fail = code => Object.assign(new Error(code), { code });

export function workflowRequests(kind, input) {
  if (kind === 'uf') {
    if (!finite(input) || input <= 0 || input > 1e12) throw fail('INVALID_INPUT');
    return [{ name: 'cl_uf', arguments: { monto: input, direccion: 'uf-clp' } }];
  }
  if (!['ruts', 'plazos'].includes(kind) || !Array.isArray(input) || input.length < 1 || input.length > 10) throw fail('INVALID_INPUT');
  return input.map(row => {
    if (kind === 'ruts') {
      if (typeof row !== 'string' || !row.trim() || row.length > 32) throw fail('INVALID_INPUT');
      return { name: 'cl_rut', arguments: { rut: row.trim() } };
    }
    if (!row || !dateOK(row.desde) || !Number.isInteger(row.plazo) || row.plazo < 0 || row.plazo > 3650
        || !['administrativo', 'habil-bancario', 'corrido'].includes(row.tipo || 'administrativo')) throw fail('INVALID_INPUT');
    return { name: 'cl_dias_habiles', arguments: { desde: row.desde, plazo: row.plazo, tipo: row.tipo || 'administrativo' } };
  });
}

function decode(reply) {
  if (reply?.isError) throw fail('TOOL_ERROR'); // MCP errors may arrive with HTTP 200.
  let data = reply?.structuredContent;
  if (data === undefined) {
    const content = reply?.content?.filter(item => item.type === 'text');
    if (!content || content.length !== 1) throw fail('INVALID_RESPONSE');
    try { data = JSON.parse(content[0].text); } catch { throw fail('INVALID_RESPONSE'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw fail('INVALID_RESPONSE');
  return data;
}

function project(kind, request, data) {
  const args = request.arguments;
  if (kind === 'uf') {
    if (data.monto !== args.monto || data.direccion !== args.direccion || !finite(data.resultado) || data.resultado < 0 || !finite(data.valor_uf) || data.valor_uf <= 0 || !dateOK(data.fecha) || !text(data.fuente)
        || Math.abs(data.resultado - Math.round(args.monto * data.valor_uf * 100) / 100) > 0.011) throw fail('INVALID_RESPONSE');
    return { monto_uf: data.monto, resultado_clp: data.resultado, valor_uf: data.valor_uf, fecha: data.fecha, fuente: data.fuente,
      stale: data.stale === true, ...(data.stale === true ? { warning: 'La fuente entregó un valor marcado stale; revisa su fecha antes de utilizarlo.' } : {}) };
  }
  if (kind === 'ruts') {
    if (data.rut !== args.rut || typeof data.valid !== 'boolean' || (data.valid && !text(data.formatted))) throw fail('INVALID_RESPONSE');
    return { rut: data.rut, valid: data.valid, formatted: data.valid ? data.formatted : null,
      ...(text(data.check_digit_expected) ? { check_digit_expected: data.check_digit_expected } : {}),
      ...(text(data.reason) ? { reason: data.reason } : {}), scope: 'Formato y dígito verificador; no acredita existencia ni identidad.' };
  }
  if (data.desde !== args.desde || data.plazo !== args.plazo || data.tipo !== args.tipo || !dateOK(data.fecha_resultado) || data.fecha_resultado < args.desde
      || !dateOK(data.tabla_feriados_asOf) || !Array.isArray(data.feriados_saltados) || data.feriados_saltados.length > 3660 || !data.feriados_saltados.every(dateOK) || !text(data.alcance)) throw fail('INVALID_RESPONSE');
  return { desde: data.desde, plazo: data.plazo, tipo: data.tipo, fecha_resultado: data.fecha_resultado,
    feriados_saltados: data.feriados_saltados, tabla_feriados_asOf: data.tabla_feriados_asOf, alcance: data.alcance,
    counting: 'Cuenta desde el día siguiente. No aplica reglas especiales del procedimiento.' };
}

export async function runWorkflow(client, kind, input) {
  const requests = workflowRequests(kind, input); // Validate the WHOLE batch before spending quota.
  const rows = [];
  for (const [index, request] of requests.entries()) {
    try {
      const reply = await client.callTool(request, undefined, { timeout: 60000 });
      rows.push({ row: index + 1, status: 'ok', result: project(kind, request, decode(reply)) });
    } catch (error) {
      rows.push({ row: index + 1, status: 'error', code: ['TOOL_ERROR', 'INVALID_RESPONSE'].includes(error.code) ? error.code : 'TRANSPORT_ERROR' });
      // Stop on transport failure (including quota/timeout); do not retry or burn the rest of a batch.
      if (rows.at(-1).code === 'TRANSPORT_ERROR') break;
    }
  }
  const ok = rows.filter(row => row.status === 'ok').length;
  return { workflow: kind, status: ok === requests.length ? 'ok' : ok > 0 ? 'partial' : 'error', requested_rows: requests.length,
    calls_attempted: rows.length, unprocessed_rows: requests.length - rows.length, rows,
    note: 'Comparte el cupo de 30 llamadas por cliente y día UTC con las otras demos. No equivale a una integración instalada.' };
}

export function workflowUrl(value = 'https://toolrail.dev/mcp') {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/mcp'
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw fail('INVALID_URL');
  return url;
}

async function main() {
  const [kind, value, ...extra] = process.argv.slice(2);
  if (!['uf', 'ruts', 'plazos'].includes(kind) || !value || extra.length) throw fail('USAGE: node workflows.mjs uf 50 | ruts ruts.example.json | plazos deadlines.example.json');
  let input;
  if (kind === 'uf') input = Number(value);
  else {
    const bytes = await readFile(value);
    if (bytes.length > 65536) throw fail('INPUT_FILE_TOO_LARGE');
    input = JSON.parse(bytes.toString('utf8'));
  }
  workflowRequests(kind, input);
  const url = workflowUrl(process.env.TOOLRAIL_MCP_URL);
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new Client({ name: 'toolrail-workflow-example', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(90000)]) }),
    reconnectionOptions: { maxRetries: 0 },
  });
  try {
    await client.connect(transport, { timeout: 90000 });
    const report = await runWorkflow(client, kind, input);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'ok') process.exitCode = 1;
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // No raw upstream errors, URLs, RUTs or input file contents in error output.
    console.error(error.code || 'Workflow failed. Check inputs, connection and remaining MCP quota.');
    process.exitCode = 1;
  });
}
