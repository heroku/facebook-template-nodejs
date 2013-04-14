# faceplate

A Node.js wrapper for Facebook authentication and API

## Usage

Use as a connect middleware

```javascript
// create an express webserver
var app = require('express').createServer(
  express.bodyParser(),
  express.cookieParser(),
  require('faceplate').middleware({
    app_id: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_SECRET,
    scope:  'user_likes,user_photos,user_photo_video_tags'
  })
);

// show friends
app.get('/friends', function(req, res) {
  req.facebook.get('/me/friends', { limit: 4 }, function(friends) {
    res.send('friends: ' + require('util').inspect(friends));
  });
});

// use fql to show my friends using this app
app.get('/friends_using_app', function(req, res) {
  req.facebook.fql('SELECT uid, name, is_app_user, pic_square FROM user WHERE uid in (SELECT uid2 FROM friend WHERE uid1 = me()) AND is_app_user = 1', function(friends_using_app) {
    res.send('friends using app: ' + require('util').inspect(friends_using_app));
  });
});

// perform multiple fql queries at once
app.get('/multiquery', function(req, res) {
  req.facebook.fql({
    likes: 'SELECT user_id, object_id, post_id FROM like WHERE user_id=me()',
    albums: 'SELECT object_id, cover_object_id, name FROM album WHERE owner=me()',
  },
  function(result) {
    var inspect = require('util').inspect;
    res.send('Yor likes: ' + inspect(result.likes) + ', your albums: ' + inspect(result.albums) );
  });
});

// See the full signed request details
app.get('/signed_request', function(req, res) {
  res.send('Signed Request details: ' + require('util').inspect(req.facebook.signed_request));
});

```

## License

MIT
