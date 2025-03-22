const { Client, GatewayIntentBits, Collection, Events, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder, ChannelType, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { token } = require('./config.json');
const TicketManager = require('./managers/TicketManager');
const CommandHandler = require('./handlers/CommandHandler');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize collections
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Initialize ticket manager
client.tickets = new TicketManager(client);

// Function to create support channel
async function createSupportChannel(guild) {
    console.log(`Creating support channel in guild: ${guild.name}`);
    
    // Check if support channel already exists
    const existingChannel = guild.channels.cache.find(
        channel => channel.name === '🎫-support-tickets'
    );
    
    if (existingChannel) {
        console.log(`Support channel already exists in ${guild.name}`);
        return existingChannel;
    }
    
    // Create the support channel
    const channel = await guild.channels.create({
        name: '🎫-support-tickets',
        type: ChannelType.GuildText,
        topic: 'Create a support ticket here',
        permissionOverwrites: [
            {
                id: guild.id,
                allow: [PermissionFlagsBits.ViewChannel],
                deny: [PermissionFlagsBits.SendMessages]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageMessages
                ]
            }
        ]
    });
    
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
        .setTitle('Support Ticket')
        .setDescription('Need help? Click the button below to open a support ticket. Our team will assist you as soon as possible.')
        .setColor('#5865F2')
        .setFooter({ text: 'Support Ticket System' })
        .setTimestamp();
    
    // Send the message with the button
    await channel.send({
        embeds: [embed],
        components: [button]
    });
    
    console.log(`Support ticket channel created: ${channel.name} (${channel.id})`);
    return channel;
}

// Event handlers
client.once('ready', async () => {
    try {
        await client.tickets.init(); // Initialize ticket manager
        console.log(`Logged in as ${client.user.tag}`);
        
        // No longer creating support channels in all guilds
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
});

// Handle guild join event
client.on(Events.GuildCreate, async (guild) => {
    try {
        console.log(`Joined new guild: ${guild.name}`);
        // No longer creating support channel on guild join
        // Control room will be created by the ticket manager
        await client.tickets.setupGuildControlRoom(guild);
    } catch (error) {
        console.error(`Error setting up control room in new guild ${guild.name}:`, error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        // Check if the interaction is valid
        if (!interaction) {
            console.error('Received invalid interaction');
            return;
        }

        if (interaction.isChatInputCommand()) {
            console.log(`Received command interaction: ${interaction.commandName}`);

            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.log(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            // Ensure ticket manager is initialized before handling commands
            if (!client.tickets.initialized) {
                await client.tickets.init();
            }
            await command.execute(interaction);
        } 
        else if (interaction.isButton()) {
            const customId = interaction.customId;
            
            if (customId === 'help_back') {
                // Create the main help embed again
                const helpEmbed = new EmbedBuilder()
                    .setTitle('Support Bot Help Menu')
                    .setDescription('This is the only ticketing bot you\'ll ever need! Explore its features and set the best ticket system for your server!')
                    .setColor('#5764F2')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1095706752665641012/1095706937729867847/ticket.png')
                    .setFooter({ text: 'Support Bot | Today' })
                    .setTimestamp();

                // Add main menu options
                helpEmbed.addFields(
                    { 
                        name: '🔧 Commands',
                        value: 'Browse through Support Bot\'s commands list and find new utilities!',
                        inline: false 
                    },
                    { 
                        name: '❓ FAQ',
                        value: 'Solutions for the most frequent questions our users have when implementing the bot on their server.',
                        inline: false 
                    },
                    { 
                        name: '🔨 Setup',
                        value: 'The steps to follow when setting the bot for the first time on any server',
                        inline: false 
                    }
                );

                // Create the select menu again
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
                            label: 'Organization',
                            description: 'How tickets are organized',
                            value: 'organization',
                            emoji: '📁'
                        },
                        {
                            label: 'Control Rooms',
                            description: 'How control rooms work',
                            value: 'control_rooms',
                            emoji: '🔧'
                        },
                        {
                            label: 'All Information',
                            description: 'View all help information at once',
                            value: 'all_info',
                            emoji: '📚'
                        }
                    ]);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                // Update the message with the main menu again
                await interaction.update({
                    embeds: [helpEmbed],
                    components: [row]
                });
                return;
            }
            else if (customId === 'onboarding_setup') {
                // Create the setup embed
                const setupEmbed = new EmbedBuilder()
                    .setTitle('🔧 Initial Setup')
                    .setDescription('Follow these steps to set up the Support Bot for your server:')
                    .setColor('#5865F2')
                    .addFields(
                        {
                            name: '1️⃣ Create a Control Room',
                            value: 'The bot automatically creates a control room called `control-room` when it joins your server. This is where users can create different types of tickets.'
                        },
                        {
                            name: '2️⃣ Set Up Support Channels',
                            value: 'Use the `/setup-support` command to create dedicated support ticket channels in specific categories for different needs.'
                        },
                        {
                            name: '3️⃣ Configure Permissions',
                            value: 'Make sure appropriate roles have access to manage tickets. Staff need `Manage Channels` permission to close tickets and view transcripts.'
                        },
                        {
                            name: '4️⃣ Test Your Setup',
                            value: 'Create a test ticket to ensure everything is working correctly. Use the buttons in the control room to open a ticket and test the commands.'
                        }
                    )
                    .setFooter({ text: 'Page 2/4 • Setup Guide' })
                    .setTimestamp();

                // Update the message with the setup embed
                await interaction.update({
                    embeds: [setupEmbed],
                    components: [interaction.message.components[0]] // Keep the same navigation buttons
                });
            }
            else if (customId === 'onboarding_tickets') {
                // Create the ticket types embed
                const ticketTypesEmbed = new EmbedBuilder()
                    .setTitle('📝 Ticket Types')
                    .setDescription('Support Bot offers multiple ticket types to organize different needs:')
                    .setColor('#5865F2')
                    .addFields(
                        {
                            name: '🎫 Support Tickets',
                            value: 'For general help, questions, and support issues. Created via the Support Control Room.'
                        },
                        {
                            name: '🎮 Match Tickets',
                            value: 'For scheduling and coordinating matches or events. Created from the Match Control Room.'
                        },
                        {
                            name: '🚪 Room Tickets',
                            value: 'For managing various rooms or spaces within your server. Created from the Room Control Room.'
                        },
                        {
                            name: '⚙️ Custom Tickets',
                            value: 'Create custom ticket types for specialized needs unique to your server. Each type gets its own category and controls.'
                        },
                        {
                            name: '📋 Organization',
                            value: 'Each ticket type is automatically organized into dedicated categories. Closed tickets move to type-specific closed categories.'
                        }
                    )
                    .setFooter({ text: 'Page 3/4 • Setup Guide' })
                    .setTimestamp();

                // Update the message with the ticket types embed
                await interaction.update({
                    embeds: [ticketTypesEmbed],
                    components: [interaction.message.components[0]] // Keep the same navigation buttons
                });
            }
            else if (customId === 'onboarding_commands') {
                // Create the commands embed
                const commandsEmbed = new EmbedBuilder()
                    .setTitle('⌨️ Commands')
                    .setDescription('Here are the key commands available in Support Bot:')
                    .setColor('#5865F2')
                    .addFields(
                        {
                            name: '/close',
                            value: 'Close a ticket and move it to the appropriate closed category'
                        },
                        {
                            name: '/rename [name]',
                            value: 'Rename the current ticket with a new name'
                        },
                        {
                            name: '/reopen',
                            value: 'Reopen a previously closed ticket'
                        },
                        {
                            name: '/add [user]',
                            value: 'Add a user to the current ticket'
                        },
                        {
                            name: '/addrole [role]',
                            value: 'Add a role to the current ticket, giving all role members access'
                        },
                        {
                            name: '/setup-support',
                            value: 'Creates a dedicated support ticket channel (admin only)'
                        },
                        {
                            name: '/help',
                            value: 'Shows help information about bot commands and features'
                        },
                        {
                            name: '/onboarding',
                            value: 'Start the onboarding process for new server administrators'
                        }
                    )
                    .setFooter({ text: 'Page 4/4 • Setup Guide' })
                    .setTimestamp();

                // Update the message with the commands embed
                await interaction.update({
                    embeds: [commandsEmbed],
                    components: [interaction.message.components[0]] // Keep the same navigation buttons
                });
            }
            else if (customId === 'onboarding_help') {
                // Create the help embed
                const helpEmbed = new EmbedBuilder()
                    .setTitle('❓ Get Help')
                    .setDescription('Need more help with Support Bot? Here are some resources:')
                    .setColor('#5865F2')
                    .addFields(
                        {
                            name: '📚 In-Bot Help',
                            value: 'Use the `/help` command to access detailed information about all bot features.'
                        },
                        {
                            name: '🔍 Common Issues',
                            value: '• **Permissions**: Ensure the bot has `Manage Channels` and `Manage Messages` permissions\n• **Categories**: If ticket categories aren\'t created automatically, check server permission settings\n• **Transcripts**: Make sure log channels exist for transcripts to be saved'
                        },
                        {
                            name: '🚀 Quick Tips',
                            value: '• Keep ticket categories organized\n• Use clear naming conventions for tickets\n• Train staff on how to use ticket commands\n• Regularly check transcript logs\n• Test the system before full deployment'
                        },
                        {
                            name: '📝 Documentation',
                            value: 'For full documentation and additional setup guides, use the `/help` command.'
                        }
                    )
                    .setFooter({ text: 'Support Bot • Setup Guide' })
                    .setTimestamp();

                // Update the message with the help embed
                await interaction.update({
                    embeds: [helpEmbed],
                    components: [interaction.message.components[0]] // Keep the same navigation buttons
                });
            }
            
            if (customId.startsWith('create_')) {
                const parts = customId.split('_');
                const action = parts[0]; // create
                const type = parts[1]; // match, room, support, custom
                const isTicket = parts.length > 2 && parts[2] === 'ticket';
                
                if (isTicket) {
                    // This is a ticket creation from a control room
                    // Create the ticket directly without showing a modal
                    await interaction.deferReply({ ephemeral: true });
                    
                    try {
                        // Get the next sequential ticket number for this type
                        const ticketNumber = await client.tickets.db.getNextTicketNumber(type, interaction.guild.id);
                        // Format the ticket number with leading zeros (0001, 0002, etc.)
                        const name = ticketNumber.toString().padStart(4, '0');
                        
                        // Use the same category as the control room
                        const ticketCategory = interaction.channel.parent;
                        
                        // Create ticket channel
                        const ticketChannel = await interaction.guild.channels.create({
                            name: `${type}-${name}`,
                            type: ChannelType.GuildText,
                            parent: ticketCategory,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.id,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                },
                                {
                                    id: interaction.user.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                        });
                        
                        // Create ticket in database
                        const ticketId = Date.now().toString(36);
                        const ticketData = {
                            id: ticketId,
                            guildId: interaction.guild.id,
                            channelId: ticketChannel.id,
                            creatorId: interaction.user.id,
                            type,
                            name,
                            createdAt: Date.now(),
                            status: 'open'
                        };
                        
                        await client.tickets.db.saveTicket(ticketData);
                        await client.tickets.db.addParticipant(ticketId, interaction.user.id, 'creator');
                        await client.tickets.db.logAction(ticketId, 'create', interaction.user.id, { type, name });
                        
                        client.tickets.activeTickets.set(ticketId, ticketData);
                        
                        // Add admin controls with transcript, add user, and close ticket buttons
                        const adminButtons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`add_user_${ticketId}`)
                                    .setLabel('Add User')
                                    .setStyle(ButtonStyle.Success)
                                    .setEmoji('👤'),
                                new ButtonBuilder()
                                    .setCustomId(`add_role_${ticketId}`)
                                    .setLabel('Add Role')
                                    .setStyle(ButtonStyle.Success)
                                    .setEmoji('👥'),
                                new ButtonBuilder()
                                    .setCustomId(`close_ticket_${ticketId}`)
                                    .setLabel(type === 'support' ? 
                                        'Close Ticket' : 
                                        `Close ${type.charAt(0).toUpperCase() + type.slice(1)}`)
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji('🔒')
                            );

                        // Send buttons with admin-only visibility
                        await ticketChannel.send({
                            content: type === 'support' ? 
                                'Ticket Controls:' : 
                                `${type.charAt(0).toUpperCase() + type.slice(1)} Controls:`,
                            components: [adminButtons]
                        });
                        
                        await interaction.editReply({
                            content: type === 'support' ? 
                                `${type.charAt(0).toUpperCase() + type.slice(1)} ticket created: <#${ticketChannel.id}>` :
                                type === 'room' ? 
                                    `Room created: <#${ticketChannel.id}>` :
                                    `${type.charAt(0).toUpperCase() + type.slice(1)} room created: <#${ticketChannel.id}>`,
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Error creating ticket:', error);
                        await interaction.editReply({
                            content: type === 'support' ? 
                                `Failed to create ${type} ticket: ${error.message}` :
                                type === 'room' ?
                                    `Failed to create room: ${error.message}` :
                                    `Failed to create ${type} room: ${error.message}`,
                            ephemeral: true
                        });
                    }
                } else if (type === 'custom') {
                    // Show a modal to get the custom type directly
                    try {
                        const modal = new ModalBuilder()
                            .setCustomId('create_custom_modal')
                            .setTitle('Create Custom Management Channel');

                        const typeInput = new TextInputBuilder()
                            .setCustomId('type_input')
                            .setLabel('Enter management channel type')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('ticket, support, match, contest, etc.')
                            .setRequired(true)
                            .setMinLength(3)
                            .setMaxLength(32);

                        const firstActionRow = new ActionRowBuilder().addComponents(typeInput);
                        modal.addComponents(firstActionRow);

                        await interaction.showModal(modal);
                    } catch (error) {
                        console.error('Error showing custom type modal:', error);
                        await interaction.reply({
                            content: 'Failed to show the custom type modal. Please try again later.',
                            ephemeral: true
                        });
                    }
                } else {
                    // For standard management channels (match, room, support), create them directly without a modal
                    await interaction.deferReply({ ephemeral: true });
                    
                    try {
                        // Check if a control room of this type already exists
                        const existingChannels = interaction.guild.channels.cache.filter(channel => 
                            channel.name.includes(`${type}-control`) && 
                            channel.type === ChannelType.GuildText
                        );
                        
                        if (existingChannels.size > 0) {
                            const existingChannel = existingChannels.first();
                            await interaction.editReply({
                                content: `A ${type} control room already exists: <#${existingChannel.id}>. Only one control room of each type is allowed at a time.`,
                                ephemeral: true
                            });
                            return;
                        }
                        
                        // Use a default name for standard management channels
                        const defaultName = 'control';
                        
                        // Create a control room
                        const ticket = await client.tickets.createTicket({
                            guild: interaction.guild,
                            creator: interaction.user,
                            type,
                            name: defaultName,
                            description: `${type.charAt(0).toUpperCase() + type.slice(1)} management channel`
                        });

                        await interaction.editReply({
                            content: `${type.charAt(0).toUpperCase() + type.slice(1)} control room created: <#${ticket.channelId}>`,
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Error creating management channel:', error);
                        await interaction.editReply({
                            content: `Failed to create the ${type} management channel. Please try again later.`,
                            ephemeral: true
                        });
                    }
                }
            } 
            else if (customId.startsWith('confirm_transcript_')) {
                await interaction.deferUpdate();
                
                try {
                    // Extract ticket ID and channel ID from the custom ID
                    const parts = customId.split('_');
                    const ticketId = parts[2];
                    const channelId = parts[3];
                    
                    const channel = await interaction.guild.channels.fetch(channelId);
                    
                    if (!channel) {
                        await interaction.editReply({
                            content: 'Selected channel no longer exists. Please try again.',
                            components: []
                        });
                        return;
                    }
                    
                    // Get the ticket data first to check if it exists
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            components: []
                        });
                        return;
                    }
                    
                    // Get the ticket type for message formatting
                    const ticketType = ticket.type;
                    
                    // Generate transcript without saving messages (which causes the UNIQUE constraint error)
                    const messages = await ticketChannel.messages.fetch({ limit: 100 });
                    const transcript = `Transcript for ${ticketType}-${ticket.name}\n` +
                        `Created by: ${interaction.guild.members.cache.get(ticket.creatorId)?.user.tag || ticket.creatorId}\n` +
                        `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n\n` +
                        Array.from(messages.values())
                            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                            .map(msg => `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                            .join('\n\n');
                    
                    // Create transcript file
                    const buffer = Buffer.from(transcript, 'utf8');
                    const attachment = new AttachmentBuilder(buffer, {
                        name: `transcript-${ticketId}.txt`
                    });
                    
                    // Send transcript to the selected channel
                    await channel.send({
                        content: ticketType === 'support' ?
                            `Transcript for ticket #${ticket.name} (ID: ${ticketId}) - Requested by ${interaction.user.tag}:` :
                            `Transcript for ${ticketType} #${ticket.name} (ID: ${ticketId}) - Requested by ${interaction.user.tag}:`,
                        files: [attachment]
                    });
                    
                    // Get category name for messaging
                    let logsCategoryName;
                    switch (ticketType) {
                        case 'match':
                            logsCategoryName = 'Match Logs';
                            break;
                        case 'room':
                            logsCategoryName = 'Room Logs';
                            break; 
                        case 'support':
                            logsCategoryName = 'Support Logs';
                            break;
                        case 'custom':
                            logsCategoryName = 'Custom Logs';
                            break;
                        default:
                            logsCategoryName = `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Logs`;
                    }
                    
                    // Notify the user
                    await interaction.editReply({
                        content: ticketType === 'support' ?
                            `Ticket transcribed successfully! Transcript sent to <#${channel.id}>.` :
                            `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} transcribed successfully! Transcript sent to <#${channel.id}>.`,
                        components: []
                    });
                } catch (error) {
                    console.error('Error handling transcript confirmation:', error);
                    await interaction.editReply({
                        content: `Failed to transcribe ticket: ${error.message}`,
                        components: []
                    });
                }
            }
            else if (customId.startsWith('cancel_transcript_')) {
                // Just remove the components and update the message
                await interaction.update({
                    content: 'Transcription cancelled.',
                    components: []
                });
            }
            else if (customId.startsWith('transcribe_')) {
                // Check if user has admin permissions
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true
                    });
                    return;
                }

                // Defer the reply while we process this
                await interaction.deferReply({ ephemeral: true });

                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[1];
                    
                    // Get the ticket to determine the ticket type
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const ticketType = ticket.type;
                    
                    // First try to automatically send the transcript to the appropriate log channel
                    try {
                        const logChannel = await client.tickets.getLogChannel(interaction.guild, ticketType);
                        
                        if (logChannel) {
                            // Get category name for messaging
                            let logsCategoryName;
                            switch (ticketType) {
                                case 'match':
                                    logsCategoryName = 'Match Logs';
                                    break;
                                case 'room':
                                    logsCategoryName = 'Room Logs';
                                    break; 
                                case 'support':
                                    logsCategoryName = 'Support Logs';
                                    break;
                                case 'custom':
                                    logsCategoryName = 'Custom Logs';
                                    break;
                                default:
                                    logsCategoryName = `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Logs`;
                            }
                            
                            // Get the ticket channel
                            const ticketChannel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
                            
                            if (!ticketChannel) {
                                await interaction.editReply({
                                    content: 'The ticket channel no longer exists.',
                                    ephemeral: true
                                });
                                return;
                            }
                            
                            // Generate transcript
                            const messages = await ticketChannel.messages.fetch({ limit: 100 });
                            const transcript = `Transcript for ${ticketType}-${ticket.name}\n` +
                                `Created by: ${interaction.guild.members.cache.get(ticket.creatorId)?.user.tag || ticket.creatorId}\n` +
                                `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n\n` +
                                Array.from(messages.values())
                                    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                                    .map(msg => `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                                    .join('\n\n');
                            
                            // Create transcript file
                            const buffer = Buffer.from(transcript, 'utf8');
                            const attachment = new AttachmentBuilder(buffer, {
                                name: `transcript-${ticketId}.txt`
                            });
                            
                            // Send transcript to the log channel
                            await logChannel.send({
                                content: ticketType === 'support' ? 
                                    `Transcript for ticket #${ticket.name} (ID: ${ticketId}) - Requested by ${interaction.user.tag}:` :
                                    `Transcript for ${ticketType} #${ticket.name} (ID: ${ticketId}) - Requested by ${interaction.user.tag}:`,
                                files: [attachment]
                            });
                            
                            // Let the user know and offer option to send to another channel
                            const selectButton = new ButtonBuilder()
                                .setCustomId(`send_to_other_channel_${ticketId}`)
                                .setLabel('Send to Another Channel')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📑');
                            
                            const row = new ActionRowBuilder().addComponents(selectButton);
                            
                            await interaction.editReply({
                                content: ticketType === 'support' ?
                                    `Transcript for ticket #${ticket.name} has been automatically sent to the ${ticketType}-logs channel in the ${logsCategoryName} category.` :
                                    `Transcript for ${ticketType} #${ticket.name} has been automatically sent to the ${ticketType}-logs channel in the ${logsCategoryName} category.`,
                                components: [row],
                                ephemeral: true
                            });
                            
                            return;
                        }
                    } catch (logError) {
                        console.error('Error getting log channel or generating transcript:', logError);
                        // Continue to manual selection if automatic fails
                    }
                    
                    // Fall back to manual channel selection if we couldn't use the log channel
                    // Get all text channels in the guild that the user can send messages to
                    const availableChannels = interaction.guild.channels.cache
                        .filter(channel => 
                            channel.type === ChannelType.GuildText && 
                            channel.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)
                        )
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(channel => ({
                            label: channel.name,
                            value: channel.id,
                            description: channel.parent ? `Category: ${channel.parent.name}` : 'No category'
                        }));

                    if (availableChannels.length === 0) {
                        await interaction.editReply({
                            content: ticketType === 'support' ?
                                `No available channels found where you can send the ticket transcript.` :
                                `No available channels found where you can send the ${ticketType} transcript.`,
                            ephemeral: true
                        });
                        return;
                    }

                    // Create a select menu for channels (max 25 options as per Discord's limit)
                    
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_channel_${ticketId}`)
                        .setPlaceholder('Select a channel to send the transcript to')
                        .setMinValues(1)
                        .setMaxValues(1);
                        
                    // Add options to the select menu (limited to 25 by Discord)
                    availableChannels.slice(0, 25).forEach(channel => {
                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(channel.label)
                                .setValue(channel.value)
                                .setDescription(channel.description.substring(0, 100)) // Max 100 chars for description
                        );
                    });
                    
                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    
                    // Send a message with the select menu
                    await interaction.editReply({
                        content: ticketType === 'support' ?
                            `No appropriate logs channel found. Please select a channel to send the ticket transcript to:` :
                            `No appropriate logs channel found. Please select a channel to send the ${ticketType} transcript to:`,
                        components: [row],
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error handling transcribe request:', error);
                    await interaction.editReply({
                        content: `Failed to process transcript request: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('send_to_other_channel_')) {
                // Extract ticket ID from the custom ID
                const ticketId = customId.split('_')[4];
                
                try {
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.reply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const ticketType = ticket.type;
                    
                    // Get all text channels in the guild that the user can send messages to
                    const availableChannels = interaction.guild.channels.cache
                        .filter(channel => 
                            channel.type === ChannelType.GuildText && 
                            channel.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)
                        )
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(channel => ({
                            label: channel.name,
                            value: channel.id,
                            description: channel.parent ? `Category: ${channel.parent.name}` : 'No category'
                        }));

                    // Check if there are available channels
                    if (availableChannels.length === 0) {
                        await interaction.reply({
                            content: ticketType === 'support' ?
                                `No available channels found where you can send the ticket transcript.` :
                                `No available channels found where you can send the ${ticketType} transcript.`,
                            ephemeral: true
                        });
                        return;
                    }

                    // Create a select menu for channels (max 25 options as per Discord's limit)
                    
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_channel_${ticketId}`)
                        .setPlaceholder('Select a channel to send the transcript to')
                        .setMinValues(1)
                        .setMaxValues(1);
                        
                    // Add options to the select menu (limited to 25 by Discord)
                    availableChannels.slice(0, 25).forEach(channel => {
                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(channel.label)
                                .setValue(channel.value)
                                .setDescription(channel.description.substring(0, 100)) // Max 100 chars for description
                        );
                    });
                    
                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    
                    // Send a message with the select menu
                    await interaction.update({
                        content: ticketType === 'support' ?
                            `Select a channel to send the ticket transcript to:` :
                            `Select a channel to send the ${ticketType} transcript to:`,
                        components: [row]
                    });
                } catch (error) {
                    console.error('Error creating channel select menu:', error);
                    await interaction.reply({
                        content: `Failed to create channel selection: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('add_user_')) {
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.reply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Check if user has permission (creator or admin)
                    const isCreator = interaction.user.id === ticket.creatorId;
                    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
                    
                    if (!isCreator && !isAdmin) {
                        await interaction.reply({
                            content: 'You do not have permission to add users to this ticket.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Show a modal to get the user ID
                    const modal = new ModalBuilder()
                        .setCustomId(`add_user_modal_${ticketId}`)
                        .setTitle('Add User to Ticket');
                    
                    const userIdInput = new TextInputBuilder()
                        .setCustomId('user_id_input')
                        .setLabel('Enter Username')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Username (e.g., username or username#1234)')
                        .setRequired(true);
                    
                    const firstActionRow = new ActionRowBuilder().addComponents(userIdInput);
                    modal.addComponents(firstActionRow);
                    
                    await interaction.showModal(modal);
                } catch (error) {
                    console.error('Error showing add user modal:', error);
                    await interaction.reply({
                        content: 'Failed to show the add user modal. Please try again later.',
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('add_role_')) {
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.reply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Check if user has permission (creator or admin)
                    const isCreator = interaction.user.id === ticket.creatorId;
                    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
                    
                    if (!isCreator && !isAdmin) {
                        await interaction.reply({
                            content: 'You do not have permission to add roles to this ticket.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Show a modal to get the role name
                    const modal = new ModalBuilder()
                        .setCustomId(`add_role_modal_${ticketId}`)
                        .setTitle('Add Role to Ticket');
                    
                    const roleInput = new TextInputBuilder()
                        .setCustomId('role_input')
                        .setLabel('Enter Role Name')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Role name (e.g., Staff, Moderator, etc.)')
                        .setRequired(true);
                    
                    const firstActionRow = new ActionRowBuilder().addComponents(roleInput);
                    modal.addComponents(firstActionRow);
                    
                    await interaction.showModal(modal);
                } catch (error) {
                    console.error('Error showing add role modal:', error);
                    await interaction.reply({
                        content: 'Failed to show the add role modal. Please try again later.',
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('close_ticket_')) {
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.reply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Check if user has permission (creator or admin)
                    const isCreator = interaction.user.id === ticket.creatorId;
                    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
                    
                    if (!isCreator && !isAdmin) {
                        await interaction.reply({
                            content: 'You do not have permission to close this ticket.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the ticket type for message formatting
                    const ticketType = ticket.type;
                    
                    // Show confirmation buttons for closing or deleting the ticket
                    const confirmButtons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_close_${ticketId}`)
                                .setLabel('Move to Closed')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('📁'),
                            new ButtonBuilder()
                                .setCustomId(`close_and_transcribe_${ticketId}`)
                                .setLabel('Close & Transcribe')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📝'),
                            new ButtonBuilder()
                                .setCustomId(`confirm_delete_${ticketId}`)
                                .setLabel(ticketType === 'support' ? 
                                    'Delete Ticket' : 
                                    `Delete ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️'),
                            new ButtonBuilder()
                                .setCustomId(`cancel_close_${ticketId}`)
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('❌')
                        );
                    
                    await interaction.reply({
                        content: ticketType === 'support' ?
                            'What would you like to do with this ticket?' :
                            `What would you like to do with this ${ticketType}?`,
                        components: [confirmButtons],
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error showing close ticket options:', error);
                    await interaction.reply({
                        content: 'Failed to process your request. Please try again later.',
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('confirm_close_')) {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the channel
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    if (!channel) {
                        await interaction.editReply({
                            content: 'Ticket channel no longer exists.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the ticket type for message formatting
                    const ticketType = ticket.type;
                    
                    // Find or create a type-specific closed category
                    const closedCategoryName = ticketType === 'support' ? 
                        'Closed Support Tickets' : 
                        `Closed ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`;
                    
                    let closedCategory = interaction.guild.channels.cache.find(
                        c => c.name === closedCategoryName && c.type === ChannelType.GuildCategory
                    );
                    
                    if (!closedCategory) {
                        closedCategory = await interaction.guild.channels.create({
                            name: closedCategoryName,
                            type: ChannelType.GuildCategory,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.id,
                                    deny: [PermissionFlagsBits.SendMessages],
                                    allow: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                        });
                    }
                    
                    // Move the channel to the closed category
                    await channel.setParent(closedCategory.id);
                    
                    // Lock the channel (prevent everyone from sending messages)
                    await channel.permissionOverwrites.edit(interaction.guild.id, {
                        SendMessages: false
                    });
                    
                    // Update ticket status in database
                    await client.tickets.db.updateTicket(ticketId, {
                        status: 'closed',
                        closed_at: Date.now(),
                        closed_by: interaction.user.id
                    });
                    
                    // Log the action
                    await client.tickets.db.logAction(ticketId, 'close', interaction.user.id, { action: 'moved_to_closed' });
                    
                    // Find and remove the control buttons message
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const controlMessage = messages.find(msg => 
                        msg.author.id === client.user.id && 
                        (msg.content === 'Ticket Controls:' || msg.content.endsWith(' Controls:')) &&
                        msg.components.length > 0
                    );
                    
                    if (controlMessage) {
                        await controlMessage.delete().catch(err => console.error('Error deleting control message:', err));
                    }
                    
                    // Send a message in the channel
                    await channel.send({
                        content: ticketType === 'support' ?
                            `🔒 This ticket has been closed by ${interaction.user}. The ticket has been moved to the ${closedCategoryName} category.` :
                            `🔒 This ${ticketType} has been closed by ${interaction.user}. The ${ticketType} has been moved to the ${closedCategoryName} category.`
                    });
                    
                    await interaction.editReply({
                        content: ticketType === 'support' ?
                            `Ticket closed successfully. The ticket has been moved to the ${closedCategoryName} category. Preparing transcript...` :
                            `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed successfully. The ${ticketType} has been moved to the ${closedCategoryName} category. Preparing transcript...`,
                        ephemeral: true
                    });
                    
                    // Generate the transcript
                    try {
                        // Get all messages in the channel
                        const allMessages = await channel.messages.fetch({ limit: 100 });
                        const transcript = `Transcript for ${ticketType}-${ticket.name}\n` +
                            `Created by: ${interaction.guild.members.cache.get(ticket.creatorId)?.user.tag || ticket.creatorId}\n` +
                            `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n` +
                            `Closed by: ${interaction.user.tag}\n` +
                            `Closed at: ${new Date().toLocaleString()}\n\n` +
                            Array.from(allMessages.values())
                                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                                .map(msg => `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                                .join('\n\n');
                        
                        // Create transcript file
                        const buffer = Buffer.from(transcript, 'utf8');
                        const attachment = new AttachmentBuilder(buffer, {
                            name: `transcript-${ticketId}.txt`
                        });
                        
                        // Try to get the appropriate log channel for this ticket type
                        let logChannel = null;
                        
                        try {
                            logChannel = await client.tickets.getLogChannel(interaction.guild, ticketType);
                            
                            // Get category name for messaging
                            let logsCategoryName;
                            switch (ticketType) {
                                case 'match':
                                    logsCategoryName = 'Match Logs';
                                    break;
                                case 'room':
                                    logsCategoryName = 'Room Logs';
                                    break; 
                                case 'support':
                                    logsCategoryName = 'Support Logs';
                                    break;
                                case 'custom':
                                    logsCategoryName = 'Custom Logs';
                                    break;
                                default:
                                    logsCategoryName = `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Logs`;
                            }
                            
                            // Send transcript to the log channel
                            if (logChannel) {
                                await logChannel.send({
                                    content: ticketType === 'support' ? 
                                        `Transcript for ticket #${ticket.name} (ID: ${ticketId}) - Closed by ${interaction.user.tag}:` :
                                        `Transcript for ${ticketType} #${ticket.name} (ID: ${ticketId}) - Closed by ${interaction.user.tag}:`,
                                    files: [attachment]
                                });
                                
                                // Let the user know the transcript was saved and offer option to send to another channel
                                const selectButton = new ButtonBuilder()
                                    .setCustomId(`transcribe_${ticketId}`)
                                    .setLabel('Send Transcript to Another Channel')
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('📑');
                                
                                const row = new ActionRowBuilder().addComponents(selectButton);
                                
                                await interaction.followUp({
                                    content: ticketType === 'support' ?
                                        `Ticket closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.` :
                                        `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.`,
                                    components: [row],
                                    ephemeral: true
                                });
                                return;
                            }
                        } catch (logError) {
                            console.error('Error getting log channel:', logError);
                            // Fall through to manual selection if automatic fails
                        }
                        
                        // If we get here, either logChannel wasn't found or there was an error
                        // Proceed with manual channel selection
                        // Get all text channels in the guild that the user can send messages to
                        const availableChannels = interaction.guild.channels.cache
                            .filter(ch => 
                                ch.type === ChannelType.GuildText && 
                                ch.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)
                            )
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(ch => ({
                                label: ch.name,
                                value: ch.id,
                                description: ch.parent ? `Category: ${ch.parent.name}` : 'No category'
                            }));

                        if (availableChannels.length === 0) {
                            await interaction.followUp({
                                content: ticketType === 'support' ?
                                    `No default logs channel found for tickets. Please select a channel to send the transcript to:` :
                                    `No default logs channel found for ${ticketType}s. Please select a channel to send the transcript to:`,
                                components: [row],
                                ephemeral: true
                            });
                            return;
                        }

                        // Create a select menu for channels (max 25 options as per Discord's limit)
                        
                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(`select_channel_${ticketId}`)
                            .setPlaceholder('Select a channel to send the transcript to')
                            .setMinValues(1)
                            .setMaxValues(1);
                            
                        // Add options to the select menu (limited to 25 by Discord)
                        availableChannels.slice(0, 25).forEach(ch => {
                            selectMenu.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(ch.label)
                                    .setValue(ch.value)
                                    .setDescription(ch.description.substring(0, 100)) // Max 100 chars for description
                            );
                        });
                        
                        const row = new ActionRowBuilder().addComponents(selectMenu);
                        
                        // Send a message with the select menu
                        await interaction.followUp({
                            content: ticketType === 'support' ?
                                `No default logs channel found for tickets. Please select a channel to send the transcript to:` :
                                `No default logs channel found for ${ticketType}s. Please select a channel to send the transcript to:`,
                            components: [row],
                            ephemeral: true
                        });
                    } catch (transcriptError) {
                        console.error('Error generating and sending transcript:', transcriptError);
                        await interaction.followUp({
                            content: `An error occurred while generating the transcript: ${transcriptError.message}`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error closing ticket:', error);
                    await interaction.editReply({
                        content: `Failed to close the ticket: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('confirm_delete_')) {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the channel
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    
                    // Generate a transcript before deleting
                    if (channel) {
                        try {
                            // Get all messages in the channel for the transcript
                            const allMessages = await channel.messages.fetch({ limit: 100 });
                            const transcript = `Transcript for ${ticket.type}-${ticket.name}\n` +
                                `Created by: ${interaction.guild.members.cache.get(ticket.creatorId)?.user.tag || ticket.creatorId}\n` +
                                `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n` +
                                `Closed by: ${interaction.user.tag}\n` +
                                `Closed at: ${new Date().toLocaleString()}\n\n` +
                                Array.from(allMessages.values())
                                    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                                    .map(msg => `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                                    .join('\n\n');
                            
                            // Create transcript file
                            const buffer = Buffer.from(transcript, 'utf8');
                            const attachment = new AttachmentBuilder(buffer, {
                                name: `transcript-${ticketId}.txt`
                            });
                            
                            // Find a logs channel to send the transcript to
                            let logsChannel = interaction.guild.channels.cache.find(
                                c => c.name === 'ticket-logs' && c.type === ChannelType.GuildText
                            );
                            
                            if (!logsChannel) {
                                // Try to find any channel with "log" in the name
                                logsChannel = interaction.guild.channels.cache.find(
                                    c => c.name.includes('log') && c.type === ChannelType.GuildText
                                );
                            }
                            
                            if (logsChannel) {
                                await logsChannel.send({
                                    content: ticket.type === 'support' ?
                                        `Transcript for deleted ticket #${ticketId} (${ticket.type}-${ticket.name}) - Deleted by ${interaction.user.tag}:` :
                                        `Transcript for deleted ${ticket.type} #${ticketId} (${ticket.type}-${ticket.name}) - Deleted by ${interaction.user.tag}:`,
                                    files: [attachment]
                                });
                            }
                            
                            // Delete the channel
                            await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
                        } catch (transcriptError) {
                            console.error('Error generating transcript before deletion:', transcriptError);
                            // Still proceed with deletion even if transcript fails
                            if (channel) {
                                await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
                            }
                        }
                    }
                    
                    // Update ticket status in database
                    await client.tickets.db.updateTicket(ticketId, {
                        status: 'deleted',
                        closed_at: Date.now(),
                        closed_by: interaction.user.id
                    });
                    
                    // Log the action
                    await client.tickets.db.logAction(ticketId, 'delete', interaction.user.id, { action: 'deleted' });
                    
                    // Remove from active tickets map
                    client.tickets.activeTickets.delete(ticketId);
                    
                    await interaction.editReply({
                        content: ticketType === 'support' ?
                            `Ticket deleted successfully.` :
                            `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} deleted successfully.`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error deleting ticket:', error);
                    await interaction.editReply({
                        content: `Failed to delete the ticket: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('cancel_close_')) {
                // Just remove the components and update the message
                await interaction.update({
                    content: 'Ticket closing cancelled.',
                    components: []
                });
            }
            else if (customId.startsWith('close_and_transcribe_')) {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[3];
                    
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the channel
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    if (!channel) {
                        await interaction.editReply({
                            content: 'Ticket channel no longer exists.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the ticket type for message formatting
                    const ticketType = ticket.type;
                    
                    // Find or create a type-specific closed category
                    const closedCategoryName = ticketType === 'support' ? 
                        'Closed Support Tickets' : 
                        `Closed ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`;
                    
                    let closedCategory = interaction.guild.channels.cache.find(
                        c => c.name === closedCategoryName && c.type === ChannelType.GuildCategory
                    );
                    
                    if (!closedCategory) {
                        closedCategory = await interaction.guild.channels.create({
                            name: closedCategoryName,
                            type: ChannelType.GuildCategory,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.id,
                                    deny: [PermissionFlagsBits.SendMessages],
                                    allow: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                        });
                    }
                    
                    // Move the channel to the closed category
                    await channel.setParent(closedCategory.id);
                    
                    // Lock the channel (prevent everyone from sending messages)
                    await channel.permissionOverwrites.edit(interaction.guild.id, {
                        SendMessages: false
                    });
                    
                    // Update ticket status in database
                    await client.tickets.db.updateTicket(ticketId, {
                        status: 'closed',
                        closed_at: Date.now(),
                        closed_by: interaction.user.id
                    });
                    
                    // Log the action
                    await client.tickets.db.logAction(ticketId, 'close', interaction.user.id, { action: 'moved_to_closed' });
                    
                    // Find and remove the control buttons message
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const controlMessage = messages.find(msg => 
                        msg.author.id === client.user.id && 
                        (msg.content === 'Ticket Controls:' || msg.content.endsWith(' Controls:')) &&
                        msg.components.length > 0
                    );
                    
                    if (controlMessage) {
                        await controlMessage.delete().catch(err => console.error('Error deleting control message:', err));
                    }
                    
                    // Send a message in the channel
                    await channel.send({
                        content: ticketType === 'support' ?
                            `🔒 This ticket has been closed by ${interaction.user}. The ticket has been moved to the ${closedCategoryName} category.` :
                            `🔒 This ${ticketType} has been closed by ${interaction.user}. The ${ticketType} has been moved to the ${closedCategoryName} category.`
                    });
                    
                    await interaction.editReply({
                        content: ticketType === 'support' ?
                            `Ticket closed successfully. The ticket has been moved to the ${closedCategoryName} category. Preparing transcript...` :
                            `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed successfully. The ${ticketType} has been moved to the ${closedCategoryName} category. Preparing transcript...`,
                        ephemeral: true
                    });
                    
                    // Generate the transcript
                    try {
                        // Get all messages in the channel
                        const allMessages = await channel.messages.fetch({ limit: 100 });
                        const transcript = `Transcript for ${ticketType}-${ticket.name}\n` +
                            `Created by: ${interaction.guild.members.cache.get(ticket.creatorId)?.user.tag || ticket.creatorId}\n` +
                            `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n` +
                            `Closed by: ${interaction.user.tag}\n` +
                            `Closed at: ${new Date().toLocaleString()}\n\n` +
                            Array.from(allMessages.values())
                                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                                .map(msg => `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                                .join('\n\n');
                        
                        // Create transcript file
                        const buffer = Buffer.from(transcript, 'utf8');
                        const attachment = new AttachmentBuilder(buffer, {
                            name: `transcript-${ticketId}.txt`
                        });
                        
                        // Try to get the appropriate log channel for this ticket type
                        let logChannel = null;
                        
                        try {
                            logChannel = await client.tickets.getLogChannel(interaction.guild, ticketType);
                            
                            // Get category name for messaging
                            let logsCategoryName;
                            switch (ticketType) {
                                case 'match':
                                    logsCategoryName = 'Match Logs';
                                    break;
                                case 'room':
                                    logsCategoryName = 'Room Logs';
                                    break; 
                                case 'support':
                                    logsCategoryName = 'Support Logs';
                                    break;
                                case 'custom':
                                    logsCategoryName = 'Custom Logs';
                                    break;
                                default:
                                    logsCategoryName = `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Logs`;
                            }
                            
                            // Send transcript to the log channel
                            if (logChannel) {
                                await logChannel.send({
                                    content: ticketType === 'support' ? 
                                        `Transcript for ticket #${ticket.name} (ID: ${ticketId}) - Closed by ${interaction.user.tag}:` :
                                        `Transcript for ${ticketType} #${ticket.name} (ID: ${ticketId}) - Closed by ${interaction.user.tag}:`,
                                    files: [attachment]
                                });
                                
                                // Let the user know the transcript was saved and offer option to send to another channel
                                const selectButton = new ButtonBuilder()
                                    .setCustomId(`transcribe_${ticketId}`)
                                    .setLabel('Send Transcript to Another Channel')
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('📑');
                                
                                const row = new ActionRowBuilder().addComponents(selectButton);
                                
                                await interaction.followUp({
                                    content: ticketType === 'support' ?
                                        `Ticket closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.` :
                                        `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.`,
                                    components: [row],
                                    ephemeral: true
                                });
                                return;
                            }
                        } catch (logError) {
                            console.error('Error getting log channel:', logError);
                            // Fall through to manual selection if automatic fails
                        }
                        
                        // If we get here, either logChannel wasn't found or there was an error
                        // Proceed with manual channel selection
                        // Get all text channels in the guild that the user can send messages to
                        const availableChannels = interaction.guild.channels.cache
                            .filter(ch => 
                                ch.type === ChannelType.GuildText && 
                                ch.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)
                            )
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(ch => ({
                                label: ch.name,
                                value: ch.id,
                                description: ch.parent ? `Category: ${ch.parent.name}` : 'No category'
                            }));

                        if (availableChannels.length === 0) {
                            await interaction.followUp({
                                content: ticketType === 'support' ?
                                    `No default logs channel found for tickets. Please select a channel to send the transcript to:` :
                                    `No default logs channel found for ${ticketType}s. Please select a channel to send the transcript to:`,
                                components: [row],
                                ephemeral: true
                            });
                            return;
                        }

                        // Create a select menu for channels (max 25 options as per Discord's limit)
                        
                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(`select_channel_${ticketId}`)
                            .setPlaceholder('Select a channel to send the transcript to')
                            .setMinValues(1)
                            .setMaxValues(1);
                            
                        // Add options to the select menu (limited to 25 by Discord)
                        availableChannels.slice(0, 25).forEach(ch => {
                            selectMenu.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(ch.label)
                                    .setValue(ch.value)
                                    .setDescription(ch.description.substring(0, 100)) // Max 100 chars for description
                            );
                        });
                        
                        const row = new ActionRowBuilder().addComponents(selectMenu);
                        
                        // Send a message with the select menu
                        await interaction.followUp({
                            content: ticketType === 'support' ?
                                `No default logs channel found for tickets. Please select a channel to send the transcript to:` :
                                `No default logs channel found for ${ticketType}s. Please select a channel to send the transcript to:`,
                            components: [row],
                            ephemeral: true
                        });
                    } catch (transcriptError) {
                        console.error('Error generating and sending transcript:', transcriptError);
                        await interaction.followUp({
                            content: `An error occurred while generating the transcript: ${transcriptError.message}`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error closing and transcribing ticket:', error);
                    await interaction.editReply({
                        content: `Failed to close the ticket: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            
            if (customId === 'create_custom_modal') {
                // Handle custom type input from the main control room
                const customType = interaction.fields.getTextInputValue('type_input').toLowerCase();
                
                // Create a management channel for the custom type
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Check if a control room of this type already exists
                    const existingChannels = interaction.guild.channels.cache.filter(channel => 
                        channel.name.includes(`${customType}-control`) && 
                        channel.type === ChannelType.GuildText
                    );
                    
                    if (existingChannels.size > 0 && customType !== 'custom') {
                        const existingChannel = existingChannels.first();
                        await interaction.editReply({
                            content: `A ${customType} control room already exists: <#${existingChannel.id}>. Only one control room of each type is allowed at a time.`,
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Generate a default name for the channel
                    const defaultName = 'control';
                    
                    // Create a control room with the custom type
                    const ticket = await client.tickets.createTicket({
                        guild: interaction.guild,
                        creator: interaction.user,
                        type: customType,
                        name: defaultName,
                        description: `${customType.charAt(0).toUpperCase() + customType.slice(1)} management channel`
                    });

                    await interaction.editReply({
                        content: `${customType.charAt(0).toUpperCase() + customType.slice(1)} control room created: <#${ticket.channelId}>`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error creating custom type channel:', error);
                    await interaction.editReply({
                        content: `Failed to create the ${customType} management channel. Please try again later.`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('add_user_modal_')) {
                // Handle adding a user to a ticket
                const ticketId = customId.split('_')[3];
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the user input
                    let userInput = interaction.fields.getTextInputValue('user_id_input').trim();
                    
                    // Try to find the user
                    let user = null;
                    
                    // Check if it's a mention
                    if (userInput.startsWith('<@') && userInput.endsWith('>')) {
                        // Handle mentions (format: <@123456789012345678>)
                        let userId = userInput.slice(2, -1);
                        
                        // Handle nickname mentions
                        if (userId.startsWith('!')) {
                            userId = userId.slice(1);
                        }
                        
                        try {
                            user = await interaction.client.users.fetch(userId);
                        } catch (error) {
                            console.error('Error fetching user by ID:', error);
                        }
                    } 
                    // Check if it's a direct user ID
                    else if (/^\d{17,19}$/.test(userInput)) {
                        try {
                            user = await interaction.client.users.fetch(userInput);
                        } catch (error) {
                            console.error('Error fetching user by ID:', error);
                        }
                    } 
                    // Otherwise, try to find by username
                    else {
                        // Get all members in the guild
                        const members = await interaction.guild.members.fetch();
                        
                        // First try exact match on username
                        let member = members.find(m => 
                            m.user.username.toLowerCase() === userInput.toLowerCase() || 
                            m.user.tag.toLowerCase() === userInput.toLowerCase() ||
                            (m.nickname && m.nickname.toLowerCase() === userInput.toLowerCase())
                        );
                        
                        // If no exact match, try partial match
                        if (!member) {
                            member = members.find(m => 
                                m.user.username.toLowerCase().includes(userInput.toLowerCase()) || 
                                (m.nickname && m.nickname.toLowerCase().includes(userInput.toLowerCase()))
                            );
                        }
                        
                        if (member) {
                            user = member.user;
                        }
                    }
                    
                    if (!user) {
                        await interaction.editReply({
                            content: 'Could not find a user with that username. Please try again with a different username or use their ID.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the channel
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    if (!channel) {
                        await interaction.editReply({
                            content: 'Ticket channel no longer exists.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Add the user to the channel
                    await channel.permissionOverwrites.edit(user.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    });
                    
                    // Add the user to the ticket participants
                    await client.tickets.db.addParticipant(ticketId, user.id, 'added');
                    await client.tickets.db.logAction(ticketId, 'add_user', interaction.user.id, { added_user: user.id });
                    
                    await interaction.editReply({
                        content: `User ${user.tag} has been added to the ticket.`,
                        ephemeral: true
                    });
                    
                    // Notify in the channel
                    await channel.send({
                        content: `${interaction.user} added ${user} to this ticket.`
                    });
                } catch (error) {
                    console.error('Error adding user to ticket:', error);
                    await interaction.editReply({
                        content: `Failed to add user to the ticket: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (customId.startsWith('add_role_modal_')) {
                // Handle adding a role to a ticket
                const ticketId = customId.split('_')[3];
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    // Get the ticket data
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.editReply({
                            content: 'Ticket not found or has been deleted.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the role input
                    let roleInput = interaction.fields.getTextInputValue('role_input').trim();
                    
                    // Try to find the role
                    const roles = interaction.guild.roles.cache;
                    let role = roles.find(r => 
                        r.name.toLowerCase() === roleInput.toLowerCase()
                    );
                    
                    // If no exact match, try partial match
                    if (!role) {
                        role = roles.find(r => 
                            r.name.toLowerCase().includes(roleInput.toLowerCase())
                        );
                    }
                    
                    if (!role) {
                        await interaction.editReply({
                            content: 'Could not find a role with that name. Please try again with a different role name.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    // Get the channel
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    if (!channel) {
                        await interaction.editReply({
                            content: 'Ticket channel no longer exists.',
                            ephemeral: true
                        });
                        return;
                    }
                    
                    try {
                        // Use the TicketManager to add the role to the ticket
                        await client.tickets.addRoleToTicket(
                            ticketId,
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
        }
        else if (interaction.isStringSelectMenu()) {
            // Handle select menu interactions
            const customId = interaction.customId;
            
            if (customId === 'help_category') {
                const selected = interaction.values[0];
                const helpEmbed = new EmbedBuilder()
                    .setColor('#5764F2')
                    .setFooter({ text: 'Support Bot | Today' })
                    .setTimestamp();
                
                switch (selected) {
                    case 'ticket_commands':
                        helpEmbed
                            .setTitle('Ticket Commands')
                            .setDescription('Commands for managing your tickets')
                            .addFields(
                                { name: '`/ticket close`', value: 'Close the current ticket and move it to the appropriate closed category', inline: false },
                                { name: '`/ticket rename [name]`', value: 'Rename the current ticket', inline: false },
                                { name: '`/ticket reopen`', value: 'Reopen a closed ticket', inline: false },
                                { name: '`/add [user]`', value: 'Add a user to the current ticket', inline: false },
                                { name: '`/addrole [role]`', value: 'Add a role to the current ticket', inline: false },
                                { name: '`/help`', value: 'Show this help menu', inline: false }
                            );
                        break;
                    case 'admin_commands':
                        helpEmbed
                            .setTitle('Admin Commands')
                            .setDescription('Commands for server administrators')
                            .addFields(
                                { name: '`/setup-support`', value: 'Creates a dedicated support ticket channel with customizable title and description', inline: false }
                            );
                        break;
                    case 'ticket_types':
                        helpEmbed
                            .setTitle('Ticket Types')
                            .setDescription('The bot supports different types of tickets for various purposes')
                            .addFields(
                                { name: 'Support Tickets', value: 'For general user support and assistance', inline: false },
                                { name: 'Match Management', value: 'For coordinating and organizing matches', inline: false },
                                { name: 'Room Management', value: 'For managing rooms and channels', inline: false },
                                { name: 'Custom Management', value: 'Create your own custom ticket types for specific needs', inline: false }
                            );
                        break;
                    case 'organization':
                        helpEmbed
                            .setTitle('Ticket Organization')
                            .setDescription('How tickets are organized in your server')
                            .addFields(
                                { name: 'Active Tickets', value: 'Each ticket type has its own category (Support Tickets, Match Management, etc.)', inline: false },
                                { name: 'Closed Tickets', value: 'Moved to type-specific closed categories (Closed Support Tickets, Closed Match, etc.)', inline: false },
                                { name: 'Transcripts', value: 'Automatically saved to type-specific logs channels in their respective categories', inline: false }
                            );
                        break;
                    case 'control_rooms':
                        helpEmbed
                            .setTitle('Control Rooms')
                            .setDescription('Control rooms provide buttons for users to create tickets easily without commands')
                            .addFields(
                                { name: 'Main Control Room', value: 'Central hub with buttons for creating all types of tickets', inline: false },
                                { name: 'Match Control', value: 'Create match-specific tickets with the click of a button', inline: false },
                                { name: 'Room Control', value: 'Create room management tickets easily', inline: false },
                                { name: 'Support Control', value: 'Create support tickets for user assistance', inline: false },
                                { name: 'Custom Control', value: 'Create custom ticket types for specific needs', inline: false }
                            );
                        break;
                    case 'all_info':
                        helpEmbed
                            .setTitle('Support Bot - All Information')
                            .setDescription('Complete overview of all bot features and commands')
                            .addFields(
                                // Commands
                                { 
                                    name: '🎫 Ticket Commands',
                                    value: '`/ticket close` - Close the current ticket\n' +
                                           '`/ticket rename [name]` - Rename the current ticket\n' +
                                           '`/ticket reopen` - Reopen a closed ticket\n' +
                                           '`/add [user]` - Add a user to the current ticket\n' +
                                           '`/addrole [role]` - Add a role to the current ticket',
                                    inline: false 
                                },
                                { 
                                    name: '⚙️ Admin Commands',
                                    value: '`/setup-support` - Create a dedicated support ticket channel\n' +
                                           '`/help` - Show this help menu',
                                    inline: false 
                                },
                                
                                // Ticket Types
                                { 
                                    name: '📝 Ticket Types',
                                    value: '• **Support Tickets** - General user support\n' +
                                           '• **Match Management** - Coordinate matches\n' +
                                           '• **Room Management** - Manage rooms\n' +
                                           '• **Custom Management** - Custom ticket types',
                                    inline: false 
                                },
                                
                                // Control Rooms
                                { 
                                    name: '🔧 Control Rooms',
                                    value: '• **Control Room** - Main hub with buttons for all ticket types\n' +
                                           '• **Match Control** - Create match-specific tickets\n' +
                                           '• **Room Control** - Create room management tickets\n' +
                                           '• **Support Control** - Create support tickets\n' +
                                           '• **Custom Control** - Create custom ticket types',
                                    inline: false 
                                },
                                
                                // Organization
                                { 
                                    name: '📁 Organization',
                                    value: '• Each ticket type has its own category\n' +
                                           '• Closed tickets move to type-specific closed categories\n' +
                                           '• Transcripts saved to type-specific logs channels',
                                    inline: false 
                                }
                            );
                        break;
                }
                
                // Add back button
                const backButton = new ButtonBuilder()
                    .setCustomId('help_back')
                    .setLabel('Back to Main Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️');
                    
                const row = new ActionRowBuilder().addComponents(backButton);
                
                await interaction.update({
                    embeds: [helpEmbed],
                    components: [row]
                });
                return;
            }
            
            if (customId.startsWith('select_channel_')) {
                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[2];
                    
                    // Get the selected channel ID
                    const channelId = interaction.values[0];
                    const channel = await interaction.guild.channels.fetch(channelId);
                    
                    if (!channel) {
                        await interaction.update({
                            content: 'Selected channel no longer exists. Please try again.',
                            components: []
                        });
                        return;
                    }
                    
                    // Get the ticket to determine the ticket type
                    const ticket = await client.tickets.db.getTicket(ticketId);
                    if (!ticket) {
                        await interaction.update({
                            content: 'Ticket not found or has been deleted.',
                            components: []
                        });
                        return;
                    }
                    
                    const ticketType = ticket.type;
                    
                    // Create a confirmation button
                    const confirmButton = new ButtonBuilder()
                        .setCustomId(`confirm_transcript_${ticketId}_${channelId}`)
                        .setLabel('Confirm Transcription')
                        .setStyle(ButtonStyle.Success);
                        
                    const cancelButton = new ButtonBuilder()
                        .setCustomId(`cancel_transcript_${ticketId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary);
                        
                    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
                    
                    // Update the message with confirmation buttons
                    await interaction.update({
                        content: ticketType === 'support' ?
                            `Send ticket transcript to #${channel.name}?` :
                            `Send ${ticketType} transcript to #${channel.name}?`,
                        components: [row]
                    });
                } catch (error) {
                    console.error('Error handling channel selection:', error);
                    await interaction.update({
                        content: `Failed to process channel selection: ${error.message}`,
                        components: []
                    });
                }
            }
        }
        else {
            console.log(`Unhandled interaction type: ${interaction.type}`);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        
        // Try to respond to the interaction if possible
        try {
            const canReply = interaction.reply && typeof interaction.reply === 'function';
            const canEditReply = interaction.editReply && typeof interaction.editReply === 'function';
            
            if (canReply && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request. Please try again later.',
                    ephemeral: true
                });
            } else if (canEditReply && interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: 'An error occurred while processing your request. Please try again later.'
                });
            }
        } catch (replyError) {
            console.error('Error sending error response:', replyError);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Handle cleanup
async function cleanup() {
    console.log('Cleaning up...');
    if (client.tickets && client.tickets.db) {
        await client.tickets.db.close();
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

client.login(token); 