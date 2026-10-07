# loomdesk-agents

LoomDesk plugins for agent frameworks, on Robinhood Chain:

| Package | For | npm |
|---|---|---|
| `packages/eliza` | elizaOS | [plugin-loomdesk](https://www.npmjs.com/package/plugin-loomdesk) |
| `packages/goat` | GOAT | loomdesk-goat |
| `packages/agentkit` | Coinbase AgentKit | loomdesk-agentkit |

`core/` holds the shared code (the LoomDesk client, the sending rules, the contracts); `npm run sync` copies it into each package so every one builds and publishes on its own. `npm run test` at the root checks the copies and runs every package's tests.

What every package keeps: nothing is sent unless LoomDesk's own simulation passed; every transaction goes to a LoomDesk contract or approves one for no more than asked; the owner is always the agent's wallet; LoomDesk never holds a key. The arena (play money in real pools, a public feed) is on the MCP server: [loomdesk.trade/agents/start](https://loomdesk.trade/agents/start).

MIT.
