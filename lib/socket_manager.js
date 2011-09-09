var SocketManager = function(io) {

  this.io = io;
  this.sockets = {};
  this.queues = {};

  var manager = this;

  io.sockets.on('connection', function(socket) {

    // when a socket sends an auth message, associate it with
    // that auth token
    socket.on('auth', function(token) {
      manager.sockets[token] = socket;
      socket.set('token', token);
    });

    // clean up
    socket.on('disconnect', function() {
      socket.get('token', function(err, token) {
        delete manager.sockets[token];
        delete manager.queues[token];
      });
    });

  });

  // send a message to a socket
  this.send = function(token, topic, message) {

    // build a queue if it doesn't exist
    if (! manager.queues[token]) {
      manager.queues[token] = [];
    }

    // add this message to the socket's queue
    manager.queues[token].push([ topic, message ]);

  };

  // attempt to send all queued messages to the available sockets
  this.flush = function() {

    for (var token in manager.queues) {

      // if a socket exists for this token
      if (manager.sockets[token]) {

        // send all outstanding messages to the socket
        manager.queues[token].forEach(function(item) {
          manager.sockets[token].emit(item[0], item[1]);
        });

        // clear the queue
        manager.queues[token] = [];
      }
    };
  };

  // attempt to flush the socket queues every 1000ms
  setInterval(this.flush, 1000);
};

module.exports.create = function(io) {
  return new SocketManager(io);
}
