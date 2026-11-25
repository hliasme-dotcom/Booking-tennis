# Last-minute τένις

Πλατφόρμα που γεμίζει τα κενά γήπεδα της τελευταίας στιγμής. Το κλαμπ δίνει ένα slot, η πλατφόρμα το δείχνει σε παίκτες με ATRP ±0,5, οι δύο πρώτοι πληρώνουν από το πορτοφόλι τους και ο αγώνας επιβεβαιώνεται. Αν δεν βρεθεί δεύτερος παίκτης μέχρι τη λήξη, τα χρήματα επιστρέφουν αυτόματα.

## Τι κάνει

**Παίκτης:** εγγραφή, δήλωση ωρών που μπορεί να παίξει, λίστα ελεύθερων γηπέδων (στις ώρες του ή όλες), πληρωμή από το πορτοφόλι, αποχώρηση με επιστροφή πριν την επιβεβαίωση, ιστορικό κινήσεων. Το όνομα και το κινητό του αντιπάλου φαίνονται μόνο μετά την επιβεβαίωση.

**Admin (`/admin`):** δημοσίευση κενού slot (κλαμπ, γήπεδο, ώρα, κόστος γηπέδου, τιμή ανά παίκτη, λήξη), λίστα slots με παίκτες και πόσοι ταιριάζουν, ακύρωση με επιστροφές, παίκτες με ATRP και υπόλοιπο, φόρτωση και διόρθωση πορτοφολιού (πάντα με ίχνος), κλαμπ και γήπεδα, αναφορά εσόδων και περιθωρίου ανά κλαμπ.

**Ασφάλεια:** κωδικοί με bcrypt, session cookie HttpOnly/Secure/SameSite, CSP, HSTS, X-Frame-Options, έλεγχοι σε κάθε ενέργεια admin, κλείδωμα γραμμών στη βάση ώστε ταυτόχρονες πληρωμές να μη γεμίζουν τον αγώνα με 3 ή να περνούν το υπόλοιπο.

## Τεχνολογίες

Next.js 16 (App Router, server actions), TypeScript, PostgreSQL 16 με απλό SQL (`pg`).

## Εκκίνηση

```bash
npm install
cp .env.example .env.local          # ρύθμισε το DATABASE_URL
npm run migrate
npm run seed                        # demo παίκτες, κωδικός demo12345
node --env-file=.env.local scripts/create-admin.mjs admin@demo.gr Admin demo12345
npm run dev
```

Λογαριασμοί demo: `admin@demo.gr` (από το create-admin), `maria@demo.gr`, `nikos@demo.gr`, `eleni@demo.gr`.

## Εγκατάσταση σε server (Ubuntu/Debian, π.χ. Hetzner)

Ως root στον server:

```bash
curl -fsSL https://raw.githubusercontent.com/hliasme-dotcom/Booking-tennis/main/deploy/install.sh | bash
```

Φτιάχνει δική του βάση `tennis`, χρήστη `tennis`, υπηρεσία `booking-tennis` στη θύρα 3100 και site στο nginx με HTTPS στη διεύθυνση `tennis.<ip>.sslip.io`. Δεν αγγίζει άλλες εφαρμογές του server. Στο τέλος εμφανίζει τον κωδικό του admin. Αν το ξανατρέξεις, ενημερώνει την εφαρμογή στην τελευταία έκδοση.

Για νέο κωδικό admin: `cd /opt/booking-tennis && sudo -u tennis node --env-file=.env scripts/create-admin.mjs admin@tennis.local "Διαχειριστής" ΝΕΟΣ_ΚΩΔΙΚΟΣ`

## Δοκιμές

```bash
DATABASE_URL=postgres://.../tennis_test npm run migrate
DATABASE_URL=postgres://.../tennis_test npm test
```

Οι δοκιμές τρέχουν σε πραγματική PostgreSQL και αδειάζουν τη βάση, οπότε χρησιμοποίησε ξεχωριστή βάση δοκιμών.

## Επόμενα βήματα

- Φόρτωση πορτοφολιού με κάρτα μέσω Viva
- Ειδοποιήσεις (email/Viber/push) στους παίκτες που ταιριάζουν, μόλις δημοσιευτεί slot
- Απλός σύνδεσμος για το κλαμπ ώστε να δηλώνει μόνο του κενά slots
- Ανάγνωση κενών από BOOK+PLAY, αν το επιτρέψει ο πάροχος
