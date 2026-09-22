/**
 *  Document   : theme-color.js
 *  Author     : redstar
 *  Description: Core script to handle the entire theme and core functions
 *
 **/
jQuery(document).ready(function () {
    // Apply saved preferences on load (existing class system + new data-theme)
    function applySavedThemePreferences() {
        var savedSidebar = localStorage.getItem('sidebar_color');
        var savedLogo = localStorage.getItem('logo_color');
        var savedHeader = localStorage.getItem('header_color');
        var savedDataTheme = localStorage.getItem('ui_data_theme');

        if (savedDataTheme === 'white') {
            if (!savedHeader || savedHeader === 'header-dark') {
                savedHeader = 'header-white';
                localStorage.setItem('header_color', 'header-white');
            }
            if (!savedLogo || savedLogo === 'logo-dark') {
                savedLogo = 'logo-white';
                localStorage.setItem('logo_color', 'logo-white');
            }
            if (!savedSidebar || savedSidebar === 'dark-sidebar-color') {
                savedSidebar = 'white-sidebar-color';
                localStorage.setItem('sidebar_color', 'white-sidebar-color');
            }
        }

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

    // The settings panel is now just this one Light/Dark control (the old
    // Sidebar Color / Header Brand Color / Header Color swatch rows were
    // removed from chat-sidebar.ejs), so this single handler now drives
    // sidebar, logo AND header together - previously header was only ever
    // set by its own now-removed swatch row, which would have left it stuck
    // on the server's dark default forever in Light mode with no swatches
    // left to fix it.
    jQuery(document).on("click", ".theme-light-dark button", function () {
        var theme = jQuery(this).attr('data-theme');
        var sidebar_color = theme + "-sidebar-color";
        var logo_color = "logo-" + theme;
        var header_color = "header-" + theme;

        // Many elements sitewide (buttons, cards, room tiles - a Dashboard
        // page can easily have 100+ of them) carry their own "transition:
        // all 0.3s"-style rules for hover/focus effects. Flipping data-theme
        // and these body classes changes background/color/border on all of
        // them at once, so instead of an instant switch every single one
        // visibly animates in parallel for ~0.3-0.6s - that's the "lag".
        // Force transitions off sitewide for one frame while the theme
        // actually changes, then restore them, so the switch reads as
        // instant instead of a wave of simultaneous mini-animations.
        var noTransitionStyle = document.createElement('style');
        noTransitionStyle.id = 'theme-switch-no-transition';
        noTransitionStyle.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
        document.head.appendChild(noTransitionStyle);

        jQuery("body").removeClass("white-sidebar-color dark-sidebar-color blue-sidebar-color indigo-sidebar-color green-sidebar-color red-sidebar-color cyan-sidebar-color logo-white logo-dark logo-blue logo-indigo logo-red logo-cyan logo-green header-white header-dark header-blue header-indigo header-red header-cyan header-green");
        jQuery("body").addClass(sidebar_color);
        jQuery("body").addClass(logo_color);
        jQuery("body").addClass(header_color);
        localStorage.setItem('sidebar_color', sidebar_color);
        localStorage.setItem('logo_color', logo_color);
        localStorage.setItem('header_color', header_color);
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ui_data_theme', theme);

        // Force the browser to apply the theme-less-transitions styles in
        // one paint, then remove the override on the next frame so normal
        // hover/focus transitions keep working afterward.
        void document.body.offsetHeight;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var el = document.getElementById('theme-switch-no-transition');
                if (el) el.remove();
            });
        });
    });
});