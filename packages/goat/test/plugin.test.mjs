// The GOAT side: the tools register with the wallet injected, a build goes through the wallet's ABI path (no raw
// data, which old wallets drop), a swap's opaque route is refused without a signer, and with a signer every
// transaction carries LoomDesk's gas.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createWalletClient, http, parseEther, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { OWNER, REFERRER, TOKEN, approveTx, fakeApi, zapBuildTx } from "./core.suite.mjs";
import { fakeRpc } from "./rpc.mjs";

const require = createRequire(import.meta.url);
const pkg = require("../dist/index.js");
const core = require("../dist/core/index.js");
const { getTools } = require("@goat-sdk/core");
const { EVMWalletClient } = require("@goat-sdk/wallet-evm");
const { viem } = require("@goat-sdk/wallet-viem");

class FakeWallet extends EVMWalletClient {
  constructor(address = OWNER) { super(); this.address = address; this.sent = []; }
  getAddress() { return this.address; }
  getChain() { return { type: "evm", id: 4663, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }; }
  async getNativeBalance() { return parseEther("1"); }
  async read() { return { value: 18 }; }
  async signMessage() { return { signature: "0x" }; }
  async signTypedData() { return { signature: "0x" }; }
  async sendTransaction(tx) { this.sent.push(tx); return { hash: `0x${String(this.sent.length).padStart(64, "0")}`, status: "success" }; }
}

const plan = (txs) => ({ chainId: 4663, pair: "TKN/ETH", transactions: txs, check: { simulated: true, ok: true, gasEthAtMost: "0.0001" }, ifItReverts: {} });
// getTools also returns the wallet's own tools; only LoomDesk's are of interest here
const toolsOf = async (plugin, wallet) => Object.fromEntries((await getTools({ wallet, plugins: [plugin] })).filter((t) => t.name.startsWith("loomdesk_")).map((t) => [t.name, t]));

test("nine loomdesk_ tools, only Robinhood Chain supported", async () => {
  const plugin = pkg.loomdesk({ fetch: fakeApi().fetch });
  const names = Object.keys(await toolsOf(plugin, new FakeWallet())).sort();
  assert.deepEqual(names, ["loomdesk_build_ladder", "loomdesk_ladder_action", "loomdesk_ladder_pools", "loomdesk_limit_order", "loomdesk_market_tokens", "loomdesk_my_ladders", "loomdesk_open_pool", "loomdesk_place_ladder", "loomdesk_swap"]);
  assert.equal(plugin.supportsChain({ type: "evm", id: 4663 }), true);
  assert.equal(plugin.supportsChain({ type: "evm", id: 8453 }), false);
});

test("a build goes through the wallet's ABI path: decoded, no raw data, the asked value", async () => {
  const api = fakeApi({ plans: [plan([zapBuildTx(core)])] });
  const w = new FakeWallet();
  const t = await toolsOf(pkg.loomdesk({ fetch: api.fetch, referrer: REFERRER }), w);
  const out = await t.loomdesk_build_ladder.execute({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].functionName, "zapBuild");
  assert.equal(w.sent[0].data, undefined);
  assert.equal(w.sent[0].value, parseEther("0.01"));
  assert.equal(api.plansAsked()[0].body.owner, OWNER);
  assert.match(api.plansAsked()[0].headers["user-agent"], /^loomdesk-goat-plugin\//);
});

test("a swap's route is refused without a signer, before the approval goes", async () => {
  const router = core.KNOWN_ROUTERS[0];
  const swap = { chainId: 4663, router, from: { address: core.USDG }, transactions: [approveTx(core, core.USDG, router, parseUnits("5", 6)), { step: "swap", to: router, data: "0x12345678", value: "0" }], check: { simulated: true, ok: true }, ifItReverts: {} };
  const w = new FakeWallet();
  const t = await toolsOf(pkg.loomdesk({ fetch: fakeApi({ plans: [swap] }).fetch }), w);
  const out = await t.loomdesk_swap.execute({ from: "USDG", to: "ETH", amount: "5" });
  assert.equal(out.ok, false);
  assert.match(out.refused, /signer/);
  assert.equal(w.sent.length, 0);
});

test("with a signer, a real wallet-viem wallet on 4663 sends with LoomDesk's gas", async () => {
  const rpc = await fakeRpc();
  try {
    const client = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain: core.robinhoodChain, transport: http(rpc.url) });
    const owner = client.account.address;
    const api = fakeApi({ plans: [plan([zapBuildTx(core)])] });
    const t = await toolsOf(pkg.loomdesk({ fetch: api.fetch, referrer: REFERRER, signer: client }), viem(client));
    const out = await t.loomdesk_build_ladder.execute({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(api.plansAsked()[0].body.owner, owner);
    const raw = rpc.calls.find((c) => c.method === "eth_sendRawTransaction").params[0];
    assert.equal(parseTransaction(raw).gas, 900000n);
    assert.equal(rpc.calls.filter((c) => c.method === "eth_estimateGas").length, 0);
  } finally {
    await rpc.close();
  }
});

test("a signer that is not the wallet is refused", async () => {
  const client = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain: core.robinhoodChain, transport: http("http://127.0.0.1:9") });
  const t = await toolsOf(pkg.loomdesk({ fetch: fakeApi({ plans: [plan([zapBuildTx(core)])] }).fetch, referrer: REFERRER, signer: client }), new FakeWallet());
  await assert.rejects(t.loomdesk_build_ladder.execute({ token: TOKEN, payIn: "ETH", amount: "0.01", quote: "ETH" }), /signer is not the wallet/);
});
