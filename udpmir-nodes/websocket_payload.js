const msgpack5 = require("msgpack5")();


module.exports.pack = function(parts){
    const {id, addr, port, data} = parts;
    return msgpack5.encode([id, addr, port, data]);
}

module.exports.unpack = function(packet){
    try{
        const parts = msgpack5.decode(packet);
        if(parts.length != 4) throw Error("Not a valid packet.");
        return {
            id_buf: parts[0],
            id: parts[0].toString("hex"),
            addr: parts[1],
            port: parts[2],
            data: parts[3],
        };
    } catch(e){
        return null;
    }
}
