const { queryDatabasePromise } = require('../config/database');

class KakaoTalkModel {
    
    static async getConfig() {
        try {
            const query = `SELECT * FROM kakao_talk_config WHERE ACTIVE = 1 ORDER BY ENCODED_DT DESC LIMIT 1`;
            const results = await queryDatabasePromise(query);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    static async saveConfig(restApiKey, accessToken = null, refreshToken = null, userInfo = null, editedBy = null) {
        try {
            const existing = await this.getConfig();
            
            if (existing) {
                const query = `UPDATE kakao_talk_config 
                              SET REST_API_KEY = ?, ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, 
                                  USER_INFO = ?, EDITED_BY = ?, EDITED_DT = NOW() 
                              WHERE IDNo = ? AND ACTIVE = 1`;
                const result = await queryDatabasePromise(query, [
                    restApiKey, accessToken, refreshToken, 
                    userInfo ? JSON.stringify(userInfo) : null, 
                    editedBy, existing.IDNo
                ]);
                return result.affectedRows > 0;
            } else {
                const query = `INSERT INTO kakao_talk_config 
                              (REST_API_KEY, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO, ENCODED_BY, ENCODED_DT, ACTIVE) 
                              VALUES (?, ?, ?, ?, ?, NOW(), 1)`;
                const result = await queryDatabasePromise(query, [
                    restApiKey, accessToken, refreshToken, 
                    userInfo ? JSON.stringify(userInfo) : null, 
                    editedBy
                ]);
                return result.insertId;
            }
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                throw new Error('KakaoTalk config table does not exist. Please run the migration SQL file first.');
            }
            throw error;
        }
    }

    static async updateAccessToken(accessToken, refreshToken = null, editedBy = null) {
        try {
            const query = `UPDATE kakao_talk_config 
                          SET ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, 
                              EDITED_BY = ?, EDITED_DT = NOW() 
                          WHERE ACTIVE = 1`;
            const result = await queryDatabasePromise(query, [
                accessToken, refreshToken, editedBy
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return false;
            }
            throw error;
        }
    }

    static async deleteConfig(editedBy = null) {
        try {
            const query = `UPDATE kakao_talk_config 
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

module.exports = KakaoTalkModel;

