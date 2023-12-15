require('dotenv').config();
const express = require('express');     //const 変数 = require('モジュール名')でモジュールを作る
const app = express();                  //express module でexpress applicationを作る
const http = require('http');           //http server　を使うためにモジュールを作る？
const server = http.createServer(app);  //app = express で server を作る？
const { Server } = require("socket.io");//socket.io のモジュールを作って、socket.io を使ったServer を表現？なぜ｛｝？
const io = new Server(server);          //http server を引数に、socket.ioが使えるサーバを作り、ioと定義する
const { mongoose, Post } = require('./db'); //db.js を読み込む
const PORT = process.env.PORT || 3000;
const ANONYMOUS_NAME = '匿名';

// ~/ というurlでリクエストに、/index.htmlファイルを送るレスポンスを返す
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ~/style.css というurlでリクエストに、/style.cssファイルを送るレスポンスを返す(これが無いと、cssが適用されない)
app.get('/style.css', function(req, res) {
  res.header('Content-Type', 'text/css');
  res.sendFile(__dirname + '/style.css');
});


// チャットメッセージを save する
async function saveRecord(name, msg, question, options, count) {
  try {
    const newPostData = { name, msg, question, options, count };
    const newPost = await Post.create(newPostData);
    console.log('newPost:' + newPost);
    return newPost;
  } catch (error) {
    console.error('エラーが発生しました', error);
    throw error; // エラーを呼び出し元に伝える
  }
}

// オンラインメンバー配列
let onlineUsers = [];
let idsOnlineUsers = [];

// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', async (socket) => {
  console.log(socket.id + ' connected');

  socket.on('login', async (name) => {
    if (name === '' || name === null) {
      name = ANONYMOUS_NAME;
    }
    onlineUsers.push(name);
    idsOnlineUsers.push({ id: socket.id, name: name });
    io.emit('onlineUsers', onlineUsers);

    // 過去のログを取得
    try {
      const posts = await Post.find({}).limit(10).sort({ _id: -1 }); // 新しい順に10件の投稿を取得
      posts.reverse();
      const pastLogs = posts.map(post => ({
        _id: post._id,
        name: post.name,
        msg: post.msg,
        count: post.count
      }));
      console.log(pastLogs);
      socket.emit('pastLogs', pastLogs);
    } catch (error) {
      console.error('エラーが発生しました', error);
    }

    // いらっしゃいメッセージ
    const welcomeMsg = name + 'さん、いらっしゃい！'
    io.emit('welcome', welcomeMsg);
    saveRecord(name, welcomeMsg, null, null, 0);

    // タイピングイベント受信＆送信
    socket.on('typing', () => {
      io.emit('typing', name);
    });

    // チャットメッセージ受信＆送信
    socket.on('chat message', async (nickname, msg) => {
      if (/^\s*$/.test(nickname)) { name = name; } // nicknameが空白のみの場合はnameをそのまま使う
      else { name = nickname; } //nicknameが入力されている場合はnicknameをnameに代入
      try {
        const p = await saveRecord(name, msg, '', '', 0);
        console.log('p:' + p);
        io.emit('chatLogs', p);
      }
      catch (error) {
        console.error('エラーが発生しました', error);
      }
    });

    // アンケートメッセージ受信＆送信
    socket.on('submitSurvey', async data => {
      console.log(data);
      const Q = data.question;
      const op = [data.options[0], data.options[1], data.options[2]];
      try {
        const p = await saveRecord(name, '', Q, op, 0);
        console.log('p:' + p);
        io.emit('survey_msg', p);
      } catch (error) {
        console.error('エラーが発生しました', error);
      }
    });

    // いいね受信＆送信
    socket.on('fav', async id => {
      console.log('fav id: ' + id);
      const update = { $inc: { count: 1 } };// countを1増やす
      const options = { new: true }; // 更新後のデータを取得する
      try {
        const postAfterLike = await Post.findByIdAndUpdate(id, update, options);
        io.emit('fav', postAfterLike);
      } catch (e) {
        console.error(e);
      }
    });

  });

  // 切断時のイベントハンドラを登録
  socket.on('disconnect', async () => {
    let targetId = socket.id;
    let targetName = idsOnlineUsers.find(obj => obj.id === targetId)?.name;
    console.log(targetName + ' (' + socket.id + ') disconnected');

    // さようならメッセージ
    const byeMsg = targetName + 'さん、またね！';
    io.emit('disconnection', byeMsg);
    saveRecord(targetName, byeMsg, null, null, 0);

    // オンラインメンバーから削除
    let onlinesWithoutTarget = onlineUsers.filter(val => val !== targetName);
    onlineUsers = onlinesWithoutTarget;
    io.emit('onlineUsers', onlineUsers);
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});