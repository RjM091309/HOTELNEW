const DailySettlementModel = require('../models/dailySettlementModel');
const TelegramModel = require('../models/telegramModel');
const TelegramService = require('./telegramService');
const KakaoTalkModel = require('../models/kakaoTalkModel');
const KakaoTalkService = require('./kakaoTalkService');
const moment = require('moment');

class DailySettlementService {
    
    /**
     * Generate and format daily settlement report
     * @param {string} section - Optional section to format (booking, expected, availability, sales)
     */
    static async generateReport(section = null) {
        try {
            const settlement = await DailySettlementModel.getDailySettlement();
            return this.formatReport(settlement, section);
        } catch (error) {
            console.error('Error generating daily settlement report:', error);
            throw error;
        }
    }
    
    /**
     * Format the report as text message for Telegram
     * @param {object} settlement - Settlement data
     * @param {string} section - Section to format (booking, expected, availability, sales)
     */
    static formatReport(settlement, section = null) {
        const { period, checkIns, checkOuts, pending, expectedCheckInsToday, expectedCheckOutsToday, roomAvailability, sales } = settlement;
        
        // Format based on section
        if (section === 'booking') {
            return this.formatBookingStatus(period, checkIns, checkOuts, pending);
        } else if (section === 'expected') {
            return this.formatExpectedToday(period, expectedCheckInsToday, expectedCheckOutsToday);
        } else if (section === 'availability') {
            return this.formatRoomAvailability(period, roomAvailability);
        } else if (section === 'sales') {
            return this.formatSalesRevenue(period, sales);
        } else {
            // Full report (default)
            return this.formatFullReport(period, checkIns, checkOuts, pending, expectedCheckInsToday, expectedCheckOutsToday, roomAvailability, sales);
        }
    }
    
    /**
     * Format Booking Status section
     */
    static formatBookingStatus(period, checkIns, checkOuts, pending) {
        let report = `📅 *BOOKING STATUS*\n\n`; //booking status
        report += `Period: ${period.startFormatted} to ${period.endFormatted}\n\n`; //period
        
        // Check-Ins
        report += `✅ *CHECK-INS* : ${checkIns.count}\n`; //check-ins
        // if (checkIns.count > 0) {
        //     checkIns.data.forEach(item => {
        //         report += `  • Room ${item.ROOM_NUMBER || 'N/A'}: ${item.CUSTOMER_NAME || 'N/A'}\n`;
        //         report += `    Date: ${item.CHECK_IN_DATE ? moment(item.CHECK_IN_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Type: ${item.CHECK_IN_TYPE}\n`;
        //         report += `    Confirmation: ${item.CONFIRMATION_NUMBER || 'N/A'}\n\n`;
        //     });
        // } else {
        //     report += `  No check-ins during this period\n\n`;
        // }
        report += `\n`;
        
        // Check-Outs
        report += `🚪 *CHECK-OUTS* : ${checkOuts.count}\n`; //check-outs    
        // if (checkOuts.count > 0) {
        //     checkOuts.data.forEach(item => {
        //         report += `  • Room ${item.ROOM_NUMBER || 'N/A'}: ${item.CUSTOMER_NAME || 'N/A'}\n`;
        //         report += `    Date: ${item.CHECK_OUT_DATE ? moment(item.CHECK_OUT_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Type: ${item.CHECK_OUT_TYPE}\n`;
        //         report += `    Stay Days: ${item.STAY_DAYS} day(s)\n`;
        //         report += `    Confirmation: ${item.CONFIRMATION_NUMBER || 'N/A'}\n\n`;
        //     });
        // } else {
        //     report += `  No check-outs during this period\n\n`;
        // }
        report += `\n`;
        
        // Pending
        report += `⏳ *PENDING* : ${pending.count}\n`; //pending
        // if (pending.count > 0) {
        //     pending.data.forEach(item => {
        //         report += `  • Room ${item.ROOM_NUMBER || 'N/A'}: ${item.CUSTOMER_NAME || 'N/A'}\n`;
        //         report += `    Check-In: ${item.CHECK_IN_DATE ? moment(item.CHECK_IN_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Check-Out: ${item.CHECK_OUT_DATE ? moment(item.CHECK_OUT_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Stay Days: ${item.STAY_DAYS} day(s)\n`;
        //         report += `    Confirmation: ${item.CONFIRMATION_NUMBER || 'N/A'}\n\n`;
        //     });
        // } else {
        //     report += `  No pending bookings during this period\n\n`;
        // }
        report += `\n`;
        
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`; //generated time
        return report;
    }
    
    /**
     * Format Expected Today section
     */
    static formatExpectedToday(period, expectedCheckInsToday, expectedCheckOutsToday) {
        let report = `📋 *EXPECTED TODAY*\n\n`; //expected today
        report += `Date: ${moment().format('MMM DD, YYYY')}\n\n`; //date
        
        // Expected Check-Ins Today
        report += `✅ *EXPECTED CHECK-INS TODAY* : ${expectedCheckInsToday.count}\n`; //expected check-ins today
        // if (expectedCheckInsToday.count > 0) {
        //     expectedCheckInsToday.data.forEach(item => {
        //         report += `  • Room ${item.ROOM_NUMBER || 'N/A'}: ${item.CUSTOMER_NAME || 'N/A'}\n`;
        //         report += `    Check-In: ${item.CHECK_IN_DATE ? moment(item.CHECK_IN_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Confirmation: ${item.CONFIRMATION_NUMBER || 'N/A'}\n\n`;
        //     });
        // } else {
        //     report += `  No check-ins scheduled for today\n\n`;
        // }
        report += `\n`;
        
        // Expected Check-Outs Today
        report += `🚪 *EXPECTED CHECK-OUTS TODAY* : ${expectedCheckOutsToday.count}\n`; //expected check-outs today
        // if (expectedCheckOutsToday.count > 0) {
        //     expectedCheckOutsToday.data.forEach(item => {
        //         report += `  • Room ${item.ROOM_NUMBER || 'N/A'}: ${item.CUSTOMER_NAME || 'N/A'}\n`;
        //         report += `    Check-Out: ${item.CHECK_OUT_DATE ? moment(item.CHECK_OUT_DATE).format('MMM DD, YYYY') : 'N/A'}\n`;
        //         report += `    Stay Days: ${item.STAY_DAYS || 0} day(s)\n`;
        //         report += `    Confirmation: ${item.CONFIRMATION_NUMBER || 'N/A'}\n\n`;
        //     });
        // } else {
        //     report += `  No check-outs scheduled for today\n\n`;
        // }
        report += `\n`;
        
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`; //generated time
        return report;
    }
    
    /**
     * Format Room Availability section
     */
    static formatRoomAvailability(period, roomAvailability) {
        let report = `🏨 *EXPECTED ROOM AVAILABILITY FOR TODAY*\n\n`; //expected room availability for today
        report += `Date: ${moment().format('MMM DD, YYYY')}\n\n`; //date
        
        report += `📊 *ROOM STATISTICS*\n`; //room statistics
        report += `Total Rooms: ${roomAvailability.totalRooms}\n`; //total rooms
        report += `✅ Available: ${roomAvailability.availableRooms}\n`; //available rooms
        report += `🛏️ Occupied: ${roomAvailability.occupiedRooms}\n`; //occupied rooms
        report += `🧹 Cleaning: ${roomAvailability.cleaningRooms}\n`; //cleaning rooms
        report += `🔧 Maintenance: ${roomAvailability.maintenanceRooms}\n`; //maintenance rooms
        report += `📈 Occupancy Rate: ${roomAvailability.occupancyRate}%\n\n`; //occupancy rate
        
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`; //generated time
        return report;
    }
    
    /**
     * Format Services Revenue section
     */
    static formatSalesRevenue(period, sales) {
        let report = `💰 *일 매출 정산*\n\n`; //daily sales settlement
        report += `Period: ${period.startFormatted} to ${period.endFormatted}\n\n`; //period
        
        report += `💵 *ROOM REVENUE*\n`; //room revenue
        report += `₱${parseFloat(sales.roomRevenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        
        report += `💳 *SERVICES REVENUE*\n`; //services revenue
        report += `₱${parseFloat(sales.servicesRevenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        
        report += `📊 *TOTAL REVENUE*\n`; //total revenue
        report += `₱${parseFloat(sales.totalRevenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`; //generated time
        return report;
    }
    
    /**
     * Format Full Report (all sections)
     */
    static formatFullReport(period, checkIns, checkOuts, pending, expectedCheckInsToday, expectedCheckOutsToday, roomAvailability, sales) {
        let report = `📊 *DAILY SETTLEMENT REPORT*\n\n`; //daily settlement report
        report += `📅 *Period:*\n`; //period
        report += `${period.startFormatted} to ${period.endFormatted}\n\n`; 
        
        // Check-Ins Section
        report += `✅ *CHECK-INS* : ${checkIns.count}\n`; //check-ins
        report += `\n`;
        
        // Check-Outs Section
        report += `🚪 *CHECK-OUTS* : ${checkOuts.count}\n`; //check-outs
        report += `\n`;
        
        // Pending Section
        report += `⏳ *PENDING* : ${pending.count}\n`; //pending
        report += `\n`;

        // Expected Today
        report += `📋 *EXPECTED FOR TODAY*\n`; //expected for today
        report += `Expected Check-Ins: ${roomAvailability.expectedCheckIns}\n`; //expected check-ins
        report += `Expected Check-Outs: ${roomAvailability.expectedCheckOuts}\n\n`; //expected check-outs
        
        // Room Availability Section
        report += `🏨 *EXPECTED ROOM AVAILABILITY FOR TODAY*\n`; //expected room availability for today
        report += `Total Rooms: ${roomAvailability.totalRooms}\n`; //total rooms
        report += `✅ Available: ${roomAvailability.availableRooms}\n`; //available rooms
        report += `🛏️ Occupied: ${roomAvailability.occupiedRooms}\n`; //occupied rooms
        report += `🧹 Cleaning: ${roomAvailability.cleaningRooms}\n`; //cleaning rooms
        report += `🔧 Maintenance: ${roomAvailability.maintenanceRooms}\n`;
        report += `📈 Occupancy Rate: ${roomAvailability.occupancyRate}%\n\n`; //occupancy rate
        
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`; //generated time
        
        return report;
    }
    
    /**
     * Send daily settlement report via Telegram
     * @param {string} chatId - Telegram chat ID to send to
     * @param {string} section - Optional section to send (booking, expected, availability, sales)
     */
    static async sendReport(chatId = null, section = null) {
        try {
            // Get bot configuration
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                throw new Error('Telegram bot not configured');
            }
            
            // Generate report with section
            const report = await this.generateReport(section);
            
            // If chatId not provided, we need to get it from somewhere
            // For now, we'll require it as parameter
            if (!chatId) {
                throw new Error('Chat ID is required to send report');
            }
            
            // Send via Telegram
            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.sendMessage(chatId, report, {
                parse_mode: 'Markdown'
            });
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to send report');
            }
            
            return {
                success: true,
                message: 'Daily settlement report sent successfully',
                data: result.data
            };
        } catch (error) {
            console.error('Error sending daily settlement report:', error);
            throw error;
        }
    }
    
    /**
     * Send daily settlement report via KakaoTalk (to yourself)
     * @param {string} section - Optional section to send (booking, expected, availability, sales)
     */
    static async sendReportKakaoTalk(section = null) {
        try {
            // Get KakaoTalk configuration
            const config = await KakaoTalkModel.getConfig();
            
            if (!config || !config.ACCESS_TOKEN) {
                throw new Error('KakaoTalk not configured. Please complete OAuth authentication first.');
            }
            
            // Generate report with section
            const report = await this.generateReport(section);
            
            // Send via KakaoTalk (to yourself) with automatic token refresh
            const kakaoTalkService = new KakaoTalkService(
                config.ACCESS_TOKEN,
                config.REFRESH_TOKEN,
                config.REST_API_KEY
            );
            const result = await kakaoTalkService.sendMessageToSelfWithRefresh(report);
            
            // If token was refreshed, save the new tokens to database
            if (result.tokenRefreshed && result.newAccessToken) {
                await KakaoTalkModel.updateAccessToken(
                    result.newAccessToken,
                    result.newRefreshToken || config.REFRESH_TOKEN,
                    null
                );
                console.log('KakaoTalk access token refreshed and saved to database');
            }
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to send report');
            }
            
            return {
                success: true,
                message: 'Daily settlement report sent successfully to KakaoTalk',
                data: result.data
            };
        } catch (error) {
            console.error('Error sending daily settlement report via KakaoTalk:', error);
            throw error;
        }
    }
}

module.exports = DailySettlementService;

