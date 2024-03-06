require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { mongoose, Post } = require('./db');
const PORT = process.env.PORT || 3000;
const ANONYMOUS_NAME = '匿名';

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/style.css', function (req, res) {
  res.header('Content-Type', 'text/css');
  res.sendFile(__dirname + '/style.css');
});

// オンラインメンバー配列
let onlineUsers = [];
let idsOnlineUsers = [];

io.on('connection', async (socket) => {

  socket.on('login', async (name) => {
    name = name !== null && name !== '' ? name : ANONYMOUS_NAME;

    console.log(name + ' (' + socket.id + ') connected');

    onlineUsers.push(name);
    idsOnlineUsers.push({ id: socket.id, name: name });
    io.emit('onlineUsers', onlineUsers);

    // 過去ログを取得
    const pastLogs = await getPastLogs();
    socket.emit('pastLogs', pastLogs);

    // いらっしゃいメッセージ
    const welcomeMsg = name + 'さん、いらっしゃい！'
    templateMsg('welcome', welcomeMsg);

    // タイピングイベント受送信
    socket.on('typing', () => {
      io.emit('typing', name);
    });

    // チャットメッセージ受送信
    socket.on('chat message', async (nickname, msg) => {
      name = /^\s*$/.test(nickname) ? name : nickname;

      try {
        const p = await saveRecord(name, msg, '', '', 0);
        console.log('p:' + p.msg + p.id);
        io.emit('chatLogs', p);
      }
      catch (error) {
        handleErrors(error, 'チャット受送信');
      }
    });

    // アンケートメッセージ受送信
    socket.on('submitSurvey', async data => {
      console.log(data);
      const Q = data.question;
      const op = [data.options[0], data.options[1], data.options[2]];
      try {
        const p = await saveRecord(name, '', Q, op, 0);
        console.log('p セーブしました:' + p.id);
        io.emit('survey_msg', p);
      } catch (error) {
        handleErrors(error, 'アンケート受送信');
      }
    });

    // アンケート投票受送信
    socket.on('survey', async (msgId, option) => {
      console.log('投票msg: ' + msgId + ' 選択肢: ' + option + ' by ' + name);
      try {
        const voteData = await processVoteEvent(msgId, option);
        io.emit('updateVote', voteData);
      } catch (error) {
        handleErrors(error, 'アンケート投票受送信');
      }
    });

    // いいね受送信
    socket.on('fav', async msgId => {
      console.log('favmsg msgId: ' + msgId + ' ♡ by ' + socket.id);
      try {
        const favData = await processFavEvent(msgId, socket.id);
        if (favData === undefined || favData === null) {
          return;
        } else {
          console.log(favData + 'あるはず');
          io.emit('updatefav', favData);
        }
      } catch (error) {
        handleErrors(error, 'いいね受送信');
      }
    });
  });

  async function processVoteEvent(msgId, option) {
    try {
      // アンケート投稿を特定
      const surveyPost = await Post.findById(msgId);
      
      if (!surveyPost) {// 投稿が見つからない場合の処理
        console.error('0 投票先が見つからぬ:' + msgId);
        return;
      } else {
        console.log('1 投稿先あった: ' + surveyPost);
        const voteArray0 = surveyPost.voteOpt0;
        const voteArray1 = surveyPost.voteOpt1;
        const voteArray2 = surveyPost.voteOpt2;

        // 3. voteするユーザーが既にvoteしているか確認
        const idToCheck = socket.id;
        let votedOption;

        // voteArray012それぞれの配列から、指定したIDのオブジェクトを検索
        const isIdNotPresent = [voteArray0, voteArray1, voteArray2].every(voteOpt => {
          if (voteOpt.some(obj => obj.id === idToCheck)) {
            votedOption = index;
            return false;//2番
          }
          return true;//1番
        });

        // 結果
        if (isIdNotPresent) {//1番
          console.log(`ID ${idToCheck} は、投票者配列1,2,3のどれにもいません。`);
          switch (option) {
            case 0:
              voteArray0.push({ userSocketId: socket.id, fav: 1 });
              break;
            case 1:
              voteArray1.push({ userSocketId: socket.id, fav: 1 });
              break;
            case 2:
              voteArray2.push({ userSocketId: socket.id, fav: 1 });
              break;
          };
          await surveyPost.save();
        } else {//2番 まだうまく出来てない
          console.log(`ID ${idToCheck} は、投票者配列${votedOption}にいます。`);
          // 既に投票している ⇨ 同じ選択肢　OR　違う選択肢
          switch (option) {
            case votedOption:
              console.log('同じ選択肢');
              socket.emit('alert', '同じ選択肢には投票できません');
              break;
            case !votedOption:
              console.log('違う選択肢');
              const dialog = socket.emit('dialog', '投票を変更しますか？');

              switch (dialog) {
                case true:// if yes, 既に投票している選択肢のカウントを1減らし、新しい選択肢のカウントを1増やす
                  voteArray0.push({ userSocketId: socket.id, fav: 1 }); // 仮 voteArray0じゃないようにしたい
                  await surveyPost.save();
                case false:// if no, 何もしない
                  break;
              }
          }
        }
        // count 計算
        const voteSum0 = calculateSum(voteArray0);
        const voteSum1 = calculateSum(voteArray1);
        const voteSum2 = calculateSum(voteArray2);
        console.log('8 vote msgId: ' + msgId + 'voteSum: ' + voteSum0 + ' ' + voteSum1 + ' ' + voteSum2);

        return {
          _id: surveyPost._id,
          count0: voteSum0,
          count1: voteSum1,
          count2: voteSum2
        };
      }
    } catch (error) {
      handleErrors(error, 'vote関数内');
    }
  }

  async function processFavEvent(msgId, userSocketId) {
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
          favArray.push({ userSocketId: userSocketId, fav: 1 });
          await favPost.save();
        } else {
          console.log('3 誰かは良いねしてる');
          // likes 配列内を検索
          const retrieve = favArray.find(item => item.userSocketId === userSocketId);
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
        const favSum = calculateSum(favArray);
        console.log('8 favmsg msgId: ' + msgId + 'favSum: ' + favSum);

        return {
          _id: favPost._id,
          count: favSum
        };
      }
    }
    catch (error) {
      handleErrors(error, 'fav関数内');
    }
  }

  // 切断時のイベントハンドラ
  socket.on('disconnect', async () => {
    let targetId = socket.id;
    let targetName = idsOnlineUsers.find(obj => obj.id === targetId)?.name;
    // console.log(targetName + ' (' + socket.id + ') disconnected');

    // さようならテンプレ
    const byeMsg = targetName + 'さん、またね！';
    templateMsg('bye', byeMsg);

    // オンラインメンバーから削除
    let onlinesWithoutTarget = onlineUsers.filter(val => val !== targetName);
    onlineUsers = onlinesWithoutTarget;
    io.emit('onlineUsers', onlineUsers);
  });
});

async function saveRecord(name, msg, question, options, count) {
  try {
    const npData = { name, msg, question, options, count };
    const newPost = await Post.create(npData);
    return newPost;
  } catch (error) {
    handleErrors(error, 'データ保存時');
    throw error;
  }
}

async function templateMsg(socketEvent, message) {
  await io.emit(socketEvent, message);
  await saveRecord('system', message, null, null, 0);
  console.log(`${socketEvent}: ${message}`);
}

async function getPastLogs() {
  try {
    const posts = await Post.find({}).limit(10).sort({ createdAt: -1 });
    posts.reverse();
    const pastLogs = await Promise.all(posts.map(processPost));
    return pastLogs;
  } catch (error) {
    handleErrors(error, '過去ログ');
    throw error;
  }
}

async function processPost(post) {
  const pastFav = post.likes;
  const pastSum = calculateSum(pastFav);

  return {
    _id: post._id,
    name: post.name,
    msg: post.msg,
    count: pastSum
  };
}

function calculateSum(favArray) {
  return favArray.reduce((sum, item) => sum + item.fav, 0);
}

function handleErrors(error, custonMsg = '') {
  console.error(custonMsg, error);
}

server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});