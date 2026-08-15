const { Events } = require('discord.js');
const { openTicket } = require('../ticketActions');

async function handleSlashCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[discord-bot] Error running /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

async function handleOpenTicketButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const result = await openTicket(interaction);
  if (result.error) return interaction.editReply(result.error);
  if (result.alreadyOpen) {
    return interaction.editReply(result.thread ? `You already have an open ticket: ${result.thread}` : 'You already have an open ticket.');
  }
  await interaction.editReply(`Ticket opened: ${result.thread}`);
}

async function handleAckRulesButton(interaction) {
  await interaction.reply({ content: 'Thanks — enjoy the server!', ephemeral: true });
}

async function handleGameRolesSelect(interaction, guildId) {
  await interaction.deferReply({ ephemeral: true });
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return interaction.editReply("Couldn't find that server anymore.");

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.editReply("You don't appear to be a member of that server anymore.");

  const selected = interaction.values;
  const added = [];
  for (const gameTitle of selected) {
    const roleName = gameTitle.slice(0, 100);
    let role = guild.roles.cache.find((r) => r.name === roleName);
    if (!role) role = await guild.roles.create({ name: roleName, mentionable: false }).catch(() => null);
    if (role) {
      await member.roles.add(role).catch(() => {});
      added.push(roleName);
    }
  }

  await interaction.editReply(added.length > 0 ? `Gave you roles: ${added.join(', ')}` : 'No roles selected.');
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) return handleSlashCommand(interaction);

    if (interaction.isButton()) {
      if (interaction.customId === 'sf-open-ticket') return handleOpenTicketButton(interaction);
      if (interaction.customId.startsWith('sf-ack-rules:')) return handleAckRulesButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('sf-game-roles:')) {
      const guildId = interaction.customId.split(':')[1];
      return handleGameRolesSelect(interaction, guildId);
    }
  }
};
