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
  it('ignores a plain text message (non-command)', () => {
    return testUpdate(
      {
        update_id: 1,
        message: { chat: { id: 1 }, text: 'hi' },
      },
      '',
    );
  });

  it('replies with an error for an unknown command', () => {
    return testUpdate(
      {
        update_id: 1,
        message: { chat: { id: 1 }, text: '/nosuchcommand' },
      },
      {
        method: 'sendMessage',
        chat_id: 1,
        text: 'unknown command: /nosuchcommand',
      },
    );
  });

  it('ignores a message without text', () => {
    return testUpdate({ update_id: 1, message: { chat: { id: 1 } } }, '');
  });
});
