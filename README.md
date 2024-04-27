# birthday-bot

A serverless telegram bot that sends a message to channels on people's birthdays

## Commands

```
setbirthday - provide your birthday in ISO-8601 format
getbirthday - return your currently saved birthday in UTC
addchat - send a message in the current chat on your birthday
removechat - don’t send a message in the current chat on your birthday
```

## Dev

Doesn't work locally (yet?). Have to deploy it to test things out

Test message generation in the live bot using the secret /announce command

## Tests

`pnpm test`

## Deploy

`pnpm build+deploy`

## TODO

- [x] list birthdays command
- [ ] use local time zone in schedule (specify timezone in setbirthday, allow changing it)
- [ ] investigate strange `{}` messages in bbg channel
- [ ] let chat admins set someone's birthday
- [ ] separate birthday per chat?
