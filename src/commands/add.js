const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to add to the ticket')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = interaction.options.getUser('user');
            const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.',
                    ephemeral: true
                });
                return;
            }

            await interaction.client.tickets.addUserToTicket(ticket.id, user.id, interaction.user.id);
            
            await interaction.editReply({
                content: `User ${user.tag} added to ticket successfully.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error adding user to ticket:', error);
            await interaction.editReply({
                content: `Failed to add user to ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 