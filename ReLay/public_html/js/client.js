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
  
  var productForm = $("#product-form");
  var productTable = $('[data-render="client-products"]');
  var editingRef = null;

  function renderProducts() {
    if (!productTable) { return; }
    productTable.innerHTML = D.clientProducts.slice().reverse().map(function (p) {
      var n = timesUsed(p.ref);
      var locked = n > 0;
      var why = locked ? ' disabled title="Used in ' + n + (n === 1 ? " order" : " orders") + ' — it can\'t be changed"' : "";
      return '<tr' + (locked ? ' class="row-locked"' : "") + ' data-ref="' + p.ref + '"><td>' + p.ref + "</td><td>" + esc(p.description) +
        "</td><td>" + esc(p.category) + "</td><td>" + kg(p.weight_kg) + "</td><td>" + m3(p.volume_m3) + "</td><td>" +
        (n ? n + (n === 1 ? " order" : " orders") : "—") + '</td><td><div class="actions">' +
        '<button type="button" class="btn btn-sm btn-outline" data-edit="' + p.ref + '"' + why + ">Edit</button>" +
        '<button type="button" class="btn btn-sm btn-danger" data-delete="' + p.ref + '"' + why + ">Delete</button>" +
        "</div></td></tr>";
    }).join("") || '<tr><td colspan="7" class="text-muted">No products yet. Register your first product above.</td></tr>';
  }

  function stopEditing() {
    editingRef = null;
    if (!productForm) { return; }
    $("[data-form-title]").textContent = "Register a product";
    $("#product-submit").textContent = "+ Add product";
  }
  
  if (productForm) {
    // the same description can't be registered twice
    V.addRule(productForm, function () {
      var name = $("#p-desc").value.trim().toLowerCase();
      var dup = D.clientProducts.some(function (p) { return p.description.toLowerCase() === name; });
      return dup && name ? [{ el: $("#p-desc"), message: "You already have a product with this description" }] : [];
    });

    productForm.addEventListener("relay:valid", function (e) {
      var last = D.clientProducts.length ? Number(D.clientProducts[D.clientProducts.length - 1].ref.slice(2)) : 0;
      var p = {
        ref: "P-" + ("00" + (last + 1)).slice(-3),
        description: $("#p-desc").value.trim(),
        category: $("#p-cat").value,
        weight_kg: V.toNumber($("#p-weight").value),
        volume_m3: V.toNumber($("#p-vol").value),
        created_at: new Date().toLocaleDateString("pt-PT")
      };
      D.clientProducts.push(p);
      e.detail.message = "\"" + p.description + "\" registered as " + p.ref + ". You can now add it to your orders.";
      renderProducts();
      renderKpis();
    });
  }

  // pop-up "Edit product" (only for products not used in any order)
  var editDialog = $("#edit-product");
  var editForm = $("#edit-product-form");

  function openEditProduct(p) {
    editingRef = p.ref;
    // clean the errors left from the last time the pop-up was open
    $all(".form-alert", editForm).forEach(function (box) { box.remove(); });
    $all("input, select", editForm).forEach(function (el) { V.clearError(el); });
    $("[data-edit-sub]").textContent = p.ref + " · registered on " + p.created_at;
    $("#ep-desc").value = p.description;
    $("#ep-cat").value = p.category;
    $("#ep-weight").value = p.weight_kg;
    $("#ep-vol").value = p.volume_m3;
    openDialog(editDialog);
    $("#ep-desc").focus();
  }

  if (editForm) {
    V.addRule(editForm, function () {
      var name = $("#ep-desc").value.trim().toLowerCase();
      var dup = D.clientProducts.some(function (p) { return p.ref !== editingRef && p.description.toLowerCase() === name; });
      return dup && name ? [{ el: $("#ep-desc"), message: "You already have a product with this description" }] : [];
    });

    editForm.addEventListener("relay:valid", function (e) {
      var p = product(editingRef);
      p.description = $("#ep-desc").value.trim();
      p.category = $("#ep-cat").value;
      p.weight_kg = V.toNumber($("#ep-weight").value);
      p.volume_m3 = V.toNumber($("#ep-vol").value);
      e.detail.message = null;   // no message: the pop-up closes and the table shows the change
      closeDialog(editDialog);
      renderProducts();
      renderKpis();
    });

    editDialog.addEventListener("close", stopEditing);
  }

  // Edit / Delete buttons in the table
  if (productTable) {
    productTable.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit]");
      var del = e.target.closest("[data-delete]");
      if (edit && editForm) {
        openEditProduct(product(edit.getAttribute("data-edit")));
      }
      if (del) {
        var d = product(del.getAttribute("data-delete"));
        if (window.confirm("Delete \"" + d.description + "\" (" + d.ref + ")?")) {
          D.clientProducts.splice(D.clientProducts.indexOf(d), 1);
          renderProducts();
          renderKpis();
        }
      }
    });
  }
  
    function openDialog(dialog) {
    if (dialog.showModal) { dialog.showModal(); } else { dialog.setAttribute("open", ""); }
  }
  function closeDialog(dialog) {
    if (dialog.close) { dialog.close(); } else { dialog.removeAttribute("open"); }
  }
  $all("dialog.modal").forEach(function (dialog) {
    $all("[data-close]", dialog).forEach(function (btn) {
      btn.addEventListener("click", function () { closeDialog(dialog); });
    });
    // click on the dark background closes it too
    dialog.addEventListener("click", function (e) { if (e.target === dialog) { closeDialog(dialog); } });
  });

  var SIGNATURE_SVG = '<svg viewBox="0 0 200 80" aria-hidden="true"><path d="M10 55c15-30 25-35 30-20s-5 25 5 15 20-40 30-25-10 30 5 20 15-25 25-15 5 15 15 8 20-15 30-10 20 5 35-5" fill="none" stroke="#1f2937" stroke-width="2.5" stroke-linecap="round"/></svg>';

  var detailsDialog = $("#order-details");
  if (detailsDialog) {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-details]");
      if (!btn) { return; }
      var o = findOrder(btn.getAttribute("data-details"));
      if (!o) { return; }
      var t = totals(o);
      var cancelled = o.status === "cancelled";

      $("[data-details-sub]", detailsDialog).textContent = cancelled
        ? "Products, route and reason for a cancelled order."
        : "Products, route and proof of delivery of a completed order.";

      var items = o.items.map(function (it) {
        var p = product(it.ref);
        return '<li><span class="qty">' + it.qty + '×</span><span class="what"><strong>' + esc(p.description) +
          "</strong><small>" + esc(p.category) + " · " + p.ref + '</small></span><span class="meta">' +
          kg(it.qty * p.weight_kg) + " · " + m3(it.qty * p.volume_m3) + "</span></li>";
      }).join("");

      var ending = cancelled
        ? "<h4>Cancellation</h4><div class=\"cancel-box\"><strong>Delivery attempts limit reached (" + o.attempts.length + " of 2)</strong>" +
          o.attempts.map(function (a, i) { return "<p>Attempt " + (i + 1) + " · " + esc(a) + "</p>"; }).join("") +
          "<p>No proof of delivery — the order was not delivered.</p></div>"
        : "<h4>Proof of delivery (e-POD)</h4><div class=\"epod-box\"><div class=\"epod-thumb\">" +
          (o.epod === "photo" ? "Photo" : SIGNATURE_SVG) + "</div><div><strong>" +
          (o.epod === "photo" ? "Delivery photo" : "Digital signature") + "</strong><small>Submitted " + esc(o.closed_at) +
          " by " + esc(o.courier) + '</small><button type="button" class="btn-link text-13" data-expand>View full size</button></div></div>';

      $("[data-details-body]", detailsDialog).innerHTML =
        '<div class="oc-head"><h3>Order #' + o.id + "</h3>" + (cancelled
          ? '<span class="badge badge-red">✕ Cancelled</span>'
          : '<span class="badge badge-green">✓ Completed</span>') + "</div>" +
        steps(o) +
        '<dl class="detail-grid">' +
          detail("Origin", esc(o.origin.name) + " · " + esc(coords(o.origin))) +
          detail("Destination", esc(o.dest.name) + " · " + esc(coords(o.dest))) +
          detail("Courier", esc(o.courier || "—")) +
          detail("Vehicle", esc(o.vehicle || "—")) +
          detail("Ordered on", esc(o.created_at)) +
          detail(cancelled ? "Cancelled on" : "Delivered on", esc(o.closed_at)) +
        "</dl>" +
        "<div><h4>Products in this order</h4><ul class=\"item-list\">" + items +
        '<li class="total"><span>Total</span><span>' + totalsText(t) + "</span></li></ul></div>" +
        "<div>" + ending + "</div>";

      openDialog(detailsDialog);
    });

    detailsDialog.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-expand]");
      if (!btn) { return; }
      var box = btn.closest(".epod-box");
      btn.textContent = box.classList.toggle("expanded") ? "Show smaller" : "View full size";
    });
  }
  
  var trackDialog = $("#track-order");
  var trackMap = null;
  var trackLayers = null;
  var trackedOrder = null;
  var replyTimer = null;

  var VAN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/></svg>';

  function drawTrackMap(o) {
    var box = $(".track-map", trackDialog);
    if (!window.L) {
      box.classList.add("map-offline");
      box.textContent = "The map could not be loaded.";
      return;
    }
    if (!trackMap) {
      var asFile = window.location.protocol === "file:";
      trackMap = L.map(box, { scrollWheelZoom: false, zoomSnap: 0.25 });
      L.tileLayer(asFile
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: asFile ? 'Tiles &copy; <a href="https://www.esri.com">Esri</a>'
                            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(trackMap);
      trackLayers = L.layerGroup().addTo(trackMap);
    }
    trackLayers.clearLayers();
    var origin = [o.origin.lat, o.origin.lng];
    var dest = [o.dest.lat, o.dest.lng];
    var here = [o.lastLocation.lat, o.lastLocation.lng];

    L.polyline([origin, here], { color: "#2563eb", weight: 4 }).addTo(trackLayers);
    L.polyline([here, dest], { color: "#2563eb", weight: 4, opacity: 0.7, dashArray: "2 8" }).addTo(trackLayers);

    function dot(point, color, label) {
      L.circleMarker(point, { radius: 7, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label, { permanent: true, direction: "top", offset: [0, -8], className: "route-label" })
        .addTo(trackLayers);
    }
    dot(origin, "#2563eb", "Origin · " + o.origin.name);
    dot(dest, "#2563eb", "Destination");

    L.marker(here, {
      icon: L.divIcon({ className: "", html: '<span class="courier-pin">' + VAN_SVG + "</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: "Courier"
    }).bindTooltip(esc(o.courier) + " · " + esc(o.vehicle.replace(" · ", " ")) + "<br>" + esc(o.lastLocation.place) +
      "<br><small>Shared by the courier at " + o.lastLocation.at + "</small>",
      { permanent: true, direction: "top", offset: [0, -16], className: "route-label" }).addTo(trackLayers);

    setTimeout(function () {
      trackMap.invalidateSize();
      trackMap.fitBounds(L.latLngBounds([origin, dest, here]), { padding: [36, 36] });
    }, 50);
  }

  function setRequestBox(state, o) {
    var box = $("[data-request]", trackDialog);
    var btn = $("[data-request-btn]", trackDialog);
    box.classList.toggle("pending", state === "pending");
    if (state === "pending") {
      $("strong", box).textContent = "Request sent at " + o.requestedAt + " — waiting for " + o.courier;
      $("small", box).textContent = "The map updates when the courier replies.";
      btn.textContent = "Request pending…";
      btn.disabled = true;
    } else {
      $("strong", box).textContent = "Courier location shared at " + o.lastLocation.at;
      $("small", box).textContent = "The courier sends his latest position when you request it.";
      btn.textContent = "⌖ Request location";
      btn.disabled = false;
    }
  }

  if (trackDialog) {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-track]");
      if (!btn) { return; }
      var o = findOrder(btn.getAttribute("data-track"));
      if (!o || !o.lastLocation) { return; }
      trackedOrder = o;
      var t = totals(o);
      $("[data-track-title]", trackDialog).textContent = "Order #" + o.id;
      $("[data-track-steps]", trackDialog).innerHTML = steps(o);
      $("[data-track-details]", trackDialog).innerHTML =
        detail("Origin", esc(o.origin.name) + " · " + esc(coords(o.origin))) +
        detail("Destination", esc(o.dest.name) + " · " + esc(coords(o.dest))) +
        detail("Courier", esc(o.courier)) +
        detail("Vehicle", esc(o.vehicle)) +
        detail("Products", t.items + (t.items === 1 ? " item" : " items") + " · " + kg(t.kg)) +
        detail("Estimated arrival", esc(o.eta || "—"));
      setRequestBox(o.requestedAt ? "pending" : "shared", o);
      openDialog(trackDialog);
      drawTrackMap(o);
    });

    $("[data-request-btn]", trackDialog).addEventListener("click", function () {
      var o = trackedOrder;
      if (!o) { return; }
      o.requestedAt = nowTime();
      setRequestBox("pending", o);

      clearTimeout(replyTimer);
      replyTimer = setTimeout(function () {
        o.lastLocation = {
          lat: o.lastLocation.lat + (o.dest.lat - o.lastLocation.lat) * 0.4,
          lng: o.lastLocation.lng + (o.dest.lng - o.lastLocation.lng) * 0.4,
          place: "Rua de Gonçalo Cristóvão, Porto",
          at: nowTime()
        };
        o.updated = "Today, " + o.lastLocation.at;
        delete o.requestedAt;
        renderActive();
        if (trackedOrder === o && trackDialog.open) {
          setRequestBox("shared", o);
          drawTrackMap(o);
        }
      }, 6000);
    });
  } 
  
  var profileForm = $("#profile-form");
  if (profileForm) {
    profileForm.addEventListener("relay:valid", function () {
      var name = $("#name").value.trim();
      var user = $("#username").value.trim();
      $all("[data-client-name]").forEach(function (el) { el.textContent = name; });
      $all("[data-client-user]").forEach(function (el) { el.textContent = "@" + user; });
      // clear the password fields after a successful save
      ["#pw-current", "#pw-new", "#pw-confirm"].forEach(function (id) { $(id).value = ""; });
    });
  }

  renderActive();
  renderHistory();
  renderKpis();
  renderProducts();
})();



