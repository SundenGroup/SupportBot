const https = require('https');
const { clientId, token } = require('./config.json');

// Define the updated ticket command with all subcommands
const ticketCommand = {
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
};

// Get the existing command ID
const getCommands = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v9/applications/${clientId}/commands`,
      method: 'GET',
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
            const commands = JSON.parse(data);
            resolve(commands);
          } catch (err) {
            reject(new Error(`Failed to parse commands: ${err.message}`));
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.end();
  });
};

// Update the command
const updateCommand = (commandId) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v9/applications/${clientId}/commands/${commandId}`,
      method: 'PATCH',
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
          resolve(data);
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(JSON.stringify(ticketCommand));
    req.end();
  });
};

// Main function to execute the update
const main = async () => {
  try {
    console.log('Fetching existing commands...');
    const commands = await getCommands();
    
    const ticketCommandObj = commands.find(cmd => cmd.name === 'ticket');
    if (!ticketCommandObj) {
      console.error('Ticket command not found!');
      return;
    }
    
    console.log(`Updating ticket command (ID: ${ticketCommandObj.id})...`);
    await updateCommand(ticketCommandObj.id);
    console.log('Command updated successfully!');
    
    console.log('All subcommands should now be available. Restart your bot to ensure changes take effect.');
  } catch (err) {
    console.error('Failed to update commands:', err);
  }
};

main(); 