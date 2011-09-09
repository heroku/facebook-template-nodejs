var SocketManager = function(io) {

  this.io = io;
  this.sockets = {};
  this.queues = {};

  var manager = this;

  io.sockets.on('connection', function(socket) {
    socket.on('auth', function(token) {
      manager.sockets[token] = socket;
      socket.set('token', token);
    });
    socket.on('disconnect', function() {
      socket.get('token', function(err, token) {
        delete manager.sockets[token];
        delete manager.queues[token];
      });
    });
  });

  this.send = function(token, topic, message) {
    if (! manager.queues[token]) {
      manager.queues[token] = [];
    }
    manager.queues[token].push([ topic, message ]);
  };

  this.flush = function() {
    for (var token in manager.queues) {
      if (manager.sockets[token]) {
        manager.queues[token].forEach(function(item) {
          manager.sockets[token].emit(item[0], item[1]);
        });
        manager.queues[token] = [];
      }
    };
  };

  setInterval(this.flush, 1000);
};

module.exports.create = function(io) {
  return new SocketManager(io);
}
