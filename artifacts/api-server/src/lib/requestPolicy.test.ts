import assert from "node:assert/strict";
import test from "node:test";
import { getRequestPolicy } from "./requestPolicy";
import { advertisedPlans } from "./advertisedPlans";

test("both flexible schedules get one free revision and $20 additional requests", () => {
  for (const amount of [17500, 15000]) {
    const plan = advertisedPlans.find((p) => p.service === "bundle" && p.installmentAmount === amount)!;
    assert.deepEqual(getRequestPolicy([plan]), { requestFee: 2000, freeRequestsPerMonth: 1 });
  }
});

test("Managed Hosting has no free requests and charges $25", () => {
  assert.deepEqual(getRequestPolicy([{ service: "hosting", freeRequestsPerMonth: 0 }]), {
    requestFee: 2500, freeRequestsPerMonth: 0,
  });
});

test("other tiers retain $20 requests and their existing allowances", () => {
  assert.deepEqual(getRequestPolicy([{ service: "bundle", freeRequestsPerMonth: 2 }]), {
    requestFee: 2000, freeRequestsPerMonth: 2,
  });
  assert.deepEqual(getRequestPolicy([{ service: "design", freeRequestsPerMonth: 0 }]), {
    requestFee: 2000, freeRequestsPerMonth: 0,
  });
});

test("a client with another tier keeps that tier's request benefits", () => {
  assert.deepEqual(getRequestPolicy([
    { service: "hosting", freeRequestsPerMonth: 0 },
    { service: "bundle", freeRequestsPerMonth: 2 },
  ]), { requestFee: 2000, freeRequestsPerMonth: 2 });
  assert.equal(getRequestPolicy([
    { service: "hosting", freeRequestsPerMonth: 0 },
    { service: "design", freeRequestsPerMonth: 0 },
  ]).requestFee, 2000);
});