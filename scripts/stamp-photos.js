// Turns a folder of REAL photos into upload-ready demo files with EXIF GPS + dates.
// Layout:  real-photos/<site-id>/before/*.jpg   real-photos/<site-id>/after/*.jpg   (or loose files in real-photos/<site-id>/)
// Run:     npm run stamp          (add  -- --keep  to keep GPS/date already inside your own photos)
const fs = require('fs'), path = require('path');
const sharp = require('sharp'), piexif = require('piexifjs'), exifr = require('exifr');
const cfg = require('../config/projects.json');
const IN = path.join(__dirname, '..', 'real-photos'), OUT = path.join(__dirname, '..', 'demo-data');
const KEEP = process.argv.includes('--keep'), IMG = /\.(jpe?g|png|webp)$/i;
if (!fs.existsSync(IN)) { console.log('Create the real-photos folder first: real-photos/<site-id>/before and /after'); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fmt = d => d.toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
const day = (m1, d1, m2, d2) => new Date(Date.UTC(2026, m1 - 1, d1) + rnd() * (Date.UTC(2026, m2 - 1, d2) - Date.UTC(2026, m1 - 1, d1)) + (10 + Math.floor(rnd() * 4)) * 36e5);
const files = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => IMG.test(f)).sort().map(f => path.join(d, f)) : [];
const jit = () => (rnd() - .5) * .0012; // about 65 m, so before/after pairs stay close

async function put(src, name, { lat, lng, date }) {
  const buf = fs.readFileSync(src);
  if (KEEP) { try { const g = await exifr.gps(buf), e = await exifr.parse(buf, ['DateTimeOriginal']); if (g && g.latitude != null && e && e.DateTimeOriginal) { lat = g.latitude; lng = g.longitude; date = e.DateTimeOriginal; } } catch {} }
  const jpg = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const z = { '0th': {}, Exif: {}, GPS: {} };
  if (date) z.Exif[piexif.ExifIFD.DateTimeOriginal] = fmt(date);
  if (lat != null) {
    z.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S'; z.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
    z.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W'; z.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
  }
  fs.writeFileSync(path.join(OUT, name), Buffer.from(piexif.insert(piexif.dump(z), jpg.toString('binary')), 'binary'));
}

(async () => {
  const items = [];
  for (const s of cfg.sites) {
    const base = path.join(IN, s.id), mk = (src, act, date) => items.push({ src, s, act, date });
    files(path.join(base, 'before')).forEach(f => mk(f, 'survey', day(2, 1, 3, 31)));
    files(path.join(base, 'after')).forEach(f => mk(f, 'monitoring', day(8, 1, 9, 25)));
    files(base).forEach((f, i) => mk(f, cfg.activities[i % cfg.activities.length], day(2, 1, 9, 25)));
  }
  if (!items.length) { console.log('No photos found. Put them in real-photos/<site-id>/before and /after. Site ids:', cfg.sites.map(s => s.id).join(', ')); process.exit(1); }
  let n = 0, first = null;
  for (const [i, it] of items.entries()) {
    const name = `${it.act}_${it.s.id}_${String(++n).padStart(3, '0')}.jpg`;
    const o = { lat: it.s.lat + jit(), lng: it.s.lng + jit(), date: it.date };
    // a few deliberately bad files so the review flags have something to catch
    if (i === 5) { o.lat = o.lng = null; }                          // no GPS
    if (i === 9) { o.date = null; }                                  // no date
    if (i === 2) { o.lat = 12.97; o.lng = 77.59; }                  // wrong place
    if (i === 8) { o.date = new Date(Date.UTC(2023, 3, 2, 11)); }   // old photo reused
    await put(it.src, name, o); first = first || name;
  }
  fs.copyFileSync(path.join(OUT, first), path.join(OUT, 'DUPLICATE_of_' + first)); // exact copy, should be skipped
  console.log(`Wrote ${fs.readdirSync(OUT).length} files to demo-data/`);
  console.log('NOTE: dates and GPS are SIMULATED for demo (unless --keep found real ones). Say so in your README and pitch.');
})();