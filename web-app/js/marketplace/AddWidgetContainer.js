/**
 * @ignore
 */
var Ozone = Ozone ? Ozone : {};

/**
 * @ignore
 * @namespace
 */
Ozone.marketplace = Ozone.marketplace || {};

Ozone.marketplace.AddWidgetContainer = function (eventingContainer) {

    this.addWidgetChannelName = "_ADD_WIDGET_CHANNEL";
    this.windowManager = null;

    if (eventingContainer != null) {
        this.eventingContainer = eventingContainer;
        //register on add widget channel
        var scope = this;
        this.eventingContainer.registerHandler(this.addWidgetChannelName, function (sender, msg) {

            //msg will always be a json string
            var cfg = Ozone.util.parseJson(msg);

            // Must return a value for the callback function to be invoked on the client side.
            return scope.addWidget(cfg);
        });
    }
    else {
        throw {
            name:'AddWidgetContainerException',
            message:'eventingContainer is null'
        }
    }

};

Ozone.marketplace.AddWidgetContainer.prototype = {

    addWidget:function (config) {
        var widgetsJSON = config.widgetsJSON;
        this.processMarketplaceWidgetData(widgetsJSON.baseUrl, widgetsJSON.itemId, widgetsJSON.doLaunch);
        return widgetsJSON.itemId
    },

    processMarketplaceWidgetData: function(marketplaceUrl, widgetId, doLaunch) {
        var self = this;
        Ozone.util.Transport.send({
            url: marketplaceUrl + "/relationship/getOWFRequiredItems",
            method: "POST",
            content: {
                id: widgetId
            },
            onSuccess: function(jsonData) {
                var widgetListJson = [], data = jsonData.data;

                for (var i = 0, len = data.length; i < len; i++) {
                    var serviceItem = data[i];

                    var customFields = {};
                    Ext.Array.each(serviceItem.customFields, function(field, index, list) {
                        customFields[field.name] = field.value;
                    });
                    if (serviceItem.types.title === 'Dashboard') {
                        if (customFields.dashboardDefinition) {
                            Ozone.pref.PrefServer.createOrUpdateDashboard({
                                json: JSON.parse(customFields.dashboardDefinition),
                                onSuccess: function(dashboard) {}
                            });
                        }
                    } else {
                        widgetListJson.push(Ext.JSON.encode(self.createOwfWidgetJson(serviceItem, widgetId)));
                    }
                }

                if (widgetListJson.length > 0) {
                    // OZP-476: MP Synchronization
                    // Added the URL of the Marketplace we're looking at to the
                    // JSON we send to the widget controller.
                    self.submitWidgetList(Ext.JSON.encode(widgetListJson), marketplaceUrl, doLaunch);
                }
            },
            onFailure: function(json) {
                Ext.Msg.alert("Error", "Error has occurred while adding widgets from Marketplace");
            }
        });
    },

    createOwfWidgetJson: function (serviceItem, widgetId) {
        var directRequired = [];
        for (var j = 0; j < serviceItem.requires.length; j++) {
            directRequired.push(serviceItem.requires[j].uuid);
        }

        var widgetJson = {
            displayName: serviceItem.title,
            description: serviceItem.description ? serviceItem.description : '',
            imageUrlLarge: serviceItem.imageLargeUrl,
            imageUrlSmall: serviceItem.imageSmallUrl,
            widgetGuid: serviceItem.uuid,
            widgetUrl: serviceItem.launchUrl,
            widgetVersion: serviceItem.versionName,
            singleton:serviceItem.owfProperties.singleton,
            visible: serviceItem.owfProperties.visibleInLaunch,
            background: serviceItem.owfProperties.background,
            isSelected: widgetId == serviceItem.id, // true if this is the widget the user selected and not a dependent widget
            height: 200,
            width: 200,
            isExtAjaxFormat: true,
            //FIXME this ternary is a hack for AML-3148
            widgetTypes: [(serviceItem.types.title == "Web Apps" ? "fullscreen" : serviceItem.owfProperties.owfWidgetType)]
//            ,
//            tags: Ext.JSON.encode([this.createApprovalTag()])
        };
        if (directRequired.length > 0) {
            widgetJson.directRequired = Ext.JSON.encode(directRequired);
        }
        return widgetJson;
    },

    createApprovalTag: function() {
        var approvalTag = {};
        if (Ozone.config.enablePendingApprovalWidgetTagGroup) {
            approvalTag = {
                name:Ozone.config.carousel.pendingApprovalTagGroupName,
                visible:true,
                position:-1,
                editable:false
            };
        }
        else {
            var dt = new Date();
            var dateString = Ext.Date.format(dt, 'Y-m-d');
            approvalTag = {
                name:Ozone.config.carousel.approvedTagGroupName + ' on ' + dateString,
                visible:true,
                position:-1,
                editable:true
            };
        }
        return approvalTag;
    },

    // OZP-476: MP Synchronization
    // Added the URL of the Marketplace we're looking at to the JSON we send to
    // the widget controller.
    submitWidgetList: function(widgetList, mpUrl, doLaunch) {
        return owfdojo.xhrPost({
            url:Ozone.util.contextPath() + '/widget/',
            sync:true,
            content:{
                marketplaceUrl: mpUrl,
                addExternalWidgetsToUser:true,
                widgets:widgetList
            },
            load:function (response, ioArgs) {

                var widgetLauncher = Ext.getCmp('widget-launcher');
                widgetLauncher.loadLauncherState();

                var stack_bottomright = {"dir1": "up", "dir2": "left", "firstpos1": 25, "firstpos2": 25};

                // AML-2924 - This will display the dashboard switcher and add a listener to launch the widget if
                // requested


                var result = Ext.JSON.decode(response),
                    notifyText;

                if (result.success) {
                    var widgetGuid = result.data[0].widgetGuid,
                        dashboardContainer = widgetLauncher.dashboardContainer,
                        widgetDefs;

                    dashboardContainer.widgetStore.on({
                        // Have to load the store first. Add a listener so we can work with the newly loaded store
                        load: {
                            fn: function(store, records, success, operation, eOpts) {

                                // Get the widget definition
                                widgetDefs = dashboardContainer.widgetStore.queryBy(function(record,id) {
                                    return record.data.widgetGuid == widgetGuid;
                                });

                                // The widget is in the store
                                if (widgetDefs && widgetDefs.getCount() > 0)  {

                                    // If the widget is to be launched
                                    if (doLaunch) {

                                        // It will be the first item if there is more than one (the remaining are required items)
                                        var widgetDef = widgetDefs.get(0);
                                        
                                        console.log(widgetDef);
                                        if(widgetDef.data.widgetTypes[0].name == "fullscreen") {
                                        	var me = this;
                                        	
                                        	/*var dashboardStore = dashboardContainer.dashboardStore;
                                    		dashboardStore.filterBy(function(record, id) {
                                    			console.log(record.data.name + "    " + widgetDef.data.name);
                                    			return (record.data.name == widgetDef.data.name);
                                    		});
                                    		console.log(dashboardStore);
                                            me.dashboard = (dashboardInd >=0 ) && dashboardStore.getAt(dashboardInd);*/
                                        	
                                        	if(false) {
                                        		
                                        		//TODO switch to dashboard
                                        		//TODO verify open item; close all if others;
                                        		//TODO verify layout
                                        		//TODO open this one if needed
                                        	} else {
                                        		me.dashboard = Ext.create('Ozone.data.Dashboard', {
	                                                name: widgetDef.data.title,
	                                                layoutConfig : {
	                                                    xtype: 'container',
	                                                    flex: 1,
	                                                    height: '100%',
	                                                    items: [],
	                                                    paneType: 'fitpane',
	                                                    widgets: [widgetDef.data]
	                                                },
	                                                locked:true
	                                        		
	                                            });
	                                        	
	                                        	dashboardContainer.saveDashboard(me.dashboard.data, 'create', function() {
	                                            	dashboardContainer.activateDashboard(me.dashboard.data.guid);
	                                            });
                                        	}
                                        } else {
	                                        // Show the switcher
	                                        dashboardContainer.showDashboardSwitcher();
	                                        // Add a listener so we can launch the widget if the user picks a different dashboard
	                                        dashboardContainer.addListener(OWF.Events.Dashboard.CHANGED, function() {
	                                            dashboardContainer.launchWidgets(widgetDef, true);
	                                        }, dashboardContainer, {delay:2000, single:true});
	
	                                        notifyText =  Ozone.layout.DialogMessages.marketplaceWindow_LaunchSuccessful;
                                        }
                                    }  else {

                                        notifyText = Ozone.layout.DialogMessages.marketplaceWindow_AddSuccessful
                                    }


                                }  else {

                                    // Failure message
                                    notifyText = Ozone.layout.DialogMessages.marketplaceWindow_AddWidget;
                                }
                                //Display the message

                                $.pnotify({
                                    title: Ozone.layout.DialogMessages.added,
                                    text: notifyText,
                                    type: 'success',
                                    addclass: "stack-bottomright",
                                    stack: stack_bottomright,
                                    history: false,
                                    sticker: false,
                                    icon: false
                                });
                            } ,
                            scope: this,
                            single: true
                        }
                    })

                    dashboardContainer.widgetStore.load();

                }   else {
                    notifyText = Ozone.layout.DialogMessages.marketplaceWindow_AddWidget;
                    $.pnotify({
                        title: Ozone.layout.DialogMessages.added,
                        text: notifyText,
                        type: 'success',
                        addclass: "stack-bottomright",
                        stack: stack_bottomright,
                        history: false,
                        sticker: false,
                        icon: false
                    });

                }




                // End AML-2924



            },
            error:function (response, ioArgs) {
                Ozone.Msg.alert(Ozone.layout.DialogMessages.error, Ozone.layout.DialogMessages.marketplaceWindow_AddWidget, null, null, {
                    cls:'confirmationDialog'
                });
            }
        });
    },

    registerWindowManager:function (window_manager) {
        this.windowManager = window_manager;
    }
};
