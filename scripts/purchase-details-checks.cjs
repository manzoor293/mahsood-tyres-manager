const assert = require("node:assert/strict");
const { createPurchaseService } = require("../electron/services/purchases.cjs");

module.exports = async function checkPurchaseDetails({
  db,
  evaluate,
  wait,
  click,
}) {
  const service = createPurchaseService(db);
  const create = (invoice_number, items, shipment_cost, paid_amount = 0) =>
    service.create({
      supplier_id: 1,
      invoice_number,
      purchased_at: new Date().toISOString().slice(0, 10),
      items,
      shipment_cost,
      paid_amount,
    });
  const exact = create(
    "DETAIL-EXACT",
    [{ product_id: 1, quantity: 5, unit_cost: 19000000 }],
    5000000,
    40000000,
  );
  const zero = create(
    "DETAIL-ZERO",
    [{ product_id: 1, quantity: 5, unit_cost: 19000000 }],
    0,
  );
  const odd = create(
    "DETAIL-ODD",
    [{ product_id: 1, quantity: 3, unit_cost: 100 }],
    100,
  );
  const multiple = create(
    "DETAIL-MULTI",
    [
      { product_id: 1, quantity: 1, unit_cost: 100 },
      { product_id: 2, quantity: 1, unit_cost: 300 },
    ],
    100,
  );
  // Direct fixture only in the isolated test profile: saved legacy transaction unit.
  const legacyId = db
    .prepare(
      "INSERT INTO purchases(invoice_number,supplier_id,purchased_at,subtotal,total) VALUES('DETAIL-LEGACY',1,date('now'),300,300)",
    )
    .run().lastInsertRowid;
  db.prepare(
    "INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,units_per_transaction_unit) VALUES(?,1,3,100,1)",
  ).run(legacyId);
  const legacy = service.getById(legacyId);
  const before = JSON.stringify(
    db.prepare("SELECT * FROM purchase_items ORDER BY id").all(),
  );
  await evaluate('location.hash="/purchases"');
  for (const [purchase, heading, expected] of [
    [
      exact,
      "Pair",
      [
        [
          "SHIP-A",
          "Shipment A",
          "R16",
          "5 pairs",
          "Rs. 190,000 / pair",
          "Rs. 950,000",
          "Rs. 50,000",
          "Rs. 1,000,000",
          "Rs. 200,000",
        ],
      ],
    ],
    [
      zero,
      "Pair",
      [
        [
          "SHIP-A",
          "Shipment A",
          "R16",
          "5 pairs",
          "Rs. 190,000 / pair",
          "Rs. 950,000",
          "Rs. 0",
          "Rs. 950,000",
          "Rs. 190,000",
        ],
      ],
    ],
    [
      odd,
      "Pair",
      [
        [
          "SHIP-A",
          "Shipment A",
          "R16",
          "3 pairs",
          "Rs. 1 / pair",
          "Rs. 3",
          "Rs. 1",
          "Rs. 4",
          "≈ Rs. 1.33",
        ],
      ],
    ],
    [
      multiple,
      "Pair",
      [
        [
          "SHIP-A",
          "Shipment A",
          "R16",
          "1 pair",
          "Rs. 1 / pair",
          "Rs. 1",
          "Rs. 0.25",
          "Rs. 1.25",
          "Rs. 1.25",
        ],
        [
          "SHIP-B",
          "Shipment B",
          "R17",
          "1 pair",
          "Rs. 3 / pair",
          "Rs. 3",
          "Rs. 0.75",
          "Rs. 3.75",
          "Rs. 3.75",
        ],
      ],
    ],
    [
      legacy,
      "Tyre",
      [
        [
          "SHIP-A",
          "Shipment A",
          "R16",
          "3 tyres",
          "Rs. 1 / tyre",
          "Rs. 3",
          "Rs. 0",
          "Rs. 3",
          "Rs. 1",
        ],
      ],
    ],
  ]) {
    await click(`View purchase ${purchase.invoice_number}`);
    await wait(
      `Boolean(document.querySelector('[aria-label="Purchase items"]'))`,
    );
    const table = await evaluate(
      `(() => {const t=document.querySelector('[aria-label="Purchase items"]');return {headers:Array.from(t.querySelectorAll('thead th')).map(c=>c.textContent),rows:Array.from(t.querySelectorAll('tbody tr')).map(r=>Array.from(r.cells).map(c=>c.textContent)),overflow:getComputedStyle(t.parentElement).overflowX,align:Array.from(t.querySelectorAll('tbody tr:first-child td')).map(c=>getComputedStyle(c).textAlign)};})()`,
    );
    assert.deepEqual(table.headers, [
      "SKU",
      "Product / Brand / Model",
      "Tyre Size",
      `Qty (${heading}s)`,
      `Supplier Price / ${heading}`,
      "Supplier Line Total",
      "Allocated Shipment",
      "Landed Line Cost",
      `Landed Cost / ${heading}`,
    ]);
    assert.deepEqual(table.rows, expected);
    assert.equal(table.overflow, "auto");
    assert.equal(table.align[3], "center");
    assert.ok(table.align.slice(4).every((a) => a === "right"));
    if (purchase.id === exact.id) {
      assert.equal(purchase.balance, 55000000);
      assert.ok(
        await evaluate(
          `document.querySelector('[role=dialog]').textContent.includes('Rs. 550,000')`,
        ),
      );
    }
    await click("Close");
    await wait('!document.querySelector("[role=dialog]")');
  }
  assert.equal(
    JSON.stringify(
      db.prepare("SELECT * FROM purchase_items ORDER BY id").all(),
    ),
    before,
    "Viewing averages must not mutate authoritative costs",
  );
  const { formatLandedUnitCost } = await import("../src/utils/landedCost.js");
  assert.equal(
    formatLandedUnitCost(Number.MAX_SAFE_INTEGER, 1),
    "Rs. 90,071,992,547,409.91",
  );
  assert.equal(formatLandedUnitCost(5, 2), "≈ Rs. 0.03");
  assert.equal(formatLandedUnitCost(1, 0), "Unavailable");
  console.log(
    "PASS Purchase Details: nine columns, exact/zero/unequal allocations, pair/legacy labels, odd paise average, safe limits, alignment/scrolling, supplier payable and unchanged stored costs",
  );
};
