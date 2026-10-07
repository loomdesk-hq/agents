// A LoomDesk agent on Robinhood Chain with Coinbase AgentKit. In your project, import from "@loomdesk/agentkit".
import { AgentKit } from "@coinbase/agentkit";
import { loomdeskActionProvider, robinhoodWallet } from "../src/index.js";

export async function main() {
  // the agent's own key, on Robinhood Chain through the public RPC (or your own node)
  const walletProvider = robinhoodWallet({ privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}` });

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      loomdeskActionProvider({
        referrer: "0x000000000000000000000000000000000000dEaD", // your wallet: paid 0.1% of what your agents put in
        apiKey: process.env.LOOMDESK_API_KEY, // optional: the agent's own quota at LoomDesk
        spendCap: { ETH: "0.05", USDG: "100" }, // the most one plan may spend
        budget: { ETH: "0.2", USDG: "400" }, // the most all plans together may spend
      }),
    ],
  });

  // hand these to your model, e.g. with @coinbase/agentkit-langchain's getLangChainTools(agentkit)
  const actions = agentkit.getActions();
  const build = actions.find((a) => a.name === "LoomdeskActionProvider_build_ladder")!;
  console.log(await build.invoke({ token: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", payIn: "ETH", amount: "0.001", dryRun: true }));
}
