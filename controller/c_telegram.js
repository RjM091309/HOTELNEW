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
            
            // Extract bot username from BOT_NAME if available (format: "Name (@username)")
            let botUsername = null;
            if (config.BOT_NAME) {
                const usernameMatch = config.BOT_NAME.match(/@(\w+)\)/);
                if (usernameMatch) {
                    botUsername = usernameMatch[1];
                }
            }
            
            // If username not found in BOT_NAME, try to get it from bot API
            if (!botUsername && config.BOT_TOKEN) {
                try {
                    const telegramService = new TelegramService(config.BOT_TOKEN);
                    const botInfo = await telegramService.getMe();
                    if (botInfo.success && botInfo.data && botInfo.data.username) {
                        botUsername = botInfo.data.username;
                    }
                } catch (error) {
                    console.error('Error getting bot info:', error);
                }
            }
            
            // Add bot username and link to response
            const responseData = {
                ...config,
                BOT_USERNAME: botUsername,
                BOT_LINK: botUsername ? `https://t.me/${botUsername}` : null
            };
            
            // For settings page, send full token (it's a secure page)
            // For API calls, we can mask it if needed
            res.json({ success: true, data: responseData });
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

            // Set up bot commands menu - only reports
            await TelegramController.setupBotCommands(telegramService);

            // Set chat menu button to show commands (persistent menu)
            if (chatId) {
                await telegramService.setChatMenuButton(chatId);
            }

            // Restart polling if it was running (for testing without webhook)
            if (isPolling) {
                restartPolling().catch(err => {
                    console.error('Error restarting polling after config save:', err);
                });
            } else {
                // Start polling if bot is configured
                startPolling().catch(err => {
                    console.error('Error starting polling after config save:', err);
                });
            }

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

    // Polling Control Methods (for testing without webhook)
    static async startPolling(req, res) {
        try {
            await startPolling();
            res.json({ 
                success: true, 
                message: 'Polling started successfully',
                isPolling: isPolling
            });
        } catch (error) {
            console.error('Error starting polling:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to start polling: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async stopPolling(req, res) {
        try {
            stopPolling();
            res.json({ 
                success: true, 
                message: 'Polling stopped successfully',
                isPolling: isPolling
            });
        } catch (error) {
            console.error('Error stopping polling:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to stop polling: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async getPollingStatus(req, res) {
        try {
            res.json({ 
                success: true, 
                isPolling: isPolling,
                message: isPolling ? 'Polling is active' : 'Polling is not active'
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get polling status'
            });
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

    // Helper function to get report buttons (to avoid duplication)
    static getReportButtons() {
        return [
            [
                { text: '📅 체크인 & 아웃 현황', callback_data: 'report_booking' },
                { text: '📋 예약현황', callback_data: 'report_expected' }
            ],
            [
                { text: '🏨 실시간 가용객실 현황', callback_data: 'report_availability' },
                { text: '💰 일 매출 현황', callback_data: 'report_sales' }
            ]
        ];
    }

    // Helper function to set up bot commands (to avoid duplication)
    static async setupBotCommands(telegramService) {
        const commands = [
            { command: 'reports', description: 'Show report buttons' }
        ];
        await telegramService.setMyCommands(commands);
    }

    static async handleMessage(message, telegramService) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const username = message.from?.username || 'Unknown';

        // Get report buttons using helper function
        const reportButtons = this.getReportButtons();

        // Handle /start command - show welcome with buttons
        if (text.startsWith('/start')) {
            const result = await telegramService.sendMessageWithKeyboard(
                chatId,
                '🏨 Welcome!\n\n' +
                'Select a report to view:',
                reportButtons
            );
            if (!result.success) {
                console.error('Error sending /start message with keyboard:', result.message);
            }
        }
        // Handle /help command - show help with buttons
        else if (text.startsWith('/help')) {
            const result = await telegramService.sendMessageWithKeyboard(
                chatId,
                'Hotel Management Bot\n\n' +
                'Available Commands:\n' +
                '/start - Start the bot\n' +
                '/help - Show this help\n' +
                '/status - Check bot status\n\n' +
                'Select a report below:',
                reportButtons
            );
            if (!result.success) {
                console.error('Error sending /help message with keyboard:', result.message);
            }
        }
        // Handle /status command - show status with buttons
        else if (text.startsWith('/status')) {
            const botInfo = await telegramService.getMe();
            if (botInfo.success) {
                const statusMessage = `Bot Status: ✅ Active\n` +
                    `Bot Name: ${botInfo.data.first_name}\n` +
                    `Username: @${botInfo.data.username}\n` +
                    `Bot ID: ${botInfo.data.id}\n\n` +
                    `Select a report below:`;
                
                const result = await telegramService.sendMessageWithKeyboard(
                    chatId,
                    statusMessage,
                    reportButtons
                );
                if (!result.success) {
                    console.error('Error sending /status message with keyboard:', result.message);
                }
            }
        }
        // Handle /reports command - show buttons
        else if (text.startsWith('/reports')) {
            const result = await telegramService.sendMessageWithKeyboard(
                chatId,
                '📊 Select the report you want to view:',
                reportButtons
            );
            if (!result.success) {
                console.error('Error sending /reports message with keyboard:', result.message);
                // Try to send without buttons as fallback
                await telegramService.sendMessage(
                    chatId,
                    '❌ Error showing buttons. Please try again or contact support.'
                );
            }
        }
        // Handle other messages - do nothing (no response)
        // Users should use commands like /start, /reports, /help, /status
    }

    static async handleCallbackQuery(callbackQuery, telegramService) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const queryId = callbackQuery.id;

        // Answer the callback query to remove loading state
        await telegramService.answerCallbackQuery(queryId, 'Loading report...', false);

        try {
            // Get bot configuration
            const config = await TelegramModel.getBotConfig();
            if (!config || !config.BOT_TOKEN) {
                await telegramService.sendMessage(chatId, '❌ Error: Telegram bot not configured');
                return;
            }

            // Handle different report types
            let section = null;
            let reportName = '';

            if (data === 'report_booking') {
                section = 'booking';
                reportName = '체크인 & 아웃 현황';
            } else if (data === 'report_expected') {
                section = 'expected';
                reportName = '예약현황';
            } else if (data === 'report_availability') {
                section = 'availability';
                reportName = '실시간 가용객실 현황';
            } else if (data === 'report_sales') {
                section = 'sales';
                reportName = '일 매출 현황';
            } else {
                await telegramService.sendMessage(chatId, '❌ Unknown report type');
                return;
            }

            // Generate and send the report
            const report = await DailySettlementService.generateReport(section);
            
            // Send the report
            const result = await telegramService.sendMessage(chatId, report, {
                parse_mode: 'Markdown'
            });

            if (!result.success) {
                await telegramService.sendMessage(
                    chatId, 
                    `❌ Error sending ${reportName} report: ${result.message || 'Unknown error'}`
                );
            }

        } catch (error) {
            console.error('Error handling callback query:', error);
            await telegramService.sendMessage(
                chatId, 
                `❌ Error generating report: ${error.message || 'Unknown error'}`
            );
        }
    }

    static async handleEditedMessage(message, telegramService) {
        const chatId = message.chat.id;
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
            
            // Check if result indicates chat not found
            if (!result.success && result.errorCode === 'CHAT_NOT_FOUND') {
                return res.status(400).json({ 
                    success: false, 
                    message: result.message || 'Chat not found. Please make sure the user has started a conversation with the bot by sending /start command.',
                    errorCode: 'CHAT_NOT_FOUND'
                });
            }
            
            if (!result.success) {
                return res.status(500).json({ 
                    success: false, 
                    message: result.message || 'Failed to send daily settlement report'
                });
            }
            
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
            }

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

    /**
     * Delete KakaoTalk configuration
     */
    static async deleteKakaoConfig(req, res) {
        try {
            const deleted = await KakaoTalkModel.deleteConfig(req.user?.userId || null);
            
            if (deleted) {
                res.json({ success: true, message: 'KakaoTalk configuration deleted successfully' });
            } else {
                res.status(404).json({ success: false, message: 'No KakaoTalk configuration found to delete' });
            }
        } catch (error) {
            console.error('Error deleting KakaoTalk config:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to delete KakaoTalk configuration: ' + (error.message || 'Unknown error')
            });
        }
    }
}

// Helper function to process updates asynchronously
async function processTelegramUpdate(update) {
    await TelegramController.processUpdate(update);
}

// Polling variables
let pollingInterval = null;
let lastUpdateId = 0;
let isPolling = false;

/**
 * Start polling for Telegram updates (for testing without webhook)
 */
async function startPolling() {
    if (isPolling) {
        return;
    }

    try {
        const config = await TelegramModel.getBotConfig();
        if (!config || !config.BOT_TOKEN) {
            return;
        }

        isPolling = true;

        const telegramService = new TelegramService(config.BOT_TOKEN);

        // Delete any existing webhook first (polling and webhook can't work together)
        await telegramService.deleteWebhook();

        // Set up bot commands menu - only reports
        await TelegramController.setupBotCommands(telegramService);

        // Start polling
        pollForUpdates(telegramService);
    } catch (error) {
        console.error('Error starting Telegram polling:', error);
        isPolling = false;
    }
}

/**
 * Poll for updates from Telegram
 */
async function pollForUpdates(telegramService) {
    if (!isPolling) return;

    try {
        const result = await telegramService.getUpdates({
            offset: lastUpdateId + 1,
            timeout: 30, // Long polling - wait up to 30 seconds
            limit: 100
        });

        if (result.success && result.data && result.data.length > 0) {
            for (const update of result.data) {
                // Update lastUpdateId
                if (update.update_id >= lastUpdateId) {
                    lastUpdateId = update.update_id;
                }

                // Process the update
                await TelegramController.processUpdate(update);
            }
        }
    } catch (error) {
        console.error('Error polling for updates:', error);
        // Wait a bit before retrying on error
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Continue polling
    if (isPolling) {
        setTimeout(() => pollForUpdates(telegramService), 100); // Small delay before next poll
    }
}

/**
 * Stop polling for Telegram updates
 */
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    isPolling = false;
}

/**
 * Restart polling (useful when bot config changes)
 */
async function restartPolling() {
    stopPolling();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await startPolling();
}

// Export polling functions
TelegramController.startPolling = startPolling;
TelegramController.stopPolling = stopPolling;
TelegramController.restartPolling = restartPolling;
TelegramController.isPolling = () => isPolling;

// Auto-start polling when module loads (if bot is configured)
// This allows testing without webhook setup
startPolling().catch(error => {
    console.error('Failed to start Telegram polling on startup:', error);
});

module.exports = TelegramController;

