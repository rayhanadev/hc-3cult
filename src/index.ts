import slack from "@slack/bolt";
import "dotenv/config";
import NodeCache from "node-cache";

if (!process.env.SLACK_SECRET_CHANNEL) {
  throw new Error("SLACK_SECRET_CHANNEL is not set.");
}

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is not set.");
}

if (!process.env.SLACK_SIGNING_SECRET) {
  throw new Error("SLACK_SIGNING_SECRET is not set.");
}

const app = new slack.App({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  token: process.env.SLACK_BOT_TOKEN!,
  logLevel: slack.LogLevel.INFO,
});

const membersCache = new NodeCache({ stdTTL: 3600, deleteOnExpire: true });
membersCache.on("expired", async (key) => {
  if (key === "members") refreshMembersCache();
});

app.action("join-cult-of-threes", async ({ ack, body, client }) => {
  await ack();

  try {
    const result = await client.conversations.invite({
      token: process.env.SLACK_BOT_TOKEN!,
      channel: process.env.SLACK_SECRET_CHANNEL!,
      users: body.user.id,
    });

    if (!result.ok) {
      throw new Error("Failed to invite user to the channel.");
    }

    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN!,
      channel: process.env.SLACK_SECRET_CHANNEL!,
      text: `<@${body.user.id}> has accepted our invitation and joined the Cult of 3 Letters. 🙇`,
    });

    await refreshMembersCache();
  } catch (error) {
    console.error(error);
  }
});

app.event("user_profile_change", async ({ event }) => {
  const username = event.user.profile?.display_name!;

  const members = membersCache.get<string[]>("members");

  if (!members) {
    throw new Error("Members cache is empty.");
  }

  if (username.length <= 3 && !members.includes(event.user.id)) {
    try {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.user.id,
        text: "Would you like to join the cult?",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Hey <@${event.user.id}>, nice username... would you like to join us?`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Accept Invitation",
                  emoji: true,
                },
                action_id: "join-cult-of-threes",
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error(error);
    }
  }

  if (username.length > 3) {
    if (members.includes(event.user.id)) {
      try {
        const result = await app.client.conversations.kick({
          token: process.env.SLACK_BOT_TOKEN!,
          channel: process.env.SLACK_SECRET_CHANNEL!,
          user: event.user.id,
        });

        if (!result.ok) {
          throw new Error("Failed to kick user from the channel.");
        }

        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN!,
          channel: process.env.SLACK_SECRET_CHANNEL!,
          text: `<@${event.user.id}> had a username longer than three letters. In violation of our sacred rules, they have been kicked.`,
        });

        await refreshMembersCache();
      } catch (error) {
        console.error(error);
      }
    }
  }
});

async function refreshMembersCache() {
  console.info("Refreshing members cache.");

  const result = await app.client.conversations.members({
    token: process.env.SLACK_BOT_TOKEN!,
    channel: process.env.SLACK_SECRET_CHANNEL!,
  });

  if (!result.ok) {
    throw new Error("Failed to fetch members from the channel.");
  }

  membersCache.set("members", result.members);
}

refreshMembersCache();
await app.start(3000);
console.log("⚡️ Bolt app is running!");
