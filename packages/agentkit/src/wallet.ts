// The agent's wallet for LoomDesk. Any AgentKit EvmWalletProvider on chain 4663 works through agentkitSender;
// LoomDeskWalletProvider is a ViemWalletProvider that sends a transaction with the gas limit it is given (the plain one
// re-estimates every transaction and drops the limit LoomDesk set from its simulation of the plan).
import { ViemWalletProvider, type EvmWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, getAddress, http, type Account, type Address, type Hex, type TransactionRequest, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PUBLIC_RPC, erc20Abi, replay, robinhoodChain, type CheckedTx, type Sender, type SendResult } from "./core/index.js";

export class LoomDeskWalletProvider extends ViemWalletProvider {
  readonly #client: WalletClient;

  constructor(walletClient: WalletClient, gasConfig?: ConstructorParameters<typeof ViemWalletProvider>[1]) {
    super(walletClient, gasConfig);
    this.#client = walletClient;
  }

  /** With `gas` given, sent with exactly that limit (fees still estimated); without it, as ViemWalletProvider does. */
  async sendTransaction(tx: TransactionRequest): Promise<Hex> {
    if (tx.gas === undefined || tx.gas === null) return super.sendTransaction(tx);
    const account = this.#client.account;
    if (!account) throw new Error("Account not found");
    const fees = await this.getPublicClient().estimateFeesPerGas();
    return this.#client.sendTransaction({ account, chain: this.#client.chain, to: tx.to ?? undefined, data: tx.data, value: tx.value, gas: tx.gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas } as never);
  }
}

/** A wallet on Robinhood Chain from a private key (or any viem account), through the public RPC unless one is given. */
export function robinhoodWallet(o: { privateKey?: Hex; account?: Account; rpcUrl?: string }): LoomDeskWalletProvider {
  const account = o.account ?? (o.privateKey ? privateKeyToAccount(o.privateKey) : undefined);
  if (!account) throw new Error("loomdesk: give a privateKey or an account");
  const rpcUrl = o.rpcUrl ?? PUBLIC_RPC;
  const client = createWalletClient({ account, chain: robinhoodChain, transport: http(rpcUrl) });
  return new LoomDeskWalletProvider(client, { rpcUrl, gasLimitMultiplier: 1.5 });
}

/** LoomDesk's view of an AgentKit wallet. */
export function agentkitSender(wallet: EvmWalletProvider): Sender {
  const address = getAddress(wallet.getAddress()) as Address;
  return {
    address,
    chainId: async () => Number(wallet.getNetwork().chainId),
    balance: () => wallet.getBalance(),
    decimals: async (token) => Number(await wallet.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })),
    async send(tx: CheckedTx): Promise<SendResult> {
      const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, ...(tx.gas ? { gas: tx.gas } : {}) });
      const receipt = await wallet.waitForTransactionReceipt(hash);
      if (receipt?.status === "success") return { hash, status: "success" };
      const block = receipt?.blockNumber !== undefined ? BigInt(receipt.blockNumber) : 0n;
      return { hash, status: "reverted", revert: await replay(wallet.getPublicClient() as never, address, tx, block) };
    },
  };
}
