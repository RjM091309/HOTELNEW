const { queryDatabasePromise } = require('../config/database');

class TelegramModel {
    
    static async getBotConfig() {
        try {
            const query = `SELECT * FROM telegram_bot WHERE ACTIVE = 1 ORDER BY ENCODED_DT DESC LIMIT 1`;
            const results = await queryDatabasePromise(query);
            const config = results.length > 0 ? results[0] : null;
            
            // Add parsed Chat IDs array to config for convenience
            if (config) {
                config.CHAT_IDS = this.getChatIdsArray(config);
            }
            
            return config;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    static async saveBotConfig(botToken, botName = null, chatIds = null, editedBy = null) {
        try {
            const existing = await this.getBotConfig();
            
            // Convert chatIds array to JSON string if it's an array
            // If it's a single string (backward compatibility), convert to array first
            let chatIdValue = null;
            if (chatIds) {
                if (Array.isArray(chatIds)) {
                    // Filter out empty strings and null values
                    const validChatIds = chatIds.filter(id => id && id.trim());
                    chatIdValue = validChatIds.length > 0 ? JSON.stringify(validChatIds) : null;
                } else if (typeof chatIds === 'string') {
                    // Backward compatibility: single string -> convert to array
                    const trimmed = chatIds.trim();
                    chatIdValue = trimmed ? JSON.stringify([trimmed]) : null;
                }
            }
            
            if (existing) {
                const query = `UPDATE telegram_bot 
                              SET BOT_TOKEN = ?, BOT_NAME = ?, CHAT_ID = ?, 
                                  EDITED_BY = ?, EDITED_DT = NOW() 
                              WHERE IDNo = ? AND ACTIVE = 1`;
                const result = await queryDatabasePromise(query, [
                    botToken, botName, chatIdValue, editedBy, existing.IDNo
                ]);
                return result.affectedRows > 0;
            } else {
                const query = `INSERT INTO telegram_bot 
                              (BOT_TOKEN, BOT_NAME, CHAT_ID, ENCODED_BY, ENCODED_DT, ACTIVE) 
                              VALUES (?, ?, ?, ?, NOW(), 1)`;
                const result = await queryDatabasePromise(query, [
                    botToken, botName, chatIdValue, editedBy
                ]);
                return result.insertId;
            }
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                throw new Error('Telegram bot table does not exist. Please run the migration SQL file first.');
            }
            throw error;
        }
    }
    
    /**
     * Get Chat IDs as array from config
     * @returns {Array<string>} Array of Chat IDs
     */
    static getChatIdsArray(config) {
        if (!config || !config.CHAT_ID) {
            return [];
        }
        
        try {
            // Try to parse as JSON (new format)
            const parsed = JSON.parse(config.CHAT_ID);
            if (Array.isArray(parsed)) {
                return parsed.filter(id => id && id.trim());
            }
            // If not an array, return as single item array (backward compatibility)
            return [parsed].filter(id => id && id.trim());
        } catch (e) {
            // If parsing fails, treat as single string (backward compatibility)
            const trimmed = String(config.CHAT_ID).trim();
            return trimmed ? [trimmed] : [];
        }
    }

    static async deleteBotConfig(editedBy = null) {
        try {
            const query = `UPDATE telegram_bot 
                          SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() 
                          WHERE ACTIVE = 1`;
            const result = await queryDatabasePromise(query, [editedBy]);
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return false;
            }
            throw error;
        }
    }
}

module.exports = TelegramModel;

