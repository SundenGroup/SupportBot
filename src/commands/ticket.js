const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manage tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close a ticket'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription('Rename a ticket')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('New name for the ticket')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reopen')
                .setDescription('Reopen a closed ticket'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user or role from the ticket')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from the ticket'))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to remove from the ticket'))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'close':
                    await handleTicketClose(interaction);
                    break;
                case 'rename':
                    await handleTicketRename(interaction);
                    break;
                case 'reopen':
                    await handleTicketReopen(interaction);
                    break;
                case 'remove':
                    await handleTicketRemove(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown subcommand',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error executing ticket command:', error);
            await interaction.reply({
                content: `Failed to ${subcommand} ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

async function handleTicketClose(interaction) {
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

        console.log('Closing ticket:', ticket);
        const transcript = await interaction.client.tickets.closeTicket(ticket.id, interaction.user);

        if (transcript) {
            await interaction.editReply({
                content: 'Ticket closed successfully. Here is the transcript:',
                files: [transcript],
                ephemeral: true
            });
        } else {
            await interaction.editReply({
                content: 'Ticket closed successfully.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.editReply({
            content: `Failed to close ticket: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleTicketRename(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const newName = interaction.options.getString('name');
        const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
        
        if (!ticket) {
            await interaction.editReply({
                content: 'This command can only be used in a ticket channel.',
                ephemeral: true
            });
            return;
        }

        await interaction.client.tickets.renameTicket(ticket.id, newName, interaction.user);
        
        await interaction.editReply({
            content: `Ticket renamed to: ${newName}`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error renaming ticket:', error);
        await interaction.editReply({
            content: `Failed to rename ticket: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleTicketReopen(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        // Check if the current channel is a closed ticket
        const channel = interaction.channel;
        const ticket = await interaction.client.tickets.db.getTicketByChannel(channel.id);
        
        if (!ticket) {
            await interaction.editReply({
                content: 'This command can only be used in a ticket channel.',
                ephemeral: true
            });
            return;
        }
        
        if (ticket.status !== 'closed') {
            await interaction.editReply({
                content: 'This ticket is not closed. You can only reopen closed tickets.',
                ephemeral: true
            });
            return;
        }
        
        // Check if user has permission (creator or admin)
        const isCreator = interaction.user.id === ticket.creatorId;
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        
        if (!isCreator && !isAdmin) {
            await interaction.editReply({
                content: 'You do not have permission to re-open this ticket.',
                ephemeral: true
            });
            return;
        }

        // Use the ticket manager to reopen the ticket
        await interaction.client.tickets.reopenTicket(ticket.id, interaction.user);
        
        await interaction.editReply({
            content: `Ticket re-opened successfully.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error re-opening ticket:', error);
        await interaction.editReply({
            content: `Failed to re-open the ticket: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleTicketRemove(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        if (!user && !role) {
            await interaction.editReply({
                content: 'You must specify either a user or a role to remove.',
                ephemeral: true
            });
            return;
        }

        if (user && role) {
            await interaction.editReply({
                content: 'You can only remove either a user or a role, not both at once.',
                ephemeral: true
            });
            return;
        }

        // Check if the current channel is a ticket
        const channel = interaction.channel;
        const ticket = await interaction.client.tickets.db.getTicketByChannel(channel.id);
        
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
        const hasAdminRole = interaction.member.roles.cache.some(role => role.name === 'Clutch Support Admin');
        
        if (!isCreator && !isAdmin && !hasAdminRole) {
            await interaction.editReply({
                content: 'You do not have permission to remove users or roles from this ticket.',
                ephemeral: true
            });
            return;
        }

        if (user) {
            // Don't allow removing the creator
            if (user.id === ticket.creatorId) {
                await interaction.editReply({
                    content: 'You cannot remove the ticket creator.',
                    ephemeral: true
                });
                return;
            }

            // Remove user permissions
            await channel.permissionOverwrites.delete(user.id);
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'remove_user', interaction.user.id, { removed_user: user.id });
            
            await interaction.editReply({
                content: `Removed ${user} from the ticket.`,
                ephemeral: true
            });
        } else if (role) {
            // Remove role permissions
            await channel.permissionOverwrites.delete(role.id);
            
            // Log the action
            await interaction.client.tickets.db.logAction(ticket.id, 'remove_role', interaction.user.id, { removed_role: role.id });
            
            await interaction.editReply({
                content: `Removed role ${role} from the ticket.`,
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error removing user/role from ticket:', error);
        await interaction.editReply({
            content: `Failed to remove user/role from the ticket: ${error.message}`,
            ephemeral: true
        });
    }
} 