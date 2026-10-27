/* =========================================================
   Relay — page interactions (prototype, no backend)
   ---------------------------------------------------------
   1. File upload boxes show the chosen file name
   2. e-POD digital signature drawn on a <canvas>
   3. Vehicles: document alerts (3-day window), blocked vehicles,
      active vehicle selector and load/capacity checks
   4. Courier order status: Initiated → In Progress → Completed / Cancelled
   5. Available orders: single active task, route consolidation, capacity
   6. Client: products in an order (add / remove) and new saved products
   7. Edit profile: password change rules
   8. Courier: register a vehicle / update a certificate
   9. Client: view the proof of delivery (e-POD) of past orders
  10. Dashboard charts and bars drawn from data
  11. Live counters (KPIs, alerts pill)
  12. Staff / Admin: validate, approve, reject, disapprove
  13. Register: pending status for courier and staff accounts
   Nothing is saved: reloading the page brings back the sample data.
   Needs data.js and validation.js to be loaded first.
   ========================================================= */
(function () {
  "use strict";

  var V = window.RelayValidation;
  if (!V) { return; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function today() {
    var d = new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  // 4.50 -> "4.5", 2 -> "2"
  function fmt(n, decimals) {
    return String(parseFloat(Number(n).toFixed(decimals)));
  }

  /* =======================================================
     1. File upload boxes
     ======================================================= */
  $all(".dropzone input[type=file]").forEach(function (input) {
    var zone = input.closest(".dropzone");
    var text = $(".dz-text", zone);
    if (!text) { return; }
    var original = text.innerHTML;

    function update() {
      if (input.files.length) {
        zone.classList.add("done");
        text.innerHTML = "<strong>✓ " + escapeHtml(input.files[0].name) + "</strong><small>Click to replace</small>";
      } else if (!input.hasAttribute("data-has-file")) {
        zone.classList.remove("done");
        text.innerHTML = original;
      }
    }
    input.addEventListener("change", update);
    if (input.form) {
      input.form.addEventListener("reset", function () { setTimeout(function () { text.innerHTML = original; update(); }, 0); });
    }

    // Drag and drop a file onto the box
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragleave", function () { zone.classList.remove("dragging"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("dragging");
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });

  /* =======================================================
     2. e-POD signature canvas
     ======================================================= */
  var signature = (function () {
    var canvas = $("#signature");
    if (!canvas) { return null; }
    var ctx = canvas.getContext("2d");
    var wrap = canvas.parentElement;
    var drawing = false;
    var signed = false;
    var last = null;

    function resize() {
      // match the canvas pixels to its size on screen (sharp lines on any screen)
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var copy = signed ? canvas.toDataURL() : null;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
      if (copy) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
        img.src = copy;
      }
    }

    function point(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener("pointerdown", function (e) {
      drawing = true;
      last = point(e);
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#111827";
      ctx.fill();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) { return; }
      var p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      if (!signed) {
        signed = true;
        wrap.classList.add("signed");
        V.clearError(canvas);
      }
    });
    function stop() { drawing = false; }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      signed = false;
      wrap.classList.remove("signed");
    }

    var clearBtn = $("#clear-signature");
    if (clearBtn) { clearBtn.addEventListener("click", clear); }
    window.addEventListener("resize", resize);
    resize();

    return { isSigned: function () { return signed; }, clear: clear };
  })();

  /* =======================================================
     3. Vehicles: documents, alerts and capacity
     -------------------------------------------------------
     Uses the sample data in data.js (RelayData).
     Rules (statement + project forum):
       - a vehicle is used only after Staff approves it;
       - Staff AND couriers are alerted when a document is
         expired or expires within ALERT_WINDOW_DAYS (3 days);
       - Staff is alerted when a new certificate is uploaded;
       - an expired document blocks the vehicle, and Staff can
         "disapprove" it if the courier doesn't update it in time;
       - the load of an order must fit the vehicle (max weight
         and max volume) — "physical load constraints".
     ======================================================= */
  var D = window.RelayData;
  var DOCS = ["insurance", "inspection"];
  var DOC_NAME = { insurance: "Insurance", inspection: "Inspection" };

  function vehicleLabel(v) { return v.type + " " + v.license_plate; }
  function capacityText(v) { return v.max_weight_kg + " kg • " + v.max_vol_m3 + " m³"; }
  function findVehicle(plate) {
    return D ? D.vehicles.filter(function (v) { return v.license_plate === plate; })[0] || null : null;
  }

  // Alerts for a list of vehicles, most urgent first
  function buildAlerts(list, forCourier) {
    var out = [];
    list.forEach(function (v) {
      if (v.status === "rejected" || v.status === "disapproved") { return; }
      DOCS.forEach(function (doc) {
        var date = v[doc + "_expiry_date"];
        var st = D.docStatus(date);
        if (st.code === "expired") {
          out.push({ level: "red", rank: 0, badge: "! Expired", vehicle: v, doc: doc,
            title: forCourier
              ? "Your " + vehicleLabel(v) + " — " + DOC_NAME[doc].toLowerCase() + " certificate expired"
              : DOC_NAME[doc] + " expired — " + vehicleLabel(v) + " (" + v.courier + ")",
            text: "Expired on " + D.formatDate(date) + " • vehicle blocked from new routes" +
              (forCourier ? ". Upload the renewed certificate." : ". Staff can disapprove it.") });
        } else if (st.code === "expiring") {
          out.push({ level: "amber", rank: 1, badge: "Expiring", vehicle: v, doc: doc,
            title: (forCourier ? "Your " + vehicleLabel(v) + " — " + DOC_NAME[doc].toLowerCase()
                               : DOC_NAME[doc] + " — " + vehicleLabel(v) + " (" + v.courier + ")") +
              ": " + st.label.toLowerCase(),
            text: "Deadline: " + D.formatDate(date) + " • a new certificate must be uploaded before it expires" });
        }
      });
      if (v.updated && !forCourier) {
        out.push({ level: "blue", rank: 2, badge: "New", vehicle: v, doc: v.updated.doc,
          title: "New " + v.updated.doc + " certificate uploaded — " + vehicleLabel(v),
          text: "Uploaded " + v.updated.at + " by " + v.courier + " • review it before approving" });
      }
    });
    return out.sort(function (a, b) { return a.rank - b.rank; });
  }

  function alertRow(a, actionHtml) {
    return '<div class="alert-row ' + a.level + '">' +
      '<span class="badge badge-' + a.level + '">' + a.badge + "</span>" +
      "<div><strong>" + escapeHtml(a.title) + "</strong><small>" + escapeHtml(a.text) + "</small></div>" +
      actionHtml + "</div>";
  }

  function docBadge(v, doc) {
    var date = v[doc + "_expiry_date"];
    var st = D.docStatus(date);
    return '<span class="badge ' + st.badge + '" title="Expiry date: ' + D.formatDate(date) + '">' + st.label + "</span>";
  }

  function docLinks(v) {
    return '<a href="docs/sample-certificate.pdf" target="_blank" class="file" title="' + v.insurance_expiry_doc + '">Insurance.pdf</a> • ' +
           '<a href="docs/sample-certificate.pdf" target="_blank" class="file" title="' + v.inspection_expiry_doc + '">Inspection.pdf</a>';
  }

  /* ---------- 3a. Staff: alerts, pending vehicles, fleet monitoring ---------- */
  function renderStaff() {
    var alertsBox = $('[data-render="staff-alerts"]');
    if (alertsBox) {
      var alerts = buildAlerts(D.vehicles, false);
      alertsBox.innerHTML = alerts.length ? alerts.map(function (a) {
        var action = a.level === "red"
          ? '<a href="#fleet" class="btn btn-sm btn-danger">Review vehicle</a>'
          : a.level === "amber"
            ? '<button type="button" class="btn btn-sm btn-amber" data-done-text="✓ Courier notified">Notify courier</button>'
            : '<a href="#vehicles" class="btn btn-sm btn-outline">Review</a>';
        return alertRow(a, action);
      }).join("") : '<p class="text-muted text-13">No document alerts. All approved vehicles have valid documents.</p>';
    }

    var pending = $('[data-render="pending-vehicles"]');
    if (pending) {
      var rows = D.vehicles.filter(function (v) { return v.status === "pending"; });
      pending.innerHTML = rows.map(function (v) {
        var expired = D.vehicleDocState(v) === "expired";
        return '<tr data-pending data-name="' + vehicleLabel(v) + '"><td>' + v.license_plate + "</td><td>" + v.type + "</td><td>" + escapeHtml(v.courier) +
          "</td><td>" + capacityText(v) + "</td><td>" + docBadge(v, "insurance") + "</td><td>" + docBadge(v, "inspection") +
          "</td><td>" + docLinks(v) + '</td><td><div class="actions">' +
          '<button type="button" class="btn btn-sm btn-primary" data-decision="Approved" data-plate="' + v.license_plate + '"' +
          (expired ? ' disabled title="A vehicle with expired documents cannot be approved"' : "") + ">✓ Approve</button>" +
          '<button type="button" class="btn btn-sm btn-danger" data-decision="Rejected" data-plate="' + v.license_plate + '">✕ Reject</button></div></td></tr>';
      }).join("") || '<tr><td colspan="8" class="text-muted">No vehicles waiting for approval.</td></tr>';
    }

    var fleet = $('[data-render="fleet-monitor"]');
    if (fleet) {
      var watched = D.vehicles.filter(function (v) { return v.status === "approved" && D.vehicleDocState(v) !== "valid"; });
      fleet.innerHTML = watched.map(function (v) {
        var expired = D.vehicleDocState(v) === "expired";
        var action = expired
          ? '<button type="button" class="btn btn-sm btn-danger" data-decision="Disapproved" data-plate="' + v.license_plate + '">✕ Disapprove</button>'
          : '<button type="button" class="btn btn-sm btn-amber" data-done-text="✓ Courier notified">Notify courier</button>';
        return '<tr data-name="' + vehicleLabel(v) + '"><td>' + v.license_plate + "</td><td>" + v.type + "</td><td>" + escapeHtml(v.courier) +
          "</td><td>" + docBadge(v, "insurance") + "</td><td>" + docBadge(v, "inspection") + "</td><td>" +
          (expired ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Approved</span>') +
          '</td><td><div class="actions">' + action + "</div></td></tr>";
      }).join("") || '<tr><td colspan="7" class="text-muted">Every approved vehicle has valid documents.</td></tr>';
    }
  }

  /* ---------- 3b. Courier: alerts, vehicle cards, update form ---------- */
  function courierVehicles(name) {
    return D.vehicles.filter(function (v) { return v.courier === name; });
  }

  function vehicleStatusBadge(v) {
    if (v.status === "pending") { return '<span class="badge badge-amber">Pending Staff approval</span>'; }
    if (v.status === "rejected") { return '<span class="badge badge-red">Rejected by Staff</span>'; }
    if (v.status === "disapproved") { return '<span class="badge badge-red">Disapproved by Staff</span>'; }
    var state = D.vehicleDocState(v);
    if (state === "expired") { return '<span class="badge badge-red">Blocked • document expired</span>'; }
    if (state === "expiring") { return '<span class="badge badge-amber">Approved • document expiring</span>'; }
    return '<span class="badge badge-green">Approved</span>';
  }

  function renderCourier() {
    $all('[data-render="courier-alerts"]').forEach(function (box) {
      var alerts = buildAlerts(courierVehicles(box.getAttribute("data-courier")), true);
      box.innerHTML = alerts.map(function (a) {
        return alertRow(a, '<a href="courier-vehicles.html#update-docs" class="btn btn-sm ' +
          (a.level === "red" ? "btn-danger" : "btn-amber") + '">Upload new certificate</a>');
      }).join("");
    });

    $all('[data-render="courier-vehicles"]').forEach(function (box) {
      box.innerHTML = courierVehicles(box.getAttribute("data-courier")).map(function (v) {
        var state = D.vehicleDocState(v);
        var cls = v.status === "approved" && state === "expired" ? " is-blocked" : state === "expiring" ? " is-warning" : "";
        return '<article class="vehicle-tile' + cls + '"><strong>' + v.type + " • " + escapeHtml(v.model) + "</strong>" +
          "<small>" + v.license_plate + " • " + capacityText(v) + "</small>" + vehicleStatusBadge(v) +
          '<span class="docs"><span>Insurance until ' + D.formatDate(v.insurance_expiry_date) + " " + docBadge(v, "insurance") + "</span>" +
          "<span>Inspection until " + D.formatDate(v.inspection_expiry_date) + " " + docBadge(v, "inspection") + "</span></span></article>";
      }).join("");
    });

    $all('[data-render="courier-vehicle-options"]').forEach(function (select) {
      var keep = select.value;
      select.innerHTML = '<option value="">Choose a vehicle</option>' +
        courierVehicles(select.getAttribute("data-courier")).map(function (v) {
          return '<option value="' + v.license_plate + '">' + vehicleLabel(v) + "</option>";
        }).join("");
      select.value = keep;
    });
  }

  /* ---------- 3c. Active vehicle selector + load check (courier) ---------- */
  var vehicleSelect = $("#vehicle");
  function fillVehicleSelect() {
    if (!vehicleSelect || !D) { return; }
    var who = vehicleSelect.getAttribute("data-courier");
    var keep = vehicleSelect.value;
    vehicleSelect.innerHTML = "";
    var firstUsable = "";
    courierVehicles(who).forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.license_plate;
      opt.textContent = vehicleLabel(v) + " (" + capacityText(v) + ")";
      if (!D.isUsable(v)) {
        opt.disabled = true;
        opt.textContent += v.status === "pending" ? " — pending Staff approval" : " — blocked: document expired";
      } else if (!firstUsable) {
        firstUsable = v.license_plate;
      }
      vehicleSelect.appendChild(opt);
    });
    var keepOk = keep && findVehicle(keep) && D.isUsable(findVehicle(keep));
    vehicleSelect.value = keepOk ? keep : firstUsable;
  }

  function selectedVehicle() {
    return vehicleSelect && vehicleSelect.value ? findVehicle(vehicleSelect.value) : null;
  }

  // Does a load (kg, m³) fit the selected vehicle?
  function checkLoad(kg, m3) {
    var v = selectedVehicle();
    if (!v) { return { ok: false, message: "Choose an approved vehicle with valid documents first." }; }
    if (kg > v.max_weight_kg || m3 > v.max_vol_m3) {
      return { ok: false, message: "Load of " + fmt(kg, 2) + " kg • " + m3.toFixed(3) + " m³ exceeds the capacity of " +
        vehicleLabel(v) + " (" + capacityText(v) + "). Choose a bigger vehicle." };
    }
    return { ok: true, vehicle: v };
  }

  function showCapacity() {
    var box = $("[data-capacity]");
    if (!box) { return; }
    var kg = Number(box.getAttribute("data-weight"));
    var m3 = Number(box.getAttribute("data-volume"));
    var v = selectedVehicle();
    var meter = $(".meter", box);
    var text = $("[data-capacity-text]", box);
    if (!v) { text.textContent = "No usable vehicle selected."; meter.classList.add("over"); return; }
    var pct = Math.max(kg / v.max_weight_kg, m3 / v.max_vol_m3) * 100;
    meter.classList.toggle("over", pct > 100);
    $("span", meter).style.width = Math.min(pct, 100) + "%";   // CSS through the DOM (JS/DOM lesson)
    text.textContent = pct > 100
      ? "Order load exceeds " + vehicleLabel(v) + " capacity (" + capacityText(v) + ")."
      : "Order load uses " + Math.round(pct) + "% of " + vehicleLabel(v) + " capacity (" + capacityText(v) + ").";
  }

  if (D) {
    renderStaff();
    renderCourier();
    fillVehicleSelect();
    showCapacity();
    if (vehicleSelect) { vehicleSelect.addEventListener("change", showCapacity); }
  }

  /* =======================================================
     4. Courier order status (sequential)
     Initiated → In Progress → Completed (with e-POD) / Cancelled
     ======================================================= */
  var courier = (function () {
    var flow = $("[data-status-flow]");
    if (!flow) { return null; }

    var orderNo = flow.getAttribute("data-order");
    var state = "initiated";          // initiated → progress → completed | cancelled
    var note = $("[data-status-note]");
    var buttons = {
      start: $('[data-status-action="start"]'),
      complete: $('[data-status-action="complete"]'),
      cancel: $('[data-status-action="cancel"]')
    };
    var steps = {
      initiated: $('[data-step="initiated"]', flow),
      progress: $('[data-step="progress"]', flow),
      final: $('[data-step="final"]', flow)
    };

    var NOTES = {
      initiated: "Order accepted. Press <strong>Start delivery</strong> when you collect the products.",
      progress: "Delivery in progress. To complete it, submit the proof of delivery (e-POD) below.",
      completed: "Order #" + orderNo + " completed with e-POD. It now appears in your completed orders and in the client's order history.",
      cancelled: "Order #" + orderNo + " cancelled and returned to the available orders list (attempt 2)."
    };

    function setStep(el, kind, label) {
      el.className = "badge badge-" + kind;
      var mark = kind === "green" ? "✓ " : kind === "red" ? "✕ " : "";
      el.innerHTML = (kind === "blue" ? '<span class="dot"></span>' : mark) + label;
    }

    function render() {
      var order = ["initiated", "progress", "final"];
      var current = state === "completed" || state === "cancelled" ? "final" : state;
      order.forEach(function (key) {
        var label = key === "initiated" ? "Initiated" : key === "progress" ? "In Progress" : "Completed / Cancelled";
        var pos = order.indexOf(key);
        var cur = order.indexOf(current);
        if (key === "final" && state === "completed") { setStep(steps.final, "green", "Completed"); return; }
        if (key === "final" && state === "cancelled") { setStep(steps.final, "red", "Cancelled"); return; }
        if (pos < cur) { setStep(steps[key], "green", label); }
        else if (pos === cur) { setStep(steps[key], "blue", label); }
        else { setStep(steps[key], "gray", label); }
      });

      buttons.start.disabled = state !== "initiated";
      buttons.complete.disabled = state !== "progress";
      buttons.cancel.disabled = state === "completed" || state === "cancelled";
      // the vehicle can't change while the delivery is on the road
      if (vehicleSelect) { vehicleSelect.disabled = state === "progress"; }
      if (note) {
        note.innerHTML = NOTES[state];
        note.className = "note " + (state === "completed" ? "note-green" : state === "cancelled" ? "note-amber" : state === "progress" ? "note-blue" : "note-amber");
      }
    }

    buttons.start.addEventListener("click", function () {
      // the order load must fit the active vehicle before leaving
      var check = checkLoad(Number(flow.getAttribute("data-weight")), Number(flow.getAttribute("data-volume")));
      if (!check.ok) {
        note.innerHTML = "<strong>Can't start:</strong> " + escapeHtml(check.message);
        note.className = "note note-amber";
        return;
      }
      state = "progress";
      render();
    });
    buttons.complete.addEventListener("click", function () {
      var form = $("#epod");
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.classList.add("highlight");
        setTimeout(function () { form.classList.remove("highlight"); }, 1500);
      }
    });
    buttons.cancel.addEventListener("click", function () {
      state = "cancelled";
      render();
      // statement: "Upon cancellation, the order returns to the list of orders"
      var body = $("#available-body");
      if (body) {
        body.insertAdjacentHTML("afterbegin",
          '<tr class="row-new" data-weight="' + flow.getAttribute("data-weight") + '" data-volume="' + flow.getAttribute("data-volume") + '">' +
          '<td><input type="checkbox" name="orders" value="' + orderNo + '" aria-label="Select order ' + orderNo +
          '" class="accent-blue"></td><td>#' + orderNo + " <small class=\"text-muted\">(attempt 2)</small></td><td>FEUP → Av. dos Aliados</td><td>2 items</td><td>4.5 kg • 0.030 m³</td></tr>");
      }
    });

    render();

    return {
      state: function () { return state; },
      complete: function (proof) {
        state = "completed";
        render();
        var body = $("#completed-body");
        var v = selectedVehicle();
        if (body) {
          body.insertAdjacentHTML("afterbegin",
            '<tr class="row-new"><td>#' + orderNo + "</td><td>" + today() + "</td><td>Av. dos Aliados, Porto</td><td>" +
            escapeHtml(v ? v.type + " • " + v.license_plate : "—") + "</td><td>" + proof + '</td><td><span class="badge badge-green">Completed</span></td></tr>');
        }
      }
    };
  })();

  // e-POD form: needs In Progress status and a signature or a photo
  var epodForm = $("#epod");
  if (epodForm) {
    var photo = $("#epod-photo");
    V.addRule(epodForm, function () {
      var problems = [];
      if (courier && courier.state() !== "progress") {
        problems.push({ message: courier.state() === "initiated"
          ? "Start the delivery first — the order must be In Progress to be completed."
          : "This order is already closed." });
      }
      var hasSignature = signature && signature.isSigned();
      var hasPhoto = photo && photo.files.length > 0;
      if (!hasSignature && !hasPhoto) {
        problems.push({ el: $("#signature"), message: "Sign here or upload a delivery photo" });
      }
      return problems;
    });
    if (photo) {
      photo.addEventListener("change", function () { V.clearError($("#signature")); });
    }
    epodForm.addEventListener("relay:valid", function (e) {
      var hasSignature = signature && signature.isSigned();
      var flow = $("[data-status-flow]");
      if (courier) { courier.complete(hasSignature ? "Signature" : "Photo"); }
      e.detail.message = "Proof of delivery submitted. Order #" + (flow ? flow.getAttribute("data-order") : "") + " is now Completed.";
      if (signature) { signature.clear(); }
    });
  }

  /* =======================================================
     5. Available orders (courier)
     single active task, consolidation, vehicle capacity
     ======================================================= */
  var availableForm = $("#available");
  if (availableForm) {
    function checkedRows() {
      return $all('input[name="orders"]:checked', availableForm).map(function (c) { return c.closest("tr"); });
    }
    V.addRule(availableForm, function (submitter) {
      var action = submitter ? submitter.value : "accept";
      var rows = checkedRows();
      var active = courier && (courier.state() === "initiated" || courier.state() === "progress");
      if (!rows.length) { return [{ message: "Select at least one order." }]; }
      if (active) {
        return [{ message: "Single active task: you already have an active order. Complete or cancel it before taking new orders." }];
      }
      if (action === "accept" && rows.length > 1) {
        return [{ message: "You can only accept one order at a time. Select one order, or use “Consolidate selected into a route”." }];
      }
      if (action === "consolidate" && rows.length < 2) {
        return [{ message: "Select at least two orders to consolidate them into one route." }];
      }
      var kg = 0, m3 = 0;
      rows.forEach(function (r) { kg += Number(r.getAttribute("data-weight")); m3 += Number(r.getAttribute("data-volume")); });
      var check = checkLoad(kg, m3);
      return check.ok ? [] : [{ message: check.message }];
    });
    availableForm.addEventListener("relay:valid", function (e) {
      var picked = checkedRows().map(function (r) { return "#" + $("input", r).value; });
      var action = e.detail.submitter ? e.detail.submitter.value : "accept";
      var v = selectedVehicle();
      checkedRows().forEach(function (r) { r.remove(); });
      e.detail.message = (action === "consolidate"
        ? "Orders " + picked.join(", ") + " consolidated into one route"
        : "Order " + picked[0] + " accepted as your active order") +
        (v ? " with " + vehicleLabel(v) + "." : ".");
    });
  }

  /* =======================================================
     6. Client: products in an order
     ======================================================= */
  var orderForm = $("#order-form");
  if (orderForm) {
    var lines = $("[data-product-lines]", orderForm);
    var summary = $("[data-products-summary]", orderForm);
    var select = $("#saved");
    var qty = $("#qty");
    var initialLines = lines.innerHTML;

    function bindRemove(line) {
      $(".remove", line).addEventListener("click", function () { line.remove(); updateSummary(); });
    }

    function updateSummary() {
      var items = 0, kg = 0, m3 = 0;
      $all(".product-line", lines).forEach(function (line) {
        var q = Number(line.getAttribute("data-qty"));
        items += q;
        kg += q * Number(line.getAttribute("data-weight"));
        m3 += q * Number(line.getAttribute("data-volume"));
      });
      summary.textContent = items
        ? items + (items === 1 ? " item" : " items") + " • " + fmt(kg, 2) + " kg • " + m3.toFixed(3) + " m³"
        : "No products yet";
      if (items) { V.clearError(select); }
    }

    $all(".product-line", lines).forEach(bindRemove);

    $("#add-product-btn").addEventListener("click", function () {
      V.clearError(select);
      V.clearError(qty);
      var option = select.options[select.selectedIndex];
      var q = V.toNumber(qty.value);
      var ok = true;
      if (!select.value) { V.showError(select, "Choose a saved product first"); ok = false; }
      if (!(q >= 1) || Math.floor(q) !== q) { V.showError(qty, "Quantity must be a whole number of at least 1"); ok = false; }
      if (!ok) { return; }

      var name = select.value;
      var w = Number(option.getAttribute("data-weight"));
      var v = Number(option.getAttribute("data-volume"));
      var existing = $all(".product-line", lines).filter(function (l) { return l.getAttribute("data-name") === name; })[0];
      if (existing) {
        q += Number(existing.getAttribute("data-qty"));
        existing.remove();
      }
      var line = document.createElement("div");
      line.className = "product-line";
      line.setAttribute("data-name", name);
      line.setAttribute("data-qty", q);
      line.setAttribute("data-weight", w);
      line.setAttribute("data-volume", v);
      line.innerHTML = '<span class="qty">' + q + 'x</span><strong style="font-weight:500">' + escapeHtml(name) +
        '</strong><span class="meta">' + fmt(q * w, 2) + " kg • " + (q * v).toFixed(3) + " m³</span>" +
        '<button type="button" class="remove" aria-label="Remove ' + escapeHtml(name) + '">×</button>';
      lines.appendChild(line);
      bindRemove(line);
      select.value = "";
      qty.value = 1;
      updateSummary();
    });

    V.addRule(orderForm, function () {
      return $all(".product-line", lines).length
        ? []
        : [{ el: select, message: "Add at least one product to the order" }];
    });

    orderForm.addEventListener("reset", function () {
      setTimeout(function () {
        lines.innerHTML = initialLines;
        $all(".product-line", lines).forEach(bindRemove);
        updateSummary();
      }, 0);
    });
  }

  // New saved product: add it to the order's product list / products table
  var productForm = $("#product-form");
  if (productForm) {
    productForm.addEventListener("relay:valid", function () {
      var name = $("#p-desc").value.trim();
      var cat = $("#p-cat").value;
      var w = V.toNumber($("#p-weight").value);
      var v = V.toNumber($("#p-vol").value);

      var savedSelect = $("#saved");
      if (savedSelect) {
        var opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name + " — " + fmt(w, 2) + " kg";
        opt.setAttribute("data-weight", w);
        opt.setAttribute("data-volume", v);
        savedSelect.appendChild(opt);
      }
      var table = $("#product-table");
      if (table) {
        table.insertAdjacentHTML("beforeend",
          '<tr class="row-new"><td>' + escapeHtml(name) + "</td><td>" + escapeHtml(cat) + "</td><td>" + fmt(w, 2) +
          " kg</td><td>" + v.toFixed(3) + " m³</td><td>0 orders</td>" +
          '<td><div class="actions"><button type="button" class="btn btn-sm btn-outline">Edit</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-remove-row>✕ Remove</button></div></td></tr>');
      }
    });
  }

  // Remove buttons in tables
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-remove-row]");
    if (btn) { btn.closest("tr").remove(); }
  });

  /* =======================================================
     7. Edit profile: changing the password is optional
     ======================================================= */
  var profileForm = $("#profile-form");
  if (profileForm && $("#pw-new")) {
    V.addRule(profileForm, function () {
      var cur = $("#pw-current"), nw = $("#pw-new"), conf = $("#pw-confirm");
      if (!cur.value && !nw.value && !conf.value) { return []; }   // keep current password
      var problems = [];
      if (!cur.value) { problems.push({ el: cur, message: "Enter your current password to change it" }); }
      if (!nw.value) { problems.push({ el: nw, message: "Enter the new password" }); }
      else if (nw.value.length >= 8 && !/\d/.test(nw.value)) {
        problems.push({ el: nw, message: "The new password needs at least one number" });
      }
      if (!conf.value) { problems.push({ el: conf, message: "Confirm the new password" }); }
      return problems;
    });
  }

  /* =======================================================
     8. Courier vehicle forms
     - register a new vehicle (goes to Staff as "pending")
     - update a certificate (Staff is alerted to review it)
     ======================================================= */
  var vehicleForm = $("#vehicle-form");
  if (vehicleForm && D) {
    // capacity can't exceed the Vehicle_Type limits (Bike, Moto, Van, Truck)
    V.addRule(vehicleForm, function () {
      var type = D.vehicleTypes.filter(function (t) { return t.type_name === $("#type").value; })[0];
      var problems = [];
      if (!type) { return problems; }
      var kg = V.toNumber($("#max-weight").value);
      var m3 = V.toNumber($("#max-volume").value);
      if (kg > type.max_weight_kg) {
        problems.push({ el: $("#max-weight"), message: "A " + type.type_name + " carries at most " + type.max_weight_kg + " kg" });
      }
      if (m3 > type.max_vol_m3) {
        problems.push({ el: $("#max-volume"), message: "A " + type.type_name + " holds at most " + type.max_vol_m3 + " m³" });
      }
      if (findVehicle($("#plate").value.trim().toUpperCase())) {
        problems.push({ el: $("#plate"), message: "This licence plate is already registered" });
      }
      return problems;
    });
    vehicleForm.addEventListener("relay:valid", function (e) {
      var plate = $("#plate").value.trim().toUpperCase();
      D.vehicles.push({
        license_plate: plate, type: $("#type").value, model: $("#model").value.trim(),
        courier: vehicleForm.getAttribute("data-courier"),
        max_weight_kg: V.toNumber($("#max-weight").value), max_vol_m3: V.toNumber($("#max-volume").value),
        status: "pending",
        insurance_expiry_date: new Date($("#ins-date").value + "T00:00:00"),
        inspection_expiry_date: new Date($("#insp-date").value + "T00:00:00"),
        insurance_expiry_doc: "insurance.pdf", inspection_expiry_doc: "inspection.pdf"
      });
      renderCourier();
      fillVehicleSelect();
      e.detail.message = "Vehicle " + plate + " submitted. It stays \"Pending Staff approval\" until Staff checks its insurance and inspection certificates.";
    });
  }

  var updateForm = $("#update-docs");
  if (updateForm && D) {
    updateForm.addEventListener("relay:valid", function (e) {
      var v = findVehicle($("#upd-vehicle").value);
      var doc = $("#upd-doc").value;
      if (v) {
        v[doc + "_expiry_date"] = new Date($("#upd-date").value + "T00:00:00");
        v.updated = { doc: doc, at: "today" };
        renderCourier();
        fillVehicleSelect();
        updateCounters();
      }
      e.detail.message = DOC_NAME[doc] + " certificate of " + (v ? vehicleLabel(v) : "the vehicle") +
        " updated. Staff has been alerted to review the new document.";
    });
  }

  /* =======================================================
     9. Client: view the proof of delivery (e-POD)
     Forum (Proof of delivery, 30/09): the POD isn't checked;
     the client sees the POD of each order in the order history.
     ======================================================= */
  var epodDialog = $("#epod-viewer");
  if (epodDialog) {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-epod]");
      if (!btn) { return; }
      var kind = btn.getAttribute("data-epod");
      $("[data-epod-order]", epodDialog).textContent = btn.getAttribute("data-order");
      $("[data-epod-meta]", epodDialog).textContent = (kind === "signature" ? "Digital signature" : "Delivery photo") +
        " submitted by " + btn.getAttribute("data-courier") + " on " + btn.getAttribute("data-date") + ".";
      $all("[data-epod-figure]", epodDialog).forEach(function (fig) {
        fig.hidden = fig.getAttribute("data-epod-figure") !== kind;
      });
      if (epodDialog.showModal) { epodDialog.showModal(); } else { epodDialog.setAttribute("open", ""); }
    });
    $("[data-close]", epodDialog).addEventListener("click", function () {
      if (epodDialog.close) { epodDialog.close(); } else { epodDialog.removeAttribute("open"); }
    });
  }

  /* =======================================================
     10. Charts and bars sized from data (Admin dashboard, Home)
     element.style.height / width — "CSS e DOM" in the JS/DOM lesson
     ======================================================= */
  function drawBars(box, series) {
    var max = Math.max.apply(null, series.values);
    box.innerHTML = series.values.map(function (value, i) {
      var top = value === max ? " orange" : "";
      return '<div class="bar"><span class="num">' + value + '</span><span class="fill' + top + '" data-h="' +
        (value / max * 100) + '"></span><span class="day">' + series.labels[i] + "</span></div>";
    }).join("");
    box.setAttribute("aria-label", series.title + ": " + series.labels.map(function (l, i) { return l + " " + series.values[i]; }).join(", "));
    $all(".fill", box).forEach(function (f) { f.style.height = f.getAttribute("data-h") + "%"; });
  }

  var chart = $('[data-chart="deliveries"]');
  var period = $("#period");
  if (chart && D) {
    var chartTitle = $("[data-chart-title]");
    var redraw = function () {
      var series = D.deliveries[period ? period.value : "7d"];
      drawBars(chart, series);
      if (chartTitle) { chartTitle.textContent = series.title; }
    };
    if (period) { period.addEventListener("change", redraw); }
    redraw();
  }

  // Document compliance of the approved fleet (Admin dashboard)
  var compliance = $('[data-render="compliance"]');
  if (compliance && D) {
    var counts = { valid: 0, expiring: 0, expired: 0 };
    D.vehicles.forEach(function (v) { if (v.status === "approved") { counts[D.vehicleDocState(v)] += 1; } });
    var total = counts.valid + counts.expiring + counts.expired;
    compliance.innerHTML =
      '<li>Valid<span class="track"><span class="fill" data-pct="' + (counts.valid / total * 100) + '"></span>' + counts.valid + "</span></li>" +
      '<li>Expiring<span class="track"><span class="fill fill-amber" data-pct="' + (counts.expiring / total * 100) + '"></span>' + counts.expiring + "</span></li>" +
      '<li>Expired<span class="track"><span class="fill fill-red" data-pct="' + (counts.expired / total * 100) + '"></span>' + counts.expired + "</span></li>";
  }

  // any bar with data-pct gets its width from the value
  $all("[data-pct]").forEach(function (el) { el.style.width = el.getAttribute("data-pct") + "%"; });

  /* =======================================================
     11. Live counters (KPI cards and the alerts pill)
     <p data-count="css selector"> shows how many elements match
     ======================================================= */
  function updateCounters() {
    $all("[data-count]").forEach(function (el) {
      var n = document.querySelectorAll(el.getAttribute("data-count")).length;
      var unit = el.getAttribute("data-unit");
      el.textContent = unit ? n + " " + unit + (n === 1 ? "" : "s") : n;
    });
    // alerts pill in the top bar: "staff" = whole fleet, otherwise a courier's name
    if (D) {
      $all("[data-alerts-for]").forEach(function (el) {
        var who = el.getAttribute("data-alerts-for");
        var n = buildAlerts(who === "staff" ? D.vehicles : courierVehicles(who), who !== "staff").length;
        el.textContent = n + " alert" + (n === 1 ? "" : "s");
      });
    }
  }

  /* =======================================================
     12. Staff / Admin decisions
     validate / approve / reject couriers, staff and vehicles;
     disapprove a vehicle whose documents expired
     ======================================================= */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-decision]");
    if (btn) {
      var decision = btn.getAttribute("data-decision");
      var negative = decision === "Rejected" || decision === "Disapproved";
      var row = btn.closest("tr");
      var plate = btn.getAttribute("data-plate");
      var v = plate ? findVehicle(plate) : null;
      if (v) { v.status = decision.toLowerCase(); delete v.updated; }
      if (row) { row.removeAttribute("data-pending"); }
      btn.closest("td").innerHTML = '<span class="badge ' + (negative ? "badge-red" : "badge-green") + '">' +
        (negative ? "✕ " : "✓ ") + decision + "</span>";

      // Admin panel: log the decision in "Recent activity"
      var activity = $(".activity");
      if (activity && row) {
        activity.insertAdjacentHTML("afterbegin",
          '<li class="row-new"><span class="badge ' + (negative ? "badge-red" : "badge-green") + '">' + decision + "</span>" +
          "<div><strong>" + (negative ? "Rejected staff request" : "Validated staff account") + "</strong><small>" +
          escapeHtml(row.getAttribute("data-name") || "") + "</small></div><time>Just now</time></li>");
      }
      // Staff page: the alerts list reflects the new vehicle status
      if (v) {
        var alertsBox = $('[data-render="staff-alerts"]');
        if (alertsBox) {
          var alerts = buildAlerts(D.vehicles, false);
          alertsBox.innerHTML = alerts.map(function (a) {
            return alertRow(a, a.level === "amber"
              ? '<button type="button" class="btn btn-sm btn-amber" data-done-text="✓ Courier notified">Notify courier</button>'
              : '<a href="#fleet" class="btn btn-sm btn-outline">Review</a>');
          }).join("") || '<p class="text-muted text-13">No document alerts.</p>';
        }
      }
      updateCounters();
      return;
    }
    var done = e.target.closest("[data-done-text]");
    if (done) {
      done.textContent = done.getAttribute("data-done-text");
      done.disabled = true;
    }
  });

  /* =======================================================
     13. Register: what happens to each type of account
     Client → active right away (goes to login)
     Courier → pending until Staff validates it
     Staff → pending until an Admin validates it (forum, 13/10)
     ======================================================= */
  var registerForm = $("#register-form");
  if (registerForm) {
    registerForm.addEventListener("relay:valid", function (e) {
      var role = $('input[name="role"]:checked', registerForm).value;
      if (role === "courier") {
        e.detail.message = "Courier account created with status \"Pending\". A Staff member will validate it; then you can register your vehicles.";
      } else if (role === "staff") {
        e.detail.message = "Staff account created with status \"On hold\". An Administrator must validate it before you can sign in.";
      }
      // client: no message, the form goes to the login page
    });
  }

  updateCounters();
})();
