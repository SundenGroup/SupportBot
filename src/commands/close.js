const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close the current ticket and move it to the appropriate closed category'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get the ticket based on the channel
            const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in a ticket channel.',
                    ephemeral: true
                });
                return;
            }
            
            // Check if user has permission (creator or admin)
            const isCreator = interaction.user.id === ticket.creatorId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
            
            if (!isCreator && !isAdmin) {
                await interaction.editReply({
                    content: 'You do not have permission to close this ticket.',
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
            await interaction.channel.setParent(closedCategory.id);
            
            // Lock the channel (prevent everyone from sending messages)
            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                SendMessages: false
            });
            
            // Update ticket status in database
            await interaction.client.tickets.db.updateTicket(ticket.id, {
                status: 'closed',
                closed_at: Date.now(),
                closed_by: interaction.user.id
            });
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'close', interaction.user.id, { action: 'moved_to_closed' });
            
            // Find and remove the control buttons message
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const controlMessage = messages.find(msg => 
                msg.author.id === interaction.client.user.id && 
                (msg.content === 'Ticket Controls:' || msg.content.endsWith(' Controls:')) &&
                msg.components.length > 0
            );
            
            if (controlMessage) {
                await controlMessage.delete().catch(err => console.error('Error deleting control message:', err));
            }
            
            // Send a message in the channel
            await interaction.channel.send({
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
                const allMessages = await interaction.channel.messages.fetch({ limit: 100 });
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
                    name: `transcript-${ticket.id}.txt`
                });
                
                // Try to get the appropriate log channel for this ticket type
                let logChannel = null;
                
                try {
                    logChannel = await interaction.client.tickets.getLogChannel(interaction.guild, ticketType);
                    
                    // Get category name for messaging
                    let logsCategoryName;
                    switch (ticketType) {
                        case 'match':
                            logsCategoryName = 'Match Logs';
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
                                `Transcript for ticket #${ticket.name} (ID: ${ticket.id}) - Closed by ${interaction.user.tag}:` :
                                `Transcript for ${ticketType} #${ticket.name} (ID: ${ticket.id}) - Closed by ${interaction.user.tag}:`,
                            files: [attachment]
                        });
                        
                        await interaction.followUp({
                            content: ticketType === 'support' ?
                                `Ticket closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.` :
                                `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed and transcribed successfully. A transcript has been saved to the ${ticketType}-logs channel in the ${logsCategoryName} category.`,
                            ephemeral: true
                        });
                        return;
                    }
                } catch (logError) {
                    console.error('Error getting log channel:', logError);
                    // Fall through to manual attachment if automatic fails
                }
                
                // If no log channel is found, just attach the transcript to the followup
                await interaction.followUp({
                    content: ticketType === 'support' ?
                        `Ticket closed successfully. No logs channel found, so here is the transcript:` :
                        `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} closed successfully. No logs channel found, so here is the transcript:`,
                    files: [attachment],
                    ephemeral: true
                });
                
            } catch (transcriptError) {
                console.error('Error generating transcript:', transcriptError);
                await interaction.followUp({
                    content: `Failed to generate transcript: ${transcriptError.message}`,
                    ephemeral: true
                });
            }
            
        } catch (error) {
            console.error('Error closing ticket:', error);
            try {
                await interaction.editReply({
                    content: `Failed to close ticket: ${error.message}`,
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    }
}; 