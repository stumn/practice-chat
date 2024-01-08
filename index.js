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
app.get('/style.css', function (req, res) {
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
      console.log('生データ: ' + posts);

      let pastLogs = [];

      posts.forEach(post => {
        const pastFav = post.likes;
        let pastSum = 0;
        for (let i = 0; i < pastFav.length; i++) {
          pastSum += pastFav[i].fav;
        }

        pastLogData = {
          _id: post._id,
          name: post.name,
          msg: post.msg,
          count: pastSum
        }
        pastLogs.push(pastLogData);
      });

      console.log('htmlに送信する過去ログ' + pastLogs);
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

    // // いいね受信＆送信
    // socket.on('fav', async id => {
    //   console.log('fav id: ' + id);

    //   const update = { $inc: { count: 1 } };// countを1増やす
    //   const options = { new: true }; // 更新後のデータを取得する
    //   try {
    //     const postAfterLike = await Post.findByIdAndUpdate(id, update, options);
    //     io.emit('fav', postAfterLike);
    //   } catch (e) {
    //     console.error(e);
    //   }
    // });

    // いいね受信＆送信（改正版）
    socket.on('fav', async msgId => {
      console.log('favmsg msgId: ' + msgId + ' by ' + socket.id);

      try {
        // 1. 投稿を特定
        const favPost = await Post.findById(msgId);

        // 2.投稿が見つからない場合の処理
        if (!favPost) {
          console.error('0 投稿が見つからぬ:' + msgId);
          return;
        } else {
          console.log('1 あったよfavPost: ' + favPost);
          const favArray = favPost.likes;

          // 3. いいねを押すユーザーが既にいいねしているか確認
          if (favPost.likes.length === 0) {
            console.log('2 そもそも誰もいいねしてない');
            favArray.push({ userSocketId: socket.id, fav: 1 });
            await favPost.save();
          } else {
            console.log('3 誰かは良いねしてる');
            // likes 配列内を検索
            const retrieve = favArray.find(item => item.userSocketId === socket.id);
            if (retrieve === null) {
              console.log('4 何かがおかしい');
            } else {
              console.log('5 既にいいねしてる');
              if (retrieve.fav >= 10) {
                console.log('6 既に10回いいねしてる');
                socket.emit('alert', '10回以上いいねはできません');
                return;
              }
              else {
                console.log('7 いいねが1回以上10回未満なので+1');
                // カウントを1増やす
                retrieve.fav += 1;
                await favPost.save();
              }
            }
          }

          // count 計算
          let favSum = 0; // 仮置き!
          for (let i = 0; i < favArray.length; i++) {
            favSum += favArray[i].fav;
          }
          console.log('8 favmsg msgId: ' + msgId + 'favSum: ' + favSum);

          // 投稿の情報をクライアントに通知
          const favData = {
            _id: favPost._id,
            count: favSum
          }
          console.log('9' + favData);

          io.emit('updatefav', favData);
        }
      }
      catch (error) {
        console.error('favでエラーが発生しました', error);
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