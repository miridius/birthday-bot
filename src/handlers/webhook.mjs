import {
  CreateScheduleCommand,
  GetScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { callTgApi, createAwsTelegramWebhook } from 'serverless-telegram';

const client = new SchedulerClient({});

// Get the target function details from environment variables
const Arn = process.env.SCHEDULE_LAMBDA_ARN || 'TODO';
const RoleArn = process.env.SCHEDULE_LAMBDA_ROLE_ARN || 'TODO';

const dateToUtcCron = (/** @type {Date} */ date) =>
  `cron(${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${
    date.getUTCMonth() + 1
  } ? *)`;

const getBirthdaySchedule = async (
  /** @type {import('serverless-telegram').User} */ { id },
) => {
  try {
    return await client.send(new GetScheduleCommand({ Name: id.toString() }));
  } catch (e) {
    if (e instanceof ResourceNotFoundException) {
      return undefined;
    } else {
      throw e;
    }
  }
};

const createBirthdaySchedule = async (
  /** @type {import('serverless-telegram').User} */ user,
  /** @type {number[]} */ chatIds,
  /** @type {Date} */ date,
) => {
  /** @type {import('@aws-sdk/client-scheduler').CreateScheduleCommandInput} */
  const input = {
    Name: user.id.toString(), // required
    Description: date.toISOString(),
    ScheduleExpression: dateToUtcCron(date), // required
    ScheduleExpressionTimezone: 'UTC',
    StartDate: new Date(),
    // EndDate: new Date('TIMESTAMP'),
    Target: {
      Arn, // required
      RoleArn, // required
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 20,
      },
      Input: JSON.stringify({ user, chatIds }),
    },
    FlexibleTimeWindow: {
      Mode: 'OFF', // required
      // MaximumWindowInMinutes: Number('int'),
    },
    // ActionAfterCompletion: 'NONE',
  };
  return client.send(new CreateScheduleCommand(input));
};

const updateBirthdaySchedule = async (
  /** @type {import('@aws-sdk/client-scheduler').GetScheduleCommandOutput} */ schedule,
  /** @type {Partial<import("@aws-sdk/client-scheduler").UpdateScheduleCommandInput>} */ newData,
) => {
  return client.send(
    // @ts-ignore
    new UpdateScheduleCommand({
      ...schedule,
      ...newData,
      StartDate: new Date(),
    }),
  );
};

const setbirthday = async (
  /** @type {import('serverless-telegram').Message} */ { from, chat },
  /** @type {string} */ dateStr,
) => {
  const date = new Date(dateStr);
  // @ts-ignore
  if (date == 'Invalid Date') {
    return 'invalid date. Please use ISO format including UTC offset';
  }
  const schedule = await getBirthdaySchedule(from);
  if (schedule) {
    const response = await updateBirthdaySchedule(schedule, {
      Description: date.toISOString(),
      ScheduleExpression: dateToUtcCron(date),
    });
    return 'birthday schedule updated: ' + response.ScheduleArn;
  } else {
    const response = await createBirthdaySchedule(from, [chat.id], date);
    return 'birthday schedule created: ' + response.ScheduleArn;
  }
};

const getbirthday = async (
  /** @type {import('serverless-telegram').Message} */ { from },
) => {
  const schedule = await getBirthdaySchedule(from);
  if (schedule) {
    console.log('got schedule:', schedule);
    return 'Your birthday is: ' + schedule.Description;
  } else {
    return 'Your birthday is not set, please use /setBirthday first';
  }
};

const addchat = async ({ from, chat }) => {
  const schedule = await getBirthdaySchedule(from.id);
  if (schedule) {
    const input = JSON.parse(schedule.Target.Input);
    input.chatIds = [...new Set(input.chatIds).add(chat.id)];
    schedule.Target.Input = JSON.stringify(input);
    // @ts-ignore
    const response = await updateBirthdaySchedule(schedule);
    return 'birthday schedule updated: ' + response.ScheduleArn;
  } else {
    return 'Your birthday is not set, please use /setBirthday first';
  }
};

const removeChat = async ({ from, chat }) => {
  const schedule = await getBirthdaySchedule(from.id);
  if (schedule) {
    const input = JSON.parse(schedule.Target.Input);
    const chatIds = new Set(input.chatIds);
    chatIds.delete(chat.id);
    input.chatIds = [...chatIds];
    schedule.Target.Input = JSON.stringify(input);
    // @ts-ignore
    const response = await updateBirthdaySchedule(schedule);
    return 'birthday schedule updated: ' + response.ScheduleArn;
  } else {
    return 'Your birthday is not set, please use /setBirthday first';
  }
};

const handlers = { setbirthday, getbirthday, addchat, removeChat };

export const webhook = createAwsTelegramWebhook(async (msg) => {
  if (msg.text?.startsWith('/')) {
    const [command, ...args] = msg.text.split(' ');
    const handler = handlers[command.substring(1)];
    if (handler) {
      return await handler(msg, ...args);
    } else {
      return 'unknown command: ' + command;
    }
  }
}, 60764253);

const userHandle = (/** @type {import('serverless-telegram').User} */ user) =>
  user.first_name + (user.username ? ` @${user.username}` : '');

export const handleSchedule = async (
  /** @type {{user: import('serverless-telegram').User, chatIds: [number]}} */ {
    user,
    chatIds,
  },
) =>
  Promise.all(
    chatIds.map((chatId) =>
      callTgApi({
        method: 'sendMessage',
        chat_id: chatId,
        text: `🎂 Happy birthday ${userHandle(user)}! 🎉`,
      }),
    ),
  );
