import {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { createServer } from "node:http";
import type { CleanupMode } from "./types.js";
import { cleanLua, formatReport, MAX_SOURCE_BYTES } from "./lua-cleaner.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const cleanCommand = new SlashCommandBuilder()
  .setName("clean")
  .setDescription("Conservatively clean an uploaded Lua file without executing it.")
  .addAttachmentOption((option) =>
    option
      .setName("file")
      .setDescription("A .lua source file up to 256 KiB.")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("mode")
      .setDescription("Keep original line numbers or compact the output.")
      .addChoices(
        { name: "Line-stable (recommended)", value: "line-stable" },
        { name: "Compact", value: "safe" },
      ),
  );

const aboutCommand = new SlashCommandBuilder()
  .setName("about")
  .setDescription("Explain what the Lua cleanup bot does and does not do.");

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isLuaFile(name: string | undefined): boolean {
  return Boolean(name?.toLowerCase().endsWith(".lua"));
}

async function downloadText(url: string, size: number): Promise<string> {
  if (size > MAX_SOURCE_BYTES) {
    throw new Error(`The file is larger than the ${MAX_SOURCE_BYTES} byte limit.`);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}.`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(`The downloaded file is larger than the ${MAX_SOURCE_BYTES} byte limit.`);
  }
  return buffer.toString("utf8");
}

client.once("ready", async (readyClient) => {
  await readyClient.application.commands.set([cleanCommand, aboutCommand]);
  console.info(`Logged in as ${readyClient.user.tag}; slash commands registered.`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "about") {
    await interaction.reply({
      ephemeral: true,
      content:
        "I apply conservative, static Lua rewrites only. I do not run Lua, fetch remote code, or promise perfect semantic recovery. The original upload is not stored. Use `/clean` with a `.lua` attachment.",
    });
    return;
  }

  if (interaction.commandName !== "clean") return;
  const attachment = interaction.options.getAttachment("file", true);
  const mode = (interaction.options.getString("mode") ?? "line-stable") as CleanupMode;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (!isLuaFile(attachment.name)) {
      throw new Error("Please upload a file whose name ends in `.lua`.");
    }

    const source = await downloadText(attachment.url, attachment.size);
    const result = cleanLua(source, mode);
    const outputAttachment = new AttachmentBuilder(Buffer.from(result.output, "utf8"), {
      name: `${attachment.name.replace(/\.lua$/i, "")}.clean.lua`,
    });
    const reportAttachment = new AttachmentBuilder(Buffer.from(formatReport(result), "utf8"), {
      name: `${attachment.name.replace(/\.lua$/i, "")}.report.txt`,
    });

    await interaction.editReply({
      content: `Finished. Applied ${result.changes.length} conservative change(s) and recorded ${result.findings.length} finding(s).`,
      files: [outputAttachment, reportAttachment],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file could not be processed.";
    await interaction.editReply(`I could not process that file: ${message}`);
  }
});

const healthPort = Number(process.env.PORT ?? "3000");
createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/healthz") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, service: "lua-cleanup-bot" }));
}).listen(healthPort, "0.0.0.0");

await client.login(requiredEnv("DISCORD_TOKEN"));