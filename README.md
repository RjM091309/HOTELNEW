# Spice Hotel Management System

A complete hotel management system built with Node.js, Express.js, and EJS templating engine.

## Features

- 📊 **Dashboard** - Overview with statistics and charts
- 🏨 **Room Management** - Add, edit, and manage rooms
- 👥 **Staff Management** - Manage hotel staff
- 🚗 **Transportation** - Vehicle management
- 📧 **Email System** - Internal messaging
- 📅 **Booking System** - Guest booking management
- 📱 **Responsive Design** - Works on all devices

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd spice-hotel-management
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
# Create .env file with the following content:
NODE_ENV=development
PORT=3000
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to:
```
http://localhost:3000
```

## Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon
- `npm test` - Run tests (not implemented yet)

## Project Structure

```
spice-hotel-management/
├── app.js                 # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── .gitignore            # Git ignore file
├── README.md             # Project documentation
├── assets/               # Static files (CSS, JS, images)
├── views/                # EJS templates
│   ├── layout/          # Layout templates
│   ├── partials/        # Reusable components
│   ├── dashboard/       # Dashboard pages
│   ├── booking/         # Booking pages
│   ├── rooms/           # Room management pages
│   ├── staff/           # Staff management pages
│   ├── vehicles/        # Vehicle management pages
│   ├── email/           # Email system pages
│   └── error/           # Error pages
└── node_modules/        # Dependencies
```

## Routes

### Dashboard
- `GET /` - Main dashboard
- `GET /dashboard` - Dashboard overview
- `GET /dashboard2` - Alternative dashboard

### Booking Management
- `GET /new-booking` - Create new booking
- `GET /view-booking` - View all bookings
- `GET /edit-booking` - Edit booking

### Room Management
- `GET /add-room` - Add new room
- `GET /all-rooms` - View all rooms
- `GET /edit-room` - Edit room

### Staff Management
- `GET /add-staff` - Add new staff
- `GET /all-staffs` - View all staff
- `GET /edit-staff` - Edit staff

### Vehicle Management
- `GET /add-vehicle` - Add new vehicle
- `GET /all-vehicles` - View all vehicles
- `GET /edit-vehicle` - Edit vehicle

### Email System
- `GET /email-inbox` - Email inbox
- `GET /email-view` - View email
- `GET /email-compose` - Compose email

## Technologies Used

- **Backend**: Node.js, Express.js
- **Template Engine**: EJS
- **Frontend**: HTML5, CSS3, JavaScript
- **UI Framework**: Bootstrap 5
- **Icons**: Material Icons, Font Awesome
- **Charts**: Morris.js, Chart.js

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support, please open an issue in the repository or contact the development team. 