const util = require("./util");
const cipher = require("./cipher");


// TODO merge with socks5_udp.js
function writeaddrport(ip, port){
    const ipval = ip.split(".").map((e) => parseInt(e));
    ipval.push((port & 0xFF00) >> 8);
    ipval.push(port & 0xFF);
    return new Uint8Array(ipval);
}

const udpsockets = {};
const websockets = {};
var websockets_i = 0;


// Generate a key for internal encryption

//const internal_key = Buffer.alloc(32);
//crypto.randomFillSync(internal_key);


// TODO must be changed!
const shared_secret = Buffer.from("deadbeefdeadbeefdeadbeefdeadbeef");





// TODO how to identify a friendly websocket connection?

/**
 * Local Socks5 data to remote.
 *
 * 1. srcid = Encrypt(local_random_key, srcaddr + srcport), is used for a
 *    server to identify a connection blindly. Replies are referenced with this
 *    id.
 * 2. socketid is picked by local UDP socket randomly. Server may use it to
 *    open a new socket for outgoing packets.
 * 3. socketid, srcid, data, dstaddr, dstport are signed and encrypted to
 *    server.
 * 4. Encrypted packet is sent via a randomly picked websocket.
 */
async function udp_to_ws(udp_socket_id, instructions){ // pack and encryption
    const { dstaddr, dstport, srcaddr, srcport, data } = instructions;

    const ws = util.random_pick_from_obj(websockets);
    if(null == ws) return console.log("One outgoing packet dropped.");

    const packet_plain = JSON.stringify({
        socket: udp_socket_id,
        dstaddr: dstaddr, 
        dstport: dstport,
        data: data.toString("base64"),
    });

    const packet = cipher.encrypt(shared_secret, packet_plain);

    ws.send(packet);
}


/**
 * Fetch a packet from a websocket connection. Decrypt, validate, and put the
 * decrypted data to UDP socket.
 */
async function ws_to_udp(message){ // decryption and unpack
    const packet_plain = cipher.decrypt(shared_secret, message);
    if(!packet_plain) return;

    try{
        var { data, socket, srcaddr, srcport } = JSON.parse(packet_plain);
        if(udpsockets[socket] == undefined) return;
        data = Buffer.from(data, "base64");
    } catch(e){
        return;
    }
    
    // Didn't really found in RFC1928, but wireshark + dante shows that answers
    // are also encapsuled packets.
    udpsockets[socket].send(Buffer.concat([
        new Uint8Array([0x00,0x00,0x00,0x01]),
        writeaddrport(srcaddr, srcport),
        data,
    ]));
}





function on_websocket(websocket){
    websockets_i += 1;
    const id = websockets_i;
    websockets[id] = websocket;
    
    websocket.on("close", function(){
        websocket.removeAllListeners();
        delete websockets[id];
    });

    websocket.on("message", (m) => ws_to_udp(m));

    // TODO websocket keep alive
}

function on_udp_socket(socket){
    const id = socket.id;
    udpsockets[id] = socket;

    socket.on("close", function(){
        socket.removeAllListeners();
        delete udpsockets[id];
    });

    socket.on("message", (e) => udp_to_ws(id, e)); 
}


module.exports = function(wsserver, socks5server){
    wsserver.on("connection", on_websocket);
    socks5server.on("socket", on_udp_socket);
}
