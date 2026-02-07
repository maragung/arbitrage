# Avalanche DEX Arbitrage Bot

This project is a Node.js bot that checks price differences between Avalanche DEXes and can execute trades when the **net profit after gas** is at least **$0.50**. It also posts execution and profit updates to Telegram.

## Features
- Checks Trader Joe and Pangolin for price differences.
- Estimates profit on a configurable trade size.
- Guards for liquidity, slippage, and balance checks.
- Optional execution with gas estimation reporting and net-profit checks.
- Telegram reporting for every check and execution.

## Contract Address List

### DEX Routers & Factories
| DEX | Factory | Router |
| --- | --- | --- |
| TraderJoe | `0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10` | `0x60aE616a2155Ee3d9A68541Ba4544862310933d4` |
| Pangolin | `0xefa94DE7a4656D787667C749F7E1223D71E9FD88` | `0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106` |

## Requirements
- Node.js 18+
- Avalanche C-Chain RPC endpoint
- Funded wallet with gas and tokens

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
3. Update `.env` with your private key, token list (ticker -> address/decimals) or explicit token addresses + decimals, and Telegram bot details.

## Run
```bash
npm start
```

## Testnet
Use `.env.testnet.example` as a starting point for Fuji (testnet) values. You must supply the testnet DEX/token contract addresses + decimals (or populate `TOKEN_LIST` and use `*_SYMBOL`) for your chosen pairs.

## Telegram Commands
- `/scan` : Check price differences between DEXes and report the best buy/sell route.
- `/start` : Send a price-difference alert every minute when a token price gap is detected between DEXes.
- `/stop` : Stop the per-minute price-difference alerts.
- `/go` : Execute the most profitable trade if net profit after gas is at least `$0.50` and ends in USDC.
- `/auto` : Toggle auto mode; when enabled the bot will scan and execute periodically.

## Notes
- This bot uses a two-step swap (buy then sell). It does **not** use flash loans.
- You are responsible for gas costs, slippage, and smart contract risk.
- Use at your own risk.
