// LoomDesk's view of a GOAT wallet. GOAT's EVM transaction has no gas field and no receipt call, so a plan's gas can
// only be kept when the plugin is also given the viem WalletClient behind the wallet (`signer`): then every
// transaction is sent through it with LoomDesk's gas. Without one, each checked call goes through the wallet's ABI path
// (decoded by the guard, re-encoded by the wallet to the same bytes), and the wallet estimates the gas; a swap's route
// is opaque bytes, which wallets before @goat-sdk/wallet-viem 0.2.3 drop, so it is never sent that way.
import type { EVMWalletClient } from "@goat-sdk/wallet-evm";
import { getAddress, type Address, type WalletClient } from "viem";
import { erc20Abi, GuardError, revertSelector, viemSender, type CheckedTx, type Sender, type SendResult } from "./core/index.js";

export function goatSender(wallet: EVMWalletClient, signer?: WalletClient): Sender {
  const address = getAddress(wallet.getAddress()) as Address;
  if (signer) {
    if (!signer.account || getAddress(signer.account.address) !== address) throw new GuardError("loomdesk: the signer is not the wallet the tools were given");
    return viemSender(signer as never);
  }
  return {
    address,
    chainId: async () => wallet.getChain().id,
    // getNativeBalance from @goat-sdk/wallet-evm 0.3; balanceOf before it
    balance: async () => {
      const w = wallet as EVMWalletClient & { getNativeBalance?: () => Promise<bigint>; balanceOf: (a: string) => Promise<{ inBaseUnits: string }> };
      return typeof w.getNativeBalance === "function" ? w.getNativeBalance() : BigInt((await w.balanceOf(address)).inBaseUnits);
    },
    decimals: async (token) => Number((await wallet.read({ address: token, abi: erc20Abi as never, functionName: "decimals", args: [] })).value),
    cannotSend: (tx) => (tx.call ? undefined : `"${tx.step}" is a swap route, which this plugin sends only through a viem signer: pass loomdesk({ signer: walletClient }). Nothing was sent.`),
    async send(tx: CheckedTx): Promise<SendResult> {
      if (!tx.call) throw new GuardError(`"${tx.step}" is a swap route, which this plugin sends only through a viem signer. Nothing more was sent.`);
      let r: { hash: string; status?: string };
      try {
        r = (await wallet.sendTransaction({ to: tx.to, abi: tx.call.abi as never, functionName: tx.call.functionName, args: tx.call.args as unknown[], value: tx.value })) as typeof r;
      } catch (e) {
        // the wallet simulates before it sends: a call that would revert is refused there, nothing sent
        return { status: "reverted", revert: revertSelector(e), error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300) };
      }
      if (r.status === "success") return { hash: r.hash as `0x${string}`, status: "success" };
      if (r.status === "reverted") return { hash: r.hash as `0x${string}`, status: "reverted" };
      // a wallet that does not wait for the receipt: the next transaction could go before this one is mined
      throw new GuardError(`The wallet sent "${tx.step}" (${r.hash}) without saying whether it was mined, so nothing after it was sent. Use @goat-sdk/wallet-viem, or pass a viem signer.`);
    },
  };
}
