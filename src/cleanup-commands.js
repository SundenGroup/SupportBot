const https = require('https');
const { clientId, token } = require('./config.json');

// Get all commands
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

// Delete a command by ID
const deleteCommand = (commandId) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v9/applications/${clientId}/commands/${commandId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
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

// Main function to execute the cleanup
const main = async () => {
  try {
    console.log('Fetching all commands...');
    const commands = await getCommands();
    
    console.log('Registered commands:');
    commands.forEach(cmd => {
      console.log(`- ${cmd.name} (ID: ${cmd.id})`);
    });
    
    // Look for any standalone 'add' command
    const addCommand = commands.find(cmd => cmd.name === 'add');
    
    if (addCommand) {
      console.log(`Found standalone 'add' command with ID: ${addCommand.id}. Deleting...`);
      await deleteCommand(addCommand.id);
      console.log('Successfully deleted the standalone add command!');
    } else {
      console.log('No standalone add command found in the API. The issue might be with Discord\'s client-side cache.');
      console.log('Please try the following:');
      console.log('1. Wait for Discord to refresh its cache (up to 1 hour)');
      console.log('2. Clear Discord\'s cache or restart the Discord client');
    }
    
    console.log('Command cleanup completed!');
  } catch (err) {
    console.error('Failed to cleanup commands:', err);
  }
};

main(); 