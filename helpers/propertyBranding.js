// Per-property branding. The logo file lives on the property row (LOGO, a path under /public);
// a property with no LOGO prints no logo at all (never another hotel's).
const fs = require('fs');
const path = require('path');
const PropertyModel = require('../models/propertyModel');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

async function loadPropertyLogoDataUri(propertyId) {
  try {
    const property = propertyId ? await PropertyModel.getById(propertyId) : await PropertyModel.getDefault();
    const rel = property && property.LOGO ? String(property.LOGO).replace(/^[/\\]+/, '') : '';
    if (!rel) return '';
    const file = path.join(__dirname, '../public', rel);
    if (!fs.existsSync(file)) return '';
    const mime = MIME[path.extname(file).toLowerCase()] || 'image/png';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch (_) {
    return '';
  }
}

module.exports = { loadPropertyLogoDataUri };
