const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a user or role from the current ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove from the ticket')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to remove from the ticket')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            if (!user && !role) {
                await interaction.editReply({
                    content: 'You must specify either a user or a role to remove.',
                    ephemeral: true
                });
                return;
            }

            if (user && role) {
                await interaction.editReply({
                    content: 'You can only remove either a user or a role, not both at once.',
                    ephemeral: true
                });
                return;
            }

            // Check if the current channel is a ticket
            const channel = interaction.channel;
            const ticket = await interaction.client.tickets.db.getTicketByChannel(channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.',
                    ephemeral: true
                });
                return;
            }

            // Check if user has permission (creator or admin)
            const isCreator = interaction.user.id === ticket.creatorId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
            const hasAdminRole = interaction.member.roles.cache.some(role => role.name === 'Clutch Support Admin');
            
            if (!isCreator && !isAdmin && !hasAdminRole) {
                await interaction.editReply({
                    content: 'You do not have permission to remove users or roles from this ticket.',
                    ephemeral: true
                });
                return;
            }

            if (user) {
                // Don't allow removing the creator
                if (user.id === ticket.creatorId) {
                    await interaction.editReply({
                        content: 'You cannot remove the ticket creator.',
                        ephemeral: true
                    });
                    return;
                }

                // Remove user permissions
                await channel.permissionOverwrites.delete(user.id);
                
                // Log the action
                await interaction.client.tickets.db.logAction(ticket.id, 'remove_user', interaction.user.id, { removed_user: user.id });
                
                await interaction.editReply({
                    content: `Removed ${user} from the ticket.`,
                    ephemeral: true
                });

                // Send a notification in the channel
                await channel.send({
                    content: `${interaction.user} removed ${user} from this ticket.`
                });
            } else if (role) {
                // Remove role permissions
                await channel.permissionOverwrites.delete(role.id);
                
                // Log the action
                await interaction.client.tickets.db.logAction(ticket.id, 'remove_role', interaction.user.id, { removed_role: role.id });
                
                await interaction.editReply({
                    content: `Removed role ${role} from the ticket.`,
                    ephemeral: true
                });

                // Send a notification in the channel
                await channel.send({
                    content: `${interaction.user} removed role ${role} from this ticket.`
                });
            }
        } catch (error) {
            console.error('Error removing user/role from ticket:', error);
            await interaction.editReply({
                content: `Failed to remove user/role from the ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 