// Message entity (SRS Appendix B). DMs and group messages both point at a Room;
// a DM conversation is a 2-member Room of type 'direct' (FR-017).
const mongoose = require('mongoose');

const MESSAGE_STATUSES = ['sent', 'delivered', 'read'];
const MAX_CONTENT_LENGTH = 2000;

const messageSchema = new mongoose.Schema({
  room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_CONTENT_LENGTH,
  },
  // Server-assigned send time; clients never set this.
  timestamp: { type: Date, default: Date.now, immutable: true },
  status: { type: String, enum: MESSAGE_STATUSES, default: 'sent' },
  // Client-generated key used to dedupe retried sends (SAD 3.4.2, DEVIATIONS D-03).
  idempotencyKey: { type: String, maxlength: 100 },
});

// History is read newest first per conversation (FR-018).
messageSchema.index({ room_id: 1, timestamp: -1 });
// A sender can only use an idempotency key once.
messageSchema.index(
  { sender_id: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
module.exports.MESSAGE_STATUSES = MESSAGE_STATUSES;
module.exports.MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH;
