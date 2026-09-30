# Evidara

**Donors don't trust photos. Evidara turns field photos into proof.**
Upload messy field media, get organised and checked evidence, then a report where every claim links to an original file.
Built for the Cloudinary "AI-Powered Impact & Sustainability Media Platform" challenge.

## Phase 1: trusted evidence base
- Bulk upload to Cloudinary (or local demo mode with no keys).
- Reads GPS and date from EXIF. Assigns project, site and activity. Saved as Cloudinary tags and context.
- Cloudinary AI tagging and captions (if enabled on your account).
- "Needs review" flags: no GPS, no date, location far from site, date outside project period.
- SHA-256 fingerprint of every original. Exact duplicates are skipped. "Verify original" re-checks the stored file.
- Plain-words search, filters, map and timeline. Manual fixes are logged in an audit trail.

## Phase 2: turn evidence into impact
- **Before / after:** auto-pairs clean photos of the same site, close on GPS, at least 30 days apart. Slider with dates. Cloudinary burns the labels in.
- **Report builder:** claims are made from data, not guessed by AI. A claim with no linked evidence is dropped. A person approves each claim.
- **Proof on click:** click any evidence chip to see the file, date, place, fingerprint and a verify button.
- **PDF export:** approved claims only, with images, source list, fingerprints and a "what this can and cannot show" page.
- **Video reel:** Cloudinary slideshow from the approved images (Cloudinary only).
- **Social posts:** long and short versions from approved claims.
- **Privacy:** optional face blur through a Cloudinary transformation (Cloudinary only).

## Run it
```
npm install
cp .env.example .env         # add CLOUDINARY_URL (optional for a first test)
npm run check                # which Cloudinary AI add-ons work on your account
npm run seed                 # ~59 demo files, some deliberately bad
npm start                    # http://localhost:3000
npm run upload-demo          # second terminal: bulk-uploads demo-data/
```

## Honest limits
- EXIF can be edited. Evidara flags missing or inconsistent data. It cannot prove a photo is genuine.
- The fingerprint proves the file was not changed after upload, not that it was real before.
- Duplicate check catches exact copies only.
- Before/after pairs are for a person to judge. Evidara does not measure change (no made-up percentages).
- Face blur and the video reel need Cloudinary. In local mode they are off.
- Data is stored in `data/*.json`. Fine for a demo, not for production.

## Layout
`server.js` routes · `lib/ingest.js` upload, EXIF, flags, verify · `lib/search.js` · `lib/pairs.js` before/after · `lib/report.js` claims, PDF, reel, social · `lib/media.js` Cloudinary transformations · `public/index.html` UI · `scripts/` check, seed, demo upload
