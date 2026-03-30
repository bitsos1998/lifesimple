/**
 * Standalone PDF generation test — no Stripe, no email.
 * Runs buildSystemPrompt → buildUserPrompt → Claude API → buildPDF → saves file.
 */

require('dotenv').config({ override: true });

const Anthropic    = require('@anthropic-ai/sdk');
const PDFDocument  = require('pdfkit');
const path         = require('path');
const fs           = require('fs');

const anthropic    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD    = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

// ─── Mock order data ─────────────────────────────────────────
const product     = 'willsimple';
const productName = 'WillSimple — Οδηγός Σύνταξης Διαθήκης';
const formData = {
  firstName:     'Ανδρέας',
  lastName:      'Μπίτσος',
  email:         'bitsos1998@gmail.com',
  maritalStatus: 'married',
  hasChildren:   'yes',
  childrenCount: '2',
  assets:        ['property', 'bank'],
  specialWishes: 'Θέλω να αφήσω τα πάντα στη γυναίκα μου',
};
const customerName = 'Ανδρέας Μπίτσος';

// ─── Paste buildSystemPrompt from server.js ──────────────────
function buildSystemPrompt(product) {
  const base = `Είσαι ένας γνήσια ενδιαφερόμενος φίλος που έχει βαθιά γνώση της ελληνικής νομοθεσίας.
Γράφεις σαν να μιλάς σε έναν φίλο — ζεστά, ανθρώπινα, ειλικρινά — αλλά με απόλυτη ακρίβεια και αξιοπιστία.
Ο στόχος σου είναι να νιώσει ο αναγνώστης ότι κάποιος πραγματικά τον καταλαβαίνει και είναι δίπλα του.

ΚΑΝΟΝΕΣ ΓΡΑΦΗΣ:
- Απευθύνσου ΠΑΝΤΑ στον χρήστη με το ΜΙΚΡΟ ΤΟΥ ΟΝΟΜΑ σε όλο το κείμενο
- Γράψε τουλάχιστον 2500 λέξεις συνολικά
- Κάθε ενότητα τουλάχιστον 300-400 λέξεις
- Χρησιμοποίησε δημοτική ελληνική, φυσική και ευανάγνωστη
- Συμπερίλαβε ΑΛΗΘΙΝΕΣ παραπομπές στον ελληνικό νόμο (άρθρα ΑΚ, νόμους, ΚΕΠ, gov.gr)
- Συμπερίλαβε συγκεκριμένα ποσά (€), χρόνους και ονόματα υπηρεσιών
- Χρησιμοποίησε bullet points (-) και αριθμημένες λίστες

ΔΟΜΗ: Γράψε ΑΚΡΙΒΩΣ 7 ενότητες:
[ΕΝΟΤΗΤΑ_1]Τίτλος
Περιεχόμενο...[/ΕΝΟΤΗΤΑ_1]
κ.λπ.`;

  return base + `\n\nΥΦΟΣ: Ήρεμο, ζεστό, υπεύθυνο. Ο χρήστης κάνει κάτι πολύ σημαντικό για τους αγαπημένους του.

[ΕΝΟΤΗΤΑ_1] Καλώς ήρθες — Κάνεις Κάτι Πολύ Σημαντικό για Αυτούς που Αγαπάς
Ζεστό άνοιγμα που αναγνωρίζει το μικρό όνομα. Γιατί η απόφαση για διαθήκη είναι πράξη αγάπης.

[ΕΝΟΤΗΤΑ_2] Τι Πρέπει να Ξέρεις για τη Διαθήκη στην Ελλάδα
Πλούσιες γενικές πληροφορίες: ΑΚ 1710-1821, τύποι διαθηκών, κόστη, τι συμβαίνει χωρίς διαθήκη.

[ΕΝΟΤΗΤΑ_3] Η Δική σου Κατάσταση — Εξατομικευμένη Ανάλυση
Βάσει στοιχείων χρήστη: νόμιμοι κληρονόμοι, νόμιμη μοίρα, ελεύθερο τμήμα, ειδικές συστάσεις.

[ΕΝΟΤΗΤΑ_4] Τι Λέει ο Ελληνικός Νόμος — Αστικός Κώδικας
ΑΚ 1710-1717, 1721, 1825 σε απλά λόγια. Πότε ακυρώνεται διαθήκη. Λάθη που πρέπει να αποφύγεις.

[ΕΝΟΤΗΤΑ_5] Οι Επιλογές σου — Ποια Διαθήκη σε Εκφράζει
Σύγκριση ιδιόγραφης vs δημόσιας βάσει κατάστασης χρήστη. Πρακτική σύσταση.

[ΕΝΟΤΗΤΑ_6] Τα Επόμενα Βήματά σου — Βήμα-Βήμα Οδηγός Δράσης
Αριθμημένα βήματα 1-10 με συγκεκριμένες υπηρεσίες, τηλέφωνα, κόστη, χρόνους.

[ΕΝΟΤΗΤΑ_7] Ένα Τελευταίο Μήνυμα — Απευθείας σε Σένα
Ζεστό, προσωπικό κλείσιμο που αναγνωρίζει την πράξη θάρρους. Χρησιμοποίησε το μικρό όνομα.`;
}

function buildUserPrompt(product, formData, customerName) {
  const firstName = formData.firstName || customerName.split(' ')[0];
  const fieldLabels = {
    firstName: 'Όνομα', lastName: 'Επώνυμο', maritalStatus: 'Οικογενειακή κατάσταση',
    hasChildren: 'Έχει παιδιά', childrenCount: 'Αριθμός παιδιών', assets: 'Περιουσιακά στοιχεία',
    specialWishes: 'Ειδικές επιθυμίες',
  };
  const valueLabels = {
    married: 'Έγγαμος/η', yes: 'Ναι', no: 'Όχι',
    property: 'Ακίνητα', bank: 'Τραπεζικοί λογαριασμοί',
  };

  const lines = [
    `ΠΡΩΤΟ ΟΝΟΜΑ (χρησιμοποίησε ΑΠΟΚΛΕΙΣΤΙΚΑ αυτό): ${firstName}`,
    `ΠΛΗΡΕΣ ΟΝΟΜΑ: ${customerName}`, '',
    'ΣΤΟΙΧΕΙΑ ΦΟΡΜΑΣ:',
  ];
  for (const [k, v] of Object.entries(formData)) {
    if (['email'].includes(k) || !v) continue;
    const label = fieldLabels[k] || k;
    const val   = Array.isArray(v) ? v.map(x => valueLabels[x] || x).join(', ') : (valueLabels[v] || v);
    lines.push(`• ${label}: ${val}`);
  }
  lines.push('', 'ΟΔΗΓΙΕΣ:');
  lines.push(`1. Απευθύνσου ΠΑΝΤΑ ως "${firstName}" — ποτέ "σας/εσείς"`);
  lines.push(`2. Εξατομίκευσε ΟΛΑ βάσει στοιχείων`);
  lines.push(`3. Τουλάχιστον 2500 λέξεις, 300+ ανά ενότητα`);
  lines.push(`4. Ενότητα 6: αριθμημένη λίστα 8-10 βημάτων με τηλέφωνα/κόστη`);
  lines.push(`5. Ενότητα 7: πολύ ζεστή, προσωπική, αναφέρει "${firstName}" πολλές φορές`);
  lines.push(`\nΓράψε σαν να μιλάς απευθείας στον ${firstName}.`);
  return lines.join('\n');
}

// ─── buildPDF (copied from server.js) ────────────────────────
function buildPDF(productName, formData, claudeContent, customerName) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 55, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Regular', FONT_REGULAR);
    doc.registerFont('Bold',    FONT_BOLD);

    const NAVY = '#1a2744', GOLD = '#c9a84c', TEXT = '#2c2c2c', SUB = '#5a6b8a';
    const PW = doc.page.width, PH = doc.page.height;

    function addPageNumbers() {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const savedX = doc.x, savedY = doc.y;
        doc.rect(0, PH - 36, PW, 36).fill('#1a2744');
        const mb = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fillColor('#8fa3c8').font('Regular').fontSize(8)
           .text(`LifeSimple · lifesimple.gr — Σελίδα ${i + 1} από ${range.count}`,
                 55, PH - 22, { width: PW - 110, align: 'center', lineBreak: false });
        doc.page.margins.bottom = mb;
        doc.x = savedX; doc.y = savedY;
      }
    }

    // ── Cover page ──
    doc.rect(0, 0, PW, 110).fill(NAVY);
    doc.fillColor('#ffffff').font('Bold').fontSize(28).text('Life', 55, 28, { continued: true });
    doc.fillColor(GOLD).text('Simple');
    doc.fillColor('#8fa3c8').font('Regular').fontSize(10).text('lifesimple.gr', 55, 62);
    doc.fillColor('#8fa3c8').font('Regular').fontSize(9)
       .text(`Ημερομηνία: ${new Date().toLocaleDateString('el-GR', { day:'2-digit', month:'long', year:'numeric' })}`,
             PW - 200, 62, { width: 145, align: 'right' });
    doc.rect(0, 110, PW, 4).fill(GOLD);
    doc.fillColor(NAVY).font('Bold').fontSize(24).text(productName, 55, 150, { align: 'center', width: PW - 110 });
    doc.fillColor(SUB).font('Regular').fontSize(13).text('Εξατομικευμένος Οδηγός', { align: 'center', width: PW - 110 });
    doc.moveDown(1.2);
    const divY = doc.y;
    doc.moveTo(55, divY).lineTo(PW - 55, divY).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1.5);
    const boxY = doc.y;
    doc.rect(55, boxY, PW - 110, 72).fillAndStroke('#eef2fa', '#c5d0e8');
    doc.fillColor(SUB).font('Regular').fontSize(9).text('ΠΡΟΕΤΟΙΜΑΣΤΗΚΕ ΑΠΟΚΛΕΙΣΤΙΚΑ ΓΙΑ:', 70, boxY + 12);
    doc.fillColor(NAVY).font('Bold').fontSize(16).text(customerName, 70, boxY + 28);
    doc.fillColor(SUB).font('Regular').fontSize(10).text(formData.email || '', 70, boxY + 50);
    doc.y = boxY + 90; doc.moveDown(1.5);

    doc.fillColor(NAVY).font('Bold').fontSize(13).text('Τι περιλαμβάνει αυτό το έγγραφο:', 55, doc.y);
    doc.moveDown(0.6);
    ['Πλήρης ανάλυση της κατάστασής σας βάσει των απαντήσεών σας',
     'Βήμα-βήμα οδηγίες εξατομικευμένες για την περίπτωσή σας',
     'Αναλυτικά χρονοδιαγράμματα, κόστη και απαιτούμενα έγγραφα',
     'Νομικές πληροφορίες που ισχύουν ειδικά για εσάς',
     'Λίστα επόμενων ενεργειών με σαφείς οδηγίες',
    ].forEach(b => {
      const bY = doc.y;
      doc.fillColor(GOLD).font('Bold').fontSize(11).text('▸', 65, bY, { lineBreak: false });
      doc.fillColor(TEXT).font('Regular').fontSize(10).text(b, 84, bY, { width: PW - 150 });
      doc.moveDown(0.4);
    });

    doc.moveDown(1.2);
    const discY = doc.y;
    doc.rect(55, discY, PW - 110, 56).fill('#fff8e6');
    doc.fillColor('#7a5f1e').font('Regular').fontSize(8.5)
       .text('⚠ ΣΗΜΑΝΤΙΚΗ ΣΗΜΕΙΩΣΗ: Το παρόν έγγραφο έχει πληροφοριακό χαρακτήρα και ΔΕΝ αποτελεί νομική συμβουλή. ' +
             'Για επίσημες νομικές ενέργειες απευθυνθείτε σε δικηγόρο ή συμβολαιογράφο.',
             70, discY + 10, { width: PW - 140, lineGap: 3 });

    // ── Content pages ──
    doc.addPage();
    const sectionRegex = /\[ΕΝΟΤΗΤΑ_(\d+)\]([\s\S]*?)\[\/ΕΝΟΤΗΤΑ_\1\]/g;
    let match, sectionNum = 0;

    if (claudeContent.includes('[ΕΝΟΤΗΤΑ_')) {
      while ((match = sectionRegex.exec(claudeContent)) !== null) {
        sectionNum++;
        const rawSection = match[2].trim();
        const lines = rawSection.split('\n').filter(l => l !== null);
        if (!lines.length) continue;
        let headingLine = '', bodyStart = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim()) { headingLine = lines[i].trim().replace(/^#+\s*/, ''); bodyStart = i + 1; break; }
        }

        if (doc.y > PH - 200) doc.addPage();
        const badgeX = 55, badgeY = doc.y;
        doc.rect(badgeX, badgeY, 32, 32).fill(NAVY);
        doc.fillColor(GOLD).font('Bold').fontSize(13).text(String(sectionNum), badgeX, badgeY + 7, { width: 32, align: 'center' });
        doc.fillColor(NAVY).font('Bold').fontSize(14).text(headingLine, badgeX + 42, badgeY + 6, { width: PW - badgeX - 42 - 55 });
        doc.y = Math.max(doc.y, badgeY + 36);
        doc.moveDown(0.3);
        const ulY = doc.y;
        doc.moveTo(55, ulY).lineTo(PW - 55, ulY).strokeColor(GOLD).lineWidth(1.5).stroke();
        doc.moveDown(0.7);

        for (let i = bodyStart; i < lines.length; i++) {
          const raw = lines[i], line = raw.trim();
          if (!line) { doc.moveDown(0.25); continue; }
          if (doc.y > PH - 100) {
            doc.addPage();
            doc.rect(0, 0, PW, 6).fill(GOLD);
            doc.y = 25;
          }
          if (/^#{2,3}\s/.test(raw)) {
            doc.moveDown(0.4);
            doc.fillColor(NAVY).font('Bold').fontSize(11).text(line.replace(/^#+\s*/, ''), 55, doc.y, { width: PW - 110 });
            doc.moveDown(0.3);
            const sy = doc.y;
            doc.moveTo(55, sy).lineTo(PW * 0.6, sy).strokeColor('#c5d0e8').lineWidth(0.8).stroke();
            doc.moveDown(0.4);
          } else if (/^\d+\.\s/.test(line)) {
            doc.fillColor(NAVY).font('Bold').fontSize(10).text(line, 65, doc.y, { width: PW - 130 }).font('Regular');
            doc.moveDown(0.3);
          } else if (/^[-•*]\s/.test(line)) {
            const content = line.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '');
            const bulletY = doc.y;
            doc.fillColor(GOLD).font('Bold').fontSize(10).text('▸', 67, bulletY, { lineBreak: false });
            doc.fillColor(TEXT).font('Regular').fontSize(10).text(content, 86, bulletY, { width: PW - 150 });
            doc.moveDown(0.2);
          } else {
            doc.fillColor(TEXT).font('Regular').fontSize(10)
               .text(line.replace(/\*\*(.+?)\*\*/g, '$1'), 55, doc.y, { width: PW - 110, lineGap: 2 });
            doc.moveDown(0.35);
          }
        }
        doc.moveDown(1.2);
        if (sectionNum < 7 && doc.y < PH - 80) {
          const sepY = doc.y;
          doc.moveTo(55, sepY).lineTo(PW - 55, sepY).strokeColor('#e8dfc8').lineWidth(0.5).stroke();
          doc.moveDown(1);
        }
      }
    } else {
      doc.fillColor(TEXT).font('Regular').fontSize(10).text(claudeContent, 55, doc.y, { width: PW - 110, lineGap: 3 });
    }

    // ── Disclaimer page ──
    if (doc.y > 80) doc.addPage();
    doc.rect(0, 0, PW, 6).fill(GOLD);
    doc.y = 40;
    doc.fillColor(NAVY).font('Bold').fontSize(16)
       .text('Αποποίηση Ευθύνης & Πληροφορίες', 55, doc.y, { align: 'center', width: PW - 110 });
    doc.moveDown(1);
    const dlY = doc.y;
    doc.moveTo(55, dlY).lineTo(PW - 55, dlY).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1.5);
    [
      '⚠ ΣΗΜΑΝΤΙΚΗ ΑΠΟΠΟΙΗΣΗ ΕΥΘΥΝΗΣ', '',
      `Το παρόν έγγραφο δημιουργήθηκε αποκλειστικά για πληροφοριακούς σκοπούς και απευθύνεται στον/ην ${customerName}. ΔΕΝ αποτελεί νομική συμβουλή, ούτε υποκαθιστά τη νομική εκπροσώπηση από αδειοδοτημένο δικηγόρο ή συμβολαιογράφο.`, '',
      'Οι πληροφορίες στο παρόν έγγραφο:',
      '- Βασίζονται στην ελληνική νομοθεσία που ισχύει κατά την ημερομηνία δημιουργίας',
      '- Ενδέχεται να μην αντικατοπτρίζουν τις τελευταίες νομοθετικές αλλαγές',
      '- Χρειάζεται επαλήθευση από αρμόδιο νομικό σύμβουλο για οποιαδήποτε νομική ενέργεια', '',
      'ΓΙΑ ΕΠΙΣΗΜΕΣ ΝΟΜΙΚΕΣ ΕΝΕΡΓΕΙΕΣ, ΑΠΕΥΘΥΝΘΕΙΤΕ ΣΕ:',
      '- Αδειοδοτημένο δικηγόρο (Δικηγορικός Σύλλογος Αθηνών: 210 339 6000)',
      '- Συμβολαιογράφο (Συμβολαιογραφικός Σύλλογος: 210 364 1616)',
      '- ΚΕΠ (Κέντρα Εξυπηρέτησης Πολιτών) ή gov.gr για ψηφιακές υπηρεσίες',
    ].forEach(line => {
      if (!line) { doc.moveDown(0.4); return; }
      const isBold = line.startsWith('⚠') || line.startsWith('ΓΙΑ') || line.startsWith('Οι');
      doc.fillColor(line.startsWith('-') ? SUB : TEXT)
         .font(isBold ? 'Bold' : 'Regular').fontSize(10)
         .text(line, 55, doc.y, { width: PW - 110, lineGap: 2 });
      doc.moveDown(0.35);
    });

    doc.moveDown(2);
    const fiY = doc.y;
    doc.rect(55, fiY, PW - 110, 80).fill(NAVY);
    doc.fillColor('#ffffff').font('Bold').fontSize(14).text('Life', 70, fiY + 18, { continued: true });
    doc.fillColor(GOLD).text('Simple');
    doc.fillColor('#8fa3c8').font('Regular').fontSize(9).text('lifesimple.gr  ·  support@lifesimple.gr', 70, fiY + 40);
    doc.fillColor('#8fa3c8').fontSize(8).text('© 2025 LifeSimple. Με επιφύλαξη παντός δικαιώματος.', 70, fiY + 56);

    addPageNumbers();
    doc.end();
  });
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('🔑 API key loaded:', process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO');
  console.log('📝 Generating content with Claude (this takes ~30-60 seconds)...\n');

  const systemPrompt = buildSystemPrompt(product);
  const userPrompt   = buildUserPrompt(product, formData, customerName);

  let claudeContent;
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 8000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });
    claudeContent = msg.content[0].text;
    const wordCount = claudeContent.split(/\s+/).length;
    const sections  = (claudeContent.match(/\[ΕΝΟΤΗΤΑ_\d+\]/g) || []).length;
    console.log(`✓ Claude response received`);
    console.log(`  Words: ~${wordCount}`);
    console.log(`  Sections found: ${sections}/7`);
  } catch (err) {
    console.error('✗ Claude API error:', err.message);
    process.exit(1);
  }

  console.log('\n🖨  Building PDF...');
  let pdfBuf;
  try {
    pdfBuf = await buildPDF(productName, formData, claudeContent, customerName);
    console.log(`✓ PDF built: ${pdfBuf.length} bytes (~${Math.round(pdfBuf.length/1024)}KB)`);
  } catch (err) {
    console.error('✗ PDF error:', err.message);
    process.exit(1);
  }

  const outPath = path.join(__dirname, 'test_output.pdf');
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`\n✅ Saved to: ${outPath}`);
  console.log('   On Windows: C:\\Users\\Andreas\\Desktop\\lifesimple\\test_output.pdf');

  // Quick page count
  const raw = pdfBuf.toString('binary');
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`   Page count: ${pageCount} pages`);
}

main().catch(console.error);
