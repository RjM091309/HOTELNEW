const AgencyModel = require('../models/agencyModel');
const { chromium } = require('playwright');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs').promises;

class AgencyController {
  // Render agency management page
  static async renderAgencyPage(req, res) {
    try {
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('agency/agency-management', {
        title: 'Agency Management',
        subTitle: 'Agency Management',
        activePage: 'agency',
        user: user
      });
    } catch (error) {
      console.error('Error rendering agency page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // API endpoint to get agencies data
  static async getAgenciesData(req, res) {
    try {
      const agencies = await AgencyModel.getAllAgencies();
      res.json({ 
        success: true, 
        agencies: agencies 
      });
    } catch (error) {
      console.error('Error fetching agencies data:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving agencies data.' 
      });
    }
  }

  // Get bookings for a specific agency
  static async getAgencyBookings(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Agency ID is required' });
      }

      const bookings = await AgencyModel.getAgencyBookings(id);
      res.json({ success: true, bookings });
    } catch (error) {
      console.error('Error fetching agency bookings:', error);
      res.status(500).json({ success: false, message: 'Error retrieving agency bookings.' });
    }
  }

  // Add a new agency
  static async addAgency(req, res) {
    try {
      const { name, contactNumber } = req.body;
      
      if (!name || name.trim() === '') {
        return res.json({ success: false, message: 'Agency name is required.' });
      }

      // Check if agency name already exists
      const nameExists = await AgencyModel.checkAgencyNameExists(name);
      if (nameExists) {
        return res.json({ success: false, message: 'Agency name already exists.' });
      }

      // Use JWT userId (numeric) to match ENCODED_BY int column
      const encodedBy = req.user ? req.user.userId : null;
      const result = await AgencyModel.addAgency(name.trim(), contactNumber, encodedBy);
      
      if (result.success) {
        // Fetch the newly created agency to return complete data
        const newAgency = await AgencyModel.getAgencyById(result.id);
        res.json({ 
          success: true, 
          message: 'Agency added successfully!',
          agency: newAgency
        });
      } else {
        res.status(500).json({ success: false, message: 'Error adding agency.' });
      }
    } catch (error) {
      console.error('Error adding agency:', error);
      res.status(500).json({ success: false, message: 'Error adding agency.' });
    }
  }

  // Get agency by ID
  static async getAgencyById(req, res) {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ message: 'Agency ID is required' });
      }

      const agency = await AgencyModel.getAgencyById(id);
      
      if (!agency) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      res.json({ success: true, agency });
    } catch (error) {
      console.error('Error fetching agency data:', error);
      res.status(500).json({ message: 'Error fetching agency data' });
    }
  }

  // Update an existing agency
  static async updateAgency(req, res) {
    try {
      const id = req.params.id;
      const { name, contactNumber } = req.body;

      if (!name || name.trim() === '') {
        return res.json({ success: false, message: 'Agency name is required.' });
      }

      // Check if agency name already exists (excluding current agency)
      const nameExists = await AgencyModel.checkAgencyNameExists(name, id);
      if (nameExists) {
        return res.json({ success: false, message: 'Agency name already exists.' });
      }

      // Use JWT userId (numeric) to match EDITED_BY int column
      const editedBy = req.user ? req.user.userId : null;
      const result = await AgencyModel.updateAgency(id, name.trim(), contactNumber, editedBy);
      
      if (result.success) {
        // Fetch the updated agency to return complete data
        const updatedAgency = await AgencyModel.getAgencyById(id);
        res.json({ 
          success: true, 
          message: 'Agency updated successfully!',
          agency: updatedAgency
        });
      } else if (result.notFound) {
        res.status(404).json({ success: false, message: 'Agency not found or already inactive.' });
      } else {
        res.status(500).json({ success: false, message: 'Error updating agency.' });
      }
    } catch (error) {
      console.error('Error updating agency:', error);
      res.status(500).json({ success: false, message: 'Error updating agency.' });
    }
  }

  // Soft delete an agency
  static async deleteAgency(req, res) {
    try {
      const agencyId = req.params.id;
      const result = await AgencyModel.deleteAgency(agencyId);
      
      if (result.success) {
        res.status(200).json({ 
          success: true,
          message: 'Agency deleted successfully' 
        });
      } else if (result.hasBookings) {
        res.status(400).json({ 
          success: false,
          message: result.message 
        });
      } else if (result.notFound) {
        res.status(404).json({ 
          success: false,
          message: 'Agency not found or already inactive' 
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Error deleting agency' 
        });
      }
    } catch (error) {
      console.error('Error deleting agency:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error deleting agency' 
      });
    }
  }

  // Bulk payment for an agency across multiple bookings
  static async bulkPayment(req, res) {
    try {
      const agencyId = req.params.id;
      const { bookingIds = [], amount, paymentMethod, remarks = '' } = req.body;
      const encodedBy = req.user ? req.user.userId : null;

      const parsedAmount = parseFloat(amount);
      if (!agencyId) {
        return res.status(400).json({ success: false, message: 'Agency ID is required.' });
      }
      if (!paymentMethod || !paymentMethod.trim()) {
        return res.status(400).json({ success: false, message: 'Payment method is required.' });
      }
      if (!parsedAmount || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero.' });
      }

      // Normalize bookingIds to an integer array (optional input)
      let bookingIdList = [];
      if (Array.isArray(bookingIds)) {
        bookingIdList = bookingIds
          .map((id) => parseInt(id, 10))
          .filter((id) => Number.isInteger(id) && id > 0);
      }

      const result = await AgencyModel.bulkPay({
        agencyId: parseInt(agencyId, 10),
        bookingIds: bookingIdList,
        amount: parsedAmount,
        paymentMethod: paymentMethod.trim(),
        remarks: remarks || '',
        encodedBy
      });

      res.json({
        success: true,
        appliedTotal: result.appliedTotal,
        unallocatedAmount: result.unallocatedAmount,
        bookings: result.bookings,
        reference: result.reference
      });
    } catch (error) {
      console.error('Error processing agency bulk payment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error processing agency bulk payment.'
      });
    }
  }

  // Download bulk payment receipt (PDF)
  static async downloadBulkPaymentReceipt(req, res) {
    try {
      const agencyId = req.params.id;
      const bookingIdsParam = req.query.bookingIds || '';
      const reference = req.query.reference || '';
      const method = req.query.method || '';
      const remarks = req.query.remarks || '';
      const totalPaid = req.query.total || 0;
      const processedBy = req.user?.FULLNAME || 'N/A';

      const bookingIds = bookingIdsParam
        .split(',')
        .map(id => parseInt(id, 10))
        .filter(n => Number.isInteger(n) && n > 0);

      if (!bookingIds.length) {
        return res.status(400).json({ success: false, message: 'No bookingIds provided' });
      }

      const rows = await AgencyModel.getBulkPaymentReceiptData(agencyId, bookingIds);
      const agencyName = rows?.[0]?.AGENCY_NAME || 'Agency';

      // Attempt to load logo from public assets (optional)
      let logoUrl = '';
      try {
        const logoPath = path.join(__dirname, '../public/img/Logo-Black.JPG');
        const logoBuf = await fs.readFile(logoPath);
        logoUrl = `data:image/jpeg;base64,${logoBuf.toString('base64')}`;
      } catch (_) {
        logoUrl = '';
      }

      const templatePath = path.join(__dirname, '../views/agency/pdf/bulk_payment_receipt.ejs');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      const templateData = {
        agencyName,
        reference,
        method,
        remarks,
        totalPaid,
        bookings: rows,
        generatedAt: new Date().toISOString(),
        processedBy,
        logoUrl
      };

      const html = ejs.render(templateContent, templateData);

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });
      await browser.close();

      const filename = `bulk-payment-receipt-${reference || 'ref'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      // Inline to allow viewing in new tab; frontend separately triggers a download.
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating bulk payment receipt:', error);
      res.status(500).json({ success: false, message: 'Error generating receipt' });
    }
  }

  // Generate agency-wide voucher PDF (all bookings within date range)
  static async generateAgencyVoucherPDF(req, res) {
    try {
      const { id } = req.params;
      const { filterType = 'reservation', from, to, download } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Agency ID is required' });
      }
      if (!from || !to) {
        return res.status(400).json({ success: false, message: 'Date range (from/to) is required' });
      }

      const { chromium } = require('playwright');
      const path = require('path');
      const ejs = require('ejs');
      const fs = require('fs').promises;

      const user = req.user ? { FULLNAME: req.user.FULLNAME } : { FULLNAME: 'System User' };

      // Get voucher data for this agency and date range
      const voucherData = await AgencyModel.getAgencyVoucherData(id, filterType, from, to);

      const templatePath = path.join(__dirname, '../views/agency/pdf/agency_voucher.ejs');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Load logo as base64 for Playwright
      const logoPath = path.join(__dirname, '../public/img/Logo-Black.JPG');
      let imageUrl = '';
      try {
        if (require('fs').existsSync(logoPath)) {
          const imageBase64 = require('fs').readFileSync(logoPath, 'base64');
          imageUrl = `data:image/jpeg;base64,${imageBase64}`;
        } else {
          console.error('❌ [AGENCY VOUCHER PDF] Logo file not found:', logoPath);
        }
      } catch (error) {
        console.error('❌ [AGENCY VOUCHER PDF] Error loading logo:', error);
      }

      // Generate unique voucher number (current date + time only)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      // Format: AGY-{YYYYMMDD}-{HHmmss}
      // Example: AGY-20251216-140613
      const voucherNo = `AGY-${year}${month}${day}-${hours}${minutes}${seconds}`;

      const templateData = {
        voucherNo,
        imageUrl,
        agencyName: voucherData.agencyName || 'Agency',
        filterType,
        fromDate: from,
        toDate: to,
        generatedBy: user.FULLNAME,
        bookings: voucherData.bookings || [],
        totals: voucherData.totals || { totalAmount: 0, totalPaid: 0, totalBalance: 0 }
      };

      const html = ejs.render(templateContent, templateData);

      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' }
      });

      await browser.close();

      // Build readable filename:
      // - voucher-AgencyName_YYYY-MM-DD          (if from == to)
      // - voucher-AgencyName_YYYY-MM-DD_to_YYYY-MM-DD (if range)
      const safeAgencyName = (voucherData.agencyName || 'Agency')
        .toString()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_\-]/g, '');
      const fromPart = from;
      const toPart = to;
      const datePart = (fromPart === toPart)
        ? fromPart
        : `${fromPart}_to_${toPart}`;
      const filename = `voucher-${safeAgencyName}_${datePart}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating agency voucher PDF:', error);
      res.status(500).json({ success: false, message: 'Error generating agency voucher PDF' });
    }
  }
}

module.exports = AgencyController;

