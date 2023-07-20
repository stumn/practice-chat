io.on('connection', async (socket) => {
    console.log(socket.id + ' connected');
  
    socket.on('login', async (name) => {
      // ... 既存のコード ...
  
      try {
        let posts = await Post.find({}).sort({ _id: -1 }).limit(10); // 過去の10件の投稿を取得（_idを降順でソート）
        posts.reverse(); // 古い順に表示するために配列を逆順にする
        posts.forEach(p => socket.emit('pastLogs', p));
      } catch (e) { console.error(e); }
  
      // ... 既存のコード ...
    });
  
    // ... 既存のコード ...
  });
  