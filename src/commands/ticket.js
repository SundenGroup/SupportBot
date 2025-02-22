const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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
                        .setRequired(true))),

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