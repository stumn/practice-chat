require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { mongoose, Post } = require('./db');
const { userInfo } = require('os');
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
        console.log('p アンケート保存しました:' + p.id);
        io.emit('survey_msg', p);
      } catch (error) {
        handleErrors(error, 'アンケート受送信');
      }
    });

    // アンケート投票受送信
    socket.on('survey', async (msgId, option) => {
      console.log('投票msg: ' + msgId + ' 選択肢: ' + option + ' by ' + name);
      try {
        const voteData = await processVoteEvent(msgId, option, socket.id, socket);
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

  async function processFavEvent(msgId, userSocketId) {
    try {
      // 1. 投稿を特定
      const favPost = await Post.findById(msgId);

      // 2.投稿が見つからない場合の処理
      if (!favPost) {
        handleErrors(error, `fav投稿見つからない${msgId}`);
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

    // さようならテンプレ
    const byeMsg = targetName + ' (' + socket.id + ') ' + 'さん、またね！';
    templateMsg('bye', byeMsg);

    // オンラインメンバーから削除
    let onlinesWithoutTarget = onlineUsers.filter(val => val !== targetName);
    onlineUsers = onlinesWithoutTarget;
    io.emit('onlineUsers', onlineUsers);
  });
});

async function processVoteEvent(msgId, option, userSocketId, socket) {
  try {
    // アンケート投稿を特定
    const surveyPost = await Post.findById(msgId);
    const postExists = surveyPost ? true : false;
    if (postExists === false) {
      throw new Error(`投稿ID${msgId}が見つかりませんでした。`);
    }

    // 投票配列を作成
    const voteArrays = [surveyPost.voteOpt0, surveyPost.voteOpt1, surveyPost.voteOpt2];

    // ユーザーが既にvoteしているか確認
    let { userHasVoted, votedOption } = checkVote(userSocketId, voteArrays);
    switch (userHasVoted) {
      case true://投票済み
        console.log(`ID ${userSocketId} は、投票者配列${votedOption}にいます。`);
        //同じ選択肢に投票済み
        await handleVotedUser(option, votedOption, socket, voteArrays, surveyPost);
        break;
      case false://まだ投票したこと無い
        falseFunction(option, voteArrays, userSocketId);
        break;
    }

    // count 計算
    let voteSums = [];
    for (let i = 0; i < voteArrays.length; i++) {
      voteSums[i] = calculateSum(voteArrays[i]);
    }
    console.log(`vote msgId: ${msgId} voteSum: ${voteSums.join(' ')}`);

    return {
      _id: surveyPost._id,
      count0: voteSums[0],
      count1: voteSums[1],
      count2: voteSums[2]
    };

  } catch (error) {
    handleErrors(error, 'vote関数内');
  }
}

// ユーザが投稿に対して投票しているかどうか
function checkVote(userSocketId, voteArrays) {
  let votedOption;
  let userHasVoted = false;

  voteArrays.forEach((voteOpt, index) => {
    if (voteOpt.some(obj => obj.id === userSocketId)) {
      votedOption = index;
      userHasVoted = true;
    }
  });

  return { userHasVoted, votedOption };
}

async function handleVotedUser(option, votedOption, socket, voteArrays, surveyPost) {
  if (option === votedOption) {//同じ選択肢に投票済み
    console.log('同じ選択肢');
    socket.emit('alert', '同じ選択肢には投票できません');
  }
  else { //違う選択肢に投票済み
    console.log('違う選択肢');
    socket.emit('dialog_tohtml', '投票を変更しますか？');
    const answer = await new Promise(resolve => {
      socket.on('dialog_tojs', resolve);
    });
    if (answer === true) { //投票済みの選択肢を1減らし、新しい選択肢に1増やす
      voteArrays[votedOption].pull({ userSocketId: socket.id, fav: 1 });
      voteArrays[option].push({ userSocketId: socket.id, fav: 1 });
      await surveyPost.save();
    }
  }
}

async function falseFunction(option, voteArrays, userSocketId) {
  console.log(`ID ${userSocketId} は、投票者配列1,2,3のどれにもいません。`);
  if (option >= 0 && option < voteArrays.length) {
    voteArrays[option].push({ userSocketId: userSocketId, fav: 1 });
    console.log(`ID ${userSocketId} は、投票者配列${option}に追加されました。`);
    await surveyPost.save();
  } else {
    console.log('無効なオプション');
  }
}

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