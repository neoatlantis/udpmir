import
    { add_local, add_remote, on_websocket_info }
    from "./websocket_exchange.js"
;

(function(){
//////////////////////////////////////////////////////////////////////////////

function formatBytes(a,b=2){if(0===a)return"0 Bytes";const c=0>b?0:b,d=Math.floor(Math.log(a)/Math.log(1024));return parseFloat((a/Math.pow(1024,d)).toFixed(c))+" "+["Bytes","KB","MB","GB","TB","PB","EB","ZB","YB"][d]}




on_websocket_info(refresh_list);
function refresh_list(update){
    const local_update = update.local;
    const remote_update = update.remote;

    const html_template = `
        <td class="url"></td>
        <td class="status"></td>
        <td class="sent"></td>
        <td class="sentspeed"></td>
        <td class="recv"></td>
        <td class="recvspeed"></td>
    `;

    function update_list(info_group, target_div){
        const now = new Date().getTime();

        for(let id in info_group){
            let target_item = $(target_div).find('[data-id="' + id + '"]');
            if(target_item.length < 1){
                target_item = $("<tr>", { "data-id": id })
                    .html(html_template)
                    .appendTo(target_div)
                ;
                target_item.find(".url").text(id);
                target_item.data("sent_last", 0).data("recv_last", 0);
                target_item.data("recordtime_last", now - 1000);
            }

            const record_last = target_item.data("recordtime_last");
            const sent_last = target_item.data("sent_last"),
                  recv_last = target_item.data("recv_last");
            const sent_update = info_group[id].sent,
                  recv_update = info_group[id].recv;

            const sent_speed = Math.round(1000 * (sent_update - sent_last) / (now - record_last)),
                  recv_speed = Math.round(1000 * (recv_update - recv_last) / (now - record_last));

            target_item.find(".status").text(info_group[id].status);
            target_item.find(".sent").text(formatBytes(sent_update));
            target_item.find(".sentspeed").text(formatBytes(sent_speed) + "/s");
            target_item.find(".recv").text(formatBytes(recv_update));
            target_item.find(".recvspeed").text(formatBytes(recv_speed) + "/s");

            target_item
                .data("sent_last", sent_update)
                .data("recv_last", recv_update)
                .data("recordtime_last", now)
            ;
        }
    }

    update_list(local_update, "#local_list");
    update_list(remote_update, "#remote_list");
}




function add_websocket_factory(group){
    return function(){
        const url = $("#new-" + group).val();
        try{
            (group == "local" ? add_local : add_remote)(url);
        } catch(e){
            alert(e);
        }
    }
}



$("#add-local").click(add_websocket_factory("local"));
$("#add-remote").click(add_websocket_factory("remote"));



function main(){

    /*add_local("ws://localhost:18964");

    for(let i=1; i<=10; i++){
        add_remote("ws://localhost:6489/" + i);
    }*/
    
}
$(main);

//////////////////////////////////////////////////////////////////////////////
})();
