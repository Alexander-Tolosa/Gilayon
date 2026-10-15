# Running the demo from a MacBook and a phone

Everything in Gilayon runs on the one laptop. The phone is only a camera and a second screen: it opens the same app over the Wi-Fi. Nothing goes to the internet, which is the point of the demo, so the laptop must be able to show the whole thing with the Wi-Fi off.

Allow about 40 minutes the first time, and do it the day before, not on the morning.

---

## 1. What you need

- **Node 20.9 or newer** (22 LTS is a safe choice): `node -v`. If it is missing, `brew install node@22`.
- **Git**, and access to the repository.
- The laptop and the phone **on the same Wi-Fi**, with the hotspot you will use on the day.

Nothing else. The text reader (Tesseract) and the image cleanup (sharp) come down with `npm install`, so there is no Python, no Homebrew package and no model to download for the reading itself.

## 2. Get it running

```bash
git clone https://github.com/Alexander-Tolosa/Gilayon.git
cd Gilayon
npm ci          # takes a few minutes; the lockfile already carries the Apple Silicon binaries
npm run dev     # http://localhost:3000
```

The first start creates an embedded database in `.data/` and fills it with the synthetic clinic. There is no database server to install.

Check it works before going further:

1. Open <http://localhost:3000/clinic/login>, sign in as the receptionist (the password is filled in).
2. Go to **Scan old folder**, press **Villanueva (clean print)**, and wait a few seconds.
3. The fields should fill in and the patient should be matched. Press **I checked every field**.

If that works, the hard part is done.

## 3. HTTPS, so the phone's camera works

**A phone will not open its camera on a plain `http://` page.** Safari and Chrome both refuse, silently in some versions. For the phone to take pictures of the paper form, the laptop has to serve the app over HTTPS with a certificate the phone trusts. Gilayon carries its own small certificate authority for exactly this.

Find the laptop's address on the Wi-Fi:

```bash
ipconfig getifaddr en0        # e.g. 192.168.1.14   (en1 on some machines)
```

Then build once and make the certificate for that address:

```bash
npm run build
npm run https:setup -- --host 192.168.1.14    # use the address you just got
npm run start:https                           # serves https://192.168.1.14:3443
```

Leave that running. `npm run https:status` shows the names it covers and the CA fingerprint.

> If the Wi-Fi changes, the address usually changes with it. Run `https:setup` again with the new address, or pass several `--host` values up front. This is the single most common thing to get caught by on the day.

## 4. Trust the certificate

### On the MacBook

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/himsog-ca.crt
```

(The file keeps the old name on purpose; renaming it would force every machine to trust a new one.)

### On the phone (iPhone)

1. In Safari on the phone, open `http://192.168.1.14:3000/ca.crt`.
2. Allow the download. iOS says **Profile Downloaded**.
3. **Settings → General → VPN & Device Management →** tap the Gilayon profile → **Install**.
4. **Settings → General → About → Certificate Trust Settings →** turn the Gilayon certificate **on**. iOS will not trust it until you do this second step, and the camera will keep failing if you stop after step 3.
5. Open `https://192.168.1.14:3443` in Safari. You should get a clean padlock and the sign-in page.

On Android it is **Settings → Security → Encryption & credentials → Install a certificate → CA certificate**.

## 5. Ollama (optional, and skip it if time is short)

The demo does not need it. Reading the form is done by the text reader and a set of rules, and the measured 93% figure is from those alone. Ollama only fills fields the rules could not read, and the screen says plainly which engines were used.

If you want it:

```bash
brew install --cask ollama      # or download from ollama.com
ollama pull llama3.2:3b         # about 2 GB, needs the internet, so do it beforehand
```

Ollama starts on its own and listens on `127.0.0.1:11434`. The app finds it with no configuration. On the Scan screen, the badge changes from "Rule reader (local)" to name the model.

A 3B model uses roughly 3 GB of memory while it is working. On an M-series MacBook Pro a form takes a second or two. If the laptop is also running the app and the database, keep an eye on memory during the rehearsal.

To turn it off again for a run: `OLLAMA_DISABLED=1 npm run start:https`.

Measured on an M5 MacBook with 16 GB (60 synthetic forms): this text model made a form take 6 s instead of 1.7 s and changed no field, so it is the first thing to drop if memory or time is tight.

### The handwriting reader (optional, for forms filled in by hand)

A second, separate model that looks at the picture itself. It is used only when someone presses **Read handwriting** on the scan screen, after the normal scan.

```bash
ollama pull qwen2.5vl:3b        # about 3.2 GB, needs the internet, so do it beforehand
```

- **Memory:** about 5 GB while it is loaded, on top of the app. On a 16 GB laptop, close other programs, and press the button once during the rehearsal so the model is already loaded on the day.
- **Time:** about 15 seconds a page (the first read after a restart also loads the model). The screen says it is reading.
- **What it changes:** where Tesseract was unsure, the model's value is proposed and marked **Check**, with a note saying what Tesseract read. Where Tesseract was sure of a value that has a format (a date, a phone number, a PIN), it keeps it and flags the disagreement. Nothing is saved until the nurse confirms every field.
- **If the model is missing,** the button is greyed out and says `ollama pull qwen2.5vl:3b`.
- Turn it off with `OLLAMA_DISABLED=1`, or point it at a different model with `OLLAMA_VISION_MODEL`.

## 6. The evening before

- [ ] Run through the whole demo once on the Wi-Fi you will use on the day.
- [ ] **Turn the Wi-Fi off and run it again.** Everything except the phone should still work; that is the point you are making.
- [ ] Take one picture with the phone's camera and let it be read, end to end.
- [ ] Charge both. The laptop screen must not sleep: `caffeinate -d` in a spare terminal keeps it awake.
- [ ] Print the blank form from <http://localhost:3000/forms/intake-form-blank.png> and fill one in by hand, in block letters. Have two or three ready.
- [ ] Record a short screen capture of the working demo, as a fallback if the network misbehaves on stage.

## 7. If something goes wrong

| What you see | What to do |
| --- | --- |
| The camera button says the page is not secure | You are on `http://`. Use the `https://…:3443` address, and check step 4 was finished on the phone. |
| The phone cannot reach the laptop at all | Same Wi-Fi? Some public and hotel networks keep devices apart. Use a phone hotspot instead. macOS may also ask to allow incoming connections for `node`: say yes. |
| The certificate is not trusted on the phone | Step 4 part 2 was missed, or the address changed since `https:setup` ran. |
| A startup error mentioning `recognition_event` | An older database is in the way. `rm -rf .data` and start again; it re-seeds itself. |
| The scan reads nothing | Fill the frame with the page, keep it flat, and avoid a shadow across the middle. Good light matters more than a good camera. |
| Everything is on fire | Fall back to taking the photo on the phone, AirDropping it to the Mac, and using **Upload a photo**. The rest of the demo is unchanged. |

## 8. What to say about the numbers

`docs/ACCURACY.md` carries the measured result: **93% of fields read correctly over 60 test forms, and 100% on every printed one**, in about three seconds a page, with no internet.

Two things to be straight about if anyone asks:

- The test forms are **synthetic**. They hold no real patient data, and the handwriting rows are simulated with fonts, so they are tidier than a real hand.
- This is **not** the accuracy of the saved records. A nurse or doctor checks every field before anything is written, so the record is right either way. What the figure measures is how much typing that check saves.
