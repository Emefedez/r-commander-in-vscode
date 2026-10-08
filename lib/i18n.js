const es = require('../i18n/es.json');

let language = 'en';
function setLanguage(value) { language = value === 'es' ? 'es' : 'en'; }
function resolveLanguage(setting, displayLanguage) {
  if (setting === 'es' || setting === 'en') return setting;
  return String(displayLanguage || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}
// Translates an English UI string; {0}, {1} are replaced by the extra arguments.
function t(text, ...args) {
  const translated = language === 'es' && es[text] ? es[text] : text;
  return translated.replace(/\{(\d+)\}/g, (match, i) => args[i] ?? match);
}
const getLanguage = () => language;
module.exports = { t, setLanguage, resolveLanguage, getLanguage };
