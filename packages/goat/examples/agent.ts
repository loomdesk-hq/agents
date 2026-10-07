// A LoomDesk agent on Robinhood Chain with GOAT. In your project, import from "@loomdesk/goat-plugin", and hand the
// tools to your model through a GOAT adapter (e.g. @goat-sdk/adapter-vercel-ai's getOnChainTools).
import { getTools } from "@goat-sdk/core";
import { viem } from "@goat-sdk/wallet-viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loomdesk, robinhoodChain, PUBLIC_RPC } from "../src/index.js";

export async function main() {
  const walletClient = createWalletClient({
    account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
    chain: robinhoodChain,
    transport: http(PUBLIC_RPC),
  });

  const tools = await getTools({
    wallet: viem(walletClient),
    plugins: [
      loomdesk({
        referrer: "0x000000000000000000000000000000000000dEaD", // your wallet: paid 0.1% of what your agents put in
        signer: walletClient, // sends with LoomDesk's gas, and allows swaps
        apiKey: process.env.LOOMDESK_API_KEY, // optional: the agent's own quota at LoomDesk
        spendCap: { ETH: "0.05", USDG: "100" },
      }),
    ],
  });

  const build = tools.find((t) => t.name === "loomdesk_build_ladder")!;
  console.log(await build.execute({ token: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", payIn: "ETH", amount: "0.001", dryRun: true }));
}
