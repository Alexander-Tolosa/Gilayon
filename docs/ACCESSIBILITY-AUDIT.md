# Accessibility and large-text audit (code level)

Scope: `src/features/clinic/**`, `src/shared/components/ui.tsx`, `src/index.css`. Static review only; nothing here has been tried with a screen reader, a keyboard-only senior user, or a real A++ session. Severity: High = blocks or misleads a user, Medium = hard to use, Low = polish.

## Findings

| # | Screen / component | Issue | Severity | Fixed |
|---|---|---|---|---|
| 1 | All forms (`Field` + `Input`/`Select`/`Textarea`) | Label was not tied to its control unless `htmlFor` was passed (almost never). Screen readers announced unlabeled fields; hint and error text was not associated. | High | Yes: `Field` now supplies an id and `aria-describedby` to its control via context |
| 2 | Sign-PIN dialog (`PinModal`) | Backspace key announced as the glyph only; PIN progress dots invisible to screen readers; wrong-PIN message not announced; blank key still focusable | High | Yes: label "Delete last digit", sr-only "n of 4 digits entered", `role="alert"` on error, blank key hidden and not focusable |
| 3 | `Modal` (PIN, merge, void, forms) | No focus move on open, no Tab trap, focus not returned to opener, no accessible name | High | Yes: `useDialogFocus` hook, `aria-labelledby`. Escape already worked |
| 4 | Phone/tablet menu drawer | No Escape, no focus trap, no dialog role | Medium | Yes: `MobileDrawer` |
| 5 | Forced password change overlay | `aria-modal` but focus could sit behind it | Medium | Yes: focus moved in and trapped (no Escape on purpose: it is mandatory) |
| 6 | Patient record scan viewer | Full-screen overlay: no Escape, no dialog role, no focus handling | Medium | Yes: `ScanLightbox` |
| 7 | Contrast: `text-faint` (#8a98b1) | 2.5-2.9:1 on white and tinted surfaces; used for "in at" time, optional markers, placeholders, queue position | High | Yes: token now #5c6b85 (4.6+ on white/canvas, about 4.5 on mist) |
| 8 | Contrast: `text-ok` / `text-warn` / `text-danger` on soft backgrounds (status pills, errors) | 3.0 to 4.0:1 (e.g. "Done", "Called", "Left" pills; field errors) | High | Yes: tokens darkened to #0b7a51 / #8f5708 / #c0282f, all above 4.8:1 on their soft tints |
| 9 | Contrast: `text-muted` (#5f6f8a) | 4.39:1 on danger-soft, 4.5 to 4.6 elsewhere: borderline | Low | Yes: #566680 (5.0+ everywhere) |
| 10 | Global `:focus-visible` | Forced `border-radius: 10px`, turning round buttons square when focused | Low | Yes: removed, outline follows the element's own shape |
| 11 | Inputs focus style | Ring `brand-100` nearly invisible; only the border colour changed | Medium | Yes: ring `brand-200` (border change kept) |
| 12 | Queue board actions (Print slip, Mark urgent, Mark left, Back to waiting, Open record) | Size `sm` = 40px at normal text, under 44px | Medium | Yes: actions use `md`; link min-h-11; `sm` buttons, chips, tabs now have a 40px floor and grow with text |
| 13 | Header text-size (A / A+ / A++) and language switches | 36px high | Medium | Yes: min-h-11 |
| 14 | Consult diagnosis chip remove button, recap close, modal close | 28 to 36px | Medium | Yes: 40 to 44px |
| 15 | Queue lanes / status | Lane and status always carry a text label; ticket numbers carry a lane letter. Wait of 30+ min was red only | Medium | Yes: sr-only "(long wait)" added; bold kept |
| 16 | Sign-in account picker | Selected account shown by colour and ring only | Medium | Yes: `aria-pressed` |
| 17 | Settings priority rank buttons | Name was only a digit | Medium | Yes: `aria-label` |
| 18 | Patient names, offices, stat hints on queue, check-in, patients, doctor home, documents | `truncate` cuts names at A++ | Medium | Yes: `break-words` |
| 19 | Reduced motion | CSS animations covered; motion library spring/slide animations were not | Medium | Yes: `MotionConfig reducedMotion="user"` in `Root.tsx` |
| 20 | Clinic shell | No skip link | Low | Yes |
| 21 | Tabs component | Tab buttons had no `type`, no arrow-key navigation, no `tabpanel` wiring | Low | Partly: `type="button"` added; arrow keys and panels not done |
| 22 | Daily report chart | Series distinguished mostly by colour; ticks 12px fixed | Low | No (needs design decision; has table/numbers alongside, verify) |
| 23 | Date inputs, `<datalist>` combos in Consult | Native widgets ignore app font scale and are hard to use with large text on some browsers | Low | No (needs real-device testing) |
| 24 | Print / A4 documents | Fixed pt sizes by design | Low | No (intentional) |
| 25 | `Switch`, `Avatar` xs, `ComputerTag` (12px icon, text-xs) | Small targets/text, not used on primary clinic actions | Low | No |

## Not verified here (needs real senior-staff testing)

- Layout at A++ (140% root) on 1366x768 clinic PCs and tablets: only text wrapping was addressed; ticket rows, the 4-lane summary and the PIN pad were not looked at on a screen.
- Real screen-reader behaviour (NVDA/JAWS/VoiceOver), including the new dialog focus handling and live regions.
- Whether 4.5:1 faint/muted text is actually comfortable for older eyes; WCAG AA is a floor, not a comfort target.
- Tap accuracy on touchscreen check-in tablets, the PIN pad, and the A / A+ / A++ switch (hidden below the `sm` breakpoint).
- Colour-vision checks of lane colours (urgent red vs senior/pregnant/PWD blue share text labels, but PWD and Pregnant share a style).
