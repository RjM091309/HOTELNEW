// ========================================
// SERVICES CONTROLLER
// ========================================

const ServicesModel = require('../models/servicesModel');

class ServicesController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Main services management page
  static async getServicesManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('services/services-management', {
        title: 'Services Management',
        subTitle: 'Services Management',
        page: 'services-management',
        activePage: 'services',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });

    } catch (error) {
      console.error('Error loading services management:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ROUTES - SERVICES CRUD
  // ========================================
  
  // Get all services
  static async getAllServices(req, res) {
    try {
      const services = await ServicesModel.getAllServices();
      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching services',
        error: error.message
      });
    }
  }

  // Get service by ID
  static async getServiceById(req, res) {
    try {
      const { id } = req.params;
      const service = await ServicesModel.getServiceById(id);
      
      if (service) {
        res.json({
          success: true,
          data: service
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
    } catch (error) {
      console.error('Error fetching service:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching service',
        error: error.message
      });
    }
  }

  // Create new service
  static async createService(req, res) {
    try {
      const { serviceCategory, serviceName, serviceDescription, serviceCost, serviceAvailability } = req.body;
      
      if (!serviceCategory || !serviceName || !serviceDescription || !serviceCost || !serviceAvailability) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      const serviceData = {
        SERVICE_CATEGORY: serviceCategory,
        SERVICE_NAME: serviceName,
        SERVICE_DESCRIPTION: serviceDescription,
        SERVICE_COST: serviceCost,
        SERVICE_AVAILABILITY: serviceAvailability,
        ACTIVE: 1,
        ENCODED_BY: req.user ? req.user.userId : req.session.userId,
        ENCODED_DT: new Date()
      };

      const result = await ServicesModel.createService(serviceData);
      
      if (result) {
        res.json({
          success: true,
          message: 'Service created successfully',
          data: { id: result.id }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to create service'
        });
      }
    } catch (error) {
      console.error('Error creating service:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating service',
        error: error.message
      });
    }
  }

  // Update service
  static async updateService(req, res) {
    try {
      const { serviceId, serviceCategory, serviceName, serviceDescription, serviceCost, serviceAvailability } = req.body;
      
      if (!serviceId || !serviceCategory || !serviceName || !serviceDescription || !serviceCost || !serviceAvailability) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      const serviceData = {
        IDNo: serviceId,
        SERVICE_CATEGORY: serviceCategory,
        SERVICE_NAME: serviceName,
        SERVICE_DESCRIPTION: serviceDescription,
        SERVICE_COST: serviceCost,
        SERVICE_AVAILABILITY: serviceAvailability,
        EDITED_BY: req.user ? req.user.userId : req.session.userId,
        EDITED_DT: new Date()
      };

      const result = await ServicesModel.updateService(serviceData);
      
      if (result) {
        res.json({
          success: true,
          message: 'Service updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
    } catch (error) {
      console.error('Error updating service:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating service',
        error: error.message
      });
    }
  }

  // Delete service
  static async deleteService(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await ServicesModel.deleteService(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Service deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
    } catch (error) {
      console.error('Error deleting service:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting service',
        error: error.message
      });
    }
  }

}

module.exports = ServicesController; 