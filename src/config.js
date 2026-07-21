// Central configuration, driven by environment variables.
// FREE mode (no payment) is active until a payout address is configured.

const env = process.env;

export const config = {
  port: Number(env.PORT || 4402),
  serviceName: env.SERVICE_NAME || "Toolrail",
  baseUrl: env.BASE_URL || `http://localhost:${env.PORT || 4402}`,

  // Payout addresses. Set one or both to enable payments.
  evmPayTo: env.EVM_PAY_TO || null, // 0x... (Base)
  solPayTo: env.SOL_PAY_TO || null, // Solana pubkey (Phantom)

  // "testnet" until real wallet + facilitator are ready, then "mainnet".
  networkMode: env.NETWORK_MODE || "testnet",

  // x402.org facilitator is free for testnet. For mainnet + Bazaar listing
  // use the Coinbase CDP facilitator (see README).
  facilitatorUrl: env.FACILITATOR_URL || "https://x402.org/facilitator",

  // Coinbase CDP credentials. When both are set, the CDP facilitator is used
  // (required for mainnet settlement + automatic Bazaar listing).
  cdpApiKeyId: env.CDP_API_KEY_ID || null,
  cdpApiKeySecret: env.CDP_API_KEY_SECRET || null,

  // Optional keys
  cmfApiKey: env.CMF_API_KEY || null, // api.cmfchile.cl (fallback: mindicador.cl)
  banxicoToken: env.BANXICO_TOKEN || null, // free token for UDI (Mexico) at banxico.org.mx
  adminKey: env.ADMIN_KEY || null, // gates /admin/stats (usage counters)
  // Per-IP requests/minute across all endpoints (0 disables). Generous default:
  // real agent bursts pass; floods don't.
  rateLimitPerMin: env.RATE_LIMIT_PER_MIN !== undefined ? Number(env.RATE_LIMIT_PER_MIN) : 300,
  chromePath: env.PUPPETEER_EXECUTABLE_PATH || null,

  prices: {
    pdf: env.PRICE_PDF || "$0.01",
    vatRate: env.PRICE_VAT_RATE || "$0.003",
    vatValidate: env.PRICE_VAT_VALIDATE || "$0.005",
    fx: env.PRICE_FX || "$0.003",
    clIndicador: env.PRICE_CL_INDICADOR || "$0.003",
    clDiasHabiles: env.PRICE_CL_DIAS_HABILES || "$0.003",
    clRut: env.PRICE_CL_RUT || "$0.002",
    clSueldo: env.PRICE_CL_SUELDO || "$0.01",
    clFarmacias: env.PRICE_CL_FARMACIAS || "$0.003",
  },
};

export const NETWORKS = {
  mainnet: {
    evm: "eip155:8453", // Base
    svm: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
  testnet: {
    evm: "eip155:84532", // Base Sepolia
    // Solana DEVNET (genesis EtWTRABZ...) — the cluster the x402.org facilitator supports.
    svm: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  },
};

export const paymentsEnabled = () => Boolean(config.evmPayTo || config.solPayTo);
