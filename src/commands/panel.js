const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Show the staff control panel for the current ticket'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if this is a ticket channel
            const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);

            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.'
                });
                return;
            }

            // Check if user is staff
            const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Clutch Support Admin');
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                (adminRole && interaction.member.roles.cache.has(adminRole.id));

            if (!isAdmin) {
                await interaction.editReply({
                    content: 'Only staff members can use this command.'
                });
                return;
            }

            const closeLabel = ticket.type === 'support' ?
                'Close Ticket' :
                `Close ${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}`;

            const adminButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_user_${ticket.id}`)
                        .setLabel('Add User')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('👤'),
                    new ButtonBuilder()
                        .setCustomId(`add_role_${ticket.id}`)
                        .setLabel('Add Role')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('👥'),
                    new ButtonBuilder()
                        .setCustomId(`close_ticket_${ticket.id}`)
                        .setLabel(closeLabel)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await interaction.editReply({
                content: 'Staff Controls:',
                components: [adminButtons]
            });
        } catch (error) {
            console.error('Error executing panel command:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the control panel.'
            });
        }
    }
};
