require.paths.unshift(__dirname + '/lib');

var everyauth = require('everyauth');
var express   = require('express');

var FacebookClient = require('facebook-client').FacebookClient;
var facebook = new FacebookClient();

var uuid = require('node-uuid');

// configure facebook authentication
everyauth.facebook
  .appId(process.env.FACEBOOK_APP_ID)
  .appSecret(process.env.FACEBOOK_SECRET)
  .scope('publish_actions,user_likes,user_photos,user_photo_video_tags')
  .entryPath('/')
  .callbackPath('/auth/facebook')
  .findOrCreateUser(function() {
    return({});
  })

// create an express webserver
var app = express.createServer(
  express.logger(),
  express.static(__dirname + '/public'),
  express.cookieParser(),
  // set this to a secret value to encrypt session cookies
  express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
  everyauth.middleware(),
  require('facebook').Facebook()
);

// listen to the PORT given to us in the environment
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
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

// respond to GET /home
app.get('/home', function(request, response) {

  // detect the http method uses so we can replicate it on redirects
  var method = request.headers.HTTP_X_FORWARDED_PROTO || 'http';

  // set up the redirect path to the full url, including http method
  everyauth.facebook.redirectPath(method + '://' + request.host + '/home');

  // if we have facebook auth credentials
  if (request.session.auth) {

    // initialize facebook-client with the access token to gain access
    // to helper methods for the REST api
    var token = request.session.auth.facebook.accessToken;
    facebook.getSessionByAccessToken(token)(function(session) {

      // generate a uuid for socket association
      var socket_id = uuid();

      // query 3 friends and send them to the socket for this socket id
      session.graphCall('/me/friends&limit=3')(function(result) {
        result.data.forEach(function(friend) {
          socket_manager.send(socket_id, 'friend', friend);
        });
      });

      // query 2 photos and send them to the socket for this socket id
      session.graphCall('/me/photos&limit=2')(function(result) {
        result.data.forEach(function(photo) {
          socket_manager.send(socket_id, 'photo', photo);
        });
      });

      // query 11 likes and send them to the socket for this socket id
      session.graphCall('/me/likes&limit=11')(function(result) {
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

      // get information about the app itself
      session.graphCall('/' + process.env.FACEBOOK_APP_ID)(function(app) {

        // render the home page
        response.render('home.ejs', {
          layout:   false,
          token:    token,
          app:      app,
          user:     request.session.auth.facebook.user,
          home:     method + '://' + request.headers.host + '/',
          redirect: method + '://' + request.headers.host + request.url,
          socket_id: socket_id
        });

      });
    });

  } else {

    // not authenticated, redirect to / for everyauth to begin authentication
    response.redirect('/');

  }
});
