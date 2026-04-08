/**
 * LifeSimple — Homepage Quiz + Product Grid Filter + Waitlist
 * ─────────────────────────────────────────────────────────────
 * Quiz: 3-step inline quiz (category → situation → result)
 * Grid: Category filter buttons for the 23-product grid
 * Waitlist: Modal for "coming soon" products
 */

// ── Quiz Data ───────────────────────────────────────────────
const quizData = {
  oikogeneia: {
    label: 'Οικογένεια & Σχέσεις',
    options: [
      { text: 'Θέλω να παντρευτώ',                 product: 'marriagesimple' },
      { text: 'Θέλω σύμφωνο συμβίωσης',            product: 'cohabitsimple' },
      { text: 'Σκέφτομαι προγαμιαίο',              product: 'prenup' },
      { text: 'Θέλω διαζύγιο',                      product: 'divorcesimple' },
      { text: 'Θέλω χωριστή διαβίωση',             product: 'separationsimple' },
      { text: 'Θέμα επιμέλειας παιδιών',           product: 'custodysimple' },
      { text: 'Θέμα διατροφής',                     product: 'alimonysimple' },
    ]
  },
  thanatos: {
    label: 'Θάνατος & Κληρονομιά',
    options: [
      { text: 'Θέλω να κάνω διαθήκη',              product: 'willsimple' },
      { text: 'Έχασα κάποιον — τι κάνω;',          product: 'inheritsimple' },
      { text: 'Πρέπει να οργανώσω κηδεία',         product: 'funeralsimple' },
      { text: 'Θέλω να μεταβιβάσω περιουσία',      product: 'donationsimple' },
    ]
  },
  xrimata: {
    label: 'Χρήματα & Φόροι',
    options: [
      { text: 'Φορολογική δήλωση',                  product: 'taxsimple' },
      { text: 'ΕΝΦΙΑ / φόρος ακινήτου',            product: 'propertytaxsimple' },
      { text: 'Σύνταξη / ΕΦΚΑ',                    product: 'pensionsimple' },
      { text: 'Χρέη / ρύθμιση οφειλών',            product: 'debtsimple' },
    ]
  },
  nomika: {
    label: 'Νομικά',
    options: [
      { text: 'Χρειάζομαι πληρεξούσιο',            product: 'powerofattorneysimple' },
      { text: 'Θέλω να φτιάξω ιδιωτικό συμφωνητικό', product: 'contractsimple' },
      { text: 'Θέλω να κάνω καταγγελία',           product: 'complaintsimple' },
      { text: 'Θέμα ενοικίασης / ιδιοκτησίας',     product: 'tenantsimple' },
    ]
  },
  epixeirisi: {
    label: 'Επιχείρηση',
    options: [
      { text: 'Θέλω να ξεκινήσω ως freelancer',    product: 'freelancesimple' },
      { text: 'Θέλω να φτιάξω ΙΚΕ',               product: 'ikesimple' },
      { text: 'Θέλω να κλείσω επιχείρηση',         product: 'closesimple' },
      { text: 'Τιμολόγηση & myDATA',               product: 'invoicesimple' },
    ]
  }
};

// Product details for the result card
const productInfo = {
  marriagesimple:         { name: 'Marriage<span>Simple</span>', desc: 'Όλα τα χαρτιά και τα βήματα για πολιτικό ή θρησκευτικό γάμο.', price: '€12', live: true, url: '/marriage' },
  cohabitsimple:          { name: 'Cohabit<span>Simple</span>', desc: 'Οδηγός σύμφωνου συμβίωσης, βήμα προς βήμα.', price: '€15', live: true, url: '/cohabit' },
  prenup:                 { name: 'Prenup<span>Simple</span>', desc: 'Προγαμιαία συμφωνία: τι περιλαμβάνει, πώς συντάσσεται.', price: '€29', live: true, url: '/prenup' },
  divorcesimple:          { name: 'Divorce<span>Simple</span>', desc: 'Συναινετικό ή μη διαζύγιο — η διαδικασία απλά.', price: '€19', live: true, url: '/divorce' },
  separationsimple:       { name: 'Separation<span>Simple</span>', desc: 'Χωριστή διαβίωση: πότε, πώς, τι δικαιούσαι.', price: '€19', live: true, url: '/separation' },
  custodysimple:          { name: 'Custody<span>Simple</span>', desc: 'Επιμέλεια τέκνων: δικαιώματα, διαδικασία, συμφωνία γονέων.', price: '€19', live: true, url: '/custody' },
  alimonysimple:          { name: 'Alimony<span>Simple</span>', desc: 'Διατροφή συζύγου & τέκνων: υπολογισμός, δικαιώματα, διαδικασία.', price: '€15', live: true, url: '/alimony' },
  willsimple:             { name: 'Will<span>Simple</span>', desc: 'Πώς να συντάξεις διαθήκη — ιδιόγραφη ή δημόσια.', price: '€29', live: true, url: '/will' },
  inheritsimple:          { name: 'Inherit<span>Simple</span>', desc: 'Κληρονομιά, αποποίηση, προθεσμίες — τι πρέπει να ξέρεις.', price: '€19', live: true, url: '/inherit' },
  funeralsimple:          { name: 'Funeral<span>Simple</span>', desc: 'Τι πρέπει να κάνεις τις πρώτες 48 ώρες μετά από θάνατο.', price: '€15', live: true, url: '/funeral' },
  donationsimple:         { name: 'Donation<span>Simple</span>', desc: 'Γονική παροχή & δωρεά ακινήτου: διαδικασία και φορολογία.', price: '€19', live: true, url: '/donation' },
  taxsimple:              { name: 'Tax<span>Simple</span>', desc: 'Φορολογική δήλωση βήμα-βήμα για αρχάριους.', price: '€12', live: true, url: '/tax' },
  propertytaxsimple:      { name: 'PropertyTax<span>Simple</span>', desc: 'ΕΝΦΙΑ, φόρος μεταβίβασης και τι πρέπει να πληρώσεις.', price: '€15', live: true, url: '/propertytax' },
  pensionsimple:          { name: 'Pension<span>Simple</span>', desc: 'Αίτηση σύνταξης ΕΦΚΑ: έγγραφα, προϋποθέσεις, υπολογισμός.', price: '€15', live: true, url: '/pension' },
  debtsimple:             { name: 'Debt<span>Simple</span>', desc: 'Ρύθμιση χρεών & εξωδικαστικός μηχανισμός — τα δικαιώματά σου.', price: '€12', live: true, url: '/debt' },
  powerofattorneysimple:  { name: 'PowerOfAttorney<span>Simple</span>', desc: 'Πληρεξούσιο: τύποι, κόστος, πώς το βγάζεις.', price: '€15', live: true, url: '/powerattorney' },
  contractsimple:         { name: 'Contract<span>Simple</span>', desc: 'Ιδιωτικό συμφωνητικό: πρότυπο και οδηγός σύνταξης.', price: '€19', live: true, url: '/contract' },
  complaintsimple:        { name: 'Complaint<span>Simple</span>', desc: 'Πώς κάνεις καταγγελία σε ΣΕΠΕ, καταναλωτή, ΑΠΔΠΧ.', price: '€12', live: true, url: '/complaint' },
  tenantsimple:           { name: 'Tenant<span>Simple</span>', desc: 'Δικαιώματα ενοικιαστή & ιδιοκτήτη — τι ισχύει.', price: '€15', live: true, url: '/tenant' },
  freelancesimple:        { name: 'Freelance<span>Simple</span>', desc: 'Άνοιγμα ατομικής: ΕΦΚΑ, ΔΟΥ, υποχρεώσεις.', price: '€19', live: true, url: '/freelance' },
  ikesimple:              { name: 'IKE<span>Simple</span>', desc: 'Σύσταση ΙΚΕ μέσω One Stop Shop, βήμα-βήμα.', price: '€25', live: true, url: '/ike' },
  closesimple:            { name: 'Close<span>Simple</span>', desc: 'Κλείσιμο επιχείρησης: λύση, εκκαθάριση, φορολογική ενημερότητα.', price: '€19', live: true, url: '/close' },
  invoicesimple:          { name: 'Invoice<span>Simple</span>', desc: 'Τιμολόγηση, myDATA, αποδείξεις — τα βασικά.', price: '€9', live: true, url: '/invoice' },
};

// ── Quiz State ──────────────────────────────────────────────
let quizCategory = null;
let quizProduct  = null;

// ── Quiz Functions ──────────────────────────────────────────
function quizSelectCategory(btn) {
  quizCategory = btn.dataset.category;
  const catData = quizData[quizCategory];
  if (!catData) return;

  // Build Q2 options
  const q2Container = document.getElementById('quizQ2Options');
  q2Container.innerHTML = '';

  catData.options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'quiz-option';
    b.dataset.product = opt.product;
    b.innerHTML = `<span>${opt.text}</span>`;
    b.addEventListener('click', () => quizSelectProduct(opt.product));
    q2Container.appendChild(b);
  });

  showQuizStep(2);
}

function quizSelectProduct(productKey) {
  quizProduct = productKey;
  const info = productInfo[productKey];
  if (!info) return;

  const resultContainer = document.getElementById('quizResult');

  let resultHTML = `
    <div class="quiz-result-card">
      <div class="quiz-result-name">${info.name}</div>
      <p class="quiz-result-desc">${info.desc}</p>
      <div class="quiz-result-price">${info.price} <small>εφάπαξ</small></div>
  `;

  if (info.live) {
    resultHTML += `
      <a href="${info.url}" class="btn btn-primary quiz-result-cta">Ξεκίνα τώρα →</a>
    `;
  } else {
    resultHTML += `
      <p style="color:#8a7640;font-weight:600;font-size:0.95rem;margin-bottom:0.75rem;">Αυτός ο Φάκελος ετοιμάζεται!</p>
      <p style="color:#5a6b8a;font-size:0.9rem;margin-bottom:1rem;">Άφησε το email σου και θα σε ειδοποιήσουμε πρώτο/η.</p>
      <form class="quiz-waitlist-form" onsubmit="submitQuizWaitlist(event, '${info.slug}')">
        <input type="email" placeholder="Το email σου" required>
        <button type="submit" class="btn btn-primary" style="width:100%;">Θέλω ειδοποίηση</button>
      </form>
      <div class="quiz-waitlist-success" style="display:none;color:#2ecc71;font-weight:600;text-align:center;margin-top:0.75rem;">
        Ευχαριστούμε! Θα σε ειδοποιήσουμε.
      </div>
    `;
  }

  resultHTML += `
      <a href="#product-grid" class="quiz-result-scroll">Δες όλες τις υπηρεσίες ↓</a>
    </div>
  `;

  resultContainer.innerHTML = resultHTML;
  showQuizStep(3);
}

function quizGoBack(toStep) {
  showQuizStep(toStep);
}

function showQuizStep(step) {
  // Hide all steps
  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));

  // Show target step
  const target = document.getElementById('quizStep' + step);
  if (target) target.classList.add('active');

  // Update progress
  const progressBar = document.getElementById('quizProgressBar');
  const stepLabel   = document.getElementById('quizStepLabel');

  const widths = { 1: '33%', 2: '66%', 3: '100%' };
  const labels = { 1: 'Βήμα 1 / 3', 2: 'Βήμα 2 / 3', 3: 'Αποτέλεσμα' };

  if (progressBar) progressBar.style.width = widths[step] || '33%';
  if (stepLabel)   stepLabel.textContent    = labels[step] || '';
}

// ── Quiz Waitlist Submit (inside quiz result) ───────────────
async function submitQuizWaitlist(e, slug) {
  e.preventDefault();
  const form  = e.target;
  const email = form.querySelector('input[type="email"]').value.trim();
  if (!email) return;

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, product_slug: slug }),
    });

    if (res.ok) {
      form.style.display = 'none';
      const success = form.nextElementSibling;
      if (success) success.style.display = 'block';
    }
  } catch (err) {
    console.error('[waitlist]', err);
  }
}

// ── Product Grid Filter ─────────────────────────────────────
function filterGrid(btn) {
  const filter = btn.dataset.filter;

  // Update active button
  document.querySelectorAll('.pgrid-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Filter cards
  document.querySelectorAll('.pgrid-card').forEach(card => {
    if (filter === 'all' || card.dataset.category === filter) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// ── Waitlist Modal ──────────────────────────────────────────
function openWaitlistModal(slug, productName) {
  const modal = document.getElementById('waitlistModal');
  const input = document.getElementById('waitlistProduct');
  const form  = document.getElementById('waitlistForm');
  const success = document.getElementById('waitlistSuccess');

  if (input) input.value = slug;
  if (form) form.style.display = 'block';
  if (success) success.style.display = 'none';
  if (modal) modal.style.display = 'flex';
}

function closeWaitlistModal() {
  const modal = document.getElementById('waitlistModal');
  if (modal) modal.style.display = 'none';
}

async function submitWaitlist(e) {
  e.preventDefault();
  const form    = document.getElementById('waitlistForm');
  const email   = document.getElementById('waitlistEmail').value.trim();
  const slug    = document.getElementById('waitlistProduct').value;
  const success = document.getElementById('waitlistSuccess');

  if (!email || !slug) return;

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, product_slug: slug }),
    });

    if (res.ok) {
      form.style.display = 'none';
      if (success) success.style.display = 'block';
      // Auto-close after 2.5s
      setTimeout(() => closeWaitlistModal(), 2500);
    }
  } catch (err) {
    console.error('[waitlist]', err);
  }
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('waitlistModal');
  if (e.target === modal) closeWaitlistModal();
});

// Close modal on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeWaitlistModal();
});
