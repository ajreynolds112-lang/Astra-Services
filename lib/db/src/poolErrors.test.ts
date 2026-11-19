import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { handleIdlePoolErrors, type PoolErrorSummary } from "./poolErrors";

test("an idle database disconnect is handled without exposing the client or crashing", async () => {
  const pool = new pg.Pool();
  const reported: PoolErrorSummary[] = [];
  handleIdlePoolErrors(pool, (error) => reported.push(error));
  const error = Object.assign(new Error("terminating connection due to administrator command"), {
    code: "57P01",
    client: { connectionParameters: { password: "not-for-logging" } },
  });
  assert.doesNotThrow(() => pool.emit("error", error));
  assert.deepEqual(reported, [{
    message: "terminating connection due to administrator command",
    code: "57P01",
  }]);
  assert.ok(!JSON.stringify(reported).includes("not-for-logging"));
  await pool.end();
});

test("other idle connection failures are reported rather than suppressed", async () => {
  const pool = new pg.Pool();
  const reported: PoolErrorSummary[] = [];
  handleIdlePoolErrors(pool, (error) => reported.push(error));
  pool.emit("error", new Error("Connection terminated unexpectedly"));
  assert.equal(reported[0].message, "Connection terminated unexpectedly");
  await pool.end();
});