require('dotenv').config();
const cloudinary = require('cloudinary').v2, path = require('path');
const file = path.join(__dirname, '..', 'demo-data', 'monitoring_site-north_004.jpg');
const tests = {
  'google_tagging': { categorization: 'google_tagging', auto_tagging: 0.3 },
  'coco_v1 (AI Content Analysis)': { detection: 'coco_v1', auto_tagging: 0.3 },
  'captioning': { detection: 'captioning' }
};
(async () => {
  for (const [name, opts] of Object.entries(tests)) {
    try {
      const r = await cloudinary.uploader.upload(file, { folder: 'evidara-check', public_id: 'probe-' + name.split(' ')[0], overwrite: true, ...opts });
      console.log('\n==', name, '\ntags:', JSON.stringify(r.tags), '\ninfo:', JSON.stringify(r.info || null).slice(0, 700));
    } catch (e) {
      console.log('\n==', name, 'FAILED\n', JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 700));
    }
  }
})();