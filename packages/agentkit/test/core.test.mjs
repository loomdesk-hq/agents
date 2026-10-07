// The shared sending rules, against this package's own build of them.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { coreSuite } from "./core.suite.mjs";

const core = createRequire(import.meta.url)("../dist/core/index.js");
coreSuite(test, assert, core);
