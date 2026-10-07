// One dry run against the live https://loomdesk.trade through AgentKit itself: a fresh random wallet (it holds
// nothing and signs nothing) asks build_ladder for a small ETH ladder on an established token, dryRun on, and prints
// how LoomDesk's simulation and this plugin's checks judged it. AgentKit's analytics calls are answered locally.
import { createRequire } from "node:module";
import { generatePrivateKey } from "viem/accounts";

const require = createRequire(import.meta.url);
const { AgentKit } = require("@coinbase/agentkit");
const { loomdeskActionProvider, robinhoodWallet } = require("../dist/index.js");

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (String(url).includes("cca-lite.coinbase.com") ? Promise.resolve(new Response("{}")) : realFetch(url, init));

const walletProvider = robinhoodWallet({ privateKey: generatePrivateKey() });
const referrer = process.env.LOOMDESK_REFERRER ?? "0x000000000000000000000000000000000000dEaD";
const kit = await AgentKit.from({ walletProvider, actionProviders: [loomdeskActionProvider({ referrer, spendCap: { ETH: "0.001" } })] });
const act = Object.fromEntries(kit.getActions().map((a) => [a.name.replace("LoomdeskActionProvider_", ""), a]));

const market = JSON.parse(await act.market_tokens.invoke({ limit: 40 }));
const token = market.tokens.find((t) => t.tier === "established") ?? market.tokens[0];
console.log(`owner ${walletProvider.getAddress()} (random, empty), token ${token.symbol} ${token.address}`);
const out = JSON.parse(await act.build_ladder.invoke({ token: token.address, payIn: "ETH", amount: "0.0005", dryRun: true }));
const p = out.plan ?? {};
console.log(JSON.stringify({ ok: out.ok, dryRun: out.dryRun, refused: out.refused, error: out.error, pair: p.pair, pool: p.pool, check: p.check, steps: p.steps, sendWithin: p.sendWithin, replanned: out.replanned }, null, 2));
process.exit(out.ok && p.check?.ok === true ? 0 : 1);
