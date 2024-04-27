import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'; // ES Modules import
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

const bedrockClient = new BedrockRuntimeClient({ region: 'eu-central-1' });

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

const generate = async (/** @type {string} */ prompt) => {
  const input = {
    body: JSON.stringify({
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 128,
        stopSequences: [],
        temperature: 1,
        topP: 1,
      },
    }),
    contentType: 'application/json',
    accept: 'application/json',
    modelId: 'amazon.titan-text-express-v1',
  };
  const response = await bedrockClient.send(new InvokeModelCommand(input));
  const results = JSON.parse(
    Buffer.from(response.body).toString('utf-8'),
  ).results;
  console.log('results:', results);
  const output = results?.[0]?.outputText;
  return output
    ?.split('\n')
    .filter(
      (/** @type {string} */ s) =>
        !s.startsWith('Here is a') && !s.startsWith('#'),
    )
    .join('\n');
};

const generateBirthdayMessage = async (
  /** @type {string} */ name,
  /** @type {number} */ age,
) =>
  generate(
    `Here is a short announcement that it's ${name}'s ${age}th birthday today, with some emojis:\n`,
  ) || `🎂 Happy ${age}th birthday ${name}! 🎉`;

const getAge = (/** @type {number} */ year) =>
  new Date().getUTCFullYear() - year;

export const handleSchedule = async (
  /** @type {{user: import('serverless-telegram').User, chatIds: [number], year: number}} */ {
    user,
    chatIds,
    year,
  },
) =>
  Promise.all(
    chatIds.map(
      async (chatId) =>
        await callTgApi({
          method: 'sendMessage',
          chat_id: chatId,
          text: await generateBirthdayMessage(user.first_name, getAge(year)),
        }),
    ),
  ).catch((err) => {
    let message = `Bot Error while handling schedule: ${{
      user,
      chatIds,
      year,
    }}`;
    // since the error won't be thrown we add the stack trace to the logs
    message += `\n\n${err?.stack || err}`;
    console.error(message);
    return callTgApi({
      method: 'sendMessage',
      chat_id: errorChatId,
      text: message,
    });
  });

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
  }
}, errorChatId);
