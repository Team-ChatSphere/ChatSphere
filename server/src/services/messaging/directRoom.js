// A DM conversation is a 2-member Room of type 'direct' (SRS Appendix B, FR-017).
// Its name is the two user ids sorted and joined (`<smaller>:<larger>`, 49 chars),
// so the unique room-name index guarantees one room per pair (docs/INTEGRATION.md §4).
const Room = require('../../models/Room');
const RoomMembership = require('../../models/RoomMembership');
const { AppError } = require('../../utils/errors');

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function directRoomName(userA, userB) {
  return [String(userA).toLowerCase(), String(userB).toLowerCase()].sort().join(':');
}

async function ensureMembers(roomId, userIds) {
  // Upserts make this safe to repeat and to race.
  await Promise.all(
    userIds.map((userId) =>
      RoomMembership.updateOne(
        { room_id: roomId, user_id: userId },
        { $setOnInsert: { role: 'member' } },
        { upsert: true }
      ).catch((err) => {
        if (err.code !== 11000) throw err;
      })
    )
  );
}

/**
 * Returns the direct room for two distinct users, creating it (and both
 * memberships) the first time they talk.
 */
async function getOrCreateDirectRoom(userA, userB) {
  for (const id of [userA, userB]) {
    if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
      throw new AppError('VALIDATION_FAILED', 'User ids must be valid ids');
    }
  }
  const name = directRoomName(userA, userB);
  if (userA.toLowerCase() === userB.toLowerCase()) {
    throw new AppError('VALIDATION_FAILED', 'A direct conversation needs two different users');
  }

  let room = await Room.findOne({ name, type: 'direct' });
  if (!room) {
    try {
      room = await Room.create({ name, type: 'direct', created_by: userA });
    } catch (err) {
      // Both users messaged each other at the same moment: the other call created it.
      if (err.code !== 11000) throw err;
      room = await Room.findOne({ name, type: 'direct' });
      if (!room) throw err;
    }
  }

  await ensureMembers(room._id, [userA, userB]);
  return room;
}

module.exports = { getOrCreateDirectRoom, directRoomName };
