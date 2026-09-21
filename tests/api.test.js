import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../backend/server.js";

test("Account, trading, security and persistence integration", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "zerodha-test-")),
    dbPath = path.join(directory, "test.sqlite");
  let instance = createApp({ dbPath }),
    server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    instance.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(endpoint, body, cookie = "", headers = {}) {
    const r = await fetch(base + endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      cookie: r.headers.get("set-cookie"),
      data: await r.json(),
    };
  }
  let alice, bob, initial;
  await t.test("health works; portfolio is protected", async () => {
    assert.equal((await request("/api/health")).data.status, "ok");
    assert.equal((await request("/api/portfolio")).status, 401);
  });
  await t.test(
    "registration validates inputs and sets protected cookie",
    async () => {
      assert.equal(
        (
          await request("/api/auth/register", {
            name: "Alice",
            email: "bad",
            password: "short",
          })
        ).status,
        400,
      );
      const result = await request("/api/auth/register", {
        name: "Alice",
        email: "alice@example.test",
        password: "test-password-123",
      });
      assert.equal(result.status, 200);
      assert.match(result.cookie, /HttpOnly/);
      assert.match(result.cookie, /SameSite=Strict/);
      alice = result.cookie.split(";")[0];
      assert.equal(
        (
          await request("/api/auth/register", {
            name: "Alice",
            email: "ALICE@example.test",
            password: "test-password-123",
          })
        ).status,
        409,
      );
    },
  );
  await t.test("login rejects incorrect credentials", async () => {
    assert.equal(
      (
        await request("/api/auth/login", {
          email: "alice@example.test",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    const result = await request("/api/auth/login", {
      email: "alice@example.test",
      password: "test-password-123",
    });
    assert.equal(result.status, 200);
    alice = result.cookie.split(";")[0];
  });
  await t.test(
    "new portfolio is seeded and another account is isolated",
    async () => {
      initial = (await request("/api/portfolio", undefined, alice)).data;
      assert.equal(initial.cash, 100000);
      assert.equal(initial.holdings.length, 7);
      bob = (await request("/api/auth/demo", {})).cookie.split(";")[0];
      assert.notEqual(
        (await request("/api/auth/me", undefined, bob)).data.user.id,
        initial.user.id,
      );
    },
  );
  const order = { name: "AAPL", qty: 2, side: "BUY", requestId: randomUUID() };
  await t.test(
    "buy executes server price and changes cash and holdings atomically",
    async () => {
      const result = await request(
        "/api/orders",
        { ...order, price: 0.01 },
        alice,
      );
      assert.equal(result.status, 201);
      assert.equal(result.data.order.price, 190);
      const data = (await request("/api/portfolio", undefined, alice)).data;
      assert.equal(data.cash, 99620);
      assert.equal(data.holdings.find((h) => h.name === "AAPL").qty, 3);
      assert.equal(data.orders.length, 1);
    },
  );
  await t.test(
    "retry is idempotent and conflicting payload is rejected",
    async () => {
      assert.equal((await request("/api/orders", order, alice)).status, 201);
      assert.equal(
        (await request("/api/portfolio", undefined, alice)).data.orders.length,
        1,
      );
      assert.equal(
        (await request("/api/orders", { ...order, qty: 1 }, alice)).status,
        409,
      );
    },
  );
  await t.test(
    "invalid, oversized and oversold trades do not alter balances",
    async () => {
      const before = (await request("/api/portfolio", undefined, alice)).data;
      for (const bad of [
        { qty: 0 },
        { qty: 1.5 },
        { qty: "1" },
        { side: "SHORT" },
        { name: "UNKNOWN" },
        { qty: 100000 },
        { side: "SELL", qty: 100 },
      ])
        assert.equal(
          (
            await request(
              "/api/orders",
              { ...order, ...bad, requestId: randomUUID() },
              alice,
            )
          ).status,
          400,
        );
      const after = (await request("/api/portfolio", undefined, alice)).data;
      assert.equal(after.cash, before.cash);
      assert.deepEqual(after.orders, before.orders);
    },
  );
  await t.test(
    "sell releases cash and removes a fully sold holding",
    async () => {
      assert.equal(
        (
          await request(
            "/api/orders",
            { name: "AAPL", qty: 3, side: "SELL", requestId: randomUUID() },
            alice,
          )
        ).status,
        201,
      );
      const data = (await request("/api/portfolio", undefined, alice)).data;
      assert.equal(data.cash, 100190);
      assert.equal(
        data.holdings.some((h) => h.name === "AAPL"),
        false,
      );
      assert.equal(
        (await request("/api/portfolio", undefined, bob)).data.cash,
        100000,
      );
    },
  );
  await t.test("concurrent retries execute once", async () => {
    const payload = {
      name: "MSFT",
      qty: 1,
      side: "BUY",
      requestId: randomUUID(),
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request("/api/orders", payload, alice)),
    );
    assert.ok(results.every((r) => r.status === 201));
    const data = (await request("/api/portfolio", undefined, alice)).data;
    assert.equal(
      data.orders.filter((o) => o.requestId === payload.requestId).length,
      1,
    );
    assert.equal(data.cash, 99770);
  });
  await t.test(
    "funds validate amount, overdraft and duplicate requests",
    async () => {
      for (const amount of [-1, 0, 1.001, "100", 1000001])
        assert.equal(
          (
            await request(
              "/api/funds",
              { amount, type: "DEPOSIT", requestId: randomUUID() },
              alice,
            )
          ).status,
          400,
        );
      const deposit = {
        amount: 1000,
        type: "DEPOSIT",
        requestId: randomUUID(),
      };
      assert.equal((await request("/api/funds", deposit, alice)).status, 201);
      assert.equal((await request("/api/funds", deposit, alice)).status, 201);
      assert.equal(
        (
          await request(
            "/api/funds",
            { amount: 1000000, type: "WITHDRAW", requestId: randomUUID() },
            alice,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/api/funds",
            { amount: 500, type: "WITHDRAW", requestId: randomUUID() },
            alice,
          )
        ).status,
        201,
      );
      const data = (await request("/api/portfolio", undefined, alice)).data;
      assert.equal(data.cash, 100270);
      assert.equal(data.transactions.length, 2);
    },
  );
  await t.test("support requests are validated and private", async () => {
    assert.equal(
      (await request("/api/tickets", { subject: "a", message: "b" }, alice))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/tickets",
          { subject: "Demo request", message: "A local support test request." },
          alice,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request("/api/portfolio", undefined, alice)).data.tickets.length,
      1,
    );
    assert.equal(
      (await request("/api/portfolio", undefined, bob)).data.tickets.length,
      0,
    );
  });
  await t.test("cross-origin mutations are rejected", async () => {
    assert.equal(
      (
        await request(
          "/api/funds",
          { amount: 100, type: "DEPOSIT", requestId: randomUUID() },
          alice,
          { origin: "https://malicious.example" },
        )
      ).status,
      403,
    );
  });
  await t.test("data and session survive server restart", async () => {
    await new Promise((resolve) => server.close(resolve));
    instance.db.close();
    instance = createApp({ dbPath });
    server = instance.app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const data = (await request("/api/portfolio", undefined, alice)).data;
    assert.equal(data.cash, 100270);
    assert.equal(data.orders.length, 3);
    assert.equal(data.tickets.length, 1);
  });
  await t.test("logout revokes the session", async () => {
    assert.equal((await request("/api/auth/logout", {}, alice)).status, 200);
    assert.equal(
      (await request("/api/portfolio", undefined, alice)).status,
      401,
    );
  });
});
