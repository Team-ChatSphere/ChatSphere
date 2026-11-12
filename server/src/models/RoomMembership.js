const mongoose = require('mongoose');

const MEMBERSHIP_ROLES = ['member', 'admin'];

const roomMembershipSchema = new mongoose.Schema({
  room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: MEMBERSHIP_ROLES, default: 'member' },
});

roomMembershipSchema.index({ room_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.models.RoomMembership || mongoose.model('RoomMembership', roomMembershipSchema);
module.exports.MEMBERSHIP_ROLES = MEMBERSHIP_ROLES;
