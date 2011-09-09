require.paths.unshift(__dirname + '/lib');

var everyauth = require('everyauth');
var express   = require('express');

var FacebookClient = require('facebook-client').FacebookClient;
var facebook = new FacebookClient();

everyauth.facebook
  .appId(process.env.FACEBOOK_APP_ID)
  .appSecret(process.env.FACEBOOK_SECRET)
  .scope('publish_actions,user_likes,user_photos,user_photo_video_tags')
  .entryPath('/')
  .callbackPath('/auth/facebook')
  .findOrCreateUser(function() {
    return({});
  })
  .redirectPath('/facebook');

var app = express.createServer(
  express.logger(),
  express.static(__dirname + '/public'),
  express.cookieParser(),
  express.session({ secret: process.env.SESSION_SECRET }),
  everyauth.middleware(),
  require('facebook').Facebook()
);

var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

var io = require('socket.io').listen(app);
var socket_manager = require('socket_manager').create(io);

io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
});

app.get('/facebook', function(request, response) {
  if (request.session.auth) {
    var token = request.session.auth.facebook.accessToken;

    facebook.getSessionByAccessToken(token)(function(session) {

      session.graphCall('/me/friends&limit=3')(function(result) {
        result.data.forEach(function(friend) {
          socket_manager.send(token, 'friend', friend);
        });
      });

      session.graphCall('/me/photos&limit=2')(function(result) {
        result.data.forEach(function(photo) {
          socket_manager.send(token, 'photo', photo);
        });
      });

      session.graphCall('/me/likes&limit=11')(function(result) {
        result.data.forEach(function(like) {
          socket_manager.send(token, 'like', like);
        });
      });

      session.restCall('fql.query', {
        query: 'SELECT uid, name, is_app_user, pic_square FROM user WHERE uid in (SELECT uid2 FROM friend WHERE uid1 = me()) AND is_app_user = 1',
        format: 'json'
      })(function(result) {
        result.forEach(function(friend) {
          socket_manager.send(token, 'friend_using_app', friend);
        });
      });

      // get information about the app itself
      session.graphCall('/' + process.env.FACEBOOK_APP_ID)(function(app) {

        // render the static page
        response.render('index.ejs', {
          layout:   false,
          token:    token,
          app:      app,
          user:     request.session.auth.facebook.user,
          home:     'http://' + request.headers.host + '/',
          redirect: 'http://' + request.headers.host + request.url
        });

      });
    });

  } else {

    // not authenticated, redirect to /
    response.redirect('/');
  }
});
