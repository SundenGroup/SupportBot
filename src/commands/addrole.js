const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a role to the current ticket')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to add to the ticket')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get selected role from the command options
            const role = interaction.options.getRole('role');
            
            // Get the ticket based on channel ID
            const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
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
            
            if (!isCreator && !isAdmin) {
                await interaction.editReply({
                    content: 'You do not have permission to add roles to this ticket.',
                    ephemeral: true
                });
                return;
            }

            try {
                // Use the TicketManager to add the role to the ticket
                await interaction.client.tickets.addRoleToTicket(
                    ticket.id,
                    role.id,
                    role.name,
                    interaction.user.id
                );
                
                await interaction.editReply({
                    content: `Role **${role.name}** has been added to the ticket.`,
                    ephemeral: true
                });
            } catch (permissionError) {
                console.error('Permission error:', permissionError);
                await interaction.editReply({
                    content: `Failed to add role permissions: ${permissionError.message}. Make sure the bot has the "Manage Roles" permission and that the role isn't higher than the bot's role.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error adding role to ticket:', error);
            await interaction.editReply({
                content: `Failed to add role to the ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 