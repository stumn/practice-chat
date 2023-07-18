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
// オンラインメンバー配列
let onlines = [];
let id_onlines = [];

// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', (socket) => {
  console.log(socket.id + ' connected');

  socket.on('login', name => {
    if (name === '' || name === null) {
      name = '匿名';
    }

    onlines.push(name);
    id_onlines.push({ id: socket.id, name: name });
    io.emit('onlines', onlines);

    const welcome_msg = name + 'さん、いらっしゃい！'
    io.emit('welcome', welcome_msg);

    socket.on('typing', () => {
      console.log(name + ' is typing');
      io.emit('typing', name);
    });

    let chatLogs;

    socket.on('nickname', (nickname) => {
      chatLogs = '[' + nickname;
    });

    socket.on('chat message', (msg) => {
      chatLogs += '] ';
      chatLogs += msg;
      io.emit('chatLogs', chatLogs);
      chatLogs = '';
    });

  });

  socket.on('disconnect', () => {
    let targetId = socket.id;
    let targetName = id_onlines.find(obj => obj.id === targetId)?.name;
    let onlinesWithoutTarget = onlines.filter(val => val !== targetName);
    onlines = onlinesWithoutTarget;

    console.log(onlines);
    io.emit('onlines', onlines);

    console.log(targetName + ' (' + socket.id + ') disconnected');
    io.emit('disconnection', targetName + ' さんが ふろりだ したみたい、またね！');

  });

});

server.listen(3000, () => {
  console.log('listening on *:3000');
}); 