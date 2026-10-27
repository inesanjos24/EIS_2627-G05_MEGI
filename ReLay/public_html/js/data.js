/* =========================================================
   Relay — sample test data (without database)
   ---------------------------------------------------------
   It asks for "HTML/CSS/JS source code with sample
   test data". Data that pages render with JavaScript: objects, arrays,
   numbers, strings and the Date object.

   Document dates are calculated FROM TODAY, so the alerts are
   always meaningful
   (an expired insurance stays expired, an inspection always
   expires "in 2 days".....
   ========================================================= */
(function () {
  "use strict";

  /* Forum answer (Staff Use Case, 07/10): staff and couriers are
     alerted when information is outdated "or if it will be outdated
     within a certain time window, e.g., 3 days". */
  var ALERT_WINDOW_DAYS = 3;
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ---------- Date helpers (Date object) ---------- */
  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // daysFromToday(-5) -> the date 5 days ago; daysFromToday(2) -> in 2 days
  function daysFromToday(n) {
    var d = startOfToday();
    d.setDate(d.getDate() + n);
    return d;
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }

  // 27/10/2026 (format used in every table of the site)
  function formatDate(d) {
    return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  // 2026-10-27 (format used by <input type="date">)
  function toISO(d) {
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  function daysUntil(date) {
    return Math.round((date - startOfToday()) / DAY_MS);
  }

  /* ---------- Status of one document (insurance / inspection) ---------- */
  function docStatus(date) {
    var n = daysUntil(date);
    if (n < 0) {
      return { code: "expired", days: n, badge: "badge-red",
               label: "Expired " + Math.abs(n) + (n === -1 ? " day ago" : " days ago") };
    }
    if (n <= ALERT_WINDOW_DAYS) {
      return { code: "expiring", days: n, badge: "badge-amber",
               label: n === 0 ? "Expires today" : "Expires in " + n + (n === 1 ? " day" : " days") };
    }
    return { code: "valid", days: n, badge: "badge-green", label: "Valid" };
  }

  /* Worst status of a vehicle's two documents (expired > expiring > valid) */
  function vehicleDocState(v) {
    var ins = docStatus(v.insurance_expiry_date);
    var insp = docStatus(v.inspection_expiry_date);
    var rank = { valid: 0, expiring: 1, expired: 2 };
    return rank[ins.code] >= rank[insp.code] ? ins.code : insp.code;
  }

  /* A vehicle can be used for an order only if Staff approved it
     AND both documents are still valid today. */
  function isUsable(v) {
    return v.status === "approved" && vehicleDocState(v) !== "expired";
  }

  /* ---------- Vehicle_Type (ER entity) ---------- */
  var vehicleTypes = [
    { type_name: "Bike",  max_weight_kg: 15,   max_vol_m3: 0.05 },
    { type_name: "Moto",  max_weight_kg: 30,   max_vol_m3: 0.1 },
    { type_name: "Van",   max_weight_kg: 800,  max_vol_m3: 6 },
    { type_name: "Truck", max_weight_kg: 3500, max_vol_m3: 20 }
  ];

  /* ---------- Vehicle (ER entity) ----------
     status: pending (waiting for Staff) | approved | rejected | disapproved */
  var vehicles = [
    { license_plate: "AA-12-BC", type: "Van", model: "Renault Kangoo", courier: "João Silva",
      max_weight_kg: 800, max_vol_m3: 6, status: "approved",
      insurance_expiry_date: daysFromToday(-5), inspection_expiry_date: daysFromToday(210),
      insurance_expiry_doc: "insurance_AA12BC.pdf", inspection_expiry_doc: "inspection_AA12BC.pdf" },

    { license_plate: "45-ZZ-11", type: "Moto", model: "Honda PCX 125", courier: "João Silva",
      max_weight_kg: 30, max_vol_m3: 0.1, status: "approved",
      insurance_expiry_date: daysFromToday(160), inspection_expiry_date: daysFromToday(2),
      insurance_expiry_doc: "insurance_45ZZ11.pdf", inspection_expiry_doc: "inspection_45ZZ11.pdf" },

    { license_plate: "BK-0007", type: "Bike", model: "Cargo bike Riese & Müller", courier: "João Silva",
      max_weight_kg: 15, max_vol_m3: 0.05, status: "pending",
      insurance_expiry_date: daysFromToday(300), inspection_expiry_date: daysFromToday(300),
      insurance_expiry_doc: "insurance_BK0007.pdf", inspection_expiry_doc: "inspection_BK0007.pdf" },

    { license_plate: "77-AB-90", type: "Truck", model: "Iveco Daily", courier: "Carla Nunes",
      max_weight_kg: 3500, max_vol_m3: 20, status: "pending",
      insurance_expiry_date: daysFromToday(240), inspection_expiry_date: daysFromToday(365),
      insurance_expiry_doc: "insurance_77AB90.pdf", inspection_expiry_doc: "inspection_77AB90.pdf",
      updated: { doc: "inspection", at: "today at 14:32" } },

    { license_plate: "12-QR-34", type: "Van", model: "Peugeot Partner", courier: "Marta Lopes",
      max_weight_kg: 750, max_vol_m3: 4.5, status: "approved",
      insurance_expiry_date: daysFromToday(1), inspection_expiry_date: daysFromToday(95),
      insurance_expiry_doc: "insurance_12QR34.pdf", inspection_expiry_doc: "inspection_12QR34.pdf" },

    { license_plate: "58-LM-07", type: "Moto", model: "Yamaha NMAX", courier: "Rui Costa",
      max_weight_kg: 30, max_vol_m3: 0.1, status: "approved",
      insurance_expiry_date: daysFromToday(120), inspection_expiry_date: daysFromToday(-2),
      insurance_expiry_doc: "insurance_58LM07.pdf", inspection_expiry_doc: "inspection_58LM07.pdf" },

    { license_plate: "90-TT-21", type: "Van", model: "Citroën Berlingo", courier: "Carla Nunes",
      max_weight_kg: 700, max_vol_m3: 3.8, status: "approved",
      insurance_expiry_date: daysFromToday(200), inspection_expiry_date: daysFromToday(150),
      insurance_expiry_doc: "insurance_90TT21.pdf", inspection_expiry_doc: "inspection_90TT21.pdf" }
  ];

  /* ---------- Operational dashboard (Admin) ---------- */
  var deliveries = {
    "7d":   { title: "Deliveries per day",   labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [42, 55, 48, 61, 70, 35, 22] },
    "30d":  { title: "Deliveries per week",  labels: ["Week 1", "Week 2", "Week 3", "Week 4"],         values: [301, 288, 334, 333] },
    "year": { title: "Deliveries per month", labels: ["Jun", "Jul", "Aug", "Sep", "Oct"],              values: [820, 1140, 980, 1310, 1256] }
  };

  window.RelayData = {
    ALERT_WINDOW_DAYS: ALERT_WINDOW_DAYS,
    vehicleTypes: vehicleTypes,
    vehicles: vehicles,
    deliveries: deliveries,
    docStatus: docStatus,
    vehicleDocState: vehicleDocState,
    isUsable: isUsable,
    formatDate: formatDate,
    toISO: toISO,
    daysFromToday: daysFromToday,
    startOfToday: startOfToday
  };
})();
