/**
 * LifeSimple — Multi-Step Form Controller
 * Handles: step navigation, progress bar, per-step validation, summary build
 */
(function () {
  'use strict';

  var currentStep = 1;
  var totalSteps  = 3;

  /* ── Show a specific step ─────────────────────────────── */
  function showStep(n) {
    document.querySelectorAll('.form-step').forEach(function (el) {
      el.classList.remove('active');
    });
    var target = document.querySelector('.form-step[data-step="' + n + '"]');
    if (target) target.classList.add('active');
    updateProgress(n);
    if (n === totalSteps) buildSummary();
    currentStep = n;
    // Scroll form card into view on mobile
    var card = document.querySelector('.form-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Update progress bar ──────────────────────────────── */
  function updateProgress(active) {
    document.querySelectorAll('.step-circle').forEach(function (circle, i) {
      var n = i + 1;
      circle.classList.remove('active', 'done');
      if (n < active) {
        circle.classList.add('done');
        circle.innerHTML = '&#10003;';
      } else if (n === active) {
        circle.classList.add('active');
        circle.textContent = n;
      } else {
        circle.textContent = n;
      }
    });
    document.querySelectorAll('.step-connector').forEach(function (conn, i) {
      conn.classList.toggle('done', (i + 1) < active);
    });
    document.querySelectorAll('.step-label').forEach(function (label, i) {
      label.classList.toggle('active', (i + 1) === active);
    });
  }

  /* ── Validate all required fields in a step ──────────── */
  function validateStep(n) {
    var step = document.querySelector('.form-step[data-step="' + n + '"]');
    if (!step) return true;
    var valid = true;

    // Clear previous errors in this step
    step.querySelectorAll('.field-error').forEach(function (e) { e.remove(); });
    step.querySelectorAll('.form-control.error, .error').forEach(function (e) {
      e.classList.remove('error');
    });

    // Text / email / select required
    step.querySelectorAll('input[required], select[required]').forEach(function (field) {
      if (field.type === 'radio' || field.type === 'checkbox') return; // handled below
      if (!field.value.trim()) {
        field.classList.add('error');
        showFieldErr(field.parentNode, 'Παρακαλώ συμπληρώστε αυτό το πεδίο.');
        valid = false;
      }
    });

    // Email format
    step.querySelectorAll('input[type="email"]').forEach(function (field) {
      if (field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) {
        field.classList.add('error');
        showFieldErr(field.parentNode, 'Εισάγετε έγκυρη διεύθυνση email.');
        valid = false;
      }
    });

    // Required radio groups
    step.querySelectorAll('[data-required="radio"]').forEach(function (group) {
      var checked = group.querySelector('input[type="radio"]:checked');
      if (!checked) {
        showFieldErr(group, 'Παρακαλώ επιλέξτε μια απάντηση.');
        valid = false;
      }
    });

    // Entry cards (inherit step 1)
    var scenarioField = document.getElementById('scenarioField');
    if (scenarioField && n === 1 && !scenarioField.value) {
      var errEl = document.getElementById('entryCardsError');
      if (errEl) errEl.style.display = 'block';
      valid = false;
    }

    if (!valid) {
      var first = step.querySelector('.error, .field-error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return valid;
  }

  function showFieldErr(parent, msg) {
    var p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = msg;
    parent.appendChild(p);
  }

  /* ── Build Step 3 summary from filled values ──────────── */
  function buildSummary() {
    var el = document.getElementById('summaryContent');
    if (!el) return;

    var rows = [];

    // Always show name + email from step 1
    var firstName = document.querySelector('[name="firstName"]');
    var lastName  = document.querySelector('[name="lastName"]');
    var email     = document.querySelector('[name="email"]');
    var nameVal   = (firstName ? firstName.value : '') + (lastName && lastName.value ? ' ' + lastName.value : '');
    if (nameVal.trim()) rows.push(['Όνομα', nameVal.trim()]);
    if (email && email.value) rows.push(['Email', email.value]);

    // Scenario (inherit)
    var scenarioField = document.getElementById('scenarioField');
    if (scenarioField && scenarioField.value) {
      var scenarioLabels = {
        'post-death': 'Έχω χάσει κάποιον αγαπημένο',
        'planning':   'Θέλω να προετοιμαστώ εγκαίρως',
        'education':  'Θέλω να καταλάβω πώς λειτουργεί'
      };
      rows.push(['Κατηγορία', scenarioLabels[scenarioField.value] || scenarioField.value]);
    }

    // Step 2 fields with data-sumkey attribute
    document.querySelectorAll('.form-step[data-step="2"] [data-sumkey]').forEach(function (el) {
      var key = el.getAttribute('data-sumkey');
      var val = '';
      if (el.classList.contains('radio-group')) {
        var checked = el.querySelector('input[type="radio"]:checked');
        if (checked) {
          var lbl = checked.closest('label');
          val = lbl ? lbl.textContent.trim() : checked.value;
        }
      } else if (el.tagName === 'SELECT') {
        val = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
        if (val === '— Επιλέξτε —') val = '';
      } else if (el.tagName === 'TEXTAREA' && el.value.trim()) {
        val = el.value.length > 70 ? el.value.substring(0, 70) + '…' : el.value;
      }
      if (val && val !== '— Επιλέξτε —') rows.push([key, val]);
    });

    el.innerHTML = rows.map(function (r) {
      return '<div class="summary-row"><span class="summary-key">' + r[0] + ':</span>'
           + '<span class="summary-val">' + r[1] + '</span></div>';
    }).join('') || '<p style="color:#9aabba;font-size:0.85rem;">Συμπληρώσατε τα στοιχεία σας.</p>';
  }

  /* ── Entry card selection (inherit) ──────────────────── */
  window.msSelectScenario = function (btn) {
    document.querySelectorAll('.ms-entry-card').forEach(function (c) {
      c.classList.remove('selected');
    });
    btn.classList.add('selected');
    var scenario = btn.getAttribute('data-scenario');
    var field = document.getElementById('scenarioField');
    if (field) field.value = scenario;
    var errEl = document.getElementById('entryCardsError');
    if (errEl) errEl.style.display = 'none';
    // Update form intro text
    var intros = {
      'post-death': 'Πες μας λίγα πράγματα για να φτιάξουμε τον φάκελό σου',
      'planning':   'Λίγες πληροφορίες για να προετοιμάσουμε το σωστό πλάνο',
      'education':  'Πες μας για την κατάστασή σου και τι θέλεις να καταλάβεις'
    };
    var introEl = document.getElementById('formIntroText');
    if (introEl && intros[scenario]) introEl.textContent = intros[scenario];
  };

  /* ── Wire up buttons after DOM ready ─────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    updateProgress(1);

    document.querySelectorAll('.step-next-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.closest('.form-step').getAttribute('data-step'), 10);
        if (validateStep(step)) showStep(step + 1);
      });
    });

    document.querySelectorAll('.step-back-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.closest('.form-step').getAttribute('data-step'), 10);
        showStep(step - 1);
      });
    });
  });

})();
