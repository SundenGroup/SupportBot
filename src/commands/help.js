const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about bot commands and features'),

    async execute(interaction) {
        // Create the main help embed
        const helpEmbed = new EmbedBuilder()
            .setTitle('Support Bot Help')
            .setDescription('This is the only ticketing bot you\'ll ever need! Use the select menu below to explore different features and commands.')
            .setColor('#5764F2')
            .setThumbnail('https://cdn.discordapp.com/attachments/1095706752665641012/1095706937729867847/ticket.png')
            .setFooter({ text: 'Support Bot | Today' })
            .setTimestamp();

        // Add main menu options that match all select menu options
        helpEmbed.addFields(
            { 
                name: '🎫 Ticket Commands',
                value: 'Commands for managing tickets - includes `/close`, `/rename [name]`, and `/reopen` commands to manage your tickets.',
                inline: false 
            },
            { 
                name: '⚙️ Admin Commands',
                value: 'Commands for server administrators - includes `/setup-support` for creating support channels and managing ticket categories.',
                inline: false 
            },
            { 
                name: '📝 Ticket Types',
                value: 'Different types of tickets available - Support, Match, and Custom tickets with unique purposes and behaviors.',
                inline: false 
            },
            { 
                name: '🔧 Control Rooms',
                value: 'How control rooms work - dedicated channels that users can use to create different types of tickets with just a button click.',
                inline: false 
            },
            { 
                name: '📁 Organization',
                value: 'How tickets are organized - category-based organization system with automatic channel management for different ticket types.',
                inline: false 
            },
            { 
                name: '📚 All Information',
                value: 'View all information at once - get a comprehensive overview of all bot features and commands in a single view.',
                inline: false 
            }
        );

        // Create a select menu for different help categories
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Select what you need help with')
            .addOptions([
                {
                    label: 'Ticket Commands',
                    description: 'Commands for managing tickets',
                    value: 'ticket_commands',
                    emoji: '🎫'
                },
                {
                    label: 'Admin Commands',
                    description: 'Commands for server administrators',
                    value: 'admin_commands',
                    emoji: '⚙️'
                },
                {
                    label: 'Ticket Types',
                    description: 'Different types of tickets available',
                    value: 'ticket_types',
                    emoji: '📝'
                },
                {
                    label: 'Control Rooms',
                    description: 'How control rooms work',
                    value: 'control_rooms',
                    emoji: '🔧'
                },
                {
                    label: 'Organization',
                    description: 'How tickets are organized',
                    value: 'organization',
                    emoji: '📁'
                },
                {
                    label: 'All Information',
                    description: 'View all help information at once',
                    value: 'all_info',
                    emoji: '📚'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Send the help message with the select menu
        await interaction.reply({
            embeds: [helpEmbed],
            components: [row],
            ephemeral: true
        });
    }
}; 