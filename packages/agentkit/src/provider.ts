// LoomDesk for Coinbase AgentKit: liquidity ladders, limit orders and pools on Robinhood Chain (4663).
// LoomDesk plans (unsigned transactions it has simulated); this provider checks every one against LoomDesk's contracts
// and the ask, and sends them in order from the agent's own wallet. LoomDesk never signs or holds anything.
import "reflect-metadata";
import { z } from "zod";
// EvmWalletProvider is a VALUE import on purpose: @CreateAction decides whether to pass the wallet from the method's
// emitted parameter types, and a type-only import would emit Object there, so no wallet would come.
import { ActionProvider, CreateAction, EvmWalletProvider, type Network } from "@coinbase/agentkit";
import { CHAIN_ID, LoomDesk, type LoomDeskOptions, type Outcome } from "./core/index.js";
import { BuildLadderSchema, LadderActionSchema, LadderPoolsSchema, LimitOrderSchema, MarketTokensSchema, MyLaddersSchema, OpenPoolSchema, PlaceLadderSchema, SwapSchema } from "./schemas.js";
import { agentkitSender } from "./wallet.js";

export const VERSION = "0.1.0";

export type LoomdeskActionProviderConfig = Omit<LoomDeskOptions, "client"> & {
  /** Plan and check only, never send, whatever the model asks. */
  dryRun?: boolean;
};

const SENDS = "LoomDesk plans and simulates it; this action refuses it unless that simulation passed and every transaction goes to a LoomDesk contract (or approves one for no more than asked), then sends each in order from this wallet. dryRun: plan only.";

export class LoomdeskActionProvider extends ActionProvider<EvmWalletProvider> {
  readonly desk: LoomDesk;
  readonly #dryRun: boolean;

  /** apiKey and referrer default to LOOMDESK_API_KEY and LOOMDESK_REFERRER. */
  constructor(config: LoomdeskActionProviderConfig = {}) {
    super("loomdesk", []);
    const env = typeof process !== "undefined" ? process.env : {};
    this.desk = new LoomDesk({ ...config, apiKey: config.apiKey ?? env.LOOMDESK_API_KEY, referrer: config.referrer ?? env.LOOMDESK_REFERRER, client: `loomdesk-agentkit/${VERSION}` });
    this.#dryRun = Boolean(config.dryRun);
  }

  /** Robinhood Chain only: the plans are for 4663. */
  supportsNetwork = (network: Network) => network.protocolFamily === "evm" && network.chainId === String(CHAIN_ID);

  @CreateAction({
    name: "market_tokens",
    description: "Tokens trading on Robinhood Chain, from LoomDesk's index of every swap: price, market cap, 24h volume, tier (prefer established; untested: nobody checked a stranger can sell it), usdToMovePrice2Pct (depth) and keep (near 1: fees from ordinary traders; near 0: mostly arbitrage). Flagged tokens are left out. A search, the leaders over a window, or the top of the list. Read-only.",
    schema: MarketTokensSchema,
  })
  async marketTokens(args: z.infer<typeof MarketTokensSchema>): Promise<string> {
    return this.#read(() => this.desk.market(MarketTokensSchema.parse(args)));
  }

  @CreateAction({
    name: "ladder_pools",
    description: "The pools of one token a ladder can go in, best first: fee, whether it pays liquidity, depth, volume, fees. The first is the default. A pair with no pool can be opened (open_pool). Read-only.",
    schema: LadderPoolsSchema,
  })
  async ladderPools(args: z.infer<typeof LadderPoolsSchema>): Promise<string> {
    return this.#read(() => this.desk.pools(LadderPoolsSchema.parse(args).token));
  }

  @CreateAction({
    name: "my_ladders",
    description: "This wallet's live LoomDesk ladders and limit orders (or another address's): ladderId, contract, pair, value, fees waiting and collected, PnL, the band and whether the price is in it. Read-only.",
    schema: MyLaddersSchema,
  })
  async myLadders(wallet: EvmWalletProvider, args: z.infer<typeof MyLaddersSchema>): Promise<string> {
    return this.#read(() => this.desk.myLadders(MyLaddersSchema.parse(args).address ?? wallet.getAddress()));
  }

  @CreateAction({
    name: "build_ladder",
    description: `Opens a LoomDesk ladder (up to 40 narrow Uniswap v4 ranges that earn the pool's swap fee) from ETH or USDG in one transaction (two for USDG), owned by this wallet; opens a LoomDesk pool on the way when the pair has none. ${SENDS}`,
    schema: BuildLadderSchema,
  })
  async buildLadder(wallet: EvmWalletProvider, args: z.infer<typeof BuildLadderSchema>): Promise<string> {
    return this.#send(() => {
      const a = BuildLadderSchema.parse(args);
      return this.desk.build(agentkitSender(wallet), { ...a, dryRun: this.#dryRun || a.dryRun });
    });
  }

  @CreateAction({
    name: "place_ladder",
    description: `A ladder from the token, the quote or both, in any pool of the token (v3 or v4); with openPoolQuote, a new LoomDesk pool is opened first and the ladder is built in it once that is mined. ${SENDS}`,
    schema: PlaceLadderSchema,
  })
  async placeLadder(wallet: EvmWalletProvider, args: z.infer<typeof PlaceLadderSchema>): Promise<string> {
    return this.#send(() => {
      const { openPoolQuote, openPoolFeePct, ...a } = PlaceLadderSchema.parse(args);
      return this.desk.ladder(agentkitSender(wallet), { ...a, ...(openPoolQuote ? { openPool: { quote: openPoolQuote, feePct: openPoolFeePct ?? 1 } } : {}), dryRun: this.#dryRun || a.dryRun });
    });
  }

  @CreateAction({
    name: "limit_order",
    description: `A limit buy or sell: rungs on one side of the price that fill as it passes through them, closed by LoomDesk's keeper once filled. ${SENDS}`,
    schema: LimitOrderSchema,
  })
  async limitOrder(wallet: EvmWalletProvider, args: z.infer<typeof LimitOrderSchema>): Promise<string> {
    return this.#send(() => {
      const a = LimitOrderSchema.parse(args);
      return this.desk.limit(agentkitSender(wallet), { ...a, dryRun: this.#dryRun || a.dryRun });
    });
  }

  @CreateAction({
    name: "ladder_action",
    description: `Collect a ladder's fees, close it (all or part), take its position NFTs, or have the keeper close a filled limit order. What comes out is paid to this wallet only. ${SENDS}`,
    schema: LadderActionSchema,
  })
  async ladderAction(wallet: EvmWalletProvider, args: z.infer<typeof LadderActionSchema>): Promise<string> {
    return this.#send(() => {
      const a = LadderActionSchema.parse(args);
      return this.desk.action(agentkitSender(wallet), { ...a, dryRun: this.#dryRun || a.dryRun });
    });
  }

  @CreateAction({
    name: "swap",
    description: `Swap on Robinhood Chain through the router LoomDesk's zap uses, for a side a ladder needs. ${SENDS}`,
    schema: SwapSchema,
  })
  async swap(wallet: EvmWalletProvider, args: z.infer<typeof SwapSchema>): Promise<string> {
    return this.#send(() => {
      const a = SwapSchema.parse(args);
      return this.desk.swap(agentkitSender(wallet), { ...a, dryRun: this.#dryRun || a.dryRun });
    });
  }

  @CreateAction({
    name: "open_pool",
    description: `Opens a Uniswap v4 pool for a token on LoomDesk's hook against ETH, USDG or another token (about a dollar, once), when the pair has none. Nine tenths of its fee go to liquidity. ${SENDS}`,
    schema: OpenPoolSchema,
  })
  async openPool(wallet: EvmWalletProvider, args: z.infer<typeof OpenPoolSchema>): Promise<string> {
    return this.#send(() => {
      const a = OpenPoolSchema.parse(args);
      return this.desk.openPool(agentkitSender(wallet), { ...a, dryRun: this.#dryRun || a.dryRun });
    });
  }

  // AgentKit hands the model whatever an action returns, so every answer is a string, and an error is one too
  async #read(f: () => Promise<unknown>): Promise<string> {
    try {
      return JSON.stringify(await f());
    } catch (e) {
      return JSON.stringify({ ok: false, error: message(e) });
    }
  }

  async #send(f: () => Promise<Outcome>): Promise<string> {
    try {
      return JSON.stringify(await f());
    } catch (e) {
      return JSON.stringify({ ok: false, sent: false, error: message(e) });
    }
  }
}

function message(e: unknown): string {
  if (e instanceof z.ZodError) return `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  return (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);
}

export const loomdeskActionProvider = (config?: LoomdeskActionProviderConfig) => new LoomdeskActionProvider(config);
