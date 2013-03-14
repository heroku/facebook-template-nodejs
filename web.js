var async   = require('async');
var express = require('express');
var path    = require('path');
var http    = require('http');


// create an express webserver
var app = express();
app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  // set this to a secret value to encrypt session cookies
  app.use(express.session({ secret: process.env.SESSION_SECRET || 'secret123' }));
  app.use(require('faceplate').middleware({
    app_id: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_SECRET,
    scope:  'user_likes,user_photos,user_photo_video_tags'
  }));
  app.use(function(req, res, next) {
    res.locals.host =  req.headers['host'];
    next();
  });
  app.use(function(req, res, next) {
    res.locals.scheme = req.headers['x-forwarded-proto'] || 'http';
    next();
  });
  app.use(function(req, res, next) {
    res.locals.url = function(path) {
      return res.locals.scheme + res.locals.url_no_scheme(path);
    };
    next();
  });
  app.use(function(req, res, next) {
    res.locals.url_no_scheme = function(path) {
      return '://' + res.locals.host + (path || '');
    };
    next();
  });
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

function render_page(req, res) {
  req.facebook.app(function(err,app) {
    req.facebook.me(function(err,user) {
      res.render('index.ejs', {
        layout:    false,
        req:       req,
        app:       app,
        user:      user
      });
    });
  });
}

function handle_facebook_request(req, res) {
  // if the user is logged in
  if (req.facebook.token) {

    async.parallel([
      function(cb) {
        // query 4 friends and send them to the socket for this socket id
        req.facebook.get('/me/friends', { limit: 4 }, function(err, friends) {
          req.friends = friends;
          cb();
        });
      },
      function(cb) {
        // query 16 photos and send them to the socket for this socket id
        req.facebook.get('/me/photos', { limit: 16 }, function(err, photos) {
          req.photos = photos;
          cb();
        });
      },
      function(cb) {
        // query 4 likes and send them to the socket for this socket id
        req.facebook.get('/me/likes', { limit: 4 }, function(err, likes) {
          req.likes = likes;
          cb();
        });
      },
      function(cb) {
        // use fql to get a list of my friends that are using this app
        req.facebook.fql('SELECT uid, name, is_app_user, pic_square FROM user WHERE uid in (SELECT uid2 FROM friend WHERE uid1 = me()) AND is_app_user = 1', function(err,result) {
          req.friends_using_app = result;
          cb();
        });
      }
    ], function() {
      render_page(req, res);
    });

  } else {
    render_page(req, res);
  }
}

app.get('/', handle_facebook_request);
app.post('/', handle_facebook_request);
