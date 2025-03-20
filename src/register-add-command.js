// A simple script to register just the ticket command
const https = require('https');
const { clientId, token } = require('./config.json');
const ticketCommand = require('./commands/ticket.js');

console.log('Registering ticket command with Discord API...');

// Convert the SlashCommandBuilder to JSON
const commandData = ticketCommand.data.toJSON();
console.log('Command data prepared:', commandData.name);

// Prepare the request options
const options = {
  hostname: 'discord.com',
  path: `/api/v10/applications/${clientId}/commands`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bot ${token}`
  }
};

// Send the request
const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Command registered successfully!');
    } else {
      console.error('Error response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error sending request:', error);
});

// Send the command data
req.write(JSON.stringify(commandData));
req.end(); 