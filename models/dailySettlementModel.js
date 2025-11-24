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
            
            // Get total bookings today
            const totalBookingsToday = await this.getTotalBookingsToday(today);
            
            // Get total booked rooms today
            const totalBookedRoomsToday = await this.getTotalBookedRoomsToday(today);
            
            // Get occupancy rates
            const occupancyRateOfMonth = await this.getOccupancyRateOfMonth(today);
            const expectedOccupancyRateOfMonth = await this.getExpectedOccupancyRateOfMonth(today);
            
            // Get sales/revenue data
            const sales = await this.getSalesRevenue(periodStart, periodEnd);
            
            // Get monthly sales/revenue data
            const monthlySales = await this.getMonthlySalesRevenue(today);
            
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
                totalBookingsToday,
                totalBookedRoomsToday,
                roomAvailability,
                occupancyRateOfMonth,
                expectedOccupancyRateOfMonth,
                sales,
                monthlySales,
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
     * Get total bookings today (all bookings encoded today based on ENCODED_DT)
     */
    static async getTotalBookingsToday(today) {
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
                    AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                    AND DATE(b.ENCODED_DT) = DATE(?)
                ORDER BY b.ENCODED_DT ASC
            `;
            
            const results = await queryDatabasePromise(query, [
                today.format('YYYY-MM-DD')
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting total bookings today:', error);
            throw error;
        }
    }
    
    /**
     * Get total booked rooms today (unique rooms occupied today based on stay overlap)
     */
    static async getTotalBookedRoomsToday(today) {
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
                    AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                    AND DATE(?) >= DATE(b.CHECK_IN_DATE)
                    AND DATE(?) < DATE(b.CHECK_OUT_DATE)
                GROUP BY r.ROOM_NUMBER, b.IDNo
                ORDER BY b.CHECK_IN_DATE ASC
            `;
            
            const formattedDate = today.format('YYYY-MM-DD');
            const results = await queryDatabasePromise(query, [
                formattedDate,
                formattedDate
            ]);
            
            return {
                count: results.length,
                data: results
            };
        } catch (error) {
            console.error('Error getting total booked rooms today:', error);
            throw error;
        }
    }
    
    /**
     * Get occupancy rate of month (current month)
     */
    static async getOccupancyRateOfMonth(today) {
        try {
            const monthStart = today.clone().startOf('month');
            const monthEnd = today.clone().endOf('month');
            const monthEndPlusOne = monthEnd.clone().add(1, 'day');
            
            // Get total active rooms (excluding maintenance)
            const totalRoomsQuery = `
                SELECT COUNT(*) AS TOTAL_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND (ROOM_STATUS != 3 OR ROOM_STATUS IS NULL)
            `;
            const totalRoomsResult = await queryDatabasePromise(totalRoomsQuery);
            const totalRooms = totalRoomsResult[0]?.TOTAL_ROOMS || 0;
            
            // Get total occupied room nights for the month
            const occupiedNightsQuery = `
                SELECT 
                    SUM(
                        GREATEST(1, DATEDIFF(
                            LEAST(COALESCE(b.CHECK_OUT_DATE, CURDATE()), ?),
                            GREATEST(b.CHECK_IN_DATE, ?)
                        ))
                    ) AS OCCUPIED_NIGHTS
                FROM booking b
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS IN ('check-In', 'check-Out')
                    AND DATE(b.CHECK_IN_DATE) <= DATE(?)
                    AND (DATE(b.CHECK_OUT_DATE) >= DATE(?) OR b.CHECK_OUT_DATE IS NULL)
            `;
            
            const occupiedNightsResult = await queryDatabasePromise(occupiedNightsQuery, [
                monthEndPlusOne.format('YYYY-MM-DD'),
                monthStart.format('YYYY-MM-DD'),
                monthEnd.format('YYYY-MM-DD'),
                monthStart.format('YYYY-MM-DD')
            ]);
            const occupiedNights = occupiedNightsResult[0]?.OCCUPIED_NIGHTS || 0;
            
            // Calculate occupancy rate: (occupied nights / (total rooms * days in month)) * 100
            const daysInMonth = monthEnd.diff(monthStart, 'days') + 1;
            const totalAvailableNights = totalRooms * daysInMonth;
            const occupancyRate = totalAvailableNights > 0 
                ? ((occupiedNights / totalAvailableNights) * 100).toFixed(2) 
                : '0.00';
            
            return occupancyRate;
        } catch (error) {
            console.error('Error getting occupancy rate of month:', error);
            return '0.00';
        }
    }
    
    /**
     * Get expected occupancy rate of month (based on bookings)
     */
    static async getExpectedOccupancyRateOfMonth(today) {
        try {
            const monthStart = today.clone().startOf('month');
            const monthEnd = today.clone().endOf('month');
            const monthEndPlusOne = monthEnd.clone().add(1, 'day');
            
            // Get total active rooms (excluding maintenance)
            const totalRoomsQuery = `
                SELECT COUNT(*) AS TOTAL_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND (ROOM_STATUS != 3 OR ROOM_STATUS IS NULL)
            `;
            const totalRoomsResult = await queryDatabasePromise(totalRoomsQuery);
            const totalRooms = totalRoomsResult[0]?.TOTAL_ROOMS || 0;
            
            // Get total booked room nights for the month (all bookings, excluding cancelled)
            const bookedNightsQuery = `
                SELECT 
                    SUM(
                        GREATEST(1, DATEDIFF(
                            LEAST(b.CHECK_OUT_DATE, ?),
                            GREATEST(b.CHECK_IN_DATE, ?)
                        ))
                    ) AS BOOKED_NIGHTS
                FROM booking b
                WHERE b.ACTIVE = 1
                    AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                    AND DATE(b.CHECK_IN_DATE) <= DATE(?)
                    AND DATE(b.CHECK_OUT_DATE) >= DATE(?)
            `;
            
            const bookedNightsResult = await queryDatabasePromise(bookedNightsQuery, [
                monthEndPlusOne.format('YYYY-MM-DD'),
                monthStart.format('YYYY-MM-DD'),
                monthEnd.format('YYYY-MM-DD'),
                monthStart.format('YYYY-MM-DD')
            ]);
            const bookedNights = bookedNightsResult[0]?.BOOKED_NIGHTS || 0;
            
            // Calculate expected occupancy rate: (booked nights / (total rooms * days in month)) * 100
            const daysInMonth = monthEnd.diff(monthStart, 'days') + 1;
            const totalAvailableNights = totalRooms * daysInMonth;
            const expectedOccupancyRate = totalAvailableNights > 0 
                ? ((bookedNights / totalAvailableNights) * 100).toFixed(2) 
                : '0.00';
            
            return expectedOccupancyRate;
        } catch (error) {
            console.error('Error getting expected occupancy rate of month:', error);
            return '0.00';
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
                 SELECT COUNT(*) AS OCCUPIED_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND ROOM_STATUS = 2
                   
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
            
            // Get available rooms (vacant/ready status)
            const availableRoomsQuery = `
                SELECT COUNT(*) AS AVAILABLE_ROOMS
                FROM room
                WHERE ACTIVE = 1 AND ROOM_STATUS = 1
            `;
            const availableRoomsResult = await queryDatabasePromise(availableRoomsQuery);
            const availableRooms = availableRoomsResult[0]?.AVAILABLE_ROOMS || 0;
            
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
     * Room Revenue: Payments with PAYMENT_TYPE = 'room', 'extended' minus discounts
     * Sales Revenue: Payments with PAYMENT_TYPE = 'service', 'pickdrop', etc.
     * Total Revenue: Room + Services minus refunds
     */
    static async getSalesRevenue(periodStart, periodEnd) {
        try {
            // Get Room Revenue - payments made for room charges and extensions during the period
            // Include discounts only if booking is fully paid AND no refund exists (refund already includes discount)
            // Refunds always included
            const roomRevenueQuery = `
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN p.PAYMENT_TYPE = 'discount' THEN
                                -- Only include discount if:
                                -- 1. Booking is fully paid
                                -- 2. No refund exists for this booking (refund already includes discount)
                                CASE 
                                    WHEN EXISTS (
                                        SELECT 1 
                                        FROM billing bill
                                        WHERE bill.BOOKING_ID = p.BOOKING_ID
                                        AND bill.ACTIVE = 1
                                        AND (
                                            bill.PAYMENT_STATUS = 'paid'
                                            OR (
                                                (bill.ROOM_CHARGE * bill.QTY 
                                                - COALESCE(bill.RESERVATION_FEE, 0) 
                                                - COALESCE(bill.DISCOUNT_AMOUNT, 0)
                                                - COALESCE((
                                                    SELECT SUM(p2.AMOUNT_PAID) 
                                                    FROM payments p2 
                                                    WHERE p2.BOOKING_ID = bill.BOOKING_ID 
                                                    AND p2.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount')
                                                ), 0)) <= 0
                                            )
                                        )
                                    )
                                    AND NOT EXISTS (
                                        SELECT 1 
                                        FROM payments p_refund
                                        WHERE p_refund.BOOKING_ID = p.BOOKING_ID
                                        AND p_refund.PAYMENT_TYPE = 'refund'
                                        AND p_refund.PAYMENT_DATE >= ?
                                        AND p_refund.PAYMENT_DATE <= ?
                                    )
                                    THEN p.AMOUNT_PAID
                                    ELSE 0
                                END
                            ELSE p.AMOUNT_PAID
                        END
                    ), 0) AS ROOM_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE IN ('room', 'extended', 'discount', 'refund')
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const roomRevenueResult = await queryDatabasePromise(roomRevenueQuery, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss'),
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const roomRevenue = parseFloat(roomRevenueResult[0]?.ROOM_REVENUE || 0);
            
            // Get Sales Revenue - payments made for services, pickdrop, etc.
            const salesRevenueQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS SERVICES_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE IN ('service', 'pickdrop')
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const salesRevenueResult = await queryDatabasePromise(salesRevenueQuery, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const servicesRevenue = parseFloat(salesRevenueResult[0]?.SERVICES_REVENUE || 0);
            
            // Get Refunds - negative amounts that reduce revenue
            // Note: Refunds are already included in roomRevenue, but we need to get them separately for display
            const refundsQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS TOTAL_REFUNDS
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE = 'refund'
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const refundsResult = await queryDatabasePromise(refundsQuery, [
                periodStart.format('YYYY-MM-DD HH:mm:ss'),
                periodEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const totalRefunds = parseFloat(refundsResult[0]?.TOTAL_REFUNDS || 0);
            
            // Total Deductions - set to 0 since discounts and refunds are already in room revenue
            const totalDeductions = 0;
            
            // Calculate Total Revenue (Room + Services)
            // Note: refunds are already deducted from roomRevenue, so we don't need to subtract them again
            const totalRevenue = roomRevenue + servicesRevenue;
            
            return {
                roomRevenue: roomRevenue.toFixed(2),
                servicesRevenue: servicesRevenue.toFixed(2),
                totalDeductions: Math.abs(totalDeductions).toFixed(2), // Return as positive for display
                totalRevenue: totalRevenue.toFixed(2)
            };
        } catch (error) {
            console.error('Error getting services revenue:', error);
            throw error;
        }
    }
    
    /**
     * Get monthly sales revenue data for the current month
     * Room Revenue: Payments with PAYMENT_TYPE = 'room', 'extended' minus discounts
     * Sales Revenue: Payments with PAYMENT_TYPE = 'service', 'pickdrop', etc.
     * Total Revenue: Room + Services minus refunds
     */
    static async getMonthlySalesRevenue(today) {
        try {
            // Get start of current month
            const monthStart = today.clone().startOf('month').set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
            const monthEnd = today.clone().endOf('month').set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
            
            // Get Room Revenue - payments made for room charges and extensions during the month
            // Include discounts only if booking is fully paid AND no refund exists (refund already includes discount)
            // Refunds always included
            const roomRevenueQuery = `
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN p.PAYMENT_TYPE = 'discount' THEN
                                -- Only include discount if:
                                -- 1. Booking is fully paid
                                -- 2. No refund exists for this booking (refund already includes discount)
                                CASE 
                                    WHEN EXISTS (
                                        SELECT 1 
                                        FROM billing bill
                                        WHERE bill.BOOKING_ID = p.BOOKING_ID
                                        AND bill.ACTIVE = 1
                                        AND (
                                            bill.PAYMENT_STATUS = 'paid'
                                            OR (
                                                (bill.ROOM_CHARGE * bill.QTY 
                                                - COALESCE(bill.RESERVATION_FEE, 0) 
                                                - COALESCE(bill.DISCOUNT_AMOUNT, 0)
                                                - COALESCE((
                                                    SELECT SUM(p2.AMOUNT_PAID) 
                                                    FROM payments p2 
                                                    WHERE p2.BOOKING_ID = bill.BOOKING_ID 
                                                    AND p2.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount')
                                                ), 0)) <= 0
                                            )
                                        )
                                    )
                                    AND NOT EXISTS (
                                        SELECT 1 
                                        FROM payments p_refund
                                        WHERE p_refund.BOOKING_ID = p.BOOKING_ID
                                        AND p_refund.PAYMENT_TYPE = 'refund'
                                        AND p_refund.PAYMENT_DATE >= ?
                                        AND p_refund.PAYMENT_DATE <= ?
                                    )
                                    THEN p.AMOUNT_PAID
                                    ELSE 0
                                END
                            ELSE p.AMOUNT_PAID
                        END
                    ), 0) AS ROOM_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE IN ('room', 'extended', 'discount', 'refund')
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const roomRevenueResult = await queryDatabasePromise(roomRevenueQuery, [
                monthStart.format('YYYY-MM-DD HH:mm:ss'),
                monthEnd.format('YYYY-MM-DD HH:mm:ss'),
                monthStart.format('YYYY-MM-DD HH:mm:ss'),
                monthEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const roomRevenue = parseFloat(roomRevenueResult[0]?.ROOM_REVENUE || 0);
            
            // Get Sales Revenue - payments made for services, pickdrop, etc.
            const salesRevenueQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS SERVICES_REVENUE
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE IN ('service', 'pickdrop')
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const salesRevenueResult = await queryDatabasePromise(salesRevenueQuery, [
                monthStart.format('YYYY-MM-DD HH:mm:ss'),
                monthEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const servicesRevenue = parseFloat(salesRevenueResult[0]?.SERVICES_REVENUE || 0);
            
            // Get Refunds - negative amounts that reduce revenue
            // Note: Refunds are already included in roomRevenue, but we need to get them separately for display
            const refundsQuery = `
                SELECT 
                    COALESCE(SUM(p.AMOUNT_PAID), 0) AS TOTAL_REFUNDS
                FROM payments p
                INNER JOIN booking b ON p.BOOKING_ID = b.IDNo
                WHERE p.PAYMENT_TYPE = 'refund'
                    AND p.PAYMENT_DATE >= ?
                    AND p.PAYMENT_DATE <= ?
                    AND b.ACTIVE = 1
            `;
            
            const refundsResult = await queryDatabasePromise(refundsQuery, [
                monthStart.format('YYYY-MM-DD HH:mm:ss'),
                monthEnd.format('YYYY-MM-DD HH:mm:ss')
            ]);
            const totalRefunds = parseFloat(refundsResult[0]?.TOTAL_REFUNDS || 0);
            
            // Total Deductions - set to 0 since discounts and refunds are already in room revenue
            const totalDeductions = 0;
            
            // Calculate Total Revenue (Room + Services)
            // Note: refunds are already deducted from roomRevenue, so we don't need to subtract them again
            const totalRevenue = roomRevenue + servicesRevenue;
            
            return {
                roomRevenue: roomRevenue.toFixed(2),
                servicesRevenue: servicesRevenue.toFixed(2),
                totalDeductions: Math.abs(totalDeductions).toFixed(2), // Return as positive for display
                totalRevenue: totalRevenue.toFixed(2)
            };
        } catch (error) {
            console.error('Error getting monthly sales revenue:', error);
            throw error;
        }
    }
}

module.exports = DailySettlementModel;

