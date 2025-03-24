const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        console.log('Initializing database...');
        const dbPath = path.join(__dirname, 'tickets.db');
        console.log('Database path:', dbPath);
        
        // Open database with persistence mode
        this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Error opening database:', err);
            } else {
                console.log('Connected to database successfully');
                // Enable foreign keys
                this.db.run('PRAGMA foreign_keys = ON');
            }
        });
    }

    async init() {
        console.log('Setting up database tables...');
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                try {
                    // Create tables without using serialize
                    this.db.run(`
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
                            last_activity INTEGER
                        )
                    `);

                    // Add messages table for transcripts
                    this.db.run(`
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
                    `);

                    // Add participants table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS ticket_participants (
                            ticket_id TEXT NOT NULL,
                            user_id TEXT NOT NULL,
                            role TEXT NOT NULL,
                            joined_at INTEGER NOT NULL,
                            PRIMARY KEY (ticket_id, user_id),
                            FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                        )
                    `);

                    // Add actions log table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS ticket_actions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            ticket_id TEXT NOT NULL,
                            action TEXT NOT NULL,
                            user_id TEXT NOT NULL,
                            details TEXT,
                            timestamp INTEGER NOT NULL,
                            FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                        )
                    `);
                    
                    // Add ticket counters table to track sequential ticket numbers by type
                    // Make sure it has a composite primary key on (type, guild_id)
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS ticket_counters (
                            type TEXT NOT NULL,
                            guild_id TEXT NOT NULL,
                            last_number INTEGER NOT NULL,
                            PRIMARY KEY (type, guild_id)
                        )
                    `);

                    // Run a check to see if we need to fix the schema
                    this.checkAndFixTicketCountersTable();

                    console.log('Database tables created successfully');
                    resolve();
                } catch (error) {
                    console.error('Database initialization error:', error);
                    reject(error);
                }
            });
        });
    }

    // Helper method to check if we need to fix the ticket_counters table schema
    async checkAndFixTicketCountersTable() {
        return new Promise((resolve, reject) => {
            // Check the table schema
            this.db.get("PRAGMA table_info(ticket_counters)", [], (err, rows) => {
                if (err) {
                    console.error('Error checking table schema:', err);
                    resolve(); // Don't reject, just log and continue
                    return;
                }
                
                // Get the table schema to check if it has the correct primary key
                this.db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='ticket_counters'", [], (err, row) => {
                    if (err || !row) {
                        console.error('Error checking ticket_counters schema:', err);
                        resolve(); // Don't reject, just log and continue
                        return;
                    }
                    
                    const sql = row.sql;
                    console.log('Current ticket_counters schema:', sql);
                    
                    // Check if it has a composite primary key
                    if (!sql.includes('PRIMARY KEY (type, guild_id)')) {
                        console.warn('The ticket_counters table does not have the correct composite primary key.');
                        console.warn('Please run the fix-ticket-counters.js script to fix the schema.');
                    } else {
                        console.log('The ticket_counters table has the correct schema.');
                    }
                    
                    resolve();
                });
            });
        });
    }

    async saveTicket(ticketData) {
        return new Promise((resolve, reject) => {
            const db = this.db;
            console.log('Saving ticket to database:', ticketData);

            const sql = `
                INSERT INTO tickets (
                    id, guild_id, channel_id, creator_id, type, name,
                    created_at, status, last_activity
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

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

            // Execute insert directly without transaction
            db.run(sql, params, function(err) {
                if (err) {
                    console.error('Error saving ticket:', err);
                    reject(err);
                } else {
                    console.log(`Ticket saved successfully. Row ID: ${this.lastID}`);
                    // Verify the save
                    db.get('SELECT * FROM tickets WHERE id = ?', [ticketData.id], (verifyErr, row) => {
                        if (verifyErr) {
                            console.error('Error verifying ticket save:', verifyErr);
                            reject(verifyErr);
                        } else {
                            console.log('Verified saved ticket:', row);
                            resolve(row);
                        }
                    });
                }
            });
        });
    }

    async getActiveTickets(guildId) {
        return new Promise((resolve, reject) => {
            console.log('Getting active tickets...');
            
            const query = `
                SELECT * FROM tickets 
                WHERE status = "open"
                ${guildId ? ' AND guild_id = ?' : ''}
            `;
            
            const params = guildId ? [guildId] : [];
            
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('Error fetching active tickets:', err);
                    reject(err);
                } else {
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
                    resolve(rows || []);
                }
            });
        });
    }

    async updateTicket(ticketId, updates) {
        return new Promise((resolve, reject) => {
            console.log('Updating ticket:', ticketId, 'with:', updates);
            
            // Convert camelCase to snake_case for database
            const dbUpdates = {};
            Object.entries(updates).forEach(([key, value]) => {
                dbUpdates[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] = value;
            });

            const setClause = Object.keys(dbUpdates)
                .map(key => `${key} = ?`)
                .join(', ');
            
            const sql = `UPDATE tickets SET ${setClause}, last_activity = ? WHERE id = ?`;
            const values = [...Object.values(dbUpdates), Date.now(), ticketId];

            console.log('Update SQL:', sql);
            console.log('Update values:', values);

            this.db.run(sql, values, function(err) {
                if (err) {
                    console.error('Error updating ticket:', err);
                    reject(err);
                } else {
                    console.log(`Updated ticket. Changes: ${this.changes}`);
                    resolve();
                }
            });
        });
    }

    async getTicket(ticketId) {
        return new Promise((resolve, reject) => {
            console.log('Getting ticket by ID:', ticketId);
            
            this.db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
                if (err) {
                    console.error('Error fetching ticket:', err);
                    reject(err);
                } else {
                    if (row) {
                        // Convert to camelCase format
                        const ticket = {
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
                        console.log('Found ticket:', ticket);
                        resolve(ticket);
                    } else {
                        console.log('No ticket found with ID:', ticketId);
                        resolve(null);
                    }
                }
            });
        });
    }

    async getTicketByChannel(channelId) {
        return new Promise((resolve, reject) => {
            console.log('Fetching ticket by channel:', channelId);
            this.db.get(
                'SELECT * FROM tickets WHERE channel_id = ?',
                [channelId],
                (err, row) => {
                    if (err) {
                        console.error('Error fetching ticket by channel:', err);
                        reject(err);
                    } else {
                        console.log('Ticket fetch by channel result:', row);
                        resolve(row);
                    }
                }
            );
        });
    }

    async addParticipant(ticketId, userId, role = 'member') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO ticket_participants (ticket_id, user_id, role, joined_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(ticket_id, user_id) DO UPDATE SET role = ?
            `);

            const now = Date.now();
            stmt.run(
                ticketId,
                userId,
                role,
                now,
                role,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );

            stmt.finalize();
        });
    }

    async logAction(ticketId, action, userId, details) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO ticket_actions (ticket_id, action, user_id, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            `);

            const detailsJson = details ? JSON.stringify(details) : null;
            const now = Date.now();

            stmt.run(
                ticketId,
                action,
                userId,
                now,
                detailsJson,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );

            stmt.finalize();
        });
    }

    async getTicketLogs(ticketId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM ticket_logs WHERE ticket_id = ? ORDER BY timestamp ASC',
                [ticketId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Add a method to verify the database state
    async verifyDatabase() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM tickets', [], (err, rows) => {
                if (err) {
                    console.error('Error verifying database:', err);
                    reject(err);
                } else {
                    console.log('All tickets in database:', rows);
                    resolve(rows);
                }
            });
        });
    }

    // Add cleanup method
    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                    reject(err);
                } else {
                    console.log('Database closed successfully');
                    resolve();
                }
            });
        });
    }

    async saveTicketMessages(ticketId, messages) {
        return new Promise((resolve, reject) => {
            const db = this.db;
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const stmt = db.prepare(`
                    INSERT INTO ticket_messages (
                        id, ticket_id, author_id, author_name, content, timestamp, attachments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                try {
                    for (const msg of messages) {
                        const attachments = msg.attachments.size > 0 
                            ? JSON.stringify(Array.from(msg.attachments.values()).map(a => a.url))
                            : null;

                        stmt.run(
                            msg.id,
                            ticketId,
                            msg.author.id,
                            msg.author.tag,
                            msg.content,
                            msg.createdTimestamp,
                            attachments
                        );
                    }

                    stmt.finalize();
                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('Error committing transcript:', err);
                            db.run('ROLLBACK');
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } catch (error) {
                    console.error('Error saving messages:', error);
                    db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }

    async getTicketTranscript(ticketId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM ticket_messages 
                WHERE ticket_id = ? 
                ORDER BY timestamp ASC`,
                [ticketId],
                (err, rows) => {
                    if (err) {
                        console.error('Error fetching transcript:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    }

    // Get the next ticket number for a specific type and guild
    async getNextTicketNumber(type, guildId) {
        return new Promise((resolve, reject) => {
            console.log(`Getting next ticket number for type: ${type}, guild: ${guildId}`);
            
            // First, try to get an existing counter
            this.db.get(
                'SELECT last_number FROM ticket_counters WHERE type = ? AND guild_id = ?',
                [type, guildId],
                (err, row) => {
                    if (err) {
                        console.error('Error checking ticket counter:', err);
                        reject(err);
                        return;
                    }
                    
                    if (row) {
                        // Counter exists, increment it
                        const nextNumber = row.last_number + 1;
                        
                        console.log(`Found existing counter: type=${type}, guild=${guildId}, current=${row.last_number}, next=${nextNumber}`);
                        
                        this.db.run(
                            'UPDATE ticket_counters SET last_number = ? WHERE type = ? AND guild_id = ?',
                            [nextNumber, type, guildId],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('Error updating ticket counter:', updateErr);
                                    reject(updateErr);
                                    return;
                                }
                                
                                console.log(`Incremented ${type} ticket counter to ${nextNumber} for guild ${guildId}`);
                                resolve(nextNumber);
                            }
                        );
                    } else {
                        console.log(`No counter found for type=${type}, guild=${guildId}. Creating a new one with transaction...`);
                        
                        // For new servers, use a transaction-based approach to ensure atomic creation
                        this.db.serialize(() => {
                            this.db.run('BEGIN IMMEDIATE TRANSACTION');
                            
                            // Try to create a new counter with a transaction for atomicity
                            const nextNumber = 1;
                            this.db.run(
                                'INSERT OR IGNORE INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)',
                                [type, guildId, nextNumber],
                                (insertErr) => {
                                    if (insertErr) {
                                        console.error('Error creating ticket counter in transaction:', insertErr);
                                        this.db.run('ROLLBACK');
                                        
                                        // If we get here, it might be because another process already created it,
                                        // let's check again after a short delay
                                        setTimeout(() => {
                                            this.db.get(
                                                'SELECT last_number FROM ticket_counters WHERE type = ? AND guild_id = ?',
                                                [type, guildId],
                                                (retryErr, retryRow) => {
                                                    if (retryErr) {
                                                        console.error('Error in retry check for counter:', retryErr);
                                                        reject(retryErr);
                                                        return;
                                                    }
                                                    
                                                    if (retryRow) {
                                                        console.log(`Found counter on retry: type=${type}, guild=${guildId}, current=${retryRow.last_number}`);
                                                        // Found it, let's increment and use that
                                                        const retryNextNumber = retryRow.last_number + 1;
                                                        this.db.run(
                                                            'UPDATE ticket_counters SET last_number = ? WHERE type = ? AND guild_id = ?',
                                                            [retryNextNumber, type, guildId],
                                                            (retryUpdateErr) => {
                                                                if (retryUpdateErr) {
                                                                    console.error('Error updating counter on retry:', retryUpdateErr);
                                                                    reject(retryUpdateErr);
                                                                    return;
                                                                }
                                                                
                                                                console.log(`Incremented counter on retry to ${retryNextNumber}`);
                                                                resolve(retryNextNumber);
                                                            }
                                                        );
                                                    } else {
                                                        // If we still don't have a counter, use the fallback
                                                        console.log(`Still no counter found on retry, using fallback method`);
                                                        this.fixTicketCountersTable(type, guildId)
                                                            .then(number => resolve(number))
                                                            .catch(err => reject(err));
                                                    }
                                                }
                                            );
                                        }, 500); // Short delay to reduce collision probability
                                        return;
                                    }
                                    
                                    // Check if we inserted the row successfully
                                    this.db.get(
                                        'SELECT last_number FROM ticket_counters WHERE type = ? AND guild_id = ?',
                                        [type, guildId],
                                        (checkErr, checkRow) => {
                                            if (checkErr) {
                                                console.error('Error checking inserted counter:', checkErr);
                                                this.db.run('ROLLBACK');
                                                reject(checkErr);
                                                return;
                                            }
                                            
                                            if (checkRow) {
                                                console.log(`Created new counter and verified: type=${type}, guild=${guildId}, number=${checkRow.last_number}`);
                                                this.db.run('COMMIT', (commitErr) => {
                                                    if (commitErr) {
                                                        console.error('Error committing counter transaction:', commitErr);
                                                        this.db.run('ROLLBACK');
                                                        reject(commitErr);
                                                        return;
                                                    }
                                                    
                                                    resolve(checkRow.last_number);
                                                });
                                            } else {
                                                console.error('Could not verify inserted counter');
                                                this.db.run('ROLLBACK');
                                                reject(new Error('Failed to create ticket counter'));
                                            }
                                        }
                                    );
                                }
                            );
                        });
                    }
                }
            );
        });
    }
    
    // Helper method to fix/create ticket counter entries
    async fixTicketCountersTable(type, guildId, retryCount = 0) {
        return new Promise((resolve, reject) => {
            // Set a maximum retry count to prevent infinite loops
            const MAX_RETRIES = 3;
            if (retryCount >= MAX_RETRIES) {
                console.error(`Maximum retry count (${MAX_RETRIES}) exceeded for ticket counter creation.`);
                reject(new Error(`Failed to create ticket counter after ${MAX_RETRIES} attempts. Please contact support.`));
                return;
            }
            
            // First, check if there's an existing entry with just the 'type'
            this.db.get(
                'SELECT * FROM ticket_counters WHERE type = ?',
                [type],
                (err, row) => {
                    if (err) {
                        console.error('Error checking for existing counter:', err);
                        reject(err);
                        return;
                    }
                    
                    if (row) {
                        // A counter with just the type exists, let's update it to include guild_id
                        console.log(`Found existing counter for type ${type} without guild_id. Updating...`);
                        
                        // Use transaction to make this atomic
                        this.db.serialize(() => {
                            this.db.run('BEGIN TRANSACTION');
                            
                            // Update the counter to include the guild_id
                            this.db.run(
                                'UPDATE ticket_counters SET guild_id = ? WHERE type = ? AND guild_id != ?',
                                [guildId, type, guildId],
                                (updateErr) => {
                                    if (updateErr) {
                                        console.error('Error updating existing counter:', updateErr);
                                        this.db.run('ROLLBACK');
                                        reject(updateErr);
                                        return;
                                    }
                                    
                                    // Create a new counter entry
                                    const nextNumber = 1;
                                    this.db.run(
                                        'INSERT OR IGNORE INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)',
                                        [type, guildId, nextNumber],
                                        (insertErr) => {
                                            if (insertErr) {
                                                console.error('Error creating ticket counter:', insertErr);
                                                this.db.run('ROLLBACK');
                                                reject(insertErr);
                                                return;
                                            }
                                            
                                            // Commit the transaction
                                            this.db.run('COMMIT', (commitErr) => {
                                                if (commitErr) {
                                                    console.error('Error committing transaction:', commitErr);
                                                    this.db.run('ROLLBACK');
                                                    reject(commitErr);
                                                    return;
                                                }
                                                
                                                console.log(`Created new ${type} ticket counter for guild ${guildId} starting at ${nextNumber}`);
                                                resolve(nextNumber);
                                            });
                                        }
                                    );
                                }
                            );
                        });
                    } else {
                        // No counter exists at all, create a new one
                        const nextNumber = 1;
                        this.db.run(
                            'INSERT INTO ticket_counters (type, guild_id, last_number) VALUES (?, ?, ?)',
                            [type, guildId, nextNumber],
                            (insertErr) => {
                                if (insertErr) {
                                    console.error('Error creating ticket counter:', insertErr);
                                    
                                    // Check if it's a constraint violation
                                    if (insertErr.message.includes('UNIQUE constraint failed')) {
                                        console.log(`Constraint violation detected, trying alternative approach (retry ${retryCount + 1})`);
                                        
                                        // Wait a bit and retry with a recursive call
                                        setTimeout(() => {
                                            this.fixTicketCountersTable(type, guildId, retryCount + 1)
                                                .then(resolve)
                                                .catch(reject);
                                        }, 500); // Add a delay to reduce collision chance
                                        return;
                                    }
                                    
                                    reject(insertErr);
                                    return;
                                }
                                
                                console.log(`Created new ${type} ticket counter for guild ${guildId} starting at ${nextNumber}`);
                                resolve(nextNumber);
                            }
                        );
                    }
                }
            );
        });
    }
}

module.exports = Database; 