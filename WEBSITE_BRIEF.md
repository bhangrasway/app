# Public Website Brief — Bhangra Sway Cremona

Handoff document: everything collected so far for building the studio's public
marketing website. Written 2026-07-09.

## 1. The business

- **Name:** Bhangra Sway Cremona — a bhangra (Punjabi folk dance) studio in
  Cremona, Italy.
- **Logo:** `logo.png` in repo root (55 KB, used on every page).
- **Classes:** weekends — Saturday & Sunday, 1:15 PM – 7:00 PM (from
  `checkin_settings` defaults; confirm with owner before publishing).
- **Location:** studio coordinates used by the check-in geofence:
  lat 45.1395108, lng 10.0288616 (from the studio's Google Maps listing).
- **Audience:** local Punjabi community + Italians curious about bhangra;
  many students are kids (parent contact on file).
- **Free demo classes exist** as a concept — the app tracks `isdemo`
  attendance that doesn't count toward the paid plan. A "book a free trial"
  call-to-action maps directly onto this.

## 2. Missing info — use placeholders, owner will fill in

- Instagram / Facebook / YouTube handles
- Public contact phone/email (owner's email: bhangrasway@gmail.com — confirm
  before publishing it)
- Street address of the studio
- Photos / videos of classes and performances
- Pricing (monthly fee varies per student in the app; no public price list yet)

## 3. Agreed direction (discussed with owner)

Reference site the owner likes: https://www.bhangraempire.com/
(hero photo + tagline, clear sections, social links everywhere). Adapt it to a
*local studio* whose goal is "join our classes in Cremona", not a touring crew.

Planned structure — single-page site:
1. Hero — logo, purple gradient branding, energetic tagline
2. What is Bhangra / About the studio
3. Classes — schedule (Sat–Sun 1:15–7:00 PM) + location/map
4. Free trial CTA — WhatsApp deep-link ("Hi, I'd like to try a class!")
5. Gallery — styled placeholders until owner provides photos
6. Footer — contact, socials, small "Members" link to `home.html`

**Root URL decision (proposed, not yet confirmed):** the new public site
should become `index.html` and the current admin dashboard should move to
`admin.html` — right now visitors to the site root land on the admin login,
which is wrong for a public site. Confirm with owner before renaming.

## 4. Tech stack & constraints

- **No build step, no npm.** Plain HTML files, all JS via CDN
  (`@supabase/supabase-js@2`, jszip/xlsx/qrcode in the admin page only).
- **Hosting:** GitHub Pages, auto-deploy on push to `main`
  (`.github/workflows/deploy.yml` uploads the whole repo). There is also a
  `Procfile`/`server.py` (stdlib Python) but Pages is the live path — the
  public site must be fully static.
- **Fonts:** Inter via Google Fonts (same `<link>` on every page).
- **PWA bits:** `manifest.json` + `logo.png` icons; public pages link it.

## 5. Design system (match the existing pages)

- Background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Accent green (primary buttons): `#27ae60`
- Headings/dark text: `#2c3e50`; body text `#555`
- White cards: `border-radius: 16px`, `box-shadow: 0 12px 32px rgba(0,0,0,0.25)`,
  max-width 440px (the public site can go wider, but keep the same palette)
- Pills/top-bar buttons: `rgba(255,255,255,0.18)` bg, `1px solid
  rgba(255,255,255,0.45)`, `border-radius: 999px` (see `.top-home-btn` /
  `.lang-dd-toggle` in checkin.html)
- Purple active/hover tint: `#eef2ff` bg with `#667eea` border

## 6. i18n — three languages, already built (`i18n.js`)

- Languages: `en` (English), `it` (Italiano), `pa` (Punjabi — **romanized
  Latin script, NOT Gurmukhi**, per owner preference; short code shown as "PU").
- Usage: include `<script src="i18n.js"></script>`, tag static elements with
  `data-i18n="key"` / `data-i18n-placeholder="key"`, call `t('key', {vars})`
  for dynamic strings, define `window.onLangChange` to re-render dynamic text.
- Drop `<div class="lang-picker" id="langPicker"></div>` into the page and a
  **flag-only dropdown** renders itself (Union Jack / Italian tricolore /
  yellow Punjab-map sticker with "PUNJAB" lettering — all inline SVG, styles
  injected by i18n.js). Language choice persists in localStorage (`bs_lang`).
- The new website's copy should be added as new keys in all three languages
  in `i18n.js` (keep the existing keys untouched — the member pages use them).
- Owner greeting convention: Punjabi uses "Sat Sri Akal", Italian "Ciao".

## 7. Existing pages (don't break these)

| File | Role |
|---|---|
| `index.html` | Admin dashboard (Supabase Auth login). Currently at the root. |
| `home.html` | Member menu: Mark Attendance / See Your Report + lang dropdown |
| `checkin.html` | Self check-in — phone-number identification (see §8) |
| `report.html` | Self-service progress report — same phone identification |
| `membership.js` | Shared membership-math engine (admin + report use it) |
| `i18n.js` | Translations + language dropdown (see §6) |

## 8. Data & privacy rules (IMPORTANT for the public site)

- Supabase project: `https://geeqcyfnkgamcjclulay.supabase.co` (anon key is
  hardcoded in the member pages).
- RLS is ON for all tables. The anon role can only read `checkin_settings`
  and call phone-verified RPCs (`find_members_by_phone`, `checkin_self_by_phone`,
  `request_manual_checkin_by_phone`, `get_student_report_by_phone` — defined in
  `phone_privacy.sql`, which must be run in the Supabase SQL editor in the same
  sitting as deploying the current checkin/report pages).
- **Owner's hard requirement: member names must never be publicly visible or
  enumerable.** The marketing site must not query the database at all — it
  needs zero Supabase. Contact/trial requests should go via WhatsApp deep-link
  (`https://wa.me/39...?text=...`), not into the database.
- On-screen names on member pages are masked to "Firstname S." — keep that
  convention anywhere member data could appear.

## 9. Open/pending items

- `phone_privacy.sql` may not have been run in Supabase yet — the new
  checkin/report pages break without it (old ones break with it). Coordinate.
- Admin-at-root vs public-at-root rename (see §3) needs the owner's go-ahead.
- All §2 placeholders need real content from the owner before launch.
