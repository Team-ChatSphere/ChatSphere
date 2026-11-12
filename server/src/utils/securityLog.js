// Security-relevant events (SEC-006): one JSON line per event on stderr, so they can be
// grepped or shipped to a log store. Callers must never pass passwords or tokens.
function securityLog(event, details = {}) {
  console.warn(JSON.stringify({ level: 'security', event, at: new Date().toISOString(), ...details }));
}

module.exports = { securityLog };
