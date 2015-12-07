/*global Backbone, clearInterval, clearTimeout, document, setInterval,
         setTimeout, window, ZeroClipboard */

// Handle old browsers not being able to execute jQuery 2.x, e.g. IE8.
(function () {
    'use strict';

    if (!window.jQuery) {
        // Something went wrong loading jQuery, e.g. loading jQuery 2.x on IE8.
        // Make sure the "outdated browser" message is shown.
        document.getElementById('outdated').setAttribute(
            'style',
            'display: block'
        );
    }
}());

// TEF UI application code.
(function ($) {
    'use strict';

    var 
        // Enable debug mode based on debug option in URL.
        DEBUG = /(debug|trace)=true/.test(window.location.search),
        TRACE = /trace=true/.test(window.location.search),

        // Show or hide the environment filter UI control.
        SHOW_FILTER_CONTROL = true,

        // Disable the product selector by hardcoding a (non-falsy) product ID.
        // Any falsy value will enable the product selector.
        RESTRICTED_PRODUCT_ID = 1,   // 1 = Triple Feature

        // Shared colos can only be edited by certain users. Hardcocde for now.
        DEPLOY_MASTERS = [ "admin" ],

        // Hardcoded map of possible colo promotions.
        DEV_ID = 3,
        QA_ID = 1,
        STAGE_ID = 2,
        // Since keys are integers, cannot populate colo promotions hash here.
        COLO_PROMOTIONS = {},

        // Delay between the "environment model save success" event and the
        // "switch editor to non-editor view" event.
        ENVIRONMENT_ROTATE_DELAY = 300,   // Note: 500 is just a bit too long.

        // Blink on/off delay while waiting for the first service "up" event.
        BLINK_DELAY = 500,

        // Does browser have Flash enabled and the right Flash version?
        flashEnabled = true,

        // TODO: remove Backbone.sync override once API supports power on/off.
        origBackboneSync = Backbone.sync,

        // Models.
        SessionModel,
        ProductCollection,
        ProductBuildsModel,
        BranchCollection,
        ServiceModel,
        ServiceCollection,
        ServicesStateModel,
        EnvironmentModel,
        EnvironmentCollection,

        // Views.
        FormValidationMixin,
        SessionView,
        ServiceView,
        ServiceListView,
        DisplayView,
        EnvironmentView,
        ProductSelectorView,
        BranchSelectorView,
        ProductBuildsSelectorView,
        EnvironmentListView,
        AppView;

    // Developer console logging function.
    // This will throw errors if window.console does not exist.
    // (Use window.console rather than console so that JSLint will complain if
    // console is used anywhere else in this file, which is what we want.)
    function debug(msg) {
        if (DEBUG) {
            window.console.log(msg);
        }
    }
    function trace(msg) {
        if (TRACE) {
            window.console.log(msg);
        }
    }

    // String replace function by http://javascript.crockford.com/remedial.html
    // Made regex pass JSLint validation and added a check to make sure all
    // variables are replaced.
    function supplant(string, o) {
        var regex = new RegExp('\\{([^{}]*)\\}', 'g'),
            result;

        result = string.replace(
            regex,
            function (a, b) {
                var r = o[b];
                return typeof r === 'string' || typeof r === 'number' ? r : a;
            }
        );

        if (regex.test(result)) {
            throw 'Not all variables supplanted! ' + result;
        }

        return result;
    }

    // Determine the headers for a particular TEF API request.
    function headers(str) {
        return {
            'Accept': 'application/vnd.tranquil.tef.' + str + '-0.5+json',
            'Authorization': window.localStorage.tef_token,
            'Content-Type': 'application/vnd.tranquil.tef.' + str + '-0.5+json'
        };
    }

    // Extract the most user-friendly error message from a failed AJAX request.
    function extractErrorMessage(xhr) {
        var msg,
            titleRegex = new RegExp('<title>(.+)</title>', 'i'),
            headingRegex = new RegExp('<h1>(.+)</h1>', 'i');

        if (titleRegex.test(xhr.responseText) ||
                headingRegex.test(xhr.responseText)) {
            msg = RegExp.$1;
        } else if (xhr.responseText && $.trim(xhr.responseText) &&
                !/<html>/i.test(xhr.responseText) &&   // Not HTML.
                !/^{.*}$/.test(xhr.responseText) &&   // Not JSON.
                xhr.responseText.indexOf('\n') < 0) {   // Not a stack trace.
            msg = xhr.responseText;
        } else {
            msg = xhr.status + ' ' + xhr.statusText;
        }

        return msg;
    }

    if (document.location.protocol === 'file:') {
        Backbone.sync = function (method, model, options) {
            var request,
                response;

            request = method + ':' +
                (typeof model.url === 'function' ? model.url() : model.url);

            trace('sync: ' + request + ', ' + JSON.stringify(model.toJSON()));

            model.trigger('request');

            if (request === 'create:/api/sessions') {
                response = {
                    token: 'ABC-123-DEF-456-GHI-789',
                    user: model.get('user'),
                    max_colos: 5
                };
                model.set(response);
            } else if (request === 'delete:/api/sessions') {
                response = 'ok';
            } else if (request === 'read:/api/products') {
                response = [
                    {"product_id": 1, "product_name": "Triple Feature", "descr": "Recommendations for movie buffs"},
                    {"product_id": 2, "product_name": "Spector", "descr": "The Internet Specs Comparison Site"},
                    {"product_id": 3, "product_name": "Philolo", "descr": "Wisdom from armchair philosophers"},
                ];
                model.reset(response);
            } else if (/^read:\/api\/products\/(\d+)$/.test(request)) {
                response = {
                    product_id: Number(RegExp.$1)
                };
                if (response.product_id === 1) {
                    response.name = "Triple Feature";
                    response.descr = "Recommendations for movie buffs";
                    response.branches = [
                        {"branch_id": 1, "branch_name": "Trunk"},
                        {"branch_id": 2, "branch_name": "ModernTimesTheme"},
                        {"branch_id": 3, "branch_name": "Neo_Sprint_79"},
                        {"branch_id": 4, "branch_name": "Neo_Sprint_81"},
                        {"branch_id": 5, "branch_name": "Neo_Sprint_84"},
                        {"branch_id": 6, "branch_name": "Neo_Sprint_85"},
                        {"branch_id": 7, "branch_name": "ZX_S22"},
                        {"branch_id": 8, "branch_name": "ZX_23"},
                        {"branch_id": 9, "branch_name": "Sundance_Special"}
                    ];
                } else if (response.product_id === 2) {
                    response.name = "Spector";
                    response.descr = "The Internet Specs Comparison Site";
                    response.branches = [
                        {"branch_id": 11, "branch_name": "Sprint86"},
                        {"branch_id": 12, "branch_name": "Sprint81"},
                        {"branch_id": 13, "branch_name": "S3"},
                        {"branch_id": 14, "branch_name": "S1_sort_200"},
                        {"branch_id": 15, "branch_name": "S100_sort_3"},
                        {"branch_id": 16, "branch_name": "S2_sort_10"},
                        {"branch_id": 17, "branch_name": "S1_sort_11"},
                        {"branch_id": 18, "branch_name": "S100_sort_11"},
                        {"branch_id": 19, "branch_name": "Sundance_Special"},
                        {"branch_id": 13, "branch_name": "Z should not be on top"}
                    ];
                } else if (response.product_id === 3) {
                    response.name = "Philolo";
                    response.descr = "Wisdom from armchair philosophers";
                    response.branches = [
                        {"branch_id": 25, "branch_name": "Sprint33"},
                        {"branch_id": 24, "branch_name": "Sprint32"},
                        {"branch_id": 23, "branch_name": "Sprint31"},
                        {"branch_id": 22, "branch_name": "Sprint30"},
                        {"branch_id": 21, "branch_name": "Sprint29"}
                    ];
                }
                response.builds = {
                    "FILE": ["fileservice-1.0.0.85-834.rpm", "fileservice-1.0.0.84-1254.rpm", "fileservice-1.0.0.84-1253.rpm", "fileservice-1.0.0.84-1249.rpm"],
                    "SYNC": ["syncservice-1.0.0.84-1254.rpm", "syncservice-1.0.0.84-1253.rpm", "syncservice-1.0.0.84-1249.rpm"],
                    "LB": [],
                    "SPLK": [],
                    "WEB": ["web-1.0.0.84-234.rpm", "web-1.0.0.84-229.rpm", "web-1.0.0.84-215.rpm"],
                    "CDN": ["web-assets-1.0.0.84-234.rpm", "web-assets-1.0.0.84-229.rpm", "web-assets-1.0.0.84-215.rpm"],
                    "DB": ["db-migrations-1.0.0.84-1.rpm"],
                    "SPOC": ["spoc-server-1.0.0.84-17.rpm", "spoc-server-1.0.0.84-16.rpm", "spoc-server-1.0.0.84-14.rpm"],
                    "CDB": ["couchbase-1.0.0.84-2.rpm", "couchbase-1.0.0.84-1.rpm"],
                    "RMQ": ["rmq-1.0.0.84-5.rpm", "rmq-1.0.0.84-3.rpm", "rmq-1.0.0.84-2.rpm"],
                    "SRCH": ["search-1.0.0.84-31.rpm", "search-1.0.0.84-30.rpm", "search-1.0.0.84-29.rpm"]
                };
                if (options.dataFilter) {
                    response = JSON.parse(options.dataFilter(JSON.stringify(response)));
                }
                if (model instanceof Backbone.Collection) {
                    model.reset(response);
                } else {
                    model.set(response);
                }
            } else if (request === 'read:/api/colos') {
                model.reset([
                    {"colo_id": 3, "colo_name": "DEV", "model_id": 5, "model_name": "Model_DEV", "branch_id": 6, "branch_name": "Neo_Sprint_85", "product_id": 1, "product_name": "Triple Feature", "state": "on", "global": true},
                    {"colo_id": 1, "colo_name": "QA", "model_id": 6, "model_name": "Model_QA", "branch_id": 4, "branch_name": "Neo_Sprint_81", "product_id": 1, "product_name": "Triple Feature", "state": "on", "global": true},
                    {"colo_id": 10, "colo_name": "Trunk", "model_id": 7, "model_name": "Model_Trunk", "branch_id": 1, "branch_name": "Trunk", "product_id": 1, "product_name": "Triple Feature", "state": (Math.random() > 0.3 ? "on" : "off"), "global": false},
                    {"colo_id": 11, "colo_name": "Sprint79", "model_id": 8, "model_name": "Model_Sprint79", "branch_id": 3, "branch_name": "Neo_Sprint_79", "product_id": 1, "product_name": "Triple Feature", "state": (Math.random() > 0.3 ? "on" : "off"), "global": false},
                    {"colo_id": 12, "colo_name": "ModernTimesTheme", "model_id": 9, "model_name": "Model_ModernTimesTheme", "branch_id": 2, "branch_name": "ModernTimesTheme", "product_id": 1, "product_name": "Triple Feature", "state": (Math.random() > 0.3 ? "on" : "off"), "global": false}
                ]);
            } else if (/^read:\/api\/colos\/\d+$/.test(request)) {
                response =
                    {"services": [
                        {"service_id": 37, "service_name": "FileService S69_c5", "uuid": "lb_tef_123", "nickname": "FILE", "rpm": model.get('colo_name') === 'DEV' ? "fileservice-1.0.0.85-834.rpm" : "fileservice-1.0.0.84-1253.rpm"},
                        {"service_id": 39, "service_name": "SyncService S69_c5", "uuid": "lb_tef_123", "nickname": "SYNC", "rpm": "syncservice-1.0.0.84-1253.rpm"},
                        {"service_id": 49, "service_name": "Load Balancer S69_c5", "uuid": "lb_tef_123", "nickname": "LB", "rpm": "loadbalancer-1.0.0.84-1.rpm"},
                        {"service_id": 40, "service_name": "Web S69_c5", "uuid": "web_tef_123", "nickname": "WEB", "rpm": "web-1.0.0.84-234.rpm"},
                        {"service_id": 41, "service_name": "CDN S69_c5", "uuid": "cdn_tef_123", "nickname": "CDN", "rpm": "web-assets-1.0.0.84-234.rpm"},
                        {"service_id": 42, "service_name": "DB S69_c5", "uuid": "sql_tef_123", "nickname": "DB", "rpm": "db-migrations-1.0.0.84-1.rpm"},
                        {"service_id": 43, "service_name": "SPOC S69_c5", "uuid": "spoc_tef_123", "nickname": "SPOC", "rpm": "spoc-server-1.0.0.84-16.rpm"},
                        {"service_id": 44, "service_name": "CDB S69_c5", "uuid": "cdb_tef_123", "nickname": "CDB"},
                        {"service_id": 48, "service_name": "Splunk S69_c5", "uuid": "splk_tef_123", "nickname": "SPLK"},
                        {"service_id": 45, "service_name": "RMQ S69_c5", "uuid": "rmq_tef_123", "nickname": "RMQ", "rpm": "rmq-1.0.0.84-5.rpm"},
                        {"service_id": 47, "service_name": "SRCH S69_c5", "uuid": "srch_tef_123", "nickname": "SRCH", "rpm": "search-1.0.0.84-29.rpm"}
                    ]};
                model.set(response);
            } else if (/^read:\/api\/colos\/healthcheck\/\d+$/.test(request)) {
                response = {
                    "lb_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "web_tef_123": (Math.random() > 0.4 ? "up" : "down"),
                    "cdn_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "sql_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "spoc_tef_123": (Math.random() > 0.5 ? "up" : "down"),
                    "cdb_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "rmq_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "nos_tef_123": (Math.random() > 0.3 ? "up" : "down"),
                    "srch_tef_123": (Math.random() > 0.6 ? "up" : "down"),
                    "splk_tef_123": (Math.random() > 0.3 ? "up" : "down")
                };
                model.set(response);
            } else if (/^update:\/api\/colos\/\d+$/.test(request)) {
                // This is a model attribute change, e.g. power on/off or
                // RPM changes.
                response = 'ok';
            } else if (request === 'create:/api/colos') {
                response = {
                    colo_id: (new Date()).getTime()
                };
                model.set(response);
            } else if (/^delete:\/api\/colos\/\d+$/.test(request)) {
                response = {};
            } else if (/^read:\/api\/services\/\w+$/.test(request)) {
                response = {"service_id": model.get('service_id'), "name": model.get('service_name'), "uuid": model.get('uuid'), "nickname": model.get('nickname'), "vips": {
                    "sso": ["sso.tranquil.com", "sso.tranquil.com"],
                    "lb": ["10.65.121.206", "10.4.5.206"],
                    "web": ["10.65.121.205", "10.4.5.205"],
                    "cdn": ["10.65.121.204", "10.4.5.204"],
                    "sql": ["10.65.121.203", "10.4.5.203"],
                    "spoc": ["10.65.121.202", "10.4.5.202"],
                    "cdb": ["10.65.121.201", "10.4.5.201"],
                    "rmq": ["10.65.121.200", "10.4.5.200"],
                    "srch": ["10.65.121.198", "10.4.5.198"],
                    "splk": ["10.65.121.197", "10.4.5.197"]
                }};
            } else {
                throw 'Unexpected request: "' + request + '"';
            }

            // TODO: for some reason this block causes
            // 'Uncaught Error: A "url" property or function must be specified'
            // for certain cases.
            if (
                request !== 'read:/api/colos'
            ) {
                if (options.success || options.complete) {
                    setTimeout(function () {
                        if (options.success) {
                            options.success.call(model, response, options);
                        }
                        if (options.complete) {
                            options.complete.call(model, response, options);
                        }
                    }, Math.max(200, Math.random() * 2000));
                }
            }
        };
    } else {
        // Override for power on/off.
        // TODO: remove Backbone.sync override once API supports power on/off.
        Backbone.sync = function (method, model, options) {
            var url = typeof model.url === 'function' ? model.url() : model.url,
                success;

            if (/^update:\/api\/colos\/\d+$/.test(method + ':' + url) &&
                    model.hasChanged('state')) {   // Only simulate the on/off action (do allow a deploy call).
                // Simulate success.
                success = function () {
                    if (options.success) {
                        options.success.call(model, 'ok', options);
                    }
                };

                if (options.async) {
                    setTimeout(success, 0);
                } else {
                    success();
                }
            } else {
                return origBackboneSync(method, model, options);
            }
        };
    }

    // User session model, used for login/logout.
    SessionModel = Backbone.Model.extend({
        url: '/api/sessions',

        initialize: function () {
            // Make sure on login to set an ID, otherwise destroy will do
            // nothing as the model is believed to be "isNew".
            // Same on delete, remove the ID to make it "isNew" again.
            this.on('sync', this.toggleId);
        },

        toggleId: function () {
            if (this.get('id')) {
                this.unset('id');
            } else {
                this.set('id', 'truthy');
            }
        },

        validate: function (attrs) {
            var errors = [];

            if (!$.trim(attrs.user)) {
                errors.push('user');
            }

            // Don't use trim, as a password could contain spaces only.
            if (!attrs.password) {
                errors.push('password');
            }

            if (errors.length) {
                return errors;
            }
        }
    });

    // Collection of products.
    ProductCollection = Backbone.Collection.extend({
        url: '/api/products',
        idAttribute: 'product_id',
        comparator: 'product_name'
    });

    // Collection of branches for a product.
    BranchCollection = Backbone.Collection.extend({
        idAttribute: 'branch_id',

        // Make sure branches get displayed in reverse alphabetically order,
        // e.g. sprint84, sprint80, sprint79, sprint74, etc. This also needs to
        // work when numbers are not at the end, e.g. S73_Stratus.
        comparator: function (b1, b2) {
            var regex = /(\d+)/g,
                n1 = b1.get('branch_name').toUpperCase(),
                n2 = b2.get('branch_name').toUpperCase(),
                m1 = n1.match(regex),
                m2 = n2.match(regex),
                startIdx1 = 0,
                startIdx2 = 0,
                endIdx1,
                endIdx2,
                part1,
                part2,
                result,
                ii = 0;

            // Shortcut.
            if (n1 === n2) {
                return 0;
            }

            // Trunk should always be on top.
            if (/trunk/i.test(n1)) {
                return -1;
            } else if (/trunk/i.test(n2)) {
                return 1;
            }

            if (m1 && m2) {
                while (result === undefined) {
                    // So far, the parts of the strings are identical. Because
                    // we already checked if n1 === n2, a diff _will_ be found,
                    // breaking the while loop.
                    if (ii === m1.length && ii === m2.length) {
                        // No more numeric portions to compare.
                        part1 = n1.substring(startIdx1 + m1[ii - 1].length);
                        part2 = n2.substring(startIdx2 + m2[ii - 1].length);

                        result = part1 > part2 ? -1 : 1;
                    } else if (ii === m1.length && ii !== m2.length) {
                        // B2 is more specific and should be above b1.
                        result = -1;
                    } else if (ii !== m1.length && ii === m2.length) {
                        // B1 is more specific and should be above b2.
                        result = 1;
                    } else {
                        // Compare part.
                        endIdx1 = n1.indexOf(m1[ii], startIdx1);
                        endIdx2 = n2.indexOf(m2[ii], startIdx2);

                        part1 = n1.substring(startIdx1, endIdx1);
                        part2 = n2.substring(startIdx2, endIdx2);

                        if (part1 === part2) {
                            // Compare numeric portion after it.
                            if (m1[ii] === m2[ii]) {
                                // On to the next cycle; compare the next part
                                // and number.
                                ii += 1;
                                startIdx1 = endIdx1;
                                startIdx2 = endIdx2;
                            } else {
                                result = Number(m2[ii]) - Number(m1[ii]);
                            }
                        } else {
                            result = part1 > part2 ? -1 : 1;
                        }
                    }
                }

                return result;
            } else {
                // Compare entire strings.
                return n1 > n2 ? -1 : 1;
            }
        },

        setProduct: function (product, success, error) {
            if (product) {
                debug('BranchCollection: fetch branches');

                // TODO: this.url = '/api/products/' + product + '/branches';
                this.url = '/api/products/' + product;
                this.fetch({
                    headers: headers('PRODUCT'),
                    reset: true,
                    // TODO: remove dataFilter once above TODO is addressed.
                    dataFilter: function (jsonString) {
                        var result = JSON.parse(jsonString);

                        // TODO: branch collection and product info cache make
                        //       same request... make this fetch use same cache.

                        // Extract just the branches part.
                        return JSON.stringify(result.branches);
                    },
                    success: success,
                    error: error
                });
            } else {
                debug('BranchCollection: clear branches');

                this.url = undefined;
                this.reset();
            }
        }
    });

    // Product builds model. (Not part of ProductCollection.)
    ProductBuildsModel = Backbone.Model.extend({
        idAttribute: 'product_id',
        initialize: function (attrs, options) {
            this.url = '/api/products/' + options.productId;
        }
    });

    // Service model.
    ServiceModel = Backbone.Model.extend({
        idAttribute: 'service_id',
        url: function () {
            return '/api/services/' + this.get('uuid');  // TODO: use service_id
        }
    });

    // Collection of services.
    ServiceCollection = Backbone.Collection.extend({
        model: ServiceModel,
        url: '/api/services',
        idAttribute: 'service_id',
        comparator: 'nickname'
    });

    // The services state model contains:
    // - key/value pair for each service where key = uuid and value = up/down
    ServicesStateModel = Backbone.Model.extend({
        // Specifying both urlRoot and id still does not make the url() function
        // generate the right URL. Since the API path /api/colos/:id/healthcheck
        // cannot be generated via the default url() function, override it.
        url: function () {
            // TODO: return '/api/colos/' + this.id + '/healthcheck';
            return '/api/colos/healthcheck/' + this.id;
        }
    });

    // The environment model contains:
    // - its own properties retrieved from the server (e.g. colo_id, name, etc)
    // - a service collection (seperately retrieved from the server, and
    //   containing info about the services)
    // - a services state model (separately retrieved from the server, and
    //   containing services state, e.g. up/down--the state property is set on
    //   each service model in the service collection)
    // This model further contains these class properties:
    // - a products collection
    // - a branches collection
    EnvironmentModel = Backbone.Model.extend({
        idAttribute: 'colo_id',

        timerId: undefined,
        pollDelay: document.location.protocol === 'file:' ? 10000 : 30000,

        initialize: function () {
            var productId = this.get('product_id');

            this.overrideToJSON();

            this.services = new ServiceCollection();
            this.servicesState = new ServicesStateModel({
                id: this.id
            });

            if (this.get('global')) {
                this.builds = EnvironmentModel.getProductBuildsModel(productId);
            }

            this.on('change:state', this.handleEnvironmentStateChange);
            this.on('predestroy destroy', this.turnOff);
            this.on('destroy logout', this.stopServicesStatePoller);

            // UI should call set('product_id') whenever it changes, so the
            // branches collection can be refreshed. Applies to edit mode only.
            this.on('change:product_id', this.resetBranches);
        },

        // Override to satisfy custom request format for deploy calls.
        // (API expects as body a hash of nickname -> rpm.)
        overrideToJSON: function () {
            this.originalToJSON = this.toJSON;
            this.toJSON = function () {
                var self = this,
                    body = [],
                    custom = false;

                this.services.each(function (model) {
                    var nickname = model.get('nickname');

                    if (self.get(nickname)) {
                        // Custom case. Send request containing nicknames.
                        body.push({
                            nickname: nickname,
                            ip: model.get('ip'),
                            rpm: self.get(nickname)
                        });
                        self.unset(nickname);
                        custom = true;
                    }
                });

                return custom ? body : this.originalToJSON();
            };
        },

        // Called by environment view after all startup animations have been
        // completed.  This will only be called once.
        start: function () {
            debug('EnvironmentModel: start');

            this.handleEnvironmentStateChange();
        },

        turnOff: function () {
            if (this.get('state') === 'on') {
                // Don't click on .switch otherwise two requests are sent:
                // one to destroy the environment and another to turn it off.
                //this.$('.switch').click();
                this.set('state', 'off');
            }
        },

        startServicesStatePoller: function () {
            var self = this;

            trace('EnvironmentModel: start services state timer');

            // Avoid "this" being set to window.
            //this.timerId = setTimeout(this.fetchServicesState,
            //    this.pollDelay);
            this.timerId = setTimeout(function () {
                self.fetchServicesState();
            }, this.pollDelay);
        },

        stopServicesStatePoller: function () {
            if (this.timerId) {
                debug('EnvironmentModel: stop services state timer');

                clearTimeout(this.timerId);
            }
        },

        handleEnvironmentStateChange: function () {
            debug('EnvironmentModel: change:state: state === ' +
                this.get('state') + ', #services === ' + this.services.length);

            if (this.services.length) {
                if (this.get('state') === 'on') {
                    // Services already there, so don't get them again.
                    this.fetchServicesState();   // This also starts the poller.
                } else {
                    // User turned environment off; stop polling.
                    this.stopServicesStatePoller();
                }
            } else {
                // Regardless of state being on or off, fetch environment
                // details (incl. services) as those always need to be shown.
                this.fetchAdditionalDetails();   // This also starts the poller.
            }
        },

        fetchAdditionalDetails: function () {
            debug('EnvironmentModel: fetch services');

            // If this is a new environment, the model did not have an ID. As a
            // consequence, the service status model's ID got set incorrectly in
            // EnvironmentModel.initialize.
            // Fix it by overriding the method where this ID is needed.
            // Note that the line below is harmless for non-new environments,
            // so no need to special-case.
            this.servicesState.set('id', this.id);

            this.fetch({
                headers: headers('COLO'),
                success: function (model, response) {
                    // Remove LB (load balancer) until further notice.
                    var ss;
                    for (ss = 0; ss < response.services.length; ss += 1) {
                        if (response.services[ss].nickname === 'LB') {
                            response.services.splice(ss, 1);
                            break;
                        }
                    }

                    // Initialize services collection.
                    model.services.reset(response.services);

                    if (model.get('state') === 'on') {
                        // No need to wait for the this.fetch to complete before
                        // getting services state, but since a lot of requests
                        // are sent on app load (and the browser only allows a
                        // limited number of requests per domain), make sure the
                        // services names are displayed before anything else, so
                        // request those first and the services state second.
                        model.fetchServicesState();
                    }
                },
                error: function (model, xhr) {
                    model.trigger('error:environmentservices', xhr);
                }
            });
        },

        fetchServicesState: function () {
            var self = this;

            trace('EnvironmentModel: fetch services state');

            this.servicesState.fetch({
                headers: headers('COLO'),
                success: function (model, response) {
                    var kk;

                    function setState() {
                        var models = self.services.where({ uuid: kk });

                        $.each(models, function (index, model) {
                            model.set('state', response[kk]);
                        });
                    }

                    for (kk in response) {
                        if (response.hasOwnProperty(kk)) {
                            // Avoid JSLint: Don't make functions within a loop.
                            setState();
                        }
                    }
                },
                complete: function () {
                    // Poll again later.
                    self.startServicesStatePoller();
                },
                error: function (model, xhr) {
                    self.trigger('error:environmentservicesstate', xhr);
                }
            });
        },

        resetBranches: function (model, product) {
            var self = this;

            debug('EnvironmentModel: reset branches for product: ' + product);

            // Product change invalidates existing branch selection.
            model.unset('branch_id');

            EnvironmentModel.branches.setProduct(product, function () {
                // Nothing to be done on success.
            }, function (model, response) {
                // Show error message.
                self.trigger('error:unexpected', response);
            });
        },

        // Toggling the state of the submit button based on validity of the
        // model is tricky as the form fields should not be marked with .error
        // until the submit button is pressed but calling model.isValid() will
        // mark them as such immediately. Leave this as a nice-to-have TODO.
        validate: function (attrs) {
            var errors = [];

            if (!RESTRICTED_PRODUCT_ID && !attrs.product_id) {
                errors.push('product_id');
            }
            if (!attrs.branch_id) {
                errors.push('branch_id');
            }
            if (!attrs.global && !/^[A-Z0-9_]+$/i.test(attrs.colo_name)) {   // Note: > 0 chars.
                errors.push('colo_name');
            }

            if (errors.length) {
                return errors;
            }
        }
    }, {
        // Class variables.

        products: new ProductCollection(),
        branches: new BranchCollection(),
        productBuildsCache: {},

        bootstrap: function (success, error) {
            if (RESTRICTED_PRODUCT_ID) {
                debug('EnvironmentModel: fetch branches');

                // Fetch branches for restricted product.
                EnvironmentModel.branches.setProduct(
                    RESTRICTED_PRODUCT_ID,
                    success,
                    error
                );
            } else {
                debug('EnvironmentModel: fetch products');

                EnvironmentModel.products.fetch({
                    headers: headers('PRODUCT'),
                    reset: true,
                    success: success,
                    error: error
                });
            }
        },

        getProductBuildsModel: function (productId) {
            var lookup = EnvironmentModel.productBuildsCache;

            if (lookup[productId]) {
                // Previously fetched; just trigger the "fetch complete" event.
                // Allow listeners to subscribe before sending model events.
                setTimeout(function () {
                    lookup[productId].trigger('sync');
                }, 0);
            } else {
                lookup[productId] = new ProductBuildsModel({}, {
                    productId: productId
                });

                // Allow listeners to subscribe before sending model events.
                setTimeout(function () {
                    lookup[productId].fetch({
                        headers: headers('PRODUCT'),
                        reset: true,
                        dataFilter: function (jsonString) {
                            var nn,
                                result = JSON.parse(jsonString);

                            // Remove LB (load balancer) until further notice.
                            for (nn in result.builds) {
                                if (result.builds.hasOwnProperty(nn) &&
                                        nn === 'LB') {
                                    delete result.builds[nn];
                                    break;
                                }
                            }

                            // Extract just the builds part.
                            return JSON.stringify(result.builds);
                        }
                    });
                }, 0);
            }

            return lookup[productId];
        }
    });

    // Collection of environments.
    EnvironmentCollection = Backbone.Collection.extend({
        url: '/api/colos',

        // Dynamically determine the model so that customizations can be made
        // based on passed in model attributes. The model for a new environment
        // should be created like so:
        //     collection.add({ state: 'new', ... });
        // Backend-retrieved models will skip this customization.
        model: function (attrs, options) {
            if (attrs.state === 'new' && RESTRICTED_PRODUCT_ID) {
                // Avoid change:product_id being triggered after environment
                // save (when the environment details are retrieved).
                attrs.product_id = RESTRICTED_PRODUCT_ID;
            }

            return new EnvironmentModel(attrs, options);
        },

        comparator: function (e1, e2) {
            var order = window.localStorage.tef_colo_display_order || '',
                s1,
                s2;

            // Make sure we don't get incorrect matches where the sequence of
            // numbers in e1's ID is also present in e2's ID.
            order = ',' + order + ',';
            s1 = ',' + e1.get('colo_id') + ',';
            s2 = ',' + e2.get('colo_id') + ',';

            return order.indexOf(s1) - order.indexOf(s2);
        }
    });

    // Mixin for form validation support.
    //
    // Objects using this mixin must implement the following methods:
    // - headers: returns an object containing the HTTP headers to be sent with
    //            the model save request
    //
    // Standard Backbone events should be monitored to determine the results
    // of the model save request.
    FormValidationMixin = function () {
        if (!this instanceof Backbone.View) {
            throw 'FormValidationMixin requires a Backbone.View object';
        }

        if (!this.headers) {
            throw 'FormValidationMixin requires this.headers() to exist';
        }

        // Extend initialize function (which may already exist).
        this.origInitializeFn = this.initialize;
        this.initialize = function () {
            if (this.origInitializeFn) {
                this.origInitializeFn.apply(this, arguments);
            }

            this.listenTo(this.model, 'invalid', this.showValidationError);
        };

        this.showValidationError = function (model) {
            var self = this;

            $.each(model.validationError, function (index, attr) {
                self.$('[name="' + attr + '"]').addClass('error');
            });
        };

        this.clearModelValidationError = function (event) {
            $(event.target).removeClass('error');
        };

        this.setOnModel = function (event) {
            var input = $(event.target),
                val = input.val();

            if (input.attr('name').indexOf('_id') >= 0) {
                val = Number(val);
            }

            this.model.set(input.attr('name'), val);
        };

        this.setOnModelAndClearModelValidationError = function (event) {
            this.setOnModel(event);

            // User enters invalid character and hits Enter key --> validation
            // error. Then input is changed to fix error and user hits Enter key
            // again. (Note focus never left input field so above event does not
            // happen.) Now form submits but input border is still red. Make
            // sure to remove the error indication.
            this.clearModelValidationError(event);
        };

        this.saveModel = function (event) {
            var self = this,
                inputs = $(event.target).find('input, select, button');

            event.preventDefault();   // Stay on the current page.

            if (!this.model.isValid()) {
                // By calling isValid(), the model will already have triggered
                // the appropriate events, if any.
                return;
            }

            inputs.attr('disabled', 'disabled');
            this.$el.css('cursor', 'wait');

            // Give views using this mixin a chance to do other work.
            this.$el.trigger('presubmit');

            // TODO: send only specific properties, e.g. only the nickname
            //       props for deploy.
            this.model.save(undefined, {
                headers: this.headers(),
                wait: true,   // Don't switch UI until we get a response.

                // Backbone triggers 'sync' event on both model save and model
                // destroy. Make sure other code can distinguish between them.
                success: function (model, response, options) {
                    model.trigger('save:success', model, response, options);
                },
                error: function (model, xhr, options) {
                    model.trigger('save:error', model, xhr, options);
                },

                complete: function () {
                    inputs.removeAttr('disabled');
                    self.$el.css('cursor', 'default');
                }
            });
        };
    };
    FormValidationMixin.events = {
        'focus select': 'clearModelValidationError',
        'focus input': 'clearModelValidationError',
        'change select': 'setOnModel',

        // Can only have one 'change input' key in this events object, so call a
        // convenience function that invokes all functions that need to run.
        'change input': 'setOnModelAndClearModelValidationError',

        'submit': 'saveModel'
    };

    // View for a user session; primarily the login form.
    SessionView = Backbone.View.extend({
        events: function () {
            return $.extend(
                FormValidationMixin.events,
                {
                    'click #logout button': 'logout',
                    'presubmit': 'clearPreviousErrors'
                }
            );
        },

        initialize: function () {
            this.listenTo(this.model, 'save:success', this.saveSessionSuccess);
            this.listenTo(this.model, 'save:error', this.saveSessionError);
        },

        showUsername: function () {
            this.$('#logout span').text(window.localStorage.tef_user);
        },

        isLoginFormVisible: function () {
            return this.$('#login').is(':visible');
        },

        clearPreviousErrors: function () {
            this.$('p').hide();
        },

        clearAuthStorage: function () {
            // Avoid TypeError: property "tef_token" is non-configurable and
            // can't be deleted
            //delete window.localStorage.tef_token;
            // Also, it's a string, so setting it to undefined will make the
            // value 'undefined'.
            //window.localStorage.tef_token = undefined;
            window.localStorage.tef_token = '';
            window.localStorage.tef_user = '';
        },

        checkAuthToken: function (apiToCall) {
            var self = this;

            if (window.localStorage.tef_token) {
                // Make sure token is still good; attempt to call an API we
                // will need anyway.
                apiToCall(
                    function () {
                        // Update UI now that user is logged in.
                        self.model.trigger('login:success');
                    },
                    function (model, response) {
                        // Invalid token or server error.

                        if (response.responseText ===
                                '"Invalid session token"') {
                            // Force user to authenticate next time.
                            self.clearAuthStorage();

                            // Show error message.
                            self.$('#login p.session-expired').show();

                            self.model.trigger('login:expired');
                        } else {
                            self.model.trigger('login:other', response);
                        }
                    }
                );
            } else {
                this.model.trigger('login:nosession');
            }
        },

        saveSessionSuccess: function (model, data) {
            window.localStorage.tef_token = data.token;
            window.localStorage.tef_user = data.user;
            window.localStorage.tef_max_colos = data.max_colos;

            // Clear password input.
            // Note: an input change event only gets triggered when the user
            //       types in the field and then the field loses focus, so need
            //       to programmatically trigger the change event.
            this.$('#password').val('').trigger('change');

            // Update UI now that user is logged in.
            model.trigger('login:success');
        },

        saveSessionError: function (model, xhr) {
            if (xhr.status >= 400 && xhr.status <= 499) {
                // User error.
                this.$('p.login-error').fadeIn('fast');
            } else {
                this.$('p.custom').text('An unexpected error ' +
                    'occured: ' + extractErrorMessage(xhr)).show();
            }
        },

        // This function required by FormValidationMixin.
        headers: function () {
            return headers('SESSION');
        },

        logout: function () {
            var self = this;

            this.model.destroy({
                headers: this.headers(),

                // Don't get in a situation where the browser has removed the
                // login token but the server ended up not processing the model
                // destroy request. The user has no way to correct that
                // situation should it occur. So we have to keep the loggedin
                // UI visible and wait. If there's a logout error, the logout
                // button is still there to try again.
                wait: true,

                success: function (model) {
                    // Auth token no longer needed, so clear it.
                    self.clearAuthStorage();

                    model.trigger('logout:success');
                },
                error: function (model, xhr) {
                    model.trigger('logout:error', xhr);
                }
            });

            this.model.trigger('logout:prelogout');
        }
    });
    // Add form validation support.
    FormValidationMixin.call(SessionView.prototype);

    // View for a service "blade".
    ServiceView = Backbone.View.extend({
        tagName: 'li',
        className: 'slot prevent-click',

        // Keep track of service details request so it can be aborted.
        pendingServiceFetchXhr: undefined,

        // Note: the events hash is defined in addBootOnlyListeners() because
        // when this object is created, no events should be hooked up yet.

        initialize: function (options) {
            this.listenTo(this.model, 'change:state', this.changedState);
            this.listenTo(this.model, 'blink:toggle', this.blinkToggle);
            this.listenTo(this.model, 'blink:remove', this.blinkRemove);
            this.listenTo(this.model, 'inactive', this.clearActiveState);
            this.listenTo(options.environment, 'change:state',
                    this.changedEnvironmentState);
            this.addBootOnlyListeners();

            if (options.environment.get('global')) {
                this.listenTo(options.environment, 'save:success',
                        this.deploySuccess);
            }
        },

        addBootOnlyListeners: function () {
            var self = this;

            // Once the services state is retrieved, the init phase is over
            // and the bootstrap mode can be removed. Since the services state
            // will be polled periodically, only listen to one event.
            this.listenToOnce(this.options.servicesState, 'sync', function () {
                self.$el.removeClass('prevent-click');

                // There's no good way to hook into the events object and it's
                // not possible to change "this" in the following standard
                // jQuery hookup:
                //self.$el.on('click', this.toggleServiceFocus);
                // Since there's just one event in the events hash anyway, use
                // Backbone's way of temporarily listening or stop listening
                // to all view events (again, here just one event).
                self.events = {
                    'click': 'toggleServiceFocus'
                };
                self.delegateEvents();
            });
        },

        render: function () {
            var modelProps = this.model.toJSON();

            // If there's an error, don't display "undefined" in the display.
            modelProps.nickname = modelProps.nickname || '[error]';

            this.$el.html(supplant($('#service-list-item').html(), modelProps));

            if (this.options.isEditor) {
                this.$el.addClass('booting');
            }

            return this;
        },

        deploySuccess: function (model) {
            var rpm = model.get(this.model.get('nickname'));

            if (rpm && rpm !== this.model.get('rpm')) {
                this.model.set('rpm', rpm);
                this.$el.removeClass('down up').addClass('booting');
            }
        },

        changedState: function () {
            this.$el.removeClass('down up').addClass(this.model.get('state'));
        },

        changedEnvironmentState: function () {
            // Clear old state.
            this.model.unset('state');   // Remove up or down state.
            this.$el.removeClass('up down active');

            // Apply new state.
            if (this.options.environment.get('state') === 'on') {
                // Temporarily stop listening to view events (defined by the
                // this.events hash). Listening will commence when the services
                // state comes in (or when the environment is turned off).
                this.undelegateEvents();
            } else {
                // Bring UI state back to how it was after initialize().
                this.$el.addClass('prevent-click');

                // Bring listener state back to how it was after initialize().
                //
                // Note: this is done on state==off rather than on state==on
                // because there are many change:state event listeners and no
                // specific order of processing should be required. If this was
                // done on state==on, the environment view's listener must be
                // run before the environment model's listener as the model will
                // make a request immediately to fetch its services state.
                this.addBootOnlyListeners();

                debug('ServiceView: restore init() state: listen for ' +
                    'servicesState sync');
            }
        },

        abortPendingServiceFetch: function () {
            if (this.pendingServiceFetchXhr) {
                debug('ServiceListView: abort pending service fetch request');

                this.pendingServiceFetchXhr.abort();
                this.pendingServiceFetchXhr = undefined;
            }
        },

        clearActiveState: function () {
            this.$el.removeClass('active');
            this.abortPendingServiceFetch();
        },

        toggleServiceFocus: function () {
            var self = this;

            // Because events are re-subscribed when the environment is off,
            // make sure to ignore events if environment is off.
            if (this.options.environment.get('state') !== 'on') {
                return;
            }

            if (this.$el.hasClass('active')) {
                this.$el.removeClass('active');

                this.abortPendingServiceFetch();

                debug('ServiceListView: service unselect: ' +
                    this.model.get('service_id') + ' / ' +
                    this.model.get('nickname'));

                this.model.trigger('service:unselect', this.model);
            } else {
                this.$el.addClass('active');

                debug('ServiceListView: service select: ' +
                    this.model.get('service_id') + ' / ' +
                    this.model.get('nickname'));

                this.model.trigger('service:select', this.model);

                debug('ServiceListView: fetch service details');

                this.pendingServiceFetchXhr = this.model.fetch({
                    headers: headers('SERVICE'),
                    success: function (model) {
                        self.pendingServiceFetchXhr = undefined;

                        // The Backbone 'change' event is a bit overloaded as
                        // it's used for both services collection changes as
                        // well as service model changes (and can we guarantee
                        // a service fetch really causes a change?), so use
                        // custom event to be clear.
                        model.trigger('success:servicedetails', model);
                    },
                    error: function (model, response) {
                        var eventPrefix = 'error';

                        // Because the request could have been aborted by
                        // unselecting the service, make sure to handle it
                        // differently from an error.
                        if (response.status === 0 &&
                                response.statusText === 'abort') {
                            eventPrefix = 'abort';
                        }
                        model.trigger(eventPrefix + ':servicedetails',
                            model, response);
                    }
                });
            }
        },

        blinkToggle: function () {
            if (this.$el.hasClass('blink-on') ||
                    this.$el.hasClass('blink-off')) {
                this.$el.toggleClass('blink-on blink-off');
            } else {
                this.$el.addClass('blink-on');
            }
        },

        blinkRemove: function () {
            this.$el.removeClass('booting blink-on blink-off');
        }
    });

    // View for the services list.
    ServiceListView = Backbone.View.extend({
        initialize: function (options) {
            this.listenToOnce(this.collection, 'reset', this.render);
            this.listenTo(this.collection, 'change:state',
                this.updateServiceState);
            this.listenTo(this.collection, 'service:select',
                this.toggleServiceFocus);
            this.listenTo(options.environment, 'change:state',
                this.toggleEnvironmentState);
            this.listenTo(options.environment, 'logout', this.stopBlinkTimer);

            if (options.environment.get('global')) {
                this.listenTo(options.environment, 'save:success',
                    this.deploySuccess);
            }
        },

        stopBlinkTimer: function () {
            debug('ServiceListView: stop blink timer');

            // Don't renew timer.
            this.pendingUpStates = {};
            this.pendingUpStates.count = 0;

            // Clear UI state.
            this.$('.slot').removeClass('booting blink-on blink-off');
        },

        toggleEnvironmentState: function () {
            if (this.options.isEditor &&
                    this.options.environment.get('state') !== 'on') {
                this.stopBlinkTimer();
            }
        },

        toggleServiceFocus: function (model) {
            // Remove active state of all other slots.
            this.collection.each(function (colmodel) {
                if (colmodel.get('service_id') !== model.get('service_id')) {
                    debug('ServiceListView: clear active state: ' +
                        colmodel.get('service_id') + ' / ' +
                        colmodel.get('nickname'));

                    colmodel.trigger('inactive');
                }
            });
        },

        startBlinkTimer: function () {
            var self = this;

            debug('ServiceListView: start blink timer, pending: ' +
                this.pendingUpStates.count);

            setTimeout(function () {
                var ss,
                    service;

                // Toggle blink state of the still booting services.
                if (self.pendingUpStates.count) {
                    for (ss in self.pendingUpStates) {
                        if (self.pendingUpStates.hasOwnProperty(ss) &&
                                ss !== 'count') {
                            service = self.collection.findWhere({
                                // Remember: JS object properties are string!
                                service_id: Number(ss)
                            });

                            if (!service) {
                                debug('ServiceListView: no service found for ' +
                                    ss);
                            }

                            service.trigger('blink:toggle');
                        }
                    }
                    self.startBlinkTimer();
                }
            }, BLINK_DELAY);
        },

        deploySuccess: function (environmentModel) {
            var self = this,
                numPending;

            if (!this.options.isEditor) {
                this.options.isEditor = true;
                this.pendingUpStates = {};
                this.pendingUpStates.count = 0;
            }

            numPending = this.pendingUpStates.count;

            this.collection.each(function (serviceModel) {
                var rpm = environmentModel.get(serviceModel.get('nickname'));
                if (rpm && rpm !== serviceModel.get('rpm')) {
                    self.pendingUpStates[serviceModel.get('service_id')] = true;
                    self.pendingUpStates.count += 1;
                }
            });

            if (numPending === 0 && this.pendingUpStates.count > 0) {
                this.startBlinkTimer();
            }
        },

        render: function () {
            var self = this;

            if (this.options.isEditor) {
                this.pendingUpStates = {};
                this.pendingUpStates.count = 0;
            }

            this.collection.each(function (model) {
                self.add(model);
            });

            if (this.options.isEditor) {
                this.startBlinkTimer();
            }
        },

        updateServiceState: function (model) {
            var serviceId = model.get('service_id');

            // Check isEditor first as it's likely to be false.
            if (this.options.isEditor &&
                    // This is a delayed callback, so only process if the
                    // environment is still "on".
                    this.options.environment.get('state') === 'on' &&
                    model.get('state') === 'up' &&
                    this.pendingUpStates[serviceId]) {

                debug('ServiceListView: service ' + serviceId + ' / ' +
                    model.get('nickname') + ' up at ' + (new Date()));

                // First time this service came up. Stop blinking it.
                delete this.pendingUpStates[serviceId];
                this.pendingUpStates.count -= 1;

                model.trigger('blink:remove');
            }
        },

        add: function (model) {
            var serviceId = model.get('service_id');

            if (this.options.isEditor) {
                this.pendingUpStates[serviceId] = true;
                this.pendingUpStates.count += 1;
            }

            this.$el.append((new ServiceView({
                model: model,
                isEditor: this.options.isEditor,
                environment: this.options.environment,
                servicesState: this.options.servicesState
            })).render().$el);
        }
    });

    // View for the LCD display.
    DisplayView = Backbone.View.extend({
        selectedServiceId: undefined,

        initialize: function (options) {
            this.$el.resizable({ handles: 's,sw,w' });

            // User can turn an environment on or off. If turned on, listen for
            // the services-state-sync event again.
            this.listenTo(options.environment, 'change:state',
                    this.environmentStateChange);

            // Use display to communicate errors to the user.
            this.listenTo(options.environment, 'error:environmentservices',
                    this.showEnvironmentServicesError);
            this.listenTo(options.services, 'change:state',
                    this.setLaunchButtonState);
            this.listenTo(options.services, 'service:select',
                    this.setSelectedServiceId);
            this.listenTo(options.services, 'service:unselect',
                    this.unsetSelectedServiceId);
            this.listenTo(options.services, 'success:servicedetails',
                    this.displayServiceInfo);
            this.listenTo(options.services, 'abort:servicedetails',
                    this.unsetSelectedServiceId);
            this.listenTo(options.services, 'error:servicedetails',
                    this.showServiceDetailsError);
            this.listenTo(options.environment, 'predestroy',
                    this.destroyEnvironmentStart);
            this.listenTo(options.environment, 'destroy',
                    this.destroyEnvironmentSuccess);
            this.listenTo(options.environment, 'error:destroy',
                    this.destroyEnvironmentError);
            this.addBootOnlyListeners();

            if (options.isEditor) {
                // Monitor environment save events.
                this.listenToOnce(options.environment, 'request',
                        this.saveEnvironmentStart);
                this.listenToOnce(options.environment, 'sync',
                        this.saveEnvironmentSuccess);
                this.listenToOnce(options.environment, 'error',
                        this.saveEnvironmentError);
            } else if (options.environment.get('global')) {
                // The first sync event when the environment model details are
                // retrieved has to be ignored, but after that--for global
                // environments--deploy events should be handled.
                // To avoid anyone outside of DisplayView having a reference
                // to it to indicate that a global environment is now being
                // edited, use a variable so this class can handle it itself.
                this.ignoreRequests = 2;   // Ignore 'request' and 'sync/error'.

                this.listenTo(options.environment, 'request',
                        this.deployEnvironmentStart);
                this.listenTo(options.environment, 'sync',
                        this.deployEnvironmentSuccess);
                this.listenTo(options.environment, 'error',
                        this.deployEnvironmentError);
            }
        },

        addBootOnlyListeners: function () {
            // Services-reset is part of the environment bootstrap and will
            // happen just once.  Update init messaging in display.
            // User can turn environment on or off, so only listen for services
            // event if services are not yet shown.
            if (!this.options.services.length) {
                this.listenToOnce(this.options.services, 'reset',
                    this.initHalfway);
            }

            // Once the services-state is retrieved, the init phase is over and
            // the display should show the environment details.
            this.listenToOnce(this.options.servicesState, 'sync',
                this.initComplete);

            // In case there's an error retrieving services-state, display an
            // error.
            this.listenToOnce(
                this.options.environment,
                'error:environmentservicesstate',
                this.showEnvironmentServicesStateError
            );
        },

        destroyEnvironmentStart: function () {
            var self = this;

            // No guarantee this event handler is called last, so delay.
            setTimeout(function () {
                self.clear();

                // Other handlers turn display off, so turn it back on.
                self.showMessageWhenDisplayIsOn(function () {
                    self.append('[Destroying environment... ');
                });
            }, 0);
        },

        destroyEnvironmentSuccess: function () {
            this.appendToLastLine('OK]');
        },

        destroyEnvironmentError: function (xhr) {
            this.showError(
                'Could not destroy environment: ' + extractErrorMessage(xhr)
            );
        },

        showServiceDetailsError: function (model, xhr) {
            // This callback is delayed, so make sure environment is still "on".
            if (this.options.environment.get('state') === 'on') {
                this.append('[Retrieving service details... ');
                this.showError(
                    'Could not retrieve service details: ' +
                        extractErrorMessage(xhr)
                );
                this.append('(Un-selecting and re-selecting the service may ' +
                    'fix this)');
            }
        },

        showEnvironmentServicesError: function (xhr) {
            // This callback is delayed, so make sure environment is still "on".
            if (this.options.environment.get('state') === 'on') {
                this.showError(
                    'Could not retrieve services: ' + extractErrorMessage(xhr)
                );
                this.append('(Turning the environment off and back on may ' +
                    'fix this)');
            }
        },

        showEnvironmentServicesStateError: function (xhr) {
            // This callback is delayed, so make sure environment is still "on".
            if (this.options.environment.get('state') === 'on') {
                this.showError(
                    'Could not retrieve services state: ' +
                        extractErrorMessage(xhr)
                );
                this.append('(Turning the environment off and back on may ' +
                    'fix this)');
            }
        },

        saveEnvironmentStart: function () {
            // User may to try saving the model again after an error occured,
            // so always clear display.
            this.clear();

            this.showSaveEnvironmentMessage('[Creating environment... ');
        },

        saveEnvironmentSuccess: function () {
            var self = this;

            // Stop listening for errors.
            // (If we don't do this and another error is triggered on the
            // this.options.environment object (e.g. error:environmentservices),
            // this listener would still be called.)
            this.stopListening(this.options.environment, 'error',
                this.saveEnvironmentError);

            this.appendToLastLine('OK]');

            // Give display time to update and the user to read it.
            // Avoid "this" being set to window.
            //setTimeout(this.clear, ENVIRONMENT_ROTATE_DELAY);
            setTimeout(function () {
                // Before starting the rotation, clear whatever text is there.
                self.clear();
            }, ENVIRONMENT_ROTATE_DELAY);
        },

        saveEnvironmentError: function (model, xhr) {
            this.showError(
                'Could not create environment: ' + extractErrorMessage(xhr)
            );
        },

        deployEnvironmentStart: function () {
            var self = this;

            if (this.ignoreRequests > 0) {
                this.ignoreRequests -= 1;
                return;
            }

            // User may to try saving the model again after an error occured,
            // so always clear display.
            this.clear(function () {
                self.append('[Deploying changes... ');
            });
        },

        deployEnvironmentSuccess: function () {
            var self = this;

            if (this.ignoreRequests > 0) {
                this.ignoreRequests -= 1;
                return;
            }

            this.appendToLastLine('OK]');

            // Give display time to update and the user to read it.
            // Avoid "this" being set to window.
            //setTimeout(this.displayEnvironmentInfo, ENVIRONMENT_ROTATE_DELAY);
            setTimeout(function () {
                self.displayEnvironmentInfo();
            }, ENVIRONMENT_ROTATE_DELAY);
        },

        deployEnvironmentError: function (model, xhr) {
            if (this.ignoreRequests > 0) {
                this.ignoreRequests -= 1;
                return;
            }

            this.showError(
                'Could not deploy changes: ' + extractErrorMessage(xhr)
            );
        },

        clear: function (callback) {
            var self = this;

            function helper() {
                debug('DisplayView: clear');

                self.$(DisplayView.displayTags).remove();

                if (callback) {
                    callback();
                }
            }

            if (this.$el.hasClass('on')) {
                // Each tag animates and completes independently, so make sure
                // to call back only once, and only after _all_ animations have
                // completed. Using promise().done() is the ticket here.
                this.$(DisplayView.displayTags).fadeOut('fast').promise().done(
                    helper
                );
            } else {
                helper();
            }
        },

        setLaunchButtonState: function (model) {
            if (this.selectedServiceId === model.get('service_id')) {
                if (model.get('state') === 'up') {
                    this.$('.launch .button').removeAttr('disabled');
                    this.$('.launch .button').off('click');
                } else {
                    this.$('.launch .button').attr('disabled', 'disabled');
                    this.$('.launch .button').on('click', function (event) {
                        if ($(event.target).attr('disabled') === 'disabled') {
                            return false;
                        }
                    });
                }
            }
        },

        setSelectedServiceId: function (model) {
            debug('DisplayView: now selected: ' + model.get('service_id') +
                ' / ' + model.get('nickname'));

            this.selectedServiceId = model.get('service_id');

            // Service details are being retrieved; clear display in
            // preparation of showing results.
            this.clear();
        },

        unsetSelectedServiceId: function (model) {
            debug('DisplayView: now unselected: ' + model.get('service_id') +
                ' / ' + model.get('nickname'));

            // This event also comes in if the user selects A, then B.
            // Make sure that unselect event for A does not clear B selection.
            if (this.selectedServiceId === model.get('service_id')) {
                this.selectedServiceId = undefined;

                // Go back to displaying environment info.
                this.displayEnvironmentInfo();
            }
        },

        // TODO: cache env and service display info
        displayEnvironmentInfo: function () {
            var self = this;

            debug('DisplayView: displayEnvironmentInfo');

            // Now display the environment info in the display.
            this.clear(function () {
                var env = self.options.environment;

                self.appendHeader('Environment Info');
                self.append('Name: ' + env.get('colo_name'));
                if (!RESTRICTED_PRODUCT_ID) {
                    self.append('Product: ' + env.get('product_name'));
                }
                self.append('Branch: ' + env.get('branch_name'));
            });
        },

        // TODO: cache env and service display info
        //       BUT: need to set disabled prop for launch button based 
        //            on service state (only enable if "up")
        displayServiceInfo: function (model) {
            var kk,
                kk2,
                data = model.toJSON(),
                uuid = data.uuid,
                serviceId = data.service_id,
                vip = data.vips[uuid.substring(0, uuid.indexOf('_'))][0],
                html = '';

            debug('DisplayView: displayServiceInfo: show info for ' +
                serviceId + ' / ' + data.nickname);

            // This is a delayed callback, so make sure the button is still the
            // selected button.
            if (this.selectedServiceId !== model.get('service_id')) {
                debug('DisplayView: displayServiceInfo: ignore because ' +
                    'selSvcId === ' + this.selectedServiceId +
                    ' and model.svc_id === ' + serviceId);

                return;
            }

            html += '<h5>' + data.nickname + ' Service Info</h5>';

            // TODO: use template
            html += '<p>';
            if (flashEnabled) {
                html += '<button id="clipboard-' + serviceId + '" data-' +
                    'clipboard-text="' + vip + '">Copy VIP</button>';
            }
            // FF 25 does not select text in disabled field, so use readonly.
            html += 'VIP: <input readonly="readonly" value="' + vip + '">';
            html += '</p>';
            if (!flashEnabled) {
                html += '<p class="vip-instruction">(Use Ctrl-C or Cmd-C to ' +
                    'copy VIP to clipboard)</p>';
            }

            // Remove data not to be displayed or that is
            // already displayed.
            delete data.service_id;
            delete data.service_name;
            delete data.nickname;
            delete data.vip;
            delete data.ip;
            delete data.state;
            delete data.uuid;
            delete data.vips;

            // We were displaying these in demo 0.2, but display got too
            // cluttered so remove for now.
            delete data.vars;
            delete data.props;
            delete data.template;
            delete data.cpu_nr;
            delete data.memory_mb;
            delete data.avg_launch_time;

            for (kk in data) {
                if (data.hasOwnProperty(kk)) {
                    if (data[kk] instanceof Array) {
                        // Cannot include length test in above
                        // test as it'd fall back to the Object
                        // test below (which would succeed for
                        // an Array).
                        if (data[kk].length) {
                            html += '<p>' + (kk === 'rpms' ? 'RPMs' : kk) +
                                ':</p><ul style="margin-top: 0;">';
                            for (kk2 = 0; kk2 < data[kk].length; kk2 += 1) {
                                if (kk === 'rpms') {
                                    // Custom treatment for RPMs.
                                    html += '<li>' + data[kk][kk2].substring(
                                        data[kk][kk2].lastIndexOf('/') + 1
                                    ) + '</li>';
                                } else if (data[kk][kk2].indexOf('http') ===
                                        0) {
                                    html += '<li><a href="' + data[kk][kk2] +
                                        '" target="_blank">' + data[kk][kk2] +
                                        '</a></li>';
                                } else {
                                    html += '<li>' + data[kk][kk2] + '</li>';
                                }
                            }
                            html += '</ul>';
                        }
                    } else if (data[kk] instanceof Object) {
                        html += '<p>' + kk + ':</p><ul style="margin-top: 0;">';
                        for (kk2 in data[kk]) {
                            if (data[kk].hasOwnProperty(kk2)) {
                                if (data[kk][kk2].indexOf('http') === 0) {
                                    html += '<li><a href="' + data[kk][kk2] +
                                        '" target="_blank">' + kk2 +
                                        '</a></li>';
                                } else {
                                    html += '<li>' + kk2 + ': ' +
                                        data[kk][kk2] + '</li>';
                                }
                            }
                        }
                        html += '</ul>';
                    } else {
                        html += '<p>' + kk + ': ' + data[kk] + '</p>';
                    }
                }
            }

            // Show "launch web site" icons for Web and Splunk.
            if (uuid.indexOf('web_') === 0) {
                html += '<p class="launch">' +
                    supplant($('#anchor-link').html(), {
                        href: 'http://' + vip,
                        text: 'Launch Web',
                        classes: 'button'
                    }) +
                    '</p>';
            } else if (uuid.indexOf('splunk_') === 0) {
                html += '<p class="launch">' +
                    supplant($('#anchor-link').html(), {
                        href: 'http://' + vip,
                        text: 'Launch Splunk',
                        classes: 'button'
                    }) +
                    '</p>';
            }

            // Make sure the clear() animations run early at service:select
            // are stopped.
            this.$(DisplayView.displayTags).stop(true, true);

            this.appendHtml(html);

            // Disable launch button if service is down.
            this.setLaunchButtonState(model);

            // Init the Flash button.
            new ZeroClipboard(this.$('#clipboard-' + serviceId));

            // Select the VIP text for easy copy-and-paste.
            this.$('input').focus().select();
        },

        start: function () {
            var self = this;

            debug('DisplayView: initStart');

            // Some display info is shown asynchronously. If the user turns the
            // environment off and then immediately on again, info from a
            // previous AJAX request may come in just as this function is run.
            // Start with a clean slate.
            // TODO: since we only check if state === on, async response could
            //       also come in _after_ this msg is shown! Deal with that too.
            this.clear(function () {
                var str;

                // Only if environment is still on, show init services message.
                if (self.options.environment.get('state') === 'on') {
                    if (self.options.services.length) {
                        // Services already there; proceed to services state.
                        str = '[Initializing services state... ';
                    } else {
                        str = '[Initializing services... ';
                    }

                    self.once('display:on', function () {
                        debug('DisplayView: show boot text');

                        self.append(self.$el.data('boot-text'));
                        self.append(str);
                    });

                    self.turnOn();
                }
            });
        },

        initHalfway: function () {
            debug('DisplayView: initHalfway');

            // This callback is delayed, so make sure environment is still "on".
            if (this.options.environment.get('state') === 'on') {
                this.appendToLastLine('OK]');
                this.append('[Initializing services state... ');
            }
        },

        initComplete: function () {
            debug('DisplayView: initComplete');

            // Stop listening to error cases.
            this.stopListening(
                this.options.environment,
                'error:environmentservicesstate',
                this.showEnvironmentServicesStateError
            );

            // This callback is delayed, so make sure environment is still "on".
            if (this.options.environment.get('state') === 'on') {
                this.appendToLastLine('OK]');
                this.displayEnvironmentInfo();
            }
        },

        environmentStateChange: function () {
            // Clear previous messaging, if any.
            this.clear();

            if (this.options.environment.get('state') === 'on') {
                // Show init message.
                this.start();
            } else {
                this.turnOff();

                // Bring listener state back to how it was after initialize().
                this.addBootOnlyListeners();
            }
        },

        showMessageWhenDisplayIsOn: function (callback) {
            if (this.$el.hasClass('on')) {
                callback();
            } else {
                this.once('display:on', callback);
                this.turnOn(true);
            }
        },

        showSaveEnvironmentMessage: function (str) {
            var self = this;

            this.showMessageWhenDisplayIsOn(function () {
                // This method is used to display the "Creating environment"
                // message. Since there is an animation here, make sure this
                // message is not shown if environment creation is fast.
                // (So only show if the environment has no ID still.)
                if (self.options.environment.get('colo_id') === undefined) {
                    self.append(str);
                }
            });
        },

        showError: function (str) {
            var self = this;

            this.showMessageWhenDisplayIsOn(function () {
                self.appendToLastLine('ERROR]');
                self.append(str);
            });
        },

        turnOn: function (fast) {
            var self = this;

            if (this.$el.hasClass('on')) {
                debug('DisplayView: turnOn: already on');

                this.trigger('display:on');
            } else {
                debug('DisplayView: turnOn: animate');

                // "Turn on" effect.
                this.$el.animate(
                    { 'background-color': '#00c' },
                    fast ? 'fast' : 'slow',
                    function () {
                        // User could have turned environment off again, so
                        // check that display is still off before turning it on.
                        if (!self.$el.hasClass('on')) {
                            self.$el.toggleClass('off on');
                            self.trigger('display:on');

                            // Undo overridden animation property.
                            self.$el.css('background-color', '');
                        }
                    }
                );
            }
        },

        turnOff: function () {
            this.$el.toggleClass('off on');
            this.clear();
        },

        append: function (str) {
            this.$el.append('<p>' + str + '</p>');
        },

        appendToLastLine: function (str) {
            this.$('p:last-child').text(this.$('p:last-child').text() + str);
        },

        appendHeader: function (str) {
            this.$el.append('<h5>' + str + '</h5>');
        },

        appendHtml: function (str) {
            debug('DisplayView: appendHtml');

            this.$el.append(str);
        }
    }, {
        // Class variables.

        // Tags used in the display; handy for text fadeOut.
        displayTags: 'p, ul, h5'
    });

    // View for an existing environment (non-editor).
    EnvironmentView = Backbone.View.extend({
        tagName: 'li',
        className: 'environment',
        timerId: undefined,
        isBusy: false,

        events: function () {
            return $.extend(
                FormValidationMixin.events,
                {
                    'click .edit': 'editEnvironment',
                    'click .switch .hole': 'togglePower',
                    'click': 'resetSafety',
                    'click .safety:not(.safe)': 'removeSafety',
                    'click .destroy': 'destroyModel',

                    // Editor events.
                    'presubmit': 'processBeforeSave',
                    'click .promote': 'promote',
                    'click .edit-rpms': 'editRpms',
                    'click .cancel': 'cancel'
                }
            );
        },

        initialize: function () {
            this.listenTo(this.model, 'change:state', this.toggleState);
            this.listenTo(this.model, 'destroy', this.destroyView);
            this.listenTo(this.model, 'logout', this.remove);

            // Editor shows product/branch selector.
            // TODO: only add this when in new/edit mode, otherwise all envs
            //       do toggleBusy whenever product/branch changes.
            this.listenTo(EnvironmentModel.branches, 'request sync',
                    this.toggleBusy);

            if (this.model.get('state') === 'new') {
                // There are two model sync events as a result of saving a new
                // environment: one on model.save, and the other on model.fetch.
                // We're only interested in the first one here, so listen once.
                this.listenToOnce(this.model, 'sync', this.modelSaveSuccess);
            } else if (this.model.get('global')) {
                this.listenToOnce(this.model.services, 'reset',
                    this.enableEdit);
            }
        },

        // This function required by FormValidationMixin.
        headers: function () {
            return headers('COLO');
        },

        toggleBusy: function () {
            this.$el.css('cursor', this.isBusy ? 'default' : 'wait');
            this.isBusy = !this.isBusy;
        },

        enableEdit: function () {
            var username = window.localStorage.tef_user;

            if (jQuery.inArray(username.toLowerCase(), DEPLOY_MASTERS) !== -1) {
                this.$('.edit').removeAttr('disabled');
            }
        },

        render: function () {
            var kk,
                promotable = false;

            // Our supplant function requires all variables to be present.
            // If a colo supports promotion, the right value is set later on.
            this.model.set('promotable_from_colo_name', '');

            if (this.options.promoteFromModel) {
                promotable = true;
                this.model.set('promotable_from_colo_name',
                    this.options.promoteFromModel.get('colo_name'));
            }

            this.$el.html(supplant($('#environment-entry').html(),
                    this.model.toJSON()));

            this.$el.addClass(this.model.get('state'));
            if (this.model.get('global')) {
                this.$el.addClass('global');
            }
            if (promotable) {
                this.$el.addClass('promotable');
            }

            // The ID is needed for sortable to determine the new env ordering.
            this.$el.data('id', this.model.get('colo_id'));

            // Create sub-views.
            this.displayView = new DisplayView({
                el: this.$('.display'),
                isEditor: this.$el.hasClass('new'),
                services: this.model.services,
                servicesState: this.model.servicesState,
                environment: this.model
            });
            this.serviceListView = new ServiceListView({
                el: this.$('.service-list'),
                isEditor: this.$el.hasClass('new'),
                collection: this.model.services,
                servicesState: this.model.servicesState,
                environment: this.model
            });

            if (RESTRICTED_PRODUCT_ID) {
                this.$el.addClass('restricted-product');
            } else {
                new ProductSelectorView({
                    el: this.$('select[name="product_id"]'),
                    collection: EnvironmentModel.products
                });

                // Hiding options does not seem to work... since they're not
                // needed, just remove 'em.
                //this.$('select[name="branch_id"] ' +
                //        'option[data-product-id]').hide();
                this.$('select[name="branch_id"] ' +
                        'option[data-product-id]').remove();
            }

            if (this.model.get('state') === 'new') {
                new BranchSelectorView({
                    el: this.$('select[name="branch_id"]'),
                    collection: EnvironmentModel.branches
                });
            } else if (this.model.get('global')) {
                this.buildsSelectorView = new ProductBuildsSelectorView({
                    el: this.$('.global-details-editor tbody'),
                    model: this.model.builds,
                    services: this.model.services
                });
            }

            return this;   // Allow method chaining.
        },

        editEnvironment: function (event) {
            event.stopPropagation();   // Don't inform other listeners.
            event.preventDefault();

            if (EnvironmentListView.focusExistingEditor()) {
                return;
            }

            this.buildsSelectorView.render();

            this.changeToEditor();
        },

        resetSafety: function () {
            var outer = this.$('.safety');

            if (outer.hasClass('safe')) {
                outer.find(
                    '.border'
                ).animate({ 'bottom': '0' }, 'fast', function () {
                    outer.find('button').attr('disabled', 'disabled');
                    outer.removeClass('safe');
                });
            }
        },

        removeSafety: function (event) {
            var outer = this.$('.safety');

            event.stopPropagation();   // Don't inform other listeners.

            if (!this.$el.hasClass('predestroy')) {
                outer.find('button').removeAttr('disabled');
            }

            outer.find(
                '.border'
            ).animate({ 'bottom': '50px' }, 'fast', function () {
                outer.addClass('safe');
            });
        },

        destroyModel: function (event) {
            var button = $(event.target),
                self = this;

            event.stopPropagation();   // Don't inform other listeners.

            button.attr('disabled', 'disabled');

            // Don't allow environment state to be toggled at this point.
            this.$el.addClass('predestroy');

            this.model.trigger('predestroy');

            this.model.destroy({
                headers: headers('COLO'),

                // Need to keep the view around (for possibly displaying any
                // errors), so don't remove the model from the collection yet.
                wait: true,

                error: function (model, xhr) {
                    button.removeAttr('disabled');
                    self.$el.removeClass('predestroy');

                    // Inform the user about the error.
                    // Note that the syntax for Backbone's trigger() is
                    // different than jQuery's syntax: Backbone does not
                    // pass arguments as an array.
                    //model.trigger('error:destroy', arguments);
                    model.trigger('error:destroy', xhr);
                }
            });
        },

        destroyView: function () {
            var self = this;

            this.$el.slideUp('slow', function () {
                self.$el.remove();
            });
        },

        start: function () {
            var self = this;

            debug('EnvironmentView: start');

            if (this.model.get('state') === 'on') {
                // Wait for display animation to finish before starting model.
                this.listenToOnce(this.displayView, 'display:on', function () {
                    self.model.start();
                });
                this.displayView.start();
            } else {
                // Regardless of state, always fetch/display the services list.
                this.model.start();
            }
        },

        togglePower: function () {
            var currentState = this.model.get('state');

            this.model.save('state', currentState === 'on' ? 'off' : 'on', {
                error: function (model, xhr) {
                    // Restore old state value.
                    model.set('state', model.previous('state'));

                    // Show error.
                    model.trigger('error:unexpected', xhr);
                }
            });
        },

        toggleState: function () {
            var wasOff = this.model.previous('state') !== 'on',
                self = this;

            debug('EnvironmentView: toggleState');

            function postTimeoutOps() {
                if (wasOff) {
                    self.$el.removeClass('test');
                } else {
                    self.$el.removeClass('shutdown');
                }
                self.timerId = undefined;
            }

            // Clear old state.
            if (this.timerId) {
                clearTimeout(this.timerId);
                postTimeoutOps();
            }

            // Show new state (with a small "test" boot-up effect).
            this.$el.removeClass('on off').addClass(this.model.get('state'));
            if (wasOff) {
                this.$el.addClass('test');
                this.timerId = setTimeout(postTimeoutOps,
                    // Take into account the rotation effect for new
                    // environments. The test phase should be active for 1000ms
                    // but about 500ms is spent in the rotation effect before
                    // the state is set to "on".
                    this.$el.hasClass('rotate') ? 1500 : 1000);
            } else {
                this.$el.removeClass('test').addClass('shutdown');
                this.timerId = setTimeout(postTimeoutOps, 100);
            }
        },

        changeToEditor: function (skipPromotionChoice) {
            var self = this;

            this.$el.addClass('rotate');   // Rotates to 90deg.
            setTimeout(function () {
                // UI is now hidden (a thin stripe at most).  Do the switch.
                self.$el.addClass('edit');   // Switch to editor UI.
                if (RESTRICTED_PRODUCT_ID) {
                    self.$el.addClass('restricted-product');
                }
                if (skipPromotionChoice) {
                    self.$('.global-edit-choices').hide();
                    self.$('.global-details-editor').show();
                }

                // Continue with rotation. First up, cancel rotation transition.
                self.$el.addClass('rotate-cancel-transition');
                // Next, flip UI to prevent it from appearing upside-down.
                self.$el.addClass('rotate-flip');
                // The tail end of the animation will still be visible if we
                // don't delay the next line.
                setTimeout(function () {
                    // Put back transition.
                    self.$el.removeClass('rotate-cancel-transition');
                    // The UI will spin around its axel if we don't delay the
                    // next line.
                    setTimeout(function () {
                        // Rotate the rest of the way with transition.
                        self.$el.addClass('rotate-more');
                        // Wait for the animation to finish.
                        setTimeout(function () {
                            // Carefully remove the rotation classes.
                            // Cancel rotation transition.
                            self.$el.addClass('rotate-cancel-transition');
                            setTimeout(function () {
                                self.$el.removeClass('rotate rotate-flip ' +
                                        'rotate-more');
                                setTimeout(function () {
                                    self.$el.removeClass(
                                        'rotate-cancel-transition'
                                    );
                                }, 50);   // If delay is 0, FF sometimes still
                                          // shows the rotation.
                            }, 0);
                        }, 250);   // Same as transform duration set in CSS.
                    }, 0);
                }, 50);   // If this is 0, FF sometimes still shows the
                          // rotation...
            }, 250);   // Same as transform duration set in CSS.
        },

        changeToNonEditor: function (turnOn) {
            var self = this;

            this.$el.addClass('rotate');   // Rotates to 90deg.
            setTimeout(function () {
                // UI is now hidden (a thin stripe at most).  Do the switch.
                self.$el.removeClass('new edit');   // Switch to non-editor UI.
                self.$('form').css('display', '');

                // Continue with rotation. First up, cancel rotation transition.
                self.$el.addClass('rotate-cancel-transition');
                // Next, flip UI to prevent it from appearing upside-down.
                self.$el.addClass('rotate-flip');
                // The tail end of the animation will still be visible if we
                // don't delay the next line.
                setTimeout(function () {
                    // Put back transition.
                    self.$el.removeClass('rotate-cancel-transition');
                    // The UI will spin around its axel if we don't delay the
                    // next line.
                    setTimeout(function () {
                        // Rotate the rest of the way with transition.
                        self.$el.addClass('rotate-more');
                        // Wait for the animation to finish.
                        setTimeout(function () {
                            // Now the environment is ready to be turned on.
                            if (turnOn) {
                                self.model.set('state', 'on');
                            }

                            // Carefully remove the rotation classes.
                            // Cancel rotation transition.
                            self.$el.addClass('rotate-cancel-transition');
                            setTimeout(function () {
                                self.$el.removeClass('rotate rotate-flip ' +
                                        'rotate-more restricted-product');
                                setTimeout(function () {
                                    self.$el.removeClass(
                                        'rotate-cancel-transition'
                                    );
                                }, 50);   // If delay is 0, FF sometimes still
                                          // shows the rotation.
                            }, 0);
                        }, 250);   // Same as transform duration set in CSS.
                    }, 0);
                }, 50);   // If this is 0, FF sometimes still shows the
                          // rotation...
            }, 250);   // Same as transform duration set in CSS.
        },

        processBeforeSave: function () {
            if (this.model.get('state') === 'new') {
                // Add data points needed for display purposes.

                if (!RESTRICTED_PRODUCT_ID) {
                    this.model.set(
                        'product_name',
                        EnvironmentModel.products.findWhere({
                            product_id: this.model.get('product_id')
                        }).get('product_name')
                    );
                }

                this.model.set(
                    'branch_name',
                    EnvironmentModel.branches.findWhere({
                        branch_id: this.model.get('branch_id')
                    }).get('branch_name')
                );
            } else if (this.model.get('global')) {
                // Results of the deploy call will be shown in the display.
                this.changeToNonEditor();
            }
        },

        modelSaveSuccess: function () {
            var self = this;

            // Fill in info that wasn't there at view rendering time.
            this.$el.data('id', this.model.get('colo_id'));
            this.$('.name').text(this.model.get('colo_name'));

            // Re-render this view as non-editor.
            // DisplayView is also processing this event, showing a message to
            // the user. Give display time to update and the user to read it.
            setTimeout(function () {
                self.changeToNonEditor(true);
            }, ENVIRONMENT_ROTATE_DELAY);
        },

        promote: function (event) {
            var self = this;

            event.preventDefault();   // Do not submit the form.

            // Now lock the source model's RPM versions in the select boxes.
            this.options.promoteFromModel.services.each(function (model) {
                var nickname = model.get('nickname'),
                    rpm = model.get('rpm'),
                    select = self.$('select[name="' + nickname + '"]');

                select.val(rpm);
                select.trigger('change');
                select.attr('disabled', 'disabled');
            });

            this.changeToEditor(true);
        },

        editRpms: function (event) {
            event.preventDefault();   // Do not submit the form.

            this.changeToEditor(true);
        },

        cancel: function (event) {
            var self = this;

            event.preventDefault();   // Do not submit the form.

            if (this.model.get('state') === 'new') {
                this.$el.slideUp('slow', function () {
                    self.$el.remove();

                    // Because the model is still "new", destroying the model
                    // will remove it from the collection but no AJAX request
                    // is made.
                    self.model.destroy();
                });
            } else {
                this.changeToNonEditor();
            }
        }
    });
    // Add form validation support.
    FormValidationMixin.call(EnvironmentView.prototype);

    // View for the product selector.
    ProductSelectorView = Backbone.View.extend({
        initialize: function () {
            // TODO: if we ever have a singleton environment editor, rendering
            //       could be done just once.
            //this.listenToOnce(this.collection, 'reset', this.render);
            this.render();
        },

        render: function () {
            var self = this;

            this.collection.each(function (product) {
                self.$el.append(supplant($('#select-option').html(), {
                    name: product.get('product_name') + ': ' +
                            product.get('descr'),
                    value: product.get('product_id')
                }));
            });
        }
    });

    // View for the branch selector.
    BranchSelectorView = Backbone.View.extend({
        initialize: function () {
            if (RESTRICTED_PRODUCT_ID) {
                // No events coming, so just render the UI.
                this.render();
            } else {
                this.listenTo(this.collection, 'reset', this.render);
            }
        },

        render: function () {
            var ii, bb, oldBranches, self = this;

            oldBranches = this.$('option');
            for (ii = RESTRICTED_PRODUCT_ID ? 0 : 1; ii < oldBranches.length;
                    ii += 1) {
                bb = $(oldBranches.get(ii));

                if (!RESTRICTED_PRODUCT_ID ||
                        bb.data('product-id') === undefined) {
                    bb.remove();
                }
            }

            this.collection.each(function (branch) {
                self.$el.append(supplant($('#select-option').html(), {
                    name: branch.get('branch_name'),
                    value: branch.get('branch_id')
                }));
            });

            if (this.collection.length) {
                this.$el.removeAttr('disabled');
            } else {
                this.$el.attr('disabled', 'disabled');
            }
        }
    });

    // View for the product builds selector.
    ProductBuildsSelectorView = Backbone.View.extend({
        events: {
            'change select': 'markChangedRows'
        },

        initialize: function () {
            // Both builds and services must be present for this view to work.
            this.gotBuilds = false;
            this.gotServices = false;
            this.listenToOnce(this.model, 'sync', this.setGotBuilds);
            this.listenToOnce(this.options.services, 'reset',
                this.setGotServices);
        },

        setGotBuilds: function () {
            this.gotBuilds = true;
            this.render();
        },

        setGotServices: function () {
            this.gotServices = true;
            this.render();
        },

        render: function () {
            var self = this;

            if (!this.gotBuilds || !this.gotServices) {
                return;
            }

            this.$el.empty();

            $.each(this.model.keys(), function (index, nickname) {
                var currentBuild,
                    txt = '';

                currentBuild = self.options.services.findWhere({
                    nickname: nickname
                }).get('rpm');

                $.each(self.model.get(nickname), function (index, build) {
                    // TODO: use template
                    txt += '<option value="' + build + '" ' +
                        (build === currentBuild ? 'selected="selected"' : '') +
                        '>' + build + '</option>';
                });

                // TODO: use template
                self.$el.append('<tr><td>' + nickname + '</td><td>' +
                        (currentBuild || '&mdash;') +
                        '</td><td><select name="' + nickname + '">' + txt +
                        '</select></td></tr>');
            });
        },

        markChangedRows: function (event) {
            var select = $(event.target),
                rowEl = select.closest('tr');

            rowEl.toggleClass(
                'changed',
                select.val() !== rowEl.find('td:nth-child(2)').text()
            );
        }
    });

    // View for the environment list.
    EnvironmentListView = Backbone.View.extend({
        glowing: false,

        events: {
            'sortupdate': 'saveEnvironmentOrder'   // User changes env order.
        },

        initialize: function () {
            this.$el.css('cursor', 'wait');

            this.$el.sortable({
                handle: '.handle',
                axis: 'y'
                // Note: any combination of axis and container:parent does not
                // prevent the drag from continuing beyond the ul border. 
                // This allows the document height to change unnecessarily.
            });

            // Support users sharing same computers, where the environment
            // collection will be reset on the second login (without a page
            // reload), so don't listen just once.
            this.listenTo(this.collection, 'reset', this.render);

            this.listenTo(this.collection, 'add', this.add);

            // TODO: sync is also fired for model.fetch... not what we want
            //       start listening after details for all envs are fetched
            //       to prevent needlessly saving the env order a few times.
            this.listenTo(this.collection, 'sync destroy',
                this.saveEnvironmentOrder);   // User added/removed an env.

            this.listenTo(this.collection, 'destroy error:destroy',
                this.checkEnvironmentCount);
            this.listenTo(this.collection, 'error:colos', this.fetchError);
            this.listenTo(this.collection, 'error:unexpected',
                this.unexpectedError);

            // This view is not re-created when the user logs out and back in.
            // Make sure to listen to the "logout" event more than once.
            this.listenTo(this.collection, 'logout', this.clearMessages);
            this.listenTo(this.collection, 'error:logout', this.logoutError);
        },

        // Determine new display order based on the order in the view.
        saveEnvironmentOrder: function (modelOrCollection) {
            var self = this;

            // Only care about a new environment being saved, not about the
            // environment collection being fetched.
            // TODO: remove this once TODO about sync event above is addressed.
            if (modelOrCollection instanceof Backbone.Collection) {
                return;
            }

            // If we come here as a result of a new environment save, make sure
            // that the environment view gets updated before the new ordering
            // is determined. Since we cannot know if we're the last one being
            // notified, delay our processing here.
            setTimeout(function () {
                var str = '';

                self.$('.environment').each(function () {
                    var id = $(this).data('id');

                    // Skip new environment editor, if any.
                    if (id) {
                        if (str) {
                            str += ',';
                        }
                        str += id;
                    }
                });

                debug('EnvironmentListView: save new env order: ' + str);

                window.localStorage.tef_colo_display_order = str;
            }, 0);
        },

        startNewEnvironmentButtonGlow: function (delay) {
            var self = this,
                glowTimerId,
                button = $('#newEnvironment'),   // TODO: should be child elt
                                                 //       of this.$el!!
                step = 0,
                minValue = -10,
                maxValue = 6,
                maxSteps = 9;

            // Start glow immediately; subsequent glows use larger delay.
            delay = delay || 500;
            this.glowing = true;

            setTimeout(function () {
                // Increase glow.
                glowTimerId = setInterval(function () {
                    step += 1;

                    button.css(
                        'box-shadow',
                        '0px 0px 40px ' + (minValue + (step - 1) *
                            (maxValue - minValue) / (maxSteps - 1)) +
                            'px #fff'
                    );

                    if (!self.glowing || step === (maxSteps - 1)) {
                        clearInterval(glowTimerId);

                        // Decrease glow.
                        glowTimerId = setInterval(function () {
                            step -= 1;

                            button.css(
                                'box-shadow',
                                '0px 0px 40px ' + (minValue + (step - 1) *
                                    (maxValue - minValue) / (maxSteps - 1)) +
                                    'px #fff'
                            );

                            if (!self.glowing || step === 0) {
                                clearInterval(glowTimerId);

                                button.css('box-shadow', '');

                                if (self.glowing) {
                                    self.startNewEnvironmentButtonGlow(3000);
                                }
                            }
                        }, 100);
                    }
                }, 100);
            }, delay);
        },

        stopNewEnvironmentButtonGlow: function () {
            this.glowing = false;
        },

        clearMessages: function () {
            this.stopNewEnvironmentButtonGlow();
            this.$('.fetch-environment-error').remove();
            this.$('.logout-error').remove();
            this.$('.unexpected-error').remove();
        },

        checkEnvironmentCount: function () {
            // Show instructions if the user does not have any environments yet.
            if (this.collection.length) {
                this.stopNewEnvironmentButtonGlow();
            } else {
                this.startNewEnvironmentButtonGlow();
            }
        },

        render: function () {
            var self = this;

            this.collection.each(function (model) {
                self.add(model);
            });

            this.checkEnvironmentCount();

            this.$el.css('cursor', 'default');
        },

        add: function (model) {
            var environmentView,
                environmentViewEl,
                promoteFromId,
                promoteFromModel,
                nn;

            this.checkEnvironmentCount();

            if (model.get('global')) {
                // Find promote-from model, if any.
                for (nn in COLO_PROMOTIONS) {
                    if (COLO_PROMOTIONS.hasOwnProperty(nn) &&
                            COLO_PROMOTIONS[nn] === model.get('colo_id')) {
                        promoteFromId = Number(nn);
                        break;
                    }
                }

                promoteFromModel = this.collection.findWhere({
                    colo_id: promoteFromId
                });
            }

            environmentView = new EnvironmentView({
                model: model,
                promoteFromModel: promoteFromModel
            });
            environmentViewEl = environmentView.render().$el;

            // Note: .environment's display:none was removed to make sortable()
            // work, but the effects below need it to be hidden.
            environmentViewEl.css('display', 'none');

            // Make sure new environment editor is added at the top.
            if (model.get('state') === 'new') {
                this.$el.prepend(environmentViewEl);

                environmentViewEl.slideDown();
                // Nothing to retrieve for new envs yet, so don't call start().
            } else {
                this.$el.append(environmentViewEl);

                environmentViewEl.fadeIn('slow', function () {
                    // Regardless of the on/off state, the services always need
                    // to be retrieved and displayed, so always call start().
                    environmentView.start();
                });
            }
        },

        fetchError: function (xhr) {
            this.$el.append(supplant($('#fetch-environments-error').html(), {
                msg: extractErrorMessage(xhr)
            }));

            this.$el.css('cursor', 'default');

            this.checkEnvironmentCount();
        },

        unexpectedError: function (xhr) {
            this.$el.append(supplant($('#unexpected-error').html(), {
                msg: extractErrorMessage(xhr)
            }));

            this.$el.css('cursor', 'default');
        },

        logoutError: function (xhr) {
            this.$el.append(supplant($('#logout-error').html(), {
                msg: extractErrorMessage(xhr)
            }));
        },

        filter: function (str) {
            // Note: this is not done via a "filter" yes/no model property, as
            // a model should not be polluted with non-server-persisted data.
            str = str.toUpperCase();

            this.$('.environment').each(function () {
                var name = $(this).find('.name').text().toUpperCase(),
                    product = $(this).find('.product').text().toUpperCase(),
                    branch = $(this).find('.branch').text().toUpperCase();

                if (name.indexOf(str) >= 0 ||
                        product.indexOf(str) >= 0 ||
                        branch.indexOf(str) >= 0) {
                    $(this).show();
                } else {
                    $(this).hide();
                }
            });
        }
    }, {
        // Class variables.

        focusExistingEditor: function () {
            // Since the collection of products and branches is shared between
            // all editor models, only one editor can be open at a time.
            // (Otherwise changing product in one editor would refresh the
            // branch options in all editors, but would not change the product
            // selection in other editors (so those editors would display the
            // wrong branches for the selected product).)
            //
            // As the user may have moved the editor down via drag-and-drop,
            // scroll to it to bring it in view.
            var result = false,
                editorEl = $('.environment.new, .environment.edit');

            if (editorEl.length) {
                result = true;

                $('html, body').animate({
                    scrollTop: editorEl.offset().top
                }, 'slow');
            }

            return result;
        }
    });


    // View for the single-page app.
    AppView = Backbone.View.extend({
        loadingTimerId: undefined,

        events: {
            'click #newEnvironment': 'newEnvironment',

            'keyup #filterEnvironments': 'filterEnvironments'
        },

        initialize: function () {
            var sessionModel = new SessionModel(),
                ii;

            // Make sure deploy master names are lowercase.
            for (ii = 0; ii < DEPLOY_MASTERS.length; ii += 1) {
                DEPLOY_MASTERS[ii] = DEPLOY_MASTERS[ii].toLowerCase();
            }

            // Since keys are integers, populate the colo promotions hash now.
            COLO_PROMOTIONS[DEV_ID] = QA_ID;
            COLO_PROMOTIONS[QA_ID] = STAGE_ID;

            this.environments = new EnvironmentCollection();

            // Create sub-views.
            this.environmentListView = new EnvironmentListView({
                el: this.$('.environment-list'),
                collection: this.environments
            });
            this.sessionView = new SessionView({
                el: this.$('#session'),
                model: sessionModel
            });

            this.listenTo(sessionModel, 'login:success', this.loggedin);
            this.listenTo(sessionModel, 'login:expired',
                this.addLoggedOutClass);
            this.listenTo(sessionModel, 'login:nosession',
                this.addLoggedOutClass);
            this.listenTo(sessionModel, 'login:other',
                this.showUnexpectedLoginError);

            this.listenTo(sessionModel, 'logout:prelogout', this.prelogout);
            this.listenTo(sessionModel, 'logout:success', this.logout);
            this.listenTo(sessionModel, 'logout:error', this.showLogoutError);

            // Bringing up the new environment editor will also trigger an "add"
            // event, but it does not affect the environment usage count yet,
            // so don't listen for it...
            this.listenTo(this.environments, 'remove', this.updateUsageMeter);
            // ...instead, count the new environment only when its state changes
            // from "new" to "on".
            this.listenTo(this.environments, 'change:state',
                this.updateUsageMeterIfModelStateChangedFromNew);

            this.addBootOnlyListeners();

            this.checkFilter();
            this.checkFlash();
            this.checkModernBrowser();

            this.setEmptyUsageMeter();
            this.updateCopyrightYear();   // In case the HTML is not updated.
        },

        addBootOnlyListeners: function () {
            this.listenToOnce(this.environments, 'sync', this.updateUsageMeter);
        },

        checkFlash: function () {
            var clip;

            ZeroClipboard.config({
                moviePath: 'js/ZeroClipboard-' + ZeroClipboard.version + '.swf',
                activeClass: 'active',

                // Allow .swf to be cached as the name contains the version.
                useNoCache: false
            });

            // Load a clip to determine browser Flash support.
            // (The "load" event seems to fire only once, no matter how many
            // instances of ZeroClipboard are created. If it fired every time,
            // this logic could have been moved to where ZeroClipboard is used.)
            clip = new ZeroClipboard();
            clip.on('load', function () {
                // Browser has a supported Flash version installed.
                flashEnabled = true;
            });
            clip.on('noflash wrongflash', function () {
                // Browser has no Flash at all or the wrong version.
                flashEnabled = false;
            });
        },

        checkFilter: function () {
            // Reloading the page does not always clear previous data.
            this.$('#filterEnvironments').val('');

            if (!SHOW_FILTER_CONTROL) {
                this.$('#filterEnvironments').hide();
            }
        },

        // http://net.tutsplus.com/tutorials/html-css-techniques/quick-tip-detect-css-support-in-browsers-with-javascript/
        checkModernBrowser: function () {
            var test = document.createElement('div'),
                browserPrefixes = ['', '-khtml-', '-moz-', '-ms-', '-o-',
                    '-webkit-'],
                supportsTransform = false,
                supportsLinearGradient = false,
                ii;

            // Check for transform support.
            for (ii = 0; ii < browserPrefixes.length; ii += 1) {
                test.style[browserPrefixes[ii] + 'transform'] = 'rotate(90deg)';
                if (test.style[browserPrefixes[ii] + 'transform'] &&
                        test.style[browserPrefixes[ii] +
                            'transform'].indexOf('rotate') >= 0) {
                    supportsTransform = true;
                    break;
                }
            }

            // Check for linear-gradient background support.
            for (ii = 0; ii < browserPrefixes.length; ii += 1) {
                if (ii === 0) {
                    test.style.background = browserPrefixes[ii] +
                            'linear-gradient(to right, #000, #333)';
                } else {
                    test.style.background = browserPrefixes[ii] +
                            'linear-gradient(left, #000, #333)';
                }
                if (test.style.background &&
                        test.style.background.indexOf('linear-gradient') >= 0) {
                    supportsLinearGradient = true;
                    break;
                }
            }

            if (!window.localStorage ||
                    !supportsTransform || !supportsLinearGradient) {
                this.$('#outdated').show();
            }

            // To avoid JS errors later, make sure localStorage exists.
            // Avoid: TypeError: setting a property that has only a getter
            //window.localStorage = window.localStorage || {};
            if (!window.localStorage) {
                window.localStorage = {};
            }
        },

        updateCopyrightYear: function () {
            this.$('footer span').text((new Date()).getFullYear());
        },

        bootstrapProducts: function (success, error) {
            EnvironmentModel.bootstrap(success, error);
        },

        bootstrap: function (skipProducts) {
            var self = this;

            // Apply username.
            // (Must be in bootstrap rather than SessionView as this needs to
            // be filled out even if user does not come in via session form.)
            this.sessionView.showUsername();

            debug('AppView: fetch environments');

            this.environments.fetch({
                headers: headers('COLO'),
                reset: true,
                error: function (collection, xhr) {
                    // Differentiate this error from other collection/model
                    // errors by using a custom event.
                    collection.trigger('error:colos', xhr);
                }
            });

            if (!skipProducts) {
                this.bootstrapProducts(function () {
                    // New environments can be created now.
                    self.enableNewEnvironmentButton();
                }, function (model, response) {
                    // Show error message.
                    self.environments.trigger('error:unexpected', response);
                });
            }
        },

        start: function () {
            var self = this;

            debug('AppView: start');

            this.sessionView.checkAuthToken(this.bootstrapProducts);

            // If making initial request is slow, let user know what's going on.
            this.loadingTimerId = setTimeout(function () {
                if (!self.$el.hasClass('loggedin') &&
                        !self.$el.hasClass('loggedout')) {
                    self.$('#init').show();
                }
            }, 1500);
        },

        addLoggedOutClass: function () {
            this.$el.addClass('loggedout');
        },

        showUnexpectedLoginError: function (response) {
            // Show error message.
            this.environments.trigger('error:unexpected', response);

            // Not a token issue, so show logged-in UI.
            this.$el.addClass('loggedin');
        },

        loggedin: function () {
            var self = this,
                animations,
                animationCount = 0,
                fromLoginForm = this.sessionView.isLoginFormVisible();

            function done() {
                self.bootstrap(!fromLoginForm);
            }

            function checkAnimationComplete() {
                animationCount += 1;
                if (animationCount === animations.length) {
                    self.$el.toggleClass('loggedout loggedin');

                    // Undo side-effects of custom animations below.
                    $.each(animations, function (index, anim) {
                        anim.cleanup();
                    });

                    done();
                }
            }

            // Hide init message, if shown.
            clearTimeout(this.loadingTimerId);
            this.$('#init').hide();

            if (fromLoginForm) {
                // Not all styles can be animated with switchClass, so to
                // streamline the transition, some custom animations are needed.
                //this.$el.switchClass('loggedout', 'loggedin', done);
                animations = [{
                    start: function () {
                        self.sessionView.$el.fadeOut('fast',
                            checkAnimationComplete);
                    },
                    cleanup: function () {
                        self.sessionView.$el.css('display', '');
                    }
                }, {
                    start: function () {
                        self.$('footer').fadeOut('fast',
                            checkAnimationComplete);
                    },
                    cleanup: function () {
                        self.$('footer').css('display', '');
                    }
                }, {
                    start: function () {
                        self.$('header').animate({ width: '100%' }, 'slow',
                            checkAnimationComplete);
                    },
                    cleanup: function () {
                        self.$('header').css('width', '');
                    }
                }, {
                    start: function () {
                        self.$el.animate({ 'background-color': '#000' }, 'slow',
                            checkAnimationComplete);
                    },
                    cleanup: function () {
                        self.$el.css('background-color', '');
                    }
                }];
                $.each(animations, function (index, anim) {
                    anim.start();
                });
            } else {
                // Successfully retrieved products already, so new environments
                // can be created.
                this.enableNewEnvironmentButton();

                this.$el.switchClass('loggedout', 'loggedin', done);
            }
        },

        setEmptyUsageMeter: function () {
            this.$('meter').replaceWith(
                supplant($('#empty-usage-meter').html())
            );
        },

        updateUsageMeter: function () {
            var max = window.localStorage.tef_max_colos,
                total = this.environments.length,
                global = this.environments.where({ global: true }).length;

            this.$('meter').replaceWith(supplant($('#usage-meter').html(), {
                value: total - global,
                min: 0,
                max: max,
                low: max - 2,
                high: max - 1
            }));

            this.enableNewEnvironmentButton();
        },

        updateUsageMeterIfModelStateChangedFromNew: function (model) {
            if (model.previous('state') === 'new' &&
                    model.get('state') === 'on') {
                this.updateUsageMeter();
            }
        },

        logout: function () {
            // Transition the UI to logged out state.

            // Not all styles can be animated with switchClass, so to streamline
            // the transition, some custom animations are needed.
            //self.$el.switchClass('loggedin', 'loggedout');
            this.$('header').animate({ width: '50%' }, 'fast', function () {
                $(this).css('width', '');
            });
            this.$el.toggleClass('loggedout loggedin');
        },

        prelogout: function () {
            // Clean up the UI a bit in preparation for the destroy callback.

            // Stop pollers, blinkers, messaging and remove views.
            this.environments.each(function (environment) {
                environment.trigger('logout');
            });
            // In case there are no environments, the environment collection
            // still needs to do some work.
            this.environments.trigger('logout');

            // Reset the UI to its initial state.
            this.$('#newEnvironment').attr('disabled', 'disabled');
            this.setEmptyUsageMeter();
            this.addBootOnlyListeners();
        },

        showLogoutError: function (response) {
            this.environments.trigger('error:logout', response);
        },

        enableNewEnvironmentButton: function () {
            var max = window.localStorage.tef_max_colos,
                total = this.environments.length,
                global = this.environments.where({ global: true }).length,
                count;

            // Two things need to be taken care of before the button can be
            // enabled: (1) products/branches are fetched and (2) user has not
            // reached the environment limit.
            if (RESTRICTED_PRODUCT_ID) {
                count = EnvironmentModel.branches.length;
            } else {
                count = EnvironmentModel.products.length;
            }

            if (count > 0 && (total - global) < max) {
                this.$('#newEnvironment').removeAttr('disabled');
            } else {
                this.$('#newEnvironment').attr('disabled', 'disabled');
            }
        },

        newEnvironment: function () {
            if (!EnvironmentListView.focusExistingEditor()) {
                // Because a successfully saved new environment's model stays
                // the same object, a new environment model must be created
                // every time the editor is brought up.
                this.environments.add({
                    // Set properties to avoid supplant error.
                    state: 'new',
                    colo_name: ''
                });
            }
        },

        filterEnvironments: function (event) {
            var filterText = $(event.target).val();

            if (event.which === 27) {   // Escape
                filterText = '';
                $(event.target).val('');
            }

            this.environmentListView.filter(filterText);
        }
    });

    // On DOM-ready, create the single-page app view and start it up.
    $(function () {
        var view;

        view = new AppView({
            el: 'body'
        });

        view.start();
    });
}(window.jQuery));
