const express = require("express");
const pool = require("../config/db");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

require('dotenv').config();  // ilagay sa itaas kung hindi pa globally configured
const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwNmM5ZTE0NWM4YTk0OGMzOWMwMzczOTQ1YWQ3ZmU5YyIsImlhdCI6MTc0Mjg2Mzk5NiwiZXhwIjoyMDU4MjIzOTk2fQ.-lpBSu2I-jtbaS81_1oUrCDNb-A_pBiO6Fv3cGGq370'; // double-check mo ito kung tama!


async function fetchHAState(entity_id) {
  try {
    const res = await axios.get(`${HOME_ASSISTANT_URL}/api/states/${entity_id}`, {
      headers: { Authorization: `Bearer ${HA_TOKEN}` },
    });
    return res.data.state || 'off';
  } catch (error) {
    console.error("❌ Error fetching HA state:", error);
    return 'off'; 
  }
}



// Example: updateCleanupNotification (hindi binago)
async function updateCleanupNotification(room) {
  try {
    if (room.deviceStatus === 'on') {
      const existingRecords = await queryDatabase(
        'SELECT * FROM cleanup_notifications WHERE room_id = ? AND completed_timestamp IS NULL ORDER BY id DESC LIMIT 1',
        [room.ROOM_ID]
      );

      if (existingRecords.length === 0) {
        await queryDatabase(
          `INSERT INTO cleanup_notifications 
            (room_id, room_number, request_timestamp, created_at)
           VALUES (?, ?, ?, NOW())`,
          [room.ROOM_ID, room.ROOM_NUMBER, room.requestTimestamp]
        );
      }
    } else if (room.deviceStatus === 'off') {
      await queryDatabase(
        `UPDATE cleanup_notifications 
           SET completed_timestamp = NOW()
         WHERE room_id = ? AND completed_timestamp IS NULL`,
        [room.ROOM_ID]
      );
    }
  } catch (err) {
    console.error('Error updating cleanup notification:', err);
  }
}

/************************************************
 * Update Cleanup Notification Remarks
 ************************************************/
router.post('/update-cleanup-remarks', async (req, res) => {
  try {
    const { id, remarks } = req.body;
    if (!id || !remarks) {
      return res.status(400).json({ success: false, error: "Missing id or remarks" });
    }
    await queryDatabase("UPDATE cleanup_notifications SET remarks = ? WHERE id = ?", [remarks, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating cleanup notification remarks:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});


/************************************************
 * 6) Example route to test
 ************************************************/
// router.get('/', async (req, res) => {
//   try {
//     // Double-check your device’s ID:
//     const deviceId = "eb1d737ba48ea9cd22oake";
//     const status = await fetchDeviceStatus(deviceId);

//     console.log("[Tuya] Device switch_1 is:", status);
//     res.send(`switch_1: ${status}`);
//   } catch (error) {
//     console.error("[Tuya] / error:", error);
//     res.status(500).send("Server error");
//   }
// });


// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/');
}

// Utility function to execute database queries
function queryDatabase(query, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Function to check if current time is within a given schedule
function isCurrentTimeWithinSchedule(timeSchedule) {
  const [startTime, endTime] = timeSchedule.split('-').map(time => time.trim().toLowerCase());

  // Adjust the current time by subtracting 12 hours
  const now = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parseTime = (timeStr) => {
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }
    let [_, hours, minutes, period] = match;
    hours = parseInt(hours, 10);
    minutes = minutes ? parseInt(minutes, 10) : 0;

    if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
    if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const startMinutes = parseTime(startTime);
  let endMinutes = parseTime(endTime);

  if (endMinutes <= startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// Helper function to calculate "time ago"
function timeAgo(date) {
  if (!date) return "N/A";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) {
    return `${Math.floor(interval)} year${Math.floor(interval) !== 1 ? 's' : ''} ago`;
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return `${Math.floor(interval)} month${Math.floor(interval) !== 1 ? 's' : ''} ago`;
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return `${Math.floor(interval)} day${Math.floor(interval) !== 1 ? 's' : ''} ago`;
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return `${Math.floor(interval)} hour${Math.floor(interval) !== 1 ? 's' : ''} ago`;
  }
  interval = seconds / 60;
  if (interval > 1) {
    return `${Math.floor(interval)} min${Math.floor(interval) !== 1 ? 's' : ''} ago`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
}




router.get('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId; // Get from session

    if (!userId) {
      console.log("❌ No user ID in session, redirecting to login.");
      return res.redirect('/login');
    }
    const userQuery = 'SELECT FULLNAME, PERMISSIONS, TAB_ORDER  FROM user_info WHERE IDno = ?';
    const userResults = await queryDatabase(userQuery, [userId]);

    if (userResults.length === 0) {
      console.log('User not found:', userId);
      return res.status(404).render('error', { message: 'User not found' });
    }

    const user = userResults[0];
    const tabOrder = user.TAB_ORDER ? JSON.parse(user.TAB_ORDER) : null; // Parse stored tab order
    const employeesQuery = `
      SELECT e.FULLNAME, e.DEPARTMENT, e.PHOTO, IFNULL(s.status, 'Off Duty') AS status, s.timeSchedule, s.start, s.end 
      FROM schedules s 
      LEFT JOIN employee e 
      ON e.FULLNAME = s.title 
      WHERE e.ACTIVE = 1 AND e.DEPARTMENT IN ('Front Desk', 'Housekeeping', 'Maintenance');
    `;

    const employeesResults = await queryDatabase(employeesQuery);

    const categorizedEmployees = employeesResults.map(employee => {
      if (employee.status.toLowerCase() === 'on duty' && employee.timeSchedule) {
        if (isCurrentTimeWithinSchedule(employee.timeSchedule)) {
          return { ...employee, status: 'On Duty' };
        }
      } else if (employee.status.toLowerCase() === 'on leave') {
        return { ...employee, status: 'On Leave' };
      } else if (employee.status.toLowerCase() === 'absent') {
        return { ...employee, status: 'Absent' };
      }
      return { ...employee, status: 'Off Duty' };
    });

    const todayCheckInDetailsQuery = `
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
      b.REMARKS,
      b.CHECK_IN_STATUS,
      b.LATE_CHECKOUT,
      bill.QTY,
      COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
      COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
      b.IS_OCCUPIED  -- ADDING IS_OCCUPIED COLUMN FOR FILTERING
    FROM booking b
    LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    WHERE b.ACTIVE = 1  
      AND DATE(b.CHECK_IN_DATE) <= CURDATE() -- Guests from today or previous days
      AND b.IS_OCCUPIED = 0  -- Only those not yet moved
      AND b.BOOKING_STATUS IN ('pending', 'check-In') -- Allow pending or check-In
    ORDER BY r.ROOM_NUMBER ASC;
`;



  // const todayPendingDetailsQuery = `
  //   SELECT 
  //     b.IDNo AS BookingID,
  //     b.CUSTOMER_ID,
  //     c.NAME AS CustomerName,
  //     b.ROOM_ID,
  //     r.ROOM_NUMBER,
  //     r.ROOM_FLOOR,
  //     IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
  //     rt.NAME AS RoomType,
  //     b.CHECK_IN_DATE,
  //     b.CHECK_OUT_DATE,
  //     DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
  //     b.BOOKING_STATUS AS BookingStatus,
  //     b.GUESTS_COUNT AS GuestCount,
  //     b.REMARKS AS BookingRemarks,
  //     b.CONFIRMATION_NUMBER,
  //     b.BOOKING_CHANNEL,
  //      b.REMARKS,
  //     bill.QTY,
  //     COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
  //     COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
  //   FROM booking b
  //   LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
  //   LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
  //   LEFT JOIN room r ON b.ROOM_ID = r.IDNo
  //   LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
  //   WHERE (DATE(b.CHECK_IN_DATE) = CURDATE() AND TIME(b.CHECK_IN_DATE) > CURRENT_TIME)
  //    OR (DATE(b.CHECK_IN_DATE) > CURDATE())
  //   AND b.ACTIVE = 1
  //   ORDER BY r.ROOM_NUMBER ASC
  //  `;

    const groupBookingDetailsQuery = `
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
      COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    FROM booking b
    LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    WHERE DATE(b.CHECK_IN_DATE) <= CURDATE()
    AND b.ACTIVE = 1 AND c.IS_GROUP = 1
    ORDER BY r.ROOM_NUMBER ASC
   `;

    const lateInOutDetailsQuery = `
      SELECT 
      b1.ROOM_ID, 
      r.ROOM_NUMBER, 
      r.ROOM_FLOOR,  -- ✅ Added Room Floor
      c1.NAME AS CurrentGuest, -- ✅ Added Guest Name for Current Booking
      c2.NAME AS NextGuest, -- ✅ Added Guest Name for Next Booking
      b1.IDNo AS CurrentBookingID, 
      b1.CHECK_OUT_DATE AS CurrentCheckoutDate, 
      b1.BOOKING_STATUS AS CurrentBookingStatus, -- ✅ Added Booking Status
      b1.TRANSFER AS CurrentTransferStatus, -- ✅ Added Transfer Status
      b1.LATE_CHECKOUT AS CurrentLateCheckout, -- ✅ Added Late Checkout Status
      b1.CHECK_IN_STATUS AS CurrentCheckInStatus, -- ✅ Added Check-in Status
      
      b2.IDNo AS NextBookingID, 
      b2.CHECK_IN_DATE AS NextCheckInDate, 
      b2.BOOKING_STATUS AS NextBookingStatus, -- ✅ Added Booking Status for Next Booking
      b2.TRANSFER AS NextTransferStatus, -- ✅ Added Transfer Status for Next Booking
      b2.LATE_CHECKOUT AS NextLateCheckout, -- ✅ Added Late Checkout Status for Next Booking
      b2.CHECK_IN_STATUS AS NextCheckInStatus -- ✅ Added Check-in Status for Next Booking
  FROM booking b1
  JOIN room r ON b1.ROOM_ID = r.IDNo
  LEFT JOIN customer c1 ON b1.CUSTOMER_ID = c1.IDNo -- ✅ Added Customer Join for Current Booking
  LEFT JOIN booking b2 ON b1.ROOM_ID = b2.ROOM_ID 
      AND DATE(b2.CHECK_IN_DATE) = DATE(b1.CHECK_OUT_DATE) -- ✅ Next Booking after the Late Checkout
      AND b2.ACTIVE = 1
  LEFT JOIN customer c2 ON b2.CUSTOMER_ID = c2.IDNo -- ✅ Added Customer Join for Next Booking
  WHERE 
      b1.LATE_CHECKOUT = 1 -- ✅ Only Late Check-Outs
      AND b2.CHECK_IN_STATUS = 0 -- ✅ Only Late Check-Ins
      AND b1.ACTIVE = 1 AND (DATE(b2.CHECK_IN_STATUS) = CURDATE() OR DATE(b1.CHECK_OUT_DATE) = CURDATE()) 
  ORDER BY r.ROOM_NUMBER ASC;
`;

    const todayCheckedOutDetailsQuery = `
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
      COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    FROM booking b
    LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    WHERE b.ACTIVE = 1 AND DATE(b.CHECK_OUT_DATE) <= CURDATE() AND b.BOOKING_STATUS = 'check-In'
    ORDER BY r.ROOM_NUMBER ASC`;

    // const todayCheckedOutDetailsQuery = `
    // SELECT 
    //   b.IDNo AS BookingID,
    //   b.CUSTOMER_ID,
    //   c.NAME AS CustomerName,
    //   b.ROOM_ID,
    //   r.ROOM_NUMBER,
    //   r.ROOM_FLOOR,
    //   IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
    //   rt.NAME AS RoomType,
    //   b.CHECK_IN_DATE,
    //   b.CHECK_OUT_DATE,
    //   DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
    //   b.BOOKING_STATUS AS BookingStatus,
    //   b.GUESTS_COUNT AS GuestCount,
    //   b.REMARKS AS BookingRemarks,
    //   b.CONFIRMATION_NUMBER,
    //   b.BOOKING_CHANNEL,
    //   b.LATE_CHECKOUT,
    //    b.REMARKS,
    //   bill.QTY,
    //   COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
    //   COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    // FROM booking b
    // LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    // LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    // LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    // LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    // WHERE b.ACTIVE = 1 AND DATE(b.CHECK_OUT_DATE) = CURDATE()
    // ORDER BY r.ROOM_NUMBER ASC`;

    // const upcomingCheckOutDetailsQuery = `
    // SELECT 
    //   b.IDNo AS BookingID,
    //   b.CUSTOMER_ID,
    //   c.NAME AS CustomerName,
    //   b.ROOM_ID,
    //   r.ROOM_NUMBER,
    //   r.ROOM_FLOOR,
    //   IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS RoomRate,
    //   rt.NAME AS RoomType,
    //   b.CHECK_IN_DATE,
    //   b.CHECK_OUT_DATE,
    //   DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TotalDays,
    //   b.BOOKING_STATUS AS BookingStatus,
    //   b.GUESTS_COUNT AS GuestCount,
    //   b.REMARKS AS BookingRemarks,
    //   b.CONFIRMATION_NUMBER,
    //   b.BOOKING_CHANNEL,
    //    b.REMARKS,
    //   bill.QTY,
    //   COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TotalCost,
    //   COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    // FROM booking b
    // LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    // LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    // LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    // LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    // WHERE b.ACTIVE = 1 AND DATE(b.CHECK_OUT_DATE) = CURDATE()
    // AND TIME(b.CHECK_OUT_DATE) >= CURRENT_TIME
    // ORDER BY r.ROOM_NUMBER ASC`;

    const extendedDetailsQuery = `
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
      COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    FROM booking b
    LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
    LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
    WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.EXTENDED = 1
    ORDER BY r.ROOM_NUMBER ASC
  `;

    const lateCheckOutDetailsQuery = `
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
     COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
   FROM booking b
   LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
   LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
   LEFT JOIN room r ON b.ROOM_ID = r.IDNo
   LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
 WHERE b.ACTIVE = 1 AND (DATE(b.CHECK_OUT_DATE) = CURDATE()) AND b.BOOKING_STATUS = 'check-In' AND b.LATE_CHECKOUT = 1 ORDER BY r.ROOM_NUMBER ASC
   `;
    

   const bookingTodayQuery = `
      SELECT COUNT(*) AS totalBookingsToday
      FROM booking
      WHERE DATE(CHECK_IN_DATE) <= CURDATE()
        AND BOOKING_STATUS IN ('pending', 'check-In')
        AND IS_OCCUPIED = 0
        AND ACTIVE = 1`;
        
    //     const TodayCheckedInQuery = `
//       SELECT COUNT(*) AS TODAY_CHECKEDIN
// FROM booking
// WHERE ACTIVE = 1  AND (
//     (CURDATE() > DATE(CHECK_IN_DATE) AND CURDATE() < DATE(CHECK_OUT_DATE)) 
//     OR (CURDATE() = DATE(CHECK_IN_DATE) AND TIME(CURRENT_TIME) >= TIME(CHECK_IN_DATE)) 
//     OR (CURDATE() = DATE(CHECK_OUT_DATE) AND TIME(CURRENT_TIME) < TIME(CHECK_OUT_DATE)) AND BOOKING_STATUS = 2
//   )`;

  const TodayCheckedInQuery = `
  SELECT COUNT(*) AS TODAY_CHECKEDIN
FROM booking
WHERE ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 1`;


// const TodayBookingPendingQuery = `
//   SELECT COUNT(*) AS TODAY_PENDING
//   FROM booking
//   WHERE (DATE(CHECK_IN_DATE) = CURDATE() AND TIME(CHECK_IN_DATE) > CURRENT_TIME)
//      OR (DATE(CHECK_IN_DATE) > CURDATE())
//     AND ACTIVE = 1;
// `;

const LateInOutQuery = `
 SELECT 
    COUNT(*) AS TotalLateInOut
FROM booking b1
JOIN room r ON b1.ROOM_ID = r.IDNo
LEFT JOIN customer c1 ON b1.CUSTOMER_ID = c1.IDNo
LEFT JOIN booking b2 ON b1.ROOM_ID = b2.ROOM_ID 
    AND DATE(b2.CHECK_IN_DATE) >= DATE(b1.CHECK_OUT_DATE) 
    AND b2.ACTIVE = 1
LEFT JOIN customer c2 ON b2.CUSTOMER_ID = c2.IDNo
WHERE 
    b1.LATE_CHECKOUT = 1 -- ✅ Only Late Check-Outs
    AND b2.CHECK_IN_STATUS = 0 -- ✅ Only Late Check-Ins
    AND (DATE(b2.CHECK_IN_STATUS) = CURDATE() OR DATE(b1.CHECK_OUT_DATE) = CURDATE())
    AND b1.ACTIVE = 1`;



    const TodayCheckedOutQuery = `
    SELECT COUNT(*) AS TODAY_CHECKEDOUT
    FROM booking
    WHERE DATE(CHECK_OUT_DATE) = CURDATE()
      AND ACTIVE = 1`;

    // const UpcomingCheckOutQuery = `
    // SELECT COUNT(*) AS UPCOMING_CHECKOUT
    // FROM booking
    // WHERE DATE(CHECK_OUT_DATE) = CURDATE()
    // AND TIME(CHECK_OUT_DATE) >= CURRENT_TIME
    //   AND ACTIVE = 1`;

      const ExtendedQuery =`
  SELECT COUNT(*) AS EXTENDED
FROM booking
WHERE ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND EXTENDED = 1`;

      

  const LateCheckOutQuery = `
    SELECT COUNT(*) AS LATE_CHECKOUT
      FROM booking
  WHERE LATE_CHECKOUT = 1
  AND ACTIVE = 1 AND BOOKING_STATUS = 'check-In' AND DATE(CHECK_OUT_DATE= CURDATE())`;

//     const bookingMonthlyQuery = `
//       SELECT 
//     COUNT(*) AS totalBookingsMonthly,
//     SUM(CASE 
//             WHEN (DATE(CHECK_OUT_DATE) < CURDATE())
//               OR (DATE(CHECK_OUT_DATE) = CURDATE() AND TIME(CHECK_OUT_DATE) <= CURRENT_TIME)
//             THEN 1
//             ELSE 0 
//         END) AS completedBookingsMonthly,
//     SUM(CASE 
//             WHEN (DATE(CHECK_OUT_DATE) > CURDATE())
//               OR (DATE(CHECK_OUT_DATE) = CURDATE() AND TIME(CHECK_OUT_DATE) > CURRENT_TIME)
//             THEN 1
//             ELSE 0 
//         END) AS pendingBookingsMonthly
// FROM booking
// WHERE MONTH(CHECK_IN_DATE) = MONTH(CURDATE())
//   AND YEAR(CHECK_IN_DATE) = YEAR(CURDATE())
//   AND ACTIVE = 1;
// `;
const bookingMonthlyQuery = `
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
  AND ACTIVE = 1;
`;
    
    const totalSalesQuery = `
     SELECT SUM((ROOM_CHARGE * QTY) + AMENITIES_CHARGE + SERVICES_CHARGE) AS totalSales
      FROM billing
      WHERE PAYMENT_STATUS = 'paid'`;

    

      const OccupiedNotMoveQeury = `
       SELECT COUNT(*) AS OccupiedNotMove FROM booking 
      WHERE BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 0
    `;

      const roomStatusesQuery = `
      SELECT 
        COUNT(*) AS totalRooms,
        SUM(CASE WHEN ROOM_STATUS = 1 THEN 1 ELSE 0 END) AS availableRooms,
        SUM(CASE WHEN ROOM_STATUS = 2 THEN 1 ELSE 0 END) AS occupiedRooms,
        SUM(CASE WHEN ROOM_STATUS = 3 THEN 1 ELSE 0 END) AS underMaintenanceRooms,
        SUM(CASE WHEN ROOM_STATUS = 4 THEN 1 ELSE 0 END) AS cleaningRooms
      FROM room
      WHERE ACTIVE = 1
    `;

    const availableRoomDetailsQuery = `
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
    `;

    const underMaintenanceRoomDetailsQuery = `
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
    `;

    const cleaningRoomDetailsQuery = `
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
    `;

    const occupiedRoomDetailsQuery = `
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
      COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
    FROM booking b
    LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
    LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
    LEFT JOIN room r ON b.ROOM_ID = r.IDNo
    LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
    LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
    LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
    WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.IS_OCCUPIED = 1 
    ORDER BY r.ROOM_NUMBER ASC
  `;

    const transferredRoomDetailsQuery = `
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
     COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus
   FROM booking b
   LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
   LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
   LEFT JOIN room r ON b.ROOM_ID = r.IDNo
   LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
 WHERE b.ACTIVE = 1 AND r.ROOM_STATUS = 2 AND b.BOOKING_STATUS = 'check-In' AND b.TRANSFER != 0 ORDER BY r.ROOM_NUMBER ASC
   `;
    
    const roomDataQuery = `
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
    `;

    const floorQuery = `
    SELECT DISTINCT ROOM_FLOOR AS floor FROM room WHERE ACTIVE = 1
  `;

  const cleanupNotificationsQuery = 'SELECT * FROM cleanup_notifications ORDER BY created_at DESC';

  const occupiedRoomDetails = await queryDatabase(occupiedRoomDetailsQuery);

  // Query transfer logs for all occupied rooms
const roomTransferLogsQuery = async () => {
  const transferLogs = {};
  
  // Fetch transfer logs for each occupied room's BookingID
  for (const room of occupiedRoomDetails) {
    const logs = await queryDatabase(`
       SELECT 
                rtl.IDNo AS LogID,
                rtl.BOOKING_ID AS BookingID,
                rtl.OLD_ROOM_ID,
                oldRoom.ROOM_NUMBER AS OldRoomNumber, -- Join for OLD_ROOM_ID
                rtl.NEW_ROOM_ID,
                newRoom.ROOM_NUMBER AS NewRoomNumber, -- Join for NEW_ROOM_ID
                rtl.TRANSFER_DATE
            FROM room_transfer_logs rtl
            LEFT JOIN room oldRoom ON oldRoom.IDNo = rtl.OLD_ROOM_ID -- Join for OLD_ROOM_ID
            LEFT JOIN room newRoom ON newRoom.IDNo = rtl.NEW_ROOM_ID -- Join for NEW_ROOM_ID
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
};


    const [
      bookingTodayResults,
      TodayCheckedInResults,
      TodayCheckedOutResults,
    //  UpcomingCheckOutResults,
      ExtendedQueryResults,
     // TodayBookingPendingResults,
     LateInOutQueryResults,
      bookingMonthlyResults,
      totalSalesResults,
      LateCheckOutResults,
      todayCheckInDetails,
    //  todayPendingDetails,
    groupBookingDetails,
      lateInOutDetails,
      todayCheckedOutDetails,
    //  upcomingCheckOutDetails,
    
      extendedDetails,
      lateCheckOutDetails,
      roomStatusesResults,
      OccupiedNotMoveResults,
      availableRoomDetails,
      underMaintenanceRoomDetails,
      cleaningRoomDetails,
      transferredRoomDetails,
      roomDataResults,
      floors,
      cleanupNotifications,
      transferLogs // Add this
      // roomStatusCountResults
    ] = await Promise.all([
      queryDatabase(bookingTodayQuery),
      queryDatabase(TodayCheckedInQuery),
      queryDatabase(TodayCheckedOutQuery),
    //  queryDatabase(UpcomingCheckOutQuery),
      queryDatabase(ExtendedQuery),
    //  queryDatabase(TodayBookingPendingQuery),
    queryDatabase(LateInOutQuery),
      queryDatabase(bookingMonthlyQuery),
      queryDatabase(totalSalesQuery),
      queryDatabase(LateCheckOutQuery),
      queryDatabase(todayCheckInDetailsQuery),
    //  queryDatabase(todayPendingDetailsQuery),
    queryDatabase(groupBookingDetailsQuery),
    queryDatabase(lateInOutDetailsQuery),
      queryDatabase(todayCheckedOutDetailsQuery),   
    //  queryDatabase(upcomingCheckOutDetailsQuery),  
      queryDatabase(extendedDetailsQuery),
      queryDatabase(lateCheckOutDetailsQuery),   
      queryDatabase(roomStatusesQuery),
      queryDatabase(OccupiedNotMoveQeury),
      queryDatabase(availableRoomDetailsQuery),
      queryDatabase(underMaintenanceRoomDetailsQuery),
      queryDatabase(cleaningRoomDetailsQuery),
      queryDatabase(transferredRoomDetailsQuery),
      queryDatabase(roomDataQuery),
      queryDatabase(floorQuery),
      queryDatabase(cleanupNotificationsQuery),
      roomTransferLogsQuery() // Fetch transfer logs for occupied rooms
    ]);

    const totalBookingsToday = bookingTodayResults[0].totalBookingsToday;
    const TODAY_CHECKEDIN = TodayCheckedInResults[0].TODAY_CHECKEDIN;
    const TODAY_CHECKEDOUT = TodayCheckedOutResults[0].TODAY_CHECKEDOUT;
  //  const UPCOMING_CHECKOUT = UpcomingCheckOutResults[0].UPCOMING_CHECKOUT;
    const EXTENDED = ExtendedQueryResults[0].EXTENDED;
  //  const TODAY_PENDING = TodayBookingPendingResults[0].TODAY_PENDING;
  const LATE_IN_OUT = LateInOutQueryResults[0].TotalLateInOut;
    const totalBookingsMonthly = bookingMonthlyResults[0].totalBookingsMonthly;
    const completedBookingsMonthly = bookingMonthlyResults[0].completedBookingsMonthly;
    const pendingBookingsMonthly = bookingMonthlyResults[0].pendingBookingsMonthly;
    const totalSales = totalSalesResults[0].totalSales;
    const LATE_CHECKOUT = LateCheckOutResults[0].LATE_CHECKOUT;
    const {
      totalRooms = 0,
      availableRooms = 0,
      occupiedRooms = 0,
      underMaintenanceRooms = 0,
      cleaningRooms = 0,
    } = roomStatusesResults[0];
    const OccupiedNotMove = OccupiedNotMoveResults[0].OccupiedNotMove;
    
    // **Iproseso ang Room Data upang matukoy ang Status**
    const processedRoomData = roomDataResults.map(room => {
      let status = 'Unknown';

      // Convert ROOM_STATUS to number
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

      // Assign badge class base sa status
      let badgeClass = 'label-default';
      switch(status) {
        case 'Available':
          badgeClass = 'label-success'; // Green
          break;
        case 'Cleaning':
          badgeClass = 'label-warning'; // Yellow
          break;
        case 'Occupied':
          badgeClass = 'label-danger'; // Red
          break;
        case 'Under Maintenance':
          badgeClass = 'label-default'; // gray
          break;
        default:
          badgeClass = 'label-default'; // Gray
      }

      return {
        ROOM_NUMBER: room.ROOM_NUMBER,
        ROOM_TYPE_NAME: room.ROOM_TYPE_NAME || 'N/A', // Handle nulls
        ROOM_DESCRIPTION: room.ROOM_DESCRIPTION,
        status,
        badgeClass
      };
    });

    // For each occupied room, we fetch device states
const deviceStatusPromises = occupiedRoomDetails.map(async (room) => {

  // Clean Up (Broom Icon)
  room.makeUpStatus = room.DeviceID
    ? await fetchHAState(room.DeviceID)
    : 'off';

  // DND Icon
  room.dndStatus = room.DndID
    ? await fetchHAState(room.DndID)
    : 'off';

  // Card Holder (In/Out)
  room.cholderStatus = room.CholderID
    ? await fetchHAState(room.CholderID)
    : 'off';

  await updateCleanupNotification(room);
  return room;
});



    
   
    

      const updatedRoomDetails = await Promise.all(deviceStatusPromises);
    const broomNotifications = updatedRoomDetails.filter(
      (room) => room.deviceStatus === 'on' || room.completedTimestamp
    );
    const pendingBroomNotifications = broomNotifications.filter(notif => !notif.completedTimestamp);
    // I-render ang dashboard at ipasa ang mga kinakailangang data
    res.locals.updatedRoomDetails = updatedRoomDetails;


    // Sa dulo ng iyong dashboard route handler, bago ang res.render:
    const io = req.app.get('io');
    io.emit('occupiedRoomDetailsUpdate', updatedRoomDetails);

res.render('dashboard', { 
  user,
  userId, 
  tabOrder,  
  totalBookingsToday,
  TODAY_CHECKEDIN,
  TODAY_CHECKEDOUT,
 // UPCOMING_CHECKOUT, 
  EXTENDED,
  LATE_IN_OUT,
  //TODAY_PENDING,
  LATE_CHECKOUT,
  totalBookingsMonthly,
  completedBookingsMonthly,
  pendingBookingsMonthly,
  totalSales,
  employees: categorizedEmployees,
  todayCheckInDetails,
//  todayPendingDetails,
groupBookingDetails,
  lateInOutDetails,
  todayCheckedOutDetails,
//  upcomingCheckOutDetails,
  extendedDetails,
  lateCheckOutDetails,
  cleaningRoomDetails,
  totalRooms,
  availableRooms,
  occupiedRooms,
  underMaintenanceRooms,
  cleaningRooms,
  availableRoomDetails,
  underMaintenanceRoomDetails,
  OccupiedNotMove,
  transferredRoomDetails,
  occupiedRoomDetails: updatedRoomDetails,
  rooms: processedRoomData, // Ipasok ang room data
  floors,
  broomNotifications,           // para sa modal kung nais mong gamitin ang data na ito para sa topbar (kung hindi, gamitin cleanupNotifications)
  pendingBroomNotifications,
  cleanupNotifications,         // variable na gagamitin sa pop-up modal
  hasValidNotifications: updatedRoomDetails.some((room) => room.deviceStatus === 'on' || room.completedTimestamp),
  transferLogs, // Pass transfer logs to EJS
  timeAgo,
});

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Route to fetch available rooms for transfer
router.get('/transfer-available-rooms', (req, res) => {
  const { currentRoom, checkOutDate } = req.query;

  if (!currentRoom || !checkOutDate) {
    return res.status(400).json({ error: 'Missing required query parameters.' });
  }

  // Get the current date (transferDate) in YYYY-MM-DD format
  const transferDate = new Date().toISOString().split('T')[0];
  const formattedCheckOutDate = new Date(checkOutDate).toISOString().split('T')[0];

  // const query = `
  //   SELECT r.IDNo AS ROOM_ID, r.ROOM_NUMBER, r.ROOM_STATUS, r.ROOM_FLOOR
  //   FROM room r
  //   WHERE r.IDNo != ?
  //   AND r.IDNo NOT IN (
  //       SELECT b.ROOM_ID
  //       FROM booking b
  //       WHERE NOT (
  //           DATE(b.CHECK_OUT_DATE) <= ?
  //           OR DATE(b.CHECK_IN_DATE) >= ?
  //       )
  //   ) AND r.ROOM_STATUS != 3
  // `;
  const query = `
    SELECT 
      r.IDNo AS ROOM_ID, 
      r.ROOM_NUMBER, 
      r.ROOM_STATUS, 
      r.ROOM_FLOOR,
      (SELECT DATE(b.CHECK_OUT_DATE)
        FROM booking b
        WHERE b.ROOM_ID = r.IDNo
          AND DATE(b.CHECK_OUT_DATE) = ?
        LIMIT 1) AS OCCUPANT_CHECK_OUT_TODAY
    FROM room r
    WHERE r.IDNo != ?
      AND r.IDNo NOT IN (
        SELECT b.ROOM_ID
        FROM booking b
        WHERE NOT (
          DATE(b.CHECK_OUT_DATE) <= ?
          OR DATE(b.CHECK_IN_DATE) >= ?
        )
      )
      AND r.ROOM_STATUS != 3
  `;

  pool.query(
    query,
    [transferDate, currentRoom, transferDate, formattedCheckOutDate],
    (err, results) => {
      if (err) {
        console.error('Error fetching available rooms for transfer:', err);
        return res.status(500).json({ error: 'Failed to fetch available rooms for transfer.' });
      }

      res.status(200).json(results);
    }
  );
});


router.post('/transfer-room', (req, res) => {
  const { bookingId, oldRoomId, newRoomId } = req.body;
  const userId = req.session.userId || "System"; // Default to "System" if session user is not available
  const transferDate = new Date();

  if (!bookingId || !oldRoomId || !newRoomId || !transferDate) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      return res.status(500).json({ error: "Database connection error." });
    }

    // Start a transaction to ensure all queries succeed together
    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error starting transaction:", err);
        connection.release();
        return res.status(500).json({ error: "Transaction start error." });
      }

      // Step 1: Update `ROOM_ID`, `TRANSFER`, and `TRANSFER_FROM` in `booking`
      connection.query(
        `UPDATE booking 
         SET ROOM_ID = ?, TRANSFER = 1, TRANSFER_FROM = ?, 
             EDITED_BY = ?, EDITED_DT = NOW() 
         WHERE IDNo = ?`,
        [newRoomId, oldRoomId, userId, bookingId],
        (err) => {
          if (err) {
            console.error("Error updating booking:", err);
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ error: "Failed to update booking." });
            });
          }


              // Step 3: Update old room to "Cleaning" and new room to "Occupied" in a single query
              connection.query(
                `UPDATE room 
                 SET ROOM_STATUS = CASE 
                     WHEN IDNo = ? THEN 4  -- Old room set to "Cleaning"
                     WHEN IDNo = ? THEN 2  -- New room set to "Occupied"
                 END 
                 WHERE IDNo IN (?, ?)`,
                [oldRoomId, newRoomId, oldRoomId, newRoomId],
                (err) => {
                  if (err) {
                    console.error("Error updating room statuses:", err);
                    return connection.rollback(() => {
                      connection.release();
                      res.status(500).json({ error: "Failed to update room statuses." });
                    });
                  }

                  // Step 4: Log the transfer in `room_transfer_logs`
                  connection.query(
                    `INSERT INTO room_transfer_logs (
                      BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE
                    ) VALUES (?, ?, ?, ?)`,
                    [bookingId, oldRoomId, newRoomId, transferDate],
                    (err) => {
                      if (err) {
                        console.error("Error logging transfer:", err);
                        return connection.rollback(() => {
                          connection.release();
                          res.status(500).json({ error: "Failed to log transfer." });
                        });
                      }

                      // Commit transaction
                      connection.commit((err) => {
                        connection.release();
                        if (err) {
                          console.error("Error committing transaction:", err);
                          return res.status(500).json({ error: "Transaction commit error." });
                        }
                        res.status(200).json({ message: "Room transfer successful." });
                      });
                    }
                  );
                }
              );
        }
      );
    });
  });
});

// EXTEND START 
router.get("/extend-check-room", async (req, res) => {
  const { roomId, checkoutDate, daysToExtend } = req.query;

  try {
    const checkoutDateObj = new Date(checkoutDate);
    if (isNaN(checkoutDateObj) || !daysToExtend) {
      return res.status(400).json({ success: false, message: "Invalid parameters." });
    }

    // Calculate the extended end date
    const extendedEndDate = new Date(checkoutDateObj);
    extendedEndDate.setDate(extendedEndDate.getDate() + parseInt(daysToExtend));

    // console.log("Extended Period:", {
    //   start: checkoutDateObj.toISOString(),
    //   end: extendedEndDate.toISOString(),
    //   room: roomId
    // });

    // Check if the current room is available during the full extended period
    const currentRoomQuery = `
      SELECT 1
      FROM booking
      WHERE ROOM_ID = ?
      AND (
        CHECK_IN_DATE < ?
        AND CHECK_OUT_DATE > ?
      )
      AND ACTIVE = 1
    `;
    const isRoomUnavailable = (
      await queryDatabase(currentRoomQuery, [
        roomId,
        extendedEndDate.toISOString().slice(0, 19).replace("T", " "),
        checkoutDateObj.toISOString().slice(0, 19).replace("T", " "),
      ])
    ).length > 0;

    // console.log("Current Room Availability:", isRoomUnavailable ? "Unavailable" : "Available");

    let availableRooms = [];
    if (isRoomUnavailable) {
      // Fetch rooms available for the full extended period
      const availableRoomsQuery = `
        SELECT r.IDNo AS ROOM_ID, r.ROOM_NUMBER, rt.NAME AS RoomType, r.ROOM_FLOOR
        FROM room r
        JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ACTIVE = 1
        AND NOT EXISTS (
          SELECT 1 FROM booking b
          WHERE b.ROOM_ID = r.IDNo
          AND (
            b.CHECK_IN_DATE < ?
            AND b.CHECK_OUT_DATE > ?
          )
          AND b.ACTIVE = 1
        )
      `;
      availableRooms = await queryDatabase(availableRoomsQuery, [
        extendedEndDate.toISOString().slice(0, 19).replace("T", " "),
        checkoutDateObj.toISOString().slice(0, 19).replace("T", " "),
      ]);

      //console.log("Available Rooms:", availableRooms);
    }

    res.json({ currentRoomAvailable: !isRoomUnavailable, availableRooms });
  } catch (error) {
    console.error("Error checking room availability:", error);
    res.status(500).json({ success: false, message: "Failed to check room availability." });
  }
});


router.post("/extend-stay", async (req, res) => {
  const { currentRoomId, newRoomId, daysToExtend, bookingId, cost } = req.body;

  const parsedCost = parseFloat(cost) || 0;
 

  try {
    // Fetch the current booking's checkout date and check if it's a group booking
    const currentBookingQuery = `SELECT CHECK_OUT_DATE, c.IS_GROUP 
                                 FROM booking b
                                 JOIN customer c ON b.CUSTOMER_ID = c.IDNo 
                                 WHERE b.IDNo = ? AND b.ACTIVE = 1`;
    const result = await queryDatabase(currentBookingQuery, [bookingId]);

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found. Please check the booking ID.",
      });
    }

    const currentBooking = result[0];
    const currentCheckoutDate = new Date(currentBooking.CHECK_OUT_DATE);
    const isGroup = currentBooking.IS_GROUP === 1; // Check if it's a group booking

    // Compute the new checkout date in JavaScript
    const newCheckoutDate = new Date(currentCheckoutDate);
    newCheckoutDate.setDate(newCheckoutDate.getDate() + parseInt(daysToExtend, 10)); // Adding days

    // Convert to MySQL format
    const formattedNewCheckoutDate = newCheckoutDate;

    // Check for booking conflicts
    const conflictQuery = `
      SELECT 1
      FROM booking
      WHERE ROOM_ID = ?
      AND CHECK_IN_DATE < ?
      AND CHECK_OUT_DATE > ?
      AND IDNo != ?
      AND ACTIVE = 1
    `;
    const conflict = (
      await queryDatabase(conflictQuery, [
        newRoomId || currentRoomId,
        formattedNewCheckoutDate,
        currentCheckoutDate,
        bookingId,
      ])
    ).length > 0;

    if (conflict) {
      return res.json({
        success: false,
        message: "The selected room is unavailable for the extended period.",
      });
    }

    // Perform the extension
    if (!newRoomId || newRoomId === currentRoomId) {
      // Extend stay in the current room
      const query = `
       UPDATE booking
        SET CHECK_OUT_DATE = ?, EXTENDED = 1, EXTENDED_DAYS = EXTENDED_DAYS + ?
        WHERE ROOM_ID = ? AND IDNo = ? AND ACTIVE = 1
            `;
      await queryDatabase(query, [formattedNewCheckoutDate, daysToExtend, currentRoomId, bookingId]);

      // Update the current room's status to "Occupied" (2)
      const updateRoomStatusQuery = `
        UPDATE room
        SET ROOM_STATUS = 2
        WHERE IDNo = ?
      `;
      await queryDatabase(updateRoomStatusQuery, [currentRoomId]);
    } else {
      // Transfer the guest to a new room
      const transferQuery = `
         UPDATE booking
        SET ROOM_ID = ?, CHECK_OUT_DATE = ?, TRANSFER = 1, EXTENDED = 1, EXTENDED_DAYS = EXTENDED_DAYS + ?
        WHERE ROOM_ID = ? AND IDNo = ? AND ACTIVE = 1
      `;
      await queryDatabase(transferQuery, [newRoomId, formattedNewCheckoutDate, daysToExtend, currentRoomId, bookingId]);

      // Update the current room's status to "Under Maintenance" (3)
      const updateCurrentRoomStatusQuery = `
        UPDATE room
        SET ROOM_STATUS = 4
        WHERE IDNo = ?
      `;
      await queryDatabase(updateCurrentRoomStatusQuery, [currentRoomId]);

      // Update the new room's status to "Occupied" (2)
      const updateNewRoomStatusQuery = `
        UPDATE room
        SET ROOM_STATUS = 2
        WHERE IDNo = ?
      `;
      await queryDatabase(updateNewRoomStatusQuery, [newRoomId]);

      // Insert a record into the room_transfer_logs table
      const transferLogQuery = `
        INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
        VALUES (?, ?, ?, NOW())
      `;
      await queryDatabase(transferLogQuery, [bookingId, currentRoomId, newRoomId]);
    }


// await queryDatabase(updateExtendPaymentStatusQuery, [bookingId]);
const insertExtensionQuery = `
  INSERT INTO booking_extension (
    BOOKING_ID,
    EXTEND_DATE,
    QTY,
    COST,
    PAYMENT_STATUS,
    ENCODED_BY
  )
  VALUES (?, CURDATE(), ?, ?, 'unpaid', ?)
`;
await queryDatabase(insertExtensionQuery, [
  bookingId,
  daysToExtend,
  parsedCost, // ← define this below
  req.session.userId || null
]);


    res.json({ success: true });
  } catch (error) {
    console.error("Error extending stay:", error);
    res.status(500).json({ success: false, message: "Failed to extend stay." });
  }
});


//EXTEND END

router.get("/late-check-room", async (req, res) => {
  const { roomId, checkoutDate, currentBookingId } = req.query;

  try {
           // 🔍 Convert `checkoutDate` to ISO 8601 format for logging and consistency
           const formattedCheckoutDate = new Date(checkoutDate).toISOString();
          //  console.log(`🔍 Checking Late Check-Out Availability for Room ID: ${roomId}, Checkout Date: ${formattedCheckoutDate}, Current Booking ID: ${currentBookingId}`);
     
           // **Fetch all future bookings for this room, EXCLUDING the current booking**
           const nextBookingsQuery = `
               SELECT IDNo, CHECK_IN_STATUS, CHECK_IN_DATE
               FROM booking
               WHERE ROOM_ID = ? 
               AND CHECK_IN_DATE >= ? -- Only future bookings
               AND IDNo != ?  -- EXCLUDE CURRENT BOOKING
               AND ACTIVE = 1
               ORDER BY CHECK_IN_DATE ASC
           `;
           const nextBookings = await queryDatabase(nextBookingsQuery, [roomId, formattedCheckoutDate, currentBookingId]);

      // **Format check-in dates for logging**
      const formattedBookings = nextBookings.map(booking => ({
          IDNo: booking.IDNo,
          CHECK_IN_STATUS: booking.CHECK_IN_STATUS,
          // CHECK_IN_DATE: new Date(booking.CHECK_IN_DATE).toISOString() // Ensures correct format
          CHECK_IN_DATE: new Date(booking.CHECK_IN_DATE).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }) // Keep local time
      }));

      // console.log("📌 Next Booking Query Result (Excluding Current Booking):", formattedBookings);

      // **Find the next check-in that might cause a conflict**
      const conflictingBooking = nextBookings.find(booking => booking.CHECK_IN_STATUS === 1 && new Date(booking.CHECK_IN_DATE) <= new Date(checkoutDate));

      if (conflictingBooking) {
          // console.log(`❌ Conflict Found - Regular Check-In (Booking ID: ${conflictingBooking.IDNo}), must move room.`);

          // **Fetch available rooms if a room change is needed**
          const availableRoomsQuery = `
              SELECT r.IDNo AS ROOM_ID, r.ROOM_NUMBER, r.ROOM_FLOOR, rt.NAME AS RoomType
              FROM room r
              JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
              WHERE r.ACTIVE = 1 
              AND NOT EXISTS (
                  SELECT 1 FROM booking b
        WHERE b.ROOM_ID = r.IDNo
           AND b.CHECK_IN_DATE <= DATE_ADD(?, INTERVAL 1 DAY) -- ✅ Includes check-ins on the same day
    AND b.CHECK_OUT_DATE > ? 
              )
          `;
          const availableRooms = await queryDatabase(availableRoomsQuery, [formattedCheckoutDate, formattedCheckoutDate]);

          return res.json({
              needRoomChange: true,
              availableRooms,
              message: "A Regular Check-In is scheduled during your Late Check-Out. Please select a new room."
          });
      }

      // ✅ If no conflicting next booking, guest can stay in the same room
      // console.log("✅ No conflicts, Guest can stay in the same room.");
      return res.json({ 
          needRoomChange: false 
      });

  } catch (error) {
      console.error("🚨 Error checking late check-out:", error);
      res.status(500).json({ success: false, message: "Failed to check Late Check-Out availability." });
  }
});



router.post("/late-checkout", async (req, res) => {
  const { currentRoomId, newRoomId, bookingId } = req.body;

  try {
      // console.log(`🔄 Processing Late Check-Out for Booking ID: ${bookingId}`);

      // **Fetch the total days of stay for this booking**
      const totalDaysQuery = `SELECT DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) AS TotalDays FROM booking WHERE IDNo = ? AND ACTIVE = 1`;
      const totalDaysResult = await queryDatabase(totalDaysQuery, [bookingId]);
      const totalDays = totalDaysResult.length > 0 ? totalDaysResult[0].TotalDays : null;

      // console.log(`📌 Total Days Stayed: ${totalDays}`);

      let lateCheckoutFee = 0;

      // **Apply ₱2,000 Fee if stay is less than 3 days**
      if (totalDays !== null && totalDays < 3) {
          lateCheckoutFee = 2000;
          // console.log(`💰 Late Check-Out Fee Applied: ₱${lateCheckoutFee}`);
      } else {
          // console.log("✅ Free Late Check-Out (Stay is 3 days or more)");
      }

      // **If a new room is chosen, transfer the guest**
      if (newRoomId && newRoomId !== currentRoomId) {
          // console.log(`🏨 Transferring Guest from Room ${currentRoomId} to Room ${newRoomId}`);

          // Update booking table
          const transferQuery = `
              UPDATE booking
              SET ROOM_ID = ?, TRANSFER = 1
              WHERE IDNo = ? AND ACTIVE = 1
          `;
          await queryDatabase(transferQuery, [newRoomId, bookingId]);

          // Log transfer in room_transfer_logs
          const logTransferQuery = `
              INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
              VALUES (?, ?, ?, NOW())
          `;
          await queryDatabase(logTransferQuery, [bookingId, currentRoomId, newRoomId]);

          // Update room status
          const updateOldRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 4 WHERE IDNo = ?`;
          const updateNewRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 2 WHERE IDNo = ?`;

          await queryDatabase(updateOldRoomStatusQuery, [currentRoomId]);
          await queryDatabase(updateNewRoomStatusQuery, [newRoomId]);

          // console.log("🔄 Room Transfer Completed.");
      }

      // ✅ Update LATE_CHECKOUT = 1 and adjust CHECK_OUT_DATE to 23:00:00
      const updateBookingQuery = `
          UPDATE booking
          SET LATE_CHECKOUT = 1, CHECK_OUT_DATE = CONCAT(DATE(CHECK_OUT_DATE), ' 23:00:00')
          WHERE IDNo = ? AND ACTIVE = 1
      `;
      await queryDatabase(updateBookingQuery, [bookingId]);

      // console.log("✅ Late Check-Out Updated Successfully.");

      // **If Late Check-Out Fee applies, UPDATE the billing table instead of inserting a new row**
      const insertBookingServiceQuery = `
    INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT) 
    VALUES (?, 72, 1, ?, ?, ?, NOW())
`;

const status = lateCheckoutFee > 0 ? 'unpaid' : 'paid';

await queryDatabase(insertBookingServiceQuery, [bookingId, lateCheckoutFee, status, req.session.userId]);

// console.log(lateCheckoutFee > 0 
//     ? "💵 Late Check-Out Fee Added to Booking Service as UNPAID." 
//     : "✅ No Late Check-Out Fee, service logged as PAID."
// );

      res.json({ success: true });

  } catch (error) {
      console.error("🚨 Error processing late check-out:", error);
      res.status(500).json({ success: false, message: "Failed to process Late Check-Out." });
  }
});

// MOVE TO OCCUPIED
router.post("/move-to-occupied", (req, res) => {
  const updateQuery = `
      UPDATE booking 
      SET IS_OCCUPIED = 1 
      WHERE BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 0
  `;

  pool.query(updateQuery, (err, result) => {
      if (err) {
          console.error("Error moving to occupied room:", err);
          return res.status(500).json({ error: "Internal server error" });
      }
      res.json({ success: true, message: "Checked-in guests moved to Occupied Room." });
  });
});

router.get("/check-move-to-occupied", (req, res) => {
  const checkQuery = `
      SELECT COUNT(*) AS count FROM booking 
      WHERE BOOKING_STATUS = 'check-In' AND IS_OCCUPIED = 0
  `;

  pool.query(checkQuery, (err, results) => {
      if (err) {
          console.error("Error checking guests:", err);
          return res.status(500).json({ error: "Internal server error" });
      }
      res.json({ count: results[0].count });
  });
});

router.get('/room-monitoring', async (req, res) => {
  try {
    const [rows] = await pool.promise().query(
      `SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_STATUS, r.ROOM_BED, r.ROOM_MAX, r.ROOM_TYPE_ID, r.ACTIVE
       FROM room r
       WHERE r.ROOM_FLOOR IN (3, 4, 5, 6) AND r.ACTIVE = 1
       ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC`
    );

    const floors = { 3: [], 4: [], 5: [], 6: [] };

    rows.forEach(room => {
      // parseInt kung sakaling string
      const floorNum = parseInt(room.ROOM_FLOOR, 10);
      if (!isNaN(floorNum) && floors[floorNum]) {
        floors[floorNum].push(room);
      }
    });

    res.json({ floors });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});





module.exports = router;
