require('dotenv').config();
const express = require('express');     //const 変数 = require('モジュール名')でモジュールを作る
const app = express();                  //express module でexpress applicationを作る
const http = require('http');           //http server　を使うためにモジュールを作る？
const server = http.createServer(app);  //app = express で server を作る？
const { Server } = require("socket.io");//socket.io のモジュールを作って、socket.io を使ったServer を表現？なぜ｛｝？
const io = new Server(server);          //http server を引数に、socket.ioが使えるサーバを作り、ioと定義する
const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL;
const PORT = process.env.PORT || 3000;

// ↓　mongoose 接続~準備　↓
mongoose.connect(MONGODB_URL, { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// mongoose オプション設定
const options = {
  timestamps: true, // データの作成時刻・更新時刻を記録する
  toObject: { // データの id を使いやすく後で使いやすいようにつけてもらうための設定
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => { delete ret._id; return ret; }
  }
};

// mongoose 保存するデータの形を定義する（データの種類が複数ある場合はそれぞれ１つずつ定義する）
const postSchema = new mongoose.Schema({ name: String, msg: String, count: Number }, options);

// mongoose その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);
// ↑　mongoose 接続~準備　↑

// ~/ というurlでリクエストに、/index.htmlファイルを送るレスポンスを返す
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// チャットメッセージの関数
async function createNewPost(socket, name, msg, count) {
  try {
    createNewRecode(name, msg, count);
    console.log("新しい投稿:" + newPost);
    io.emit('chatLogs', newPost);
  } catch (error) {
    console.error('エラーが発生しました', error);
  }
}

// チャットメッセージの記録
async function createNewRecode(name, msg, count) {
  const newPostData = { name, msg, count };
  const newPost = await Post.create(newPostData);
  return newPost;
}

// オンラインメンバー配列
let onlineUsers = [];
let ids_onlineUsers = [];

// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', async (socket) => {
  console.log(socket.id + ' connected');

  socket.on('login', async (name) => {
    if (name === '' || name === null) {
      name = '匿名';
    }
    onlineUsers.push(name);
    ids_onlineUsers.push({ id: socket.id, name: name });
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
    const welcome_msg = name + 'さん、いらっしゃい！'
    io.emit('welcome', welcome_msg);
    createNewRecode(name, welcome_msg, 0);

    // タイピングイベント受信＆送信
    socket.on('typing', () => {
      io.emit('typing', name);
    });

    // チャットメッセージ受信＆送信
    socket.on('chat message', (nickname, msg) => {
      if (/^\s*$/.test(nickname)) { name = name; } // nicknameが空白のみの場合はnameをそのまま使う
      else { name = nickname; } //nicknameが入力されている場合はnicknameをnameに代入
      createNewPost(socket, name, msg, 0);
    });

    // アンケートメッセージ受信＆送信
    socket.on('submitSurvey', async data => {
      console.log(data);
      const msg = data.question + data.options.join(', ');
      const p = await Post.create({ name, msg, count: 0 });
      io.emit('survey_msg', p);
    });

    // いいね受信＆送信
    socket.on('fav', async id => {
      console.log('fav id: ' + id);
      const update = { $inc: { count: 1 } };// countを1増やす
      const options = { new: true }; // 更新後のデータを取得する
      try {
        const p = await Post.findByIdAndUpdate(id, update, options);
        io.emit('fav', p);
      } catch (e) {
        console.error(e);
      }
    });
  
  });

  // 切断時のイベントハンドラを登録
  socket.on('disconnect', async () => {
    let targetId = socket.id;
    let targetName = ids_onlineUsers.find(obj => obj.id === targetId)?.name;
    console.log(targetName + ' (' + socket.id + ') disconnected');

    // さようならメッセージ
    const bye_msg = targetName + 'さん、またね！';
    io.emit('disconnection', bye_msg);
    createNewRecode(targetName, bye_msg, 0);

    // オンラインメンバーから削除
    let onlinesWithoutTarget = onlineUsers.filter(val => val !== targetName);
    onlineUsers = onlinesWithoutTarget;
    io.emit('onlineUsers', onlineUsers);
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});