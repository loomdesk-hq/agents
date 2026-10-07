// The AgentKit side: the actions register with the wallet injected (decorator metadata survives the build), only on
// Robinhood Chain, send through the wallet with LoomDesk's gas, and the wallet provider keeps that gas.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { parseEther, parseTransaction } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { OWNER, REFERRER, TOKEN, fakeApi, zapBuildTx } from "./core.suite.mjs";
import { fakeRpc } from "./rpc.mjs";

const require = createRequire(import.meta.url);
const pkg = require("../dist/index.js");
const core = require("../dist/core/index.js");
const { AgentKit } = require("@coinbase/agentkit");

// AgentKit posts every action call to Coinbase's analytics; answered here so tests stay offline
const analytics = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("coinbase.com")) { analytics.push(String(url)); return new Response("{}", { status: 200 }); }
  if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, init);
  throw new Error(`unexpected network call in a test: ${url}`);
};

function fakeWallet({ chainId = "4663", status = "success" } = {}) {
  const sent = [];
  return {
    sent,
    getName: () => "fake_wallet",
    getAddress: () => OWNER,
    getNetwork: () => ({ protocolFamily: "evm", chainId, networkId: undefined }),
    getBalance: async () => parseEther("1"),
    readContract: async () => 18,
    getPublicClient: () => ({ call: async () => { const e = new Error("reverted"); e.data = "0x0be75048"; throw e; } }),
    sendTransaction: async (tx) => { sent.push(tx); return `0x${String(sent.length).padStart(64, "0")}`; },
    waitForTransactionReceipt: async () => ({ status, blockNumber: 5n }),
  };
}

const plan = () => ({ chainId: 4663, pair: "TKN/ETH", transactions: [zapBuildTx(core)], check: { simulated: true, ok: true, gasEthAtMost: "0.0001" }, ifItReverts: {} });
const actionsOf = (provider, wallet) => Object.fromEntries(provider.getActions(wallet).map((a) => [a.name.replace("LoomdeskActionProvider_", ""), a]));

test("nine actions, the wallet injected into the ones that need it, on Robinhood Chain only", async () => {
  const p = pkg.loomdeskActionProvider({ fetch: fakeApi().fetch });
  const names = Object.keys(actionsOf(p, fakeWallet())).sort();
  assert.deepEqual(names, ["build_ladder", "ladder_action", "ladder_pools", "limit_order", "market_tokens", "my_ladders", "open_pool", "place_ladder", "swap"]);
  assert.equal(p.supportsNetwork({ protocolFamily: "evm", chainId: "4663" }), true);
  assert.equal(p.supportsNetwork({ protocolFamily: "evm", chainId: "8453" }), false);
});

test("build_ladder: planned for this wallet with the configured referrer, sent with LoomDesk's gas", async () => {
  const api = fakeApi({ plans: [plan()] });
  const w = fakeWallet();
  const a = actionsOf(pkg.loomdeskActionProvider({ fetch: api.fetch, referrer: REFERRER }), w);
  const out = JSON.parse(await a.build_ladder.invoke({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].gas, 900000n);
  assert.equal(api.plansAsked()[0].body.owner, OWNER);
  assert.equal(api.plansAsked()[0].body.referrer.toLowerCase(), REFERRER.toLowerCase());
  assert.match(api.plansAsked()[0].headers["user-agent"], /^loomdesk-agentkit\//);
});

test("a key from LOOMDESK_API_KEY goes as a bearer token", async () => {
  process.env.LOOMDESK_API_KEY = `ldk_f_${"1".repeat(32)}_${"2".repeat(32)}`;
  try {
    const api = fakeApi({ plans: [plan()] });
    const a = actionsOf(pkg.loomdeskActionProvider({ fetch: api.fetch, referrer: REFERRER }), fakeWallet());
    await a.build_ladder.invoke({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH", dryRun: true });
    assert.equal(api.plansAsked()[0].headers.authorization, `Bearer ${process.env.LOOMDESK_API_KEY}`);
  } finally {
    delete process.env.LOOMDESK_API_KEY;
  }
});

test("dryRun in the configuration wins over the model's", async () => {
  const w = fakeWallet();
  const a = actionsOf(pkg.loomdeskActionProvider({ fetch: fakeApi({ plans: [plan()] }).fetch, referrer: REFERRER, dryRun: true }), w);
  const out = JSON.parse(await a.build_ladder.invoke({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH", dryRun: false }));
  assert.equal(out.dryRun, true);
  assert.equal(w.sent.length, 0);
});

test("a revert is read through the wallet's public client and planned again", async () => {
  const api = fakeApi({ plans: [{ ...plan(), ifItReverts: { "0x0be75048": "TooLittleOut: plan again" } }, plan()] });
  const w = fakeWallet({ status: "reverted" });
  const out = JSON.parse(await actionsOf(pkg.loomdeskActionProvider({ fetch: api.fetch, referrer: REFERRER }), w).build_ladder.invoke({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" }));
  assert.equal(out.ok, false);
  assert.match(out.replanned, /TooLittleOut/);
  assert.equal(w.sent.length, 2);
});

test("bad arguments and a wallet on another chain come back as errors, nothing sent", async () => {
  const w = fakeWallet({ chainId: "8453" });
  const a = actionsOf(pkg.loomdeskActionProvider({ fetch: fakeApi({ plans: [plan()] }).fetch }), w);
  assert.match(JSON.parse(await a.build_ladder.invoke({ token: "nope", payIn: "ETH", amount: "1" })).error, /Invalid arguments/);
  assert.match(JSON.parse(await a.build_ladder.invoke({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" })).refused, /chain 8453/);
  assert.equal(w.sent.length, 0);
});

test("LoomDeskWalletProvider sends with the gas it is given and does not re-estimate", async () => {
  const rpc = await fakeRpc();
  try {
    const { createWalletClient, http } = require("viem");
    const { privateKeyToAccount } = require("viem/accounts");
    const client = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain: core.robinhoodChain, transport: http(rpc.url) });
    const w = new pkg.LoomDeskWalletProvider(client, { rpcUrl: rpc.url });
    await w.sendTransaction({ to: core.LOOMDESK.zap, data: "0x1234", value: 1n, gas: 777777n });
    const raw = rpc.calls.find((c) => c.method === "eth_sendRawTransaction").params[0];
    assert.equal(parseTransaction(raw).gas, 777777n);
    assert.equal(rpc.calls.filter((c) => c.method === "eth_estimateGas").length, 0);
    // with AgentKit itself
    const kit = await AgentKit.from({ walletProvider: w, actionProviders: [pkg.loomdeskActionProvider({ fetch: fakeApi().fetch })] });
    assert.ok(kit.getActions().some((x) => x.name === "LoomdeskActionProvider_build_ladder"));
  } finally {
    await rpc.close();
  }
});
