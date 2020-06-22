/**
 * A clock generating and updating current time slices.
 */

const events = require("events");
const time_slices = {};


class Timeslices extends events.EventEmitter {
    
    constructor(period){
        super();

        const self = this;
        const ms = period * 1000;
        
        const uint32_current_1 = new Uint32Array(1);
        const uint32_past_1 = new Uint32Array(1);

        this.past  = new Uint8Array(uint32_past_1.buffer);
        this.value = new Uint8Array(uint32_current_1.buffer); // shared
        this.current = this.value;

        function update(forced){
            const old = self.value[0];
            
            uint32_current_1[0] = Math.floor(new Date().getTime() / ms);
            uint32_past_1[0] = uint32_current_1[0] - 1;

            if(old != self.value[0] || forced === true){
                setImmediate(function(){
                    self.emit("changed", {
                        past: Buffer.from(self.past),
                        current: Buffer.from(self.current),
                    });
                });
            }
        }

        setInterval(update, 5000);
        update(true);
    }

}




time_slices[30] = new Timeslices(30);
time_slices[300] = new Timeslices(300);

module.exports = time_slices;
