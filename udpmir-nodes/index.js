#!/usr/bin/env node


const args = process.argv;
if(args.length < 3) return console.error("Usage: udpmir client|server <path to config.json>");

const role = args[2];
const config_file = args[3];

if(role != "server" && role != "client") return console.error("First argument (role) must be either `server` or `client`.");

const config_json = JSON.parse(
    require("fs").readFileSync(config_file).toString("utf-8"));

require("./config").init({
    "role": role,
    "websocket-access-key"  : Buffer.from(config_json["websocket-access-key"]),
    "websocket-sharedsecret": Buffer.from(config_json["websocket-sharedsecret"]),
    "websocket-port": config_json["websocket-port"],
});

require("./" + role);
