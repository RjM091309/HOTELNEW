// ========================================
// ACTIVITY LOGGER (request-aware helper)
// ========================================
// Thin wrapper around ActivityLogModel that pulls the "who / where / how"
// context out of an Express request (user from JWT, IP, user-agent, endpoint)
// so controllers only have to describe the "what".

const ActivityLogModel = require('../models/activityLogModel');

// Extract audit context from a request. Safe on a missing/partial req.
function getRequestMeta(req) {
  if (!req) return {};

  const user = req.user || {};
  const fwd = (req.headers && req.headers['x-forwarded-for']) || '';
  const ip =
    (fwd ? String(fwd).split(',')[0].trim() : '') ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    null;

  return {
    userId: user.userId || user.IDNo || null,
    userName: user.FULLNAME || user.USERNAME || null,
    ipAddress: ip,
    userAgent: (req.get && req.get('User-Agent')) || (req.headers && req.headers['user-agent']) || null,
    endpoint: req.originalUrl || req.url || null,
    httpMethod: req.method || null
  };
}

/**
 * Write an audit-trail entry, merging request context with the given entry.
 * Always resolves (never rejects) so it is safe to `await` or fire-and-forget.
 */
async function logActivity(req, entry = {}) {
  return ActivityLogModel.log({ ...getRequestMeta(req), ...entry });
}

/**
 * Returns a pre-bound logger for a given module so a controller can just call
 * `const audit = moduleLogger(req, 'calendar');  audit({ action, ... })`.
 */
function moduleLogger(req, moduleName) {
  return (entry = {}) => logActivity(req, { module: moduleName, ...entry });
}

module.exports = { logActivity, moduleLogger, getRequestMeta };
