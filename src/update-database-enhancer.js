const fs = require('fs');
const path = require('path');

console.log('Starting database enhancer update...');

// Define paths
const databaseClassPath = path.join(__dirname, 'database/Database.js');
const backupPath = path.join(__dirname, 'database/Database.js.bak');

// First, create a backup of the original file
try {
    if (fs.existsSync(databaseClassPath)) {
        fs.copyFileSync(databaseClassPath, backupPath);
        console.log(`Backup created at ${backupPath}`);
    } else {
        console.error('Database.js not found at:', databaseClassPath);
        process.exit(1);
    }
} catch (err) {
    console.error('Error creating backup:', err);
    process.exit(1);
}

// New enhanced Database class implementation
const enhancedDatabaseClass = `const DatabaseEnhancer = require('./DatabaseEnhancer');
const path = require('path');

class Database {
    constructor() {
        console.log('Initializing enhanced database...');
        const dbPath = path.join(__dirname, 'tickets.db');
        console.log('Enhanced database path:', dbPath);
        
        this.enhancer = new DatabaseEnhancer(dbPath);
        this.db = null;
    }

    async init() {
        try {
            await this.enhancer.init();
            this.db = this.enhancer.db;
            console.log('Enhanced database initialized successfully');
            return this.setupTables();
        } catch (error) {
            console.error('Enhanced database initialization error:', error);
            throw error;
        }
    }
    
    async setupTables() {
        console.log('Setting up database tables with enhanced error handling...');
        return this.enhancer.safeQuery('run', \`
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                creator_id TEXT NOT NULL,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                closed_at INTEGER,
                closed_by TEXT,
                reopened_at INTEGER,
                reopened_by TEXT,
                last_activity INTEGER
            )
        \`).then(() => {
            return this.enhancer.safeQuery('run', \`
                CREATE TABLE IF NOT EXISTS ticket_messages (
                    id TEXT PRIMARY KEY,
                    ticket_id TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    author_name TEXT NOT NULL,
                    content TEXT,
                    timestamp INTEGER NOT NULL,
                    attachments TEXT,
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            \`);
        }).then(() => {
            return this.enhancer.safeQuery('run', \`
                CREATE TABLE IF NOT EXISTS ticket_participants (
                    ticket_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    joined_at INTEGER NOT NULL,
                    PRIMARY KEY (ticket_id, user_id),
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            \`);
        }).then(() => {
            return this.enhancer.safeQuery('run', \`
                CREATE TABLE IF NOT EXISTS ticket_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    details TEXT,
                    timestamp INTEGER NOT NULL,
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                )
            \`);
        }).then(() => {
            return this.enhancer.safeQuery('run', \`
                CREATE TABLE IF NOT EXISTS ticket_counters (
                    type TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    last_number INTEGER NOT NULL,
                    PRIMARY KEY (type, guild_id)
                )
            \`);
        }).then(() => {
            console.log('All tables created successfully with enhanced error handling');
        });
    }

    async saveTicket(ticketData) {
        console.log('Saving ticket to database with enhanced error handling:', ticketData);

        const sql = \`
            INSERT INTO tickets (
                id, guild_id, channel_id, creator_id, type, name,
                created_at, status, last_activity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`;

        const params = [
            ticketData.id,
            ticketData.guildId,
            ticketData.channelId,
            ticketData.creatorId,
            ticketData.type,
            ticketData.name,
            ticketData.createdAt || Date.now(),
            ticketData.status,
            Date.now()
        ];

        return this.enhancer.safeQuery('run', sql, params).then(result => {
            console.log(\`Ticket saved successfully. Last ID: \${result.lastID}\`);
            
            // Verify the save
            return this.enhancer.safeQuery('get', 'SELECT * FROM tickets WHERE id = ?', [ticketData.id]);
        });
    }

    async getActiveTickets(guildId) {
        console.log('Getting active tickets with enhanced error handling...');
        
        const query = \`
            SELECT * FROM tickets 
            WHERE status = "open"
            \${guildId ? ' AND guild_id = ?' : ''}
        \`;
        
        const params = guildId ? [guildId] : [];
        
        return this.enhancer.safeQuery('all', query, params).then(rows => {
            console.log('Found tickets in database:', rows);
            if (rows && rows.length > 0) {
                rows = rows.map(row => ({
                    id: row.id,
                    guildId: row.guild_id,
                    channelId: row.channel_id,
                    creatorId: row.creator_id,
                    type: row.type,
                    name: row.name,
                    createdAt: row.created_at,
                    status: row.status,
                    lastActivity: row.last_activity,
                    closedAt: row.closed_at,
                    closedBy: row.closed_by
                }));
            }
            return rows || [];
        });
    }

    async updateTicket(ticketId, updates) {
        console.log('Updating ticket with enhanced error handling:', ticketId, 'with:', updates);
        
        // Convert camelCase to snake_case for database
        const dbUpdates = {};
        Object.entries(updates).forEach(([key, value]) => {
            dbUpdates[key.replace(/[A-Z]/g, letter => \`_\${letter.toLowerCase()}\`)] = value;
        });

        const setClause = Object.keys(dbUpdates)
            .map(key => \`\${key} = ?\`)
            .join(', ');
        
        const sql = \`UPDATE tickets SET \${setClause}, last_activity = ? WHERE id = ?\`;
        const values = [...Object.values(dbUpdates), Date.now(), ticketId];

        console.log('Update SQL:', sql);
        console.log('Update values:', values);

        return this.enhancer.safeQuery('run', sql, values).then(result => {
            console.log(\`Updated ticket \${ticketId}, changes: \${result.changes}\`);
            return result;
        });
    }

    async getTicket(ticketId) {
        console.log('Getting ticket with enhanced error handling:', ticketId);
        
        return this.enhancer.safeQuery('get', 'SELECT * FROM tickets WHERE id = ?', [ticketId])
            .then(row => {
                if (!row) return null;
                
                return {
                    id: row.id,
                    guildId: row.guild_id,
                    channelId: row.channel_id,
                    creatorId: row.creator_id,
                    type: row.type,
                    name: row.name,
                    createdAt: row.created_at,
                    status: row.status,
                    lastActivity: row.last_activity,
                    closedAt: row.closed_at,
                    closedBy: row.closed_by
                };
            });
    }

    async getTicketByChannel(channelId) {
        console.log('Getting ticket by channel with enhanced error handling:', channelId);
        
        return this.enhancer.safeQuery('get', 'SELECT * FROM tickets WHERE channel_id = ?', [channelId])
            .then(row => {
                if (!row) return null;
                
                return {
                    id: row.id,
                    guildId: row.guild_id,
                    channelId: row.channel_id,
                    creatorId: row.creator_id,
                    type: row.type,
                    name: row.name,
                    createdAt: row.created_at,
                    status: row.status,
                    lastActivity: row.last_activity,
                    closedAt: row.closed_at,
                    closedBy: row.closed_by
                };
            });
    }

    async addParticipant(ticketId, userId, role = 'member') {
        console.log(\`Adding participant \${userId} to ticket \${ticketId} with role \${role}\`);
        
        const sql = \`
            INSERT OR REPLACE INTO ticket_participants 
            (ticket_id, user_id, role, joined_at) 
            VALUES (?, ?, ?, ?)
        \`;
        
        return this.enhancer.safeQuery('run', sql, [ticketId, userId, role, Date.now()]);
    }

    async logAction(ticketId, action, userId, details) {
        console.log(\`Logging action \${action} for ticket \${ticketId} by user \${userId}\`);
        
        const sql = \`
            INSERT INTO ticket_actions 
            (ticket_id, action, user_id, details, timestamp) 
            VALUES (?, ?, ?, ?, ?)
        \`;
        
        return this.enhancer.safeQuery('run', sql, [
            ticketId, 
            action, 
            userId, 
            details ? JSON.stringify(details) : null,
            Date.now()
        ]);
    }

    async getTicketLogs(ticketId) {
        console.log('Getting logs for ticket:', ticketId);
        
        const sql = \`
            SELECT * FROM ticket_actions 
            WHERE ticket_id = ? 
            ORDER BY timestamp ASC
        \`;
        
        return this.enhancer.safeQuery('all', sql, [ticketId]);
    }

    async verifyDatabase() {
        console.log('Verifying database with enhanced error handling...');
        
        return this.enhancer.safeQuery('all', 'SELECT * FROM tickets');
    }

    async close() {
        return this.enhancer.close();
    }

    async saveTicketMessages(ticketId, messages) {
        console.log(\`Saving \${messages.length} messages for ticket \${ticketId}\`);
        
        const promises = [];
        
        for (const message of messages) {
            // Skip system messages
            if (message.system) continue;
            
            const sql = \`
                INSERT OR IGNORE INTO ticket_messages 
                (id, ticket_id, author_id, author_name, content, timestamp, attachments) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            \`;
            
            const attachments = message.attachments.size > 0 
                ? JSON.stringify(Array.from(message.attachments.values()).map(a => a.url)) 
                : null;
            
            promises.push(
                this.enhancer.safeQuery('run', sql, [
                    message.id,
                    ticketId,
                    message.author.id,
                    message.author.username,
                    message.content || '',
                    message.createdTimestamp,
                    attachments
                ])
            );
        }
        
        return Promise.all(promises);
    }

    async getTicketTranscript(ticketId) {
        console.log('Getting transcript for ticket:', ticketId);
        
        const sql = \`
            SELECT * FROM ticket_messages 
            WHERE ticket_id = ? 
            ORDER BY timestamp ASC
        \`;
        
        return this.enhancer.safeQuery('all', sql, [ticketId]);
    }

    async getNextTicketNumber(type, guildId, retryCount = 0) {
        console.log(\`Getting next ticket number for type \${type} in guild \${guildId}\`);
        
        // Prevent infinite recursion
        if (retryCount > 3) {
            console.error(\`Too many retries (\${retryCount}) for getNextTicketNumber\`);
            // Fall back to a random number as a last resort
            return Math.floor(Math.random() * 10000) + 1;
        }
        
        try {
            return this.enhancer.safeQuery('get', 
                'SELECT last_number FROM ticket_counters WHERE type = ? AND guild_id = ?', 
                [type, guildId]
            ).then(row => {
                if (row) {
                    // Increment the counter
                    const newNumber = row.last_number + 1;
                    return this.enhancer.safeQuery('run', 
                        'UPDATE ticket_counters SET last_number = ? WHERE type = ? AND guild_id = ?', 
                        [newNumber, type, guildId]
                    ).then(() => {
                        console.log(\`Incremented \${type} counter for guild \${guildId} to \${newNumber}\`);
                        return newNumber;
                    });
                } else {
                    // No counter exists, so create one starting at 1
                    return this.enhancer.safeQuery('run', 
                        'INSERT INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)', 
                        [type, guildId, 1]
                    ).then(() => {
                        console.log(\`Created new \${type} counter for guild \${guildId} starting at 1\`);
                        return 1;
                    }).catch(err => {
                        // If we get a UNIQUE constraint error, try again (race condition)
                        if (err.message && err.message.includes('UNIQUE constraint failed')) {
                            console.warn(\`Race condition detected, retrying (attempt \${retryCount + 1})\`);
                            return this.getNextTicketNumber(type, guildId, retryCount + 1);
                        }
                        throw err;
                    });
                }
            });
        } catch (error) {
            console.error('Error getting next ticket number:', error);
            
            if (retryCount < 3) {
                console.log(\`Retrying after error (attempt \${retryCount + 1})\`);
                return this.fixTicketCountersTable(type, guildId, retryCount)
                    .then(() => this.getNextTicketNumber(type, guildId, retryCount + 1));
            }
            
            console.error('Max retries exceeded, falling back to random number');
            return Math.floor(Math.random() * 10000) + 1;
        }
    }

    async fixTicketCountersTable(type, guildId, retryCount = 0) {
        console.log(\`Fixing ticket counters table for \${type} in guild \${guildId}\`);
        
        // First check if table exists
        return this.enhancer.safeQuery('get', "SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_counters'")
            .then(result => {
                if (!result) {
                    // Table doesn't exist, create it
                    console.log('ticket_counters table does not exist, creating it');
                    return this.enhancer.safeQuery('run', \`
                        CREATE TABLE IF NOT EXISTS ticket_counters (
                            type TEXT NOT NULL,
                            guild_id TEXT NOT NULL,
                            last_number INTEGER NOT NULL,
                            PRIMARY KEY (type, guild_id)
                        )
                    \`);
                }
                return Promise.resolve();
            })
            .then(() => {
                // Check if the schema is correct
                return this.enhancer.safeQuery('get', \`
                    SELECT sql FROM sqlite_master 
                    WHERE type='table' AND name='ticket_counters'
                \`);
            })
            .then(row => {
                if (row && row.sql && !row.sql.includes('PRIMARY KEY (type, guild_id)')) {
                    console.warn('ticket_counters table has incorrect schema, recreating it');
                    
                    // Table exists but has wrong schema, recreate it
                    // First get existing data
                    return this.enhancer.safeQuery('all', 'SELECT * FROM ticket_counters')
                        .then(rows => {
                            // Drop and recreate the table
                            return this.enhancer.safeQuery('run', 'DROP TABLE ticket_counters')
                                .then(() => {
                                    return this.enhancer.safeQuery('run', \`
                                        CREATE TABLE ticket_counters (
                                            type TEXT NOT NULL,
                                            guild_id TEXT NOT NULL,
                                            last_number INTEGER NOT NULL,
                                            PRIMARY KEY (type, guild_id)
                                        )
                                    \`);
                                })
                                .then(() => {
                                    // Reinsert the data
                                    const promises = [];
                                    for (const row of rows) {
                                        promises.push(
                                            this.enhancer.safeQuery('run', 
                                                'INSERT OR IGNORE INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)',
                                                [row.type, row.guild_id, row.last_number]
                                            )
                                        );
                                    }
                                    return Promise.all(promises);
                                });
                        });
                }
                return Promise.resolve();
            })
            .then(() => {
                // Ensure a counter exists for this type and guild
                return this.enhancer.safeQuery('get', 
                    'SELECT * FROM ticket_counters WHERE type = ? AND guild_id = ?',
                    [type, guildId]
                ).then(row => {
                    if (!row) {
                        console.log(\`No counter exists for \${type} in guild \${guildId}, creating one\`);
                        return this.enhancer.safeQuery('run', 
                            'INSERT OR IGNORE INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)',
                            [type, guildId, 0]
                        );
                    }
                    return Promise.resolve();
                });
            })
            .catch(err => {
                console.error('Error fixing ticket_counters table:', err);
                throw err;
            });
    }
}

module.exports = Database;
`;

// Write the new implementation to the file
try {
    fs.writeFileSync(databaseClassPath, enhancedDatabaseClass);
    console.log('Database class updated successfully to use DatabaseEnhancer');
    console.log('A backup of the original file was created at:', backupPath);
    console.log('Please restart the bot for changes to take effect.');
} catch (err) {
    console.error('Error writing new implementation:', err);
    console.log('Backup is available at:', backupPath);
    process.exit(1);
}

console.log('Database enhancer update complete.');
process.exit(0); 