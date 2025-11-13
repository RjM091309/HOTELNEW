const axios = require('axios');

class TelegramService {
    constructor(botToken) {
        this.botToken = botToken;
        this.baseURL = `https://api.telegram.org/bot${botToken}`;
    }

    /**
     * Get bot information
     */
    async getMe() {
        try {
            const response = await axios.get(`${this.baseURL}/getMe`);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Send a text message
     * @param {string} chatId - Chat ID or username
     * @param {string} text - Message text
     * @param {object} options - Additional options (parse_mode, reply_markup, etc.)
     */
    async sendMessage(chatId, text, options = {}) {
        try {
            const payload = {
                chat_id: chatId,
                text: text,
                ...options
            };

            const response = await axios.post(`${this.baseURL}/sendMessage`, payload);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Send a photo
     * @param {string} chatId - Chat ID or username
     * @param {string} photo - Photo URL or file_id
     * @param {string} caption - Optional caption
     */
    async sendPhoto(chatId, photo, caption = '') {
        try {
            const payload = {
                chat_id: chatId,
                photo: photo,
                caption: caption
            };

            const response = await axios.post(`${this.baseURL}/sendPhoto`, payload);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Send a document
     * @param {string} chatId - Chat ID or username
     * @param {string} document - Document URL or file_id
     * @param {string} caption - Optional caption
     */
    async sendDocument(chatId, document, caption = '') {
        try {
            const payload = {
                chat_id: chatId,
                document: document,
                caption: caption
            };

            const response = await axios.post(`${this.baseURL}/sendDocument`, payload);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Set webhook for receiving updates
     * @param {string} url - Webhook URL
     * @param {object} options - Additional options
     */
    async setWebhook(url, options = {}) {
        try {
            const payload = {
                url: url,
                ...options
            };

            const response = await axios.post(`${this.baseURL}/setWebhook`, payload);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Delete webhook
     */
    async deleteWebhook() {
        try {
            const response = await axios.post(`${this.baseURL}/deleteWebhook`);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Get webhook info
     */
    async getWebhookInfo() {
        try {
            const response = await axios.get(`${this.baseURL}/getWebhookInfo`);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Get updates (for polling method)
     * @param {object} options - Options (offset, limit, timeout)
     */
    async getUpdates(options = {}) {
        try {
            const response = await axios.post(`${this.baseURL}/getUpdates`, options);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Send message with inline keyboard
     * @param {string} chatId - Chat ID or username
     * @param {string} text - Message text
     * @param {array} keyboard - Inline keyboard buttons array
     */
    async sendMessageWithKeyboard(chatId, text, keyboard) {
        try {
            const payload = {
                chat_id: chatId,
                text: text,
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };

            const response = await axios.post(`${this.baseURL}/sendMessage`, payload);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Edit message text
     * @param {string} chatId - Chat ID
     * @param {number} messageId - Message ID
     * @param {string} text - New text
     */
    async editMessageText(chatId, messageId, text) {
        try {
            const payload = {
                chat_id: chatId,
                message_id: messageId,
                text: text
            };

            const response = await axios.post(`${this.baseURL}/editMessageText`, payload);
            return { success: true, data: response.data.result };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Delete a message
     * @param {string} chatId - Chat ID
     * @param {number} messageId - Message ID
     */
    async deleteMessage(chatId, messageId) {
        try {
            const payload = {
                chat_id: chatId,
                message_id: messageId
            };

            const response = await axios.post(`${this.baseURL}/deleteMessage`, payload);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                message: error.response?.data?.description || error.message 
            };
        }
    }

    /**
     * Test bot token validity
     */
    async testConnection() {
        return await this.getMe();
    }
}

module.exports = TelegramService;

