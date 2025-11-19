const TelegramModel = require('../models/telegramModel');
const TelegramService = require('../services/telegramService');
const DailySettlementService = require('../services/dailySettlementService');
const KakaoTalkModel = require('../models/kakaoTalkModel');
const KakaoTalkService = require('../services/kakaoTalkService');
const axios = require('axios');
const querystring = require('querystring');

class TelegramController {
    
    static async getTelegramSettingsPage(req, res) {
        try {
            res.render('telegram/settings', {
                title: 'Telegram Settings',
                subTitle: 'Telegram Bot Configuration',
                activePage: 'telegram_settings',
                user: req.user
            });
        } catch (error) {
            console.error('Error rendering Telegram settings page:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                subTitle: '500 Error'
            });
        }
    }

    static async getBotConfig(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            if (!config) {
                return res.json({ success: true, data: null, message: 'No Telegram bot configured' });
            }
            // For settings page, send full token (it's a secure page)
            // For API calls, we can mask it if needed
            res.json({ success: true, data: config });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch Telegram bot config' });
        }
    }

    static async saveBotConfig(req, res) {
        try {
            const { botToken, chatId } = req.body;
            
            if (!botToken) {
                return res.status(400).json({ success: false, message: 'Bot token is required' });
            }

            // Test the bot token first
            const telegramService = new TelegramService(botToken);
            const testResult = await telegramService.testConnection();
            
            if (!testResult.success) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid bot token: ' + testResult.message 
                });
            }

            // Get bot info
            const botInfo = testResult.data;
            const botFirstName = botInfo.first_name || '';
            const botUsername = botInfo.username || '';
            
            // Save both name and username in format: "Name (username)" or just "Name" if no username
            let botName = botFirstName;
            if (botUsername) {
                botName = botFirstName ? `${botFirstName} (@${botUsername})` : `@${botUsername}`;
            }
            if (!botName) {
                botName = 'Telegram Bot';
            }

            // Save to database
            await TelegramModel.saveBotConfig(
                botToken,
                botName,
                chatId || null,
                req.user?.userId || null
            );

            res.json({ 
                success: true, 
                message: 'Telegram bot configured successfully',
                data: {
                    botName: botName,
                    botId: botInfo.id,
                    username: botInfo.username,
                    chatId: chatId || null
                }
            });
        } catch (error) {
            console.error('Error saving Telegram bot config:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to save Telegram bot config' 
            });
        }
    }

    static async testBot(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.testConnection();
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: 'Bot connection successful',
                    data: result.data
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    message: 'Bot connection failed: ' + result.message 
                });
            }
        } catch (error) {
            console.error('Error testing Telegram bot:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to test Telegram bot: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async sendMessage(req, res) {
        try {
            const { chatId, message } = req.body;
            
            if (!chatId || !message) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Chat ID and message are required' 
                });
            }

            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.sendMessage(chatId, message);
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: 'Message sent successfully',
                    data: result.data
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    message: 'Failed to send message: ' + result.message 
                });
            }
        } catch (error) {
            console.error('Error sending Telegram message:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send Telegram message: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async getWebhookInfo(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.getWebhookInfo();
            
            res.json({ 
                success: result.success, 
                data: result.data,
                message: result.success ? 'Webhook info retrieved' : result.message
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get webhook info' 
            });
        }
    }

    static async setWebhook(req, res) {
        try {
            const { webhookUrl } = req.body;
            
            if (!webhookUrl) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Webhook URL is required' 
                });
            }

            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.setWebhook(webhookUrl);
            
            // Webhook is set via Telegram API, no need to save in database

            res.json({ 
                success: result.success, 
                message: result.success ? 'Webhook set successfully' : result.message,
                data: result.data
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to set webhook' 
            });
        }
    }

    static async deleteWebhook(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.deleteWebhook();
            
            // Webhook deleted via Telegram API, no need to update database

            res.json({ 
                success: result.success, 
                message: result.success ? 'Webhook deleted successfully' : result.message
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to delete webhook' 
            });
        }
    }

    static async deleteBotConfig(req, res) {
        try {
            const deleted = await TelegramModel.deleteBotConfig(req.user?.userId || null);
            
            if (deleted) {
                res.json({ success: true, message: 'Telegram bot configuration deleted' });
            } else {
                res.status(404).json({ success: false, message: 'No configuration found to delete' });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to delete configuration' });
        }
    }

    // Webhook Handler Methods
    static async handleWebhook(req, res) {
        try {
            const update = req.body;

            // Send 200 OK immediately to acknowledge receipt
            res.status(200).json({ ok: true });

            // Process the update asynchronously
            processTelegramUpdate(update).catch(error => {
                console.error('Error processing Telegram update:', error);
            });
        } catch (error) {
            console.error('Error handling Telegram webhook:', error);
            res.status(200).json({ ok: true }); // Always return 200 to Telegram
        }
    }

    static async processUpdate(update) {
        try {
            // Get bot configuration
            const config = await TelegramModel.getBotConfig();
            if (!config || !config.BOT_TOKEN) {
                console.error('Telegram bot not configured');
                return;
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);

            // Handle different types of updates
            if (update.message) {
                await this.handleMessage(update.message, telegramService);
            } else if (update.callback_query) {
                await this.handleCallbackQuery(update.callback_query, telegramService);
            } else if (update.edited_message) {
                await this.handleEditedMessage(update.edited_message, telegramService);
            }
            // Add more update types as needed

        } catch (error) {
            console.error('Error processing update:', error);
        }
    }

    static async handleMessage(message, telegramService) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const username = message.from?.username || 'Unknown';

        console.log(`Received message from ${username} (${chatId}): ${text}`);

        // Example: Handle /start command
        if (text.startsWith('/start')) {
            await telegramService.sendMessage(
                chatId,
                'Welcome to Hotel Management Bot! 🏨\n\n' +
                'Available commands:\n' +
                '/help - Show help message\n' +
                '/status - Check bot status'
            );
        }
        // Example: Handle /help command
        else if (text.startsWith('/help')) {
            await telegramService.sendMessage(
                chatId,
                'Hotel Management Bot Commands:\n\n' +
                '/start - Start the bot\n' +
                '/help - Show this help message\n' +
                '/status - Check bot status'
            );
        }
        // Example: Handle /status command
        else if (text.startsWith('/status')) {
            const botInfo = await telegramService.getMe();
            if (botInfo.success) {
                await telegramService.sendMessage(
                    chatId,
                    `Bot Status: ✅ Active\n` +
                    `Bot Name: ${botInfo.data.first_name}\n` +
                    `Username: @${botInfo.data.username}\n` +
                    `Bot ID: ${botInfo.data.id}`
                );
            }
        }
        // Handle other messages
        else if (text.trim()) {
            // Echo the message back (you can customize this)
            await telegramService.sendMessage(
                chatId,
                `You said: ${text}\n\nType /help for available commands.`
            );
        }
    }

    static async handleCallbackQuery(callbackQuery, telegramService) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const queryId = callbackQuery.id;

        console.log(`Received callback query: ${data}`);

        // Answer the callback query to remove loading state
        await telegramService.sendMessage(chatId, `You selected: ${data}`);

        // You can add more callback query handling logic here
    }

    static async handleEditedMessage(message, telegramService) {
        const chatId = message.chat.id;
        console.log(`Message edited in chat ${chatId}`);
        // Add your logic for handling edited messages
    }

    // Daily Settlement Methods
    static async getDailySettlementPage(req, res) {
        try {
            res.render('telegram/settlement', {
                title: 'Daily Settlement',
                subTitle: 'Daily Settlement Report',
                activePage: 'daily_settlement',
                user: req.user
            });
        } catch (error) {
            console.error('Error rendering daily settlement page:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                subTitle: '500 Error'
            });
        }
    }

    static async getDailySettlement(req, res) {
        try {
            const DailySettlementModel = require('../models/dailySettlementModel');
            const settlement = await DailySettlementModel.getDailySettlement();
            res.json({ success: true, data: settlement });
        } catch (error) {
            console.error('Error getting daily settlement:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get daily settlement: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async sendDailySettlement(req, res) {
        try {
            // Get chatId from saved config
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.CHAT_ID) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Chat ID not configured. Please save Chat ID in Telegram bot configuration first.' 
                });
            }

            // Get section from request body (booking, expected, availability, sales)
            const section = req.body?.section || null;

            const result = await DailySettlementService.sendReport(config.CHAT_ID, section);
            
            res.json({ 
                success: true, 
                message: 'Daily settlement report sent successfully',
                data: result.data
            });
        } catch (error) {
            console.error('Error sending daily settlement:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send daily settlement: ' + (error.message || 'Unknown error')
            });
        }
    }

    // ========================================
    // KAKAOTALK METHODS
    // ========================================

    /**
     * Initiate KakaoTalk OAuth login
     */
    static async kakaoLogin(req, res) {
        try {
            const config = await KakaoTalkModel.getConfig();
            
            if (!config || !config.REST_API_KEY) {
                return res.status(400).json({
                    success: false,
                    message: 'KakaoTalk REST API Key not configured. Please configure it in settings first.'
                });
            }

            const redirectUri = `${req.protocol}://${req.get('host')}/telegram/kakao/callback`;
            // Request talk_message scope for sending messages
            const scope = 'talk_message';
            const kakaoAuthURL = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${config.REST_API_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

            console.log('Kakao OAuth URL:', kakaoAuthURL);

            res.json({
                success: true,
                authUrl: kakaoAuthURL
            });
        } catch (error) {
            console.error('Error initiating KakaoTalk login:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initiate KakaoTalk login: ' + (error.message || 'Unknown error')
            });
        }
    }

    /**
     * KakaoTalk OAuth callback
     */
    static async kakaoCallback(req, res) {
        try {
            const { code } = req.query;
            
            if (!code) {
                return res.redirect('/telegram/settings?error=no_code');
            }

            const config = await KakaoTalkModel.getConfig();
            
            if (!config || !config.REST_API_KEY) {
                return res.redirect('/telegram/settings?error=no_api_key');
            }

            const redirectUri = `${req.protocol}://${req.get('host')}/telegram/kakao/callback`;

            // Exchange code for access token
            const tokenParams = querystring.stringify({
                grant_type: 'authorization_code',
                client_id: config.REST_API_KEY,
                redirect_uri: redirectUri,
                code: code
            });

            const tokenResponse = await axios.post(
                'https://kauth.kakao.com/oauth/token',
                tokenParams,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
                    }
                }
            );

            console.log('Token response received:', {
                hasAccessToken: !!tokenResponse.data.access_token,
                hasRefreshToken: !!tokenResponse.data.refresh_token,
                scope: tokenResponse.data.scope
            });

            const { access_token, refresh_token } = tokenResponse.data;

            // Get user info
            const userInfoResponse = await axios.get(
                'https://kapi.kakao.com/v2/user/me',
                {
                    headers: {
                        'Authorization': `Bearer ${access_token}`
                    }
                }
            );

            // Save access token
            await KakaoTalkModel.updateAccessToken(
                access_token,
                refresh_token,
                req.user?.userId || null
            );

            // Update user info if needed
            await KakaoTalkModel.saveConfig(
                config.REST_API_KEY,
                access_token,
                refresh_token,
                userInfoResponse.data,
                req.user?.userId || null
            );

            res.redirect('/telegram/settings?kakao_success=true');
        } catch (error) {
            console.error('Error in KakaoTalk callback:', error);
            res.redirect(`/telegram/settings?error=${encodeURIComponent(error.response?.data?.error_description || error.message || 'unknown_error')}`);
        }
    }

    /**
     * Get KakaoTalk config
     */
    static async getKakaoConfig(req, res) {
        try {
            const config = await KakaoTalkModel.getConfig();
            if (!config) {
                return res.json({ success: true, data: null, message: 'No KakaoTalk configured' });
            }
            
            // Calculate days since last token update (EDITED_DT or ENCODED_DT)
            const lastUpdateDate = config.EDITED_DT || config.ENCODED_DT;
            let daysSinceLastAuth = null;
            let shouldShowReauth = false;
            
            if (lastUpdateDate && config.ACCESS_TOKEN) {
                const lastUpdate = new Date(lastUpdateDate);
                const now = new Date();
                const diffTime = Math.abs(now - lastUpdate);
                daysSinceLastAuth = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                // Show re-authenticate button if it's been 25+ days (refresh token expires in ~30 days)
                shouldShowReauth = daysSinceLastAuth >= 25;
            }
            
            // Don't send access token in response for security
            res.json({
                success: true,
                data: {
                    REST_API_KEY: config.REST_API_KEY,
                    hasAccessToken: !!config.ACCESS_TOKEN,
                    hasRefreshToken: !!config.REFRESH_TOKEN,
                    USER_INFO: config.USER_INFO ? JSON.parse(config.USER_INFO) : null,
                    daysSinceLastAuth: daysSinceLastAuth,
                    shouldShowReauth: shouldShowReauth
                }
            });
        } catch (error) {
            console.error('Error getting KakaoTalk config:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get KakaoTalk config: ' + (error.message || 'Unknown error')
            });
        }
    }

    /**
     * Save KakaoTalk REST API Key
     */
    static async saveKakaoConfig(req, res) {
        try {
            const { restApiKey } = req.body;
            
            if (!restApiKey) {
                return res.status(400).json({
                    success: false,
                    message: 'REST API Key is required'
                });
            }

            const existing = await KakaoTalkModel.getConfig();
            
            // Check if REST API Key has changed
            const apiKeyChanged = existing && existing.REST_API_KEY && existing.REST_API_KEY !== restApiKey;
            
            // If API key changed, clear access token and refresh token (user needs to re-authenticate)
            let accessToken = null;
            let refreshToken = null;
            let userInfo = null;
            
            if (!apiKeyChanged && existing) {
                // API key not changed, keep existing tokens
                accessToken = existing.ACCESS_TOKEN || null;
                refreshToken = existing.REFRESH_TOKEN || null;
                userInfo = existing.USER_INFO ? JSON.parse(existing.USER_INFO) : null;
            }
            // If API key changed, tokens will be null (cleared)

            await KakaoTalkModel.saveConfig(
                restApiKey,
                accessToken,
                refreshToken,
                userInfo,
                req.user?.userId || null
            );

            const message = apiKeyChanged 
                ? 'KakaoTalk REST API Key saved successfully. Please log in again with the new API key.'
                : 'KakaoTalk REST API Key saved successfully';

            res.json({
                success: true,
                message: message,
                apiKeyChanged: apiKeyChanged
            });
        } catch (error) {
            console.error('Error saving KakaoTalk config:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to save KakaoTalk config: ' + (error.message || 'Unknown error')
            });
        }
    }

    /**
     * Send settlement report via KakaoTalk
     */
    static async sendSettlementKakaoTalk(req, res) {
        try {
            const config = await KakaoTalkModel.getConfig();
            
            if (!config || !config.ACCESS_TOKEN) {
                return res.status(400).json({
                    success: false,
                    message: 'KakaoTalk not configured. Please complete OAuth authentication first.'
                });
            }

            // Get section from request body
            const section = req.body?.section || null;

            const result = await DailySettlementService.sendReportKakaoTalk(section);
            
            res.json({
                success: true,
                message: 'Daily settlement report sent successfully to KakaoTalk',
                data: result.data
            });
        } catch (error) {
            console.error('Error sending daily settlement via KakaoTalk:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send daily settlement via KakaoTalk: ' + (error.message || 'Unknown error')
            });
        }
    }

    /**
     * Test KakaoTalk connection
     */
    static async testKakaoTalk(req, res) {
        try {
            const config = await KakaoTalkModel.getConfig();
            
            if (!config) {
                return res.status(400).json({
                    success: false,
                    message: 'KakaoTalk not configured. Please save REST API Key first.'
                });
            }

            if (!config.ACCESS_TOKEN) {
                return res.status(400).json({
                    success: false,
                    message: 'KakaoTalk not authenticated. Please complete OAuth authentication first by clicking "Login with Kakao".'
                });
            }

            // Use sendMessageToSelfWithRefresh for automatic token refresh
            const kakaoTalkService = new KakaoTalkService(
                config.ACCESS_TOKEN,
                config.REFRESH_TOKEN,
                config.REST_API_KEY
            );
            const result = await kakaoTalkService.sendMessageToSelfWithRefresh('Hello, This is Hotel Management System');

            // If token was refreshed, save the new tokens to database
            if (result.tokenRefreshed && result.newAccessToken) {
                await KakaoTalkModel.updateAccessToken(
                    result.newAccessToken,
                    result.newRefreshToken || config.REFRESH_TOKEN,
                    req.user?.userId || null
                );
                console.log('KakaoTalk access token refreshed and saved to database');
            }

            console.log('KakaoTalk test result:', {
                success: result.success,
                message: result.message,
                hasData: !!result.data,
                tokenRefreshed: result.tokenRefreshed || false
            });

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Test message sent successfully to your KakaoTalk!'
                });
            } else {
                // Log detailed error for debugging
                console.error('KakaoTalk test failed:', {
                    message: result.message,
                    configExists: !!config,
                    accessTokenExists: !!config.ACCESS_TOKEN,
                    accessTokenLength: config.ACCESS_TOKEN ? config.ACCESS_TOKEN.length : 0
                });
                
                res.status(400).json({
                    success: false,
                    message: 'Failed to send test message: ' + (result.message || 'Unknown error'),
                    details: result.message
                });
            }
        } catch (error) {
            console.error('Error testing KakaoTalk:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test KakaoTalk: ' + (error.message || 'Unknown error')
            });
        }
    }
}

// Helper function to process updates asynchronously
async function processTelegramUpdate(update) {
    await TelegramController.processUpdate(update);
}

module.exports = TelegramController;

