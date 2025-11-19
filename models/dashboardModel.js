const { pool, queryDatabase, queryDatabasePromise } = require('../config/database');
const axios = require('axios');

class DashboardModel {
  // Home Assistant integration - TEMPORARILY COMMENTED OUT DUE TO CONNECTION ISSUES
  // static HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
  // static HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwNmM5ZTE0NWM4YTk0OGMzOWMwMzczOTQ1YWQ3ZmU5YyIsImlhdCI6MTc0Mjg2Mzk5NiwiZXhwIjoyMDU4MjIzOTk2fQ.-lpBSu2I-jtbaS81_1oUrCDNb-A_pBiO6Fv3cGGq370';

  // Fetch Home Assistant state - TEMPORARILY COMMENTED OUT DUE TO CONNECTION ISSUES
  /*
  static async fetchHAState(deviceId) {
    try {
      const response = await axios.get(`${DashboardModel.HOME_ASSISTANT_URL}/api/states/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${DashboardModel.HA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.state;
    } catch (error) {
      console.error(`Error fetching HA state for device ${deviceId}:`, error.message);
      return 'off';
    }
  }
  */

  // Time utility functions
  static isCurrentTimeWithinSchedule(timeSchedule) {
    if (!timeSchedule) return false;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [start, end] = timeSchedule.split('-').map(time => {
      const [hours, minutes] = time.trim().split(':').map(Number);
      return hours * 60 + minutes;
    });
    
    return currentTime >= start && currentTime <= end;
  }

  static timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  }

  // Get user info
  static async getUserInfo(userId) {
    try {
      const users = await queryDatabasePromise('SELECT FULLNAME, PERMISSIONS, TAB_ORDER FROM user_info WHERE IDno = ?', [userId]);
      return users[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Get employees
  static async getEmployees() {
    try {
      const employees = await queryDatabasePromise(`
        SELECT e.FULLNAME, e.DEPARTMENT, e.PHOTO, IFNULL(s.status, 'Off Duty') AS status, s.timeSchedule, s.start, s.end 
        FROM schedules s 
        LEFT JOIN employee e 
        ON e.FULLNAME = s.title 
        WHERE e.ACTIVE = 1 AND e.DEPARTMENT IN ('Front Desk', 'Housekeeping', 'Maintenance')
      `);
      return employees;
    } catch (error) {
      throw error;
    }
  }

  // Get today check-in details
  static async getTodayCheckInDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          c.IS_GROUP,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
          rt.NAME AS RoomType,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT AS GuestCount,
          b.REMARKS AS BookingRemarks,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.IS_DIRECT_RESERVATION,
          b.BED_COUNT,
          b.REMARKS,
          b.CHECK_IN_STATUS,
          b.LATE_CHECKOUT,
          bill.QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          gt.TYPE AS CUSTOMER_TYPE,
          gl.TYPE AS CUSTOMER_LEVEL,
          COALESCE(rm.remarks_count, 0) AS RemarksCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, COUNT(*) as remarks_count 
          FROM remarks 
          WHERE ACTIVE = 1 
          GROUP BY BOOKING_ID
        ) rm ON b.IDNo = rm.BOOKING_ID
        WHERE b.ACTIVE = 1  
          AND DATE(b.CHECK_IN_DATE) <= CURDATE()
          AND b.IS_OCCUPIED = 0
          AND b.BOOKING_STATUS IN ('pending', 'check-In')
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get group booking details
  static async getGroupBookingDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.IS_GROUP,
          c.NAME AS CustomerName,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
          rt.NAME AS RoomType,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT AS GuestCount,
          b.REMARKS AS BookingRemarks,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.GROUP_BOOKING_ID,
          b.REMARKS,
          bill.QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          gt.TYPE AS CUSTOMER_TYPE,
          gl.TYPE AS CUSTOMER_LEVEL,
          COALESCE(rm.remarks_count, 0) AS RemarksCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, COUNT(*) as remarks_count 
          FROM remarks 
          WHERE ACTIVE = 1 
          GROUP BY BOOKING_ID
        ) rm ON b.IDNo = rm.BOOKING_ID
        WHERE DATE(b.CHECK_IN_DATE) <= CURDATE()
        AND b.ACTIVE = 1 AND c.IS_GROUP = 1
        ORDER BY b.GROUP_BOOKING_ID ASC, r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get late in/out details
  static async getLateInOutDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b1.ROOM_ID, 
          r.ROOM_NUMBER, 
          r.ROOM_FLOOR,
          c1.NAME AS CurrentGuest,
          c2.NAME AS NextGuest,
          b1.IDNo AS CurrentBookingID, 
          b1.CHECK_OUT_DATE AS CurrentCheckoutDate, 
          b1.BOOKING_STATUS AS CurrentBookingStatus,
          b1.TRANSFER AS CurrentTransferStatus,
          b1.LATE_CHECKOUT AS CurrentLateCheckout,
          b1.CHECK_IN_STATUS AS CurrentCheckInStatus,
          b2.IDNo AS NextBookingID, 
          b2.CHECK_IN_DATE AS NextCheckInDate, 
          b2.BOOKING_STATUS AS NextBookingStatus,
          b2.TRANSFER AS NextTransferStatus,
          b2.LATE_CHECKOUT AS NextLateCheckout,
          b2.CHECK_IN_STATUS AS NextCheckInStatus
        FROM booking b1
        JOIN room r ON b1.ROOM_ID = r.IDNo
        LEFT JOIN customer c1 ON b1.CUSTOMER_ID = c1.IDNo
        LEFT JOIN booking b2 ON b1.ROOM_ID = b2.ROOM_ID 
          AND DATE(b2.CHECK_IN_DATE) = DATE(b1.CHECK_OUT_DATE)
          AND b2.ACTIVE = 1
        LEFT JOIN customer c2 ON b2.CUSTOMER_ID = c2.IDNo
        WHERE 
          b1.LATE_CHECKOUT = 1
          AND b2.CHECK_IN_STATUS = 0
          AND b1.ACTIVE = 1 AND (DATE(b2.CHECK_IN_STATUS) = CURDATE() OR DATE(b1.CHECK_OUT_DATE) = CURDATE()) 
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get today checked out details
  static async getTodayCheckedOutDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
          rt.NAME AS RoomType,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT AS GuestCount,
          b.REMARKS AS BookingRemarks,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.LATE_CHECKOUT,
          b.REMARKS,
          bill.QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          gt.TYPE AS CUSTOMER_TYPE,
          gl.TYPE AS CUSTOMER_LEVEL,
          COALESCE(rm.remarks_count, 0) AS RemarksCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, COUNT(*) as remarks_count 
          FROM remarks 
          WHERE ACTIVE = 1 
          GROUP BY BOOKING_ID
        ) rm ON b.IDNo = rm.BOOKING_ID
        WHERE b.ACTIVE = 1 
          AND (
            (b.BOOKING_STATUS = 'check-In' AND DATE(b.CHECK_OUT_DATE) <= CURDATE())
            OR 
            (b.BOOKING_STATUS = 'check-Out' AND DATE(b.CHECK_OUT_DATE) = CURDATE())
          )
            AND r.ROOM_STATUS != 1
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get extended details
  static async getExtendedDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
          rt.NAME AS RoomType,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT AS GuestCount,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.TRANSFER,
          b.LATE_CHECKOUT,
          b.EXTENDED,
          bill.LATE_CHECKOUT_CHARGE,
          bill.QTY,
          bill.PAYMENT_STATUS,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          gt.TYPE AS CUSTOMER_TYPE,
          gl.TYPE AS CUSTOMER_LEVEL,
          COALESCE(rm.remarks_count, 0) AS RemarksCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, COUNT(*) as remarks_count 
          FROM remarks 
          WHERE ACTIVE = 1 
          GROUP BY BOOKING_ID
        ) rm ON b.IDNo = rm.BOOKING_ID
        WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.EXTENDED = 1
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get late checkout details
  static async getLateCheckOutDetails() {
    try {
      const details = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
          rt.NAME AS RoomType,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT AS GuestCount,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.TRANSFER,
          b.TRANSFER_FROM,
          b.LATE_CHECKOUT,
          bill.QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          gt.TYPE AS CUSTOMER_TYPE,
          gl.TYPE AS CUSTOMER_LEVEL,
          COALESCE(rm.remarks_count, 0) AS RemarksCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, COUNT(*) as remarks_count 
          FROM remarks 
          WHERE ACTIVE = 1 
          GROUP BY BOOKING_ID
        ) rm ON b.IDNo = rm.BOOKING_ID
        WHERE b.ACTIVE = 1 AND (DATE(b.CHECK_OUT_DATE) = CURDATE()) AND b.BOOKING_STATUS = 'check-In' AND b.LATE_CHECKOUT = 1 
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return details;
    } catch (error) {
      throw error;
    }
  }

  // Get dashboard counts
  static async getDashboardCounts() {
    try {
      const queries = {
        bookingToday: `
          SELECT COUNT(*) AS totalBookingsToday
          FROM booking
          WHERE DATE(CHECK_IN_DATE) <= CURDATE()
            AND BOOKING_STATUS IN ('pending', 'check-In')
            AND IS_OCCUPIED = 0
            AND ACTIVE = 1
        `,
        todayCheckedIn: `
          SELECT COUNT(*) AS TODAY_CHECKEDIN
          FROM booking
          WHERE ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 1
        `,
        todayCheckedOut: `
          SELECT COUNT(*) AS TODAY_CHECKEDOUT
          FROM booking
          WHERE DATE(CHECK_OUT_DATE) = CURDATE()
            AND ACTIVE = 1
        `,
        extended: `
          SELECT COUNT(*) AS EXTENDED
          FROM booking
          WHERE ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND EXTENDED = 1
        `,
        lateInOut: `
          SELECT COUNT(*) AS TotalLateInOut
          FROM booking b1
          JOIN room r ON b1.ROOM_ID = r.IDNo
          LEFT JOIN customer c1 ON b1.CUSTOMER_ID = c1.IDNo
          LEFT JOIN booking b2 ON b1.ROOM_ID = b2.ROOM_ID 
            AND DATE(b2.CHECK_IN_DATE) = DATE(b1.CHECK_OUT_DATE) 
            AND b2.ACTIVE = 1
          LEFT JOIN customer c2 ON b2.CUSTOMER_ID = c2.IDNo
          WHERE 
            b1.LATE_CHECKOUT = 1
            AND b2.CHECK_IN_STATUS = 0
            AND (DATE(b2.CHECK_IN_STATUS) = CURDATE() OR DATE(b1.CHECK_OUT_DATE) = CURDATE())
            AND b1.ACTIVE = 1
        `,
        bookingMonthly: `
          SELECT 
            COUNT(*) AS totalBookingsMonthly,
            SUM(CASE 
              WHEN DATE(CHECK_IN_DATE) < CURDATE()
              THEN 1
              ELSE 0 
            END) AS completedBookingsMonthly,
            SUM(CASE 
              WHEN DATE(CHECK_IN_DATE) >= CURDATE() 
              THEN 1
              ELSE 0 
            END) AS pendingBookingsMonthly
          FROM booking
          WHERE MONTH(CHECK_IN_DATE) = MONTH(CURDATE())
            AND YEAR(CHECK_IN_DATE) = YEAR(CURDATE())
            AND ACTIVE = 1
        `,
        totalSales: `
          SELECT SUM((ROOM_CHARGE * QTY) + AMENITIES_CHARGE + SERVICES_CHARGE) AS totalSales
          FROM billing
          WHERE PAYMENT_STATUS = 'paid'
        `,
        lateCheckOut: `
          SELECT COUNT(*) AS LATE_CHECKOUT
          FROM booking
          WHERE LATE_CHECKOUT = 1
          AND ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND DATE(CHECK_OUT_DATE) = CURDATE()
        `,
        occupiedNotMove: `
          SELECT COUNT(*) AS OccupiedNotMove 
          FROM booking 
          WHERE BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 0
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        results[key] = await queryDatabasePromise(query);
      }
      
      return results;
    } catch (error) {
      throw error;
    }
  }

  // Get room statuses
  static async getRoomStatuses() {
    try {
      const statuses = await queryDatabasePromise(`
        SELECT 
          COUNT(*) AS totalRooms,
          SUM(CASE WHEN ROOM_STATUS = 1 THEN 1 ELSE 0 END) AS availableRooms,
          SUM(CASE WHEN ROOM_STATUS = 2 THEN 1 ELSE 0 END) AS occupiedRooms,
          SUM(CASE WHEN ROOM_STATUS = 3 THEN 1 ELSE 0 END) AS underMaintenanceRooms,
          SUM(CASE WHEN ROOM_STATUS = 4 THEN 1 ELSE 0 END) AS cleaningRooms
        FROM room
        WHERE ACTIVE = 1
      `);
      return statuses;
    } catch (error) {
      throw error;
    }
  }

  // Get room details
  static async getRoomDetails() {
    try {
      const queries = {
        available: `
          SELECT
            R.ROOM_NUMBER, 
            RT.NAME AS ROOM_TYPE, 
            R.ROOM_MAX, 
            R.ROOM_BED, 
            R.ROOM_SIZE, 
            R.ROOM_FLOOR,
            IFNULL(R.ROOM_PRICE, RT.BASE_PRICE) AS FINAL_PRICE,
            GROUP_CONCAT(A.NAME SEPARATOR ', ') AS AMENITIES
          FROM 
            room R 
          JOIN 
            room_type RT ON R.ROOM_TYPE_ID = RT.IDNo 
          LEFT JOIN 
            room_amenities RA ON R.IDNo = RA.ROOM_ID AND RA.ACTIVE = 1
          LEFT JOIN 
            amenity A ON RA.AMENITY_ID = A.IDNo 
          WHERE 
            R.ACTIVE = 1 AND R.ROOM_STATUS = 1 
          GROUP BY 
            R.IDNo
            ORDER BY R.ROOM_NUMBER ASC
        `,
        underMaintenance: `
          SELECT
            R.ROOM_NUMBER, 
            RT.NAME AS ROOM_TYPE, 
            R.ROOM_MAX, 
            R.ROOM_BED, 
            R.ROOM_SIZE, 
            R.ROOM_FLOOR,
            IFNULL(R.ROOM_PRICE, RT.BASE_PRICE) AS FINAL_PRICE,
            GROUP_CONCAT(A.NAME SEPARATOR ', ') AS AMENITIES
          FROM 
            room R 
          JOIN 
            room_type RT ON R.ROOM_TYPE_ID = RT.IDNo 
          LEFT JOIN 
            room_amenities RA ON R.IDNo = RA.ROOM_ID AND RA.ACTIVE = 1
          LEFT JOIN 
            amenity A ON RA.AMENITY_ID = A.IDNo 
          WHERE 
            R.ACTIVE = 1 AND R.ROOM_STATUS = 3 
          GROUP BY 
            R.IDNo
            ORDER BY R.ROOM_NUMBER ASC
        `,
        cleaning: `
          SELECT
            R.IDNo AS ROOM_ID,
            R.ROOM_NUMBER, 
            RT.NAME AS ROOM_TYPE, 
            R.ROOM_MAX, 
            R.ROOM_BED, 
            R.ROOM_SIZE, 
            R.ROOM_FLOOR,
            IFNULL(R.ROOM_PRICE, RT.BASE_PRICE) AS FINAL_PRICE,
            GROUP_CONCAT(A.NAME SEPARATOR ', ') AS AMENITIES
          FROM 
            room R 
          JOIN 
            room_type RT ON R.ROOM_TYPE_ID = RT.IDNo 
          LEFT JOIN 
            room_amenities RA ON R.IDNo = RA.ROOM_ID AND RA.ACTIVE = 1
          LEFT JOIN 
            amenity A ON RA.AMENITY_ID = A.IDNo 
          WHERE 
            R.ACTIVE = 1 AND R.ROOM_STATUS = 4 
          GROUP BY 
            R.IDNo
            ORDER BY R.ROOM_NUMBER ASC
        `,
        occupied: `
          SELECT 
            b.IDNo AS BookingID,
            b.CUSTOMER_ID,
            c.NAME AS CustomerName,
            c.IS_GROUP,
            c.CONTACTNo,
            gt.TYPE AS GuestType,
            gl.TYPE AS GuestLevel,
            b.ROOM_ID,
            r.ROOM_NUMBER,
            r.ROOM_FLOOR,
            r.CLEAN_UP_DEVICE_ID AS DeviceID, 
            r.DND_DEVICE_ID AS DndID,
            r.HSENSOR_DEVICE_ID AS SensorID,
            r.CHOLDER_DEVICE_ID AS CholderID,
            IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
            rt.NAME AS RoomType,
            b.CHECK_IN_DATE,
            b.CHECK_OUT_DATE,
            DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
            b.BOOKING_STATUS AS BookingStatus,
            b.GUESTS_COUNT AS GuestCount,
            b.REMARKS,
            b.CONFIRMATION_NUMBER,
            b.BOOKING_CHANNEL,
            b.TRANSFER,
            b.TRANSFER_FROM,
            b.LATE_CHECKOUT,
            bill.LATE_CHECKOUT_CHARGE,
            bill.QTY,
            b.IS_OCCUPIED,
            bill.PAYMENT_STATUS,
            b.EXTENDED_DAYS,
            b.EXTENDED,
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
            COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
            COALESCE(rm.remarks_count, 0) AS RemarksCount
          FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
          LEFT JOIN room r ON b.ROOM_ID = r.IDNo
          LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
          LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
          LEFT JOIN (
            SELECT BOOKING_ID, COUNT(*) as remarks_count 
            FROM remarks 
            WHERE ACTIVE = 1 
            GROUP BY BOOKING_ID
          ) rm ON b.IDNo = rm.BOOKING_ID
          WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.IS_OCCUPIED = 1 
          ORDER BY r.ROOM_NUMBER ASC
        `,
        transferred: `
          SELECT 
            b.IDNo AS BookingID,
            b.CUSTOMER_ID,
            c.NAME AS CustomerName,
            b.ROOM_ID,
            r.ROOM_NUMBER,
            r.ROOM_FLOOR,
            r.CLEAN_UP_DEVICE_ID AS DeviceID, 
            r.HSENSOR_DEVICE_ID AS SensorID,
            r.CHOLDER_DEVICE_ID AS CholderID,
            IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
            rt.NAME AS RoomType,
            b.CHECK_IN_DATE,
            b.CHECK_OUT_DATE,
            DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
            b.BOOKING_STATUS AS BookingStatus,
            b.GUESTS_COUNT AS GuestCount,
            b.REMARKS,
            b.CONFIRMATION_NUMBER,
            b.BOOKING_CHANNEL,
            b.TRANSFER,
            b.TRANSFER_FROM,
            bill.QTY,
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
            COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
            gt.TYPE AS CUSTOMER_TYPE,
            gl.TYPE AS CUSTOMER_LEVEL,
            COALESCE(rm.remarks_count, 0) AS RemarksCount
          FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
          LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
          LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
          LEFT JOIN room r ON b.ROOM_ID = r.IDNo
          LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          LEFT JOIN (
            SELECT BOOKING_ID, COUNT(*) as remarks_count 
            FROM remarks 
            WHERE ACTIVE = 1 
            GROUP BY BOOKING_ID
          ) rm ON b.IDNo = rm.BOOKING_ID
          WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.TRANSFER != 0 
          ORDER BY r.ROOM_NUMBER ASC
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        results[key] = await queryDatabasePromise(query);
      }
      
      return results;
    } catch (error) {
      throw error;
    }
  }

  // Get room data
  static async getRoomData() {
    try {
      const rooms = await queryDatabasePromise(`
        SELECT 
          r.ROOM_NUMBER, 
          r.ROOM_TYPE_ID, 
          rt.NAME AS ROOM_TYPE_NAME, 
          r.ROOM_STATUS, 
          r.ROOM_MAINTENANCE_STATUS 
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ACTIVE = 1
        ORDER BY r.ROOM_NUMBER ASC
      `);
      return rooms;
    } catch (error) {
      throw error;
    }
  }

  // Get floors
  static async getFloors() {
    try {
      const floors = await queryDatabasePromise(`
        SELECT DISTINCT ROOM_FLOOR AS floor FROM room WHERE ACTIVE = 1
      `);
      return floors;
    } catch (error) {
      throw error;
    }
  }

  // Get cleanup notifications
  static async getCleanupNotifications() {
    try {
      const notifications = await queryDatabasePromise('SELECT * FROM cleanup_notifications ORDER BY created_at DESC');
      return notifications;
    } catch (error) {
      throw error;
    }
  }

  // Get complaints/requests/remarks summary counts
  static async getComplaintRequestSummary() {
    try {
      const complaintsCompleted = await queryDatabasePromise(
        `SELECT COUNT(*) AS cnt FROM complaint_request WHERE TYPE='complaint' AND STATUS = 1 AND ACTIVE = 1`
      );
      const complaintsPending = await queryDatabasePromise(
        `SELECT COUNT(*) AS cnt FROM complaint_request WHERE TYPE='complaint' AND STATUS = 0 AND ACTIVE = 1`
      );
      const requestsCompleted = await queryDatabasePromise(
        `SELECT COUNT(*) AS cnt FROM complaint_request WHERE TYPE='request' AND STATUS = 1 AND ACTIVE = 1`
      );
      const requestsPending = await queryDatabasePromise(
        `SELECT COUNT(*) AS cnt FROM complaint_request WHERE TYPE='request' AND STATUS = 0 AND ACTIVE = 1`
      );
      const remarksTotal = await queryDatabasePromise(
        `SELECT COUNT(*) AS cnt FROM remarks WHERE ACTIVE = 1`
      );

      return {
        complaintsCompleted: complaintsCompleted[0]?.cnt || 0,
        complaintsPending: complaintsPending[0]?.cnt || 0,
        requestsCompleted: requestsCompleted[0]?.cnt || 0,
        requestsPending: requestsPending[0]?.cnt || 0,
        remarksTotal: remarksTotal[0]?.cnt || 0
      };
    } catch (error) {
      throw error;
    }
  }

  // Get all complaints with booking details
  static async getAllComplaints() {
    try {
      const complaints = await queryDatabasePromise(`
        SELECT 
          cr.IDNo,
          cr.BOOKING_ID,
          cr.TYPE,
          cr.DETAILS,
          cr.STATUS,
          cr.ENCODED_DT,
          cr.COMPLETED_DT,
          cr.ENCODED_BY,
          cr.COMPLETED_BY,
          u1.FULLNAME AS ENCODED_BY_NAME,
          u3.FULLNAME AS COMPLETED_BY_NAME,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          c.NAME AS CUSTOMER_NAME,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE
        FROM complaint_request cr
        LEFT JOIN booking b ON cr.BOOKING_ID = b.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN user_info u1 ON cr.ENCODED_BY = u1.IDno
        LEFT JOIN user_info u3 ON cr.COMPLETED_BY = u3.IDno
        WHERE cr.TYPE = 'complaint' AND cr.ACTIVE = 1
        ORDER BY cr.ENCODED_DT DESC, cr.IDNo DESC
      `);
      return complaints;
    } catch (error) {
      throw error;
    }
  }

  // Get all requests with booking details
  static async getAllRequests() {
    try {
      const requests = await queryDatabasePromise(`
        SELECT 
          cr.IDNo,
          cr.BOOKING_ID,
          cr.TYPE,
          cr.DETAILS,
          cr.STATUS,
          cr.ENCODED_DT,
          cr.COMPLETED_DT,
          cr.ENCODED_BY,
          cr.COMPLETED_BY,
          u1.FULLNAME AS ENCODED_BY_NAME,
          u3.FULLNAME AS COMPLETED_BY_NAME,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          c.NAME AS CUSTOMER_NAME,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE
        FROM complaint_request cr
        LEFT JOIN booking b ON cr.BOOKING_ID = b.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN user_info u1 ON cr.ENCODED_BY = u1.IDno
        LEFT JOIN user_info u3 ON cr.COMPLETED_BY = u3.IDno
        WHERE cr.TYPE = 'request' AND cr.ACTIVE = 1
        ORDER BY cr.ENCODED_DT DESC, cr.IDNo DESC
      `);
      return requests;
    } catch (error) {
      throw error;
    }
  }

  // Get all remarks with booking details
  static async getAllRemarks() {
    try {
      const remarks = await queryDatabasePromise(`
        SELECT 
          r.IDNo,
          r.BOOKING_ID,
          r.CATEGORY,
          r.REMARK_TEXT,
          r.ENCODED_DT,
          r.EDITDED_DT,
          r.ENCODED_BY,
          r.EDITDED_BY,
          u1.FULLNAME AS ENCODED_BY_NAME,
          u2.FULLNAME AS EDITDED_BY_NAME,
          b.ROOM_ID,
          rm.ROOM_NUMBER,
          c.NAME AS CUSTOMER_NAME
        FROM remarks r
        LEFT JOIN booking b ON r.BOOKING_ID = b.IDNo
        LEFT JOIN room rm ON b.ROOM_ID = rm.IDNo
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN user_info u1 ON r.ENCODED_BY = u1.IDno
        LEFT JOIN user_info u2 ON r.EDITDED_BY = u2.IDno
        WHERE r.ACTIVE = 1
        ORDER BY r.ENCODED_DT DESC, r.IDNo DESC
      `);
      return remarks;
    } catch (error) {
      throw error;
    }
  }

  // Get transfer logs
   // Get transfer logs
  static async getTransferLogs(occupiedRoomDetails) {
    try {
      const transferLogs = {};
      
      for (const room of occupiedRoomDetails) {
        const logs = await queryDatabasePromise(`
          SELECT 
            rtl.IDNo AS LogID,
            rtl.BOOKING_ID AS BookingID,
            rtl.OLD_ROOM_ID,
            oldRoom.ROOM_NUMBER AS OldRoomNumber,
            rtl.NEW_ROOM_ID,
            newRoom.ROOM_NUMBER AS NewRoomNumber,
            rtl.TRANSFER_DATE
          FROM room_transfer_logs rtl
          LEFT JOIN room oldRoom ON oldRoom.IDNo = rtl.OLD_ROOM_ID
          LEFT JOIN room newRoom ON newRoom.IDNo = rtl.NEW_ROOM_ID
          WHERE rtl.BOOKING_ID = ?
          ORDER BY rtl.TRANSFER_DATE ASC
        `, [room.BookingID]);

        transferLogs[room.BookingID] = logs.map(log => ({
          ...log,
          FORMATTED_DATE: new Date(log.TRANSFER_DATE).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        }));
      }
      
      return transferLogs;
    } catch (error) {
      throw error;
    }
  }

  // Update cleanup notification
  static async updateCleanupNotification(room) {
    // Implementation for cleanup notification update
    // This would typically update the cleanup_notifications table
    // For now, we'll just return the room as is
    return room;
  }

  // Process room data
  static processRoomData(roomDataResults) {
    return roomDataResults.map(room => {
      let status = 'Unknown';
      const roomStatus = Number(room.ROOM_STATUS);
      
      switch(roomStatus) {
        case 1:
          status = 'Available';
          break;
        case 2:
          status = 'Occupied';
          break;
        case 3:
          status = 'Under Maintenance';
          break;
        case 4:
          status = 'Cleaning';
          break;
        default:
          status = 'Unknown';
      }

      let badgeClass = 'label-default';
      switch(status) {
        case 'Available':
          badgeClass = 'label-success';
          break;
        case 'Cleaning':
          badgeClass = 'label-warning';
          break;
        case 'Occupied':
          badgeClass = 'label-danger';
          break;
        case 'Under Maintenance':
          badgeClass = 'label-default';
          break;
        default:
          badgeClass = 'label-default';
      }

      return {
        ROOM_NUMBER: room.ROOM_NUMBER,
        ROOM_TYPE_NAME: room.ROOM_TYPE_NAME || 'N/A',
        ROOM_DESCRIPTION: room.ROOM_DESCRIPTION,
        status,
        badgeClass
      };
    });
  }

  // Categorize employees
  static categorizeEmployees(employeesResults) {
    return employeesResults.map(employee => {
      if (employee.status.toLowerCase() === 'on duty' && employee.timeSchedule) {
        if (DashboardModel.isCurrentTimeWithinSchedule(employee.timeSchedule)) {
          return { ...employee, status: 'On Duty' };
        }
      } else if (employee.status.toLowerCase() === 'on leave') {
        return { ...employee, status: 'On Leave' };
      } else if (employee.status.toLowerCase() === 'absent') {
        return { ...employee, status: 'Absent' };
      }
      return { ...employee, status: 'Off Duty' };
    });
  }

  // Update device statuses
  // TEMPORARILY COMMENTED OUT DUE TO CONNECTION ISSUES
  /*
  static async updateDeviceStatuses(occupiedRoomDetails) {
    try {
      const deviceStatusPromises = occupiedRoomDetails.map(async (room) => {
        room.makeUpStatus = room.DeviceID
          ? await DashboardModel.fetchHAState(room.DeviceID)
          : 'off';

        room.dndStatus = room.DndID
          ? await DashboardModel.fetchHAState(room.DndID)
          : 'off';

        room.cholderStatus = room.CholderID
          ? await DashboardModel.fetchHAState(room.CholderID)
          : 'off';

        await DashboardModel.updateCleanupNotification(room);
        return room;
      });

      return await Promise.all(deviceStatusPromises);
    } catch (error) {
      throw error;
    }
  }
  */

  // Update booking status
  static async updateBookingStatus(bookingId, status, lateCheckOut = null) {
    try {
      let query = 'UPDATE booking SET BOOKING_STATUS = ? WHERE IDNo = ? AND ACTIVE = 1';
      let params = [status, bookingId];

      if (lateCheckOut !== null && lateCheckOut !== '') {
        query = 'UPDATE booking SET BOOKING_STATUS = ?, LATE_CHECKOUT = ? WHERE IDNo = ? AND ACTIVE = 1';
        params = [status, lateCheckOut, bookingId];
      }

      const result = await queryDatabasePromise(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Update room status
  static async updateRoomStatus(roomId, status) {
    try {
      const query = 'UPDATE room SET ROOM_STATUS = ? WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [status, roomId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Move to occupied
  static async moveToOccupied() {
    try {
      // First, get all the rooms that need to be updated
      const roomsToUpdate = await queryDatabasePromise(`
        SELECT DISTINCT b.ROOM_ID 
        FROM booking b 
        WHERE b.BOOKING_STATUS = 'check-In' 
        AND b.IS_OCCUPIED = 0 
        AND b.ACTIVE = 1
      `);

      // Update booking status to occupied
      const bookingQuery = `
        UPDATE booking 
        SET IS_OCCUPIED = 1 
        WHERE BOOKING_STATUS = 'check-In' 
        AND IS_OCCUPIED = 0 
        AND ACTIVE = 1
      `;
      const bookingResult = await queryDatabasePromise(bookingQuery);

      // Update room status to occupied (status = 2)
      if (roomsToUpdate.length > 0) {
        const roomIds = roomsToUpdate.map(room => room.ROOM_ID);
        const roomQuery = `
          UPDATE room 
          SET ROOM_STATUS = 2 
          WHERE IDNo IN (${roomIds.map(() => '?').join(',')}) 
          AND ACTIVE = 1
        `;
        await queryDatabasePromise(roomQuery, roomIds);
      }

      return bookingResult.affectedRows;
    } catch (error) {
      throw error;
    }
  }

  // Get check-in bookings count
  static async getCheckInBookings() {
    try {
      const result = await queryDatabasePromise(`
        SELECT COUNT(*) as count 
        FROM booking 
        WHERE BOOKING_STATUS = 'check-In' 
        AND IS_OCCUPIED = 0 
        AND ACTIVE = 1
      `);
      return result[0]?.count || 0;
    } catch (error) {
      throw error;
    }
  }

  // Get room monitoring data
  static async getRoomMonitoringData() {
    try {
      const rooms = await queryDatabasePromise(`
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_STATUS, r.ROOM_BED, r.ROOM_MAX, r.ROOM_TYPE_ID, r.ACTIVE
        FROM room r
        WHERE r.ROOM_FLOOR IN (3, 4, 5, 6) AND r.ACTIVE = 1
        ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
      `);

      const floors = { 3: [], 4: [], 5: [], 6: [] };

      rooms.forEach(room => {
        // parseInt kung sakaling string
        const floorNum = parseInt(room.ROOM_FLOOR, 10);
        if (!isNaN(floorNum) && floors[floorNum]) {
          floors[floorNum].push({
            ROOM_NUMBER: room.ROOM_NUMBER,
            ROOM_STATUS: room.ROOM_STATUS,
            ROOM_BED: room.ROOM_BED || 1,
            ROOM_TYPE_ID: room.ROOM_TYPE_ID
          });
        }
      });

      return floors;
    } catch (error) {
      throw error;
    }
  }

  // Get available rooms for transfer
  static async getAvailableRoomsForTransfer(currentRoom, checkOutDate) {
    try {
      const rooms = await queryDatabasePromise(`
        SELECT 
          r.IDNo AS ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          r.ROOM_STATUS,
          r.ROOM_BED,
          r.ROOM_MAX,
          r.ROOM_TYPE_ID,
          rt.NAME AS ROOM_TYPE,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE,
          CASE 
            WHEN b.CHECK_OUT_DATE = ? THEN 1 
            ELSE 0 
          END AS OCCUPANT_CHECK_OUT_TODAY
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN booking b ON r.IDNo = b.ROOM_ID AND b.ACTIVE = 1 AND b.BOOKING_STATUS = 'check-In'
        WHERE r.ACTIVE = 1 
          AND r.ROOM_STATUS = 1 
          AND r.IDNo != ?
          AND r.ROOM_FLOOR IN (3, 4, 5, 6)
        ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
      `, [checkOutDate, currentRoom]);

      return rooms;
    } catch (error) {
      throw error;
    }
  }

  // Get transfer logs for a specific booking
  static async getTransferLogsForBooking(bookingId) {
    try {
      const logs = await queryDatabasePromise(`
        SELECT 
          rtl.IDNo AS LogID,
          rtl.BOOKING_ID AS BookingID,
          rtl.OLD_ROOM_ID,
          oldRoom.ROOM_NUMBER AS OldRoomNumber,
          rtl.NEW_ROOM_ID,
          newRoom.ROOM_NUMBER AS NewRoomNumber,
          rtl.TRANSFER_DATE
        FROM room_transfer_logs rtl
        LEFT JOIN room oldRoom ON oldRoom.IDNo = rtl.OLD_ROOM_ID
        LEFT JOIN room newRoom ON newRoom.IDNo = rtl.NEW_ROOM_ID
        WHERE rtl.BOOKING_ID = ?
        ORDER BY rtl.TRANSFER_DATE ASC
      `, [bookingId]);

      // Format the date like in hotelOLD
      return logs.map(log => ({
        ...log,
        FORMATTED_DATE: new Date(log.TRANSFER_DATE).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }));
    } catch (error) {
      throw error;
    }
  }

  // Room transfer method
  static async transferRoom(bookingId, oldRoomId, newRoomId, transferDate) {
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Get booking details
      const bookingDetails = await queryDatabasePromise(`
        SELECT b.*, r.ROOM_NUMBER as OLD_ROOM_NUMBER, r2.ROOM_NUMBER as NEW_ROOM_NUMBER
        FROM booking b
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room r2 ON r2.IDNo = ?
        WHERE b.IDNo = ?
      `, [newRoomId, bookingId]);

      if (bookingDetails.length === 0) {
        throw new Error('Booking not found');
      }

      const booking = bookingDetails[0];

      // Check if new room is available
      const newRoomStatus = await queryDatabasePromise(`
        SELECT ROOM_STATUS, ROOM_NUMBER FROM room WHERE IDNo = ? AND ACTIVE = 1
      `, [newRoomId]);

      console.log('New room status check:', { newRoomId, newRoomStatus });

      if (newRoomStatus.length === 0) {
        throw new Error(`Room ${newRoomId} not found or not active`);
      }

      // Convert status to number for comparison (handle both string and number)
      const roomStatus = parseInt(newRoomStatus[0].ROOM_STATUS, 10);
      
      if (roomStatus !== 1) {
        throw new Error(`Room ${newRoomStatus[0].ROOM_NUMBER} is not available (Status: ${roomStatus})`);
      }

      // Update booking with new room
      await queryDatabasePromise(`
        UPDATE booking 
        SET ROOM_ID = ?, TRANSFER = 1, TRANSFER_FROM = ?
        WHERE IDNo = ?
      `, [newRoomId, oldRoomId, bookingId]);

      // Update old room status to available
      await queryDatabasePromise(`
        UPDATE room 
        SET ROOM_STATUS = 1 
        WHERE IDNo = ?
      `, [oldRoomId]);

      // Update new room status to occupied
      await queryDatabasePromise(`
        UPDATE room 
        SET ROOM_STATUS = 2 
        WHERE IDNo = ?
      `, [newRoomId]);

      // Insert transfer log
      try {
        console.log('Inserting transfer log with data:', {
          bookingId,
          oldRoomId,
          newRoomId,
          transferDate
        });
        
        await queryDatabasePromise(`
          INSERT INTO room_transfer_logs 
          (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE) 
          VALUES (?, ?, ?, ?)
        `, [bookingId, oldRoomId, newRoomId, transferDate]);
        
        console.log('Transfer log inserted successfully');
      } catch (logError) {
        console.error('Error inserting transfer log:', logError);
        // Continue with transfer even if logging fails
      }

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return true;
    } catch (error) {
      // Rollback transaction on error
      try {
        await queryDatabasePromise('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      console.error('Error in transferRoom:', error);
      throw error;
    }
  }

  // Check late check-out room availability
  static async checkLateCheckRoom(roomId, checkoutDate, currentBookingId) {
    try {
      const formattedCheckoutDate = new Date(checkoutDate).toISOString().split('T')[0];

      // Check if there's a booking for the same room on the checkout date
      const conflictingBookingQuery = `
        SELECT b.IDNo, b.CHECK_IN_DATE, b.BOOKING_STATUS, c.NAME AS CustomerName
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        WHERE b.ROOM_ID = ? 
        AND DATE(b.CHECK_IN_DATE) = ?
        AND b.IDNo != ?
        AND b.ACTIVE = 1
      `;

      const conflictingBookings = await queryDatabasePromise(conflictingBookingQuery, [
        roomId, 
        formattedCheckoutDate, 
        currentBookingId
      ]);

      if (conflictingBookings.length > 0) {
        // Room change is required
        const availableRoomsQuery = `
          SELECT 
            r.IDNo AS ROOM_ID,
            r.ROOM_NUMBER,
            r.ROOM_FLOOR,
            rt.NAME AS ROOM_TYPE,
            IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE
          FROM room r
          LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          WHERE r.ACTIVE = 1 
            AND r.ROOM_STATUS = 1 
            AND r.IDNo != ?
            AND r.ROOM_FLOOR IN (3, 4, 5, 6)
          ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
        `;

        const availableRooms = await queryDatabasePromise(availableRoomsQuery, [roomId]);

        return {
          needRoomChange: true,
          message: "A Regular Check-In is scheduled during your Late Check-Out. Please select a new room.",
          availableRooms: availableRooms
        };
      } else {
        // No room change needed
        return {
          needRoomChange: false,
          message: "Late Check-Out can be processed in the same room.",
          availableRooms: []
        };
      }
    } catch (error) {
      console.error("🚨 Error checking late check-out:", error);
      throw new Error("Failed to check Late Check-Out availability.");
    }
  }

  // Process late check-out
  static async processLateCheckout(currentRoomId, newRoomId, bookingId) {
    try {
      // Fetch the total days of stay for this booking
      const totalDaysQuery = `SELECT DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) AS TotalDays FROM booking WHERE IDNo = ? AND ACTIVE = 1`;
      const totalDaysResult = await queryDatabasePromise(totalDaysQuery, [bookingId]);
      const totalDays = totalDaysResult.length > 0 ? totalDaysResult[0].TotalDays : null;

      let lateCheckoutFee = 0;

      // Apply ₱2,000 Fee if stay is less than 3 days
      if (totalDays !== null && totalDays < 3) {
        lateCheckoutFee = 2000;
      }

      // If a new room is chosen, transfer the guest
      if (newRoomId && newRoomId !== currentRoomId) {
        // Update booking table
        const transferQuery = `
          UPDATE booking
          SET ROOM_ID = ?, TRANSFER = 1
          WHERE IDNo = ? AND ACTIVE = 1
        `;
        await queryDatabasePromise(transferQuery, [newRoomId, bookingId]);

        // Log transfer in room_transfer_logs
        const logTransferQuery = `
          INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
          VALUES (?, ?, ?, NOW())
        `;
        await queryDatabasePromise(logTransferQuery, [bookingId, currentRoomId, newRoomId]);

        // Update room status
        const updateOldRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 4 WHERE IDNo = ?`;
        const updateNewRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 2 WHERE IDNo = ?`;

        await queryDatabasePromise(updateOldRoomStatusQuery, [currentRoomId]);
        await queryDatabasePromise(updateNewRoomStatusQuery, [newRoomId]);
      }

      // Update LATE_CHECKOUT = 1 and adjust CHECK_OUT_DATE to 23:00:00
      const updateBookingQuery = `
        UPDATE booking
        SET LATE_CHECKOUT = 1, CHECK_OUT_DATE = CONCAT(DATE(CHECK_OUT_DATE), ' 23:00:00')
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      await queryDatabasePromise(updateBookingQuery, [bookingId]);

      // If Late Check-Out Fee applies, add to booking service
      const insertBookingServiceQuery = `
        INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT) 
        VALUES (?, 72, 1, ?, ?, ?, NOW())
      `;

      const status = lateCheckoutFee > 0 ? 'unpaid' : 'paid';

      await queryDatabasePromise(insertBookingServiceQuery, [bookingId, lateCheckoutFee, status, "System"]);

      return { 
        success: true,
        lateCheckoutFee: lateCheckoutFee,
        isFree: lateCheckoutFee === 0
      };

    } catch (error) {
      throw error;
    }
  }

  // Check room availability for extension
  static async checkExtendRoom(roomId, checkoutDate, daysToExtend) {
    try {
      // Calculate new checkout date
      const currentCheckout = new Date(checkoutDate);
      const newCheckout = new Date(currentCheckout);
      newCheckout.setDate(currentCheckout.getDate() + parseInt(daysToExtend));
      
      // Format dates for MySQL
      const formattedCurrentCheckout = currentCheckout.toISOString().slice(0, 19).replace('T', ' ');
      const formattedNewCheckout = newCheckout.toISOString().slice(0, 19).replace('T', ' ');
      
      // Check if current room is available for extension
      const roomAvailabilityQuery = `
        SELECT COUNT(*) as conflictingBookings
        FROM booking b
        JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE r.IDNo = ?
        AND b.ACTIVE = 1
        AND b.BOOKING_STATUS = 'check-In'
        AND (
          (b.CHECK_IN_DATE < ? AND b.CHECK_OUT_DATE > ?) OR
          (b.CHECK_IN_DATE < ? AND b.CHECK_OUT_DATE > ?) OR
          (b.CHECK_IN_DATE >= ? AND b.CHECK_IN_DATE < ?)
        )
        AND b.IDNo != (SELECT IDNo FROM booking WHERE ROOM_ID = ? AND ACTIVE = 1 AND BOOKING_STATUS = 'check-In' LIMIT 1)
      `;
      
      const conflictingBookings = await queryDatabasePromise(roomAvailabilityQuery, [
        roomId, 
        formattedCurrentCheckout, formattedCurrentCheckout,
        formattedNewCheckout, formattedNewCheckout,
        formattedCurrentCheckout, formattedNewCheckout,
        roomId
      ]);
      
      const hasConflicts = conflictingBookings[0]?.conflictingBookings > 0;
      
      if (hasConflicts) {
        // Current room not available, find alternative rooms
        const availableRoomsQuery = `
          SELECT 
            r.IDNo AS ROOM_ID,
            r.ROOM_NUMBER,
            r.ROOM_FLOOR,
            rt.NAME AS ROOM_TYPE,
            IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE
          FROM room r
          JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          WHERE r.ACTIVE = 1 
          AND r.ROOM_STATUS = 1
          AND r.IDNo != ?
          AND r.ROOM_FLOOR IN (3, 4, 5, 6)
          AND NOT EXISTS (
            SELECT 1 FROM booking b2
            WHERE b2.ROOM_ID = r.IDNo
            AND b2.ACTIVE = 1
            AND b2.BOOKING_STATUS = 'check-In'
            AND (
              (b2.CHECK_IN_DATE < ? AND b2.CHECK_OUT_DATE > ?) OR
              (b2.CHECK_IN_DATE < ? AND b2.CHECK_OUT_DATE > ?) OR
              (b2.CHECK_IN_DATE >= ? AND b2.CHECK_IN_DATE < ?)
            )
          )
          ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
        `;
        
        const availableRooms = await queryDatabasePromise(availableRoomsQuery, [
          roomId,
          formattedCurrentCheckout, formattedCurrentCheckout,
          formattedNewCheckout, formattedNewCheckout,
          formattedCurrentCheckout, formattedNewCheckout
        ]);
        
        return {
          currentRoomAvailable: false,
          availableRooms: availableRooms
        };
      } else {
        // Current room is available
        return {
          currentRoomAvailable: true,
          availableRooms: []
        };
      }
    } catch (error) {
      console.error('Error checking room availability for extension:', error);
      throw error;
    }
  }

  // Process stay extension
  static async extendStay(roomId, checkoutDate, daysToExtend, bookingId, newRoomId = null, cost = 0, userId = null) {
    try {
      // Calculate new checkout date
      const currentCheckout = new Date(checkoutDate);
      const newCheckout = new Date(currentCheckout);
      newCheckout.setDate(currentCheckout.getDate() + parseInt(daysToExtend));
      
      // Format dates for MySQL
      const formattedCurrentCheckout = currentCheckout.toISOString().slice(0, 19).replace('T', ' ');
      const formattedNewCheckout = newCheckout.toISOString().slice(0, 19).replace('T', ' ');
      
      // If room change is required
      if (newRoomId && newRoomId !== roomId) {
        // Update booking with new room and extended dates
        const updateBookingQuery = `
          UPDATE booking
          SET ROOM_ID = ?, 
              CHECK_OUT_DATE = ?,
              EXTENDED = 1,
              EXTENDED_DAYS = IFNULL(EXTENDED_DAYS, 0) + ?,
              TRANSFER = 1,
              EDITED_BY = 'System',
              EDITED_DT = NOW()
          WHERE IDNo = ? AND ACTIVE = 1
        `;
        
        await queryDatabasePromise(updateBookingQuery, [
          newRoomId, 
          formattedNewCheckout, 
          daysToExtend, 
          bookingId
        ]);
        
        // Log transfer
        const logTransferQuery = `
          INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
          VALUES (?, ?, ?, NOW())
        `;
        await queryDatabasePromise(logTransferQuery, [bookingId, roomId, newRoomId]);
        
        // Update room statuses
        await queryDatabasePromise(`UPDATE room SET ROOM_STATUS = 4 WHERE IDNo = ?`, [roomId]);
        await queryDatabasePromise(`UPDATE room SET ROOM_STATUS = 2 WHERE IDNo = ?`, [newRoomId]);
        
      } else {
        // Extend in same room
        const updateBookingQuery = `
          UPDATE booking
          SET CHECK_OUT_DATE = ?,
              EXTENDED = 1,
              EXTENDED_DAYS = IFNULL(EXTENDED_DAYS, 0) + ?
          WHERE IDNo = ? AND ACTIVE = 1
        `;
        
        await queryDatabasePromise(updateBookingQuery, [
          formattedNewCheckout, 
          daysToExtend, 
          bookingId
        ]);
      }
      
      // Insert extension record
      const insertExtensionQuery = `
        INSERT INTO booking_extension (
          BOOKING_ID, EXTEND_DATE, QTY, COST, PAYMENT_STATUS, ENCODED_BY
        ) VALUES (?, ?, ?, ?, 'unpaid', ?)
      `;
      
      await queryDatabasePromise(insertExtensionQuery, [
        bookingId, 
        new Date().toISOString().slice(0, 19).replace('T', ' '), 
        daysToExtend,
        cost,
        userId
      ]);
      
      return {
        success: true,
        newCheckoutDate: formattedNewCheckout,
        totalDays: daysToExtend
      };
      
    } catch (error) {
      console.error('Error processing stay extension:', error);
      throw error;
    }
  }

}


module.exports = DashboardModel;
