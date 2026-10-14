const mongoose = require('mongoose');

const ROOM_TYPES = ['direct', 'group'];

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, maxlength: 50, trim: true },
  type: { type: String, enum: ROOM_TYPES, required: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
module.exports.ROOM_TYPES = ROOM_TYPES;
