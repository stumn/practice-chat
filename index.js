const express = require('express');     //const 変数 = require('モジュール名')でモジュールを作る
const app = express();                  //express module でexpress applicationを作る
const http = require('http');           //http server　を使うためにモジュールを作る？
const server = http.createServer(app);  //app = express で server を作る？
const { Server } = require("socket.io");//socket.io のモジュールを作って、socket.io を使ったServer を表現？なぜ｛｝？
const io = new Server(server);          //http server を引数に、socket.ioが使えるサーバを作り、ioと定義する

// ~/ というurlでリクエストが来たら、/index.htmlというファイルを送るレスポンスをする　reqはなぜ定義されている？
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', (socket) => {
  console.log('a user connected');
  io.emit('connection','A new user connected! Hello!');

  socket.on('disconnect', () => {
    console.log('user disconnected');
    io.emit('disconnection','A user disconnected! Bye!');
  });

  let chatLogs;
  socket.on('nickname', (nickname) => {
    console.log(nickname);
    chatLogs += nickname;
  });

  socket.on('chat message', (msg) => {
    console.log(msg);
    chatLogs +=': ';
    chatLogs += msg;
    chatLogs = chatLogs.replace('undefined', 'はじめましての');
    io.emit('chatLogs', chatLogs);
    chatLogs = '';
  });

});

server.listen(3000, () => {
  console.log('listening on *:3000');
}); 