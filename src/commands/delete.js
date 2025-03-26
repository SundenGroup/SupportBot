const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete the current ticket and generate a transcript'),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get all tickets and find the one for this channel
            const tickets = await interaction.client.tickets.db.getTickets();
            const ticket = tickets.find(t => t.channelId === interaction.channel.id);
            
            if (!ticket) {
                await interaction.editReply({
                    content: 'This command can only be used in ticket channels.',
                    ephemeral: true
                });
                return;
            }

            // Check if user has permission (creator, admin, or Clutch Support Admin role)
            const isCreator = interaction.user.id === ticket.creatorId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
            const hasAdminRole = interaction.member.roles.cache.some(role => role.name === 'Clutch Support Admin');
            
            if (!isCreator && !isAdmin && !hasAdminRole) {
                await interaction.editReply({
                    content: 'You do not have permission to delete this ticket.',
                    ephemeral: true
                });
                return;
            }

            // Generate a transcript before deleting
            try {
                // Get all messages in the channel for the transcript
                const allMessages = await interaction.channel.messages.fetch({ limit: 100 });
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
                    name: `transcript-${ticket.id}.txt`
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
                            `Transcript for deleted ticket #${ticket.id} (${ticket.type}-${ticket.name}) - Deleted by ${interaction.user.tag}:` :
                            `Transcript for deleted ${ticket.type} #${ticket.id} (${ticket.type}-${ticket.name}) - Deleted by ${interaction.user.tag}:`,
                        files: [attachment]
                    });
                }
            } catch (transcriptError) {
                console.error('Error generating transcript before deletion:', transcriptError);
                // Continue with deletion even if transcript fails
            }
            
            // Delete the channel
            await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`);
            
            // Update ticket status in database
            await interaction.client.tickets.db.updateTicket(ticket.id, {
                status: 'deleted',
                closed_at: Date.now(),
                closed_by: interaction.user.id
            });
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'delete', interaction.user.id, { action: 'deleted' });
            
            // Remove from active tickets map
            interaction.client.tickets.activeTickets.delete(ticket.id);
            
        } catch (error) {
            console.error('Error deleting ticket:', error);
            await interaction.editReply({
                content: `Failed to delete the ticket: ${error.message}`,
                ephemeral: true
            });
        }
    },
}; 