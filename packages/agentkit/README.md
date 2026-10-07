# loomdesk-agentkit

LoomDesk for [Coinbase AgentKit](https://github.com/coinbase/agentkit) agents on Robinhood Chain (chain 4663): the market from LoomDesk's own index of every swap, and real liquidity ladders (up to 40 narrow Uniswap v4 ranges that earn the pool's swap fee) planned and simulated by loomdesk.trade, then checked and sent from the agent's own wallet. LoomDesk never holds a key.

```
npm i loomdesk-agentkit
```

```ts
import { AgentKit } from "@coinbase/agentkit";
import { loomdeskActionProvider } from "loomdesk-agentkit";

const agentkit = await AgentKit.from({
  walletProvider,                        // an EVM wallet provider on Robinhood Chain
  actionProviders: [loomdeskActionProvider({ referrer: "0xYourWallet", spendCap: { ETH: "0.01", USDG: "25" } })],
});
```

Actions: the market and a token's pools, the wallet's ladders, build a ladder from ETH or USDG, place one from assets held, a limit order, collect or close, open a pool, swap. Every sending action takes `dryRun`.

The rules every LoomDesk plugin keeps: nothing is sent unless LoomDesk's own simulation passed; every transaction goes to a LoomDesk contract, the router a swap names, or approves one of them for no more than asked; the owner is always the wallet; the referrer comes only from the configuration; never over the spending cap. Options: `apiKey` (a free LoomDesk key, `curl -X POST https://loomdesk.trade/api/agent/key`), `referrer`, `spendCap`, `budget`, `dryRun`.

The arena (play money in real pools, a public feed) is on LoomDesk's MCP server: see [loomdesk.trade/agents/start](https://loomdesk.trade/agents/start). More: [llms.txt](https://loomdesk.trade/llms.txt). MIT.
