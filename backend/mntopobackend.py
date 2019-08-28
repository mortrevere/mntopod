#! /usr/bin/python

import requests, json, re
from threading import Timer
from subprocess import check_output

class RepeatedTimer(object):
    def __init__(self, interval, function, *args, **kwargs):
        self._timer     = None
        self.interval   = interval
        self.function   = function
        self.args       = args
        self.kwargs     = kwargs
        self.is_running = False
        self.start()

    def _run(self):
        self.is_running = False
        self.start()
        self.function(*self.args, **self.kwargs)

    def start(self):
        if not self.is_running:
            self._timer = Timer(self.interval, self._run)
            self._timer.start()
            self.is_running = True

    def stop(self):
        self._timer.cancel()
        self.is_running = False

class MininetTopologyDaemon:
    def __init__(self, net, ip, port=3141):
        self.looper = RepeatedTimer(6, self.updateToDaemon)
        self.net = net
        self.endpoint = 'http://%s:%s/topo' % (ip, port)
        self.err_display_count = 0
        self.updateToDaemon();

    def stop(self):
        self.looper.stop();

    def updateToDaemon(self):
        topo = {'links' : '', 'nodes' : ''}
        ips = {}
        flows = {}

        for node in self.net.values():
            topo['nodes'] += re.sub('pid=[0-9]*', '', ('%s\n' % repr(node)))
        for link in self.net.links:
            topo['links'] += str(link) + '\n'

        for host in self.net.hosts:
            if host.shell and not host.waiting:
                ips[host.name] = host.cmd("/sbin/ifconfig | grep 'inet ad' | grep -v 127.0.0.1 | cut -d: -f2 | awk '{ print $1}'").strip()

        for switch in self.net.switches:
            flows[switch.name] = check_output(('ovs-ofctl -O OpenFlow13 dump-flows %s' % switch.name).split(' ')).decode('utf-8');

        topo['ips'] = ips;
        topo['flows'] = flows;

        try:
            r = requests.post(self.endpoint, data={'d' : json.dumps(topo)})
        except requests.exceptions.RequestException as e:
            self.err_display_count += 1
            if self.err_display_count < 6 print('[ERROR] Failed to reach mntopod') else print('[ERROR] Failed to reach mntopod : not displaying that error anymore.')
