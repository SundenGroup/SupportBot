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

                    console.log('Database tables created successfully');
                    resolve();
                } catch (error) {
                    console.error('Database initialization error:', error);
                    reject(error);
                }
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
                INSERT INTO ticket_logs (ticket_id, action, user_id, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            `);

            stmt.run(
                ticketId,
                action,
                userId,
                Date.now(),
                JSON.stringify(details),
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
}

module.exports = Database; 