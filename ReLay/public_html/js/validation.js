/* =========================================================
   Relay — client-side form validation
   ---------------------------------------------------------
   Runs on every <form> of the site. When a form is submitted:
     1. every field is checked (empty required fields, numbers and
        GPS coordinate ranges, email, NIF, phone, patterns, passwords);
     2. if something is wrong the submission is blocked, each field
        shows a red text message under it and an alert box at the
        bottom of the form says how many fields need fixing;
     3. if everything is valid the form either shows its success
        message (data-success="...") or goes to the page in "action".

   Extra rules per field (HTML attributes):
     required            field can't be empty
     data-number         text field that must hold a number
     min / max           allowed range for numbers (e.g. latitude −90..90)
     data-gt="0"         number must be greater than the value
     data-int            whole numbers only
     data-digits="9"     exactly N digits, spaces ignored (NIF)
     data-phone          phone number (9–15 digits, optional +)
     data-match="id"     must be equal to another field (confirm password)
     pattern + data-error  regular expression and the message to show
     minlength           minimum number of characters
     data-future         date that must be after today (document expiry dates)

   Other scripts can add rules for a whole form with
   RelayValidation.addRule(form, function (submitter) { return [...] }).
   ========================================================= */
(function () {
  "use strict";

  var rules = [];

  /* ---------- small helpers ---------- */
  function labelFor(input) {
    var label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
    var text = label ? label.textContent : (input.getAttribute("aria-label") || "This field");
    return text.replace("*", "").trim();
  }

  function toNumber(value) {
    var clean = String(value).trim().replace(",", ".");
    return clean === "" || isNaN(clean) ? NaN : Number(clean);
  }

  function pretty(n) {
    // typographic minus, as used in the rest of the site
    return String(n).replace("-", "−");
  }

  /* ---------- where the message goes ---------- */
  function errorHost(input) {
    return input.closest(".field") ||
           input.closest(".signature-wrap") ||
           input.closest(".choice-grid") ||
           input.closest(".checkbox") ||
           input.closest(".dropzone") ||
           input.closest(".track-form") ||
           input;
  }

  function showError(input, message) {
    var host = errorHost(input);
    host.classList.add("error", "has-error");
    input.setAttribute("aria-invalid", "true");

    var msg = document.createElement("span");
    msg.className = "error-msg";
    msg.setAttribute("data-js-error", "");
    msg.textContent = message;

    if (host.classList.contains("field")) {
      host.appendChild(msg);
    } else {
      host.insertAdjacentElement("afterend", msg);
    }
    if (input.id) {
      msg.id = input.id + "-error";
      input.setAttribute("aria-describedby", msg.id);
    }
  }

  function clearError(input) {
    var host = errorHost(input);
    host.classList.remove("error", "has-error");
    input.removeAttribute("aria-invalid");
    var msg = host.classList.contains("field")
      ? host.querySelector("[data-js-error]")
      : host.nextElementSibling;
    if (msg && msg.hasAttribute("data-js-error")) { msg.remove(); }
  }

  function clearAll(form) {
    form.querySelectorAll(".has-error").forEach(function (el) { el.classList.remove("error", "has-error"); });
    form.querySelectorAll("[data-js-error]").forEach(function (el) { el.remove(); });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    var alert = form.querySelector(".form-alert");
    if (alert) { alert.remove(); }
  }

  /* ---------- alert box at the bottom of the form ---------- */
  function showAlert(form, type, html) {
    var old = form.querySelector(".form-alert");
    if (old) { old.remove(); }
    var box = document.createElement("div");
    box.className = "form-alert form-alert-" + type;
    box.setAttribute("role", type === "error" ? "alert" : "status");
    box.innerHTML = html;

    var actions = form.querySelectorAll(".form-actions");
    var anchor = actions.length ? actions[actions.length - 1] : form.querySelector('[type="submit"]');
    if (anchor) { anchor.insertAdjacentElement("beforebegin", box); } else { form.appendChild(box); }
    return box;
  }

  /* ---------- the checks for one field ---------- */
  function checkField(input) {
    var type = input.type;

    if (type === "radio") {
      if (!input.required) { return null; }
      var group = input.form.querySelectorAll('input[type="radio"][name="' + input.name + '"]');
      for (var i = 0; i < group.length; i++) { if (group[i].checked) { return null; } }
      return input.getAttribute("data-error") || "Choose one of the options";
    }

    if (type === "checkbox") {
      return input.required && !input.checked
        ? (input.getAttribute("data-error") || "You must tick this box to continue")
        : null;
    }

    if (type === "file") {
      var hasFile = input.files.length > 0 || input.hasAttribute("data-has-file");
      return input.required && !hasFile
        ? (input.getAttribute("data-error") || "Upload a file before submitting")
        : null;
    }

    // number inputs with letters in them report an empty value
    if (input.validity && input.validity.badInput) {
      return labelFor(input) + " must be a number";
    }

    var value = input.value.trim();
    if (value === "") {
      return input.required ? "Required field — please fill it in" : null;
    }

    // Email regular expression (JS/DOM lesson: /^.+@.+\..{2,3}$/), made stricter:
    // no spaces, exactly one "@", and a domain ending of 2+ letters (.pt, .com, .info)
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return "Invalid email format — e.g. name@domain.com";
    }

    if (type === "number" || input.hasAttribute("data-number")) {
      var n = toNumber(value);
      var min = input.getAttribute("min");
      var max = input.getAttribute("max");
      var gt = input.getAttribute("data-gt");
      var range = min !== null && max !== null
        ? " between " + pretty(min) + " and " + pretty(max) : "";

      if (isNaN(n)) { return labelFor(input) + " must be a number" + range; }
      if (range && (n < Number(min) || n > Number(max))) {
        return labelFor(input) + " must be" + range;
      }
      if (min !== null && max === null && n < Number(min)) {
        return labelFor(input) + " must be at least " + pretty(min);
      }
      if (gt !== null && n <= Number(gt)) { return "Enter a number greater than " + pretty(gt); }
      if (input.hasAttribute("data-int") && Math.floor(n) !== n) { return "Use a whole number"; }
    }

    // Expiry dates of insurance / inspection must still be valid (Date object)
    if (type === "date" && input.hasAttribute("data-future")) {
      var chosen = new Date(value + "T00:00:00");
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(chosen.getTime())) { return "Invalid date"; }
      if (chosen <= today) { return "This document is already expired — the expiry date must be after today"; }
    }

    var digits = input.getAttribute("data-digits");
    if (digits !== null && !new RegExp("^\\d{" + digits + "}$").test(value.replace(/\s/g, ""))) {
      return labelFor(input) + " must have " + digits + " digits";
    }

    if (input.hasAttribute("data-phone") && !/^\+?[0-9 ]{9,18}$/.test(value)) {
      return "Enter a valid phone number — e.g. +351 912 345 678";
    }

    if (input.minLength > 0 && value.length < input.minLength) {
      return "Must have at least " + input.minLength + " characters";
    }

    var pattern = input.getAttribute("pattern");
    if (pattern && !new RegExp("^(?:" + pattern + ")$").test(value)) {
      return input.getAttribute("data-error") || "Invalid format";
    }

    var matchId = input.getAttribute("data-match");
    if (matchId) {
      var other = document.getElementById(matchId);
      if (other && other.value !== input.value) { return "Passwords don't match"; }
    }

    return null;
  }

  function fieldsOf(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) &&
             !el.disabled && !el.readOnly &&
             !/^(hidden|submit|button|reset)$/.test(el.type);
    });
  }

  /* ---------- validate a whole form ---------- */
  function validate(form, submitter) {
    clearAll(form);
    var problems = [];
    var seenRadio = {};

    fieldsOf(form).forEach(function (input) {
      if (input.type === "radio") {
        if (seenRadio[input.name]) { return; }
        seenRadio[input.name] = true;
      }
      var message = checkField(input);
      if (message) {
        showError(input, message);
        problems.push({ el: input, message: message });
      }
    });

    // extra rules added by other scripts (e-POD, products in an order, ...)
    rules.forEach(function (rule) {
      if (rule.form !== form) { return; }
      (rule.fn(submitter) || []).forEach(function (p) {
        if (p.el && !p.el.hasAttribute("aria-invalid")) { showError(p.el, p.message); }
        problems.push(p);
      });
    });

    return problems;
  }

  function onSubmit(event) {
    var form = event.target;
    event.preventDefault();

    var submitter = event.submitter || null;
    var problems = validate(form, submitter);

    if (problems.length) {
      var count = problems.filter(function (p) { return p.el; }).length;
      var general = problems.filter(function (p) { return !p.el; });
      var html = "";
      if (count) {
        html += "<strong>Please correct the " + count + " highlighted field" + (count > 1 ? "s" : "") +
                " before submitting.</strong>";
      }
      general.forEach(function (p) { html += "<span>" + p.message + "</span>"; });
      if (!form.hasAttribute("data-no-alert")) { showAlert(form, "error", html); }

      var first = problems.filter(function (p) { return p.el; })[0];
      if (first) {
        first.el.focus({ preventScroll: true });
        (first.el.closest(".field") || first.el).scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Valid: let page scripts react (they can change the success text)
    var detail = { submitter: submitter, message: form.getAttribute("data-success") };
    form.dispatchEvent(new CustomEvent("relay:valid", { detail: detail }));

    if (detail.message) {
      showAlert(form, "success", "<strong>✓</strong> " + detail.message);
      if (!form.hasAttribute("data-keep-values")) {
        form.relayKeepAlert = true;   // the reset below must not remove the success message
        form.reset();
      }
      return;
    }
    var action = form.getAttribute("action");
    if (action) { window.location.href = action; }
  }

  function clearAllButAlert(form) {
    form.querySelectorAll(".has-error").forEach(function (el) { el.classList.remove("error", "has-error"); });
    form.querySelectorAll("[data-js-error]").forEach(function (el) { el.remove(); });
  }

  /* ---------- live feedback: remove the error as soon as it's fixed ---------- */
  function onEdit(event) {
    var input = event.target;
    if (!input.form || !input.hasAttribute("aria-invalid")) { return; }
    if (input.type === "radio") {
      input.form.querySelectorAll('input[name="' + input.name + '"]').forEach(clearError);
      return;
    }
    clearError(input);
    var message = checkField(input);
    if (message) { showError(input, message); }
  }

  /* ---------- start ---------- */
  document.querySelectorAll("form").forEach(function (form) {
    form.noValidate = true; // JavaScript takes over from the browser's bubbles
    form.addEventListener("submit", onSubmit);
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    form.addEventListener("reset", function () {
      var keepAlert = form.relayKeepAlert;
      form.relayKeepAlert = false;
      setTimeout(function () {
        clearAllButAlert(form);
        var alert = form.querySelector(".form-alert");
        if (alert && !keepAlert) { alert.remove(); }
      }, 0);
    });
  });

  window.RelayValidation = {
    addRule: function (form, fn) { if (form) { rules.push({ form: form, fn: fn }); } },
    showError: showError,
    clearError: clearError,
    showAlert: showAlert,
    toNumber: toNumber
  };
})();
