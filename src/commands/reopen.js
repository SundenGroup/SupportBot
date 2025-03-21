const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reopen')
        .setDescription('Reopen a closed ticket'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if the current channel is a closed ticket
            const channel = interaction.channel;
            const ticket = await interaction.client.tickets.db.getTicketByChannel(channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.',
                    ephemeral: true
                });
                return;
            }
            
            if (ticket.status !== 'closed') {
                await interaction.editReply({
                    content: 'This ticket is not closed. You can only reopen closed tickets.',
                    ephemeral: true
                });
                return;
            }
            
            // Check if user has permission (creator or admin)
            const isCreator = interaction.user.id === ticket.creatorId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
            
            if (!isCreator && !isAdmin) {
                await interaction.editReply({
                    content: 'You do not have permission to re-open this ticket.',
                    ephemeral: true
                });
                return;
            }

            // Use the ticket manager to reopen the ticket
            await interaction.client.tickets.reopenTicket(ticket.id, interaction.user);
            
            await interaction.editReply({
                content: `Ticket re-opened successfully.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error re-opening ticket:', error);
            await interaction.editReply({
                content: `Failed to re-open the ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 