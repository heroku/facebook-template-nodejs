var SocketManager = function(io) {

  this.io = io;
  this.sockets = {};
  this.queues = {};

  var manager = this;

  io.sockets.on('connection', function(socket) {

    // when a socket sends an auth message, associate it with
    // that socket id
    socket.on('auth', function(socket_id) {
      manager.sockets[socket_id] = socket;
      socket.set('socket_id', socket_id);
    });

    // clean up
    socket.on('disconnect', function() {
      socket.get('socket_id', function(err, socket_id) {
        delete manager.sockets[socket_id];
        delete manager.queues[socket_id];
      });
    });

  });

  // send a message to a socket
  this.send = function(socket_id, topic, message) {

    // build a queue if it doesn't exist
    if (! manager.queues[socket_id]) {
      manager.queues[socket_id] = [];
    }

    // add this message to the socket's queue
    manager.queues[socket_id].push([ topic, message ]);

  };

  // attempt to send all queued messages to the available sockets
  this.flush = function() {

    for (var socket_id in manager.queues) {

      // if a socket exists for this socket_id
      if (manager.sockets[socket_id]) {

        // send all outstanding messages to the socket
        manager.queues[socket_id].forEach(function(item) {
          manager.sockets[socket_id].emit(item[0], item[1]);
        });

        // clear the queue
        manager.queues[socket_id] = [];
      }
    };
  };

  // attempt to flush the socket queues every 1000ms
  setInterval(this.flush, 1000);
};

module.exports.create = function(io) {
  return new SocketManager(io);
}
