var mongoose = require( 'mongoose' );
var crypto = require('crypto');
var jwt = require('jsonwebtoken');

var userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true
    },
    userName: {
        type: String,
        required: true,
        unique: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    registrDate: {
        type: Date,
        required: true
    },
    birthday: {
        type: String,
        required: false
    },
    info: {
        type: String,
        required: false
    },
    friends:[{
        type: String,
        required: true
    }],
    hash: String,
    salt: String
});

var gameSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true
    },
    team: [{
      type: String,
      required: true
    }],
    basekey: [{
      type: String,
      required: true
    }],
    mode: {
      type: String,
      required: false
    },
    creator: {
      type: String,
      required: true
    },
    uniqueKey: {
      type: String,
      unique: true,
      required: true
    },
    description: {
        type: String,
        required: false
    },
    questions: [{
        type: String,
        required: false
    }]
});

var baseSchema = new mongoose.Schema({
    ownerTeam: {
        type: String,
        required: true
    },
    power: {
        type: Number,
        required: false
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: false
    },
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    gameID: {
       type: String,
       required: true
    }
});

var teamSchema = new mongoose.Schema({
   name: {
       type: String,
       unique: true,
       required: true
   },
   teammates: [{
       type: String,
       required: false
   }],
   owner: [{
       type: String,
       required: true
   }],
   base: [{
       type: String,
       required: false
   }],
});

userSchema.methods.setPassword = function(password){
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha1').toString('hex');
};

userSchema.methods.validPassword = function(password) {
    var hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha1').toString('hex');
    return this.hash === hash;
};

userSchema.methods.generateJwt = function() {
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    return jwt.sign({
        _id: this._id,
        email: this.email,
        userName: this.userName,
        exp: parseInt(expiry.getTime() / 1000),
    }, "MY_SECRET"); // DO NOT KEEP YOUR SECRET IN THE CODE!
};

var User = mongoose.model('User', userSchema);
var BaseGame = mongoose.model('BaseGame', gameSchema);
var Base = mongoose.model('Base', baseSchema);
var Team = mongoose.model('Team', teamSchema);
