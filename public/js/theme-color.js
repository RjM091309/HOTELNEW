/**
 *  Document   : theme-color.js
 *  Author     : redstar
 *  Description: Core script to handle the entire theme and core functions
 *
 **/
jQuery(document).ready(function() {
	// Apply saved preferences on load (existing class system + new data-theme)
	function applySavedThemePreferences() {
		var savedSidebar = localStorage.getItem('sidebar_color');
		var savedLogo = localStorage.getItem('logo_color');
		var savedHeader = localStorage.getItem('header_color');
		var savedDataTheme = localStorage.getItem('ui_data_theme');

		if (savedSidebar) {
			jQuery("body").removeClass("white-sidebar-color dark-sidebar-color blue-sidebar-color indigo-sidebar-color green-sidebar-color red-sidebar-color cyan-sidebar-color");
			jQuery("body").addClass(savedSidebar);
		}
		if (savedLogo) {
			jQuery("body").removeClass("logo-white logo-dark logo-blue logo-indigo logo-red logo-cyan logo-green");
			jQuery("body").addClass(savedLogo);
		}
		if (savedHeader) {
			jQuery("body").removeClass("header-white header-dark header-blue header-indigo header-red header-cyan header-green");
			jQuery("body").addClass(savedHeader);
		}
		if (savedDataTheme) {
			document.documentElement.setAttribute('data-theme', savedDataTheme);
		}
	}

	applySavedThemePreferences();

	jQuery(document).on("click", ".theme-light-dark button", function() {
        var logo_color = "logo-" + jQuery(this).attr('data-theme');
        var sidebar_color = jQuery(this).attr('data-theme') + "-sidebar-color";
        jQuery("body").removeClass("white-sidebar-color dark-sidebar-color blue-sidebar-color indigo-sidebar-color green-sidebar-color red-sidebar-color cyan-sidebar-color logo-white logo-dark logo-blue logo-indigo logo-red logo-cyan logo-green");
        jQuery("body").addClass(sidebar_color);
        jQuery("body").addClass(logo_color);
        localStorage.setItem('sidebar_color', sidebar_color);
        localStorage.setItem('logo_color', logo_color);
        var selected = jQuery(this).attr('data-theme');
        document.documentElement.setAttribute('data-theme', selected);
        localStorage.setItem('ui_data_theme', selected);
    });
    jQuery(document).on("click", ".sidebar-theme a", function() {
        var sidebar_color = jQuery(this).attr('data-theme') + "-sidebar-color";
        jQuery("body").removeClass("white-sidebar-color dark-sidebar-color blue-sidebar-color indigo-sidebar-color green-sidebar-color red-sidebar-color cyan-sidebar-color");
        jQuery("body").addClass(sidebar_color);
        localStorage.setItem('sidebar_color', sidebar_color);
        var selected = jQuery(this).attr('data-theme');
        document.documentElement.setAttribute('data-theme', selected);
        localStorage.setItem('ui_data_theme', selected);
    });
    jQuery(document).on("click", ".logo-theme a", function() {
        var logo_color = jQuery(this).attr('data-theme');
        jQuery("body").removeClass("logo-white logo-dark logo-blue logo-indigo logo-red logo-cyan logo-green");
        jQuery("body").addClass(logo_color);
        localStorage.setItem('logo_color', logo_color);
    });
    jQuery(document).on("click", ".header-theme a", function() {
        var header_color = jQuery(this).attr('data-theme');
        jQuery("body").removeClass("header-white header-dark header-blue header-indigo header-red header-cyan header-green");
        jQuery("body").addClass(header_color);
        localStorage.setItem('header_color', header_color);
        // Do not change data-theme here; keep global theme driven by sidebar selection only
    });
});