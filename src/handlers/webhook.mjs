import {
  CreateScheduleCommand,
  GetScheduleCommand,
  ListSchedulesCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { callTgApi, createAwsTelegramWebhook } from 'serverless-telegram';

const errorChatId = 60764253;

const schedulerClient = new SchedulerClient({});

// Get the target function details from environment variables
const Arn = process.env.SCHEDULE_LAMBDA_ARN || 'TODO';
const RoleArn = process.env.SCHEDULE_LAMBDA_ROLE_ARN || 'TODO';

const dateToUtcCron = (/** @type {Date} */ date) =>
  `cron(${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${
    date.getUTCMonth() + 1
  } ? *)`;

const userHandle = (/** @type {import('serverless-telegram').User} */ user) =>
  user.first_name + (user.username ? ` @${user.username}` : '');

const start = () =>
  `Hello there! I'm BirthdayBot, your friendly reminder for all things birthday-related. 🎉🤖 My job is to bring smiles and birthday cheers right to your chat, making sure no one's special day goes unnoticed. Here's how I can help make your birthday, and those of your friends and colleagues, extra memorable:

/setbirthday: Share your birthday with me in ISO-8601 format (https://www.timestamp-converter.com/ can help you with that), and I'll keep it safe. This way, I'll know exactly when to kick off the celebrations!
/getbirthday: Curious about what birthday you've told me? Use this command, and I'll return your currently saved birthday in UTC, so you can be sure we're on the same page.
/addchat: Opt-in to receive a festive birthday message from me in the current chat on your birthday. It's my way of making sure you feel celebrated on your special day!
/removechat: Prefer to keep things low-key? No problem! Use this command, and I'll make sure not to send a birthday message in the current chat on your birthday.

My ultimate mission is to spread joy and make every birthday a little brighter. Whether you're a day away or months ahead from your next trip around the sun, I'm here, ready to celebrate with you. Let's make every birthday unforgettable! 🎂🎈`;

const getBirthdaySchedule = async (
  /** @type {import('serverless-telegram').User} */ { id },
) => {
  try {
    return await schedulerClient.send(
      new GetScheduleCommand({ Name: id.toString() }),
    );
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
    Name: user.id.toString(),
    Description: date.toISOString(),
    ScheduleExpression: dateToUtcCron(date),
    ScheduleExpressionTimezone: 'UTC',
    StartDate: new Date(),
    Target: {
      Arn,
      RoleArn,
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 20,
      },
      Input: JSON.stringify({ user, chatIds, year: date.getUTCFullYear() }),
    },
    FlexibleTimeWindow: {
      Mode: 'OFF',
    },
  };
  return schedulerClient.send(new CreateScheduleCommand(input));
};

const updateBirthdaySchedule = async (
  /** @type {import('@aws-sdk/client-scheduler').GetScheduleCommandOutput} */ schedule,
  /** @type {Partial<import("@aws-sdk/client-scheduler").UpdateScheduleCommandInput>} */ newData,
) => {
  return schedulerClient.send(
    new UpdateScheduleCommand({
      Name: schedule.Name,
      GroupName: schedule.GroupName,
      Description: schedule.Description,
      ScheduleExpression: schedule.ScheduleExpression,
      ScheduleExpressionTimezone: schedule.ScheduleExpressionTimezone,
      Target: schedule.Target,
      FlexibleTimeWindow: schedule.FlexibleTimeWindow,
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
      Target: {
        ...schedule.Target,
        Input: JSON.stringify({
          ...JSON.parse(schedule.Target.Input),
          year: date.getUTCFullYear(),
        }),
      },
    });
    return 'Birthday schedule updated for ' + userHandle(from);
  } else {
    await createBirthdaySchedule(from, [chat.id], date);
    return (
      'Birthday schedule created for ' +
      userHandle(from) +
      '; it will be announced in this chat 🥳'
    );
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

const listbirthdays = async (
  /** @type {import('serverless-telegram').Message} */ { chat },
) => {
  const ids = (
    await schedulerClient.send(
      new ListSchedulesCommand({ GroupName: 'default' }),
    )
  ).Schedules.map((s) => Number(s.Name));

  const schedules = await Promise.all(
    // @ts-ignore
    ids.map((id) => getBirthdaySchedule({ id })),
  );

  let lines = schedules
    .map((s) => {
      const { user, chatIds } = JSON.parse(s.Target.Input);
      return (
        (chat.id == 60764253 || chatIds.includes(chat.id)) &&
        `- ${user.first_name}: ${s.Description}`
      );
    })
    .filter((x) => x);
  lines.sort();
  return lines.join('\n');
};

const addchat = async (
  /** @type {import('serverless-telegram').Message} */ { from, chat },
) => {
  const schedule = await getBirthdaySchedule(from);
  if (schedule) {
    const input = JSON.parse(schedule.Target.Input);
    input.chatIds = [...new Set(input.chatIds).add(chat.id)];
    // @ts-ignore
    await updateBirthdaySchedule(schedule, {
      Target: { ...schedule.Target, Input: JSON.stringify(input) },
    });
    return 'Your birthday will be announced in this chat 🥳';
  } else {
    return 'Your birthday is not set, please use /setBirthday first';
  }
};

const removechat = async (
  /** @type {import('serverless-telegram').Message} */ { from, chat },
) => {
  const schedule = await getBirthdaySchedule(from);
  if (schedule) {
    const input = JSON.parse(schedule.Target.Input);
    const chatIds = new Set(input.chatIds);
    chatIds.delete(chat.id);
    input.chatIds = [...chatIds];
    // @ts-ignore
    await updateBirthdaySchedule(schedule, {
      Target: { ...schedule.Target, Input: JSON.stringify(input) },
    });
    return 'Your birthday will no longer be announced in this chat 😔';
  } else {
    return 'Your birthday is not set, please use /setBirthday first';
  }
};

const ordinalIndicator = (/** @type {number} */ n) =>
  (Math.floor((n % 100) / 10) !== 1 && ['th', 'st', 'nd', 'rd'][n % 10]) ||
  'th';


const generateBirthdayMessage = async (
  /** @type {string} */ name,
  /** @type {number} */ age,
) => `🎂 Happy ${age}${ordinalIndicator(age)} birthday, ${name}! 🎉`;


const getAge = (/** @type {number} */ year) =>
  new Date().getUTCFullYear() - year;

export const handleSchedule = async (
  /** @type {{user: import('serverless-telegram').User, chatIds: [number], year: number}} */ event,
) => {
  const { user, chatIds, year } = event ?? {};
  console.log('handleSchedule invoked with:', JSON.stringify(event));

  if (!user?.first_name || !Array.isArray(chatIds) || chatIds.length === 0 || !year) {
    const message = `handleSchedule received invalid input: ${JSON.stringify(event)}`;
    console.error(message);
    return callTgApi({
      method: 'sendMessage',
      chat_id: errorChatId,
      text: message,
    });
  }

  return Promise.all(
    chatIds.map(
      async (chatId) =>
        await callTgApi({
          method: 'sendMessage',
          chat_id: chatId,
          text: await generateBirthdayMessage(user.first_name, getAge(year)),
        }),
    ),
  ).catch((err) => {
    let message = `Bot Error while handling schedule: ${JSON.stringify({ user, chatIds, year })}`;
    // since the error won't be thrown we add the stack trace to the logs
    message += `\n\n${err?.stack || err}`;
    console.error(message);
    return callTgApi({
      method: 'sendMessage',
      chat_id: errorChatId,
      text: message,
    });
  });
};

const announce = (
  /** @type {import('serverless-telegram').Message} */ { from },
  /** @type {string} */ name,
  /** @type {string} */ ageStr,
) => generateBirthdayMessage(name, Number(ageStr));

const commands = {
  start,
  setbirthday,
  getbirthday,
  listbirthdays,
  addchat,
  removechat,
  announce,
};

export const webhook = createAwsTelegramWebhook(async (msg) => {
  if (msg.text?.startsWith('/')) {
    const [command, ...args] = msg.text.split(' ');
    const handler = commands[command.substring(1).split('@')[0]];
    if (handler) {
      return await handler(msg, ...args);
    } else {
      return 'unknown command: ' + command;
    }
  } else if (msg.text) {
    return 'You said: ' + msg.text;
  }
}, errorChatId);
