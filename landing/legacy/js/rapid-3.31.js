/*jshint smarttabs:true, curly:true, forin:true*/
    if (typeof YAHOO === "undefined" || !YAHOO) {
        YAHOO = {};
    }
/*
  function timd(m){
  var cur =  document.getElementById('deb').value + '\n' + m;
  document.getElementById('deb').value = cur;
  }
*/

YAHOO.i13n = YAHOO.i13n || {};
YAHOO.i13n.EventTypes = (function() {
    var RICHVIEW = 'richview';
    var CONTENTMODIFICATION = 'contentmodification';
    function EventType(yqlid, eventName, spaceidPrefix){
	this.yqlid = yqlid;
	this.eventName = eventName;
	this.spaceidPrefix = spaceidPrefix;
    }
    EventType.prototype = {
	getYQLID:function(){return this.yqlid;},
	getEventName:function(){return this.eventName;}
    };
    var eventMapping = {
	'pageview': new EventType('pv', 'pageview', ''),
	'simple': new EventType('lv', 'event', 'P'),
	'linkview': new EventType('lv', 'linkview', 'P'),
        'richview': new EventType(RICHVIEW, RICHVIEW, 'R'),
        'contentmodification': new EventType(RICHVIEW, CONTENTMODIFICATION, 'R'),
	'dwell': new EventType('lv', 'dwell', 'D')
    };
    return {
        getEventByName: function(name){return eventMapping[name];}
    };
})();

YAHOO.i13n.Rapid = function (old_conf) {
    // fallback for console.log in old IE's
    if (typeof console === "undefined" || typeof console.log === "undefined") {
        console = {
            log: function () {}
        };
    }
    if (typeof console.error === 'undefined') {
        console.error = console.log;
    }
    if (typeof console.warn === 'undefined') {
	console.warn = console.log;
    }

    function KVMap(){
    }

    KVMap.prototype = {
	ser:function(){
	    return U.ser(this.map);
	},
	set:function(k,v){
	    var val = (v ? U.norm(v) : v);
	    if(val === undefined || val === null){
            val = ''; 
	    }
	    if(val !== null && U.isStr(val)){
            val = val.replace(/\\/g, '\\\\');
	    }
	    // ensure max ult key/value sizes respected except for the whitelist
	    if (!U.in_value_whitelist(k) && val.length > U.MAX_VALUE_LENGTH) {
		    val = val.substring(0,U.MAX_VALUE_LENGTH);
	    }
	    if(U.isValidPair(k, val)){
            this.map[U.norm(k)] = val;
            this.count++;
	    }
	},
	get:function(k){
	    return this.map[k];
	},
	getAll:function(){
	    return this.map;
	},
	absorb:function(other){
	    if(!other || !U.isObj(other)){return;}
	    for(var k in other){
		if(U.hasOwn(other, k)){
		    this.set(k, other[k]);
		}
	    }
	},
        absorb_filter:function(other,f){
            if(!other || !U.isObj(other)){return;}
            for(var k in other){
                if (f && !f.call(null, k)) {
                    continue;
                }
                if(U.hasOwn(other, k)){
                    this.set(k, other[k]);
                }
            }
        },
	getSize:function(){return this.count;}
    };

    function PageParams(initialVals){
	this.map = {}; this.count = 0;
	if(initialVals){
	    this.absorb(initialVals);
	}
    }

    function YLK(){
	this.map = {}; this.count = 0;
    }

    PageParams.prototype = new KVMap();
    PageParams.prototype.constructor = KVMap;
    YLK.prototype = new KVMap();
    YLK.prototype.constructor = KVMap;

    /**
     * Small static method to help build PP from existing
     * page params, usually the conf.keys.
     **/
    PageParams.makeFromPP = function(existingPageParams){
	var rv = new PageParams();
	if(existingPageParams){
	    rv.absorb(existingPageParams.getAll());
	}
	return rv;
    };

    var keys = new PageParams(), U = Utils(old_conf),
    modules_map = new ModulesList(),
    comp_types = { // maps the strings passed into the conf to integers used when sent to YQL
        none: 0,
        gzip: 1,
        lzw: 2,
        deflate: 3
    };
    

    
    /**
     * Returns a YLK instance with all of the key/value pairs of data for the given element.
     * Checks for 'data-ylk' attribute on the element as well as the 'data-action-outcome'
     * attribute on the element, which is set w/ having the 'outcm' key in the returns YLK instance.
     * @param el The element that we will operate on.
     **/
    function getLK(el, allowpos) {
        if (!el) {
            return null;
        }
        if (allowpos === null) {
            allowpos = false;
        }
        var rv = new YLK();
        var data_action_outcome = U.getAttribute(el, U.data_action_outcome);
        if (data_action_outcome) {
	    rv.set('outcm', data_action_outcome);
        }
        var keystring = U.getAttribute(el, 'data-ylk');
        if (keystring === null || keystring.length === 0) {
            return rv;
        }
        var parts = keystring.split(U.ylk_pair_delim);
        for (var i = 0, len = parts.length; i < len; i++) {
            var pieces = parts[i].split(U.ylk_kv_delim);
            if (pieces.length !== 2) {
                continue;
            }
            var key = pieces[0],
            val = pieces[1];
            if (key === null || key === '' || val === null) {
                continue;
            }

            if (val.length > U.MAX_VALUE_LENGTH) {
                val = val.substring(0,U.MAX_VALUE_LENGTH);
            }
            if (key.length <= 8 && val.length <= U.MAX_VALUE_LENGTH) {
                if (key !== '_p' || allowpos) {
                    rv.set(key, val);
                }
            }
        }
        return rv;
    }

    function getValueWithBounds(value, lower, upper) {
        if (value < lower) {
            return lower;
        }
        if (value > upper) {
            return upper;
        }
        return value;
    }

    
    function initKeys(newKeys,loc){
        keys.set('A_sid', YAHOO.i13n.A_SID || U.rand());
        // Truncating the refurl if it exceeds MAX_VALUE_LENGTH characters
        keys.set('_w', U.rmProto(loc).substring(0, U.MAX_VALUE_LENGTH));
	    if (newKeys){
	        keys.absorb(newKeys);
	    } else if(old_conf.keys) {
            keys.absorb(old_conf.keys);
        }
    }

    function initConfig(conf) {
        var global = YAHOO.i13n,
        TEST_ID = YAHOO.i13n.TEST_ID || conf.test_id,
        loc = conf.location || document.location.href;

        initKeys(conf.keys,loc);

        if (TEST_ID) {
            TEST_ID = U.norm('' + TEST_ID);
        }

        var DEFAULT_COMPR_LOWER = 300,
        DEFAULT_COMPR_TIMEOUT = 700,
	DEFAULT_CLICK_TIMEOUT = 10000;
        
        var override = conf.override || {};

        var rv = {
            override: override,
            version:'3.31',
            keys: keys,
            referrer:conf.referrer,
            getReferrer:function(){return U.norm(U.clref((typeof this.referrer !== 'undefined') ? this.referrer : document.referrer));},
            //referrer: U.norm(U.clref(conf.referrer || document.referrer)),
            spaceid: U.norm(override.spaceid || YAHOO.i13n.SPACEID || conf.spaceid),
	    yrid:U.norm(conf.yrid||''),
	    // optout - use oo as the interface for devs since it's
	    // visible in the pages.  'optout' is actually sent in
	    // the YQL request, however.
	    oo:(conf.oo ? '1' : '0'),
	    // nologging - use nol to not log Y/T cookies
	    nol:(conf.nol ? '1':'0'),
	    // Tumblr bypasses YQL altogether due to YQL capacity concerns
	    // provide this option to allow them to do so.
	    yql_enabled:(conf.yql_enabled !== false),
            ywa: global.ywa ? absorb_hash(conf.ywa, global.ywa) : conf.ywa,
            ywa_dpid: null,
            ywa_cf_override: global.YWA_CF_MAP || {},
            ywa_action_map: global.YWA_ACTION_MAP || {},
            ywa_outcome_map: global.YWA_OUTCOME_MAP || {},
	    fing:conf.use_fing==1,
            USE_RAPID: (conf.use_rapid !== false),
            linktrack_attribut: conf.lt_attr || 'text',
            tracked_mods: conf.tracked_mods || [],
	    tracked_mods_viewability: conf.tracked_mods_viewability || [],
	    viewability:conf.viewability || false,

	    // used by viewability scroll handler, controls the
	    // number of ms of pause time that must expire after
	    // scrolling has stopped before performing viewability
	    // calculation
	    viewability_time:conf.viewability_time || 300,

	    // used by the viewability scroll handler, controls the
	    // minimum number of pixels that must be traversed since
	    // the last viewability beacon was sent before performing
	    // viewability calcuation
	    viewability_px:conf.viewability_px || 50,

            lt_attr: conf.lt_attr || 'text',
            client_only: conf.client_only,
            text_link_len: conf.text_link_len || -1,
            test_id: TEST_ID,
            yql_host: conf.yql_host || "geo.query.yahoo.com",
            yql_path: conf.yql_path || "/v1/public/yql",
	    click_timeout: conf.click_timeout || DEFAULT_CLICK_TIMEOUT,
            compr_timeout: conf.compr_timeout || DEFAULT_COMPR_TIMEOUT,
            compr_on: (conf.compr_on !== false),
            compr_type: conf.compr_type || 'deflate',
            webworker_file: YAHOO.i13n.WEBWORKER_FILE || conf.webworker_file || 'rapidworker-1.2.js',
            nofollow_classname: conf.nofollow_class || 'rapidnofollow',
            no_click_listen: conf.rapid_noclick_resp || 'rapid-noclick-resp',
            nonanchor_track_class: conf.nonanchor_track_class || 'rapid-nonanchor-lt',
            anc_pos_attr: 'data-rapid_p',
            anc_v9y_attr: 'data-v9y',
            deb: (conf.debug === true),
            ldbg: (conf.ldbg > 0 ? true : loc.indexOf('yhldebug=1') > 0),
            addmod_timeout: conf.addmodules_timeout || 300,
            ult_token_capture: (typeof conf.ult_token_capture === 'boolean' ? conf.ult_token_capture : false),
            track_type: conf.track_type || 'data-tracktype',
	    dwell_on:(conf.dwell_on === true),
            async_all_clicks:(conf.async_all_clicks === true),
            click_postmsg: (conf.click_postmsg || {}),
            apv: (conf.apv !== false),
            apv_time: conf.apv_time || 500,
            apv_px: conf.apv_px || 500,
            apv_always_send: (conf.apv_always_send === true),
            ex: (conf.ex === true),
            persist_asid: (conf.persist_asid === true),
            track_right_click: (conf.track_right_click === true),
            gen_bcookie: (conf.gen_bcookie === true),
            skip_attr: conf.skip_attr || 'data-rapid-skip',
            parse_dom: (conf.parse_dom === true),
            pageview_on_init: (conf.pageview_on_init !== false),
            perf_navigationtime: conf.perf_navigationtime || 0,
            perf_commontime: conf.perf_commontime || null,
            perf_usertime: conf.perf_usertime || null,
            perf_resourcetime: conf.perf_resourcetime || 0,
            sample: conf.sample || {},
            loc: loc,
            fpc: (conf.fpc === true)
        };

	// override certain actions we reserve, such as 'richview'
        rv.ywa_action_map[YAHOO.i13n.EventTypes.getEventByName('richview').getEventName()] = 100;

        // guard against project_id null or 0 or not specified
        if (rv.ywa && (!rv.ywa.project_id || rv.ywa.project_id == 0 || !U.isNumeric(rv.ywa.project_id))) {
            // disables ywa usage throughout rapid code
            logError('Invalid YWA project id: null or not numeric.');
            rv.ywa = null;
        }

        var compr_timeout = rv.compr_timeout * 1;
        if (!U.isNum(compr_timeout)) {
            rv.compr_timeout = DEFAULT_COMPR_TIMEOUT;
        } else {
            rv.compr_timeout = getValueWithBounds(compr_timeout, DEFAULT_COMPR_LOWER, DEFAULT_COMPR_TIMEOUT);
        }

        if (rv.ldbg && rv.click_timeout != DEFAULT_CLICK_TIMEOUT) {
            logWarning('Click timeout set to '+rv.click_timeout+'ms (default 10000ms)');
        }
        if (conf.apv_callback && typeof(conf.apv_callback) == "function") {
            rv.apv_callback = conf.apv_callback;
        } else {
            rv.apv_callback = null;
        }
        return rv;
    }

    function absorb_hash(base, override) {
        var rv = {};
        if (base && U.isObj(base)) {
            for(var k in base) {
                if(U.hasOwn(base, k)){
                    rv[k] = base[k];
                }
            }
        }
        if (override && U.isObj(override)) {
            for(var k in override) {
                if(U.hasOwn(override, k)){
                    rv[k] = override[k];
                }
            }
        }
        return rv;
    }

    function regenSid() {
        keys.set('A_sid', U.rand());
    }

    function logPre() {
        return 'Rapid-' + conf.version + '(' + (new Date().getTime()) + '):'
    }

    function logWarning(msg){
	console.warn('RAPID WARNING: ' + msg);
    }

    function logError(msg) {
        console.error('RAPID ERROR: ' + msg);
    }

    function logDebug(msg) {
        if (conf.ldbg) {
            console.log(logPre() + msg);
        }
    }

    /****
     * CookieMap is a type that basically provides a map of cookies. This exists
     * because the browser's cookies can mutate throughout the lifetime of rapid
     * during the page's lifetime.  Instead of relying on an upfront cookie loading,
     * rapid code will instantiate a new CookieMap instance for every read that occurs,
     * ensuring that this lazy access will always provide the latest representation.
     * We were bit several times by bugs where we tried to take snapshots of what the
     * cookie state should be, only to have it change underneath us.  An example is
     * when a user has no YWA FPC when he visits a page for the first time. The first
     * pv request pixel w/ have no FPC but have one set in the response. A subsequent
     * event pixel out should have that FPC as well. Had we cached the FPC at load
     * we would still think the user had NO FPC in the beaconEvent call, which is wrong.
     ****/

    function CookieMap() {
        var  cookie_text = document.cookie;
        this.cookieMap = {};
        if (/[^=]+=[^=;]?(?:; [^=]+=[^=]?)?/.test(cookie_text)) {
            var cookieParts = cookie_text.split(/;\s/g),
            cookieName = null,
            cookieValue = null,
            cookieNameValue = null;
            for (var i = 0, len = cookieParts.length; i < len; i++) {
                cookieNameValue = cookieParts[i].match(/([^=]+)=/i);
                if (cookieNameValue instanceof Array) {
                    try {
                        cookieName = U.dec(cookieNameValue[1]);
                        cookieValue = U.dec(cookieParts[i].substring(cookieNameValue[1].length + 1));
                    } catch (ex) {logError(ex);}
                } else {
                    cookieName = U.dec(cookieParts[i]);
                    cookieValue = cookieName;
                }
                if (cookieName === 'B' || cookieName === 'BX' || cookieName === 'TT' 
                    || (conf && conf.ywa && (cookieName === ('fpc' + conf.ywa.project_id)) || (cookieName === 'fpc') 
                    || (cookieName === 'ywandp') || (cookieName.indexOf('ywadp') === 0)) || cookieName === 'D'
                    || cookieName === '_ga' || cookieName === 'yx' || cookieName === 'rx' || cookieName === 'rxx') {
                    this.cookieMap[cookieName] = cookieValue;
                }
            }
        } // end if
        U.clearCookie('rx', '/', U.isIE ? document.domain : '');
    }

    CookieMap.prototype = {
        /*****
         * Returns the YWA FPC.
         ****/
        getYWAFPC: function () {
            if (!conf.ywa) {
                return null;
            }
            var oldCookie = this.cookieMap['fpc' + conf.ywa.project_id];
            var fpc = this.cookieMap['fpc'];
            var fpcData = parseCookieData(fpc);
            var fpcVal = null;
            if(fpc) {
                fpcVal = fpcData[conf.ywa.project_id];
            }
            if(oldCookie) {
                U.clearCookie('fpc' + conf.ywa.project_id);
                if(!fpcVal) {
                    fpcData[conf.ywa.project_id] = oldCookie;
                    var val = serializeCookieData(fpcData);
                    setCook('fpc', val, 315360000);
                    fpcVal = oldCookie;
                }
            }
            return (fpcVal ? fpcVal : null);
        },
        /****
         * @param name The cookie name to fetch, ie, 'D' for dcookie.
         * Returns a cookie given requesting by param name.
         ***/
        getCookieByName: function (name) {
            return this.cookieMap[name];
        },
        /****
         * Returns the YWA DPID
         ****/
        getYWADPID: function() {
            if (conf.ywa) {
                var name = 'ywandp', oldName = 'ywadp' + conf.ywa.project_id, cookieData = parseCookieData(this.cookieMap[name]), oldCookie;
                var dpid = cookieData[conf.ywa.project_id];
                if(dpid === undefined || dpid === null || dpid === '') {
                    oldCookie = this.cookieMap[oldName];
                    if(oldCookie) {
                        cookieData[conf.ywa.project_id] = oldCookie;
                        // Not deleting the old cookie for now
                        // U.clearCookie(oldName);
                    } else {
                        cookieData[conf.ywa.project_id] = getDPID();
                    }
                    dpid = cookieData[conf.ywa.project_id];
                    var val = serializeCookieData(cookieData);
                    setCook(name, val, 315360000);
                    this.cookieMap[name] = val;
                }
                conf.ywa_dpid = dpid;
            }
        },
        /****
         * Returns the rx cookie, if not present, create and set in fp domain and return the new value
         ****/
        getRxx: function() {
            var name = 'rxx';
            var rxx = this.cookieMap[name];
            if (conf.fpc && (rxx === undefined || rxx === null || rxx === '')) {
                var domain = document.domain || '';
                domain = "." + domain.split('.').slice(-2).join('.');
                var epoch = Date.UTC(2015, 7, 1);
                var d = new Date().getTime() - epoch;
                rxx = parseInt(Math.random().toString().substring(2)).toString(36) + '.' + d.toString(36) + "&v=1";
                setCook(name, rxx, 63072000, domain);
            }
            return rxx;
        }
    };

    /**
     * If page url had ULT tokens or a DCookie, beacon the click so it's not lost.
     * Only one of those two things can happen - not at the same time, though.
     */

    function handleULT() {
        if (!conf.ult_token_capture || YAHOO.i13n.__handled_ult_tokens__ === true) {
            return;
        }
        YAHOO.i13n.__handled_ult_tokens__ = true;
        var url = conf.loc;
        if (url.match(/;_yl[a-z]{1}=/)) {
            if (conf.ldbg) {
                logDebug('Found ULT Token on URL.');
            }
            uploader.sendGeoT(url);
        } else {
            // Check and then clear dcookie to prevent multiple click tracking
            var cooks = new CookieMap(),
            dcookie = cooks.getCookieByName('D');
            if (dcookie) {
                U.clearCookie('D', '/', '.yahoo.com');
                //document.cookie = "D= ; path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.yahoo.com;";
                uploader.sendGeoT(dcookie);
            }
        }
    }

    var conf = initConfig(old_conf),
    uploader = Uploader(),
    scrollManager = null,
    viewabilityManager = null,
    dwellManager = null,
    // keep track of current click event - global.
    currentClickEvent = null; 


    var cooks = new CookieMap();
    var rx = cooks.getRxx();
    if (rx != null) {
        keys.set('_rx', rx);
    }
    var ga = cooks.getCookieByName('_ga');
    if (ga != null) {
        keys.set('_ga', ga);
    }
    var yx = cooks.getCookieByName('yx');
    if (yx != null) {
        keys.set('_yx', yx);
    }


    function ts() {
        return Math.floor(new Date().valueOf() / 1000);
    }

    function setCook(name, val, offset, domain) {
        var d = new Date(),
        expiry = '';
        d.setTime(d.getTime() + (offset * 1000));
        expiry = "; expires=" + d.toGMTString();
        var cookieDomain = '';
        if (domain) {
            cookieDomain = ";domain=" + domain;
        }
        var cookie = name + "=" + val + expiry + cookieDomain + "; path=/";
        document.cookie = cookie;
    }
    
    function getDPID() {
        return "" + Math.floor(Math.random() * 4294967295);
    }

    function serializeCookieData(cookies) {
        var key, data = [];
        for(key in cookies) {
            if(key, cookies[key]) {
                data.push(key + ':' + cookies[key]);
            }
        }
        return encodeURIComponent(data.join(';'));
    }
    
    function parseCookieData(cookieValue, pid) {
        cookieValue = cookieValue || '';
        var results = decodeURIComponent(cookieValue).split(';'), cookies = {};
        for(i=0, excl = results.length; i < excl; i ++) {
            var tmp = results[i].split(':');
            cookies[tmp[0]] = tmp[1];
        }
        if(pid) {
            return cookies[pid];
        }
        return cookies;
    }
    
    function Uploader() {
        var GEO_BASE = YAHOO.i13n.beacon_server || 'geo.yahoo.com';

        function padCF(cf) {
            var custom_field_key = 'cf';
            if (cf < 10 && ("" + cf).charAt(0) !== '0') {
                custom_field_key += '0' + cf;
            } else {
                custom_field_key += cf;
            }
            return custom_field_key;
        }

        function setFPCStub() {
            if (typeof window.ITTs === "undefined" || !U.isArr(window.ITTs) || window.ITTs.length === 0) {
                window.ITTs = [{}];
            }
            if (window.ITTs[0].setFPCookies) {
                return;
            }
            window.ITTs[0].setFPCookies = function () {
                var fpcName = 'fpc', cooks = new CookieMap();
                var cookieData = parseCookieData(cooks.getCookieByName(fpcName));
                cookieData[conf.ywa.project_id] = window.ITTs[0].FPCV;
                // expire the fpc cookie 1 yr from today
                setCook(fpcName, serializeCookieData(cookieData), 31536000);
                var oldCookie = cooks.getCookieByName(fpcName + conf.ywa.project_id);
                if(oldCookie) {
                    U.clearCookie(fpcName + conf.ywa.project_id);
                }
            };
        }
        
        function sb(url, func) {
            if (conf.ldbg) {
                logDebug(url);
            }
            var i = new Image(),
            tid = null;
            i.onload = i.onabort = i.onerror = function () {
                if (!!func && (typeof(func) === "function")) {
                    clearTimeout(tid);
                    func.call(null);
                }
            };
            i.src = url;
            if (!!func && (typeof(func) === "function")) {
                tid = setTimeout(function () {
                    func.call(null);
                }, conf.click_timeout);
            }
            // prevent i from getting gc'd
            setTimeout(function () {
                i = null;
            }, 1e7);
        }

        // Take in a map of ult_data, which could be either page params
        // or an object literal passed into beaconEvent, and look it up 
        // in ywa_cf_override, which actually points to YWA_CF_MAP
        // If a key that is in ult_data appears in ywa_cf_override and is not
        // reserved, store it in dest

        function applyCFMap(ult_data, dest) {
            for (var pp in ult_data) {
                if (!U.hasOwn(ult_data, pp)) {
                    continue;
                }
                var cf_number = conf.ywa_cf_override[pp];
                if (cf_number) {
                    dest[cf_number] = ult_data[pp];
                }
            }
        }

        /***
         * type: the type of the event: 'p', 'c', 'e'
         * event_number: if this is an event, what is the custom action number for it?
         * extra_action: if we need to overload a single ywa pixel, this is the second custom action number
         * click_parts: if this is a click, this is the extra click data payload
         * event_data: if this is an event, this is the extra event payload
         * pp: optional page params to override the conf.keys version
         ***/

        function buildYWAPixel(type, event_number, extra_action, click_parts, event_data, pp, override_pixel_parts) {
            function adjustedCF(cf, use_enc_semi) {
                var semi = (use_enc_semi ? '%3B' : ';');
                return cf + (extra_action ? (semi + cf) : '');
            }

            var cookieMap = new CookieMap(),
            fpc = cookieMap.getYWAFPC();
            cookieMap.getYWADPID();

            click_parts = click_parts || {};
            if (type !== 'c') { // set fpc if not a click
                setFPCStub();
            }
            // only pageviews need fpc to get firstparty cookie
            var base_url = [U.curProto(), (conf.ywa.host || 'a.analytics.yahoo.com'), '/fpc.pl?'],
            proj_id = conf.ywa.project_id,
            docGroup = conf.ywa.document_group,
            cfs = {};
            if (conf.test_id) {
                cfs['14'] = conf.test_id;
            }
            // push in the page params
            var myPP = {};
            U.aug(myPP, buildPageParams().getAll());
            U.aug(myPP, pp);

            //add the basic stuff we'll always send along
            var parts = [
                '_cb=' + U.rand(), // cache buster
                '.ys=' + conf.spaceid,
                'a=' + proj_id,
                'b=' + U.enc(conf.ywa.document_name || document.title),
                'd=' + U.enc(new Date()), // needed for timespent calc
                'f=' + U.enc(conf.loc),
                'j=' + U.sr('x'), // screen res
                'k=' + U.cold(), // color depth
                't=' + ts(), // cache buster
                'l=true' // used cookies (always true)
            ];
            
            if(U.hasOwn(myPP, 'A_apv')) {
                parts.push('apv=' + U.enc(myPP.A_apv));
            }
            
	    if(override_pixel_parts){
		for(var i in override_pixel_parts){
		    if(U.hasOwn(override_pixel_parts, i)){
			parts.push(i + '=' + U.enc(override_pixel_parts[i]));
		    }
		}
	    }
            if (docGroup && docGroup !== '') {
                parts.push('c=' + U.enc(docGroup));
            }
            if (conf.ywa_dpid) {
                parts.push('dpid=' + conf.ywa_dpid);
            }
            if (type === 'c') {
                click_parts.x = 12;
                var val = '12';
                if (extra_action) {
                    val = U.enc(val + ';' + extra_action);
                }
                parts.splice(0, 0, 'x=' + val);
            } else
                if (type === 'e') {
                    parts.push('x=' + event_number + (extra_action ? ';' + extra_action : ''));
                }

            if (fpc) {
                parts.push('fpc=' + U.enc(fpc));
            }
            var member = conf.ywa.member_id;
            if (member) {
                parts.push('m=' + member);
            }

            if (conf.getReferrer() !== '') {
                parts.push('e=' + U.enc(conf.getReferrer()));
            }

            applyCFMap(myPP, cfs);

            // if this is an event, map the event data to custom fields and add that to the cfs
            if (type === 'e' && event_data) {
                applyCFMap(event_data, cfs);
            }

            // push in the instrumented YWA custom fields
            var passed_cfs = conf.ywa.cf;
            U.aug(cfs, passed_cfs, function (cf) {
                return !U.isResCF(cf);
            });
            for (var cf in cfs) {
                if (U.hasOwn(cfs, cf)) {
                    parts.push(padCF(cf) + '=' + adjustedCF(U.enc(cfs[cf]), 1));
                }
            }

            if (type === 'e' || type === 'c') {
                parts.push('ca=1');
            }
            if (type !== 'p') {
                parts.push('resp=img');
            }

            if (type === 'c') {
                for (var k in click_parts) {
                    if (!U.hasOwn(click_parts, k)) {
                        continue;
                    }
                    if (k !== 'x') {
                        var part = click_parts[k];
                        if (part && part.length > U.MAX_VALUE_LENGTH) {
                            part = part.substring(0,U.MAX_VALUE_LENGTH);
                        }
                        try {
                            part = U.enc(adjustedCF(part));
			    // Safari doesn't encode single-quotes, so do it manually here
			    part = part.replace(/'/g, "%27");
                        } catch (e) {logError(e);}
                        parts.push(padCF(k) + '=' + part);
                    }
                }
            }
            return base_url.join('') + parts.join('&');
        }

        /**
         * Generates random element id or name for elements in the page.
         */

        function genRandIframeName() {
            return 'rapid_if_' + U.rand();
        }

        /**
         * Make an element invisible, specifically for IE
         * @param el The elemnent (not the id) that will be made invisible.
         */

        function makeInvisible(el) {
            var none = 'display:none;';
            if (U.isIE && (U.ieV === 6 || U.ieV === 7 || U.ieV === 8)) {
                el.style.setAttribute('cssText', none, 0);
            } else {
                U.sa(el, 'style', none);
            }
        }

        // cannot do the iframe/form routine in IE7 unless you do it this way.

        function makeIFrame(frameName) {
            var frame = null;
            if (U.isIE && U.ieV <= 8) {
	 	// IE6 needs a src on the iframe on https pages
		// See:http://social.msdn.microsoft.com/Forums/ie/en-US/4cddd959-15a1-46f9-83e0-f832d35f1253/ie6-sslhttps-nonsecure-items
		var src = '';
		if(U.isSecure() && U.ieV == 6){
		    src = 'src="https://geo.yahoo.com/b.html"';
		}
                frame = document.createElement('<iframe ' + src + ' name="' + frameName + '"></iframe>');
            } else {
                frame = document.createElement('iframe');
            }
            frame.name = frameName;
            return frame;
        }

        /**
         * IE7 and friends like to keep the loading bar around forever when adding iframes to
         * the page dynamically the way we do.  This removes that.
         * @see https://github.com/SignalR/SignalR/issues/215
         **/

        function hideLoadingBar() {
            setTimeout(function () {
                var frame = makeIFrame('');
                U.addEvent(frame, 'load', function () {
                    U.rmBodyEl(frame);
                });
                U.appBodyEl(frame);
            }, 1);
        }

        // http://terminalapp.net/submitting-a-form-with-target-set-to-a-script-generated-iframe-on-ie/
        // http://stackoverflow.com/questions/2181385/ie-issue-submitting-form-to-an-iframe-using-javascript
        // http://forums.devx.com/showthread.php?133717-Can-t-submit-targeting-an-iframe

        function sendViaIframe(pay, compression) {
            var frame = null,
            form = U.make('form'),
            input = U.make('input'),
            curFrameName = genRandIframeName(),
            curFormId = genRandIframeName(),
            encType = 'application/x-www-form-urlencoded;charset=UTF-8';
            frame = makeIFrame(curFrameName);
            makeInvisible(frame);
            makeInvisible(form);
            form.id = curFormId;
            form.method = 'POST';
            form.action = getYQLURI(compression);
            form.target = curFrameName;
            // added in 3.5
            // changing the attribute directly causes errors in IE7, use setAttribute instead
            if (U.isIE && U.ieV <= 7) {
                form.setAttribute('enctype', encType);
            } else {
                form.setAttribute('enctype', encType);
                form.setAttribute('encoding', encType);
            }
            // end added in 3.5
            input.name = 'q';
            input.value = pay;
            if (U.isIE && U.ieV >= 10) { // IE 10 (perhaps more?) massively fails w/o this condition
                input.type = 'submit';
            }

            form.appendChild(input);
            var eventName = 'load',
            onloadHandler = function () {
                var response = '';
                // get the iframe content for debugging.  This only works
                // when the YQL host we set in yql_conf is the same host
                // as the test page rapid is running in.  That is, 
                // if yql_host is not set, this definitely will not work.
                if (conf.ldbg && (!U.isIE || U.ieV >= 9)) {
                    var ifr = frame.contentDocument || frame.contentWindow.document;
                    response = ifr.body.innerHTML;
                }
                U.rmEvent(frame, eventName, onloadHandler);
                // firefox 3.0.1 (perhaps others) continuously loads
                // unless you delay the frame removal
                // See: http://www.bennadel.com/blog/1336-FireFox-Never-Stops-Loading-With-iFrame-Submission.html
                setTimeout(function () {
                    U.rmBodyEl(frame);
                    U.rmBodyEl(form);
                }, 0);
                if (conf.ldbg) {
                    logDebug('iframe resp: ' + response);
                }
                // hide the loading bar in IE7 
                if (U.isIE && U.ieV <= 7) {
                    hideLoadingBar();
                }
            };
            U.addEvent(frame, eventName, onloadHandler);
            U.appBodyEl(frame); // append the frame to document body
            U.appBodyEl(form); // append the form to the document body
            form.submit();
        }

        // compressed: should we compress the data?
        // 0=no comp; 1=gzip; 2=lzw
        // only supporting lzw right now 
        function getYQLURI(compressed) {
            // try extremely hard to avoid POST caching.
            // it's happened in mobile safari in iOS6, so anything is possible.
            var debug = conf.deb,
            rnd = U.rand(),
            rv = [U.curProto(), 
		  conf.yql_host, 
		  conf.yql_path, 
		  '?yhlVer=2&yhlClient=rapid&yhlS=', conf.spaceid, 
		  ((debug === true) ? '&yhlEnv=staging' : ''), 
		  ((debug === true || conf.ldbg) ? '&debug=true&diagnostics=true' : ''), 
		  ((U.isIE && U.ieV) ? '&yhlUA=ie'+U.ieV : ''),
		  ((U.isIE && U.ieV == 8) ? '&format=json' : ''),
		  '&yhlCT=2', 
		  '&yhlBTMS=', (new Date()).valueOf(), 
		  '&yhlClientVer=', conf.version, 
		  '&yhlRnd=', rnd, 
		  '&yhlCompressed=', compressed || 0, 
		  (conf.gen_bcookie) ? '&yhlBcookie=1':''
		 ].join('');
            if (conf.ldbg) {
                logDebug(rv);
            }
            return rv;
        }

        function sendToYQL(pay, compressed) {
            var xhr = U.getXHR(),
            url = getYQLURI(compressed);
            xhr.open('POST', url, true); //async
            xhr.withCredentials = true;
            // added charset in 3.5
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            if (conf.ldbg) {
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        logDebug(xhr.status + ':xhr response: ' + xhr.responseText);
                    }
                };
            }
            xhr.send(pay);
        }

        /**
         * For the _pl key:
         * 1= Clientside rapid js
         * 2= Rapid Pro
         * 3= Server side (rapid track) supercedes A_ss key
         * 4= iOS
         * 5= Android
         **/
        /***
         * @param needReferrer Boolean indicating whether we want to include referrer in page params.
         *    In YQL requests its already in pp where its accessed and removed.  Geo puts it on the URI
         *    and adds it back to page params server-side.
         **/
        var buildBP = function (needReferrer) {
            var rv = {
                _pl: 1,
                A_v: conf.version
            };
            var ref = conf.getReferrer();
            if (ref && needReferrer !== false) {
                rv._R = ref.substring(0, U.MAX_VALUE_LENGTH);
            }
            if (conf.test_id) {
                rv.test = conf.test_id;
            }
            if(conf.ex) {
                rv._ex = 1;
            }
            if (!rv._bt) {
                rv._bt = 'rapid';
            }
            var protocol = window.location.protocol || '';
            protocol = protocol.replace(/:$/,"");
            rv.A_pr = protocol;
            rv.A_tzoff = new Date().getTimezoneOffset();
            rv.A_tzoff = rv.A_tzoff ? -1 * rv.A_tzoff / 60 : 0;
            if (conf.ywa && conf.ywa.project_id) {
                rv._ywa = conf.ywa.project_id;
            }
            return rv;
        };

        /***
	    Version 2.0 JSON format:
	    [
	    {
	    m:'section',
	    ylk:{module ylk},
	    l:[]
   	    },
	    ]
	*/

        function linkToStrippedJSON(link, sendPosition, filter) {
            var rv = {};
            if (!U.isObj(link)) {
                return rv;
            }
            U.aug(rv, link, filter);
            return rv;
        }

        /**
         * Assembles a JSON representation of a Module.
         */

        function buildModule(module_obj, sendPosition, options) {
            options = options || {};
            var rv = {
                m: U.norm(module_obj.moduleName),
                l: []
            };
            if (module_obj.moduleYLK) {
                rv.ylk = module_obj.moduleYLK.getAll();
            }
            var mod_sec = (rv.ylk && rv.ylk.sec) ? rv.ylk.sec : '';
            var links = module_obj.links;
            // small function to filter out link data that is inserted
            // into the JSON object
            var links = module_obj.links,
            filter = function (key,value) {
                var isPos = (key === '_p');
                if (sendPosition && isPos) {
                    return true;
                }
                if (key == 'sec' && value != rv.m && value != mod_sec) {
                    return true;
                }
                return key !== 'sec' && !isPos;
            };
            for (var i = 0, len = links.length; i < len; i++) {
                if (!links[i]) { continue; }
                // filter out the links that weren't viewable
                if(conf.viewability && !links[i].viewable){
                    if(conf.ldbg){
                        logDebug('Skipping not viewable link: ' + links[i].data.slk);
                    }
                    continue;
                }
                rv.l.push(linkToStrippedJSON(links[i].data, sendPosition, filter));
            }
            return rv;
        }

        /***
         * Build up linkviews for all known links.
         **/

        function buildModulesList(mods, sendPosition, options) {
            var rv = [],
            mod = null;
            for (var mname in mods) {
                if (!U.hasOwn(mods, mname)) {
                    continue;
                }
                mod = mods[mname];
                if (!mod) {
                    continue;
                }
                var modObj = buildModule(mod, sendPosition, options);
                // dont capture module if it has no links
                if (modObj.l.length > 0) {
                    rv.push(modObj);
                } else if (conf.ldbg) {
                    logDebug('Not capturing 0 links mod: "' + mod.moduleName + '"');
                }
            }
            return rv;
        }

	function yqlRecordTypeFor(isPageView, options){
	    if(isPageView){
		return 'pv';
	    }
	    if(options && options.event){
		return options.event.type.getYQLID();
	    }
	    return 'lv';
	}

        /***
         * Builds up an array of pageview records.
         * @param mods Array of module objects
         * @param isPageView Boolean indicating whether we are going
         *    to log a pv or not.
         * @param sendPosition Boolean for sending a _p (position) key
         * @param pageParams Optional object of extra page params to send along
         */

        function buildPageRows(mods, isPageView, sendPosition, pageParams, options) {
            return [{
		t:yqlRecordTypeFor(isPageView, options),
                s: conf.spaceid,
                pp: buildPageParams(isPageView, pageParams).getAll(),
                _ts: ts(),
                lv: buildModulesList(mods, sendPosition, options)
            }];
        }

        /**
         * Builds new representation of page params object based
         * on conf.keys.  Immutable.
         * @param isPageView Boolean - flag for a pageview record..
         * @param pageParams Object - optional object of page params to send along.
         */

        function buildPageParams(isPageView, pageParams) {
            var rv = PageParams.makeFromPP(conf.keys);
            rv.absorb(pageParams);
            /*
              if(conf.fing){
              var fp = U.fp();
              rv.absorb(fp);
              }
            */
            if (isPageView) {
                rv.set('A_', 1);
            }
            return rv;
        }

        /**
         * Builds a YQL statement with the given JSON payload.
         * @param json The JSON payload body to send
         * @param needKey: do we need the q= part of the POST body?
         *   If using iframe, then we don't need to add it here.
         *   If using CORS, then we need to manually add it.
         * @param doEncode: do we need to uri encode the data?
         *	In iframe case, we don't.
         **/

        function buildYQLPostBody(json, needKey, doEncode) {
	    // Select stmt for flickr: http://bug.corp.yahoo.com/show_bug.cgi?id=6602886
	    var s = 'select * from x where a = \'' + json + '\'';
            return (needKey ? 'q=' : '') + (doEncode ? U.enc(s) : s);
        }

	/**
	 * Assembles a JSON payload for YQL.
	 * @param rowBuilderFunc - function used to assemble the rows 'r' data.  Depending on the type of payload
	 * 	we're sending (refreshed content vs non-refreshed, r changes.)
	 **/
	function buildJSON(rowBuilderFunc){
            var data = {
                bp: buildBP(),
                r: rowBuilderFunc.call(0),
		yrid:conf.yrid,
		optout:conf.oo,
		nol:conf.nol
            };
            return U.toJSON(data);
	}

        /***
         * Sends the refreshed data using rapidConditionalSend.
         * @param newlinks An array of Link objects representing the
         *    new links to capture.
         * @param isPageView Optional flag indicating whether the user
         *   wanted to track a pageview for this refreshed data.
         *   Homerun and flickr like to do that.
         ***/

        function _sendRefreshedContent(mod_obj, isPageView, options) {
	    var pp = {};
	    if(options.event){
		U.aug(pp, options.event.data);
	    }
	    if(options.pp){
		U.aug(pp, options.pp);
	    }
            var json = buildJSON(function(){
		return buildPageRows([mod_obj], isPageView, true, pp, options);
	    });
            _rapidConditionalSend(json, isPageView);
        }

        function sendRapidFinal(newModules, isPageview, pageParams, options) {
	    var json = buildJSON(function(){
		return buildPageRows(newModules, isPageview, true, pageParams, options);
	    });
            _rapidConditionalSend(json);
        }

        /**
         * Used by _sendRapid below to return the identifier for a module
         */

        function getModuleID(module) {
            return module.identifier;
        }

        /***
         * Actually sends the rapid data using newModules.  This method is called by sendRapid().
         * Throttle calls to _sendRapidFinal to prevent overusage of addModules() calls.
         * Can configure throttling by setting the addmodules_timeout value in conf object of
         * Rapid constructor.
         *
         * @param newModules An array of Module instances containing link data.
         * @param isPageview A boolean flag indicating whether this is a pageview that
         *   we are sending, or non-pageview.  This flag is important for addModules() because
         *   it takes a boolean.
         * @param pageParams Optional object of extra page params to send along
         ***/
        var sendRapidThrottled = function () {
            // set lastCall to +new Date() to force rapid constructor to try to catch
            // subsequent addModules call and send in one shot.
            var tid = null,
            bufferedMods = [],
            lastCall = 0,
            TIMEOUT = conf.addmod_timeout;

            return function (newModules, isPageview, pageParams, options) {
                clearTimeout(tid);
                var elapsed = +new Date() - lastCall;
                // append newModules elements to bufferedMods, only where they dont exist already
                // each element in the two array args are fetched by getModuleID callbacks
                // i.e., getModuleID(bufferedMods[0])
                bufferedMods = U.uniqConcat(bufferedMods, newModules, getModuleID);
                if (elapsed > TIMEOUT) {
                    lastCall = +new Date();
                    sendRapidFinal(bufferedMods, isPageview, pageParams, options);
                    bufferedMods = [];
                } else {
                    var timeout = TIMEOUT - elapsed;
                    tid = setTimeout(function () {
                        if (conf.ldbg) {
                            logDebug('queueing send in addMods');
                        }
                        sendRapidFinal(bufferedMods, isPageview, pageParams, options);
                        bufferedMods = [];
                    }, timeout);
                }
            };
        }();

        function _rapidConditionalSend(json) {
            // useful function to send via to YQL via CORS or iframe
            var ldbg = conf.ldbg;

            function exec(jsonInsertData, compression) {
                // when we send over uncompressed and in clear json, we need to escape single quote
                // since YQL is expecting the json string to have surrounding single quotes.
                if (compression === 0) {
                    jsonInsertData = jsonInsertData.replace(/'/g, "\\\'");
                }
                if (ldbg) {
                    logDebug('body: ' + jsonInsertData);
                }
                // function buildYQLPostBody(json, needKey, doEncode);
                if (U.hasCORS()) { // we can do CORS
                    body = buildYQLPostBody(jsonInsertData, true, true);
                    sendToYQL(body, compression);
                } else { //iframe
                    body = buildYQLPostBody(jsonInsertData, 0, 0);
                    sendViaIframe(body, compression);
                }
            }

            var body = '',
            compressionInt = comp_types[conf.compr_type];
            // compressionInt > 1 since we dont have gzip in rapid so don't allow.
            if (conf.compr_on && U.hasWorkers() && compressionInt > 1 && json.length > (2 * 1024)) { //compress in another thread
                if (ldbg) {
                    logDebug('Looking for worker:' + conf.webworker_file + ', compr timeout:' + conf.compr_timeout);
                }
                try {
                    var w = new Worker(conf.webworker_file),
                    sent = false,
                    tid = null,
                    compressionStartTime = 0;
                    function failSend(){
                        if(!sent){
                            sent = true;
                            exec(json, 0);
                            if(ldbg){logDebug('sent in failSend');}
                        }
                    }
                    w.onerror = function (error) {
                        clearTimeout(tid);
                        failSend();
                        logWarning(error.message);
                        w.terminate();
                    };
                    w.onmessage = function (event) {
                        clearTimeout(tid);
                        var compressionEndTime = U.tms();
                        if (event.data === 'Decompress fail' || event.data === 'Compress fail' || event.data.indexOf("error:") == 0) {
                            if(ldbg){logDebug(event.data);}
                            failSend();
                        }
                        if (!sent) {
                            sent = true;
                            exec(event.data, compressionInt);
                        }
                        if (ldbg) {
                            logDebug('Ratio (' + event.data.length + '/' + json.length + '): ' + (event.data.length * 100.0 / json.length).toFixed(2) + '% -> C_T: ' + (compressionEndTime - compressionStartTime) + ' ms (' + compressionEndTime + '-' + compressionStartTime + ')');
                        }
                        w.terminate();
                    };
                    if (ldbg) {
                        logDebug('posting to worker: ' + json);
                    }
                    compressionStartTime = U.tms();
                    w.postMessage({
                        type: compressionInt,
                        json: json
                    });
                    // this timeout will happen if the worker took too long or if the worker js is missing
                    tid = setTimeout(function () {
                        failSend();
                        w.terminate();
                    }, conf.compr_timeout);
                } catch(e) {
                    if (ldbg) { logDebug('compression worker exception ' + e); }
                    exec(json, 0);
                }
            }
	    else {
                // the 2nd arg of 0 is the uncompressed flag
                exec(json, 0);
            }
        }

        /**
         * Makes the basics of a geo pixel.
	 * Note that page params MUST come last.
	 * 
	 * @param pp - Page Params to use as the seed 
	 * for the environmental page params we append 
	 * in buildGeoPageParams()
	 * 
	 *  s = spaceid
	 *  t = timestamp+random (for cache busting)
	 * _R = referrer
	 * _I = yrid value.  See Bug:6408635
         **/
        function makeGeo(type, pp, spaceid) {
            return U.curProto() + GEO_BASE + '/' + type + ['?s=' + (spaceid ? spaceid : conf.spaceid), 't=' + U.rand() + ',' + Math.random(), '_I='+conf.yrid, '_AO='+conf.oo, '_NOL='+conf.nol, '_R=' + U.enc(conf.getReferrer()), (type === 'c' ? '_K=' : '_P=') + buildGeoPageParams(pp)].join('&');
        }

        // This returns a URI safe string representing page params
        // Note that ctrl-E is ALREADY uri safe at this point
        // TODO: Need an A_ param for pageviews

        function buildGeoPageParams(initPP) {
	    var pp = new PageParams(buildBP(false));
	    pp.absorb(conf.keys.getAll());
            pp.set('_ts', ts());
	    if(initPP){
		if(!(initPP instanceof PageParams)){
		    logError("Internal error in buildGeoPP: not PP type");
		}
		else{
	    	    pp.absorb(initPP.getAll());
		}
	    }
            return conf.version + '%05' + pp.ser();
        }

        function buildGeoClick(clickEvent) {
            var b = [makeGeo('c') + '&_C=' + U.ser(clickEvent.data)];
            return b.join('&');
        }
        // pull map[key] out where the value is expected to be an int

        function getMapVal(map, key) {
            var num = map[key];
            if (num && U.isNum(num) && num >= 0) {
                return num;
            }
            return null;
        }
        /***
         * target - the anchor element possibly having the attributes for the action
         **/

        function getExtraAction(target) {
            var data_action = U.getAttribute(target, U.DATA_ACTION),
            action_response = U.getAttribute(target, U.data_action_outcome);
            if (data_action !== null) {
                return getMapVal(conf.ywa_action_map, data_action);
            } else
                if (action_response !== null) {
                    return getMapVal(conf.ywa_outcome_map, action_response);
                }
            return null;
        }

        return {
            sendGeoT: function (payload) {
                var b = [U.curProto(), GEO_BASE, '/t?', payload].join("");
                sb(b);
            },
	    sendGeoPV: function(){
                sb(makeGeo('b'));
	    },
            sendRapidNoDelay: function (modules, isPageview, pageParams, options, geoOnly) {
		if(!conf.yql_enabled || geoOnly){
                    var ppObj = null;
                    if(pageParams){
                        ppObj = new PageParams(pageParams);
                    }
                    sb(makeGeo(isPageview ? 'b' : 'p', ppObj));
		}
		else{
                    sendRapidFinal(modules, isPageview, pageParams, options);
		}
            },
            sendRapid: function (modules, isPageview, pageParams, options) {
                sendRapidThrottled(modules, isPageview, pageParams, options);
            },
            sendRefreshedContent: _sendRefreshedContent,
	    sendYWAEvent:function(customEvent, cb){
                var event_number = null,
                extra_action = null,
                event_name = customEvent.name;
                if (conf.ywa_action_map && event_name) {
                    event_number = getMapVal(conf.ywa_action_map, event_name);
                }
                // dont send YWA beacon when not in ywa_action_map
                if (event_number === null) {
                    return;
                }
                // it's possible to log x= values for both YWA_ACTION_MAP
                // AND YWA_OUTCOME_MAP, so check again here
                if (conf.ywa_outcome_map && customEvent.outcome) {
                    extra_action = getMapVal(conf.ywa_outcome_map, customEvent.outcome);
                }
                sb(buildYWAPixel('e', event_number, extra_action, null, customEvent.data), cb);
	    },
	    sendULTEvent: function(customEvent, spaceidOverride){
		var customPP = {};
		if(customEvent && customEvent.data){
		    customPP = customEvent.data;
		}
                var beacon = makeGeo('p', new PageParams(customPP), spaceidOverride || 0);
		if(customEvent.type){
		    beacon += '&_V=' + customEvent.type.spaceidPrefix;
		}
		sb(beacon);
	    },
	    /**
	     * Diff from sendULTEvent in that we may have a spaceid that needs to be overridden.
	     * Pull it out and pass into sendULTEvent just to keep things separated and clean.
	     **/
	        /*
            sendDwell:function(customEvent){
		        this.sendULTEvent(customEvent, customEvent.data.s);
	        },
            */
            sendEvents: function (customEvent, cb) {
                if (conf.USE_RAPID) {
		    this.sendULTEvent(customEvent);
                }
                if (conf.ywa) {
		    this.sendYWAEvent(customEvent, cb);
                }
            },
            sendClick: function (clickEvent, callback) {
                var redirect = null,
                geo = '',
                ywa_click_beacon = '',
                extra_ywa_action = null,
                redirectDone = false,
                tid = null;

                if (conf.USE_RAPID) {
                    geo = buildGeoClick(clickEvent);
                }
                if (conf.ywa) {
                    var click_data = clickEvent.data,
                    target = clickEvent.targetElement;
                    var ywa_click_parts = {
                        18: click_data.sec, //sec
                        19: click_data.slk, //slk
                        20: click_data._p //pos
                    };

		    // Map click keys to YWA custom fields
                    if ('A_cl' in click_data) {
                        ywa_click_parts['130'] = click_data.A_cl;
                    }
                    if ('A_lv' in click_data) {
                        ywa_click_parts['131'] = click_data.A_lv;
                    }

                    // not called via public beaconClick(), need to grab
                    // extra action from anchor attribute
                    if (target) {
                        extra_ywa_action = getExtraAction(target);
                    } else {
                        extra_ywa_action = getMapVal(conf.ywa_outcome_map, clickEvent.outcome);
                    }

                    // YWA_CF_MAP used for both pp and links!
                    if (conf.ywa_cf_override) {
                        // before entering this func, click_parts has been populated
                        // with data-ylk per link values
                        applyCFMap(click_data, ywa_click_parts);
                    }
                    ywa_click_beacon = buildYWAPixel('c', 0, extra_ywa_action, ywa_click_parts);
                }

                // Check if NOT a synchronous click, just send both ult and rapid and move on 
                if(conf.async_all_clicks || !clickEvent.synch){ 
                    if (geo) {
                        sb(geo, callback);
                    }
                                                            
                    if (ywa_click_beacon) {
                        if(!geo) {
                            sb(ywa_click_beacon, callback)
                        } else {
                            sb(ywa_click_beacon);
                        }
                    }
                    return;
                }

                // synchronous at this point
                U.prevDef(clickEvent.event);
                redirect = function () {
                    // prevent accidental double redirect when timeout on geo.y.c click beacons happens
                    if (redirectDone) {
                        return;
                    }
                    redirectDone = true;
                    if(callback) {
                        callback.call();
                        return;
                    }
                    var href = clickEvent.targetElement.href;
                    if (conf.click_postmsg['origin']) {
                        var targetWin = conf.click_postmsg['window'] || top;
                        var data = conf.click_postmsg['payload'] || {};
                        data['href'] = href;
                        targetWin.postMessage(U.toJSON(data), conf.click_postmsg['origin']);
                    } else {
                        if (clickEvent.hasTargetTop) {
                            top.document.location = href;
                        } else {
                            document.location = href;
                        }
                    }
                };

                if (conf.USE_RAPID) {
                    if (conf.ywa) {
                        var i = new Image(),
                        i2 = new Image(),
                        count = 0;
                        i.onload = i.onerror = i.onabort = i2.onload = i2.onerror = i2.onabort = function () {
                            if (++count === 2) {
                                clearTimeout(tid);
                                redirect();
                            }
                        };
                        // send the pixels
                        i.src = geo;
                        i2.src = ywa_click_beacon;
                        // Just keep this around to stop gc. This isn't the click timeout.
                        // now set the timeout
                        tid = setTimeout(redirect, conf.click_timeout);
                        setTimeout(function () {
                            i = null;
                            i2 = null;
                        }, 1e7);
                    } else { // no ywa, just send geo
                        sb(geo, redirect);
                    }
                } else {
                    if (conf.ywa) { // No Geo, just YWA
                        sb(ywa_click_beacon, redirect);
                    }
                }
            },
            sendYWAPV: function (pp) {
                var url = buildYWAPixel('p', 0, 0, 0, 0, pp),
                heads = document.getElementsByTagName('head'),
                tr = 'true';
                if (heads.length === 0) {
                    return;
                }
                var n = U.make('script', {'defer':tr, 'async':tr, 'type':'text/javascript', 'src':url});
                function rm() {
                    heads[0].removeChild(n);
                }
                if (U.isIE) {
                    n.onreadystatechange = function () {
                        // NEED TO HANDLE READYSTATE
                        // http://developer.yahoo.com/yui/docs/Get.js.html
                        var rs = this.readyState;
                        if ('loaded' === rs || 'complete' === rs) {
                            n.onload = n.onreadystatechange = null;
                            rm();
                        }
                    };
                } else
                    if (U.isWebkit) {
                        n.addEventListener('load', rm);
                    } else {
                        n.onload = rm;
                    }
                heads[0].appendChild(n);
            },
	    sendInternalSearch:function(searchTerm, numSearchResults){
		searchTerm = searchTerm||'';
		if(!U.isNum(numSearchResults)){numSearchResults = 0;}
		var searchData = {
		    isk:searchTerm,
		    isr:numSearchResults
		};
        	var b = buildYWAPixel('e', 'INTERNAL_SEARCH', null, null, null, null, searchData);
		sb(b);
	    },
	    sendYWAECommerce:function(action, data){
		var ecom_data = {}, 
		ecom_acts_ok = {'PRODUCT_VIEW':1, 'ADD_TO_CART':1, 'CANCELLED_SALE':1, 'PENDING_SALE':1, 'SALE':1},
		ecom_ok = {'amount':'xa', 'orderId':'oc', 'tax':'xt', 'shipping':'xs', 'discount':'xd', 'sku':'p', 'units':'q', 'amounts':'r'};

		// filter attempts to log unsupported ecommerce actions
		if(!(action in ecom_acts_ok)){
		    logError('invalid YWA ecommerce action: ' + action);
		    return;
		}
		// filter attempts to log unsupported dimensions
		for(var i in data){
		    if(U.hasOwn(data, i)){
			if(i in ecom_ok){
			    var ywa_key = ecom_ok[i];
			    ecom_data[ywa_key] = data[i];
			}
		    }
		}
		// bug 6644735 - change the action to 1 if its SALE.
		if(action === 'SALE') {
		    action = 1;
		}
        	var b = buildYWAPixel('e', action, null, null, null, null, ecom_data);
		sb(b);
	    }
        };
    }

    /**
     * Filter used below by Link to stop people from trying to override link-level keys
     * with sec,slk,_p. This is passed as the filter func to Utils.aug().
     * Anything we don't want people to override should appear here.
     **/

    function implicitKeyFilter(key) {
        return key !== 'sec' && key !== 'slk' && key !== '_p';
    }

    /**
     * module_ltattr: the way to track links (href,id etc)
     * module_name: actual module name that we will log as sec
     * module_ylk: the ylk for the module this link lives in
     * position: position of the link
     * anchor_el: dom element - could be anchor or button - (made it optional)
     **/

    function Link(module_ltattr, module_name, position, anchor_el, link_slk, skipped_div, useViewability) {
        var link_text = '',
        link_key_pairs = null;
        var viewable = useViewability ? U.isAboveFold(anchor_el) : true;
        var rv = {
            viewable:viewable,
            data:{
                sec: module_name,
                _p: position
            }
        };
        if (useViewability) {
            U.aug(rv.data, {A_lv:1});
        }
        if (!skipped_div) {
            anchor_el.setAttribute(conf.anc_pos_attr, position); // set the data-rapid_p value on the anchor
            if(useViewability){
                anchor_el.setAttribute(conf.anc_v9y_attr, viewable ? '1' : '0');
                //anchor_el.setAttribute(conf.anc_v9y_attr, U.isAboveFold(anchor_el) ? '1' : '0');
            }
            link_text = U.getLT(anchor_el, module_ltattr);
            if (link_text && link_text !== '') {
                link_key_pairs = getLK(anchor_el);
            } else {
                link_text = '_ELINK_';
            }
            // need to explicitly encode slk (10/23/14 revert change for now)
            /*link_text = U.enc(link_text);
            link_text = link_text.replace(/'/g, "%27");*/
            rv.data.slk = link_slk ? link_slk : link_text;
        } else {
            rv.data.slk = link_slk || 'section';
            link_key_pairs = getLK(anchor_el);
        }
        if (link_key_pairs !== null) {
            U.aug(rv.data, link_key_pairs.getAll());
        }
        return rv;
    }

    function ModulesList() {
        var modules_map = {};
        return {
            addModule: function (element_id, module) {
                modules_map[U.norm(element_id)] = module;
            },
            addModules: function (modules, useViewability) {
                var is_arr = U.isArr(modules),
                newMods = [];
                if (!is_arr) {
                    if (U.isStr(modules)) {
                        modules = new Array(modules);
                        is_arr = true;
                    }
                }
                for (var i in modules) {
                    if (!U.hasOwn(modules, i)) {
                        continue;
                    }
                    var elementid_to_track = (is_arr ? modules[i] : i),
                    mod_name = U.trim(modules[i]);
                    if (!this.exists(elementid_to_track)) {
                        var m = Module(mod_name, elementid_to_track, useViewability);
                        if (m) {
                            this.addModule(elementid_to_track, m);
                            newMods.push(m);
                        }
                    } else {
                        logError('addModules() called with prev processed id:"' + elementid_to_track + '"');
                    }
                }
                return newMods;
            },
            //regrettable
            getModules: function () {
                return modules_map;
            },
	    getModulesWithViewability:function(){
		var rv = {};
		for(var m in modules_map){
		    var cur = modules_map[m];
		    if(cur.useViewability){
			rv[m] = cur;
		    }
		}
		return rv;
	    },
	    reevaluateModuleViewability:function(){
		var viewabilityMods = this.getModulesWithViewability();
		for(var mod_name in viewabilityMods){
		    var cur_mod = viewabilityMods[mod_name];
		    cur_mod.reevaluateViewableLinks();   
		}
	    },
            refreshModule: function (module_element_id, isPageView, shouldSendLinkviews, options) {
                var m = modules_map[U.norm(module_element_id)];
                if (m) {
                    m.refreshModule(module_element_id, isPageView, shouldSendLinkviews, options);
                } else {
                    logError('refreshModule called on unknown section: ' + m);
                }
            },
            removeModule: function (element_id) {
                var m = modules_map[U.norm(element_id)];
                if (m) {
                    m.removeHandlers();
                    delete modules_map[element_id];
                }
            },
            destroy: function () {
                for (var mod in modules_map) {
                    if (U.hasOwn(modules_map, mod)) {
                        this.removeModule(mod);
                    }
                }
                modules_map = {};
            },
            exists: function (module_name) {
                return modules_map[U.norm(module_name)];
            }
        };
    }

    function ltattrForModule(mod, default_val) {
        if (U.hasClass(mod, 'rapid_track_href')) {
            return 'href';
        }
        if (U.hasClass(mod, 'rapid_track_text')) {
            return 'text';
        }
        if (U.hasClass(mod, 'rapid_track_title')) {
            return 'title';
        }
        if (U.hasClass(mod, 'rapid_track_id')) {
            return 'id';
        }
        return default_val;
    }

    function isSubmitButton(el) {
        return (el.nodeName.toLowerCase() === 'input') && (U.getAttribute(el, 'type') === 'submit');
    }

    function handleClick(e, module_object) {
        var click = ClickEvent(e, module_object);
	currentClickEvent = click;
        // could be invalid - perhaps a link clicked on we didnt know about
        if (click) {
            if (dwellManager) {
                dwellManager.set_state('stop');
            }
            uploader.sendClick(click);
        }
    }

    //test if open in new window, or if page was coded that way
    //e: the event that occurred
    //targ: the link element that was clicked
    //module_target: the module element that was clicked

    function hasClickModifier(e, targ, module_target) {
        var getAttr = U.getAttribute;
        //nav header in class lego has nofollow on module, this will expose it.
        return ((targ.target && targ.target.toLowerCase() === '_blank') ||
                e.which === 2 || e.button === 4 ||
                e.altKey || e.ctrlKey || e.shiftKey || e.metaKey ||
                (getAttr(targ, 'data-nofollow') === 'on') ||
                (getAttr(targ, 'href') && getAttr(targ, 'href').substr(0, 11).toLowerCase() === 'javascript:') ||
                (U.hasClass(targ, conf.nofollow_classname)) ||
                (U.hasClass(module_target, conf.nofollow_classname))
               );
    }

    function CustomEvent(eventType, eventName, data, outcome) {
        data = data || {};
	var type = null;
	// if eventType is not null, then it's a YAHOO.i13n.EventType from which we can extract data
	// otherwise it was likely a simple event
	if(eventType){
	    type = YAHOO.i13n.EventTypes.getEventByName(eventType);
	    data._E = type.getEventName();
	    eventName = data._E;
	}
	else{
            data._E = eventName || '_';
	}
        if (outcome) {
            data.outcm = outcome;
        }
        return {
	    type: type,
            name: eventName,
            data: data,
            outcome: outcome
        };
    }

    /**
     * e: the click event
     * module_object: instance of a Module where click occurred
     * Returns an object instance representing a click, or null/0 indicating something went wrong w/ click processing.
     **/

    function ClickEvent(e, module_object) {
        e = e || event;
        var targ = U.getTarget(e),
        BUTTON = 'button',
	INPUT = 'input',
        target_node_name = '',
        synchronous = false,
        rv = null;
        while (targ && (target_node_name = targ.nodeName.toLowerCase()) && (target_node_name !== 'a' && target_node_name !== BUTTON && !isSubmitButton(targ) && !U.hasClass(targ, conf.nonanchor_track_class))) {
            targ = targ.parentNode;
        }
        // The !targ case shouldn't really happen.  Also, ignore the click when no_click_listen class is set on the target
        if (!targ || U.hasClass(targ, conf.no_click_listen)) {
            return 0;
        }
        if (U.hasClass(targ, conf.nonanchor_track_class)) { // Check if we're tracking one of those white-space cards, ie, Zed/Beachhead
            rv = {
                pos: 0,
                sec: module_object.moduleName,
                slk: '_'
            };
            // override the values if data-ylk present
            var lk = getLK(targ, 1);
            if (lk) {
                U.aug(rv, lk.getAll());
            }
        } else { // This is the regular link click case
            var pos = U.getAttribute(targ, conf.anc_pos_attr); // get position out of DOM
            rv = module_object.getLinkAtPos(pos); // returns to an instance of Link type
            // do we know about this link?  Could have been added to DOM
            // on the fly w/o calling refreshModule
            if (!rv) {
                return 0;
            }
            rv = rv.data;
            // send sync if not a button AND (it doesn't have nofollow or target top == 'blank', etc)
            if (target_node_name !== INPUT && target_node_name !== BUTTON && !hasClickModifier(e, targ, module_object.moduleElement)) {
                synchronous = true;
            }
        }
        // autolog destination domain in 'tar' on click bug:6217863
        // ONLY if it wasn't already present in data-ylk
        if (!rv.tar) {
            var href = U.getAttribute(targ, 'href');
            if (href) {
                rv.tar = U.extDomain(href);
            }
            // rv.tar could now be null if the link was a relative link
            if (!href || !rv.tar) {
                rv.tar = U.extDomain(conf.loc);
            }
        }
        
        // autolog destination uri in 'tar_uri' on click bug: 6790449
        // ONLY if it wasn's already present in data-ylk
        if (!rv.tar_uri) {
            if(targ.pathname) {
                rv.tar_uri = targ.pathname.substring(0, U.MAX_VALUE_LENGTH);
            }
            else
                rv.tar_uri = '';
        }
        var module_ylk = module_object.moduleYLK;
        if (module_ylk) {
            var m_ylk = module_ylk.getAll();
            U.aug(rv, m_ylk, function (key) {
                return !(key in rv);
            });
        }

        rv.A_xy = U.xy(e);
        rv.A_sr = U.sr();

        if (e.type == "contextmenu") {
            rv.A_cl = 3;
            synchronous = false;
        }

        return {
            data: rv,
            event: e,
            moduleElement: module_object.moduleElement,
            targetElement: targ,
            synch: synchronous,
            hasTargetTop: (targ && targ.target && targ.target.toLowerCase() === '_top')
        };
    }

    function ManualClick(sec, slk, pos, opt_keys, outcome_name) {
        // passed in sec/slk/pos take priority over appearance
        // of those keys in opt_keys
        var rv = {}; // careful not to naively assign to opt_keys and mutate it
        U.aug(rv, opt_keys);
        rv.sec = sec;
        rv.slk = slk;
        rv._p = pos;
        return {
            data: rv,
            outcome: outcome_name,
            event: null,
            moduleElement: null,
            targetElement: null,
            synch: false,
            hasTargetTop: false
        };
    }

    /*****
     * returns elements with given tag name that appears in <list>
     * See: http://www.quirksmode.org/dom/getElementsByTagNames.html
     * list: comma seperated list of tag name strings
     * obj: dome object from which to pull child tags that appear in list
     * filter_func: optional argument that when present is used to filter which tags we want to return with
     ****/

    function getElementsByTagNames(list, obj, filter_func) {
        if (!obj) {
            obj = document;
        }
        var tagNames = list.split(','),
        resultArray = [];
        for (var i = 0, ilen = tagNames.length; i < ilen; i++) {
            var tags = obj.getElementsByTagName(tagNames[i]);
            for (var j = 0, jlen = tags.length; j < jlen; j++) {
                var cur_tag = tags[j];
                if (filter_func && !filter_func.call(0, cur_tag)) {
                    continue;
                }
                resultArray.push(cur_tag);
            }
        }
        var testNode = resultArray[0];
        if (!testNode) {
            return [];
        }
        if (testNode.sourceIndex) {
            resultArray.sort(function (a, b) {
                return a.sourceIndex - b.sourceIndex;
            });
        } else if (testNode.compareDocumentPosition) {
            resultArray.sort(function (a, b) {
                return 3 - (a.compareDocumentPosition(b) & 6);
            });
        }
        return resultArray;
    }
    
    function getElementsByTagNamesDOMParsing(list, obj, resultArray, filter_func) {
        if(!obj) {
            obj = document;
        }
        var tagNames = list.split(',');
        resultArray = resultArray || [];
        var children = obj.childNodes;
        if (U.getAttribute(obj, conf.skip_attr) !== "true") {
            for (var i = 0, ilen = children.length; i < ilen; i++) {
                var cur_tag = children[i];
                if (U.isTagOfInterest(cur_tag, tagNames)) {
                    if (!filter_func || filter_func.call(0, cur_tag)) {
                        resultArray.push(cur_tag);
                    }
                }
                if (U.getAttribute(cur_tag, conf.skip_attr) !== "true") {
                    getElementsByTagNamesDOMParsing(list, cur_tag, resultArray, filter_func);
                }
                else if (U.getAttribute(cur_tag, conf.skip_attr) === "true") {
                    // Assuming here that the attribute will be on a div
                    resultArray.push(cur_tag);
                }
            }
        }
        var testNode = resultArray[0];
        if (!testNode) {
            return [];
        }
        if (testNode.sourceIndex) {
            resultArray.sort(function (a, b) {
                return a.sourceIndex - b.sourceIndex;
            });
        } else if (testNode.compareDocumentPosition) {
            resultArray.sort(function (a, b) {
                return 3 - (a.compareDocumentPosition(b) & 6);
            });
        }
        return resultArray;
    }


    // mod_name: string value of the module we're tracking
    // el_id: element id in dom to inspect
    // useViewability: should viewability be used
    function Module(mod_name, el_id, useViewability) {
        var module_element = document.getElementById(el_id),
        tags_of_interest = 'a,button,input';
        if (!module_element) {
            logWarning("Specified module not in DOM: " + el_id);
            return null;
        }
        var module_ylk = getLK(module_element),
        links = [], // the actual Link instances 
        link_els = conf.parse_dom ? getElementsByTagNamesDOMParsing(tags_of_interest, module_element) : getElementsByTagNames(tags_of_interest, module_element),
        // module_ltattr tells us how to track links for each module
        module_ltattr = ltattrForModule(module_element, conf.lt_attr),
        numLinks = link_els.length, // initial value, could change after calls to refreshModule()
        trackType = U.getAttribute(module_element, conf.track_type);

        /***
         * Starts tracking the links in the links_arr.  Creates Link instances, writes data-rapid_p to the elements.
         * Returns the new (delta) links
         * links_arr: array of links we want to START tracking
         **/

        function startTrackingLinks(links_arr, start_pos) {
            var rv = [];
            start_pos = start_pos || 1;
            for (var i = 0, num_links = links_arr.length; i < num_links; i++) {
                if (links_arr[i].tagName.toLowerCase() === "div") {
                    // Special handling for skipped div
                    var skipped_div = links_arr[i];
                    var local_ylk = getLK(skipped_div);
                    var l = Link(module_ltattr, module_ylk.map.sec || mod_name, 1, skipped_div, local_ylk.map.slk || module_ylk.map.slk, true, useViewability);
                    links[0] = l;
                    rv.push(l);
                } else { // regular linkview
                    var linkElement = links_arr[i];
                    var l = Link(module_ltattr, module_ylk.map.sec || mod_name, start_pos, linkElement, module_ylk.map.slk, 0, useViewability);
                    links[start_pos-1] = l;
                    rv.push(l);
                    start_pos++;
                }
            }
            if (U.getAttribute(module_element, conf.skip_attr) === "true") {
                var l = Link(module_ltattr, module_ylk.map.sec || mod_name, 1, skipped_div, module_ylk.map.slk, true, useViewability);
                links[0] = l;
                rv.push(l);
            }
            return rv;
        }

        function getRevisedLinks(links_arr){
            var rv = [];
            for (var i = 0, num_links = links_arr.length; i < num_links; i++) {
                var linkElement = links_arr[i];
                var pos = U.getAttribute(linkElement, conf.anc_pos_attr);
                var l = Link(module_ltattr, module_ylk.map.sec || mod_name, pos, linkElement, module_ylk.map.slk, 0, true);
                rv.push(l);
            }
            return rv;
        }

        function filter_func(element) {
            return !U.getAttribute(element, conf.anc_pos_attr); // does it have data-rapid_p?
        }

        startTrackingLinks(link_els);

        var module_object = {
            useViewability:useViewability,
            moduleYLK: module_ylk,
            links: links,
            moduleName: mod_name,
            trackType: trackType,
            moduleElement: module_element,
            refreshModule: function (refreshed_elementid, isPageView, shouldSendLinkviews, options) {
                options.isRefreshed = true;
                var new_link_els = conf.parse_dom ? getElementsByTagNamesDOMParsing(tags_of_interest, U.$(refreshed_elementid), null, filter_func) : getElementsByTagNames(tags_of_interest, U.$(refreshed_elementid), filter_func);
                if (isPageView === true || (new_link_els.length > 0) ) {
                    // add +1 to set counting position 1 beyond current value
                    var newlinks = startTrackingLinks(new_link_els, numLinks + 1);
                    numLinks += new_link_els.length;
                    // check if any of the new links are viewable before sending
                    var num_viewable_links = new_link_els.length;
                    if(useViewability) {
                        num_viewable_links = 0;
                        for (var i = 0, len = newlinks.length; i < len; i++) {
                            if ( newlinks[i].viewable ) {
                                num_viewable_links++;
                            }
                        }
                    }
                    // allow this to go through even if USE_RAPID==false if a 'complex' event such as 'rich view' is logged.
                    if ( (isPageView === true || num_viewable_links > 0) && (conf.USE_RAPID || options.event)) {
                        var module_copy = {};
                        U.aug(module_copy, this);
                        if (shouldSendLinkviews) {
                            module_copy.links = newlinks;
                        } else {
                            module_copy.links = [];
                        }
                        // we need to capture the pageview no matter what, either of the conditions
                        // below satisfy the need to send data out.
                        if (isPageView === true || shouldSendLinkviews) {
                            uploader.sendRefreshedContent(module_copy, isPageView, options);
                        }
                    }
                } else if (U.ldbg) {
                    logDebug('refreshModule(' + refreshed_elementid + ') - no new links.');
                }
                // dont forget to send the ywa pageview if isPageView true.
                if (isPageView === true) {
                    if (conf.ywa) {
                        uploader.sendYWAPV(options.pp);
                    }
                    if (conf.apv && scrollManager) {
                        scrollManager.reInit();
                    }
                }
            },

            /**
             * notice in the closure below that we return true when having not been viewed and then return false
             * right outside of that.  This causes links.length to get strange values and causes the _p count problem.
             */
            reevaluateViewableLinks:function(){
                var linkPos = links.length;
                var new_link_els = getElementsByTagNames('a', this.moduleElement, (function(pos){
                    return function(element){
                        if(!U.getAttribute(element, conf.anc_pos_attr)){
                            pos++;
                            element.setAttribute(conf.anc_pos_attr, pos); // set the data-rapid_p value on the anchor
                            var l = Link(module_ltattr, module_ylk.map.sec || mod_name, pos, element, module_ylk.map.slk, 0, false);
                            links[pos-1] = l;
                        }
                        var v9yValue = U.getAttribute(element, conf.anc_v9y_attr);
                        // if not seen before and above fold, set as viewed and return as new link
                        if(v9yValue !== '1' && U.isAboveFold(element)){
                            element.setAttribute(conf.anc_v9y_attr, '1');
                            return true;
                        }
                        return false;
                    };
                })(linkPos));
                if(new_link_els.length === 0){return;}
                if(conf.USE_RAPID){
                    var newViewables = getRevisedLinks(new_link_els);
                    var module_copy = {};
                    U.aug(module_copy, this);
                    module_copy.links = newViewables;
                    uploader.sendRefreshedContent(module_copy, false, {});
                }
            },
            removeHandlers: function () {
                U.rmEvent(module_element, 'click', callback);
                if (conf.track_right_click) {
                    U.rmEvent(module_element, 'contextmenu', callback);
                }
            },
            getLinkAtPos: function (pos) { //recall that positioning starts at 0, but we're indexing into an array
                if (pos > links.length) {
                    return null;
                }
                return links[pos - 1];
            },
            identifier: el_id
        };

        var callback = function (e) {
            handleClick(e, module_object);
        };
        U.addEvent(module_element, 'click', callback);
        if (conf.track_right_click) {
            U.addEvent(module_element, 'contextmenu', callback);
        }
        return module_object;
    }

    function _beaconPageview(pp, generateNewSID, geoOnly){
        if (conf.ldbg) {
            logDebug('beaconPageview called, pp=' + U.fData(pp));
        }
	if(generateNewSID && !conf.persist_asid){
            regenSid(); // beaconPageview should have a new A_sid
	}
        if (conf.USE_RAPID || (conf.apv_always_send && U.hasOwn(pp, 'A_apv'))) {
            uploader.sendRapidNoDelay([], true, pp, null, geoOnly);
        }
        if (conf.ywa) {
	    var ywa_pp = PageParams.makeFromPP(conf.keys);
	    ywa_pp.absorb(pp);	
	    uploader.sendYWAPV(ywa_pp.getAll());
        }
        if (conf.apv && scrollManager != null) {
            scrollManager.reInit();
        }
    }

    function _beaconEvent (event, data, outcome, cb) {
        if (conf.ldbg) {
            logDebug('beaconEvent: event="' + event + '" data=' + U.fData(data) + ' outcome=' + outcome);
        }
        var ev = CustomEvent(0, event, data, outcome);
        uploader.sendEvents(ev, cb);
    }


    var PubSub = (function(){
	var subs = {};
	return {
	    subscribe:function(event, fun){
		var list = subs[event];
		if(!list){
		    list = [];
		    subs[event] = list;
		}
		list.push(fun);
	    },
	    unsubscribe:function(event, fn){
		var list = subs[event];
		if(!list){return;}
		for(var i = 0; i < list.length; i++){
		    if(list[i] === fn){
			list.splice(i, 1);
			return;
		    }
		}
	    },
	    fire:function(event){
		var list = subs[event];
		if(!list){return;}
		for(var i = 0, len = list.length; i < len; i++){
		    list[i].call(null);
		}
	    }
	};
    })();

    var BrowserEvents = {
	FOCUS:'focus',
	BLUR:'blur',
	BEFOREUNLOAD:'beforeunload',
	PAGEHIDE:'pagehide',
	HISTORYSTATECHANGED:'historystatechanged',
	NAVIGATE:'navigate'
    };

    function BrowserEventManager(){
	focusFun = function(e){
	    PubSub.fire(BrowserEvents.FOCUS);
	},
	blurFun = function(e){
	    PubSub.fire(BrowserEvents.BLUR);
	},
	unloadFun = function(e){
	    PubSub.fire(BrowserEvents.BEFOREUNLOAD);
	};

	U.addEvent(window, BrowserEvents.FOCUS, focusFun);
	U.addEvent(window, BrowserEvents.BLUR, blurFun);

	if(U.isIOSSafari || U.isAndroid){
	    U.addEvent(window, BrowserEvents.PAGEHIDE, unloadFun);
	}
	else{
	    U.addEvent(window, BrowserEvents.BEFOREUNLOAD, unloadFun);
	}

	this.historyStateChanged = function(){
	    PubSub.fire(BrowserEvents.HISTORYSTATECHANGED);
	};
    }

    // Original Dwell implementation:
    // http://svn.corp.yahoo.com/view/yahoo/media/common/projects/common/trunk/assets/js/dwell-time.js?revision=1451807&view=markup
    /*
      function DwellManager(){
      // Original implmentation sent 20 events max
      var DWELLVERSION = 1, DWELLCOOKIE = 'TT', LOCAL_STORAGE_KEY = 'yi13n_rapid_dwell', numDwellSent = 0, MAX_DWELL_EVENTS = 20, MAX_DWELL_COOKIE_LENGTH = 256;

      function concatDwell(oldVal, newVal){
      if(!oldVal){
      return newVal;
      }
      return oldVal + '|' + newVal;
      }

      function parseDwellList(dwell, dest){
      var parts = dwell.split(/\|/);
      for(var i = 0, len = parts.length; i < len; i++){
      dest.push(parts[i]);
      }
      }

      function makeDwellCookieValue(){
      // use _ts to match mobile to log wall-time of events sent from the future.
      var parts = ['A_sid='+keys.get('A_sid'), 's=' + conf.spaceid, '_ts='+ts(), 'd=bu', 'v=' + DWELLVERSION, 'yrid=' + conf.yrid];
      // Old dwell time grabbed pt, we will too.
      var pageType = keys.get('pt');
      if(pageType){
      parts.push('pt=' + pageType);
      }
      return parts.join('&');
      }

      function parseDwell(d){
      if(!d){return null;}
      var pieces = d.split('&'), rv = {};
      for(var i = 0, len = pieces.length; i < len; i++){
      var cur = pieces[i];
      if(!cur){continue;}
      var parts = cur.split('=');
      if(parts && parts.length === 2){
      rv[parts[0]] = parts[1];
      }
      }
      return rv; 
      }

      function setDwellCookie(){
      var cooks = new CookieMap(), dwellCookie = cooks.getCookieByName(DWELLCOOKIE), curDwellCookie = cooks.getCookieByName(DWELLCOOKIE);

      if(curDwellCookie && curDwellCookie.length > MAX_DWELL_COOKIE_LENGTH){
      return;
      }
      var newDwell = concatDwell(dwellCookie, makeDwellCookieValue());
      document.cookie = DWELLCOOKIE + "=" + newDwell + "; path=/; Expires=Fri, 07 Mar 2025 16:00:00 GMT; Domain=.yahoo.com;";
      }

      function setLocalStorage(){
      var old = localStorage.getItem(LOCAL_STORAGE_KEY);
      var newDwell = concatDwell(old, makeDwellCookieValue());
      localStorage.setItem(LOCAL_STORAGE_KEY, newDwell);
      }

      function handleUnload(){
      var sameDomain = false;
      if(currentClickEvent){
      var destDomain = currentClickEvent.data.tar;
      var curDomain = U.extDomain(window.location.href);
      sameDomain = (destDomain === curDomain);
      }
      if(sameDomain && U.hasLS()){
      setLocalStorage();
      }
      else if(U.hasLS()){
      setDwellCookie();
      }
      }

      function getDwellCookies(dest){
      var cooks = new CookieMap(), dwell = cooks.getCookieByName(DWELLCOOKIE);
      if(!dwell){return;}
      if (conf.ldbg) {
      logDebug('Dwell cookie: ' + dwell);
      }
      parseDwellList(dwell, dest);
      U.clearCookie(DWELLCOOKIE);
      }

      function getLocalStorage(dest){
      var dwell = localStorage.getItem(LOCAL_STORAGE_KEY);
      if(!dwell){return;}
      if (conf.ldbg) {
      logDebug('Dwell LS: ' + dwell);
      }
      parseDwellList(dwell, dest);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      }

      function fireDwell(dwellEvent){
      if(numDwellSent++ < MAX_DWELL_EVENTS){
      uploader.sendDwell(CustomEvent('dwell', 0, {dwell:dwellEvent}));
      }
      }

      function flushDwells(){
      var dwells = [];
      getDwellCookies(dwells);
      if(U.hasLS()){
      getLocalStorage(dwells);
      }
      for(var i = 0, len = dwells.length; i < len; i++){
      var dwell = parseDwell(dwells[i]);	
      delete dwell.v;
      var dwellAction = dwell.d;
      delete dwell.d;
      dwell.dwell = dwellAction;
      uploader.sendDwell(CustomEvent('dwell', 0, dwell));
      }
      }

      function blurCB(){
      fireDwell(BrowserEvents.BLUR);
      }

      function unsubscribeAll(){
      for(var i = 0; i < subs.length; i++){
      PubSub.unsubscribe(subs[i].ev, subs[i].fn);
      }
      }

      function focusCB(){
      fireDwell(BrowserEvents.FOCUS);
      // after 10 mins don't fire dwells.
      // but dont start timer until first dwell because 
      // otherwise page opened in other tab will start timer
      setTimeout(function(){
      fireDwell('idle');
      unsubscribeAll();
      }, 10 * 60 * 1000); //timeout in 10 mins
      }

      function beforeUnloadCB(){
      unsubscribeAll();
      handleUnload();
      }

      function historyStateChangedCB(){
      unsubscribeAll();
      fireDwell(BrowserEvents.NAVIGATE);
      }

      var subs = [
      {'ev':BrowserEvents.BLUR, 'fn':blurCB},
      {'ev':BrowserEvents.FOCUS, 'fn':focusCB},
      {'ev':BrowserEvents.BEFOREUNLOAD, 'fn':beforeUnloadCB},
      {'ev':BrowserEvents.HISTORYSTATECHANGED, 'fn':historyStateChangedCB},
      ];

      for(var i = 0; i < subs.length; i++){
      PubSub.subscribe(subs[i].ev, subs[i].fn);
      }
      flushDwells();
      }
    */

    function ViewabilityManager(){
        /*
	  function blurCB(){
	  logDebug('blur');
	  }

	  function focusCB(){
	  logDebug('focus');
	  }
	  
	  function beforeUnloadCB(){
	  }

	  function historyStateChangedCB(){
	  }

	  var subs = [
	  {'ev':BrowserEvents.BLUR, 'fn':blurCB},
	  {'ev':BrowserEvents.FOCUS, 'fn':focusCB},
	  {'ev':BrowserEvents.BEFOREUNLOAD, 'fn':beforeUnloadCB},
	  {'ev':BrowserEvents.HISTORYSTATECHANGED, 'fn':historyStateChangedCB},
	  ];

	  for(var i = 0; i < subs.length; i++){
	  PubSub.subscribe(subs[i].ev, subs[i].fn);
	  }
        */
        var timer = null,
        pageLoadTime = new Date().getTime(),
        lastApvTime = pageLoadTime,
        pageLoadScrollY = U.getScrollY(),
        lastApvScrollY = -1,
        handleViewability = function() {
            var curScrollY = U.getScrollY(),
            scrollSize = (lastApvScrollY === -1) ? (curScrollY - pageLoadScrollY) 
                : (curScrollY - lastApvScrollY),
            asd = (scrollSize > 0) ? 0 : 1;
            if (Math.abs(scrollSize) > conf.viewability_px) {
		modules_map.reevaluateModuleViewability();
                lastApvScrollY = curScrollY;
                lastApvTime = new Date().getTime();
            }
        };
	var viewability_cb = function(){
            if (timer != null) {
                clearTimeout(timer);
            }
            var curTime = new Date().getTime();
            if((curTime - pageLoadTime) < conf.viewability_time) {
                pageLoadScrollY = U.getScrollY();
                lastApvTime = curTime;
            }
            timer = setTimeout(function() {
                handleViewability();
            }, conf.viewability_time);
        };
	U.addEvent(window, 'scroll', viewability_cb);
        this.reInit = function() {
            pageLoadScrollY = U.getScrollY();
            lastApvScrollY = -1;
            pageLoadTime = lastApvTime = new Date().getTime();
        }
	this.destroy = function() {
            U.rmEvent(window, 'scroll', viewability_cb);
        };
    }

/*
   var browserEventManager = null, dwellManager = null;
   if(conf.viewability){
	browserEventManager = new BrowserEventManager();
   }
   if(conf.dwell_on){
	dwellManager = new DwellManager();
   }
*/
    function ScrollManager() {
        var timer = null,
        pageLoadTime = lastApvTime = new Date().getTime(),
        pageLoadScrollY = U.getScrollY(),
        lastApvScrollY = -1,
        handleScroll = function() {
            var curScrollY = U.getScrollY(),
            scrollSize = (lastApvScrollY === -1) ? (curScrollY - pageLoadScrollY) 
                : (curScrollY - lastApvScrollY),
            asd = (scrollSize > 0) ? 0 : 1;
            if (Math.abs(scrollSize) > conf.apv_px) {
                var smPP = {A_apv:1, A_apx:curScrollY, A_asd:asd};
                _beaconPageview(smPP, false, true);
                lastApvScrollY = curScrollY;
                lastApvTime = new Date().getTime();
                if (conf.apv_callback) {
                    conf.apv_callback.call(this, {pixel_pos:curScrollY,scroll_dir:asd});
                }
            }
        };

        var scroll_callback = function() {
            if (timer != null) {
                clearTimeout(timer);
            }
            var curTime = new Date().getTime();
            if((curTime - pageLoadTime) < conf.apv_time) {
                pageLoadScrollY = U.getScrollY();
                lastApvTime = curTime;
            }
            timer = setTimeout(function() {
                handleScroll();
            }, conf.apv_time);
        };
	U.addEvent(window, 'scroll', scroll_callback);
        this.reInit = function() {
            pageLoadScrollY = U.getScrollY();
            lastApvScrollY = -1;
            pageLoadTime = lastApvTime = new Date().getTime();
        };
	this.destroy = function() {
            U.rmEvent(window, 'scroll', scroll_callback);
        };
    }

    function DwellManager() {
        var events = { 'focus':                    {state:'start',etrg:'show',etag:'dwell,start',jse:'window.focus'},
                       'pageshow':                 {state:'start',etrg:'show',etag:'dwell,start',jse:'window.pageshow'},
                       'visibilitychange-visible': {state:'start',etrg:'show',etag:'dwell,start',jse:'document.visibilitychange'},
                       'blur':                     {state:'stop',etrg:'hide',etag:'dwell,stop',jse:'window.blur'},
                       'pagehide':                 {state:'stop',etrg:'hide',etag:'dwell,stop',jse:'window.pagehide'},
                       'visibilitychange-hidden':  {state:'stop',etrg:'hide',etag:'dwell,stop',jse:'document.visibilitychange'},
                       'beforeunload':             {state:'stop',etrg:'close',etag:'dwell,stop',jse:'window.beforeunload'} };

        var state = "start";

        // Set the name of the hidden property and the change event for visibility
        // https://developer.mozilla.org/en-US/docs/Web/Guide/User_experience/Using_the_page_Visibility_API
        var hidden, visibilityChange;
        if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support 
            hidden = "hidden";
            visibilityChange = "visibilitychange";
        } else if (typeof document.mozHidden !== "undefined") {
            hidden = "mozHidden";
            visibilityChange = "mozvisibilitychange";
        } else if (typeof document.msHidden !== "undefined") {
            hidden = "msHidden";
            visibilityChange = "msvisibilitychange";
        } else if (typeof document.webkitHidden !== "undefined") {
            hidden = "webkitHidden";
            visibilityChange = "webkitvisibilitychange";
        }

        var dwell_callback = function(e) {
            var newstate = "";
            var event_type = e.type;
            // set event type for visibilitychange events
            if (e.type == visibilityChange) {
                if (document[hidden]) {
                    event_type = 'visibilitychange-hidden';
                } else {
                    event_type = 'visibilitychange-visible';
                }
            }
            if (U.hasOwn(events,event_type)) {
                newstate = events[event_type]['state'];
            }
            if (newstate.length == 0) {
                return;
            }
            if (state == newstate) {
                if (conf.ldbg) {
                    console.log('dwell: -- state already '+state+' (event='+event_type+')');
                }
                return;
            }
            state = newstate;
            var ev = events[event_type];
            if (conf.ldbg) {
                console.log('dwell: change state to '+state+' (event='+event_type+')');
            }
            var dmPP = {etrg:ev['etrg'],outcm:'window',usergenf:1,etag:ev['etag'],A_jse:ev['jse']};
            _beaconEvent('dwell',dmPP, '');
        };

        for (var event in events) {
            if (events.hasOwnProperty(event)) {
                U.addEvent(window, event, dwell_callback);
            }
        }
        U.addEvent(window, visibilityChange, dwell_callback);

        this.set_state = function (new_state) {
            state = new_state;
        };

        this.destroy = function() {
            for (var event in events) {
                if (events.hasOwnProperty(event)) {
                    U.rmEvent(window, event, dwell_callback);
                }
            }
            U.rmEvent(window, visibilityChange, dwell_callback);
        };
    }


    var perf_data_time = 0;

    function _beaconPerformanceData(perfDataObject) {
        var timeout_value = 10;
        // return if there is no timing object
        if (!window.performance || !window.performance.timing) {
            return;
        }
        // return if logging is off
        var perf_navigationtime = perfDataObject ? (perfDataObject.perf_navigationtime || 0) : (conf.perf_navigationtime || 0);
        var perf_resourcetime = perfDataObject ? (perfDataObject.perf_resourcetime || 0) : (conf.perf_resourcetime || 0);
        var perf_commontime = perfDataObject ? (perfDataObject.perf_commontime || null) : (conf.perf_commontime || null);
        var perf_usertime = perfDataObject ? (perfDataObject.perf_usertime || null) : (conf.perf_usertime || null);
        if (perf_navigationtime < 1 && perf_resourcetime < 1 && !perf_commontime && !perf_usertime) {
            return;
        }
        // check sampling range
        var sampling_range_nav = U.hasOwn(conf.sample,'perf_navigationtime') ? conf.sample.perf_navigationtime : 100;
        var sampling_range_res = U.hasOwn(conf.sample,'perf_resourcetime') ? conf.sample.perf_resourcetime : 100;
        var nav_sample = U.samplingSuccess(sampling_range_nav);
        var res_sample = U.samplingSuccess(sampling_range_res);
        if (!nav_sample && !res_sample) {
            return;
        }
        // if timing object is not ready, recurse
        if (window.performance.timing.loadEventStart === 0) {
            perf_data_time += timeout_value;
            // hard limit of 200ms
            if (perf_data_time > 200) {
                return;
            }
            setTimeout(function() {_beaconPerformanceData(perfDataObject)},timeout_value);
            return;
        }
        // build page params
        var pp = _buildPerfData(perf_navigationtime,perf_resourcetime,perf_commontime,perf_usertime,nav_sample,res_sample);
        // send the beacon
        var ev = CustomEvent(0, "pageperf", pp, "");
        uploader.sendEvents(ev);
    }

    function _buildPerfData (perf_navigationtime,perf_resourcetime,perf_commontime,perf_usertime,nav_sample,res_sample) {
        var rv = {};
        var wpt = window.performance.timing;
        if (nav_sample && perf_navigationtime > 0) {
            smartTimeDiff(wpt.responseStart, wpt.connectEnd, rv, "A_pfb");
            smartTimeDiff(wpt.responseEnd, wpt.responseStart, rv, "A_pbp");
            smartTimeDiff(wpt.responseEnd, wpt.requestStart, rv, "A_psr");
            smartTimeDiff(wpt.loadEventStart, wpt.navigationStart, rv, "A_pol");
            smartTimeDiff(wpt.domInteractive, wpt.navigationStart, rv, "A_pdi");
        }
        if (nav_sample && perf_navigationtime > 1) {
            smartTimeDiff(wpt.redirectEnd, wpt.redirectStart, rv, "A_prd");
            smartTimeDiff(wpt.domainLookupEnd, wpt.domainLookupStart, rv, "A_pdl");
            smartTimeDiff(wpt.connectEnd, wpt.secureConnectionStart, rv, "A_psh");
            smartTimeDiff(wpt.connectEnd, wpt.connectStart, rv, "A_psc");
            smartTimeDiff(wpt.loadEventStart, wpt.responseEnd, rv, "A_pfe");
        }
        if (res_sample && perf_resourcetime > 0) {
            if ( typeof window.performance.getEntries != "undefined" ) {
                var resource_list = [];
                var entries = window.performance.getEntries();
                entries.sort(function(a, b) {
                    return (a.duration > b.duration) ? -1 : ((a.duration < b.duration) ? 1 : 0);
                });
                var only10_entries = entries.slice(0, 10);
                var length = only10_entries.length;
                for (var i=0; i<length; i++) {
                    var resource_obj = {};
                    var res_name = only10_entries[i].name.replace(/\?.+$/,"");
                    res_name = res_name.replace(/^.+\//,"");
                    resource_obj['name'] = res_name;
                    resource_obj['dur'] = Math.floor(only10_entries[i].duration);
                    resource_obj['st'] = Math.floor(only10_entries[i].startTime);
                    resource_list.push(resource_obj);
                }
                rv['A_res'] = U.sfy(resource_list);
            }
        }
        if (perf_commontime) {
            if (U.hasOwn(perf_commontime, 'initialPageLoad')) {
                rv['A_cmi'] = U.sfy(perf_commontime['initialPageLoad']);
            }
            if (U.hasOwn(perf_commontime, 'afterPageLoad')) {
                rv['A_cma'] = U.sfy(perf_commontime['afterPageLoad']);
            }
        }
        if (perf_usertime) {
            var usertime_whitelist = ['utm'];
            for (var i=0; i < usertime_whitelist.length; i++) {
                if (U.hasOwn(perf_usertime, usertime_whitelist[i])) {
                    rv['A_utm'] = U.sfy(perf_usertime[usertime_whitelist[i]]);
                }
            }
        }
        // constants for all performance beacons
        rv['etrg']     = 'backgroundPost';
        rv['outcm']    = 'performance';
        rv['usergenf'] = 0;
        rv['etag']     = 'performance';
        return rv;
    }

    function smartTimeDiff (a,b,rv,field) {
        if (!a || !b) {
            return;
        }
        var diff = a - b;
        rv[field] = diff;
    }

    function _init() {
        handleULT();
        if (conf.ldbg) {
            logDebug('tracked_mods: ' + U.fData(conf.tracked_mods));
        }
        var newMods = modules_map.addModules(conf.tracked_mods, false);
        var visibilityMods = modules_map.addModules(conf.tracked_mods_viewability, conf.viewability);
        if (conf.USE_RAPID && conf.pageview_on_init) {
            uploader.sendRapidNoDelay(newMods.concat(visibilityMods), conf.client_only == 1);
        }
        if (conf.ywa && conf.pageview_on_init) {
            uploader.sendYWAPV();
        }
        U.executeOnLoad(function() {
            viewabilityManager = new ViewabilityManager();
            if (conf.apv) {
                scrollManager = new ScrollManager();
            }
            if (conf.dwell_on) {
                dwellManager = new DwellManager();
            }
            _beaconPerformanceData();
        });
    }

    _init();

    var __test_only__ = {'utils': U};


    return {
        /**
         * In 3.0, this is a no-op.
         * People we're calling methods on instances before
         * init was called. Maintained for backwards compatibility
         **/
        init: function () {},
        /**
         * Tracks/beacons an "event" out from the page to track the fact
         * that something happened on the page.  Examples of this would be
         * shares, overlays, hovers, anything that needs to be tracked and
         * reported on.
         *
         * @param event A string used to track and identify the event.
         * An example would be "share".
         * @param data This is an object literal of key/value pairs used
         * to describe the event further.  Recall that key string lengths
         * must be <= 8 characters.
         **/
        beaconEvent: function (event, data, outcome, cb) {
            _beaconEvent(event,data,outcome,cb);
        },
        /**
         * Tracks the a click (aside from normal link click tracking that
         * Rapid provides for you.)
         *
         * @param sec The section that the link resided in.
         * @param slk The string representation that describes the link.
         * @param pos The position of the link/element within the section
         * @param opt_keys An object literal further describing the
         * link aside
         * from the typical sec/slk/pos params.
         */
        beaconClick: function (sec, slk, pos, opt_keys, outcome_name, callback) {
            if(conf.ldbg){
                logDebug('beaconClick: sec=' + sec + ' slk=' + slk + ' callback=' + callback);
            }
            // opt_keys is possibly null or not passed.
            if (!opt_keys && outcome_name) {
                opt_keys = {};
            }
            // set ult click param value 'outcm'
            if (outcome_name) {
                opt_keys.outcm = outcome_name;
            }
            uploader.sendClick(ManualClick(sec, slk, pos, opt_keys, outcome_name), callback);
        },
        /**
         * Adds ULT-style Rapid tracking to the list of modules in mods.
         * Calling addModules() later on in a page lifetime is just as if
         * it had been tracked at creation time with "tracked_mods".
         *
         * @param mods Similar to how the configuration param
         * "tracked_mods", this is an array or object or element ids to
         * track.
         * @param isPageview Boolean indicating whether we should log a pageview for
         *  this call to addModules(1 or true), if 2, it would log a "richview"
         * @param options Object containing optional args to this method to prevent too many args.
         *  Currently only has {event:...} where event is of type CustomEvent.
         */
        addModules:function (mods, isPageview, options){
            if (conf.ldbg) {
                logDebug('addModules() called: mods=' + U.fData(mods) + ' isPage: ' + isPageview);
            }
            options = options || {};
            var amPP = {A_am:1};
            if(options.pp){U.aug(amPP, options.pp);}
            options.useViewability = options.useViewability || false;
            options.clickonly = options.clickonly || false;
            var isInteraction = false, generateNewSID = false;
            if(!isPageview) isPageview = options.useViewability ? 2 : false;
            switch(isPageview) {
            case 1:
            case '1':
            case true:
                isPageview = true;
                generateNewSID = true;
                break;
            case 2:
            case '2':
                isInteraction = true;
                isPageview = false;
                // Setting the options.event to richview if attempting to log a richview
                options.event = CustomEvent('contentmodification', '', {});
                break;
            case 0:
            case '0':
            case false:
            default:
                isPageview = false;
                break;
            }

            if(!conf.yql_enabled){
                if(isPageview){
                    _beaconPageview(amPP, generateNewSID);
                }
                else
                if(options.event){ // possibly a richview here
                    this.beaconRichView(amPP, options.event.outcome);
                }
                return;
            }
            // If isPageview is true, then kill the attempt at logging an event.
            if(options && options.event && isPageview){
                logError('Cannot track event type and pageview at same time.');
                options.event = null;
            }

            var newMods = modules_map.addModules(mods, options.useViewability);
            if (newMods.length === 0 && !options.event) {
                return;
            }
            // if clickonly is true, don't beacon out linkviews
            if (options.clickonly) {
                newMods = [];
            }
            // As of 3.7, allow addModules to be used even if USE_RAPID == false when an event is being logged
            // options.event is of type CustomEvent
            if (conf.USE_RAPID || options.event) {
                // is isPageview is set, we cannot risk folding together module data because
                // if addModules() is called back to back with isPageview=true, then the developer
                // may really want two pageviews.  If we folded them together they'd be folded into one.
                // Mitigate this risk by sending discrete records.
                // A_am:1 indicates that addModules was used for the data

                if (isPageview || options.event || options.pp) {
                    if (generateNewSID && !conf.persist_asid) {
                        regenSid();
                    }
                    if(options.event && options.event.data){
                        U.aug(amPP, options.event.data);
                    }
                    uploader.sendRapidNoDelay(newMods, isPageview, amPP, options);
                } else {
                    if (newMods.length > 0) {
                        uploader.sendRapid(newMods, isPageview, amPP, options);
                    }
                }
            }
            if (isPageview === true) {
                if (conf.ywa) {
                    uploader.sendYWAPV(amPP);
                }
                if (conf.apv && scrollManager) {
                    scrollManager.reInit();
                }
            }
        },
        addModulesWithViewability: function (mods, isPageview, options) {
	    options = options || {};
	    options.useViewability = conf.viewability;
	    this.addModules(mods, isPageview, options);
	},
        /**
         * Refreshes what is tracked within a module.  This is used for
         * example when content is added to a module that's already
         * tracked.  Calling this after loading new content will result
         * in new linkview tracking and click tracking for the new links
         * in the content.
         *
         * @param module
         * @param isPageView Boolean indicating whether this should result
         * in a new pageview record in the data warehouse, and in systems
         * such as Digits and YWA.
	 * @param shouldSendLinkviews Boolean - should we send the data payload even 
	 *     if there are no new links in the refreshed module?
	 * @param options Object containing optional params to this method to prevent too many args.
	 * 	Currently only {event:...} is supported and its of type CustomEvent.
         */
        refreshModule: function (module, isPageView, shouldSendLinkviews, options) {
            if (conf.ldbg) {
                logDebug('refreshModule called: mod=' + module + ' isPV: ' + isPageView + ' sendLinks: ' + shouldSendLinkviews + ' options: ' + U.fData(options));
            }
            var isInteraction = false, generateNewSID = false;
            options = options || {};
            if(!isPageView) isPageView = false;
            switch(isPageView) {
            case 1:
            case '1':
            case true:
                isPageView = true;
                generateNewSID = true;
                break;
            case 2:
            case '2':
                isInteraction = true;
                isPageView = false;
                // Setting the options.event to richview if attempting to log a richview
                options.event = CustomEvent('contentmodification', '', {});
                break;
            case 0:
            case '0':
            case false:
            default:
                isPageView = false;
                break;
            }
            if(!conf.yql_enabled){
                var overloadedPP = options.pp||{};
                if(isPageView){
                    _beaconPageview(overloadedPP, generateNewSID);
                }
                else if(options.event){ // possibly a richview here
                    this.beaconRichView(overloadedPP, options.event.outcome);
                }
                return;
            }
            var sendLinks = (shouldSendLinkviews === false ? false : true);
            if (generateNewSID && !conf.persist_asid) {
                regenSid();
            }
            // remove ability to log an event when isPageView == true, in other words 
            // isPageView has precedence.
            if(isPageView && options && options.event){
                options.event = null;
            }
            modules_map.refreshModule(module, isPageView, sendLinks, options);
        },
        /**
         * Removed tracking from a section in the page.  Subsequent link
         * clicks will have no tracking, 'click' handler functionality is
         * removed from the page as well.
         *
         * @param element_id_of_module The element id of the module that
         * you want to stop Rapid tracking for.
         */
        removeModule: function (element_id_of_module) {
            modules_map.removeModule(element_id_of_module);
        },
        /****
         * Returns a boolean indicating whether a given module is tracked.
         *
         * @param element_id_of_module The element id of the module in question.
         ****/
        isModuleTracked: function (element_id_of_module) {
            if (conf.ldbg) {
                logDebug('isTracked called: ' + element_id_of_module);
            }
            return (modules_map && (modules_map.exists(element_id_of_module) !== undefined));
        },
        /**
         * Destroys this particular instance of Rapid, under the hood
         * this is calling removeModule() for everything you tracked
         * at creation time.
         */
        destroy: function () {
            logDebug('destroy called');
            modules_map.destroy();
            if (scrollManager) {
                scrollManager.destroy();
                scrollManager = null;
            }
            if(viewabilityManager){
                viewabilityManager.destroy();
                viewabilityManager = null;
            }
            if(dwellManager){
                dwellManager.destroy();
                dwellManager = null;
            }
        },
	/***
	 * Reinitialize the configuration for rapid.
	 * @param newConfig Object - the new configuration object to be used - similarly configured as the conf object
	 * 	passed to the Rapid YAHOO.i13n.Rapid constructor.
	 ***/
        reInit: function (newConfig) {
            if (conf.ldbg) {
                logDebug('reInit called with: ' + U.fData(newConfig));
            }
            newConfig = newConfig||{};
            if(!newConfig.spaceid){
                logError('Invalid spid in reInit config: ' + U.fData(newConfig));
                return;
            }
            keys = new PageParams();
            conf = initConfig(newConfig);
            U = Utils(newConfig);


            var cooks = new CookieMap();
            
            var rx = cooks.getRxx();
            if (rx != null) {
                keys.set('_rx', rx);
            }
            var ga = cooks.getCookieByName('_ga');
            if (ga != null) {
                keys.set('_ga', ga);
            }
            var yx = cooks.getCookieByName('yx');
            if (yx != null) {
                keys.set('_yx', yx);
            }
        },
        /**
         * Set a new rapid attribute or override the current one
         */
        setRapidAttribute: function(attributes) {
            if(attributes.keys) {
                conf.keys.absorb(attributes.keys);
            }
            if(attributes.ywa) {
                if(U.isObj(attributes.ywa)){
                    for(var k in attributes.ywa){
                        if(U.hasOwn(attributes.ywa, k)){
                            conf.ywa[k] = attributes.ywa[k];
                        }
                    }
                }
            }
            if(attributes.spaceid) {
                conf.spaceid = attributes.spaceid;
            }
            if(attributes.referrer) {
                // Truncating the refurl if it exceeds MAX_VALUE_LENGTH characters
                conf.referrer = attributes.referrer.substring(0, U.MAX_VALUE_LENGTH);
            }
            if(attributes.A_sid) {
                conf.keys.set('A_sid', attributes.A_sid);
                conf.persist_asid = true;
            }
            if(attributes.location) {
                conf.loc = attributes.location;
                conf.keys.set('_w', U.rmProto(attributes.location).substring(0, U.MAX_VALUE_LENGTH));
            }
            if(U.hasOwn(attributes, 'apv')) {
                if(attributes.apv) {
                    if(!scrollManager) {
                        scrollManager = new ScrollManager();
                    } else {
                        scrollManager.reInit();
                    }
                } else {
                    if(scrollManager) {
                        scrollManager.destroy();
                        scrollManager = null;
                    }
                }
            }
        },
        /**
         * Clear a rapid attribute
         */
        clearRapidAttribute: function(attributes) {
            for(var elem in attributes) {
                if(attributes[elem] === 'keys') {
                    var oldUrl = conf.keys.get('_w');
                    var oldA_sid = conf.keys.get('A_sid');
                    conf.keys = new PageParams();
                    conf.keys.set('_w', oldUrl);
                    conf.keys.set('A_sid', oldA_sid);
                } else if(attributes[elem] === 'referrer') {
                    conf.referrer = '';
                } else if(attributes[elem] === 'A_sid') {
                    conf.keys.set('A_sid', '');
                    conf.persist_asid = true;
                } else if(attributes[elem] === 'location') {
                    conf.loc = '';
                    conf.keys.set('_w', '');
                }
            }
        },
        /**
         * Beacon a pageview on your behalf.
         * @param pp Optional pageparams where if there is a collision
         *  with existing pps, will overwrite them ONLY for this pageview
         *  but will not mutate previous page params.
         */
        beaconPageview: function (pp) {
            _beaconPageview(pp, true);
        },
        // http://help.yahoo.com/l/us/yahoo/ywa/faqs/tracking/advtrack/3520294.html
        beaconECommerce: function(action, data){
            if(conf.ywa){
                uploader.sendYWAECommerce(action, data);
            }
        },
        /**
         * Sends an internal search event to YWA.
         * @param searchTerm - the search query term of interest
         * @param numSearchResults - the number of search results 
         *      shown to the user based on the searchTerm.
         */
        beaconInternalSearch:function(searchTerm, numSearchResults){
            if(conf.ywa){
                uploader.sendInternalSearch(searchTerm, numSearchResults);
            }
        },
        /**
         * Returns the current 'pageview identifier' or page parameters
         * A_sid value.
         * @return the current pageview identifier, or page 
         *      parameters A_sid value.
         */
        getCurrentSID:function(){
            return keys.get('A_sid');
        },
        /***
         * Tells rapid that pushState on the window.history object
         * occurred. Ideally rapid would be able to subscribe to 
         * some event representing this notion, but there is no such
         * event. The closest thing is the popstate event, which is
         * actually backwards navigation notification. This is used 
         * to identify when a pjax-based page change occurs so 
         * rapid can send a terminal dwell time pixel.
         **/
        notifyHistoryPushStateCalled:function(){
            /*
              if(browserEventManager){
              browserEventManager.historyStateChanged();  
              }
            */
        },

        /**
         * Logs link views from a data structure, rather than scraping the DOM
         **/
        beaconLinkViews: function (linkData, eventType, options, callback) {
            if (conf.ldbg) {
                logDebug('beaconLinkViews() called');
            }

            options = options || {};
            var blvPP = {};

            if(options.pp){U.aug(blvPP, options.pp);}

            var isInteraction = false;
            var isPageview = false;

            switch(eventType) {
            case 1:
            case '1':
            case true:
                isPageview = true;
                break;
            case 2:
            case '2':
                isInteraction = true;
                isPageview = false;
                // Setting the options.event to richview if attempting to log a richview
                options.event = CustomEvent('contentmodification', '', {});
                break;
            case 0:
            case '0':
            case false:
            default:
                isPageview = false;
                break;
            }

            if(!conf.yql_enabled){
                if(isPageview){
                    _beaconPageview(blvPP, false);
                } else if(options.event){ // possibly a richview here
                    this.beaconRichView(blvPP, options.event.outcome);
                }
                return;
            }

            // If isPageview is true, then kill the attempt at logging an event.
            if(options && options.event && isPageview){
                logError('Cannot track event type and pageview at same time.');
                options.event = null;
            }

            if (linkData.length === 0 && !options.event) {
                return;
            }

            // process linkData
            var newMods = [];
            for (var i=0; i<linkData.length; i++) {
                var module = linkData[i];
                var mod_ylk = new YLK();
                mod_ylk.absorb_filter(module, function(elem) {return (elem != 'sec' && elem != '_links');});

                var newLinks = [];
                var pos=1;
                for (var j=0; j<module._links.length; j++) {
                    var link = module._links[j];
                    var newLink = {
                        viewable: true,
                        data: {
                            sec: module.sec,
                            _p: pos++,
                            A_lv: 2
                        }
                    }
                    U.aug(newLink.data, link);
                    newLinks.push(newLink);
                }
                
                var newMod = {
                    moduleName: module.sec,
                    moduleYLK: mod_ylk,
                    links: newLinks,
                    identifier: module.sec
                };
                newMods.push(newMod);
            }

            // As of 3.7, allow addModules to be used even if USE_RAPID == false when an event is being logged
            // options.event is of type CustomEvent
            if (conf.USE_RAPID || options.event) {
                // is isPageview is set, we cannot risk folding together module data because
                // if addModules() is called back to back with isPageview=true, then the developer
                // may really want two pageviews.  If we folded them together they'd be folded into one.
                // Mitigate this risk by sending discrete records.
                // A_am:1 indicates that addModules was used for the data

                if (isPageview || options.event || options.pp) {
                    if(options.event && options.event.data){
                        U.aug(blvPP, options.event.data);
                    }
                }
                uploader.sendRapidNoDelay(newMods, isPageview, blvPP, options);
            }
            if(callback) {
                callback.call();
            }
        },
        beaconPerformanceData: function (perfDataObject) {
            _beaconPerformanceData(perfDataObject);
        },
        __test_only__ : function() {
            return __test_only__;
        }
    };


    function Utils(old_conf) {
        var ua = navigator.userAgent,
        OP = Object.prototype,
        isIE = (ua.match(/MSIE\s[^;]*/) || ua.match(/Trident\/[^;]*/) ? 1 : 0),
        isWebkit = ((/KHTML/).test(ua) ? 1 : 0),
	isIOS = (ua.match(/(iPhone|iPad|iPod)/ig) !== null),
	isAndroid = (ua.indexOf('Android') > -1),
	isIOSSafari = (isIOS && (ua.match(/AppleWebKit/) !== null)),
	isSafari = (ua.match(/AppleWebKit/) !== null && ua.match(/Chrome/) === null),
	// considered garbage, thing we convert to empty string
        garbage_regex = new RegExp(/\ufeff|\uffef|[\u0000-\u001f]|[\ue000-\uf8ff]/g),
	// in particular, \u00a0 (non-breaking space) causes compression failures on windows
	// this is everything we want to convert to single spaces
	spaces_regex = new RegExp(/[\u007f-\u00a0]|\s{2,}/g),
        HTTP = 'http://',
        HTTPS = 'https://',
        KLASS = 'class',
        SPACE = ' ',
        sampling_hash_mod = -1,
        MAX_VALUE_LENGTH = 300,
        value_len_whitelist = new Array('A_res', 'A_cmi', 'A_cma', 'A_utm'),
        ieV = -1,
        isHTTPS = (window.location.protocol === 'https:');

        if (isIE) {
            // Change from Japan team: bug 7224569
            // If document mode is changeed, UA is not changed. So ieV is missmatch.
            // See: http://msdn.microsoft.com/en-us/library/jj676915%28v=vs.85%29.aspx#GETMODE

            // This is an IE browser. What mode is the engine in?
            if (document.documentMode) { // IE8 or later
                ieV = document.documentMode;
            } else { // IE 5-7
                ieV = 5; // Assume quirks mode unless proven otherwise
                if (document.compatMode) {
                    if (document.compatMode == "CSS1Compat") {
                        ieV = 7; // standards mode
                    }
                }
                // There is no test for IE6 standards mode because that mode
                // was replaced by IE7 standards mode; there is no emulation.
            } // the engine variable now contains the document compatibility
        }
        return {
	    $:function(elementId){return document.getElementById(elementId);},
            ca: "%01",
            cb: "%02",
            cc: "%03",
            cd: "%04",
            ce: "%05",
            cf: "%06",
            cg: "%07",
            ch: "%08",
            ylk_kv_delim:old_conf.ylk_kv_delim || ':',
            ylk_pair_delim:old_conf.ylk_pair_delim || ';',
            DATA_ACTION: 'data-action',
            data_action_outcome: 'data-action-outcome',
            isIE: isIE,
	    isIOSSafari:isIOSSafari,
	    isSafari:isSafari,
            isWebkit: isWebkit,
            ieV: ieV,
            MAX_VALUE_LENGTH: old_conf.max_value_length || MAX_VALUE_LENGTH,
            value_len_whitelist: value_len_whitelist,
            hasOwn: function (obj, key) {
                return OP.hasOwnProperty.call(obj, key);
            },
            enc: encodeURIComponent,
            dec: decodeURIComponent,
            curProto: function () {
                return (isHTTPS ? HTTPS : HTTP);
            },
	    isSecure:function(){
	        return isHTTPS;
	    },
	    isScrollHorizontalVisible:function(){
	        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
	    },
	    getCompStyle:function(el, pseudo) {
	        if(window.getComputedStyle !== undefined){
	            return window.getComputedStyle(el, pseudo);
	        }
	        this.el = el;
                this.getPropertyValue = function(prop){
		    var re = /(\-([a-z]){1})/g;
		    if(prop == 'float'){prop = 'styleFloat';}
		    if(re.test(prop)){
		        prop = prop.replace(re, function () {
               	            return arguments[2].toUpperCase();
                        });
                    }
		    return el.currentStyle[prop] ? el.currentStyle[prop] :0; 
                };
                return this;
	    },
	    /**
	     * attribute: attribute to pull, such as 'border-top-width' or 'border-bottom-width'
	     **/
	    getBorder:function(element, attribute){
	        if(!element || !attribute){return 0;}
	        var val = parseInt(this.getCompStyle(element, null).getPropertyValue(attribute), 10);
	        if(isNaN(val)){val = 0;}
	        return val;
	    },
	    getElementHeight:function(element){
	        if(!element){return 0;}
	        var offHeight = element.offsetHeight || 0;
	        if(!offHeight){return 0;}
	        return (offHeight - this.getBorder(element, 'border-top-width') - this.getBorder(element, 'border-bottom-width'));
	    },
	    getPositionTop:function(element){
	        var offset = 0;
	        while(element) {
		    offset += element["offsetTop"];
    		    element = element.offsetParent;
	        }
    	        return offset;
	    },
	    getScrollbarWidthHeight:function(){
	        //var div = document.createElement("div");
	        var div = this.make('div');
	        div.style.overflow = "scroll";
	        div.style.visibility = "hidden";
	        div.style.position = 'absolute';
	        div.style.width = '100px';
	        div.style.height = '100px';
	        document.body.appendChild(div);
	        var rv = {
		    width: div.offsetWidth - div.clientWidth,
		    height: div.offsetHeight - div.clientHeight
	        };
	        //document.body.removeChild(div);
	        this.rmBodyEl(div);
	        return rv;
	    },
	    // http://stackoverflow.com/questions/487073/check-if-element-is-visible-after-scrolling
	    // Note: doesn't work in IE7 yet.
	    isAboveFold:function(element){
	        if(isIE && (ieV <= 7) ){return true;}
            var link_style = U.getCompStyle(element);
            if (link_style.visibility == 'hidden' || link_style.display == 'none') {
                return false;
            }
	        // Best page on coordinate systems:
	        // http://javascript.info/tutorial/coordinates
	        var r = element.getBoundingClientRect();
	        var elementHeight = this.getElementHeight(element);
	        var percentageHeight = elementHeight * 0.5;
	        if( (r.top + percentageHeight) < 0){return false;}
	        // See: http://stackoverflow.com/questions/10173236/window-innerheight-ie8-alternative
	        var windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
	        if(this.isScrollHorizontalVisible()){
		    var size = this.getScrollbarWidthHeight();
		    windowInnerHeight -= size.height;
	        }
	        if( (r.bottom - percentageHeight) <= windowInnerHeight){return true;}
	    },
            /*
	      isAboveFold:function(element){
	      // Get the top and bottom position of the given element.
	      var posTop = this.getPositionTop(element);
	      var elementHeight = this.getElementHeight(element);
	      var percentageHeight = elementHeight * 0.5;
	      var posBottom = posTop + elementHeight;

	      // Get the height of the border on the element
	      //var borderTop = this.getBorderTop(element);

	      // Get the top and bottom position of the *visible* part of the window.
	      var visibleTop = U.getScrollY();
	      // See: http://stackoverflow.com/questions/10173236/window-innerheight-ie8-alternative
	      var windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
	      if(this.isScrollHorizontalVisible()){
	      var size = this.getScrollbarWidthHeight();
	      windowInnerHeight -= size.height;
	      }
	      var visibleBottom = visibleTop + windowInnerHeight;
	      //timd(element + '::' + posBottom + '>=' + visibleTop + ' && ' + posTop + '+' + percentageHeight + ' <= ' + visibleBottom);
	      return ((posBottom >= visibleTop) && ( (posTop + percentageHeight) <= visibleBottom));
	      },
            */
            strip: function (u) {
                var delims = {
                    '/': 'P',
                    ';': '1',
                    '?': 'P',
                    '&': '1',
                    '#': 'P'
                };
                var data = {
                    url: u,
                    clean: '',
                    cookie: '',
                    keys: []
                };
                var idx = 0;
                while (u.indexOf('_yl', idx) !== -1) {
                    var start = u.indexOf('_yl', idx);
                    if (idx < start) {
                        data.clean += u.slice(idx, start - 1);
                    }
                    idx = start + 3;
                    if (delims[u.charAt(start - 1)] && u.charAt(start + 4) === '=') {
                        data.ult = 1;
                        var key = "_yl" + u.charAt(start + 3);
                        var value = "";
                        for (start = start + 5; start < u.length && !delims[u.charAt(start)]; start++) {
                            value += u.charAt(start);
                        }
                        data.keys.push(key);
                        data[key] = value;
                        if (key !== '_ylv') {
                            data.cookie += "&" + key + "=" + value;
                        }
                        if (delims[u.charAt(start)] && delims[u.charAt(start)] === 'P') {
                            data.clean += u.charAt(start);
                        }
                        idx = start + 1;
                    } else {
                        data.clean += u.slice(start - 1, idx);
                    }
                } /* end while loop */

                if (data.ult) {
                    data.cookie = data.cookie.substr(1);
                    data.clean += u.substr(idx);
                    if (data._ylv === '0') {
                        // only strip ULT-inserted redirects, although i still think
                        // we should *display* the rd-stripped URL
                        //YLT.strip_rd(u, data);
                    }
                }
                return data;
            },
            prevDef: function (e) {
                if (e.preventDefault) {
                    e.preventDefault();
                } else {
                    e.returnValue = false;
                }
            },
            appBodyEl: function (element) {
                document.body.appendChild(element);
            },
            rmBodyEl: function (element) {
                document.body.removeChild(element);
            },
            sa: function (node, attr, val) {
                node.setAttribute(attr, val);
            },
            getScrollY:function() {
                var y = (window.pageYOffset !== undefined) ? window.pageYOffset
                    : (document.documentElement || document.body.parentNode || document.body).scrollTop;
	        return y;
            },
            make: function (name, attrs) {
                var el = document.createElement(name);
	        if(attrs && this.isObj(attrs)){
	            for(var k in attrs){
		        this.sa(el, k, attrs[k]);
	            }
	        }
	        return el;
            },
            getXHR: function () {
                var factories = [
                    function () {
                        return new XMLHttpRequest();
                    },
                    function () {
                        return new ActiveXObject("Msxml2.XMLHTTP");
                    },
                    function () {
                        return new ActiveXObject("Msxml3.XMLHTTP");
                    },
                    function () {
                        return new ActiveXObject("Microsoft.XMLHTTP");
                    }
                ];

                function createXMLHTTPObject() {
                    var xmlhttp = false,
                    len = factories.length;
                    for (var i = 0; i < len; i++) {
                        try {
                            xmlhttp = factories[i]();
                        } catch (e) {
                            continue;
                        }
                        break;
                    }
                    return xmlhttp;
                }
                return createXMLHTTPObject();
            },
	    hasLS:function(){
	        try {
	            return 'localStorage' in window && 
		        window['localStorage'] !== null;
	        } catch (e) {
		    return false;
	        }
	    },
            hasCORS: function () {
                // Credentialed CORS only works in IE10 and better
                // http://stackoverflow.com/questions/10941281/make-a-cors-request-in-ie9-with-cookies
                if (isIE && (ieV < 10)) {
                    return false;
                }
                if ("withCredentials" in (new XMLHttpRequest)) { // for normal browsers
                    return true;
                } else if (typeof XDomainRequest !== "undefined") { // for IE10
                    return true;
                }
                return false;
            },
            hasWorkers: function () {
                return !!window.Worker;
            },
	    clearCookie:function(name, path, domain){
                path = path ? path : '/';
                domain = domain ? domain : '';
                document.cookie = name + "= ; path=" + path + "; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=" + domain + ";";
	    },
            // concatenate b into a, only if b is not in a where elements of 
            // a and b are identified by strings return by calls to func(a|b).
            uniqConcat: function (a, b, func) {
                var rv = [], map = {};

                function loop(arr) {
                    for (var i = 0, len = arr.length; i < len; i++) {
                        var obj = arr[i];
                        if (!obj) {
                            continue;
                        }
                        var id = func(obj);
                        if (!map[id]) {
                            map[id] = 1;
                            rv.push(obj);
                        }
                    }
                }
                loop(a);
                loop(b);
                return rv;
            },
            trim: function (s) {
                if (!s) {
                    return s;
                }
	        return s.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
            },
            extDomain: function (url) {
                var matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
                return (matches && matches[1]); // domain will be null if no match is found
            },
            getAttribute: function (el, attr) {
                var rv = '';
                if (!document.documentElement.hasAttribute && (attr === KLASS)) {
                    attr = 'className';
                }
                if (el && el.getAttribute) {
                    rv = el.getAttribute(attr, 2);
                }
                return rv;
            },
            isDate: function (o) {
                return OP.toString.call(o) === '[object Date]';
            },
            isArr: function (o) {
                return OP.toString.apply(o) === '[object Array]';
            },
            isStr: function (o) {
                return typeof o === 'string';
            },
            isNum: function (o) {
                return typeof o === 'number' && isFinite(o);
            },
            isNumeric: function (input) {
                return (input - 0) == input && (input + '').replace(/^\s+|\s+$/g, "").length > 0;
            },
            isObj: function (o) {
                return (o && (typeof o === 'object'));
            },
            rTN: function (n) {
                try {
                    if (n && 3 === n.nodeType) {
                        return n.parentNode;
                    }
                } catch (e) {
		    logError(e);
	        }
                return n;
            },
            getTarget: function (e) {
                var t = e.target || e.srcElement;
                return this.rTN(t);
            },
            addEvent: function (obj, evt, fn) {
                if (obj.addEventListener) {
                    obj.addEventListener(evt, fn, false);
                } else if (obj.attachEvent) {
                    obj.attachEvent("on" + evt, fn);
                }
            },
            rmEvent: function (obj, evt, fn) {
                if (obj.removeEventListener) {
                    obj.removeEventListener(evt, fn, false);
                } else
                    if (obj.detachEvent) {
                        obj.detachEvent('on' + evt, fn);
                    }
            },
            // store all keys in s (sender) into r (receiver)
            aug: function (r, s, f) {
                if (!s) {
                    return;
                }
                for (var i in s) {
                    if (this.hasOwn(s, i)) {
                        if (f && !f.call(null, i, s[i])) {
                            continue;
                        }
                        r[i] = s[i];
                    }
                }
            },
            rmProto: function (u) {
                if (!u) {
                    return '';
                }
                if (u.substr(0, 7) === HTTP) {
                    return u.substr(7, u.length);
                }
                if (u.substr(0, 8) === HTTPS) {
                    return u.substr(8, u.length);
                }
                return u;
            },
            /******
             * From: http://twiki.corp.yahoo.com/view/SDSMain/LinkTrackApi#Client_Parameters
             * No binary data. Control characters < 0x20 are not allowed, as they are used for log field delimters.
             * Multi-byte UTF-8 characters are fine because bytes 2-4 will not be < 0x20.
             * The one exception to the no-binary-data rule is the ^B list delimiter allowed in page params.
             * Key names must be 8 bytes or less. This limit was arbitrarily chosen to save space in the logs.
             * Keys may only contain alphanumeric, underscore '_', or non-ascii UTF-8 (0x80+) chars.
             * Value length is not restricted, subject to that field's log limit for parameter data. See link and page parameter log limits below.
             *****/
            norm: function (l) {
                if (l === null) {
                    return '';
                }
	        l = ''+l;
                return this.trim(l.replace(spaces_regex, ' ').replace(garbage_regex, ''));
            },
            _hasClass: function (el, className) {
                var rv = false,
                current;
                if (el && className) {
                    current = this.getAttribute(el, KLASS) || '';
                    if (className.exec) {
                        rv = className.test(current);
                    } else {
                        rv = className && (SPACE + current + SPACE).indexOf(SPACE + className + SPACE) > -1;
                    }
                }
                return rv;
            },
            hasClass: function (el, className) {
                if (this.isArr(className)) {
                    for (var i = 0, len = className.length; i < len; i++) {
                        if (this._hasClass(el, className[i])) {
                            return true;
                        }
                    }
                    return false;
                } else
                    if (this.isStr(className)) {
                        return this._hasClass(el, className);
                    } else {
                        return false;
                    }
            },
            quote: function (s) {
                var  escape = /["\\\x00-\x1f\x7f-\x9f]/g,
                lookup = {
                    '\b': '\\b',
                    '\t': '\\t',
                    '\n': '\\n',
                    '\f': '\\f',
                    '\r': '\\r',
                    '"': '\\"',
                    '\\': '\\\\'
                },
                DQ = '"',
                EDQ = "\"";
                if (s.match(escape)) {
                    var rv = s.replace(escape, function (c) {
                        var cur = lookup[c];
                        if (typeof cur === 'string') {
                            return cur;
                        }
                        cur = c.charCodeAt();
                        return '\\u00' + Math.floor(cur / 16).toString(16) + (c % 16).toString(16);
                    });
                    return DQ + rv + DQ;
                }
                return EDQ + s + EDQ;
            },


            /* @license
               Copyright 2013 jQuery Foundation and other contributors

               Permission is hereby granted, free of charge, to any person obtaining a copy
               of this software and associated documentation files (the "Software"), to deal
               in the Software without restriction, including without limitation the rights
               to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
               copies of the Software, and to permit persons to whom the Software is
               furnished to do so, subject to the following conditions:

               The above copyright notice and this permission notice shall be included in
               all copies or substantial portions of the Software.

               THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
               IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
               FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
               AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
               LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
               OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
               THE SOFTWARE.
            */
            sfy: function (o) {
                if (!o && o !== "") {
                    return {};
                }
                var parts, type = (typeof o);

                if (type === 'undefined') {
                    return 'undefined';
                }
                if (type === 'number' || type === 'boolean') {
                    return '' + o;
                }
                if (type === 'string') {
                    return this.quote(o);
                }
                if (typeof o.toJSON === 'function') {
                    return this.sfy(o.toJSON());
                }
                if (this.isDate(o)) {
                    var month = o.getUTCMonth() + 1,
                    day = o.getUTCDate(),
                    year = o.getUTCFullYear(),
                    hours = o.getUTCHours(),
                    minutes = o.getUTCMinutes(),
                    seconds = o.getUTCSeconds(),
                    milli = o.getUTCMilliseconds();

                    if (month < 10) {
                        month = '0' + month;
                    }
                    if (day < 10) {
                        day = '0' + day;
                    }
                    if (hours < 10) {
                        hours = '0' + hours;
                    }
                    if (minutes < 10) {
                        minutes = '0' + minutes;
                    }
                    if (seconds < 10) {
                        seconds = '0' + seconds;
                    }
                    if (milli < 100) {
                        milli = '0' + milli;
                    }
                    if (milli < 10) {
                        milli = '0' + milli;
                    }
                    return '"' + year + '-' + month + '-' + day + 'T' +
                        hours + ':' + minutes + ':' + seconds +
                        '.' + milli + 'Z"';
                }
                parts = [];
                if (this.isArr(o)) {
                    for (var i = 0, len = o.length; i < len; i++) {
                        parts.push(this.sfy(o[i]));
                    }
                    return '[' + parts.join(',') + ']';
                }
                if (type === 'object') {
                    for (var key in o) {
                        if (this.hasOwn(o, key)) {
                            var localType = typeof key,
                            name = null;
                            // Keys must be numbers or strings
                            if (localType === 'string') {
                                name = this.quote(key);
                            } else
                                if (localType === 'number') {
                                    name = '"' + key + '"';
                                } else {
                                    continue;
                                }
                            localType = typeof o[key];
                            // don't allow functions to be placed into the JSON
                            if (localType !== 'function' && localType !== 'undefined') {
                                var value = '';
                                if (o[key] === null) {
                                    value = "\"\"";
                                } else
                                    if (o[key] === 0) {
                                        value = 0;
                                    } else {
                                        value = this.sfy(o[key]);
                                    }
                                parts.push(name + ':' + value);
                            }
                        }
                    }
                    return "{" + parts.join(',') + '}';
                }
            },
            // IE8 JSON.stringify is hopeless when it comes to unicode.
            // Test if JSON global present && we're not ie8 and JSON.stringify.
            // Note that ie8 would otherwise satisfy those conditions but doesn't work.
            // IE 6,7,8 would all satisfy this if statement.
            // Although there is no native JSON object in IE 6 and 7, we guard against
            // incorrect versions being placed into the window object by third party 
            // libs by using our own version.
            toJSON: (function () {
                var f = null;
                return function (o) {
                    if (!f) {
                        f = ((typeof JSON === 'object' && JSON.stringify && ieV !== 6 && ieV !== 7 && ieV !== 8) ? JSON.stringify : this.sfy);
                    }
                    return f.call(this, o);
                };
            })(),
            executeOnLoad: (function (callback) {
                var isReady = false,
                // The ready event handler
                completed = function(event) {
                    if (document.addEventListener || (event && event.type === "load") || document.readyState === "complete") {
                        isReady = true;
                        detachOnLoad();
                        callback.call(this);
                    }
                },
                // Clean-up method for dom ready events
                detachOnLoad = function() {
                    if (document.addEventListener) {
                        document.removeEventListener("DOMContentLoaded", completed, false);
                        window.removeEventListener("load", completed, false);
                    } else {
                        document.detachEvent("onreadystatechange", completed);
                        window.detachEvent("onload", completed);
                    }
                };
                if(document.readyState === "complete") {
                    // browser ready has already occured
                    // Handle it asynchronously to allow scripts the opportunity to delay ready
                    setTimeout(completed);
                } else if (document.addEventListener) {
                    document.addEventListener("DOMContentLoaded", completed, false);
                    window.addEventListener("load", completed, false);
                } else {
                    document.attachEvent("onreadystatechange", completed);
                    window.attachEvent("onload", completed);
                    var top = false;
                    try {
                        top = window.frameElement == null && document.documentElement;
                    } catch (e) {}
                    if(top && top.doScroll) {
                        (function doScrollCheck() {
                            if (!isReady) {
                                try {
                                    // Use the trick by Diego Perini
                                    // http://javascript.nwbox.com/IEContentLoaded/
                                    top.doScroll("left");
                                } catch(e) { 
                                    return setTimeout(doScrollCheck, 50);
                                }
                                detachOnLoad();
                                callback.call(this);
                            }
                        })();
                    }
                }
            }),
            getLinkContent: function (l) {
                for (var i = 0, s = "", o;
                     ((o = l.childNodes[i]) && o); i++) {
                    if (o.nodeType === 1) {
                        if (o.nodeName.toLowerCase() === 'img') {
                            s += (this.getAttribute(o, 'alt') || '') + " ";
                            //s += (o.getAttribute('alt',2)||'') + " ";
                        }
                        s += this.getLinkContent(o);
                    }
                }
                return s;
            },
            fData: function (o) {
                if (this.isStr(o)) {
                    return o;
                }
                return this.toJSON(o);
            },
            getLT: function (l, type) {
                if (!l) {
                    return '_';
                }
                var rv = '';
                type = type.toLowerCase();
                if (l.nodeName.toLowerCase() === 'input') {
                    rv = this.getAttribute(l, 'value');
                } else
                    if (type === 'text') {
                        if (isWebkit) {
                            rv = l.textContent;
                        } else {
                            rv = (l.innerText ? l.innerText : l.textContent);
                        }
                    } else
                        if (type === 'href') {
                            rv = this.rmProto(this.getAttribute(l, 'href'));
                        } else {
                            rv = this.getAttribute(l, type) || '';
                        }
                rv = this.norm(rv);
                if (rv === '') {
                    rv = this.norm(this.getLinkContent(l));
                }
		if (rv && rv.length > U.MAX_VALUE_LENGTH) {
		    rv = rv.substring(0,U.MAX_VALUE_LENGTH);
		}
                return (rv === '' ? '_' : rv);
            },
            clref: function (r) {
                if (r.indexOf(HTTP) !== 0 && r.indexOf(HTTPS) !== 0) {
                    return '';
                }
                var rv = this.strip(r);
                return rv.clean || rv.url;
            },
            cold: function () {
                if (screen) {
                    return screen.colorDepth || screen.pixelDepth;
                }
                return 'unknown';
            },
            sr: function (delim) {
                return (screen ? screen.width + (delim ? delim : ',') + screen.height : '');
            },
            xy: function (e) {
                function gs() {
                    var dd = document.documentElement,
                    db = document.body;
                    if (dd && (dd.scrollTop || dd.scrollLeft)) {
                        return [dd.scrollTop, dd.scrollLeft];
                    } else
                        if (db) {
                            return [db.scrollTop, db.scrollLeft];
                        } else {
                            return [0, 0];
                        }
                }
                var ie_d = null,
                x = e.pageX,
                y = e.pageY;
                if (isIE) {
                    ie_d = gs();
                }
                if (!x && 0 !== x) {
                    x = e.clientX || 0;
                    if (isIE) {
                        x += ie_d[1];
                    }
                }
                if (!y && 0 !== y) {
                    y = e.clientY || 0;
                    if (isIE) {
                        y += ie_d[0];
                    }
                }
                return x + "," + y;
            },
            // does s have control chars or have '=' in it
            hasCC: function (s) {
                for (var i = 0, l = s.length; i < l; i++) {
                    var c = s.charCodeAt(i);
                    if (c < 0x20 || c === '=') {
                        return true;
                    }
                }
                return false;
            },
	    isValidPair:function(k,v){
            if (U.in_value_whitelist(k)) {
                return true;
            }
	        if(k.length > 8 || v.length > U.MAX_VALUE_LENGTH){
		        logWarning('Invalid key/value pair (' + k + '=' + v + ') Size must be < 8/300 respectively.');
		        return false;
	        }
	        return true;
	    },
            ser: function (o, replace_empty_string) {
                if (!o) {
                    return '';
                }
                if(typeof replace_empty_string  === undefined){
                    replace_empty_string = true;
                }
                var rv = [],
                encoded = '';
                for (var i in o) {
                    if (this.hasOwn(o, i)) {
                        var k = i,
                        v = o[i];
                        if (k === null || v === null) {
                            continue;
                        }
                        k = k + '';
                        v = v + '';
                        if (v && !U.in_value_whitelist(k) && v.length > U.MAX_VALUE_LENGTH) {
                            v = v.substring(0,U.MAX_VALUE_LENGTH);
                        }
                        if(!this.isValidPair(k,v)){continue;}
                        if (!this.hasCC(k) && !this.hasCC(v)) {
                            encoded = '';
                            v = this.trim(v);
                            if ((v === '' || v === ' ') && replace_empty_string) {
                                v = '_';
                            }
                            try {
                                encoded = this.enc(k + "\x03" + v);
                                // Safari doesn't encode single-quotes, so do it manually here
                                encoded = encoded.replace(/'/g, "%27");
                            } catch (e) {
                                encoded = '_ERR_ENCODE_';
                                logError(e);
                            }
                            rv.push(encoded);
                        }
                    }
                }
                return rv.join(this.cd);
            },
            rand: function () {
                var index = 0,
                s = '',
                c = '';
                while (index++ < 16) {
                    var n = Math.floor(Math.random() * 62);
                    if (n < 10) {
                        c = n;
                    } else {
                        c = String.fromCharCode(n < 36 ? n + 55 : n + 61);
                    }
                    s += c;
                }
                return s;
            },
            tms: function () {
                return +new Date();
            },
	    cookEn:function(){
	        var ce = (navigator.cookieEnabled) ? 1 : 0, name="rapidtc";
	        if(typeof navigator.cookieEnabled == "undefined" &&
	           !ce){ 
		    document.cookie = name + "=1";
		    ce = (document.cookie.indexOf("testcookie") != -1) ? true : false;
		    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
	        }
	        return ce;
	    },
            isResCF: function (num) {
                var reserved_cf = {
                    14: 1,
                    15: 1,
                    18: 1,
                    19: 1,
                    20: 1
                };
                return reserved_cf[num];
            },
            isTagOfInterest: function(obj, tags) {
                for (var i = 0, ilen = tags.length; i < ilen; i++) {
                    if (obj.tagName && obj.tagName.toLowerCase() == tags[i].toLowerCase()) {
                        return true;
                    }
                }
                return false;
            },
            samplingSuccess: function(range) {
                var hashFNV32 = function(s) {
                    var offset = 33554467, hash = offset;
                    for(var i = 0, len = s.length; i < len; i++){
                        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
                        hash ^= s.charCodeAt(i);
                    }
                    if(hash < 0){
                        hash &= 0x7fffffff;
                        hash += 0x80000000;
                    }
                    return hash;
                },
                doSample = function(range) {
                    var SAMPLING_BASE = 1000;
                    range *= 10; // adjust for base 1000
                    var cooks = new CookieMap();
                    var bcookie_val = '' + cooks.getCookieByName('B');
                    if(!bcookie_val) return false;
                    if (sampling_hash_mod < 0) {
                        sampling_hash_mod = (hashFNV32(bcookie_val) % SAMPLING_BASE);
                    }
                    return (sampling_hash_mod < range);
                };
                return doSample(range);
            },
            in_value_whitelist: function(k) {
                if (isIE && ieV <= 8) {
                    return false;
                }
                return U.value_len_whitelist.indexOf(k) !== -1;
            }
            /*
              ,
              fp:function(){
              var rv = {
              A_nm:[],
              A_fn:[],
              A_cd:this.cold(),
              A_ce:this.cookEn(),
              A_tz:new Date().getTimezoneOffset(),
              A_bi:window.navigator.buildID || '',
              A_wsx: window.screen.width,
              A_wsy: window.screen.height,
              A_wox: (isIE === 1 ? (ieV <= 8 ? 0 : window.outerWidth) : window.outerWidth),
              A_woy: (isIE === 1 ? (ieV <= 8 ? 0 : window.outerHeight) : window.outerHeight),
              A_wix: (isIE === 1 ? (ieV <= 8 ? 0 : window.innerWidth) : window.innerWidth),
              A_wiy: (isIE === 1 ? (ieV <= 8 ? 0 : window.innerHeight) : window.innerHeight)
              }, np = navigator.plugins;
              for(var i=0; i < np.length; i++){
              var cur = np[i];
              rv.A_nm.push(cur.name);
              rv.A_fn.push(cur.filename);
              }
              return rv;
              }
            */
        };
    } // U closing
};
