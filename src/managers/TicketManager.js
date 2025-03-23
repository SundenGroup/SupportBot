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
        this.CONTROL_CHANNEL_NAME = 'control-room';
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
                    const channel = await this.client.channels.fetch(ticket.channelId).catch(err => {
                        console.error(`Error fetching channel for ticket ${ticket.id}:`, err);
                        return null;
                    });
                    
                    if (channel) {
                        console.log(`Loading active ticket: ${ticket.id} (${ticket.name})`);
                        this.activeTickets.set(ticket.id, ticket);
                    } else {
                        console.log(`Channel for ticket ${ticket.id} not found or no access, marking as closed`);
                        await this.db.updateTicket(ticket.id, { 
                            status: 'closed',
                            closed_at: Date.now(),
                            closed_by: 'system'
                        });
                    }
                } catch (error) {
                    console.error(`Error loading ticket ${ticket.id}:`, error);
                    
                    // If the error is Missing Access or the channel doesn't exist,
                    // mark the ticket as closed
                    if (error.code === 10003 || error.code === 50001) {
                        console.log(`Channel for ticket ${ticket.id} is inaccessible (code ${error.code}), marking as closed`);
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
        
        const { guild, creator, type, name, description } = options;
        
        try {
            console.log('Creating control channel with options:', { guild: guild.id, creator: creator.id, type, name });
            const ticketId = Date.now().toString(36);
            
            // Use consistent naming format for control rooms vs tickets
            const channelName = name === 'control' 
                ? `${type}-control` // Control room format without hyphen prefix
                : `${type}-${name}`; // Ticket format without 'ticket' in the name

            // Get category name based on ticket type
            let categoryName;
            switch (type) {
                case 'match':
                    categoryName = 'Match Management';
                    break;
                case 'support':
                    categoryName = 'Support Tickets';
                    break;
                case 'custom':
                    categoryName = 'Custom Management';
                    break;
                default:
                    categoryName = `${type.charAt(0).toUpperCase() + type.slice(1)} Management`;
            }

            // Find or create the category
            let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
            if (!category) {
                category = await guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory
                });
            }

            // Find the "Clutch Support Admin" role
            const adminRole = guild.roles.cache.find(role => role.name === 'Clutch Support Admin');
            
            // Set up permission overwrites, restricting control rooms to admin role if it exists
            const permissionOverwrites = [];
            
            if (name === 'control') {
                // This is a control room, so restrict access to admin role
                permissionOverwrites.push({
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel] // Hide from everyone by default
                });
                
                // Bot needs permissions
                permissionOverwrites.push({
                    id: this.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages
                    ]
                });
                
                // If admin role exists, add permission for that role
                if (adminRole) {
                    permissionOverwrites.push({
                        id: adminRole.id,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.SendMessages]
                    });
                    console.log(`Granting ${type}-control access to "Clutch Support Admin" role`);
                } else {
                    console.log(`"Clutch Support Admin" role not found, ${type}-control will only be visible to the bot`);
                }
            } else {
                // This is a regular ticket, use standard permissions
                permissionOverwrites.push({
                    id: guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                });
                
                permissionOverwrites.push({
                    id: this.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages
                    ]
                });
            }

            // Create the channel
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category,
                topic: description || (type === 'support' ? 
                    `Create a ${type} ticket here` : 
                    `Create a ${type} room here`),
                permissionOverwrites: permissionOverwrites
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
            await this.db.logAction(ticketId, 'create', creator.id, { type, name, description });

            this.activeTickets.set(ticketId, ticketData);

            // Create the ticket button for all control channels (including custom types)
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`create_${type}_ticket`)
                        .setLabel(type === 'support' ? 
                            `Open ${type.charAt(0).toUpperCase() + type.slice(1)} Ticket Channel` : 
                            `Open ${type.charAt(0).toUpperCase() + type.slice(1)} Room`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );
            
            // Create the embed
            const embed = new EmbedBuilder()
                .setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Control Room`)
                .setDescription(description || (type === 'support' ? 
                    `Need a ${type} ticket channel? Click the button below to open a ${type} ticket channel. Our team will assist you as soon as possible.` :
                    `Need a ${type} room? Click the button below to open a ${type} room. Our team will assist you as soon as possible.`))
                .setColor('#5865F2')
                .setFooter({ text: type === 'support' ? 
                    `${type.charAt(0).toUpperCase() + type.slice(1)} Ticket Channel System` :
                    `${type.charAt(0).toUpperCase() + type.slice(1)} Management System` })
                .setTimestamp();
            
            // Send the message with the button
            await channel.send({
                embeds: [embed],
                components: [button]
            });

            return ticketData;
        } catch (error) {
            console.error('Error creating control channel:', error);
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

        // Find the "Clutch Support Admin" role
        const adminRole = guild.roles.cache.find(role => role.name === 'Clutch Support Admin');
        
        if (adminRole) {
            console.log(`Found "Clutch Support Admin" role with ID: ${adminRole.id}`);
        } else {
            console.log(`"Clutch Support Admin" role not found in guild ${guild.name}`);
        }

        if (!controlChannel) {
            console.log('Creating new control room channel');
            
            // Set up permission overwrites, restricting access to admin role if it exists
            const permissionOverwrites = [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel] // Hide from everyone by default
                },
                {
                    id: this.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages
                    ]
                }
            ];
            
            // If admin role exists, add permission for that role
            if (adminRole) {
                permissionOverwrites.push({
                    id: adminRole.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                });
                console.log(`Granting control room access to "Clutch Support Admin" role`);
            }

            controlChannel = await guild.channels.create({
                name: this.CONTROL_CHANNEL_NAME,
                type: ChannelType.GuildText,
                topic: 'Create and manage tickets, rooms, and matches',
                permissionOverwrites: permissionOverwrites
            });

            // Send initial control room message with buttons
            await this.sendControlRoomMessage(controlChannel);
        } else {
            // Update permissions for existing control room
            console.log('Updating permissions for existing control room');
            
            // Update permissions to restrict to admin role
            await controlChannel.permissionOverwrites.edit(guild.id, {
                ViewChannel: false // Hide from everyone
            });
            
            // If admin role exists, grant permission
            if (adminRole) {
                await controlChannel.permissionOverwrites.edit(adminRole.id, {
                    ViewChannel: true,
                    SendMessages: false
                });
                console.log(`Updated permissions for "Clutch Support Admin" role in control room`);
            }
        }

        return controlChannel;
    }

    async sendControlRoomMessage(channel) {
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_match')
                    .setLabel('Create Match Channel')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎮'),
                new ButtonBuilder()
                    .setCustomId('create_support')
                    .setLabel('Create Support Ticket Channel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );
        
        const customButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_custom')
                    .setLabel('Create Custom Control Room')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚙️')
            );

        const embed = new EmbedBuilder()
            .setTitle('Control Room')
            .setDescription('Click a button below to create a new management channel:')
            .setColor('#5865F2')
            .addFields(
                { name: '🎮 Match Management', value: 'Create a match coordination channel' },
                { name: '❓ Support Ticket Channel', value: 'Create a support ticket channel' },
                { name: '⚙️ Custom Management', value: 'Create a custom control room with your own type' }
            );

        await channel.send({
            embeds: [embed],
            components: [buttons, customButton]
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

    async getLogChannel(guild, ticketType) {
        try {
            // Get category name based on ticket type
            let categoryName;
            switch (ticketType) {
                case 'match':
                    categoryName = 'Match Logs';
                    break;
                case 'support':
                    categoryName = 'Support Logs';
                    break;
                case 'custom':
                    categoryName = 'Custom Logs';
                    break;
                default:
                    categoryName = `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Logs`;
            }
            
            // Find or create the specific logs category
            let logsCategory = guild.channels.cache.find(
                c => c.name === categoryName && c.type === ChannelType.GuildCategory
            );
            
            if (!logsCategory) {
                logsCategory = await guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.SendMessages],
                            allow: [PermissionFlagsBits.ViewChannel]
                        }
                    ]
                });
                console.log(`Created new logs category: ${categoryName}`);
            }
            
            // Format channel name based on ticket type
            const logChannelName = `${ticketType}-logs`;
            
            // Find or create the log channel
            let logChannel = guild.channels.cache.find(
                c => c.name === logChannelName && 
                c.type === ChannelType.GuildText &&
                c.parentId === logsCategory.id
            );
            
            if (!logChannel) {
                logChannel = await guild.channels.create({
                    name: logChannelName,
                    type: ChannelType.GuildText,
                    parent: logsCategory,
                    topic: `Transcripts for ${ticketType} tickets`,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.SendMessages],
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
                        },
                        {
                            id: this.client.user.id,
                            allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
                        }
                    ]
                });
                
                console.log(`Created log channel: ${logChannelName} in category ${categoryName}`);
            }
            
            return logChannel;
        } catch (error) {
            console.error('Error getting log channel:', error);
            throw error;
        }
    }

    async addUserToTicket(ticketId, userId, addedBy) {
        if (!this.initialized) await this.init();
        
        try {
            console.log(`Adding user ${userId} to ticket ${ticketId}`);
            const ticket = await this.db.getTicket(ticketId);
            
            if (!ticket) {
                throw new Error('Ticket not found');
            }

            const channel = await this.client.channels.fetch(ticket.channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            // Get the user
            const user = await this.client.users.fetch(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Add permission overwrite to the channel using edit
            await channel.permissionOverwrites.edit(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            // Add the user to the ticket participants
            await this.db.addParticipant(ticketId, userId, 'added');
            await this.db.logAction(ticketId, 'add_user', addedBy, { added_user: userId });
            
            // Send notification to the channel
            const adder = await this.client.users.fetch(addedBy);
            await channel.send({
                content: `${adder} added ${user} to this ticket.`
            });

            return true;
        } catch (error) {
            console.error('Error adding user to ticket:', error);
            throw error;
        }
    }

    async addRoleToTicket(ticketId, roleId, roleName, addedBy) {
        if (!this.initialized) await this.init();
        
        try {
            console.log(`Adding role ${roleId} (${roleName}) to ticket ${ticketId}`);
            const ticket = await this.db.getTicket(ticketId);
            
            if (!ticket) {
                throw new Error('Ticket not found');
            }

            const channel = await this.client.channels.fetch(ticket.channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            // Add permission overwrite to the channel using edit
            await channel.permissionOverwrites.edit(roleId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            // Log the action
            await this.db.logAction(ticketId, 'add_role', addedBy, { added_role: roleId, role_name: roleName });
            
            // Send notification to the channel
            const adder = await this.client.users.fetch(addedBy);
            await channel.send({
                content: `${adder} added role **${roleName}** to this ticket.`
            });

            return true;
        } catch (error) {
            console.error('Error adding role to ticket:', error);
            throw error;
        }
    }

    async reopenTicket(ticketId, reopenedBy) {
        if (!this.initialized) await this.init();
        
        try {
            console.log(`Reopening ticket ${ticketId}`);
            const ticket = await this.db.getTicket(ticketId);
            
            if (!ticket) {
                throw new Error('Ticket not found');
            }
            
            if (ticket.status !== 'closed') {
                throw new Error('Ticket is not closed and cannot be reopened');
            }

            const channel = await this.client.channels.fetch(ticket.channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            // Get the original category name based on ticket type
            let categoryName;
            switch (ticket.type) {
                case 'match':
                    categoryName = 'Match Management';
                    break;
                case 'support':
                    categoryName = 'Support Tickets';
                    break;
                default:
                    categoryName = `${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)} Management`;
            }
            
            // Find or create the original category
            let category = channel.guild.channels.cache.find(
                c => c.name === categoryName && c.type === ChannelType.GuildCategory
            );
            
            if (!category) {
                category = await channel.guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory
                });
            }
            
            // Move the channel back to the original category
            await channel.setParent(category.id);
            
            // Update permissions to allow sending messages again
            await channel.permissionOverwrites.edit(channel.guild.id, {
                SendMessages: null // Remove the override
            });
            
            // Add admin controls with add user and close ticket buttons
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
                        .setLabel(ticket.type === 'support' ? 
                            'Close Ticket' : 
                            `Close ${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}`)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );
            
            // Send new control buttons
            await channel.send({
                content: ticket.type === 'support' ? 
                    'Ticket Controls:' : 
                    `${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)} Controls:`,
                components: [adminButtons]
            });
            
            // Update ticket status in database
            await this.db.updateTicket(ticket.id, {
                status: 'open',
                reopened_at: Date.now(),
                reopened_by: reopenedBy.id
            });
            
            // Log the action
            await this.db.logAction(ticket.id, 'reopen', reopenedBy.id, { action: 'reopened_ticket' });
            
            // Find and delete any closed ticket messages with reopen buttons
            try {
                const messages = await channel.messages.fetch({ limit: 10 });
                const reopenMessages = messages.filter(msg => 
                    msg.author.id === this.client.user.id && 
                    msg.content.includes('This ticket has been closed') &&
                    msg.components.length > 0 &&
                    msg.components[0].components.some(c => c.customId && c.customId.startsWith('reopen_ticket_'))
                );
                
                for (const [id, message] of reopenMessages) {
                    await message.delete().catch(err => console.error('Error deleting reopen message:', err));
                }
            } catch (deleteErr) {
                console.error('Error finding/deleting reopen messages:', deleteErr);
            }
            
            // Send a notification in the channel
            await channel.send({
                content: ticket.type === 'support' ?
                    `🔓 This ticket has been re-opened by ${reopenedBy}.` :
                    `🔓 This ${ticket.type} has been re-opened by ${reopenedBy}.`
            });
            
            return ticket;
        } catch (error) {
            console.error('Error reopening ticket:', error);
            throw error;
        }
    }
}

module.exports = TicketManager; 