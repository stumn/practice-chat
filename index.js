const express = require('express');     //const 変数 = require('モジュール名')でモジュールを作る
const app = express();                  //express module でexpress applicationを作る
const http = require('http');           //http server　を使うためにモジュールを作る？
const server = http.createServer(app);  //app = express で server を作る？
const { Server } = require("socket.io");//socket.io のモジュールを作って、socket.io を使ったServer を表現？なぜ｛｝？
const io = new Server(server);          //http server を引数に、socket.ioが使えるサーバを作り、ioと定義する
const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL;
mongoose.connect(MONGODB_URL, { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB connected');
    // サーバーを起動するなど、データベース接続後の処理を実行
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// オプション設定
const options = {
  // timestamps: true, // データの作成時刻・更新時刻を記録する
  toJSON: { // データを JSON にする際の設定
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => { delete ret._id; return ret; }
  }
};

// 保存するデータの形を定義する（データの種類が複数ある場合はそれぞれ１つずつ定義する）
const postSchema = new mongoose.Schema({ name: String, msg: String }, options);
// その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);

async function createNewPost(name, msg) {
  try {
    const p = await Post.create({ name: name, msg: msg });
    console.log("新しい投稿が作成されました:");
  } catch (e) {
    console.error("エラーが発生しました:", e);
  }
};

// ~/ というurlでリクエストが来たら、/index.htmlというファイルを送るレスポンスをする
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
// オンラインメンバー配列
let onlines = [];
let id_onlines = [];

// io は接続の全体、socketは接続してきた1つのコマについて
io.on('connection', async (socket) => {
  console.log(socket.id + ' connected');

  socket.on('login', async (name) => {
    if (name === '' || name === null) {
      name = '匿名';
    }
    onlines.push(name);
    id_onlines.push({ id: socket.id, name: name });
    io.emit('onlines', onlines);

    try {
      const posts = await Post.find({}).limit(10).sort({ _id: -1 }); // 新しい順に10件の投稿を取得
      posts.reverse();
      const pastLogs = posts.map(post => ({ name: post.name, msg: post.msg })); // nameとmsgだけを抽出して新しい配列を作成
      console.log(pastLogs);
      socket.emit('pastLogs', pastLogs);

    } catch (e) {
      console.error(e);
    }

    const welcome_msg = name + 'さん、いらっしゃい！'
    io.emit('welcome', welcome_msg);

    createNewPost(name, welcome_msg);

    socket.on('typing', () => {
      console.log(name + ' is typing');
      io.emit('typing', name);
    });

    socket.on('chat message', async (msg) => {
      io.emit('chatLogs', msg);

      createNewPost(name, msg);
    });
  });

  socket.on('disconnect', async () => {
    let targetId = socket.id;
    let targetName = id_onlines.find(obj => obj.id === targetId)?.name;
    console.log(targetName + ' (' + socket.id + ') disconnected');

    const bye_msg = targetName + 'さん、またね！';
    io.emit('disconnection', bye_msg);

    createNewPost(targetName, bye_msg);

    let onlinesWithoutTarget = onlines.filter(val => val !== targetName);
    onlines = onlinesWithoutTarget;

    io.emit('onlines', onlines);
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
}); 