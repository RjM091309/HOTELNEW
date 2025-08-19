/**
 *  Document   : app.js
 *  Author     : redstar
 *  Description: Core script to handle the entire theme and core functions
 *
 **/
var App = (function () {
  // IE mode
  var isIE8 = false;
  var isIE9 = false;
  var isIE10 = false;

  var resizeHandlers = [];

  var assetsPath = "";

  var globalImgPath = "img/";

  var globalPluginsPath = "global/plugins/";

  var globalCssPath = "css/";

  /*************** Change theme color *************/
  var handleColorSetting = function () {
    jQuery(".control-sidebar-btn").click(function () {
      jQuery(".quick-setting").toggle("slide");
    });
  };

  // runs callback functions set by App.addResponsiveHandler().
  var _runResizeHandlers = function () {
    // reinitialize other subscribed elements
    for (var i = 0; i < resizeHandlers.length; i++) {
      var each = resizeHandlers[i];
      each.call();
    }
  };

  /********** handle the layout reinitialization on window resize ***********/
  var handleOnResize = function () {
    var resize;

    $(window).resize(function () {
      if (resize) {
        clearTimeout(resize);
      }
      resize = setTimeout(function () {
        _runResizeHandlers();
      }, 50); // wait 50ms until window resize finishes.
    });
  };

  /*************** Handles Bootstrap switches in setting panel  ********/
  var handleBootstrapSwitch = function () {
    if (!$().bootstrapSwitch) {
      return;
    }
    $(".make-switch").bootstrapSwitch();
  };

  /************* Handles Bootstrap Dropdowns  ********************/
  var handleDropdowns = function () {
    /*
          Hold dropdown on click  
        */
    $("body").on("click", ".dropdown-menu.hold-on-click", function (e) {
      e.stopPropagation();
    });
  };

  /************** Handles counterup plugin wrapper ****************/
  var handleCounterup = function () {
    if (!$().counterUp) {
      return;
    }

    $("[data-counter='counterup']").counterUp({
      delay: 10,
      time: 1000,
    });
  };

  // Handle Select2 Dropdowns
  var handleSelect2 = function () {
    if ($().select2) {
      $.fn.select2.defaults.set("theme", "bootstrap");
      $(".select2me").select2({
        placeholder: "Select",
        width: "auto",
        allowClear: true,
      });
    }
  };

  // handle group element heights
  var handleHeight = function () {
    $("[data-auto-height]").each(function () {
      var parent = $(this);
      var items = $("[data-height]", parent);
      var height = 0;
      var mode = parent.attr("data-mode");
      var data_offset = parent.attr("data-offset")
        ? parent.attr("data-offset")
        : 0;
      var offset = parseInt(data_offset, 10);

      items.each(function () {
        if ($(this).attr("data-height") == "height") {
          $(this).css("height", "");
        } else {
          $(this).css("min-height", "");
        }

        var height_ =
          mode == "base-height"
            ? $(this).outerHeight()
            : $(this).outerHeight(true);
        if (height_ > height) {
          height = height_;
        }
      });

      height = height + offset;

      items.each(function () {
        if ($(this).attr("data-height") == "height") {
          $(this).css("height", height);
        } else {
          $(this).css("min-height", height);
        }
      });

      if (parent.attr("data-related")) {
        $(parent.attr("data-related")).css("height", parent.height());
      }
    });
  };

  // Handles quick sidebar toggler
  var handleQuickSidebarToggler = function () {
    // close sidebar using button click - more specific selectors
    $(document).on("click", ".dropdown-quick-sidebar-toggler a", function (e) {
      e.preventDefault();
      e.stopPropagation();
      $("body").toggleClass("chat-sidebar-open");
    });
    
    // close sidebar when click outside box
    $(document).on("click", ".page-content", function (e) {
      if ($("body").hasClass("chat-sidebar-open")) {
        $("body").toggleClass("chat-sidebar-open");
      }
    });
    // close sidebar using esc key
    $(document).on("keydown", function (e) {
      if (e.keyCode === 27 && $("body").hasClass("chat-sidebar-open")) {
        // ESC
        $("body").toggleClass("chat-sidebar-open");
      }
    });
  };

  /********Sidebar slim-menu*********/
  var handleslimscroll_menu = function () {
    $(".slimscroll-style").slimscroll({
      height: $(window).height() - 90,
      position: "right",
      size: "5px",
      color: "#9ea5ab",
      wheelStep: 5,
    });
    $(".small-slimscroll-style").slimscroll({
      height: "260px",
      position: "right",
      size: "5px",
      color: "#9ea5ab",
      wheelStep: 5,
    });
  };

  handleChatScrollbar = function () {
    var t = $(".chat-sidebar-chat"),
      i = function () {
        var i,
          a = t.find(".chat-sidebar-item"),
          e = $(".chat-sidebar-chat-users").attr("data-height");
        (i =
          $(".chat-sidebar-chat-users").attr("data-height") -
          80 -
          t.find(".nav-justified > .nav-tabs").outerHeight()),
          a.attr("data-height", i),
          a.css("height", e + "px"),
          a.css("overflow-y", "auto");
      };
    i(), App.addResizeHandler(i);
    
    // Initialize slimscroll for chat sidebar content
    $(".chat-sidebar-chat-users.slimscroll-style").slimscroll({
      height: $(window).height() - 200,
      position: "right",
      size: "5px",
      color: "#9ea5ab",
      wheelStep: 5,
    });
  };

  // Handles quick sidebar settings
  var handleQuickSidebarSettings = function () {
    var wrapper = $(".chat-sidebar-container");
    

    var initSettingsSlimScroll = function () {
      var settingsList = wrapper.find(".chat-sidebar-settings-list");
      var chatUsers = wrapper.find(".chat-sidebar-chat-users");
      var wrapperHeight = wrapper.height() || $(window).height() - 100;
      
      

      // Calculate height for settings
      var settingsListHeight = wrapperHeight - 120;
      

      // Set heights for scrollable content
      if (settingsList.length > 0) {
        settingsList.css("height", settingsListHeight + "px");
        settingsList.css("overflow-y", "auto");
      }
      
      if (chatUsers.length > 0) {
        chatUsers.css("height", settingsListHeight + "px");
        chatUsers.css("overflow-y", "auto");
      }
    };

    // Initialize after a short delay to ensure DOM is ready
    setTimeout(function() {
      initSettingsSlimScroll();
      
      // Initialize slimscroll for settings content
      $(".chat-sidebar-settings-list.slimscroll-style").slimscroll({
        height: $(window).height() - 200,
        position: "right",
        size: "5px",
        color: "#9ea5ab",
        wheelStep: 5,
      });
      
      // Also initialize slimscroll for chat users
      $(".chat-sidebar-chat-users.slimscroll-style").slimscroll({
        height: $(window).height() - 200,
        position: "right",
        size: "5px",
        color: "#9ea5ab",
        wheelStep: 5,
      });
    }, 100);
    
    App.addResizeHandler(initSettingsSlimScroll); // reinitialize on window resize
  };

  //* END:CORE HANDLERS *//

  return {
    //main function to initiate the theme
    init: function () {
      //Core handlers
      //   handleTheme();
      handleOnResize(); // set and handle responsive
      handleColorSetting();

      //UI Component handlers
      handleBootstrapSwitch(); // handle bootstrap switch plugin
      handleSelect2(); // handle custom Select2 dropdowns
      handleDropdowns(); // handle dropdowns
      //   handleTabs(); // handle tabs
      handleCounterup(); // handle counterup instances

      handleQuickSidebarToggler(); // handles quick sidebar's toggler
      handleQuickSidebarSettings(); // handles quick sidebar's setting
      handleChatScrollbar();

      handleslimscroll_menu();

      //Handle group element heights
      this.addResizeHandler(handleHeight); // handle auto calculating height on window resize
    },

    //public function to add callback a function which will be called on window resize
    addResizeHandler: function (func) {
      resizeHandlers.push(func);
    },

    //public functon to call _runresizeHandlers
    runResizeHandlers: function () {
      _runResizeHandlers();
    },

    // wrApper function to scroll(focus) to an element
    scrollTo: function (el, offeset) {
      var pos = el && el.length > 0 ? el.offset().top : 0;

      if (el) {
        if ($("body").hasClass("page-header-fixed")) {
          pos = pos - $(".page-header").height();
        } else if ($("body").hasClass("page-header-top-fixed")) {
          pos = pos - $(".page-header-top").height();
        } else if ($("body").hasClass("page-header-menu-fixed")) {
          pos = pos - $(".page-header-menu").height();
        }
        pos = pos + (offeset ? offeset : -1 * el.height());
      }

      $("html,body").animate(
        {
          scrollTop: pos,
        },
        "slow"
      );
    },
    // function to scroll to the top
    scrollTop: function () {
      App.scrollTo();
    },

    startPageLoading: function (options) {
      if (options && options.animate) {
        $(".page-spinner-bar").remove();
        $("body").append(
          '<div class="page-spinner-bar"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>'
        );
      } else {
        $(".page-loading").remove();
        $("body").append(
          '<div class="page-loading"><img src="' +
            this.getGlobalImgPath() +
            'loading-spinner-grey.gif"/>&nbsp;&nbsp;<span>' +
            (options && options.message ? options.message : "Loading...") +
            "</span></div>"
        );
      }
    },

    stopPageLoading: function () {
      $(".page-loading, .page-spinner-bar").remove();
    },

    //public helper function to get actual input value(used in IE9 and IE8 due to placeholder attribute not supported)
    getActualVal: function (el) {
      el = $(el);
      if (el.val() === el.attr("placeholder")) {
        return "";
      }
      return el.val();
    },

    //public function to get a paremeter by name from URL
    getURLParameter: function (paramName) {
      var searchString = window.location.search.substring(1),
        i,
        val,
        params = searchString.split("&");

      for (i = 0; i < params.length; i++) {
        val = params[i].split("=");
        if (val[0] == paramName) {
          return unescape(val[1]);
        }
      }
      return null;
    },

    getViewPort: function () {
      var e = window,
        a = "inner";
      if (!("innerWidth" in window)) {
        a = "client";
        e = document.documentElement || document.body;
      }

      return {
        width: e[a + "Width"],
        height: e[a + "Height"],
      };
    },

    getUniqueID: function (prefix) {
      return "prefix_" + Math.floor(Math.random() * new Date().getTime());
    },

    // check IE8 mode
    isIE8: function () {
      return isIE8;
    },

    // check IE9 mode
    isIE9: function () {
      return isIE9;
    },

    getAssetsPath: function () {
      return assetsPath;
    },

    setAssetsPath: function (path) {
      assetsPath = path;
    },

    setGlobalImgPath: function (path) {
      globalImgPath = path;
    },

    getGlobalImgPath: function () {
      return assetsPath + globalImgPath;
    },

    getGlobalCssPath: function () {
      return assetsPath + globalCssPath;
    },

    getResponsiveBreakpoint: function (size) {
      // bootstrap responsive breakpoints
      var sizes = {
        xs: 480, // extra small
        sm: 768, // small
        md: 992, // medium
        lg: 1200, // large
      };

      return sizes[size] ? sizes[size] : 0;
    },

    // SlimScroll functions
    initSlimScroll: function (el) {
      if ($().slimScroll && el.length) {
        el.slimScroll({
          height: $(window).height() - 90,
          position: "right",
          size: "5px",
          color: "#9ea5ab",
          wheelStep: 5,
        });
      } else {
      }
    },

    destroySlimScroll: function (el) {
      
      if (el.length && el.data().slimScroll) {
        el.slimScroll({ destroy: true });
        
      } else {
        
      }
    },
  };
})();

jQuery(document).ready(function () {
  // Check if slimScroll plugin is loaded
  if ($().slimScroll) {
    
  } else {
    
  }
  
  App.init(); // init core componets
  $(".chat-sidebar-chat-user-messages").animate(
    {
      scrollTop: $(document).height(),
    },
    1000
  );
});
