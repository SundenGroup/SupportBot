const https = require('https');
const { clientId, token } = require('./config.json');

// These are the only commands we want to register
const commands = [
  {
    name: "close",
    description: "Close the current ticket and move it to the appropriate closed category"
  },
  {
    name: "rename",
    description: "Rename the current ticket",
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
    name: "reopen",
    description: "Reopen a closed ticket"
  },
  {
    name: "delete",
    description: "Delete the current ticket and generate a transcript"
  },
  {
    name: "add",
    description: "Add a user to the current ticket",
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
    name: "addrole",
    description: "Add a role to the current ticket",
    options: [
      {
        type: 8, // ROLE
        name: "role",
        description: "Role to add to the ticket",
        required: true
      }
    ]
  },
  {
    name: "help",
    description: "Shows information about all bot commands and features"
  },
  {
    name: "onboarding",
    description: "Start the onboarding process to learn how to set up and use the ticket system",
    default_member_permissions: "32" // MANAGE_GUILD permission
  },
  {
    name: "create-control",
    description: "Create a new main control room (Clutch Support Admin role required)"
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
      
      // Log options for commands that have them
      if (cmd.options && cmd.options.length > 0) {
        console.log('  Options:');
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