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
// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', (socket) => {
  // コネクト
  console.log('a user connected');
  // １ログイン受付　-> ２
  socket.on('login', name => {
    if(name === '' || name === null){
      name = '匿名';
    }
    console.log(name + ' loginned.');
    const welcome_msg = name +'さん、いらっしゃい！'
    onlines.push(name);
    console.log(onlines);
    io.emit('welcome', welcome_msg, onlines);
  })
  // ３チャット内容の作成　ニックネーム
  let chatLogs;
  socket.on('nickname', (nickname) => {
    console.log(nickname);
    chatLogs = '[' + nickname;
  });
  // ３チャット内容の作成　メッセージ　＆送信
  socket.on('chat message', (msg) => {
    console.log(msg);
    chatLogs +='] ';
    chatLogs += msg;
    // chatLogs = chatLogs.replace('undefined', 'はじめましての');
    io.emit('chatLogs', chatLogs);
    chatLogs = '';
  });
  // ディスコネクト
  socket.on('disconnect', () => {
    console.log('a user disconnected');
    io.emit('disconnection','1人抜けたみたい、またね！',onlines);
  });

});

server.listen(3000, () => {
  console.log('listening on *:3000');
}); 