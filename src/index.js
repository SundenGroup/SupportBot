const { Client, GatewayIntentBits, Collection, Events, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder, ChannelType } = require('discord.js');
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
        
        // Create support channels in all guilds
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await createSupportChannel(guild);
            } catch (error) {
                console.error(`Error creating support channel in ${guild.name}:`, error);
            }
        }
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
});

// Handle guild join event
client.on(Events.GuildCreate, async (guild) => {
    try {
        console.log(`Joined new guild: ${guild.name}`);
        await createSupportChannel(guild);
    } catch (error) {
        console.error(`Error creating support channel in new guild ${guild.name}:`, error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
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
            
            if (customId.startsWith('create_')) {
                const type = customId.split('_')[1]; // match, room, or support
                
                // Create and show modal for channel name input
                const modal = new ModalBuilder()
                    .setCustomId(`create_${type}_modal`)
                    .setTitle(`Create ${type.charAt(0).toUpperCase() + type.slice(1)}`);

                const nameInput = new TextInputBuilder()
                    .setCustomId('name_input')
                    .setLabel(`Enter ${type} name`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Enter a name for your ${type} channel`)
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(32);

                const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
                modal.addComponents(firstActionRow);

                await interaction.showModal(modal);
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
                    
                    // Generate transcript without saving messages (which causes the UNIQUE constraint error)
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const transcript = `Transcript for ${ticket.type}-${ticket.name}\n` +
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
                        content: `Transcript for ticket #${ticketId} (requested by ${interaction.user.tag}):`,
                        files: [attachment]
                    });
                    
                    // Notify the user
                    await interaction.editReply({
                        content: `Ticket transcribed successfully! Transcript sent to <#${channel.id}>.`,
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

                try {
                    // Extract ticket ID from the custom ID
                    const ticketId = customId.split('_')[1];
                    
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
                        await interaction.reply({
                            content: 'No available channels found where you can send the transcript.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Create a select menu for channels (max 25 options as per Discord's limit)
                    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
                    
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
                    await interaction.reply({
                        content: 'Select a channel to send the transcript to:',
                        components: [row],
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error creating channel select menu:', error);
                    await interaction.reply({
                        content: `Failed to create channel selection: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            
            if (customId.startsWith('create_')) {
                const [action, type] = customId.split('_');
                
                await interaction.deferReply({ ephemeral: true });
                const name = interaction.fields.getTextInputValue('name_input');
                
                try {
                    const ticket = await client.tickets.createTicket({
                        guild: interaction.guild,
                        creator: interaction.user,
                        type,
                        name
                    });

                    await interaction.editReply({
                        content: `${type.charAt(0).toUpperCase() + type.slice(1)} channel created: <#${ticket.channelId}>`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error handling modal submission:', error);
                    await interaction.editReply({
                        content: `Failed to create ${type}: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        }
        else if (interaction.isStringSelectMenu()) {
            // Handle select menu interactions
            const customId = interaction.customId;
            
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
                        content: `Send transcript to #${channel.name}?`,
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
    } catch (error) {
        console.error('Error handling interaction:', error);
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