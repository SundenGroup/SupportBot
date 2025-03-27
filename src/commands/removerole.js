const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a role from the current ticket')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to remove from the ticket')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const role = interaction.options.getRole('role');

            // Check if the current channel is a ticket
            const channel = interaction.channel;
            const ticket = await interaction.client.tickets.db.getTicketByChannel(channel.id);
            
            if (!ticket) {
                await interaction.reply({
                    content: 'This command can only be used in a ticket channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Check if user has permission (creator or admin)
            const isCreator = interaction.user.id === ticket.creatorId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
            const hasAdminRole = interaction.member.roles.cache.some(role => role.name === 'Clutch Support Admin');
            
            if (!isCreator && !isAdmin && !hasAdminRole) {
                await interaction.reply({
                    content: 'You do not have permission to remove roles from this ticket.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Remove role permissions
            await channel.permissionOverwrites.delete(role.id);
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'remove_role', interaction.user.id, { removed_role: role.id });
            
            await interaction.reply({
                content: `Removed role ${role} from the ticket.`,
                flags: MessageFlags.Ephemeral
            });

            // Send a notification in the channel
            await channel.send({
                content: `${interaction.user} removed role ${role} from this ticket.`
            });
        } catch (error) {
            console.error('Error removing role from ticket:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: `Failed to remove role from the ticket: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
}; 