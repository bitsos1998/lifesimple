/**
 * LifeSimple — Frontend JavaScript
 * Handles:
 *   - Nav hamburger toggle
 *   - FAQ accordion
 *   - Conditional form fields
 *   - Form validation
 *   - Pre-payment overlay with PDF preview
 *   - Stripe checkout redirect (via backend)
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Nav Toggle (mobile) ─────────────────────────────────
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });

    // Close nav on link click (mobile)
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ── FAQ Accordion ───────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const item = question.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      // Close all items
      document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));

      // Open clicked item if it was closed
      if (!isOpen) item.classList.add('open');
    });
  });

  // ── Conditional Fields ──────────────────────────────────
  // Show/hide "children count" based on hasChildren radio
  setupConditional({
    trigger:   'input[name="hasChildren"]',
    targetId:  'childrenCountGroup',
    condition: val => val === 'yes',
  });

  // ── Product Form ────────────────────────────────────────
  const form    = document.getElementById('productForm');
  const payBtn  = document.getElementById('payBtn');

  if (form && payBtn) {
    // Intercept pay button click → validate → show overlay
    payBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isValid = validateForm(form);
      if (!isValid) return;
      showPrePaymentOverlay(form);
    });
  }

  // ── Cancelled Payment Notice ────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('cancelled') === '1') {
    showToast('Η πληρωμή ακυρώθηκε. Μπορείτε να δοκιμάσετε ξανά όποτε θέλετε.', 'warning');
  }

});

// ── Conditional Field Helper ─────────────────────────────
function setupConditional({ trigger, targetId, condition }) {
  const target   = document.getElementById(targetId);
  const triggers = document.querySelectorAll(trigger);

  if (!target || triggers.length === 0) return;

  triggers.forEach(el => {
    el.addEventListener('change', () => {
      const val = el.value;
      if (condition(val)) {
        target.classList.add('visible');
      } else {
        target.classList.remove('visible');
      }
    });
  });
}

// ── Pre-Payment Overlay ──────────────────────────────────
function showPrePaymentOverlay(form) {
  const productNameFull = (form.querySelector('input[name="productName"]') || {}).value || 'Οδηγός';
  const priceVal        = (form.querySelector('input[name="price"]') || {}).value || '0';
  const priceEuros      = (parseInt(priceVal, 10) / 100).toFixed(0);

  // Extract short guide title (after "—" if present)
  const guideTitle = productNameFull.includes('—')
    ? productNameFull.split('—')[1].trim()
    : productNameFull;

  // Determine PDF preview content based on product
  const productKey = (form.querySelector('input[name="product"]') || {}).value || '';
  const previewContent = getPDFPreviewContent(productKey);

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'ppo-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Επιβεβαίωση αγοράς');

  backdrop.innerHTML = `
    <div class="ppo-sheet">
      <div class="ppo-card">

        <!-- LEFT: Payment summary + confirm -->
        <div class="ppo-left">
          <button class="ppo-back-btn" type="button" aria-label="Επιστροφή">
            ← Επιστροφή
          </button>
          <div class="ppo-heading">Επιβεβαίωση Αγοράς</div>
          <div class="ppo-product-name">${productNameFull}</div>
          <div class="ppo-price-row">
            <span class="ppo-price-amount">€${priceEuros}</span>
            <span class="ppo-price-note">εφάπαξ · άμεση παράδοση</span>
          </div>

          <ul class="ppo-includes">
            <li>✅ Πλήρης οδηγός σε PDF — ${previewContent.pages} σελίδες</li>
            <li>✅ Εξατομικευμένος βάσει των απαντήσεών σας</li>
            <li>✅ Αποστολή στο email σας εντός 2-5 λεπτών</li>
            <li>✅ Ισχύει για το ελληνικό δίκαιο (2026)</li>
          </ul>

          <button class="ppo-confirm-btn" type="button" id="ppoConfirmBtn">
            🔒 Πληρωμή με ασφάλεια — €${priceEuros}
          </button>

          <p class="ppo-secure-note">
            Πληρωμή μέσω Stripe · Visa · Mastercard · Apple Pay
          </p>

          <div class="ppo-guarantee">
            <span class="ppo-guarantee-icon">🛡️</span>
            <span>Εγγύηση επιστροφής χρημάτων 14 ημερών</span>
          </div>
        </div>

        <!-- RIGHT: PDF mockup preview -->
        <div class="ppo-right">
          <div class="ppo-preview-label">Δείγμα Οδηγού</div>
          <div class="ppo-pdf-mockup">
            <div class="ppo-pdf-header">
              <div class="ppo-pdf-logo">Life<span>Simple</span></div>
              <div class="ppo-pdf-title">${guideTitle}</div>
              <div class="ppo-pdf-subtitle">Πλήρης Οδηγός · ${new Date().getFullYear()}</div>
            </div>
            <div class="ppo-pdf-body">
              ${previewContent.sections.map(s => `
                <div class="ppo-pdf-section">
                  <div class="ppo-pdf-section-title">${s.title}</div>
                  ${s.lines.map(() => '<div class="ppo-pdf-line"></div>').join('')}
                  ${s.shortLine ? '<div class="ppo-pdf-line ppo-pdf-line-short"></div>' : ''}
                </div>
              `).join('')}
            </div>
            <div class="ppo-pdf-watermark">ΔΕΙΓΜΑ</div>
          </div>
          <p class="ppo-preview-note">
            Ο πλήρης οδηγός αποστέλλεται αμέσως μετά την πληρωμή.
          </p>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Animate in
  requestAnimationFrame(() => backdrop.classList.add('ppo-visible'));

  // Close on backdrop click (outside sheet)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeOverlay(backdrop);
  });

  // Back button closes overlay
  backdrop.querySelector('.ppo-back-btn').addEventListener('click', () => {
    closeOverlay(backdrop);
  });

  // Confirm button → proceed to Stripe
  backdrop.querySelector('#ppoConfirmBtn').addEventListener('click', () => {
    const confirmBtn = backdrop.querySelector('#ppoConfirmBtn');
    performCheckout(form, confirmBtn, backdrop);
  });

  // ESC key closes overlay
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeOverlay(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeOverlay(backdrop) {
  backdrop.classList.remove('ppo-visible');
  setTimeout(() => backdrop.remove(), 300);
}

function getPDFPreviewContent(productKey) {
  const defaults = {
    pages: 28,
    sections: [
      { title: '1. Εισαγωγή & Νομικό Πλαίσιο', lines: [1,2,3], shortLine: true },
      { title: '2. Βήμα-βήμα Διαδικασία', lines: [1,2,3,4], shortLine: false },
      { title: '3. Έγγραφα & Χαρτιά', lines: [1,2,3], shortLine: true },
      { title: '4. Κόστη & Χρονοδιαγράμματα', lines: [1,2], shortLine: false },
    ]
  };

  const map = {
    divorcesimple: {
      pages: 32,
      sections: [
        { title: '1. Τύποι Διαζυγίου στην Ελλάδα', lines: [1,2,3], shortLine: true },
        { title: '2. Κοινή Συναίνεση — Βήματα', lines: [1,2,3,4], shortLine: false },
        { title: '3. Απαιτούμενα Έγγραφα', lines: [1,2,3], shortLine: true },
        { title: '4. Επιμέλεια & Διατροφή', lines: [1,2], shortLine: false },
      ]
    },
    willsimple: {
      pages: 26,
      sections: [
        { title: '1. Είδη Διαθήκης', lines: [1,2,3], shortLine: true },
        { title: '2. Ιδιόγραφη Διαθήκη — Οδηγίες', lines: [1,2,3,4], shortLine: false },
        { title: '3. Νόμιμη Μοίρα & Κληρονόμοι', lines: [1,2,3], shortLine: true },
        { title: '4. Συχνά Λάθη & Πώς να τα Αποφύγετε', lines: [1,2], shortLine: false },
      ]
    },
    marriagesimple: {
      pages: 22,
      sections: [
        { title: '1. Πολιτικός vs Θρησκευτικός Γάμος', lines: [1,2,3], shortLine: true },
        { title: '2. Απαιτούμενα Έγγραφα', lines: [1,2,3,4], shortLine: false },
        { title: '3. Χρόνοι & Κόστη', lines: [1,2,3], shortLine: true },
        { title: '4. Συχνές Ερωτήσεις', lines: [1,2], shortLine: false },
      ]
    },
    inheritsimple: {
      pages: 30,
      sections: [
        { title: '1. Αποδοχή ή Αποποίηση Κληρονομιάς', lines: [1,2,3], shortLine: true },
        { title: '2. Φορολογικές Υποχρεώσεις', lines: [1,2,3,4], shortLine: false },
        { title: '3. Μεταβίβαση Ακινήτων', lines: [1,2,3], shortLine: true },
        { title: '4. Χρονοδιάγραμμα Διαδικασίας', lines: [1,2], shortLine: false },
      ]
    },
    separationsimple: {
      pages: 24,
      sections: [
        { title: '1. Χωριστή Διαβίωση vs Διαζύγιο', lines: [1,2,3], shortLine: true },
        { title: '2. Νομική Διαδικασία', lines: [1,2,3,4], shortLine: false },
        { title: '3. Διατροφή & Επιμέλεια', lines: [1,2,3], shortLine: true },
        { title: '4. Επόμενα Βήματα', lines: [1,2], shortLine: false },
      ]
    },
    prenup: {
      pages: 28,
      sections: [
        { title: '1. Τι Καλύπτει η Προγαμιαία Συμφωνία', lines: [1,2,3], shortLine: true },
        { title: '2. Νομικές Προϋποθέσεις', lines: [1,2,3,4], shortLine: false },
        { title: '3. Δείγμα Ρητρών', lines: [1,2,3], shortLine: true },
        { title: '4. Κόστος Συμβολαιογράφου', lines: [1,2], shortLine: false },
      ]
    },
  };

  return map[productKey] || defaults;
}

// ── Perform Checkout (API call → Stripe redirect) ────────
async function performCheckout(form, btn, backdrop) {
  btn.classList.add('loading');
  btn.disabled = true;
  btn.textContent = '⏳ Σύνδεση με Stripe...';

  // Collect all form data
  const rawData = new FormData(form);
  const formData = {};
  const multiFields = {};

  for (const [key, value] of rawData.entries()) {
    if (key in formData) {
      if (!multiFields[key]) multiFields[key] = [formData[key]];
      multiFields[key].push(value);
    } else {
      formData[key] = value;
    }
  }
  Object.assign(formData, multiFields);

  try {
    const response = await fetch('/api/create-checkout-session', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product:     formData.product,
        price:       formData.price,
        productName: formData.productName,
        formData,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Σφάλμα διακομιστή (${response.status})`);
    }

    const { url } = await response.json();

    if (url) {
      window.location.href = url;
    } else {
      throw new Error('Δεν ελήφθη URL πληρωμής.');
    }
  } catch (err) {
    console.error('[checkout]', err);
    // Close overlay and show error toast
    closeOverlay(backdrop);
    showToast(
      `Σφάλμα σύνδεσης: ${err.message}. Παρακαλώ δοκιμάστε ξανά ή επικοινωνήστε με την υποστήριξη.`,
      'error'
    );
  }
}

// ── Form Validation ──────────────────────────────────────
function validateForm(form) {
  let valid = true;

  // Clear previous errors
  form.querySelectorAll('.field-error').forEach(el => el.remove());
  form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

  // Check required fields
  form.querySelectorAll('[required]').forEach(field => {
    const value = field.value.trim();

    if (field.type === 'radio') {
      // Check if any radio in the group is selected
      const name   = field.name;
      const group  = form.querySelectorAll(`input[name="${name}"]`);
      const hasVal = Array.from(group).some(r => r.checked);
      if (!hasVal) {
        const container = field.closest('.radio-group') || field.parentElement;
        showFieldError(container, 'Παρακαλώ επιλέξτε μια απάντηση.');
        valid = false;
      }
      return;
    }

    if (!value) {
      field.classList.add('error');
      showFieldError(field, 'Αυτό το πεδίο είναι υποχρεωτικό.');
      valid = false;
      return;
    }

    // Email format
    if (field.type === 'email' && !isValidEmail(value)) {
      field.classList.add('error');
      showFieldError(field, 'Παρακαλώ εισάγετε έγκυρο email.');
      valid = false;
    }

    // Age minimum
    if (field.name === 'age' && parseInt(value, 10) < 18) {
      field.classList.add('error');
      showFieldError(field, 'Πρέπει να είστε τουλάχιστον 18 ετών.');
      valid = false;
    }
  });

  // Ensure at least one asset checkbox is checked (for WillSimple)
  const assetCheckboxes = form.querySelectorAll('input[name="assets"]');
  if (assetCheckboxes.length > 0) {
    const anyChecked = Array.from(assetCheckboxes).some(cb => cb.checked);
    if (!anyChecked) {
      const container = assetCheckboxes[0].closest('.checkbox-group');
      // Auto-open the <details> so the error is visible
      const detailsEl = assetCheckboxes[0].closest('details');
      if (detailsEl) detailsEl.open = true;
      if (container) {
        showFieldError(container, 'Επιλέξτε τουλάχιστον ένα περιουσιακό στοιχείο.');
        valid = false;
      }
    }
  }

  if (!valid) {
    // Scroll to first error
    const firstError = form.querySelector('.error, .field-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function showFieldError(element, message) {
  const error       = document.createElement('p');
  error.className   = 'field-error';
  error.textContent = message;
  element.after ? element.after(error) : element.parentElement.appendChild(error);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Toast Notification ───────────────────────────────────
function showToast(message, type = 'info') {
  // Remove existing toasts
  document.querySelectorAll('.ls-toast').forEach(el => el.remove());

  const colors = {
    info:    { bg: '#1a2744', text: '#fff' },
    error:   { bg: '#c0392b', text: '#fff' },
    warning: { bg: '#c9a84c', text: '#1a2744' },
    success: { bg: '#2ecc71', text: '#fff' },
  };

  const color = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.className = 'ls-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '24px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   color.bg,
    color:        color.text,
    padding:      '14px 28px',
    borderRadius: '8px',
    fontSize:     '0.95rem',
    fontWeight:   '500',
    maxWidth:     '90vw',
    textAlign:    'center',
    zIndex:       '9999',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.2)',
    lineHeight:   '1.5',
    animation:    'fadeInUp 0.3s ease',
  });

  // CSS animation
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateX(-50%) translateY(16px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}
