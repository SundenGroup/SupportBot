const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { generateTranscript } = require('../utils/transcriptGenerator');
const Database = require('../database/Database');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

class TicketManager {
    constructor(client) {
        this.client = client;
        this.activeTickets = new Map();
        this.db = null;
        this.initialized = false;
        this.CONTROL_CHANNEL_NAME = '🎮-control-room';
        console.log('TicketManager constructor called');
    }

    async init() {
        if (this.initialized) {
            console.log('TicketManager already initialized');
            return;
        }
        
        console.log('Initializing TicketManager...');
        try {
            this.db = new Database();
            console.log('Database instance created');
            
            await this.db.init();
            console.log('Database initialized');
            
            await this.loadActiveTickets();
            console.log('Active tickets loaded');
            
            await this.setupControlRooms();
            this.initialized = true;
            console.log('TicketManager initialization complete');
        } catch (error) {
            console.error('Failed to initialize TicketManager:', error);
            throw error;
        }
    }

    async loadActiveTickets() {
        try {
            console.log('Loading active tickets...');
            
            // Verify database state
            console.log('Verifying database state...');
            const allTickets = await this.db.verifyDatabase();
            console.log(`Total tickets in database: ${allTickets.length}`);
            
            // Load active tickets
            const tickets = await this.db.getActiveTickets();
            console.log(`Found ${tickets.length} active tickets in database`);
            
            for (const ticket of tickets) {
                try {
                    const channel = await this.client.channels.fetch(ticket.channelId);
                    if (channel) {
                        console.log(`Loading active ticket: ${ticket.id} (${ticket.name})`);
                        this.activeTickets.set(ticket.id, ticket);
                    } else {
                        console.log(`Channel for ticket ${ticket.id} no longer exists, marking as closed`);
                        await this.db.updateTicket(ticket.id, { 
                            status: 'closed',
                            closed_at: Date.now(),
                            closed_by: 'system'
                        });
                    }
                } catch (error) {
                    console.error(`Error loading ticket ${ticket.id}:`, error);
                    if (error.code === 10003) {
                        await this.db.updateTicket(ticket.id, { 
                            status: 'closed',
                            closed_at: Date.now(),
                            closed_by: 'system'
                        });
                    }
                }
            }
            
            console.log(`Successfully loaded ${this.activeTickets.size} active tickets`);
        } catch (error) {
            console.error('Error loading active tickets:', error);
            throw error;
        }
    }

    async createTicket(options) {
        if (!this.initialized) await this.init();
        
        const { guild, creator, type, name } = options;
        
        try {
            console.log('Creating ticket with options:', { guild: guild.id, creator: creator.id, type, name });
            const ticketId = Date.now().toString(36);
            const channelName = `${type}-${name}`;

            let category = guild.channels.cache.find(c => c.name === 'Tickets' && c.type === ChannelType.GuildCategory);
            if (!category) {
                category = await guild.channels.create({
                    name: 'Tickets',
                    type: ChannelType.GuildCategory
                });
            }

            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: creator.id,
                        allow: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            });

            const ticketData = {
                id: ticketId,
                guildId: guild.id,
                channelId: channel.id,
                creatorId: creator.id,
                type,
                name,
                createdAt: Date.now(),
                status: 'open'
            };

            console.log('Saving ticket data:', ticketData);
            await this.db.saveTicket(ticketData);
            await this.db.addParticipant(ticketId, creator.id, 'creator');
            await this.db.logAction(ticketId, 'create', creator.id, { type, name });

            this.activeTickets.set(ticketId, ticketData);

            // Add transcript button for admins
            const transcribeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`transcribe_${ticketId}`)
                        .setLabel('Transcribe Ticket')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

            // Send button with admin-only visibility
            await channel.send({
                content: 'Admin Controls:',
                components: [transcribeButton],
                // Only show to users with MANAGE_CHANNELS permission
                flags: MessageFlags.Ephemeral
            });

            return ticketData;
        } catch (error) {
            console.error('Error creating ticket:', error);
            throw error;
        }
    }

    async closeTicket(ticketId, closedBy) {
        if (!this.initialized) await this.init();
        
        try {
            console.log('Attempting to close ticket:', ticketId);
            const ticket = await this.db.getTicket(ticketId);
            
            if (!ticket) {
                console.error('Ticket not found:', ticketId);
                throw new Error('Ticket not found');
            }

            console.log('Found ticket to close:', ticket);

            // Fetch the channel
            const channel = await this.client.channels.fetch(ticket.channelId)
                .catch(err => {
                    console.error('Error fetching channel:', err);
                    return null;
                });

            // Generate transcript if channel exists
            let transcript = null;
            if (channel) {
                try {
                    console.log('Generating transcript for channel:', channel.id);
                    transcript = await generateTranscript(channel);
                    
                    // Delete the channel
                    console.log('Deleting channel:', channel.id);
                    await channel.delete()
                        .catch(err => {
                            console.error('Error deleting channel:', err);
                            throw new Error('Failed to delete channel');
                        });
                    console.log('Channel deleted successfully');
                } catch (error) {
                    console.error('Error during channel cleanup:', error);
                    throw error;
                }
            }

            // Update ticket status in database
            console.log('Updating ticket status in database');
            await this.db.updateTicket(ticket.id, {
                status: 'closed',
                closed_at: Date.now(),
                closed_by: closedBy.id
            });

            // Remove from active tickets map
            this.activeTickets.delete(ticket.id);
            
            console.log('Ticket closed successfully');
            return transcript;
        } catch (error) {
            console.error('Error in closeTicket:', error);
            throw error;
        }
    }

    async renameTicket(ticketId, newName, updatedBy) {
        if (!this.initialized) await this.init();
        
        try {
            console.log(`Renaming ticket ${ticketId} to ${newName}`);
            const ticket = await this.db.getTicket(ticketId);
            
            if (!ticket) {
                throw new Error('Ticket not found');
            }

            const channel = await this.client.channels.fetch(ticket.channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            // Update channel name with simplified format
            const newChannelName = `${ticket.type}-${newName}`;
            await channel.setName(newChannelName);

            // Update database
            await this.db.updateTicket(ticket.id, {
                name: newName
            });

            // Update cache
            ticket.name = newName;
            this.activeTickets.set(ticket.id, ticket);

            return ticket;
        } catch (error) {
            console.error('Error renaming ticket:', error);
            throw error;
        }
    }

    async setupControlRooms() {
        console.log('Setting up control rooms for all guilds...');
        
        for (const [guildId, guild] of this.client.guilds.cache) {
            try {
                await this.setupGuildControlRoom(guild);
            } catch (error) {
                console.error(`Failed to setup control room for guild ${guildId}:`, error);
            }
        }
    }

    async setupGuildControlRoom(guild) {
        console.log(`Setting up control room for guild: ${guild.name}`);
        
        // Check if control room already exists
        let controlChannel = guild.channels.cache.find(
            channel => channel.name === this.CONTROL_CHANNEL_NAME
        );

        if (!controlChannel) {
            console.log('Creating new control room channel');
            controlChannel = await guild.channels.create({
                name: this.CONTROL_CHANNEL_NAME,
                type: ChannelType.GuildText,
                topic: 'Create and manage tickets, rooms, and matches',
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: this.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages
                        ]
                    }
                ]
            });

            // Send initial control room message with buttons
            await this.sendControlRoomMessage(controlChannel);
        }

        return controlChannel;
    }

    async sendControlRoomMessage(channel) {
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_match')
                    .setLabel('Create Match')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎮'),
                new ButtonBuilder()
                    .setCustomId('create_room')
                    .setLabel('Create Room')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🚪'),
                new ButtonBuilder()
                    .setCustomId('create_support')
                    .setLabel('Support Ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );

        const embed = new EmbedBuilder()
            .setTitle('Ticket Control Room')
            .setDescription('Click a button below to create a new ticket:')
            .setColor('#5865F2')
            .addFields(
                { name: '🎮 Match', value: 'Create a match coordination channel' },
                { name: '🚪 Room', value: 'Create a room management channel' },
                { name: '❓ Support', value: 'Create a support ticket' }
            );

        await channel.send({
            embeds: [embed],
            components: [buttons]
        });
    }

    async transcribeTicket(ticketId, channel) {
        try {
            console.log(`Transcribing ticket ${ticketId}`);
            
            // Fetch all messages
            const messages = await channel.messages.fetch({ limit: 100 });
            const sortedMessages = Array.from(messages.values()).reverse();
            
            // Save to database
            await this.db.saveTicketMessages(ticketId, sortedMessages);
            
            return true;
        } catch (error) {
            console.error('Error transcribing ticket:', error);
            throw error;
        }
    }

    async getTranscript(ticketId) {
        try {
            const messages = await this.db.getTicketTranscript(ticketId);
            const ticket = await this.db.getTicket(ticketId);
            
            // Format transcript
            let transcript = `Transcript for ${ticket.type}-${ticket.name}\n`;
            transcript += `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n\n`;
            
            for (const msg of messages) {
                const timestamp = new Date(msg.timestamp).toLocaleString();
                transcript += `[${timestamp}] ${msg.author_name}: ${msg.content}\n`;
                
                if (msg.attachments) {
                    const attachments = JSON.parse(msg.attachments);
                    for (const url of attachments) {
                        transcript += `[Attachment: ${url}]\n`;
                    }
                }
                transcript += '\n';
            }
            
            return transcript;
        } catch (error) {
            console.error('Error getting transcript:', error);
            throw error;
        }
    }
}

module.exports = TicketManager; 