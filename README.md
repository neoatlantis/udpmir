udpmir: Relay local UDP packets to remote server
======

Our Internet is friendly to TCP based connections, and sometimes difficult for
UDP packets. This tool provides a way to teleport UDP packets, which would have
been sent directly from a local computer to a remote server, first via a
**WebSockets based multipath network** to an intermediate server and let them
start their journey there. 

The **WebSockets based network** is a flexible transporting method.
udpmir-servers open multiple connections (and possibly over multiple reverse
proxies) to accept and return packets in websocket protocol.

This conceals some traffic, as outgoing and incoming packets may not go over
the same route, and can be used together with ESNI to hide the traffic
destination completely. To demonstrate this, a local transport running in
browser is written. It will connect to both local and remote server ports and
exchange packets between them. This local transport should be used with
Firefox, which is currently the only browser supporting ESNI.
