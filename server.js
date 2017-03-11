var restify = require('restify');
var mongojs = require('mongojs');
var cfg = require('./config');
var fs = require('fs');
var multer = require('multer');
var md5file = require('md5-file');
var path = require('path');
var im = require('imagemagick');
var db;

var server = restify.createServer();

// Usermanagement
var mongoose = require('mongoose');
var jwt = require('restify-jwt');
require('./config/schema');
var User = mongoose.model('User');
var auth = jwt({
    secret: 'MY_SECRET',
    userProperty: 'payload'
});

/* Solving CORS development pains */
server.use(
  restify.CORS({
    origins: [
      '*'
    ],
    headers: [
      "authorization",
      "withcredentials",
      "x-requested-with",
      "x-forwarded-for",
      "x-real-ip",
      "x-customheader",
      "user-agent",
      "keep-alive",
      "host",
      "accept",
      "connection",
      "upgrade",
      "content-type",
      "dnt",
      "if-modified-since",
      "cache-control"
    ],
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS']
  })
)

function corsHandler(req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    //res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
    res.setHeader('Access-Control-Allow-Headers', 'Origin, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Response-Time, X-Requested-With, X-PINGOTHER, X-CSRF-Token, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-Api-Version, X-Request-Id, X-Response-Time');
    res.setHeader('Access-Control-Max-Age', '1000');
    return next();
  }

// Handle all OPTIONS requests to a deadend (Allows CORS to work them out)
// server.opts( /.*/, ( req, res ) => res.send( 200 ) )
server.opts('/.*/', corsHandler, function(req, res, next) {
  res.send(200);
  return next();
});

/* End of CORS fixes */
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser()),

// mongoose.Promise = global.Promise;

//Mongoose connection
mongoose.connect(cfg.dbconnectionstring);
var database = mongoose.connection;
database.on('error', console.error.bind(console, 'connection error:'));
mongoose.connection.on('connected', function() {
    console.log('Mongoose connected to ' + cfg.dbconnectionstring);
});

// use this function to retry if a connection cannot be established immediately
(function connectWithRetry () {
  db = mongojs(cfg.dbconnectionstring, ['games']);
  db.on('error', function (err) {
    console.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
    setTimeout(connectWithRetry, 5000);
  });

  db.on('connect', function () {
    console.log('database connected');
    return;
  });
})()

/* Server wide declaration was causing problems when POSTing images with multer.
  Moved it to be specific to certain routes
*/


server.listen(cfg.port, function () {
  console.log("Mongodb REST interface server started. Will only listen to requests from localhost (use nginx etc. downstream)");
});

// Get only one certain game
server.get("/games/item/:name", function (req, res, next) {
  db.games.find({ "name": req.params.name }, function (err, games) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(games));
  });
  return next();
});

//Get all the games
server.get("/games", function (req, res, next) {
  db.games.find(function (err, games) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(games));
  });

  return next();
});

// Add new game to the list
server.post("/games/item", restify.bodyParser(), function (req, res, next) {
  var item = req.params;
  console.log("games_item");
  console.log(item);
  db.games.save(item, function (err, data) {
    console.log("data");
    console.log(data);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});

// Delete certain game
server.del("/games/item/:name", function (req, res, next) {
  console.log("DELETE request for GAME [" + req.params.name + "] from HOST [" + req.headers.host + "]");
  db.games.remove({ 'name': req.params.name }, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});


/*server.del("games/item/:id", function (req, res, next) {
  db.games.remove({ 'name': req.params.name }, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});*/

// Get only game metadata from the database - getting all games was shown to be slow
server.get("/games/metadata", function (req, res, next) {
  db.games.find({}, { name: 1, description: 1, timecompl: 1, difficulty: 1 }, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});

// Get uploaded image stored in game object
server.get("/data/img/:filename", function (req, res, next) {
  var filename = req.params.filename;
  var imgdir = "data";
  var fullpath = imgdir + "/" + filename;

  fs.readFile(fullpath, function (err, file) {
    if (err) {
      console.log("Error when reading file - ", fullpath);
      res.writeHead(500);
      return res.end();
    }
    im.identify(fullpath, function (err, features) {
      if (err) throw err;
      mime_type = features['mime type'];
      res.writeHead(200, { 'Content-type': mime_type });
      res.write(file);
      res.end();
      return next();
    });
  });
});


// Preparations for image upload using multer
var upload = multer({
	dest : './data/',
  limits: {
    filesize: 3000000,
    files:1
  }
}).single("imgfile");

/*
  1. Upload image to directory specified by multer (temp filename auto-assigned by multer)
  2. Get image parameters (type, width, height, size) using Imagemagick (requires it to be pre-installed)
  3. Calculate MD5 checksum of uploaded file
  4. If file already exists delete the temp file
  5. If file does not exist, rename it in the  "<md5sum>.<filetype extension>" format

  TODO in future: Resize image if size or dimensions are too big
*/
server.post("/data/img/upload", upload, function(req, res, next) {
  var uploaded_file = res.req.file.path;

  function process_image(uploaded_file, format, width, height, filesize) {
    const ext_map = {'JPEG' : '.jpg', 'PNG' : '.png', 'GIF' : '.gif'};
    var uploaded_dir = path.dirname(uploaded_file)
    var basename = path.basename(uploaded_file)
    var md5sum = md5file.sync(uploaded_file);
    var new_file = uploaded_dir + path.sep + md5sum + ext_map[format];

    if (fs.existsSync(new_file)) {
      console.log('File "' + uploaded_file + '" is the same as "' + new_file + '". Removing the former.');
      fs.unlink(uploaded_file, function(err) {
        if (err) { console.log("Error occurred when removing file ", uploaded_file); }
      });
    } else {
      console.log("Renaming " + uploaded_file + " to " + new_file)
      fs.renameSync(uploaded_file, new_file)
    }
    res.contentType = 'json';
    res.send(200, {'img_file': path.basename(new_file)}).end();
  }

  /* Get image params from ImageMagick */
  im.identify( uploaded_file, function(err, features) {
    if (err) throw err;
    var format = features['format'];
    var width = features['width'];
    var height = features['height'];
    var size = features['filesize'];
    process_image(uploaded_file, format, width, height, size);
  });

  return next();
});

server.post("/games/player", restify.bodyParser(), function (req, res, next) {
  var item = req.params;
  console.log("player_item");
  console.log(item);
  var query = { _id: item.id };
  var playerInfo = item.playerInfo;
  db.games.update(query, {$push : {players : playerInfo}} , function (err, data) {
    if (err) throw err;
    console.log("Success ", data);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});

//****************************************************************************************
//****************************************************************************************
//                                  account gamemanagement
//****************************************************************************************
//****************************************************************************************
var BaseGame = mongoose.model('BaseGame');
var Base = mongoose.model('Base');
var Team = mongoose.model('Team')

//Get all the games
server.get('/baseGames', function (req, res, next) {
  BaseGame.find(function (err, games) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(games));
  });

  return next();
});

//Get all base games created by logged user
server.get('/baseGames/:creator', function (req, res, next) {
  console.log("/baseGames/:creator");
  console.log(req.params.creator);

  BaseGame.find({ 'creator': req.params.creator }, function (err, games) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(games));
  });

  return next();
});

// Get only one certain game created by user
server.get("/baseGames/baseItem/:baseUser/:baseName", function (req, res, next) {
    console.log(req.params.baseUser)
    console.log(req.params.baseName)
  BaseGame.find({ creator: req.params.baseUser , name : req.params.baseName}, function (err, games) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    console.log(games);
    res.end(JSON.stringify(games));
  });
  return next();
});

// Add new game to the list
server.post("/baseGames/baseItem", restify.bodyParser(), function (req, res, next) {
  var item = req.params;
  console.log("baseGames/baseItem");
  var itemBases = item.activities[0].basepoints;

  var baseIDs = [];
  for (var i=0; i<itemBases.length; i++) {
    var base = new Base();
    base.ownerTeam = "default";
    base.power = "1";
    base.name = itemBases[i].name;
    base.description = itemBases[i].description;
    base.latitude = itemBases[i].lat;
    base.longitude = itemBases[i].lng;
    base.gameID = item.gameCreator + item.name;

    base.save(base, function (err, data) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      res.end(JSON.stringify(data));
    });
    console.log(i+1 + " - " + "bases saved");
    baseIDs.push(base._id);
  }
  console.log(baseIDs);

  var baseGame = new BaseGame();
  baseGame.name = item.name;
  baseGame.team = item.team;
  baseGame.mode = item.activities[0].type;
  baseGame.basekey = baseIDs;
  baseGame.questions = item.tasks;
  baseGame.creator = item.gameCreator;
  baseGame.uniqueKey = item.gameCreator + item.name;
  baseGame.description = item.description;

  baseGame.save(baseGame, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});

// // Delete certain game
// server.del("/baseGames/baseItem/:name", function (req, res, next) {
//   console.log("DELETE request for GAME [" + req.params.name + "] from HOST [" + req.headers.host + "]");
//   BaseGame.remove({ 'name': req.params.name }, function (err, data) {
//     res.writeHead(200, {
//       'Content-Type': 'application/json; charset=utf-8'
//     });
//     res.end(JSON.stringify(data));
//   });
//   return next();
// });


/*server.del("baseGames/baseItem/:id", function (req, res, next) {
  Game.remove({ 'name': req.params.name }, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});*/

// Get only game metadata from the database - getting all games was shown to be slow
server.get("/baseGames/metadata", function (req, res, next) {
  console.log("/baseGames/metadata");
  BaseGame.find({}, { name: 1, description: 1, timecompl: 1, difficulty: 1 }, function (err, data) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(data));
  });
  return next();
});


//Get all the bases
server.get('/bases', function (req, res, next) {
  Base.find(function (err, bases) {
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    res.end(JSON.stringify(bases));
  });

  return next();
});

//Get all base games created by logged user
server.get('/bases/:uniqueKey', function (req, res, next) {
  console.log("/bases/:uniqueKey");
  console.log(req.params.uniqueKey);

  Base.find({ 'gameID': req.params.uniqueKey }, function (err, base) {
    console.log("base");
    console.log(base);
    // res.writeHead(200, {
    //   'Content-Type': 'application/json;charset=utf-8'
    // });
    // res.end(JSON.stringify(base));
    res.send(200, base);
  });
  // return next();
});

// Get uploaded image stored in game object
server.get("/baseData/img/:filename", function (req, res, next) {
  var filename = req.params.filename;
  var imgdir = "data";
  var fullpath = imgdir + "/" + filename;

  fs.readFile(fullpath, function (err, file) {
    if (err) {
      console.log("Error when reading file - ", fullpath);
      res.writeHead(500);
      return res.end();
    }
    im.identify(fullpath, function (err, features) {
      if (err) throw err;
      mime_type = features['mime type'];
      res.writeHead(200, { 'Content-type': mime_type });
      res.write(file);
      res.end();
      return next();
    });
  });
});

/*
  1. Upload image to directory specified by multer (temp filename auto-assigned by multer)
  2. Get image parameters (type, width, height, size) using Imagemagick (requires it to be pre-installed)
  3. Calculate MD5 checksum of uploaded file
  4. If file already exists delete the temp file
  5. If file does not exist, rename it in the  "<md5sum>.<filetype extension>" format

  TODO in future: Resize image if size or dimensions are too big
*/
server.post("/baseData/img/upload", upload, function(req, res, next) {
  console.log("baseData/img/upload");
  var uploaded_file = res.req.file.path;
  console.log("01");
  function process_image(uploaded_file, format, width, height, filesize) {
    console.log("02 function");
    const ext_map = {'JPEG' : '.jpg', 'PNG' : '.png', 'GIF' : '.gif'};
    var uploaded_dir = path.dirname(uploaded_file)
    var basename = path.basename(uploaded_file)
    var md5sum = md5file.sync(uploaded_file);
    var new_file = uploaded_dir + path.sep + md5sum + ext_map[format];
    console.log("03");
    if (fs.existsSync(new_file)) {
      console.log("04");
      console.log('File "' + uploaded_file + '" is the same as "' + new_file + '". Removing the former.');
      fs.unlink(uploaded_file, function(err) {
        if (err) { console.log("05"); console.log("Error occurred when removing file ", uploaded_file); }
      });
    } else {
      console.log("06");
      console.log("Renaming " + uploaded_file + " to " + new_file)
      fs.renameSync(uploaded_file, new_file)
    }
    console.log("07");
    res.contentType = 'json';
    res.send(200, {'img_file': path.basename(new_file)}).end();
  }
  console.log("08");
  /* Get image params from ImageMagick */
  im.identify( uploaded_file, function(err, features) {
    console.log("09");
    console.log("error");
    console.log(err);
    console.log(uploaded_file);
    console.log(format);
    console.log(width);
    console.log(height);
    console.log(size);
    if (err) throw err;
    var format = features['format'];
    var width = features['width'];
    var height = features['height'];
    var size = features['filesize'];
    process_image(uploaded_file, format, width, height, size);
  });
  console.log("10");
  return next();
});

//****************************************************************************************
//****************************************************************************************
//                                  Usermanagement
//****************************************************************************************
//****************************************************************************************

server.post('/register', restify.bodyParser(), function(req, res) {

    var user = new User();

    User.findOne({userName: req.body.userName})
        .then(function(users){
            if(users == null){
                User.findOne({email: req.body.email})
                    .then(function(users2){
                        if(users2 == null){
                            user.userName = req.body.userName;
                            user.email = req.body.email;
                            user.firstName = req.body.firstName;
                            user.lastName = req.body.lastName;
                            user.registrDate = Date.now();
                            user.birthday = req.body.birthday;
                            user.info = req.body.info;

                            user.setPassword(req.body.password);

                            user.save(user, function(err, data) {
                                var token;
                                token = user.generateJwt();
                                res.status(200);
                                res.json({
                                    "token" : token
                                });
                            });
                        }
                        else{
                            return res.send(401)
                        }
                    })
            }
            else{
                return res.send(401)
            }
        })

    User.findOne({email: req.body.email})
        .then(function(users3){
            if(users3 == null){
                user.userName = req.body.userName;
                user.email = req.body.email;
                user.firstName = req.body.firstName;
                user.lastName = req.body.lastName;
                user.registrDate = Date.now();
                user.birthday = req.body.birthday;
                user.info = req.body.info;

                user.setPassword(req.body.password);

                user.save(user, function(err, data) {
                    var token;
                    token = user.generateJwt();
                    res.status(200);
                    res.json({
                        "token" : token
                    });
                });
            }
            else{
                return res.send(401)
            }
        })
});

server.post('/login', restify.bodyParser(), function(req, res) {
    var token;

    User.findOne({ email: req.body.email }, function (err, user) {
        if(user == null){
            return res.send(401)
        }
        if (!user.validPassword(req.body.password)) {
            return res.send(401);
        }
        token = user.generateJwt();
        res.status(200);
        res.json({
            "token" : token
        });
    })

})

//Get all the users
server.get("/users", function (req, res, next) {
    User.find(function (err, users) {
        res.writeHead(200, {
            'Content-Type': 'application/json;charset=utf-8'
        });
        res.end(JSON.stringify(users));
    });

    return next();
});

server.get('/profile', auth, function(req, res) {
    if (!req.payload._id) {
        console.log("unauthorizedError");
        res.send(401, {
            "message" : "UnauthorizedError: private profile"
        });
    } else {
        User.findById(req.payload._id, function (err, user){
                if(err){
                    console.log("find by ID ERRor")
                    res.send(401, "couldnt load profile");
                } else {
                    res.send(200, user);
                }
            });
    }
});

server.get('/profile/:userName', function(req, res){
    User.findOne({userName: req.params.userName})
        .then(function(data){
            res.send(200, data)
        });
});

server.post('/profileUpdate', restify.bodyParser(), auth, function(req, res) {
    if (!req.payload._id) {
        res.send(401, {
            "message": "UnauthorizedError: cannot update profile without being logged in to it"
        });
    } else{
        User.findByIdAndUpdate(req.payload._id, req.body, {runValidators: true, upsert: true})
            .exec(function (err, user) {
                res.send(200, user);
            });
    }
});

server.post('/profileDelete', restify.bodyParser(), auth, function (req, res) {
    if (!req.payload._id) {
        res.send(401, {
            "message": "UnauthorizedError: cannot delete profile without being logged in to it"
        });
    } else {
        User.findById(req.payload._id)
            .exec(function (err, value) {
                if(err) {
                    res.send(401, {
                        "message": "DeleteError: could not delete feature"
                    });
                } else {
                    value.remove();
                    res.send(200, 'removed Feature');
                }

            });
    }
});
server.get('/inviteUser/:email', restify.bodyParser(), function (req, res) {
    User.findOne({email: req.params.email})
        .then(function (data) {
            if(data == null){
                res.send(401)
            }
            else{
                res.send(200, data)
            }
        })
});
server.get('/friendUser/:userName', restify.bodyParser(), function (req, res) {
    User.findOne({userName: req.params.userName})
        .then(function (data) {
            if(data == null){
                res.send(404)
            }
            else{
                res.send(200, data);
            }
        })
});
