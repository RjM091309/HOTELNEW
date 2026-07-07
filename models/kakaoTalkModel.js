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

    /**
     * Save KakaoTalk config (update existing or insert new)
     * Supports optional NAME column for labeling accounts
     */
    static async saveConfig(restApiKey, accessToken = null, refreshToken = null, userInfo = null, editedBy = null, accountId = null, name = null) {
        try {
            let existing;
            if (accountId) {
                existing = await this.getConfigById(accountId);
            } else {
                existing = await this.getConfig();
            }
            
            if (existing) {
                const query = `UPDATE kakao_talk_config 
                              SET REST_API_KEY = ?, ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, 
                                  USER_INFO = ?, NAME = COALESCE(?, NAME), EDITED_BY = ?, EDITED_DT = NOW() 
                              WHERE IDNo = ? AND ACTIVE = 1`;
                const result = await queryDatabasePromise(query, [
                    restApiKey, accessToken, refreshToken, 
                    userInfo ? JSON.stringify(userInfo) : null, 
                    name, editedBy, existing.IDNo
                ]);
                return result.affectedRows > 0;
            } else {
                const query = `INSERT INTO kakao_talk_config 
                              (REST_API_KEY, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO, NAME, ENCODED_BY, ENCODED_DT, ACTIVE) 
                              VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
                const result = await queryDatabasePromise(query, [
                    restApiKey, accessToken, refreshToken, 
                    userInfo ? JSON.stringify(userInfo) : null,
                    name, 
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
            const config = await this.getConfig();
            if (!config) return false;
            return this.updateAccessTokenById(config.IDNo, accessToken, refreshToken, editedBy);
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

    /**
     * Get KakaoTalk config by IDNo
     * @param {number} idNo - IDNo of the config to retrieve
     * @returns {Promise<object|null>} Config object or null if not found
     */
    static async getConfigById(idNo) {
        try {
            const query = `SELECT * FROM kakao_talk_config WHERE IDNo = ? AND ACTIVE = 1`;
            const results = await queryDatabasePromise(query, [idNo]);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get all active KakaoTalk configs
     * @returns {Promise<Array>} Array of active configs
     */
    static async getAllConfigs() {
        try {
            const query = `SELECT * FROM kakao_talk_config WHERE ACTIVE = 1 ORDER BY ENCODED_DT DESC`;
            const results = await queryDatabasePromise(query);
            return results;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Update access token for a specific config by IDNo
     * @param {number} idNo - IDNo of the config to update
     * @param {string} accessToken - New access token
     * @param {string} refreshToken - New refresh token (optional)
     * @param {number} editedBy - User ID who made the edit (optional)
     * @returns {Promise<boolean>} True if update was successful
     */
    static async updateAccessTokenById(idNo, accessToken, refreshToken = null, editedBy = null) {
        try {
            const query = `UPDATE kakao_talk_config 
                          SET ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, 
                              EDITED_BY = ?, EDITED_DT = NOW() 
                          WHERE IDNo = ? AND ACTIVE = 1`;
            const result = await queryDatabasePromise(query, [
                accessToken, refreshToken, editedBy, idNo
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return false;
            }
            throw error;
        }
    }

    /**
     * Find an account that was added but not yet authenticated (no access token)
     */
    static async findPendingConfigByRestApiKey(restApiKey) {
        try {
            const query = `SELECT * FROM kakao_talk_config 
                          WHERE ACTIVE = 1 AND REST_API_KEY = ?
                          AND (ACCESS_TOKEN IS NULL OR ACCESS_TOKEN = '')
                          ORDER BY ENCODED_DT DESC LIMIT 1`;
            const results = await queryDatabasePromise(query, [restApiKey]);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Find an account that was added but not yet authenticated by ID
     */
    static async findPendingConfigById(idNo) {
        try {
            const query = `SELECT * FROM kakao_talk_config 
                          WHERE ACTIVE = 1 AND IDNo = ?
                          AND (ACCESS_TOKEN IS NULL OR ACCESS_TOKEN = '')
                          LIMIT 1`;
            const results = await queryDatabasePromise(query, [idNo]);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Add a new KakaoTalk config (always creates new, doesn't update existing)
     * @param {string} restApiKey - REST API Key
     * @param {string} accessToken - Access token (optional)
     * @param {string} refreshToken - Refresh token (optional)
     * @param {object} userInfo - User info object (optional)
     * @param {number} encodedBy - User ID who created this (optional)
     * @param {string} name - Optional display name/label for this account
     * @returns {Promise<number>} IDNo of the newly created config
     */
    static async addNewConfig(restApiKey, accessToken = null, refreshToken = null, userInfo = null, encodedBy = null, name = null) {
        try {
            const query = `INSERT INTO kakao_talk_config 
                          (REST_API_KEY, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO, NAME, ENCODED_BY, ENCODED_DT, ACTIVE) 
                          VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
            const result = await queryDatabasePromise(query, [
                restApiKey, accessToken, refreshToken, 
                userInfo ? JSON.stringify(userInfo) : null,
                name, 
                encodedBy
            ]);
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                throw new Error('KakaoTalk config table does not exist. Please run the migration SQL file first.');
            }
            throw error;
        }
    }

    /**
     * Delete a specific config by IDNo
     * @param {number} idNo - IDNo of the config to delete
     * @param {number} editedBy - User ID who deleted this (optional)
     * @returns {Promise<boolean>} True if deletion was successful
     */
    static async deleteConfigById(idNo, editedBy = null) {
        try {
            const query = `UPDATE kakao_talk_config 
                          SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() 
                          WHERE IDNo = ? AND ACTIVE = 1`;
            const result = await queryDatabasePromise(query, [editedBy, idNo]);
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

