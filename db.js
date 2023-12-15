// db.js
const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL;

// mongoose 接続~
mongoose.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('MongoDB connected');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

// オプション設定
const options = {
    timestamps: true, // データの作成時刻・更新時刻を記録する
    toObject: { // データの id を使いやすく後で使いやすいようにつけてもらうための設定
        virtuals: true,
        versionKey: false,
        transform: (_, ret) => { delete ret._id; return ret; }
    }
};

// 保存するデータの形を定義する（データの種類が複数ある場合はそれぞれ１つずつ定義する）
const postSchema = new mongoose.Schema({
    name: String,
    msg: String,
    question: String,
    options: Array,
    count: Number
}, options);

// その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);

module.exports = { mongoose, Post };
