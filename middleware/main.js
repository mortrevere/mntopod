const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

//getting the user's ssh public key if it exists
var idrsa = '';
const homedir = require('os').homedir();
fs.readFile(homedir + '/.ssh/id_rsa.pub', 'utf8', function(err, contents) {
  if(!err && contents)
    idrsa = contents.trim()
});

function error(info) {
    return {error: info};
}

function serialize (obj) {
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(i => serialize(i)))
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.keys(obj)
      .sort()
      .map(k => `${k}:${serialize(obj[k])}`)
      .join('|')
  }
  return obj;
}

var lastTopo = {};
var lastEmitted = '';
var lastFlowLen = 0;

function stripFlows(topo) {
  //object filtering to avoid refreshing everything each time a flow changes (especially time counters)
  var t = JSON.parse(JSON.stringify(topo));
  if(!t.flows) return t;
  var flowLen = Object.keys(t.flows).map(function(sw) { return t.flows[sw].split('\n').length }).reduce(function(p, n) { return p+n;}, 0);

  if(lastFlowLen === flowLen) //same number of flows, kick them
    delete t.flows;
  lastFlowLen = flowLen;
  return t;
}

io.on('connection', function(socket){
  //emit current topology on client connection
  console.log('client connected', socket.id);
  lastEmitted = ''

  if(Object.keys(lastTopo).length) {
    socket.emit('topo', lastTopo);
    lastEmitted = serialize(stripFlows(lastTopo));
  }
  socket.on('disconnect', function(){
    console.log('client disconnected', socket.id);
  });
});

app.enable('trust proxy');
app.use(cors());
//app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.all('*', function (req, res, next) {
  next();
});

app.get('/', function (req, res) {
  res.status(200).end('mntopod : POST /topo');
});

app.post('/topo', function(req, res) {
  res.status(200).end('ok');
  topo = JSON.parse(req.body.d);

  var uniq = serialize(stripFlows(topo));
  if(lastEmitted !== uniq && Object.keys(topo).length) {
    io.emit('topo', topo);
    lastTopo = topo;
    lastEmitted = uniq;
  }
});

app.get('/sshid', function(req, res) {
  res.status(200).end(idrsa);
});

app.use(function (req, res) {
  res.status(400).json({error: 4, info: 'Bad method.'});
});


const config = {port : 3141, host : '0.0.0.0'}
const server = http.listen(config.port, config.host, () => {
  console.log('mntopod running at \x1b[4m' + config.host + ':' + config.port + '\x1b[0m');
});
