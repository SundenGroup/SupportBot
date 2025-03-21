const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename the current ticket')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('New name for the ticket')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const newName = interaction.options.getString('name');
            const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.',
                    ephemeral: true
                });
                return;
            }

            await interaction.client.tickets.renameTicket(ticket.id, newName, interaction.user);
            
            await interaction.editReply({
                content: `Ticket renamed to: ${newName}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error renaming ticket:', error);
            await interaction.editReply({
                content: `Failed to rename ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 