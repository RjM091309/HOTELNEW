// Fix for material.min.js error: Cannot read properties of null (reading 'charAt')
document.addEventListener('DOMContentLoaded', function() {
    // Completely override the problematic function in material.min.js
    if (window.componentHandler) {
        const originalUpgradeElement = window.componentHandler.upgradeElement;
        window.componentHandler.upgradeElement = function(element, componentName) {
            try {
                // Skip processing if element has data-no-material attribute
                if (element && element.getAttribute('data-no-material') === 'true') {
                    return null;
                }
                
                // Skip processing tabs that are divs
                if (element && element.classList && element.classList.contains('mdl-tabs__tab') && element.tagName === 'DIV') {
                    return null;
                }
                
                // Add null checks for href attributes
                const links = element.querySelectorAll('a[href]');
                links.forEach(link => {
                    if (link && link.getAttribute('href') === null) {
                        link.setAttribute('href', '#');
                    }
                });
                
                // Call original function
                return originalUpgradeElement.call(this, element, componentName);
            } catch (error) {
                console.warn('Material component upgrade error:', error);
                return null;
            }
        };
        
        // Also override upgradeElements to skip problematic elements
        const originalUpgradeElements = window.componentHandler.upgradeElements;
        window.componentHandler.upgradeElements = function(elements) {
            try {
                const filteredElements = Array.from(elements).filter(element => {
                    // Skip elements with data-no-material
                    if (element && element.getAttribute('data-no-material') === 'true') {
                        return false;
                    }
                    
                    // Skip div tabs
                    if (element && element.classList && element.classList.contains('mdl-tabs__tab') && element.tagName === 'DIV') {
                        return false;
                    }
                    
                    return true;
                });
                
                return originalUpgradeElements.call(this, filteredElements);
            } catch (error) {
                console.warn('Material component upgrade error:', error);
                return null;
            }
        };
    }
    
    // Fix any existing problematic links
    const allLinks = document.querySelectorAll('a');
    allLinks.forEach(link => {
        if (link && !link.getAttribute('href')) {
            link.setAttribute('href', '#');
        }
    });

    // Mark all div tabs to prevent material processing
    const tabBar = document.querySelector('#tabBar');
    if (tabBar) {
        const divTabs = tabBar.querySelectorAll('.mdl-tabs__tab');
        divTabs.forEach(tab => {
            if (tab.tagName === 'DIV') {
                tab.setAttribute('data-no-material', 'true');
            }
        });
    }
    
    // Prevent material from processing the entire tab bar
    if (tabBar) {
        tabBar.setAttribute('data-no-material', 'true');
    }
}); 