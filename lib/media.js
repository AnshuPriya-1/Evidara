// Derived copies only. Originals are never modified; every edit is a Cloudinary transformation URL.
const cloudinary = require('cloudinary').v2;
const isImage = r => /^image/.test(r.mimetype || '') || /\.(jpe?g|png|webp|gif)$/i.test(r.filename || '');

function derived(r, { w = 480, h = 320, blur = false, label = '' } = {}) {
  if (r.storage !== 'cloudinary') return r.thumb_url;
  const t = [];
  if (blur) t.push({ effect: 'blur_faces:900' }); // privacy: blur faces before anything else
  t.push({ width: w, height: h, crop: 'fill' }, { quality: 'auto' });
  if (label) t.push({ overlay: { font_family: 'Arial', font_size: Math.round(h / 12), font_weight: 'bold', text: label }, color: 'white', background: 'rgb:000000aa', gravity: 'south_west', x: 10, y: 10 });
  return cloudinary.url(r.public_id, { resource_type: r.resource_type, secure: true, ...(r.resource_type === 'video' ? { format: 'jpg' } : {}), transformation: t });
}
module.exports = { derived, isImage };
