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
    timestamps: true,
    toObject: {
        virtuals: true,
        versionKey: false,
        // transform: (_, ret) => { delete ret._id; return ret; }
    }
};

// いいね
const favSchema = new mongoose.Schema({
    userSocketId: String,
    fav: { type: Number, default: 0 }
});

const postSchema = new mongoose.Schema({
    name: String,
    msg: String,
    question: String,
    options: Array,
    likes: [{type: favSchema, default: () => ({})}],
    voteOpt0: [String],
    voteOpt1: [String],
    voteOpt2: [String]
    // voteOptions: [[voteSchema]]　2次元配列の拡張案
}, options);

// その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);

// その形式のデータを保存・読み出しするために必要なモデルを作る
module.exports = { mongoose, Post };
