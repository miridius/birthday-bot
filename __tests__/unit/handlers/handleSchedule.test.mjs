import { jest } from '@jest/globals';

// Mock callTgApi before importing handleSchedule
const mockCallTgApi = jest.fn();
jest.unstable_mockModule('serverless-telegram', () => ({
  callTgApi: mockCallTgApi,
  createAwsTelegramWebhook: jest.fn(() => jest.fn()),
}));

const { handleSchedule } = await import(
  '../../../src/handlers/webhook.mjs'
);

const currentYear = new Date().getUTCFullYear();

beforeEach(() => {
  mockCallTgApi.mockReset();
  mockCallTgApi.mockResolvedValue({});
});

describe('handleSchedule', () => {
  it('sends a birthday message to a single chatId', async () => {
    await handleSchedule({
      user: { id: 1, first_name: 'Alice', is_bot: false },
      chatIds: [100],
      year: currentYear - 30,
    });

    expect(mockCallTgApi).toHaveBeenCalledTimes(1);
    expect(mockCallTgApi).toHaveBeenCalledWith({
      method: 'sendMessage',
      chat_id: 100,
      text: '🎂 Happy 30th birthday, Alice! 🎉',
    });
  });

  it('sends birthday messages to multiple chatIds', async () => {
    await handleSchedule({
      user: { id: 2, first_name: 'Bob', is_bot: false },
      chatIds: [100, 200, 300],
      year: currentYear - 25,
    });

    expect(mockCallTgApi).toHaveBeenCalledTimes(3);
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 100 }),
    );
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 200 }),
    );
    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 300 }),
    );
  });

  it('calculates the correct age from birth year', async () => {
    await handleSchedule({
      user: { id: 3, first_name: 'Carol', is_bot: false },
      chatIds: [100],
      year: currentYear - 1,
    });

    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🎂 Happy 1st birthday, Carol! 🎉',
      }),
    );
  });

  it('uses correct ordinal for 2nd birthday', async () => {
    await handleSchedule({
      user: { id: 4, first_name: 'Dave', is_bot: false },
      chatIds: [100],
      year: currentYear - 2,
    });

    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🎂 Happy 2nd birthday, Dave! 🎉',
      }),
    );
  });

  it('uses correct ordinal for 3rd birthday', async () => {
    await handleSchedule({
      user: { id: 5, first_name: 'Eve', is_bot: false },
      chatIds: [100],
      year: currentYear - 3,
    });

    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🎂 Happy 3rd birthday, Eve! 🎉',
      }),
    );
  });

  it('uses th for 11th, 12th, 13th (teen exceptions)', async () => {
    await handleSchedule({
      user: { id: 6, first_name: 'Frank', is_bot: false },
      chatIds: [100],
      year: currentYear - 11,
    });

    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🎂 Happy 11th birthday, Frank! 🎉',
      }),
    );
  });

  it('uses st for 21st birthday', async () => {
    await handleSchedule({
      user: { id: 7, first_name: 'Grace', is_bot: false },
      chatIds: [100],
      year: currentYear - 21,
    });

    expect(mockCallTgApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🎂 Happy 21st birthday, Grace! 🎉',
      }),
    );
  });

  it('sends error to errorChatId when callTgApi fails', async () => {
    const error = new Error('Telegram API down');
    mockCallTgApi
      .mockRejectedValueOnce(error) // first chat fails
      .mockResolvedValueOnce({}); // error report succeeds

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleSchedule({
      user: { id: 8, first_name: 'Hank', is_bot: false },
      chatIds: [100],
      year: currentYear - 30,
    });

    // Error handler sends to errorChatId (60764253)
    expect(mockCallTgApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'sendMessage',
        chat_id: 60764253,
      }),
    );

    consoleSpy.mockRestore();
  });

  it('logs error details when callTgApi fails', async () => {
    const error = new Error('Network error');
    mockCallTgApi
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({});

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleSchedule({
      user: { id: 9, first_name: 'Iris', is_bot: false },
      chatIds: [100],
      year: currentYear - 25,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Bot Error while handling schedule'),
    );

    consoleSpy.mockRestore();
  });

  it('handles empty chatIds array', async () => {
    await handleSchedule({
      user: { id: 10, first_name: 'Jack', is_bot: false },
      chatIds: [],
      year: currentYear - 30,
    });

    expect(mockCallTgApi).not.toHaveBeenCalled();
  });
});
