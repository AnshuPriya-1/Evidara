# Evidara

**Donors don't trust photos. Evidara turns field photos into proof.**

Evidara takes messy field photos and videos, organises and checks them, and then builds an impact report where **every claim links back to an original file**. It was built for the Cloudinary *AI-Powered Impact & Sustainability Media Platform* challenge.

> **Core rule: no linked evidence, no claim.** Claims are generated from data (not guessed by AI), a person approves each one, and any claim without evidence is dropped.

---

## 1. The problem

Field teams in conservation, water and community projects collect thousands of photos and videos. In practice:

- **Messy media:** files have no project, site or date attached.
- **Hard to trust:** wrong location, wrong date, duplicates and edited files slip into reports.
- **Slow reporting:** staff hand-pick photos and write claims that donors cannot trace to a source.

## 2. What Evidara does

### Phase 1: trusted evidence base

- **Bulk upload** to Cloudinary, or a local demo mode that needs no keys.
- **EXIF reading:** GPS and capture date are read from each file. Project, site and activity are assigned automatically and saved as Cloudinary tags and context.
- **AI tagging and captions** through Cloudinary add-ons (if enabled on your account).
- **"Needs review" flags:** no GPS, no date, no matching site, location far from site, date outside the project period.
- **SHA-256 fingerprint** of every original. Exact duplicates are skipped. **Verify original** re-downloads the stored file and re-checks the fingerprint.
- **Plain-words search,** filters, map and timeline. Manual fixes are written to an **audit trail**.

### Phase 2: turn evidence into impact

- **Before / after:** auto-pairs clean photos of the same site, close on GPS, at least 30 days apart, shown in a slider with dates burned into the images by Cloudinary.
- **Report builder:** claims are built from data. A person approves each claim.
- **Proof on click:** click any evidence chip to see the file, date, place, fingerprint and a verify button.
- **PDF export:** approved claims only, with images, source list, fingerprints and a "what this can and cannot show" page.
- **Video reel:** a Cloudinary slideshow made from the approved images (Cloudinary mode only).
- **Social posts:** long and short versions generated from approved claims.
- **Privacy:** optional face blur through a Cloudinary transformation (Cloudinary mode only).

---

## 3. Architecture

### 3.1 System overview

```mermaid
flowchart LR
    subgraph Client["Browser"]
        UI["public/index.html<br/>Upload, search, map, timeline,<br/>before/after slider, report"]
    end

    subgraph Server["Node.js + Express (server.js)"]
        API["REST API<br/>/api/upload, /api/assets, /api/pairs,<br/>/api/reports, verify, PDF, reel, social"]
        subgraph Lib["lib/"]
            ING["ingest.js<br/>EXIF, flags, SHA-256,<br/>upload, verify"]
            SRCH["search.js<br/>plain-words search"]
            PAIRS["pairs.js<br/>before/after matching"]
            REP["report.js<br/>claims, PDF, reel, social"]
            MEDIA["media.js<br/>derived Cloudinary URLs"]
            DB["db.js<br/>JSON store"]
        end
        CFG["config/projects.json<br/>projects, sites, activities"]
    end

    subgraph Storage["Storage"]
        CLD["Cloudinary<br/>originals, AI tags and captions,<br/>transformations, slideshow video"]
        LOCAL["Local demo mode<br/>data/files + data/*.json"]
    end

    UI -->|HTTP / JSON| API
    API --> ING
    API --> SRCH
    API --> PAIRS
    API --> REP
    API --> MEDIA
    ING --> DB
    PAIRS --> DB
    REP --> DB
    SRCH --> CFG
    ING --> CFG
    ING -->|upload_stream| CLD
    ING -.->|no CLOUDINARY_URL| LOCAL
    MEDIA -->|transformation URLs| CLD
    REP -->|create_slideshow| CLD
```

### 3.2 Upload and verification flow

```mermaid
sequenceDiagram
    actor U as User
    participant S as Express API
    participant I as ingest.js
    participant C as Cloudinary / local disk
    participant D as JSON DB

    U->>S: POST /api/upload (files)
    loop each file, one at a time
        S->>I: ingest(file)
        I->>I: SHA-256 of original bytes
        alt fingerprint already in DB
            I-->>S: duplicate, skipped
        else new file
            I->>I: read EXIF GPS and date
            I->>I: assign site (nearest within 5 km) and activity
            I->>C: upload original with tags and context
            C-->>I: public_id, secure_url, AI tags, caption
            I->>I: evaluate() sets flags and status
            I->>D: save record
        end
    end
    S-->>U: added, duplicates, errors

    U->>S: POST /api/assets/:id/verify
    S->>C: fetch stored original
    S->>S: hash again, compare with saved SHA-256
    S-->>U: match true or false, with both hashes
```

### 3.3 Evidence to report flow

```mermaid
flowchart TD
    A["Evidence records<br/>status ok or needs_review"] --> B{"Report builder<br/>per project and date range"}
    B --> C["Overview claim<br/>from ok files"]
    B --> D["Activity claims<br/>one per activity"]
    B --> E["Before/after claims<br/>up to 4, spread across sites"]
    B --> F["Excluded claim<br/>files left out, with reasons"]
    C & D & E & F --> G{"Has linked evidence?"}
    G -->|No| X["Dropped"]
    G -->|Yes| H["Claim waits for approval"]
    H -->|Person approves| I["Approved claims"]
    I --> J["PDF report"]
    I --> K["Video reel"]
    I --> L["Social posts"]
```

---

## 4. How it works, step by step

### 4.1 Ingest (`lib/ingest.js`)

1. **Fingerprint:** a SHA-256 hash of the original bytes is computed first. If a record with the same hash exists, the file is reported as a duplicate and skipped. The first 12 characters of the hash become the file's ID.
2. **Metadata:** `exifr` reads GPS coordinates and `DateTimeOriginal` (or `CreateDate`).
3. **Assignment:** if no site was given in the upload form, the nearest configured site within **5 km** is chosen, and the project follows from the site. Activity is taken from the form or guessed from the filename (for example a name containing `planting`).
4. **Store:** the original goes to Cloudinary with tags and context (project, site, activity, sha256, date, GPS, original name), or to `data/files` in local mode. A 480x320 thumbnail URL is a derived transformation, never a replacement of the original.
5. **Evaluate:** flags are computed (see below) and the record gets status `ok` or `needs_review`.

**Flag rules (`evaluate`)**

| Flag | Raised when |
|---|---|
| No GPS | The file has no location data |
| No date | The file has no capture date |
| No matching site | Has GPS but no site could be assigned |
| Location far from site | Distance to its site is more than 5 km (haversine) |
| Date outside project period | Capture date is before the project start or after its end |

A person can fix a record with `PATCH /api/assets/:id`. The original file is never touched, the before/after values are appended to the record's `audit` list, and `evaluate` runs again.

### 4.2 Verify original

`verify` re-downloads the stored original (or reads it from disk in local mode), hashes it again and compares it to the hash saved at upload. The result (`match`, `expected`, `actual`, `checked_at`) is saved on the record. This proves the stored file has not changed since upload.

### 4.3 Search and timeline (`lib/search.js`)

Filters by project, site, status and date range, then scores free-text queries against tags, caption, filename, project, site name and activity. Words are lowercased, common stop words removed and simply stemmed (for example `planting` matches `plant`). Results are sorted by score, then newest first. The timeline endpoint counts files per month.

### 4.4 Before / after pairing (`lib/pairs.js`)

Only records with status `ok`, a date, GPS and an image type are used. Per site, files are sorted by date. The earliest third become "before" candidates and the latest third "after" candidates. A before and after photo are paired when:

- they are at least **30 days** apart (adjustable through `minDays`), and
- they are within **1000 m** of each other (closest match wins, each "after" used once).

Evidara does not measure change. Pairs are shown for a person to judge. Cloudinary burns `BEFORE <date>` and `AFTER <date>` labels into the derived images.

### 4.5 Report builder (`lib/report.js`)

For a chosen project and optional date range, claims are generated from data:

| Claim type | What it says |
|---|---|
| `overview` | Number of checked files, date span and number of sites |
| `activity` | Number of files documenting each activity, and where |
| `pair` | A visible change to review at a site, with days apart and distance (a person must confirm the change), up to 4, spread across sites |
| `excluded` | Files left out of the report and why |

Every claim carries the IDs of its evidence files. A claim with no evidence is silently dropped. All claims start as **not approved**.

- **PDF:** approved claims only, with images, per-claim evidence lines (filename, date, site, SHA-256 prefix), an appendix of source files with full hashes and original URLs, and a page stating what the report can and cannot show. Face blur can be applied to embedded images.
- **Video reel:** up to 8 approved images become a 1080x1080 Cloudinary slideshow, 3 seconds per slide with circle-crop transitions.
- **Social posts:** a long and a short (280 characters max) post built from approved claims.

---

## 5. How Cloudinary is used

| Need | Cloudinary feature |
|---|---|
| Keep untouched originals | `uploader.upload_stream`, `resource_type: auto`, `overwrite: false`, `public_id` from the file fingerprint |
| Organise and find media | Tags and contextual metadata (project, site, activity, sha256, date, GPS) |
| Understand what is in a photo | AI tagging (`categorization` with `auto_tagging`) and captioning (`detection: captioning`), when enabled on the account |
| Thumbnails and labels | Transformation URLs: fill crop, `quality: auto`, text overlays with the date |
| Privacy | `blur_faces` effect applied in the transformation chain |
| Shareable video | `create_slideshow` from approved images |
| Trust | Stored original fetched again for fingerprint verification |

Graceful fallback: if captioning is unavailable the upload retries with tags only, and then with no AI add-on. The warning is saved on the record (`ai_warning`). Run `npm run check` to see which add-ons work on your account.

---

## 6. Data model

Stored as JSON in `data/evidence.json` (files) and `data/reports.json` (reports).

**Evidence record (abridged)**

```json
{
  "id": "a1b2c3d4e5f6",
  "filename": "north-planting-01.jpg",
  "mimetype": "image/jpeg",
  "sha256": "full 64-character hash",
  "project": "riverbank",
  "site": "site-north",
  "activity": "planting",
  "taken_at": "2026-03-14T09:30:00.000Z",
  "lat": 26.1012,
  "lng": 91.4829,
  "tags": ["riverbank", "site-north", "planting"],
  "caption": "",
  "storage": "cloudinary",
  "original_url": "https://res.cloudinary.com/...",
  "thumb_url": "https://res.cloudinary.com/...",
  "flags": [],
  "status": "ok",
  "audit": [],
  "verification": { "match": true, "checked_at": "..." }
}
```

**Report**

```json
{
  "id": "hex id",
  "project": "riverbank",
  "project_name": "Riverbank Restoration",
  "from": null, "to": null, "blur": false,
  "claims": [
    { "id": "c1", "type": "overview", "text": "...", "evidence": ["id1", "id2"], "approved": false }
  ]
}
```

---

## 7. API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Projects, sites, activities and storage mode |
| POST | `/api/upload` | Upload up to 500 files (multipart field `files`); optional form fields `project`, `site`, `activity` |
| GET | `/api/assets` | Search and filter (`q`, `project`, `site`, `status`, `from`, `to`) |
| GET | `/api/timeline` | Files per month for the current filters |
| POST | `/api/assets/:id/verify` | Re-check a stored original against its fingerprint |
| PATCH | `/api/assets/:id` | Fix `project`, `site`, `activity`, `taken_at`, `lat`, `lng`; logged in the audit trail |
| GET | `/api/pairs` | Before/after pairs (`project`, `minDays`, `blur=1`) |
| POST | `/api/reports` | Build a report (`project`, `from`, `to`, `blur`) |
| GET | `/api/reports/:id` | Fetch a report |
| POST | `/api/reports/:id/approve/:cid` | Approve or reject a claim (`cid` can be `all`) |
| GET | `/api/reports/:id/pdf` | Download the PDF (approved claims only) |
| POST | `/api/reports/:id/reel` | Create the video reel (Cloudinary only) |
| GET | `/api/reports/:id/social` | Long and short social posts |

---

## 8. Project structure

```
Evidara/
├── server.js               Express routes
├── lib/
│   ├── ingest.js           Upload, EXIF, flags, fingerprint, verify
│   ├── search.js           Plain-words search and filters
│   ├── pairs.js            Before/after matching
│   ├── report.js           Claims, PDF, video reel, social posts
│   ├── media.js            Cloudinary transformation URLs
│   └── db.js               Tiny JSON store
├── config/projects.json    Projects, sites (with GPS), activities
├── public/index.html       Single-page UI
├── scripts/
│   ├── check-cloudinary.js Test which AI add-ons work on your account
│   ├── seed-demo.js        Generate about 59 demo files, some deliberately bad
│   ├── upload-demo.js      Bulk-upload the demo files
│   └── stamp-photos.js     Write EXIF data into your own photos
├── .env.example
└── package.json
```

---

## 9. Configuration

**`.env`** (copy from `.env.example`)

| Variable | Meaning |
|---|---|
| `CLOUDINARY_URL` | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. Leave empty for local demo mode |
| `AI_TAGGING` | Cloudinary categorization add-on, for example `google_tagging`. Set only after `npm run check` shows it works |
| `AI_CAPTIONING` | `1` to request Cloudinary auto-captions |
| `PORT` | Server port, default `3000` |

**`config/projects.json`** defines the projects (with start and end dates), the sites (with latitude and longitude) and the list of activities. Edit it to match your own field work.

Never commit your real `.env` file.

---

## 10. Run it locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env        # add CLOUDINARY_URL (optional for a first test)
npm run check               # which Cloudinary AI add-ons work on your account
npm run seed                # create demo-data/ with about 59 files
npm start                   # http://localhost:3000
npm run upload-demo         # in a second terminal: bulk-upload demo-data/
```

Without `CLOUDINARY_URL`, Evidara runs in **local demo mode**: files are stored in `data/files`, and face blur and the video reel are disabled.

---

## 11. Deploy

Evidara is a Node/Express server, so it **cannot run on GitHub Pages** (static files only). Use a host that runs Node, for example Render.

`render.yaml`:

```yaml
services:
  - type: web
    name: evidara
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: CLOUDINARY_URL
        sync: false
```

Set `CLOUDINARY_URL` in the host's dashboard, not in the repository. On free tiers the server sleeps when idle and the local `data/*.json` files reset on restart, so re-upload the demo files before a demo.

---

## 12. Honest limits

- EXIF can be edited. Evidara flags missing or inconsistent data, but it **cannot prove a photo is genuine**.
- The fingerprint proves the file was **not changed after upload**, not that it was real before.
- The duplicate check catches **exact copies only**.
- Before/after pairs are for a person to judge. Evidara **does not measure change** and shows no made-up percentages.
- Face blur and the video reel need Cloudinary. In local mode they are off.
- Data is stored in `data/*.json`. This is fine for a demo, not for production.

## 13. Roadmap

- Production database (for example Postgres) and user login
- Near-duplicate and reused-photo detection
- Shareable, donor-facing evidence links
- Offline-first mobile capture for field teams

---

