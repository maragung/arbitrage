import dotenv from "dotenv";

dotenv.config();

const required = ["AVAX_RPC_URL", "PRIVATE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

const tokenListEnv = process.env.TOKEN_LIST;
let tokenList = null;
if (tokenListEnv) {
  try {
    tokenList = JSON.parse(tokenListEnv);
  } catch (error) {
    throw new Error(`Invalid TOKEN_LIST JSON: ${error.message}`);
  }
}

const resolveToken = (symbolEnv, addressEnv, decimalsEnv) => {
  const symbol = process.env[symbolEnv];
  const address = process.env[addressEnv];
  const decimals = process.env[decimalsEnv];

  if (symbol) {
    if (!tokenList) {
      throw new Error(`Missing TOKEN_LIST for ${symbol}.`);
    }
    const tokenEntry = tokenList[symbol.toUpperCase()];
    if (!tokenEntry?.address || tokenEntry.decimals === undefined) {
      throw new Error(`Token ${symbol} not found in TOKEN_LIST.`);
    }
    return { address: tokenEntry.address, decimals: Number(tokenEntry.decimals) };
  }

  if (address && decimals) {
    return { address, decimals: Number(decimals) };
  }

  if (address && !decimals) {
    throw new Error(`Missing ${decimalsEnv} for token address ${address}.`);
  }

  throw new Error(
    `Missing token configuration. Provide ${symbolEnv} (with TOKEN_LIST) or ${addressEnv} + ${decimalsEnv}.`
  );
};

const baseToken = resolveToken("BASE_SYMBOL", "BASE_TOKEN", "BASE_DECIMALS");
const quoteToken = resolveToken("QUOTE_SYMBOL", "QUOTE_TOKEN", "QUOTE_DECIMALS");
const gasToken = resolveToken("GAS_SYMBOL", "GAS_TOKEN", "GAS_DECIMALS");

export const config = {
  avaxRpcUrl: process.env.AVAX_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  baseToken: baseToken.address,
  quoteToken: quoteToken.address,
  gasToken: gasToken.address,
  baseDecimals: baseToken.decimals,
  quoteDecimals: quoteToken.decimals,
  gasDecimals: gasToken.decimals,
  tokenList,
  minProfitNetUsd: Number(process.env.MIN_PROFIT_NET_USD ?? "0.5"),
  tradeAmountUsd: Number(process.env.TRADE_AMOUNT_USD ?? "100"),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "15000"),
  executeTrades: process.env.EXECUTE_TRADES !== "false",
  maxSlippageBps: Number(process.env.MAX_SLIPPAGE_BPS ?? "100"),
  gasBufferGwei: Number(process.env.GAS_BUFFER_GWEI ?? "2"),
  minLiquidityBase: Number(process.env.MIN_LIQUIDITY_BASE ?? "10"),
  minLiquidityQuote: Number(process.env.MIN_LIQUIDITY_QUOTE ?? "1000"),
  reportEveryCheck: process.env.REPORT_EVERY_CHECK !== "false",
  telegramPollMs: Number(process.env.TELEGRAM_POLL_MS ?? "3000")
};
