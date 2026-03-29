/**
 * LifeSimple — Node.js / Express Backend
 * ─────────────────────────────────────────────────────────────
 * Routes:
 *   POST /api/create-checkout-session   → creates Stripe session
 *   POST /api/webhook                   → Stripe webhook handler
 *   GET  /will, /divorce, /marriage,
 *        /obituary, /separation         → serve product HTML pages
 *   GET  /terms, /privacy               → legal pages
 *   GET  /success                       → success page
 *   GET  /*                             → serve static files
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const bodyParser = require('body-parser');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── In-memory store: sessionId → formData
// In production, replace with Redis or a database
const pendingOrders = new Map();

// ────────────────────────────────────────────────────────────
// MIDDLEWARE
// ────────────────────────────────────────────────────────────

app.use(cors());

// Stripe webhook MUST receive raw body — set up before json parser
app.use('/api/webhook', bodyParser.raw({ type: 'application/json' }));

// Parse JSON for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// ────────────────────────────────────────────────────────────
// PRODUCT PAGE ROUTES  (clean URLs without .html)
// ────────────────────────────────────────────────────────────

const pages = ['will', 'divorce', 'marriage', 'obituary', 'separation', 'prenup', 'success', 'terms', 'privacy'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// ────────────────────────────────────────────────────────────
// STRIPE — Create Checkout Session
// ────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const {
      product,
      price,       // in cents (e.g. 2900 for €29)
      productName,
      formData,    // all form fields from the frontend
    } = req.body;

    if (!product || !price || !productName || !formData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Support both split name fields and legacy fullName
    const displayName = formData.firstName
      ? (formData.firstName + ' ' + (formData.lastName || '')).trim()
      : (formData.fullName || 'Πελάτης');

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: productName,
              description: 'Εξατομικευμένο PDF αποστέλλεται στο email σας εντός 5 λεπτών.',
              images: [],
            },
            unit_amount: parseInt(price, 10),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/${product.replace('simple', '')}?cancelled=1`,
      customer_email: formData.email,
      metadata: {
        product,
        customer_email: formData.email,
        customer_name:  displayName,
      },
    });

    // Store form data keyed by Stripe session ID
    pendingOrders.set(session.id, {
      product,
      productName,
      formData,
      displayName,
      createdAt: Date.now(),
    });

    // Clean up old entries (>2 hours)
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, order] of pendingOrders.entries()) {
      if (order.createdAt < cutoff) pendingOrders.delete(id);
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// STRIPE WEBHOOK — Payment Confirmed → Generate PDF → Send Email
// ────────────────────────────────────────────────────────────

app.post('/api/webhook', async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.id;

    console.log(`[webhook] Payment confirmed — session: ${sessionId}`);

    const order = pendingOrders.get(sessionId);
    if (!order) {
      console.warn(`[webhook] No order data found for session: ${sessionId}`);
      return res.json({ received: true });
    }

    // Process asynchronously — don't block the webhook response
    processOrder(order, session).catch(err =>
      console.error('[processOrder] Error:', err)
    );

    pendingOrders.delete(sessionId);
  }

  res.json({ received: true });
});

// ────────────────────────────────────────────────────────────
// PROCESS ORDER: Claude → PDF → SendGrid
// ────────────────────────────────────────────────────────────

async function processOrder(order, stripeSession) {
  const { product, productName, formData, displayName } = order;

  // Compute display name (support both split and legacy fields)
  const customerName = displayName ||
    (formData.firstName
      ? (formData.firstName + ' ' + (formData.lastName || '')).trim()
      : (formData.fullName || 'Πελάτης'));

  console.log(`[processOrder] Generating content for: ${productName}`);

  try {
    // 1. Generate personalised content with Claude
    const content = await generateWithClaude(product, productName, formData, customerName);

    // 2. Build PDF
    const pdfBuffer = await buildPDF(productName, formData, content, customerName);

    // 3. Send email with PDF attachment
    await sendEmailWithPDF({
      toEmail:     formData.email,
      toName:      customerName,
      productName,
      pdfBuffer,
    });

    console.log(`[processOrder] ✓ PDF sent to ${formData.email}`);
  } catch (err) {
    console.error(`[processOrder] Failed for ${formData.email}:`, err);
  }
}

// ────────────────────────────────────────────────────────────
// CLAUDE API — Generate Personalised Report Content
// ────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Builds a detailed system prompt per product type, then calls Claude.
 * Returns structured content sections as an object.
 */
async function generateWithClaude(product, productName, formData, customerName) {
  const systemPrompt = buildSystemPrompt(product);
  const userPrompt   = buildUserPrompt(product, formData, customerName);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}

function buildSystemPrompt(product) {
  const base = `Είσαι ειδικός σε ελληνικές νομικές και διοικητικές διαδικασίες με πάνω από 20 χρόνια εμπειρίας.
Γράφεις ΛΕΠΤΟΜΕΡΕΙΣ, ΕΞΑΤΟΜΙΚΕΥΜΕΝΟΥΣ επαγγελματικούς οδηγούς στα ελληνικά για ιδιώτες.
Κάθε οδηγός πρέπει να είναι ΕΚΤΕΝΗΣ και να καλύπτει ΟΛΑ τα θέματα σε βάθος.

ΚΑΝΟΝΕΣ ΜΟΡΦΟΠΟΙΗΣΗΣ:
- Γράψε ΤΟΥΛΑΧΙΣΤΟΝ 2500 λέξεις συνολικά
- Κάθε ενότητα πρέπει να έχει τουλάχιστον 300-400 λέξεις
- Χρησιμοποίησε ΔΗΜΟΤΙΚΗν ΕΛΛΗΝΙΚΗ γλώσσα
- Επαγγελματικό και επίσημο αλλά ευανάγνωστο ύφος
- Ξεκίνα κάθε ενότητα με τον τίτλο ως πρώτη γραμμή
- Χρησιμοποίησε αριθμημένες λίστες, bullet points (-), υπο-ενότητες
- Συμπερίλαβε συγκεκριμένες πρακτικές συμβουλές, χρονοδιαγράμματα, κόστη (εκτιμώμενα) και παραδείγματα
- Αναφέρσου ΠΑΝΤΑ στα προσωπικά στοιχεία του πελάτη για εξατομίκευση
- Χωρίς νομική ευθύνη (ξεκάθαρα disclaimer στο τέλος)

ΔΟΜΗ: Μορφοποίησε ΟΛΗ την απόκριση ως:
[ΕΝΟΤΗΤΑ_1]Τίτλος Ενότητας
Εκτενές περιεχόμενο ενότητας...[/ΕΝΟΤΗΤΑ_1]
[ΕΝΟΤΗΤΑ_2]Τίτλος Ενότητας
Εκτενές περιεχόμενο ενότητας...[/ΕΝΟΤΗΤΑ_2]
κ.λπ.`;

  const productInstructions = {
    willsimple: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΔΙΑΘΗΚΗΣ. Πρέπει να έχει ΑΚΡΙΒΩΣ 7 ενότητες:

[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση της Κατάστασής Σας
- Συνοψή της ατομικής κατάστασης βάσει των στοιχείων
- Γιατί η σύνταξη διαθήκης είναι κρίσιμη σε αυτή τη φάση ζωής
- Τι θα αλλάξει αν δεν υπάρχει διαθήκη (ab intestato κληρονομιά)
- Τρέχουσα νομοθεσία στην Ελλάδα (Αστικός Κώδικας)

[ΕΝΟΤΗΤΑ_2] Ποιος Τύπος Διαθήκης Ταιριάζει στην Κατάστασή Σας
- Ιδιόγραφη διαθήκη: προϋποθέσεις, πλεονεκτήματα, μειονεκτήματα, κόστος
- Δημόσια διαθήκη ενώπιον συμβολαιογράφου: διαδικασία, κόστος (~200-400€), διαφύλαξη
- Μυστική διαθήκη: πότε χρησιμοποιείται, διαδικασία
- Σύσταση βάσει των δεδομένων σας με αιτιολόγηση

[ΕΝΟΤΗΤΑ_3] Νόμιμη Μοίρα, Κληρονόμοι και Εξ Αδιαθέτου Κληρονομιά
- Ποιοι είναι οι νόμιμοι κληρονόμοι στην Ελλάδα (κατά τάξη)
- Ποσοστά νόμιμης μοίρας βάσει οικογενειακής κατάστασης
- Τι μπορείτε να διαθέσετε ελεύθερα
- Ειδική ανάλυση βάσει της δικής σας οικογενειακής κατάστασης

[ΕΝΟΤΗΤΑ_4] Ανάλυση Περιουσιακών Στοιχείων και Κληρονόμηση
- Κατανομή ακινήτων: φορολογία, μεταβίβαση, γονική παροχή
- Τραπεζικοί λογαριασμοί: δικαιούχοι, κληρονόμηση
- Επενδύσεις, μετοχές: μεταβίβαση τίτλων
- Επιχειρήσεις/εταιρικά μερίδια: ειδικές ρυθμίσεις
- Εκτιμώμενα φορολογικά βάρη για κάθε κατηγορία

[ΕΝΟΤΗΤΑ_5] Ειδικές Επιθυμίες — Πώς να τις Καταγράψετε Νόμιμα
- Δωρεές σε φιλανθρωπία, εκκλησία, ή τρίτους
- Κηδεμονία ανηλίκων παιδιών
- Επιτηρητής/Εκτελεστής διαθήκης: ρόλος και αρμοδιότητες
- Ειδικά κληροδοτήματα (αντικείμενα, αυτοκίνητα, κοσμήματα)
- Τι ΔΕΝ μπορεί να συμπεριληφθεί σε διαθήκη

[ΕΝΟΤΗΤΑ_6] Απαιτούμενα Έγγραφα και Βήματα Σύνταξης
- Πλήρης λίστα εγγράφων ανά τύπο διαθήκης
- Πού να απευθυνθείτε (Συμβολαιογραφείο, ΚΕΠ, ΓΕΜΗ)
- Κόστη και αμοιβές (αναλυτικά)
- Συχνά λάθη που ακυρώνουν τη διαθήκη
- Πότε και πώς να ανανεώσετε/τροποποιήσετε τη διαθήκη

[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα — Εβδομαδιαίο Χρονοδιάγραμμα Δράσης
- Εβδομάδα 1: Άμεσες ενέργειες
- Εβδομάδα 2-3: Συλλογή εγγράφων
- Εβδομάδα 4: Ραντεβού με συμβολαιογράφο
- Μακροπρόθεσμα: Επικαιροποίηση διαθήκης
- Χρήσιμες επαφές και υπηρεσίες`,

    divorcesimple: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΔΙΑΖΥΓΙΟΥ. Πρέπει να έχει ΑΚΡΙΒΩΣ 7 ενότητες:

[ΕΝΟΤΗΤΑ_1] Αξιολόγηση Κατάστασής Σας και Άμεσες Επιλογές
- Ανάλυση της τρέχουσας κατάστασης βάσει των στοιχείων
- Νομικό πλαίσιο διαζυγίου στην Ελλάδα (ν. 4800/2021)
- Ποια είναι η βέλτιστη στρατηγική για τη δική σας περίπτωση
- Χρονοδιάγραμμα και κόστος ανά επιλογή

[ΕΝΟΤΗΤΑ_2] Συναινετικό vs Αντιδικία — Πλήρης Ανάλυση
- Συναινετικό διαζύγιο: απαιτήσεις, διαδικασία, κόστος (~1000-3000€)
- Αντιδικία: λόγοι, διαδικασία, κόστος (~3000-15000€)
- Νέο νομοθετικό πλαίσιο μετά το 2021
- Ανάλυση ποιο εφαρμόζεται στη δική σας περίπτωση
- Ειδική μέθοδος: Διαμεσολάβηση (εναλλακτική λύση)

[ΕΝΟΤΗΤΑ_3] Απαιτούμενα Έγγραφα — Πλήρης Λίστα
- Κοινά έγγραφα για κάθε τύπο διαζυγίου
- Επιπλέον έγγραφα για συναινετικό
- Επιπλέον έγγραφα για αντιδικία
- Πού εκδίδεται το καθένα, κόστος και χρόνος
- Ψηφιακές υπηρεσίες (gov.gr, ΚΕΠ)

[ΕΝΟΤΗΤΑ_4] Επιμέλεια Παιδιών, Διατροφή και Επικοινωνία
- Νέο δίκαιο επιμέλειας (ν. 4800/2021): από κοινή επιμέλεια
- Πώς ορίζεται η διατροφή — υπολογισμός ποσού
- Δικαίωμα επικοινωνίας γονέα εκτός κατοικίας
- Τι γίνεται σε περίπτωση διαφωνίας
- Εξατομικευμένη ανάλυση για την κατάστασή σας

[ΕΝΟΤΗΤΑ_5] Διαίρεση Περιουσίας — Δικαιώματα και Διαδικασία
- Κοινά περιουσιακά στοιχεία: τι ανήκει σε ποιον
- Ακίνητα: μεταβίβαση, φορολογία, υποθήκες
- Τραπεζικοί λογαριασμοί και επενδύσεις
- Συνταξιοδοτικά δικαιώματα (ΕΦΚΑ)
- Χρέη και δάνεια: ποιος τα πληρώνει

[ΕΝΟΤΗΤΑ_6] Χρονοδιάγραμμα Όλης της Διαδικασίας
- Φάση 1 (0-4 εβδομάδες): Προετοιμασία
- Φάση 2 (1-3 μήνες): Νομικές ενέργειες
- Φάση 3 (3-12 μήνες): Δικαστήριο/συμβολαιογράφος
- Φάση 4: Εκτέλεση απόφασης
- Μεταβατική περίοδος: τι αλλάζει αμέσως

[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα και Λίστα Δράσης
- Άμεσες ενέργειες (αυτή την εβδομάδα)
- Εύρεση δικηγόρου: τι να ζητήσετε, πώς να συγκρίνετε αμοιβές
- Πρακτικά θέματα (διαμονή, εξοδα, λογαριασμοί)
- Ψυχολογική υποστήριξη και πόροι
- Χρήσιμες επαφές`,

    marriagesimple: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΓΑΜΟΥ. Πρέπει να έχει ΑΚΡΙΒΩΣ 6 ενότητες:

[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση της Κατάστασής Σας
[ΕΝΟΤΗΤΑ_2] Τύπος Γάμου — Πλήρης Ανάλυση και Σύσταση
[ΕΝΟΤΗΤΑ_3] Απαιτούμενα Έγγραφα — Αναλυτική Λίστα ανά Σύντροφο
[ΕΝΟΤΗΤΑ_4] Ειδικές Απαιτήσεις (Αλλοδαπός/ή, Προηγούμενος Γάμος)
[ΕΝΟΤΗΤΑ_5] Χρονοδιάγραμμα — Από Αίτηση έως Τελετή
[ΕΝΟΤΗΤΑ_6] Μετά τον Γάμο — Αλλαγή Εγγράφων και Επόμενα Βήματα

Κάθε ενότητα να είναι εκτενής (400+ λέξεις) με συγκεκριμένες οδηγίες.`,

    obituarysimple: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΔΙΑΔΙΚΑΣΙΩΝ ΘΑΝΑΤΟΥ. Πρέπει να έχει ΑΚΡΙΒΩΣ 7 ενότητες:

[ΕΝΟΤΗΤΑ_1] Πρώτες 48 Ώρες — Άμεσες και Επείγουσες Ενέργειες
[ΕΝΟΤΗΤΑ_2] Ληξιαρχείο, Κηδεία και Επίσημα Έγγραφα
[ΕΝΟΤΗΤΑ_3] Κληρονομιά — Με ή Χωρίς Διαθήκη
[ΕΝΟΤΗΤΑ_4] Φορολογικές Υποχρεώσεις και Φόρος Κληρονομιάς
[ΕΝΟΤΗΤΑ_5] Τραπεζικοί Λογαριασμοί, Ασφαλίσεις και ΕΦΚΑ
[ΕΝΟΤΗΤΑ_6] Ακίνητα και Μεταβίβαση Περιουσίας
[ΕΝΟΤΗΤΑ_7] Χρονοδιάγραμμα Ολοκλήρωσης και Επόμενα Βήματα

Κάθε ενότητα να είναι εκτενής (400+ λέξεις) με συγκεκριμένα ποσά, προθεσμίες και επαφές.`,

    separationsimple: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΧΩΡΙΣΜΟΥ ΣΥΓΚΑΤΟΙΚΟΥΝΤΩΝ. Πρέπει να έχει ΑΚΡΙΒΩΣ 7 ενότητες:

[ΕΝΟΤΗΤΑ_1] Αξιολόγηση Κατάστασης και Νομικό Πλαίσιο
[ΕΝΟΤΗΤΑ_2] Νομικά Δικαιώματα — Συγκατοίκηση vs Σύμφωνο Συμβίωσης
[ΕΝΟΤΗΤΑ_3] Λύση Συμφώνου Συμβίωσης (αν εφαρμόζεται)
[ΕΝΟΤΗΤΑ_4] Κοινή Κατοικία, Ενοίκιο και Περιουσία
[ΕΝΟΤΗΤΑ_5] Επιμέλεια και Διατροφή Παιδιών Εκτός Γάμου
[ΕΝΟΤΗΤΑ_6] Πρακτικά Βήματα Χωρισμού — ΑΦΜ, Ασφάλιση, Διεύθυνση
[ΕΝΟΤΗΤΑ_7] Χρονοδιάγραμμα, Κόστη και Επόμενα Βήματα

Κάθε ενότητα να είναι εκτενής (400+ λέξεις) με συγκεκριμένες οδηγίες για την Ελλάδα.`,

    prenup: `Δημιουργείς ΠΛΗΡΗ ΟΔΗΓΟ ΠΡΟΓΑΜΙΑΙΟΥ ΣΥΜΒΟΛΑΙΟΥ και ΔΟΜΗΜΕΝΟ ΕΓΓΡΑΦΟ ΕΠΙΘΥΜΙΩΝ. Πρέπει να έχει ΑΚΡΙΒΩΣ 7 ενότητες:

[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση Κατάστασης Ζευγαριού
- Ανάλυση της κατάστασης βάσει των στοιχείων
- Γιατί το προγαμιαίο συμβόλαιο είναι χρήσιμο σε αυτή την περίπτωση
- Τι ισχύει στην Ελλάδα χωρίς προγαμιαίο (κοινοκτημοσύνη, ΑΚ 1397 κ.επ.)

[ΕΝΟΤΗΤΑ_2] Νομικό Πλαίσιο Προγαμιαίου Συμβολαίου στην Ελλάδα
- Νόμιμο πλαίσιο (ΑΚ 1403 κ.επ. — σύμβαση περιουσιακών σχέσεων)
- Τι ΜΠΟΡΕΙ να περιλαμβάνει: περιουσία, αποκλεισμός κοινοκτημοσύνης
- Τι ΔΕΝ ΜΠΟΡΕΙ να περιλαμβάνει: διατροφή, επιμέλεια, παράνομα στοιχεία
- Διαφορά ελληνικού prenup από αγγλοσαξονικό μοντέλο

[ΕΝΟΤΗΤΑ_3] Ανάλυση Περιουσίας και Δικαιώματα
- Τρέχουσα περιουσία κάθε συντρόφου (βάσει στοιχείων)
- Ακίνητα: πώς προστατεύονται, τι γίνεται με αξία που αποκτήθηκε πριν/μετά
- Επιχειρήσεις: προστασία εταιρικών μεριδίων και υπεραξίας
- Μελλοντικά περιουσιακά στοιχεία και κληρονομιές

[ΕΝΟΤΗΤΑ_4] Δομημένο Έγγραφο Επιθυμιών — Πλαίσιο Συμβολαίου
- ΕΙΔΙΚΗ ΕΝΟΤΗΤΑ: Δομημένο κείμενο-πρότυπο με τις επιθυμίες του ζευγαριού
- Βάσει των στοιχείων, διατυπώστε σαφείς προτάσεις για το συμβόλαιο
- Αυτό το τμήμα να είναι έτοιμο να παραδοθεί στον συμβολαιογράφο

[ΕΝΟΤΗΤΑ_5] Διαδικασία Επίσημης Σύνταξης
- Ποιος συντάσσει το συμβόλαιο (συμβολαιογράφος)
- Απαιτούμενα έγγραφα για κάθε σύντροφο
- Κόστος (συμβολαιογραφικά τέλη: ~200-600€)
- Πότε πρέπει να συνταχθεί (πριν τον γάμο)
- Τι γίνεται αν θέλετε να το αλλάξετε μετά

[ΕΝΟΤΗΤΑ_6] Ειδικά Θέματα — Επιχείρηση, Κληρονομιά, Χρέη
- Προστασία υπάρχουσας επιχείρησης (αν εφαρμόζεται)
- Τι γίνεται με χρέη που έχει ο κάθε σύντροφος
- Κληρονομίες και δωρεές: αποκλεισμός από κοινή περιουσία
- Φορολογικές επιπτώσεις

[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα και Χρονοδιάγραμμα
- Άμεσα βήματα: εύρεση συμβολαιογράφου, συλλογή εγγράφων
- Σύσταση: πώς να συζητήσετε το θέμα με τον σύντροφό σας
- Χρονοδιάγραμμα (2-4 εβδομάδες από απόφαση μέχρι υπογραφή)
- Χρήσιμες επαφές (Συμβολαιογραφικός Σύλλογος, Δικηγόρος)
- Σύσταση: αναθεώρηση σε μεγάλες αλλαγές ζωής`,
  };

  return base + '\n\n' + (productInstructions[product] || '');
}

function buildUserPrompt(product, formData, customerName) {
  const lines = [`ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ: ${customerName}`, ''];
  lines.push('Λεπτομερής ανάλυση απαντήσεων από τη φόρμα:');

  // Map field names to Greek labels for readability
  const fieldLabels = {
    firstName:        'Όνομα',
    lastName:         'Επώνυμο',
    fullName:         'Ονοματεπώνυμο',
    maritalStatus:    'Οικογενειακή κατάσταση',
    hasChildren:      'Έχει παιδιά',
    childrenCount:    'Αριθμός παιδιών',
    childrenDetails:  'Στοιχεία παιδιών',
    assets:           'Περιουσιακά στοιχεία',
    sharedAssets:     'Κοινά περιουσιακά στοιχεία',
    specialWishes:    'Ειδικές επιθυμίες',
    age:              'Ηλικία',
    divorceType:      'Τύπος διαζυγίου',
    yearsMarried:     'Χρόνια γάμου',
    livingArrangement:'Διαμονή',
    marriageType:     'Τύπος γάμου',
    citizenship1:     'Ιθαγένεια αιτούντος',
    citizenship2:     'Ιθαγένεια συντρόφου',
    previousMarriage: 'Προηγούμενος γάμος',
    city:             'Πόλη',
    weddingDate:      'Ημερομηνία γάμου',
    relationship:     'Σχέση με αποθανόντα',
    hasWill:          'Ύπαρξη διαθήκης',
    heirsCount:       'Αριθμός κληρονόμων',
    daysSinceDeath:   'Ημέρες από θάνατο',
    relationshipType: 'Τύπος σχέσης',
    yearsToghether:   'Χρόνια μαζί',
    isAmicable:       'Φιλικός χωρισμός',
    additionalInfo:   'Επιπλέον πληροφορίες',
    partnerFirstName: 'Όνομα συντρόφου',
    partnerLastName:  'Επώνυμο συντρόφου',
    hasProperty:      'Ύπαρξη ακινήτων/περιουσίας',
    hasBusiness:      'Ύπαρξη επιχείρησης',
    specificWishes:   'Ειδικές επιθυμίες για συμβόλαιο',
  };

  const valueLabels = {
    single: 'Άγαμος/η', married: 'Έγγαμος/η', divorced: 'Διαζευγμένος/η',
    widowed: 'Χήρος/α', cohabiting: 'Σύμφωνο συμβίωσης',
    yes: 'Ναι', no: 'Όχι', unknown: 'Δεν γνωρίζω',
    consensual: 'Συναινετικό', contested: 'Αντιδικία', unsure: 'Δεν είμαι σίγουρος/η',
    property: 'Ακίνητα', bank: 'Τραπεζικοί λογαριασμοί', investments: 'Επενδύσεις',
    business: 'Επιχείρηση', vehicles: 'Οχήματα', other: 'Άλλα',
    pension: 'Σύνταξη/ΕΦΚΑ', insurance: 'Ασφαλιστήριο ζωής', debts: 'Χρέη',
    rental: 'Ενοικιαζόμενη κατοικία', none: 'Κανένα',
    civil: 'Πολιτικός γάμος', religious: 'Θρησκευτικός (Ορθόδοξος)',
    other_religious: 'Θρησκευτικός (άλλης θρησκείας)',
    greek: 'Ελληνική', eu: 'Άλλη χώρα ΕΕ', non_eu: 'Εκτός ΕΕ',
    spouse: 'Σύζυγος', child: 'Τέκνο', parent: 'Γονέας',
    sibling: 'Αδελφός/ή', other_relative: 'Άλλος συγγενής', executor: 'Εκτελεστής',
    civil_partnership: 'Σύμφωνο συμβίωσης',
    together: 'Ακόμα συγκατοικούμε', separated: 'Ξεχωριστά',
  };

  for (const [key, value] of Object.entries(formData)) {
    if (['email', 'product', 'price', 'productName'].includes(key)) continue;
    if (!value || value === '') continue;

    const label = fieldLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let val = Array.isArray(value)
      ? value.map(v => valueLabels[v] || v).join(', ')
      : (valueLabels[value] || value);

    lines.push(`• ${label}: ${val}`);
  }

  lines.push('');
  lines.push(`ΟΔΗΓΙΕΣ ΔΗΜΙΟΥΡΓΙΑΣ:`);
  lines.push(`1. Αναφέρσου στον/ην ${customerName} ΩΣ ΠΡΟΣΩΠΟ σε όλο τον οδηγό`);
  lines.push(`2. Προσαρμόσε ΚΑΘΕαπάντηση στα συγκεκριμένα στοιχεία που παρέχονται`);
  lines.push(`3. Γράψε ΤΟΥΛΑΧΙΣΤΟΝ 2500 λέξεις — αυτός είναι επαγγελματικός οδηγός`);
  lines.push(`4. Συμπερίλαβε πρακτικές λεπτομέρειες: ποσά, χρόνους, υπηρεσίες, διευθύνσεις`);
  lines.push(`5. Κάθε ενότητα πρέπει να είναι ΕΚΤΕΝΗΣ και ΠΛΗΡΗΣ`);
  lines.push(`6. Χρησιμοποίησε bullet points (-) και αριθμημένες λίστες για σαφήνεια`);
  lines.push(`\nΔημιούργησε τώρα τον πλήρη, εξατομικευμένο οδηγό για τον/ην ${customerName}.`);

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────
// PDF GENERATION — pdfkit with Unicode Greek font support
// ────────────────────────────────────────────────────────────

const PDFDocument = require('pdfkit');
const fs = require('fs');

// Font paths — bundled DejaVu fonts support Greek Unicode
const FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD    = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

function buildPDF(productName, formData, claudeContent, customerName) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 55, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    // Register Unicode fonts
    doc.registerFont('Regular', FONT_REGULAR);
    doc.registerFont('Bold',    FONT_BOLD);

    const NAVY  = '#1a2744';
    const GOLD  = '#c9a84c';
    const LIGHT = '#f7f5f0';
    const TEXT  = '#2c2c2c';
    const SUB   = '#5a6b8a';
    const PW    = doc.page.width;
    const PH    = doc.page.height;

    // ── Helper: add page numbers to all pages ──
    function addPageNumbers() {
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(pages.start + i);
        // Footer bar
        doc.rect(0, PH - 36, PW, 36).fill('#1a2744');
        doc
          .fillColor('#8fa3c8')
          .font('Regular')
          .fontSize(8)
          .text(
            `LifeSimple · lifesimple.gr — Σελίδα ${i + 1} από ${pages.count}`,
            55, PH - 22,
            { width: PW - 110, align: 'center' }
          );
      }
    }

    // ════════════════════════════════════════════════════════
    // PAGE 1: COVER PAGE
    // ════════════════════════════════════════════════════════

    // Full navy header bar
    doc.rect(0, 0, PW, 110).fill(NAVY);

    // Logo
    doc
      .fillColor('#ffffff')
      .font('Bold')
      .fontSize(28)
      .text('Life', 55, 28, { continued: true })
      .fillColor(GOLD)
      .text('Simple');

    doc
      .fillColor('#8fa3c8')
      .font('Regular')
      .fontSize(10)
      .text('lifesimple.gr', 55, 62);

    // Date top right
    doc
      .fillColor('#8fa3c8')
      .font('Regular')
      .fontSize(9)
      .text(`Ημερομηνία: ${new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
            PW - 200, 62, { width: 145, align: 'right' });

    // Gold accent line
    doc.rect(0, 110, PW, 4).fill(GOLD);

    // Product title area
    doc.moveDown(5);
    const titleY = 150;
    doc
      .fillColor(NAVY)
      .font('Bold')
      .fontSize(26)
      .text(productName, 55, titleY, { align: 'center', width: PW - 110 });

    doc.moveDown(0.8);
    doc
      .fillColor(SUB)
      .font('Regular')
      .fontSize(13)
      .text('Εξατομικευμένος Οδηγός', { align: 'center', width: PW - 110 });

    // Gold divider
    doc.moveDown(1.2);
    const divY = doc.y;
    doc.moveTo(55, divY).lineTo(PW - 55, divY).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1.5);

    // Customer info box
    const boxY = doc.y;
    doc.rect(55, boxY, PW - 110, 70).fillAndStroke('#eef2fa', '#c5d0e8');

    doc
      .fillColor(SUB)
      .font('Regular')
      .fontSize(9)
      .text('ΠΡΟΕΤΟΙΜΑΣΤΗΚΕ ΑΠΟΚΛΕΙΣΤΙΚΑ ΓΙΑ:', 70, boxY + 12);

    doc
      .fillColor(NAVY)
      .font('Bold')
      .fontSize(16)
      .text(customerName, 70, boxY + 28);

    doc
      .fillColor(SUB)
      .font('Regular')
      .fontSize(10)
      .text(formData.email || '', 70, boxY + 50);

    doc.y = boxY + 85;
    doc.moveDown(1.5);

    // What's inside box
    doc
      .fillColor(NAVY)
      .font('Bold')
      .fontSize(13)
      .text('Τι περιλαμβάνει αυτό το έγγραφο:', 55, doc.y);
    doc.moveDown(0.6);

    const bullets = [
      'Πλήρης ανάλυση της κατάστασής σας βάσει των απαντήσεών σας',
      'Βήμα-βήμα οδηγίες εξατομικευμένες για την περίπτωσή σας',
      'Αναλυτικά χρονοδιαγράμματα, κόστη και απαιτούμενα έγγραφα',
      'Νομικές πληροφορίες που ισχύουν ειδικά για εσάς',
      'Λίστα επόμενων ενεργειών με σαφείς οδηγίες',
    ];

    bullets.forEach(b => {
      doc
        .fillColor(GOLD)
        .font('Bold')
        .fontSize(11)
        .text('▸', 65, doc.y, { continued: true })
        .fillColor(TEXT)
        .font('Regular')
        .fontSize(10)
        .text('  ' + b, { width: PW - 140 });
      doc.moveDown(0.4);
    });

    // Disclaimer on cover
    doc.moveDown(1.5);
    const discY = doc.y;
    doc.rect(55, discY, PW - 110, 56).fill('#fff8e6');
    doc
      .fillColor('#7a5f1e')
      .font('Regular')
      .fontSize(8.5)
      .text(
        '⚠ ΣΗΜΑΝΤΙΚΗ ΣΗΜΕΙΩΣΗ: Το παρόν έγγραφο έχει αποκλειστικά πληροφοριακό χαρακτήρα και ΔΕΝ αποτελεί νομική συμβουλή. ' +
        'Το περιεχόμενο δεν αποτελεί νομική συμβουλή. Για επίσημες νομικές ενέργειες, τη σύνταξη εγγράφων ή νομική εκπροσώπηση, ' +
        'απευθυνθείτε σε αδειοδοτημένο δικηγόρο ή συμβολαιογράφο.',
        70, discY + 10,
        { width: PW - 140, lineGap: 3 }
      );

    // ════════════════════════════════════════════════════════
    // CONTENT PAGES
    // ════════════════════════════════════════════════════════

    doc.addPage();

    // Parse Claude's section format
    const sectionRegex = /\[ΕΝΟΤΗΤΑ_(\d+)\]([\s\S]*?)\[\/ΕΝΟΤΗΤΑ_\1\]/g;
    let match;
    let sectionNum = 0;

    const hasStructuredContent = claudeContent.includes('[ΕΝΟΤΗΤΑ_');

    if (hasStructuredContent) {
      while ((match = sectionRegex.exec(claudeContent)) !== null) {
        sectionNum++;
        const rawSection = match[2].trim();
        const lines = rawSection.split('\n').filter(l => l !== null);

        if (lines.length === 0) continue;

        // Extract section heading (first non-empty line)
        let headingLine = '';
        let bodyStart = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim()) {
            headingLine = lines[i].trim().replace(/^#+\s*/, '');
            bodyStart = i + 1;
            break;
          }
        }

        // ── Section Header ──
        // Check for page break need (leave room for header + content)
        if (doc.y > PH - 200) doc.addPage();

        // Section number badge
        const badgeX = 55;
        const badgeY = doc.y;
        doc.rect(badgeX, badgeY, 32, 32).fill(NAVY);
        doc
          .fillColor(GOLD)
          .font('Bold')
          .fontSize(13)
          .text(String(sectionNum), badgeX, badgeY + 7, { width: 32, align: 'center' });

        // Section title
        doc
          .fillColor(NAVY)
          .font('Bold')
          .fontSize(14)
          .text(headingLine, badgeX + 42, badgeY + 6, { width: PW - badgeX - 42 - 55 });

        doc.y = Math.max(doc.y, badgeY + 36);
        doc.moveDown(0.3);

        // Gold underline
        const ulY = doc.y;
        doc.moveTo(55, ulY).lineTo(PW - 55, ulY).strokeColor(GOLD).lineWidth(1.5).stroke();
        doc.moveDown(0.7);

        // ── Section Body ──
        for (let i = bodyStart; i < lines.length; i++) {
          const raw = lines[i];
          const line = raw.trim();
          if (!line) { doc.moveDown(0.25); continue; }

          // Check for page break
          if (doc.y > PH - 100) {
            doc.addPage();
            // Mini header on continuation pages
            doc.rect(0, 0, PW, 6).fill(GOLD);
            doc.y = 25;
          }

          // Sub-heading (markdown ## or ###)
          if (/^#{2,3}\s/.test(raw)) {
            doc.moveDown(0.4);
            doc
              .fillColor(NAVY)
              .font('Bold')
              .fontSize(11)
              .text(line.replace(/^#+\s*/, ''), 55, doc.y, { width: PW - 110 });
            doc.moveDown(0.3);
            // Thin underline
            const sy = doc.y;
            doc.moveTo(55, sy).lineTo(PW * 0.6, sy).strokeColor('#c5d0e8').lineWidth(0.8).stroke();
            doc.moveDown(0.4);
          }
          // Numbered list item
          else if (/^\d+\.\s/.test(line)) {
            doc
              .fillColor(NAVY)
              .font('Bold')
              .fontSize(10)
              .text(line, 65, doc.y, { width: PW - 130 })
              .font('Regular');
            doc.moveDown(0.3);
          }
          // Bullet point
          else if (/^[-•*]\s/.test(line)) {
            const content = line.replace(/^[-•*]\s*/, '');
            // Check for bold (**text**)
            if (/\*\*/.test(content)) {
              doc
                .fillColor(GOLD)
                .font('Bold')
                .fontSize(10)
                .text('▸', 67, doc.y, { continued: true, width: 12 })
                .fillColor(TEXT)
                .font('Regular')
                .text('  ' + content.replace(/\*\*/g, ''), { width: PW - 145 });
            } else {
              doc
                .fillColor(GOLD)
                .font('Bold')
                .fontSize(10)
                .text('▸', 67, doc.y, { continued: true, width: 12 })
                .fillColor(TEXT)
                .font('Regular')
                .fontSize(10)
                .text('  ' + content, { width: PW - 145 });
            }
            doc.moveDown(0.3);
          }
          // Regular paragraph
          else {
            // Strip markdown bold
            const cleanLine = line.replace(/\*\*(.+?)\*\*/g, '$1');
            doc
              .fillColor(TEXT)
              .font('Regular')
              .fontSize(10)
              .text(cleanLine, 55, doc.y, { width: PW - 110, lineGap: 2 });
            doc.moveDown(0.35);
          }
        }
        doc.moveDown(1.2);

        // Section separator (thin gold line)
        if (sectionNum < 7 && doc.y < PH - 80) {
          const sepY = doc.y;
          doc.moveTo(55, sepY).lineTo(PW - 55, sepY).strokeColor('#e8dfc8').lineWidth(0.5).stroke();
          doc.moveDown(1);
        }
      }
    } else {
      // Fallback: render raw content with Unicode font
      doc
        .fillColor(TEXT)
        .font('Regular')
        .fontSize(10)
        .text(claudeContent, 55, doc.y, { width: PW - 110, lineGap: 3 });
    }

    // ── Final Disclaimer Page ──
    doc.addPage();

    // Gold top bar
    doc.rect(0, 0, PW, 6).fill(GOLD);
    doc.y = 40;

    doc
      .fillColor(NAVY)
      .font('Bold')
      .fontSize(16)
      .text('Αποποίηση Ευθύνης & Πληροφορίες', 55, doc.y, { align: 'center', width: PW - 110 });

    doc.moveDown(1);
    const dlY = doc.y;
    doc.moveTo(55, dlY).lineTo(PW - 55, dlY).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1.5);

    const disclaimerText = [
      '⚠ ΣΗΜΑΝΤΙΚΗ ΑΠΟΠΟΙΗΣΗ ΕΥΘΥΝΗΣ',
      '',
      'Το παρόν έγγραφο δημιουργήθηκε αποκλειστικά για πληροφοριακούς σκοπούς και απευθύνεται στον/ην ' + customerName + '. ' +
      'ΔΕΝ αποτελεί νομική συμβουλή, ούτε υποκαθιστά τη νομική εκπροσώπηση ή συμβουλή από αδειοδοτημένο ' +
      'δικηγόρο ή συμβολαιογράφο. Το περιεχόμενο δεν αποτελεί νομική συμβουλή.',
      '',
      'Οι πληροφορίες στο παρόν έγγραφο:',
      '- Βασίζονται στην ελληνική νομοθεσία που ισχύει κατά την ημερομηνία δημιουργίας',
      '- Ενδέχεται να μην αντικατοπτρίζουν τις τελευταίες νομοθετικές αλλαγές',
      '- Δεν αποτελούν εξαντλητική νομική ανάλυση',
      '- Χρειάζεται επαλήθευση από αρμόδιο νομικό σύμβουλο για οποιαδήποτε νομική ενέργεια',
      '',
      'Η LifeSimple δεν φέρει ευθύνη για αποφάσεις που ελήφθησαν βάσει των πληροφοριών του παρόντος εγγράφου.',
      '',
      'ΓΙΑ ΕΠΙΣΗΜΕΣ ΝΟΜΙΚΕΣ ΕΝΕΡΓΕΙΕΣ, ΑΠΕΥΘΥΝΘΕΙΤΕ ΣΕ:',
      '- Αδειοδοτημένο δικηγόρο (Δικηγορικός Σύλλογος Αθηνών: 210 339 6000)',
      '- Συμβολαιογράφο (Συμβολαιογραφικός Σύλλογος: 210 364 1616)',
      '- ΚΕΠ (Κέντρα Εξυπηρέτησης Πολιτών)',
      '- gov.gr για ψηφιακές υπηρεσίες',
    ];

    disclaimerText.forEach(line => {
      if (!line) { doc.moveDown(0.4); return; }
      const isBold = line.startsWith('⚠') || line.startsWith('ΓΙΑ') || line.startsWith('Οι');
      doc
        .fillColor(line.startsWith('-') ? SUB : TEXT)
        .font(isBold ? 'Bold' : 'Regular')
        .fontSize(10)
        .text(line, 55, doc.y, { width: PW - 110, lineGap: 2 });
      doc.moveDown(0.35);
    });

    doc.moveDown(2);
    // Footer info box
    const fiY = doc.y;
    doc.rect(55, fiY, PW - 110, 80).fill(NAVY);
    doc
      .fillColor('#ffffff')
      .font('Bold')
      .fontSize(14)
      .text('Life', 70, fiY + 18, { continued: true })
      .fillColor(GOLD)
      .text('Simple');
    doc
      .fillColor('#8fa3c8')
      .font('Regular')
      .fontSize(9)
      .text('lifesimple.gr  ·  support@lifesimple.gr', 70, fiY + 40);
    doc
      .fillColor('#8fa3c8')
      .fontSize(8)
      .text('© 2024 LifeSimple. Με επιφύλαξη παντός δικαιώματος.', 70, fiY + 56);

    // ── Add page numbers to all pages ──
    addPageNumbers();

    doc.end();
  });
}

// ────────────────────────────────────────────────────────────
// SENDGRID — Send Email with PDF Attachment
// ────────────────────────────────────────────────────────────

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmailWithPDF({ toEmail, toName, productName, pdfBuffer }) {
  const filename = `LifeSimple_${productName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@lifesimple.gr';
  const fromName  = process.env.SENDGRID_FROM_NAME  || 'LifeSimple';

  const msg = {
    to: {
      email: toEmail,
      name:  toName,
    },
    from: {
      email: fromEmail,
      name:  fromName,
    },
    replyTo: {
      email: 'support@lifesimple.gr',
      name:  'LifeSimple Υποστήριξη',
    },
    subject: `Το έγγραφό σας είναι έτοιμο — ${productName}`,
    // Deliverability headers
    headers: {
      'X-Priority':         '3',
      'X-Mailer':           'LifeSimple Mailer 1.0',
      'List-Unsubscribe':   `<mailto:unsubscribe@lifesimple.gr?subject=unsubscribe>`,
      'X-Entity-Ref-ID':    `lifesimple-${Date.now()}`,
    },
    // SendGrid-specific mail settings for deliverability
    mailSettings: {
      bypassListManagement: {
        enable: false,
      },
      footer: {
        enable: false,
      },
      sandboxMode: {
        enable: false,
      },
    },
    trackingSettings: {
      clickTracking: {
        enable: false,
        enableText: false,
      },
      openTracking: {
        enable: true,
      },
    },
    text: `Αγαπητέ/ή ${toName},\n\nΣας ευχαριστούμε για την αγορά σας από το LifeSimple.\n\nΤο εξατομικευμένο PDF σας για το "${productName}" βρίσκεται συνημμένο σε αυτό το email.\n\nΑν δεν βλέπετε το συνημμένο, ελέγξτε τον φάκελο spam/junk.\n\nΓια οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας στο support@lifesimple.gr.\n\nΜε εκτίμηση,\nΗ ομάδα του LifeSimple\nlifesimple.gr`,
    html: `
<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${productName} — LifeSimple</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f5f0;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f5f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a2744;padding:24px 36px 20px;">
              <span style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Life<span style="color:#c9a84c;">Simple</span></span>
              <br>
              <span style="font-family:Arial,sans-serif;font-size:10px;color:#8fa3c8;letter-spacing:2px;text-transform:uppercase;">LIFESIMPLE.GR</span>
            </td>
          </tr>

          <!-- Gold accent -->
          <tr><td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>

          <!-- Success icon -->
          <tr>
            <td align="center" style="padding:36px 36px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:68px;height:68px;background-color:#eef7e8;border-radius:50%;text-align:center;vertical-align:middle;font-size:34px;line-height:68px;">
                    ✅
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0 36px 36px;">
              <h1 style="font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#1a2744;margin:0 0 14px;text-align:center;">
                Το έγγραφό σας είναι έτοιμο!
              </h1>
              <p style="font-family:Arial,sans-serif;font-size:15px;color:#5a6b8a;line-height:1.7;margin:0 0 20px;text-align:center;">
                Αγαπητέ/ή <strong style="color:#1a2744;">${toName}</strong>, το εξατομικευμένο PDF σας για το
                <strong style="color:#1a2744;">${productName}</strong> βρίσκεται συνημμένο σε αυτό το email.
              </p>

              <!-- Info box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#f0f4ff;border-left:4px solid #c9a84c;border-radius:6px;padding:16px 20px;">
                    <p style="font-family:Arial,sans-serif;font-size:13px;color:#3a4a65;margin:0;line-height:1.7;">
                      📎 <strong>Συνημμένο:</strong> ${filename}<br>
                      📱 Ανοίξτε το σε οποιαδήποτε συσκευή με Adobe Reader ή browser<br>
                      🔒 Το PDF είναι εξατομικευμένο αποκλειστικά για εσάς
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Spam note -->
              <p style="font-family:Arial,sans-serif;font-size:12px;color:#9aabba;line-height:1.6;margin:0 0 28px;text-align:center;font-style:italic;">
                Αν δεν βλέπετε το συνημμένο, ελέγξτε τον φάκελο <strong>spam</strong> ή <strong>junk</strong> του email σας.
              </p>

              <!-- CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="mailto:support@lifesimple.gr"
                       style="display:inline-block;background-color:#c9a84c;color:#1a2744;font-family:Arial,sans-serif;font-size:14px;font-weight:700;padding:13px 32px;border-radius:6px;text-decoration:none;">
                      Επικοινωνία με Υποστήριξη
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7f5f0;padding:20px 36px;border-top:1px solid #e8e5e0;">
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#9aabba;margin:0;line-height:1.7;text-align:center;">
                <strong style="color:#5a6b8a;">LifeSimple</strong> · lifesimple.gr · support@lifesimple.gr<br>
                Το περιεχόμενο δεν αποτελεί νομική συμβουλή. Πληροφοριακός χαρακτήρας.<br>
                <a href="https://lifesimple.gr/terms" style="color:#9aabba;">Όροι Χρήσης</a> ·
                <a href="https://lifesimple.gr/privacy" style="color:#9aabba;">Πολιτική Απορρήτου</a> ·
                <a href="mailto:unsubscribe@lifesimple.gr?subject=unsubscribe" style="color:#9aabba;">Κατάργηση εγγραφής</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    attachments: [
      {
        content:     pdfBuffer.toString('base64'),
        filename,
        type:        'application/pdf',
        disposition: 'attachment',
      },
    ],
  };

  await sgMail.send(msg);
}

// ────────────────────────────────────────────────────────────
// 404 FALLBACK
// ────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ────────────────────────────────────────────────────────────
// START SERVER
// ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║           LifeSimple Server                  ║
║  Listening on: http://localhost:${PORT}         ║
╚══════════════════════════════════════════════╝
  `);
});
