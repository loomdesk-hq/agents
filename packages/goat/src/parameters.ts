import { createToolParameters } from "@goat-sdk/core";
import { z } from "zod";

// Each class is a value at runtime (never `import type` it): the @Tool decorator finds it through the emitted
// design:paramtypes and reads its schema.

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "a 20-byte hex address");
const decimal = z.string().regex(/^\d*\.?\d+$/, 'a decimal string such as "25" or "0.01"');
const dryRun = z.boolean().optional().describe("Plan and check only; sign and send nothing");
const slippagePct = z.number().min(0.01).max(50).optional().describe("Default: set by LoomDesk from the pool's last 15 minutes");
const shape = z.enum(["spot", "curve", "bidask", "hybrid"]).optional().describe("How the money is spread over the rungs (default bidask)");

export class MarketTokensParameters extends createToolParameters(
  z.object({
    query: z.string().max(64).optional().describe("Search by symbol, name or address"),
    leadersWindowSeconds: z.number().int().min(300).max(604800).optional().describe("Instead: the most traded and highest volume tokens over this window"),
    limit: z.number().int().min(1).max(100).optional().describe("How many tokens (default 20)"),
  }),
) {}

export class LadderPoolsParameters extends createToolParameters(z.object({ token: address.describe("The token's address, from loomdesk_market_tokens") })) {}

export class MyLaddersParameters extends createToolParameters(z.object({ address: address.optional().describe("Default: this wallet") })) {}

export class BuildLadderParameters extends createToolParameters(
  z.object({
    token: address.describe("The token to provide liquidity for"),
    payIn: z.enum(["ETH", "USDG"]).describe("What the wallet pays with; the zap buys the sides it needs in the same transaction"),
    amount: decimal.describe("How much of payIn"),
    quote: z.string().max(64).optional().describe("The pair's quote: ETH, USDG or a token address. Default: the token's first pool"),
    pool: z.string().max(80).optional().describe("A v4 pool id from loomdesk_ladder_pools"),
    lowPct: z.number().min(-99).max(0).optional().describe("Band bottom, percent from the price (default -30)"),
    highPct: z.number().min(0).max(1000).optional().describe("Band top, percent from the price (default 40)"),
    shape,
    rungs: z.number().int().min(1).max(40).optional(),
    fullRange: z.boolean().optional().describe("One full-range position instead of rungs (required in full-range pools)"),
    feePct: z.number().min(0.1).max(5).optional().describe("Fee tier for a pool that has to be opened on the way"),
    slippagePct,
    dryRun,
  }),
) {}

export class PlaceLadderParameters extends createToolParameters(
  z.object({
    token: address,
    pool: z.string().max(80).optional().describe("A pool id from loomdesk_ladder_pools (default: the first)"),
    lowPct: z.number().min(-99).max(0).describe("Band bottom, percent from the price"),
    highPct: z.number().min(0).max(1000).describe("Band top, percent from the price"),
    amountToken: decimal.optional().describe("How much of the token to put in"),
    amountQuote: decimal.optional().describe("How much of the pool's quote to put in"),
    split: z.boolean().optional().describe("With one asset: swap part of it to build the whole band"),
    shape,
    rungs: z.number().int().min(1).max(40).optional(),
    fullRange: z.boolean().optional(),
    slippagePct,
    openPoolQuote: z.string().max(64).optional().describe("Open a new pool first, against ETH, USDG or a token address, and build in it"),
    openPoolFeePct: z.number().min(0.1).max(5).optional().describe("The new pool's fee in percent (with openPoolQuote; default 1)"),
    dryRun,
  }),
) {}

export class LimitOrderParameters extends createToolParameters(
  z.object({
    token: address,
    side: z.enum(["buy", "sell"]),
    price: z.number().positive().describe("The limit price, dollars a token unless unit is quote"),
    priceTo: z.number().positive().optional().describe("Where the order is complete, for a range"),
    unit: z.enum(["usd", "quote"]).optional(),
    amount: decimal.describe("Of the asset the order holds: the token for a sell, the quote for a buy"),
    pool: z.string().max(80).optional(),
    rungs: z.number().int().min(1).max(40).optional(),
    closeOnceFilled: z.boolean().optional().describe("Default true: the keeper closes it once filled"),
    dryRun,
  }),
) {}

export class LadderActionParameters extends createToolParameters(
  z.object({
    ladderId: z.string().regex(/^\d+$/).describe("From loomdesk_my_ladders"),
    contract: address.optional().describe("The LoomLadder it lives in, from loomdesk_my_ladders (default: the current one)"),
    action: z.enum(["collect", "close", "close_part", "take_nfts", "close_once_filled"]).describe("collect: fees only; close: everything out; close_part: sharePct of every rung; take_nfts: the positions themselves; close_once_filled: the keeper closes a filled order"),
    on: z.boolean().optional().describe("close_once_filled: on (default) or off"),
    sharePct: z.number().min(1).max(99).optional(),
    slippagePct,
    dryRun,
  }),
) {}

export class SwapParameters extends createToolParameters(
  z.object({
    from: z.string().max(64).describe("ETH, USDG, a symbol or a token address"),
    to: z.string().max(64).describe("ETH, USDG, a symbol or a token address"),
    amount: decimal.describe("Of the asset paid"),
    slippagePct,
    dryRun,
  }),
) {}

export class OpenPoolParameters extends createToolParameters(
  z.object({
    token: address,
    quote: z.string().max(64).describe("ETH, USDG or a token address"),
    feePct: z.number().min(0.1).max(10).describe("Swap fee in percent: 0.1, 0.5, or 1 to 5"),
    dryRun,
  }),
) {}
