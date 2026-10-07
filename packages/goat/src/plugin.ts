import { PluginBase, type Chain } from "@goat-sdk/core";
import type { EVMWalletClient } from "@goat-sdk/wallet-evm";
import type { WalletClient } from "viem";
import { CHAIN_ID, LoomDesk, type LoomDeskOptions } from "./core/index.js";
import { LoomDeskService } from "./service.js";

export const VERSION = "0.1.0";

export type LoomDeskPluginOptions = Omit<LoomDeskOptions, "client"> & {
  /** The viem WalletClient behind the GOAT wallet. With it, every transaction is sent with LoomDesk's gas, and swaps
   *  work; without it, calls go through the wallet's ABI path and swaps are refused. */
  signer?: WalletClient;
  /** Plan and check only, never send, whatever the model asks. */
  dryRun?: boolean;
};

export class LoomDeskPlugin extends PluginBase<EVMWalletClient> {
  private readonly service: LoomDeskService;
  /** The LoomDesk client the tools use (reads, plans, checkContractList). */
  readonly desk: LoomDesk;

  /** apiKey and referrer default to LOOMDESK_API_KEY and LOOMDESK_REFERRER. */
  constructor(options: LoomDeskPluginOptions = {}) {
    const { signer, dryRun, ...o } = options;
    const env = typeof process !== "undefined" ? process.env : {};
    const desk = new LoomDesk({ ...o, apiKey: o.apiKey ?? env.LOOMDESK_API_KEY, referrer: o.referrer ?? env.LOOMDESK_REFERRER, client: `loomdesk-goat-plugin/${VERSION}` });
    const service = new LoomDeskService(desk, { signer, dryRun });
    super("loomdesk", [service]);
    this.service = service;
    this.desk = desk;
  }

  /** One plugin instance serves one wallet. */
  getTools(wallet: EVMWalletClient) {
    this.service.useWallet(wallet);
    return super.getTools(wallet);
  }

  /** Robinhood Chain only. GOAT only warns when this is false, so every tool checks the chain again before it sends. */
  supportsChain = (chain: Chain) => chain.type === "evm" && chain.id === CHAIN_ID;
}

/** `getOnChainTools({ wallet: viem(walletClient), plugins: [loomdesk({ referrer: "0xYourWallet", signer: walletClient })] })` */
export function loomdesk(options?: LoomDeskPluginOptions) {
  return new LoomDeskPlugin(options);
}
