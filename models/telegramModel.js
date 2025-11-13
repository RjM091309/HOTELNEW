const { queryDatabasePromise } = require('../config/database');

class TelegramModel {
    
    static async getBotConfig() {
        try {
            const query = `SELECT * FROM telegram_bot WHERE ACTIVE = 1 ORDER BY ENCODED_DT DESC LIMIT 1`;
            const results = await queryDatabasePromise(query);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    static async saveBotConfig(botToken, botName = null, chatId = null, editedBy = null) {
        try {
            const existing = await this.getBotConfig();
            
            if (existing) {
                const query = `UPDATE telegram_bot 
                              SET BOT_TOKEN = ?, BOT_NAME = ?, CHAT_ID = ?, 
                                  EDITED_BY = ?, EDITED_DT = NOW() 
                              WHERE IDNo = ? AND ACTIVE = 1`;
                const result = await queryDatabasePromise(query, [
                    botToken, botName, chatId, editedBy, existing.IDNo
                ]);
                return result.affectedRows > 0;
            } else {
                const query = `INSERT INTO telegram_bot 
                              (BOT_TOKEN, BOT_NAME, CHAT_ID, ENCODED_BY, ENCODED_DT, ACTIVE) 
                              VALUES (?, ?, ?, ?, NOW(), 1)`;
                const result = await queryDatabasePromise(query, [
                    botToken, botName, chatId, editedBy
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

