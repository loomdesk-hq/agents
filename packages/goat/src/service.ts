import "reflect-metadata";
import { Tool } from "@goat-sdk/core";
// a VALUE import: @Tool spots the wallet parameter from its emitted type
import { EVMWalletClient } from "@goat-sdk/wallet-evm";
import type { WalletClient } from "viem";
import { LoomDesk, type Outcome } from "./core/index.js";
import { BuildLadderParameters, LadderActionParameters, LadderPoolsParameters, LimitOrderParameters, MarketTokensParameters, MyLaddersParameters, OpenPoolParameters, PlaceLadderParameters, SwapParameters } from "./parameters.js";
import { goatSender } from "./sender.js";

const SENDS = "LoomDesk plans and simulates it; this tool refuses it unless that simulation passed and every transaction goes to a LoomDesk contract (or approves one for no more than asked), then sends each in order from this wallet. dryRun: plan only.";

export class LoomDeskService {
  private bound?: EVMWalletClient;

  constructor(readonly desk: LoomDesk, private readonly o: { signer?: WalletClient; dryRun?: boolean }) {}

  /** The wallet getTools() was called with. @Tool passes the wallet only when the declared EVMWalletClient's class
   *  reaches the very WalletClientBase the decorator was loaded with; with two copies of @goat-sdk/core installed it
   *  silently passes undefined, so the plugin remembers it. */
  useWallet(wallet: EVMWalletClient) {
    this.bound = wallet;
  }

  @Tool({
    name: "loomdesk_market_tokens",
    description: "Tokens trading on Robinhood Chain, from LoomDesk's index of every swap: price, market cap, 24h volume, tier (prefer established; untested: nobody checked a stranger can sell it), usdToMovePrice2Pct (depth) and keep (near 1: fees from ordinary traders; near 0: mostly arbitrage). Flagged tokens are left out. Read-only.",
  })
  async marketTokens(p: MarketTokensParameters) {
    return this.desk.market(p);
  }

  @Tool({
    name: "loomdesk_ladder_pools",
    description: "The pools of one token a ladder can go in, best first: fee, whether it pays liquidity, depth, volume, fees. The first is the default. A pair with no pool can be opened (loomdesk_open_pool). Read-only.",
  })
  async ladderPools(p: LadderPoolsParameters) {
    return this.desk.pools(p.token);
  }

  @Tool({
    name: "loomdesk_my_ladders",
    description: "This wallet's live LoomDesk ladders and limit orders (or another address's): ladderId, contract, pair, value, fees waiting and collected, PnL, the band and whether the price is in it. Read-only.",
  })
  async myLadders(wallet: EVMWalletClient, p: MyLaddersParameters) {
    return this.desk.myLadders(p.address ?? this.walletOf(wallet).getAddress());
  }

  @Tool({
    name: "loomdesk_build_ladder",
    description: `Opens a LoomDesk ladder (up to 40 narrow Uniswap v4 ranges that earn the pool's swap fee) from ETH or USDG in one transaction (two for USDG), owned by this wallet; opens a LoomDesk pool on the way when the pair has none. ${SENDS}`,
  })
  async buildLadder(wallet: EVMWalletClient, p: BuildLadderParameters) {
    return this.run(wallet, (s, dryRun) => this.desk.build(s, { ...p, dryRun }), p.dryRun);
  }

  @Tool({
    name: "loomdesk_place_ladder",
    description: `A ladder from the token, the quote or both, in any pool of the token; with openPoolQuote, a new LoomDesk pool is opened first and the ladder is built in it once that is mined. ${SENDS}`,
  })
  async placeLadder(wallet: EVMWalletClient, p: PlaceLadderParameters) {
    const { openPoolQuote, openPoolFeePct, ...a } = p;
    return this.run(wallet, (s, dryRun) => this.desk.ladder(s, { ...a, ...(openPoolQuote ? { openPool: { quote: openPoolQuote, feePct: openPoolFeePct ?? 1 } } : {}), dryRun }), p.dryRun);
  }

  @Tool({
    name: "loomdesk_limit_order",
    description: `A limit buy or sell: rungs on one side of the price that fill as it passes through them, closed by LoomDesk's keeper once filled. ${SENDS}`,
  })
  async limitOrder(wallet: EVMWalletClient, p: LimitOrderParameters) {
    return this.run(wallet, (s, dryRun) => this.desk.limit(s, { ...p, dryRun }), p.dryRun);
  }

  @Tool({
    name: "loomdesk_ladder_action",
    description: `Collect a ladder's fees, close it (all or part), take its position NFTs, or have the keeper close a filled limit order. What comes out is paid to this wallet only. ${SENDS}`,
  })
  async ladderAction(wallet: EVMWalletClient, p: LadderActionParameters) {
    return this.run(wallet, (s, dryRun) => this.desk.action(s, { ...p, dryRun }), p.dryRun);
  }

  @Tool({
    name: "loomdesk_swap",
    description: `Swap on Robinhood Chain through the router LoomDesk's zap uses, for a side a ladder needs. Needs the plugin's signer option. ${SENDS}`,
  })
  async swap(wallet: EVMWalletClient, p: SwapParameters) {
    return this.run(wallet, (s, dryRun) => this.desk.swap(s, { ...p, dryRun }), p.dryRun);
  }

  @Tool({
    name: "loomdesk_open_pool",
    description: `Opens a Uniswap v4 pool for a token on LoomDesk's hook against ETH, USDG or another token (about a dollar, once), when the pair has none. ${SENDS}`,
  })
  async openPool(wallet: EVMWalletClient, p: OpenPoolParameters) {
    return this.run(wallet, (s, dryRun) => this.desk.openPool(s, { ...p, dryRun }), p.dryRun);
  }

  private walletOf(injected: EVMWalletClient | undefined): EVMWalletClient {
    const w = injected ?? this.bound;
    if (!w) throw new Error("loomdesk: no wallet; get the tools through getTools or getOnChainTools with a wallet.");
    return w;
  }

  private run(wallet: EVMWalletClient | undefined, f: (s: ReturnType<typeof goatSender>, dryRun: boolean) => Promise<Outcome>, dryRun: boolean | undefined): Promise<Outcome> {
    return f(goatSender(this.walletOf(wallet), this.o.signer), Boolean(this.o.dryRun || dryRun));
  }
}
