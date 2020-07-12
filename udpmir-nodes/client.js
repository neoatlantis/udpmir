require("./websockets");

const UDPSocks5 = require("./socks5_udp");
const cipher = require("./cipher");

const udpsockets = {};
const udp_socks5_server = new UDPSocks5(8964);



udp_socks5_server.on("socket", on_udp_socket);
function on_udp_socket(socket){
    const id = socket.id;
    udpsockets[id.string] = socket;

    socket.on("close", function(){
        socket.removeAllListeners();
        delete udpsockets[id];
    });

    socket.on("message", (e) => udp_to_ws(socket, e)); 
}




// TODO merge with socks5_udp.js
function writeaddrport(ip, port){
    const ipval = ip.split(".").map((e) => parseInt(e));
    ipval.push((port & 0xFF00) >> 8);
    ipval.push(port & 0xFF);
    return new Uint8Array(ipval);
}






async function udp_to_ws(udp_socket, instructions){ // pack and encryption
    const { dstaddr, dstport, srcaddr, srcport, data } = instructions;
    cipher.before_outgoing(udp_socket, {
        addr: dstaddr, 
        port: dstport,
        data: data,
    });
}


/**
 * Fetch a packet from a websocket connection. Decrypt, validate, and put the
 * decrypted data to UDP socket.
 */
cipher.on("udp_receive", async function (message){ // decryption and unpack
    const { data, id, addr, port } = message;
    if(udpsockets[id.string] == undefined) return;
    
    // Didn't really found in RFC1928, but wireshark + dante shows that answers
    // are also encapsuled packets.
    udpsockets[id.string].send(Buffer.concat([
        new Uint8Array([0x00,0x00,0x00,0x01]),
        writeaddrport(addr, port), // these are remote ports got by server
        data,
    ]));
});
