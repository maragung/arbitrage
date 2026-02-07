import axios from "axios";
import { ethers } from "ethers";
import { config } from "./config.js";
import { dexes, erc20Abi, factoryAbi, pairAbi, routerAbi } from "./dexes.js";

const provider = new ethers.JsonRpcProvider(config.avaxRpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);

const quoteToken = config.quoteToken;
const baseToken = config.baseToken;
const gasToken = config.gasToken;

const toUnits = (value, decimals) => ethers.parseUnits(value.toString(), decimals);
const fromUnits = (value, decimals) => Number(ethers.formatUnits(value, decimals));

let autoTimer = null;
let priceDiffTimer = null;
let lastUpdateId = 0;

const sendTelegram = async (message) => {
  if (!config.telegramBotToken || !config.telegramChatId) {
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  await axios.post(url, {
    chat_id: config.telegramChatId,
    text: message
  });
};

const safeSendTelegram = async (message) => {
  try {
    await sendTelegram(message);
  } catch (error) {
    console.error("Telegram error:", error.message);
  }
};

const getPairAddress = async (factoryAddress) => {
  const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
  return factory.getPair(baseToken, quoteToken);
};

const getReservesPrice = async (pairAddress) => {
  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1] = await pair.getReserves();
  const token0 = await pair.token0();

  if (token0.toLowerCase() === baseToken.toLowerCase()) {
    const base = fromUnits(reserve0, config.baseDecimals);
    const quote = fromUnits(reserve1, config.quoteDecimals);
    return { price: quote / base, baseLiquidity: base, quoteLiquidity: quote };
  }

  const base = fromUnits(reserve1, config.baseDecimals);
  const quote = fromUnits(reserve0, config.quoteDecimals);
  return { price: quote / base, baseLiquidity: base, quoteLiquidity: quote };
};

const getQuote = async (routerAddress, amountIn, path) => {
  const router = new ethers.Contract(routerAddress, routerAbi, provider);
  const amounts = await router.getAmountsOut(amountIn, path);
  return amounts[amounts.length - 1];
};

const ensureAllowance = async (tokenAddress, spender, amount) => {
  const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const allowance = await token.allowance(wallet.address, spender);
  if (allowance < amount) {
    const tx = await token.approve(spender, amount);
    await tx.wait();
  }
};

const estimateGasCost = async (router, amountIn, minOut, path) => {
  try {
    const gasEstimate = await router.swapExactTokensForTokens.estimateGas(
      amountIn,
      minOut,
      path,
      wallet.address,
      Math.floor(Date.now() / 1000) + 60
    );
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 0n;
    const buffer = ethers.parseUnits(config.gasBufferGwei.toString(), "gwei");
    return (gasPrice + buffer) * gasEstimate;
  } catch (error) {
    console.warn("Gas estimate failed:", error.message);
    return 0n;
  }
};

const getGasTokenPriceInQuote = async (routerAddress) => {
  if (gasToken.toLowerCase() === quoteToken.toLowerCase()) {
    return toUnits(1, config.quoteDecimals);
  }

  const router = new ethers.Contract(routerAddress, routerAbi, provider);
  const amountIn = toUnits(1, config.gasDecimals);
  const path = gasToken.toLowerCase() === baseToken.toLowerCase()
    ? [baseToken, quoteToken]
    : [gasToken, quoteToken];

  const amounts = await router.getAmountsOut(amountIn, path);
  return amounts[amounts.length - 1];
};

const getQuoteTokenBalance = async () => {
  const token = new ethers.Contract(quoteToken, erc20Abi, provider);
  return token.balanceOf(wallet.address);
};

const executeArbitrage = async (buyDex, sellDex, amountIn) => {
  const buyRouter = new ethers.Contract(buyDex.router, routerAbi, wallet);
  const sellRouter = new ethers.Contract(sellDex.router, routerAbi, wallet);

  const deadline = Math.floor(Date.now() / 1000) + 60;
  const buyPath = [quoteToken, baseToken];
  const sellPath = [baseToken, quoteToken];

  await ensureAllowance(quoteToken, buyDex.router, amountIn);
  const boughtAmount = await buyRouter.getAmountsOut(amountIn, buyPath);
  const minBuyOut = (boughtAmount[1] * BigInt(10000 - config.maxSlippageBps)) / 10000n;
  const buyTx = await buyRouter.swapExactTokensForTokens(
    amountIn,
    minBuyOut,
    buyPath,
    wallet.address,
    deadline
  );
  await buyTx.wait();

  const baseTokenContract = new ethers.Contract(baseToken, erc20Abi, wallet);
  const baseBalance = await baseTokenContract.balanceOf(wallet.address);
  await ensureAllowance(baseToken, sellDex.router, baseBalance);
  const soldAmounts = await sellRouter.getAmountsOut(baseBalance, sellPath);
  const minSellOut = (soldAmounts[1] * BigInt(10000 - config.maxSlippageBps)) / 10000n;
  const sellTx = await sellRouter.swapExactTokensForTokens(
    baseBalance,
    minSellOut,
    sellPath,
    wallet.address,
    deadline
  );
  await sellTx.wait();

  return soldAmounts[1];
};

const getDexSnapshots = async () => {
  const results = await Promise.all(
    dexes.map(async (dex) => {
      const pairAddress = await getPairAddress(dex.factory);
      if (pairAddress === ethers.ZeroAddress) {
        return { ...dex, pairAddress, price: null };
      }
      const { price, baseLiquidity, quoteLiquidity } = await getReservesPrice(pairAddress);
      return { ...dex, pairAddress, price, baseLiquidity, quoteLiquidity };
    })
  );

  return results.filter((dex) => dex.price !== null);
};

const buildOpportunity = async () => {
  const tradeAmount = toUnits(config.tradeAmountUsd, config.quoteDecimals);
  const availableDexes = await getDexSnapshots();

  if (availableDexes.length < 2) {
    return null;
  }

  let bestBuy = availableDexes[0];
  let bestSell = availableDexes[0];

  for (const dex of availableDexes) {
    if (dex.price < bestBuy.price) {
      bestBuy = dex;
    }
    if (dex.price > bestSell.price) {
      bestSell = dex;
    }
  }

  if (bestBuy.name === bestSell.name) {
    return null;
  }

  if (
    bestBuy.baseLiquidity < config.minLiquidityBase ||
    bestSell.baseLiquidity < config.minLiquidityBase ||
    bestBuy.quoteLiquidity < config.minLiquidityQuote ||
    bestSell.quoteLiquidity < config.minLiquidityQuote
  ) {
    return null;
  }

  const baseBought = await getQuote(bestBuy.router, tradeAmount, [quoteToken, baseToken]);
  const quoteReceived = await getQuote(bestSell.router, baseBought, [baseToken, quoteToken]);
  const grossProfit = quoteReceived - tradeAmount;

  const buyRouter = new ethers.Contract(bestBuy.router, routerAbi, wallet);
  const sellRouter = new ethers.Contract(bestSell.router, routerAbi, wallet);

  const gasForBuy = await estimateGasCost(
    buyRouter,
    tradeAmount,
    (baseBought * BigInt(10000 - config.maxSlippageBps)) / 10000n,
    [quoteToken, baseToken]
  );
  const gasForSell = await estimateGasCost(
    sellRouter,
    baseBought,
    (quoteReceived * BigInt(10000 - config.maxSlippageBps)) / 10000n,
    [baseToken, quoteToken]
  );
  const totalGasCostNative = gasForBuy + gasForSell;

  const gasTokenPriceInQuote = await getGasTokenPriceInQuote(bestSell.router);
  const gasTokenUnit = toUnits(1, config.gasDecimals);
  const gasCostQuote = (totalGasCostNative * gasTokenPriceInQuote) / gasTokenUnit;

  const netProfit = grossProfit - gasCostQuote;
  const netProfitUsd = fromUnits(netProfit, config.quoteDecimals);

  return {
    bestBuy,
    bestSell,
    tradeAmount,
    baseBought,
    quoteReceived,
    netProfitUsd,
    totalGasCostNative
  };
};

const formatSummary = (opportunity) => [
  "Arbitrage check:",
  `Buy on ${opportunity.bestBuy.name} @ ${opportunity.bestBuy.price.toFixed(6)} USD`,
  `Sell on ${opportunity.bestSell.name} @ ${opportunity.bestSell.price.toFixed(6)} USD`,
  `Trade amount: ${config.tradeAmountUsd} USD`,
  `Net profit (after gas): ${opportunity.netProfitUsd.toFixed(4)} USD`
].join("\n");

const scanAndReport = async () => {
  const opportunity = await buildOpportunity();
  if (!opportunity) {
    await safeSendTelegram("No arbitrage opportunity found.");
    return null;
  }

  await safeSendTelegram(formatSummary(opportunity));
  return opportunity;
};

const formatPriceDiffSummary = (bestBuy, bestSell, diff) => [
  "Price difference detected:",
  `Buy on ${bestBuy.name} @ ${bestBuy.price.toFixed(6)} USD`,
  `Sell on ${bestSell.name} @ ${bestSell.price.toFixed(6)} USD`,
  `Difference: ${diff.toFixed(6)} USD`
].join("\n");

const checkPriceDiffAndReport = async () => {
  const availableDexes = await getDexSnapshots();
  if (availableDexes.length < 2) {
    return;
  }

  let bestBuy = availableDexes[0];
  let bestSell = availableDexes[0];

  for (const dex of availableDexes) {
    if (dex.price < bestBuy.price) {
      bestBuy = dex;
    }
    if (dex.price > bestSell.price) {
      bestSell = dex;
    }
  }

  if (bestBuy.name === bestSell.name) {
    return;
  }

  const diff = bestSell.price - bestBuy.price;
  if (diff > 0) {
    await safeSendTelegram(formatPriceDiffSummary(bestBuy, bestSell, diff));
  }
};

const executeBestTrade = async () => {
  const opportunity = await buildOpportunity();
  if (!opportunity) {
    await safeSendTelegram("No arbitrage opportunity found.");
    return;
  }

  if (opportunity.netProfitUsd < config.minProfitNetUsd) {
    await safeSendTelegram(
      `Net profit below threshold: ${opportunity.netProfitUsd.toFixed(4)} USD < ${config.minProfitNetUsd} USD.`
    );
    return;
  }

  const beforeBalance = await getQuoteTokenBalance();
  if (beforeBalance < opportunity.tradeAmount) {
    await safeSendTelegram("Insufficient balance for trade amount.");
    return;
  }

  const output = await executeArbitrage(opportunity.bestBuy, opportunity.bestSell, opportunity.tradeAmount);
  const afterBalance = await getQuoteTokenBalance();
  const realizedProfit = fromUnits(afterBalance - beforeBalance, config.quoteDecimals);

  await safeSendTelegram(
    [
      `Executed arbitrage ✅`,
      `Sold quote amount: ${fromUnits(output, config.quoteDecimals).toFixed(4)} USD`,
      `Realized profit: ${realizedProfit.toFixed(4)} USD`,
      `Estimated gas cost (in native): ${ethers.formatEther(opportunity.totalGasCostNative)} AVAX`
    ].join("\n")
  );
};

const handleCommand = async (text) => {
  const command = text.trim().toLowerCase();
  if (command.startsWith("/scan")) {
    await scanAndReport();
    return;
  }

  if (command.startsWith("/start")) {
    if (priceDiffTimer) {
      clearInterval(priceDiffTimer);
    }
    await checkPriceDiffAndReport();
    priceDiffTimer = setInterval(async () => {
      try {
        await checkPriceDiffAndReport();
      } catch (error) {
        await safeSendTelegram(`Error: ${error.message}`);
      }
    }, 60000);
    await safeSendTelegram("Price diff alerts enabled (/stop to disable).");
    return;
  }

  if (command.startsWith("/stop")) {
    if (priceDiffTimer) {
      clearInterval(priceDiffTimer);
      priceDiffTimer = null;
    }
    await safeSendTelegram("Price diff alerts disabled.");
    return;
  }

  if (command.startsWith("/go")) {
    await executeBestTrade();
    return;
  }

  if (command.startsWith("/auto")) {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      await safeSendTelegram("Auto mode disabled.");
      return;
    }

    autoTimer = setInterval(async () => {
      try {
        const opportunity = await buildOpportunity();
        if (opportunity && config.reportEveryCheck) {
          await safeSendTelegram(formatSummary(opportunity));
        }
        if (opportunity && opportunity.netProfitUsd >= config.minProfitNetUsd) {
          await executeBestTrade();
        }
      } catch (error) {
        await safeSendTelegram(`Error: ${error.message}`);
      }
    }, config.pollIntervalMs);

    await safeSendTelegram("Auto mode enabled.");
    return;
  }

  await safeSendTelegram("Unknown command. Use /scan, /go, /auto, /start, or /stop.");
};

const pollTelegram = async () => {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`;
  const response = await axios.get(url, {
    params: {
      offset: lastUpdateId + 1,
      timeout: 0
    }
  });

  const updates = response.data?.result ?? [];
  for (const update of updates) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id);
    const message = update.message || update.edited_message;
    if (!message?.text) {
      continue;
    }
    if (String(message.chat?.id) !== String(config.telegramChatId)) {
      continue;
    }
    await handleCommand(message.text);
  }
};

const start = async () => {
  await safeSendTelegram("Arbitrage bot started. Commands: /scan /go /auto /start /stop");
  setInterval(async () => {
    try {
      await pollTelegram();
    } catch (error) {
      console.error("Telegram polling error:", error.message);
    }
  }, config.telegramPollMs);
};

start();
