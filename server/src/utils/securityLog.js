// Security-relevant events (SEC-006): one JSON line per event on stderr, so they can be
// grepped or shipped to a log store. Callers must never pass passwords or tokens.
function securityLog(event, details = {}) {
  // Fixed fields last, so a detail can never overwrite the event name or timestamp.
  console.warn(JSON.stringify({ ...details, level: 'security', event, at: new Date().toISOString() }));
}

module.exports = { securityLog };
