/**
 * LifeSimple — Frontend JavaScript
 * Handles:
 *   - Nav hamburger toggle
 *   - FAQ accordion
 *   - Conditional form fields
 *   - Form validation
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
    form.addEventListener('submit', handleFormSubmit);
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

// ── Form Submit → Stripe Checkout ───────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();

  const form   = e.target;
  const payBtn = document.getElementById('payBtn');

  // Validate required fields
  const isValid = validateForm(form);
  if (!isValid) return;

  // Collect all form data
  const rawData = new FormData(form);
  const formData = {};
  const multiFields = {}; // for checkboxes with multiple values

  for (const [key, value] of rawData.entries()) {
    if (key in formData) {
      // Already seen — convert to array
      if (!multiFields[key]) {
        multiFields[key] = [formData[key]];
      }
      multiFields[key].push(value);
    } else {
      formData[key] = value;
    }
  }
  // Merge multi-value fields
  Object.assign(formData, multiFields);

  // Show loading state
  payBtn.classList.add('loading');
  payBtn.disabled = true;

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
    showToast(
      `Σφάλμα σύνδεσης: ${err.message}. Παρακαλώ δοκιμάστε ξανά ή επικοινωνήστε με την υποστήριξη.`,
      'error'
    );
    payBtn.classList.remove('loading');
    payBtn.disabled = false;
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
