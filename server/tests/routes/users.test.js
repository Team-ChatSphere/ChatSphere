const express = require('express');
const request = require('supertest');
const { createUsersRouter } = require('../../src/routes/users');

const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);

function appWith(UserModel) {
  const app = express();
  app.use((req, res, next) => { req.user = { id: ALICE, username: 'alice' }; next(); });
  app.use('/api/users', createUsersRouter({ UserModel }));
  return app;
}

test('search returns public user fields and excludes the signed-in user', async () => {
  const users = [{ _id: BOB, username: 'bob', status: 'online' }];
  const UserModel = { find: jest.fn(() => ({
    select: () => ({ sort: () => ({ limit: () => ({ lean: async () => users }) }) }),
  })) };

  const res = await request(appWith(UserModel)).get('/api/users?search=bo');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ users: [{ userId: BOB, username: 'bob', status: 'online' }] });
  expect(UserModel.find).toHaveBeenCalledWith({ _id: { $ne: ALICE }, username: { $regex: 'bo', $options: 'i' } });
});

test('search is empty for short queries and rejects oversized queries', async () => {
  const UserModel = { find: jest.fn() };
  const app = appWith(UserModel);

  const short = await request(app).get('/api/users?search=b');
  const long = await request(app).get(`/api/users?search=${'x'.repeat(51)}`);

  expect(short.status).toBe(200);
  expect(short.body).toEqual({ users: [] });
  expect(long.status).toBe(400);
  expect(long.body.error.code).toBe('VALIDATION_FAILED');
  expect(UserModel.find).not.toHaveBeenCalled();
});
