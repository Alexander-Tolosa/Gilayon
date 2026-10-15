# Scan reading accuracy

Measured on 2026-10-15 over 60 synthetic forms, rule reader only, checked against the clinic records.

Reproduce with:

```bash
node scripts/make-accuracy-set.mjs 12
npx tsx scripts/run-accuracy.ts --registry --report
```

## Result

| Condition | Forms | Fields read correctly | Forms needing no correction | Time per form |
| --- | ---: | ---: | ---: | ---: |
| Clean scan or flatbed | 12 | 100.0% | 12/12 | 2.5 s |
| Phone photo, tilted | 12 | 100.0% | 12/12 | 2.8 s |
| Poor light, low contrast | 12 | 100.0% | 12/12 | 2.5 s |
| Handwriting (neat, simulated) | 12 | 71.0% | 0/12 | 2.4 s |
| Handwriting (hurried, simulated) | 12 | 95.2% | 4/12 | 2.9 s |
| **All** | **60** | **93.0%** | **40/60** | **2.6 s** |

## By field

| Field | Read correctly |
| --- | ---: |
| medicines | 70.0% (42/60) |
| visit | 91.6% (109/119) |
| contact | 91.7% (55/60) |
| philhealth_pin | 91.7% (55/60) |
| folder | 93.3% (56/60) |
| full_name | 93.3% (56/60) |
| birthdate | 93.3% (56/60) |
| civil_status | 95.0% (57/60) |
| allergy | 95.3% (82/86) |
| sex | 100.0% (60/60) |
| family | 100.0% (124/124) |

## How this is measured

- Each field is compared with the known answer the same way the live system compares it with what the nurse confirmed: letters and digits only, case ignored.
- A field the reader missed, or invented, counts as wrong.
- Everything runs on one PC with no internet.

## What these numbers are not

- **The forms are synthetic.** They carry no real patient data, and the handwriting rows are simulated with fonts, so they are tidier than a real hand. Treat the handwriting figures as optimistic until real forms are measured.
- **This is not the accuracy of the saved records.** A nurse or doctor checks every field before anything is written, so the record is right regardless. What this measures is how much typing that check saves.

## With the handwriting reader (added 2026-10-15)

A local vision model (Qwen2.5-VL 3B, through Ollama) reads the picture itself after the OCR, on every scan where it is installed. Measured on the same kind of 60 synthetic forms, with the clinic records correcting near-misses, on one M5 MacBook with 16 GB, no internet:

| Reader | Fields right | Perfect forms | Time per form |
| --- | ---: | ---: | ---: |
| Rule reader (above), on this MacBook | 97.2% | 46/60 | 1.7 s |
| Rule reader plus Llama 3.2 3B text model (removed 2026-10-15) | 97.2% | 46/60 | 6.0 s |
| Rule reader plus handwriting reader (3B) | 100.0% | 60/60 | 15.0 s |
| Same, with the larger 7B model (earlier run) | 99.5% | 59/60 | about 23 s |

- **The text model was dropped on 2026-10-15.** It changed no field in 60 forms while adding about 4 seconds, and on a real photographed form it turned garbled OCR letters into a confident, invented patient name. The rule reader and the image reader remain.
- These are synthetic forms. On the first real photographed form we tried, a different clinic's layout, 1 field of 9 was right: the reader looks for this form's printed labels, so another form has nowhere to put its answers.
- With the 3B model every condition (clean, photo, dim, hand, messy) scored 100.0%, and every field type scored 100.0%. Medicines went from 78.3% to 100.0%. It needs about 5 GB of memory while loaded.
- Reproduce with `npx tsx scripts/run-accuracy.ts --registry --vision` (about 30 minutes for 60 forms).
- The 7B row was measured before the fix that removes visit lines the rules had misfiled under family history, so the two rows are not a fair size comparison. These are synthetic forms with typed handwriting-style fonts; real handwriting will score lower.
- Two things differ from the figures above: this MacBook has no "Ink Free" font, so its simulated handwriting is neater, which is why the rule reader scores 97.2% here and 93.0% there. Compare readers within one run, not across runs. And the average time includes a few slow forms measured while the computer was busy with other work.
- The model can write a plausible wrong word, where OCR leaves a gap. In the first test it wrote one surname with an extra letter five times, and Chinese characters inside an English word three times. The clinic records corrected the names, and characters that are not on the form are discarded, but a person must still check every field before it is saved.

