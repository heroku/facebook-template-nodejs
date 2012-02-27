require.paths.unshift(__dirname + '/lib');

var base64url = require('b64url');
var crypto    = require('crypto');
var everyauth = require('everyauth');
var express   = require('express');
var facebook  = new (require('facebook-client').FacebookClient)();
var sys       = require('sys');
var uuid      = require('node-uuid');

// configure facebook authentication
everyauth.facebook
  .appId(process.env.FACEBOOK_APP_ID)
  .appSecret(process.env.FACEBOOK_SECRET)
  .scope('user_likes,user_photos,user_photo_video_tags')
  .entryPath('/auth/facebook')
  .redirectPath('/')
  .findOrCreateUser(function() {
    return({});
  })

// create an express webserver
var app = express.createServer(
  express.logger(),
  express.static(__dirname + '/public'),
  express.bodyParser(),
  express.cookieParser(),
  // set this to a secret value to encrypt session cookies
  express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
  // insert a middleware to set the facebook redirect hostname to http/https dynamically
  function(req, res, next) {
    var method = req.headers['x-forwarded-proto'] || 'http';
    everyauth.facebook.myHostname(method + '://' + req.headers.host);
    next();
  },
  everyauth.middleware(),
  require('facebook').Facebook()
);

// listen to the PORT given to us in the environment
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

app.dynamicHelpers({
  'host': function(req, res) {
    return req.headers['host'];
  },
  'scheme': function(req, res) {
    req.headers['x-forwarded-proto'] || 'http'
  },
  'url': function(req, res) {
    return function(path) {
      return app.dynamicViewHelpers.scheme(req, res) + app.dynamicViewHelpers.url_no_scheme(path);
    }
  },
  'url_no_scheme': function(req, res) {
    return function(path) {
      return '://' + app.dynamicViewHelpers.host(req, res) + path;
    }
  },
});

// create a socket.io backend for sending facebook graph data
// to the browser as we receive it
var io = require('socket.io').listen(app);

// wrap socket.io with basic identification and message queueing
// code is in lib/socket_manager.js
var socket_manager = require('socket_manager').create(io);

// use xhr-polling as the transport for socket.io
io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
});

function render_facebook_page(req, res, user, token) {

  // generate a uuid for socket association
  var socket_id = uuid();

  // if the user is logged in
  if (token) {

    // initialize facebook-client with the access token
    facebook.getSessionByAccessToken(token)(function(session) {

      // query 4 friends and send them to the socket for this socket id
      session.graphCall('/me/friends&limit=4')(function(result) {
        result.data.forEach(function(friend) {
          socket_manager.send(socket_id, 'friend', friend);
        });
      });

      // query 16 photos and send them to the socket for this socket id
      session.graphCall('/me/photos&limit=16')(function(result) {
        result.data.forEach(function(photo) {
          socket_manager.send(socket_id, 'photo', photo);
        });
      });

      // query 4 likes and send them to the socket for this socket id
      session.graphCall('/me/likes&limit=4')(function(result) {
        result.data.forEach(function(like) {
          socket_manager.send(socket_id, 'like', like);
        });
      });

      // use fql to get a list of my friends that are using this app
      session.restCall('fql.query', {
        query: 'SELECT uid, name, is_app_user, pic_square FROM user WHERE uid in (SELECT uid2 FROM friend WHERE uid1 = me()) AND is_app_user = 1',
        format: 'json'
      })(function(result) {
        result.forEach(function(friend) {
          socket_manager.send(socket_id, 'friend_using_app', friend);
        });
      });

    });
  }

  // get information about the app itself
  facebook.graphCall('/' + process.env.FACEBOOK_APP_ID, {})(function(app) {

    // render the home page
    res.render('index.ejs', {
      layout:    false,
      token:     token,
      app:       app,
      user:      user,
      socket_id: socket_id
    });

  });
}

app.post('/', function(req, res) {
  var signed_request = req.body.signed_request;
  var secret = process.env.FACEBOOK_SECRET;

  if (signed_request) {
    encoded_data = signed_request.split('.', 2);

    // decode the data
    var sig = encoded_data[0];
    var json = base64url.decode(encoded_data[1]);
    var data = JSON.parse(json);

    // check algorithm
    if (!data.algorithm || (data.algorithm.toUpperCase() != 'HMAC-SHA256')) {
      throw("unknown algorithm. expected hmac-sha256");
    }

    // check sig
    var expected_sig = crypto.createHmac('sha256', secret).update(encoded_data[1]).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace('=','');

    if (sig !== expected_sig) {
      throw("bad signature");
    }

    facebook.getSessionByAccessToken(data.oauth_token)(function(session) {
      session.graphCall('/me')(function(user) {
        render_facebook_page(req, res, user, data.oauth_token);
      });
    });

  } else {
    render_facebook_page(req, res);
  }
});

// respond to GET /home
app.get('/', function(req, res) {

  // detect the http method uses so we can replicate it on redirects
  var method = req.headers['x-forwarded-proto'] || 'http';

  // if we authed, get some information
  if (req.session.auth) {
    render_facebook_page(req, res, req.session.auth.facebook.user, req.session.auth.facebook.accessToken);
  } else {
    render_facebook_page(req, res);
  }

});
