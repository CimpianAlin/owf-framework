Ext.define('Ozone.components.marketplace.MarketplaceLauncher', {
    extend: 'Ext.Component',
    alias: ['widget.marketplacelauncher'],

    dashboardContainer: null,
    dashboard: null,
    marketplaceWidget: null,
    keyboard: null,
    multipleMarketplaces: null,
    mpDashboardName: "Apps Mall",

    gotoMarketplace: function(marketplaceWidget, keyboard) {
        var me = this;
        var dashboardStore = me.dashboardContainer.dashboardStore;
        var dashboardInd = dashboardStore.findExact('name', this.mpDashboardName);
        me.dashboard = (dashboardInd >=0 ) && dashboardStore.getAt(dashboardInd);
        if (marketplaceWidget) {
            // If we know which marketplace to go to, just go there
            me.multipleMarketplaces = false;
            me.launch(marketplaceWidget, keyboard);
        } else {
            me.multipleMarketplaces = true;
            if (!me.mpModalWindow || me.mpModalWindow.isDestroyed) {
                me.mpModalWindow = Ext.widget('marketplacewindow', {
                    dashboardContainer: me.dashboardContainer,
                    callback: function(marketplaceWidget, keyboard) { 
                        me.launch(marketplaceWidget, keyboard); 
                    }
                });
            }
            me.mpModalWindow.show();
        }
    },

    launch: function(marketplaceWidget, keyboard) {
        var me = this;
        me.marketplaceWidget = marketplaceWidget;
        me.keyboard = keyboard;
        if (me.dashboard) {
            if (me.multipleMarketplaces && me.dashboard.data.layoutConfig.paneType != 'tabbedpane') {
                // If there are multiple marketplaces, but the dashboard is not tabbed, then make it tabbed.
                me.dashboard.data.layoutConfig.paneType = 'tabbedpane';
                // Make sure it's unlocked, since we're having to save it anyways.
                me.dashboard.data.locked = false;
                me.dashboardContainer.saveDashboard(me.dashboard.data, 'update', function() {me.reloadDashboardsAndLaunchMarketplace();});
            } else {
                if (me.dashboard.data.locked !== false) {
                    // If the dashboard is locked, unlock it
                    me.dashboard.data.locked = false;
                    me.dashboardContainer.saveDashboard(me.dashboard.data, 'update', function() {me.reloadDashboardsAndLaunchMarketplace();});
                } else {
                    // Go to the Marketplace dashboard and launch the Marketplace widget (this is a no-op if the widget is already running)
                    me.switchToDashboardAndLaunchWidget();
                }
            }
        } else {
            // If the Marketplace dashboard doesn't exist, create it and launch the Marketplace widget
            me.createMarketplaceDashboardAndLaunch();
        }
    },

    switchToDashboardAndLaunchWidget: function() {
         var me = this;
         if (me.dashboard.data.guid == me.dashboardContainer.activeDashboard.guid) {
             // If we're already on the right dashboard, just launch the Marketplace widget
             me.launchMarketplaceOnActiveDashboard();
         } else {
             me.launchMarketplaceAfterDashboardChanges();
             me.dashboardContainer.activateDashboard(me.dashboard.data.guid);
         }
     },

    launchMarketplaceAfterDashboardChanges: function() {
        this.dashboardContainer.addListener(OWF.Events.Dashboard.CHANGED,
            this.launchMarketplaceOnActiveDashboard, this, {single: true});
    },

    launchMarketplaceOnActiveDashboard: function() {
        var me = this;

        function getWidget() {
            return me.dashboardContainer.activeDashboard.findWidgetInstance(
                me.marketplaceWidget.data.widgetGuid);
        }

        /**
         * wait until the widget is done launching and fire the opened event
         * @param widget The Ext model of the marketplace widget
         */
        function fireOpenedEvent(widget) {
            Ozone.eventing.rpc.onReady(widget.data.uniqueId, function() {
                me.fireEvent(OWF.Events.Marketplace.OPENED, widget, 
                    me.marketplaceWidget.get('url'));
            });
        }

        var widget = getWidget();
        if (widget) {
            me.dashboardContainer.activeDashboard.activateWidget(widget.data.uniqueId);
            fireOpenedEvent(widget);
        } else {
            me.dashboardContainer.launchWidgets(me.marketplaceWidget, me.keyboard)
                .done(function() {
                    fireOpenedEvent(getWidget());
                });
        }
    },

    createMarketplaceDashboardAndLaunch: function() {
        var me = this;
        me.dashboard = Ext.create('Ozone.data.Dashboard', {
            name: this.mpDashboardName,
            type: 'marketplace',
            layoutConfig : {
                xtype: 'container',
                flex: 1,
                height: '100%',
                items: [],
                paneType: me.multipleMarketplaces ? 'tabbedpane' : 'fitpane',
                widgets: []
            }
        });
        me.dashboardContainer.saveDashboard(me.dashboard.data, 'create', function() {me.switchToDashboardAndLaunchWidget();});
    },

    reloadDashboardsAndLaunchMarketplace: function() {
        var me = this;
        me.dashboardContainer.dashboardStore.load({
             callback: function(records, options, success) {
                 if (success == true) {
                     me.launchMarketplaceAfterDashboardChanges();
                     me.dashboardContainer.updateDashboardsFromStore(records, options, success, me.dashboard.data.guid);
                 }
             }
        })
    }
});
