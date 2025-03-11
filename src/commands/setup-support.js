const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-support')
        .setDescription('Creates a dedicated support ticket channel')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel to set up as a support ticket channel (defaults to creating a new channel)')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title for the support embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The description for the support embed')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;
            let channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'Support Ticket';
            const description = interaction.options.getString('description') || 
                'Need help? Click the button below to open a support ticket. Our team will assist you as soon as possible.';

            // If no channel is specified, create a new one
            if (!channel) {
                channel = await guild.channels.create({
                    name: '📝-support-tickets',
                    type: ChannelType.GuildText,
                    topic: 'Create a support ticket here',
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            allow: [PermissionFlagsBits.ViewChannel],
                            deny: [PermissionFlagsBits.SendMessages]
                        },
                        {
                            id: interaction.client.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageMessages
                            ]
                        }
                    ]
                });
            }

            // Create the support ticket button
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_support')
                        .setLabel('Open Support Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );

            // Create the embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#5865F2')
                .setFooter({ text: 'Support Ticket System' })
                .setTimestamp();

            // Send the message with the button
            await channel.send({
                embeds: [embed],
                components: [button]
            });

            await interaction.editReply({
                content: `Support ticket channel set up successfully in ${channel}!`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error setting up support channel:', error);
            await interaction.editReply({
                content: `Failed to set up support channel: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 