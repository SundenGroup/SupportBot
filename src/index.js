const { Client, GatewayIntentBits, Collection, Events, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
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

// Event handlers
client.once('ready', async () => {
    try {
        await client.tickets.init(); // Initialize ticket manager
        console.log(`Logged in as ${client.user.tag}`);
    } catch (error) {
        console.error('Failed to initialize:', error);
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
            const [action, ticketId] = interaction.customId.split('_');
            
            if (action === 'create') {
                const type = ticketId; // match, room, or support
                
                // Create and show modal for channel name input
                const modal = new ModalBuilder()
                    .setCustomId(`create_${type}_modal`)
                    .setTitle(`Create ${type.charAt(0).toUpperCase() + type.slice(1)}`);

                const nameInput = new TextInputBuilder()
                    .setCustomId('name_input')
                    .setLabel(`Enter ${type} name`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Enter a name for your ${type}`)
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(32);

                const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
                modal.addComponents(firstActionRow);

                await interaction.showModal(modal);
            } else if (action === 'transcribe') {
                // Check if user has admin permissions
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });
                
                try {
                    await client.tickets.transcribeTicket(ticketId, interaction.channel);
                    
                    // Generate and send transcript
                    const transcript = await client.tickets.getTranscript(ticketId);
                    
                    // Create and send transcript file
                    const buffer = Buffer.from(transcript, 'utf8');
                    const attachment = new AttachmentBuilder(buffer, {
                        name: `transcript-${ticketId}.txt`
                    });
                    
                    await interaction.editReply({
                        content: 'Ticket transcribed successfully!',
                        files: [attachment],
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error handling transcribe button:', error);
                    await interaction.editReply({
                        content: `Failed to transcribe ticket: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            const [action, type] = interaction.customId.split('_');
            
            if (action === 'create') {
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