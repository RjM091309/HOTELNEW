const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// Get the dist folder path (adjust based on your build output location)
const DIST_PATH = path.join(__dirname, '..', 'dist');
const UPDATES_PATH = path.join(__dirname, '..', 'updates');

// Get current app version from environment variable or package.json
let CURRENT_VERSION = process.env.APP_VERSION;
if (!CURRENT_VERSION) {
    try {
        const packageJson = require(path.join(__dirname, '..', 'package.json'));
        CURRENT_VERSION = packageJson.version || '1.0.1';
    } catch (error) {
        CURRENT_VERSION = '1.0.1';
    }
}

/**
 * GET /updates/check
 * Check for available updates
 * Returns version information and download URL
 */
router.get('/check', (req, res) => {
    try {
        // Check if dist folder exists
        const distExists = fs.existsSync(DIST_PATH);
        
        // You can also check for a specific version folder
        // For now, we'll return the current version
        const response = {
            version: CURRENT_VERSION,
            url: `https://pms.3core21.com/updates/download/${CURRENT_VERSION}`,
            mandatory: false, // Set to true for critical updates
            available: distExists,
            timestamp: new Date().toISOString()
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error checking for updates:', error);
        res.status(500).json({
            error: 'Failed to check for updates',
            message: error.message
        });
    }
});

/**
 * GET /updates/download/:version
 * Download the update bundle for a specific version
 * Serves the dist folder as a zip file or static files
 */
router.get('/download/:version', (req, res) => {
    try {
        const { version } = req.params;
        const format = req.query.format || 'zip'; // 'zip' or 'static'

        // Check if dist folder exists
        if (!fs.existsSync(DIST_PATH)) {
            return res.status(404).json({
                error: 'Update not found',
                message: `Dist folder not found. Please build the application first.`
            });
        }

        if (format === 'zip') {
            // Serve as zip file
            const zipFileName = `app-update-${version}.zip`;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            // Handle errors
            archive.on('error', (err) => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to create archive',
                        message: err.message
                    });
                }
            });

            // Pipe archive data to response
            archive.pipe(res);

            // Add all files from dist folder to archive
            archive.directory(DIST_PATH, false);

            // Finalize the archive
            archive.finalize();
        } else {
            // Serve static files directly
            // This allows the app to download individual files or use as a static server
            res.status(200).json({
                message: 'Static file serving',
                baseUrl: `https://pms.3core21.com/updates/static/${version}`,
                note: 'Use /updates/static/:version/* to access individual files'
            });
        }
    } catch (error) {
        console.error('Error downloading update:', error);
        res.status(500).json({
            error: 'Failed to download update',
            message: error.message
        });
    }
});

/**
 * GET /updates/static/:version/*
 * Serve static files from dist folder
 * This allows direct access to individual files in the update bundle
 */
router.get('/static/:version/*', (req, res) => {
    try {
        const filePath = req.params[0]; // Get the file path after /static/:version/
        const fullPath = path.join(DIST_PATH, filePath);

        // Security: Prevent directory traversal
        const resolvedPath = path.resolve(fullPath);
        const distResolved = path.resolve(DIST_PATH);
        
        if (!resolvedPath.startsWith(distResolved)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Invalid file path'
            });
        }

        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({
                error: 'File not found',
                message: `File ${filePath} not found in update bundle`
            });
        }

        // Check if it's a file (not a directory)
        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Path is not a file'
            });
        }

        // Serve the file
        res.sendFile(resolvedPath);
    } catch (error) {
        console.error('Error serving static file:', error);
        res.status(500).json({
            error: 'Failed to serve file',
            message: error.message
        });
    }
});

module.exports = router;

