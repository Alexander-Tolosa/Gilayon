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
| Clean scan or flatbed | 12 | 100.0% | 12/12 | 2.8 s |
| Phone photo, tilted | 12 | 100.0% | 12/12 | 3.1 s |
| Poor light, low contrast | 12 | 100.0% | 12/12 | 2.8 s |
| Handwriting (neat, simulated) | 12 | 71.0% | 0/12 | 2.8 s |
| Handwriting (hurried, simulated) | 12 | 95.2% | 4/12 | 3.0 s |
| **All** | **60** | **93.0%** | **40/60** | **2.9 s** |

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
