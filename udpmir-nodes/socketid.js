const timeslices = require("./timeslices");
const crypto = require("crypto");
const ECDHCURVE = "secp384r1"; // TODO duplicated declaration in cipher.js

class SocketID {

    constructor (timeslice, public_key, private_key) {
        this.timeslice = timeslice;
        this.public_key = public_key;
        this.private_key = private_key;

        this.buffer = Buffer.concat([this.timeslice, this.public_key]);
        this.string = this.buffer.toString("hex");
    }

    static generate() {
        const private_key = crypto.createECDH(ECDHCURVE);
        const ts = timeslices[300].current.buffer;
        return new SocketID(ts, private_key.generateKeys(), private_key);
    }

    static from_buffer(buffer){
        const ts = new timeslices.Timeslice(buffer.slice(0, 4));
        const public_key = buffer.slice(4);
        return new SocketID(ts, public_key);
    }

    pair (peer_key){
        if(this.private_key){
            return this.private_key.computeSecret(peer_key);
        } else {
            return peer_key.computeSecret(this.public_key);
        }
    }

}

module.exports = SocketID;
