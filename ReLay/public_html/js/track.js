(function () {
  "use strict";

  var D = window.RelayData;
  var V = window.RelayValidation;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  var homeForm = $(".track-form");
  if (homeForm) {
    homeForm.addEventListener("relay:valid", function (e) {
      var number = homeForm.querySelector("input").value.replace(/\D/g, "");
      // validation.js opens the form's action when there is no message
      homeForm.setAttribute("action", "track-order.html?order=" + number);
      e.detail.message = null;
    });
  }

  var page = $("[data-track-page]");
  if (!page || !D || !V) { return; }

  var form = $("#track-search");
  var input = $("#order-number");
  var card = $("[data-track-card]");
  var loginBox = $("[data-track-login]");
  var empty = $("[data-track-empty]");
  var chip = $("[data-track-chip]");
  var distanceBox = $("[data-track-distance]");

  function findOrder(number) {
    return D.clientOrders.filter(function (o) { return o.id === number; })[0] || null;
  }

  function product(ref) {
    return D.clientProducts.filter(function (p) { return p.ref === ref; })[0] || null;
  }

  V.addRule(form, function () {
    var number = Number(input.value.replace(/\D/g, ""));
    if (input.value.trim() !== "" && /^#?[0-9]{4,6}$/.test(input.value.trim()) && !findOrder(number)) {
      return [{ el: input, message: "We couldn't find order #" + number + ". Check the number and try again." }];
    }
    return [];
  });

  form.addEventListener("relay:valid", function (e) {
    e.detail.message = null;          // no message: the order is shown instead
    form.removeAttribute("action");   // stay on this page
    var number = Number(input.value.replace(/\D/g, ""));
    show(findOrder(number));
    // keep the number in the address, so the page can be shared or reloaded
    if (window.history && history.replaceState) {
      try { history.replaceState(null, "", "track-order.html?order=" + number); } catch (err) { /* file:// */ }
    }
  });

  var STATUS = {
    initiated:   { badge: "is-green", label: "Initiated",   steps: ["done", "", ""] },
    in_progress: { badge: "is-blue",  label: "In Progress", steps: ["done", "current", ""] },
    completed:   { badge: "is-green", label: "Completed",   steps: ["done", "done", "done"] },
    cancelled:   { badge: "is-red",   label: "Cancelled",   steps: ["done", "current", "cancelled"] }
  };

  function totals(o) {
    var t = { items: 0, kg: 0 };
    o.items.forEach(function (it) {
      var p = product(it.ref);
      if (p) { t.items += it.qty; t.kg += it.qty * p.weight_kg; }
    });
    return t.items + (t.items === 1 ? " item · " : " items · ") + parseFloat(t.kg.toFixed(2)) + " kg";
  }

  function timeline(o) {
    var list = [{ time: o.created_at, title: "Order placed", text: o.origin.name + " · " + totals(o) }];
    if (o.status === "initiated") {
      list.push({ time: "", title: "Waiting for a courier", text: "A courier will accept your order soon" });
    }
    if (o.courier) {
      list.push({ time: o.status === "in_progress" ? o.updated : "", title: "Delivery started", text: o.courier + " · " + o.vehicle });
    }
    if (o.lastLocation) {
      list.push({ time: "Today, " + o.lastLocation.at, title: "Location shared by the courier", text: o.lastLocation.place });
    }
    if (o.status === "completed") {
      list.push({ time: o.closed_at, title: "Delivered", text: o.dest.name + " · proof of delivery: " + (o.epod === "photo" ? "photo" : "signature") });
    }
    if (o.status === "cancelled") {
      list.push({ time: o.closed_at, title: "Cancelled", text: "Recipient not available after " + (o.attempts ? o.attempts.length : 2) + " attempts" });
    }
    return list;
  }

  function renderCard(o) {
    var s = STATUS[o.status];
    var last = o.status === "cancelled" ? "Cancelled" : "Completed";
    var events = timeline(o);
    card.innerHTML =
      '<div class="track-card-head">' +
        '<span class="track-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg></span>' +
        '<div><small>Order number</small><strong>#' + o.id + "</strong></div>" +
        '<span class="track-badge ' + s.badge + '">' + s.label + "</span>" +
      "</div>" +
      '<div class="steps" aria-label="Order status: ' + s.label + '">' +
        '<span class="' + s.steps[0] + '">Initiated</span>' +
        '<span class="' + s.steps[1] + '">In Progress</span>' +
        '<span class="' + s.steps[2] + '">' + last + "</span>" +
      "</div>" +
      '<ol class="track-timeline">' + events.map(function (ev, i) {
        return '<li' + (i === events.length - 1 ? ' class="is-last"' : "") + ">" +
          (ev.time ? "<small>" + esc(ev.time) + "</small>" : "") +
          "<strong>" + esc(ev.title) + "</strong><span>" + esc(ev.text) + "</span></li>";
      }).join("") + "</ol>" +
      (o.courier
        ? '<div class="track-courier"><span class="avatar" aria-hidden="true"></span><div><small>Courier</small><strong>' + esc(o.courier) + "</strong></div></div>"
        : "");
  }

  var mapBox = $(".track-live-map");
  var map = null;
  var layers = null;

  var VAN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/></svg>';

  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function drawMap(o) {
    if (!window.L) {
      mapBox.classList.add("map-offline");
      mapBox.textContent = "The map could not be loaded.";
      return;
    }
    if (!map) {
      var asFile = window.location.protocol === "file:";
      map = L.map(mapBox, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.25 });
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer(asFile
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: asFile ? 'Tiles &copy; <a href="https://www.esri.com">Esri</a>'
                            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      layers = L.layerGroup().addTo(map);
    }
    layers.clearLayers();

    var origin = [o.origin.lat, o.origin.lng];
    var dest = [o.dest.lat, o.dest.lng];
    var points = [origin, dest];

    function dot(point, label) {
      L.circleMarker(point, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 })
        .bindTooltip(label, { permanent: true, direction: "top", offset: [0, -9], className: "route-label" })
        .addTo(layers);
    }

    if (o.lastLocation && o.status === "in_progress") {
      var here = [o.lastLocation.lat, o.lastLocation.lng];
      points.push(here);
      // travelled (solid) and still to go (dotted)
      L.polyline([origin, here], { color: "#2563eb", weight: 4 }).addTo(layers);
      L.polyline([here, dest], { color: "#2563eb", weight: 4, opacity: 0.75, dashArray: "2 9" }).addTo(layers);
      L.marker(here, {
        icon: L.divIcon({ className: "", html: '<span class="courier-pin track-pin">' + VAN_SVG + "</span>", iconSize: [40, 40], iconAnchor: [20, 20] }),
        title: "Courier"
      }).bindTooltip(
        "<strong>" + esc(o.courier) + " · " + esc(o.vehicle.replace(" · ", " ")) + "</strong>" +
        "<span>" + esc(o.lastLocation.place) + "</span>" +
        "<small>Shared by the courier at " + esc(o.lastLocation.at) + "</small>",
        { permanent: true, direction: "top", offset: [0, -22], className: "track-courier-tip" }
      ).addTo(layers);
    } else {
      L.polyline([origin, dest], {
        color: o.status === "cancelled" ? "#dc2626" : "#2563eb",
        weight: 4,
        dashArray: o.status === "completed" ? null : "2 9"
      }).addTo(layers);
    }
    dot(origin, "Origin · " + o.origin.name);
    dot(dest, "Destination · " + o.dest.name);

    setTimeout(function () {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(points), { padding: [70, 70] });
    }, 50);

    if (o.lastLocation && o.status === "in_progress") {
      chip.lastElementChild.textContent = "Last shared · " + o.lastLocation.at;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    distanceBox.querySelector("strong span").textContent = km(origin, dest).toFixed(1) + " km";
    distanceBox.hidden = false;
  }

  function show(o) {
    if (!o) { return; }
    renderCard(o);
    card.hidden = false;
    empty.hidden = true;

    loginBox.hidden = o.status !== "in_progress";
    drawMap(o);
  }

  var fromUrl = (window.location.search.match(/[?&]order=#?(\d{4,6})/) || [])[1];
  if (fromUrl) {
    input.value = "#" + fromUrl;
    if (findOrder(Number(fromUrl))) {
      show(findOrder(Number(fromUrl)));
    } else {
      V.showError(input, "We couldn't find order #" + fromUrl + ". Check the number and try again.");
    }
  }
})();


