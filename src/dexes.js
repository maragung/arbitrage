import { dexAddressList } from "./addresses.js";

export const dexes = dexAddressList;

export const factoryAbi = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

export const pairAbi = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

export const routerAbi = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

export const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function balanceOf(address owner) external view returns (uint256)"
];
