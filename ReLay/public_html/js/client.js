(function () {
  "use strict";

  var D = window.RelayData;
  var V = window.RelayValidation;
  if (!D || !V) { return; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function fmt(n, decimals) { return String(parseFloat(Number(n).toFixed(decimals))); }
  function kg(n) { return fmt(n, 2) + " kg"; }
  function m3(n) { return Number(n).toFixed(3) + " m³"; }

  function coords(p) { return (p.lat.toFixed(4) + ", " + p.lng.toFixed(4)).replace(/-/g, "−"); }

  function nowTime() {
    var d = new Date();
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  function product(ref) {
    return D.clientProducts.filter(function (p) { return p.ref === ref; })[0] || null;
  }

  function findOrder(id) {
    return D.clientOrders.filter(function (o) { return o.id === Number(id); })[0] || null;
  }

  function totals(order) {
    var t = { items: 0, kg: 0, m3: 0 };
    order.items.forEach(function (it) {
      var p = product(it.ref);
      if (!p) { return; }
      t.items += it.qty;
      t.kg += it.qty * p.weight_kg;
      t.m3 += it.qty * p.volume_m3;
    });
    return t;
  }

  function totalsText(t) {
    return t.items + (t.items === 1 ? " item" : " items") + " · " + kg(t.kg) + " · " + m3(t.m3);
  }

  // in how many orders a product appears
  function timesUsed(ref) {
    return D.clientOrders.filter(function (o) {
      return o.items.some(function (it) { return it.ref === ref; });
    }).length;
  }

  function isActive(o) { return o.status === "initiated" || o.status === "in_progress"; }

  var STATUS = {
    initiated:   { badge: "badge-green", label: "✓ Initiated" },
    in_progress: { badge: "badge-blue",  label: "● In Progress" },
    completed:   { badge: "badge-green", label: "Completed" },
    cancelled:   { badge: "badge-red",   label: "Cancelled" }
  };

  function badge(o) {
    var s = STATUS[o.status];
    return '<span class="badge ' + s.badge + '">' + s.label + "</span>";
  }

  function steps(o) {
    var cls = {
      initiated:   ["done", "", ""],
      in_progress: ["done", "current", ""],
      completed:   ["done", "done", "done"],
      cancelled:   ["done", "current", "cancelled"]
    }[o.status];
    var last = o.status === "cancelled" ? "Cancelled" : "Completed";
    return '<div class="steps" aria-label="Order status: ' + STATUS[o.status].label.replace(/[✓●] /, "") + '">' +
      '<span class="' + cls[0] + '">Initiated</span>' +
      '<span class="' + cls[1] + '">In Progress</span>' +
      '<span class="' + cls[2] + '">' + last + "</span></div>";
  }

  function detail(label, value) {
    return "<div><dt>" + label + "</dt><dd>" + value + "</dd></div>";
  }

  function place(p) { return esc(coords(p)) + (p.name && p.name !== "Selected point" ? " (" + esc(p.name) + ")" : ""); }

  function renderKpis() {
    var orders = D.clientOrders;
    var active = orders.filter(isActive);
    var completed = orders.filter(function (o) { return o.status === "completed"; });
    var cancelled = orders.filter(function (o) { return o.status === "cancelled"; });
    var waiting = active.filter(function (o) { return !o.courier; }).length;
    var products = D.clientProducts;
    var w = products.reduce(function (s, p) { return s + p.weight_kg; }, 0);
    var v = products.reduce(function (s, p) { return s + p.volume_m3; }, 0);
    var used = products.filter(function (p) { return timesUsed(p.ref) > 0; }).length;
    var usedActive = products.filter(function (p) {
      return active.some(function (o) { return o.items.some(function (it) { return it.ref === p.ref; }); });
    }).length;

    var values = {
      "active": active.length,
      "active-sub": waiting ? waiting + " waiting for a courier" : "All have a courier",
      "completed": completed.length,
      "completed-sub": "All with proof of delivery",
      "cancelled": cancelled.length,
      "cancelled-sub": cancelled.length ? "Last on " + cancelled[0].closed_at.split(" ")[0] : "None so far",
      "products": products.length,
      "products-sub": products.length ? "Last added on " + products[products.length - 1].created_at : "No products yet",
      "weight": kg(w),
      "weight-sub": products.length ? "Average " + kg(w / products.length) + " per product" : "—",
      "volume": m3(v),
      "volume-sub": products.length ? "Average " + m3(v / products.length) + " per product" : "—",
      "used": used,
      "used-sub": usedActive + " in active orders",
      "count-products": products.length + (products.length === 1 ? " product" : " products")
    };
    $all("[data-kpi]").forEach(function (el) {
      var key = el.getAttribute("data-kpi");
      if (key in values) { el.textContent = values[key]; }
    });
  }

  function orderCard(o) {
    var t = totals(o);
    var track = o.status === "in_progress"
      ? '<button type="button" class="btn btn-primary" data-track="' + o.id + '">⌖ Track order</button>'
      : "";
    return '<article class="order-card" id="order-' + o.id + '">' +
      '<div class="oc-head"><h3>Order #' + o.id + "</h3>" + badge(o) + "</div>" +
      steps(o) +
      '<dl class="detail-grid">' +
        detail("Origin", place(o.origin)) +
        detail("Destination", place(o.dest)) +
        detail("Courier", o.courier ? esc(o.courier) : "Waiting for a courier") +
        detail("Vehicle", o.vehicle ? esc(o.vehicle) : "—") +
        detail("Products", totalsText(t)) +
        detail("Last update", esc(o.updated)) +
      "</dl>" + track + "</article>";
  }

  function renderActive() {
    $all('[data-render="client-active-orders"]').forEach(function (box) {
      var list = D.clientOrders.filter(isActive);
      box.innerHTML = list.map(orderCard).join("");
      var empty = box.parentNode.querySelector("[data-empty]");
      if (empty) { empty.hidden = list.length > 0; }
    });
  }

  function historyRow(o) {
    var epod = o.status === "completed" ? (o.epod === "photo" ? "Photo" : "Signature") : "—";
    return "<tr><td>#" + o.id + "</td><td>" + esc(o.created_at.split(" ")[0]) + "</td><td>" + esc(o.dest.name) +
      "</td><td>" + esc(o.courier || "—") + "</td><td>" + epod + "</td><td>" + badge(o) + "</td>" +
      '<td><button type="button" class="btn-link" data-details="' + o.id + '" aria-label="View details of order ' + o.id + '">View →</button></td></tr>';
  }

  function renderHistory() {
    $all('[data-render="client-history"]').forEach(function (tbody) {
      var past = D.clientOrders.filter(function (o) { return !isActive(o); });
      var limit = Number(tbody.getAttribute("data-limit")) || past.length;
      var showAll = tbody.hasAttribute("data-show-all");
      tbody.innerHTML = (showAll ? past : past.slice(0, limit)).map(historyRow).join("");
    });
  }

  $all("[data-toggle-history]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tbody = $('[data-render="client-history"]');
      if (!tbody) { return; }
      var all = tbody.toggleAttribute("data-show-all");
      btn.textContent = all ? "Show less" : "View all orders";
      renderHistory();
    });
  });

  renderActive();
  renderHistory();
  renderKpis();
})();



