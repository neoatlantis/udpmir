#!/usr/bin/env node

const UDPSocks5 = require("./socks5_udp");
const ws = require("ws");
const client_router = require("./client_udp_router");

const ws_server = new ws.Server({ port: 18964, });
const udp_socks5_server = new UDPSocks5(8964);



client_router(ws_server, udp_socks5_server);
