const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-control')
        .setDescription('Create a new main control room (Clutch Support Admin role required)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if user has the Clutch Support Admin role
            const clutchSupportAdminRole = interaction.guild.roles.cache.find(
                role => role.name === 'Clutch Support Admin'
            );

            if (!clutchSupportAdminRole) {
                await interaction.editReply({
                    content: 'Error: The "Clutch Support Admin" role does not exist in this server.',
                    ephemeral: true
                });
                return;
            }

            const hasRole = interaction.member.roles.cache.has(clutchSupportAdminRole.id);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasRole && !isAdmin) {
                await interaction.editReply({
                    content: 'You need the "Clutch Support Admin" role to use this command.',
                    ephemeral: true
                });
                return;
            }

            // Create the control room
            await interaction.editReply({
                content: 'Creating a new main control room...',
                ephemeral: true
            });

            // Use the setupGuildControlRoom method from TicketManager
            const result = await interaction.client.tickets.setupGuildControlRoom(interaction.guild);

            if (result.success) {
                // Generate response based on status
                let response;
                if (result.status === 'created') {
                    response = `✅ ${result.message}\n\nNew control room: <#${result.channel.id}>`;
                } else if (result.status === 'updated') {
                    response = `✅ ${result.message}\n\nExisting control room: <#${result.channel.id}>`;
                } else {
                    response = `✅ Control room operation completed: ${result.message}\n\nControl room: <#${result.channel.id}>`;
                }
                
                await interaction.editReply({
                    content: response,
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error executing create-control command:', error);
            await interaction.editReply({
                content: `Failed to create control room: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 