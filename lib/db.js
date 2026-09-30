// Tiny JSON "database". Good enough for a hackathon; swap for SQLite/Postgres later.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'evidence.json');
fs.mkdirSync(path.dirname(FILE), { recursive: true });
const rows = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
const save = () => fs.writeFileSync(FILE, JSON.stringify(rows, null, 1));
module.exports = { all: () => rows, find: id => rows.find(r => r.id === id), add: r => { rows.push(r); save(); }, save };
