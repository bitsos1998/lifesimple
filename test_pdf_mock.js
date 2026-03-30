/**
 * PDF rendering test — uses mock Claude content (no API call needed).
 * Tests layout, fonts, bullet points, page count, blank page fix.
 */

const PDFDocument  = require('pdfkit');
const path         = require('path');
const fs           = require('fs');

const FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD    = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

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

// ── Mock Claude content ─────────────────────────────────────────────────────
const MOCK_CONTENT = `
[ΕΝΟΤΗΤΑ_1]Καλώς ήρθες — Κάνεις Κάτι Πολύ Σημαντικό για Αυτούς που Αγαπάς

Ανδρέα, χαίρομαι που βρίσκεσαι εδώ. Η απόφαση να συντάξεις διαθήκη δεν είναι μια συνηθισμένη νομική διαδικασία — είναι μια πράξη αγάπης και υπευθυνότητας προς τους ανθρώπους που αγαπάς.

Ξέρω ότι πολλοί άνθρωποι αναβάλλουν αυτή τη στιγμή, επειδή νιώθουν άβολα με τη σκέψη του θανάτου. Αλλά εσύ, Ανδρέα, πήρες την απόφαση. Και αυτό λέει πολλά για σένα — για το πόσο σέβεσαι τους αγαπημένους σου και θέλεις να τους προστατεύσεις.

Σε αυτό το έγγραφο θα σε οδηγήσω βήμα-βήμα μέσα από όλα όσα πρέπει να γνωρίζεις. Θα μάθεις ποιες είναι οι επιλογές σου, τι λέει ο ελληνικός νόμος για την περίπτωσή σου συγκεκριμένα — εσύ, Ανδρέα, παντρεμένος με δύο παιδιά — και θα φύγεις με ένα σαφές σχέδιο δράσης.

Έτοιμος; Ας ξεκινήσουμε.
[/ΕΝΟΤΗΤΑ_1]

[ΕΝΟΤΗΤΑ_2]Τι Πρέπει να Ξέρεις για τη Διαθήκη στην Ελλάδα

Η διαθήκη στην Ελλάδα ρυθμίζεται κυρίως από τον Αστικό Κώδικα (ΑΚ), άρθρα 1710-1821. Ας δούμε τα βασικά.

## Τύποι Διαθήκης

Στην Ελλάδα υπάρχουν τρεις βασικοί τύποι διαθήκης:

- **Ιδιόγραφη διαθήκη** (ΑΚ 1721): Γράφεται ολόκληρη με το χέρι του διαθέτη, χρονολογείται και υπογράφεται. Δεν χρειάζεται συμβολαιογράφος. Κόστος: σχεδόν μηδενικό.
- **Δημόσια διαθήκη** (ΑΚ 1724): Συντάσσεται ενώπιον συμβολαιογράφου με δύο μάρτυρες. Πιο ασφαλής, δυσκολότερα αμφισβητήσιμη. Κόστος: 100-300 ευρώ.
- **Μυστική διαθήκη** (ΑΚ 1738): Σπάνια χρησιμοποιείται σήμερα.

## Τι Συμβαίνει χωρίς Διαθήκη

Αν πεθάνεις χωρίς διαθήκη (εξ αδιαθέτου διαδοχή, ΑΚ 1813-1821), η περιουσία σου κατανέμεται σύμφωνα με τον νόμο — όχι σύμφωνα με τις επιθυμίες σου. Αυτό σημαίνει ότι η οικογένειά σου μπορεί να αντιμετωπίσει περίπλοκες και χρονοβόρες νομικές διαδικασίες.

## Νόμιμη Μοίρα

Σημαντικό: Ακόμα και με διαθήκη, ορισμένοι κληρονόμοι (σύζυγος, τέκνα, γονείς) δικαιούνται τη λεγόμενη νόμιμη μοίρα — ένα ελάχιστο μερίδιο που δεν μπορείς να τους αφαιρέσεις (ΑΚ 1825-1845).
[/ΕΝΟΤΗΤΑ_2]

[ΕΝΟΤΗΤΑ_3]Η Δική σου Κατάσταση — Εξατομικευμένη Ανάλυση

Ανδρέα, βάσει των στοιχείων που μας έδωσες, η κατάστασή σου έχει ως εξής:

Είσαι παντρεμένος και έχεις δύο παιδιά. Αυτό σημαίνει ότι έχεις τρεις εξ αδιαθέτου κληρονόμους πρώτης τάξης: τη σύζυγό σου και τα δύο παιδιά σου.

## Νόμιμη Μοίρα στην Περίπτωσή σου

Το ελεύθερο τμήμα της περιουσίας σου (αυτό που μπορείς να διαθέσεις ελεύθερα) είναι το 1/2 της συνολικής κληρονομιάς. Το υπόλοιπο 1/2 αποτελεί τη νόμιμη μοίρα των κληρονόμων σου.

## Τα Περιουσιακά σου Στοιχεία

Δήλωσες ότι έχεις:
- Ακίνητα
- Τραπεζικούς λογαριασμούς

Για τα ακίνητα, η μεταβίβαση κληρονομιάς απαιτεί δήλωση στην εφορία εντός 6 μηνών από τον θάνατο. Φόρος κληρονομιάς για σύζυγο και τέκνα: αφορολόγητο έως 150.000€ ανά κληρονόμο (Α' κατηγορία).

## Η Επιθυμία σου

Δήλωσες ότι θέλεις να αφήσεις τα πάντα στη γυναίκα σου. Αυτό είναι εφικτό για το ελεύθερο τμήμα (50% της περιουσίας). Το υπόλοιπο 50% (νόμιμη μοίρα) δικαιούνται τα παιδιά σου.
[/ΕΝΟΤΗΤΑ_3]

[ΕΝΟΤΗΤΑ_4]Τι Λέει ο Ελληνικός Νόμος — Αστικός Κώδικας

Ανδρέα, ας δούμε τι λέει ακριβώς ο νόμος για την περίπτωσή σου.

## Ικανότητα Σύνταξης Διαθήκης (ΑΚ 1710-1717)

Για να συντάξεις έγκυρη διαθήκη πρέπει:
1. Να έχεις συμπληρώσει το 18ο έτος της ηλικίας σου
2. Να μην έχεις τεθεί υπό δικαστική συμπαράσταση
3. Να συντάσσεις τη διαθήκη σε κατάσταση πλήρους νοητικής διαύγειας

## Νόμιμη Μοίρα (ΑΚ 1825)

Η νόμιμη μοίρα ανέρχεται στο 1/2 της εξ αδιαθέτου μερίδας. Για σένα, Ανδρέα, με σύζυγο και δύο τέκνα:
- Εξ αδιαθέτου: σύζυγος 1/4, κάθε τέκνο 3/8
- Νόμιμη μοίρα: σύζυγος 1/8, κάθε τέκνο 3/16

## Πότε Ακυρώνεται Διαθήκη (ΑΚ 1782-1800)

- Αν δεν πληροί τους τυπικούς όρους (π.χ. δεν είναι ολόχειρη στην ιδιόγραφη)
- Αν ο διαθέτης δεν είχε πλήρη ικανότητα
- Αν υπήρξε απάτη, βία ή πλάνη
- Αν παραβιάζει τη νόμιμη μοίρα (μερική ακύρωση)
[/ΕΝΟΤΗΤΑ_4]

[ΕΝΟΤΗΤΑ_5]Οι Επιλογές σου — Ποια Διαθήκη σε Εκφράζει

Ανδρέα, με βάση την κατάστασή σου — παντρεμένος με δύο παιδιά, ακίνητα και τραπεζικούς λογαριασμούς — ας δούμε ποια επιλογή σου ταιριάζει καλύτερα.

## Επιλογή 1: Ιδιόγραφη Διαθήκη

**Πλεονεκτήματα:**
- Χαμηλό κόστος (ουσιαστικά μηδενικό)
- Απλή διαδικασία, γίνεται στο σπίτι
- Εμπιστευτική

**Μειονεκτήματα:**
- Πιο εύκολα αμφισβητήσιμη
- Κίνδυνος να χαθεί
- Δεν παρέχει νομική καθοδήγηση

**Κατάλληλη για σένα αν:** Η περιουσία σου είναι απλή και δεν υπάρχει κίνδυνος διαμάχης.

## Επιλογή 2: Δημόσια Διαθήκη (Συνιστάται)

**Πλεονεκτήματα:**
- Ισχυρή νομική προστασία
- Φυλάσσεται στο αρχείο του συμβολαιογράφου
- Δύσκολα αμφισβητήσιμη
- Ο συμβολαιογράφος σε καθοδηγεί

**Μειονεκτήματα:**
- Κόστος 150-300 ευρώ
- Απαιτεί ραντεβού

**Κατάλληλη για σένα:** Ναι, Ανδρέα. Με ακίνητα και δύο παιδιά, η δημόσια διαθήκη είναι η ασφαλέστερη επιλογή.
[/ΕΝΟΤΗΤΑ_5]

[ΕΝΟΤΗΤΑ_6]Τα Επόμενα Βήματά σου — Βήμα-Βήμα Οδηγός Δράσης

Ανδρέα, εδώ είναι το συγκεκριμένο σχέδιό σου:

1. **Μάζεψε τα απαραίτητα έγγραφα** — Αστική ταυτότητα, ΑΜΚΑ, ΑΦΜ, τίτλοι ιδιοκτησίας ακινήτων, κατάσταση τραπεζικών λογαριασμών. Χρόνος: 1-2 μέρες.

2. **Κάνε λίστα με τα περιουσιακά σου στοιχεία** — Ακίνητα (διεύθυνση, ΑΤΑΚ, εκτιμώμενη αξία), τραπεζικοί λογαριασμοί (τράπεζα, IBAN, υπόλοιπο). Χρόνος: μισή μέρα.

3. **Αποφάσισε τις τελικές σου επιθυμίες** — Ποιος τι παίρνει. Θυμήσου: το 50% είναι ελεύθερο, πηγαίνει στη σύζυγό σου. Χρόνος: 1 μέρα με οικογένεια.

4. **Βρες συμβολαιογράφο** — Συμβολαιογραφικός Σύλλογος Αθηνών: 210 364 1616. Ή online στο gov.gr. Κόστος αμοιβής: 150-300€.

5. **Κλείσε ραντεβού** — Συνήθως διαθέσιμοι εντός 1-2 εβδομάδων. Πες τους ότι θέλεις να συντάξεις δημόσια διαθήκη.

6. **Πήγαινε στον συμβολαιογράφο με μάρτυρες** — Χρειάζονται 2 μάρτυρες (ενήλικες, όχι κληρονόμοι). Μπορεί να είναι φίλοι ή ο γραμματέας του συμβολαιογράφου.

7. **Υπέγραψε τη διαθήκη** — Ο συμβολαιογράφος διαβάζει τη διαθήκη δυνατά. Υπογράφεις εσύ, οι μάρτυρες και ο συμβολαιογράφος. Διάρκεια: 1-2 ώρες.

8. **Κράτησε αντίγραφο** — Ο συμβολαιογράφος φυλάσσει το πρωτότυπο. Σου δίνει επίσης αντίγραφο.

9. **Ενημέρωσε τους εμπιστευμένους σου** — Πες στη σύζυγό σου πού βρίσκεται η διαθήκη ή πώς να επικοινωνήσει με τον συμβολαιογράφο.

10. **Επανεξέτασε κάθε 3-5 χρόνια** — Αλλαγές στην οικογένεια, την περιουσία ή τη νομοθεσία μπορεί να απαιτούν ενημέρωση.
[/ΕΝΟΤΗΤΑ_6]

[ΕΝΟΤΗΤΑ_7]Ένα Τελευταίο Μήνυμα — Απευθείας σε Σένα

Ανδρέα, θέλω να σου πω κάτι προσωπικά.

Αυτό που κάνεις σήμερα — να φροντίσεις για τη διαθήκη σου — είναι μια από τις πιο σημαντικές πράξεις αγάπης που μπορείς να κάνεις για τη σύζυγό σου και τα παιδιά σου. Δεν είναι εύκολο να σκεφτόμαστε αυτές τις στιγμές, αλλά εσύ το έκανες.

Η ηρεμία που θα νιώσεις όταν ξέρεις ότι όλα είναι τακτοποιημένα — ότι η οικογένειά σου θα είναι προστατευμένη — είναι ανεκτίμητη, Ανδρέα.

Οι άνθρωποι που σε αγαπούν ίσως δεν ξέρουν τι έκανες σήμερα. Αλλά αυτό δεν έχει σημασία. Εσύ ξέρεις. Και αυτό αρκεί.

Να είσαι καλά, Ανδρέα. Η οικογένειά σου είναι τυχερή που σε έχει.
[/ΕΝΟΤΗΤΑ_7]
`;

// ─── buildPDF (exact copy from server.js with all fixes) ────────────────────
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

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('📄 Building PDF with mock content (no API call)...\n');

  const wordCount = MOCK_CONTENT.split(/\s+/).length;
  const sections  = (MOCK_CONTENT.match(/\[ΕΝΟΤΗΤΑ_\d+\]/g) || []).length;
  console.log(`  Mock content: ~${wordCount} words, ${sections}/7 sections`);

  let pdfBuf;
  try {
    pdfBuf = await buildPDF(productName, formData, MOCK_CONTENT, customerName);
    console.log(`✓ PDF built: ${pdfBuf.length} bytes (~${Math.round(pdfBuf.length/1024)}KB)`);
  } catch (err) {
    console.error('✗ PDF error:', err);
    process.exit(1);
  }

  const outPath = path.join(__dirname, 'test_output.pdf');
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`\n✅ Saved to: ${outPath}`);

  // Page count
  const raw = pdfBuf.toString('binary');
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`   Page count: ${pageCount} pages`);
  if (pageCount <= 10) {
    console.log('   ✓ Page count looks correct (no blank page explosion)');
  } else {
    console.log('   ⚠ Unexpectedly high page count — investigate');
  }
}

main().catch(console.error);
