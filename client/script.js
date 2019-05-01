var DEFAULT_MIDDLEWARE_ADDR = '10.0.2.1:3141';

var topo = {

	nodes : [{
		id : 0,
		name : 'Topology',
		icon : 'server'
	}, {
		id : 1,
		name : 'Available'
	}, {
		id : 2,
		name : 'No',
		icon : 'cloud'
	}],
	links : [{
		source : 0,
		target : 1
	}, {
		source : 0,
		target : 2
	}]

};

var topology = {};
var app = new nx.ui.Application();
var vueh = null;

// configuration object for next
var topologyConfig = {
	// special configuration for nodes
	nodeConfig : {
		label : 'model.name',
		iconType : function(model, node) {
			return model.get('icon');
		}
	},

	linkConfig : {
		linkType : 'curve'
	},
	dataProcessor : 'force',
	displayTooltips : false,

	adaptive : true,
	showIcon : true

};

// instantiate Topology class
topology = new nx.graphic.Topology(topologyConfig);
posTrack = {};

nx.define('ExtendedScene', nx.graphic.Topology.DefaultScene, {
	methods : {
		clickNode : function(sender, node) {
			this.inherited(sender, node);
			vueh.logs = node.label() + "\n" + vueh.flows[node.label()];
		}
	}
});

function cleanupFlows(flows) {
	if (flows)
		Object.keys(flows).forEach(function(sw) {
			var entries = flows[sw].split('\n');
			entries.shift();
			entries = entries.map(function(line) {
				line = line.trim().split(' ');
				line.shift();
				line.shift();
				return line.join(' ');
			});
			flows[sw] = entries.join('\n');
			if (flows[sw].trim() === '')
				flows[sw] = 'NO FLOWS YET';
		});
	return flows;
}

$(function() {
	//$('#mn-dump-list').bind('input propertychange', updateTopo);
	topology.data(topo);
	topology.attach(app);
	app.container(document.getElementById('topology-container'));

	topology.registerScene('extended-scene', 'ExtendedScene');
	topology.activateScene('extended-scene');
	topology.tooltipManager().showNodeTooltip(false);

	vueh = new Vue({
		el : '#app-nmtopo',
		data : {
			infoText : 'Connecting ...',
			showInfo : false,
			classInfo : '',
			wsbackend : DEFAULT_MIDDLEWARE_ADDR,
			wsconnected : false,
			live : true,
			wslatency : 0,
			logs : '',
			flows : {},
			latestTopo : {}
		},
		methods : {
			info : function(msg, cl) {
				this.infoText = msg;
				if (cl === undefined)
					cl = '';
				this.classInfo = cl;
				this.showInfo = true;
			},
			hideInfo : function() {
				this.showInfo = false;
			},
			toggleLive : function(event) {
				var self = this;
				if (event.target.checked) {
					console.log('->', self.latestTopo);
					self.updateTopo(self.latestTopo, self);
				}
			},
			updateTopo : function(topoObj) {
				var self = this;

				topo = {};

				var fullStr = '';
				var hostnameToIP = {}, switchToFlows = {};

				if (topoObj !== undefined) {
					console.log('got topo from ws', topoObj);

					fullStr = [topoObj.nodes, topoObj.links];
					hostnameToIP = topoObj.ips;
					switchToFlows = topoObj.flows;
					self.flows = cleanupFlows(topoObj.flows);
					self.logs = '';
				} else {
					fullStr = $('#mn-dump-list').val().split('mininet> links\n');
				}

				var nodeStr = fullStr[0];
				var linkStr = fullStr[1];

				if (!nodeStr || !linkStr) {
					self.info('No topology deployed', 'blue');
					return;
				}

				self.hideInfo();

				if (nodeStr.trim() === '' || linkStr.trim() === '') {
					topology.data({
						nodes : [],
						links : []
					});
					return;
				}

				nodeNumericID = {};
				nodeLastId = 0;

				nodes = nodeStr.split('\n').filter(function(line) {
					return line.trim().length;
				});

				var physicalIfacesLinks = {}, physicalIfaces = {};

				nodes = nodes.map(function(nodeLine) {
					var parts = nodeLine.split(' ');
					console.log(parts);
					var nodeType = parts[0].substr(1);
					if (nodeType === 'Controller')
						return null;

					var nodeID = parts[1].substr(0, parts[1].length - 1);
					if (parts[2] !== '') {
						var ifaces = parts[2].split(',').map(function(iface) {
							return iface.split(':')[0];
						}).filter(function(iface) {
							return iface !== 'lo';
						});
					} else {
						var ifaces = [];
					}

					ifaces.forEach(function(iface) {
						if (iface.split('-').length === 1) {
							physicalIfacesLinks[nodeID] = iface;
							physicalIfaces[iface] = nodeID;
						}
					});

					nodeNumericID[nodeID] = parseInt(nodeLastId);
					nodeLastId++;

					LUTNodeTypeToCisco = {
						'OVSSwitch' : 'switch',
						'Host' : 'server',
						'Controller' : 'hostgroup',
						'NAT' : 'router'
					};

					return {
						type : nodeType,
						icon : LUTNodeTypeToCisco[nodeType],
						id : nodeID,
						ifaces : ifaces
					};
				}).filter(function(node) {
					return node;
				});

				Object.keys(physicalIfaces).forEach(function(piface) {
					nodeNumericID[piface] = parseInt(nodeLastId);
					nodes.push({
						type : 'Physical Interface',
						icon : 'cloud',
						id : piface
					});
					nodeLastId++;
				});

				links = linkStr.split('\n').filter(function(line) {
					return line.trim().length;
				}).map(function(line) {
					return line.split(' ')[0];
				});

				links = links.map(function(line) {
					var tmp = line.split('<->');
					var left = tmp[0].split('-')[0];
					var right = tmp[1].split('-')[0];
					return {
						source : parseInt(nodeNumericID[left]),
						target : parseInt(nodeNumericID[right])
					};
				});

				Object.keys(physicalIfacesLinks).forEach(function(nodeID) {
					links.push({
						source : parseInt(nodeNumericID[nodeID]),
						target : parseInt(nodeNumericID[physicalIfacesLinks[nodeID]])
					});
				});

				nodes = nodes.map(function(node) {
					if (hostnameToIP[node.id])
						node.name = node.id + ' (' + hostnameToIP[node.id] + ')';
					else
						node.name = node.id;
					node.id = parseInt(nodeNumericID[node.id]);
					return node;
				});
				console.log(nodeNumericID);
				console.log(nodes);

				topology.autoLayout(true);

				topology.data({
					nodes : nodes,
					links : links
				});

			},
			fitToWindow : function() {
				var w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
				var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
				topology.resize(w, h);
			}
		},
		mounted : function() {
			var self = this;
			self.info('Connecting ...');
			window.addEventListener('resize', self.fitToWindow);
			self.fitToWindow();
			var socket = io.connect('http://' + self.wsbackend + '/', {
				timeout : 15000
			});

			socket.on('topo', function(topo) {
				if (self.live)
					self.updateTopo(topo, self);

				self.latestTopo = topo;
				self.wsconnected = true;
			});

			socket.on('connect_error', function() {
				console.log('Connection failed');
				self.info('Unable to reach middleware');
				self.wsconnected = false;
			});

			socket.on('connect', function() {
				self.info('Connected', 'green');
				self.hideInfo();
				self.wsconnected = true;
			});
			socket.on('disconnect', function() {
				self.info('Middleware disconnected');
				self.wsconnected = false;
			});

			socket.on('reconnecting', function(attemptNumber) {
				self.info('Reconnecting (' + attemptNumber + ')...', 'blue');
			});

			socket.on('pong', function(latency) {
				self.wslatency = latency;
			});
		}
	});

});

