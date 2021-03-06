function protocol() { return 'https://'; }

var Retsly = module.exports = exports = (function() {

/*
 * Constructor with a internal scope reference to _this
 * _this is used for Backbone methods which aren't part of the prototype
 */

  var _this;
  var Client = function(client_id, options) {

    if(!client_id)
      throw new Error('You must provide a client_id - ie: new Retsly("xxx");')

    this.client_id = client_id, this.token = null;
    this.options = _.extend({ urlBase: '/api/v1', debug: false }, options);
    this.host = (document.domain.indexOf('dev.rets.ly') > -1) ? 'dev.rets.io:443' : 'rets.io:443';
    this.io = io.connect(protocol()+this.host+'/', {'sync disconnect on unload':false});
    this.init_stack = [];
    this.init();
    _this = this;
    return this;
  };

/*
 * Request API, lowest layer of socket abstraction
 */

  Client.prototype.init = function() {

    var self = this;

    if($(document.body).hasClass('retsly')) return this.ready();
    if(this.options.debug) console.log('--> Loading Retsly SDK...');

    var css = $('<link>').attr({
      media: 'all', rel: 'stylesheet',
      href: protocol()+self.host+'/css/sdk'
    });

    css.load(function() {
      self.get('/api/v1/templates', {}, function(res) {
        if(self.options.debug) console.log('<-- Retsly SDK Loaded!');
        if(res.success) {
          $(document.body).addClass('retsly').append('<div id="retsly-templates" />');
          $('#retsly-templates').append(res.bundle);

          // <!-- Make sure you ask @slajax before changing this
          $.ajax({
            type: 'POST', xhrFields: { withCredentials: true },
            data: { origin: document.location.protocol+'//'+document.domain, action: 'set' },
            url: protocol()+self.host+'/api/v1/session?origin='+document.domain,
            success: function(sid) {
              self.io.emit('authorize', { sid: sid }, function(data) {
                if(typeof data.bundle === 'string') self.setCookie('retsly.sid', data.bundle);
                self.ready();
              });
            }
          });
          // Make sure you ask @slajax before changing this -->
        }
      });

    });

    css.appendTo('head');

  };

  //TODO kyle: Make this restful. It's way too fucken late right now.
  Client.prototype.logout = function(cb) {
    var success = cb || function() {};
    $.ajax({
      type: 'POST', xhrFields: { withCredentials: true },
      data: { origin: document.location.protocol+'//'+document.domain, action: 'del' },
      url: protocol()+this.host+'/api/v1/session',
      error: function(error) { throw new Error(error); },
      success: success
    });
  };

  // Set an oauth token for extended privileges.
  Client.prototype.setToken = function(token) {
    this.token = token;
  };

  Client.prototype.getToken = function() {
    return this.token;
  };

  Client.prototype.ready = function(cb) {
    if(cb) this.init_stack.push(cb);
    else _.each(this.init_stack, function(c) { if(typeof c === 'function') c(); });
  };

  Client.prototype.request = function(url, options, cb) {
    this.io.emit('api', _.extend({ url: url }, options), cb);
  };

  Client.prototype.get = function(url, query, cb) {

    var options = {};
    options.method = 'get';
    options.query = typeof query === "object" ? query : {};
    options.query.client_id = this.client_id;

    if(this.getToken())
      options.query.access_token = this.getToken();

    return this.request(url, options, cb);
  };

  Client.prototype.post = function(url, body, cb) {
    var options = {};
    options.method = 'post';
    options.body =  typeof body === "object" ? body : {};
    options.query = { client_id: this.client_id };

    if(this.getToken())
      options.query.access_token = this.getToken();

    return this.request(url, options, cb);
  };

  Client.prototype.put = function(url, body, cb) {
    var options = {};
    options.method = 'put';
    options.body =  typeof body === "object" ? body : {};
    options.query = { client_id: this.client_id };

     if(this.getToken())
      options.query.access_token = this.getToken();

    return this.request(url, options, cb);
  };

  Client.prototype.del = function(url, body, cb) {
    var options = {};
    options.method = 'delete';
    options.body =  typeof body === "object" ? body : {};
    options.query = { client_id: this.client_id };

    if(this.getToken())
      options.query.access_token = this.getToken();

    return this.request(url, options, cb);
  };

  Client.prototype.subscribe = function(method, url, query, scb, icb) {
    var options = {};
    options.url = url;
    options.query = query;
    options.query.client_id = this.client_id;

    if(this.getToken())
      options.query.access_token = this.getToken();

    this.io.emit('subscribe', options, icb);
    return this.io.on(method, scb);
  };

  var cookies;
  Client.prototype.getCookie = function (name,c,C,i){
    c = document.cookie.split('; ');
    cookies = {};
    for(i=c.length-1; i>=0; i--){
      C = c[i].split('=');
      cookies[C[0]] = C[1];
    }
    return cookies[name];
  };

  Client.prototype.setCookie = function (name,value,days) {
    if (days) {
      var date = new Date();
      date.setTime(date.getTime()+(days*24*60*60*1000));
      var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
  };

/*
 * Retsly Backbone sync over websockets
 */

  // If no Backbone, stop here.
  if(typeof Backbone === "undefined") return Client;

  /**
   * HTTP uses response.bundle, sockets use response. Normalize them.
   */
  Backbone.Model.prototype.parse = function(response, options) {
    return response.bundle ? response.bundle : response;
  };
  Backbone.Collection.prototype.parse = function(response, options) {
    return response.bundle ? response.bundle : response;
  };

  Backbone.Model.prototype.idAttribute = "_id";
  Backbone.ajaxSync = Backbone.sync;

  /**
   * Authenticate HTTP requests with Authorization header
   */
  Backbone.origAjax = Backbone.ajax;
  Backbone.ajax = function(request) {
    request.beforeSend = function(jqXHR, settings) {
      var concat = (settings.url.indexOf('?') > -1) ? '&' : '?';
      settings.url = settings.url+concat+'client_id='+_this.client_id;
      jqXHR.setRequestHeader("Authorization", 'Bearer '+_this.token);
    };
    Backbone.origAjax(request);
  };

  Backbone.getSyncMethod = function(model) {
    if(model.transport == 'socket' || (model.collection && model.collection.transport == 'socket')) {
      return Backbone.socket;
    }
    return Backbone.ajaxSync;
  };

  Backbone.sync = function(method, model, options) {
    return Backbone.getSyncMethod(model).apply(this, [method, model, options]);
  };

/* Main socket hack for rets.ly over socket.io */

  Backbone.socket = function(method, model, options) {
    var resp, errorMessage;

    // Alway wait for server to respond
    options.wait = true;

    // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
    var methodMap = {
      'create': 'post',
      'update': 'put',
      'delete': 'del',
      'read':   'get'
    };

    // Ensure that we have a URL.
    if (!options.url) {
      options.url = _.result(model, 'url') || urlError();
    }

    var syncMethod = methodMap[method].toLowerCase();

    switch(syncMethod) {
      case 'del':
        if(model.retsly.options.debug) console.log('--> delete '+options.url, options.data || {});
        model.retsly.del(options.url, model.toJSON(), function(res) {
          if(model.retsly.options.debug) console.log('<-- delete '+options.url, res);
          if(res.success) {
            if(typeof options.success == 'function') options.success(res);
          } else {
            if(typeof options.error == 'function') options.error(res);
            model.trigger('error', model, options, res);
          }
          if(model.complete) model.complete(res.bundle, options, res);
          if(typeof model.get(res.id) !== "undefined"){
            model.remove(res.bundle);
            model.trigger('remove', model.get(res.id), options, res);
          }

        });
      break;

      case 'put':
        if(model.retsly.options.debug) console.log('--> put '+options.url, model.toJSON());
        var json = model.toJSON(); delete json['_id'];
        model.retsly.put(options.url, json, function(res) {
          if(model.retsly.options.debug) console.log('<-- put '+options.url, res);
          if(res.success) {
            if(typeof options.success == 'function') options.success(res);
          } else {
            if(typeof options.error == 'function') options.error(res);
            model.trigger('error', model, res, options);
          }
          if(model.complete) model.complete(res.bundle, options, res);
          if(typeof model.get(res.id) === "undefined"){
            if(typeof model.add === 'function') model.add(res.bundle);
          } else {
            model.get(res.id).set(res.bundle);
            model.trigger('change', model.get(res.id), options, res);
          }

        });
      break;

      case 'post':
        if(model.retsly.options.debug) console.log('--> post '+options.url, options.data || {});
        model.retsly.post(options.url, model.toJSON(), function(res) {
          if(model.retsly.options.debug) console.log('<-- post '+options.url, res);
          if(res.success) {
            if(typeof options.success == 'function') options.success(res);
          } else {
            if(typeof options.error == 'function') options.error(res);
            model.trigger('error', model, res, options);
          }
          if(model.complete) model.complete(res.bundle, options, res);
          if(typeof model.get(res.id) === "undefined"){
            if(typeof model.add === 'function') model.add(res.bundle);
          } else {
            model.get(res.id).set(res.bundle);
            model.trigger('change', model.get(res.id), options, res);
          }

        });
      break;

      case 'get': default:

        if(model.retsly.options.debug) console.log('--> get '+options.url, options.data || {});
        model.retsly.get(options.url, options.data, function(res) {
          if(model.retsly.options.debug) console.log('<-- get '+options.url, res);

          if(res.bundle[0] && typeof res.bundle[0]._id !== 'undefined' && options.url.indexOf('photos') === -1) {

            if(model.retsly.options.debug) console.log('--> subscribe:put '+options.url, options.query || {});
            if(model.retsly.options.debug) console.log('--> subscribe:delete '+options.url, options.query || {});

            _.each(res.bundle, function(item){
              model.retsly.subscribe('put', options.url+'/'+item._id, {}, function(res) {
                //TODO: Figure out why each listing gets fired here
                if(res.id !== item._id) return;
                if(model.retsly.options.debug) console.log('<-- subscribe:put '+options.url, res);
                if(typeof model.get(res.id) === "undefined"){
                  if(typeof model.add === 'function') model.add(res.bundle);
                } else {
                  model.get(res.id).set(res.bundle);
                  model.trigger('change', model.get(res.id), options, res);
                }
              });
              model.retsly.subscribe('delete', options.url+'/'+item._id, {}, function(res) {
                if(model.retsly.options.debug) console.log('<-- subscribe:delete '+options.url, res);
                if(typeof model.get(res.id) !== "undefined"){
                  model.remove(res.bundle);
                }
              });
            });

            if(model.retsly.options.debug) console.log('--> subscribe:post '+options.url, options.query || {});
            model.retsly.subscribe('post', options.url, {}, function(res) {
              if(model.retsly.options.debug) console.log('<-- subscribe:post '+options.url, res);
              if(typeof model.get(res.id) === "undefined"){
                if(typeof model.add === 'function') model.add(res.bundle);
              } else {
                model.get(res.id).set(res.bundle);
                model.trigger('change', model.get(res.id), options, res);
              }
            });

          }

          if(res.success) {
            if(typeof options.success == 'function') options.success(res);
            model.trigger('reset', model, options, res);
          } else {
            if(typeof options.error == 'function') options.error(res);
            model.trigger('error', model, options, res);
          }

          //TODO: Refactor del, post, put to use this?
          //TODO: Should this just be rolled into options.success / options.error?
          // My thought is that success / error are immediate and bound to the model.
          // complete should fire when all sub collections / models are loaded.
          if(model.complete) model.complete(res.bundle, options, res);
          if(model.models) {
            _.each(model.models, function(model) {
              if(model.complete) model.complete(res.bundle, options, res);
            });
          }

        });

      break;
    }
  };


/*
 * Public Retsly Models
 */

  Client.Models = {};
  Client.Models.Listing = Backbone.Model.extend({
    defaults: {},
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      if(typeof options !== 'undefined' && !options.mls_id)
        throw new Error('Retsly.Models.Listing requires a mls_id `{mls_id: mls.id}`');

      this.retsly = _this;
      this.options = _.extend({}, options);

      this.mls_id = options.mls_id;
      this.collection = options.collection;

      return this;
    },
    url: function() {
      return _this.options.urlBase+'/listing/'+this.mls_id+'/'+this.get('_id')+'.json';
    }
  });

  Client.Models.Photo = Backbone.Model.extend({
    defaults: {},
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.options = _.extend({ mls_id: this.mls_id }, options);
      this.mls_id = options.mls_id;
      this.retsly = _this;

      return this;
    },
    url: function() {
      return _this.options.urlBase+'/photo/'+this.mls_id+'/'+this.get('id')+'.json';
    }
  });

  Client.Models.Agent = Backbone.Model.extend({
    defaults: {},
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.retsly = _this;
      return this;
    },
    url: function() {
      return _this.options.urlBase+'/agent/'+this.collection.mls_id+'/'+this.get('id')+'.json';
    }
  });

  Client.Models.Office = Backbone.Model.extend({
    defaults: {},
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.retsly = _this;
      return this;
    },
    url: function() {
      return _this.options.urlBase+'/office/'+this.collection.mls_id+'/'+this.get('id')+'.json';
    }
  });

  Client.Models.Geography = Backbone.Model.extend({
    defaults: {},
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.retsly = _this;
      return this;
    },
    url: function() {
      return _this.options.urlBase+'/geography/'+this.collection.mls_id+'/'+this.get('id')+'.json';
    }
  });


/*
 * Public Retsly Collections
 */

  Client.Collections = {};
  Client.Collections.Listings = Backbone.Collection.extend({
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      if(typeof options !== 'undefined' && !options.mls_id)
        throw new Error('Retsly.Models.Listing requires a mls_id `{mls_id: mls.id}`');

      this.retsly = _this;
      this.options = _.extend({ }, options);
      this.mls_id = options.mls_id;
    },
    model: function(attrs, options) {
      return new Client.Models.Listing(attrs, { collection: options.collection, mls_id: options.collection.mls_id });
    },
    url: function() {
      return _this.options.urlBase+'/listing/'+this.mls_id+'.json';
    }
  });

  Client.Collections.Photos = Backbone.Collection.extend({
    transport: 'socket',
    initialize: function(listing, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      if(typeof options !== 'undefined' && !options.mls_id)
        throw new Error('Retsly.Models.Listing requires a mls_id `{mls_id: mls.id}`');

      this.retsly = _this;
      this.listing = listing;
      this.options = _.extend({ }, options);
      this.mls_id = options.mls_id;

      this.url = _this.options.urlBase+'/photo/'+this.mls_id+'/'+listing.get('_id')+'.json';
      return this;
    },
    complete: function(photos) {
      if(this.listing) this.listing.set('Photos', this);
      if(typeof this.options.complete === 'function')
        this.options.complete(this.listing);
    }
  });

  Client.Collections.Agents = Backbone.Collection.extend({
    transport: 'socket',
    initialize: function(models, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.options = _.extend({}, options);
      this.mls_id = this.options.mls_id;
      this.retsly = _this;
    },
    model: function(attrs, opts) {
      return new Client.Models.Agent(attrs, opts);
    },
    url: function() {
      return _this.options.urlBase+'/agent/'+this.mls_id+'.json';
    }
  });

  Client.Collections.Offices = Backbone.Collection.extend({
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.options = _.extend({}, options);
      this.mls_id = this.options.mls_id;
      this.retsly = _this;
    },
    model: function(attrs, opts) {
      return new Client.Models.Office(attrs, opts);
    },
    url: function() {
      return _this.options.urlBase+'/office/'+this.mls_id+'.json';
    }
  });

  Client.Collections.Geographies = Backbone.Collection.extend({
    transport: 'socket',
    initialize: function(attrs, options) {

      if(typeof _this === 'undefined')
        throw new Error('No Restly Client found. Please invoke `new Retsly($token)` first.');

      this.options = _.extend({}, options);
      this.mls_id = this.options.mls_id;
      this.retsly = _this;
    },
    model: function(attrs, opts) {
      return new Client.Models.Geography(attrs, opts);
    },
    url: function() {
      return _this.options.urlBase+'/geography/'+this.mls_id+'.json';
    }
  });

/*
 * Public Retsly Section / View Helpers
 */

  Client.Section = Backbone.View.extend({
    open: function() {
      $(".ui-active").removeClass("ui-active");
      this.$el.addClass("ui-active");
      return this;
    }
  });

  Client.Views = {};

  return Client;

})();

