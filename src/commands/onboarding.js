const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('onboarding')
        .setDescription('Start the onboarding process to learn how to set up and use the ticket system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Create the welcome embed
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🎫 Welcome to Support Bot!')
            .setDescription('Thank you for choosing Support Bot for your ticket management needs. This onboarding guide will help you set up and understand how to use the ticket system effectively.')
            .setColor('#5865F2')
            .setThumbnail('https://cdn.discordapp.com/attachments/1095706752665641012/1095706937729867847/ticket.png')
            .addFields(
                {
                    name: '📋 Overview',
                    value: 'Support Bot helps you manage tickets, rooms, and matches through a user-friendly system. Each ticket is organized by type and automatically categorized for easy access.'
                },
                {
                    name: '🚀 Features',
                    value: '• Multiple ticket types (Support, Match, Room, Custom)\n• Automatic transcript generation\n• Category-based organization\n• Ticket controls for easy management\n• Permission-based access'
                },
                {
                    name: '📌 Getting Started',
                    value: 'Click the buttons below to navigate through the onboarding process and learn how to set up your ticket system.'
                }
            )
            .setFooter({ text: 'Page 1/4 • Setup Guide' })
            .setTimestamp();

        // Create navigation buttons
        const navigationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('onboarding_setup')
                    .setLabel('Initial Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔧'),
                new ButtonBuilder()
                    .setCustomId('onboarding_tickets')
                    .setLabel('Ticket Types')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📝'),
                new ButtonBuilder()
                    .setCustomId('onboarding_commands')
                    .setLabel('Commands')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⌨️'),
                new ButtonBuilder()
                    .setCustomId('onboarding_help')
                    .setLabel('Get Help')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );

        // Send initial onboarding message
        await interaction.reply({
            embeds: [welcomeEmbed],
            components: [navigationRow],
            ephemeral: true
        });
    }
}; 