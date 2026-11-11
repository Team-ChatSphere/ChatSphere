// Shared message sanitiser (SEC-003, stored XSS): used by the Messaging and Room services
// before anything is saved. HTML-special characters are stored as entities, so no client
// (or anything else that later renders the text as HTML) can turn a message into markup.
// Clients decode the five entities back when rendering the message as plain text.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Control characters other than tab / newline / carriage return (matching them is the point).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeContent(content) {
  return content
    .replace(CONTROL_CHARS, '')
    .trim()
    .replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

module.exports = { sanitizeContent };
