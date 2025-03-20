const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manage tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of ticket')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Support', value: 'support' },
                            { name: 'Match', value: 'match' },
                            { name: 'Room', value: 'room' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name for the ticket')
                        .setRequired(true)))
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
                .setName('add')
                .setDescription('Add a user to a ticket')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to add to the ticket')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reopen')
                .setDescription('Reopen a closed ticket')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'create':
                    await handleTicketCreate(interaction);
                    break;
                case 'close':
                    await handleTicketClose(interaction);
                    break;
                case 'rename':
                    await handleTicketRename(interaction);
                    break;
                case 'add':
                    await handleTicketAddUser(interaction);
                    break;
                case 'reopen':
                    await handleTicketReopen(interaction);
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

async function handleTicketCreate(interaction) {
    const type = interaction.options.getString('type');
    const name = interaction.options.getString('name');

    await interaction.deferReply({ ephemeral: true });

    try {
        const ticket = await interaction.client.tickets.createTicket({
            guild: interaction.guild,
            creator: interaction.user,
            type,
            name
        });

        await interaction.editReply({
            content: `Ticket created successfully! Channel: <#${ticket.channelId}>`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Ticket creation error:', error);
        await interaction.editReply({
            content: `Failed to create ticket: ${error.message}`,
            ephemeral: true
        });
    }
}

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

async function handleTicketAddUser(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const user = interaction.options.getUser('user');
        const ticket = await interaction.client.tickets.db.getTicketByChannel(interaction.channel.id);
        
        if (!ticket) {
            await interaction.editReply({
                content: 'This command can only be used in a ticket channel.',
                ephemeral: true
            });
            return;
        }

        await interaction.client.tickets.addUserToTicket(ticket.id, user.id, interaction.user.id);
        
        await interaction.editReply({
            content: `User ${user.tag} added to ticket successfully.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error adding user to ticket:', error);
        await interaction.editReply({
            content: `Failed to add user to ticket: ${error.message}`,
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