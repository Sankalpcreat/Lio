import { runCliTool } from "./cli-runner.mjs";

const ARGUMENTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    args: {
      type: "ARRAY",
      description: "CLI arguments in exact order, excluding the executable name itself.",
      items: {
        type: "STRING"
      }
    },
    reason: {
      type: "STRING",
      description: "Short explanation of why this CLI call is needed."
    }
  },
  required: ["args", "reason"]
};

export function getToolDeclarations() {
  return [
    {
      name: "slack_cli",
      description:
        "Full-access Slack CLI tool. Use this for the complete slack-cli command surface, including api, auth, chat, conversations, files, users, search, reactions, reminders, pins, stars, dnd, team, usergroups, bookmarks, emoji, bots, workflows, calls, and apps. Pass the exact CLI arguments after the executable name.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "slack_read",
      description:
        "Read-only Slack CLI access. Use for listing channels, history, replies, users, search, team info, reactions get/list, reminders list/info, pins list, stars list, dnd info, bookmarks list, emoji list, bots info, and any other non-mutating slack-cli commands.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "slack_write",
      description:
        "Mutating Slack CLI access. Use for posting, deleting, updating, scheduling, inviting, joining, archiving, uploading files, changing presence, apps operations, and any other mutating slack-cli commands.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "notion_cli",
      description:
        "Full-access Notion CLI tool. Use this for the complete notion command surface, including page, block, database, datasource, comment, user, search, file, oauth, and token. Pass the exact CLI arguments after the executable name.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "notion_read",
      description:
        "Read-only Notion CLI access. Use for page get, page markdown, page property, block get/children, database get, datasource get/query/templates, comment get/list, user me/get/list, search, file list/get, token introspect.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "notion_write",
      description:
        "Mutating Notion CLI access. Use for page create/update/move/markdown-update, block append/update/delete, database create/update, datasource create/update, comment create, file create/send/complete, oauth token/refresh, token revoke.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "apple_cli",
      description:
        "Full-access Apple CLI tool on macOS. Use this for the complete apple command surface, including notes, reminders, calendar, and messages. Pass the exact CLI arguments after the executable name.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "apple_read",
      description:
        "Read-only Apple CLI access on macOS. Use for notes list/get/search/show, attachments list/save, reminders lists/list/get, calendar calendars/events/show, alarms list, attendees list, messages services/chats/chat-participants/buddies.",
      parameters: ARGUMENTS_SCHEMA
    },
    {
      name: "apple_write",
      description:
        "Mutating Apple CLI access on macOS. Use for notes create/update/delete/move, folders create/delete, attachment delete, reminders create/update/complete/delete, calendar create/update/delete/alarms add-delete/attendees add, and messages send/send-chat.",
      parameters: ARGUMENTS_SCHEMA
    }
  ];
}

function parseArgs(rawArgs) {
  if (typeof rawArgs === "string") {
    try {
      return JSON.parse(rawArgs);
    } catch {
      return {};
    }
  }

  return rawArgs ?? {};
}

export async function executeFunctionCall(functionCall, runtimeConfig) {
  const args = parseArgs(functionCall.args);
  const toolName = functionCall.name;

  const mapping = {
    slack_cli: {
      cliName: "slack-cli",
      binaryPath: runtimeConfig.slackCliPath
    },
    slack_read: {
      cliName: "slack-cli",
      binaryPath: runtimeConfig.slackCliPath
    },
    slack_write: {
      cliName: "slack-cli",
      binaryPath: runtimeConfig.slackCliPath
    },
    notion_cli: {
      cliName: "notion",
      binaryPath: runtimeConfig.notionCliPath
    },
    notion_read: {
      cliName: "notion",
      binaryPath: runtimeConfig.notionCliPath
    },
    notion_write: {
      cliName: "notion",
      binaryPath: runtimeConfig.notionCliPath
    },
    apple_cli: {
      cliName: "apple",
      binaryPath: runtimeConfig.appleCliPath
    },
    apple_read: {
      cliName: "apple",
      binaryPath: runtimeConfig.appleCliPath
    },
    apple_write: {
      cliName: "apple",
      binaryPath: runtimeConfig.appleCliPath
    }
  };

  const entry = mapping[toolName];
  if (!entry) {
    return {
      ok: false,
      error: `Unknown function ${toolName}`
    };
  }

  return runCliTool({
    toolName,
    cliName: entry.cliName,
    binaryPath: entry.binaryPath,
    args: args.args,
    unsafeMode: Boolean(runtimeConfig.unsafeMode)
  });
}
