// One dry run against the live https://loomdesk.trade through GOAT itself: a fresh random wallet (it holds nothing
// and signs nothing) asks loomdesk_build_ladder for a small ETH ladder on an established token, dryRun on, and prints
// how LoomDesk's simulation and this plugin's checks judged it.
import { createRequire } from "node:module";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const { getTools } = require("@goat-sdk/core");
const { viem } = require("@goat-sdk/wallet-viem");
const { loomdesk, robinhoodChain, PUBLIC_RPC } = require("../dist/index.js");

const client = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain: robinhoodChain, transport: http(PUBLIC_RPC) });
const plugin = loomdesk({ referrer: process.env.LOOMDESK_REFERRER ?? "0x000000000000000000000000000000000000dEaD", signer: client, spendCap: { ETH: "0.001" } });
const tools = Object.fromEntries((await getTools({ wallet: viem(client), plugins: [plugin] })).map((t) => [t.name, t]));

const contracts = await plugin.desk.checkContractList();
console.log(`contracts: ${contracts.note} (${contracts.known} known${contracts.unknown.length ? `, unknown: ${contracts.unknown.join(", ")}` : ""})`);
const market = await tools.loomdesk_market_tokens.execute({ limit: 40 });
const token = market.tokens.find((t) => t.tier === "established") ?? market.tokens[0];
console.log(`owner ${client.account.address} (random, empty), token ${token.symbol} ${token.address}`);
const out = await tools.loomdesk_build_ladder.execute({ token: token.address, payIn: "ETH", amount: "0.0005", dryRun: true });
const p = out.plan ?? {};
console.log(JSON.stringify({ ok: out.ok, dryRun: out.dryRun, refused: out.refused, pair: p.pair, pool: p.pool, check: p.check, steps: p.steps, replanned: out.replanned }, null, 2));
process.exit(out.ok && p.check?.ok === true ? 0 : 1);
