/**
 * LifeSimple — Node.js / Express Backend
 * ─────────────────────────────────────────────────────────────
 * Routes:
 *   POST /api/create-checkout-session   → creates Stripe session
 *   POST /api/webhook                   → Stripe webhook handler
 *   GET  /will, /divorce, /marriage,
 *        /obituary, /separation         → serve product HTML pages
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

const pages = ['will', 'divorce', 'marriage', 'obituary', 'separation', 'success'];
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
              images: [], // Add product image URLs here if available
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
        customer_name:  formData.fullName,
      },
    });

    // Store form data keyed by Stripe session ID
    pendingOrders.set(session.id, {
      product,
      productName,
      formData,
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

    // Retrieve stored form data
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
  const { product, productName, formData } = order;

  console.log(`[processOrder] Generating content for: ${productName}`);

  try {
    // 1. Generate personalised content with Claude
    const content = await generateWithClaude(product, productName, formData);

    // 2. Build PDF
    const pdfBuffer = await buildPDF(productName, formData, content);

    // 3. Send email with PDF attachment
    await sendEmailWithPDF({
      toEmail:     formData.email,
      toName:      formData.fullName,
      productName,
      pdfBuffer,
    });

    console.log(`[processOrder] ✓ PDF sent to ${formData.email}`);
  } catch (err) {
    console.error(`[processOrder] Failed for ${formData.email}:`, err);
    // In production: log to error tracking, retry queue, or send manual alert
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
async function generateWithClaude(product, productName, formData) {
  const systemPrompt = buildSystemPrompt(product);
  const userPrompt   = buildUserPrompt(product, formData);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}

function buildSystemPrompt(product) {
  const base = `Είσαι ειδικός σε ελληνικές νομικές και διοικητικές διαδικασίες.
Γράφεις επαγγελματικά, επίσημα έγγραφα στα ελληνικά για ιδιώτες.
Το έγγραφό σου πρέπει να είναι:
- Στη ΔΗΜΟΤΙΚΗ ΕΛΛΗΝΙΚΗ γλώσσα
- Επαγγελματικό και επίσημο ύφος
- Με αριθμημένες ενότητες και υποενότητες
- Συγκεκριμένο και πρακτικό
- Χωρίς νομική ευθύνη (να αναφέρεις ότι δεν αποτελεί νομική συμβουλή)
Μορφοποίησε την απόκριση ως: [ΕΝΟΤΗΤΑ_1]...[/ΕΝΟΤΗΤΑ_1][ΕΝΟΤΗΤΑ_2]...[/ΕΝΟΤΗΤΑ_2] κ.λπ.`;

  const productInstructions = {
    willsimple: `Δημιουργείς ΟΔΗΓΟ ΔΙΑΘΗΚΗΣ. Συμπερίλαβε:
[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση Κατάστασης
[ΕΝΟΤΗΤΑ_2] Ποιος Τύπος Διαθήκης Σάς Ταιριάζει (ιδιόγραφη/δημόσια/μυστική)
[ΕΝΟΤΗΤΑ_3] Νόμιμη Μοίρα και Κληρονόμοι
[ΕΝΟΤΗΤΑ_4] Ανάλυση Περιουσιακών Στοιχείων
[ΕΝΟΤΗΤΑ_5] Ειδικές Επιθυμίες - Πώς να τις Καταγράψετε
[ΕΝΟΤΗΤΑ_6] Απαιτούμενα Έγγραφα και Βήματα
[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα - Χρονοδιάγραμμα`,

    divorcesimple: `Δημιουργείς ΟΔΗΓΟ ΔΙΑΖΥΓΙΟΥ. Συμπερίλαβε:
[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση Κατάστασης
[ΕΝΟΤΗΤΑ_2] Συναινετικό vs Αντιδικία - Τι Ισχύει για Εσάς
[ΕΝΟΤΗΤΑ_3] Απαιτούμενα Έγγραφα
[ΕΝΟΤΗΤΑ_4] Επιμέλεια Παιδιών και Διατροφή
[ΕΝΟΤΗΤΑ_5] Διαίρεση Περιουσίας
[ΕΝΟΤΗΤΑ_6] Χρονοδιάγραμμα Διαδικασίας
[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα`,

    marriagesimple: `Δημιουργείς ΟΔΗΓΟ ΓΑΜΟΥ. Συμπερίλαβε:
[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση Κατάστασης
[ΕΝΟΤΗΤΑ_2] Τύπος Γάμου - Πολιτικός vs Θρησκευτικός
[ΕΝΟΤΗΤΑ_3] Απαιτούμενα Έγγραφα (αναλυτικά, ανά σύντροφο)
[ΕΝΟΤΗΤΑ_4] Ειδικές Απαιτήσεις (αλλοδαπός/αλλοδαπή, προηγούμενος γάμος)
[ΕΝΟΤΗΤΑ_5] Χρονοδιάγραμμα - Από Αίτηση έως Τελετή
[ΕΝΟΤΗΤΑ_6] Μετά τον Γάμο - Αλλαγή Εγγράφων`,

    obituarysimple: `Δημιουργείς ΟΔΗΓΟ ΔΙΑΔΙΚΑΣΙΩΝ ΘΑΝΑΤΟΥ. Συμπερίλαβε:
[ΕΝΟΤΗΤΑ_1] Πρώτες 48 Ώρες - Άμεσες Ενέργειες
[ΕΝΟΤΗΤΑ_2] Ληξιαρχείο και Επίσημα Έγγραφα
[ΕΝΟΤΗΤΑ_3] Κληρονομιά - Με ή Χωρίς Διαθήκη
[ΕΝΟΤΗΤΑ_4] Φορολογικές Υποχρεώσεις (Φόρος Κληρονομιάς)
[ΕΝΟΤΗΤΑ_5] Τραπεζικοί Λογαριασμοί και Ασφαλίσεις
[ΕΝΟΤΗΤΑ_6] Ακίνητα και Μεταβίβαση
[ΕΝΟΤΗΤΑ_7] Χρονοδιάγραμμα και Επόμενα Βήματα`,

    separationsimple: `Δημιουργείς ΟΔΗΓΟ ΧΩΡΙΣΜΟΥ ΣΥΓΚΑΤΟΙΚΟΥΝΤΩΝ. Συμπερίλαβε:
[ΕΝΟΤΗΤΑ_1] Εισαγωγή και Αξιολόγηση Κατάστασης
[ΕΝΟΤΗΤΑ_2] Νομικά Δικαιώματα - Συγκατοίκηση vs Σύμφωνο Συμβίωσης
[ΕΝΟΤΗΤΑ_3] Λύση Συμφώνου Συμβίωσης (αν εφαρμόζεται)
[ΕΝΟΤΗΤΑ_4] Κοινή Κατοικία και Περιουσία
[ΕΝΟΤΗΤΑ_5] Επιμέλεια και Διατροφή Παιδιών Εκτός Γάμου
[ΕΝΟΤΗΤΑ_6] Πρακτικά Βήματα Χωρισμού
[ΕΝΟΤΗΤΑ_7] Επόμενα Βήματα`,
  };

  return base + '\n\n' + (productInstructions[product] || '');
}

function buildUserPrompt(product, formData) {
  const lines = ['Στοιχεία χρήστη για τον οδηγό:'];
  for (const [key, value] of Object.entries(formData)) {
    if (key === 'email') continue; // don't include email in prompt
    if (value && value !== '' && key !== 'product' && key !== 'price' && key !== 'productName') {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase());
      const val = Array.isArray(value) ? value.join(', ') : value;
      lines.push(`- ${label}: ${val}`);
    }
  }
  lines.push('\nΔημιούργησε έναν πλήρη, εξατομικευμένο οδηγό βάσει των παραπάνω στοιχείων.');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────
// PDF GENERATION — pdfkit
// ────────────────────────────────────────────────────────────

const PDFDocument = require('pdfkit');

function buildPDF(productName, formData, claudeContent) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 60, size: 'A4' });
    const chunks = [];

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    const NAVY = '#1a2744';
    const GOLD = '#c9a84c';

    // ── Header Bar ──
    doc.rect(0, 0, doc.page.width, 80).fill(NAVY);

    doc
      .fillColor('#ffffff')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('LifeSimple', 60, 20);

    doc
      .fillColor(GOLD)
      .fontSize(11)
      .font('Helvetica')
      .text('lifesimple.gr', 60, 48);

    doc
      .fillColor('#8fa3c8')
      .fontSize(9)
      .text(`Δημιουργήθηκε: ${new Date().toLocaleDateString('el-GR')}`,
            doc.page.width - 200, 48, { width: 140, align: 'right' });

    // ── Title ──
    doc.moveDown(4);
    doc
      .fillColor(NAVY)
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(productName, { align: 'center' });

    // ── Gold divider ──
    doc.moveDown(0.5);
    const y = doc.y;
    doc.moveTo(60, y).lineTo(doc.page.width - 60, y).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);

    // ── Customer Info Box ──
    doc
      .rect(60, doc.y, doc.page.width - 120, 48)
      .fillAndStroke('#f7f5f0', '#e0ddd8');

    doc
      .fillColor('#5a6b8a')
      .fontSize(9)
      .font('Helvetica')
      .text('Προετοιμάστηκε για:', 72, doc.y - 40);

    doc
      .fillColor(NAVY)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(formData.fullName || 'Πελάτης', 72, doc.y - 24);

    doc.moveDown(2);

    // ── Parse and render Claude content ──
    const sectionRegex = /\[ΕΝΟΤΗΤΑ_\d+\]([\s\S]*?)\[\/ΕΝΟΤΗΤΑ_\d+\]/g;
    let match;
    let sectionNum = 0;

    // If Claude returned sections, parse them; else render raw
    if (claudeContent.includes('[ΕΝΟΤΗΤΑ_')) {
      while ((match = sectionRegex.exec(claudeContent)) !== null) {
        sectionNum++;
        const rawSection = match[1].trim();
        const lines = rawSection.split('\n').filter(l => l.trim() !== '');

        if (lines.length === 0) continue;

        // Section heading (first line)
        const heading = lines[0].replace(/^#+\s*/, '');

        // Check if we need a new page
        if (doc.y > doc.page.height - 160) doc.addPage();

        // Section number badge
        doc
          .rect(60, doc.y, 26, 26)
          .fill(NAVY);
        doc
          .fillColor(GOLD)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(String(sectionNum), 60, doc.y - 26, { width: 26, align: 'center' });

        doc
          .fillColor(NAVY)
          .fontSize(13)
          .font('Helvetica-Bold')
          .text(heading, 96, doc.y - 20, { width: doc.page.width - 156 });

        doc.moveDown(0.4);

        // Thin gold underline
        const uy = doc.y;
        doc.moveTo(96, uy).lineTo(doc.page.width - 60, uy)
           .strokeColor(GOLD).lineWidth(1).stroke();
        doc.moveDown(0.6);

        // Body lines
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) { doc.moveDown(0.3); continue; }

          if (doc.y > doc.page.height - 100) doc.addPage();

          // Detect list items
          if (/^[-•*]/.test(line)) {
            doc
              .fillColor(GOLD)
              .fontSize(10)
              .text('▸', 72, doc.y, { continued: true })
              .fillColor('#3a4a65')
              .font('Helvetica')
              .text(' ' + line.replace(/^[-•*]\s*/, ''), {
                width: doc.page.width - 150,
                indent: 0,
              });
          } else if (/^\d+\./.test(line)) {
            doc
              .fillColor(NAVY)
              .font('Helvetica-Bold')
              .fontSize(10)
              .text(line, 72, doc.y, { width: doc.page.width - 150 })
              .font('Helvetica');
          } else {
            doc
              .fillColor('#2c2c2c')
              .font('Helvetica')
              .fontSize(10)
              .text(line, 72, doc.y, { width: doc.page.width - 150 });
          }
          doc.moveDown(0.35);
        }
        doc.moveDown(0.8);
      }
    } else {
      // Fallback: render raw content
      doc
        .fillColor('#2c2c2c')
        .font('Helvetica')
        .fontSize(10)
        .text(claudeContent, 60, doc.y, { width: doc.page.width - 120 });
    }

    // ── Disclaimer Footer ──
    if (doc.y > doc.page.height - 120) doc.addPage();

    const disclaimerY = doc.page.height - 90;
    doc.moveTo(60, disclaimerY).lineTo(doc.page.width - 60, disclaimerY)
       .strokeColor('#cccccc').lineWidth(0.5).stroke();

    doc
      .fillColor('#9aabba')
      .fontSize(8)
      .font('Helvetica')
      .text(
        '⚠ Αποποίηση Ευθύνης: Αυτό το έγγραφο έχει πληροφοριακό χαρακτήρα και δεν αποτελεί νομική συμβουλή. ' +
        'Για επίσημες νομικές ενέργειες απευθυνθείτε σε αδειοδοτημένο δικηγόρο ή συμβολαιογράφο. ' +
        '© LifeSimple · lifesimple.gr · support@lifesimple.gr',
        60, disclaimerY + 8,
        { width: doc.page.width - 120, align: 'center' }
      );

    doc.end();
  });
}

// ────────────────────────────────────────────────────────────
// SENDGRID — Send Email with PDF Attachment
// ────────────────────────────────────────────────────────────

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmailWithPDF({ toEmail, toName, productName, pdfBuffer }) {
  const filename = `${productName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  const msg = {
    to: {
      email: toEmail,
      name:  toName,
    },
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@lifesimple.gr',
      name:  process.env.SENDGRID_FROM_NAME  || 'LifeSimple',
    },
    subject: `✅ Το έγγραφό σας είναι έτοιμο — ${productName}`,
    text: `Αγαπητέ/ή ${toName},\n\nΣας ευχαριστούμε για την αγορά σας από το LifeSimple.\n\nΤο εξατομικευμένο PDF σας είναι συνημμένο σε αυτό το email.\n\nΑν έχετε οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας στο support@lifesimple.gr.\n\nΜε εκτίμηση,\nΗ ομάδα του LifeSimple\nlifesimple.gr`,
    html: `
<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a2744;padding:28px 40px;">
              <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">Life<span style="color:#c9a84c;">Simple</span></span>
              <br><span style="font-size:11px;color:#8fa3c8;letter-spacing:0.08em;">LIFESIMPLE.GR</span>
            </td>
          </tr>
          <!-- Success Icon -->
          <tr>
            <td align="center" style="padding:40px 40px 20px;">
              <div style="width:72px;height:72px;background:#f0f8e8;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:36px;">✅</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 40px 40px;text-align:center;">
              <h1 style="font-size:22px;font-weight:700;color:#1a2744;margin:0 0 12px;">Το έγγραφό σας είναι έτοιμο!</h1>
              <p style="font-size:15px;color:#5a6b8a;line-height:1.7;margin:0 0 24px;">
                Αγαπητέ/ή <strong>${toName}</strong>, το PDF σας για το <strong>${productName}</strong> βρίσκεται συνημμένο σε αυτό το email.
              </p>
              <div style="background:#f7f5f0;border-radius:8px;padding:16px 20px;margin:0 0 24px;text-align:left;">
                <p style="font-size:13px;color:#3a4a65;margin:0;line-height:1.6;">
                  📎 <strong>Συνημμένο αρχείο:</strong> ${filename}<br>
                  📱 Μπορείτε να ανοίξετε το PDF στο κινητό, tablet ή υπολογιστή σας.
                </p>
              </div>
              <p style="font-size:13px;color:#8a9bb8;line-height:1.6;margin:0 0 32px;">
                Αν δεν βλέπετε το συνημμένο, ελέγξτε τον φάκελο <strong>spam/junk</strong> του email σας ή επικοινωνήστε μαζί μας.
              </p>
              <a href="mailto:support@lifesimple.gr" style="display:inline-block;background:#c9a84c;color:#1a2744;font-size:14px;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Επικοινωνία Υποστήριξης
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f7f5f0;padding:20px 40px;text-align:center;border-top:1px solid #e8e5e0;">
              <p style="font-size:11px;color:#9aabba;margin:0;line-height:1.6;">
                LifeSimple · lifesimple.gr · support@lifesimple.gr<br>
                Αυτό το έγγραφο έχει πληροφοριακό χαρακτήρα και δεν αποτελεί νομική συμβουλή.
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
