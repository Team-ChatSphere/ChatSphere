// User entity (SRS Appendix B). Passwords are only ever stored as bcrypt hashes (SEC-001).
const mongoose = require('mongoose');

const USER_STATUSES = ['online', 'offline'];

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 100 },
  password_hash: { type: String, required: true },
  status: { type: String, enum: USER_STATUSES, default: 'offline' },
});

// Usernames are unique ignoring case ("Alice" and "alice" are the same account). The
// collation (strength 2 = case-insensitive) makes MongoDB enforce that, so two concurrent
// registrations can't both pass the service's pre-check and create duplicates.
userSchema.index(
  { username: 1 },
  { unique: true, name: 'username_ci_unique', collation: { locale: 'en', strength: 2 } }
);

// Never send the hash to a client, even by accident.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password_hash;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.USER_STATUSES = USER_STATUSES;
