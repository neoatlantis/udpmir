#!/usr/bin/env node

require("./config").init({
    "role": "server",
    "websocket-access-key"  : Buffer.from("00000000", "hex"),
    "websocket-sharedsecret": Buffer.from("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "hex"),
    "websocket-port": 6489,
});


require("./websockets");

const util = require("./util");
const cipher = require("./cipher");

const udpsockets = {};



cipher.on("udp_receive", async function(message){
    let { data, id, id_buf, addr, port } = message;

    if(undefined == udpsockets[id]){
        // create a new UDP socket for proxy purpose

        const udpsocket = require("dgram").createSocket("udp4"); 
        udpsocket.last_active = new Date().getTime();

        await new Promise((resolve, reject) => udpsocket.bind(resolve));
        udpsockets[id] = udpsocket;
        udpsocket.id_buf = id_buf;
        udpsocket.id = id;

        udpsocket.on("message", (msg, rinfo) => 
            on_udpsocket_message(id, msg, rinfo));
    }

    udpsockets[id].send(data, 0, data.length, port, addr);
    console.log("UDP to remote @ " + addr + ":" + port + " : " + data.length + " bytes written.");
});




async function on_udpsocket_message(id, msg, rinfo){
    const udpsocket = udpsockets[id];
    udpsocket.last_active = new Date().getTime();

    cipher.before_outgoing({
        id_buf: udpsocket.id_buf,
        data: msg,
        addr: rinfo.address,
        port: rinfo.port,
    });

    console.log("Remote to UDP: " + msg.length + " bytes read.");
}



function remove_inactive_udp_sockets(){
    const now = new Date().getTime();
    const removing = [];
    for(let socketid in udpsockets){
        if(now - udpsockets[socketid].last_active > 30000){
            removing.push(socketid);
        }
    }
    for(let socketid of removing){
        console.log("Remove socket ", socketid);
        const socket = udpsockets[socketid];
        socket.close();
        socket.removeAllListeners();
        delete udpsockets[socketid];
    }
}
setInterval(remove_inactive_udp_sockets, 10000);
