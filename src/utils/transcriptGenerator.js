const { AttachmentBuilder } = require('discord.js');

async function generateTranscript(channel) {
    try {
        let messages = await fetchAllMessages(channel);
        let html = generateHtml(messages, channel);
        
        return new AttachmentBuilder(
            Buffer.from(html),
            { name: `transcript-${channel.name}.html` }
        );
    } catch (error) {
        console.error('Error generating transcript:', error);
        throw error;
    }
}

async function fetchAllMessages(channel) {
    let messages = [];
    let lastId;

    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetchedMessages = await channel.messages.fetch(options);
        if (fetchedMessages.size === 0) break;

        messages = messages.concat(Array.from(fetchedMessages.values()));
        lastId = fetchedMessages.last().id;
    }

    return messages.reverse();
}

function generateHtml(messages, channel) {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket Transcript - ${channel.name}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .message { margin: 10px 0; }
                .author { font-weight: bold; }
                .timestamp { color: #666; font-size: 0.8em; }
                .content { margin-left: 20px; }
            </style>
        </head>
        <body>
            <h1>Ticket Transcript - ${channel.name}</h1>
            ${messages.map(msg => `
                <div class="message">
                    <span class="author">${msg.author.tag}</span>
                    <span class="timestamp">${msg.createdAt.toISOString()}</span>
                    <div class="content">${msg.content}</div>
                </div>
            `).join('')}
        </body>
        </html>
    `;

    return html;
}

module.exports = { generateTranscript }; 