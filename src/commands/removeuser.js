const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeuser')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove from the ticket')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');

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
                    content: 'You do not have permission to remove users from this ticket.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Don't allow removing the creator
            if (user.id === ticket.creatorId) {
                await interaction.reply({
                    content: 'You cannot remove the ticket creator.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Remove user permissions
            await channel.permissionOverwrites.delete(user.id);
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'remove_user', interaction.user.id, { removed_user: user.id });
            
            await interaction.reply({
                content: `Removed ${user} from the ticket.`,
                flags: MessageFlags.Ephemeral
            });

            // Send a notification in the channel
            await channel.send({
                content: `${interaction.user} removed ${user} from this ticket.`
            });
        } catch (error) {
            console.error('Error removing user from ticket:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: `Failed to remove user from the ticket: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
}; 