// Auth Service (SAD 2.2): registration, login and JWT handling (FR-001 to FR-004, SEC-001, SEC-004).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { AppError } = require('../../utils/errors');
const { securityLog } = require('../../utils/securityLog');

const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt only uses the first 72 bytes
const INVALID_LOGIN = 'Invalid username/email or password';

// Usernames are unique ignoring case; only "." needs escaping given the USERNAME pattern.
const exactName = (name) => new RegExp('^' + name.split('.').join('\\.') + '$', 'i');

function validateRegistration({ username, email, password }) {
  if (typeof username !== 'string' || !USERNAME.test(username.trim())) {
    throw new AppError('VALIDATION_FAILED', 'Username must be 3–30 letters, numbers, dots, dashes or underscores');
  }
  if (typeof email !== 'string' || email.trim().length > 100 || !EMAIL.test(email.trim())) {
    throw new AppError('VALIDATION_FAILED', 'Enter a valid email address');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw new AppError('VALIDATION_FAILED', `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`);
  }
}

/**
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string|number} [options.jwtExpiresIn]
 * @param {number} [options.bcryptRounds]
 */
function createAuthService({ jwtSecret, jwtExpiresIn = '12h', bcryptRounds = 10, UserModel = User }) {
  if (!jwtSecret) throw new Error('jwtSecret is required');
  // Compared against when the user doesn't exist, so a failed login takes the same time
  // whether or not the account exists.
  const dummyHash = bcrypt.hashSync('not-a-real-password', bcryptRounds);

  async function register({ username, email, password }) {
    validateRegistration({ username, email, password });
    const name = username.trim();
    const mail = email.trim().toLowerCase();

    if (await UserModel.exists({ username: exactName(name) })) {
      throw new AppError('VALIDATION_FAILED', 'That username is already taken');
    }
    if (await UserModel.exists({ email: mail })) {
      throw new AppError('VALIDATION_FAILED', 'An account with that email already exists');
    }

    const password_hash = await bcrypt.hash(password, bcryptRounds);
    try {
      const user = await UserModel.create({ username: name, email: mail, password_hash });
      return { userId: String(user._id) };
    } catch (err) {
      if (err.code === 11000) {
        const field = err.keyPattern?.email ? 'email' : 'username';
        throw new AppError('VALIDATION_FAILED', `That ${field} is already registered`);
      }
      throw err;
    }
  }

  function signToken(user) {
    return jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, {
      expiresIn: jwtExpiresIn,
    });
  }

  async function login({ usernameOrEmail, password }) {
    if (typeof usernameOrEmail !== 'string' || typeof password !== 'string' || !usernameOrEmail.trim() || !password) {
      throw new AppError('VALIDATION_FAILED', 'Username/email and password are required');
    }
    const key = usernameOrEmail.trim();
    let user = null;
    if (key.includes('@')) user = await UserModel.findOne({ email: key.toLowerCase() });
    else if (USERNAME.test(key)) user = await UserModel.findOne({ username: exactName(key) });

    const ok = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
    if (!user || !ok) {
      // Same answer for unknown user and wrong password, so accounts can't be enumerated.
      securityLog('login_failed', { usernameOrEmail: key });
      throw new AppError('AUTH_INVALID_TOKEN', INVALID_LOGIN);
    }
    return { token: signToken(user), user: { id: String(user._id), username: user.username } };
  }

  // FR-004 / SEC-004: missing, malformed, tampered and expired tokens are all rejected.
  function verifyToken(token) {
    if (typeof token !== 'string' || !token) throw new AppError('AUTH_INVALID_TOKEN', 'Missing token');
    try {
      const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      if (!claims.sub || !claims.username) throw new Error('incomplete claims');
      return { id: String(claims.sub), username: claims.username };
    } catch (err) {
      const reason = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      throw new AppError('AUTH_INVALID_TOKEN', reason);
    }
  }

  // Used by the JWT middleware: a valid signature isn't enough, the account must still
  // exist (a token for a deleted or never-created user is refused).
  async function authenticate(token) {
    const user = verifyToken(token);
    const exists = await UserModel.exists({ _id: user.id }).catch(() => null); // malformed id → not found
    if (!exists) throw new AppError('AUTH_INVALID_TOKEN', 'User no longer exists');
    return user;
  }

  return { register, login, signToken, verifyToken, authenticate };
}

module.exports = { createAuthService };
