import { jest } from '@jest/globals';
import { webhook } from '../../../src/handlers/webhook.mjs';

// ignore debug output during tests
console.debug = jest.fn();

const testUpdate = async (botUpdate, expectedResponse) => {
  const res = await webhook({ body: JSON.stringify(botUpdate) });
  expect(res.statusCode).toEqual(200);
  expect(res.body && JSON.parse(res.body)).toEqual(expectedResponse);
};

describe('webhook', function () {
  it('responds to a simple text message', () => {
    return testUpdate(
      {
        update_id: 1,
        message: { chat: { id: 1 }, text: 'hi' },
      },
      {
        method: 'sendMessage',
        chat_id: 1,
        text: 'You said: hi',
      },
    );
  });

  it('ignores a message without text', () => {
    return testUpdate({ update_id: 1, message: { chat: { id: 1 } } }, '');
  });
});
