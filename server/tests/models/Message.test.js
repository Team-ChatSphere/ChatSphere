const mongoose = require('mongoose');
const Message = require('../../src/models/Message');

const { MAX_CONTENT_LENGTH } = Message;

const validFields = () => ({
  room_id: new mongoose.Types.ObjectId(),
  sender_id: new mongoose.Types.ObjectId(),
  content: 'hello',
});

describe('Message model (FR-017)', () => {
  test('a valid message passes validation with server defaults', () => {
    const before = Date.now();
    const msg = new Message(validFields());

    expect(msg.validateSync()).toBeUndefined();
    expect(msg.status).toBe('sent');
    expect(msg.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  test.each(['room_id', 'sender_id', 'content'])('%s is required', (field) => {
    const fields = validFields();
    delete fields[field];

    const err = new Message(fields).validateSync();

    expect(err.errors[field]).toBeDefined();
  });

  test('content longer than 2000 chars is rejected', () => {
    const msg = new Message({ ...validFields(), content: 'a'.repeat(MAX_CONTENT_LENGTH + 1) });

    expect(msg.validateSync().errors.content).toBeDefined();
  });

  test('content of exactly 2000 chars is accepted', () => {
    const msg = new Message({ ...validFields(), content: 'a'.repeat(MAX_CONTENT_LENGTH) });

    expect(msg.validateSync()).toBeUndefined();
  });

  test('whitespace-only content is rejected', () => {
    const msg = new Message({ ...validFields(), content: '   ' });

    expect(msg.validateSync().errors.content).toBeDefined();
  });

  test('status must be sent, delivered or read', () => {
    expect(new Message({ ...validFields(), status: 'read' }).validateSync()).toBeUndefined();
    expect(new Message({ ...validFields(), status: 'seen' }).validateSync().errors.status).toBeDefined();
  });

  test('declares a newest-first history index and a unique per-sender idempotency index', () => {
    const indexes = Message.schema.indexes();

    expect(indexes).toContainEqual([{ room_id: 1, timestamp: -1 }, expect.anything()]);
    const idem = indexes.find(([keys]) => keys.idempotencyKey === 1);
    expect(idem[0]).toEqual({ sender_id: 1, idempotencyKey: 1 });
    expect(idem[1].unique).toBe(true);
  });
});
