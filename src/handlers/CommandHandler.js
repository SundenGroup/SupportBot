const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
    }

    registerCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            this.commands.set(command.data.name, command);
        }
    }
}

module.exports = CommandHandler; 