const https = require('https');
const { clientId, token } = require('./config.json');

// These are the only commands we want to register
const commands = [
  {
    name: "ticket",
    description: "Manage tickets",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "create",
        description: "Create a new ticket",
        options: [
          {
            type: 3, // STRING
            name: "type",
            description: "Type of ticket",
            required: true,
            choices: [
              { name: "Support", value: "support" },
              { name: "Match", value: "match" },
              { name: "Room", value: "room" }
            ]
          },
          {
            type: 3, // STRING
            name: "name",
            description: "Name for the ticket",
            required: true
          }
        ]
      },
      {
        type: 1, // SUB_COMMAND
        name: "close",
        description: "Close a ticket"
      },
      {
        type: 1, // SUB_COMMAND
        name: "rename",
        description: "Rename a ticket",
        options: [
          {
            type: 3, // STRING
            name: "name",
            description: "New name for the ticket",
            required: true
          }
        ]
      },
      {
        type: 1, // SUB_COMMAND
        name: "add",
        description: "Add a user to a ticket",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to add to the ticket",
            required: true
          }
        ]
      },
      {
        type: 1, // SUB_COMMAND
        name: "reopen",
        description: "Reopen a closed ticket"
      }
    ]
  },
  {
    name: "setup-support",
    description: "Creates a dedicated support ticket channel",
    default_member_permissions: "16",
    options: [
      {
        type: 7, // CHANNEL
        name: "channel",
        description: "The channel to set up as a support ticket channel (defaults to creating a new channel)",
        channel_types: [0]
      },
      {
        type: 3, // STRING
        name: "title",
        description: "The title for the support embed"
      },
      {
        type: 3, // STRING
        name: "description",
        description: "The description for the support embed"
      }
    ]
  }
];

// Register commands directly
const registerCommands = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v9/applications/${clientId}/commands`,
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const registeredCommands = JSON.parse(data);
            resolve(registeredCommands);
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(JSON.stringify(commands));
    req.end();
  });
};

// Main function
const main = async () => {
  try {
    console.log('Starting complete commands reset...');
    console.log('This will reset ALL application commands and register only:');
    commands.forEach(cmd => {
      console.log(`- ${cmd.name}`);
    });
    
    console.log('\nRegistering commands with Discord API...');
    const registeredCommands = await registerCommands();
    console.log(`Successfully registered ${registeredCommands.length} commands:`);
    registeredCommands.forEach(cmd => {
      console.log(`- ${cmd.name} (ID: ${cmd.id})`);
      
      // Log subcommands for the ticket command
      if (cmd.name === 'ticket') {
        console.log('  Subcommands:');
        cmd.options.forEach(option => {
          console.log(`  - ${option.name}`);
        });
      }
    });
    
    console.log('\nCommand reset completed successfully!');
    console.log('Discord may take up to an hour to fully refresh its command cache.');
    console.log('Please restart your bot for the changes to take effect.');
  } catch (error) {
    console.error('Error resetting commands:', error);
  }
};

main(); 