// User entity (SRS Appendix B). Passwords are only ever stored as bcrypt hashes (SEC-001).
const mongoose = require('mongoose');

const USER_STATUSES = ['online', 'offline'];

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 100 },
  password_hash: { type: String, required: true },
  status: { type: String, enum: USER_STATUSES, default: 'offline' },
});

// Never send the hash to a client, even by accident.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password_hash;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.USER_STATUSES = USER_STATUSES;
