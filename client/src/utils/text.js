// The server stores message text with HTML characters escaped (SEC-003). Messages are
// rendered by React as plain text, so decode those five entities back for display;
// React escapes them again, so this can never create markup.
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function decodeEntities(text) {
  return typeof text === 'string' ? text.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]) : text;
}
