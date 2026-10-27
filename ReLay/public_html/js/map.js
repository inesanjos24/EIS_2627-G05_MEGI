/* =========================================================
   Relay — route maps
   Uses Leaflet (js/leaflet) with OpenStreetMap tiles.
   Road routes come from the public OSRM server; if it can't be
   reached, the map falls back to a straight line.

   Each map is a <div class="leaflet-map"> with:
     data-origin="lat,lng"          origin point
     data-dest="lat,lng"            destination point
     data-origin-label / data-dest-label   names shown on the map
     data-inputs="oLat,oLng,dLat,dLng"     (optional) ids of the form
                                           inputs that move the points
   Route info (distance, names, coordinates) is written into elements
   with data-field="..." inside a [data-route-info] block in the same card.

   Other scripts can draw a new route on a map (e.g. when the courier
   accepts an order or consolidates several into one route):
     mapElement.relaySetRoute([[lat,lng], [lat,lng], ...], "From", "To")
   The route goes through every point in order; the points in the
   middle are shown as small grey stops.
   ========================================================= */
(function () {
  "use strict";

  var ORANGE = "#ff6b00";
  var BLUE = "#2563eb";
  // OpenStreetMap tiles need the page to be served (e.g. NetBeans "Run File",
  // which uses http://localhost). A page opened by double-click (file://)
  // sends no Referer and OSM blocks it, so in that case Esri's street map is used.
  var OPENED_AS_FILE = window.location.protocol === "file:";
  var TILES = OPENED_AS_FILE
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var ATTRIBUTION = OPENED_AS_FILE
    ? 'Tiles &copy; <a href="https://www.esri.com">Esri</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var OSRM = "https://router.project-osrm.org/route/v1/driving/";

  var maps = document.querySelectorAll(".leaflet-map");

  // Leaflet didn't load: show a short message instead of an empty box
  if (!window.L) {
    for (var i = 0; i < maps.length; i++) {
      maps[i].classList.add("map-offline");
      maps[i].textContent = "The map could not be loaded.";
    }
    return;
  }

  /* ---------- helpers ---------- */
  function parsePoint(text) {
    var parts = String(text || "").split(",");
    var lat = parseFloat(parts[0]);
    var lng = parseFloat(parts[1]);
    return isValid(lat, lng) ? L.latLng(lat, lng) : null;
  }

  function isValid(lat, lng) {
    return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function formatCoords(p) {
    // matches the design: "41.1780, −8.5980" (typographic minus)
    return (p.lat.toFixed(4) + ", " + p.lng.toFixed(4)).replace(/-/g, "−");
  }

  function formatKm(km) {
    return km < 10 ? km.toFixed(1) : String(Math.round(km));
  }

  function makeMarker(point, color, label) {
    return L.circleMarker(point, {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: color,
      fillOpacity: 1
    }).bindTooltip(label, {
      permanent: true,
      direction: "top",
      offset: [0, -10],
      className: "route-label"
    });
  }

  /* ---------- one map ---------- */
  function initMap(el) {
    var origin = parsePoint(el.getAttribute("data-origin"));
    var dest = parsePoint(el.getAttribute("data-dest"));
    if (!origin || !dest) { return; }

    var originLabel = el.getAttribute("data-origin-label") || "Origin";
    var destLabel = el.getAttribute("data-dest-label") || "Destination";
    var start = { origin: origin, dest: dest };

    // Route info lives in the same card, or (courier page) elsewhere on the page
    var card = el.closest(".card");
    var info = (card && card.querySelector("[data-route-info]")) ||
               document.querySelector("[data-route-info]");

    var map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

    var line = L.polyline([origin, dest], { color: BLUE, weight: 4, opacity: 0.9 }).addTo(map);
    var originMarker = makeMarker(origin, ORANGE, "Origin: " + originLabel).addTo(map);
    var destMarker = makeMarker(dest, BLUE, "Destination: " + destLabel).addTo(map);
    var stops = L.layerGroup().addTo(map);   // intermediate stops of a consolidated route
    var waypoints = null;                    // null = just origin -> destination

    var requestId = 0;

    // all the points of the route, in order
    function routePoints() {
      return waypoints || [originMarker.getLatLng(), destMarker.getLatLng()];
    }

    function setField(name, value) {
      if (!info) { return; }
      var node = info.querySelector('[data-field="' + name + '"]');
      if (node) { node.textContent = value; }
    }

    function showStraightLine(points) {
      var meters = 0;
      for (var i = 1; i < points.length; i++) { meters += points[i - 1].distanceTo(points[i]); }
      line.setLatLngs(points);
      line.setStyle({ dashArray: "6 8" });
      setField("distance", formatKm(meters / 1000));
      setField("distance-note", "km (straight line)");
    }

    function drawRoute() {
      var points = routePoints();

      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
      showStraightLine(points);

      // Ask OSRM for the road route through every point; ignore answers to older requests
      var id = ++requestId;
      if (!window.fetch) { return; }
      var url = OSRM + points.map(function (p) { return p.lng + "," + p.lat; }).join(";") +
                "?overview=full&geometries=geojson";

      fetch(url)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (id !== requestId || !data || !data.routes || !data.routes.length) { return; }
          var route = data.routes[0];
          var points = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
          line.setLatLngs(points);
          line.setStyle({ dashArray: null });
          map.fitBounds(line.getBounds(), { padding: [50, 50], maxZoom: 15 });
          setField("distance", formatKm(route.distance / 1000));
          setField("distance-note", "km by road • ~" + Math.max(1, Math.round(route.duration / 60)) + " min");
        })
        .catch(function () { /* offline: keep the straight line */ });
    }

    // New route from another script: [[lat,lng], ...] going through every point
    el.relaySetRoute = function (list, fromName, toName) {
      var points = list.map(function (p) { return L.latLng(p[0], p[1]); });
      if (points.length < 2) { return; }
      waypoints = points;
      originLabel = fromName || "Origin";
      destLabel = toName || "Destination";
      start = { origin: points[0], dest: points[points.length - 1] };
      originMarker.setLatLng(points[0]).setTooltipContent("Origin: " + originLabel);
      destMarker.setLatLng(points[points.length - 1]).setTooltipContent("Destination: " + destLabel);
      stops.clearLayers();
      points.slice(1, -1).forEach(function (p, i) {
        L.circleMarker(p, { radius: 6, color: "#ffffff", weight: 2, fillColor: "#6b7280", fillOpacity: 1 })
          .bindTooltip("Stop " + (i + 1), { direction: "top" })
          .addTo(stops);
      });
      el.setAttribute("aria-label", "Map of the route from " + originLabel + " to " + destLabel);
      drawRoute();
    };

    function refreshLabels() {
      var o = originMarker.getLatLng();
      var d = destMarker.getLatLng();
      var oName = o.equals(start.origin) ? originLabel : "Selected point";
      var dName = d.equals(start.dest) ? destLabel : "Selected point";
      originMarker.setTooltipContent("Origin: " + oName);
      destMarker.setTooltipContent("Destination: " + dName);
      setField("origin-name", oName);
      setField("dest-name", dName);
      setField("origin-coords", formatCoords(o));
      setField("dest-coords", formatCoords(d));
    }

    /* ----- link the map to the order form (client pages) ----- */
    var ids = (el.getAttribute("data-inputs") || "").split(",");
    var inputs = ids.map(function (id) { return id ? document.getElementById(id.trim()) : null; });
    var hasInputs = inputs.length === 4 && inputs.every(Boolean);

    function readInputs() {
      var vals = inputs.map(function (inp) { return parseFloat(inp.value.replace(",", ".")); });
      if (!isValid(vals[0], vals[1]) || !isValid(vals[2], vals[3])) { return; }
      waypoints = null;
      originMarker.setLatLng([vals[0], vals[1]]);
      destMarker.setLatLng([vals[2], vals[3]]);
      refreshLabels();
      drawRoute();
    }

    function writeInputs() {
      if (!hasInputs) { return; }
      var o = originMarker.getLatLng();
      var d = destMarker.getLatLng();
      inputs[0].value = o.lat.toFixed(4);
      inputs[1].value = o.lng.toFixed(4);
      inputs[2].value = d.lat.toFixed(4);
      inputs[3].value = d.lng.toFixed(4);
    }

    if (hasInputs) {
      inputs.forEach(function (inp) { inp.addEventListener("change", readInputs); });

      // Click = move destination, Shift + click = move origin
      map.on("click", function (e) {
        var marker = e.originalEvent.shiftKey ? originMarker : destMarker;
        marker.setLatLng(e.latlng);
        writeInputs();
        refreshLabels();
        drawRoute();
      });
      el.classList.add("is-editable");

      // The form's Cancel (reset) button puts the original points back
      var form = inputs[0].form;
      if (form) {
        form.addEventListener("reset", function () {
          setTimeout(readInputs, 0);
        });
      }
    }

    drawRoute();

    // Recalculate size if the layout changes (e.g. phone rotated)
    window.addEventListener("resize", function () { map.invalidateSize(); });
  }

  for (var m = 0; m < maps.length; m++) {
    initMap(maps[m]);
  }
})();
