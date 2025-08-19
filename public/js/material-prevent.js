// Robust Material Design Lite handler that prevents errors while allowing textfields and tabs
(function() {
    'use strict';
    
    // Override the specific function that's causing the charAt error FIRST
    const originalCharAt = String.prototype.charAt;
    String.prototype.charAt = function(index) {
        if (this === null || this === undefined) {
            return '';
        }
        return originalCharAt.call(this, index);
    };
    
    // Also override other potentially problematic methods
    const originalSubstring = String.prototype.substring;
    String.prototype.substring = function(start, end) {
        if (this === null || this === undefined) {
            return '';
        }
        return originalSubstring.call(this, start, end);
    };
    
    // Create a more selective componentHandler that allows textfields and tabs
    window.componentHandler = {
        upgradeElement: function(element, componentName) {
            try {
                // Allow textfield and tabs components to work
                if (componentName === 'MaterialTextfield' || 
                    componentName === 'MaterialTabs' ||
                    (element && element.classList && (
                        element.classList.contains('mdl-textfield') ||
                        element.classList.contains('mdl-tabs')
                    ))) {
                    // Let the original material.min.js handle these components
                    if (window.originalComponentHandler && window.originalComponentHandler.upgradeElement) {
                        return window.originalComponentHandler.upgradeElement(element, componentName);
                    }
                }
            } catch (error) {
                console.warn('MDL upgradeElement error prevented:', error);
            }
            return null;
        },
        upgradeElements: function(elements) {
            try {
                if (elements) {
                    Array.from(elements).forEach(element => {
                        if (element.classList && (
                            element.classList.contains('mdl-textfield') ||
                            element.classList.contains('mdl-tabs')
                        )) {
                            this.upgradeElement(element, element.classList.contains('mdl-textfield') ? 'MaterialTextfield' : 'MaterialTabs');
                        }
                    });
                }
            } catch (error) {
                console.warn('MDL upgradeElements error prevented:', error);
            }
            return null;
        },
        upgradeDom: function() { return null; },
        upgradeAllRegistered: function() { return null; },
        registerUpgradedCallback: function() { return null; },
        register: function() { return null; },
        downgradeElements: function() { return null; }
    };
    
    // Disable problematic Material Design components but allow textfields and tabs
    window.MaterialButton = function() { return { init: function() {} }; };
    window.MaterialCheckbox = function() { return { init: function() {} }; };
    window.MaterialIconToggle = function() { return { init: function() {} }; };
    window.MaterialMenu = function() { return { init: function() {} }; };
    window.MaterialProgress = function() { return { init: function() {} }; };
    window.MaterialRadio = function() { return { init: function() {} }; };
    window.MaterialSlider = function() { return { init: function() {} }; };
    window.MaterialSnackbar = function() { return { init: function() {} }; };
    window.MaterialSpinner = function() { return { init: function() {} }; };
    window.MaterialSwitch = function() { return { init: function() {} }; };
    window.MaterialTooltip = function() { return { init: function() {} }; };
    window.MaterialLayout = function() { return { init: function() {} }; };
    window.MaterialDataTable = function() { return { init: function() {} }; };
    window.MaterialRipple = function() { return { init: function() {} }; };
    
    // Allow MaterialTextfield to work but with error handling
    window.MaterialTextfield = function(element) {
        return {
            init: function() {
                try {
                    // Basic textfield functionality without problematic code
                    if (element) {
                        const input = element.querySelector('.mdl-textfield__input');
                        const label = element.querySelector('.mdl-textfield__label');
                        
                        if (input && label) {
                            // Handle focus events
                            input.addEventListener('focus', function() {
                                element.classList.add('is-focused');
                            });
                            
                            input.addEventListener('blur', function() {
                                element.classList.remove('is-focused');
                                if (input.value) {
                                    element.classList.add('is-dirty');
                                } else {
                                    element.classList.remove('is-dirty');
                                }
                            });
                            
                            // Handle input events
                            input.addEventListener('input', function() {
                                if (input.value) {
                                    element.classList.add('is-dirty');
                                } else {
                                    element.classList.remove('is-dirty');
                                }
                            });
                            
                            // Initialize state
                            if (input.value) {
                                element.classList.add('is-dirty');
                            }
                        }
                    }
                } catch (error) {
                    console.warn('MaterialTextfield init error prevented:', error);
                }
            }
        };
    };
    
    // Allow MaterialTabs to work but with error handling
    window.MaterialTabs = function(element) {
        return {
            init: function() {
                try {
                    if (element) {
                        const tabs = element.querySelectorAll('.mdl-tabs__tab');
                        const panels = element.querySelectorAll('.mdl-tabs__panel');
                        
                        tabs.forEach(tab => {
                            tab.addEventListener('click', function(e) {
                                e.preventDefault();
                                
                                // Remove active class from all tabs and panels
                                tabs.forEach(t => t.classList.remove('is-active'));
                                panels.forEach(p => p.classList.remove('is-active'));
                                
                                // Add active class to clicked tab
                                this.classList.add('is-active');
                                
                                // Show corresponding panel
                                const target = this.getAttribute('data-target') || this.getAttribute('href');
                                if (target) {
                                    const panel = document.querySelector(target);
                                    if (panel) {
                                        panel.classList.add('is-active');
                                    }
                                }
                            });
                        });
                    }
                } catch (error) {
                    console.warn('MaterialTabs init error prevented:', error);
                }
            },
            show: function() {},
            hide: function() {},
            toggle: function() {}
        };
    };
    
    // Store original componentHandler before overriding
    window.addEventListener('load', function() {
        try {
            // Store the original componentHandler if it exists
            if (window.componentHandler && !window.originalComponentHandler) {
                window.originalComponentHandler = window.componentHandler;
            }
            
            // Initialize textfields and tabs after a delay to ensure material.min.js is loaded
            setTimeout(function() {
                const textfields = document.querySelectorAll('.mdl-textfield');
                const tabs = document.querySelectorAll('.mdl-tabs');
                
                // Initialize textfields
                textfields.forEach(function(textfield) {
                    try {
                        if (window.originalComponentHandler && window.originalComponentHandler.upgradeElement) {
                            window.originalComponentHandler.upgradeElement(textfield, 'MaterialTextfield');
                        } else {
                            // Fallback: initialize manually
                            const textfieldComponent = new window.MaterialTextfield(textfield);
                            textfieldComponent.init();
                        }
                    } catch (error) {
                        console.warn('Textfield initialization error prevented:', error);
                        // Fallback: initialize manually
                        const textfieldComponent = new window.MaterialTextfield(textfield);
                        textfieldComponent.init();
                    }
                });
                
                // Initialize tabs
                tabs.forEach(function(tab) {
                    try {
                        if (window.originalComponentHandler && window.originalComponentHandler.upgradeElement) {
                            window.originalComponentHandler.upgradeElement(tab, 'MaterialTabs');
                        } else {
                            // Fallback: initialize manually
                            const tabComponent = new window.MaterialTabs(tab);
                            tabComponent.init();
                        }
                    } catch (error) {
                        console.warn('Tab initialization error prevented:', error);
                        // Fallback: initialize manually
                        const tabComponent = new window.MaterialTabs(tab);
                        tabComponent.init();
                    }
                });
            }, 500);
        } catch (error) {
            console.warn('MDL initialization error prevented:', error);
        }
    });
})(); 