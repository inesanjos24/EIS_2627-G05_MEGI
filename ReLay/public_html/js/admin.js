/* =========================================================
   Relay - Admin pages
   ---------------------------------------------------------
   Keeps the "N pending staff" pill in the top bar in step with
   the "Staff pending validation" table.
   The Validate / Reject buttons themselves are handled by
   app.js (section 12): this file only reacts after them, so it
   must be loaded AFTER app.js.
   ========================================================= */
(function () {
  "use strict";

  var pill = document.querySelector("[data-pending-pill]");
  if (!pill) { return; }

  var selector = pill.getAttribute("data-pending-pill");
  var empty = document.querySelector("[data-pending-empty]");

  function update() {
    var n = document.querySelectorAll(selector).length;
    pill.textContent = n ? n + " pending staff" : "No pending staff";
    if (empty) { empty.hidden = n > 0; }
  }

  // app.js registered its click listener first, so when this one runs
  // the row has already lost its data-pending attribute.
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-decision]")) { update(); }
  });

  update();
})();
