// Generates realistic-ish messy demo files (with real EXIF) in ./demo-data, including deliberately bad ones.
const fs = require('fs'), path = require('path');
const sharp = require('sharp'), piexif = require('piexifjs');
const cfg = require('../config/projects.json');
const OUT = path.join(__dirname, '..', 'demo-data');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fmt = d => d.toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
const acts = { mangrove: ['survey', 'planting', 'monitoring'], water: ['survey', 'drilling', 'pipeline', 'meeting'] };
const green = { survey: '#8a7f5a', planting: '#6b8f4e', monitoring: '#2f7d4f', drilling: '#7a6a55', pipeline: '#5a7a8a', meeting: '#8a6a7a' };

async function make(name, { text, color, lat, lng, date, blur }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/>
  <rect y="520" width="1200" height="280" fill="rgba(0,0,0,.18)"/><text x="50" y="120" font-size="54" fill="#fff" font-family="sans-serif">${text}</text>
  <text x="50" y="190" font-size="34" fill="#fff" font-family="sans-serif">demo field photo</text></svg>`;
  let img = sharp(Buffer.from(svg)); if (blur) img = img.blur(14);
  const jpg = await img.jpeg({ quality: 85 }).toBuffer();
  const z = { '0th': {}, Exif: {}, GPS: {} };
  if (date) z.Exif[piexif.ExifIFD.DateTimeOriginal] = fmt(date);
  if (lat != null) {
    z.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S'; z.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
    z.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W'; z.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
  }
  const out = piexif.insert(piexif.dump(z), jpg.toString('binary'));
  fs.writeFileSync(path.join(OUT, name), Buffer.from(out, 'binary'));
}

(async () => {
  let n = 0; const files = [];
  for (const s of cfg.sites) for (let i = 0; i < 12; i++) {
    const act = acts[s.project][i % acts[s.project].length];
    const date = new Date(Date.UTC(2026, 1 + Math.floor(i * 0.7), 3 + Math.floor(rnd() * 24), 6 + Math.floor(rnd() * 8), Math.floor(rnd() * 60)));
    const name = `${act}_${s.id}_${String(++n).padStart(3, '0')}.jpg`;
    await make(name, { text: `${act} - ${s.name} #${n}`, color: green[act], lat: s.lat + (rnd() - .5) * .01, lng: s.lng + (rnd() - .5) * .01, date });
    files.push(name);
  }
  const s0 = cfg.sites[0], s2 = cfg.sites[2];
  // Deliberately bad files
  for (let i = 0; i < 3; i++) await make(`IMG_no_gps_${i}.jpg`, { text: `no gps ${i}`, color: '#555', date: new Date(Date.UTC(2026, 5, 10 + i)) });
  for (let i = 0; i < 3; i++) await make(`IMG_no_date_${i}.jpg`, { text: `no date ${i}`, color: '#666', lat: s0.lat, lng: s0.lng });
  await make('planting_reused_old_photo.jpg', { text: 'OLD photo reused', color: '#6b8f4e', lat: s0.lat, lng: s0.lng, date: new Date(Date.UTC(2023, 3, 2)) });
  await make('survey_wrong_place.jpg', { text: 'wrong place', color: '#8a7f5a', lat: 12.97, lng: 77.59, date: new Date(Date.UTC(2026, 5, 2)) });
  await make('monitoring_blurry.jpg', { text: 'blurry', color: '#2f7d4f', lat: s0.lat, lng: s0.lng, date: new Date(Date.UTC(2026, 6, 2)), blur: true });
  fs.copyFileSync(path.join(OUT, files[0]), path.join(OUT, 'DUPLICATE_of_' + files[0]));
  fs.copyFileSync(path.join(OUT, files[5]), path.join(OUT, 'DUPLICATE_of_' + files[5]));
  console.log(`Created ${fs.readdirSync(OUT).length} files in demo-data/`);
})();
