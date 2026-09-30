// Day-1 check: which Cloudinary AI add-ons work on YOUR account?
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
if (!process.env.CLOUDINARY_URL) { console.log('Set CLOUDINARY_URL in .env first.'); process.exit(1); }
const img = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
const tests = {
  'Basic upload': {},
  'google_tagging': { categorization: 'google_tagging', auto_tagging: 0.6 },
  'aws_rek_tagging': { categorization: 'aws_rek_tagging', auto_tagging: 0.6 },
  'imagga_tagging': { categorization: 'imagga_tagging', auto_tagging: 0.6 },
  'captioning': { detection: 'captioning' },
  'aws_rek_face (faces)': { detection: 'aws_rek_face' }
};
(async () => {
  for (const [name, opts] of Object.entries(tests)) {
    try {
      const r = await cloudinary.uploader.upload(img, { folder: 'evidara-check', overwrite: true, public_id: 'probe', ...opts });
      console.log('OK   ', name, name === 'captioning' ? JSON.stringify(r.info && r.info.detection) : '');
    } catch (e) { console.log('FAIL ', name, '-', e.message); }
  }
  console.log('\nPut a working tagging add-on name in AI_TAGGING in .env. Set AI_CAPTIONING=1 if captioning is OK.');
})();
