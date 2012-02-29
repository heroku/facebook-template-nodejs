var b64url  = require('b64url');
var crypto  = require('crypto');
var qs      = require('querystring');
var restler = require('restler');
var util    = require('util');

var Faceplate = function(options) {

  var self = this;

  this.options = options || {};
  this.app_id  = this.options.app_id;
  this.secret  = this.options.secret;

  this.middleware = function() {
    return function(req, res, next) {
      if (req.body.signed_request) {
        self.parse_signed_request(req.body.signed_request, function(token) {
          req.facebook = new FaceplateSession(self, token);
          next();
        });
      } else if (req.cookies["fbsr_" + self.app_id]) {
        self.parse_signed_request(req.cookies["fbsr_" + self.app_id], function(token) {
          req.facebook = new FaceplateSession(self, token);
          next();
        });
      } else {
        req.facebook = new FaceplateSession(self);
        next();
      }
    }
  }

  this.parse_signed_request = function(signed_request, cb) {
    var encoded_data = signed_request.split('.', 2);

    var sig  = encoded_data[0];
    var json = b64url.decode(encoded_data[1]);
    var data = JSON.parse(json);

    // check algorithm
    if (!data.algorithm || (data.algorithm.toUpperCase() != 'HMAC-SHA256')) {
      throw("unknown algorithm. expected HMAC-SHA256");
    }

    // check signature
    var secret = self.secret;
    var expected_sig = crypto.createHmac('sha256', secret).update(encoded_data[1]).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace('=','');

    if (sig !== expected_sig)
      throw("bad signature");

    // not logged in
    if (!data.user_id) {
      cb();
      return;
    }

    if (data.oauth_token) {
      cb(data.oauth_token);
      return;
    }

    if (!data.code)
      throw("no oauth token and no code to get one");

    var params = {
      client_id:     self.app_id,
      client_secret: self.secret,
      redirect_uri:  '',
      code:          data.code
    };

    var request = restler.get('https://graph.facebook.com/oauth/access_token', { query:params });

    request.on('fail', function(data) {
      var result = JSON.parse(data);
      console.log('invalid code: ' + result.error.message);
      cb();
    });

    request.on('success', function(data) {
      cb(qs.parse(data).access_token);
    });
  }
}

var FaceplateSession = function(plate, token) {

  var self = this;

  this.plate = plate;
  this.token  = token;

  this.app = function(cb) {
    self.get('/' + self.plate.app_id, function(app) {
      cb(app);
    });
  }

  this.me = function(cb) {
    if (self.token) {
      self.get('/me', function(me) {
        cb(me);
      });
    } else {
      cb();
    }
  }

  this.get = function(path, params, cb) {
    if (cb === undefined) {
      cb = params;
      params = {};
    }

    if (self.token)
      params.access_token = self.token;

    restler.get('https://graph.facebook.com' + path, { query: params }).on('complete', function(data) {
      var result = JSON.parse(data);
      cb(result.data ? result.data : result);
    });
  }

  this.fql = function(query, cb) {
    restler.get('https://api.facebook.com/method/fql.query', { query: { access_token: self.token, query:query, format:'json' } }).on('complete', function(data) {
      cb(data);
    });
  }
}

module.exports.middleware = function(options) {
  return new Faceplate(options).middleware();
}
