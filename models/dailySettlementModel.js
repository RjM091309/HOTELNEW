const { queryDatabasePromise } = require('../config/database');
const moment = require('moment');

class DailySettlementModel {
    
    /**
     * Get daily settlement data
     * Period: Yesterday 7:00 AM to Today 6:59 AM
     */
    static async getDailySettlement() {
        try {
            // Calculate date range: Yesterday 7:00 AM to Today 6:59 AM
            const today = moment();
            const yesterday = moment().subtract(1, 'days');
            
            const periodStart = yesterday.clone().set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
            const periodEnd = today.clone().set({ hour: 6, minute: 59, second: 59, millisecond: 999 });
            
            // Get check-ins during the period
            const checkIns = await this.getCheckIns(periodStart, periodEnd);
            
            // Get check-outs during the period
            const checkOuts = await this.getCheckOuts(periodStart, periodEnd);
            
            // Get pending bookings during the period
            const pending = await this.getPending(periodStart, periodEnd);
            
            // Get expected room availability for today
            const roomAvailability = await this.getExpectedRoomAvailability(today);
            
            // Get expected check-ins/out for today (detailed lists)
            const expectedCheckInsToday = await this.getExpectedCheckInsToday(today);
            const expectedCheckOutsToday = await this.getExpectedCheckOutsToday(today);
            
            // Align counts with detailed data
            roomAvailability.expectedCheckIns = expectedCheckInsToday.count;
            roomAvailability.expectedCheckOuts = expectedCheckOutsToday.count;
            
            // Get sales/revenue data
            const sales = await this.getSalesRevenue(periodStart, periodEnd);
            
            return {
                period: {
                    start: periodStart.format('YYYY-MM-DD HH:mm:ss'),
                    end: periodEnd.format('YYYY-MM-DD HH:mm:ss'),
                    startFormatted: periodStart.format('MMM DD, YYYY hh:mm A'),
                    endFormatted: periodEnd.format('MMM DD, YYYY hh:mm A')
                },
                checkIns,
                checkOuts,
                pending,
                expectedCheckInsToday,
                expectedCheckOutsToday,
                roomAvailability,
                sales,
                generatedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            };
        } catch (error) {
            console.error('Error getting daily settlement:', error);
            throw error;
        }
    }
    
    /**
     * Get check-ins during the period
     */
    static async getCheckIns(periodStart, periodEnd) {
        try {
            const query = `
                SELECT 
                    b.IDNo,
                    b.CONFIRMATION_NUMBER,
                    r.ROOM_NUMBER,
                    c.NAME AS CUSTOMER_NAME,
                    DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d %H:%i:%s') AS CHECK_IN_DATE,
                    DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS CHECK_OUT_DATE,
                    b.BOOKING_STATUS,
                    b.GUESTS_COUNT,
                    b.BOOKING_CHANNEL,
                    CASE 
                        WHEN b.CHECK_IN_STATUS = 0 THEN 'Late Check-In'
                        WHEN b.CHECK_IN_STATUS = 1 THEN 'Regular Check-In'
                        ELSE 'Regular Check-In'
                    END AS CHECK_IN_TYPE
                FROM booking b
                LEFT JOIN room r ON b.ROOM_ID = r.IDNo
                LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'check-In'
                    AND b.CHECK_IN_DATE >= ?
                    AND b.CHECK_IN_DATE <= ?
                ORDER BY b.CHECK_IN_DATE ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting check-ins:', error);
            throw error;
        }
    }
    
    /**
     * Get check-outs during the period
     */
    static async getCheckOuts(periodStart, periodEnd) {
        try {
            const query = `
                SELECT 
                    b.IDNo,
                    b.CONFIRMATION_NUMBER,
                    r.ROOM_NUMBER,
                    c.NAME AS CUSTOMER_NAME,
                    DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS CHECK_IN_DATE,
                    DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d %H:%i:%s') AS CHECK_OUT_DATE,
                    b.BOOKING_STATUS,
                    b.GUESTS_COUNT,
                    b.BOOKING_CHANNEL,
                    CASE 
                        WHEN b.LATE_CHECKOUT = 1 THEN 'Late Check-Out'
                        WHEN b.LATE_CHECKOUT = 0 OR b.LATE_CHECKOUT IS NULL THEN 'Regular Check-Out'
                        ELSE 'Regular Check-Out'
                    END AS CHECK_OUT_TYPE,
                    GREATEST(1, DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE)) AS STAY_DAYS
                FROM booking b
                LEFT JOIN room r ON b.ROOM_ID = r.IDNo
                LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'check-Out'
                    AND b.CHECK_OUT_DATE >= ?
                    AND b.CHECK_OUT_DATE <= ?
                ORDER BY b.CHECK_OUT_DATE ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting check-outs:', error);
            throw error;
        }
    }
    
    /**
     * Get pending bookings during the period
     */
    static async getPending(periodStart, periodEnd) {
        try {
            const query = `
                SELECT 
                    b.IDNo,
                    b.CONFIRMATION_NUMBER,
                    r.ROOM_NUMBER,
                    c.NAME AS CUSTOMER_NAME,
                    DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d %H:%i:%s') AS CHECK_IN_DATE,
                    DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS CHECK_OUT_DATE,
                    b.BOOKING_STATUS,
                    b.GUESTS_COUNT,
                    b.BOOKING_CHANNEL,
                    GREATEST(1, DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE)) AS STAY_DAYS
                FROM booking b
                LEFT JOIN room r ON b.ROOM_ID = r.IDNo
                LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'pending'
                    AND b.CHECK_IN_DATE >= ?
                    AND b.CHECK_IN_DATE <= ?
                ORDER BY b.CHECK_IN_DATE ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting pending bookings:', error);
            throw error;
        }
    }
    
    /**
     * Get expected check-ins today (detailed)
     */
    static async getExpectedCheckInsToday(today) {
        try {
            const query = `
                SELECT 
                    b.IDNo,
                    b.CONFIRMATION_NUMBER,
                    r.ROOM_NUMBER,
                    c.NAME AS CUSTOMER_NAME,
                    DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d %H:%i:%s') AS CHECK_IN_DATE,
                    DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS CHECK_OUT_DATE,
                    b.BOOKING_STATUS,
                    b.GUESTS_COUNT,
                    b.BOOKING_CHANNEL
                FROM booking b
                LEFT JOIN room r ON b.ROOM_ID = r.IDNo
                LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'pending'
                    AND DATE(b.CHECK_IN_DATE) = DATE(?)
                ORDER BY b.CHECK_IN_DATE ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                today.format('YYYY-MM-DD')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting expected check-ins today:', error);
            throw error;
        }
    }
    
    /**
     * Get expected check-outs today (detailed)
     */
    static async getExpectedCheckOutsToday(today) {
        try {
            const query = `
                SELECT 
                    b.IDNo,
                    b.CONFIRMATION_NUMBER,
                    r.ROOM_NUMBER,
                    c.NAME AS CUSTOMER_NAME,
                    DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS CHECK_IN_DATE,
                    DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d %H:%i:%s') AS CHECK_OUT_DATE,
                    b.BOOKING_STATUS,
                    b.GUESTS_COUNT,
                    b.BOOKING_CHANNEL,
                    GREATEST(1, DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE)) AS STAY_DAYS
                FROM booking b
                LEFT JOIN room r ON b.ROOM_ID = r.IDNo
                LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'check-In'
                    AND DATE(b.CHECK_OUT_DATE) = DATE(?)
                ORDER BY b.CHECK_OUT_DATE ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                today.format('YYYY-MM-DD')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting expected check-outs today:', error);
            throw error;
        }
    }
    
    /**
     * Get expected room availability for today
     */
    static async getExpectedRoomAvailability(today) {
        try {
            // Get total active rooms (including all statuses)
            const totalRoomsQuery = `
                SELECT COUNT(*) AS TOTAL_ROOMS
                FROM room
                WHERE ACTIVE = 1
            `;
            const totalRoomsResult = await queryDatabasePromise(totalRoomsQuery);
            const totalRooms = totalRoomsResult[0]?.TOTAL_ROOMS || 0;
            
            // Get occupied rooms (currently checked in)
            const occupiedRoomsQuery = `
                SELECT COUNT(DISTINCT r.IDNo) AS OCCUPIED_ROOMS
                FROM room r
                INNER JOIN booking b ON r.IDNo = b.ROOM_ID
                WHERE r.ACTIVE = 1 
                    AND b.ACTIVE = 1
                    AND b.BOOKING_STATUS = 'check-In'
                   
            `;
            const occupiedResult = await queryDatabasePromise(occupiedRoomsQuery, [
                today.format('YYYY-MM-DD'),
                today.format('YYYY-MM-DD')
            ]);
            const occupiedRooms = occupiedResult[0]?.OCCUPIED_ROOMS || 0;
            
            // Get rooms in cleaning status
            const cleaningRoomsQuery = `
                SELECT COUNT(*) AS CLEANING_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND ROOM_STATUS = 4
            `;
            const cleaningResult = await queryDatabasePromise(cleaningRoomsQuery);
            const cleaningRooms = cleaningResult[0]?.CLEANING_ROOMS || 0;
            
            // Get maintenance rooms
            const maintenanceRoomsQuery = `
                SELECT COUNT(*) AS MAINTENANCE_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND ROOM_STATUS = 3
            `;
            const maintenanceResult = await queryDatabasePromise(maintenanceRoomsQuery);
            const maintenanceRooms = maintenanceResult[0]?.MAINTENANCE_ROOMS || 0;
            
            // Calculate available rooms
            const availableRooms = totalRooms - occupiedRooms - cleaningRooms - maintenanceRooms;
            
            // Get expected check-ins today
            const expectedCheckInsQuery = `
                SELECT COUNT(*) AS EXPECTED_CHECK_INS
                FROM booking
                WHERE ACTIVE = 1
                    AND BOOKING_STATUS = 'pending'
                    AND DATE(CHECK_IN_DATE) = DATE(?)
            `;
            const expectedCheckInsResult = await queryDatabasePromise(expectedCheckInsQuery, [
                today.format('YYYY-MM-DD')
            ]);
            const expectedCheckIns = expectedCheckInsResult[0]?.EXPECTED_CHECK_INS || 0;
            
            // Get expected check-outs today
            const expectedCheckOutsQuery = `
                SELECT COUNT(*) AS EXPECTED_CHECK_OUTS
                FROM booking
                WHERE ACTIVE = 1
                    AND BOOKING_STATUS = 'check-In'
                    AND DATE(CHECK_OUT_DATE) = DATE(?)
            `;
            const expectedCheckOutsResult = await queryDatabasePromise(expectedCheckOutsQuery, [
                today.format('YYYY-MM-DD')
            ]);
            const expectedCheckOuts = expectedCheckOutsResult[0]?.EXPECTED_CHECK_OUTS || 0;
            
            const activeRooms = totalRooms - maintenanceRooms;
            
            return {
                totalRooms,
                occupiedRooms,
                cleaningRooms,
                maintenanceRooms,
                availableRooms,
                expectedCheckIns,
                expectedCheckOuts,
                occupancyRate: activeRooms > 0 ? ((occupiedRooms / activeRooms) * 100).toFixed(2) : 0
            };
        } catch (error) {
            console.error('Error getting room availability:', error);
            throw error;
        }
    }
    
    /**
     * Get sales revenue data for the period
     * Room Revenue: Payments with PAYMENT_TYPE = 'room'
     * Sales Revenue: Payments with PAYMENT_TYPE = 'service', 'extended', 'pickdrop', etc.
     */
    static async getSalesRevenue(periodStart, periodEnd) {
        try {
            // Get Room Revenue - payments made for room charges during the period
            const roomRevenueQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS ROOM_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE = 'room'
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const roomRevenueResult = await queryDatabasePromise(roomRevenueQuery, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const roomRevenue = parseFloat(roomRevenueResult[0]?.ROOM_REVENUE || 0);
            
            // Get Sales Revenue - payments made for services, extensions, pickdrop, etc.
            const salesRevenueQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS SERVICES_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE IN ('service', 'extended', 'pickdrop')
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const salesRevenueResult = await queryDatabasePromise(salesRevenueQuery, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const servicesRevenue = parseFloat(salesRevenueResult[0]?.SERVICES_REVENUE || 0);
            
            // Calculate Total Revenue
            const totalRevenue = roomRevenue + servicesRevenue;
            
            return {
                roomRevenue: roomRevenue.toFixed(2),
                servicesRevenue: servicesRevenue.toFixed(2),
                totalRevenue: totalRevenue.toFixed(2)
            };
        } catch (error) {
            console.error('Error getting services revenue:', error);
            throw error;
        }
    }
}

module.exports = DailySettlementModel;

