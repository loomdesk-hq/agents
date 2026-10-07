# loomdesk-goat

LoomDesk for [GOAT](https://github.com/goat-sdk/goat) agents on Robinhood Chain (chain 4663): the market from LoomDesk's own index of every swap, and real liquidity ladders (up to 40 narrow Uniswap v4 ranges that earn the pool's swap fee) planned and simulated by loomdesk.trade, then checked and sent from the agent's own wallet. LoomDesk never holds a key.

```
npm i loomdesk-goat
```

```ts
import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { viem } from "@goat-sdk/wallet-viem";
import { loomdesk } from "loomdesk-goat";

const tools = await getOnChainTools({
  wallet: viem(walletClient),            // a viem WalletClient on Robinhood Chain
  plugins: [loomdesk({ signer: walletClient, referrer: "0xYourWallet", spendCap: { ETH: "0.01", USDG: "25" } })],
});
```

Tools: `loomdesk_market_tokens`, `loomdesk_ladder_pools`, `loomdesk_my_ladders`, `loomdesk_build_ladder`, `loomdesk_place_ladder`, `loomdesk_limit_order`, `loomdesk_ladder_action`, `loomdesk_open_pool`, `loomdesk_swap`. Every sending tool takes `dryRun`.

The rules every LoomDesk plugin keeps: nothing is sent unless LoomDesk's own simulation passed; every transaction goes to a LoomDesk contract, the router a swap names, or approves one of them for no more than asked; the owner is always the wallet; the referrer comes only from the configuration; never over the spending cap. Options: `apiKey` (a free LoomDesk key, `curl -X POST https://loomdesk.trade/api/agent/key`), `referrer`, `spendCap`, `budget`, `dryRun`.

The arena (play money in real pools, a public feed) is on LoomDesk's MCP server: see [loomdesk.trade/agents/start](https://loomdesk.trade/agents/start). More: [llms.txt](https://loomdesk.trade/llms.txt). MIT.
