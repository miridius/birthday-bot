import { jest } from '@jest/globals';

// Mock callTgApi before importing
const mockCallTgApi = jest.fn();
jest.unstable_mockModule('serverless-telegram', () => ({
  callTgApi: mockCallTgApi,
  createAwsTelegramWebhook: jest.fn(() => jest.fn()),
}));

const { handleSchedule } = await import(
  '../../../src/handlers/webhook.mjs'
);

// ignore debug output during tests
console.debug = jest.fn();

beforeEach(() => {
  mockCallTgApi.mockReset();
  mockCallTgApi.mockResolvedValue({ ok: true });
});

describe('handleSchedule', () => {
  const validEvent = {
    user: { id: 123, first_name: 'Alice', username: 'alice' },
    chatIds: [456, 789],
    year: 1990,
  };

  it('sends birthday messages to all chatIds', async () => {
    await handleSchedule(validEvent);

    expect(mockCallTgApi).toHaveBeenCalledTimes(2);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'sendMessage',
        chat_id: 456,
        text: expect.stringContaining('Alice'),
      }),
    );
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'sendMessage',
        chat_id: 789,
        text: expect.stringContaining('Alice'),
      }),
    );
  });

  it('rejects missing user', async () => {
    await handleSchedule({ chatIds: [456], year: 1990 });

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'sendMessage',
        text: expect.stringContaining('invalid input'),
      }),
    );
  });

  it('rejects missing chatIds', async () => {
    await handleSchedule({
      user: { id: 1, first_name: 'Bob' },
      year: 1990,
    });

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('invalid input'),
      }),
    );
  });

  it('rejects empty chatIds array', async () => {
    await handleSchedule({
      user: { id: 1, first_name: 'Bob' },
      chatIds: [],
      year: 1990,
    });

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('invalid input'),
      }),
    );
  });

  it('rejects missing year', async () => {
    await handleSchedule({
      user: { id: 1, first_name: 'Bob' },
      chatIds: [456],
    });

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('invalid input'),
      }),
    );
  });

  it('rejects null/undefined event', async () => {
    await handleSchedule(null);

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('invalid input'),
      }),
    );
  });

  it('sends error to errorChatId on callTgApi failure', async () => {
    mockCallTgApi
      .mockRejectedValueOnce(new Error('Telegram API error'))
      .mockResolvedValueOnce({ ok: true });

    await handleSchedule({
      user: { id: 1, first_name: 'Bob' },
      chatIds: [456],
      year: 1990,
    });

    // First call: birthday message (fails)
    // Second call: error report to errorChatId
    expect(mockCallTgApi).toHaveBeenCalledTimes(2);
    expect(mockCallTgApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'sendMessage',
        text: expect.stringContaining('Bot Error while handling schedule'),
      }),
    );
  });

  it('error handler includes JSON-stringified event data', async () => {
    mockCallTgApi
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ ok: true });

    await handleSchedule({
      user: { id: 1, first_name: 'Bob' },
      chatIds: [456],
      year: 1990,
    });

    const errorCall = mockCallTgApi.mock.calls[1][0];
    // Should contain stringified data, not [object Object]
    expect(errorCall.text).not.toContain('[object Object]');
    expect(errorCall.text).toContain('Bob');
  });
});
