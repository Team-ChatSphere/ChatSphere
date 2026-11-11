// Seeds two users and a short DM conversation through the public API, for Postman runs
// and demos. Prints the values the Postman collection needs.
//
//   BASE_URL=http://localhost:4000 npm run seed:dm
const { io } = require('socket.io-client');

const PASSWORD = 'Passw0rd!';

async function api(base, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function account(base, username) {
  const { userId } = await api(base, 'POST', '/api/auth/register', { username, email: `${username}@example.com`, password: PASSWORD });
  const { token } = await api(base, 'POST', '/api/auth/login', { usernameOrEmail: username, password: PASSWORD });
  return { id: userId, username, token };
}

async function seedDm(base) {
  const suffix = Date.now().toString(36);
  const a = await account(base, `dm_a_${suffix}`);
  const b = await account(base, `dm_b_${suffix}`);
  const socket = io(base, { transports: ['websocket'], auth: { token: a.token } });
  await new Promise((resolve, reject) => {
    socket.once('session:ready', resolve);
    socket.once('connect_error', reject);
  });
  const send = (content) => new Promise((resolve) => socket.emit('message:send', { toUserId: b.id, content }, resolve));
  const first = await send('Hi! This is a seeded DM.');
  await send('And a second one, for pagination.');
  socket.close();
  if (!first.ok) throw new Error(`seed DM failed: ${JSON.stringify(first.error)}`);
  return { conversationId: first.message.roomId, dmUser: a.username, dmPassword: PASSWORD, otherUser: b.username };
}

module.exports = { seedDm };

if (require.main === module) {
  seedDm(process.env.BASE_URL || 'http://localhost:4000')
    .then((v) => {
      console.log(JSON.stringify(v, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
