// One free MCP tool call. No wallet, payment SDK, API key or account.
// Node.js 22+, npm install @modelcontextprotocol/sdk@1.30.0
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const tasks = {
  rut: { name: "cl_rut", arguments: { rut: "12.345.678-5" } },
  uf: { name: "cl_uf", arguments: { monto: 50, direccion: "uf-clp" } },
};
const task = tasks[process.argv[2] || "rut"];
if (!task) throw new Error("Usage: node mcp-free.mjs [rut|uf]");
const client = new Client({ name: "toolrail-free-example", version: "1.0.0" });
const url = new URL(process.env.TOOLRAIL_MCP_URL || "https://toolrail.dev/mcp");
const transport = new StreamableHTTPClientTransport(url, {
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
    ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(90000),
  ]) }),
  reconnectionOptions: { maxRetries: 0 },
});
try {
  await client.connect(transport, { timeout: 90000 });
  const result = await client.callTool(task, undefined, { timeout: 60000 });
  for (const item of result.content || []) if (item.type === "text") console.log(item.text);
  if (result.isError) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
