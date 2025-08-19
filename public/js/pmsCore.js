// pmsCore.js
const PMSCore = (function($, config = {}){
    // --- Configuration with defaults ---
    const defaultConfig = {
        cacheSize: 50,
        debounceDelay: 200,
        debugMode: false
    };
    
    // Merge user config with defaults
    const settings = { ...defaultConfig, ...config };
    
    // --- Private vars ---
    const dataTableCache = {
      employees: new Map(),
      stats:     new Map(),
      departments: null,
      positions:   null,
      maxSize:   settings.cacheSize
    };
    let reloadTimeout;
    let isSubmitting = false; // Prevent double submissions
  
    // --- Private fns ---
    function addToCache(cache, key, value) {
      if (cache.size >= dataTableCache.maxSize) {
        cache.delete(cache.keys().next().value);
      }
      cache.set(key, value);
    }
  
    function getCachedData(type) {
      return dataTableCache.employees.get(type) || null;
    }
  
    function setCachedData(type, data) {
      addToCache(dataTableCache.employees, type, data);
    }
  
    function clearCache() {
      dataTableCache.employees.clear();
      dataTableCache.stats.clear();
      dataTableCache.departments = null;
      dataTableCache.positions   = null;
    }
  

  
    function debouncedReload(fn, delay = settings.debounceDelay) {
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(fn, delay);
    }
  
    // Form submission helpers
    function setSubmitting(submitting) {
      isSubmitting = submitting;
    }
  
    function getSubmitting() {
      return isSubmitting;
    }
  
    // Debug and error handling utilities
    function debugLog(message, data = null) {
      if (settings.debugMode && typeof console !== 'undefined' && console.log) {
        console.log(`[PMS Debug] ${message}`, data || '');
      }
    }
  
    function handleError(error, context = '') {
      debugLog(`Error in ${context}:`, error);
      if (error && error.message) {
        showDanger(`Error: ${error.message}`);
      } else {
        showDanger('An unexpected error occurred');
      }
    }
  
    function validateResponse(response) {
      if (!response) {
        throw new Error('No response received');
      }
      if (!response.success) {
        throw new Error(response.message || 'Operation failed');
      }
      return response;
    }

    // Toast notification system
    function showToast(type, heading, message, options = {}) {
      const defaultOptions = {
        position: 'top-right',
        hideAfter: 5000,
        stack: 6
      };
      
      const toastOptions = { ...defaultOptions, ...options };
      
      // Set background color based on type
      let loaderBg = '#ff6849'; // Default
      let icon = 'info';
      
      switch (type) {
        case 'success':
          loaderBg = '#0c2a42';
          icon = 'success';
          break;
        case 'error':
          loaderBg = '#dc3545';
          icon = 'error';
          break;
        case 'warning':
          loaderBg = '#ffc107';
          icon = 'warning';
          break;
        case 'info':
          loaderBg = '#17a2b8';
          icon = 'info';
          break;
      }
      
      $.toast({
        heading: heading,
        text: message,
        position: toastOptions.position,
        loaderBg: loaderBg,
        icon: icon,
        hideAfter: toastOptions.hideAfter,
        stack: toastOptions.stack
      });
    }
    
    function showSuccess(heading, message, options = {}) {
      showToast('success', heading, message, options);
    }
    
    function showError(heading, message, options = {}) {
      showToast('error', heading, message, options);
    }
    
    function showWarning(heading, message, options = {}) {
      showToast('warning', heading, message, options);
    }
    
    function showInfo(heading, message, options = {}) {
      showToast('info', heading, message, options);
    }
    function showDanger(heading, message, options = {}) {
      showToast('error', heading, message, options);
    }
    // --- Public API ---
    return {
      // Configuration
      getConfig: () => ({ ...settings }),
      updateConfig: (newConfig) => {
        Object.assign(settings, newConfig);
        dataTableCache.maxSize = settings.cacheSize;
        debugLog('Configuration updated:', settings);
      },
      
      // Cache
      getCache:    getCachedData,
      setCache:    setCachedData,
      clearCache:  clearCache,
      getCacheSize: () => dataTableCache.maxSize,
      getCacheStats: () => ({
        employees: dataTableCache.employees.size,
        stats: dataTableCache.stats.size,
        maxSize: dataTableCache.maxSize
      }),
  

  
      // Debounce helper
      debounce:    debouncedReload,
  
      // Form submission
      setSubmitting: setSubmitting,
      getSubmitting: getSubmitting,
  
      // Debug and error handling
      debugLog: debugLog,
      handleError: handleError,
      validateResponse: validateResponse,

      // Toast notifications
      showToast: showToast,
      showSuccess: showSuccess,
      showError: showError,
      showWarning: showWarning,
      showInfo: showInfo,
      showDanger: showDanger,

      // Permission cache management
      clearPermissionCache: function(callback = null) {
        $.ajax({
          url: '/api/auth/clear-permission-cache',
          method: 'POST',
          success: function() {
            debugLog('Permission cache cleared successfully');
            if (callback && typeof callback === 'function') {
              callback(true);
            }
          },
          error: function(xhr) {
            debugLog('Failed to clear permission cache');
            if (callback && typeof callback === 'function') {
              callback(false);
            }
          }
        });
      },
  
    
    };
  })(jQuery); 