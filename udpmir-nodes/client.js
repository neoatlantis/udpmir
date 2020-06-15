#!/usr/bin/env node

/*const ws = require("ws");
const udp_socket = require("dgram").createSocket("udp4");
const udp_ws_connection = require("./udp_ws_connection");

udp_socket.on("message", (msg, rinfo) => {
    console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});


udp_socket.bind(8964);


const wss = new ws.Server({ port: 18964, });

wss.on('connection', function connection(ws) {
    udp_ws_connection(udp_socket, ws);
});*/

const UDPSocks5 = require("./socks5_udp");

x = new UDPSocks5(8964);
