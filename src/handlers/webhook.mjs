import { createAwsTelegramWebhook } from 'serverless-telegram';

export const webhook = createAwsTelegramWebhook(
  ({ text }) => text && `You said: ${text}`,
);
