const AuthModel = require('../models/authModel');
const SessionModel = require('../models/sessionModel');
const PropertyModel = require('../models/propertyModel');

// Resolves which property (Main Hotel / Pool Villa / ...) the current
// request is scoped to, from the "current_property" cookie set by the
// switcher (POST /property/switch - see routes/r_property.js), and attaches
// it the same way req.user is attached: available to every controller via
// req.propertyId, and to every EJS view via res.locals.currentProperty /
// res.locals.allProperties (so the switcher UI in partials/navbar.ejs needs
// no per-controller render() changes). Falls back to the default property
// (Main Hotel) when the cookie is missing/invalid - never leaves
// req.propertyId pointing at nothing while the property table has rows.
// The properties an account may open: an Admin has all of them, everybody else only the ones given in User Info (user_property).
// Cached for a short time per account (the list is changed rarely; saving it in User Info clears the cache).
const propertyCache = new Map();
function forgetUserProperties(userId) { if (userId == null) propertyCache.clear(); else propertyCache.delete(Number(userId)); }
async function allowedPropertiesOf(user, all) {
  if (!user || Number(user.PERMISSIONS) === 1 || user.userId == null) return all;
  let ids;
  const hit = propertyCache.get(Number(user.userId));
  if (hit && Date.now() - hit.at < 20000) ids = hit.ids;
  else {
    try { ids = (await require('../models/userModels').getPropertyIds(user.userId)); } catch (e) { ids = null; }
    if (ids) propertyCache.set(Number(user.userId), { ids, at: Date.now() });
  }
  if (!ids) return all;                                  // could not read the list: do not lock anybody out
  const mine = all.filter((p) => ids.includes(p.IDNo));
  return mine.length ? mine : all.filter((p) => p.IS_DEFAULT).slice(0, 1);
}

async function attachProperty(req, res) {
  const everyProperty = await PropertyModel.getAllActive();
  const allowed = await allowedPropertiesOf(req.user, everyProperty);
  let property = await PropertyModel.resolveFromCookie(req.cookies?.current_property);
  if (!property || !allowed.some((p) => p.IDNo === property.IDNo)) {
    property = allowed[0] || property;                   // the property in the cookie is not this account's: use its own
    if (property && res.cookie) res.cookie('current_property', property.CODE, { maxAge: 90 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
  }
  req.propertyId = property ? property.IDNo : null;
  req.allowedPropertyIds = allowed.map((p) => p.IDNo);
  res.locals.currentProperty = property;
  res.locals.allProperties = allowed;
  // Per-property settings the views read (all from the property row, nothing hardcoded per code):
  //   isGuestPricing   - rates by number of guests / single room panel / no Room View
  //   hideMenu('key')  - true when the sidebar item is hidden for this property
  //   propertyDisplayName - the name for headers and printed documents
  res.locals.isGuestPricing = !!(property && property.GUEST_PRICING);
  res.locals.propertyLogo = (property && property.LOGO) || '';
  const hidden = new Set(String((property && property.HIDDEN_MENUS) || '').split(',').map((k) => k.trim()).filter(Boolean));
  res.locals.hideMenu = (key) => hidden.has(key);
  // Room Rate choices (booking forms) this property does not offer - hideRate('tenant') etc.
  const hiddenRates = new Set(String((property && property.HIDDEN_RATE_OPTIONS) || '').split(',').map((k) => k.trim()).filter(Boolean));
  res.locals.hideRate = (key) => hiddenRates.has(key);
  // Custom Room Rate choices this property made on the Room Rates page: [{ key: 'custom_3', label: 'Promo' }]
  try { res.locals.customRates = await require('../models/roomRatesModel').listCustom(req.propertyId); } catch (e) { res.locals.customRates = []; }
  // Rooms menu fields this property does not use - hideRoomField('bed_type') etc.
  const hiddenRoomFields = new Set(String((property && property.HIDDEN_ROOM_FIELDS) || '').split(',').map((k) => k.trim()).filter(Boolean));
  res.locals.hideRoomField = (key) => hiddenRoomFields.has(key);
  res.locals.propertyDisplayName = (property && (property.DISPLAY_NAME || property.NAME)) || 'MAIN STAY HOTEL';
}

class AuthMiddleware {
  static forgetUserProperties(userId) { forgetUserProperties(userId); }

  // Check if user is authenticated (for API routes)
  static async isAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check if token is still valid (not invalidated by new login)
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      }
      
      req.user = decoded;
      await attachProperty(req, res);
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }

  // Check if user has specific permission
  static hasPermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.'
        });
      }

      const userPermissions = req.user.PERMISSIONS || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. ${permission} permission required.`
        });
      }

      next();
    };
  }

  // Check if user has any of the specified permissions
  static hasAnyPermission(permissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.'
        });
      }

      const userPermissions = req.user.PERMISSIONS || [];
      const hasPermission = permissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.'
        });
      }

      next();
    };
  }

  // Check if user is admin
  static isAdmin(req, res, next) {
    return AuthMiddleware.hasPermission('admin')(req, res, next);
  }

  // Optional authentication (doesn't fail if no token)
  static async optionalAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        // Check if token is still valid
        if (decoded) {
          const isValid = await SessionModel.isTokenValid(decoded.userId, token);
          if (isValid) {
            req.user = decoded;
            await attachProperty(req, res);
          }
        }
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }

  // Redirect to login if not authenticated (for page routes)
  static async requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.redirect('/login');
    }

    try {
      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.redirect('/login');
      }

      // Check if token is still valid (not invalidated by new login)
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        // Clear invalid cookie
        res.clearCookie('token');
        return res.redirect('/login?session=expired');
      }
      
      req.user = decoded;
      await attachProperty(req, res);
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.redirect('/login');
    }
  }

  // Redirect to dashboard if already authenticated (for login page)
  static async redirectIfAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        // Check if token is still valid
        if (decoded) {
          const isValid = await SessionModel.isTokenValid(decoded.userId, token);
          if (isValid) {
            return res.redirect('/dashboard');
          }
        }
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }
}

module.exports = AuthMiddleware;
